using System.Text.Json;
using Microsoft.Data.Sqlite;
using Novelist.Contracts.App;

namespace Novelist.Infrastructure.App;

internal sealed class SqliteReferenceCorpusTechniqueVectorMaintenanceScheduler
{
 private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
 private readonly string _databasePath;

 public SqliteReferenceCorpusTechniqueVectorMaintenanceScheduler(string databasePath)
 {
 _databasePath = Path.GetFullPath(databasePath);
 }

 public async ValueTask<ReferenceCorpusTechniqueVectorMaintenanceJobPayload> EnqueueAsync(
 ScheduleReferenceCorpusTechniqueVectorMaintenancePayload input,
 string providerKey,
 string modelId,
 int dimensions,
 DateTimeOffset now,
 CancellationToken cancellationToken)
 {
 await using var connection = await OpenAsync(cancellationToken);
 await EnsureSchemaAsync(connection, cancellationToken);
 var scopeKey = ScopeKey(input, providerKey, modelId, dimensions);
 var jobId = "m3-vector-maintenance:" + scopeKey;
 var queryJson = JsonSerializer.Serialize(input.QueryContext, JsonOptions);
 await using var command = connection.CreateCommand();
 command.CommandText = """
 INSERT INTO reference_technique_vector_maintenance_jobs
 (job_id,scope_key,query_context_json,node_type,mode,status,provider_key,model_id,dimensions,
 attempt_count,max_attempts,next_attempt_at,lease_owner,lease_expires_at,last_error,created_at,updated_at)
 VALUES
 ($job_id,$scope_key,$query_context_json,$node_type,$mode,'pending',$provider_key,$model_id,$dimensions,
 0,$max_attempts,$now,NULL,NULL,NULL,$now,$now)
 ON CONFLICT(scope_key) DO UPDATE SET
 query_context_json=excluded.query_context_json,
 node_type=excluded.node_type,
 mode=CASE WHEN reference_technique_vector_maintenance_jobs.status='running'
 THEN reference_technique_vector_maintenance_jobs.mode ELSE excluded.mode END,
 status=CASE WHEN reference_technique_vector_maintenance_jobs.status='running' THEN 'running' ELSE 'pending' END,
 provider_key=excluded.provider_key,
 model_id=excluded.model_id,
 dimensions=excluded.dimensions,
 attempt_count=CASE WHEN reference_technique_vector_maintenance_jobs.status='running'
 THEN reference_technique_vector_maintenance_jobs.attempt_count ELSE 0 END,
 max_attempts=excluded.max_attempts,
 next_attempt_at=CASE WHEN reference_technique_vector_maintenance_jobs.status='running'
 THEN reference_technique_vector_maintenance_jobs.next_attempt_at ELSE excluded.next_attempt_at END,
 last_error=CASE WHEN reference_technique_vector_maintenance_jobs.status='running'
 THEN reference_technique_vector_maintenance_jobs.last_error ELSE NULL END,
 updated_at=excluded.updated_at;
 """;
 command.Parameters.AddWithValue("$job_id", jobId);
 command.Parameters.AddWithValue("$scope_key", scopeKey);
 command.Parameters.AddWithValue("$query_context_json", queryJson);
 command.Parameters.AddWithValue("$node_type", (object?)input.NodeType ?? DBNull.Value);
 command.Parameters.AddWithValue("$mode", input.Mode);
 command.Parameters.AddWithValue("$provider_key", providerKey);
 command.Parameters.AddWithValue("$model_id", modelId);
 command.Parameters.AddWithValue("$dimensions", dimensions);
 command.Parameters.AddWithValue("$max_attempts", input.MaxAttempts);
 command.Parameters.AddWithValue("$now", now.ToString("O"));
 await command.ExecuteNonQueryAsync(cancellationToken);
 return await ReadJobAsync(connection, scopeKey, cancellationToken)
 ?? throw new InvalidOperationException("Technique vector maintenance job was not persisted.");
 }

 public async ValueTask<ClaimedMaintenanceJob?> ClaimAsync(
 string workerId,
 TimeSpan leaseDuration,
 DateTimeOffset now,
 CancellationToken cancellationToken)
 {
 await using var connection = await OpenAsync(cancellationToken);
 await EnsureSchemaAsync(connection, cancellationToken);
 await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);
 await using var command = connection.CreateCommand();
 command.Transaction = transaction;
 command.CommandText = """
 SELECT job_id,scope_key,query_context_json,node_type,mode,status,provider_key,model_id,dimensions,
 attempt_count,max_attempts,next_attempt_at,last_error,created_at,updated_at
 FROM reference_technique_vector_maintenance_jobs
 WHERE ((status IN ('pending','retry_wait') AND next_attempt_at <= $now)
 OR (status='running' AND lease_expires_at <= $now))
 ORDER BY CASE mode WHEN 'full' THEN 0 ELSE 1 END, next_attempt_at, created_at, job_id
 LIMIT 1;
 """;
 command.Parameters.AddWithValue("$now", now.ToString("O"));
 ClaimedMaintenanceJob? claimed = null;
 await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
 {
 if (await reader.ReadAsync(cancellationToken))
 {
 var job = ReadJob(reader);
 var queryContext = JsonSerializer.Deserialize<ReferenceCorpusQueryContextPayload>(reader.GetString(2), JsonOptions)
 ?? throw new InvalidOperationException("Maintenance query context is empty.");
 claimed = new(job, queryContext, reader.IsDBNull(3) ? null : reader.GetString(3));
 }
 }

 if (claimed is null)
 {
 await transaction.CommitAsync(cancellationToken);
 return null;
 }

 await using var update = connection.CreateCommand();
 update.Transaction = transaction;
 update.CommandText = """
 UPDATE reference_technique_vector_maintenance_jobs
 SET status='running', attempt_count=attempt_count+1, lease_owner=$worker_id,
 lease_expires_at=$lease_expires_at, updated_at=$now
 WHERE job_id=$job_id;
 """;
 update.Parameters.AddWithValue("$worker_id", workerId);
 update.Parameters.AddWithValue("$lease_expires_at", now.Add(leaseDuration).ToString("O"));
 update.Parameters.AddWithValue("$now", now.ToString("O"));
 update.Parameters.AddWithValue("$job_id", claimed.Job.JobId);
 await update.ExecuteNonQueryAsync(cancellationToken);
 await transaction.CommitAsync(cancellationToken);
 return claimed with { Job = claimed.Job with { Status = ReferenceCorpusTechniqueVectorMaintenanceStatuses.Running, AttemptCount = claimed.Job.AttemptCount + 1, UpdatedAt = now } };
 }

 public async ValueTask<ReferenceCorpusTechniqueVectorMaintenanceJobPayload> CompleteAsync(
 ClaimedMaintenanceJob claimed,
 ReferenceCorpusTechniqueVectorIndexBackfillPayload result,
 DateTimeOffset now,
 CancellationToken cancellationToken)
 {
 var succeeded = result.Status is ReferenceCorpusTechniqueVectorIndexBackfillStatuses.Ready or ReferenceCorpusTechniqueVectorIndexBackfillStatuses.Empty;
 var exhausted = claimed.Job.AttemptCount >= claimed.Job.MaxAttempts;
 var status = succeeded
 ? ReferenceCorpusTechniqueVectorMaintenanceStatuses.Completed
 : exhausted ? ReferenceCorpusTechniqueVectorMaintenanceStatuses.Failed : ReferenceCorpusTechniqueVectorMaintenanceStatuses.RetryWait;
 var nextAttemptAt = succeeded || exhausted ? (DateTimeOffset?)null : now.AddMinutes(Math.Pow(2, Math.Max(0, claimed.Job.AttemptCount - 1)));
 var lastError = succeeded ? null : string.Join(";", result.Diagnostics);
 await using var connection = await OpenAsync(cancellationToken);
 await using var command = connection.CreateCommand();
 command.CommandText = """
 UPDATE reference_technique_vector_maintenance_jobs
 SET status=$status,next_attempt_at=$next_attempt_at,lease_owner=NULL,lease_expires_at=NULL,
 last_error=$last_error,updated_at=$updated_at
 WHERE job_id=$job_id;
 """;
 command.Parameters.AddWithValue("$status", status);
 command.Parameters.AddWithValue("$next_attempt_at", nextAttemptAt?.ToString("O") ?? (object)DBNull.Value);
 command.Parameters.AddWithValue("$last_error", lastError ?? (object)DBNull.Value);
 command.Parameters.AddWithValue("$updated_at", now.ToString("O"));
 command.Parameters.AddWithValue("$job_id", claimed.Job.JobId);
 await command.ExecuteNonQueryAsync(cancellationToken);
 return (await ReadJobAsync(connection, claimed.Job.ScopeKey, cancellationToken))!;
 }

 public async ValueTask<IReadOnlyList<ReferenceCorpusTechniqueVectorMaintenanceJobPayload>> ListAsync(
 bool includeCompleted,
 CancellationToken cancellationToken)
 {
 await using var connection = await OpenAsync(cancellationToken);
 await EnsureSchemaAsync(connection, cancellationToken);
 await using var command = connection.CreateCommand();
 command.CommandText = """
 SELECT job_id,scope_key,query_context_json,node_type,mode,status,provider_key,model_id,dimensions,
 attempt_count,max_attempts,next_attempt_at,last_error,created_at,updated_at
 FROM reference_technique_vector_maintenance_jobs
 WHERE $include_completed=1 OR status <> 'completed'
 ORDER BY updated_at DESC, job_id;
 """;
 command.Parameters.AddWithValue("$include_completed", includeCompleted ? 1 : 0);
 var jobs = new List<ReferenceCorpusTechniqueVectorMaintenanceJobPayload>();
 await using var reader = await command.ExecuteReaderAsync(cancellationToken);
 while (await reader.ReadAsync(cancellationToken)) jobs.Add(ReadJob(reader));
 return jobs;
 }

 private static string ScopeKey(
 ScheduleReferenceCorpusTechniqueVectorMaintenancePayload input,
 string providerKey,
 string modelId,
 int dimensions)
 {
 var json = JsonSerializer.Serialize(new
 {
 input.QueryContext.Scope,
 input.QueryContext.ChapterContext.NovelId,
 node_type = input.NodeType ?? ReferenceCorpusNodeTypes.Sentence,
 providerKey,
 modelId,
 dimensions
 }, JsonOptions);
 return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
 }

 private static async ValueTask EnsureSchemaAsync(SqliteConnection connection, CancellationToken cancellationToken)
 {
 await using var command = connection.CreateCommand();
 command.CommandText = """
 CREATE TABLE IF NOT EXISTS reference_technique_vector_maintenance_jobs (
 job_id TEXT PRIMARY KEY,
 scope_key TEXT NOT NULL UNIQUE,
 query_context_json TEXT NOT NULL,
 node_type TEXT,
 mode TEXT NOT NULL,
 status TEXT NOT NULL,
 provider_key TEXT NOT NULL,
 model_id TEXT NOT NULL,
 dimensions INTEGER NOT NULL,
 attempt_count INTEGER NOT NULL,
 max_attempts INTEGER NOT NULL,
 next_attempt_at TEXT,
 lease_owner TEXT,
 lease_expires_at TEXT,
 last_error TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS idx_reference_technique_vector_maintenance_due
 ON reference_technique_vector_maintenance_jobs(status,next_attempt_at);
 """;
 await command.ExecuteNonQueryAsync(cancellationToken);
 }

 private async ValueTask<ReferenceCorpusTechniqueVectorMaintenanceJobPayload?> ReadJobAsync(
 SqliteConnection connection,
 string scopeKey,
 CancellationToken cancellationToken)
 {
 await using var command = connection.CreateCommand();
 command.CommandText = """
 SELECT job_id,scope_key,query_context_json,node_type,mode,status,provider_key,model_id,dimensions,
 attempt_count,max_attempts,next_attempt_at,last_error,created_at,updated_at
 FROM reference_technique_vector_maintenance_jobs WHERE scope_key=$scope_key;
 """;
 command.Parameters.AddWithValue("$scope_key", scopeKey);
 await using var reader = await command.ExecuteReaderAsync(cancellationToken);
 return await reader.ReadAsync(cancellationToken) ? ReadJob(reader) : null;
 }

 private static ReferenceCorpusTechniqueVectorMaintenanceJobPayload ReadJob(SqliteDataReader reader) => new(
 reader.GetString(0), reader.GetString(1), reader.GetString(4), reader.GetString(5), reader.GetString(6),
 reader.GetString(7), reader.GetInt32(8), reader.GetInt32(9), reader.GetInt32(10),
 reader.IsDBNull(11) ? null : DateTimeOffset.Parse(reader.GetString(11)),
 reader.IsDBNull(12) ? null : reader.GetString(12), DateTimeOffset.Parse(reader.GetString(13)), DateTimeOffset.Parse(reader.GetString(14)));

 private async ValueTask<SqliteConnection> OpenAsync(CancellationToken cancellationToken)
 {
 var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = _databasePath, Pooling = false }.ToString());
 await connection.OpenAsync(cancellationToken);
 await using var pragma = connection.CreateCommand();
 pragma.CommandText = "PRAGMA busy_timeout=10000;";
 await pragma.ExecuteNonQueryAsync(cancellationToken);
 return connection;
 }
}

internal sealed record ClaimedMaintenanceJob(
 ReferenceCorpusTechniqueVectorMaintenanceJobPayload Job,
 ReferenceCorpusQueryContextPayload QueryContext,
 string? NodeType);

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Novelist.Contracts.App;
using Novelist.Core.App;

namespace Novelist.Infrastructure.App;

internal sealed partial class SqliteReferenceMaterializationRunStore
{
    public async ValueTask<ReferenceMaterializationEmbeddingWorkItem> ReadEmbeddingWorkItemAsync(
        string runId,
        int chapterIndex,
        CancellationToken cancellationToken)
    {
        var normalizedRunId = NormalizeRunId(runId);
        if (chapterIndex <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(chapterIndex), "Chapter index must be positive.");
        }

        var databasePath = await EnsureSchemaAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(databasePath, cancellationToken);
        var snapshot = await ReadEmbeddingSnapshotAsync(connection, transaction: null, normalizedRunId, chapterIndex, cancellationToken)
            ?? throw new ArgumentException("Materialization chapter progress does not exist.", nameof(chapterIndex));
        EnsureEmbeddingStage(snapshot);
        var items = await ReadEmbeddingItemsAsync(connection, transaction: null, snapshot, cancellationToken);
        if (items.Count == 0)
        {
            throw new InvalidOperationException("Materialization chapter has no accepted candidates to embed.");
        }

        var model = new ReferenceMaterializationEmbeddingModel(
            snapshot.EmbeddingProvider,
            snapshot.EmbeddingModelId,
            snapshot.EmbeddingDimensions);
        return new ReferenceMaterializationEmbeddingWorkItem(
            model,
            new ReferenceMaterializationEmbeddingRequest(model, items));
    }

    public async ValueTask<ReferenceMaterializationEmbeddingPersistenceResult> PersistEmbeddingsAsync(
        string runId,
        int chapterIndex,
        ReferenceMaterializationEmbeddingResult result,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(result);
        var normalizedRunId = NormalizeRunId(runId);
        if (chapterIndex <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(chapterIndex), "Chapter index must be positive.");
        }

        var databasePath = await EnsureSchemaAsync(cancellationToken);
        await using var connection = await OpenConnectionAsync(databasePath, cancellationToken);
        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);
        var snapshot = await ReadEmbeddingSnapshotAsync(connection, transaction, normalizedRunId, chapterIndex, cancellationToken)
            ?? throw new ArgumentException("Materialization chapter progress does not exist.", nameof(chapterIndex));
        EnsureEmbeddingStage(snapshot);
        var items = await ReadEmbeddingItemsAsync(connection, transaction, snapshot, cancellationToken);
        ValidateEmbeddingResult(result, items, snapshot.EmbeddingDimensions);

        var embeddings = result.Embeddings.ToDictionary(embedding => embedding.CandidateId, StringComparer.Ordinal);
        foreach (var item in items)
        {
            await UpsertEmbeddingAsync(connection, transaction, snapshot, item, embeddings[item.CandidateId], cancellationToken);
        }

        await UpdateEmbeddingProgressAsync(
            connection,
            transaction,
            normalizedRunId,
            chapterIndex,
            items.Count,
            cancellationToken);
        await UpdateRunVectorCountAsync(connection, transaction, normalizedRunId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new ReferenceMaterializationEmbeddingPersistenceResult(chapterIndex, items.Count);
    }

    private static async ValueTask<EmbeddingSnapshot?> ReadEmbeddingSnapshotAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string runId,
        int chapterIndex,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT run.generation_id, run.anchor_id,
                   run.embedding_provider, run.embedding_model_id, run.embedding_dimensions,
                   boundary.content_start, boundary.content_end,
                   progress.status, progress.current_stage
            FROM reference_materialization_runs run
            JOIN reference_chapter_split_boundaries boundary ON boundary.split_profile_id = run.split_profile_id
            JOIN reference_materialization_chapter_progress progress
              ON progress.run_id = run.run_id
             AND progress.chapter_index = boundary.chapter_index
            WHERE run.run_id = $run_id
              AND boundary.chapter_index = $chapter_index;
            """;
        command.Parameters.AddWithValue("$run_id", runId);
        command.Parameters.AddWithValue("$chapter_index", chapterIndex);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new EmbeddingSnapshot(
                runId,
                reader.GetString(0),
                reader.GetInt64(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetInt32(4),
                reader.GetInt32(5),
                reader.GetInt32(6),
                reader.GetString(7),
                reader.GetString(8))
            : null;
    }

    private static async ValueTask<IReadOnlyList<ReferenceMaterializationEmbeddingItem>> ReadEmbeddingItemsAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        EmbeddingSnapshot snapshot,
        CancellationToken cancellationToken)
    {
        var candidates = new List<string>();
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = """
                SELECT candidate.candidate_id
                FROM reference_material_candidates candidate
                JOIN reference_material_candidate_nodes candidate_node ON candidate_node.candidate_id = candidate.candidate_id
                JOIN reference_text_nodes node ON node.node_id = candidate_node.node_id
                WHERE candidate.run_id = $run_id
                  AND candidate.decision = $decision
                  AND node.anchor_id = $anchor_id
                  AND node.start_offset >= $content_start
                  AND node.end_offset <= $content_end
                GROUP BY candidate.candidate_id
                ORDER BY MIN(node.start_offset), MIN(node.end_offset), candidate.candidate_id;
                """;
            command.Parameters.AddWithValue("$run_id", snapshot.RunId);
            command.Parameters.AddWithValue("$decision", ReferenceMaterializationCandidateDecisions.Accepted);
            command.Parameters.AddWithValue("$anchor_id", snapshot.AnchorId);
            command.Parameters.AddWithValue("$content_start", snapshot.ContentStart);
            command.Parameters.AddWithValue("$content_end", snapshot.ContentEnd);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                candidates.Add(reader.GetString(0));
            }
        }

        var items = new List<ReferenceMaterializationEmbeddingItem>(candidates.Count);
        foreach (var candidateId in candidates)
        {
            var text = await ReadEvidenceTextAsync(connection, transaction, candidateId, cancellationToken);
            if (string.IsNullOrWhiteSpace(text))
            {
                throw new InvalidOperationException("Accepted materialization candidate has no evidence text.");
            }

            items.Add(new ReferenceMaterializationEmbeddingItem(candidateId, text));
        }

        return items;
    }

    private static async ValueTask<string> ReadEvidenceTextAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string candidateId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT node.text, candidate_node.evidence_start, candidate_node.evidence_end
            FROM reference_material_candidate_nodes candidate_node
            JOIN reference_text_nodes node ON node.node_id = candidate_node.node_id
            WHERE candidate_node.candidate_id = $candidate_id
            ORDER BY candidate_node.ordinal;
            """;
        command.Parameters.AddWithValue("$candidate_id", candidateId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var spans = new List<string>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var text = reader.GetString(0);
            var start = reader.GetInt32(1);
            var end = reader.GetInt32(2);
            if (start < 0 || end <= start || end > text.Length)
            {
                throw new InvalidOperationException("Materialization candidate evidence offsets are invalid.");
            }

            spans.Add(text[start..end]);
        }

        return string.Join("\n", spans);
    }

    private static void ValidateEmbeddingResult(
        ReferenceMaterializationEmbeddingResult result,
        IReadOnlyList<ReferenceMaterializationEmbeddingItem> items,
        int dimensions)
    {
        if (result.Embeddings is null || result.Embeddings.Count != items.Count)
        {
            throw new InvalidOperationException("Materialization embedding result must cover every accepted candidate.");
        }

        var expected = items.ToDictionary(item => item.CandidateId, StringComparer.Ordinal);
        var actualIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var embedding in result.Embeddings)
        {
            if (embedding is null ||
                !expected.ContainsKey(embedding.CandidateId) ||
                !actualIds.Add(embedding.CandidateId) ||
                embedding.Vector is null || embedding.Vector.Count != dimensions ||
                embedding.Vector.Any(value => float.IsNaN(value) || float.IsInfinity(value)))
            {
                throw new InvalidOperationException("Materialization embedding result is invalid.");
            }
        }

        if (actualIds.Count != expected.Count)
        {
            throw new InvalidOperationException("Materialization embedding result must cover every accepted candidate.");
        }
    }

    private static async ValueTask UpsertEmbeddingAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        EmbeddingSnapshot snapshot,
        ReferenceMaterializationEmbeddingItem item,
        ReferenceMaterializationCandidateEmbedding embedding,
        CancellationToken cancellationToken)
    {
        var textHash = HashEmbeddingValue(item.Text);
        var vectorJson = JsonSerializer.Serialize(embedding.Vector);
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO reference_materialization_candidate_embeddings (
              embedding_id, generation_id, run_id, candidate_id, provider, model_id, dimensions,
              text_hash, embedding_hash, embedding_json, created_at)
            VALUES (
              $embedding_id, $generation_id, $run_id, $candidate_id, $provider, $model_id, $dimensions,
              $text_hash, $embedding_hash, $embedding_json, $created_at)
            ON CONFLICT(candidate_id, provider, model_id, dimensions) DO UPDATE SET
              generation_id = excluded.generation_id,
              run_id = excluded.run_id,
              text_hash = excluded.text_hash,
              embedding_hash = excluded.embedding_hash,
              embedding_json = excluded.embedding_json,
              created_at = excluded.created_at;
            """;
        command.Parameters.AddWithValue("$embedding_id", "materialization-embedding-" + HashEmbeddingValue(
            string.Join('|', snapshot.GenerationId, item.CandidateId, snapshot.EmbeddingProvider, snapshot.EmbeddingModelId, snapshot.EmbeddingDimensions))[..24]);
        command.Parameters.AddWithValue("$generation_id", snapshot.GenerationId);
        command.Parameters.AddWithValue("$run_id", snapshot.RunId);
        command.Parameters.AddWithValue("$candidate_id", item.CandidateId);
        command.Parameters.AddWithValue("$provider", snapshot.EmbeddingProvider);
        command.Parameters.AddWithValue("$model_id", snapshot.EmbeddingModelId);
        command.Parameters.AddWithValue("$dimensions", snapshot.EmbeddingDimensions);
        command.Parameters.AddWithValue("$text_hash", textHash);
        command.Parameters.AddWithValue("$embedding_hash", HashEmbeddingValue(vectorJson));
        command.Parameters.AddWithValue("$embedding_json", vectorJson);
        command.Parameters.AddWithValue("$created_at", FormatTimestamp(DateTimeOffset.UtcNow));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async ValueTask UpdateEmbeddingProgressAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string runId,
        int chapterIndex,
        int vectorCount,
        CancellationToken cancellationToken)
    {
        ReferenceMaterializationChapterStateMachine.EnsureCanTransition(
            ReferenceMaterializationChapterStates.Embedding,
            ReferenceMaterializationChapterStates.Indexing);
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE reference_materialization_chapter_progress
            SET status = $status,
                current_stage = $current_stage,
                vector_count = $vector_count,
                row_version = row_version + 1
            WHERE run_id = $run_id
              AND chapter_index = $chapter_index
              AND status = $expected_status;
            """;
        command.Parameters.AddWithValue("$status", ReferenceMaterializationChapterStates.Indexing);
        command.Parameters.AddWithValue("$current_stage", ReferenceMaterializationChapterStates.Indexing);
        command.Parameters.AddWithValue("$vector_count", vectorCount);
        command.Parameters.AddWithValue("$run_id", runId);
        command.Parameters.AddWithValue("$chapter_index", chapterIndex);
        command.Parameters.AddWithValue("$expected_status", ReferenceMaterializationChapterStates.Embedding);
        if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
        {
            throw new InvalidOperationException("Materialization chapter changed while persisting embeddings.");
        }
    }

    private static async ValueTask UpdateRunVectorCountAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string runId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE reference_materialization_runs
            SET vector_count = (
              SELECT COALESCE(SUM(vector_count), 0)
              FROM reference_materialization_chapter_progress
              WHERE run_id = $run_id)
            WHERE run_id = $run_id;
            """;
        command.Parameters.AddWithValue("$run_id", runId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static void EnsureEmbeddingStage(EmbeddingSnapshot snapshot)
    {
        if (snapshot.Status != ReferenceMaterializationChapterStates.Embedding ||
            snapshot.CurrentStage != ReferenceMaterializationChapterStates.Embedding)
        {
            throw new InvalidOperationException("Materialization chapter is not ready for embedding.");
        }
    }

    private static string HashEmbeddingValue(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private sealed record EmbeddingSnapshot(
        string RunId,
        string GenerationId,
        long AnchorId,
        string EmbeddingProvider,
        string EmbeddingModelId,
        int EmbeddingDimensions,
        int ContentStart,
        int ContentEnd,
        string Status,
        string CurrentStage);
}

internal sealed record ReferenceMaterializationEmbeddingWorkItem(
    ReferenceMaterializationEmbeddingModel Model,
    ReferenceMaterializationEmbeddingRequest Request);

internal sealed record ReferenceMaterializationEmbeddingPersistenceResult(
    int ChapterIndex,
    int VectorCount);

using System.Text.Json;
using Microsoft.Data.Sqlite;
using Novelist.Contracts.App;
using Novelist.Core.App;

namespace Novelist.Infrastructure.App;

internal sealed partial class SqliteReferenceMaterializationRunStore
{
    public async ValueTask<ReferenceMaterializationQualificationWorkItem> ReadQualificationWorkItemAsync(
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
        var snapshot = await ReadQualificationSnapshotAsync(connection, transaction: null, normalizedRunId, chapterIndex, cancellationToken)
            ?? throw new ArgumentException("Materialization chapter progress does not exist.", nameof(chapterIndex));
        EnsureQualificationStage(snapshot);
        var candidates = await ReadQualificationCandidatesAsync(connection, transaction: null, snapshot, cancellationToken);
        if (candidates.Count == 0)
        {
            throw new InvalidOperationException("Materialization chapter has no candidates to qualify.");
        }

        var model = new ReferenceMaterializationLlmSelection(snapshot.ModelProvider, snapshot.ModelId, string.Empty);
        return new ReferenceMaterializationQualificationWorkItem(
            model,
            new ReferenceMaterializationQualificationRequest(model, candidates));
    }

    public async ValueTask<ReferenceMaterializationQualificationPersistenceResult> PersistQualificationAsync(
        string runId,
        int chapterIndex,
        ReferenceMaterializationQualificationResult result,
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
        var snapshot = await ReadQualificationSnapshotAsync(connection, transaction, normalizedRunId, chapterIndex, cancellationToken)
            ?? throw new ArgumentException("Materialization chapter progress does not exist.", nameof(chapterIndex));
        EnsureQualificationStage(snapshot);
        var candidates = await ReadQualificationCandidatesAsync(connection, transaction, snapshot, cancellationToken);
        ValidateQualificationResult(result, candidates);

        var decisions = result.Decisions.ToDictionary(decision => decision.CandidateId, StringComparer.Ordinal);
        foreach (var candidate in candidates)
        {
            await PersistCandidateDecisionAsync(
                connection,
                transaction,
                candidate,
                decisions[candidate.CandidateId],
                cancellationToken);
        }

        var acceptedCount = result.Decisions.Count(decision => decision.Decision == ReferenceMaterializationCandidateDecisions.Accepted);
        var rejectedCount = result.Decisions.Count(decision => decision.Decision == ReferenceMaterializationCandidateDecisions.Rejected);
        var reviewCount = result.Decisions.Count(decision => decision.Decision == ReferenceMaterializationCandidateDecisions.ReviewRequired);
        await UpdateQualificationProgressAsync(
            connection,
            transaction,
            normalizedRunId,
            chapterIndex,
            result.Decisions.Count,
            acceptedCount,
            rejectedCount,
            reviewCount,
            cancellationToken);
        await UpdateRunQualificationCountsAsync(connection, transaction, normalizedRunId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new ReferenceMaterializationQualificationPersistenceResult(
            chapterIndex,
            result.Decisions.Count,
            acceptedCount,
            rejectedCount,
            reviewCount);
    }

    private static async ValueTask<QualificationSnapshot?> ReadQualificationSnapshotAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string runId,
        int chapterIndex,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT run.anchor_id, run.model_provider, run.model_id,
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
            ? new QualificationSnapshot(
                runId,
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetString(2),
                chapterIndex,
                reader.GetInt32(3),
                reader.GetInt32(4),
                reader.GetString(5),
                reader.GetString(6))
            : null;
    }

    private static async ValueTask<IReadOnlyList<ReferenceMaterializationQualificationCandidate>> ReadQualificationCandidatesAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        QualificationSnapshot snapshot,
        CancellationToken cancellationToken)
    {
        var candidates = new List<CandidateSummary>();
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = """
                SELECT candidate.candidate_id, candidate.candidate_type
                FROM reference_material_candidates candidate
                JOIN reference_material_candidate_nodes candidate_node ON candidate_node.candidate_id = candidate.candidate_id
                JOIN reference_text_nodes node ON node.node_id = candidate_node.node_id
                WHERE candidate.run_id = $run_id
                  AND candidate.decision = $decision
                  AND node.anchor_id = $anchor_id
                  AND node.start_offset >= $content_start
                  AND node.end_offset <= $content_end
                GROUP BY candidate.candidate_id, candidate.candidate_type
                ORDER BY MIN(node.start_offset), MIN(node.end_offset), candidate.candidate_id;
                """;
            command.Parameters.AddWithValue("$run_id", snapshot.RunId);
            command.Parameters.AddWithValue("$decision", ReferenceMaterializationCandidateDecisions.Pending);
            command.Parameters.AddWithValue("$anchor_id", snapshot.AnchorId);
            command.Parameters.AddWithValue("$content_start", snapshot.ContentStart);
            command.Parameters.AddWithValue("$content_end", snapshot.ContentEnd);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                candidates.Add(new CandidateSummary(reader.GetString(0), reader.GetString(1)));
            }
        }

        var qualified = new List<ReferenceMaterializationQualificationCandidate>(candidates.Count);
        foreach (var candidate in candidates)
        {
            var nodes = await ReadQualificationCandidateNodesAsync(connection, transaction, candidate.CandidateId, cancellationToken);
            if (nodes.Count == 0)
            {
                throw new InvalidOperationException("Materialization candidate has no source-node evidence.");
            }

            qualified.Add(new ReferenceMaterializationQualificationCandidate(
                candidate.CandidateId,
                candidate.CandidateType,
                string.Join("\n", nodes.Select(node => node.Text)),
                nodes));
        }

        return qualified;
    }

    private static async ValueTask<IReadOnlyList<ReferenceMaterializationQualificationSourceNode>> ReadQualificationCandidateNodesAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string candidateId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT candidate_node.node_id, node.text
            FROM reference_material_candidate_nodes candidate_node
            JOIN reference_text_nodes node ON node.node_id = candidate_node.node_id
            WHERE candidate_node.candidate_id = $candidate_id
            ORDER BY candidate_node.ordinal;
            """;
        command.Parameters.AddWithValue("$candidate_id", candidateId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var nodes = new List<ReferenceMaterializationQualificationSourceNode>();
        while (await reader.ReadAsync(cancellationToken))
        {
            nodes.Add(new ReferenceMaterializationQualificationSourceNode(reader.GetString(0), reader.GetString(1)));
        }

        return nodes;
    }

    private static void ValidateQualificationResult(
        ReferenceMaterializationQualificationResult result,
        IReadOnlyList<ReferenceMaterializationQualificationCandidate> candidates)
    {
        if (result.Decisions is null || result.Decisions.Count != candidates.Count)
        {
            throw new InvalidOperationException("Material qualification result must decide every candidate exactly once.");
        }

        var candidateLookup = candidates.ToDictionary(candidate => candidate.CandidateId, StringComparer.Ordinal);
        var decisionIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var decision in result.Decisions)
        {
            if (decision is null ||
                !candidateLookup.TryGetValue(decision.CandidateId, out var candidate) ||
                !decisionIds.Add(decision.CandidateId) ||
                decision.Decision is not (ReferenceMaterializationCandidateDecisions.Accepted or
                    ReferenceMaterializationCandidateDecisions.Rejected or
                    ReferenceMaterializationCandidateDecisions.ReviewRequired) ||
                !IsFiniteUnitInterval(decision.Confidence) ||
                !AreFiniteUnitInterval(decision.Scores) ||
                decision.Tags is null ||
                decision.ReasonCodes is null || decision.ReasonCodes.Count == 0 ||
                decision.SourceSpans is null || decision.SourceSpans.Count != candidate.SourceNodes.Count)
            {
                throw new InvalidOperationException("Material qualification result is invalid.");
            }

            var sourceNodes = candidate.SourceNodes.ToDictionary(node => node.NodeId, StringComparer.Ordinal);
            var spanNodeIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var span in decision.SourceSpans)
            {
                if (span is null ||
                    !sourceNodes.TryGetValue(span.NodeId, out var node) ||
                    !spanNodeIds.Add(span.NodeId) ||
                    span.Start < 0 || span.End <= span.Start || span.End > node.Text.Length)
                {
                    throw new InvalidOperationException("Material qualification result has invalid evidence spans.");
                }
            }
        }

        if (decisionIds.Count != candidateLookup.Count)
        {
            throw new InvalidOperationException("Material qualification result must decide every candidate exactly once.");
        }
    }

    private static async ValueTask PersistCandidateDecisionAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ReferenceMaterializationQualificationCandidate candidate,
        ReferenceMaterializationCandidateQualification decision,
        CancellationToken cancellationToken)
    {
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE reference_material_candidates
                SET decision = $decision,
                    decision_origin = 'llm_qualifier',
                    quality_score = $quality_score,
                    confidence = $confidence,
                    scores_json = $scores_json,
                    tags_json = $tags_json,
                    reason_codes_json = $reason_codes_json,
                    reviewed_at = $reviewed_at,
                    row_version = row_version + 1
                WHERE candidate_id = $candidate_id
                  AND decision = $pending;
                """;
            command.Parameters.AddWithValue("$decision", decision.Decision);
            command.Parameters.AddWithValue("$quality_score", AverageScore(decision.Scores));
            command.Parameters.AddWithValue("$confidence", decision.Confidence);
            command.Parameters.AddWithValue("$scores_json", SerializeScores(decision.Scores));
            command.Parameters.AddWithValue("$tags_json", SerializeTags(decision.Tags));
            command.Parameters.AddWithValue("$reason_codes_json", JsonSerializer.Serialize(decision.ReasonCodes));
            command.Parameters.AddWithValue("$reviewed_at", FormatTimestamp(DateTimeOffset.UtcNow));
            command.Parameters.AddWithValue("$candidate_id", candidate.CandidateId);
            command.Parameters.AddWithValue("$pending", ReferenceMaterializationCandidateDecisions.Pending);
            if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
            {
                throw new InvalidOperationException("Material candidate changed while applying model qualification.");
            }
        }

        var spans = decision.SourceSpans.ToDictionary(span => span.NodeId, StringComparer.Ordinal);
        foreach (var node in candidate.SourceNodes)
        {
            var span = spans[node.NodeId];
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE reference_material_candidate_nodes
                SET evidence_start = $evidence_start,
                    evidence_end = $evidence_end
                WHERE candidate_id = $candidate_id
                  AND node_id = $node_id;
                """;
            command.Parameters.AddWithValue("$evidence_start", span.Start);
            command.Parameters.AddWithValue("$evidence_end", span.End);
            command.Parameters.AddWithValue("$candidate_id", candidate.CandidateId);
            command.Parameters.AddWithValue("$node_id", node.NodeId);
            if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
            {
                throw new InvalidOperationException("Material candidate evidence changed while applying model qualification.");
            }
        }
    }

    private static async ValueTask UpdateQualificationProgressAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string runId,
        int chapterIndex,
        int decidedCount,
        int acceptedCount,
        int rejectedCount,
        int reviewCount,
        CancellationToken cancellationToken)
    {
        ReferenceMaterializationChapterStateMachine.EnsureCanTransition(
            ReferenceMaterializationChapterStates.LlmQualifying,
            ReferenceMaterializationChapterStates.Embedding);
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE reference_materialization_chapter_progress
            SET status = $status,
                current_stage = $current_stage,
                decided_count = $decided_count,
                accepted_count = $accepted_count,
                rejected_count = $rejected_count,
                review_count = $review_count,
                model_call_count = model_call_count + 1,
                row_version = row_version + 1
            WHERE run_id = $run_id
              AND chapter_index = $chapter_index
              AND status = $expected_status;
            """;
        command.Parameters.AddWithValue("$status", ReferenceMaterializationChapterStates.Embedding);
        command.Parameters.AddWithValue("$current_stage", ReferenceMaterializationChapterStates.Embedding);
        command.Parameters.AddWithValue("$decided_count", decidedCount);
        command.Parameters.AddWithValue("$accepted_count", acceptedCount);
        command.Parameters.AddWithValue("$rejected_count", rejectedCount);
        command.Parameters.AddWithValue("$review_count", reviewCount);
        command.Parameters.AddWithValue("$run_id", runId);
        command.Parameters.AddWithValue("$chapter_index", chapterIndex);
        command.Parameters.AddWithValue("$expected_status", ReferenceMaterializationChapterStates.LlmQualifying);
        if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
        {
            throw new InvalidOperationException("Materialization chapter changed while applying model qualification.");
        }
    }

    private static async ValueTask UpdateRunQualificationCountsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string runId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE reference_materialization_runs
            SET accepted_count = (
                    SELECT COALESCE(SUM(accepted_count), 0)
                    FROM reference_materialization_chapter_progress
                    WHERE run_id = $run_id),
                rejected_count = (
                    SELECT COALESCE(SUM(rejected_count), 0)
                    FROM reference_materialization_chapter_progress
                    WHERE run_id = $run_id),
                review_count = (
                    SELECT COALESCE(SUM(review_count), 0)
                    FROM reference_materialization_chapter_progress
                    WHERE run_id = $run_id)
            WHERE run_id = $run_id;
            """;
        command.Parameters.AddWithValue("$run_id", runId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static void EnsureQualificationStage(QualificationSnapshot snapshot)
    {
        if (snapshot.Status != ReferenceMaterializationChapterStates.LlmQualifying ||
            snapshot.CurrentStage != ReferenceMaterializationChapterStates.LlmQualifying)
        {
            throw new InvalidOperationException("Materialization chapter is not ready for model qualification.");
        }
    }

    private static bool AreFiniteUnitInterval(ReferenceMaterializationQualityScores scores)
    {
        return scores is not null &&
               IsFiniteUnitInterval(scores.SemanticCompleteness) &&
               IsFiniteUnitInterval(scores.InformationDensity) &&
               IsFiniteUnitInterval(scores.NarrativeValue) &&
               IsFiniteUnitInterval(scores.Transferability) &&
               IsFiniteUnitInterval(scores.ContextIndependence) &&
               IsFiniteUnitInterval(scores.TechniqueDistinctiveness);
    }

    private static bool IsFiniteUnitInterval(double value) =>
        !double.IsNaN(value) && !double.IsInfinity(value) && value is >= 0 and <= 1;

    private static double AverageScore(ReferenceMaterializationQualityScores scores) =>
        (scores.SemanticCompleteness + scores.InformationDensity + scores.NarrativeValue +
         scores.Transferability + scores.ContextIndependence + scores.TechniqueDistinctiveness) / 6d;

    private static string SerializeScores(ReferenceMaterializationQualityScores scores) =>
        JsonSerializer.Serialize(new
        {
            semantic_completeness = scores.SemanticCompleteness,
            information_density = scores.InformationDensity,
            narrative_value = scores.NarrativeValue,
            transferability = scores.Transferability,
            context_independence = scores.ContextIndependence,
            technique_distinctiveness = scores.TechniqueDistinctiveness
        });

    private static string SerializeTags(ReferenceMaterializationQualificationTags tags) =>
        JsonSerializer.Serialize(new
        {
            narrative_functions = tags.NarrativeFunctions,
            emotion_mechanics = tags.EmotionMechanics,
            pov = tags.Pov,
            techniques = tags.Techniques
        });

    private sealed record QualificationSnapshot(
        string RunId,
        long AnchorId,
        string ModelProvider,
        string ModelId,
        int ChapterIndex,
        int ContentStart,
        int ContentEnd,
        string Status,
        string CurrentStage);

    private sealed record CandidateSummary(string CandidateId, string CandidateType);
}

internal sealed record ReferenceMaterializationQualificationWorkItem(
    ReferenceMaterializationLlmSelection Model,
    ReferenceMaterializationQualificationRequest Request);

internal sealed record ReferenceMaterializationQualificationPersistenceResult(
    int ChapterIndex,
    int DecidedCount,
    int AcceptedCount,
    int RejectedCount,
    int ReviewCount);

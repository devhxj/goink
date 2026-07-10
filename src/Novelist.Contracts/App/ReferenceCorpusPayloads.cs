using System.Text.Json.Serialization;

namespace Novelist.Contracts.App;

public static class ReferenceCorpusNodeTypes
{
    public const string Chapter = "chapter";
    public const string Scene = "scene";
    public const string Passage = "passage";
    public const string Sentence = "sentence";
    public const string Clause = "clause";

    public static IReadOnlyList<string> All { get; } =
    [
        Chapter,
        Scene,
        Passage,
        Sentence,
        Clause
    ];
}

public static class ReferenceCorpusLicenseStates
{
    public const string Unknown = "unknown";
    public const string PublicDomain = "public_domain";
    public const string CreativeCommons = "cc";
    public const string Authorized = "authorized";
    public const string Restricted = "restricted";
    public const string Forbidden = "forbidden";

    public static IReadOnlyList<string> All { get; } =
    [
        Unknown,
        PublicDomain,
        CreativeCommons,
        Authorized,
        Restricted,
        Forbidden
    ];
}

public static class ReferenceCorpusReusePolicies
{
    public const string VerbatimOk = "verbatim_ok";
    public const string AdaptedOnly = "adapted_only";
    public const string ReferenceOnly = "reference_only";
    public const string Forbidden = "forbidden";

    public static IReadOnlyList<string> All { get; } =
    [
        VerbatimOk,
        AdaptedOnly,
        ReferenceOnly,
        Forbidden
    ];
}

public sealed record CharacterStateSnapshotPayload(
    [property: JsonPropertyName("character")] string Character,
    [property: JsonPropertyName("state")] string State,
    [property: JsonPropertyName("allowed_knowledge")] IReadOnlyList<string> AllowedKnowledge,
    [property: JsonPropertyName("forbidden_knowledge")] IReadOnlyList<string> ForbiddenKnowledge);

public sealed record CurrentChapterContextPayload(
    [property: JsonPropertyName("novel_id")] long NovelId,
    [property: JsonPropertyName("chapter_number")] int ChapterNumber,
    [property: JsonPropertyName("current_draft_text")] string? CurrentDraftText,
    [property: JsonPropertyName("insertion_offset")] int InsertionOffset,
    [property: JsonPropertyName("previous_chapter_summary")] string? PreviousChapterSummary,
    [property: JsonPropertyName("character_snapshots")] IReadOnlyList<CharacterStateSnapshotPayload> CharacterSnapshots);

public sealed record ReferenceCorpusScopePayload(
    [property: JsonPropertyName("library_ids")] IReadOnlyList<string> LibraryIds,
    [property: JsonPropertyName("reuse_policies")] IReadOnlyList<string> ReusePolicies,
    [property: JsonPropertyName("include_anchor_ids")] IReadOnlyList<long> IncludeAnchorIds,
    [property: JsonPropertyName("exclude_anchor_ids")] IReadOnlyList<long> ExcludeAnchorIds,
    [property: JsonPropertyName("session_id")]
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? SessionId = null);

public sealed record ReferenceCorpusQueryContextPayload(
    [property: JsonPropertyName("scene_type")] string SceneType,
    [property: JsonPropertyName("emotion_target")] string EmotionTarget,
    [property: JsonPropertyName("pacing_target")] string PacingTarget,
    [property: JsonPropertyName("narrative_position")] string NarrativePosition,
    [property: JsonPropertyName("commercial_mechanic")] string CommercialMechanic,
    [property: JsonPropertyName("character_states")] IReadOnlyList<string> CharacterStates,
    [property: JsonPropertyName("required_narrative_functions")] IReadOnlyList<string> RequiredNarrativeFunctions,
    [property: JsonPropertyName("chapter_context")] CurrentChapterContextPayload ChapterContext,
    [property: JsonPropertyName("scope")] ReferenceCorpusScopePayload Scope);

public sealed record SearchReferenceCorpusCandidatesPayload(
[property: JsonPropertyName("query_context")] ReferenceCorpusQueryContextPayload QueryContext,
[property: JsonPropertyName("page_request")] PageRequestPayload PageRequest,
[property: JsonPropertyName("retrieval_feedback")]
[property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ReferenceCorpusRetrievalFeedbackPayload? RetrievalFeedback = null);

public sealed record ReferenceCorpusRetrievalFeedbackPayload(
 [property: JsonPropertyName("preferred_routes")] IReadOnlyList<string> PreferredRoutes,
 [property: JsonPropertyName("avoided_routes")] IReadOnlyList<string> AvoidedRoutes,
 [property: JsonPropertyName("prefer_source_diversity")] bool? PreferSourceDiversity = null,
 [property: JsonPropertyName("weight_adjustments")]
 [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyDictionary<string, double>? WeightAdjustments = null);

public sealed record RebuildReferenceCorpusSensoryProjectionPayload(
 [property: JsonPropertyName("anchor_id")]
 [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] long? AnchorId = null);

public sealed record ReferenceCorpusProjectionRebuildPayload(
 [property: JsonPropertyName("observation_count")] int ObservationCount,
 [property: JsonPropertyName("projection_row_count")] int ProjectionRowCount,
 [property: JsonPropertyName("invalid_observation_count")] int InvalidObservationCount);

public sealed record GetReferenceCorpusNodeWindowPayload(
 [property: JsonPropertyName("anchor_id")] long AnchorId,
 [property: JsonPropertyName("node_id")] string NodeId,
 [property: JsonPropertyName("previous_chapter_count")] int PreviousChapterCount = 1,
 [property: JsonPropertyName("next_chapter_count")] int NextChapterCount = 1,
 [property: JsonPropertyName("include_scene_siblings")] bool IncludeSceneSiblings = true,
 [property: JsonPropertyName("max_nodes")] int MaxNodes = 200);

public sealed record ReferenceCorpusNodeWindowItemPayload(
 [property: JsonPropertyName("node_id")] string NodeId,
 [property: JsonPropertyName("parent_node_id")] string? ParentNodeId,
 [property: JsonPropertyName("node_type")] string NodeType,
 [property: JsonPropertyName("chapter_index")] int? ChapterIndex,
 [property: JsonPropertyName("sequence_index")] int SequenceIndex,
 [property: JsonPropertyName("start_offset")] int StartOffset,
 [property: JsonPropertyName("end_offset")] int EndOffset,
 [property: JsonPropertyName("text_hash")] string TextHash,
 [property: JsonPropertyName("text")] string Text);

public sealed record ReferenceCorpusNodeWindowPayload(
 [property: JsonPropertyName("focus_node_id")] string FocusNodeId,
 [property: JsonPropertyName("focus_chapter_index")] int? FocusChapterIndex,
 [property: JsonPropertyName("scene_node_id")] string? SceneNodeId,
 [property: JsonPropertyName("chapter_nodes")] IReadOnlyList<ReferenceCorpusNodeWindowItemPayload> ChapterNodes,
 [property: JsonPropertyName("scene_siblings")] IReadOnlyList<ReferenceCorpusNodeWindowItemPayload> SceneSiblings,
[property: JsonPropertyName("truncated")] bool Truncated);

public sealed record GetReferenceCorpusCascadeImpactPayload(
 [property: JsonPropertyName("observation_ids")] IReadOnlyList<string> ObservationIds);

public sealed record ReferenceCorpusCascadeImpactPayload(
 [property: JsonPropertyName("observation_ids")] IReadOnlyList<string> ObservationIds,
 [property: JsonPropertyName("specimen_ids")] IReadOnlyList<string> SpecimenIds,
 [property: JsonPropertyName("beat_ids")] IReadOnlyList<string> BeatIds,
 [property: JsonPropertyName("blueprint_ids")] IReadOnlyList<string> BlueprintIds);

public static class ReferenceCorpusTechniqueVectorIndexBackfillStatuses
{
    public const string Ready = "ready";
    public const string Empty = "empty";
    public const string Skipped = "skipped";
    public const string Failed = "failed";
}

public sealed record BackfillReferenceCorpusTechniqueVectorIndexPayload(
    [property: JsonPropertyName("query_context")] ReferenceCorpusQueryContextPayload QueryContext,
    [property: JsonPropertyName("node_type")]
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? NodeType = null);

public sealed record ReferenceCorpusTechniqueVectorIndexBackfillPayload(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("index_scope_key")]
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? IndexScopeKey,
    [property: JsonPropertyName("table_name")]
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? TableName,
    [property: JsonPropertyName("provider_key")]
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ProviderKey,
    [property: JsonPropertyName("model_id")]
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ModelId,
    [property: JsonPropertyName("dimensions")] int Dimensions,
    [property: JsonPropertyName("source_count")] int SourceCount,
    [property: JsonPropertyName("vector_count")] int VectorCount,
    [property: JsonPropertyName("skipped_vector_count")] int SkippedVectorCount,
    [property: JsonPropertyName("rebuilt")] bool Rebuilt,
[property: JsonPropertyName("diagnostics")] IReadOnlyList<string> Diagnostics);

public static class ReferenceCorpusTechniqueVectorMaintenanceModes
{
 public const string Full = "full";
 public const string Incremental = "incremental";
}

public static class ReferenceCorpusTechniqueVectorMaintenanceStatuses
{
 public const string Pending = "pending";
 public const string Running = "running";
 public const string RetryWait = "retry_wait";
 public const string Completed = "completed";
 public const string Failed = "failed";
}

public sealed record ScheduleReferenceCorpusTechniqueVectorMaintenancePayload(
 [property: JsonPropertyName("query_context")] ReferenceCorpusQueryContextPayload QueryContext,
 [property: JsonPropertyName("node_type")]
 [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? NodeType = null,
 [property: JsonPropertyName("mode")] string Mode = ReferenceCorpusTechniqueVectorMaintenanceModes.Incremental,
 [property: JsonPropertyName("max_attempts")] int MaxAttempts = 3);

public sealed record PumpReferenceCorpusTechniqueVectorMaintenancePayload(
 [property: JsonPropertyName("worker_id")] string WorkerId,
 [property: JsonPropertyName("lease_seconds")] int LeaseSeconds = 120);

public sealed record InspectReferenceCorpusTechniqueVectorIndexesPayload(
 [property: JsonPropertyName("include_completed_jobs")] bool IncludeCompletedJobs = false);

public sealed record ReferenceCorpusTechniqueVectorMaintenanceJobPayload(
 [property: JsonPropertyName("job_id")] string JobId,
 [property: JsonPropertyName("scope_key")] string ScopeKey,
 [property: JsonPropertyName("mode")] string Mode,
 [property: JsonPropertyName("status")] string Status,
 [property: JsonPropertyName("provider_key")] string ProviderKey,
 [property: JsonPropertyName("model_id")] string ModelId,
 [property: JsonPropertyName("dimensions")] int Dimensions,
 [property: JsonPropertyName("attempt_count")] int AttemptCount,
 [property: JsonPropertyName("max_attempts")] int MaxAttempts,
 [property: JsonPropertyName("next_attempt_at")]
 [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] DateTimeOffset? NextAttemptAt,
 [property: JsonPropertyName("last_error")]
 [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? LastError,
 [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
 [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

public sealed record ReferenceCorpusTechniqueVectorMaintenancePumpResultPayload(
 [property: JsonPropertyName("processed")] bool Processed,
 [property: JsonPropertyName("job")]
 [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ReferenceCorpusTechniqueVectorMaintenanceJobPayload? Job,
 [property: JsonPropertyName("backfill")]
 [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ReferenceCorpusTechniqueVectorIndexBackfillPayload? Backfill);

public sealed record ReferenceCorpusTechniqueVectorIndexInspectionItemPayload(
 [property: JsonPropertyName("index_scope_key")] string IndexScopeKey,
 [property: JsonPropertyName("table_name")] string TableName,
 [property: JsonPropertyName("provider_key")] string ProviderKey,
 [property: JsonPropertyName("model_id")] string ModelId,
 [property: JsonPropertyName("dimensions")] int Dimensions,
 [property: JsonPropertyName("source_count")] int SourceCount,
 [property: JsonPropertyName("row_count")] int RowCount,
 [property: JsonPropertyName("health")] string Health,
 [property: JsonPropertyName("diagnostics")] IReadOnlyList<string> Diagnostics,
 [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

public sealed record ReferenceCorpusTechniqueVectorIndexInspectionPayload(
 [property: JsonPropertyName("active_provider_key")]
 [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ActiveProviderKey,
 [property: JsonPropertyName("active_model_id")]
 [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ActiveModelId,
 [property: JsonPropertyName("active_dimensions")] int ActiveDimensions,
 [property: JsonPropertyName("indexes")] IReadOnlyList<ReferenceCorpusTechniqueVectorIndexInspectionItemPayload> Indexes,
 [property: JsonPropertyName("jobs")] IReadOnlyList<ReferenceCorpusTechniqueVectorMaintenanceJobPayload> Jobs,
 [property: JsonPropertyName("healthy_count")] int HealthyCount,
 [property: JsonPropertyName("stale_count")] int StaleCount,
 [property: JsonPropertyName("failed_job_count")] int FailedJobCount);

public sealed record ReferenceCorpusCandidateEvidencePayload(
    [property: JsonPropertyName("observation_id")] string ObservationId,
    [property: JsonPropertyName("feature_family")] string FeatureFamily,
    [property: JsonPropertyName("feature_key")] string FeatureKey,
[property: JsonPropertyName("confidence")] double Confidence);

public sealed record ReferenceCorpusRetrievalDiagnosticsPayload(
 [property: JsonPropertyName("candidate_pool_size")] int CandidatePoolSize,
 [property: JsonPropertyName("text_semantic_hits")] int TextSemanticHits,
 [property: JsonPropertyName("technique_semantic_hits")] int TechniqueSemanticHits,
 [property: JsonPropertyName("structured_observation_hits")] int StructuredObservationHits,
 [property: JsonPropertyName("chapter_context_hits")] int ChapterContextHits,
 [property: JsonPropertyName("node_embedding_count")] int NodeEmbeddingCount,
 [property: JsonPropertyName("technique_vector_node_count")] int TechniqueVectorNodeCount,
 [property: JsonPropertyName("elapsed_milliseconds")] long ElapsedMilliseconds,
 [property: JsonPropertyName("applied_weights")]
 [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyDictionary<string, double>? AppliedWeights = null);

public sealed record ReferenceCorpusRouteProvenancePayload(
 [property: JsonPropertyName("route")] string Route,
 [property: JsonPropertyName("rank")] int Rank,
 [property: JsonPropertyName("route_score")] double RouteScore);

public sealed record ReferenceCorpusSourceCoveragePayload(
 [property: JsonPropertyName("library_id")] string LibraryId,
 [property: JsonPropertyName("anchor_id")] long AnchorId,
 [property: JsonPropertyName("source_quality")] string SourceQuality,
 [property: JsonPropertyName("license_state")] string LicenseState,
 [property: JsonPropertyName("reuse_policy")] string ReusePolicy,
 [property: JsonPropertyName("selected_representative")] bool SelectedRepresentative);

public sealed record ReferenceCorpusCandidatePayload(
    [property: JsonPropertyName("candidate_id")] string CandidateId,
    [property: JsonPropertyName("node_id")] string NodeId,
    [property: JsonPropertyName("anchor_id")] long AnchorId,
    [property: JsonPropertyName("library_id")] string LibraryId,
    [property: JsonPropertyName("node_type")] string NodeType,
    [property: JsonPropertyName("text_preview")] string TextPreview,
    [property: JsonPropertyName("text_hash")] string TextHash,
    [property: JsonPropertyName("license_state")] string LicenseState,
    [property: JsonPropertyName("reuse_policy")] string ReusePolicy,
    [property: JsonPropertyName("score")] double Score,
    [property: JsonPropertyName("score_components")] IReadOnlyDictionary<string, double> ScoreComponents,
    [property: JsonPropertyName("fit_explanation")] string FitExplanation,
[property: JsonPropertyName("evidence")] IReadOnlyList<ReferenceCorpusCandidateEvidencePayload> Evidence,
[property: JsonPropertyName("retrieval_diagnostics")]
 [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ReferenceCorpusRetrievalDiagnosticsPayload? RetrievalDiagnostics = null,
 [property: JsonPropertyName("route_provenance")] IReadOnlyList<ReferenceCorpusRouteProvenancePayload>? RouteProvenance = null,
 [property: JsonPropertyName("source_coverage")] IReadOnlyList<ReferenceCorpusSourceCoveragePayload>? SourceCoverage = null);

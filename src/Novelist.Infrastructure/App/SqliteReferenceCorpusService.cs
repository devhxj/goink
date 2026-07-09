using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Novelist.Contracts.App;
using Novelist.Core.App;

namespace Novelist.Infrastructure.App;

public sealed class SqliteReferenceCorpusService : IReferenceCorpusService
{
    private const int CandidateFetchMultiplier = 4;
    private const int MaxTextPreviewLength = 80;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static readonly PageRequestPolicy CandidateSearchPagePolicy = new(
        AllowedSortFields: ["score", "created_at", "candidate_id"],
        DefaultSortBy: "score",
        StableTieBreakers: ["created_at", "candidate_id"]);

    private readonly AppInitializationOptions _options;
    private readonly IEmbeddingConfigurationService _embeddingConfiguration;
    private readonly IEmbeddingClient _embeddings;
    private readonly SemaphoreSlim _mutex = new(1, 1);

    public SqliteReferenceCorpusService(
        AppInitializationOptions? options = null,
        IEmbeddingConfigurationService? embeddingConfiguration = null,
        IEmbeddingClient? embeddings = null)
    {
        _options = options ?? new AppInitializationOptions();
        _embeddingConfiguration = embeddingConfiguration ?? new NullEmbeddingConfigurationService();
        _embeddings = embeddings ?? new HybridEmbeddingClient();
    }

    public async ValueTask<PageResultPayload<ReferenceCorpusCandidatePayload>> SearchCandidatesAsync(
        SearchReferenceCorpusCandidatesPayload input,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(input);
        cancellationToken.ThrowIfCancellationRequested();

        var page = PageRequestNormalizer.Normalize(input.PageRequest, CandidateSearchPagePolicy);
        ValidateQueryContext(input.QueryContext);

        var embeddingOptions = await _embeddingConfiguration.GetActiveEmbeddingOptionsAsync(cancellationToken);
        if (embeddingOptions is null)
        {
            return Empty(page.PageSize);
        }

        await _mutex.WaitAsync(cancellationToken);
        try
        {
            var databasePath = await DatabasePathAsync(cancellationToken);
            await EnsureSchemaAsync(databasePath, cancellationToken);
            await using var connection = await OpenConnectionAsync(databasePath, cancellationToken);
            var candidates = await ReadScopedCandidateNodesAsync(connection, input, page, cancellationToken);
            if (candidates.Count == 0)
            {
                return Empty(page.PageSize);
            }

            var nodeEmbeddings = await EnsureNodeEmbeddingsAsync(
                connection,
                candidates,
                embeddingOptions,
                cancellationToken);
            var chapterEmbedding = await GetOrCreateCurrentChapterEmbeddingAsync(
                connection,
                input.QueryContext.ChapterContext,
                embeddingOptions,
                cancellationToken);
            var queryEmbedding = await EmbedSingleAsync(
                BuildQueryEmbeddingText(input.QueryContext),
                embeddingOptions with { InputKind = BuiltinOnnxEmbeddingModel.QueryInputKind },
                cancellationToken);

            var scored = candidates
                .Select(candidate =>
                {
                    nodeEmbeddings.TryGetValue(candidate.NodeId, out var nodeEmbedding);
                    var semantic = CosineSimilarity(queryEmbedding, nodeEmbedding);
                    var chapterFit = CosineSimilarity(chapterEmbedding, nodeEmbedding);
                    var observationFit = ObservationFitScore(candidate.Observations, input.QueryContext);
                    var positionFit = PositionFitScore(candidate, input.QueryContext.ChapterContext);
                    var quality = SourceQualityScore(candidate.SourceQuality);
                    var score = Math.Round(
                        semantic * 0.45 +
                        chapterFit * 0.25 +
                        observationFit * 0.18 +
                        positionFit * 0.07 +
                        quality * 0.05,
                        6);
                    return new ScoredCorpusCandidate(
                        candidate,
                        score,
                        new Dictionary<string, double>
                        {
                            ["semantic"] = Math.Round(semantic, 6),
                            ["chapter_fit"] = Math.Round(chapterFit, 6),
                            ["observation_fit"] = Math.Round(observationFit, 6),
                            ["position_fit"] = Math.Round(positionFit, 6),
                            ["source_quality"] = Math.Round(quality, 6)
                        });
                })
                .OrderByDescending(item => item.Score)
                .ThenBy(item => item.Candidate.AnchorId)
                .ThenBy(item => item.Candidate.SequenceIndex)
                .ThenBy(item => item.Candidate.NodeId, StringComparer.Ordinal)
                .ToArray();
            var pageItems = scored
                .Take(page.PageSize)
                .Select(ToPayload)
                .ToArray();

            return new PageResultPayload<ReferenceCorpusCandidatePayload>(
                pageItems,
                scored.LongLength,
                Page: 1,
                Size: page.PageSize,
                TotalPages: scored.Length == 0 ? 0 : (int)Math.Ceiling(scored.Length / (double)page.PageSize),
                NextCursor: null,
                HasMore: scored.Length > page.PageSize,
                TotalEstimate: scored.Length);
        }
        finally
        {
            _mutex.Release();
        }
    }

    private static PageResultPayload<ReferenceCorpusCandidatePayload> Empty(int pageSize)
    {
        return new PageResultPayload<ReferenceCorpusCandidatePayload>(
            Items: [],
            Total: 0,
            Page: 1,
            Size: pageSize,
            TotalPages: 0,
            NextCursor: null,
            HasMore: false,
            TotalEstimate: 0);
    }

    private static void ValidateQueryContext(ReferenceCorpusQueryContextPayload context)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(context.ChapterContext);
        ArgumentNullException.ThrowIfNull(context.Scope);
        if (context.ChapterContext.NovelId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(context), context.ChapterContext.NovelId, "Novel id must be positive.");
        }

        if (context.ChapterContext.ChapterNumber <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(context), context.ChapterContext.ChapterNumber, "Chapter number must be positive.");
        }
    }

    private async ValueTask<string> DatabasePathAsync(CancellationToken cancellationToken)
    {
        return Path.Combine(
            await AppDataDirectoryResolver.ResolveAsync(_options, cancellationToken),
            "reference-anchor",
            "index.sqlite");
    }

    private static async ValueTask EnsureSchemaAsync(string databasePath, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);
        await using var connection = await OpenConnectionAsync(databasePath, cancellationToken);
        await ReferenceCorpusSchemaProvisioner.EnsureCoreTablesAsync(connection, cancellationToken);
    }

    private static async ValueTask<SqliteConnection> OpenConnectionAsync(
        string databasePath,
        CancellationToken cancellationToken)
    {
        var builder = new SqliteConnectionStringBuilder { DataSource = databasePath, Pooling = false };
        var connection = new SqliteConnection(builder.ToString());
        await connection.OpenAsync(cancellationToken);
        await using var pragma = connection.CreateCommand();
        pragma.CommandText = "PRAGMA foreign_keys = ON;";
        await pragma.ExecuteNonQueryAsync(cancellationToken);
        return connection;
    }

    private static async ValueTask<IReadOnlyList<CorpusCandidateNode>> ReadScopedCandidateNodesAsync(
        SqliteConnection connection,
        SearchReferenceCorpusCandidatesPayload input,
        NormalizedPageRequest page,
        CancellationToken cancellationToken)
    {
        var requestedNodeType = page.Filters.TryGetValue("node_type", out var nodeType) && !string.IsNullOrWhiteSpace(nodeType)
            ? nodeType.Trim()
            : ReferenceCorpusNodeTypes.Sentence;
        if (!ReferenceCorpusNodeTypes.All.Contains(requestedNodeType, StringComparer.Ordinal))
        {
            throw new ArgumentException($"Unsupported reference corpus node_type filter '{requestedNodeType}'.", nameof(input));
        }

        var libraryIds = NormalizeTextSet(input.QueryContext.Scope.LibraryIds);
        if (libraryIds.Count == 0)
        {
            return [];
        }

        var reusePolicies = NormalizeTextSet(input.QueryContext.Scope.ReusePolicies);
        if (reusePolicies.Count == 0)
        {
            reusePolicies = [ReferenceCorpusReusePolicies.VerbatimOk, ReferenceCorpusReusePolicies.AdaptedOnly];
        }

        var includeAnchorIds = NormalizePositiveLongSet(input.QueryContext.Scope.IncludeAnchorIds);
        var excludeAnchorIds = NormalizePositiveLongSet(input.QueryContext.Scope.ExcludeAnchorIds);
        var limit = Math.Max(page.PageSize * CandidateFetchMultiplier, page.PageSize);
        var commandText = """
            SELECT n.node_id,
                   n.anchor_id,
                   n.node_type,
                   n.sequence_index,
                   n.chapter_index,
                   n.text_hash,
                   n.text,
                   n.created_at,
                   lm.library_id,
                   COALESCE(lm.source_quality, '') AS source_quality,
                   lic.license_state,
                   lic.reuse_policy,
                   o.observation_id,
                   o.feature_family,
                   o.feature_key,
                   o.value_text,
                   o.confidence
            FROM reference_text_nodes n
            JOIN reference_anchors a ON a.anchor_id = n.anchor_id
            JOIN reference_library_members lm ON lm.anchor_id = n.anchor_id
            JOIN reference_corpus_libraries lib ON lib.library_id = lm.library_id
            JOIN reference_source_license lic ON lic.anchor_id = n.anchor_id
            LEFT JOIN reference_feature_observations o
              ON o.node_id = n.node_id
             AND o.validity_state = 'active'
            WHERE n.node_type = $node_type
              AND a.status = 'ready'
              AND lm.enabled = 1
              AND (lib.scope = 'global' OR (lib.scope = 'project' AND lib.novel_id = $novel_id))
              AND lic.license_state IN ('public_domain', 'cc', 'authorized')
              AND lic.reuse_policy IN ('verbatim_ok', 'adapted_only')
              AND (a.novel_id = $novel_id OR ((a.novel_id IS NULL OR a.novel_id = 0) AND a.corpus_visibility = 'workspace'))
            """;
        var builder = new StringBuilder(commandText);
        var parameters = new List<(string Name, object Value)>
        {
            ("$node_type", requestedNodeType),
            ("$novel_id", input.QueryContext.ChapterContext.NovelId)
        };
        AppendInClause(builder, parameters, "lm.library_id", libraryIds, "library_id");
        AppendInClause(builder, parameters, "lic.reuse_policy", reusePolicies, "reuse_policy");
        if (includeAnchorIds.Count > 0)
        {
            AppendInClause(builder, parameters, "n.anchor_id", includeAnchorIds, "include_anchor_id");
        }

        if (excludeAnchorIds.Count > 0)
        {
            AppendNotInClause(builder, parameters, "n.anchor_id", excludeAnchorIds, "exclude_anchor_id");
        }

        builder.AppendLine("ORDER BY n.anchor_id, n.sequence_index, n.node_id, o.observation_id LIMIT $limit;");
        parameters.Add(("$limit", limit));

        await using var command = connection.CreateCommand();
        command.CommandText = builder.ToString();
        foreach (var parameter in parameters)
        {
            command.Parameters.AddWithValue(parameter.Name, parameter.Value);
        }

        var map = new Dictionary<string, CorpusCandidateNode>(StringComparer.Ordinal);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var nodeId = reader.GetString(0);
            if (!map.TryGetValue(nodeId, out var candidate))
            {
                candidate = new CorpusCandidateNode(
                    NodeId: nodeId,
                    AnchorId: reader.GetInt64(1),
                    NodeType: reader.GetString(2),
                    SequenceIndex: reader.GetInt32(3),
                    ChapterIndex: reader.IsDBNull(4) ? null : reader.GetInt32(4),
                    TextHash: reader.GetString(5),
                    Text: reader.GetString(6),
                    CreatedAt: reader.GetString(7),
                    LibraryId: reader.GetString(8),
                    SourceQuality: reader.IsDBNull(9) ? string.Empty : reader.GetString(9),
                    LicenseState: reader.GetString(10),
                    ReusePolicy: reader.GetString(11),
                    Observations: []);
                map.Add(nodeId, candidate);
            }

            if (!reader.IsDBNull(12))
            {
                candidate.Observations.Add(new CorpusCandidateObservation(
                    ObservationId: reader.GetString(12),
                    FeatureFamily: reader.GetString(13),
                    FeatureKey: reader.GetString(14),
                    ValueText: reader.IsDBNull(15) ? string.Empty : reader.GetString(15),
                    Confidence: reader.GetDouble(16)));
            }
        }

        return map.Values.ToArray();
    }

    private async ValueTask<IReadOnlyDictionary<string, IReadOnlyList<float>>> EnsureNodeEmbeddingsAsync(
        SqliteConnection connection,
        IReadOnlyList<CorpusCandidateNode> candidates,
        EmbeddingRequestOptions embeddingOptions,
        CancellationToken cancellationToken)
    {
        var dimensions = embeddingOptions.Dimensions ?? BuiltinOnnxEmbeddingModel.Dimensions;
        var existing = await ReadNodeEmbeddingsAsync(connection, candidates, embeddingOptions, dimensions, cancellationToken);
        var missing = candidates
            .Where(candidate => !existing.ContainsKey(candidate.NodeId))
            .ToArray();
        if (missing.Length == 0)
        {
            return existing;
        }

        var response = await _embeddings.EmbedAsync(
            missing.Select(candidate => candidate.Text).ToArray(),
            embeddingOptions with
            {
                Dimensions = dimensions,
                InputKind = BuiltinOnnxEmbeddingModel.DocumentInputKind
            },
            cancellationToken);
        if (response.Items.Count != missing.Length)
        {
            throw new InvalidOperationException("Reference corpus node embedding response count does not match the requested batch.");
        }

        var merged = new Dictionary<string, IReadOnlyList<float>>(existing, StringComparer.Ordinal);
        foreach (var item in response.Items.OrderBy(item => item.Index))
        {
            if (item.Index < 0 || item.Index >= missing.Length)
            {
                throw new InvalidOperationException("Reference corpus node embedding response index is outside the requested batch.");
            }

            if (item.Vector.Count != dimensions)
            {
                throw new InvalidOperationException("Reference corpus node embedding dimensions are inconsistent.");
            }

            var candidate = missing[item.Index];
            await UpsertNodeEmbeddingAsync(
                connection,
                candidate,
                embeddingOptions,
                dimensions,
                item.Vector,
                cancellationToken);
            merged[candidate.NodeId] = item.Vector;
        }

        return merged;
    }

    private static async ValueTask<IReadOnlyDictionary<string, IReadOnlyList<float>>> ReadNodeEmbeddingsAsync(
        SqliteConnection connection,
        IReadOnlyList<CorpusCandidateNode> candidates,
        EmbeddingRequestOptions embeddingOptions,
        int dimensions,
        CancellationToken cancellationToken)
    {
        if (candidates.Count == 0)
        {
            return new Dictionary<string, IReadOnlyList<float>>(StringComparer.Ordinal);
        }

        var nodeIds = candidates.Select(candidate => candidate.NodeId).Distinct(StringComparer.Ordinal).ToArray();
        var builder = new StringBuilder("""
            SELECT node_id, embedding_json
            FROM reference_text_node_embeddings
            WHERE provider_key = $provider_key
              AND model_id = $model_id
              AND dimensions = $dimensions
            """);
        var parameters = new List<(string Name, object Value)>
        {
            ("$provider_key", embeddingOptions.ProviderKey),
            ("$model_id", embeddingOptions.ModelId),
            ("$dimensions", dimensions)
        };
        AppendInClause(builder, parameters, "node_id", nodeIds, "node_id");

        await using var command = connection.CreateCommand();
        command.CommandText = builder.ToString();
        foreach (var parameter in parameters)
        {
            command.Parameters.AddWithValue(parameter.Name, parameter.Value);
        }

        var result = new Dictionary<string, IReadOnlyList<float>>(StringComparer.Ordinal);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var nodeId = reader.GetString(0);
            var vector = DeserializeVector(reader.GetString(1));
            if (vector.Count == dimensions)
            {
                result[nodeId] = vector;
            }
        }

        return result;
    }

    private static async ValueTask UpsertNodeEmbeddingAsync(
        SqliteConnection connection,
        CorpusCandidateNode candidate,
        EmbeddingRequestOptions embeddingOptions,
        int dimensions,
        IReadOnlyList<float> vector,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO reference_text_node_embeddings
              (embedding_id, node_id, anchor_id, provider_key, model_id, dimensions,
               text_hash, embedding_json, updated_at)
            VALUES
              ($embedding_id, $node_id, $anchor_id, $provider_key, $model_id, $dimensions,
               $text_hash, $embedding_json, $updated_at)
            ON CONFLICT(node_id, provider_key, model_id, dimensions) DO UPDATE SET
              anchor_id = excluded.anchor_id,
              text_hash = excluded.text_hash,
              embedding_json = excluded.embedding_json,
              updated_at = excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$embedding_id", StableHash(
            "reference_text_node_embedding",
            candidate.NodeId,
            embeddingOptions.ProviderKey,
            embeddingOptions.ModelId,
            dimensions.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        command.Parameters.AddWithValue("$node_id", candidate.NodeId);
        command.Parameters.AddWithValue("$anchor_id", candidate.AnchorId);
        command.Parameters.AddWithValue("$provider_key", embeddingOptions.ProviderKey);
        command.Parameters.AddWithValue("$model_id", embeddingOptions.ModelId);
        command.Parameters.AddWithValue("$dimensions", dimensions);
        command.Parameters.AddWithValue("$text_hash", candidate.TextHash);
        command.Parameters.AddWithValue("$embedding_json", JsonSerializer.Serialize(vector, JsonOptions));
        command.Parameters.AddWithValue("$updated_at", DateTimeOffset.UtcNow.ToString("O"));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private async ValueTask<IReadOnlyList<float>?> GetOrCreateCurrentChapterEmbeddingAsync(
        SqliteConnection connection,
        CurrentChapterContextPayload chapterContext,
        EmbeddingRequestOptions embeddingOptions,
        CancellationToken cancellationToken)
    {
        var draftText = chapterContext.CurrentDraftText ?? string.Empty;
        if (string.IsNullOrWhiteSpace(draftText))
        {
            return null;
        }

        var dimensions = embeddingOptions.Dimensions ?? BuiltinOnnxEmbeddingModel.Dimensions;
        var draftHash = StableHash("current_chapter_draft", draftText);
        await using (var read = connection.CreateCommand())
        {
            read.CommandText = """
                SELECT embedding_json
                FROM reference_current_chapter_embedding_cache
                WHERE novel_id = $novel_id
                  AND chapter_number = $chapter_number
                  AND draft_text_hash = $draft_text_hash
                  AND provider_key = $provider_key
                  AND model_id = $model_id
                  AND dimensions = $dimensions
                LIMIT 1;
                """;
            read.Parameters.AddWithValue("$novel_id", chapterContext.NovelId);
            read.Parameters.AddWithValue("$chapter_number", chapterContext.ChapterNumber);
            read.Parameters.AddWithValue("$draft_text_hash", draftHash);
            read.Parameters.AddWithValue("$provider_key", embeddingOptions.ProviderKey);
            read.Parameters.AddWithValue("$model_id", embeddingOptions.ModelId);
            read.Parameters.AddWithValue("$dimensions", dimensions);
            var cached = await read.ExecuteScalarAsync(cancellationToken);
            if (cached is string json)
            {
                var vector = DeserializeVector(json);
                if (vector.Count == dimensions)
                {
                    return vector;
                }
            }
        }

        var vectorResult = await EmbedSingleAsync(
            draftText,
            embeddingOptions with
            {
                Dimensions = dimensions,
                InputKind = BuiltinOnnxEmbeddingModel.QueryInputKind
            },
            cancellationToken);
        if (vectorResult is null)
        {
            return null;
        }

        await using var upsert = connection.CreateCommand();
        upsert.CommandText = """
            INSERT INTO reference_current_chapter_embedding_cache
              (cache_id, novel_id, chapter_number, draft_text_hash, provider_key, model_id,
               dimensions, embedding_json, updated_at)
            VALUES
              ($cache_id, $novel_id, $chapter_number, $draft_text_hash, $provider_key, $model_id,
               $dimensions, $embedding_json, $updated_at)
            ON CONFLICT(novel_id, chapter_number, draft_text_hash, provider_key, model_id, dimensions) DO UPDATE SET
              embedding_json = excluded.embedding_json,
              updated_at = excluded.updated_at;
            """;
        upsert.Parameters.AddWithValue("$cache_id", StableHash(
            "current_chapter_embedding",
            chapterContext.NovelId.ToString(System.Globalization.CultureInfo.InvariantCulture),
            chapterContext.ChapterNumber.ToString(System.Globalization.CultureInfo.InvariantCulture),
            draftHash,
            embeddingOptions.ProviderKey,
            embeddingOptions.ModelId,
            dimensions.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        upsert.Parameters.AddWithValue("$novel_id", chapterContext.NovelId);
        upsert.Parameters.AddWithValue("$chapter_number", chapterContext.ChapterNumber);
        upsert.Parameters.AddWithValue("$draft_text_hash", draftHash);
        upsert.Parameters.AddWithValue("$provider_key", embeddingOptions.ProviderKey);
        upsert.Parameters.AddWithValue("$model_id", embeddingOptions.ModelId);
        upsert.Parameters.AddWithValue("$dimensions", dimensions);
        upsert.Parameters.AddWithValue("$embedding_json", JsonSerializer.Serialize(vectorResult, JsonOptions));
        upsert.Parameters.AddWithValue("$updated_at", DateTimeOffset.UtcNow.ToString("O"));
        await upsert.ExecuteNonQueryAsync(cancellationToken);

        return vectorResult;
    }

    private async ValueTask<IReadOnlyList<float>?> EmbedSingleAsync(
        string text,
        EmbeddingRequestOptions embeddingOptions,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var response = await _embeddings.EmbedAsync([text], embeddingOptions, cancellationToken);
        if (response.Items.Count != 1)
        {
            throw new InvalidOperationException("Reference corpus embedding response must contain exactly one item.");
        }

        return response.Items[0].Vector;
    }

    private static ReferenceCorpusCandidatePayload ToPayload(ScoredCorpusCandidate scored)
    {
        var candidate = scored.Candidate;
        return new ReferenceCorpusCandidatePayload(
            CandidateId: "corpus-node:" + candidate.NodeId,
            NodeId: candidate.NodeId,
            AnchorId: candidate.AnchorId,
            LibraryId: candidate.LibraryId,
            NodeType: candidate.NodeType,
            TextPreview: Preview(candidate.Text),
            TextHash: candidate.TextHash,
            LicenseState: candidate.LicenseState,
            ReusePolicy: candidate.ReusePolicy,
            Score: scored.Score,
            ScoreComponents: scored.ScoreComponents,
            FitExplanation: BuildFitExplanation(candidate),
            Evidence: candidate.Observations
                .OrderByDescending(item => item.Confidence)
                .ThenBy(item => item.ObservationId, StringComparer.Ordinal)
                .Take(3)
                .Select(item => new ReferenceCorpusCandidateEvidencePayload(
                    item.ObservationId,
                    item.FeatureFamily,
                    item.FeatureKey,
                    item.Confidence))
                .ToArray());
    }

    private static string Preview(string text)
    {
        var normalized = text.Replace("\r", string.Empty, StringComparison.Ordinal).Replace('\n', ' ').Trim();
        return normalized.Length <= MaxTextPreviewLength
            ? normalized
            : normalized[..MaxTextPreviewLength] + "...";
    }

    private static string BuildFitExplanation(CorpusCandidateNode candidate)
    {
        var strongest = candidate.Observations
            .OrderByDescending(item => item.Confidence)
            .FirstOrDefault();
        if (strongest is null)
        {
            return "text node is licensed and semantically close to the current chapter context";
        }

        return $"{strongest.FeatureFamily}:{strongest.FeatureKey} supports current chapter fit";
    }

    private static string BuildQueryEmbeddingText(ReferenceCorpusQueryContextPayload context)
    {
        var builder = new StringBuilder();
        AppendQueryPart(builder, context.SceneType);
        AppendQueryPart(builder, context.EmotionTarget);
        AppendQueryPart(builder, context.PacingTarget);
        AppendQueryPart(builder, context.NarrativePosition);
        AppendQueryPart(builder, context.CommercialMechanic);
        foreach (var value in context.CharacterStates ?? [])
        {
            AppendQueryPart(builder, value);
        }

        foreach (var value in context.RequiredNarrativeFunctions ?? [])
        {
            AppendQueryPart(builder, value);
        }

        AppendQueryPart(builder, context.ChapterContext.PreviousChapterSummary);
        AppendQueryPart(builder, context.ChapterContext.CurrentDraftText);
        return builder.ToString();
    }

    private static void AppendQueryPart(StringBuilder builder, string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        if (builder.Length > 0)
        {
            builder.Append('\n');
        }

        builder.Append(value.Trim());
    }

    private static double ObservationFitScore(
        IReadOnlyList<CorpusCandidateObservation> observations,
        ReferenceCorpusQueryContextPayload context)
    {
        if (observations.Count == 0)
        {
            return 0;
        }

        var queryTerms = BuildQueryTerms(context);
        var score = 0.0;
        foreach (var observation in observations)
        {
            var haystack = string.Join(
                ' ',
                observation.FeatureFamily,
                observation.FeatureKey,
                observation.ValueText);
            var matched = queryTerms.Any(term => haystack.Contains(term, StringComparison.OrdinalIgnoreCase));
            if (matched)
            {
                score += observation.Confidence;
            }
            else if (observation.FeatureFamily is "sensory" or "emotion" or "narrative_function")
            {
                score += observation.Confidence * 0.25;
            }
        }

        return Math.Clamp(score / Math.Max(1, observations.Count), 0, 1);
    }

    private static IReadOnlyList<string> BuildQueryTerms(ReferenceCorpusQueryContextPayload context)
    {
        var terms = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        AddTermFragments(terms, context.SceneType);
        AddTermFragments(terms, context.EmotionTarget);
        AddTermFragments(terms, context.PacingTarget);
        AddTermFragments(terms, context.NarrativePosition);
        AddTermFragments(terms, context.CommercialMechanic);
        foreach (var item in context.RequiredNarrativeFunctions ?? [])
        {
            AddTermFragments(terms, item);
        }

        return terms.Where(term => term.Length >= 3).ToArray();
    }

    private static void AddTermFragments(HashSet<string> terms, string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        foreach (var term in value.Split(['_', '-', ' ', '\t'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            terms.Add(term);
        }

        terms.Add(value.Trim());
    }

    private static double PositionFitScore(
        CorpusCandidateNode candidate,
        CurrentChapterContextPayload chapterContext)
    {
        var draft = ReferenceCorpusSimilarityGate.NormalizeForComparison(chapterContext.CurrentDraftText);
        var node = ReferenceCorpusSimilarityGate.NormalizeForComparison(candidate.Text);
        if (draft.Length == 0 || node.Length == 0)
        {
            return 0;
        }

        var shared = node.EnumerateRunes().Count(rune => draft.Contains(rune.ToString(), StringComparison.Ordinal));
        return Math.Clamp(shared / (double)Math.Max(1, node.EnumerateRunes().Count()), 0, 1);
    }

    private static double SourceQualityScore(string sourceQuality)
    {
        return sourceQuality.Trim().ToLowerInvariant() switch
        {
            "trusted" => 1.0,
            "normal" => 0.7,
            "low" => 0.25,
            _ => 0.5
        };
    }

    private static double CosineSimilarity(
        IReadOnlyList<float>? left,
        IReadOnlyList<float>? right)
    {
        if (left is null || right is null || left.Count == 0 || left.Count != right.Count)
        {
            return 0;
        }

        var dot = 0.0;
        var leftNorm = 0.0;
        var rightNorm = 0.0;
        for (var index = 0; index < left.Count; index++)
        {
            dot += left[index] * right[index];
            leftNorm += left[index] * left[index];
            rightNorm += right[index] * right[index];
        }

        if (leftNorm <= 0 || rightNorm <= 0)
        {
            return 0;
        }

        var cosine = dot / (Math.Sqrt(leftNorm) * Math.Sqrt(rightNorm));
        return Math.Clamp((cosine + 1.0) / 2.0, 0, 1);
    }

    private static IReadOnlyList<float> DeserializeVector(string json)
    {
        return JsonSerializer.Deserialize<IReadOnlyList<float>>(json, JsonOptions) ?? [];
    }

    private static HashSet<string> NormalizeTextSet(IReadOnlyList<string>? values)
    {
        return values?
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .ToHashSet(StringComparer.Ordinal) ?? [];
    }

    private static HashSet<long> NormalizePositiveLongSet(IReadOnlyList<long>? values)
    {
        return values?
            .Where(value => value > 0)
            .ToHashSet() ?? [];
    }

    private static void AppendInClause<T>(
        StringBuilder builder,
        List<(string Name, object Value)> parameters,
        string columnName,
        IReadOnlyCollection<T> values,
        string parameterPrefix)
        where T : notnull
    {
        if (values.Count == 0)
        {
            builder.AppendLine(" AND 1 = 0");
            return;
        }

        var names = new List<string>(values.Count);
        var index = 0;
        foreach (var value in values)
        {
            var name = "$" + parameterPrefix + "_" + index.ToString(System.Globalization.CultureInfo.InvariantCulture);
            names.Add(name);
            parameters.Add((name, value));
            index++;
        }

        builder.Append(" AND ");
        builder.Append(columnName);
        builder.Append(" IN (");
        builder.Append(string.Join(", ", names));
        builder.AppendLine(")");
    }

    private static void AppendNotInClause<T>(
        StringBuilder builder,
        List<(string Name, object Value)> parameters,
        string columnName,
        IReadOnlyCollection<T> values,
        string parameterPrefix)
        where T : notnull
    {
        if (values.Count == 0)
        {
            return;
        }

        var names = new List<string>(values.Count);
        var index = 0;
        foreach (var value in values)
        {
            var name = "$" + parameterPrefix + "_" + index.ToString(System.Globalization.CultureInfo.InvariantCulture);
            names.Add(name);
            parameters.Add((name, value));
            index++;
        }

        builder.Append(" AND ");
        builder.Append(columnName);
        builder.Append(" NOT IN (");
        builder.Append(string.Join(", ", names));
        builder.AppendLine(")");
    }

    private static string StableHash(params string[] parts)
    {
        var payload = Encoding.UTF8.GetBytes(string.Join('\u001f', parts));
        return Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant();
    }

    private sealed record CorpusCandidateNode(
        string NodeId,
        long AnchorId,
        string NodeType,
        int SequenceIndex,
        int? ChapterIndex,
        string TextHash,
        string Text,
        string CreatedAt,
        string LibraryId,
        string SourceQuality,
        string LicenseState,
        string ReusePolicy,
        List<CorpusCandidateObservation> Observations);

    private sealed record CorpusCandidateObservation(
        string ObservationId,
        string FeatureFamily,
        string FeatureKey,
        string ValueText,
        double Confidence);

    private sealed record ScoredCorpusCandidate(
        CorpusCandidateNode Candidate,
        double Score,
        IReadOnlyDictionary<string, double> ScoreComponents);
}

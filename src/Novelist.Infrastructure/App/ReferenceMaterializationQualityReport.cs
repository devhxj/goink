using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Novelist.Contracts.App;
using Novelist.Core.App;

namespace Novelist.Infrastructure.App;

public static class ReferenceMaterializationQualityReport
{
    public const string ReportSchemaVersion = "reference-materialization-quality-report-v1";

    private const string FixtureSchemaVersion = "reference-materialization-quality-fixture-v1";
    private const int MinimumHumanAnnotationNodes = 500;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static async Task<ReferenceMaterializationQualityReportResult> EvaluateAsync(
        string calibrationFixturePath,
        string holdoutFixturePath,
        IReferenceMaterializationQualifier qualifier,
        ReferenceMaterializationLlmSelection model,
        string outputDirectory,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(calibrationFixturePath);
        ArgumentException.ThrowIfNullOrWhiteSpace(holdoutFixturePath);
        ArgumentNullException.ThrowIfNull(qualifier);
        ArgumentNullException.ThrowIfNull(model);
        ArgumentException.ThrowIfNullOrWhiteSpace(outputDirectory);

        var calibration = await ReadFixtureAsync(calibrationFixturePath, "calibration", cancellationToken);
        var holdout = await ReadFixtureAsync(holdoutFixturePath, "holdout", cancellationToken);
        if (calibration.CaseIds.Overlaps(holdout.CaseIds) || calibration.NodeIds.Overlaps(holdout.NodeIds))
        {
            throw new InvalidDataException("Calibration and holdout fixtures must not share case or node identifiers.");
        }

        var calibrationReport = await EvaluateSplitAsync(calibration, qualifier, model, cancellationToken);
        var holdoutReport = await EvaluateSplitAsync(holdout, qualifier, model, cancellationToken);
        var gateEligible = calibration.DatasetKind == "human" &&
            holdout.DatasetKind == "human" &&
            calibration.SourceNodeCount + holdout.SourceNodeCount >= MinimumHumanAnnotationNodes;
        var gatePassed = gateEligible && PassesQualificationThresholds(holdoutReport);
        var report = new ReferenceMaterializationQualityReportResult(
            ReportSchemaVersion,
            "llm_qualification",
            model.ProviderName,
            model.ModelId,
            calibration.FixtureHash,
            holdout.FixtureHash,
            gateEligible,
            gatePassed,
            calibrationReport,
            holdoutReport);
        await WriteAtomicJsonAsync(outputDirectory, "reference-materialization-quality-report.json", report, cancellationToken);
        return report;
    }

    private static async Task<ReferenceMaterializationQualitySplitReport> EvaluateSplitAsync(
        QualityFixture fixture,
        IReferenceMaterializationQualifier qualifier,
        ReferenceMaterializationLlmSelection model,
        CancellationToken cancellationToken)
    {
        var candidates = fixture.Cases.Select(item => new ReferenceMaterializationQualificationCandidate(
            item.CaseId,
            item.CandidateType,
            string.Join(Environment.NewLine, item.Nodes.Select(node => node.Text)),
            item.Nodes.Select(node => new ReferenceMaterializationQualificationSourceNode(node.NodeId, node.Text)).ToArray())).ToArray();
        var decisions = new Dictionary<string, ReferenceMaterializationCandidateQualification>(StringComparer.Ordinal);
        foreach (var batch in candidates.Chunk(ReferenceMaterializationChatCompletionQualifier.MaxCandidatesPerRequest))
        {
            var result = await qualifier.QualifyAsync(
                new ReferenceMaterializationQualificationRequest(model, batch),
                cancellationToken);
            foreach (var decision in ValidateDecisionBatch(result, batch))
            {
                decisions.Add(decision.CandidateId, decision);
            }
        }

        var expectedAccepted = fixture.Cases.Count(item => item.ExpectedDecision == ReferenceMaterializationCandidateDecisions.Accepted);
        var predictedAccepted = fixture.Cases.Count(item => decisions[item.CaseId].Decision == ReferenceMaterializationCandidateDecisions.Accepted);
        var trueAccepted = fixture.Cases.Count(item =>
            item.ExpectedDecision == ReferenceMaterializationCandidateDecisions.Accepted &&
            decisions[item.CaseId].Decision == ReferenceMaterializationCandidateDecisions.Accepted);
        var shortNoise = fixture.Cases.Where(item =>
            item.Category is "short_noise" or "transition_noise" &&
            item.ExpectedDecision == ReferenceMaterializationCandidateDecisions.Rejected).ToArray();
        var shortValuable = fixture.Cases.Where(item =>
            item.Category == "short_valuable" &&
            item.ExpectedDecision == ReferenceMaterializationCandidateDecisions.Accepted).ToArray();
        var spans = fixture.Cases
            .Select(item => CaseSpanIou(item, decisions[item.CaseId]))
            .OrderBy(value => value)
            .ToArray();

        return new ReferenceMaterializationQualitySplitReport(
            fixture.Split,
            fixture.DatasetKind,
            fixture.Cases.Count,
            fixture.SourceNodeCount,
            expectedAccepted,
            predictedAccepted,
            Ratio(trueAccepted, predictedAccepted),
            Ratio(trueAccepted, expectedAccepted),
            Ratio(
                shortNoise.Count(item => decisions[item.CaseId].Decision == ReferenceMaterializationCandidateDecisions.Rejected),
                shortNoise.Length),
            Ratio(
                shortValuable.Count(item => decisions[item.CaseId].Decision == ReferenceMaterializationCandidateDecisions.Accepted),
                shortValuable.Length),
            Median(spans));
    }

    private static IReadOnlyList<ReferenceMaterializationCandidateQualification> ValidateDecisionBatch(
        ReferenceMaterializationQualificationResult result,
        IReadOnlyList<ReferenceMaterializationQualificationCandidate> candidates)
    {
        if (result.Decisions is null || result.Decisions.Count != candidates.Count)
        {
            throw new InvalidDataException("Materialization quality evaluation requires exactly one decision per candidate.");
        }

        var candidatesById = candidates.ToDictionary(candidate => candidate.CandidateId, StringComparer.Ordinal);
        var decisionIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var decision in result.Decisions)
        {
            if (decision is null ||
                !candidatesById.TryGetValue(decision.CandidateId, out var candidate) ||
                !decisionIds.Add(decision.CandidateId) ||
                decision.Decision is not (ReferenceMaterializationCandidateDecisions.Accepted or
                    ReferenceMaterializationCandidateDecisions.Rejected or
                    ReferenceMaterializationCandidateDecisions.ReviewRequired) ||
                decision.SourceSpans is null ||
                decision.SourceSpans.Count != candidate.SourceNodes.Count)
            {
                throw new InvalidDataException("Materialization quality evaluation received an invalid qualification result.");
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
                    throw new InvalidDataException("Materialization quality evaluation received invalid evidence spans.");
                }
            }
        }

        return result.Decisions;
    }

    private static bool PassesQualificationThresholds(ReferenceMaterializationQualitySplitReport report) =>
        report.AcceptedMaterialPrecision >= 0.85 &&
        report.ValuableUnitRecall >= 0.80 &&
        report.ShortNoiseRejectionRecall >= 0.90 &&
        report.ShortValuableRecall >= 0.90 &&
        report.CandidateSpanIouMedian >= 0.85;

    private static double CaseSpanIou(QualityFixtureCase item, ReferenceMaterializationCandidateQualification decision)
    {
        var expectedByNode = item.ExpectedSpans.ToDictionary(span => span.NodeId, StringComparer.Ordinal);
        var predictedByNode = decision.SourceSpans.ToDictionary(span => span.NodeId, StringComparer.Ordinal);
        return Math.Round(expectedByNode.Values.Average(expected =>
        {
            var predicted = predictedByNode[expected.NodeId];
            var intersection = Math.Max(0, Math.Min(expected.End, predicted.End) - Math.Max(expected.Start, predicted.Start));
            var union = Math.Max(expected.End, predicted.End) - Math.Min(expected.Start, predicted.Start);
            return intersection / (double)union;
        }), 6);
    }

    private static async Task<QualityFixture> ReadFixtureAsync(
        string fixturePath,
        string expectedSplit,
        CancellationToken cancellationToken)
    {
        var content = await File.ReadAllTextAsync(fixturePath, cancellationToken);
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object ||
            RequiredString(root, "schema_version") != FixtureSchemaVersion ||
            RequiredString(root, "split") != expectedSplit)
        {
            throw new InvalidDataException("Materialization quality fixture is invalid.");
        }

        var datasetKind = root.TryGetProperty("dataset_kind", out var kind)
            ? RequiredStringValue(kind)
            : "seed";
        if (datasetKind is not ("seed" or "human"))
        {
            throw new InvalidDataException("Materialization quality fixture dataset kind is invalid.");
        }

        var caseIds = new HashSet<string>(StringComparer.Ordinal);
        var nodeIds = new HashSet<string>(StringComparer.Ordinal);
        var cases = new List<QualityFixtureCase>();
        foreach (var item in root.GetProperty("cases").EnumerateArray())
        {
            var caseId = RequiredString(item, "case_id");
            if (!caseIds.Add(caseId))
            {
                throw new InvalidDataException("Materialization quality fixture has duplicate case ids.");
            }

            var candidateType = RequiredString(item, "candidate_type");
            if (!ReferenceMaterializationCandidateTypes.All.Contains(candidateType, StringComparer.Ordinal))
            {
                throw new InvalidDataException("Materialization quality fixture candidate type is invalid.");
            }

            var nodes = new List<QualityFixtureNode>();
            foreach (var node in item.GetProperty("source_nodes").EnumerateArray())
            {
                var nodeId = RequiredString(node, "node_id");
                var text = RequiredString(node, "text");
                if (!nodeIds.Add(nodeId) || !string.Equals(Hash(text), RequiredString(node, "text_hash"), StringComparison.Ordinal))
                {
                    throw new InvalidDataException("Materialization quality fixture node is invalid.");
                }

                nodes.Add(new QualityFixtureNode(nodeId, text));
            }

            var expected = item.GetProperty("expected");
            var expectedDecision = RequiredString(expected, "decision");
            if (expectedDecision is not (ReferenceMaterializationCandidateDecisions.Accepted or
                ReferenceMaterializationCandidateDecisions.Rejected or
                ReferenceMaterializationCandidateDecisions.ReviewRequired))
            {
                throw new InvalidDataException("Materialization quality fixture decision is invalid.");
            }

            var expectedSpans = new List<QualityFixtureSpan>();
            var expectedNodeIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var span in expected.GetProperty("source_spans").EnumerateArray())
            {
                var nodeId = RequiredString(span, "node_id");
                var node = nodes.SingleOrDefault(node => node.NodeId == nodeId);
                var start = span.GetProperty("start").GetInt32();
                var end = span.GetProperty("end").GetInt32();
                if (node is null || !expectedNodeIds.Add(nodeId) || start < 0 || end <= start || end > node.Text.Length)
                {
                    throw new InvalidDataException("Materialization quality fixture span is invalid.");
                }

                expectedSpans.Add(new QualityFixtureSpan(nodeId, start, end));
            }

            if (nodes.Count == 0 || expectedSpans.Count != nodes.Count)
            {
                throw new InvalidDataException("Materialization quality fixture case is invalid.");
            }

            cases.Add(new QualityFixtureCase(
                caseId,
                RequiredString(item, "category"),
                candidateType,
                expectedDecision,
                nodes,
                expectedSpans));
        }

        if (cases.Count == 0)
        {
            throw new InvalidDataException("Materialization quality fixture has no cases.");
        }

        return new QualityFixture(expectedSplit, datasetKind, Hash(content), cases, caseIds, nodeIds);
    }

    private static async Task WriteAtomicJsonAsync(
        string outputDirectory,
        string fileName,
        object report,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(outputDirectory);
        var target = Path.Combine(outputDirectory, fileName);
        var temporary = target + ".tmp-" + Guid.NewGuid().ToString("N");
        await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(report, JsonOptions) + Environment.NewLine, cancellationToken);
        File.Move(temporary, target, overwrite: true);
    }

    private static double? Ratio(int numerator, int denominator) => denominator == 0 ? null : Math.Round(numerator / (double)denominator, 6);

    private static double? Median(IReadOnlyList<double> values)
    {
        if (values.Count == 0)
        {
            return null;
        }

        var middle = values.Count / 2;
        return values.Count % 2 == 0
            ? Math.Round((values[middle - 1] + values[middle]) / 2d, 6)
            : values[middle];
    }

    private static string RequiredString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()))
        {
            throw new InvalidDataException("Materialization quality fixture string is invalid.");
        }

        return value.GetString()!;
    }

    private static string RequiredStringValue(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()))
        {
            throw new InvalidDataException("Materialization quality fixture string is invalid.");
        }

        return value.GetString()!;
    }

    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private sealed record QualityFixture(
        string Split,
        string DatasetKind,
        string FixtureHash,
        IReadOnlyList<QualityFixtureCase> Cases,
        IReadOnlySet<string> CaseIds,
        IReadOnlySet<string> NodeIds)
    {
        public int SourceNodeCount => Cases.Sum(item => item.Nodes.Count);
    }

    private sealed record QualityFixtureCase(
        string CaseId,
        string Category,
        string CandidateType,
        string ExpectedDecision,
        IReadOnlyList<QualityFixtureNode> Nodes,
        IReadOnlyList<QualityFixtureSpan> ExpectedSpans);

    private sealed record QualityFixtureNode(string NodeId, string Text);
    private sealed record QualityFixtureSpan(string NodeId, int Start, int End);
}

public sealed record ReferenceMaterializationQualityReportResult(
    [property: JsonPropertyName("schema_version")] string SchemaVersion,
    [property: JsonPropertyName("evaluation_kind")] string EvaluationKind,
    [property: JsonPropertyName("llm_provider")] string LlmProvider,
    [property: JsonPropertyName("llm_model_id")] string LlmModelId,
    [property: JsonPropertyName("calibration_fixture_hash")] string CalibrationFixtureHash,
    [property: JsonPropertyName("holdout_fixture_hash")] string HoldoutFixtureHash,
    [property: JsonPropertyName("quality_gate_eligible")] bool QualityGateEligible,
    [property: JsonPropertyName("quality_gate_passed")] bool QualityGatePassed,
    [property: JsonPropertyName("calibration")] ReferenceMaterializationQualitySplitReport Calibration,
    [property: JsonPropertyName("holdout")] ReferenceMaterializationQualitySplitReport Holdout);

public sealed record ReferenceMaterializationQualitySplitReport(
    [property: JsonPropertyName("split")] string Split,
    [property: JsonPropertyName("dataset_kind")] string DatasetKind,
    [property: JsonPropertyName("case_count")] int CaseCount,
    [property: JsonPropertyName("source_node_count")] int SourceNodeCount,
    [property: JsonPropertyName("expected_accepted_case_count")] int ExpectedAcceptedCaseCount,
    [property: JsonPropertyName("predicted_accepted_case_count")] int PredictedAcceptedCaseCount,
    [property: JsonPropertyName("accepted_material_precision")] double? AcceptedMaterialPrecision,
    [property: JsonPropertyName("valuable_unit_recall")] double? ValuableUnitRecall,
    [property: JsonPropertyName("short_noise_rejection_recall")] double? ShortNoiseRejectionRecall,
    [property: JsonPropertyName("short_valuable_recall")] double? ShortValuableRecall,
    [property: JsonPropertyName("candidate_span_iou_median")] double? CandidateSpanIouMedian);

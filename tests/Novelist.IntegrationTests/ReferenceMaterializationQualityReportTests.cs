using System.Text.Json;
using Novelist.Contracts.App;
using Novelist.Core.App;
using Novelist.Infrastructure.App;

namespace Novelist.IntegrationTests;

public sealed class ReferenceMaterializationQualityReportTests
{
    [Fact]
    public async Task QualityCommandRejectsIncompleteArgumentsBeforeLoadingModelConfiguration()
    {
        using var standardOutput = new StringWriter();
        using var standardError = new StringWriter();

        var exitCode = await ReferenceMaterializationQualityCommand.RunAsync(
            ["--calibration", "fixture.json"],
            standardOutput,
            standardError,
            CancellationToken.None);

        Assert.Equal(2, exitCode);
        Assert.Empty(standardOutput.ToString());
        Assert.Equal("materialization_quality_invalid_arguments" + Environment.NewLine, standardError.ToString());
    }

    [Fact]
    public async Task EvaluateAsyncWritesStableRedactedSplitMetricsWithoutPassingTheHumanDatasetGate()
    {
        var root = Path.Combine(Path.GetTempPath(), "novelist-materialization-quality-report", Guid.NewGuid().ToString("N"));
        try
        {
            var first = await ReferenceMaterializationQualityReport.EvaluateAsync(
                FixturePath("materialization-quality-calibration-v1.json"),
                FixturePath("materialization-quality-holdout-v1.json"),
                new ExpectedDecisionQualifier(),
                new ReferenceMaterializationLlmSelection("test", "test-model", "high"),
                Path.Combine(root, "first"),
                CancellationToken.None);
            var second = await ReferenceMaterializationQualityReport.EvaluateAsync(
                FixturePath("materialization-quality-calibration-v1.json"),
                FixturePath("materialization-quality-holdout-v1.json"),
                new ExpectedDecisionQualifier(),
                new ReferenceMaterializationLlmSelection("test", "test-model", "high"),
                Path.Combine(root, "second"),
                CancellationToken.None);

            Assert.Equal(ReferenceMaterializationQualityReport.ReportSchemaVersion, first.SchemaVersion);
            Assert.Equal(11, first.Holdout.CaseCount);
            Assert.Equal(1d, first.Holdout.AcceptedMaterialPrecision);
            Assert.Equal(1d, first.Holdout.ValuableUnitRecall);
            Assert.Equal(1d, first.Holdout.ShortNoiseRejectionRecall);
            Assert.Equal(1d, first.Holdout.ShortValuableRecall);
            Assert.Equal(1d, first.Holdout.CandidateSpanIouMedian);
            Assert.False(first.QualityGateEligible);
            Assert.False(first.QualityGatePassed);
            Assert.Equal(first, second);

            var firstJson = await File.ReadAllTextAsync(Path.Combine(root, "first", "reference-materialization-quality-report.json"));
            Assert.Equal(firstJson, await File.ReadAllTextAsync(Path.Combine(root, "second", "reference-materialization-quality-report.json")));
            using var document = JsonDocument.Parse(firstJson);
            Assert.Equal(ReferenceMaterializationQualityReport.ReportSchemaVersion, document.RootElement.GetProperty("schema_version").GetString());
            Assert.DoesNotContain("嗯。", firstJson, StringComparison.Ordinal);
            Assert.DoesNotContain(root, firstJson, StringComparison.Ordinal);
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    private static string FixturePath(string fileName) => Path.Combine(
        AppContext.BaseDirectory,
        "Fixtures",
        "corpus-driven-writing",
        fileName);

    private sealed class ExpectedDecisionQualifier : IReferenceMaterializationQualifier
    {
        public ValueTask<ReferenceMaterializationQualificationResult> QualifyAsync(
            ReferenceMaterializationQualificationRequest input,
            CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return ValueTask.FromResult(new ReferenceMaterializationQualificationResult(
                input.Candidates.Select(candidate => new ReferenceMaterializationCandidateQualification(
                    candidate.CandidateId,
                    DecisionFor(candidate.CandidateId),
                    candidate.SourceNodes.Select(node => new ReferenceMaterializationQualificationSpan(node.NodeId, 0, node.Text.Length)).ToArray(),
                    new ReferenceMaterializationQualityScores(0.9, 0.8, 0.8, 0.7, 0.7, 0.8),
                    new ReferenceMaterializationQualificationTags(["reveal"], ["tension"], ["close_third"], ["subtext"]),
                    0.9,
                    ["complete_exchange"])).ToArray()));
        }

        private static string DecisionFor(string candidateId) =>
            candidateId.Contains("acknowledgement", StringComparison.Ordinal) ||
            candidateId.Contains("generic-action", StringComparison.Ordinal) ||
            candidateId.Contains("transition-noise", StringComparison.Ordinal) ||
            candidateId.Contains("safety-", StringComparison.Ordinal)
                ? ReferenceMaterializationCandidateDecisions.Rejected
                : candidateId.Contains("ambiguous", StringComparison.Ordinal) || candidateId.Contains("social-fragment", StringComparison.Ordinal)
                    ? ReferenceMaterializationCandidateDecisions.ReviewRequired
                    : ReferenceMaterializationCandidateDecisions.Accepted;
    }
}

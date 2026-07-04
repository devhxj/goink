using Novelist.Contracts.App;
using Novelist.Infrastructure.App;

namespace Novelist.IntegrationTests;

public sealed class ReferenceChapterBlueprintNormalizerTests
{
    [Fact]
    public void ComputeAnalysisContractHashIgnoresEquivalentWhitespace()
    {
        var baseline = Blueprint();
        var withWhitespace = Blueprint(
            logicSummary: "  logic  ",
            knownFacts: ["  rain pressure  "],
            configureBeat: beat => beat with
            {
                ParagraphIntention = "  dwell before action  ",
                ReferenceQuery = beat.ReferenceQuery with
                {
                    Query = "  rain pressure  ",
                    FunctionTags = ["  environment  "]
                },
                ProseDuties = ["  interiority  ", "  external_evidence  "]
            });

        var baselineHash = ReferenceChapterBlueprintNormalizer.ComputeAnalysisContractHash(baseline);
        var whitespaceHash = ReferenceChapterBlueprintNormalizer.ComputeAnalysisContractHash(withWhitespace);

        Assert.Equal(baselineHash, whitespaceHash);
    }

    [Fact]
    public void ComputeAnalysisContractHashChangesWhenReviewedFieldChanges()
    {
        var baseline = Blueprint();
        var changed = Blueprint(configureBeat: beat => beat with
        {
            ParagraphIntention = "move directly into action"
        });

        var baselineHash = ReferenceChapterBlueprintNormalizer.ComputeAnalysisContractHash(baseline);
        var changedHash = ReferenceChapterBlueprintNormalizer.ComputeAnalysisContractHash(changed);

        Assert.NotEqual(baselineHash, changedHash);
    }

    [Fact]
    public void ComputeAnalysisContractHashPreservesOrderedArraySemantics()
    {
        var baseline = Blueprint();
        var reordered = Blueprint(configureBeat: beat => beat with
        {
            ProseDuties = ["external_evidence", "interiority"]
        });

        var baselineHash = ReferenceChapterBlueprintNormalizer.ComputeAnalysisContractHash(baseline);
        var reorderedHash = ReferenceChapterBlueprintNormalizer.ComputeAnalysisContractHash(reordered);

        Assert.NotEqual(baselineHash, reorderedHash);
    }

    [Fact]
    public void ComputeAnalysisContractHashTreatsNullListsAsEmptyLists()
    {
        var empty = Blueprint(knownFacts: []);
        var nullList = empty with { KnownFacts = null! };

        var emptyHash = ReferenceChapterBlueprintNormalizer.ComputeAnalysisContractHash(empty);
        var nullHash = ReferenceChapterBlueprintNormalizer.ComputeAnalysisContractHash(nullList);

        Assert.Equal(emptyHash, nullHash);
    }

    private static ReferenceChapterBlueprintPayload Blueprint(
        string logicSummary = "logic",
        IReadOnlyList<string>? knownFacts = null,
        Func<ReferenceChapterBlueprintBeatPayload, ReferenceChapterBlueprintBeatPayload>? configureBeat = null)
    {
        var beat = configureBeat?.Invoke(Beat()) ?? Beat();
        return new ReferenceChapterBlueprintPayload(
            1,
            10,
            1,
            "Blueprint",
            ReferenceBlueprintStates.Draft,
            "next",
            "source-hash",
            "context-hash",
            "analysis-hash",
            1,
            0,
            1,
            "chapter function",
            new ReferenceChapterBlueprintAnalysisTrackPayload("logic", logicSummary, ["point"]),
            new ReferenceChapterBlueprintAnalysisTrackPayload("emotion", "emotion", ["point"]),
            new ReferenceChapterBlueprintAnalysisTrackPayload("narration", "narration", ["point"]),
            new ReferenceChapterBlueprintAnalysisTrackPayload("character", "character", ["point"]),
            new ReferenceChapterBlueprintAnalysisTrackPayload("reference", "reference", ["point"]),
            new ReferenceChapterBlueprintAnalysisTrackPayload("transition", "transition", ["point"]),
            new ReferenceChapterBlueprintExecutionTrackPayload(
                "execution",
                "execution",
                ["intention"],
                ["dwell"],
                ["anti-screenplay"],
                ["source detail"],
                ["reject"]),
            "previous",
            "final",
            "hook",
            "pov",
            "close",
            knownFacts ?? ["rain pressure"],
            [],
            [],
            [beat],
            LatestReview: null,
            DateTimeOffset.UnixEpoch,
            DateTimeOffset.UnixEpoch);
    }

    private static ReferenceChapterBlueprintBeatPayload Beat()
    {
        return new ReferenceChapterBlueprintBeatPayload(
            "1:beat:1",
            1,
            1,
            ReferenceBlueprintBeatTypes.Interiority,
            "show pressure",
            "premise",
            "pressure",
            "in",
            "out",
            "transition in",
            "transition out",
            "pov",
            "close",
            ["allowed"],
            [],
            ["controlled"],
            ["pressured"],
            ["goal"],
            ["misbelief"],
            ["pressure"],
            "trigger",
            "before",
            "after",
            "suppressed",
            "external",
            "strategy",
            "rhythm",
            "dwell before action",
            "dwell",
            "anti-screenplay",
            "rain detail",
            "subtext",
            "source detail",
            "reject",
            ["rain pressure"],
            [],
            new ReferenceMaterialQueryPayload(
                "rain pressure",
                [ReferenceMaterialTypes.Sentence],
                ["strained"],
                ["environment"],
                ["close"],
                ["interiority"],
                3),
            [ReferenceMaterialTypes.Sentence],
            ReferenceRewriteLevels.L1,
            [new ReferenceSlotValuePayload("subject", "street")],
            "preserve order",
            string.Empty,
            ["interiority", "external_evidence"],
            []);
    }
}

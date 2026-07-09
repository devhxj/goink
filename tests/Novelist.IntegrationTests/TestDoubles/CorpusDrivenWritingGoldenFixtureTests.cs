using System.Text.Json;

namespace Novelist.IntegrationTests.TestDoubles;

public sealed class CorpusDrivenWritingGoldenFixtureTests
{
    [Fact]
    public void GoldenFixtureSkeletonContainsCorpusContextAndExpectedOutputs()
    {
        var fixturePath = Path.Combine(
            AppContext.BaseDirectory,
            "Fixtures",
            "corpus-driven-writing",
            "g3-harness-golden-skeleton.json");

        using var document = JsonDocument.Parse(File.ReadAllText(fixturePath));
        var root = document.RootElement;
        var fixture = root.GetProperty("fixtures")[0];

        Assert.Equal("corpus-driven-writing-golden-fixtures-v1", root.GetProperty("schema_version").GetString());
        Assert.Equal("g3-small-rain-doorway", fixture.GetProperty("fixture_id").GetString());
        Assert.NotEmpty(fixture.GetProperty("corpus").GetProperty("sources").EnumerateArray());
        Assert.NotEmpty(fixture.GetProperty("current_chapter_contexts").EnumerateArray());
        Assert.NotEmpty(fixture.GetProperty("query_contexts").EnumerateArray());
        Assert.NotEmpty(fixture.GetProperty("expected_retrieval").GetProperty("top_nodes").EnumerateArray());
        Assert.NotEmpty(fixture.GetProperty("expected_blueprint").GetProperty("beats").EnumerateArray());
        Assert.NotEmpty(fixture.GetProperty("expected_insertion").GetProperty("pieces").EnumerateArray());
    }
}

using Microsoft.Data.Sqlite;
using Novelist.Contracts.App;
using Novelist.Infrastructure.App;

namespace Novelist.IntegrationTests;

public sealed class ReferenceCorpusTextNodeImportTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "novelist-tests", Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task CreateAnchorPopulatesStableTextNodesAndLinksSegmentsAndMaterials()
    {
        var options = CreateOptions();
        await InitializeAsync(options);
        var novels = new FileSystemNovelService(options, new FileSystemAppSettingsService(options));
        var novel = await novels.CreateNovelAsync(new CreateNovelPayload("节点导入测试", "", ""), CancellationToken.None);
        var sourcePath = CreateSourceFile(
            "nodes.md",
            """
            # 第一章 雨门

            雨声贴着门缝往里挤。

            她没有立刻开口，只把钥匙扣在掌心。
            """);
        var service = new SqliteReferenceAnchorService(options, novels);

        var anchor = await service.CreateAnchorAsync(
            new CreateReferenceAnchorPayload(
                novel.Id,
                "雨门节点参考",
                null,
                sourcePath,
                "markdown",
                "user_provided"),
            CancellationToken.None);

        var nodes = await ReadTextNodesAsync(options, anchor.AnchorId);
        Assert.Contains(nodes, node => node.NodeType == ReferenceCorpusNodeTypes.Chapter && node.Text.Contains("雨声贴着门缝", StringComparison.Ordinal));
        Assert.Contains(nodes, node => node.NodeType == ReferenceCorpusNodeTypes.Passage && node.Text == "雨声贴着门缝往里挤。");
        var firstSentence = Assert.Single(nodes, node => node.NodeType == ReferenceCorpusNodeTypes.Sentence && node.Text == "雨声贴着门缝往里挤。");
        var firstPassage = Assert.Single(nodes, node => node.NodeType == ReferenceCorpusNodeTypes.Passage && node.Text == "雨声贴着门缝往里挤。");
        Assert.Equal(firstPassage.NodeId, firstSentence.ParentNodeId);
        Assert.Equal(firstSentence.TextHash, await ReadSourceSegmentNodeTextHashAsync(options, firstSentence.NodeId));
        Assert.True(await MaterialNodeExistsAsync(options, firstSentence.NodeId));
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private AppInitializationOptions CreateOptions()
    {
        return new AppInitializationOptions
        {
            ConfigDirectory = Path.Combine(_root, "config"),
            DefaultDataDirectory = Path.Combine(_root, "data")
        };
    }

    private string CreateSourceFile(string fileName, string content)
    {
        var sourceDirectory = Path.Combine(_root, "sources");
        Directory.CreateDirectory(sourceDirectory);
        var path = Path.Combine(sourceDirectory, fileName);
        File.WriteAllText(path, content);
        return path;
    }

    private static async ValueTask InitializeAsync(AppInitializationOptions options)
    {
        var initialization = new FileSystemAppInitializationService(options);
        await initialization.InitializeAsync(options.DefaultDataDirectory, CancellationToken.None);
    }

    private static async ValueTask<IReadOnlyList<TextNodeRow>> ReadTextNodesAsync(
        AppInitializationOptions options,
        long anchorId)
    {
        await using var connection = await OpenReferenceConnectionAsync(options);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT node_id, parent_node_id, node_type, sequence_index, text_hash, text
            FROM reference_text_nodes
            WHERE anchor_id = $anchor_id
            ORDER BY start_offset, depth, sequence_index, node_id;
            """;
        command.Parameters.AddWithValue("$anchor_id", anchorId);
        var nodes = new List<TextNodeRow>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            nodes.Add(new TextNodeRow(
                reader.GetString(0),
                reader.IsDBNull(1) ? null : reader.GetString(1),
                reader.GetString(2),
                reader.GetInt32(3),
                reader.GetString(4),
                reader.GetString(5)));
        }

        return nodes;
    }

    private static async ValueTask<string> ReadSourceSegmentNodeTextHashAsync(
        AppInitializationOptions options,
        string nodeId)
    {
        await using var connection = await OpenReferenceConnectionAsync(options);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT n.text_hash
            FROM reference_source_segments s
            JOIN reference_text_nodes n ON n.node_id = s.node_id
            WHERE s.node_id = $node_id
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$node_id", nodeId);
        return Convert.ToString(await command.ExecuteScalarAsync()) ?? string.Empty;
    }

    private static async ValueTask<bool> MaterialNodeExistsAsync(
        AppInitializationOptions options,
        string nodeId)
    {
        await using var connection = await OpenReferenceConnectionAsync(options);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT COUNT(*)
            FROM reference_materials
            WHERE node_id = $node_id;
            """;
        command.Parameters.AddWithValue("$node_id", nodeId);
        return Convert.ToInt32(await command.ExecuteScalarAsync()) > 0;
    }

    private static async ValueTask<SqliteConnection> OpenReferenceConnectionAsync(AppInitializationOptions options)
    {
        var databasePath = Path.Combine(options.DefaultDataDirectory, "reference-anchor", "index.sqlite");
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = databasePath, Pooling = false }.ToString());
        await connection.OpenAsync();
        return connection;
    }

    private sealed record TextNodeRow(
        string NodeId,
        string? ParentNodeId,
        string NodeType,
        int SequenceIndex,
        string TextHash,
        string Text);
}

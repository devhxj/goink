using System.Text.Json;
using System.Text.Json.Serialization;
using Novelist.Contracts.App;
using Novelist.Core.App;

namespace Novelist.Infrastructure.App;

internal static class ReferenceMaterializationQualityCommand
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static async Task<int> RunAsync(
        IReadOnlyList<string> arguments,
        TextWriter standardOutput,
        TextWriter standardError,
        CancellationToken cancellationToken)
    {
        try
        {
            var options = Parse(arguments);
            var appOptions = new AppInitializationOptions();
            var settings = new FileSystemAppSettingsService(appOptions);
            var chat = new StandardChatCompletionClient(new FileSystemLlmConfigurationService(appOptions));
            var embeddings = new HybridEmbeddingClient();
            var preflight = new ReferenceMaterializationModelPreflight(
                settings,
                chat,
                new FileSystemEmbeddingSettingsService(appOptions, embeddings),
                embeddings);
            var frozenModels = await preflight.VerifyAsync(cancellationToken);
            var currentSettings = await settings.GetSettingsAsync(cancellationToken);
            var report = await ReferenceMaterializationQualityReport.EvaluateAsync(
                options.CalibrationFixturePath,
                options.HoldoutFixturePath,
                new ReferenceMaterializationChatCompletionQualifier(chat),
                new ReferenceMaterializationLlmSelection(
                    frozenModels.Llm.Provider,
                    frozenModels.Llm.ModelId,
                    currentSettings.ReasoningEffort),
                options.OutputDirectory,
                cancellationToken);
            await standardOutput.WriteLineAsync(JsonSerializer.Serialize(
                new ReferenceMaterializationQualityCommandSummary(
                    report.SchemaVersion,
                    report.Holdout.CaseCount,
                    report.QualityGateEligible,
                    report.QualityGatePassed,
                    report.Holdout.AcceptedMaterialPrecision,
                    report.Holdout.ShortNoiseRejectionRecall),
                JsonOptions));
            return 0;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (ArgumentException)
        {
            await standardError.WriteLineAsync("materialization_quality_invalid_arguments");
            return 2;
        }
        catch (ReferenceMaterializationException exception)
        {
            await standardError.WriteLineAsync(exception.ErrorCode);
            return 1;
        }
        catch (Exception)
        {
            await standardError.WriteLineAsync("materialization_quality_failed");
            return 1;
        }
    }

    private static ReferenceMaterializationQualityCommandOptions Parse(IReadOnlyList<string> arguments)
    {
        if (arguments.Count != 6)
        {
            throw new ArgumentException("Quality evaluation requires calibration, holdout, and output paths.");
        }

        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var index = 0; index < arguments.Count; index += 2)
        {
            var key = arguments[index];
            var value = arguments[index + 1];
            if (key is not ("--calibration" or "--holdout" or "--output") ||
                string.IsNullOrWhiteSpace(value) ||
                !values.TryAdd(key, value))
            {
                throw new ArgumentException("Quality evaluation arguments are invalid.");
            }
        }

        return new ReferenceMaterializationQualityCommandOptions(
            Path.GetFullPath(values["--calibration"]),
            Path.GetFullPath(values["--holdout"]),
            Path.GetFullPath(values["--output"]));
    }

    private sealed record ReferenceMaterializationQualityCommandOptions(
        string CalibrationFixturePath,
        string HoldoutFixturePath,
        string OutputDirectory);
}

internal sealed record ReferenceMaterializationQualityCommandSummary(
    [property: JsonPropertyName("schema_version")] string SchemaVersion,
    [property: JsonPropertyName("holdout_case_count")] int HoldoutCaseCount,
    [property: JsonPropertyName("quality_gate_eligible")] bool QualityGateEligible,
    [property: JsonPropertyName("quality_gate_passed")] bool QualityGatePassed,
    [property: JsonPropertyName("holdout_accepted_material_precision")] double? HoldoutAcceptedMaterialPrecision,
    [property: JsonPropertyName("holdout_short_noise_rejection_recall")] double? HoldoutShortNoiseRejectionRecall);

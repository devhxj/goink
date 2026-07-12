namespace Novelist.IntegrationTests;

public sealed class MaterializationScaleFactAttribute : FactAttribute
{
    public MaterializationScaleFactAttribute()
    {
        if (!string.Equals(
                Environment.GetEnvironmentVariable("NOVELIST_RUN_MATERIALIZATION_SCALE"),
                "1",
                StringComparison.Ordinal))
        {
            Skip = "Run scripts/corpus-driven-writing/run-materialization-scale-gate.ps1 for the explicit 50K materialization gate.";
        }
    }
}

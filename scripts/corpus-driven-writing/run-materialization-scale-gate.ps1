param(
 [string]$Configuration = "Release",
 [int]$ScaleCharacters = 50000
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$minimumCharacters = 50000
if ($ScaleCharacters -lt $minimumCharacters) { throw "ScaleCharacters must be at least $minimumCharacters." }
$previousCharacters = $env:NOVELIST_MATERIALIZATION_SCALE_CHARACTERS
$previousThroughput = $env:NOVELIST_ENFORCE_MATERIALIZATION_SCALE_THROUGHPUT
$env:NOVELIST_MATERIALIZATION_SCALE_CHARACTERS = $ScaleCharacters.ToString([Globalization.CultureInfo]::InvariantCulture)
$env:NOVELIST_ENFORCE_MATERIALIZATION_SCALE_THROUGHPUT = "1"

Push-Location $repoRoot
try {
 & dotnet test tests/Novelist.IntegrationTests/Novelist.IntegrationTests.csproj --no-restore -c $Configuration -v minimal --filter "FullyQualifiedName~ReferenceMaterializationScaleTests"
 if ($LASTEXITCODE -ne 0) { throw "The 50K materialization scale gate failed." }
}
finally {
 if ($null -eq $previousThroughput) {
 Remove-Item Env:NOVELIST_ENFORCE_MATERIALIZATION_SCALE_THROUGHPUT -ErrorAction SilentlyContinue
 }
 else {
 $env:NOVELIST_ENFORCE_MATERIALIZATION_SCALE_THROUGHPUT = $previousThroughput
 }
 if ($null -eq $previousCharacters) {
 Remove-Item Env:NOVELIST_MATERIALIZATION_SCALE_CHARACTERS -ErrorAction SilentlyContinue
 }
 else {
 $env:NOVELIST_MATERIALIZATION_SCALE_CHARACTERS = $previousCharacters
 }
 Pop-Location
}

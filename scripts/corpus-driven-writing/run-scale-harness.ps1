param(
 [string]$Configuration = "Debug",
 [int]$MinimumCharacters = 2000000,
 [int]$JobSize = 100,
 [double]$MinimumThroughput = 20,
 [double]$MaximumClaimP95Ms = 100,
 [double]$MaximumListP95Ms = 200,
 [string]$Output = "build/tmp/corpus-driven-writing/scale-metrics.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$hostProject = Join-Path $PSScriptRoot "CorpusHarnessHost/CorpusHarnessHost.csproj"
$fixturePath = Join-Path $repoRoot "build/tmp/corpus-driven-writing/scale-2m.jsonl"
$databasePath = Join-Path $repoRoot "build/tmp/corpus-driven-writing/scale/novelist.db"
$outputPath = Join-Path $repoRoot $Output
$stdoutPath = Join-Path $repoRoot "build/tmp/corpus-driven-writing/scale.stdout.json"
$stderrPath = Join-Path $repoRoot "build/tmp/corpus-driven-writing/scale.stderr.log"
$progressPath = Join-Path $repoRoot "build/tmp/corpus-driven-writing/scale-progress.json"

Push-Location $repoRoot
try {
 & $PSScriptRoot/generate-fixtures.ps1 -ScaleCharacterCount $MinimumCharacters -ScaleOutput "build/tmp/corpus-driven-writing/scale-2m.jsonl"
 & dotnet build $hostProject -c $Configuration -v minimal
 if ($LASTEXITCODE -ne 0) { throw "Harness host build failed." }
 $hostDll = Join-Path $PSScriptRoot "CorpusHarnessHost/bin/$Configuration/net10.0/Novelist.IntegrationTests.dll"
New-Item -ItemType Directory -Force -Path (Split-Path $databasePath), (Split-Path $outputPath) | Out-Null
 Remove-Item -LiteralPath $outputPath, $progressPath -Force -ErrorAction SilentlyContinue
 $arguments = @(
 $hostDll, "scale", "--database", $databasePath, "--fixture", $fixturePath,
 "--minimum-characters", $MinimumCharacters, "--job-size", $JobSize,
 "--minimum-throughput", $MinimumThroughput,
 "--maximum-claim-p95-ms", $MaximumClaimP95Ms,
 "--maximum-list-p95-ms", $MaximumListP95Ms,
 "--metrics-output", $outputPath,
 "--progress-output", $progressPath
 )
 $process = Start-Process dotnet -ArgumentList $arguments -PassThru -Wait -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
 if ($process.ExitCode -ne 0) { throw "Scale harness failed. $(Get-Content $stderrPath -Raw)" }
 if (-not (Test-Path -LiteralPath $outputPath)) { throw "Scale host exited without writing metrics. See $stderrPath" }
 $report = (Get-Content -LiteralPath $outputPath -Raw) | ConvertFrom-Json
 if ($report.schema_version -ne "corpus-m2-scale-metrics-v1" -or $null -eq $report.result) {
 throw "Scale host wrote an invalid metrics envelope. See $outputPath"
 }
 if ($report.result.passed -ne $true) { throw "Scale thresholds failed. See $outputPath" }
Write-Output "metrics=$outputPath"
 Write-Output "progress=$progressPath"
}
finally {
 Pop-Location
}

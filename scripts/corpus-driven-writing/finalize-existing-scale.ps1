param(
 [string]$Stdout = "build/tmp/corpus-driven-writing/scale.stdout.json",
 [string]$Output = "build/tmp/corpus-driven-writing/scale-metrics.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path

function Resolve-RepositoryPath([string]$Path) {
 if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
 return [IO.Path]::GetFullPath((Join-Path $repoRoot $Path))
}

function Write-AtomicUtf8Json([string]$Path, [object]$Value) {
 $directory = Split-Path -Parent $Path
 New-Item -ItemType Directory -Force -Path $directory | Out-Null
 $temporary = Join-Path $directory ".$([IO.Path]::GetFileName($Path)).$PID.$([Guid]::NewGuid().ToString('N')).tmp"
 try {
 [IO.File]::WriteAllText(
 $temporary,
 ($Value | ConvertTo-Json -Depth 20),
 [Text.UTF8Encoding]::new($false))
 [IO.File]::Move($temporary, $Path, $true)
 }
 finally {
 if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
 }
}

$stdoutPath = Resolve-RepositoryPath $Stdout
$outputPath = Resolve-RepositoryPath $Output
if (-not (Test-Path -LiteralPath $stdoutPath -PathType Leaf)) {
 throw "Scale stdout does not exist: $stdoutPath"
}

try {
 $parsed = Get-Content -LiteralPath $stdoutPath -Raw | ConvertFrom-Json -ErrorAction Stop
}
catch {
 throw "Scale stdout is not complete valid JSON; refusing to finalize: $stdoutPath"
}

if ($parsed.schema_version) {
 if ($parsed.schema_version -ne "corpus-m2-scale-metrics-v1" -or $null -eq $parsed.result) {
 throw "Scale stdout has an unsupported metrics schema; refusing to finalize: $stdoutPath"
 }
 $report = $parsed
}
else {
 $report = [ordered]@{
 schema_version = "corpus-m2-scale-metrics-v1"
 generated_at = [DateTimeOffset]::UtcNow.ToString("O")
 result = $parsed
 }
}

if ($report.result.passed -ne $true) {
 throw "Scale stdout is complete but did not pass; refusing to finalize: $stdoutPath"
}
if ($null -eq $report.result.work_items -or $null -eq $report.result.output_rows -or
 $null -eq $report.result.claim_ms -or $null -eq $report.result.task_list_ms) {
 throw "Scale stdout is missing required metrics fields; refusing to finalize: $stdoutPath"
}

Write-AtomicUtf8Json $outputPath $report
Write-Output "metrics=$outputPath"

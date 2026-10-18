Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repoRoot = (& git -C $projectRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
    throw 'Failed to resolve git repository root'
}

$projectFull = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\\')
$repoFull = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\\')
$hooksPath = if ($projectFull -eq $repoFull) { '.githooks' } else { "$(Split-Path -Leaf $projectRoot)/.githooks" }

$hookFile = Join-Path $projectRoot '.githooks\pre-commit'
if (-not (Test-Path -LiteralPath $hookFile)) {
    throw "Hook file not found: $hookFile"
}

& git -C $projectRoot config --local core.hooksPath $hooksPath
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to set core.hooksPath'
}

$current = (& git -C $projectRoot config --local --get core.hooksPath).Trim()
if ($current -ne $hooksPath) {
    throw "core.hooksPath mismatch. expected=$hooksPath actual=$current"
}

Write-Host "[PASS] core.hooksPath=$current"
Write-Host '[DONE] git hook install completed'

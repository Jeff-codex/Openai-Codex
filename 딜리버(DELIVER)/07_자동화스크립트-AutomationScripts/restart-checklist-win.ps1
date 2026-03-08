Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodeNpm = 'C:\Program Files\nodejs\npm.cmd'

function Step {
    param([string]$Text)
    Write-Host "[STEP] $Text"
}

function Pass {
    param([string]$Text)
    Write-Host "[PASS] $Text"
}

Push-Location $projectRoot
try {
    Step 'project root check'
    if (-not (Test-Path -LiteralPath 'index.html')) { throw 'index.html missing' }
    if (-not (Test-Path -LiteralPath '_redirects')) { throw '_redirects missing' }
    if (-not (Test-Path -LiteralPath '_headers')) { throw '_headers missing' }
    Pass 'required root files exist'

    Step 'git status snapshot'
    & git status --short | Select-Object -First 40

    Step 'doctor:win'
    & $nodeNpm run doctor:win
    if ($LASTEXITCODE -ne 0) { throw "doctor:win failed ($LASTEXITCODE)" }

    Step 'check:html:guard'
    & $nodeNpm run check:html:guard
    if ($LASTEXITCODE -ne 0) { throw "check:html:guard failed ($LASTEXITCODE)" }

    Write-Host '[DONE] deliver restart checklist passed'
    exit 0
}
finally {
    Pop-Location
}

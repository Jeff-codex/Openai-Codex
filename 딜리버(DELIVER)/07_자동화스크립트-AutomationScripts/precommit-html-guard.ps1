Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$failed = $false

function Write-Pass {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "[PASS] $Message"
}

function Write-Fail {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "[FAIL] $Message"
    $script:failed = $true
}
function Read-Utf8TextStrict {
    param([Parameter(Mandatory = $true)][string]$Path)

    $fullPath = (Resolve-Path -LiteralPath $Path).Path
    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
    try {
        $text = $utf8Strict.GetString($bytes)
    }
    catch {
        throw "Invalid UTF-8 encoding: $Path"
    }

    if ($text.Contains([char]0xFFFD)) {
        throw "UTF-8 replacement character detected: $Path"
    }

    return $text
}

function Test-StagedHtmlFiles {
    param([Parameter(Mandatory = $true)][string]$Root)

    $repoRoot = ''
    try {
        $repoRoot = (& git -C $Root rev-parse --show-toplevel 2>$null).Trim()
    }
    catch {
        return @()
    }

    if ([string]::IsNullOrWhiteSpace($repoRoot)) {
        return @()
    }

    $projectFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
    $repoFull = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\')
    $projectLeaf = Split-Path -Leaf $Root
    $prefix = "$projectLeaf\"

    $staged = @(& git -C $Root diff --cached --name-only --diff-filter=ACMR 2>$null)
    if ($LASTEXITCODE -ne 0 -or $staged.Count -eq 0) {
        return @()
    }

    $targets = New-Object System.Collections.Generic.List[string]
    foreach ($item in $staged) {
        $path = $item.Trim()
        if (-not $path) { continue }

        $normalized = $path -replace '/', '\'
        if ($projectFull -ne $repoFull) {
            if (-not $normalized.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                continue
            }
            $normalized = $normalized.Substring($prefix.Length)
        }

        if ($normalized -notmatch '\.html$') { continue }

        $fullPath = Join-Path $Root $normalized
        if (Test-Path -LiteralPath $fullPath) {
            $targets.Add((Resolve-Path -LiteralPath $fullPath).Path)
        }
    }

    return @($targets | Sort-Object -Unique)
}

function Test-HtmlFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    $raw = Read-Utf8TextStrict -Path $Path

    if ($raw.Contains([char]0xFFFD)) {
        Write-Fail "$Path contains replacement characters (encoding corruption)"
    }
    else {
        Write-Pass "$Path encoding check"
    }

    if ($raw -match 'content="[^"\r\n]*/>') {
        Write-Fail "$Path contains broken meta/content quote syntax"
    }
    else {
        Write-Pass "$Path meta quote check"
    }
}

try {
    $indexPath = Join-Path $projectRoot 'index.html'
    if (-not (Test-Path -LiteralPath $indexPath)) {
        Write-Fail 'index.html not found'
    }
    else {
        $indexRaw = Read-Utf8TextStrict -Path $indexPath
        if ($indexRaw -match '<title>[^<]+</title>') {
            Write-Pass 'index.html title syntax check'
        }
        else {
            Write-Fail 'index.html title tag syntax invalid'
        }

        if ($indexRaw -match "location\\.replace\\('/member/'\\)") {
            Write-Fail 'index.html contains emergency member redirect script'
        }
        else {
            Write-Pass 'index.html emergency redirect check'
        }
    }

    $redirectsPath = Join-Path $projectRoot '_redirects'
    $expectedFirst = 'https://www.dliver.co.kr/* https://dliver.co.kr/:splat 301!'
    if (-not (Test-Path -LiteralPath $redirectsPath)) {
        Write-Fail '_redirects not found'
    }
    else {
        $lines = (Read-Utf8TextStrict -Path $redirectsPath) -split "`r?`n"
        $active = @($lines | Where-Object {
            $trim = $_.Trim()
            $trim -ne '' -and -not $trim.StartsWith('#')
        })

        if ($active.Count -eq 0) {
            Write-Fail '_redirects has no active rules'
        }
        else {
            if ($active[0] -eq $expectedFirst) {
                Write-Pass '_redirects first rule check'
            }
            else {
                Write-Fail '_redirects first rule mismatch'
            }

            if (($lines -join "`n") -match '<!doctype|<html') {
                Write-Fail '_redirects contains html-like content'
            }
            else {
                Write-Pass '_redirects html contamination check'
            }

            $catchAll = @($active | Where-Object { $_ -match '^\s*/\*\s+' })
            if ($catchAll.Count -gt 0) {
                Write-Fail '_redirects contains catch-all /* route'
            }
            else {
                Write-Pass '_redirects catch-all route check'
            }

            $queryRoutes = @($active | Where-Object { $_ -match '^\s*/[^ ]*\?' })
            if ($queryRoutes.Count -gt 0) {
                Write-Fail '_redirects contains malformed source route with ?'
            }
            else {
                Write-Pass '_redirects malformed source check'
            }
        }
    }

    $htmlTargets = New-Object System.Collections.Generic.List[string]
    $htmlTargets.Add((Resolve-Path -LiteralPath $indexPath).Path)
    $stagedHtml = @(Test-StagedHtmlFiles -Root $projectRoot)
    foreach ($file in $stagedHtml) {
        if (-not $htmlTargets.Contains($file)) {
            $htmlTargets.Add($file)
        }
    }

    foreach ($file in $htmlTargets) {
        Test-HtmlFile -Path $file
    }

    if ($failed) {
        Write-Host '[DONE] pre-commit html guard failed'
        exit 1
    }

    Write-Host '[DONE] pre-commit html guard passed'
    exit 0
}
catch {
    Write-Host "[FAIL] $($_.Exception.Message)"
    exit 1
}

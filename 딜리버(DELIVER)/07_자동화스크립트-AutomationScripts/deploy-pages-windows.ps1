param(
    [string]$Branch = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$wslSecretPath = '/home/gusrudrkd/.deliver-secrets/.env.cloudflare.local'
$windowsSecretDir = 'C:\Users\gusru\.deliver-secrets'
$windowsSecretFile = Join-Path $windowsSecretDir '.env.cloudflare.local'

function Write-State {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Value
    )
    Write-Host "$Key=$Value"
}

function Parse-EnvText {
    param([string[]]$Lines)

    $map = [ordered]@{}
    foreach ($line in $Lines) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $idx = $trimmed.IndexOf('=')
        if ($idx -lt 1) { continue }
        $key = $trimmed.Substring(0, $idx).Trim()
        $value = $trimmed.Substring($idx + 1)
        $map[$key] = $value
    }
    return $map
}

function Load-EnvIntoProcess {
    param([hashtable]$Map)

    foreach ($k in $Map.Keys) {
        [Environment]::SetEnvironmentVariable($k, [string]$Map[$k], 'Process')
    }
}

function Resolve-NodeTool {
    param([string]$CommandName, [string]$FallbackPath)

    $cmd = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    if (Test-Path -LiteralPath $FallbackPath) { return $FallbackPath }
    throw "$CommandName not found"
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

function Assert-RootIndexIntegrity {
    param([string]$ProjectRoot)

    $indexPath = Join-Path $ProjectRoot 'index.html'
    if (-not (Test-Path -LiteralPath $indexPath)) {
        throw 'index.html not found'
    }

    $raw = Read-Utf8TextStrict -Path $indexPath
    if ($raw -notmatch '<title>[^<]+</title>') {
        throw 'index.html title tag syntax invalid'
    }
    if ($raw -match 'content="[^"\r\n]*/>') {
        throw 'index.html meta quote syntax invalid'
    }
    if ($raw -match "location\.replace\('/member/'\)") {
        throw 'index.html contains emergency member redirect script'
    }
}

function Assert-RedirectsIntegrity {
    param([string]$ProjectRoot)

    $redirectsPath = Join-Path $ProjectRoot '_redirects'
    if (-not (Test-Path -LiteralPath $redirectsPath)) {
        throw '_redirects not found'
    }

    $raw = Read-Utf8TextStrict -Path $redirectsPath
    $first = ($raw -split "`r?`n" | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1)
    if (-not $first) {
        throw '_redirects is empty'
    }
    if ($first -match '<!doctype|<html') {
        throw '_redirects appears to contain html fallback content'
    }
    $requiredPatterns = @(
        'https://www\.everyonepr\.com/\* https://everyonepr\.com/:splat 301!',
        'https://dliver\.co\.kr/review https://everyonepr\.com/review 301!',
        'https://www\.xn--hu1b83js0j45b952a\.com/\* https://everyonepr\.com/:splat 301!',
        'https://xn--hu1b83js0j45b952a\.com/\* https://everyonepr\.com/:splat 301!',
        'https://www\.dliver\.co\.kr/\* https://everyonepr\.com/:splat 301!'
    )
    foreach ($pattern in $requiredPatterns) {
        if ($raw -notmatch $pattern) {
            throw "_redirects required rule missing or altered: $pattern"
        }
    }
}

function Assert-DeployHtmlUtf8 {
    param([Parameter(Mandatory = $true)][string]$DeployDir)

    $htmlFiles = @(Get-ChildItem -LiteralPath $DeployDir -Recurse -File -Filter '*.html')
    foreach ($file in $htmlFiles) {
        [void](Read-Utf8TextStrict -Path $file.FullName)
    }
}

function Get-ForbiddenDeployFiles {
    param([string]$DeployDir)

    return @(Get-ChildItem -LiteralPath $DeployDir -Recurse -Force -File | Where-Object {
        $_.Name -match '^\.(env|env\..+)$' -or
        $_.Name -match '^\.(git|npmrc)' -or
        $_.Extension -in @('.pem', '.key')
    })
}

$loadedFrom = ''
$envMap = [ordered]@{}

if (Test-Path -LiteralPath $windowsSecretFile) {
    $winLines = Get-Content -LiteralPath $windowsSecretFile
    $envMap = Parse-EnvText -Lines $winLines
    if ($envMap.Count -gt 0) {
        $loadedFrom = 'WINDOWS'
    }
}

if (-not $loadedFrom) {
    $wslCmd = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if ($wslCmd) {
        $wslOutput = & wsl.exe sh -lc "test -f '$wslSecretPath' && cat '$wslSecretPath'"
        if ($LASTEXITCODE -eq 0 -and $wslOutput) {
            $envMap = Parse-EnvText -Lines $wslOutput
            if ($envMap.Count -gt 0) {
                New-Item -ItemType Directory -Path $windowsSecretDir -Force | Out-Null
                $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllLines($windowsSecretFile, [string[]]$wslOutput, $utf8NoBom)
                $loadedFrom = 'WSL_FALLBACK'
            }
        }
    }
}

if (-not $loadedFrom) {
    throw "Secret file not found/empty in Windows and WSL fallback: $windowsSecretFile"
}

Load-EnvIntoProcess -Map $envMap

$token = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN', 'Process')
Write-State -Key 'SECRET_SOURCE' -Value $loadedFrom
Write-State -Key 'WINDOWS_SECRET_FILE' -Value ($(if (Test-Path -LiteralPath $windowsSecretFile) { 'SET' } else { 'EMPTY' }))
Write-State -Key 'CLOUDFLARE_API_TOKEN' -Value ($(if ([string]::IsNullOrWhiteSpace($token)) { 'EMPTY' } else { 'SET' }))

if ([string]::IsNullOrWhiteSpace($token)) {
    throw 'CLOUDFLARE_API_TOKEN is missing or empty'
}

$verifyHeaders = @{ Authorization = "Bearer $token" }
$verifyOk = $false

try {
    $verifyResponse = Invoke-RestMethod -Method Get -Uri 'https://api.cloudflare.com/client/v4/user/tokens/verify' -Headers $verifyHeaders
    if ($verifyResponse -and $verifyResponse.success -eq $true) { $verifyOk = $true }
}
catch {
    $verifyOk = $false
}

if (-not $verifyOk) {
    $accountId = [Environment]::GetEnvironmentVariable('CF_ACCOUNT_ID', 'Process')
    if (-not [string]::IsNullOrWhiteSpace($accountId)) {
        try {
            $accVerify = Invoke-RestMethod -Method Get -Uri "https://api.cloudflare.com/client/v4/accounts/$accountId/tokens/verify" -Headers $verifyHeaders
            if ($accVerify -and $accVerify.success -eq $true) { $verifyOk = $true }
        }
        catch {
            $verifyOk = $false
        }
    }
}

Write-State -Key 'TOKEN_VERIFY' -Value ($(if ($verifyOk) { 'SET' } else { 'EMPTY' }))
if (-not $verifyOk) {
    throw 'Cloudflare token verify failed (user/account verify failed)'
}

$nodeDir = 'C:\Program Files\nodejs'
$nodeExePath = Resolve-NodeTool -CommandName 'node' -FallbackPath (Join-Path $nodeDir 'node.exe')
$npmPath = Resolve-NodeTool -CommandName 'npm' -FallbackPath (Join-Path $nodeDir 'npm.cmd')
$resolvedNodeDir = Split-Path -Parent $nodeExePath
$currentPath = [Environment]::GetEnvironmentVariable('Path', 'Process')
if ($currentPath -notlike "*$resolvedNodeDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$resolvedNodeDir;$currentPath", 'Process')
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Process')
}

Push-Location $projectRoot
$deployDir = Join-Path ([System.IO.Path]::GetTempPath()) ('dliver-pages-deploy-' + (Get-Date -Format 'yyyyMMddHHmmss'))
try {
    Assert-RootIndexIntegrity -ProjectRoot $projectRoot
    Assert-RedirectsIntegrity -ProjectRoot $projectRoot
    Write-State -Key 'STATIC_GUARD' -Value 'SET'

    $wranglerJsPath = Join-Path $projectRoot 'node_modules\wrangler\bin\wrangler.js'
    $needsInstall = -not (Test-Path -LiteralPath $wranglerJsPath)

    $rootLock = Join-Path $projectRoot 'package-lock.json'
    $nmLock = Join-Path $projectRoot 'node_modules\.package-lock.json'
    if (-not $needsInstall -and (Test-Path -LiteralPath $rootLock) -and (Test-Path -LiteralPath $nmLock)) {
        $needsInstall = (Get-Item -LiteralPath $rootLock).LastWriteTimeUtc -gt (Get-Item -LiteralPath $nmLock).LastWriteTimeUtc
    }

    if ($needsInstall) {
        & $npmPath ci --ignore-scripts --prefer-offline --no-audit --fund=false
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed with code $LASTEXITCODE"
        }
        $wranglerJsPath = Join-Path $projectRoot 'node_modules\wrangler\bin\wrangler.js'
    }

    if (-not (Test-Path -LiteralPath $wranglerJsPath)) {
        throw 'wrangler js not found after dependency check'
    }

    New-Item -ItemType Directory -Path $deployDir -Force | Out-Null

    $copyItems = @(
        'index.html',
        'landing-root.html',
        '_headers',
        '_redirects',
        'robots.txt',
        'rss.xml',
        'sitemap.xml',
        'google84463d2bf409df69.html',
        'b09eda93-01a2-4155-abab-1d6b64bc3519.txt',
        'about',
        'assets',
        'compare',
        'guides',
        'insights',
        'pricing',
        'services',
        'functions'
    )

    $serviceCodeDir = Get-ChildItem -LiteralPath $projectRoot -Directory | Where-Object { $_.Name -like '01_*ServiceCode' } | Select-Object -First 1

    foreach ($item in $copyItems) {
        $src = Join-Path $projectRoot $item
        if (Test-Path -LiteralPath $src) {
            Copy-Item -LiteralPath $src -Destination $deployDir -Recurse -Force
        }
    }

    if ($serviceCodeDir) {
        $serviceDest = Join-Path $deployDir $serviceCodeDir.Name
        New-Item -ItemType Directory -Path $serviceDest -Force | Out-Null
        Get-ChildItem -LiteralPath $serviceCodeDir.FullName -Force | Where-Object {
            $_.Name -notmatch '^\.(env|env\..+)$'
        } | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $serviceDest -Recurse -Force
        }
    }

    # Remove local scratch/backup files from the deploy bundle.
    $artifactCandidates = @(Get-ChildItem -LiteralPath $deployDir -Recurse -Force -File | Where-Object {
        $_.Name -match '\.bak($|[._-])' -or $_.Name -match '\.orig$' -or $_.Name -match '\.tmp$' -or $_.Name -match '~$'
    })
    foreach ($artifact in $artifactCandidates) {
        Remove-Item -LiteralPath $artifact.FullName -Force -ErrorAction SilentlyContinue
    }

    $forbidden = @(Get-ForbiddenDeployFiles -DeployDir $deployDir)
    if ($forbidden.Count -gt 0) {
        foreach ($file in $forbidden) {
            Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
        }
    }

    $forbiddenAfter = @(Get-ForbiddenDeployFiles -DeployDir $deployDir)
    Write-State -Key 'SENSITIVE_FILES_BLOCKED' -Value ($(if ($forbiddenAfter.Count -eq 0) { 'SET' } else { 'EMPTY' }))
    if ($forbiddenAfter.Count -gt 0) {
        throw 'forbidden secret files detected in deploy bundle'
    }

    # Emergency cache-key overwrite: publish harmless placeholders at old secret-like URLs.
    $utf8NoBomLocal = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $deployDir '.env'), "# intentionally blank`n", $utf8NoBomLocal)
    if ($serviceCodeDir) {
        $serviceDest = Join-Path $deployDir $serviceCodeDir.Name
        [System.IO.File]::WriteAllText((Join-Path $serviceDest '.env.cloudflare'), "# intentionally blank`n", $utf8NoBomLocal)
    }
    Write-State -Key 'ENV_PLACEHOLDER' -Value 'SET'

    Assert-DeployHtmlUtf8 -DeployDir $deployDir
    Write-State -Key 'HTML_UTF8_GUARD' -Value 'SET'
    Write-State -Key 'DEPLOY_DIR_READY' -Value 'SET'

    $deployArgs = @('pages', 'deploy', $deployDir, '--project-name', 'dliver')
    if (-not [string]::IsNullOrWhiteSpace($Branch)) {
        $deployArgs += @('--branch', $Branch)
    }
    & $nodeExePath $wranglerJsPath @deployArgs
    if ($LASTEXITCODE -ne 0) {
        throw "wrangler deploy failed with code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
    if (Test-Path -LiteralPath $deployDir) {
        Remove-Item -LiteralPath $deployDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'deliver-common.ps1')

$projectRoot = Get-ProjectRoot -ScriptRoot $PSScriptRoot
$serviceRoot = Get-ChildItem -LiteralPath $projectRoot -Directory | Where-Object { $_.Name -like '*-ServiceCode' } | Select-Object -First 1
if (-not $serviceRoot) {
    throw 'ServiceCode directory not found.'
}

$landingDir = Get-ChildItem -LiteralPath $serviceRoot.FullName -Directory | Where-Object { $_.Name -like '*-LandingPage' } | Select-Object -First 1
$adminDir = Get-ChildItem -LiteralPath $serviceRoot.FullName -Directory | Where-Object { $_.Name -like '*-AdminPage' } | Select-Object -First 1
$memberDir = Get-ChildItem -LiteralPath $serviceRoot.FullName -Directory | Where-Object { $_.Name -like '*-MemberPortal' } | Select-Object -First 1

if (-not $landingDir -or -not $adminDir -or -not $memberDir) {
    throw 'Landing/Admin/Member directories not found.'
}

$landingPath = Join-Path $landingDir.FullName 'index.html'
$adminPath = Join-Path $adminDir.FullName 'index.html'
$memberPath = Join-Path $memberDir.FullName 'index.html'

function To-FileUrl {
    param([string]$Path)
    $uri = New-Object System.Uri($Path)
    return $uri.AbsoluteUri
}

Write-Host '[PREVIEW] verification paths'
Write-Host '[PREVIEW] prod root (self-order): https://dliver.co.kr/'
Write-Host '[PREVIEW] prod review: https://everyonepr.com/review'
Write-Host '[PREVIEW] prod admin: https://admin.dliver.co.kr/'
Write-Host '[PREVIEW] prod api: https://api.dliver.co.kr/'
Write-Host '[PREVIEW] staging: https://staging.dliver.co.kr/'
Write-Host '[PREVIEW] staging api: https://staging-api.dliver.co.kr/'
Write-Host '[PREVIEW] dev: https://dev.dliver.co.kr/'
Write-Host '[PREVIEW] dev api: https://dev-api.dliver.co.kr/'
Write-Host "[PREVIEW] landing path: $landingPath"
Write-Host "[PREVIEW] landing file URL: $(To-FileUrl -Path $landingPath)"
Write-Host "[PREVIEW] admin path: $adminPath"
Write-Host "[PREVIEW] admin file URL: $(To-FileUrl -Path $adminPath)"
Write-Host "[PREVIEW] member path: $memberPath"
Write-Host "[PREVIEW] member file URL: $(To-FileUrl -Path $memberPath)"
Write-Host "[PREVIEW] local landing file URL example: http://localhost:4173/$($serviceRoot.Name)/$($landingDir.Name)/index.html"
Write-Host '[PREVIEW] production rewrite check: / -> landing, /review -> root review page, /self-order -> /'
Write-Host '[PREVIEW] local server command: python -m http.server 4173'

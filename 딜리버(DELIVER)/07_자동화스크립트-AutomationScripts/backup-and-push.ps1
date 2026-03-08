param(
    [switch]$Push
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'deliver-common.ps1')

Assert-Command -Name git

$repoRoot = Get-ProjectRoot -ScriptRoot $PSScriptRoot
$backupDir = Join-Path $repoRoot '05_로컬백업-LocalBackup'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archivePath = Join-Path $backupDir "deliver-site-$timestamp.zip"

New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("deliver-site-$timestamp")
if (Test-Path -LiteralPath $tempDir) {
    Remove-Item -Recurse -Force -LiteralPath $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

Get-ChildItem -LiteralPath $repoRoot -Force | Where-Object {
    $_.Name -notin @('.git', '05_로컬백업-LocalBackup')
} | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $tempDir -Recurse -Force
}

Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $archivePath -Force
Remove-Item -Recurse -Force -LiteralPath $tempDir

Write-Host "[OK] Local backup created: $archivePath"
Write-Host '[INFO] Git remote status'
& git -C $repoRoot remote -v

if ($Push.IsPresent) {
    $currentBranch = (& git -C $repoRoot branch --show-current).Trim()
    if ([string]::IsNullOrWhiteSpace($currentBranch)) {
        throw '[ERROR] Unable to determine current branch (detached HEAD or unknown branch). Aborting push.'
    }

    & git -C $repoRoot add -A
    & git -C $repoRoot diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host '[INFO] No staged changes to commit.'
        exit 0
    }

    & git -C $repoRoot commit -m "chore: backup snapshot $timestamp"
    & git -C $repoRoot push origin $currentBranch
    Write-Host "[OK] Pushed to origin/$currentBranch"
} else {
    Write-Host '[INFO] Push skipped. Use -Push to commit and push.'
}

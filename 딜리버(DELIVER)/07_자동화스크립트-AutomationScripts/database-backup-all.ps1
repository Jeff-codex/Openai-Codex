param(
    [switch]$Soft
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'deliver-common.ps1')

Assert-Command -Name node

$projectRoot = Get-ProjectRoot -ScriptRoot $PSScriptRoot
$dbBackupRoot = Join-Path $projectRoot '08_데이터베이스-Database\04_백업-Backups'
$snapshotScript = Join-Path $PSScriptRoot 'cloudflare_d1_snapshot.mjs'
$optimizeScript = Join-Path $PSScriptRoot 'optimize-storage.ps1'

try {
    & node $snapshotScript
    if ($LASTEXITCODE -ne 0) {
        throw 'Snapshot script failed.'
    }
} catch {
    if ($Soft.IsPresent) {
        Write-Host '[WARN] Database backup failed in soft mode; continuing.'
        exit 0
    }
    throw
}

$latestSnapshot = Get-ChildItem -LiteralPath $dbBackupRoot -Directory -Filter 'snapshot-*' |
    Sort-Object Name |
    Select-Object -Last 1

if (-not $latestSnapshot) {
    if ($Soft.IsPresent) {
        Write-Host '[WARN] Snapshot directory not found after backup; soft mode continue.'
        exit 0
    }
    throw 'Snapshot directory not found after backup.'
}

$snapshotSuffix = $latestSnapshot.Name.Substring('snapshot-'.Length)
$archivePath = Join-Path $dbBackupRoot "db-snapshot-$snapshotSuffix.zip"

if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}
Compress-Archive -Path (Join-Path $latestSnapshot.FullName '*') -DestinationPath $archivePath -Force
Remove-Item -LiteralPath $latestSnapshot.FullName -Recurse -Force

Write-Host "[OK] Database backup archive: $archivePath"
& powershell -NoProfile -ExecutionPolicy Bypass -File $optimizeScript

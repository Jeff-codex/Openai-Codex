param(
    [int]$KeepLocal = 12,
    [int]$KeepDb = 12,
    [int]$KeepSyncLog = 40
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'deliver-common.ps1')

$projectRoot = Get-ProjectRoot -ScriptRoot $PSScriptRoot
$localBackupDir = Join-Path $projectRoot '05_로컬백업-LocalBackup'
$dbBackupDir = Join-Path $projectRoot '08_데이터베이스-Database\04_백업-Backups'
$syncLogDir = Join-Path $projectRoot '08_데이터베이스-Database\03_동기화로그-SyncLogs'

function Remove-OldFiles {
    param(
        [string]$Directory,
        [string[]]$Patterns,
        [int]$Keep
    )

    if (-not (Test-Path -LiteralPath $Directory)) {
        return
    }

    $files = @()
    foreach ($pattern in $Patterns) {
        $files += Get-ChildItem -LiteralPath $Directory -File -Filter $pattern -ErrorAction SilentlyContinue
    }

    $ordered = @($files | Sort-Object LastWriteTime -Descending)
    if (-not $ordered -or $ordered.Count -le $Keep) {
        return
    }

    $ordered | Select-Object -Skip $Keep | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force
    }
}

Remove-OldFiles -Directory $localBackupDir -Patterns @('deliver-site-*.zip', 'deliver-site-*.tar.gz') -Keep $KeepLocal
Remove-OldFiles -Directory $dbBackupDir -Patterns @('db-snapshot-*.zip', 'db-snapshot-*.tar.gz') -Keep $KeepDb
Remove-OldFiles -Directory $syncLogDir -Patterns @('*.json') -Keep $KeepSyncLog

Write-Host "[OK] Storage optimized (local=$KeepLocal, db=$KeepDb, sync_log=$KeepSyncLog)"

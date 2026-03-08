Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'deliver-common.ps1')

Assert-Command -Name git

$projectRoot = Get-ProjectRoot -ScriptRoot $PSScriptRoot
$repoRoot = (& git -C $projectRoot rev-parse --show-toplevel).Trim()
$projectDocsDir = Get-ChildItem -LiteralPath $projectRoot -Directory | Where-Object { $_.Name -like '*-ProjectDocs' } | Select-Object -First 1
$databaseDir = Get-ChildItem -LiteralPath $projectRoot -Directory | Where-Object { $_.Name -like '*-Database' } | Select-Object -First 1

$journalPath = $null
if ($projectDocsDir) {
    $journalFile = Get-ChildItem -LiteralPath $projectDocsDir.FullName -File | Where-Object { $_.Name -like '*DevelopmentJournal.md' } | Select-Object -First 1
    if ($journalFile) {
        $journalPath = $journalFile.FullName
    }
}

$dbBackupDir = $null
if ($databaseDir) {
    $backupDir = Get-ChildItem -LiteralPath $databaseDir.FullName -Directory | Where-Object { $_.Name -like '04_*Backups' } | Select-Object -First 1
    if ($backupDir) {
        $dbBackupDir = $backupDir.FullName
    }
}

Write-Host "[DELIVER] project root: $projectRoot"
Write-Host "[DELIVER] current time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')"
Write-Host "[DELIVER] current branch: $((& git -C $repoRoot branch --show-current).Trim())"
Write-Host '[DELIVER] recent commits:'
& git -C $repoRoot log --oneline --max-count=3

Write-Host '[DELIVER] git status:'
& git -c core.quotePath=false -C $repoRoot status --short -- $projectRoot

Write-Host '[DELIVER] latest db backup:'
if ($dbBackupDir) {
    $latestBackup = Get-ChildItem -LiteralPath $dbBackupDir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'db-snapshot-*' } |
        Sort-Object Name |
        Select-Object -Last 1
    if ($latestBackup) {
        Write-Host $latestBackup.FullName
    } else {
        Write-Host '(db backup not found)'
    }
} else {
    Write-Host '(db backup directory not found)'
}

Write-Host '[DELIVER] latest journal tail:'
if ($journalPath -and (Test-Path -LiteralPath $journalPath)) {
    Get-Content -LiteralPath $journalPath | Select-Object -Last 18
} else {
    Write-Host '(journal not found)'
}

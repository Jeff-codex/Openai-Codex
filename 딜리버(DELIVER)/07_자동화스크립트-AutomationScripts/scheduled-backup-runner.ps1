param(
    [switch]$Soft,
    [string]$SecretsFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'deliver-common.ps1')

$projectRoot = Get-ProjectRoot -ScriptRoot $PSScriptRoot
if (-not $SecretsFile) {
    $SecretsFile = Join-Path $HOME '.deliver-secrets\.env.cloudflare.local'
}

$backupScript = Join-Path $PSScriptRoot 'database-backup-all.ps1'
$logDir = Join-Path $projectRoot '06_운영로그-OpsLogs\backup-schedule'
$lockDir = Join-Path $projectRoot '.backup-schedule.lock'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = Join-Path $logDir "backup-$stamp.log"

if (Test-Path -LiteralPath $SecretsFile) {
    [void](Import-EnvFile -Path $SecretsFile)
}

if (-not (New-Item -ItemType Directory -Path $lockDir -ErrorAction SilentlyContinue)) {
    Write-Host "[WARN] Scheduled backup already running. lock=$lockDir"
    exit 0
}

try {
    "[INFO] scheduled backup start: $(Get-Date -Format s)" | Out-File -FilePath $logFile -Encoding utf8 -Append
    "[INFO] project root: $projectRoot" | Out-File -FilePath $logFile -Encoding utf8 -Append

    if ($Soft.IsPresent) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript -Soft *>> $logFile
    } else {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript *>> $logFile
    }

    "[INFO] scheduled backup done: $(Get-Date -Format s)" | Out-File -FilePath $logFile -Encoding utf8 -Append
    Write-Host "[OK] Scheduled backup completed: $logFile"
} finally {
    if (Test-Path -LiteralPath $lockDir) {
        Remove-Item -LiteralPath $lockDir -Recurse -Force
    }
}

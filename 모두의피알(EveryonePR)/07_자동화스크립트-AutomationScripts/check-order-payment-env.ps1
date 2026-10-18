param(
    [string]$ServiceEnvFile,
    [string]$SecretsFile,
    [switch]$RequireTossLive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'deliver-common.ps1')

$projectRoot = Get-ProjectRoot -ScriptRoot $PSScriptRoot
if (-not $ServiceEnvFile) {
    $ServiceEnvFile = Join-Path $projectRoot '01_서비스코드-ServiceCode\.env.cloudflare'
}
if (-not $SecretsFile) {
    $SecretsFile = Join-Path $HOME '.deliver-secrets\.env.cloudflare.local'
}

if (Import-EnvFile -Path $ServiceEnvFile) {
    Write-Host "[INFO] loaded: $ServiceEnvFile"
} else {
    Write-Host "[WARN] not found: $ServiceEnvFile"
}

if (Import-EnvFile -Path $SecretsFile) {
    Write-Host "[INFO] loaded: $SecretsFile"
} else {
    Write-Host "[WARN] not found: $SecretsFile"
}

function Test-RequiredKeys {
    param(
        [string]$Group,
        [string[]]$Keys
    )

    $failed = $false
    foreach ($key in $Keys) {
        $value = [System.Environment]::GetEnvironmentVariable($key)
        if ([string]::IsNullOrWhiteSpace($value)) {
            Write-Host "[FAIL] $Group missing: $key"
            $failed = $true
        } else {
            Write-Host "[PASS] $Group present: $key"
        }
    }

    return (-not $failed)
}

function Test-OptionalKeys {
    param(
        [string]$Group,
        [string[]]$Keys
    )

    foreach ($key in $Keys) {
        $value = [System.Environment]::GetEnvironmentVariable($key)
        if ([string]::IsNullOrWhiteSpace($value)) {
            Write-Host "[WARN] $Group missing (optional): $key"
        } else {
            Write-Host "[PASS] $Group present: $key"
        }
    }
}

$baseKeys = @('PASSWORD_PEPPER')
$optionalKeys = @('MEMBER_PORTAL_URL')
$tossKeys = @('TOSS_CLIENT_KEY', 'TOSS_SECRET_KEY', 'TOSS_SUCCESS_URL', 'TOSS_FAIL_URL')
$cloudflareKeys = @('CLOUDFLARE_API_TOKEN', 'CF_ACCOUNT_ID', 'CF_PAGES_PROJECT', 'CF_D1_DATABASE_NAME')
$cloudflareOptionalKeys = @('CF_R2_BUCKET')
$opsTelegramKeys = @('OPS_ALERT_TELEGRAM_BOT_TOKEN', 'OPS_ALERT_TELEGRAM_CHAT_ID')
$opsTelegramOptional = @('OPS_ALERT_TELEGRAM_ENABLED', 'OPS_ALERT_TIMEOUT_MS')

Write-Host '[INFO] validating order-payment required keys'
if (-not (Test-RequiredKeys -Group 'order-payment' -Keys $baseKeys)) {
    throw '[ERROR] order-payment required keys check failed'
}

Write-Host '[INFO] validating order-payment optional keys'
Test-OptionalKeys -Group 'order-payment' -Keys $optionalKeys

if ($RequireTossLive.IsPresent) {
    Write-Host '[INFO] validating toss live keys (required)'
    if (-not (Test-RequiredKeys -Group 'order-payment:toss-live' -Keys $tossKeys)) {
        throw '[ERROR] toss live keys check failed'
    }
} else {
    Write-Host '[INFO] validating toss keys (pre-integration mode: optional)'
    Test-OptionalKeys -Group 'order-payment:toss-preintegration' -Keys $tossKeys
}

Write-Host '[INFO] validating cloudflare required keys'
if (-not (Test-RequiredKeys -Group 'cloudflare' -Keys $cloudflareKeys)) {
    throw '[ERROR] cloudflare required keys check failed'
}

Write-Host '[INFO] validating cloudflare optional keys'
Test-OptionalKeys -Group 'cloudflare' -Keys $cloudflareOptionalKeys

$opsEnabledRaw = [System.Environment]::GetEnvironmentVariable('OPS_ALERT_TELEGRAM_ENABLED')
if (Test-Enabled -Value $opsEnabledRaw) {
    Write-Host '[INFO] telegram alert enabled: required keys'
    if (-not (Test-RequiredKeys -Group 'ops-alert:telegram' -Keys $opsTelegramKeys)) {
        throw '[ERROR] ops telegram alert keys check failed'
    }
} else {
    Write-Host '[INFO] telegram alert disabled: optional keys'
    Test-OptionalKeys -Group 'ops-alert:telegram' -Keys $opsTelegramKeys
}

Test-OptionalKeys -Group 'ops-alert:telegram' -Keys $opsTelegramOptional
Write-Host '[DONE] required env keys are ready'

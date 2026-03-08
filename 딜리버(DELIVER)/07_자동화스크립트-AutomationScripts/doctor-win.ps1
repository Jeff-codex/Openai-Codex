Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$windowsSecretFile = 'C:\Users\gusru\.deliver-secrets\.env.cloudflare.local'

function Write-State {
    param([string]$Level, [string]$Message)
    Write-Host "[$Level] $Message"
}

$failed = $false
$isWindowsPlatform = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
if (-not $isWindowsPlatform) {
    Write-State -Level 'FAIL' -Message 'Windows 환경이 아닙니다. Windows Codex에서 실행하세요.'
    exit 1
}

Write-State -Level 'PASS' -Message 'platform=Windows'

$nodePath = 'C:\Program Files\nodejs\node.exe'
$npmPath = 'C:\Program Files\nodejs\npm.cmd'
$nodeReady = (Get-Command node -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath $nodePath)
$npmReady = (Get-Command npm -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath $npmPath)
if ($nodeReady -and $npmReady) {
    Write-State -Level 'PASS' -Message 'node/npm command available'
}
else {
    Write-State -Level 'FAIL' -Message 'node 또는 npm 명령을 찾을 수 없습니다.'
    $failed = $true
}

$tokenSet = 'EMPTY'
if (Test-Path -LiteralPath $windowsSecretFile) {
    $line = Select-String -Path $windowsSecretFile -Pattern '^\s*CLOUDFLARE_API_TOKEN\s*=.+' -SimpleMatch:$false -ErrorAction SilentlyContinue
    if ($line) { $tokenSet = 'SET' }
}
Write-State -Level 'PASS' -Message "CLOUDFLARE_API_TOKEN=$tokenSet"
if ($tokenSet -eq 'EMPTY') {
    Write-State -Level 'FAIL' -Message '비밀 파일에 CLOUDFLARE_API_TOKEN 키가 없습니다.'
    $failed = $true
}

$requiredPaths = @(
    (Join-Path $PSScriptRoot 'deploy-pages-windows.ps1'),
    (Join-Path $projectRoot 'functions'),
    (Join-Path $projectRoot 'index.html'),
    (Join-Path $projectRoot '_headers'),
    (Join-Path $projectRoot '_redirects')
)

foreach ($full in $requiredPaths) {
    if (Test-Path -LiteralPath $full) {
        Write-State -Level 'PASS' -Message "$full exists"
    }
    else {
        Write-State -Level 'FAIL' -Message "$full missing"
        $failed = $true
    }
}

$windowsWorkerd = Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/@cloudflare/workerd-windows-64')
$linuxHints = @(
    'node_modules/@cloudflare/workerd-linux-64',
    'node_modules/@cloudflare/workerd-darwin-64',
    'node_modules/@cloudflare/workerd-darwin-arm64'
) | Where-Object { Test-Path -LiteralPath (Join-Path $projectRoot $_) }
$linuxHints = @($linuxHints)

if (-not $windowsWorkerd) {
    Write-State -Level 'WARN' -Message 'workerd-windows-64 패키지가 없습니다. npm ci 필요할 수 있습니다.'
}
else {
    Write-State -Level 'PASS' -Message 'workerd-windows-64 detected'
}

if ($linuxHints.Count -gt 0) {
    Write-State -Level 'WARN' -Message 'node_modules 내 비Windows 바이너리 흔적이 있습니다. 필요 시 npm ci 재실행 권장'
}
else {
    Write-State -Level 'PASS' -Message 'node_modules platform mismatch not detected'
}

if ($failed) {
    Write-State -Level 'FAIL' -Message 'doctor:win checks failed'
    exit 1
}

Write-State -Level 'PASS' -Message 'doctor:win checks passed'
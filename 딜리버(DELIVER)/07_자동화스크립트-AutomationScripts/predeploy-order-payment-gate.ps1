param(
    [switch]$SkipRemote,
    [switch]$RequireTossLive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'deliver-common.ps1')

Assert-Command -Name node

$projectRoot = Get-ProjectRoot -ScriptRoot $PSScriptRoot
$checkEnvScript = Join-Path $PSScriptRoot 'check-order-payment-env.ps1'

Write-Host ''
Write-Host '[STEP] order-payment required env keys'
if ($RequireTossLive.IsPresent) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $checkEnvScript -RequireTossLive
} else {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $checkEnvScript
}
if ($LASTEXITCODE -ne 0) {
    throw 'env key validation failed'
}

Write-Host ''
Write-Host '[STEP] javascript syntax check'
$targets = @(
(Join-Path $projectRoot 'functions')
(Join-Path $projectRoot '01_서비스코드-ServiceCode')
(Join-Path $projectRoot '07_자동화스크립트-AutomationScripts')
)
$jsFiles = foreach ($target in $targets) {
    if (Test-Path -LiteralPath $target) {
        Get-ChildItem -LiteralPath $target -Recurse -File | Where-Object { $_.Extension -in '.js', '.mjs' }
    }
}
$jsFiles = $jsFiles | Sort-Object FullName -Unique
if (-not $jsFiles -or $jsFiles.Count -eq 0) {
    throw 'no js/mjs files found'
}
foreach ($file in $jsFiles) {
    & node --check $file.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "syntax check failed: $($file.FullName)"
    }
}
Write-Host "[INFO] syntax checked files: $($jsFiles.Count)"

Write-Host ''
Write-Host '[STEP] nul-byte corruption scan'
$textExt = @('.js', '.mjs', '.html', '.css', '.md', '.sql', '.sh', '.ps1', '.txt', '.log')
$issues = @()
Get-ChildItem -LiteralPath $projectRoot -Recurse -File | ForEach-Object {
    if ($textExt -contains $_.Extension.ToLowerInvariant()) {
        $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
        $nulCount = 0
        foreach ($b in $bytes) {
            if ($b -eq 0) { $nulCount++ }
        }
        if ($nulCount -gt 0) {
            $issues += "[FAIL] NUL found: $($_.FullName) (nul=$nulCount, size=$($bytes.Length))"
        }
    }
}
if ($issues.Count -gt 0) {
    $issues | ForEach-Object { Write-Host $_ }
    throw 'nul-byte corruption detected'
}
Write-Host '[PASS] no nul-byte corruption detected'

Write-Host ''
Write-Host '[STEP] migration sql integrity'
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    Write-Host '[WARN] python not found: skipping sqlite dry-run check'
} else {
    $script = @"
import sqlite3
from pathlib import Path
root = Path(r'''$projectRoot''')
mig = root / '08_데이터베이스-Database' / '01_마이그레이션-Migrations'
sql3 = (mig / '003_init_d1_schema.sql').read_text(encoding='utf-8')
sql4 = (mig / '004_review_engine_schema.sql').read_text(encoding='utf-8')
sql5 = (mig / '005_order_payment_system.sql').read_text(encoding='utf-8')
sql7 = (mig / '007_media_channels_pricing_v2.sql').read_text(encoding='utf-8')
con = sqlite3.connect(':memory:')
con.executescript(sql3)
con.executescript(sql4)
con.executescript(sql5)
con.executescript(sql7)
cur = con.cursor()
cur.execute("select name from sqlite_master where type='table' and name in ('order_payment_intents','order_payments','payment_refunds','order_number_sequences') order by name")
found = [r[0] for r in cur.fetchall()]
required = ['order_payment_intents','order_payments','payment_refunds','order_number_sequences']
missing_tables = [t for t in required if t not in found]
cur.execute('pragma table_info(orders)')
cols = {r[1] for r in cur.fetchall()}
required_cols = {'order_number','ordered_at','payment_status','payment_total_amount','payment_vat_amount','payment_supply_amount'}
missing_cols = sorted(required_cols - cols)
cur.execute('pragma table_info(media_channels)')
media_cols = {r[1] for r in cur.fetchall()}
required_media_cols = {'category_detail','supply_price','sale_price'}
missing_media_cols = sorted(required_media_cols - media_cols)
cur.execute("select count(*) from sqlite_master where type='index' and name='idx_media_channels_sale_price'")
has_sale_price_index = cur.fetchone()[0] == 1
if missing_tables or missing_cols or missing_media_cols or not has_sale_price_index:
    if missing_tables:
        print(f'[FAIL] missing tables: {missing_tables}')
    if missing_cols:
        print(f'[FAIL] missing columns: {missing_cols}')
    if missing_media_cols:
        print(f'[FAIL] missing media_channels columns (007): {missing_media_cols}')
    if not has_sale_price_index:
        print('[FAIL] missing index (007): idx_media_channels_sale_price')
    raise SystemExit(1)
print('[PASS] migration sql applied successfully in sqlite memory (003/004/005/007)')
"@
    $tempPy = Join-Path ([System.IO.Path]::GetTempPath()) 'deliver_migration_check.py'
    Set-Content -LiteralPath $tempPy -Value $script -Encoding utf8
    & python $tempPy
    Remove-Item -LiteralPath $tempPy -Force
    if ($LASTEXITCODE -ne 0) {
        throw 'migration sql integrity failed'
    }
}

if ($SkipRemote.IsPresent) {
    Write-Host ''
    Write-Host '[SKIP] remote security smoke check (use security_smoke_check.sh manually if needed)'
} else {
    Write-Host ''
    Write-Host '[INFO] remote security smoke check is still shell-only: run security_smoke_check.sh manually'
}

Write-Host ''
Write-Host '[DONE] predeploy gate passed'


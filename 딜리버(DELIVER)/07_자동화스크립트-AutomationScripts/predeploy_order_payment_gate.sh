#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_REMOTE=0
REQUIRE_TOSS_LIVE=0

for arg in "$@"; do
  case "$arg" in
    --skip-remote) SKIP_REMOTE=1 ;;
    --require-toss-live) REQUIRE_TOSS_LIVE=1 ;;
    *)
      echo "[ERROR] unknown option: $arg"
      echo "usage: $0 [--skip-remote] [--require-toss-live]"
      exit 2
      ;;
  esac
done

step() {
  echo
  echo "[STEP] $1"
}

step "order-payment required env keys"
REQUIRE_TOSS_LIVE="$REQUIRE_TOSS_LIVE" "$PROJECT_ROOT/07_자동화스크립트-AutomationScripts/check_order_payment_env.sh"

step "javascript syntax check"
count=0
while IFS= read -r file; do
  count=$((count + 1))
  node --check "$file" >/dev/null
  echo "[PASS] syntax: $file"
done < <(find "$PROJECT_ROOT/functions" "$PROJECT_ROOT/01_서비스코드-ServiceCode" "$PROJECT_ROOT/07_자동화스크립트-AutomationScripts" -type f \( -name '*.js' -o -name '*.mjs' \) | sort)
if [[ "$count" -eq 0 ]]; then
  echo "[FAIL] no js/mjs files found"
  exit 1
fi

echo "[INFO] syntax checked files: $count"

step "nul-byte corruption scan"
python3 - "$PROJECT_ROOT" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
exts = {".js", ".mjs", ".html", ".css", ".md", ".sql", ".sh", ".txt", ".log"}
issues = []
for p in root.rglob("*"):
    if not p.is_file() or p.suffix.lower() not in exts:
        continue
    b = p.read_bytes()
    cnt = b.count(0)
    if cnt:
        issues.append((p, cnt, len(b)))

if issues:
    for p, cnt, size in issues:
        print(f"[FAIL] NUL found: {p} (nul={cnt}, size={size})")
    sys.exit(1)
print("[PASS] no nul-byte corruption detected")
PY

step "migration sql integrity"
python3 - "$PROJECT_ROOT" <<'PY'
import sqlite3
import sys
from pathlib import Path

root = Path(sys.argv[1])
mig = root / "08_데이터베이스-Database" / "01_마이그레이션-Migrations"
sql3 = (mig / "003_init_d1_schema.sql").read_text(encoding="utf-8")
sql4 = (mig / "004_review_engine_schema.sql").read_text(encoding="utf-8")
sql5 = (mig / "005_order_payment_system.sql").read_text(encoding="utf-8")

con = sqlite3.connect(":memory:")
try:
    con.executescript(sql3)
    con.executescript(sql4)
    con.executescript(sql5)
    cur = con.cursor()
    cur.execute("select name from sqlite_master where type='table' and name in ('order_payment_intents','order_payments','payment_refunds','order_number_sequences') order by name")
    found = [r[0] for r in cur.fetchall()]
    required = ['order_payment_intents', 'order_payments', 'payment_refunds', 'order_number_sequences']
    missing_tables = [t for t in required if t not in found]

    cur.execute("pragma table_info(orders)")
    cols = {r[1] for r in cur.fetchall()}
    required_cols = {'order_number', 'ordered_at', 'payment_status', 'payment_total_amount', 'payment_vat_amount', 'payment_supply_amount'}
    missing_cols = sorted(required_cols - cols)

    if missing_tables or missing_cols:
      if missing_tables:
        print(f"[FAIL] missing tables: {missing_tables}")
      if missing_cols:
        print(f"[FAIL] missing columns: {missing_cols}")
      sys.exit(1)

    print("[PASS] migration sql applied successfully in sqlite memory")
finally:
    con.close()
PY

if [[ "$SKIP_REMOTE" -eq 0 ]]; then
  step "remote security smoke check"
  "$PROJECT_ROOT/07_자동화스크립트-AutomationScripts/security_smoke_check.sh"
else
  echo
  echo "[SKIP] remote security smoke check"
fi

echo

echo "[DONE] predeploy gate passed"

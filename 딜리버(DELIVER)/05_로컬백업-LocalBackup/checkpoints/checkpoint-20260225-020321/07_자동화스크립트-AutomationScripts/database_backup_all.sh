#!/usr/bin/env bash
set -euo pipefail

SOFT_MODE="${1:-}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_BACKUP_ROOT="$PROJECT_ROOT/08_데이터베이스-Database/04_백업-Backups"
SNAPSHOT_SCRIPT="$PROJECT_ROOT/07_자동화스크립트-AutomationScripts/cloudflare_d1_snapshot.mjs"
OPTIMIZE_SCRIPT="$PROJECT_ROOT/07_자동화스크립트-AutomationScripts/optimize_storage.sh"

if ! "$SNAPSHOT_SCRIPT"; then
  if [[ "$SOFT_MODE" == "--soft" ]]; then
    echo "[WARN] Database backup failed in soft mode; continuing."
    exit 0
  fi
  exit 1
fi

latest_snapshot="$(find "$DB_BACKUP_ROOT" -maxdepth 1 -type d -name 'snapshot-*' | sort | tail -n 1)"
if [[ -z "$latest_snapshot" ]]; then
  echo "[ERROR] Snapshot directory not found after backup"
  [[ "$SOFT_MODE" == "--soft" ]] && exit 0
  exit 1
fi

archive_path="$DB_BACKUP_ROOT/db-snapshot-$(basename "$latest_snapshot" | sed 's/^snapshot-//').tar.gz"
tar -czf "$archive_path" -C "$DB_BACKUP_ROOT" "$(basename "$latest_snapshot")"
rm -rf "$latest_snapshot"

echo "[OK] Database backup archive: $archive_path"

"$OPTIMIZE_SCRIPT"

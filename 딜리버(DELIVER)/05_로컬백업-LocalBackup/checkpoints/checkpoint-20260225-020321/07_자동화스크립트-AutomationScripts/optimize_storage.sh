#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_BACKUP_DIR="$PROJECT_ROOT/05_로컬백업-LocalBackup"
DB_BACKUP_DIR="$PROJECT_ROOT/08_데이터베이스-Database/04_백업-Backups"
SYNC_LOG_DIR="$PROJECT_ROOT/08_데이터베이스-Database/03_동기화로그-SyncLogs"

KEEP_LOCAL="${KEEP_LOCAL:-12}"
KEEP_DB="${KEEP_DB:-12}"
KEEP_SYNC_LOG="${KEEP_SYNC_LOG:-40}"

prune() {
  local dir="$1"
  local pattern="$2"
  local keep="$3"

  [[ -d "$dir" ]] || return 0

  mapfile -t files < <(find "$dir" -maxdepth 1 -type f -name "$pattern" -printf '%T@ %p\n' | sort -nr | awk '{print $2}')
  local count="${#files[@]}"
  if (( count <= keep )); then
    return 0
  fi

  for ((i=keep; i<count; i++)); do
    rm -f "${files[$i]}"
  done
}

prune "$LOCAL_BACKUP_DIR" 'deliver-site-*.tar.gz' "$KEEP_LOCAL"
prune "$DB_BACKUP_DIR" 'db-snapshot-*.tar.gz' "$KEEP_DB"
prune "$SYNC_LOG_DIR" '*.json' "$KEEP_SYNC_LOG"

echo "[OK] Storage optimized (local=$KEEP_LOCAL, db=$KEEP_DB, sync_log=$KEEP_SYNC_LOG)"

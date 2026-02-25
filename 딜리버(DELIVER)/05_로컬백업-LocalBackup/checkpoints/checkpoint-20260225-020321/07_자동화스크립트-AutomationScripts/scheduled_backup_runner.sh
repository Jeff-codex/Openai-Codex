#!/usr/bin/env bash
set -euo pipefail

SOFT_MODE="${1:-}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_FILE="${SECRETS_FILE:-$HOME/.deliver-secrets/.env.cloudflare.local}"
BACKUP_SCRIPT="$PROJECT_ROOT/07_자동화스크립트-AutomationScripts/database_backup_all.sh"
LOG_DIR="$PROJECT_ROOT/06_운영로그-OpsLogs/backup-schedule"
LOCK_DIR="$PROJECT_ROOT/.backup-schedule.lock"

mkdir -p "$LOG_DIR"
stamp="$(date '+%Y%m%d-%H%M%S')"
log_file="$LOG_DIR/backup-$stamp.log"

if [[ -f "$SECRETS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[WARN] Scheduled backup already running. lock=$LOCK_DIR"
  exit 0
fi
trap 'rmdir "$LOCK_DIR"' EXIT

{
  echo "[INFO] scheduled backup start: $(date -Is)"
  echo "[INFO] project root: $PROJECT_ROOT"
  if [[ "$SOFT_MODE" == "--soft" ]]; then
    "$BACKUP_SCRIPT" --soft
  else
    "$BACKUP_SCRIPT"
  fi
  echo "[INFO] scheduled backup done: $(date -Is)"
} >>"$log_file" 2>&1

echo "[OK] Scheduled backup completed: $log_file"

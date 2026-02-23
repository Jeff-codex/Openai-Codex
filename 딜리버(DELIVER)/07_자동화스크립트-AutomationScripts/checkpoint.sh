#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"stage summary\" [--push]"
  exit 1
fi

SUMMARY="$1"
DO_PUSH="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(git -C "$PROJECT_ROOT" rev-parse --show-toplevel)"
JOURNAL_PATH="$PROJECT_ROOT/03_프로젝트문서-ProjectDocs/개발기록-DevelopmentJournal.md"
BACKUP_SCRIPT="$PROJECT_ROOT/07_자동화스크립트-AutomationScripts/backup_and_push.sh"
TIMESTAMP_KST="$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S KST')"

mkdir -p "$(dirname "$JOURNAL_PATH")"
touch "$JOURNAL_PATH"

CHANGED_FILES="$(
  git -c core.quotePath=false -C "$REPO_ROOT" status --porcelain -- "$PROJECT_ROOT" \
    | sed -E 's/^.. //' \
    | sed 's#^#- #' \
    || true
)"
if [[ -z "$CHANGED_FILES" ]]; then
  CHANGED_FILES='- (no file changes detected in project path)'
fi

cat >> "$JOURNAL_PATH" <<EOT

## $TIMESTAMP_KST
- 단계: $SUMMARY
- 요약: 단계 완료 체크포인트 저장
- 변경 파일:
$CHANGED_FILES
- 다음 작업: 이어서 개발 진행
EOT

echo "[INFO] Journal updated: $JOURNAL_PATH"

"$BACKUP_SCRIPT"

if [[ "$DO_PUSH" == "--push" ]]; then
  git -C "$REPO_ROOT" add "$PROJECT_ROOT"
  if git -C "$REPO_ROOT" diff --cached --quiet; then
    echo "[INFO] No staged changes to commit."
  else
    COMMIT_MSG="chore(checkpoint): $SUMMARY"
    git -C "$REPO_ROOT" commit -m "$COMMIT_MSG"
    git -C "$REPO_ROOT" push origin main
    echo "[OK] Checkpoint pushed: $COMMIT_MSG"
  fi
else
  echo "[INFO] Push skipped. Use --push to sync remote."
fi

#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/mnt/c/Users/gusru/code/Openai-Codex/딜리버(DELIVER)"
REPO_ROOT="$(git -C "$PROJECT_ROOT" rev-parse --show-toplevel)"
JOURNAL_PATH="$PROJECT_ROOT/03_프로젝트문서-ProjectDocs/개발기록-DevelopmentJournal.md"

echo "[딜리버] 프로젝트 경로: $PROJECT_ROOT"
echo "[딜리버] 현재 시간: $(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S KST')"
echo "[딜리버] 현재 브랜치: $(git -C "$REPO_ROOT" branch --show-current)"
echo "[딜리버] 최근 커밋:"
git -C "$REPO_ROOT" log --oneline --max-count=3

echo "[딜리버] 변경 상태:"
git -c core.quotePath=false -C "$REPO_ROOT" status --short -- "$PROJECT_ROOT" || true

echo "[딜리버] 최근 개발 기록:"
if [[ -f "$JOURNAL_PATH" ]]; then
  tail -n 18 "$JOURNAL_PATH"
else
  echo "(개발 기록 파일 없음)"
fi

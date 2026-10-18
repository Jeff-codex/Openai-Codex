#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$REPO_ROOT/05_로컬백업-LocalBackup"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_PATH="$BACKUP_DIR/deliver-site-$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

# Save local snapshot excluding git internals and previous backup archives.
tar \
  --exclude='.git' \
  --exclude='05_로컬백업-LocalBackup/*.tar.gz' \
  -czf "$ARCHIVE_PATH" \
  -C "$REPO_ROOT" .

echo "[OK] Local backup created: $ARCHIVE_PATH"

echo "[INFO] Git remote status"
git -C "$REPO_ROOT" remote -v

if [[ "${1:-}" == "--push" ]]; then
  git -C "$REPO_ROOT" add -A

  if git -C "$REPO_ROOT" diff --cached --quiet; then
    echo "[INFO] No staged changes to commit."
  else
    git -C "$REPO_ROOT" commit -m "chore: backup snapshot $TIMESTAMP"
    git -C "$REPO_ROOT" push origin main
    echo "[OK] Pushed to origin/main"
  fi
else
  echo "[INFO] Push skipped. Use --push to commit and push."
fi

#!/usr/bin/env bash
set -euo pipefail

# Resume the latest Codex session; if none exists, start a new one.
if codex resume --last "$@"; then
  exit 0
fi

exec codex "$@"

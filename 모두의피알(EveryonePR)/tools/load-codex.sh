# LEGACY NOTICE:
# This shell script is retained for WSL/Linux reference only.
# Primary operation is Windows PowerShell scripts under:
# 07_자동화스크립트-AutomationScripts/*.ps1

#!/usr/bin/env bash
set -euo pipefail

# Resume the latest Codex session; if none exists, start a new one.
if codex resume --last "$@"; then
  exit 0
fi

exec codex "$@"

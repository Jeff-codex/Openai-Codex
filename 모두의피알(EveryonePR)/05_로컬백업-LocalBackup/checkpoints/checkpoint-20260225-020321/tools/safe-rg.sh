#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: safe-rg.sh <pattern> [path] [limit]" >&2
  exit 2
fi

pattern="$1"
path="${2:-.}"
limit="${3:-80}"

if ! [[ "$limit" =~ ^[0-9]+$ ]]; then
  echo "Usage: safe-rg.sh <pattern> [path] [limit]" >&2
  exit 2
fi

rg -n --hidden --glob "!.git" "$pattern" "$path" 2>/dev/null | awk -v n="$limit" 'NR<=n { print }'

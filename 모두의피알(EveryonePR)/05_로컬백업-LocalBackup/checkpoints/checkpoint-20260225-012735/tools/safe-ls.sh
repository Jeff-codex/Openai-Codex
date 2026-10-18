#!/usr/bin/env bash
set -euo pipefail

path="${1:-.}"
limit="${2:-30}"

if ! [[ "$limit" =~ ^[0-9]+$ ]]; then
  echo "Usage: safe-ls.sh [path] [limit]" >&2
  exit 2
fi

find "$path" -mindepth 1 -maxdepth 1 -printf "%f\n" 2>/dev/null | sort | awk -v n="$limit" 'NR<=n { print }'

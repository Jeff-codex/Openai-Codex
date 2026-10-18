#!/usr/bin/env bash
set -euo pipefail

path="."
maxdepth="2"
limit="50"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--path)
      path="${2:-}"
      shift 2
      ;;
    -d|--maxdepth)
      maxdepth="${2:-}"
      shift 2
      ;;
    -n|--limit)
      limit="${2:-}"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if ! [[ "$maxdepth" =~ ^[0-9]+$ ]] || ! [[ "$limit" =~ ^[0-9]+$ ]]; then
  echo "Usage: safe-find.sh [-p path] [-d maxdepth] [-n limit] [find predicates...]" >&2
  exit 2
fi

find "$path" -maxdepth "$maxdepth" "$@" 2>/dev/null | awk -v n="$limit" 'NR<=n { print }'

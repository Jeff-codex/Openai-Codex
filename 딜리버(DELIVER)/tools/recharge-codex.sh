#!/usr/bin/env bash
set -euo pipefail

# One-command context rotation:
# 1) Save a handoff note to docs/
# 2) Start a fresh Codex session with instruction to read the handoff

workspace="${1:-/mnt/c/Windows/system32}"
handoff_dir="$workspace/docs"
handoff_file="$handoff_dir/codex-handoff-latest.md"
timestamp="$(date -Iseconds)"

mkdir -p "$handoff_dir"

if [ -t 0 ]; then
  echo "Enter handoff note. End with Ctrl-D:"
fi

note="$(cat || true)"

cat > "$handoff_file" <<EOF
# Codex Handoff

- created_at: $timestamp
- workspace: $workspace

## Note
$note
EOF

exec codex -C "$workspace" "Open and follow $handoff_file first, then continue from that handoff."

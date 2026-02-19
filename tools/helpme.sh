#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
Context-safe helper commands

1) safe-ls [path] [limit]
- Use when you need a short directory listing.
- Example: safe-ls /mnt/c/Windows/system32 20

2) safe-find [-p path] [-d maxdepth] [-n limit] [find predicates...]
- Use when you need to find file paths by condition.
- Example: safe-find -p /mnt/c/Windows/system32 -d 2 -n 30 -type f

3) safe-rg <pattern> [path] [limit]
- Use when you need to search text content in files.
- Example: safe-rg "Context Efficiency Rules" /mnt/c/Windows/system32 20

4) backup [destination_dir]
- Dedupe snapshot backup (rsync hard-link incremental).
- Example: backup /tmp/system32-backups
EOF

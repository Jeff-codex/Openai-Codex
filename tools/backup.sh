#!/usr/bin/env bash
set -euo pipefail

# Dedupe backup for this workspace using rsync hard-link snapshots.
# - Identical files across snapshots consume almost no extra disk.
# - Default destination is /mnt/c/Windows/system32/backups.
#
# Usage:
#   backup.sh [destination_dir]
#   backup.sh --dry-run [destination_dir]

dry_run=0
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=1
  shift
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
dest_root="${1:-/mnt/c/Windows/system32/backups}"
snapshots_dir="$dest_root/snapshots"
latest_link="$dest_root/latest"
ts="$(date +%Y%m%d-%H%M%S)"
new_snap="$snapshots_dir/$ts"

mkdir -p "$snapshots_dir"

link_dest_arg=()
if [[ -L "$latest_link" && -d "$(readlink -f "$latest_link")" ]]; then
  link_dest_arg=(--link-dest="$(readlink -f "$latest_link")")
fi

items=()
for p in AGENTS.md docs tools tests; do
  if [[ -e "$repo_root/$p" ]]; then
    items+=("$p")
  fi
done

if [[ "${#items[@]}" -eq 0 ]]; then
  echo "No backup targets found under: $repo_root" >&2
  exit 2
fi

mkdir -p "$new_snap"

rsync_args=(-a --delete "${link_dest_arg[@]}")
if [[ "$dry_run" -eq 1 ]]; then
  rsync_args+=(--dry-run --itemize-changes)
fi

(
  cd "$repo_root"
  rsync "${rsync_args[@]}" -- "${items[@]}" "$new_snap/"
)

if [[ "$dry_run" -eq 1 ]]; then
  rmdir "$new_snap" 2>/dev/null || true
  echo "Dry-run completed. Snapshot path would be: $new_snap"
  exit 0
fi

ln -sfn "$new_snap" "$latest_link"

echo "Backup completed"
echo "Snapshot: $new_snap"
echo "Latest:   $latest_link -> $(readlink -f "$latest_link")"
du -sh "$new_snap" | awk '{print "Snapshot size:", $1}'

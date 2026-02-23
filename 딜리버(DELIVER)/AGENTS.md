# Repository Guidelines

## Project Structure & Module Organization
This repository is a Windows `system32`-style tree, not a typical application source repo. Most root files are signed binaries (`.dll`, `.exe`) and resources (`.mui`, images). Key directories include locale folders (for example `0409/`, `de-DE/`), platform components (`drivers/`, `wbem/`, `WindowsPowerShell/`), and security/config areas (`CodeIntegrity/`, `config/`).

Contributions should focus on documentation and automation scripts, not replacing system binaries. Place new operational scripts in `tools/` and longer documentation in `docs/`.

## Build, Test, and Development Commands
There is no native build pipeline in this tree. Use inspection and validation commands instead:

- `ls -d */ | head` : quick directory inventory.
- `find . -maxdepth 2 -type f -name "README*"` : discover documentation.
- `sha256sum <path/to/file>` : verify file integrity before and after scripted operations.
- `powershell.exe -NoProfile -Command "Get-AuthenticodeSignature '<file>'"` : check Windows signature status when relevant.

## Context Efficiency Rules
To prevent context bloat, prefer narrow and bounded output.

- Avoid wide listings such as `ls -la` at repository root.
- Use bounded commands like `ls -d */ | head -n 30`, `find . ... | head -n 50`, `rg ... | head -n 80`.
- Prefer wrappers in `tools/`: `safe-ls.sh`, `safe-find.sh`, `safe-rg.sh`.
- Read only the needed line range from files (`sed -n 'start,endp'`).
- Keep one task per turn when possible; save summaries to `docs/` and start a fresh turn for the next task.
- When scanning logs, always filter and cap output first.

## Coding Style & Naming Conventions
For added scripts:

- Bash: `set -euo pipefail`, 2-space indentation.
- PowerShell (`.ps1`): 4-space indentation, `Verb-Noun` function names.
- Filenames: `kebab-case` for scripts (for example `sync-hashes.sh`, `audit-signatures.ps1`).
- Keep scripts idempotent and parameterized; avoid hard-coded machine-specific paths.

## Testing Guidelines
If you add automation, include a safe dry-run path and usage examples. Prefer script-level tests under `tests/`:

- Shell: `test_<feature>.sh`
- PowerShell: `<Feature>.Tests.ps1`

Document expected output and failure behavior in the script header.

## Commit & Pull Request Guidelines
Git history is not available in this checkout, so use a consistent standard:

- Commit format: `type(scope): summary` (for example `docs(guidelines): add signature check step`).
- Keep commits focused and reversible.
- PRs should include purpose, changed paths, risk level, rollback steps, and sample command output for validation.

## Security & Configuration Tips
Do not modify or delete existing signed system binaries unless explicitly required and approved. Never commit secrets, host-specific credentials, or machine identifiers in scripts or docs.

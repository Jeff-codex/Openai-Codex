# Codex Network Stream Incident Record (2026-02-20)

## Scope
This document saves the current Codex runtime settings, root cause analysis, and non-sandbox transition/backtest results for the recurring stream-disconnect issue.

Recorded at: 2026-02-20T02:22:45+09:00
Workspace: `/mnt/c/Windows/system32`

## Current Runtime Snapshot
- `codex-cli`: `0.104.0`
- `node`: `v22.22.0`
- `python3`: `Python 3.12.3`
- Current Codex env flags:
  - `CODEX_CI=1`
  - `CODEX_MANAGED_BY_NPM=1`
  - `CODEX_SANDBOX_NETWORK_DISABLED=1`
  - `CODEX_THREAD_ID=019c76e3-2454-7850-9318-a9bc6e04d889`

## Codex Config Snapshot
Source: `/home/gusrudrkd/.codex/config.toml`

```toml
[projects."/mnt/c/Users/gusru"]
trust_level = "trusted"

[projects."/mnt/c/Windows/system32"]
trust_level = "trusted"
```

## Feature Flags (Relevant)
Source: `codex features list`

- `collaboration_modes = stable / true`
- `shell_tool = stable / true`
- `unified_exec = stable / true`
- `shell_snapshot = stable / true`
- `enable_request_compression = stable / true`
- `personality = stable / true`

## Symptom
`codex exec` repeatedly failed with stream disconnect messages:

- `stream disconnected before completion`
- `error sending request for url (https://chatgpt.com/backend-api/codex/responses)`

## Root Cause Analysis
The root cause is sandbox network restriction, not a Codex model/runtime logic bug.

Evidence:
1. Session context showed `sandbox_policy.network_access=false`.
2. Environment included `CODEX_SANDBOX_NETWORK_DISABLED=1`.
3. In-sandbox DNS/connectivity checks failed:
   - `curl https://chatgpt.com/...` -> `Could not resolve host`
   - `curl https://api.openai.com/...` -> `Could not resolve host`
4. Out-of-sandbox connectivity check succeeded immediately:
   - `curl -I https://chatgpt.com/backend-api/codex/responses` -> HTTP response (status `405`, `allow: POST`), proving network path was available when sandbox restriction was removed.

## Non-Sandbox Transition Record
Actions taken in this session:
1. Ran network probe with escalated permissions (outside sandbox).
2. Ran `codex exec --skip-git-repo-check "정확히 OK 한 단어만 출력"` outside sandbox.
3. Confirmed successful completion (`OK`).
4. Repeated same command 3 times; all succeeded.

Backtest result:
- In sandbox network-disabled mode: reproducible failure.
- Out of sandbox: reproducible success.

## Additional Warning (Non-blocking)
Observed repeatedly:
- `failed to clean up stale arg0 temp dirs: Permission denied`
- `could not update PATH ... ~/.codex/tmp/arg0/...`

This warning did not block out-of-sandbox successful runs.

## Operational Conclusion
To avoid this incident in this environment, Codex tasks that require model/API streaming must run with a network-enabled execution path (for example approved escalated execution), or with sandbox policy allowing network access.

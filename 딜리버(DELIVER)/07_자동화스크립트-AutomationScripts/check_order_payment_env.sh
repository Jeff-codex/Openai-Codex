#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_ENV_FILE="${SERVICE_ENV_FILE:-$PROJECT_ROOT/01_서비스코드-ServiceCode/.env.cloudflare}"
SECRETS_FILE="${SECRETS_FILE:-$HOME/.deliver-secrets/.env.cloudflare.local}"
REQUIRE_TOSS_LIVE="${REQUIRE_TOSS_LIVE:-0}"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
    echo "[INFO] loaded: $file"
  else
    echo "[WARN] not found: $file"
  fi
}

check_required_keys() {
  local group="$1"
  shift
  local missing=0
  for key in "$@"; do
    local value="${!key:-}"
    if [[ -z "${value// }" ]]; then
      echo "[FAIL] $group missing: $key"
      missing=1
    else
      echo "[PASS] $group present: $key"
    fi
  done
  return "$missing"
}

check_optional_keys() {
  local group="$1"
  shift
  for key in "$@"; do
    local value="${!key:-}"
    if [[ -z "${value// }" ]]; then
      echo "[WARN] $group missing (optional): $key"
    else
      echo "[PASS] $group present: $key"
    fi
  done
}

load_env_file "$SERVICE_ENV_FILE"
load_env_file "$SECRETS_FILE"

BASE_KEYS=(
  PASSWORD_PEPPER
)

OPTIONAL_KEYS=(
  MEMBER_PORTAL_URL
)

TOSS_KEYS=(
  TOSS_CLIENT_KEY
  TOSS_SECRET_KEY
  TOSS_SUCCESS_URL
  TOSS_FAIL_URL
)

CLOUDFLARE_KEYS=(
  CLOUDFLARE_API_TOKEN
  CF_ACCOUNT_ID
  CF_PAGES_PROJECT
  CF_D1_DATABASE_NAME
  CF_R2_BUCKET
)

echo "[INFO] validating order-payment required keys"
if ! check_required_keys "order-payment" "${BASE_KEYS[@]}"; then
  echo "[ERROR] order-payment required keys check failed"
  exit 1
fi

echo "[INFO] validating order-payment optional keys"
check_optional_keys "order-payment" "${OPTIONAL_KEYS[@]}"

if [[ "$REQUIRE_TOSS_LIVE" == "1" ]]; then
  echo "[INFO] validating toss live keys (required)"
  if ! check_required_keys "order-payment:toss-live" "${TOSS_KEYS[@]}"; then
    echo "[ERROR] toss live keys check failed"
    exit 1
  fi
else
  echo "[INFO] validating toss keys (pre-integration mode: optional)"
  check_optional_keys "order-payment:toss-preintegration" "${TOSS_KEYS[@]}"
fi

echo "[INFO] validating cloudflare required keys"
if ! check_required_keys "cloudflare" "${CLOUDFLARE_KEYS[@]}"; then
  echo "[ERROR] cloudflare required keys check failed"
  exit 1
fi

echo "[DONE] required env keys are ready"

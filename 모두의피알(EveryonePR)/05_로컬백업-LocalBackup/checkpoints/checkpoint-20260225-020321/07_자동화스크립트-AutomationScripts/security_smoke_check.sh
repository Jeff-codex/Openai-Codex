#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://dliver.co.kr}"
ADMIN_LOGIN_ID="${ADMIN_LOGIN_ID:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin1234}"
ORIGIN="${ORIGIN:-$BASE_URL}"

TMP_DIR="$(mktemp -d)"
COOKIE_JAR="$TMP_DIR/cookies.txt"
trap 'rm -rf "$TMP_DIR"' EXIT

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }

expect_status() {
  local actual="$1"
  local expected="$2"
  local title="$3"
  if [[ "$actual" != "$expected" ]]; then
    fail "$title (expected=$expected actual=$actual)"
  fi
  pass "$title"
}

contains_header() {
  local file="$1"
  local key="$2"
  if ! rg -i "^${key}:" "$file" >/dev/null 2>&1; then
    fail "헤더 누락: $key"
  fi
}

echo "[INFO] Security smoke check target: $BASE_URL"

# 1) API 보안 헤더 존재 확인
curl -sS -D "$TMP_DIR/health.h" -o "$TMP_DIR/health.b" "$BASE_URL/api/health" >/dev/null
contains_header "$TMP_DIR/health.h" "strict-transport-security"
contains_header "$TMP_DIR/health.h" "x-content-type-options"
contains_header "$TMP_DIR/health.h" "x-frame-options"
contains_header "$TMP_DIR/health.h" "x-request-id"
pass "API 보안 헤더 점검"

# 2) Preflight 처리 확인
PRE_STATUS="$(curl -sS -o "$TMP_DIR/preflight.b" -D "$TMP_DIR/preflight.h" -w "%{http_code}" \
  -X OPTIONS "$BASE_URL/api/orders" \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-csrf-token")"
expect_status "$PRE_STATUS" "204" "CORS preflight 허용"
contains_header "$TMP_DIR/preflight.h" "access-control-allow-methods"
contains_header "$TMP_DIR/preflight.h" "access-control-allow-headers"

# 3) 허용되지 않은 Origin 차단 확인
BAD_ORIGIN_STATUS="$(curl -sS -o "$TMP_DIR/bad_origin.b" -w "%{http_code}" \
  -X POST "$BASE_URL/api/auth/login" \
  -H "Origin: https://evil.example" \
  -H "content-type: application/json" \
  --data '{"loginId":"x","password":"x"}')"
expect_status "$BAD_ORIGIN_STATUS" "403" "Origin 차단"

# 4) 관리자 로그인 + 보안 쿠키 속성 확인
LOGIN_STATUS="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -D "$TMP_DIR/login.h" -o "$TMP_DIR/login.b" -w "%{http_code}" \
  -X POST "$BASE_URL/api/admin/login" \
  -H "Origin: $ORIGIN" \
  -H "content-type: application/json" \
  --data "{\"loginId\":\"$ADMIN_LOGIN_ID\",\"password\":\"$ADMIN_PASSWORD\"}")"
expect_status "$LOGIN_STATUS" "200" "관리자 로그인 성공"
if ! rg -i 'set-cookie: deliver_admin_session=.*HttpOnly.*Secure.*SameSite=Lax' "$TMP_DIR/login.h" >/dev/null 2>&1; then
  ADMIN_COOKIE_LINE="$(rg -i 'set-cookie: deliver_admin_session=' "$TMP_DIR/login.h" | head -n 1 || true)"
  if [[ -z "$ADMIN_COOKIE_LINE" ]]; then
    fail "세션 쿠키(deliver_admin_session) 누락"
  fi
  if ! echo "$ADMIN_COOKIE_LINE" | rg -i 'HttpOnly' >/dev/null 2>&1; then fail "세션 쿠키 HttpOnly 누락"; fi
  if ! echo "$ADMIN_COOKIE_LINE" | rg -i 'Secure' >/dev/null 2>&1; then fail "세션 쿠키 Secure 누락"; fi
  if ! echo "$ADMIN_COOKIE_LINE" | rg -i 'SameSite=Lax' >/dev/null 2>&1; then fail "세션 쿠키 SameSite 누락"; fi
fi
pass "세션 쿠키 보안 속성 점검"

# 5) 쿠키 세션 기반 관리자 접근 확인(Authorization 헤더 없이)
BOOTSTRAP_STATUS="$(curl -sS -b "$COOKIE_JAR" -o "$TMP_DIR/bootstrap.b" -w "%{http_code}" \
  "$BASE_URL/api/admin/bootstrap")"
expect_status "$BOOTSTRAP_STATUS" "200" "쿠키 세션 기반 관리자 인증"

CSRF_TOKEN="$(awk '$6=="deliver_csrf"{print $7}' "$COOKIE_JAR" | tail -n 1)"
if [[ -z "${CSRF_TOKEN:-}" ]]; then
  fail "CSRF 쿠키(deliver_csrf) 미발급"
fi
pass "CSRF 쿠키 발급 확인"

# 6) CSRF 미전송 차단
LOGOUT_NO_CSRF_STATUS="$(curl -sS -b "$COOKIE_JAR" -o "$TMP_DIR/logout_no_csrf.b" -w "%{http_code}" \
  -X POST "$BASE_URL/api/admin/logout" \
  -H "Origin: $ORIGIN")"
expect_status "$LOGOUT_NO_CSRF_STATUS" "403" "CSRF 미전송 차단"

# 7) CSRF 포함 요청 허용
LOGOUT_OK_STATUS="$(curl -sS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -o "$TMP_DIR/logout_ok.b" -w "%{http_code}" \
  -X POST "$BASE_URL/api/admin/logout" \
  -H "Origin: $ORIGIN" \
  -H "x-csrf-token: $CSRF_TOKEN")"
expect_status "$LOGOUT_OK_STATUS" "200" "CSRF 검증 통과"

# 8) 로그인 브루트포스 제한 확인(가짜 계정)
RATE_LIMIT_HIT="0"
for i in $(seq 1 14); do
  CODE="$(curl -sS -o "$TMP_DIR/rl_$i.b" -w "%{http_code}" \
    -X POST "$BASE_URL/api/auth/login" \
    -H "Origin: $ORIGIN" \
    -H "content-type: application/json" \
    --data '{"loginId":"zzzz_invalid_user","password":"wrong_password"}')"
  if [[ "$CODE" == "429" ]]; then
    RATE_LIMIT_HIT="1"
    break
  fi
done
if [[ "$RATE_LIMIT_HIT" != "1" ]]; then
  fail "브루트포스 제한(429) 미검출"
fi
pass "브루트포스 제한 동작 확인"

# 9) 정적 페이지 CSP/HSTS 확인
curl -sS -I "$BASE_URL/" > "$TMP_DIR/root.h"
contains_header "$TMP_DIR/root.h" "content-security-policy"
contains_header "$TMP_DIR/root.h" "strict-transport-security"
pass "정적 페이지 보안 헤더 점검"

echo "[DONE] Security smoke checks passed."

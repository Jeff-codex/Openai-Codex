#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://dliver.co.kr}"
RID="$(date +%Y%m%d%H%M%S)"
TMP_ID="diag_${RID}"
TMP_EMAIL="${TMP_ID}@example.com"
TMP_PW="Diag!${RID}"

pass() { echo "[PASS] $*"; }
fail() { echo "[FAIL] $*" >&2; exit 1; }

json_get() {
  local json="$1"
  local expr="$2"
  node -e "const j=JSON.parse(process.argv[1]); const v=${expr}; process.stdout.write(v==null?'':String(v));" "$json"
}

echo "[INFO] Base URL: $BASE_URL"

health="$(curl -sS "$BASE_URL/api/health")"
ok="$(json_get "$health" 'j.ok')"
r2="$(json_get "$health" 'j.r2Ready')"
[[ "$ok" == "true" ]] || fail "health check failed: $health"
pass "health ok (r2Ready=$r2)"

member_login="$(curl -sS -X POST "$BASE_URL/api/auth/login" -H 'content-type: application/json' --data '{"loginId":"test","password":"1234"}')"
member_token="$(json_get "$member_login" 'j.token')"
[[ -n "$member_token" ]] || fail "member login failed: $member_login"
pass "member login(test) ok"

member_me="$(curl -sS "$BASE_URL/api/auth/me" -H "Authorization: Bearer $member_token")"
member_me_ok="$(json_get "$member_me" 'j.ok')"
[[ "$member_me_ok" == "true" ]] || fail "member me failed: $member_me"
pass "member me ok"

signup_payload="$(printf '{"loginId":"%s","name":"자동진단","email":"%s","company":"DLIVER-DIAG","password":"%s"}' "$TMP_ID" "$TMP_EMAIL" "$TMP_PW")"
member_signup="$(curl -sS -X POST "$BASE_URL/api/auth/signup" -H 'content-type: application/json' --data "$signup_payload")"
signup_token="$(json_get "$member_signup" 'j.token')"
[[ -n "$signup_token" ]] || fail "signup failed: $member_signup"
pass "signup($TMP_ID) ok"

media="$(curl -sS "$BASE_URL/api/media")"
media_id="$(json_get "$media" 'j.media && j.media[0] ? j.media[0].id : ""')"
[[ -n "$media_id" ]] || fail "media load failed: $media"
pass "media list ok (first=$media_id)"

order_payload="$(printf '{"title":"진단 주문 %s","mediaId":"%s","budget":10000,"requestNote":"auth debug"}' "$RID" "$media_id")"
order="$(curl -sS -X POST "$BASE_URL/api/orders" -H "Authorization: Bearer $member_token" -H 'content-type: application/json' --data "$order_payload")"
order_id="$(json_get "$order" 'j.order ? j.order.id : ""')"
[[ -n "$order_id" ]] || fail "order create failed: $order"
pass "member order create ok ($order_id)"

orders="$(curl -sS "$BASE_URL/api/orders" -H "Authorization: Bearer $member_token")"
orders_ok="$(json_get "$orders" 'j.ok')"
[[ "$orders_ok" == "true" ]] || fail "orders fetch failed: $orders"
pass "member orders fetch ok"

admin_login="$(curl -sS -X POST "$BASE_URL/api/admin/login" -H 'content-type: application/json' --data '{"loginId":"admin","password":"admin1234"}')"
admin_token="$(json_get "$admin_login" 'j.token')"
[[ -n "$admin_token" ]] || fail "admin login failed: $admin_login"
pass "admin login ok"

admin_bootstrap="$(curl -sS "$BASE_URL/api/admin/bootstrap" -H "Authorization: Bearer $admin_token")"
admin_bootstrap_ok="$(json_get "$admin_bootstrap" 'j.ok')"
[[ "$admin_bootstrap_ok" == "true" ]] || fail "admin bootstrap failed: $admin_bootstrap"
pass "admin bootstrap ok"

curl -sS -X POST "$BASE_URL/api/auth/logout" -H "Authorization: Bearer $member_token" >/dev/null || true
curl -sS -X POST "$BASE_URL/api/auth/logout" -H "Authorization: Bearer $signup_token" >/dev/null || true
curl -sS -X POST "$BASE_URL/api/admin/logout" -H "Authorization: Bearer $admin_token" >/dev/null || true

echo "[DONE] auth debug check completed successfully"

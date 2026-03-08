#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LANDING_REL_PATH="01_서비스코드-ServiceCode/랜딩페이지-LandingPage/index.html"
ADMIN_REL_PATH="01_서비스코드-ServiceCode/관리자페이지-AdminPage/index.html"
MEMBER_REL_PATH="01_서비스코드-ServiceCode/회원전용페이지-MemberPortal/index.html"

LANDING_PATH="$PROJECT_ROOT/$LANDING_REL_PATH"
ADMIN_PATH="$PROJECT_ROOT/$ADMIN_REL_PATH"
MEMBER_PATH="$PROJECT_ROOT/$MEMBER_REL_PATH"

to_file_url() {
  local path="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
import pathlib
print(pathlib.Path(r'''$path''').resolve().as_uri())
PY
  else
    echo "(python3 required for file URL)"
  fi
}

echo "[PREVIEW] 검증 경로"
echo "[PREVIEW] 운영 URL: https://dliver.co.kr/"
echo "[PREVIEW] 운영 관리자 URL: https://admin.dliver.co.kr/"
echo "[PREVIEW] 운영 API URL: https://api.dliver.co.kr/"
echo "[PREVIEW] 스테이징 URL: https://staging.dliver.co.kr/"
echo "[PREVIEW] 스테이징 API URL: https://staging-api.dliver.co.kr/"
echo "[PREVIEW] 개발 URL: https://dev.dliver.co.kr/"
echo "[PREVIEW] 개발 API URL: https://dev-api.dliver.co.kr/"
echo "[PREVIEW] 랜딩 로컬 경로: $LANDING_PATH"
echo "[PREVIEW] 랜딩 file URL: $(to_file_url "$LANDING_PATH")"
echo "[PREVIEW] 관리자 로컬 경로: $ADMIN_PATH"
echo "[PREVIEW] 관리자 file URL: $(to_file_url "$ADMIN_PATH")"
echo "[PREVIEW] 회원전용 로컬 경로: $MEMBER_PATH"
echo "[PREVIEW] 회원전용 file URL: $(to_file_url "$MEMBER_PATH")"
echo "[PREVIEW] 로컬 서버 URL 예시: http://localhost:4173/$LANDING_REL_PATH"
echo "[PREVIEW] 로컬 서버 실행: python3 -m http.server 4173"

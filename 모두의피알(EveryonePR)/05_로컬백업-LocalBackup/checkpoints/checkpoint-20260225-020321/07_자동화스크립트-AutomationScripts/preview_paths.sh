#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LANDING_REL_PATH="01_서비스코드-ServiceCode/랜딩페이지-LandingPage/index.html"
ADMIN_REL_PATH="01_서비스코드-ServiceCode/관리자페이지-AdminPage/index.html"
MEMBER_REL_PATH="01_서비스코드-ServiceCode/회원전용페이지-MemberPortal/index.html"
LANDING_WSL_PATH="$PROJECT_ROOT/$LANDING_REL_PATH"
ADMIN_WSL_PATH="$PROJECT_ROOT/$ADMIN_REL_PATH"
MEMBER_WSL_PATH="$PROJECT_ROOT/$MEMBER_REL_PATH"
PROD_ROOT_URL="https://dliver.co.kr/"
PROD_ADMIN_URL="https://admin.dliver.co.kr/"
PROD_API_URL="https://api.dliver.co.kr/"
STAGING_URL="https://staging.dliver.co.kr/"
STAGING_API_URL="https://staging-api.dliver.co.kr/"
DEV_URL="https://dev.dliver.co.kr/"
DEV_API_URL="https://dev-api.dliver.co.kr/"

to_file_url() {
  local win_path="$1"
  if [[ "$win_path" == "(wslpath unavailable)" ]]; then
    echo "(wslpath unavailable)"
    return
  fi

  local slash_path="${win_path//\\//}"
  local drive="${slash_path:0:1}"
  local rest="${slash_path:2}"
  echo "file:///$drive:$rest"
}

if command -v wslpath >/dev/null 2>&1; then
  LANDING_WIN_PATH="$(wslpath -w "$LANDING_WSL_PATH")"
  ADMIN_WIN_PATH="$(wslpath -w "$ADMIN_WSL_PATH")"
  MEMBER_WIN_PATH="$(wslpath -w "$MEMBER_WSL_PATH")"
  LANDING_FILE_URL="$(to_file_url "$LANDING_WIN_PATH")"
  ADMIN_FILE_URL="$(to_file_url "$ADMIN_WIN_PATH")"
  MEMBER_FILE_URL="$(to_file_url "$MEMBER_WIN_PATH")"
else
  LANDING_WIN_PATH="(wslpath unavailable)"
  ADMIN_WIN_PATH="(wslpath unavailable)"
  MEMBER_WIN_PATH="(wslpath unavailable)"
  LANDING_FILE_URL="(wslpath unavailable)"
  ADMIN_FILE_URL="(wslpath unavailable)"
  MEMBER_FILE_URL="(wslpath unavailable)"
fi

echo "[PREVIEW] 결과물 확인 경로"
echo "[PREVIEW] 운영 URL: $PROD_ROOT_URL"
echo "[PREVIEW] 운영 관리자 URL: $PROD_ADMIN_URL"
echo "[PREVIEW] 운영 API URL: $PROD_API_URL"
echo "[PREVIEW] 스테이징 URL: $STAGING_URL"
echo "[PREVIEW] 스테이징 API URL: $STAGING_API_URL"
echo "[PREVIEW] 개발 URL: $DEV_URL"
echo "[PREVIEW] 개발 API URL: $DEV_API_URL"
echo "[PREVIEW] 랜딩 WSL 경로: $LANDING_WSL_PATH"
echo "[PREVIEW] 랜딩 Windows 경로: $LANDING_WIN_PATH"
echo "[PREVIEW] 랜딩 Windows 접속(file URL): $LANDING_FILE_URL"
echo "[PREVIEW] 랜딩 URL(서버 실행 시): http://localhost:4173/$LANDING_REL_PATH"
echo "[PREVIEW] 관리자 WSL 경로: $ADMIN_WSL_PATH"
echo "[PREVIEW] 관리자 Windows 경로: $ADMIN_WIN_PATH"
echo "[PREVIEW] 관리자 Windows 접속(file URL): $ADMIN_FILE_URL"
echo "[PREVIEW] 관리자 URL(서버 실행 시): http://localhost:4173/$ADMIN_REL_PATH"
echo "[PREVIEW] 회원전용 WSL 경로: $MEMBER_WSL_PATH"
echo "[PREVIEW] 회원전용 Windows 경로: $MEMBER_WIN_PATH"
echo "[PREVIEW] 회원전용 Windows 접속(file URL): $MEMBER_FILE_URL"
echo "[PREVIEW] 회원전용 URL(서버 실행 시): http://localhost:4173/$MEMBER_REL_PATH"
echo "[PREVIEW] 서버 실행 명령:"
echo "  cd \"$PROJECT_ROOT\" && python3 -m http.server 4173"

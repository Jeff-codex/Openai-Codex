# Cloudflare 연동 가이드 (딜리버)

## 1) 고정 데이터 스택
- 정적 배포: Cloudflare Pages
- 구조화 데이터: Cloudflare D1
- 세션/단기 상태: Cloudflare KV
- 파일 저장(선택): Cloudflare R2

## 2) 필수 식별자
- Account ID: `9970b838c7747b87db3fd2c268b533b6`
- Pages Project: `dliver`
- D1 DB: `dliver-prod-db` (`9b95eaf5-2246-43fe-b055-4417f2e07e8d`)
- KV Namespace: `dliver-session-kv-prod` (`5c0c1bad266d43cda9e3820098de2d69`)
- R2 Bucket: `dliver-prod-files` (2026-02-23 생성)

## 2-1) 권장 API 토큰 권한(자동화용)
- Account - Cloudflare Pages: `Edit`
- Account - D1: `Edit`
- Account - Workers KV Storage: `Edit`
- Account - R2 Storage: `Edit`
- Account - Workers Scripts: `Edit` (추후 Workers 확장 시)
- 문제 징후:
  - Pages API `Authentication error(10000)` -> Pages 권한 부족
  - R2 API `code 10042` -> 권한 문제가 아니라 R2 온보딩 미완료

## 3) Pages 환경변수(Production/Preview 공통)
- Pages Functions 런타임은 API 토큰을 쓰지 않고 바인딩을 사용한다.
- 필수 바인딩:
  - `DB` -> D1 `dliver-prod-db`
  - `SESSION_KV` -> KV `dliver-session-kv-prod`
- 선택 바인딩:
  - `FILES_BUCKET` -> R2 bucket (첨부/파일 기능 사용 시)
- (선택) `MEMBER_SESSION_TTL_SEC`, `ADMIN_SESSION_TTL_SEC`
- 보안 권장 변수:
  - `CORS_ALLOW_ORIGINS`
  - `PASSWORD_PEPPER`
  - `PASSWORD_HASH_ITERATIONS` (Cloudflare Workers 한도: `100000` 권장)
  - `SESSION_BIND_UA` (`1` 권장)
- 운영 알림 변수(선택):
  - `OPS_ALERT_TELEGRAM_ENABLED` (`1`일 때 활성)
  - `OPS_ALERT_TELEGRAM_BOT_TOKEN` (텔레그램 봇 토큰)
  - `OPS_ALERT_TELEGRAM_CHAT_ID` (알림 수신 chat id)
  - `OPS_ALERT_TIMEOUT_MS` (기본 `2500`)
  - `ADMIN_PORTAL_URL` (기본 `https://admin.dliver.co.kr/`)

## 4) D1 스키마 적용
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
npx wrangler d1 execute dliver-prod-db --remote --file 08_데이터베이스-Database/01_마이그레이션-Migrations/003_init_d1_schema.sql
```

## 5) 배포
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
STAMP=$(date +%Y%m%d-%H%M%S)
DIST="/tmp/dliver-pages-dist-$STAMP"
mkdir -p "$DIST"
cp -a index.html functions 01_서비스코드-ServiceCode "$DIST"/
cp -a _headers "$DIST"/
npx wrangler pages deploy "$DIST" --project-name dliver
```

## 6) 로컬 백업(Cloudflare D1)
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
./07_자동화스크립트-AutomationScripts/database_backup_all.sh
```
- 필요 변수: `CLOUDFLARE_API_TOKEN`, `CF_D1_DATABASE_NAME` (기본값 `dliver-prod-db`)

## 7) API 엔드포인트
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/media`
- `GET/POST /api/orders`
- `GET /api/admin/attachment?orderId=...&download=0|1`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/bootstrap`
- `POST/PATCH /api/admin/orders`
- `POST/PATCH /api/admin/media`
- `GET /api/health`
  - 응답 필드 `r2Ready`로 R2 바인딩(`FILES_BUCKET`) 연결 여부를 즉시 점검 가능

## 7-1) 원고 첨부 정책
- 업로드 위치: R2 `dliver-prod-files` (`orders/{orderId}/...`)
- 허용 형식: `txt`, `doc`, `docx`, `hwp`, `hwpx`, `pdf`, `rtf`, `md`, `odt`
- 최대 용량: 30MB

## 8) R2
- R2 API에서 `code 10042`가 나오면 계정 온보딩이 미완료 상태다.
- Cloudflare Dashboard > R2에서 결제/약관 온보딩을 최종 완료해야 API 생성이 가능하다.
- 온보딩 완료 후 현재 버킷 상태 확인:
```bash
export CLOUDFLARE_API_TOKEN=...
curl -sS "https://api.cloudflare.com/client/v4/accounts/9970b838c7747b87db3fd2c268b533b6/r2/buckets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```
- 온보딩 완료 후 버킷 생성 예시:
```bash
export CLOUDFLARE_API_TOKEN=...
curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/9970b838c7747b87db3fd2c268b533b6/r2/buckets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"name":"dliver-prod-files"}'
```

## 9) R2 S3 클라이언트 접속
- Endpoint: `https://9970b838c7747b87db3fd2c268b533b6.r2.cloudflarestorage.com`
- Access Key ID / Secret Access Key(토큰 값)는 로컬 비밀 변수로만 관리하고 Git에 저장하지 않는다.
- Wrangler 스모크 테스트 예시:
```bash
export CLOUDFLARE_API_TOKEN=YOUR_R2_API_TOKEN
npx wrangler r2 object put dliver-prod-files/healthchecks/smoke.txt --remote --file /tmp/smoke.txt
npx wrangler r2 object get dliver-prod-files/healthchecks/smoke.txt --remote --file /tmp/smoke-down.txt
npx wrangler r2 object delete dliver-prod-files/healthchecks/smoke.txt --remote
```

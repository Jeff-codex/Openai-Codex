# Cloudflare 운영 점검표 (2026-03-05)

## 리소스 인벤토리

| 리소스 유형 | 이름/바인딩 | 코드 참조 | 상태 |
|---|---|---|---|
| Pages | `dliver` | 루트 정적 파일, `functions/` | 사용 중 |
| Workers(단독 스크립트) | 별도 Worker 미확인 | `wrangler.toml` 없음, Pages Functions만 사용 | 미사용(현재) |
| D1 | `dliver-prod-db` / `DB` | `functions/api/_lib/cloudflare_store.js` | 사용 중 |
| KV | `dliver-session-kv-prod` / `SESSION_KV` | `functions/_middleware.js`, `cloudflare_store.js` | 사용 중 |
| R2 | `dliver-prod-files` / `FILES_BUCKET` | `functions/api/review/analyze.js`, `cloudflare_store.js` | 선택 사용 |
| Secrets/Vars | `.env.cloudflare.example` 키 목록 | `functions/api/**`, `07_자동화스크립트-AutomationScripts/**` | 사용 중 |
| DNS/Routes | `dliver.co.kr`, `admin.dliver.co.kr`, `api.dliver.co.kr` 등 | `_redirects`, README, Cloudflare 가이드 | 사용 중 |

## 코드-리소스 매핑

- D1 `DB`
  - `functions/api/_lib/cloudflare_store.js`
  - `functions/api/_lib/review_engine.js`
  - `functions/api/_lib/order_attachment_store.js`
  - `functions/api/_lib/media_pricing.js`
- KV `SESSION_KV`
  - `functions/_middleware.js`
  - `functions/api/_lib/cloudflare_store.js`
- R2 `FILES_BUCKET`
  - `functions/api/review/analyze.js`
  - `functions/api/_lib/cloudflare_store.js`
- Toss/보안 Vars
  - `functions/api/payments/toss/*.js`
  - `functions/api/_lib/cloudflare_store.js`

## D1 점검

- 기준 마이그레이션 파일
  - `003_init_d1_schema.sql`
  - `004_review_engine_schema.sql`
  - `005_order_payment_system.sql`
  - `007_media_channels_pricing_v2.sql`
- 적용 순서
  1. `003`
  2. `004`
  3. `005`
  4. `007`
- 백업
  - 실행: `07_자동화스크립트-AutomationScripts/database-backup-all.ps1`
  - 산출: `08_데이터베이스-Database/04_백업-Backups/db-snapshot-*.zip`
- 복구
  - 백업 zip 해제 -> `manifest.json`과 테이블 JSON 기준 복원
  - 복구 전후 건수/합계 검증 SQL 필수

## Secrets/Vars (키 이름만)

- Cloudflare/API: `CLOUDFLARE_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_PAGES_PROJECT`, `CF_D1_DATABASE_NAME`, `CF_D1_DATABASE_ID`, `CF_KV_NAMESPACE_ID`, `CF_R2_BUCKET`
- App Runtime: `MEMBER_SESSION_TTL_SEC`, `ADMIN_SESSION_TTL_SEC`, `CORS_ALLOW_ORIGINS`, `PASSWORD_PEPPER`, `PASSWORD_HASH_ITERATIONS`, `SESSION_BIND_UA`
- Toss: `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `TOSS_SUCCESS_URL`, `TOSS_FAIL_URL`
- Portal/운영: `MEMBER_PORTAL_URL`, `ADMIN_PORTAL_URL`, `SECURITY_SMOKE_ADMIN_LOGIN_ID`, `SECURITY_SMOKE_ADMIN_PASSWORD`
- Alerts: `OPS_ALERT_TELEGRAM_ENABLED`, `OPS_ALERT_TELEGRAM_BOT_TOKEN`, `OPS_ALERT_TELEGRAM_CHAT_ID`, `OPS_ALERT_TIMEOUT_MS`

## 배포 리스크

- 데이터 손실: `005`의 `alter table`은 롤백이 어려움. 사전 백업 없이 실행 금지.
- 권한 누락: API 토큰에 D1/KV/R2/Pages 권한 누락 시 배포/백업 실패.
- DNS/라우팅: `_redirects` 규칙 변경 시 `/self-order`, 관리자/회원전용 경로 오동작 위험.
- 캐시 영향: `_headers`의 CSP/HSTS 변경 시 브라우저 캐시로 장애 장기화 가능.
- R2 선택 바인딩: `FILES_BUCKET` 미바인딩 상태에서 첨부 기능 경로 사용 시 런타임 오류 가능.

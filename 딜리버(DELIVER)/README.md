# EveryonePR/모두의피알 운영/개발 가이드 (Windows Codex 앱 기준)

## 1. 프로젝트 위치
- Windows 경로: `C:\Users\gusru\code\Openai-Codex\딜리버(DELIVER)`
- 이 문서는 WSL 없이 Windows PowerShell 기준으로 작성되었다.
- 외부 공개 브랜드와 대표 도메인은 `EveryonePR/모두의피알`, `https://everyonepr.com` 기준으로 설명한다.
- Pages 프로젝트명 `dliver`, D1/KV/R2 이름 등은 현재 Cloudflare 내부 식별자이므로 문서에서 그대로 유지한다.

## 2. 핵심 디렉터리
- `01_서비스코드-ServiceCode`: 서비스 코드/환경 파일
- `07_자동화스크립트-AutomationScripts`: 운영 자동화 스크립트(`.ps1` 우선)
- `08_데이터베이스-Database`: D1 마이그레이션/백업
- `functions/api`: Cloudflare Pages Functions API

## 3. Cloudflare 리소스(내부 식별자 기준)
- Pages Project: `dliver`
- Production D1 Binding: `DB` (`dliver-prod-db`)
- Production KV Binding: `SESSION_KV` (`dliver-session-kv-prod`)
- Production R2 Binding: `FILES_BUCKET` (`dliver-prod-files`, 선택)
- Preview D1 Binding: `DB` (`dliver-preview-db`)
- Preview KV Binding: `SESSION_KV` (`dliver-session-kv-preview`)
- Preview R2 Binding: `FILES_BUCKET` (`dliver-preview-files`)
- Public Host: `https://everyonepr.com`
- Legacy Holdout: `https://admin.dliver.co.kr/`, `https://api.dliver.co.kr/`

## 4. 설치 (Windows)
1. Node.js 20+
2. Git for Windows
3. Python 3.x (선택: 일부 검증/보조 스크립트)
4. Wrangler CLI (권장)
   - `npm i -g wrangler`

## 5. 환경 변수 로드
1. 예제 복사
   - `Copy-Item .\01_서비스코드-ServiceCode\.env.cloudflare.example .\01_서비스코드-ServiceCode\.env.cloudflare`
2. 실값은 저장소 외부 파일에 저장
   - 예: `$HOME\.deliver-secrets\.env.cloudflare.local`
3. 현재 세션 로드
   - `.\07_자동화스크립트-AutomationScripts\check-order-payment-env.ps1`

## 6. 검증 (Windows 우선)
1. 필수 키 점검
   - `.\07_자동화스크립트-AutomationScripts\check-order-payment-env.ps1`
2. 배포 전 게이트(로컬)
   - `.\07_자동화스크립트-AutomationScripts\predeploy-order-payment-gate.ps1 -SkipRemote`
3. 경로/URL 점검
   - `.\07_자동화스크립트-AutomationScripts\preview-paths.ps1`

## 7. 백업
1. 코드 백업 zip 생성
   - `.\07_자동화스크립트-AutomationScripts\backup-and-push.ps1`
2. D1 스냅샷 백업 zip 생성
   - `.\07_자동화스크립트-AutomationScripts\database-backup-all.ps1`
3. 스케줄 실행(수동 트리거)
   - `.\07_자동화스크립트-AutomationScripts\scheduled-backup-runner.ps1 -Soft`

## 8. 배포
1. D1 마이그레이션(원격)
   - `npx wrangler d1 execute dliver-prod-db --remote --file 08_데이터베이스-Database/01_마이그레이션-Migrations/003_init_d1_schema.sql`
   - `npx wrangler d1 execute dliver-prod-db --remote --file 08_데이터베이스-Database/01_마이그레이션-Migrations/004_review_engine_schema.sql`
   - `npx wrangler d1 execute dliver-prod-db --remote --file 08_데이터베이스-Database/01_마이그레이션-Migrations/005_order_payment_system.sql`
   - `npx wrangler d1 execute dliver-prod-db --remote --file 08_데이터베이스-Database/01_마이그레이션-Migrations/007_media_channels_pricing_v2.sql`
2. Pages 배포
   - `npx wrangler pages deploy . --project-name dliver`
3. Preview smoke 배포
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\07_자동화스크립트-AutomationScripts\deploy-pages-windows.ps1 -Branch preview-split-check`

## 9. D1 복구(백업 기준)
1. 백업 zip 압축 해제
2. `manifest.json` 확인 후 테이블 JSON을 기준으로 복원 SQL/스크립트 수행
3. 복구 전/후 `npx wrangler d1 execute dliver-prod-db --remote --command "select count(*) ..."`로 건수 검증

## 10. 보안 규칙
- `.env`, 토큰, 비밀번호, 쿠키는 출력/커밋 금지
- 운영 시크릿은 Pages/Workers Secrets 또는 저장소 외부 파일로만 관리
- 파괴적 명령(`reset --hard`, 강제 삭제) 금지

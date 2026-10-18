# 딜리버 웹서비스 개발 저장 구조 (Local + Git Remote)

## 저장 경로
- 로컬 PC: `C:\Users\gusru\code\Openai-Codex\딜리버(DELIVER)`
- WSL 경로: `/mnt/c/Users/gusru/code/Openai-Codex/딜리버(DELIVER)`
- 원격 Git: `origin` (현재 연결됨)

## 폴더 구조 (한국어+영어)
- `01_서비스코드-ServiceCode` : 실제 개발 소스
- `02_디자인에셋-DesignAssets` : 로고/이미지/브랜드 리소스
- `03_프로젝트문서-ProjectDocs` : 요구사항/운영 문서
- `04_배포패키지-DeployPackage` : 배포 산출물
- `05_로컬백업-LocalBackup` : 로컬 백업 압축본
- `06_운영로그-OpsLogs` : 운영 로그 파일
- `07_자동화스크립트-AutomationScripts` : 백업/동기화 스크립트
- `08_데이터베이스-Database` : Cloudflare D1 마이그레이션/시드/동기화 로그

## 고정 개발 정책
- 모든 회원/주문/운영 데이터 기능은 Cloudflare(D1/KV/R2) 연동을 기본값으로 설계
- 환경 변수 기준 파일: `01_서비스코드-ServiceCode/.env.cloudflare.example`
- 실토큰/시크릿은 저장소 바깥 비밀파일(예: `~/.deliver-secrets/.env.cloudflare.local`)에서만 관리
- 세부 원칙 문서: `03_프로젝트문서-ProjectDocs/개발원칙-DevelopmentPrinciples.md`
- 퍼스트 랜딩 검수엔진 고정 정책: `03_프로젝트문서-ProjectDocs/퍼스트랜딩-검수엔진-고정정책.md`
- 퍼스트 랜딩 검수 기능은 초기 단계에서 LLM 호출 없이 규칙엔진 100%로 운영
- 매 단계 완료 후 `완료/미완료` 요약 체크리스트 제공을 기본 원칙으로 적용
- 단계별 Windows 접속 경로(절대경로 + `file:///`)는 요청 시에만 제공
- 개발 순서는 `Admin MVP + 프론트 병행`을 기본값으로 적용

## 현재 퍼스트 랜딩 위치 (루트 메인)
- `index.html`
- `01_서비스코드-ServiceCode/랜딩페이지-FirstLandingPage/index.html`

## 세컨드 랜딩 위치 (기존 셀프주문)
- `01_서비스코드-ServiceCode/랜딩페이지-LandingPage/index.html`
- 접근 경로: `https://dliver.co.kr/self-order`

## 현재 관리자페이지 위치
- `01_서비스코드-ServiceCode/관리자페이지-AdminPage/index.html`

## 운영 도메인 (2026-02-23 기준)
- 메인: `https://dliver.co.kr/`
- 관리자: `https://admin.dliver.co.kr/`
- API: `https://api.dliver.co.kr/`
- 스테이징: `https://staging.dliver.co.kr/`
- 스테이징 API: `https://staging-api.dliver.co.kr/`
- 개발: `https://dev.dliver.co.kr/`
- 개발 API: `https://dev-api.dliver.co.kr/`

## Cloudflare 데이터 문서
- `08_데이터베이스-Database/01_마이그레이션-Migrations/003_init_d1_schema.sql`
- `08_데이터베이스-Database/01_마이그레이션-Migrations/004_review_engine_schema.sql`
- `03_프로젝트문서-ProjectDocs/AdminMVP-운영구성-AdminMVPBlueprint.md`
- `03_프로젝트문서-ProjectDocs/Cloudflare연동가이드-CloudflareSetupGuide.md`

루트 `index.html`은 퍼스트 랜딩(원고 검수 페이지) 본문을 직접 렌더링하도록 구성되어 있습니다.

## 운영 안정화 워크플로우
0. 로컬 시크릿 로드(필수)
```bash
set -a
source ~/.deliver-secrets/.env.cloudflare.local
set +a
```

1. 개발 후 로컬 백업 생성
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
./07_자동화스크립트-AutomationScripts/backup_and_push.sh
```

2. 백업 + Git 원격 푸시까지 한 번에 실행
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
./07_자동화스크립트-AutomationScripts/backup_and_push.sh --push
```

3. 단계 완료 기록 + 백업(권장)
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
./07_자동화스크립트-AutomationScripts/checkpoint.sh "회원가입 화면 개선"
```

4. 단계 완료 기록 + 백업 + 원격 푸시
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
./07_자동화스크립트-AutomationScripts/checkpoint.sh "회원가입 화면 개선" --push
```

5. 미리보기 경로만 즉시 출력
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
./07_자동화스크립트-AutomationScripts/preview_paths.sh
```

6. Cloudflare D1 시드 반영(원격 실행)
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
npx wrangler d1 execute dliver-prod-db --remote --file 08_데이터베이스-Database/01_마이그레이션-Migrations/003_init_d1_schema.sql
npx wrangler d1 execute dliver-prod-db --remote --file 08_데이터베이스-Database/01_마이그레이션-Migrations/004_review_engine_schema.sql
```

7. D1 데이터베이스 목록 확인
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
npx wrangler d1 list
```

8. 데이터베이스 전체 백업(즉시 실행)
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
./07_자동화스크립트-AutomationScripts/database_backup_all.sh
```

9. 저장 최적화(보관 개수 유지)
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
./07_자동화스크립트-AutomationScripts/optimize_storage.sh
```

10. 스케줄 실행용 백업 러너(로그/락 포함)
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
./07_자동화스크립트-AutomationScripts/scheduled_backup_runner.sh
```

11. 리눅스/WSL 크론 등록 예시(6시간마다 실행)
```bash
(crontab -l 2>/dev/null; echo "15 */6 * * * /mnt/c/Users/gusru/code/Openai-Codex/딜리버\\(DELIVER\\)/07_자동화스크립트-AutomationScripts/scheduled_backup_runner.sh --soft") | crontab -
```

12. 작업 재개 명령
```bash
딜리버
```

## 보안 기본값
- 인증 세션: `HttpOnly + Secure + SameSite=Lax` 쿠키 기반
- 비밀번호: PBKDF2-SHA256 해시(`PASSWORD_HASH_ITERATIONS`, `PASSWORD_PEPPER`)
- API 보호: CORS/Preflight + CSRF + RateLimit + Brute-force 잠금 + 보안헤더
- 감사로그: `security_audit_logs` 테이블에 인증/권한 주요 이벤트 적재

## 채널톡 설정
- 랜딩 삽입 위치: `01_서비스코드-ServiceCode/랜딩페이지-LandingPage/index.html`
- 설정 키: `CHANNEL_TALK_PLUGIN_KEY`
- 런타임 오버라이드(선택): `window.DLIVER_CHANNEL_TALK_PLUGIN_KEY = "..."` 설정 시 해당 값 우선 사용
- 보안헤더(CSP) 허용 도메인: `_headers` 내 `cdn.channel.io`, `*.channel.io`, `api.channel.io` 반영

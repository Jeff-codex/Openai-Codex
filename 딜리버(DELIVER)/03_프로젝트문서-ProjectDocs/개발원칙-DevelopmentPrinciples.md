# 딜리버 개발 원칙 (고정)

## 1) 데이터/운영 원칙
- 운영 데이터 저장소는 Cloudflare 전용(D1/KV/R2)으로 고정한다.
- 회원가입/회원관리/주문/결제 이력은 D1을 기본 저장소로 사용하고, 세션/단기 상태는 KV를 사용한다.
- 파일 업로드/보관이 필요한 경우 R2를 사용한다.
- 프론트 임시 저장(localStorage)은 개발 편의용으로만 허용하고 운영 단계에서는 반드시 서버 저장으로 교체한다.

## 2) 환경 분리
- `dev`, `staging`, `prod` 환경을 분리한다.
- 환경 변수는 `.env`로 관리하고 Git에 비밀키를 커밋하지 않는다.
- Pages Functions 런타임 필수 바인딩: `DB`(D1), `SESSION_KV`(KV), 필요 시 `FILES_BUCKET`(R2).
- 로컬/CLI 작업 시 최소 변수: `CLOUDFLARE_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_D1_DATABASE_NAME`.

## 3) 개발 순서 원칙
- 프론트 단독 선행이 아니라 `Admin MVP + 프론트`를 병행한다.
- 주문/회원/매체 데이터가 연관되는 기능은 관리자 워크플로우를 먼저 확보한 뒤 프론트에 연결한다.
- MVP 단계에서도 Cloudflare API(D1/KV) 연동을 기본값으로 유지한다.

## 4) 개발 완료 체크포인트 원칙
- 각 개발 단계 완료 직후 아래를 실행한다.
- `./07_자동화스크립트-AutomationScripts/checkpoint.sh "단계 요약"`
- 필요 시 원격 백업까지 동시에 실행한다.
- `./07_자동화스크립트-AutomationScripts/checkpoint.sh "단계 요약" --push`
- 모든 단계 완료 후 `완료된 항목` / `미완료 항목` 체크리스트를 반드시 제공한다.
- 단계별 Windows 접속 경로(절대경로 + `file:///`)는 기본 제공 대상에서 제외하고, 사용자 요청 시에만 제공한다.
- 미리보기 경로 출력은 필요 시 `preview_paths.sh`로 즉시 조회 가능하도록 유지한다.

## 5) 기록/복구 원칙
- 단계별 작업 요약, 변경 파일, 다음 액션은 `개발기록-DevelopmentJournal.md`에 누적 기록한다.
- 로컬 백업(`05_로컬백업-LocalBackup`)과 Git 원격(`origin/main`)을 병행한다.
- 데이터베이스 백업은 `database_backup_all.sh`(Cloudflare D1 스냅샷)로 tar.gz 아카이브를 생성해 보관한다.
- 저장공간 최적화를 위해 `optimize_storage.sh` 보관 정책을 항상 유지한다.
- 작업 중단 후 재개 시 `딜리버` 명령으로 프로젝트 상태를 먼저 확인한다.

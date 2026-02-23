# 딜리버 개발 원칙 (고정)

## 1) 데이터/운영 원칙
- 운영 데이터 저장소는 로컬 PC가 아니라 Supabase(또는 동급 Managed DB) 기준으로 설계한다.
- 회원가입/회원관리/주문/결제 이력은 Supabase 연동이 가능한 구조를 기본값으로 유지한다.
- 프론트 임시 저장(localStorage)은 개발 편의용으로만 허용하고 운영 단계에서는 반드시 서버 저장으로 교체한다.

## 2) 환경 분리
- `dev`, `staging`, `prod` 환경을 분리한다.
- 환경 변수는 `.env`로 관리하고 Git에 비밀키를 커밋하지 않는다.
- 최소 필수 변수: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## 3) 개발 완료 체크포인트 원칙
- 각 개발 단계 완료 직후 아래를 실행한다.
- `./07_자동화스크립트-AutomationScripts/checkpoint.sh "단계 요약"`
- 필요 시 원격 백업까지 동시에 실행한다.
- `./07_자동화스크립트-AutomationScripts/checkpoint.sh "단계 요약" --push`

## 4) 기록/복구 원칙
- 단계별 작업 요약, 변경 파일, 다음 액션은 `개발기록-DevelopmentJournal.md`에 누적 기록한다.
- 로컬 백업(`05_로컬백업-LocalBackup`)과 Git 원격(`origin/main`)을 병행한다.
- 작업 중단 후 재개 시 `딜리버` 명령으로 프로젝트 상태를 먼저 확인한다.

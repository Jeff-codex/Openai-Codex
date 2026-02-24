# Admin MVP 운영 구성

## 목적
- 프론트 페이지 개발과 병행해 실제 운영 가능성을 확보하기 위한 최소 관리자 기능을 제공한다.

## 현재 구현 상태 (v0)
- 페이지 경로: `01_서비스코드-ServiceCode/관리자페이지-AdminPage/index.html`
- 데이터 모드: Cloudflare D1 + KV (Pages Functions API)
- 기능:
  - 회원 목록 조회/검색
  - 주문 등록/상태변경
  - 매체 추가/활성비활성
  - 운영 로그 누적
  - 보안 감사로그 조회(이벤트/결과/행위자/IP/상세)

## Cloudflare 연동 우선순위
1. 인증
- KV 세션 토큰 기반 관리자 로그인
- `members.role = 'admin'` 계정만 관리자 페이지 접근 허용

2. 데이터 연결
- 회원 목록: `members`
- 주문 목록/상태: `orders`, `order_status_logs`
- 매체 관리: `media_channels`

3. 정책
- D1 스키마는 `003_init_d1_schema.sql` 기준 적용
- Cloudflare API 토큰은 Pages Functions 환경변수에서만 사용하고 클라이언트에 노출하지 않음

## 다음 개발 작업
- 주문 상태 변경 시 `order_status_logs` + `admin_logs` 자동 기록 유지
- Pages 배포 시 Functions 활성 상태(uses_functions=true) 점검 자동화
- R2 활성화 후 첨부 파일 업로드 API 확장
- 관리자 감사로그 필터(이벤트 타입 드롭다운, 기간 지정) 고도화

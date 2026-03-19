# Codex Agent Kit — EveryonePR

이 패키지는 `EveryonePR / 모두의피알` 프로젝트 전용 에이전트 운영 키트다.

포함 파일:

- `MASTER_OPERATING_RULES.md`
- `everyonepr/NORTH_STAR.md`
- `everyonepr/WEEKLY_BRIEF.md`
- `everyonepr/BUILD_QUEUE.md`
- `everyonepr/DECISION_LOG.md`
- `everyonepr/MASTER_BRIEF_TEMPLATE.md`
- `everyonepr/agents/` 폴더 내 개별 에이전트 시스템 프롬프트 `.md` 파일

권장 사용 방식:

1. 현재 프로젝트 상태를 먼저 확인한다.
2. 이번 주 핵심 병목을 `WEEKLY_BRIEF.md`에 1개만 적는다.
3. 실제 구현 후보는 `BUILD_QUEUE.md`에서 현재 단계 기준으로 정리한다.
4. 한 번에 모든 에이전트를 쓰지 말고, 현재 단계에 맞는 2~3개만 먼저 호출한다.
5. `MO-1`은 항상 마지막에만 호출한다.
6. `member/admin/api/결제/도메인/Cloudflare stateful binding`은 명시적 승인 없는 확장 금지 영역으로 취급한다.

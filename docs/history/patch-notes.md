# 패치노트

배포/기능 단위의 요약 변경 이력. 코드 레벨 Before/After 상세는 [dev-log.md](dev-log.md), 구현 전
설계 논의가 필요했던 작업은 `docs/plan/`의 개별 계획 문서를 참조. **최신 항목이 위로 오도록 역순 추가.**

## 기록 형식

```
## YYYY-MM-DD — 제목 (상태: 계획 수립 / 구현 완료)

**요약**: 무엇을 왜 바꿨는지 1~2문장

**관련 문서**: [파일명](경로) — 있는 경우만
**관련 dev-log**: [dev-log.md#앵커](dev-log.md) — 있는 경우만
```

---

## 2026-07-27 — 경기 시뮬레이션 Worker Thread 분리 (상태: 구현 완료, 배포됨)

**요약**: 멀티플레이어 서버에서 큰 토너먼트 진행 중 경기 시뮬레이션(경기당 4.5~10초 동기 연산)이 Bun
서버의 단일 이벤트 루프를 막아 HTTP/WS 연결이 끊기고 "진행중인 경기 보기"가 안 되는 문제 발생.
근본 원인은 `runSimulation()`의 `runFullGameSimulation()` 동기 계산이 메인 스레드를 블로킹하는 것으로
확인. VM 스펙업(비용으로 해결)은 근시안적이라 판단해 기각하고, 시뮬레이션을 별도 Worker Thread로
분리. 워커 크래시 시 `game_sim_claims` 고아 레코드 방지, 스폰 직후 ping/pong 헬스체크, 5분 간격
stale 클레임 청소를 최초 구현에 포함. 배포 후 15경기 연속 처리 구간에서 연결 끊김 에러 0건,
`/live-game` 응답 0.42초로 개선 확인.

**관련 문서**: [worker-thread-sim-plan.md](../plan/worker-thread-sim-plan.md)
**관련 dev-log**: [dev-log.md](dev-log.md) — "경기 시뮬레이션 Worker Thread 분리" 항목

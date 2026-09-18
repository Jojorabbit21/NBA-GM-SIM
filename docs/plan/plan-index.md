# Plan Index

## 개발 계획 문서 목록

미래 기능 개발 계획 및 설계 문서들.

---

| 문서 | 설명 | 상태 |
|------|------|------|
| [live-pbp.md](live-pbp.md) | 실시간 PBP 스트리밍 (멀티플레이어) 설계 | 계획 |
| [fantasy-draft-plan.md](fantasy-draft-plan.md) | 판타지 드래프트 시스템 설계 | 계획 |
| [draft-agent.md](draft-agent.md) | 드래프트 AI 에이전트 설계 | 계획 |
| [player-instructions.md](player-instructions.md) | 선수별 개인 전술 지침 (Coachability + Rebellion) | 설계 완료 |
| [multi-season-plan.md](multi-season-plan.md) | 멀티시즌 지원 구현 계획 | 계획 |
| [physics-choreography-engine.md](physics-choreography-engine.md) | 물리 기반 안무 엔진 (공 물리, 절차적 움직임 합성) | 논의 중 |
| [draft-autopick-plan.md](draft-autopick-plan.md) | 멀티 드래프트 오토픽 시스템 (타임아웃/미입장/재접속/어드민 토글) | 계획 |
| [multi-admin-trade-plan.md](multi-admin-trade-plan.md) | 멀티 어드민 트레이드(팀↔팀 선수 스왑) — RPC 설계 + 뎁스차트 정리 | 계획 |
| [multi-role-fit-score-toggle-plan.md](multi-role-fit-score-toggle-plan.md) | 멀티플레이어 역할 적합도 점수(ArchetypeRatings, playType 액터 선정용) 토글 노출 | 폐기 (2026-07-28) |
| [multi-player-archetype-tags-plan.md](multi-player-archetype-tags-plan.md) | 멀티플레이어 선수 정체성 아키타입(Primary/Secondary) + 14개 특성 태그 적용 | 폐기 (2026-07-28) |
| [fixed-day-schedule-plan.md](fixed-day-schedule-plan.md) | 고정 길이 가상 하루 스케줄 구조 전환 — 타임라인 표, 기간→시간대 역산, 리플레이 설정화, Realtime 증분 반영 | 결정 완료, 착수 대기 (2026-09-18) |
| [tournament-personal-pack-draft-plan.md](tournament-personal-pack-draft-plan.md) | 토너먼트 전용 개인 팩 드래프트 — 참가 즉시 비동기 라운드제 드래프트, 룸 스코프 player instance로 meta_players 변경 없이 로스터 중복 허용 | 코드 완료 — Phase 1~7 + 3.5 전부 구현(시작 트리거·아카이브 후 정리까지). DB 롤백 테스트 통과, 남은 건 fly.io 배포 후 브라우저 E2E(실제 경기 시뮬이 인스턴스 로스터로 도는지) (2026-09-18) |

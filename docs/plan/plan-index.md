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
| [draft-queue-plan.md](draft-queue-plan.md) | 멀티 드래프트 큐 — 시작 전 희망 순서 저장(`draft_queues`, WS 전용), 오토픽·타임아웃·스킵·자동완료 전부 큐 우선→BPA 폴백, 좌측 "기록" 패널 탭 겸용 | Q1~Q3 구현 완료·미커밋·Fly 미배포, Q4 배포+E2E 대기 (2026-10-23) |
| [multi-admin-trade-plan.md](multi-admin-trade-plan.md) | 멀티 어드민 트레이드(팀↔팀 선수 스왑) — RPC 설계 + 뎁스차트 정리 | 계획 |
| [multi-role-fit-score-toggle-plan.md](multi-role-fit-score-toggle-plan.md) | 멀티플레이어 역할 적합도 점수(ArchetypeRatings, playType 액터 선정용) 토글 노출 | 폐기 (2026-07-28) |
| [multi-player-archetype-tags-plan.md](multi-player-archetype-tags-plan.md) | 멀티플레이어 선수 정체성 아키타입(Primary/Secondary) + 14개 특성 태그 적용 | 폐기 (2026-07-28) |
| [fixed-day-schedule-plan.md](fixed-day-schedule-plan.md) | 고정 길이 가상 하루 스케줄 구조 전환 — 타임라인 표, 기간→시간대 역산, 리플레이 설정화, Realtime 증분 반영 | 결정 완료, 착수 대기 (2026-09-18) |
| [toast-notification-center-plan.md](toast-notification-center-plan.md) | 전역 토스트 알림 센터 — ZenGM notify/Notifications/logEvent 분석 + 우측 하단 스택·개별/전체 삭제·발생 화면 링크·localStorage 영속 설계 | 설계 (2026-10-02) |
| [multi-trade-cba-gaps.md](multi-trade-cba-gaps.md) | 멀티플레이어 트레이드 + CBA 미구현 체크리스트 13개(최저연봉 예외, 하드캡 영속화, TPE, 서명 직후 트레이드 금지, 서버 로스터 정원 강제, 문구/문서 갭) — 완료 때까지 매 세션 참조 | 진행 중 (2026-10-01) |
| [league-action-log-plan.md](league-action-log-plan.md) | 리그 세션 감사 로그 — 어드민 전용 `league_action_logs` 표 + DB 트리거 자동 기록(영입/방출/트레이드/블록/드래프트/설정/어드민) + 세션 설정 "로그" 탭 | 구현 완료 (2026-10-05) |
| [league-bootstrap-gate-plan.md](league-bootstrap-gate-plan.md) | 리그 진입 부트스트랩 게이트 — 공통 쿼리 9종 프리패치 후 홈 표시, 로딩 중엔 기존 스피너 유지(진행률 화면은 시도 후 폐기), 조용한 재시도 3초×3회, 확정 실패만 노출, 게이트 쿼리는 토스트 제외 | 구현 완료 (2026-10-06) |
| [tournament-personal-pack-draft-plan.md](tournament-personal-pack-draft-plan.md) | 토너먼트 전용 개인 팩 드래프트 — 참가 즉시 비동기 라운드제 드래프트, 룸 스코프 player instance로 meta_players 변경 없이 로스터 중복 허용 | 코드 완료 — Phase 1~8 + 3.5 전부 구현(시작 트리거·아카이브 후 정리·참가/드래프트 마감 자동 강퇴까지). DB 롤백 테스트 통과, 남은 건 fly.io 배포 후 브라우저 E2E(실제 경기 시뮬이 인스턴스 로스터로 도는지, 마감 강퇴 스윕 실동작) (2026-09-18) |
| [league-chat-plan.md](league-chat-plan.md) | 리그 세션 채팅 — `league_chat_messages` 테이블 + RPC `send_chat_message`(레이트 리밋) + Supabase Realtime Broadcast 비공개 채널(`realtime.send`), Fly 서버 미관여 | 계획 (2026-10-17) |
| [multi-ai-trade-plan.md](multi-ai-trade-plan.md) | 멀티 AI↔유저 트레이드 — 서버 평가기(가상 자정 지연 응답)+`ai_respond_trade_offer` 코어 공유, 리그 토글별 AI 판단 요소 on/off(`buildAiTradeRules`+`MULTI_SYSTEMS`), 남용 방지 | 계획, 결정 D1~D7 대기 — 세션 설정 "AI 트레이드" 섹션(토글·난이도·제한 수치) 포함 (2026-10-19) |
| [multi-ai-gm-profile-plan.md](multi-ai-gm-profile-plan.md) | 멀티 AI 단장 프로필 — `meta_gms` 실제 단장 고정 배정, 수치 4개(승부욕·깐깐함·로스터 구성 성향·부상 감수), 결정론적 시즌 상황 판정 + 현재 기조 라벨. AI 트레이드의 선행 작업 | G1·G2 순수 모듈 완료, G3 표시 위치 결정 대기 (2026-10-20) |
| [ai-coach-plan.md](ai-coach-plan.md) | 멀티 AI 감독 — 경기 직전 AI 팀 라인업(C2)·로테이션(C3)·공격 전술(C4)·단장 성격(C6) 설정. 현행 AI 전술 중간값 고정 대체 | C1·C2·C3·C7 구현·simRunner 연결 완료(2026-10-22), 실경기 데이터 수집 후 C4 결정 |
| [schedule-generator-v2.md](schedule-generator-v2.md) | 일정 생성기 v2 — 실측 NBA 패턴(요일 리듬·개막 2경기·마지막 날 30팀·B2B 12~17·4-in-5 금지) 재현, 같은 경기장 2연전, 올스타 일정 동시 생성(`leagues.season_calendar` 저장), 이동 거리 미반영 | S1~S3 구현 완료·미배포, 싱글은 기존 생성기 고정 (2026-10-23) |
| [team-chemistry-plan.md](team-chemistry-plan.md) | 멀티 팀 케미스트리 — 성격값(SaveTendencies) 기반 유형 9종(Leader·Workhorse·Linker·High Roller·Star·Dice·Bandit·Volatile·Mercenary), 화합력 5단계로 팀 전체 버프/디버프(Leader 없으면 버프 불가) | ⏸ 보류 — NBA Active 리그 종료 후 재논의. 성격 유형 9종 확정, 화합력 초안 3-0절, 성격 고정 버그는 Fly v201 배포 (2026-10-26) |
| [timeout-system.md](timeout-system.md) | 타임아웃 NBA 규정화 — 경기 7회, 4Q 진입 4회/막판 2회 캡, 연장 2회, 쿼터당 의무 타임아웃 2회(6:59/2:59), AI 타임아웃 예비분 로직 | 구현 완료(실엔진 밸런스 하네스 미실시) (2026-10-22) |
| [overtime-system.md](overtime-system.md) | 연장전 — 5분×최대 2회 후 결승 공격(정상 기록), 센터 신장·점프 점프볼(팁오프 포함), 연장 팀파울 4번째부터·타임아웃 2회(이월 없음), 연장 라인업 = 선발 기본·탈진 시 벤치·마지막 2분 주전 복귀, 멀티는 연장 경기만 연장 길이만큼 늦게 공개(`ot_periods` + `game_reveal_at()`), 리그 스위치 `overtime_enabled`(세션 설정 엔진 탭, 새 리그 기본 on), 올스타 포함. 화면: OT 라벨·점수판 OT 열·멀티 타임라인 5분 | P0~P4 완료, 배포(2026-10-26) — P5(공개 시각 E2E, Test League) 남음 |

# 멀티 연습 경기 (Practice Scrimmage)

작성: 2026-10-29 · 상태: **설계 확정, 착수 대기** (P0는 AI 감독 C4 커밋 이후)
관련: `docs/plan/multiplayer-fatigue.md`(체력 이월·자정 회복), `docs/plan/ai-coach-plan.md`(C4 공격 프리셋·C5 수비 연구), `utils/leagueTimeline.ts`(가상 하루 ↔ 실시간 매핑), `server/src/simRunner.ts`

---

## 0. 배경

사용자 요청: 멀티 세션에서 전술을 바꾼 뒤 시험해 볼 방법이 없어 다음 경기까지 기다려야 한다.
가상 하루는 19:00 → 다음 날 03:00을 실시간 D분(20~40, 기본 30)에 매핑하고 낮 시간은 흐르지 않으므로, **경기일에는 연습할 틈이 없다** → 휴식일에만 허용한다(실제로 비경기일에 훈련하는 것과도 맞는다).

## 1. 확정 사항 (2026-10-29 사용자 결정)

| 항목 | 결정 |
|---|---|
| 가능 시점 | 내 팀의 **휴식일**에만 |
| 횟수 | 휴식일당 팀당 **3회** (이월 없음, 2026-10-29 4회→3회) |
| 경기 길이 | **4쿼터 전체** (연장 없음 — 동점 허용) |
| 상대 | **29팀 중 하나를 골라 로스터만 복사** |
| 상대 슬라이더 | **내가 공격/수비 프리셋으로 지정** (상대 유저의 저장 전술은 절대 사용 안 함) |
| 상대 주전·로테이션 | AI 감독(`planAiTeam`)이 그 로스터 기준으로 생성 (상대 유저 뎁스차트 사용 안 함) |
| 상대 부상자 | 제외 |
| 상대 체력 | 100으로 시작 |
| 상대 쪽 결과 | 체력·기록·통계 어디에도 반영 안 함 |
| 내 팀 | **저장된 전술 프리셋에서 선택** — 뎁스·로테이션 프리셋 1개 + 팀 전술 프리셋 1개(`TacticPresetSelector`의 depth/team 프리셋, 각 최대 3개). 편집 중(미저장) 내용은 쓰지 않음 (2026-10-29 변경) |
| 내 팀 체력 | 48분 경기 후 **출전 분 비례로 고정 감소**: `20 × 출전 분 / 48`(뛰지 않으면 0). 엔진이 계산한 경기 후 체력은 쓰지 않음 (2026-10-29 확정) |
| 부상 | 없음 (`injuriesEnabled: false`, multiplayer-fatigue D5와 동일) |
| 결과 화면 | **라이브 게임 뷰(리플레이·공개 시각 대기) 없이 바로 결과 화면** — 기존 경기 화면 전체 탭 (박스스코어·샷차트·PBP·로테이션·온오프) |
| 보관 | 시즌 동안 보관, 본인 팀만 열람 |
| 수비 프리셋 | 아래 3-2의 6종 그대로 |
| 공격 프리셋 공용화 | AI 감독 C4 커밋 이후 진행 |

## 2. 휴식일·시간대 판정 (서버)

- 기준 날짜: `current_virtual_date(room_id)` 또는 `league_virtual_days` 행. **`rooms.sim_date` 직접 사용 금지**(실제 날짜임).
- 휴식일 = 가상 날짜 X에 내 팀 경기(`games.game_date = X`, 올스타 제외)가 없음.
- 허용 시간대 = 그 날의 `real_start_at ≤ now < real_midnight_at` (가상 19:00~24:00, D=30이면 실시간 약 19분).
  - 자정 이전으로 한정하는 이유: 가상 자정에 회복이 돌아 "연습 → 밤사이 회복" 순서가 맞고, 자정 이후 구간은 다음 날짜로 넘어가는 부분이다.
- 판정 대상 기간: 정규시즌·플레이오프(가상 타임라인이 있는 구간). 플레이오프 탈락 팀은 매일이 휴식일 — 허용(무해).
- 타임라인이 없는 방(토너먼트·구 리그)은 1차 범위에서 제외(버튼 비노출).

## 3. 상대 전술 프리셋

### 3-1. 공격 (8종 + 자동)

값 출처: `server/src/shared/game/tactics/aiCoach/offensePresets.ts`의 `BASE_PRESETS`(6) + `SPECIAL_PRESETS`(2). 슬라이더 8개(pace·ballMovement·offReb·insideOut·pnrFreq·shot_3pt·shot_mid·shot_rim)를 통째로 덮어쓴다.

| 키 | 표시 이름 |
|---|---|
| `AUTO` | 자동 (AI 감독이 로스터 보고 결정) — 기본값 |
| `POST` | 포스트업 |
| `ROLL` | 픽앤롤 빅 |
| `HANDLER` | 핸들러 |
| `SHOOTER` | 슈팅 |
| `SLASHER` | 돌파·속공 |
| `HUB` | 볼 무브먼트 |
| `PNR_DUO` | PnR 듀오 |
| `TWIN_TOWERS` | 트윈 타워 |

⚠️ `offensePresets.ts`는 2026-10-29 기준 다른 세션의 미커밋 파일(C4). C4 커밋 후 **값 표만** 공용 상수(`shared/game/config/stylePresets.ts` + 클라 미러)로 분리해 C4와 연습 경기가 같이 쓴다.

### 3-2. 수비 (6종, 확정)

| 키 | 표시 이름 | defIntensity | helpDef | switchFreq | defReb | zoneFreq | zoneUsage | pnrDefense | fullCourtPress |
|---|---|---|---|---|---|---|---|---|---|
| `MAN_BASE` | 맨투맨 기본 (기본값) | 5 | 5 | 5 | 5 | 1 | 5 | 1 (헤지) | 1 |
| `MAN_PRESSURE` | 압박 맨투맨 | 8 | 5 | 4 | 5 | 1 | 5 | 2 (블리츠) | 3 |
| `SWITCH` | 스위치 | 6 | 4 | 9 | 6 | 1 | 5 | 1 (헤지) | 1 |
| `DROP` | 림 앵커 드롭 | 4 | 8 | 2 | 7 | 1 | 5 | 0 (드롭) | 1 |
| `ZONE` | 지역방어 | 5 | 6 | 3 | 6 | 9 | 8 | 1 (헤지) | 1 |
| `FULL_PRESS` | 풀코트 프레스 | 7 | 5 | 5 | 5 | 1 | 5 | 2 (블리츠) | 9 |

- 기본값이 `DEFAULT_SLIDERS`가 아닌 이유: `DEFAULT_SLIDERS`는 zoneFreq 5(공격권 약 40% 지역방어)라 중립이 아니다(ai-coach-plan 2-12).
- C5 연구의 지배 전략 문제(헬프·지역방어 우위)는 여기서 다루지 않는다 — 연습 상대는 "실전에서 만날 스타일 재현"이 목적.
- 이 표는 연습 경기 전용 상수로 시작한다. C5가 확정되면 공용화 여부를 다시 본다.

## 4. 엔진 입력

### 4-1. 내 팀
- `simRunner`의 입력 준비 단계(선수 로드 `loadRoomPlayers` → 체력 따라잡기 `recoverPlayersThrough` → `room_player_state` 부상·체력 오버레이 → `buildTeamForSim`)를 **공용 함수로 추출**해 실전과 연습이 같이 쓴다. 연습만 따로 어긋나는 드리프트를 막는 핵심.
- 전술·뎁스차트: 요청의 `depthPresetSlot`·`teamPresetSlot`으로 저장된 프리셋을 서버가 직접 읽는다(클라이언트가 보낸 전술 본문은 받지 않음).
  - 검증: 프리셋의 선수 id가 현재 로스터에 없으면 그 선수 제외(프리셋 적용 시 `removedCount`와 같은 처리), 슬라이더 범위 클램프.

### 4-2. 상대 팀
- `league_teams.roster` 복사 → 같은 `loadRoomPlayers`(성장치·커스텀 오버라이드·개인 팩 instance id 자동 반영).
- 부상자 제외(현재 가상 날짜 기준 활성 부상 — simRunner 2.5단계와 같은 판정), 나머지 condition = 100.
- `planAiTeam(team, tactics, { opponentRoster: 내 로스터, offense: 프리셋이 AUTO일 때만 })`로 뎁스차트·로테이션 생성 → 슬라이더는 선택한 공격/수비 프리셋으로 덮어씀.
- 팀 id: 원래 slug 그대로 써도 내 팀과 겹치지 않음(내 팀은 선택 목록에서 제외).

### 4-3. simSettings
- 방 `sim_settings` + 정규화 컨텍스트(`resolveNormalizationContext`) + 시드 성향(`tendency_seed`) — 실전과 동일.
- `fatigueDrainMultiplier`는 방 설정값 그대로 — 경기 중 체력 변화는 경기 내용(교체·성공률)에만 쓰이고 저장하지 않는다.
- 왜 사후 공식인가(2026-10-29 하네스, NBA Active BOS vs DEN 20회): 엔진은 벤치 회복(분당 3)·쿼터 휴식·하프타임 회복 때문에 경기 종료 체력이 시작값과 무관하게 평형점으로 모인다. 배율 0.5면 평형점 약 98 → 체력 80에서 훈련하면 98로 **회복**, 배율 1(이 방 1.5)이어도 80 → 87~93으로 회복. 엔진 결과를 쓰면 "지친 팀은 훈련으로 체력 채우기" 공략이 생긴다.
- `injuriesEnabled: false`, `overtimeEnabled: false`, 백투백 false, `autoTimeoutAllTeams: true`.
- **엔진 코드 변경 없음** — 전부 기존 설정 키로 해결된다(4쿼터 전체로 결정되어 `periodsToPlay` 확장 불필요).

## 5. 체력 반영

- 경기 후 내 팀 선수별 `drain = PRACTICE_FATIGUE_K(20) × 출전 분 / 48`(박스스코어 출전 시간 기준, 미출전 0)을 **감소량으로** 반영: `condition = greatest(0, condition − drain)`.
  - 절대값 덮어쓰기 금지 — 자정 회복 RPC(`apply_fatigue_recovery`, "읽은 값 그대로일 때만 반영")와 경합 시 값이 유실된다. 감소량 반영이면 회복 RPC가 그 행을 건너뛰고 다음 자정에 새 값 기준으로 다시 계산한다.
- `last_game_date`·`condition_recovered_through`·`games`는 건드리지 않는다.
  - 결과: 연습한 날도 **휴식일 회복**(`fatigueRestDayKeep` 0.25 — 결손의 75% 회복)이 적용되고, 다음 경기의 백투백 판정에도 영향이 없다.
- 상대 팀 체력은 저장하지 않는다.
- 참고(K=20, 회복 보정 제외): 36분 주전은 회당 −15, 3회 −45(100→55) → 휴식일 자정 회복(결손 25% 유지) 후 다음 경기 약 89. 30분 선수는 회당 −12.5, 다음 경기 약 91. 실경기 주전급 소모는 경기당 약 10~17(NBA Active 실측) — 훈련 1회 ≈ 실경기 1경기. 의도된 트레이드오프.
- 같은 날 2·3회째 훈련은 낮아진 체력으로 시작하므로 경기 내용(교체 빈도·성공률)에 피로가 반영된다. 체력 35 미만이면 엔진 부상 확률이 오르지만 훈련은 부상 꺼짐.

## 6. 서버 API·DB

### 6-1. `POST /practice` (Fly)
```
body: { roomId, opponentTeamId, offensePreset, defensePreset, depthPresetSlot, teamPresetSlot }
```
1. JWT → 호출자가 `room_members`에서 그 방의 사람 팀 주인인지 확인
2. 휴식일·시간대 확인(2절), 남은 횟수 사전 확인(빠른 실패용)
3. 입력 준비(4절) → `simWorkerPool`에서 시뮬레이션 — 실경기 작업보다 낮은 우선순위(큐 뒤로)
4. RPC `apply_practice_result` 한 번으로 원자 처리: 슬롯 확보(횟수 차감) + `practice_games` insert + 체력 감소 반영
5. 응답: `practice_games` 행 id + 결과(클라이언트가 바로 렌더)

### 6-2. 테이블 `practice_games`
| 컬럼 | 설명 |
|---|---|
| `id` uuid PK | |
| `room_id`, `team_id`, `season_number`, `virtual_date`, `slot` (1~3) | **unique (room_id, team_id, virtual_date, slot)** — 동시 요청 방지 |
| `opponent_team_id`, `offense_preset`, `defense_preset` | |
| `my_score`, `opp_score` | 목록 표시용 |
| `result` jsonb | 박스스코어·PBP 로그·샷 이벤트·로테이션 데이터(결과 탭이 쓰는 것만) |
| `created_at` | |

- RLS: 본인 팀 행만 select. insert는 서버(service role)만. 관전 모드·다른 유저 노출 없음(전술 유추 방지).
- 보관: 시즌 동안. 다음 시즌 진입 시(오프시즌 전환) 이전 시즌 행 삭제.
- 용량 추정: 실경기 `game_pbp` 평균 약 73KB/경기(2026-10-29 최근 300경기). 휴식일 약 90일 × 3회 × 30팀을 전부 쓰는 최악의 경우 시즌당 약 8천 경기 ≈ 0.6~0.8GB, 실사용률을 감안하면 훨씬 적다. 문제가 되면 `result`에서 PBP 로그를 빼고 요약만 남기는 쪽으로 축소.

## 7. UI (2026-10-29 목업 확정: https://claude.ai/artifact/Q8noraocakoTWxTMLC1ufA)

멀티 전술 화면에 탭 2개 추가 — 순서 `뎁스 차트 · 로테이션 | 트레이닝 세션 | 트레이닝 기록 | 팀 전술 | 인사이트`. 화면 안 설명글(제목 옆 부연·안내 칩·버튼 옆 설명)은 두지 않는다.

- 데스크톱 본문(팀 전술 탭과 같은 툴바: slate-800 · 아래 선 slate-600 · 제목 16/900), 1 : 2 폭:
  - **우리 팀** — 뎁스·로테이션 프리셋 드롭다운 + 팀 전술 프리셋 드롭다운(`DropdownButton` h-8). 고른 프리셋의 주전/벤치 표(POS · OVR · 선수 · 체력 막대+값 · 분).
  - **상대** — 패널 하나 안을 2단으로: **팀 선택**(팀 드롭다운 29팀 → AI 감독이 자동 설정한 주전/벤치 표: POS · OVR · 선수 · 분, 로테이션 매트릭스는 표시 안 함) / **전술 선택**(공격·수비 프리셋 드롭다운 + 슬라이더 8개 값 읽기 전용).
- **트레이닝 세션 탭**: 탭 바 바로 아래 **시작 바**(높이 64): 휴식일 칩 · 남은 횟수 블록 3/3 · [훈련 시작](primary). 그 아래 3단. 우리 팀 표는 체력 막대 옆에 체력 값 표시.
  - 누르면 바가 "시뮬레이션 중…"(스피너 + 하단 진행선)으로 바뀌고 3단 패널 잠금 → 끝나면 라이브 없이 결과 화면으로 이동.
  - 잠김 3종(경기일 · 시간 종료 · 3회 소진)은 버튼만 비활성, 선택은 미리 가능.
- **트레이닝 기록 탭**(별도 탭) = 팀 탭 경기 기록 표(`components/roster/TeamGameLog.tsx`)와 같은 형태: 날짜 · 상대(colSpan 2, 상대 전술 프리셋을 이름 옆 12px slate-500) · 결과(W/L + 스코어 링크) · 스탯 21열 · 섹션 행(정규 시즌/플레이오프) · 평균 푸터. 폰은 G1 카드형.
- 결과 화면: 라이브 게임 뷰(`MultiGamePbpView`의 리플레이·`multiGameReveal` 공개 시각·라이브 점수판)는 쓰지 않는다 — `practice_games.result`만 받는 별도 뷰. 헤더는 경기 종료 화면(G6) 구조 + "훈련" 칩 + 상대 전술 표시, 체력 변화(전→후) 섹션, 탭은 기존 컴포넌트 재사용(props 주입형).
  - 1경기 결과는 분산이 크다는 안내 문구(13~20경기 표본에서도 3점 ±5~7%p — engine-anatomy 14절).
- 폰: 트레이닝 세션 탭은 같은 순서로 세로 스택(우리 팀 → 상대 팀 → 상대 전술), 하단 56 바에 [훈련 시작]. 트레이닝 기록 탭은 G1 카드형. 프리셋·팀 선택은 액션 시트.

## 8. 단계

| 단계 | 내용 | 선행 |
|---|---|---|
| P0 | 공격 프리셋 값 표 공용화(`stylePresets.ts` 서버·클라 미러) + 수비 프리셋 6종 상수 | C4 커밋 |
| P1 | `simRunner` 입력 준비 공용 함수 추출 — 실경기 동작 불변(하네스로 같은 시드 결과 동일 확인) | — |
| P2 | 훈련 체력 상수 `PRACTICE_FATIGUE_K = 20`(서버) | — |
| P3 | DB: `practice_games` + RLS + RPC `apply_practice_result` + 휴식일 판정 함수 | — |
| P4 | Fly `POST /practice` + 워커 풀 우선순위 | P1~P3 |
| P5 | 클라: 트레이닝 세션·트레이닝 기록 탭, 결과 화면 — **구현 완료(2026-10-29, 미커밋)**. P3 마이그레이션 운영 DB 적용 완료, P4 서버 코드 완료·Fly 미배포 | P4 |
| P6 | E2E: Test League 휴식일에 3회 실행 → 체력 감소·자정 회복·횟수 제한·다른 계정 열람 불가 확인 | P5 |

배포: 서버는 `scripts/deploy-server.sh`로만. 엔진 로직 변경이 생기면 dev-log에 Before/After 기록.

## 9. 범위 밖
- 체력 회복·능력치 성장이 붙는 훈련 시스템(`training-system.md`, 싱글 전용)
- 상대 슬라이더 개별 조정(프리셋만)
- 타임라인 없는 방(토너먼트·구 리그) 지원
- 연습 결과의 리그 공개·랭킹

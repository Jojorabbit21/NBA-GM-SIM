# 고정 길이 가상 하루(Fixed-Day) 스케줄 구조 전환 계획

작성일: 2026-09-18
상태: **1단계 완료(fly v155) → 2단계 완료(fly v156) → 3단계 완료(2026-09-18, DB RPC + 클라이언트, 서버 변경 없음)**

## 1. 배경

멀티플레이어 리그의 날짜 진행에서 두 가지 모순이 보고됐다.

1. 같은 가상 날짜 안에서 늦은 시간대(22:00) 경기가 이른 시간대(19:30) 경기보다 먼저 시작.
2. 1일차 경기가 진행 중인데 헤더는 2일차로 바뀌고, 곧이어 2일차 경기가 시작되는 것처럼 보임.

조사 결과(dev-log 2026-09-18 항목 참조):

- 원인 1(순서 뒤집힘): `scheduleGenerator.ts`의 `assignGameTimes()`가 날짜별 복사본만 정렬해 `time`을 붙이고, 압축기는 원본 배열 순서로 실제 시각을 배정. 현재 리그 168일 중 162일에서 발생.
- 원인 2(동시 진행 체감): 실제 시각 기준 겹침은 0건. "오늘" 판정이 "가장 가까운 경기"라 10분 전환 간격의 중간에 미리 넘어가고, 날짜 간 여유가 리플레이 길이와 같아 0초이며, 화면별 시계가 다름.

근본 원인은 **가상 하루의 실제 길이가 그날 경기 수에 비례**하는 구조다. 경기 없는 날은 0초, 9경기인 날은 약 21분이라 "지금이 며칠인가"를 시간으로 정할 수 없고 경기 역산에 의존하게 된다.

## 2. 확정된 설계 원칙 (2026-09-18 결정)

| 항목 | 결정 |
|---|---|
| 가상 하루의 실제 길이 D | 고정. 세션 생성 시 선택, 기본 30분, 범위 20~40분 |
| 실제 기간 | 세션 생성 시 시작일과 종료일을 먼저 정함(예: 월~일 7일) |
| 일일 시뮬 시간대 | 입력하지 않음. 기간 + D에서 **계산**. 불가능하면 세션 생성을 막고 사유와 대안을 안내 |
| 가상 시계 매핑 | 가상 19:00 → 다음 날 03:00(8시간)을 D분에 선형 매핑. 낮 시간은 흐르지 않음 |
| 날짜 전환 시점 | 가상 자정 = D의 5/8 지점. 22:00, 22:30 경기는 날짜가 바뀐 뒤 종료됨(현실의 심야 경기와 동일) |
| 경기 없는 날 | 휴식일, 올스타 브레이크, 플레이오프 빈 날 전부 D 그대로 적용 |
| 리플레이 길이 | 리그 설정. 선택지 5 / 8 / 10 / 12분, 기본 10분 (2단계) |
| 플레이오프 페이스 | 리그 생성 시 **매일 / 격일** 선택(`playoff_game_interval_days` 1 또는 2, 기본 1). 짧은 리그는 매일, 3~4주 리그는 격일이 자연스러움. 빈 날은 시간 흐름에 맡김 |
| 가상 시계 헤더 표시 | 보류. 이번엔 날짜만 |
| 진행 중 "NEW LEAGUE" | 삭제 |
| Realtime 병목 | 경기 갱신 시 전체 일정 재조회 대신 증분 반영 (2단계) |
| 작업 순서 | 3단계로 분리 (1: 구조 전환, 2: 설정 자유도·성능, 3: 어드민 강제 진행) |

## 3. 핵심 모델

### 3.1 타임라인(가상 날짜 → 실제 시각 표)

리그 생성 시 가상 캘린더 전체(정규시즌 첫날 ~ 플레이오프 최대 마지막 날)를 하루씩 실제 시각에 대응시켜 **명시 저장**한다. 클라이언트와 SQL이 같은 표를 읽으므로 계산 불일치가 생기지 않는다.

```
league_virtual_days
  league_id        uuid
  virtual_date     date          -- 가상 캘린더 날짜
  day_index        int           -- 0부터
  kind             text          -- regular | rest | allstar_announce | allstar_rising | allstar_contests | allstar_main | playoff
  real_start_at    timestamptz   -- 이 가상 하루가 시작되는 실제 시각 (가상 19:00)
  real_midnight_at timestamptz   -- real_start_at + D × 5/8 (가상 00:00, 날짜 전환 시점)
  real_end_at      timestamptz   -- real_start_at + D (가상 03:00)
  primary key (league_id, virtual_date)
```

배치 규칙:

- 실제 하루에 k개의 가상 하루를 담는다. `k = ceil(V_max / realDays)`, `V_max` = 정규시즌 캘린더 일수 + 플레이오프 최대 캘린더 일수.
- 일일 시뮬 시간대 길이 = `k × D`. 시작 시각은 관리자가 고르고(기본 10:00), 종료 = 시작 + k×D.
- 가상 하루는 실제 하루의 창 안에 온전히 들어간다. 창이 끝나면 다음 실제 날짜의 창 시작으로 이어진다.
- 마지막 실제 날짜는 남은 가상 일수만큼만 담는다.

### 3.2 경기 실제 시각 배정

```
scheduled_at = real_start_at(가상 날짜)
             + (가상 시각 − 19:00) × (D / 480분)
clamp: scheduled_at ≤ real_end_at − replay
```

- D=30, 리플레이 10분: 슬롯 간격 112.5초, 22:30 경기는 13분 7초에 시작해 23분 7초 종료, 자정은 18분 45초.
- D=20, 리플레이 12분: 22:30 경기가 8분 45초 시작 → 20분 45초 종료라 초과 → clamp로 8분 시작. 이런 압축은 생성 시 경고로 표시.
- 순서는 가상 시각에서 계산되므로 원인 1이 구조적으로 사라진다. 같은 슬롯(최대 3경기)만 동시 시작.

### 3.3 "오늘" 판정 (클라이언트 함수 + SQL `current_virtual_date` 동일 규칙)

```
row = league_virtual_days 중 real_start_at ≤ now 인 마지막 행
if row 없음        → 첫 행의 virtual_date (시즌 시작 전)
if now < row.real_midnight_at → row.virtual_date
else                          → row.virtual_date + 1일
```

창과 창 사이(실제 밤 시간)에는 마지막 행의 자정을 지났으므로 자동으로 다음 가상 날짜가 된다. 휴식일에도 행이 있어 `+1일`이 항상 다음 행의 날짜와 일치한다.

### 3.4 실현 가능성 판정 (세션 생성 모달)

입력: 시작일, 종료일, D, 창 시작 시각. 계산 순서:

1. `realDays = 종료일 − 시작일 + 1`
2. `V_max = 정규시즌 캘린더 일수(현재 175) + 플레이오프 최대 일수(§3.5)`
3. `k = ceil(V_max / realDays)`, `창 길이 = k × D`
4. 불가능 조건: `창 시작 + 창 길이 > 24:00`
5. 불가능하면 생성 버튼 비활성화 + 안내: "이 설정으로는 세션을 구성할 수 없습니다. 종료일을 N일 뒤로 미루거나, 하루 길이를 M분 이하로 줄이거나, 시작 시각을 HH:MM 이전으로 당기세요." (셋 다 계산해 제시)
6. 가능하면 요약 표시: 창 시간대, 하루 가상 일수 k, 정규시즌 종료 예상일, 플레이오프 최대 종료일.

### 3.5 플레이오프 가상 캘린더 (생성 시 확정, 간격은 리그 옵션)

정규시즌 종료 다음 날을 day 1로 두고, 간격 `g`(= `playoff_game_interval_days`, 1 또는 2)를 적용한다.

- 플레이인: day 1 (7v8, 9v10 양 컨퍼런스), day 1+g (패자부활 결정전)
- 1라운드: day 1+2g 시작. 시리즈 안 경기는 g일 간격(G1 d, G2 d+g, … G7 d+6g)
- 다음 라운드는 직전 라운드 G7 가능일 + g에 시작
- 최대 일수: 플레이인 (1+g) + 4라운드 × (6g+1) + 라운드 사이 3g

| 간격 g | 플레이인 | 라운드당 | 최대 총 일수 |
|---|---|---|---|
| 1 (매일) | 2일 | 7일 | **30일** |
| 2 (격일) | 3일 | 13일 | **59일** |

시리즈가 일찍 끝나면 그 날짜들은 비어 있는 채로 시간이 흐른다. 결승이 끝나면 즉시 리그 종료 처리.

참고 수치 — 7일 기간, 매일 규칙(V_max = 175 + 30 = 205, k = 30):

| D | 창 길이 | 창 예시(10:00 시작) |
|---|---|---|
| 20분 | 10시간 | 10:00 ~ 20:00 |
| 25분 | 12시간 30분 | 10:00 ~ 22:30 |
| 30분 | 15시간 | 09:00 ~ 24:00 (시작 09:00 이전 필요) |
| 35분 | 17시간 30분 | 06:30 이전 시작 필요 |
| 40분 | 20시간 | 04:00 이전 시작 필요 |

같은 7일에 격일 규칙(V_max = 234, k = 34)이면 D=30에서 17시간 창이 필요하다. 28일 기간이면 격일 규칙도 k = 9, D=30에서 4시간 30분 창으로 충분하다. 생성 모달의 실현 가능성 판정이 선택된 g를 그대로 반영하므로, 불가능한 조합은 그 자리에서 안내된다.

## 4. 1단계 — 구조 전환 (원인 1, 2 해결)

### 4.1 DB

- [x] `league_virtual_days` 테이블 + RLS(리그 멤버 SELECT, 어드민/서비스 WRITE) 마이그레이션 — `migrations/add_league_virtual_days_fixed_day_schedule.sql`(적용 완료)
- [x] `leagues`에 `day_length_min int`, `real_start_date date`, `real_end_date date`, `playoff_game_interval_days int default 1`, `daily_window_start_min`(기존 재사용) 추가. `duration_weeks`, `daily_window_end_min`은 더 이상 입력값이 아님(파생값, 하위호환용으로 유지)
- [x] `current_virtual_date(p_room_id)` 본문을 §3.3 규칙으로 교체. 폴백: 표가 비어 있으면(구 리그) 기존 "가장 가까운 경기" 로직 유지
- [x] `reschedule_league_games` RPC는 제거하고 타임라인 행+경기 시각+설정을 한 트랜잭션에 적용하는 `apply_league_reschedule(p_league_id, p_from_virtual_date, p_days, p_games, p_settings)`로 대체

### 4.2 서버 (`server/src/shared/`, 클라이언트 미러 동시)

- [x] `leagueTimeline.ts`(신규, 미러 쌍 `server/src/shared/` ↔ `utils/`): `buildVirtualCalendar`, `computeTimelineFeasibility`, `buildLeagueTimeline`, `assignRealTimes`, `resolveVirtualDate`, `playoffMaxDays`, `playoffTimeSlot`, `allStarScheduleFromTimeline`. 서버 DB 접근은 `server/src/shared/timelineStore.ts`
- [x] `leagueScheduleCompressor.ts` 폐기(서버·클라이언트 둘 다, `firstDayStartMin` 포함)
- [x] `scheduleGenerator.ts`: `assignGameTimes()` 직후 날짜·시간 안정 정렬 (서버 + `utils/scheduleGenerator.ts` 미러). 가상 캘린더 일수는 `buildVirtualCalendar()`가 날짜 범위에서 직접 계산
- [x] `finalize.ts`: 압축기 호출을 `buildMainLeagueSchedule()`(타임라인 생성 + 실제 시각 배정)으로 교체. 첫 슬롯은 드래프트 완료 시각 + 5분 이후. `allstar_schedule`은 타임라인의 해당 kind 행 `real_start_at`으로 채움(스케줄러 트리거 로직은 그대로)
- [x] `playoffSeeder.ts` / `playInSeeder.ts` / `simRunner.ts`(메인리그 경로): 브라켓 엔진에 interval=1440·g분을 넘겨 슬롯 1개=g일로 재사용하고 scheduled_at은 `fillPostseasonRealTimes()`로 표에서 채움. 타임라인 없는 구 리그·토너먼트는 예전 슬롯 방식 그대로. §3.5 규칙(간격 g 파라미터)으로 `game_date`를 정하고 `scheduled_at`은 타임라인 행에서 조회. 시리즈 경기 시각은 19:00 단일 슬롯(동일 날짜 여러 시리즈는 19:00/19:30/20:00으로 분산)
- [x] 스케줄러 `advanceSimDates`(rooms.sim_date): 변경 없음(select에 새 컬럼만 추가)

### 4.3 클라이언트

- [x] `services/multi/timelineQueries.ts`(신규) + `useCurrentLeague().timeline` — 리그 진입 시 1회 로드, leagues 행 UPDATE 시 함께 재조회
- [x] `multiScheduleUtils.ts`의 `findCurrentVirtualDate/Game`: 5번째 인자 `timeline` — 있으면 `resolveVirtualDate`, 없으면 기존 로직 폴백. 호출부 11곳 + `useCurrentVirtualDate` + GameDateStrip prop 갱신. `kstDateKey/fmtTime`은 메인리그면 플레이오프도 가상 날짜/시간 사용
- [x] `components/MultiHeader.tsx`: `Date.now()` → `useServerClock()`; `useCurrentVirtualDate`도 서버 보정 15초 버킷
- [x] `CreateLeagueModal.tsx`: "정규시즌 기간(주) + 시간대" 입력을 "시작일/종료일 + 하루 길이(20~40, 기본 30) + 창 시작 시각 + 플레이오프 경기 간격(매일/격일, 기본 매일)"으로 교체. §3.4 실현 가능성 판정과 안내 문구, 요약 표시
- [x] `views/multi/league/settings/ScheduleSettingsTab.tsx`: 설정 패널을 "하루 길이 / 종료일 / 창 시작 시각"으로 교체. "남은 경기 재배치"는 다음 창 시작부터 남은 가상 날짜를 타임라인에 다시 배치하고 경기 시각·`game_seq`·`allstar_schedule`을 갱신. 일정표에 가상 날짜별 실제 시작/자정/종료 시각 열 추가
- [x] 리그 홈/일정/스트립의 "오늘" 배지: 위 함수 교체로 자동 반영

### 4.4 데이터 정리

- [x] 진행 중 "NEW LEAGUE"(league_id 2a2b9830-…) 삭제 — SQL로 삭제, CASCADE로 rooms/games/league_teams/game_pbp/league_events까지 0건 확인
- [x] 종료된 리그(MAIN 2, PBL)는 타임라인 없음 → 폴백 로직으로 기존과 동일하게 표시

### 4.5 검증

- [x] 단위: 7일 × D 20/25/30/35/40, 14일 × D30 — 창 길이·k·불가능 판정·대안 제시가 §3.5 표와 일치(스크래치 tsx)
- [x] 단위: 실제 생성기 출력 1,230경기로 — 모든 경기 `scheduled_at + 10분 ≤ real_end_at`, 같은 날짜 안 순서 = 가상 시간 순서, 다른 날짜 간 겹침 0, game_seq 단조 증가, 올스타 4종 시각 순서, "오늘" 규칙(시작 전/자정 전후/창 종료 후)
- [ ] DB(실기 후): 같은 날짜 안 시간 순서 위반 0건, 서로 다른 날짜 라이브 창 겹침 0건, `current_virtual_date`가 임의 시각에서 클라이언트 함수와 동일 — 새 리그 생성 후 확인
- [ ] 실기: 새 리그 생성 → 드래프트 → 첫 실제 하루 관전. 자정 전환 시 22:00·22:30 경기가 라이브 상태로 다음 날짜에 걸리는지, 다음 가상 날짜 첫 경기가 창 안 정확한 시각에 시작하는지
- [x] fly.io v155 배포(2026-09-18 02:42Z), 부팅 로그 정상

## 5. 2단계 — 설정 자유도와 성능

### 5.1 리플레이 길이 설정화 (5 / 8 / 10 / 12분, 기본 10)

- [x] `leagues.replay_minutes int default 10` (check 1~30) — `migrations/add_replay_minutes_and_incremental.sql`(적용 완료)
- [x] 4개 미러 교체: 클라이언트 `multiGameReveal.ts`(`setActiveReplayMinutes`/`getReplayDurationMs`, `useCurrentLeague`가 주입), 서버 `liveGameView.ts`(replayMs 인자) + `replayConfig.ts`(방→리그 조회, 60초 캐시), 타임라인 `assignRealTimes` clamp(finalize/seeders/일정 탭이 `replay_minutes` 전달), DB 함수 7개(`room_replay_interval(p_room_id)` 헬퍼로 일괄 치환 — get_league_season_awards_stats / get_player_season_stats_batch·full·league / get_player_shot_events / get_team_opponent_zone_stats / get_team_season_advanced_stats)
- [x] `game_pbp`·`league_events` SELECT 정책의 `'00:10:00'::interval`도 헬퍼로 교체
- [x] 생성 모달·일정 탭에 5/8/10/12 선택지. `computeTimelineFeasibility(replayMin)`이 D ≥ 리플레이 + 2 검사
- [x] `lateGameClampsAt(D, replay)` — 생성 모달·일정 탭에 경고(예: D=20·리플레이 12)

### 5.2 Realtime 증분 반영

- [x] `hooks/useMultiGameData.ts`: `games` 변경 시 `payload.new`를 `rowToGame`으로 변환해 해당 경기만 교체/추가, DELETE는 제거(PK만 오는 payload.old 사용)
- [x] `rowToGame`을 `gameQueries.ts`에서 export
- [x] 재연결(SUBSCRIBED) 시의 전체 재조회 1회는 유지
- [ ] 검증(실기 대기): 경기 1건 종료 시 네트워크 탭에서 `games` 전체 조회가 발생하지 않음, 순위표·스트립이 즉시 갱신됨 — 새 리그 생성 후 확인

### 5.3 문서

- [x] `docs/simulation/schedule-generator.md` 타임라인 절, `docs/history/dev-log.md` 1·2단계 항목
- [x] 이 문서를 `docs/plan/plan-index.md`에 등록

## 6. 3단계 — 어드민 강제 진행 (시간 점프)

### 6.1 개념

어드민이 "한 경기 / 하루 / 특정 날짜까지"를 즉시 진행시킨다. 새 구조에서는 결과 공개(`scheduled_at + replay`)와 "오늘"(타임라인 행의 `real_midnight_at`)이 전부 실제 시각으로 정해지므로, 경기만 미리 계산하면 결과가 원래 시각까지 숨겨진 채 남는다. 따라서 강제 진행은 **남은 타임라인과 미실행 경기의 실제 시각을 Δ만큼 앞당기는 시간 점프**로 구현한다. 점프 뒤에는 스케줄러가 평소처럼 "예정 시각이 지난 경기"를 처리하고, 모든 화면이 같은 표를 읽으므로 참가자 전원에게 즉시 일관되게 반영된다.

### 6.2 범위 세 가지

| 범위 | 동작 | Δ 계산 |
|---|---|---|
| 한 경기 | 기존 `forceStartNow`와 동일. 해당 경기의 `scheduled_at = now`. 60초 안에 계산되고 리플레이가 지금부터 재생 | 타임라인 이동 없음 |
| 하루 (가상 날짜 하나) | 그 가상 날짜의 실제 종료 시각이 "지금 − 리플레이"가 되도록 남은 타임라인 전체를 앞당김. 그날 경기는 전부 즉시 계산되고 결과가 바로 공개됨 | Δ = `real_end_at(대상일) + replay − now` |
| 특정 날짜까지 (기간) | 위와 같되 대상일이 기간의 마지막 날. 여러 가상 날짜가 한 번에 과거가 되어 스케줄러가 백로그로 처리 | Δ = `real_end_at(마지막 날) + replay − now` |

점프 후 두 가지 모드 중 하나를 고른다.

- **앞당기기(기본)**: 남은 일정이 Δ만큼 통째로 당겨져 리그가 그만큼 일찍 끝난다. 계산이 단순하고 예측 가능.
- **종료일 유지**: 점프 뒤 남은 가상 날짜를 원래 종료일까지 다시 펼친다(일정 탭 재배치와 같은 로직, k가 작아짐). 남은 창이 짧아져 하루 가상 일수가 줄어든다.

### 6.3 구현

- [x] 서버 엔드포인트 대신 **DB RPC `admin_time_jump(p_league_id, p_through_virtual_date, p_days, p_games, p_note)`**(`migrations/add_admin_time_jump.sql`, 적용 완료) — SECURITY DEFINER + 어드민 검증. 한 경기는 기존 `/sim-override`(즉시 시작) 재사용. 스케줄러 즉시 tick 호출은 생략(30초 폴링으로 충분).
- [x] 서버 처리 순서(RPC 1개, 원자적):
  1. Δ = 대상 행 real_end_at − now() (대상일 종료가 정확히 지금이 됨), 대상 행이 이미 과거면 거부
  2. 대상일 이하 & `real_end_at > now` 행 `−Δ`(진행 중인 행 포함). **대상일 이후 행은 균일 이동 대신 클라이언트가 지금+2분부터 창 격자에 다시 깐 행(p_days)으로 교체** — 균일 이동은 일일 시뮬 창 밖(심야)으로 밀려 채택 불가
  3. 대상일 이하 미실행 경기 `scheduled_at −Δ`; 대상일 이하 **이미 실행됐지만 아직 라이브인 경기(선행 계산 포함)**는 `games.scheduled_at`·`game_pbp.game_start_time` 모두 `−Δ` → 즉시 종료 공개; 대상일 이후 미실행 경기는 p_games의 새 시각/순번
  4. `leagues.allstar_schedule`은 표의 4종 행에서 재계산(4종이 모두 있을 때만), `real_end_date`는 표의 마지막 종료(KST)로 갱신
  5. 모드(앞당기기=하루당 가상 일수 유지 / 종료일 유지=종료일에 맞춰 재계산) 차이는 클라이언트 `buildJumpPlan()`의 p_days 계산에만 있음
  6. (생략) 스케줄러 30초 폴링이 백로그를 `scheduled_at` 순으로 처리
- [x] 스케줄러: 백로그 처리는 기존 `runSimGames`가 `scheduled_at` 오름차순으로 처리하므로 추가 로직 없음. 워커 1개 기준 경기당 약 1.6초 — 하루(≤9경기) 15초, 1주(약 60경기) 100초, 시즌 전체(약 1,300경기) 약 35분. `DUE_QUERY_LIMIT`(500)에 걸리면 다음 tick에서 이어 처리되므로 정확성엔 영향 없음.
- [x] 어드민 UI: 세션 설정 **일정 탭**에 "강제 진행(시간 점프)" 섹션 — 대상(현재 가상 날짜까지 / 특정 날짜까지), 모드(앞당기기/종료일 유지), 영향 요약(지나가는 일수·계산될 경기·예상 소요·라이브 수·진행 후 현재 날짜·다음 슬롯·남은 일정 종료), 확인 창, 실행 후 5초 폴링으로 "예정 시각이 지난 미실행 경기 N건" 표시(최대 15분). 경기 행에 ▶ "지금 바로 시작" 버튼(기존 `/sim-override`).
- [x] 로그: 뉴스피드에 노출되지 않도록 `league_events` 대신 `leagues.time_jump_log`(jsonb 배열)에 누가/언제/어디까지/Δ/건수/실행 전 미종료 행 스냅샷 기록.

### 6.4 부작용과 처리

- 가상 날짜 기반 시스템(트레이드 데드라인, 부상 복귀일, 뉴스 `sim_date`, 투웨이 데드라인)은 전부 타임라인을 따르므로 자동으로 함께 이동한다.
- 하루 1회성 작업은 건너뛴 날짜만큼 생략된다: 올스타 팬 투표 스냅샷(가상 날짜당 1행)은 점프 구간의 날짜가 비고, 월초 파워랭킹은 여러 달을 한 번에 넘으면 마지막 달만 게시된다. 점프 확인 창에 이 사실을 명시한다.
- 라이브 관전 중인 사용자는 점프 순간 화면이 "종료"로 전환된다. 점프 전 확인 창에 현재 라이브 경기 수를 표시한다.
- 되돌릴 수 없다. 점프 전 타임라인 스냅샷을 `league_events` payload에 남겨 수동 복구 근거로 삼는다.
- 플레이오프 구간 점프: 시리즈 결과에 따라 다음 라운드 경기가 생성되므로, 한 번의 점프로 "결승까지"를 처리하려면 스케줄러가 라운드 생성 → 다음 tick 계산을 반복해야 한다. 이미 그렇게 동작하므로 추가 로직은 없지만 소요 시간이 tick 간격(30초)만큼 라운드마다 늘어난다.

### 6.5 검증

- [x] 롤백 트랜잭션 테스트(DO 블록): Δ=50분, 대상일 이하 행 −Δ(진행 중 행 포함), 이후 4행 재배치(지금+2분부터), 미실행 경기 −Δ, 라이브 경기 `games`·`game_pbp` 모두 −Δ로 즉시 종료, `current_virtual_date` = 대상일+1, 로그 1건, `real_end_date` 갱신 — 전부 기대값과 일치
- [ ] 실기(리그 생성 후): 하루 점프 → 그날 경기 전부 `played = true`, 헤더 날짜 = 다음 날, 순위표 반영
- [ ] 기간 점프(1주): 처리 순서가 `scheduled_at` 오름차순, 중간 날짜의 뉴스 `sim_date`가 각자의 가상 날짜로 기록됨
- [ ] 실기: `종료일 유지` 모드에서 마지막 행의 `real_end_at`이 원래 종료일 창 안에 있음
- [ ] 올스타 브레이크를 포함한 점프: 서브 이벤트 4종이 건너뛰지 않고 순서대로 실행됨(`allstar_schedule` 이동 확인)

## 7. 남은 확인 사항

- 창 시작 시각 기본값은 10:00으로 가정했다.
- 플레이오프 간격은 옵션으로 확정(2026-09-18). 일정 탭에서 시즌 중 변경은 허용하지 않는다(타임라인 길이가 바뀌므로 생성 시에만 결정).
- 3단계 "종료일 유지" 모드는 1차에 함께 구현했다(클라이언트 계산 차이뿐이라 비용이 없었음).

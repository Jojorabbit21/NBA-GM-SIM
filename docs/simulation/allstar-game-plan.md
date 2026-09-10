# 올스타 경기 시뮬레이션 — 개발 계획안

> 상태: **설계 단계(미구현)**. 이 문서는 실제 코드 작업 전 방향을 정리한 계획서다.
> 선발/투표/뉴스 파이프라인은 이미 구현 완료 — 이 문서는 그 다음 단계(본경기 + 부대
> 이벤트 시뮬레이션)를 다룬다. 본경기는 §1~§5, 덩크 컨테스트/3점 챌린지/라이징스타
> 챌린지는 각각 §6~§8에 별도 계획으로 정리했다.

## 0. 지금까지 구현된 것 (전제)

- **선발 로직**: `utils/allStarSelection.ts` / `server/src/shared/multi/allStarSelection.ts`(미러) —
  `getAllStarKeyDates(virtualSeasonYear)`(투표 시작/중간집계 3회/마감/올스타전 기간),
  `runAllStarVote()`(팬 투표 리더보드), `runAllStarSelection()`(스타터 5+리저브 7, 컨퍼런스별)
- **서버 자동화**: `server/src/postAllStarVoteNews.ts` — 가상 날짜 기준 하루 1회
  `league_allstar_votes`에 득표 스냅샷 저장 + 투표 시작/중간집계/결과 뉴스
  (`league_events`의 `allstar_vote_start`/`allstar_vote_update`/`allstar_vote_result`) 자동 발송
- **화면**: `views/multi/season/MultiAllStarView.tsx` — 득표 현황/최종 명단 표시

**이번 계획의 범위**: 확정된 동·서부 12명(스타터5+리저브7) 로스터로 **실제 PBP 경기 1건을
시뮬레이션**해서 결과를 저장하고 화면에 보여주는 것까지.

---

## 1. 목표 / 범위

### 포함 (1차 범위)
- 올스타전 기간(`allStarStart`) 첫날, 동부 올스타 vs 서부 올스타 경기 **1건** 자동 시뮬레이션
- 기존 PBP 엔진(`runFullGameSimulation`)을 그대로 재사용 — 새 엔진 개발 없음
- 경기 결과를 `games`/`game_pbp`에 저장하고 `MultiGamePbpView.tsx`에서 재생 가능하게
- 올스타 경기 스탯이 선수 시즌 통산 기록에 섞이지 않도록 격리
- 올스타 경기가 팀 승패(스탠딩)에 영향을 주지 않도록 격리

### 포함 (2차 범위 — 부대 이벤트, §6~§8 참고)
- 덩크 컨테스트, 3점 챌린지, 라이징스타 챌린지 — 본경기와 별개 계획 추가(아래 §6~§8).
  본경기(1차 범위)가 먼저 안정화된 뒤 순차 착수 권장.

### 제외 (여전히 범위 밖 — 후속 논의 필요, §9 참고)
- 스킬 챌린지(패스/드리블/슈팅 복합 미니게임), 셀러브리티 게임 등 그 외 부대 이벤트
- 컨퍼런스 대항전 외 별도 포맷(드래프트 방식 팀 구성 등)
- 올스타전 MVP 시상(가능하지만 어워드 시스템과 별개 작업으로 분리 권장)
- 유저가 올스타에 선정된 경우의 특별 연출/알림(기본은 관전만 가능한 자동 경기로 시작)

---

## 2. 핵심 설계 결정

### 2-1. 가상 팀 식별자 — `EAST-ALLSTAR` / `WEST-ALLSTAR`

`games.home_team_id`/`away_team_id`에 실제 30개 팀 `team_slug`와 **절대 겹치지 않는** 전용 값을
사용한다. 이렇게 하면 별도 처리 없이 두 가지가 공짜로 해결된다:

- **스탠딩 자동 배제**: `views/multi/season/multiSeasonUtils.ts`의 `computeMultiStandingsStats()`는
  리그의 실제 30팀 `slugs`로만 승패를 집계하므로, 이 slug와 안 겹치는 팀의 경기는 애초에
  루프에서 반영되지 않는다(코드 수정 불필요).
- **`buildLeagueTeams()`/로스터 귀속에 영향 없음**: 올스타 팀은 `league_teams` 테이블에 실제
  행을 추가하는 게 아니라 시뮬레이션 시점에만 존재하는 임시 객체이므로, 각 선수는 여전히
  자기 원래 팀(`league_teams.roster`) 소속으로 남는다.

### 2-2. `games`에 올스타 식별 컬럼 추가 — `is_allstar boolean DEFAULT false`

**왜 필요한가**: 기존 `is_playoff` 컬럼을 재사용하면 플레이오프 브래킷 진행 로직
(`series_id` 기반 `handleTournamentAdvance`)과 의미가 겹쳐 오작동한다. 반드시 별도 컬럼.

**왜 컬럼만으론 부족한가 — 반드시 같이 고쳐야 하는 3개 RPC**:
`get_player_season_stats_league`/`_batch`/`_full`(각각
`migrations/add_player_season_stats_league_rpc.sql` 등) 세 RPC 모두 **`games` 테이블과
JOIN하지 않고** `game_pbp`만 `room_id`로 통째로 스캔한다. 즉 `is_allstar` 컬럼을 추가만 하고
이 RPC들을 안 고치면, 올스타 경기 박스스코어가 그대로 시즌 통산(PPG/RPG 등)에 계속 섞인다.
→ `get_league_season_awards_stats`(`migrations/add_league_player_awards.sql`)가 이미
`games` JOIN + `is_playoff=false` 필터를 쓰고 있으니 그 패턴을 그대로 본떠 세 RPC 전부에
`JOIN games g ON ... AND g.is_allstar = false` 를 추가해야 한다.

**추가로 격리해야 하는 곳**: `services/multi/gameQueries.ts`의 `loadSchedule()` 및 그 소비처
(`MultiScheduleView.tsx` 등 일정 목록류 화면)는 `is_playoff` 외 필터가 없어 `games` 행을
그대로 나열한다 — 올스타 경기가 일반 일정에 섞여 보이지 않으려면 이 소비처들에도
`is_allstar` 필터를 추가해야 한다(화면별로 "숨길지" "올스타 전용 배지로 표시할지" 결정 필요,
§6 참고).

### 2-3. 팀 로스터 조립 — 새 DB 조회 없이 이미 있는 값으로 조립

`server/src/shared/dataMapper.ts`의 `buildTeamForSim()`은 `league_teams` 테이블을 조회하지
않고 `{team_slug, team_name, roster: string[]}` shape만 요구한다. 올스타 로스터는 이미
`league_allstar_votes.roster`(또는 그날 재계산한 `runAllStarSelection()` 결과)에
스타터+리저브 `playerId` 목록으로 존재하므로, 그대로 조립하면 된다:

```ts
const eastTeamForSim = buildTeamForSim(
    { team_slug: 'EAST-ALLSTAR', team_name: '동부 올스타',
      roster: [...east.starters, ...east.reserves].map(p => p.playerId) },
    playerMap, {},
);
```

### 2-4. 뎁스차트/전술 — `generateAutoTactics()` 재사용 + 스타터 우선 정렬

`server/src/shared/game/tactics/tacticGenerator.ts`의 `generateAutoTactics(team, coachPrefs?,
preserveDraftOrder?)`가 로스터만 보고 뎁스차트(주전/벤치/써드)와 48분 로테이션 맵을 자동
생성한다 — 새 로직 불필요. `initTeamState()`가 `tactics`/`depthChart`를 안 넘기면 알아서 이
함수를 호출하므로 `runFullGameSimulation()` 호출 시 두 인자 다 생략하면 된다.

단, 기본 정렬은 OVR 내림차순이라 "투표로 뽑힌 스타터가 실제 코트 선발로 뛴다"는 보장이
없다. `preserveDraftOrder=true` + 로스터 배열을 **스타터 5명을 맨 앞에 오도록 정렬**해서
넘기면(리저브는 그 뒤 OVR순 등 임의 순서), `buildDepthChart()`의 "배열 순서 우선" 로직을
그대로 활용해 스타터가 선발로 배정되게 만들 수 있다 — 이 정렬 로직만 올스타 전용으로 새로
작성.

### 2-5. 실행 진입점 — `simRunner.ts` 재사용 불가, 새 함수 필요

`server/src/simRunner.ts`의 `runSimulation()`은 `league_teams`/`room_members`를
`team_slug`로 하드코딩 조회하므로 그대로 못 쓴다. **새 함수
`runAllStarSimulation(roomId, leagueId, gameId)`**를 만들되, 내부에서는 다음 기존 조각만
재사용:
- `buildTeamForSim()` + `mapRawPlayerToRuntimePlayer()` (팀 객체 조립)
- `runFullGameSimulation()` (PBP 엔진 진입점, §2-4의 로스터 정렬만 다르게)
- `simRunner.ts`의 `game_pbp` upsert / `games` UPDATE 저장 패턴(그대로 복사)

### 2-6. 트리거 — 전용 스케줄러 함수(정규 폴링 경로 그대로는 못 씀)

`scheduler.ts`의 `runSimGames()`는 `games.played=false && scheduled_at<=now`인 행을 찾아
`simWorkerPool.runSimulationInWorker()`(= `simRunner.runSimulation()`)를 호출하는데, 이 체인이
§2-5 이유로 올스타 경기에 그대로 안 맞는다. 두 가지 방법이 있다:

- **(A, 권장)** `postAllStarVoteNews.ts`처럼 별도 함수(`postAllStarGame.ts`?)를 만들어
  `runAllStarVoteUpdates()`와 같은 자리에서 `virtualDate === keyDates.allStarStart`일 때만
  1회 트리거 — `games` row를 그 자리에서 insert하고 곧바로 `runAllStarSimulation()`을 호출.
  멱등성은 기존 패턴(같은 `game_id`로 조회 후 skip)과 동일하게.
- **(B)** `games` row만 미리 insert해두고(`is_allstar=true`, `scheduled_at`=올스타전 시작
  시각) 정규 폴링에 태우되, `simWorker.ts`/`simRunner.ts`에 `is_allstar` 분기를 추가해 워커
  프로토콜 안에서 갈라지게 함 — 기존 트리거 인프라를 더 재사용하지만 워커 통신 프로토콜
  (`protocol.ts`)까지 건드려야 해서 손이 더 많이 감.

(A)가 이번 세션에 이미 확립한 `postAllStarVoteNews.ts` 패턴과 결이 같아 더 적은 리스크로
보인다 — 최종 결정은 실제 구현 착수 시 재확인.

### 2-7. 화면 — `MultiGamePbpView.tsx` 대체로 재사용 가능, 프리뷰만 보정 필요

이 화면은 `game_id` 기반으로 동작해 "정규 일정에 있어야 한다"는 전제가 없다. 팀 색상/이름/
약어는 `leagueTeams.find()` 실패 시에도 이미 폴백돼 있어 문제없지만(`homeTeam?.color_primary
?? '#4f46e5'` 등), **경기 시작 전 로스터 프리뷰**(`homeTeam?.roster` 참조 부분)는
`leagueTeams`에 올스타 팀이 없어 비어 보인다. 경기가 끝나 `game_pbp`가 채워지면 이후엔
문제없이 정상 렌더된다. → 프리뷰 구간만 올스타 전용 분기(또는 즉석 합성한 fake
`LeagueTeamRow`를 주입)로 보정하는 작은 작업이 필요.

---

## 3. 단계별 구현 계획

| 단계 | 작업 | 주요 파일 |
|---|---|---|
| 1 | `games.is_allstar` 컬럼 추가 마이그레이션 | `migrations/add_is_allstar_to_games.sql`(신규) |
| 2 | 시즌 스탯 RPC 3종에 `games` JOIN + `is_allstar=false` 필터 추가 | `add_player_season_stats_league_rpc.sql`/`_batch_rpc.sql`/`_full_rpc.sql`(각각 `CREATE OR REPLACE`) |
| 3 | 스타터 우선 로스터 정렬 헬퍼 작성 | `server/src/shared/multi/allStarSelection.ts`(또는 새 파일) |
| 4 | `runAllStarSimulation()` 신규 작성(팀 조립 → PBP 실행 → 저장) | `server/src/postAllStarGame.ts`(신규, `postAllStarVoteNews.ts`와 동일 컨벤션) |
| 5 | 스케줄러 트리거 연결(§2-6 (A) 방식) | `server/src/scheduler.ts` |
| 6 | `MultiGamePbpView.tsx` 로스터 프리뷰 폴백 보정 | `views/multi/season/MultiGamePbpView.tsx` |
| 7 | 일정 목록류 화면에서 올스타 경기 처리 방식 결정 및 반영(숨김 또는 별도 배지) | `MultiScheduleView.tsx`, `gameQueries.ts` |
| 8 | PBL 세션 등으로 실제 트리거 검증(임시 스크립트로 날짜 강제 → 시뮬 실행 → 화면 확인) | 임시 스크립트(실행 후 삭제) |
| 9 | `docs/history/dev-log.md` 기록 | — |

각 단계는 이전 세션들의 패턴(RPC는 `CREATE OR REPLACE`로 마이그레이션, 서버 오케스트레이터는
`postXxx.ts` 네이밍, client/server 미러 쌍은 항상 같이 수정)을 그대로 따른다.

---

## 4. 데이터 흐름 요약

```
allStarStart(가상 날짜) 도달
  └─ scheduler.ts 새 함수가 감지
       └─ league_allstar_votes.roster(또는 그 자리에서 runAllStarSelection() 재실행)로
          동/서부 12명씩 로스터 확보
       └─ games row 1건 insert (home=EAST-ALLSTAR, away=WEST-ALLSTAR, is_allstar=true)
       └─ runAllStarSimulation(roomId, leagueId, gameId)
            ├─ buildTeamForSim() × 2  (league_teams 조회 없이 playerId 배열로 즉석 조립)
            ├─ 스타터 우선 정렬된 로스터로 runFullGameSimulation() 호출
            │    (tactics/depthChart 생략 → generateAutoTactics() 자동 생성)
            └─ 결과를 games UPDATE + game_pbp upsert (기존 simRunner.ts 저장 패턴 그대로)
  └─ MultiGamePbpView.tsx에서 game_id로 정상 재생
  └─ 시즌 스탯 RPC 3종은 is_allstar=false 필터로 이 경기를 자동 제외
  └─ 스탠딩 계산은 EAST-ALLSTAR/WEST-ALLSTAR가 실제 팀 slug가 아니라 자동 제외
```

---

## 5. 리스크 / 주의사항

- **RPC 3종 동시 수정 필수**: `is_allstar` 컬럼만 추가하고 RPC를 안 고치면 올스타 스탯이
  시즌 통산에 그대로 섞이는 게 가장 위험한 실수 지점. 반드시 세트로 작업.
- **부상/파울/체력 로직 그대로 적용됨**: `runFullGameSimulation()`을 그대로 쓰면 올스타
  경기에서도 정규시즌과 동일한 확률로 부상이 발생할 수 있다(실제 NBA 올스타전은 매우
  느슨한 강도로 진행됨). 부상 비활성화 여부는 시뮬레이션 설정(`SimSettings`)으로 끌 수 있는지
  확인 필요 — 안 되면 이 부분만 별도 처리 검토(§6).
- **선수 피로도(fatigue)/연투(B2B) 반영 여부**: 올스타전은 시즌 스케줄과 단절된 이벤트라
  직전 경기의 B2B 플래그를 그대로 넘기면 안 맞을 수 있음 — `isHomeB2B`/`isAwayB2B`는 항상
  `false`로 고정하는 게 합리적.
- **선수가 여러 컨퍼런스 동시 소속처럼 보이는 착시 없음**: 올스타 팀은 영속 저장되는 게
  아니라 시뮬레이션 순간에만 존재하는 객체라 이런 문제 자체가 없음(2-1 참고).
- **AI 자동 트레이드/방출 등 다른 백그라운드 작업과의 경합**: 올스타 로스터를 확정한 이후
  경기 시뮬레이션까지 사이에 해당 선수가 방출/부상 처리되는 극단적 케이스는 낮은 우선순위로
  일단 무시하고, 필요시 후속 보강.

---

## 6. 덩크 컨테스트 — 개발 계획

본경기(§1~§5)와 완전히 다른 성격 — PBP 엔진을 안 쓰는 **새 미니 시뮬레이션**이 필요하다.
실제 경기가 아니라 "덩크 시도 하나하나를 점수로 채점하는" 확률 모델이라 새로 설계.

### 목표 / 범위
- 참가자 4~6명, 예선(전원 2회 시도, 최고점 합산) → 결승(상위 2명, 2회 시도) 라운드제
- 우승자 발표 + 뉴스 서신 1건(경기 재생 화면 같은 건 불필요 — 결과 요약이면 충분)

### 참가자 선정
- 후보 풀: 리그 전체(올스타 선발 여부와 무관 — 실제 NBA도 덩크 컨테스트 참가자가 올스타가
  아닌 경우가 흔함)에서 `player.attributes.dunk`(덩크 능력치, `types/player.ts:239`) +
  `vertical`(수직 점프, `types/player.ts:262`) 가중 합산 상위권을 뽑되, 최상위 고정 추첨이
  아니라 **상위권 내 가중 랜덤 추첨**(자원 참가 느낌을 내기 위함 — 항상 리그 최고 덩커만
  나가면 매년 뻔해짐).

### 시뮬레이션 방식 (신규 엔진)
- 새 순수 함수 `simulateDunkAttempt(player, seed, category)` — 점수(0~50)를
  `base = normalize(dunk, vertical)` 중심의 정규분포에서 샘플링(시드 고정으로 재현 가능,
  기존 `voterNoise()`류 시드 기반 난수 패턴 재사용).
- 라운드 진행/합산/컷오프 로직은 새로 작성해야 함 — 기존 PBP 엔진 코드 재사용 불가.

### 데이터 저장
- 별도 테이블 만들지 않고, 이번 세션에 확립한 패턴대로 `league_events`에 새 타입
  (예: `allstar_dunk_contest`) 하나로 참가자·라운드별 점수·우승자를 payload에 통째로 저장
  — 1회성 결과 발표라 `league_allstar_votes` 같은 별도 스냅샷 테이블은 과함.

### 화면
- 새 뉴스 카드 컴포넌트(`newsFeedCards.tsx`에 `DunkContestResultCard` 등) 하나로 시작 —
  라운드별 순위표 정도. 실시간 관전 애니메이션 UI는 범위 밖.

### 리스크
- 완전 신규 확률 모델이라 "그럴듯한 우승 확률 분포"로 튜닝하는 데 반복 조정이 필요할 수 있음.
- 시즌 초반이라 덩크 능력치가 고르게 낮은 리그(신인 위주)에서는 참가자 풀이 얕아질 수 있음.

---

## 7. 3점 챌린지 — 개발 계획

덩크 컨테스트와 형제뻘 구조 — PBP 엔진 대신 슈팅 확률 기반 새 미니 시뮬레이션.

### 목표 / 범위
- 참가자별 5랙(총 25구, 랙당 마지막 1구는 "머니볼" 2점) 슈팅, 라운드제(예선 → 결선 상위 3명)
- 덩크 컨테스트와 동일하게 뉴스 서신 1건으로 결과 발표

### 참가자 선정
- `threeCorner`/`three45`/`threeTop`(`types/player.ts:232-234`) 평균값 기준 상위권 가중
  랜덤 추첨(덩크 컨테스트와 동일 원리).

### 시뮬레이션 방식
- 슛 1구당 성공/실패를 확률적으로 판정 — 기존 PBP 엔진의 슛 성공률 계산
  (`server/src/shared/engine/shotHitRate.ts` 계열, `docs/engine/shot-hit-rate.md` 참고)이
  "수비수 컨테스트 상황"을 전제로 설계돼 있을 가능성이 높아, 3점 챌린지처럼 **수비 없는
  캐치&슛 반복** 상황에 그대로 재사용 가능한지 먼저 확인 필요 — 안 맞으면 3점 능력치만
  가지고 새 hitChance 공식을 별도로 만든다(덩크 컨테스트의 `simulateDunkAttempt`와 유사한
  독립 함수).
- 25구 합산 점수 계산 + 머니볼 가중치만 별도 로직(간단한 산술).

### 데이터 / 화면
- 덩크 컨테스트와 완전히 동일한 패턴(`league_events` 새 타입, 예: `allstar_three_point_contest`
  + 결과 카드 컴포넌트) — 두 이벤트를 사실상 같은 골격으로 나란히 구현하는 게 효율적.

### 리스크
- 기존 슛 히트레이트 공식을 그대로 못 쓰면(수비 상황 전제 문제) 새 공식을 하나 더 설계해야
  해서 덩크 컨테스트보다 작업량이 늘 수 있음 — 착수 전 `shotHitRate.ts` 실제 코드 확인 필수
  (실제 재사용 가능 여부를 이 계획서 작성 시점엔 아직 검증 안 함).

---

## 8. 라이징스타 챌린지 — 개발 계획

본경기(§1~§5)와 거의 동일한 구조 — **PBP 엔진 재사용 가능한 진짜 5v5 경기**라 신규
시뮬레이션 로직이 사실상 필요 없다. 본경기 구현이 끝나면 낮은 비용으로 확장 가능.

### 목표 / 범위
- 신인/2년차 위주 선수들로 팀을 나눠 5v5 경기 1건 시뮬레이션(포맷은 §9 질문 3 참고)

### 참가자 선정
- YOS(Years of Service, 연차) 계산: `currentSeasonYear - player.draftYear <= 1` —
  `services/fa/faValuation.ts:373`/`services/fa/extensionEngine.ts:322`가 이미 쓰는
  `player.draftYear`(`types/player.ts:294`) 기반 YOS 계산 패턴을 그대로 재사용(신규 필드
  불필요, 계산 로직만 재사용).
- 팀 편성 기준은 정해야 함(컨퍼런스별 vs 팀 순위 기반 드래프트 등) — §9 질문 3 참고.

### 시뮬레이션 방식
- **본경기 §2-3~§2-5를 그대로 재사용**. `runAllStarSimulation()`을 만들 때부터 로스터/팀명/
  팀ID를 매개변수로 받도록 설계해두면(`runAllStarSimulation(roomId, leagueId, gameId, {
  homeRoster, awayRoster, homeTeamId, awayTeamId, homeTeamName, awayTeamName })`), 본경기와
  라이징스타전이 같은 함수를 호출 인자만 다르게 넘겨 재사용할 수 있다 — 본경기 구현 단계
  (§3)에서 처음부터 이 시그니처로 설계해두는 걸 권장.

### 데이터
- `games.is_allstar`만으론 본경기/라이징스타전 구분이 안 됨 — `game_type` 컬럼으로 세분화
  하거나(`'allstar_main' | 'rising_stars'`), 아니면 `is_allstar`는 그대로 두고 별도
  `event_kind` 컬럼을 얹는 방식 중 결정 필요. 시즌 스탯 RPC 3종의 필터 조건도 "본경기+
  라이징스타전 둘 다 배제"로 맞춰야 함(§2-2와 동일 원리, 컬럼명만 확장).

### 리스크
- 본경기 설계(§2)가 처음부터 "매개변수화"를 안 해두면, 라이징스타전 추가 시 상당 부분
  재작성해야 할 수 있음 — 본경기 §3 단계 4(`runAllStarSimulation()` 작성) 시점에 이 재사용
  요구사항을 미리 반영해두는 게 핵심.

---

## 9. 열어둘 질문 (구현 착수 전 사용자 확인 필요)

**본경기**
1. **경기 강도**: 실제 정규시즌과 동일한 시뮬레이션 강도로 돌릴지, 부상 확률을 낮추거나
   끄는 등 "올스타전다운" 별도 보정을 넣을지?
2. **일정 화면 노출**: 올스타 경기를 `MultiScheduleView.tsx` 등 일반 일정 목록에서 완전히
   숨길지, 아니면 "올스타전" 배지를 달고 같이 보여줄지?
3. **MVP/시상**: 올스타전 MVP를 뽑아 뉴스로 발송할지(어워드 시스템과 유사 작업 필요)?
4. **재시뮬레이션 가능 여부**: 이미 끝난 올스타 경기를 유저가 다시 볼 때 재생만 가능한지,
   아니면 애초에 관전 자체가 불가능(그냥 결과 요약만)한지?

**부대 이벤트(덩크/3점/라이징스타)**
5. **착수 순서**: 본경기부터 먼저 완성하고 부대 이벤트는 후속으로 미룰지, 아니면 처음부터
   같이 진행할지?
6. **라이징스타전 팀 편성 방식**: 컨퍼런스별(동부 신인 vs 서부 신인)로 나눌지, 아니면 실제
   NBA 최근 방식처럼 팀 순위/드래프트 픽으로 임의 편성할지?
7. **덩크/3점 챌린지 참가 인원**: 몇 명으로 고정할지(4명? 6명?), 매 시즌 자동 진행인지
   유저가 트리거하는 방식도 필요한지?
8. **부대 이벤트 우승자 보상/기록**: 명예의 전당(`hallOfFameScorer`) 점수에 반영할지, 아니면
   순수 플레이버 텍스트(뉴스 1건)로만 남길지?

이 질문들에 대한 답에 따라 §3(본경기)/§6~§8(부대 이벤트) 단계별 계획의 세부 구현이
조정될 수 있음.

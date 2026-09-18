# 토너먼트 개인 팩 드래프트 설계

## Context

현재 멀티플레이어 룸 타입은 `leagues.type`으로 `main_league`/`tournament` 두 가지가 있고, 둘 다 **같은 드래프트 엔진**(`DraftRoom.ts` + `submit_draft_pick_v2` RPC — 방 전체가 공유하는 단일 풀에서 스네이크/리니어 턴제로 지명, 어드민이 수동 또는 예약 시각으로 시작)을 쓴다.

토너먼트 세션에 새로운 드래프트 방식을 추가한다:

- 유저가 세션에 참가하면 **즉시 개인 드래프트**를 시작한다 — 다른 참가자와 동기화 없이 혼자 진행.
- 정해진 라운드 수만큼, 라운드마다 무작위로 노출되는 선수 풀(카드팩)에서 일부를 뽑아 로스터를 완성한 뒤 토너먼트에 합류한다.
- 토너먼트는 리그와 달리 올스타전·트레이드·어워드 투표가 없다 — 경기만 진행된다.
- **같은 선수가 여러 팀 로스터에 중복 존재할 수 있다** (완전 비동기·독립 랜덤이라 자연 발생하는 현상이며 의도된 특성).
- 어드민이 세션(룸) 생성 시 드래프트 포맷을 **글로벌 → 라운드별 2단계**로 구성한다: (글로벌) 드래프트 연도 범위·오버롤 범위 → (라운드별) 글로벌 범위 내에서의 오버롤 하위범위·연도 하위범위, 라운드별 노출 풀 크기, 라운드별 픽 수. 총 로스터 인원수는 라운드별 픽 수의 합으로 자동 결정된다. (포지션 필터는 1차 범위에서 제외 — 아래 "결정된 사항" 참고)

**하드 제약**: `meta_players` 테이블(현재 859명, 공유 원본 데이터)은 스키마·row 어느 쪽도 건드리지 않는다.

**확정된 범위 축소 (2026-09-18)**:
- **트레이드 완전 비활성화** — personal-draft 토너먼트는 `trade_enabled=false`로 강제. 트레이드 RPC가 인스턴스 로스터를 몰라도 되는 이유.
- **부상 시스템 완전 비활성화** — 이 모드 경기에서는 부상 롤 자체가 발생하지 않는다. `room_player_instances` 설계가 필요한 이유는(아래) 더는 부상 충돌 회피가 아니라 **실시간 리더보드 스탯 합산 충돌 회피**로 좁혀진다.
- **`room_player_instances`는 토너먼트 종료 후 삭제** — 영속 보관하지 않는다.
- **라운드 풀은 세션 생성 시점에 후보 ID 목록을 고정** — 픽 시점마다 `meta_players`를 재쿼리하지 않고, 생성 시 미리 뽑아둔 목록에서만 랜덤 추출. 따라서 "라운드 풀 고갈" 자체가 런타임에 발생할 수 없다(생성 시점에 후보 수 부족이면 저장을 거부).
- **라운드당 픽 수는 라운드별로 설정 가능** — 총 로스터 사이즈는 독립 입력값이 아니라 `sum(rounds[].picks)`로 자동 결정된다.

---

## 현재 구조 조사 요약

### 리그/토너먼트 구분
- `leagues.type` (`'main_league' | 'tournament'`). `rooms` 테이블 자체엔 타입 컬럼 없음, `rooms.league_id`로 조인.
- 토너먼트 전용 파일: `server/src/shared/tournamentInitializer.ts`(브라켓/일정), `tournamentBracket.ts`, `tournamentArchiver.ts`. 전용 뷰는 없고 `views/multi/season/`의 공용 컴포넌트가 `league.type` 분기.

### 현재 드래프트 (변경 대상 아님 — 리그는 그대로 유지)
- `server/src/startDraft.ts` `buildDraftSetup()` → `meta_players`를 `in_multi_pool=true` + `draft_year_min/max` + `ovr_min/max`로 필터해 `rooms.draft_config.poolIds`(방 전체 공유 단일 리스트)로 저장.
- `DraftRoom.ts` + `submit_draft_pick_v2` RPC(`SELECT ... FOR UPDATE`로 room row 락 후 `EXISTS` 중복 체크) — 라운드별 서브풀 개념 없음, 참가 즉시가 아니라 어드민 수동 시작 또는 `leagues.draft_scheduled_at` 스케줄러 트리거.
- 어드민 설정은 `leagues` 테이블의 평면 컬럼들(`draft_ovr_min/max`, `draft_year_min/max`, `draft_total_rounds`, `draft_pool_strategy`, `draft_format` 등) — 라운드별 필드 없음.

### 중복 로스터 시 실제로 충돌하는 지점 (DB 스키마 실측)
| 테이블/RPC | 키 | 충돌 여부 |
|---|---|---|
| `room_player_state`(계약/부상/체력) | PK `(room_id, player_id)`, `player_id`는 **text** 타입 | **부상 비활성화로 실질 위험 소멸** — 부상 롤 자체가 안 일어나므로 `health`/`injury_type`/`return_date`/`injury_history`가 충돌할 일이 없음. `condition`(경기 내 체력) 필드만 여전히 쓰일 수 있는데, 이것도 instance_id를 쓰면 팀별로 자동 분리됨 |
| `get_player_season_stats_full` RPC (실시간 리더보드) | `game_pbp.home_box/away_box`를 `(elem->>'playerId')::uuid`로 **`player_id`만 GROUP BY** | **여전히 충돌** — 부상과 무관하게 두 팀 스탯이 한 줄로 합산됨. `room_player_instances` 설계가 필요한 유일한 실질적 이유로 좁혀짐 |
| `tournament_game_player_stats` (종료 후 아카이브) | UNIQUE `(archive_id, game_id, player_id)` + `team_slug`·`player_name`·`position` 컬럼 보유(스키마 재확인) | 안전 — 게임 단위 키 + 이름/포지션을 이미 비정규화 저장하므로, `room_player_instances`를 토너먼트 종료 후 삭제해도 이 아카이브는 영향 없음 |
| `league_teams.roster` | `jsonb` 배열(`string[]`), **row 자체엔 어떤 unique 제약도 없음** | 제약 없음(자유도는 있지만 보호도 없음) |
| 트레이드 RPC | 거래 양측 팀의 `roster` 배열만 조회 | **논외 확정** — personal-draft 토너먼트는 `trade_enabled=false` 강제이므로 이 RPC 자체가 호출되지 않음 |

### `simRunner.ts` 로스터 하이드레이션 (핵심 통합 지점)
```
server/src/simRunner.ts:93-116
league_teams.roster (id 배열)
  → meta_players.select(...).in('id', allPlayerIds)   // 직접 조회
  → playerMap.set(String(raw.id), mapRawPlayerToRuntimePlayer(raw, ...))
  → buildTeamForSim(teamRow, playerMap, rosterState)   // roster의 각 id로 playerMap.get(id) 조회
```
`room_player_state` 오버레이(`simRunner.ts:126-144`)도 동일하게 `allPlayerIds`(= roster 배열 값)를 그대로 `player_id`로 조회한다.

**결론**: `league_teams.roster`에 들어가는 값이 곧 `room_player_state.player_id`이자 `game_pbp` box score의 `playerId`로 그대로 흘러간다. 즉 이 값 하나만 팀마다 유일하게 만들면, 스키마·RPC를 전혀 고치지 않고도 위 표의 충돌이 전부 사라진다.

---

## 핵심 설계: Room-scoped Player Instance

`meta_players`에 손대지 않으면서 "같은 선수, 다른 인스턴스"를 표현하기 위해 **새 매핑 테이블**을 하나 추가한다.

### 신규 테이블: `room_player_instances`
```sql
CREATE TABLE room_player_instances (
    instance_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         uuid NOT NULL REFERENCES rooms(id),
    team_id         uuid NOT NULL REFERENCES league_teams(id),
    source_player_id uuid NOT NULL REFERENCES meta_players(id),
    drafted_round   integer NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_room_player_instances_room ON room_player_instances(room_id);
CREATE INDEX idx_room_player_instances_source ON room_player_instances(source_player_id);
```
- `meta_players`는 순수 템플릿(읽기 전용)으로만 참조된다 — row 추가/수정 없음.
- 카드가 뽑히는 순간 이 테이블에 새 `instance_id`(신규 UUID)가 생성되고, **이 `instance_id`가 곧 그 팀에서의 "player_id"**가 된다.

### 데이터 흐름 변경
- `league_teams.roster`: 이 신규 모드로 드래프트된 팀은 `meta_players.id`가 아니라 **`instance_id`**를 저장한다. (기존 리그/공유풀 토너먼트는 지금처럼 `meta_players.id`를 그대로 저장 — 변경 없음, 두 로스터 "값 공간"이 자연스럽게 공존)
- `room_player_state.player_id`, `game_pbp` box score의 `playerId`: 전부 `instance_id`가 그대로 흘러간다. `player_id` 컬럼이 이미 **text 타입**이라 uuid 문자열을 그대로 담을 수 있어 스키마 변경이 필요 없다.
- 결과적으로 `room_player_state`의 PK `(room_id, player_id)`와 `get_player_season_stats_full`의 `GROUP BY playerId`가 **이미 팀별로 유일한 값**을 받으므로, 두 시스템 모두 코드 한 줄 안 고치고 자동으로 안전해진다.

### `simRunner.ts` 수정 지점 (유일하게 실질적으로 고쳐야 하는 엔진 코드)
현재(93-116행)는 `roster` 배열 값으로 바로 `meta_players.id`를 조회한다. 인스턴스 로스터를 다루려면:
1. `roster` 배열의 각 값이 `room_player_instances.instance_id`인지 판별(신규 모드 팀인지 여부는 팀/룸 플래그로 미리 알 수 있음 — 아래 "룸 플래그" 참고)
2. 인스턴스 팀이면 `room_player_instances`에서 `instance_id → source_player_id` 먼저 resolve
3. `meta_players`는 `source_player_id` 집합으로 조회(능력치는 원본 템플릿 그대로)
4. `playerMap`은 여전히 **`instance_id`를 키**로 구성(`mapRawPlayerToRuntimePlayer` 결과의 `.id` 필드를 `instance_id`로 override) — 이후 `buildTeamForSim` 이하 엔진 코드는 전혀 수정할 필요 없음(어차피 roster 배열 값으로 `playerMap.get()`만 하므로)

이 변경은 "조회 전에 한 단계 조인을 추가하고, 하이드레이트된 객체의 id를 override"하는 수준으로 범위가 작다.

### 표시(이름/카드 UI)
인스턴스 자체는 능력치를 갖지 않는 순수 포인터이므로, 화면에 선수 정보를 보여줄 땐 항상 `instance_id → source_player_id → meta_players` 조인이 필요하다. 리더보드/로스터 화면에서 "이 선수, 어느 팀 카드인지" 같이 보여주려면 `room_player_instances.team_id`를 함께 노출하면 된다.

**구현(2026-09-18)**: 클라이언트 공용 해석기 `services/multi/instancePlayers.ts:fetchMetaPlayersByRosterIds(roomId, ids, cols)` — `useLeagueRawStats`(로스터/전술/리더보드/선수상세/홈 위젯의 공통 경로)와 `MultiGamePbpView`(박스스코어·예정 로스터)에 적용. 미적용: `useMultiSearchData`(검색/트레이드/FA 풀), `usePlayerCareerHistory`/`usePlayerTendencies`/`usePlayerShortCodes`, `AdminTeamEditorView` — 필요 시 같은 함수로 교체. 메뉴 분기: 내 팀 `personal_draft_progress.status='completed'`(`hooks/usePersonalDraftStatus.ts`, Realtime)이면 사이드바 "드래프트 풀" 숨김 + 로스터/전술 개방, 헤더/로비 진입 버튼 숨김. 순위표~자유계약 등 리그 메뉴는 토너먼트 시작(`in_progress`) 후.

### 트레이드 / 부상 강제 비활성화
- `leagues.trade_enabled = false`를 personal-draft 토너먼트 생성 시 강제(관리자 UI에서 이 토글 자체를 숨김). 인스턴스 로스터가 트레이드 RPC를 절대 거치지 않도록 원천 차단.
- **부상은 이미 존재하는 `sim_settings.injuriesEnabled` 플래그로 끈다 — 신규 컬럼 불필요.** 올스타전(`postAllStarGame.ts:22-23,288-289`)이 정확히 같은 패턴의 선례다: "전시성 경기라 부상 비활성화"를 위해 `room.sim_settings`를 얕은 복사해 `injuriesEnabled: false`(+ `suspensionsEnabled: false`)만 덮어써 `runFullGameSimulation()`에 넘긴다. 실제 확률 계산은 `server/src/shared/engine/fatigueSystem.ts:66` `calculateIncrementalFatigue()`의 `totalChance = (baseInjuryChance + fatigueBonus) * injuryFrequency`에서 일어나는데, `injuriesEnabled: false`가 이 체인을 타고 내려가 `injuryFrequency`를 사실상 0으로 만든다(정확한 배선은 `stateUpdater.ts:21`의 `state.simSettings.injuryFrequency` 참조).
  - **구현 방법**: personal-draft 토너먼트 룸을 만들 때 `rooms.sim_settings`에 `{ injuriesEnabled: false }`를 처음부터 저장해두면 끝 — `simRunner.ts`는 `room.sim_settings`를 그대로 읽어(`simRunner.ts:164`) `runFullGameSimulation()`에 넘기므로, 매 경기마다 로직을 분기할 필요 없이 **룸 생성 시점 설정 한 줄로 해결**된다.
- 참고: 이 두 토글이 향후 "리그" 타입에도 일반화될 수 있는 옵션이라면(예: "친선전 리그"), 이번 작업 범위는 personal-draft 토너먼트 한정으로 좁혀 구현하고 일반화는 별도 논의.

---

## 신규 드래프트 포맷 스키마 (어드민 설정) — 2단계 필터 구조

어드민 설정은 **글로벌 → 라운드별** 2단계로 구성된다. 라운드별 범위는 항상 글로벌 범위의 부분집합이어야 한다.

### 글로벌 설정 — 기존 컬럼 그대로 재사용
`leagues.draft_year_min/max`, `leagues.draft_ovr_min/max`(둘 다 이미 존재하는 컬럼, 기존 공유풀 드래프트와 동일)로 "이번 세션 전체에서 후보가 될 수 있는 최대 범위"를 정의한다. 새 컬럼 불필요.

### 라운드별 설정 — 신규 컬럼
기존 `leagues.draft_*`는 라운드 개념이 없으므로 새 컬럼을 추가한다.

```sql
ALTER TABLE leagues ADD COLUMN personal_draft_format jsonb DEFAULT NULL;
```

```jsonc
// leagues.personal_draft_format
// (draft_year_min/max, draft_ovr_min/max는 leagues 테이블의 기존 글로벌 컬럼을 그대로 참조 — 여기 다시 안 넣음)
{
  "totalRounds": 15,
  "pickTimerSec": 120,        // [2026-09-18 추가] 라운드당 픽 제한시간(초). 만료 시 자동 지명(아래 "타이머" 절)
  "rounds": [
    {
      "round": 1, "poolSize": 10, "picks": 1,
      "ovrMin": 90, "ovrMax": 99,              // 글로벌 draft_ovr_min/max의 부분범위여야 함
      "draftYearMin": null, "draftYearMax": null, // null = 글로벌 draft_year_min/max 그대로 상속
      "eligiblePlayerIds": ["<uuid>", "<uuid>", "..."]   // 생성 시점에 고정 — 픽 시점엔 재쿼리 안 함
    },
    { "round": 2,  "poolSize": 10, "picks": 2, "ovrMin": 85, "ovrMax": 93, "eligiblePlayerIds": [ /* ... */ ] },
    // ...
    { "round": 15, "poolSize": 10, "picks": 1, "ovrMin": 60, "ovrMax": 74, "eligiblePlayerIds": [ /* ... */ ] }
  ]
}
```

- 라운드마다 독립적인 `poolSize`(노출 카드 수), `picks`(그 라운드에서 뽑는 수 — **라운드별로 다르게 설정 가능**), `ovrMin/ovrMax`, `draftYearMin/draftYearMax`(포지션 필터는 이번 요구사항 범위에서 제외 — 1차 버전엔 없음).
- **저장 시 검증**: 각 라운드의 `ovrMin/Max`가 `[leagues.draft_ovr_min, leagues.draft_ovr_max]` 안에 있는지, `draftYearMin/Max`가 `[leagues.draft_year_min, leagues.draft_year_max]` 안에 있는지 체크(벗어나면 저장 거부). `null`이면 글로벌 값을 그대로 상속.
- **`rosterSize`는 별도 입력값이 아니라 `sum(rounds[].picks)`로 자동 계산·표시**만 한다(어드민이 직접 입력하지 않음 — 라운드별 픽 수를 바꾸면 합계가 실시간으로 갱신).
- **`eligiblePlayerIds`는 어드민이 포맷을 저장하는 시점에** 글로벌 필터(`draft_year_min/max`, `draft_ovr_min/max`, `in_multi_pool=true`)로 먼저 좁힌 뒤, 그 안에서 라운드별 `ovrMin/Max`·`draftYearMin/Max`로 다시 좁혀서 `meta_players`를 한 번 쿼리해 확정 저장한다. 결과 개수가 `poolSize`보다 적으면 **저장 자체를 거부**하고 어드민에게 몇 명이 부족한지 에러로 알려준다. 이후 모든 팀의 모든 라운드 팩은 이 고정 목록에서만 랜덤 추출하므로, 토너먼트 진행 중 `meta_players` 데이터가 바뀌어도(선수 평가 수정 등) 영향받지 않고, "풀 고갈"이라는 런타임 실패 케이스 자체가 존재하지 않는다.
- 어드민 UI(`LeagueSettingsView.tsx`)에서 글로벌 범위(연도/오버롤)를 먼저 지정한 뒤, 그 아래 라운드별 테이블 편집(라운드별 오버롤 하위범위·연도 하위범위·픽 수)을 노출. "고정 하락 커브" 프리셋 버튼(라운드1=글로벌 상단 OVR 밴드 → 라운드15=하단 밴드)으로 기본값을 자동 채우고, 개별 라운드 수정도 허용. 저장 버튼 클릭 시 서버가 범위 검증 + `eligiblePlayerIds`를 계산하고 결과(성공/범위초과·부족 에러)를 UI에 즉시 반영.
### 픽 타이머 (2026-09-18 추가)
- 세션 생성 시 어드민이 **라운드당 픽 제한시간**을 설정한다 — `personal_draft_format.pickTimerSec`(초). 기존 공유풀 드래프트의 `leagues.draft_pick_duration_sec`와는 **별도 값**(개인 드래프트 전용, Phase 6 어드민 UI에 입력란 추가).
- 타이머 시작 시각은 팩이 생성되는 순간 — `get_or_generate_round_pack`이 새 팩을 만들 때 `personal_draft_progress.pack_started_at = now()`를 기록(재접속해도 남은 시간 유지). 라운드 내 다중 픽(`picks > 1`)은 팩 단위로 타이머 하나(같은 팩에서 계속 뽑는 동안 리셋하지 않음).
- **만료 시 자동 지명**: `now() > pack_started_at + pickTimerSec`이면 `offered_pool`에서 OVR이 가장 높은 카드를 자동으로 뽑고 다음 라운드로 진행(기존 공유풀 드래프트의 오토픽과 같은 정책). 남은 픽 수만큼 반복.
- **집행 주체는 서버 스케줄러**(`server/src/scheduler.ts`에 스윕 추가) — 미접속 유저의 드래프트도 시간이 지나면 끝나 토너먼트 시작 시점에 로스터 미완성 팀이 없도록. 클라이언트도 방어적으로 `get_or_generate_round_pack`/`submit_personal_draft_pick` 호출 시 만료를 감지해 같은 자동 지명 로직을 태운다(RPC 내부에서 처리, 스케줄러와 결과 동일).
- 헤더 타이머 표시: 기존 `DraftHeader` 타이머와 동일 스타일(`font-black text-xl`, 30초 이하 `text-amber-400`).

- 필터는 기존 `applyMetaPlayerPoolFilter`(`server/src/shared/draftPoolQuery.ts`)를 그대로 재사용(글로벌 1차 필터에 그대로 적용 가능한 시그니처) + 라운드별 하위범위를 2차로 겹쳐 적용하는 얇은 래퍼만 추가하면 됨. 이 조합이 곧 `eligiblePlayerIds` 계산 로직이 된다.

---

## 진행 상태 & RPC 설계

### 신규 테이블: `personal_draft_progress`
```sql
CREATE TABLE personal_draft_progress (
    room_id            uuid NOT NULL REFERENCES rooms(id),
    team_id            uuid NOT NULL REFERENCES league_teams(id),
    current_round      integer NOT NULL DEFAULT 1,
    picks_remaining     integer NOT NULL,  -- 이번 라운드에서 아직 더 뽑아야 하는 수(rounds[round].picks로 초기화, 1 이상이면 같은 팩에서 계속 선택)
    status             text NOT NULL DEFAULT 'in_progress', -- in_progress | completed
    offered_pool       jsonb,   -- 현재 라운드에 노출된 후보 meta_player_id 배열(eligiblePlayerIds에서 poolSize개 샘플, 재접속해도 같은 팩 유지)
    pack_started_at    timestamptz, -- [2026-09-18 추가] 팩 생성 시각 = 픽 타이머 시작점(pickTimerSec 만료 판정용)
    updated_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, team_id)
);
```
- `offered_pool`을 저장해두는 이유: 라운드 화면을 새로고침하거나 재접속해도 "다시 뽑았더니 팩이 바뀌는" 부정행위/혼란을 막기 위해 — 팩은 서버가 한 번 생성하면 그 라운드 동안 고정.
- `picks_remaining`으로 라운드당 픽 수(`rounds[].picks`, 가변)를 처리한다: 한 라운드에서 여러 장을 고를 때 `offered_pool`은 그대로 두고(같은 팩에서 계속 선택) `picks_remaining`만 감소, 0이 되면 다음 라운드로 진행 + 새 팩 생성.

### RPC
| RPC | 역할 |
|---|---|
| `start_personal_draft(room_id, team_id)` | 참가+팀배정 직후 호출. `personal_draft_progress` row 생성(1라운드, `picks_remaining = rounds[1].picks`), 1라운드 팩 생성 |
| `get_or_generate_round_pack(room_id, team_id)` | `offered_pool`이 이미 있으면 그대로 반환(멱등), 없으면 `leagues.personal_draft_format.rounds[current_round].eligiblePlayerIds`(생성 시 고정된 목록)에서 `poolSize`만큼 무작위 샘플 후 저장 — `meta_players`를 다시 쿼리하지 않음 |
| `submit_personal_draft_pick(room_id, team_id, source_player_id)` | 1) `offered_pool`에 포함되는지 검증 → 2) `room_player_instances` insert(신규 `instance_id`) → 3) `league_teams.roster`에 append → 4) `offered_pool`에서 방금 뽑은 id 제거(같은 라운드 내 중복 픽 방지), `picks_remaining -= 1` → 5) `picks_remaining === 0`이면 `current_round += 1`, `offered_pool = null`, 새 `picks_remaining` 설정 → 6) `current_round > totalRounds`면 `status='completed'` |

전부 `SECURITY DEFINER` + `team_id` 소유권 검증(`room_members`/`claim_team`과 연동) 필요 — 기존 `submit_draft_pick_v2`의 락 패턴을 참고하되, 이쪽은 팀별로 완전히 독립이라 room 전체 락은 불필요하고 `personal_draft_progress` row 자체에 락을 걸면 충분.

### 종료 후 정리(cleanup)
`tournamentArchiver.ts`가 브라켓 종료 시 `tournament_team_records`/`tournament_game_log`/`tournament_game_player_stats`로 아카이빙을 마친 뒤, 같은 트랜잭션(또는 직후 배치)에서:
1. 해당 `room_id`의 `room_player_instances` 전부 삭제
2. 해당 `room_id`의 `room_player_state` 중 `player_id`가 삭제된 `instance_id`와 일치하는 row 삭제
3. `personal_draft_progress` row 삭제

아카이브 테이블(`tournament_game_player_stats`)은 `player_name`/`position`을 이미 비정규화 저장하므로(스키마 실측 확인) 인스턴스 삭제 후에도 과거 박스스코어 조회는 영향 없음.

---

## 참가 플로우 (확정)

리그 홈에서 "참가" 버튼 → **팀을 먼저 고른다** → 드래프트 화면으로 이동.

```
리그 홈 "참가" 버튼 클릭
  → joinLeague (room_members upsert, 기존 그대로)
  → claim_team (팀 아이덴티티=이름/로고/컬러 선점, 기존 그대로) — 여기서 team_id 확정
  → [신규] leagues.type='tournament' && personal_draft_format IS NOT NULL 이면
     팀 확정 직후 자동으로 start_personal_draft(room_id, team_id) 호출 + PersonalDraftView로 전환
  → 신규 화면(가칭 PersonalDraftView)에서 라운드별 팩 노출 → 픽 제출 반복
  → status='completed' → 팀을 "로스터 준비 완료" 상태로 표시, 토너먼트 일정(브라켓)에 정상 편입
```

기존 `DraftRoom`/`submit_draft_pick_v2`(공유 풀 턴제)와는 완전히 별개의 경로이며, 어느 쪽을 쓸지는 `leagues.personal_draft_format` 유무로 분기한다(리그는 항상 기존 경로 유지).

---

## 영향 파일 요약

### 신규
- `migrations/add_personal_draft_format.sql`, `add_room_player_instances.sql`, `add_personal_draft_progress.sql` — **적용 완료(Phase 1)**
- `services/multi/personalDraftFormat.ts` — **완료(Phase 2)**. `buildPersonalDraftFormat()`, `computeRosterSize()`
- `migrations/add_personal_draft_rpcs.sql` — **적용 완료(Phase 3)**. RPC 3종
- `services/multi/personalDraft.ts` — **완료(Phase 3)**. RPC 3종의 클라이언트 래퍼(`startPersonalDraft`/`getOrGenerateRoundPack`/`submitPersonalDraftPick`)
- `migrations/add_personal_draft_timer.sql` — **적용 완료(Phase 3.5)**. 픽 타이머/자동 지명/스윕
- `migrations/fix_personal_draft_pack_exclude_drafted.sql` — **적용 완료(2026-09-18 버그 수정)**. 팩 샘플러가 그 팀이 이미 지명한 선수를 제외(`sample_pack(format, round, room_id, team_id)`), 후보 고갈 시 제외 없이 추출하는 폴백 + WARNING
- `views/multi/league/PersonalDraftView.tsx` + `components/draft/PersonalDraftCard.tsx` — **완료(Phase 5)**
- `hooks/usePersonalDraft.ts` — **완료(Phase 5)**

### 수정
- `server/src/simRunner.ts` — **완료(Phase 4)**: `leagues` select에 `personal_draft_format` 추가 + 로스터 하이드레이션 블록에 인스턴스 resolve 분기 추가
- `services/multi/leagueService.ts` — **완료(Phase 2)**: `createLeague`/`updateLeagueSettings` 양쪽에 `personalDraftFormat` 옵션 추가
- `services/multi/roomQueries.ts` — **완료(Phase 2)**: `LeagueRow.personal_draft_format` 필드 추가
- `views/multi/league/LeagueSettingsView.tsx`, `views/multi/league/settings/PersonalDraftSettingsTab.tsx`(신규), `components/multi/CreateLeagueModal.tsx`, `components/multi/PersonalDraftFormatEditor.tsx`(신규), `components/multi/DraftPoolSettings.tsx` — **완료(Phase 6)**: 생성 모달 드래프트 방식 토글 + 라운드별 포맷 편집기 + 세션 설정 탭
- `migrations/add_personal_draft_room_ops.sql`(**적용 완료**), `server/src/personalDraftStart.ts`(신규), `server/src/scheduler.ts`, `server/src/finalize.ts`, `server/src/simRunner.ts`, `services/multi/leagueService.ts`(`resetTournament`) — **완료(Phase 7)**: 시작 트리거(미참가 팀 AI 채움 + 강제 완료 + 브라켓 생성), 전술 초기화 인스턴스 해석, 아카이브 후/리셋 시 인스턴스·상태·진행 행 정리
- `server/src/scheduler.ts` — **완료(Phase 3.5)**: `runPersonalDraftSweeps()` 틱 추가
- `views/multi/season/LeagueLobbyPanel.tsx`, `components/MultiHeader.tsx`, `App.tsx`, `index.css` — **완료(Phase 5)**: 팀 확정 직후 개인 드래프트 화면으로 이동, 진입 버튼 분기, 라우트, 라운드 펄스 keyframes

### 변경 없음(확인됨)
- `meta_players` 스키마/데이터
- 기존 리그 드래프트(`DraftRoom.ts`, `submit_draft_pick_v2`, `startDraft.ts`)
- `server/src/shared/draftPoolQuery.ts` / `services/multi/draftPoolQuery.ts` — **Phase 2에서 스킵 결정**(위 Phase 2 각주 참고, 서버 재계산 불필요로 판단)

---

## 결정된 사항 정리 (2026-09-18)

| 항목 | 결정 |
|---|---|
| 트레이드 | personal-draft 토너먼트는 `trade_enabled=false` 강제 — 트레이드 RPC와 인스턴스 로스터는 서로 접점 없음 |
| 부상 | 신규 컬럼 불필요 — 룸 생성 시 `rooms.sim_settings.injuriesEnabled = false` 저장(올스타전과 동일 선례, `postAllStarGame.ts:288-289`). `simRunner.ts`가 이 값을 그대로 `runFullGameSimulation()`에 넘기므로 부상 확률 계산(`fatigueSystem.ts:66`)이 자동으로 차단됨. 스태미나 소모/회복(`condition`)은 별개 로직이라 평소대로 동작(문제 없음) |
| `room_player_instances` 보존 기간 | 토너먼트 종료(아카이빙 완료) 시점에 삭제. 과거 박스스코어는 `tournament_game_player_stats`의 비정규화 컬럼(`player_name`, `position`)으로 계속 조회 가능 |
| 라운드 풀 고갈 | 세션(포맷) 생성 시점에 `eligiblePlayerIds`를 확정 저장 + 개수 부족 시 저장 자체를 거부 → 런타임 고갈 불가능 |
| 라운드당 픽 수 | 라운드별로 가변 설정(`rounds[].picks`) — `personal_draft_progress.picks_remaining`으로 라운드 내 다중 픽 처리. 총 로스터 사이즈는 `sum(rounds[].picks)`로 자동 결정(별도 입력 없음) |
| 필터 구조 | **글로벌(연도/오버롤, 기존 `leagues.draft_year_min/max`·`draft_ovr_min/max` 재사용) → 라운드별 하위범위(연도/오버롤)** 2단계. 포지션 필터는 이번 요구사항에 없어 1차 버전 스키마에서 제외(향후 확장 여지만 남김) |
| 픽 타이머 | `personal_draft_format.pickTimerSec`(공유풀 드래프트의 `draft_pick_duration_sec`와 별도). 팩 생성 시 `pack_started_at` 기록, 만료 시 팩 내 최고 OVR 자동 지명, 집행은 서버 스케줄러(+RPC 진입 시 방어적 동일 처리) |
| 팀 배정 타이밍 | 리그 홈 "참가" 버튼 → **팀 먼저 선택(`claim_team`)** → 드래프트 화면(`PersonalDraftView`)으로 이동. 팀 확정 직후 `start_personal_draft` 자동 호출 |

미결정 항목 없음 — 구현 착수 가능한 상태.

---

## 구현 순서 (7단계)

각 단계는 이전 단계가 끝나야 다음 단계를 검증할 수 있는 순서로 배열했다. 리그(기존 공유풀 드래프트) 경로는 어느 단계에서도 건드리지 않으므로, 단계 중간에 배포해도 기존 기능에 영향 없음.

### Phase 1 — DB 스키마 ✅ 완료 (2026-09-18)
1. `migrations/add_personal_draft_format.sql` — `leagues`에 `personal_draft_format jsonb DEFAULT NULL` 추가 — **적용 완료**
2. `migrations/add_room_player_instances.sql` — 신규 테이블(위 스키마 그대로) — **적용 완료**
3. `migrations/add_personal_draft_progress.sql` — 신규 테이블(`picks_remaining` 포함) — **적용 완료**
4. 검증: Supabase MCP로 3개 마이그레이션 순서대로 적용, `information_schema`로 컬럼/테이블 존재 확인, `get_advisors(security)`로 새 RLS 누락 없음 확인(신규 두 테이블 다 정상 검출됨 없음 — 정책 정상 작동). 현재 DB에 `leagues` row가 0건이라 기존 리그 영향 여부는 실질적으로 검증할 대상이 없었음(추후 리그가 생겨도 컬럼 추가는 하위호환).

### Phase 2 — 어드민 포맷 저장 로직 ✅ 완료 (2026-09-18)
5. ~~`server/src/shared/draftPoolQuery.ts` 확장~~ — **불필요로 결론, 스킵**: `personal_draft_format`은 저장 시점(클라이언트, admin-only)에 딱 한 번 `eligiblePlayerIds`를 확정해 저장하고 이후 RPC는 그 배열을 읽기만 하므로, 기존 `draftPoolCapacity.ts`(client-only, 서버 미러 없음)와 동일하게 서버 쪽 재계산 로직이 필요 없다고 판단
6. `services/multi/personalDraftFormat.ts` (신규) — `buildPersonalDraftFormat()`: 라운드별 구조 검증(순서/poolSize/picks/ovr·연도 범위가 글로벌 범위 안에 있는지) → 기존 `fetchDraftPoolPlayers()`(draftPoolCapacity.ts, 재사용)로 글로벌 풀 1회 조회 → 라운드별 하위범위로 메모리에서 필터링해 `eligiblePlayerIds` 확정 → 어느 라운드든 `poolSize` 미달이면 전체 저장 거부(부분 성공 없음)
7. `services/multi/leagueService.ts` — `createLeague`/`updateLeagueSettings` 양쪽에 `personalDraftFormat` 옵션 추가(기존 `opts.X !== undefined` 페이로드 패턴 그대로), `services/multi/roomQueries.ts`의 `LeagueRow`에 `personal_draft_format` 필드 추가(이미 `select('*')`라 쿼리 변경 불필요)
8. 검증: 실제 DB(`buummihpewiaeltywdff`)에 대고 4가지 케이스 실행 — (1) 정상 15라운드 하락 커브(오버롤 89→61로 점감, 라운드별 실제 eligible 103~410명, `rosterSize=15` 정상 계산) 성공, (2) 라운드 범위가 글로벌 범위 이탈 → 저장 전 검증 단계에서 거부, (3) 조건 대비 후보 부족(98~99 OVR 999명 요구, 실제 9명) → DB 조회 후 거부, (4) `picks > poolSize` → 구조 검증 단계에서 거부. 4건 전부 예상대로 동작

### Phase 3 — 개인 드래프트 RPC ✅ 완료 (2026-09-18)
8. `migrations/add_personal_draft_rpcs.sql` — **적용 완료**. `start_personal_draft`/`get_or_generate_round_pack`/`submit_personal_draft_pick` 3종, `submit_draft_pick_v2`와 동일 컨벤션(`p_user_id uuid DEFAULT NULL` + `COALESCE(p_user_id, auth.uid())`, `SECURITY DEFINER`, `SET search_path`, `personal_draft_progress` 행 `FOR UPDATE` 락). `start_personal_draft`가 내부적으로 `get_or_generate_round_pack`을 호출해 1라운드 팩까지 바로 반환
9. `services/multi/personalDraft.ts` (신규) — 3종 RPC의 얇은 클라이언트 래퍼(`startPersonalDraft`/`getOrGenerateRoundPack`/`submitPersonalDraftPick`). **참가 플로우 실제 연결(`claim_team` 직후 자동 호출)은 UI가 붙는 Phase 5로 이관** — 이 Phase에선 호출 가능한 함수만 준비
10. 검증: 실제 DB(`buummihpewiaeltywdff`)에 대고 `DO $$ ... RAISE EXCEPTION` 패턴(기존 "Fixed-Day 3단계" 항목의 `set_config('request.jwt.claims')` 테스트 선례와 동일 — 끝에 예외를 던져 전체 트랜잭션 롤백, 흔적 안 남음)으로 2라운드(라운드1 픽1장→자동 다음 라운드, 라운드2 픽2장→완료) 풀 사이클 실행. 팩 생성/멱등성(`get_or_generate_round_pack` 재호출 시 동일 팩)/라운드 내 다중 픽(같은 팩에서 방금 뽑은 카드만 제외되고 계속 진행)/라운드 자동 전환/완료 후 재픽 차단(`draft_already_completed`)까지 전부 기대값과 일치. 종료 후 `leagues`/`room_player_instances`/`personal_draft_progress` 잔여 데이터 0건 확인(롤백 정상)

### Phase 4 — 시뮬레이션 엔진 통합 ✅ 완료 (2026-09-18, 단 아래 "검증 한계" 참고)
11. **룸이 인스턴스 로스터를 쓰는지 판별하는 기준 확정** — **완료**. `simRunner.ts`가 이미 `leagues`에서 `use_custom_overrides, sim_real_start_at, games_per_real_day`를 조회하던 기존 쿼리(47-51행 부근, 신규 쿼리 추가 없이 select 목록에 `personal_draft_format`만 얹음)에 편승해 `isInstanceRoom = personal_draft_format != null`로 판별. 룸 단위로 일괄 결정(팀별 혼재 없음)
12. `server/src/simRunner.ts` 로스터 하이드레이션 블록 수정 — **완료**. `isInstanceRoom`이면 `room_player_instances`(instance_id→source_player_id) 먼저 조회 → `meta_players`는 source_player_id 집합으로 조회 → `playerMap`은 `instance_id`를 키로, 하이드레이트된 객체의 `.id`도 `instance_id`로 override. 아니면 기존 로직 그대로(else 분기, 리그/공유풀 토너먼트는 완전 무변경). `mapRawPlayerToRuntimePlayer` 등 공용 함수는 손대지 않음(호출부에서 스프레드로 override)
13. 룸 생성 시 `rooms.sim_settings`에 `{ injuriesEnabled: false }` 저장 — **보류, Phase 5/6으로 이관**. `createRoom()`(`services/multi/leagueService.ts`)이 이미 `simSettings` 파라미터를 범용으로 지원하므로 엔진/서비스 쪽엔 추가할 코드가 없음 — personal-draft 토너먼트를 실제로 만드는 UI/플로우가 생기는 시점(Phase 5/6)에 그 호출부에서 이 값을 넘기기만 하면 됨. 지금 미리 만들면 호출하는 곳이 없는 죽은 코드가 됨
14. 검증 — **DB 쿼리·데이터 레이어까지는 완료, 실제 PBP 엔진 실행(`runSimulation()`)은 이 세션에서 불가능**(아래 "검증 한계" 참고)

**검증 한계**: `runSimulation()`은 `server/src/supabaseAdmin.ts`가 `Bun.env.SUPABASE_SERVICE_ROLE_KEY`를 요구하는데(서버는 Bun/fly.io 전용, `Bun.` 사용처는 `supabaseAdmin.ts`/`index.ts`/`workers/simWorkerPool.ts` 3곳뿐이고 `simRunner.ts`의 의존 체인엔 그 중 `supabaseAdmin.ts`만 걸림), 이 세션엔 Bun 런타임도 service_role 키도 없어 실제 PBP 엔진을 여기서 돌려볼 수 없었다. 대신 새 하이드레이션 로직이 수행하는 것과 동일한 DB 관계(인스턴스→원본 선수 resolve, `room_player_state` 독립 저장)를 `DO $$ ... RAISE EXCEPTION` 롤백 패턴으로 직접 재현해 검증:
- 실제 `meta_players` 2명(공유 선수 1 + A팀 전용 1)으로 A팀·B팀에 각각 인스턴스 발급(A팀은 공유 선수+전용 선수 총 2장, B팀은 공유 선수 1장)
- `room_player_instances`에서 `instance_id → source_player_id` resolve 결과: 인스턴스 3건, distinct source 2명 — 기대값과 일치
- 공유 선수의 두 인스턴스가 원본 `meta_players.name`으로 정확히 resolve되는지 확인(`same_source_names_match=true`)
- **핵심 검증**: 같은 실제 선수를 가진 두 인스턴스에 `room_player_state`로 서로 다른 상태(A팀 쪽 `Injured`/체력40, B팀 쪽 `Healthy`/체력95)를 기록 → 둘 다 충돌 없이 독립 저장됨(`independent_states=true`) — 이게 바로 이 설계(Phase 1의 room-scoped instance) 전체의 존재 이유였던 부분이라 가장 중요하게 확인한 지점
- 종료 후 `leagues`/`room_player_instances`/`room_player_state` 잔여 데이터 0건(롤백 정상)
- **남은 일**: 실제 `runSimulation()` 호출(box score의 `playerId`가 instance_id로 기록되는지, PBP 엔진이 instance 로스터로 정상적으로 팀을 구성하는지)은 Bun 런타임이 있는 환경(로컬 `bun run` 또는 fly.io 배포)에서 재확인 필요 — Phase 5/6에서 실제 UI로 개인 드래프트를 완료한 뒤 그 팀이 낀 경기가 정상 시뮬레이션되는지로 자연스럽게 검증될 예정

### Phase 3.5 — 픽 타이머 ✅ 완료 (2026-09-18)
- `migrations/add_personal_draft_timer.sql` — **적용 완료**. `personal_draft_progress.pack_started_at timestamptz` 추가 + 내부 함수 4종(`personal_draft_sample_pack` / `personal_draft_apply_pick` / `personal_draft_is_expired` / `personal_draft_autopick_expired`, anon/authenticated EXECUTE 회수) + `get_or_generate_round_pack`/`submit_personal_draft_pick` 재정의(진입 시 만료면 자동 지명 선실행, submit은 `expired:true`로 유저 픽 무시) + `personal_draft_sweep_expired()`(service_role 전용, `FOR UPDATE SKIP LOCKED`). 응답 JSON에 `packStartedAt / pickTimerSec / serverNow / autoPicked / expired` 추가
- `services/multi/personalDraftFormat.ts` — `PersonalDraftFormat.pickTimerSec: number | null` + 검증(정수 1 이상, null이면 타이머 없음)
- `services/multi/personalDraft.ts` — 래퍼 반환 타입에 타이머 필드 반영
- `server/src/scheduler.ts` — `runPersonalDraftSweeps()`를 30초 틱에 추가(`personal_draft_sweep_expired` RPC 호출)
- 설계 메모: 만료 판정의 단일 주체는 서버. 클라이언트는 `serverNow - Date.now()` 오프셋으로 시계를 보정해 카운트다운만 그리고, 0에 닿으면 `get_or_generate_round_pack`을 재호출해 서버 결과를 반영한다(클라가 직접 자동 지명하지 않음). 라운드가 넘어갈 때 다음 팩을 즉시 생성해 `offered_pool`이 in_progress 중에 null인 순간이 없다.

### Phase 5 — 클라이언트 UI: 개인 드래프트 화면 ✅ 완료 (2026-09-18, 수동 브라우저 검증은 미실시)
15. `hooks/usePersonalDraft.ts` — 완료. start(멱등) → 팩/로스터 하이드레이트(`meta_players` + `room_player_instances`, 선수 캐시), 픽 타이머 카운트다운(500ms 틱, 서버 오프셋 보정, 팩당 1회 만료 재동기화), `submitPick`/`refresh`
16. `views/multi/league/PersonalDraftView.tsx` + `components/draft/PersonalDraftCard.tsx` — 완료. 승인된 시안(v49) 그대로: 헤더 [뒤로+토너먼트명 | `{N}라운드 mm:ss`(≤30초 amber) | 지명하기] / 바디 [라운드 구성 17% | 카드 그리드 2·3·4열 | 내 로스터 17%]. 카드 배경은 `base_team_id` 팀 컬러, 로고는 `getRealTeamLogoUrl`, OFF=round((INS+OUT)/2). 라운드 펄스 keyframes는 `index.css`(`.round-current`). (계획서의 `views/multi/tournament/` 경로 대신 기존 `MultiDraftView`와 같은 `views/multi/league/`에 둠 — `LeagueLayout` 컨텍스트 하위 라우트라서)
17. 라우트/연결 — 완료. `App.tsx` `/multi/leagues/:leagueId/personal-draft`; `LeagueLobbyPanel.tsx` `handleJoinAndClaim`/`handleClaim` 성공 직후 `personal_draft_format`이 있으면 개인 드래프트로 navigate, 마스트헤드 버튼은 로터리 대신 "내 팀 확정 && recruiting" 조건으로 "팩 드래프트 입장"; `MultiHeader.tsx` 우측 버튼도 동일 분기
18. 검증: `tsc --noEmit` 신규/수정 파일 오류 0. **브라우저 수동 테스트(참가 → 팀선택 → 라운드 진행 → 완료 → 새로고침 복원)는 Phase 6 어드민 UI로 실제 포맷을 만든 뒤 진행** — 현재 personal_draft_format을 가진 리그가 없어 화면 진입 경로가 아직 없음.

### Phase 6 — 어드민 설정 UI ✅ 완료 (2026-09-18, 브라우저 수동 검증은 미실시)
19. 완료.
    - `components/multi/PersonalDraftFormatEditor.tsx` (신규, 공용) — 픽 제한시간(체크 해제=무제한, 10~600초, mm:ss 미리보기) / "하락 커브 프리셋"(라운드 수·창 폭·노출·픽 입력 → `buildFixedDeclineCurve`) / 라운드 테이블(OVR 범위, 지명 연도 빈칸=글로벌, 노출 카드, 픽 수, 삭제) / 총 로스터 합계 + 즉시 검증(`validatePersonalDraftInput`, 8~20명 하드, 13명 미만 경고) / "후보 인원 확인" 버튼(`buildPersonalDraftFormat` 실행 → 라운드별 후보 수 표시, 부족 라운드 빨간 행)
    - `components/multi/CreateLeagueModal.tsx` — 토너먼트에 "드래프트 방식" 토글(공유 풀 턴제 / 개인 팩 드래프트). 개인이면 로터리·드래프트 일시 입력과 라운드/픽제한/오토픽 입력을 숨기고 편집기를 노출. 생성 시 `buildPersonalDraftFormat`로 후보 확정 → `createLeague(options: { personalDraftFormat, tradeEnabled:false, maxRosterSize: clamp(로스터,15,20), draftTotalRounds: 로스터, lotteryScheduledAt:null, draftScheduledAt:null })` + `createRoom(simSettings: { injuriesEnabled:false })`. 토너먼트 시작 일시는 "현재+15분 이후"만 검사.
    - `views/multi/league/settings/PersonalDraftSettingsTab.tsx` (신규) — `personal_draft_format`이 있는 리그의 드래프트 탭 전체를 대체(자체 저장 버튼). 시작 일시/경기 간격/경기 포맷 + 글로벌 풀 범위(`DraftPoolSettings hideDraftOrder`) + 편집기. **잠금**: `personal_draft_progress` 행이 1개라도 있으면(누군가 드래프트 시작) 포맷/범위/타이머는 읽기 전용, 일정·경기 포맷만 저장.
    - `views/multi/league/LeagueSettingsView.tsx` — `isPersonalDraft` 분기로 공유풀 섹션 3곳(일정·라운드 / 추첨 / 결과) 숨김, 상단 공용 저장 버튼 제외, 엔진 탭 부상 토글 비활성(항상 off 안내)
    - `components/multi/DraftPoolSettings.tsx` — `hideDraftOrder` prop
    - `services/multi/personalDraftFormat.ts` — 동기 검증을 `validatePersonalDraftInput()`로 분리(build도 이 함수를 먼저 호출), `buildFixedDeclineCurve()` 프리셋, 한계 상수(`PERSONAL_DRAFT_ROSTER_MIN/MAX`=8/20, `PICK_TIMER_SEC_MIN/MAX/DEFAULT`=10/600/90 등). **총 로스터 8~20명 제한이 새로 추가됨**(Phase 2엔 없던 규칙)
20. 검증: `tsc --noEmit` 신규/수정 파일 오류 0. 브라우저 수동 검증(생성 → 참가 → 드래프트 → 저장 잠금)은 Phase 7 E2E와 함께.

**남은 갭(Phase 7로 이관)**: 토너먼트가 `in_progress`로 넘어가며 브라켓/일정이 생성되는 건 현재 `server/src/finalize.ts`의 `finalizeDraft()`(공유풀 드래프트 룸 완료) 한 경로뿐이다. 개인 드래프트 리그는 드래프트 룸이 없으므로 **시작 트리거가 아직 없다** — `tournament_start_at` 도달 시(또는 모든 팀 completed 시) `forceInitSchedule(roomId)` 계열을 호출하는 스케줄러 작업이 필요하다. 미완료 팀 처리(자동 지명으로 채우기)도 같이 정해야 한다.

### Phase 7 — 시작 트리거 + 종료 후 정리 + 통합 테스트 ✅ 서버/DB 완료 (2026-09-18) / 브라우저 E2E 미실시
20-b. **시작 트리거(Phase 6에서 이관된 갭)** — 완료.
    - `migrations/add_personal_draft_room_ops.sql` — **적용 완료**. `personal_draft_force_complete_room(p_room_id)`(service_role 전용): 룸의 모든 `league_teams`에 진행 행이 없으면 생성(미참가/AI 포함) 후 남은 라운드를 팩 내 최고 OVR 자동 지명으로 채워 `completed`로 만든다(`personal_draft_apply_pick` 재사용 → 타이머 만료 자동 지명과 동일 규칙). `personal_draft_cleanup_room(p_room_id)`(service_role 또는 리그 어드민 세션, `p_user_id` 우회 인자 없음): `room_player_state`(인스턴스 id 행) → `room_player_instances` → `personal_draft_progress` 삭제, 카운트 반환.
    - `server/src/personalDraftStart.ts` (신규) — `startPersonalDraftTournament(leagueId, roomId)`: `recruiting→in_progress` 원자 클레임 → 미참가 팀 AI 멤버 채우기(`startDraft.ts` 규칙 미러: 가짜 UUID `00000000-…-NNN`, `room_members` upsert, `league_teams.is_ai`만 표시) → `force_complete_room` RPC → `finalize.ts:forceInitSchedule()`(전술 초기화 + 브라켓/games). 실패 시 status를 `recruiting`으로 되돌려 다음 틱 재시도.
    - `server/src/scheduler.ts` — `runPersonalDraftTournamentStarts(now)`: `status='recruiting' AND type='tournament' AND personal_draft_format IS NOT NULL AND tournament_start_at <= now` 리그를 찾아 위 함수 호출. 틱 목록에 추가.
    - `server/src/finalize.ts` — `initializeTeamTactics()`가 roster id를 `room_player_instances`로 먼저 조회해 인스턴스면 source 선수로 하이드레이트하고 `Player.id`는 instance_id로 덮어씀(`simRunner.ts` isInstanceRoom 분기와 동일 규칙). 인스턴스 행이 없으면 기존 경로.
21. 완료 — 계획의 `tournamentArchiver.ts` 대신 호출부인 `server/src/simRunner.ts`(아카이브 성공 직후, `status='finished'` 다음)에서 `personal_draft_cleanup_room` RPC 호출. 아카이브가 실패하면 재시도 때 박스스코어를 다시 읽어야 하므로 지우지 않는다. 추가로 클라이언트 `resetTournament()`(`services/multi/leagueService.ts`)도 로스터 초기화 뒤 같은 RPC를 호출(안 지우면 재참가 시 `start_personal_draft`가 `completed` 행을 돌려줘 재드래프트 불가).
22. **통합 테스트** — DB 레벨 롤백 테스트 완료(Supabase MCP `DO $$` + `RAISE EXCEPTION`): 2팀(사람 1픽 후 이탈 / 미참가) × 2라운드(풀 8·픽 2) 포맷 → `force_complete_room` = `{teams:2, autoPicks:7}`, progress completed 2, 인스턴스 8, 로스터 4/4, **같은 실제 선수가 양 팀에 3명(중복 허용 확인)**; `room_player_state` 3행 삽입 후 비어드민 authenticated 호출 `not_league_admin` 거부, 어드민 세션 `cleanup_room` = `{progress:2, instances:8, playerStates:3}`, 잔여 0. **브라우저 E2E(생성 → 참가 → 드래프트 → 시작 → 경기 시뮬 → 종료 → 아카이브)는 미실시** — Bun 런타임(fly.io 배포)에서 실제 경기 시뮬레이션이 인스턴스 로스터로 도는지가 남은 마지막 검증 지점(Phase 4 보류분과 동일).
23. `docs/history/dev-log.md` 기록 완료.

### Phase 8 — 참가/드래프트 마감 + 자동 강퇴 ✅ 완료 (2026-09-18, DB 롤백 테스트 통과, fly.io 배포 전)
사용자 요청(Phase 1~7 완료 후 후속): "토너먼트 세션을 만들 때 드래프트 기한을 설정할 수 있도록 만들어줘. 그 드래프트 기한을 넘기면 새 참가자가 더 이상 참가할 수 없고, 아직 드래프트 하지 않은 참가자는 자동으로 강퇴되어야해."
- `leagues.draft_deadline_at`(nullable timestamptz) 추가. `claim_team` RPC가 개인 드래프트 리그에서 마감이 지나면 신규 참가/팀 변경을 거부(`draft_deadline_passed`). `server/src/personalDraftDeadline.ts`(신규)가 스케줄러 틱마다 마감 지난 리그를 찾아 `personal_draft_progress.status≠'completed'`(또는 행 없음)인 팀 소유자를 기존 `release_team` RPC로 강퇴 — 새 SQL 함수 없이 어드민 수동 강퇴와 동일 경로 재사용.
- 강퇴 후 로스터/진행 행은 그대로 둔다 — Phase 7의 토너먼트 시작 트리거(`personal_draft_force_complete_room`)가 어차피 미완료 진행 행을 이어서 자동 지명으로 채우므로, 빈 팀은 시작 시점에 자연스럽게 AI로 넘어간다.
- UI: `CreateLeagueModal.tsx`(생성, 선택 사항 체크박스), `PersonalDraftSettingsTab.tsx`(세션 설정, 언제든 편집 가능 — 포맷 잠금과 무관), `LeagueLobbyPanel.tsx`(카운트다운 섹션 + 참가/변경 버튼 자동 숨김; 겸사겸사 개인 드래프트 리그에서 무의미하게 뜨던 "드래프트 순서 추첨" 로터리 섹션도 이번에 가림).
- 상세: `docs/history/dev-log.md` 2026-09-18 "참가/드래프트 마감 + 미완료 참가자 자동 강퇴" 항목. **fly.io 재배포 전까지 강퇴 스윕은 미동작**(DB의 `claim_team` 차단만 즉시 유효).

### 순서를 이렇게 잡은 이유
- DB 스키마가 가장 먼저인 이유: 이후 모든 단계(서버 로직, RPC, UI)가 이 스키마를 전제로 하므로.
- 시뮬레이션 엔진(Phase 4)을 UI(Phase 5)보다 먼저 두는 이유: UI 없이도 RPC 직접 호출로 로스터까지는 만들 수 있고, "인스턴스 로스터로 실제 경기가 정상 도는지"가 이 설계 전체의 핵심 리스크이므로 먼저 검증해야 UI 작업이 헛수고가 되지 않음.
- 어드민 UI(Phase 6)가 개인 드래프트 UI(Phase 5)보다 뒤인 이유: 개인 드래프트 RPC/화면은 Phase 2에서 수동으로 구성한 포맷 데이터로도 테스트 가능하므로, 어드민 UI가 없어도 앞 단계 검증에 지장 없음.

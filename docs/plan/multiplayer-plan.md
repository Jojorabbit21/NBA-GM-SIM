# 멀티플레이어 통합 설계 — 싱글/멀티 DB 분리 (메인리그 / 토너먼트)

## Context

NBA-GM-SIM은 **출시·안정 단계의 싱글플레이 모드**가 운영 중이며, 이제 멀티플레이어를 신규로 추가하려 한다. 핵심 결정은 "이미 잘 동작하는 싱글 DB/코드 경로를 어떻게 보존하면서 멀티를 안전하게 붙일 것인가"다.

### 결정 (2026-04-08)

**Option B — 싱글/멀티 DB 분리** 채택. 싱글은 기존 `saves` 그대로 유지하고, 멀티는 신규 테이블·신규 코드 경로로 그린필드 구축. 엔진 로직(PBP/trade/sim/finance)은 **plain object 인자**로 양쪽이 공유한다.

| 항목 | 싱글 | 멀티 (메인리그 / 토너먼트) |
|---|---|---|
| 영속성 테이블 | 기존 `saves` + `user_*` (변경 없음) | 신규 `leagues`, `rooms`, `room_members`, `room_*_results` … |
| 영속성 코드 | 기존 `services/persistence.ts`, `services/queries.ts`, `services/messageService.ts` | 신규 `services/multi/*` |
| 데이터 훅 | 기존 `useGameData()` (변경 없음) | 신규 `useMultiGameData()` |
| 라우팅 | 기존 라우트 (변경 없음) | 신규 `/multi/*` 라우트 |
| 엔진 (PBP / trade / sim / offseason / fa / finance) | 기존 그대로 | **동일 엔진**을 in-memory 객체로 호출 |
| 회귀 위험 | **0** (싱글 코드 5개 파일 옵션 인자만 추가) | 그린필드 신규 |

### 이 결정의 근거

1. **싱글은 운영 중 안정 코드** — 25+ JSONB 컬럼의 `saves`가 정상 작동하고 사용자 데이터가 누적 중. 18개 파일 동시 리팩토링의 회귀 위험을 감수할 가치가 낮음.
2. **멀티는 그린필드** — 처음부터 정규화된 구조로 깔끔하게 설계 가능, 진척이 막혀도 싱글에 영향 없음.
3. **엔진 = plain object 함수** — `services/game/engine/pbp/`, `services/tradeEngine/tradeExecutor.ts`, `services/financeEngine/` 등은 이미 순수 함수/plain object로 동작 → DB 모양을 모름. 어댑터가 같은 in-memory 객체를 만들어주는 한 양쪽 모드에서 0줄 수정으로 재사용 가능.
4. **싱글 다중 세이브 불필요 (사용자 결정)** — `save_slot` 컬럼 추가 작업 없음. 싱글은 1유저 1세이브 유지.
5. **메인리그/토너먼트는 시즌 단위 운영** — 자산 영속화 X → 멀티 측 영속성도 단순.

### 멀티플레이어 운영 모드 2종

| 모드 | 인원 | 운영 단위 | 시즌 시작 드래프트 | 승강 | 옵션 토글 |
|------|------|------|------|------|------|
| **메인리그** | 90명 (Pro/D/U × 30) | 시즌 단위 (매 시즌 리셋) | 매 시즌, tier별 독립 | O | O (운영자 설정) |
| **토너먼트** | 8~128 | 단발성 | 옵션 | X | O (운영자 설정) |

이 둘은 같은 멀티 코드/같은 신규 테이블을 공유하되 `leagues.type`/`tier`/`tournament_format`/`*_enabled` 플래그로 분기.

### 사용자 정정사항 (기록)

- 메인리그 드래프트는 매 시즌 시작 전 실시 (시즌 1만 1회 X)
- 3 tier는 독립적으로 드래프트 진행
- 메인리그 = 한 시즌 단위 운영, 매 시즌 끝나면 로스터 전부 리셋
- 다년 자산(`league_user_franchises`) 불필요
- 메인리그도 옵션 토글 운영자 설정 가능
- **싱글 DB는 변경하지 않는다** (Option B, 2026-04-08)

베이스 참고 문서: [docs/plan/room-architecture.md](docs/plan/room-architecture.md), [docs/plan/multiplayer-plan.md](docs/plan/multiplayer-plan.md)

---

## 1. 데이터 모델 설계

### 1.1 싱글 — 변경 없음

기존 그대로 유지한다.
- `saves` (PK: `user_id`) — 25+ 컬럼 JSONB로 모든 리그 상태
- `user_game_results` — 박스스코어 누적
- `user_transactions` — 트레이드/부상 기록
- `user_messages` — 인박스
- `user_playoffs` — 플레이오프 브래킷
- 진입점: 기존 [services/persistence.ts](services/persistence.ts), [hooks/useGameData.ts](hooks/useGameData.ts)

→ DDL/DML 변경 없음. 회귀 위험 0.

### 1.2 멀티 신규 테이블 (그린필드)

```
league_groups        ← 메인리그 다년 컨테이너 (토너먼트는 NULL)
leagues              ← 시즌 인스턴스 (메인=tier별 1개, 토너=1개)
rooms                ← 게임 세계 1벌 (멀티 전용; league_id NOT NULL)
room_members         ← 멤버 N행 (PK: room_id + user_id)
room_game_results    ← 방 소유 (모든 멤버 공유)
room_transactions    ← 방 소유 (트레이드/부상)
room_playoffs        ← 방 소유 (브래킷)
room_playoff_results ← 방 소유
room_messages        ← 멤버별 (user_id 필터)
league_promotions    ← 메인리그 승강 결정 (전용)
league_user_history  ← 메인리그 시즌 통계 (전용)
meta_rookies_pool    ← 글로벌 신인 풀 (싱글 EditorModal + 멀티 드래프트 공용)
```

데이터 소유권:

| 데이터 | 소유 | 위치 | 이유 |
|---|---|---|---|
| sim_date, season, roster_state, draft_state, tendency_seed | 방 | rooms | 모든 멤버 같은 시간선 공유 |
| team_id, tactics, depth_chart | 멤버 | room_members | 멤버마다 다름 |
| 경기 결과 / 트랜잭션 / 플레이오프 | 방 | room_* | 같은 결과 공유 |
| 메시지 | 멤버 | room_messages | 인박스는 개인 |

### 1.3 leagues + league_groups

```sql
-- 메인리그 다년 컨테이너
CREATE TABLE league_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    admin_user_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'recruiting', -- 'recruiting'|'in_season'|'between_seasons'|'finished'
    current_season_number INTEGER NOT NULL DEFAULT 1,
    default_options JSONB NOT NULL DEFAULT '{}',  -- 상속할 디폴트 옵션
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 시즌 인스턴스 (매 시즌 신규)
CREATE TABLE leagues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,                        -- 'main_league'|'tournament'
    group_id UUID REFERENCES league_groups(id) ON DELETE CASCADE, -- 메인=필수, 토너=NULL
    tier TEXT,                                 -- 'pro'|'dleague'|'uleague' (메인 전용)
    name TEXT NOT NULL,
    admin_user_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'recruiting', -- 'recruiting'|'drafting'|'in_progress'|'finished'
    max_teams INTEGER NOT NULL DEFAULT 30,     -- 메인=30, 토너=8/16/32/64/128
    season_number INTEGER NOT NULL DEFAULT 1,
    -- 기능 토글 (메인/토너 공통)
    cap_enabled            BOOLEAN DEFAULT TRUE,
    finance_enabled        BOOLEAN DEFAULT TRUE,
    trade_enabled          BOOLEAN DEFAULT TRUE,
    fa_enabled             BOOLEAN DEFAULT TRUE,
    rookie_draft_enabled   BOOLEAN DEFAULT FALSE,  -- 시즌 도중 신인 드래프트 (메인=FALSE)
    coaching_enabled       BOOLEAN DEFAULT TRUE,
    training_enabled       BOOLEAN DEFAULT TRUE,
    -- 시즌 시작 드래프트
    start_draft_enabled    BOOLEAN DEFAULT TRUE,
    draft_pool             TEXT DEFAULT 'standard', -- 'current'|'alltime'|'standard'|'custom'
    draft_format           TEXT DEFAULT 'snake',
    draft_pool_strategy    TEXT DEFAULT 'shared_sequential',
    draft_pick_duration_sec INTEGER DEFAULT 90,
    rookie_pool_inclusion  BOOLEAN DEFAULT TRUE,
    draft_scheduled_at     TIMESTAMPTZ,
    -- 토너먼트 전용
    tournament_format      TEXT,                -- 'single_elim'|'double_elim'|'round_robin'
    match_format           TEXT,                -- 'best_of_1'|'best_of_3'|'best_of_7'
    bracket_data           JSONB,
    -- 시즌 운영
    season_start_date      TEXT DEFAULT '2025-10-20',
    real_time_pace         TEXT DEFAULT 'daily',
    created_at             TIMESTAMPTZ DEFAULT now(),
    UNIQUE (group_id, tier, season_number)
);
CREATE INDEX idx_leagues_group  ON leagues (group_id, season_number);
CREATE INDEX idx_leagues_status ON leagues (status, type);

-- 모드 일관성 강제
ALTER TABLE leagues ADD CONSTRAINT leagues_mode_consistency CHECK (
  (type='main_league' AND group_id IS NOT NULL AND tier IS NOT NULL AND tournament_format IS NULL)
  OR
  (type='tournament' AND group_id IS NULL AND tier IS NULL AND tournament_format IS NOT NULL)
);
```

### 1.4 rooms + room_members + room_*

```sql
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE, -- 멀티 전용 (NOT NULL)
    name TEXT,
    max_players INTEGER NOT NULL,                  -- league.max_teams 미러
    status TEXT NOT NULL DEFAULT 'active',          -- 'active'|'finished'
    season TEXT NOT NULL DEFAULT '2025-2026',
    season_number INTEGER NOT NULL DEFAULT 1,
    sim_date TEXT NOT NULL DEFAULT '2025-10-20',
    offseason_phase TEXT,
    -- 게임 세계 상태 (싱글 saves의 JSONB 컬럼들과 동형 — 어댑터로 변환)
    roster_state           JSONB,
    draft_state            JSONB,
    tendency_seed          TEXT,
    replay_snapshot        JSONB,
    sim_settings           JSONB,
    coaching_staff         JSONB,
    team_finances          JSONB,
    league_pick_assets     JSONB,
    league_cap_history     JSONB,
    league_trade_blocks    JSONB,
    league_trade_offers    JSONB,                   -- M6에서 정규화 후보
    league_gm_profiles     JSONB,
    league_fa_pool         JSONB,
    league_fa_market       JSONB,
    league_training_configs JSONB,
    coach_fa_pool          JSONB,
    retired_player_ids     JSONB,
    lottery_result         JSONB,
    schema_version         INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE room_members (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,                          -- AI는 시스템 예약 UUID
    team_id TEXT,                                   -- 드래프트 후 결정
    tactics JSONB,
    depth_chart JSONB,
    is_ai BOOLEAN DEFAULT FALSE,
    ai_gm_personality TEXT,
    ai_gm_sliders JSONB,
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);
CREATE INDEX idx_rm_user ON room_members (user_id);

CREATE TABLE room_game_results (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    date TEXT NOT NULL,
    home_team_id TEXT NOT NULL,
    away_team_id TEXT NOT NULL,
    home_score INTEGER NOT NULL,
    away_score INTEGER NOT NULL,
    box_score JSONB,
    tactics JSONB,
    pbp_logs JSONB,
    shot_events JSONB,
    rotation_data JSONB,
    is_playoff BOOLEAN DEFAULT FALSE,
    UNIQUE (room_id, game_id)
);
CREATE INDEX idx_rgr_room_date ON room_game_results (room_id, date DESC);

CREATE TABLE room_transactions (...);  -- 싱글 user_transactions와 동형 + room_id
CREATE TABLE room_playoffs (...);       -- (room_id, season) PK
CREATE TABLE room_playoff_results (...);
CREATE TABLE room_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    team_id TEXT,
    date TEXT,
    type TEXT,
    title TEXT,
    content JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_rmsg_user ON room_messages (room_id, user_id);
```

### 1.5 메인리그 — 승강 + 시즌 이력

```sql
CREATE TABLE league_promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES league_groups(id) ON DELETE CASCADE,
    from_season INTEGER NOT NULL,
    to_season INTEGER NOT NULL,
    user_id UUID NOT NULL,
    from_tier TEXT NOT NULL,
    to_tier TEXT NOT NULL,
    final_rank INTEGER NOT NULL,
    movement TEXT NOT NULL,                    -- 'promoted'|'relegated'|'stayed'
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (group_id, from_season, user_id)
);
CREATE INDEX idx_lp_to_season ON league_promotions (group_id, to_season);

CREATE TABLE league_user_history (
    group_id UUID NOT NULL REFERENCES league_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    season_number INTEGER NOT NULL,
    tier TEXT NOT NULL,
    team_id TEXT NOT NULL,
    wins INTEGER, losses INTEGER,
    final_rank INTEGER,
    playoff_result TEXT,
    roster_snapshot JSONB,
    PRIMARY KEY (group_id, user_id, season_number)
);
```

자산 영속화 없음. 매 시즌 새 드래프트로 처음부터. `league_user_history`는 통계/이력 표시용.

### 1.6 좋은 신인 풀 (양쪽 모드 공용 글로벌 메타)

```sql
CREATE TABLE meta_rookies_pool (
    id TEXT PRIMARY KEY,                       -- prefix 'r_' (meta_players와 키 공간 분리)
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    age INTEGER DEFAULT 19,
    base_attributes JSONB NOT NULL,
    archetype TEXT,
    created_by UUID NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

- 운영자가 admin UI에서 등록/편집
- 멀티 드래프트 풀 구성: `meta_players + meta_rookies_pool` 합쳐서 사용
- 싱글 EditorModal에서도 동일 테이블 편집 가능 (글로벌 공용)
- `leagues.rookie_pool_inclusion = false`면 풀에서 제외

### 1.7 코드 공유 vs 분리 매트릭스

| 레이어 | 싱글 | 멀티 | 공유 여부 |
|---|---|---|---|
| DB 영속성 | 기존 [services/persistence.ts](services/persistence.ts) | 신규 `services/multi/roomPersistence.ts` | **분리** |
| 쿼리 / 로드 | 기존 [services/queries.ts](services/queries.ts) | 신규 `services/multi/roomQueries.ts` | **분리** |
| 메시지 | 기존 [services/messageService.ts](services/messageService.ts) | 신규 `services/multi/roomMessageService.ts` | **분리** |
| 데이터 훅 | 기존 [hooks/useGameData.ts](hooks/useGameData.ts) | 신규 `hooks/useMultiGameData.ts` | **분리** |
| 시뮬 훅 | 기존 [hooks/useSimulation.ts](hooks/useSimulation.ts), [hooks/useFullSeasonSim.ts](hooks/useFullSeasonSim.ts) | 신규 `hooks/useMultiSimulation.ts` | **분리** |
| 라우팅 | 기존 [App.tsx](App.tsx) 라우트 그대로 | `/multi/*` 라우트 신규 추가 | **분리** |
| PBP 엔진 | `services/game/engine/pbp/` | 동일 | **공유** (Edge Function용 Deno 복사본 추가) |
| 트레이드 엔진 | [services/tradeEngine/tradeExecutor.ts](services/tradeEngine/tradeExecutor.ts) | 동일 | **공유** (`capEnabled` 옵션 인자) |
| 시즌/오프시즌 시뮬 | `services/simulation/*` | 동일 | **공유** (`rookieDraftEnabled` 옵션) |
| 재정 | `services/financeEngine/` | 동일 | **공유** |
| FA 시스템 | `services/fa/*` | 동일 | **공유** |

→ **원칙**: 엔진 = 공유 / 영속성 = 분리. 엔진은 plain object만 받기 때문에 어댑터가 같은 in-memory shape를 만들어주는 한 양쪽에서 동작.

---

## 2. 모드별 상세 설계

### 2.1 싱글플레이 (변경 없음)

기존 유지. M1~M8 어떤 작업도 싱글 코드 경로를 건드리지 않는다. 단, 5개 파일에 옵션 인자만 추가 (default = 기존 동작).

### 2.2 메인리그 (다년 group, 시즌 단위 운영)

#### 2.2.1 시즌 라이프사이클

```
[시즌 0] 운영자가 league_group 생성 + default_options 설정
   ↓
   3개 leagues 자동 생성 (Pro / D-League / U-League, season_number=1)
   3개 rooms 자동 생성 (각 league 1 room)
   ↓
[모집] 유저 join (tier 선택 또는 admin 배정)
   ↓ 정원(90명) 미달 시 → fillEmptyTeamsWithAI()
   ↓
[드래프트] tier별 독립 진행
   - 풀 = meta_players + meta_rookies_pool (옵션)
   - 풀 분배 전략 (운영자 선택):
     · 'shared_sequential': 같은 풀, Pro→D→U 순차
     · 'separate_pool': tier별 사전 분배
     · 'simultaneous_disjoint': 사전 분배된 풀로 동시 진행
   ↓
[정규시즌] 서버 시뮬 (simulate-game EF)
   - 3 tier 모두 같은 sim_date
   - tier 간 경기 없음 (각자 30팀 풀리그)
   ↓
[플레이오프] tier별 16강
   ↓
[승강 결정] runPromotion(groupId, season)
   - Pro 하위 4 → D, D 상위 4 → Pro
   - D 하위 4 → U, U 상위 4 → D
   - league_promotions INSERT
   - league_user_history INSERT (이력만, 자산 X)
   ↓
[시즌 정산] 모든 로스터/계약/현금 폐기
   ↓
[시즌 N+1] start-new-season EF
   - 새 leagues × 3 + 새 rooms × 3 + 새 schedule × 3
   - league_promotions 결과대로 새 leagues에 멤버 배정
   - 새 드래프트 진행 (이전과 무관)
```

#### 2.2.2 승강 결정 알고리즘

```ts
async function runPromotion(groupId: string, fromSeason: number) {
    const standings = await loadStandings(groupId, fromSeason);
    const movements: PromotionMovement[] = [];

    standings.pro.slice(-4).forEach((s, i) =>
        movements.push({ user_id: s.user_id, from_tier: 'pro', to_tier: 'dleague',
                         final_rank: 27+i, movement: 'relegated' }));
    standings.dleague.slice(0, 4).forEach((s, i) =>
        movements.push({ user_id: s.user_id, from_tier: 'dleague', to_tier: 'pro',
                         final_rank: i+1, movement: 'promoted' }));
    standings.dleague.slice(-4).forEach((s, i) =>
        movements.push({ user_id: s.user_id, from_tier: 'dleague', to_tier: 'uleague',
                         final_rank: 27+i, movement: 'relegated' }));
    standings.uleague.slice(0, 4).forEach((s, i) =>
        movements.push({ user_id: s.user_id, from_tier: 'uleague', to_tier: 'dleague',
                         final_rank: i+1, movement: 'promoted' }));

    // 잔류 유저 'stayed'로 추가 (74명)
    // ... (생략)

    await supabase.from('league_promotions').insert(movements.map(m => ({
        ...m, group_id: groupId, from_season: fromSeason, to_season: fromSeason + 1
    })));
}
```

#### 2.2.3 다음 시즌 시작 (`start-new-season` EF)

```ts
async function startNewSeason(groupId: string) {
    const group = await loadGroup(groupId);
    const newSeason = group.current_season_number + 1;
    const promotions = await loadPromotions(groupId, newSeason);

    for (const tier of ['pro', 'dleague', 'uleague']) {
        const newLeague = await createLeague({
            type: 'main_league', group_id: groupId, tier,
            season_number: newSeason,
            ...group.default_options,
        });
        const newRoom = await createRoom({ league_id: newLeague.id, max_players: 30 });

        const tierUsers = promotions.filter(p => p.to_tier === tier);
        for (const u of tierUsers) {
            await insertRoomMember(newRoom.id, u.user_id, null);
        }
        if (tierUsers.length < 30) {
            await fillEmptyTeamsWithAI(newLeague.id, 30 - tierUsers.length);
        }
        await scheduleStartDraft(newLeague.id);
    }

    await updateGroup(groupId, { current_season_number: newSeason, status: 'in_season' });
}
```

→ 이전 시즌 leagues/rooms는 그대로 보존(읽기 전용 이력), 새 시즌은 처음부터.

#### 2.2.4 옵션 토글 (운영자 설정)

```ts
type MainLeagueOptions = {
    cap_enabled: boolean;
    finance_enabled: boolean;
    trade_enabled: boolean;
    fa_enabled: boolean;
    rookie_draft_enabled: boolean;    // 디폴트 false
    coaching_enabled: boolean;
    training_enabled: boolean;
    start_draft_enabled: boolean;     // 디폴트 true
    draft_pool: 'current'|'alltime'|'standard'|'custom';
    draft_format: 'snake'|'auction'|'manual_assignment';
    draft_pool_strategy: 'shared_sequential'|'separate_pool'|'simultaneous_disjoint';
    draft_pick_duration_sec: number;
    rookie_pool_inclusion: boolean;
    real_time_pace: 'daily'|'12h'|'6h';
};
```

운영자 admin UI: `views/multi/admin/LeagueGroupAdmin.tsx`에서 `default_options` 편집 + 매 시즌 leagues별 override.

### 2.3 토너먼트 (단발성, 옵션 토글)

#### 2.3.1 라이프사이클

```
[생성] 운영자가 leagues type='tournament' INSERT
   ↓
[모집] 유저 join (선착순/초대코드)
   ↓ 정원 미달 → AI GM 채움 옵션
   ↓
[드래프트] (옵션, start_draft_enabled에 따라)
   ↓
[브래킷 생성] generateBracket(participantIds, format)
   - leagues.bracket_data JSONB
   ↓
[매치 진행] 라운드별 일괄 시뮬 (advance-tournament-round EF)
   ↓
[종료] leagues.status='finished'
```

#### 2.3.2 브래킷 데이터 구조

```ts
type BracketData = {
    format: 'single_elim'|'double_elim'|'round_robin';
    rounds: BracketRound[];
    seeds: { user_id: string, seed: number }[];
    currentRoundIdx: number;
};
type BracketRound = { round_idx: number; matches: BracketMatch[] };
type BracketMatch = {
    match_id: string;
    home_user_id: string|null; away_user_id: string|null;
    home_score: number|null; away_score: number|null;
    status: 'pending'|'in_progress'|'completed';
    games: MatchGame[];
    winner_user_id: string|null;
    next_match_id: string|null;
};
type MatchGame = {
    game_id: string;             // room_game_results.game_id FK
    game_number: number;
    home_team_id: string; away_team_id: string;
    sim_completed: boolean;
};
```

#### 2.3.3 옵션 토글 매트릭스 (메인리그와 동일 컬럼 공유)

`max_teams / tournament_format / match_format / cap_enabled / trade_enabled / fa_enabled / rookie_draft_enabled / draft_pool / draft_format / start_draft_enabled`

---

## 3. 코드 구조

### 3.1 멀티 코드 트리 (신규)

```
services/multi/
├── roomPersistence.ts          ← 싱글 persistence.ts 패턴 차용 (saveRoom/loadRoom)
├── roomQueries.ts              ← 싱글 queries.ts 패턴 차용
├── roomMessageService.ts       ← 싱글 messageService.ts 패턴 차용
├── leagueService.ts            ← createLeagueGroup, joinLeague, listLeagues
├── promotionEngine.ts          ← runPromotion 클라이언트 헬퍼
├── seasonRolloverService.ts    ← startNewSeason 클라이언트 헬퍼
├── bracketEngine.ts            ← generateBracket, advanceBracket (M7)
└── engineStateAdapter.ts       ← Room/RoomMember → EngineGameState 변환

hooks/
├── useMultiGameData.ts         ← useGameData 패턴 차용 (멀티)
├── useMultiSimulation.ts       ← useSimulation 패턴 차용
├── useCurrentLeague.ts
├── useLeagueConfig.ts          ← mode/tier/*_enabled 통일 진입점
├── useLeagueDraft.ts           ← 드래프트 Realtime 구독
└── useMultiLiveGame.ts         ← 멀티 라이브 PBP 구독

views/multi/
├── league/LeagueListView.tsx
├── league/LeagueLobbyView.tsx
├── league/MainLeagueDashboard.tsx
├── league/SeasonHistoryView.tsx
├── tournament/TournamentBracketView.tsx
├── admin/RookiePoolEditor.tsx
├── admin/LeagueGroupAdmin.tsx
└── admin/SeasonOptionsEditor.tsx

supabase/functions/
├── _shared/
│   ├── pbpEngine.ts            ← liveEngine.ts Deno 복사 (싱글 코드 0 변경)
│   ├── tradeExecutor.ts        ← Deno 복사
│   ├── promotionEngine.ts
│   └── bracketEngine.ts
├── start-draft/
├── submit-pick/
├── draft-cron/
├── start-new-season/
├── advance-tournament-round/
├── simulate-game/
├── schedule-games-cron/
├── update-tactics/
└── fill-empty-ai-slots/
```

### 3.2 엔진 공유 어댑터

엔진 함수가 받는 in-memory shape (이미 싱글에서 사용 중):
```ts
type EngineGameState = {
    teams: Team[];
    schedule: GameDate[];
    rosterState: Record<string, SavedPlayerState>;
    tactics: GameTactics;          // 호출자 컨텍스트 (싱글=내 전술 / 멀티=현재 멤버 전술)
    depthChart: DepthChart;
    seasonNumber: number;
    currentSeason: string;
    offseasonPhase: OffseasonPhase;
    // ... (현재 useGameData가 들고 있는 것과 동형)
};
```

- **싱글 어댑터**: 기존 [hooks/useGameData.ts](hooks/useGameData.ts)가 이미 이 shape를 만든다. 손대지 않음.
- **멀티 어댑터**: 신규 `services/multi/engineStateAdapter.ts`
  ```ts
  export async function loadEngineState(roomId: string, userId: string): Promise<EngineGameState> {
      const room = await loadRoom(roomId);
      const member = await loadRoomMember(roomId, userId);
      return {
          teams: parseTeamsFromRoom(room),
          schedule: room.schedule,
          rosterState: room.roster_state,
          tactics: member.tactics,
          depthChart: member.depth_chart,
          seasonNumber: room.season_number,
          currentSeason: room.season,
          offseasonPhase: room.offseason_phase,
          // ...
      };
  }
  ```
- 엔진 함수 (`runPbp`, `executeTradeProposal`, `processOffseason`, `awardVoting` …)는 `EngineGameState`만 받으므로 양쪽 다 호출 가능 → **0줄 수정**.

### 3.3 라우팅 분리

```
/auth                            ← Lobby (싱글/멀티 카드 분기 진입)

# 싱글 (기존 라우트, 변경 없음)
/                                ← 싱글 홈
/locker-room, /roster, /schedule, /standings, /leaderboard, /transactions,
/playoffs, /inbox, /front-office, /fa-market, /draft-lottery, /rookie-draft, ...

# 멀티 (신규)
/multi                           ← 리그 목록
/multi/leagues/:id/lobby         ← 메인리그 대기실
/multi/leagues/:id/draft         ← 드래프트 진행
/multi/leagues/:id/season        ← 시즌 (멀티용 홈)
/multi/leagues/:id/roster        ← 멀티 로스터
/multi/leagues/:id/schedule
/multi/leagues/:id/standings
/multi/leagues/:id/playoffs
/multi/leagues/:id/inbox
/multi/tournaments/:id/bracket   ← 토너먼트 브래킷
/multi/admin/rookie-pool         ← 운영자
/multi/admin/league-groups
/multi/admin/league-groups/:id/options
```

→ ProtectedLayout는 두 라우트 트리에 각각 별도 (`SingleProtectedLayout` 기존 / `MultiProtectedLayout` 신규).

### 3.4 useLeagueConfig (TypeScript 차별 유니온)

```ts
type LeagueContext =
  | { mode: 'single' }   // 싱글에선 호출 안 됨, default
  | { mode: 'main_league'; leagueId: string; tier: 'pro'|'dleague'|'uleague';
      groupId: string; options: MainLeagueOptions }
  | { mode: 'tournament'; leagueId: string; options: TournamentOptions; bracket: BracketData };

export function useLeagueConfig(): LeagueContext {
    const league = useCurrentLeague();
    if (!league) return { mode: 'single' };
    if (league.type === 'main_league') return { mode: 'main_league', ... };
    return { mode: 'tournament', ... };
}
```

→ 멀티 코드에서만 호출. 싱글 코드는 호출 안 함 (필요도 없음).

---

## 4. 핵심 기능별 구현 가능성

| 기능 | 가능성 | 핵심 위험 | 대응 |
|------|------|----------|------|
| **싱글 회귀 0 보장** | ⭐⭐⭐⭐⭐ | 옵션 인자 default 실수 | 단위 테스트 + 회귀 시나리오 |
| 멀티 신규 테이블 (그린필드) | ⭐⭐⭐⭐⭐ | 스키마 결정 | Phase 0 없음 |
| 엔진 공유 (어댑터 패턴) | ⭐⭐⭐⭐⭐ | EngineGameState 정합성 | 단위 테스트 + 양쪽 어댑터 비교 |
| AI GM 30 슬롯 자동화 | ⭐⭐⭐⭐ | EF 호출 부하 | cpuTradeEngine/cpuWaiverEngine Deno 복사 |
| 메인리그 시즌 단위 운영 | ⭐⭐⭐⭐⭐ | 자산 영속화 없음 | start-new-season 단순 신규 생성 |
| 승강 결정 | ⭐⭐⭐⭐⭐ | 정렬 + 12팀 이동 | 단순 함수 |
| tier별 독립 드래프트 | ⭐⭐⭐⭐ | 풀 분배 전략 | 3가지 strategy 운영자 선택 |
| 좋은 신인 풀 admin UI | ⭐⭐⭐⭐ | 능력치 입력 UX | 싱글 EditorModal 재활용 |
| 30팀 동시 서버 시뮬 | ⭐⭐⭐⭐ | EF 동시 호출 | cron 50개 배치 |
| 128명 토너먼트 | ⭐⭐⭐ | 1라운드 64경기 1분 내 | 64×200ms = 12.8초 |
| single_elim 브래킷 | ⭐⭐⭐⭐⭐ | 자료구조 단순 | bracketEngine.ts |
| double_elim | ⭐⭐⭐ | losers bracket 복잡 | Phase B 미룸 |
| 옵션 토글 | ⭐⭐⭐⭐⭐ | useLeagueConfig 일괄 | 라우트/메뉴 가드 |
| best_of_N 시리즈 | ⭐⭐⭐⭐ | 매치 내 N경기 추적 | PlayoffSeries 재활용 |
| 유저↔유저 트레이드 | ⭐⭐⭐⭐ | 동시성 | room_trade_proposals + 낙관적 잠금 |
| Realtime 끊김 복원 | ⭐⭐⭐ | 클라이언트 재연결 | HTTP 재fetch |
| 운영자 권한 분리 | ⭐⭐⭐⭐ | RLS 정책 | admin_user_id = auth.uid() |

→ **Room 마이그레이션 항목 삭제**. 싱글 회귀 위험이 가장 낮은 항목으로 첫 줄에 들어옴.

---

## 5. 구현 마일스톤

### M1: 멀티 신규 테이블 + 어댑터 + useMultiGameData ⭐ 첫 마일스톤
**범위**:
- 12개 신규 테이블 (`league_groups`, `leagues`, `rooms`, `room_members`, `room_game_results`, `room_transactions`, `room_playoffs`, `room_playoff_results`, `room_messages`, `league_promotions`, `league_user_history`, `meta_rookies_pool`)
- `services/multi/` 골격 (roomPersistence, roomQueries, leagueService)
- `services/multi/engineStateAdapter.ts` (EngineGameState 변환)
- `hooks/useMultiGameData.ts`, `hooks/useLeagueConfig.ts`
- `App.tsx`에 `/multi` 라우트 추가 (싱글 라우트는 무변경)
- `views/lobby/MultiPlayCard.tsx` 활성화

**산출물**: 멀티 빈 방 생성/조회/삭제 가능. 싱글은 0 회귀.
**검증**:
- 싱글 회귀 시나리오 1~3 통과 (팀 선택 → 시즌 → 오프시즌 → 시즌 2)
- 멀티 빈 방 CRUD
- EngineGameState 어댑터 단위 테스트 (싱글 어댑터 vs 멀티 어댑터 동형 확인)

### M2: 메인리그 단일 tier (Pro만, 1시즌 한정)
**범위**: 메인리그 생성/모집/드래프트 EF, 서버사이드 시뮬 (multiplayer-plan.md Phase 3), `/multi/leagues/:id/season` 페이지
**산출물**: 30명 단일 리그 한 시즌 운영 가능
**검증**: 30명 모집 → 드래프트 → 시즌 → 플레이오프 → 종료, Realtime 동기화

### M3: 좋은 신인 풀 + 운영자 admin UI
**범위**: `meta_rookies_pool` admin UI, 드래프트 풀 통합
**산출물**: 운영자가 신인 능력치 편집 가능. 싱글 EditorModal에서도 동일 풀 편집 가능.

### M4: 메인리그 3 tier + 승강제 + 시즌 갱신
**범위**: Pro/D/U 동시 운영, runPromotion + start-new-season EF, league_user_history
**산출물**: 시즌 1 종료 → 12팀 결정 → 시즌 2 자동 시작 (새 드래프트)
**검증**: 시즌 1 풀 진행 → 승강 정확성 → 시즌 2 진입 시 새 드래프트

### M5: 메인리그/토너먼트 옵션 토글 admin UI
**범위**: LeagueGroupAdmin, default_options 편집, 매 시즌 override
**산출물**: 운영자가 메인리그 옵션 자유 설정

### M6: 유저↔유저 트레이드 + FA 활성화 (멀티)
**범위**: room_trade_proposals (정규화), 멀티 FA 협상 UI
**산출물**: 메인리그에서 유저 간 트레이드/FA 정상 동작

### M7: 토너먼트 single_elim
**범위**: bracket_data, advance-tournament-round EF, TournamentBracketView

### M8: 토너먼트 추가 형식 (double_elim, round_robin)

→ **기존 M0 (Room 마이그레이션) 삭제**. 싱글 코드 0 변경이 핵심.

---

## 6. 핵심 파일

### 신규 파일 (멀티 측만)

| 파일 | 역할 | Milestone |
|------|------|----------|
| `services/multi/roomPersistence.ts` | saveRoom, loadRoom | M1 |
| `services/multi/roomQueries.ts` | 멀티 데이터 조회 | M1 |
| `services/multi/roomMessageService.ts` | 멀티 메시지 | M1 |
| `services/multi/leagueService.ts` | createLeagueGroup, joinLeague, listLeagues | M1 |
| `services/multi/engineStateAdapter.ts` | Room → EngineGameState 변환 | M1 |
| `services/multi/promotionEngine.ts` | runPromotion 클라이언트 헬퍼 | M4 |
| `services/multi/seasonRolloverService.ts` | startNewSeason 클라이언트 헬퍼 | M4 |
| `services/multi/bracketEngine.ts` | generateBracket, advanceBracket | M7 |
| `hooks/useMultiGameData.ts` | 멀티 데이터 훅 | M1 |
| `hooks/useMultiSimulation.ts` | 멀티 시뮬 훅 | M2 |
| `hooks/useLeagueConfig.ts` | 모드 통일 진입점 | M1 |
| `hooks/useCurrentLeague.ts` | 현재 active league 조회 | M1 |
| `hooks/useLeagueDraft.ts` | 드래프트 Realtime 구독 | M2 |
| `hooks/useMultiLiveGame.ts` | 라이브 PBP 구독 | M2 |
| `views/multi/league/LeagueListView.tsx` | 멀티 리그 목록 | M1 |
| `views/multi/league/LeagueLobbyView.tsx` | 모집 대기실 | M1 |
| `views/multi/league/MainLeagueDashboard.tsx` | 메인리그 대시보드 | M2 |
| `views/multi/league/SeasonHistoryView.tsx` | 다년 이력 표시 | M4 |
| `views/multi/tournament/TournamentBracketView.tsx` | 브래킷 시각화 | M7 |
| `views/multi/admin/RookiePoolEditor.tsx` | 신인 풀 편집 | M3 |
| `views/multi/admin/LeagueGroupAdmin.tsx` | group 관리 + 옵션 토글 | M2/M5 |
| `views/multi/admin/SeasonOptionsEditor.tsx` | 시즌별 leagues 옵션 override | M5 |
| `components/MultiProtectedLayout.tsx` | 멀티 라우트 가드 + 레이아웃 | M1 |
| `supabase/functions/start-draft/` | 드래프트 시작 EF | M2 |
| `supabase/functions/submit-pick/` | 픽 제출 EF | M2 |
| `supabase/functions/draft-cron/` | 오토픽 cron | M2 |
| `supabase/functions/simulate-game/` | 1경기 시뮬 EF | M2 |
| `supabase/functions/schedule-games-cron/` | 시뮬 큐 처리 cron | M2 |
| `supabase/functions/update-tactics/` | 전술 갱신 EF | M2 |
| `supabase/functions/fill-empty-ai-slots/` | AI GM 채우기 | M1 |
| `supabase/functions/start-new-season/` | 메인리그 시즌 갱신 | M4 |
| `supabase/functions/advance-tournament-round/` | 토너먼트 라운드 | M7 |

### 수정 파일 (싱글 측 — 매우 적음, 모두 옵션 인자 추가만)

| 파일 | 변경 | 회귀 위험 |
|------|------|---------|
| [App.tsx](App.tsx) | `/multi/*` 라우트 추가 (기존 라우트 무변경) | 0 |
| [views/lobby/MultiPlayCard.tsx](views/lobby/MultiPlayCard.tsx) | "Coming Soon" 제거, 클릭 시 `/multi`로 navigate | 0 |
| [views/lobby/LobbyPanel.tsx](views/lobby/LobbyPanel.tsx) | MultiPlayCard에 onClick prop 전달 | 0 |
| [services/tradeEngine/tradeExecutor.ts](services/tradeEngine/tradeExecutor.ts) | `capEnabled?: boolean` 옵션 (default true) | 0 |
| [services/simulation/offseasonEventHandler.ts](services/simulation/offseasonEventHandler.ts) | `rookieDraftEnabled?: boolean` 옵션 (default true) | 0 |

→ 5개 파일, 모두 default가 기존 동작이므로 싱글에서 호출 시 동일 결과.

---

## 7. 검증

### M1 (멀티 신규 테이블 + 어댑터)
- **싱글 회귀 시나리오 1**: 새 유저 → 팀 선택 → 한 시즌 풀 진행 → 우승 → 시즌 2 드래프트
- **싱글 회귀 시나리오 2**: 트레이드 5건 + FA 영입 3건 + 방출 2건 → 데드캡 영속
- **싱글 회귀 시나리오 3**: 멀티시즌 5년 진행 → 에이징/은퇴/HOF
- 멀티 빈 방 CRUD 통과
- EngineGameState 어댑터 단위 테스트 (싱글/멀티 동형 검증)

### M2 (메인리그 단일 tier)
- 30명 모집 → 드래프트 → 정규시즌 → 플레이오프 → 종료
- 2 클라이언트 동시 접속 → Realtime 동기화
- AI GM 슬롯 자동 동작
- 싱글 회귀 시나리오 1~3 재통과

### M4 (3 tier + 승강 + 시즌 갱신)
- 90명(또는 AI 채움) 시즌 1 → 종료
- runPromotion → 12팀 이동 정확성
- start-new-season → 시즌 2 leagues × 3 + rooms × 3 신규 생성
- 시즌 2 시작 시 새 드래프트 진입
- league_user_history 시즌 1 이력 저장 확인
- 싱글 회귀 시나리오 1~3 재통과

### M5 (옵션 토글)
- group default_options 편집 → 새 시즌 상속
- leagues 옵션 override 독립 적용
- cap_enabled=false → 트레이드 검증 스킵 (싱글은 cap_enabled 미전달 = default true 유지)

### M7 (토너먼트)
- 8명 single_elim → 우승자 결정
- 128명 single_elim → 1라운드 64경기 1분 내
- best_of_3 시리즈 → 3경기 후 2승 팀 진출

### 모든 마일스톤 공통
```bash
node_modules/.bin/vite build
```

---

## 8. 리스크 / 제약

| 리스크 | 수준 | 대응 |
|------|------|------|
| 싱글 옵션 인자 default 실수 | 낮 | 단위 테스트 + 회귀 시나리오 매 마일스톤 |
| 멀티 측 12개 신규 테이블 스키마 결정 | 낮 | 그린필드, 변경 자유 |
| EngineGameState 어댑터 정합성 | 중 | 싱글 어댑터(useGameData) vs 멀티 어댑터 동형 단위 테스트 |
| 엔진 함수 plain object 가정 무너짐 | 중 | 엔진 함수에 EngineGameState 인터페이스 강제 |
| AI GM franchise 영속화 | 낮 | 시즌 단위 운영이라 불필요 |
| 30팀 동시 시뮬 부하 | 중 | cron 배치 + fire-and-forget |
| 128명 토너먼트 부하 | 중 | 64×200ms = 12.8초 (1분 내 OK) |
| Realtime 끊김 복원 | 중 | HTTP 재fetch |
| 운영자 권한 RLS | 중 | admin_user_id = auth.uid() |
| PBP 엔진 Deno 이관 | 낮 | plain object/순수 함수 |
| 신인 풀 능력치 입력 UX | 낮 | EditorModal 재활용 + CSV 임포트 |
| 시즌 갱신 도중 유저 접속 | 중 | leagues.status='between_seasons' 가드 |
| double_elim 브래킷 복잡도 | 중 | Phase B로 미룸 |
| tier별 드래프트 풀 분배 | 중 | 3가지 전략 운영자 선택 |

→ **마이그레이션 정합성 / Room 마이그레이션 / 18개 파일 동시 리팩토링** 항목 모두 삭제됨.

---

## 9. 모드별 데이터 분리 매트릭스

### 9.1 활성 테이블

| 테이블 | 싱글 | 메인리그 | 토너먼트 |
|---|:---:|:---:|:---:|
| `saves` | ✅ | – | – |
| `user_game_results / _transactions / _messages / _playoffs` | ✅ | – | – |
| `league_groups` | – | ✅ | – |
| `leagues` | – | ✅ (3 row/시즌) | ✅ (1 row) |
| `rooms` | – | ✅ (3 row/시즌) | ✅ (1 row) |
| `room_members` | – | ✅ (30 row/방) | ✅ (N row) |
| `room_game_results / _transactions / _playoffs / _messages` | – | ✅ | ✅ |
| `league_promotions` | – | ✅ | – |
| `league_user_history` | – | ✅ | – |
| `meta_rookies_pool` | ✅ (옵션) | ✅ (옵션) | ✅ (옵션) |
| `meta_players / meta_schedule` (글로벌 메타) | ✅ | ✅ | ✅ |

→ 싱글/멀티는 **공유 테이블이 글로벌 메타뿐**. 영속성 테이블은 완전 분리.

### 9.2 데이터 항목별 위치

| 데이터 | 싱글 위치 | 메인리그 위치 | 토너먼트 위치 |
|---|---|---|---|
| sim_date | `saves.sim_date` | `rooms.sim_date` (tier별 독립) | 사용 안 함 (round 진행) |
| season_number / current_season | `saves.season_number / current_season` | `leagues.season_number` (그룹 누적) + `rooms.season` | `leagues.season_number=1` |
| roster_state | `saves.roster_state` | `rooms.roster_state` (시즌 한정) | `rooms.roster_state` |
| schedule | `meta_schedule` 직접 참조 | `rooms.schedule` (tier별, 매 시즌 생성) | 사용 안 함 (`bracket_data.matches`) |
| 팀 (team_id) | `saves.team_id` | `room_members.team_id` (드래프트 후) | `room_members.team_id` |
| tactics, depth_chart | `saves.tactics / depth_chart` | `room_members.tactics / depth_chart` | 동일 |
| 시작 드래프트 | 매 시즌 (싱글 신인 드래프트) | **매 시즌**, tier별 독립 | 옵션 |
| 시즌 도중 신인 드래프트 | 활성 (default) | 비활성 | 옵션 |
| FA | 활성 | 운영자 토글 | 운영자 토글 |
| 트레이드 | CPU↔유저, 영속 블록 (`saves.league_trade_blocks`) | 운영자 토글; 활성 시 유저↔유저 (`room_trade_proposals`) | 운영자 토글 |
| 샐러리캡 | 활성 (CBA 룰) | 운영자 토글 | 운영자 토글 |
| 다년 자산 영속화 | `saves` 직접 (다년 시즌, 같은 row) | **없음** (시즌 한정) | 없음 |
| 시즌 이력 | in-game UI (현재 saves) | `league_user_history` (group 단위 누적) | – |
| 승강 결정 | – | `league_promotions` | – |
| 플레이오프 | `user_playoffs` | `room_playoffs` (tier별) | `bracket_data` |
| 운영자 | – | `league_groups.admin_user_id` | `leagues.admin_user_id` |
| AI GM | – (30팀 모두 CPU 자체 처리) | 부족 인원만 (`room_members.is_ai`) | 부족 인원만 (옵션) |

### 9.3 격리 메커니즘

1. **테이블 자체 분리** — 싱글 코드는 멀티 테이블을 절대 SELECT/UPDATE 안 함, 반대도 마찬가지
2. **코드 트리 분리** — `services/multi/*`만이 멀티 테이블 접근, [services/persistence.ts](services/persistence.ts)는 saves 전용
3. **라우트 분리** — `/multi/*` 라우트는 별도 hook 트리(`useMultiGameData`) 사용, 싱글 라우트는 `useGameData`
4. **CHECK 제약** — `leagues_mode_consistency` (메인/토너 일관성)
5. **CASCADE FK** — 멀티 측 자식 테이블만 (싱글 영향 0)
6. **RLS** — multi 측만 적용 (saves는 기존 정책 그대로 유지)
7. **TS 차별 유니온** — `LeagueContext` 유니온으로 컴파일 타임 분기 검증

---

## 10. 구조 안정성 확보 전략

3-모드(싱글/메인/토너) 공존 구조에서 가장 중요한 안정성은 "**싱글이 0 회귀해야 한다**"이고, 그 다음은 멀티 측 데이터 무결성·동시성·관찰성이다. 6개 층에서 안전망을 둔다.

### 10.1 싱글 회귀 0 보장

**접근 원칙:**
- 싱글 코드는 **수정하지 않는다**. 옵션 인자 추가 5개 파일이 전부.
- 옵션 인자는 모두 default = 기존 동작이라 싱글에서 호출 시 동일 결과.
- 마이그레이션 스크립트 없음 → 마이그레이션 정합성 위험 자체가 사라짐.

**검증:**
- M1부터 매 마일스톤 종료 시 회귀 시나리오 1~3 자동 통과
- `saves` 테이블 스키마 변경 X → `loadCheckpoint`/`saveCheckpoint` 시그니처 동일
- 옵션 인자 default 단위 테스트 (default=true 호출이 기존 동작과 일치하는지)

**금지 사항 (CLAUDE.md 추가):**
- 멀티 작업 중 [services/persistence.ts](services/persistence.ts) 수정 금지
- 멀티 작업 중 [hooks/useGameData.ts](hooks/useGameData.ts) 수정 금지 (옵션 인자 외)
- 멀티 작업 중 [App.tsx](App.tsx)의 기존 라우트 수정 금지 (`/multi/*` 추가만)

### 10.2 DB 레벨 (멀티 측) — 잘못된 상태가 저장되지 않게

**제약:**
```sql
-- 모드 일관성
ALTER TABLE leagues ADD CONSTRAINT leagues_mode_consistency CHECK (
  (type='main_league' AND group_id IS NOT NULL AND tier IS NOT NULL AND tournament_format IS NULL)
  OR
  (type='tournament' AND group_id IS NULL AND tier IS NULL AND tournament_format IS NOT NULL)
);

-- 한 group/tier/season에 league 1개
ALTER TABLE leagues ADD CONSTRAINT uq_leagues_group_tier_season
  UNIQUE (group_id, tier, season_number);

-- room.max_players 초과 방지 트리거
CREATE TRIGGER trg_room_capacity BEFORE INSERT ON room_members
  FOR EACH ROW EXECUTE FUNCTION check_room_capacity();

-- room.league_id NOT NULL (싱글이 멀티 테이블 들어오는 사고 방지)
ALTER TABLE rooms ALTER COLUMN league_id SET NOT NULL;
```

**FK + CASCADE:**
- 모든 `room_*` 자식이 `room_id` CASCADE → 방 삭제 시 자식 자동 삭제
- `rooms.league_id → leagues.id ON DELETE CASCADE` → 리그 삭제 시 방 삭제
- `leagues.group_id → league_groups.id ON DELETE CASCADE`
- `meta_*`는 절대 CASCADE 대상 X (글로벌 메타 보호)

**인덱스:**
- `idx_rm_user ON room_members(user_id)` — 유저의 멀티 방 목록
- `idx_rgr_room_date ON room_game_results(room_id, date DESC)` — 최근 경기
- `idx_lp_to_season ON league_promotions(group_id, to_season)` — 다음 시즌 배정

**RLS:**
- `rooms`: `id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid())`
- `room_*`: 자식 테이블도 멤버십 검증
- `leagues / league_groups`: SELECT 공개, UPDATE = `admin_user_id = auth.uid()`만
- `meta_rookies_pool`: 운영자 role만 INSERT/UPDATE
- 싱글 측 `saves` RLS는 기존 정책 그대로 (변경 없음)

### 10.3 코드 레벨 (멀티 측) — 잘못된 호출이 컴파일되지 않게

**TypeScript 차별 유니온:**
```ts
type LeagueContext =
  | { mode: 'main_league'; leagueId: string; tier: 'pro'|'dleague'|'uleague';
      groupId: string; options: MainLeagueOptions }
  | { mode: 'tournament'; leagueId: string;
      options: TournamentOptions; bracket: BracketData };
```
- 멀티 코드에서만 사용. 싱글 코드는 호출 안 함.
- 함수 시그니처에서 `LeagueContext` 받으면 분기 외 `tier`/`bracket` 접근 불가.

**단일 게이트키퍼:**
- 모든 멀티 모드 판정 = `useLeagueConfig()` 한 곳
- 모든 멀티 시뮬 호출 = `executeMultiGameSimulation()` (싱글의 `useSimulation`과 분리)
- 모든 트레이드 실행 = `tradeExecutor(state, proposal, { capEnabled })` 한 곳
- 모든 드래프트 픽 = `submitPick` EF 한 곳

**런타임 가드:**
```ts
function assertTournament(ctx: LeagueContext):
    asserts ctx is Extract<LeagueContext, {mode:'tournament'}> {
    if (ctx.mode !== 'tournament')
        throw new Error(`tournament context required, got ${ctx.mode}`);
}
```

**EngineGameState 어댑터 계약:**
- `services/multi/engineStateAdapter.ts`가 만드는 객체는 `useGameData`가 만드는 객체와 **동형** 보장
- 단위 테스트: 싱글 어댑터 출력 ↔ 멀티 어댑터 출력 키/타입 일치 검증
- 엔진 함수의 input 계약을 단일 인터페이스(`EngineGameState`)로 강제

### 10.4 동시성 안정성 (멀티 측) — 30명이 동시에 움직여도

**낙관적 잠금:**
- `rooms.version`, `room_members.version`, `room_trade_proposals.version`
- UPDATE 시 `WHERE id=? AND version=?`, 갱신 후 `version+1`
- 충돌 → 클라이언트 재fetch 후 재시도

**Idempotency:**
- EF 호출 시 `Idempotency-Key` 헤더 (UUID)
- 1시간 캐시, 같은 키 재호출 시 첫 결과 반환
- `simulate-game`: `UNIQUE (room_id, game_id)` → 재호출 안전
- `submit-pick`: `UNIQUE (league_id, round, pick_idx)` → 중복 픽 방지
- `runPromotion`: `UNIQUE (group_id, from_season, user_id)` → 중복 호출 방지

**EF 트랜잭션:**
- `submit-pick`: BEGIN → 차례 확인 → 픽 INSERT → 다음 차례 갱신 → COMMIT
- `start-new-season`: 단일 EF 안에서 leagues×3 + rooms×3 + members×N 트랜잭션
- DB 트랜잭션 실패 시 전체 롤백 → 부분 상태 발생 X

**Realtime 재연결:**
- Supabase Realtime 끊김 → 채널 재구독 + 마지막 timestamp 이후 데이터 HTTP fetch
- "Realtime은 푸시, 정합성은 fetch" 원칙

### 10.5 코드 공유 안정성 — 엔진 0 변경 보장

**원칙:**
- 엔진 함수는 plain object/순수 함수로 유지 → DB 모양 모름
- 양쪽 어댑터가 같은 `EngineGameState`를 만들어주는 한 작동
- 옵션 인자 추가는 default = 기존 동작 강제

**검증:**
- 엔진 함수 단위 테스트: 같은 `EngineGameState` 입력 → 같은 출력 (결정론)
- 싱글/멀티 cross-check: 같은 시드+로스터로 양쪽에서 시뮬 → 결과 일치
- TypeScript 빌드 게이트: `tsc --noEmit` + `vite build` 통과

**금지 패턴:**
- 엔진 함수 안에서 `supabase` 직접 호출 금지
- 엔진 함수 안에서 React hook 사용 금지
- 옵션 인자가 `undefined`일 때 기존 동작과 다른 분기 금지

### 10.6 회귀 방지 / 점진적 롤아웃

**골든 회귀 시나리오 (자동화):**
- 시나리오 1: 싱글 새 유저 → 팀 선택 → 한 시즌 풀 진행 → 우승 → 시즌 2 드래프트
- 시나리오 2: 싱글 트레이드 5건 + FA 영입 3건 + 방출 2건 → 데드캡 영속
- 시나리오 3: 싱글 멀티시즌 5년 → 에이징/은퇴/HOF
- 시나리오 4 (M2+): 멀티 30명 모집 → 드래프트 → 시즌 → 플레이오프
- 시나리오 5 (M4+): 메인리그 90명 → 시즌 1 → 승강 → 시즌 2

**피처 플래그:**
```ts
// utils/featureFlags.ts
export const FEATURES = {
    MULTI_ENABLED:    false,   // M1에서 true
    SERVER_SIM:       false,   // M2
    PROMOTION:        false,   // M4
    OPTION_TOGGLES:   false,   // M5
    USER_TRADES:      false,   // M6
    TOURNAMENT:       false,   // M7
};
```
- 마일스톤별 한 플래그씩 켜기
- 문제 발생 시 해당 플래그만 끄면 즉시 회귀 가능
- 싱글 측은 어떤 플래그도 영향 받지 않음 (애초에 분리)

**TypeScript 빌드 게이트:**
- CI에서 `vite build` + `tsc --noEmit` 통과 강제
- 순환 임포트 감지 (이미 vite.config.ts에 추가됨)

**스냅샷 테스트:**
- 같은 입력(seed + 전술 + 로스터)에서 시뮬 결과가 결정론적인지 확인
- 멀티 EF 시뮬 결과가 클라이언트 시뮬 결과와 일치하는지 cross-check

### 10.7 모니터링 / 관찰성

**필수 메트릭:**
- `multi_room_count_active`, `multi_room_count_finished`
- `multi_league_count_recruiting / drafting / in_progress / finished`
- `ef_invocation_count` per function
- `ef_p95_latency` per function
- `realtime_disconnect_rate`
- `single_save_count` (싱글 모니터링은 기존 그대로)

**이상 탐지 알람:**
- `simulate-game` EF가 1시간 내 같은 game_id로 3회 이상 호출 → 무한루프 의심
- `submit-pick` 거절률 > 10% → 차례 판정 버그
- 특정 league의 `room_members` 행 수 ≠ `max_teams` → 정원 동기화 실패
- `league_promotions` 행 수 ≠ 90 (메인리그) → 승강 누락

**관리자 대시보드:**
- `views/multi/admin/HealthDashboard.tsx`

### 10.8 마일스톤별 안정성 체크리스트

| 마일스톤 | 필수 통과 조건 |
|---|---|
| M1 | (1) 싱글 회귀 시나리오 1~3 통과 (2) 멀티 빈 방 CRUD (3) EngineGameState 어댑터 단위 테스트 (싱글/멀티 동형) |
| M2 | (1) 30명 모집 정원 트리거 (2) submit-pick 동시성 (idempotency) (3) realtime 끊김 → 재fetch 정합 (4) 싱글 회귀 1~3 재통과 |
| M3 | (1) meta_rookies_pool 운영자만 편집 (RLS) (2) 싱글 EditorModal에서도 동일 풀 편집 가능 (3) 싱글 회귀 재통과 |
| M4 | (1) `start-new-season` 트랜잭션 원자성 (2) `league_promotions` UNIQUE 제약 (3) 시즌 N+1 진입 후 시즌 N 데이터 read-only 보존 (4) 싱글 회귀 재통과 |
| M5 | (1) 옵션 토글 변경이 다음 시즌부터만 적용 (2) 운영자 권한 RLS (3) 싱글은 옵션 default 미전달 검증 |
| M6 | (1) 유저↔유저 트레이드 낙관적 잠금 (2) 양쪽 방 동시 갱신 트랜잭션 (3) 싱글 트레이드 회귀 재통과 |
| M7 | (1) bracket 진행 멱등성 (2) best_of_N 시리즈 결과 누적 정확성 |

→ 각 체크리스트 미통과 시 다음 마일스톤 진입 금지. **싱글 회귀 시나리오 1~3은 모든 마일스톤의 필수 통과 조건**.

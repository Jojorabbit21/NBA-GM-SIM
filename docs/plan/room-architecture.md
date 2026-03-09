# Room 기반 아키텍처 설계

> 상태: 계획 | 작성일: 2026-03-09

## 배경

### 현재 문제
- 유저당 세이브 1개만 가능 (`saves` 테이블이 `user_id`로 upsert)
- 정식 출시 시 "데이터 초기화" 버튼 제거 예정 → 유저가 새 게임을 시작할 방법 필요
- 모든 데이터가 `user_id` 기반 → 멀티플레이어 전환 시 전면 재설계 필요

### 결정: save_slot vs Room

처음에는 `save_slot` (INTEGER 1~3) 컬럼을 기존 테이블에 추가하는 방안을 검토했으나, 멀티플레이어 전환 시 또다시 전면 재설계가 필요하다는 문제로 **Room 기반 구조**를 채택.

| 관점 | save_slot | Room |
|------|-----------|------|
| 멀티플레이어 전환 | 전면 재설계 | 멤버 수만 확장 (1→30) |
| 경기 결과 저장 | 유저 × 슬롯별 각각 저장 | 방당 1벌 (멀티에서 30명 공유) |
| 삭제 | 7개 테이블 수동 삭제 | CASCADE 1줄 |
| 키 구조 | `(user_id, save_slot)` 혼합키 | `room_id` FK 정규화 |
| 코드 변경량 | ~18개 파일 | ~18개 파일 (동일) |

### 구현 단계
- **Phase 1** (당장): 싱글 플레이어 = "1인 방" (유저당 최대 3개 방)
- **Phase 2** (이후): 멀티플레이어 = 방에 최대 30명 참여

---

## 핵심 설계

### 키 구조 변경

```
현재:   user_id → 모든 데이터 소유
          saves:                user_id (PK)
          user_game_results:   user_id (FK)
          user_transactions:   user_id (FK)
          user_playoffs:       (user_id, team_id, season)
          user_messages:       user_id (FK)

Phase1: room_id → 방 공유 데이터 (경기결과, 트랜잭션, 플레이오프)
        (room_id, user_id) → 멤버별 데이터 (전술, 뎁스차트, 메시지)
          rooms:               room_id (PK) — 세계 상태
          room_members:        (room_id, user_id) (PK) — 멤버 상태
          room_game_results:   room_id (FK) — 경기 결과
          room_transactions:   room_id (FK) — 트레이드/부상
          room_playoffs:       (room_id, season) (PK) — 플레이오프
          room_messages:       (room_id, user_id) — 메시지

Phase2: 동일 구조에 멤버 수만 확장 (1 → 30)
```

### 데이터 소유권 분리

| 데이터 | 소유 | 현재 위치 | Room 위치 |
|--------|------|----------|-----------|
| sim_date | 방 전체 | saves.sim_date | rooms.sim_date |
| roster_state (부상/체력) | 방 전체 | saves.roster_state | rooms.roster_state |
| draft_state | 방 전체 | saves.draft_picks | rooms.draft_state |
| tendency_seed | 방 전체 | saves.tendency_seed | rooms.tendency_seed |
| team_id (내 팀) | 멤버별 | saves.team_id | room_members.team_id |
| tactics (전술) | 멤버별 | saves.tactics | room_members.tactics |
| depth_chart | 멤버별 | saves.depth_chart | room_members.depth_chart |
| 경기 결과 | 방 전체 | user_game_results | room_game_results |
| 트랜잭션 | 방 전체 | user_transactions | room_transactions |
| 플레이오프 | 방 전체 | user_playoffs | room_playoffs |
| 메시지 | 멤버별 | user_messages | room_messages |

---

## DB 스키마

### 새 테이블 (7개)

```sql
-- ================================================================
-- 1. rooms: 게임 세계 (싱글=1인, 멀티=30인)
-- ================================================================
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,                                    -- 방 이름 (멀티용)
    mode TEXT NOT NULL DEFAULT 'default',          -- 'default' | 'custom'
    draft_pool_type TEXT,                          -- 'current' | 'alltime'
    max_players INTEGER NOT NULL DEFAULT 1,        -- 싱글=1, 멀티=30
    status TEXT NOT NULL DEFAULT 'active',          -- 'active' | 'finished'
    season TEXT NOT NULL DEFAULT '2025-2026',
    sim_date TEXT NOT NULL DEFAULT '2025-10-20',
    roster_state JSONB,                            -- Record<playerId, SavedPlayerState>
    draft_state JSONB,                             -- { order, poolType, teams, picks }
    tendency_seed TEXT,
    wins INTEGER DEFAULT 0,                        -- RoomSelectView용 캐시
    losses INTEGER DEFAULT 0,                      -- RoomSelectView용 캐시
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================================
-- 2. room_members: 방 참여자
-- ================================================================
CREATE TABLE room_members (
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    team_id TEXT,                                   -- 선택한 팀
    tactics JSONB,                                  -- GameTactics
    depth_chart JSONB,                              -- DepthChart
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);
-- 유저의 방 목록 조회용
CREATE INDEX idx_rm_user ON room_members (user_id);

-- ================================================================
-- 3. room_game_results: 경기 결과 (방 소유 — 모든 멤버가 공유)
-- ================================================================
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
CREATE INDEX idx_rgr_room ON room_game_results (room_id);

-- ================================================================
-- 4. room_transactions: 트레이드/부상 기록 (방 소유)
-- ================================================================
CREATE TABLE room_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    transaction_id TEXT,
    date TEXT NOT NULL,
    type TEXT NOT NULL,                             -- 'Trade' | 'InjuryUpdate'
    team_id TEXT,
    description TEXT,
    details JSONB
);
CREATE INDEX idx_rtx_room ON room_transactions (room_id);

-- ================================================================
-- 5. room_playoffs: 플레이오프 브래킷 (방 소유)
-- ================================================================
CREATE TABLE room_playoffs (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    season TEXT NOT NULL DEFAULT '2025-2026',
    bracket_data JSONB,                             -- { series: PlayoffSeries[] }
    current_round INTEGER DEFAULT 0,
    is_finished BOOLEAN DEFAULT FALSE,
    champion_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (room_id, season)
);

-- ================================================================
-- 6. room_playoff_results: 플레이오프 경기 결과 (방 소유)
-- ================================================================
CREATE TABLE room_playoff_results (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    date TEXT NOT NULL,
    series_id TEXT,
    round_number INTEGER DEFAULT 0,
    game_number INTEGER DEFAULT 0,
    home_team_id TEXT NOT NULL,
    away_team_id TEXT NOT NULL,
    home_score INTEGER NOT NULL,
    away_score INTEGER NOT NULL,
    box_score JSONB,
    tactics JSONB,
    rotation_data JSONB,
    UNIQUE (room_id, game_id)
);
CREATE INDEX idx_rpr_room ON room_playoff_results (room_id);

-- ================================================================
-- 7. room_messages: 인게임 메시지 (멤버별)
-- ================================================================
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
CREATE INDEX idx_rmsg_room_user ON room_messages (room_id, user_id);
```

### RLS 정책

```sql
-- 핵심 원칙: 방 멤버만 해당 방의 데이터에 접근 가능

-- rooms
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms_member_access" ON rooms
    FOR ALL USING (
        id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid())
    );

-- room_members
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_members_access" ON room_members
    FOR ALL USING (
        room_id IN (SELECT room_id FROM room_members rm WHERE rm.user_id = auth.uid())
    );

-- room_game_results
ALTER TABLE room_game_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgr_member_access" ON room_game_results
    FOR ALL USING (
        room_id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid())
    );

-- room_transactions
ALTER TABLE room_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rtx_member_access" ON room_transactions
    FOR ALL USING (
        room_id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid())
    );

-- room_playoffs
ALTER TABLE room_playoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rp_member_access" ON room_playoffs
    FOR ALL USING (
        room_id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid())
    );

-- room_playoff_results
ALTER TABLE room_playoff_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rpr_member_access" ON room_playoff_results
    FOR ALL USING (
        room_id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid())
    );

-- room_messages (본인 메시지만)
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rmsg_own_access" ON room_messages
    FOR ALL USING (user_id = auth.uid());
```

### 데이터 마이그레이션 (기존 saves → rooms)

```sql
-- 주의: 실행 전 반드시 saves 테이블 백업

-- Step 1: saves → rooms
-- tendency_seed를 임시 연결 키로 사용 (UUID이므로 유니크)
INSERT INTO rooms (id, sim_date, roster_state, draft_state, tendency_seed, updated_at)
SELECT
    gen_random_uuid() AS id,
    COALESCE(sim_date, '2025-10-20'),
    roster_state,
    draft_picks,
    COALESCE(tendency_seed, gen_random_uuid()::text),
    COALESCE(updated_at, now())
FROM saves;

-- Step 2: saves → room_members (tendency_seed로 JOIN)
INSERT INTO room_members (room_id, user_id, team_id, tactics, depth_chart)
SELECT r.id, s.user_id, s.team_id, s.tactics, s.depth_chart
FROM saves s
JOIN rooms r ON r.tendency_seed = COALESCE(s.tendency_seed, '');
-- ⚠️ tendency_seed가 NULL인 레거시 세이브는 별도 처리 필요

-- Step 3: user_game_results → room_game_results
INSERT INTO room_game_results (room_id, game_id, date, home_team_id, away_team_id,
    home_score, away_score, box_score, tactics, pbp_logs, shot_events, rotation_data)
SELECT rm.room_id, ugr.game_id, ugr.date, ugr.home_team_id, ugr.away_team_id,
    ugr.home_score, ugr.away_score, ugr.box_score, ugr.tactics, ugr.pbp_logs,
    ugr.shot_events, ugr.rotation_data
FROM user_game_results ugr
JOIN room_members rm ON rm.user_id = ugr.user_id;

-- Step 4: user_transactions → room_transactions
INSERT INTO room_transactions (room_id, transaction_id, date, type, team_id, description, details)
SELECT rm.room_id, ut.transaction_id, ut.date, ut.type, ut.team_id, ut.description, ut.details
FROM user_transactions ut
JOIN room_members rm ON rm.user_id = ut.user_id;

-- Step 5: user_playoffs → room_playoffs
INSERT INTO room_playoffs (room_id, season, bracket_data, current_round, is_finished, champion_id, updated_at)
SELECT rm.room_id, up.season, up.bracket_data, up.current_round, up.is_finished, up.champion_id, up.updated_at
FROM user_playoffs up
JOIN room_members rm ON rm.user_id = up.user_id;

-- Step 6: user_playoffs_results → room_playoff_results
INSERT INTO room_playoff_results (room_id, game_id, date, series_id, round_number, game_number,
    home_team_id, away_team_id, home_score, away_score, box_score, tactics, rotation_data)
SELECT rm.room_id, upr.game_id, upr.date, upr.series_id, upr.round_number, upr.game_number,
    upr.home_team_id, upr.away_team_id, upr.home_score, upr.away_score,
    upr.box_score, upr.tactics, upr.rotation_data
FROM user_playoffs_results upr
JOIN room_members rm ON rm.user_id = upr.user_id;

-- Step 7: user_messages → room_messages
INSERT INTO room_messages (room_id, user_id, team_id, date, type, title, content, is_read, created_at)
SELECT rm.room_id, um.user_id, um.team_id, um.date, um.type, um.title, um.content, um.is_read, um.created_at
FROM user_messages um
JOIN room_members rm ON rm.user_id = um.user_id;

-- Step 8: 마이그레이션 검증
-- SELECT count(*) FROM saves;
-- SELECT count(*) FROM rooms;
-- SELECT count(*) FROM room_members;
-- 이 세 값이 모두 동일해야 함

-- Step 9: (확인 후) 기존 테이블 삭제
-- DROP TABLE IF EXISTS user_messages;
-- DROP TABLE IF EXISTS user_tactics;
-- DROP TABLE IF EXISTS user_playoffs_results;
-- DROP TABLE IF EXISTS user_playoffs;
-- DROP TABLE IF EXISTS user_transactions;
-- DROP TABLE IF EXISTS user_game_results;
-- DROP TABLE IF EXISTS saves;
```

---

## 코드 변경 상세

### 서비스 레이어

#### `services/persistence.ts` — 전면 리팩토링

현재 파일의 모든 함수가 `user_id` 기반. Room 구조에서는 **방 레벨**과 **멤버 레벨** 저장을 분리.

**기존 → 새 함수 매핑:**

| 기존 함수 | 새 함수 | 키 변경 |
|----------|---------|---------|
| `saveCheckpoint(userId, teamId, ...)` | `saveRoom(roomId, ...)` + `saveMember(roomId, userId, ...)` | `user_id` → `room_id` |
| `loadCheckpoint(userId)` | `loadRoomWithMember(roomId, userId)` | 동일 |
| `loadUserHistory(userId)` | `loadRoomHistory(roomId)` | `user_id` → `room_id` |
| `writeGameResult(result)` | 그대로 (payload에 `room_id` 포함) | payload 변경 |
| `writeTransaction(userId, tx)` | `writeTransaction(roomId, tx)` | `user_id` → `room_id` |

**새 함수:**

```ts
// 유저의 방 목록 (RoomSelectView용)
export const listUserRooms = async (userId: string): Promise<RoomInfo[]> => {
    // room_members에서 user_id로 조회 → rooms JOIN
    const { data } = await supabase
        .from('room_members')
        .select('room_id, team_id, rooms(id, sim_date, wins, losses, mode, updated_at)')
        .eq('user_id', userId);
    // RoomInfo[] 변환
};

// 새 방 생성 (싱글플레이어용)
export const createRoom = async (
    userId: string, mode: string, draftPoolType?: string
): Promise<string> => {
    // 1. rooms INSERT → roomId 반환
    // 2. room_members INSERT (roomId, userId)
    // 3. return roomId
};

// 방 삭제 (CASCADE)
export const deleteRoom = async (roomId: string): Promise<void> => {
    await supabase.from('rooms').delete().eq('id', roomId);
    // CASCADE가 나머지 6개 테이블 자동 정리
};

// 방 레벨 저장
export const saveRoom = async (
    roomId: string, simDate: string,
    rosterState?: any, draftState?: any, tendencySeed?: string,
    wins?: number, losses?: number
): Promise<void> => {
    await supabase.from('rooms').update({
        sim_date: simDate,
        roster_state: rosterState,
        draft_state: draftState,
        tendency_seed: tendencySeed,
        wins, losses,
        updated_at: new Date().toISOString()
    }).eq('id', roomId);
};

// 멤버 레벨 저장
export const saveMember = async (
    roomId: string, userId: string, teamId: string,
    tactics?: any, depthChart?: any
): Promise<void> => {
    await supabase.from('room_members').update({
        team_id: teamId,
        tactics, depth_chart: depthChart
    }).eq('room_id', roomId).eq('user_id', userId);
};

// 방 + 멤버 정보 로드
export const loadRoomWithMember = async (roomId: string, userId: string) => {
    const [roomRes, memberRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).single(),
        supabase.from('room_members').select('*').eq('room_id', roomId).eq('user_id', userId).single()
    ]);
    return { room: roomRes.data, member: memberRes.data };
};

// 방 히스토리 로드
export const loadRoomHistory = async (roomId: string) => {
    const [gamesRes, txRes] = await Promise.all([
        supabase.from('room_game_results').select('*').eq('room_id', roomId).order('date'),
        supabase.from('room_transactions').select('*').eq('room_id', roomId).order('date')
    ]);
    return { games: gamesRes.data || [], transactions: txRes.data || [] };
};
```

#### `services/playoffService.ts`

| 기존 | 변경 |
|------|------|
| `loadPlayoffState(userId, teamId)` | `loadPlayoffState(roomId)` — team_id 필터 제거 (방에 플레이오프 1개) |
| `savePlayoffState(userId, teamId, ...)` | `savePlayoffState(roomId, ...)` — `onConflict: 'room_id, season'` |
| `savePlayoffGameResult(result)` | payload에 `room_id` (user_id 대신) |
| `fetchPlayoffGameResult(gameId, userId)` | `fetchPlayoffGameResult(gameId, roomId)` |
| `loadPlayoffGameResults(userId)` | `loadPlayoffGameResults(roomId)` |

#### `services/queries.ts`

| 기존 | 변경 |
|------|------|
| `useMonthlySchedule(userId, ...)` | `useMonthlySchedule(roomId, ...)` |
| `fetchFullGameResult(gameId, userId)` | `fetchFullGameResult(gameId, roomId)` |
| `usePlayerGameLog(playerId, teamId)` | `usePlayerGameLog(playerId, teamId, roomId)` — 내부 `getSession()` 제거 |
| `saveGameResults(results)` | 변경 없음 (payload에 `room_id` 이미 포함) |
| `saveUserTransaction(userId, tx)` | `saveRoomTransaction(roomId, tx)` |

#### `services/messageService.ts`

모든 함수: `(userId, teamId)` → `(roomId, userId)` (teamId는 room_members에서 이미 알고 있음)

#### 시뮬레이션 서비스 (4개)

모든 서비스에서 result payload의 `user_id: userId` → `room_id: roomId` 변경:

- **`cpuGameService.ts`**: `processCpuGames(..., userId)` → `processCpuGames(..., roomId)`
  - line 48 resultData: `user_id: userId` → `room_id: roomId`
  - `processCpuGamesInPlace` (batchSeasonService 내): 동일

- **`userGameService.ts`**: `applyUserGameResult(..., userId, ...)` → `applyUserGameResult(..., roomId, userId, ...)`
  - line 103 resultPayload: `user_id: userId` → `room_id: roomId`
  - `sendMessage` 호출: `roomId` 추가

- **`seasonService.ts`**: `handleSeasonEvents(..., userId, isGuestMode)` → `handleSeasonEvents(..., roomId, isGuestMode)`
  - `savePlayoffState(userId, myTeamId, ...)` → `savePlayoffState(roomId, ...)`

- **`batchSeasonService.ts`**: `runBatchSeason(..., userId, ...)` → `runBatchSeason(..., roomId, ...)`
  - line 83 payload: `user_id: userId` → `room_id: roomId`

### 훅 변경

#### `hooks/useGameData.ts` — 핵심 변경

**새 상태:**
```ts
const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
```

**gameStateRef 확장:**
```ts
const gameStateRef = useRef({ myTeamId, currentSimDate, userTactics, depthChart, teams, tendencySeed, activeRoomId });
```

**initializeGame useEffect:**
```ts
useEffect(() => {
    if (!activeRoomId) return; // 방 선택 전이면 skip
    if (hasInitialLoadRef.current || isResettingRef.current) return;
    if (isBaseDataLoading || !baseData) return;

    const initializeGame = async () => {
        setIsSaveLoading(true);
        // ...
        const { room, member } = await loadRoomWithMember(activeRoomId, userId);
        if (room && member?.team_id) {
            const history = await loadRoomHistory(activeRoomId);
            const playoffState = await loadPlayoffState(activeRoomId);
            // ... 이하 기존 로직과 동일 (room → sim_date, roster_state 등)
            // member → team_id, tactics, depth_chart
        }
    };
    initializeGame();
}, [baseData, isBaseDataLoading, isGuestMode, session?.user?.id, activeRoomId]);
```

**forceSave 분리:**
```ts
const forceSave = async (overrides?: any) => {
    const roomId = gameStateRef.current.activeRoomId;
    if (!roomId || !session?.user || isGuestMode) return;

    const teamId = overrides?.myTeamId || gameStateRef.current.myTeamId;
    const date = overrides?.currentSimDate || gameStateRef.current.currentSimDate;
    // ...

    // 방 레벨 (sim_date, roster_state, draft_state, tendency_seed)
    await saveRoom(roomId, date, rosterState, draftState, seed, myTeam?.wins, myTeam?.losses);

    // 멤버 레벨 (team_id, tactics, depth_chart)
    await saveMember(roomId, session.user.id, teamId, tactics, depthChart);
};
```

**handleDeleteRoom:**
```ts
const handleDeleteRoom = async (roomId: string) => {
    await deleteRoom(roomId); // CASCADE — 1줄
    if (roomId === activeRoomId) {
        cleanupGameState();
        setActiveRoomId(null);
    }
};
```

**cleanupData 확장:**
```ts
const cleanupData = () => {
    setMyTeamId(null);
    isInitialTacticsLoad.current = true;
    hasInitialLoadRef.current = false;
    setActiveRoomId(null);
    if (tacticsAutoSaveTimer.current) clearTimeout(tacticsAutoSaveTimer.current);
};
```

**반환값 추가:**
```ts
return {
    ...기존,
    activeRoomId, setActiveRoomId,
    handleDeleteRoom,
};
```

#### `hooks/useSimulation.ts`

시그니처에 `roomId: string | null` 파라미터 추가:
```ts
export const useSimulation = (
    ..., session: any, isGuestMode: boolean, ...,
    roomId: string | null  // ← NEW
) => {
    // processCpuGames(..., roomId)
    // applyUserGameResult(..., roomId, session?.user?.id, ...)
    // handleSeasonEvents(..., roomId, ...)
};
```

#### `hooks/useFullSeasonSim.ts`

동일 패턴:
```ts
export const useFullSeasonSim = (
    ..., session: any, isGuestMode: boolean, ...,
    roomId: string | null  // ← NEW
) => {
    // runBatchSeason(..., roomId, ...)
    // savePlayoffState(roomId, ...)
};
```

### UI 변경

#### 새 컴포넌트: `views/RoomSelectView.tsx`

로그인 직후, 메인화면 진입 전에 표시되는 전체 화면.
ModeSelectView와 동일한 다크 스포츠 게이밍 테마.

**가로 3개 카드 배치:**

```
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│  [LAL Logo]    │  │  [GSW Logo]    │  │     + + +      │
│  Lakers        │  │  Warriors      │  │                │
│  25W - 10L     │  │  30W - 5L      │  │   새 게임      │
│  2025.12.15    │  │  2026.01.20    │  │                │
│                │  │                │  │                │
│  [계속하기]    │  │  [계속하기]    │  │                │
│       [삭제]   │  │       [삭제]   │  │                │
└────────────────┘  └────────────────┘  └────────────────┘
```

**Props:**
```ts
interface RoomSelectViewProps {
    userId: string;
    onSelectRoom: (roomId: string) => void;
    onCreateRoom: () => void;
    onDeleteRoom: (roomId: string) => Promise<void>;
    onLogout: () => void;
}
```

**삭제 UX:** 카드 내 인라인 확인 ("정말 삭제하시겠습니까?" + 취소/삭제 버튼)

#### `App.tsx` 라우팅

**새 가드 순서:**
```tsx
// 1. 인증 로딩
if (authLoading) return <FullScreenLoader message="잠시만 기다려주세요..." />;
// 2. 미로그인
if (!session && !isGuestMode) return <AuthView ... />;
// 3. 게스트는 RoomSelect 생략
// 4. 방 미선택 → RoomSelectView ← NEW
if (!isGuestMode && !gameData.activeRoomId) {
    return <RoomSelectView
        userId={session.user.id}
        onSelectRoom={(roomId) => gameData.setActiveRoomId(roomId)}
        onCreateRoom={() => { /* createRoom → setActiveRoomId → ModeSelect */ }}
        onDeleteRoom={gameData.handleDeleteRoom}
        onLogout={handleLogout}
    />;
}
// 5. 세이브 로딩
if (gameData.isSaveLoading) return <SkeletonLoader />;
// 6. 팀 미선택 → ModeSelect → TeamSelect
if (!gameData.myTeamId) { ... }
// 7. MainLayout
```

**훅 호출 변경:**
```ts
const sim = useSimulation(..., gameData.activeRoomId);
const { handleSimulateSeason, ... } = useFullSeasonSim(..., gameData.activeRoomId);
```

#### `components/Sidebar.tsx`

- `SidebarProps`에 `onChangeSave: () => void` 추가
- 드롭다운 메뉴에 "세이브 변경" 버튼 (Save 아이콘, 인디고 색상, "데이터 초기화" 위)
- "데이터 초기화" → "현재 세이브 삭제" 레이블 변경

#### `components/MainLayout.tsx`

- `sidebarProps` 타입에 `onChangeSave` 추가, Sidebar에 전달

#### `components/ResetDataModal.tsx`

- 타이틀: "세이브 삭제"
- 설명: "현재 세이브의 모든 데이터가 영구 삭제됩니다"

---

## 수정 파일 목록 (~18개)

| # | 파일 | 변경 내용 |
|---|------|----------|
| 1 | `types/app.ts` | RoomInfo 타입, AppView에 'RoomSelect' |
| 2 | `services/persistence.ts` | 전면 리팩토링: room 기반 함수 |
| 3 | `services/playoffService.ts` | userId → roomId |
| 4 | `services/queries.ts` | userId → roomId |
| 5 | `services/messageService.ts` | (userId, teamId) → (roomId, userId) |
| 6 | `services/simulation/cpuGameService.ts` | payload에 room_id |
| 7 | `services/simulation/userGameService.ts` | payload에 room_id |
| 8 | `services/simulation/seasonService.ts` | savePlayoffState(roomId) |
| 9 | `services/simulation/batchSeasonService.ts` | payload에 room_id |
| 10 | `hooks/useGameData.ts` | activeRoomId, saveRoom/saveMember 분리 |
| 11 | `hooks/useSimulation.ts` | roomId 파라미터 |
| 12 | `hooks/useFullSeasonSim.ts` | roomId 파라미터 |
| 13 | **NEW** `views/RoomSelectView.tsx` | 방 선택 UI |
| 14 | `components/Sidebar.tsx` | onChangeSave, 레이블 |
| 15 | `components/MainLayout.tsx` | onChangeSave 전달 |
| 16 | `components/ResetDataModal.tsx` | 텍스트 변경 |
| 17 | `App.tsx` | RoomSelectView 가드, 훅 호출 |
| 18 | `components/AppRouter.tsx` | roomId prop (필요시) |

---

## 구현 순서

1. Supabase SQL: 새 테이블 생성 + RLS + 데이터 마이그레이션
2. `types/app.ts` (타입 먼저)
3. `services/persistence.ts` (핵심 DB 레이어)
4. `services/playoffService.ts`
5. `services/queries.ts`
6. `services/messageService.ts`
7. 시뮬레이션 서비스 4개
8. `hooks/useGameData.ts`
9. `hooks/useSimulation.ts` + `hooks/useFullSeasonSim.ts`
10. `views/RoomSelectView.tsx` (새 컴포넌트)
11. `components/Sidebar.tsx` + `MainLayout.tsx` + `ResetDataModal.tsx`
12. `App.tsx` (모든 연결)
13. 하위 뷰 호출처 (InboxView, ScheduleView, PlayerDetailView 등)
14. 기존 `user_*` 테이블 삭제 (마이그레이션 검증 완료 후)

---

## Phase 2 확장 포인트 (멀티플레이어)

Room 구조가 갖춰지면 멀티플레이어 확장에 필요한 추가 작업:

| 영역 | Phase 1 (현재) | Phase 2 (멀티) |
|------|---------------|---------------|
| max_players | 1 (하드코딩) | 30 |
| 시뮬레이션 | 클라이언트 | 서버 (Edge Functions) |
| 전술 변경 | 즉시 적용 | 서버 저장 → 다음 경기에 반영 |
| 경기 시작 | 유저 클릭 | 정해진 시간에 자동 |
| PBP 전달 | 로컬 생성 → 재생 | 서버 생성 → WebSocket/SSE 스트리밍 |
| 트레이드 | CPU AI 상대 | 유저↔유저 |
| 드래프트 | 30팀 AI + 유저 | 30명 실시간 |
| room_members | 1행 | 최대 30행 |
| 빈 팀 | 없음 | AI 단장 자동 관리 |

이때 DB 스키마/코드 구조 변경 없이 **서버 로직 추가**만 필요.

---

## 검증 방법

1. **DB**: 새 테이블 + RLS 정상 동작 확인
2. **마이그레이션**: saves ↔ rooms/room_members 행 수 일치, game_results 정합성
3. **기존 세이브 호환**: 마이그레이션 후 기존 유저가 RoomSelectView에서 방 1개 확인
4. **새 방 생성**: 빈 슬롯 → 모드 선택 → 팀 선택 → 게임 진행
5. **방 격리**: 방 A에서 5경기 → 방 B 생성 → 방 A 데이터 무결성
6. **방 삭제**: CASCADE로 room_game_results 등 자동 삭제 확인
7. **세이브 변경**: 게임 중 "세이브 변경" → RoomSelectView → 다른 방 → 정상 로드
8. **게스트 모드**: RoomSelectView 생략, 기존 흐름 유지

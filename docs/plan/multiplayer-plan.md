# NBA-GM-SIM 멀티플레이어 전환 계획

## Context

싱글플레이어 NBA GM 시뮬레이터를 최대 30인 동시 참가 멀티플레이어로 전환한다.
운영자가 개설한 세션(리그)에 유저들이 이메일로 가입 후 참가하며, 서버사이드 경기 시뮬과 실시간 전술 변경을 지원한다.

**활성화할 기능**: 참가/팀선택, 판타지 드래프트(서버사이드), 서버사이드 PBP 시뮬, 유저간 트레이드
**비활성화할 기능**: 프론트오피스/코칭스태프, 재정, 훈련, 예산, 샐러리캡, FA협상/해고/재계약

---

## 확정된 설계 결정
- **Room 전환**: Phase 0을 먼저 완료한 뒤 멀티로 확장
- **전술 변경 타이밍**: 쿼터 사이에만 반영 (Edge Function 시간 제한 안전하게 우회)
- **최소 인원**: 30명이 모두 팀을 선택해야 드래프트 시작 가능 (AI 팀 없음)

---

## 선행 조건: Room 아키텍처 전환 (Phase 0)

`docs/plan/room-architecture.md`에 상세 설계가 이미 완료되어 있다. 멀티플레이어의 기반이므로 반드시 먼저 구현해야 한다.

### 왜 먼저 해야 하는가
현재 `saves` 테이블은 **user_id PK, 리그 전체 상태가 JSONB 한 행**에 몰려 있다.
멀티에서 30명이 공유 리그 상태(트레이드, FA, 픽 자산 등)를 동시에 접근하려면 **Room 공유 상태 / 멤버별 상태** 분리가 필수다.

### 핵심 테이블 변경
```
현재:  saves { user_id PK, team_id, tactics, roster_state, league_* ... }

이후:  rooms        { room_id PK, sim_date, roster_state, league_* ... }
       room_members { (room_id, user_id) PK, team_id, tactics, depth_chart }
       room_game_results  { room_id FK }
       room_transactions  { room_id FK }
       room_playoffs      { room_id FK }
       room_messages      { room_id, user_id }
       room_playoff_results { room_id FK }
```

### 싱글플레이어 호환
- 기존 싱글플레이어 = "1인 방" (멤버 1명짜리 Room)
- `saves` → `rooms` + `room_members` 마이그레이션 스크립트 필요

---

## Phase 1: 리그(세션) 참가 시스템

### 새 테이블
```sql
CREATE TABLE leagues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    admin_user_id UUID NOT NULL,             -- 운영자
    status TEXT DEFAULT 'recruiting',        -- 'recruiting' | 'drafting' | 'in_season' | 'finished'
    max_teams INTEGER DEFAULT 30,
    draft_scheduled_at TIMESTAMPTZ,          -- 드래프트 예약 일시
    draft_pick_duration_sec INTEGER DEFAULT 90,
    season_start_date TEXT DEFAULT '2025-10-20',
    -- 비활성화 플래그
    cap_enabled BOOLEAN DEFAULT FALSE,
    finance_enabled BOOLEAN DEFAULT FALSE,
    coaching_enabled BOOLEAN DEFAULT FALSE,
    training_enabled BOOLEAN DEFAULT FALSE
);
-- rooms 테이블에 league_id FK 컬럼 추가
ALTER TABLE rooms ADD COLUMN league_id UUID REFERENCES leagues(id) ON DELETE SET NULL;
-- league_id IS NULL → 싱글플레이어, NOT NULL → 멀티 리그 소속
```

### 참가 플로우
```
LeagueListView (공개 리그 목록)
  → joinLeague(leagueId, userId)
  → TeamSelectView (선착순, 중복 방지: room_members(room_id, team_id) UNIQUE)
  → LeagueWaitingRoomView (드래프트 대기, Realtime 구독으로 팀 선택 현황 실시간 갱신)
```

### 신규 파일
- `services/leagueService.ts` — `createLeague()`, `joinLeague()`, `listOpenLeagues()`
- `views/LeagueListView.tsx` — 참가 가능 리그 목록
- `views/LeagueWaitingRoomView.tsx` — 드래프트 대기 화면

---

## Phase 2: 판타지 드래프트 서버사이드

### 전제 사항 (코드베이스 분석 결과)
- 현재 CPU 픽 로직: `FantasyDraftView.tsx` 내 인라인, OVR 1위 greedy 픽 (cpuDraftAI.ts 없음)
- `generateSnakeDraftOrder(teamIds, rounds): string[]` — 순수 함수, Deno 이관 가능
- `FantasyDraftView.tsx` 상태: `picks: BoardPick[]`, `currentPickIndex: number`, `draftOrder: string[]` (로컬)
- 외부 npm 의존성 없음 → Edge Function으로 직접 이관 가능

### DB 스키마

```sql
-- 드래프트 공유 상태 (리그당 1행)
CREATE TABLE league_draft_state (
    league_id        UUID PRIMARY KEY REFERENCES leagues(id) ON DELETE CASCADE,
    status           TEXT    NOT NULL DEFAULT 'pending',
                             -- 'pending' | 'in_progress' | 'completed'
    current_pick_idx INTEGER NOT NULL DEFAULT 0,
    draft_order      JSONB   NOT NULL DEFAULT '[]',
                             -- string[] — teamId 시퀀스 (스네이크 순서, 총 30×rounds)
    picks            JSONB   NOT NULL DEFAULT '[]',
                             -- BoardPick[] { round, pickInRound, teamId, playerId, ovr, position, pickedAt }
    available_ids    JSONB   NOT NULL DEFAULT '[]',
                             -- string[] — 아직 픽되지 않은 meta_player.id 목록
    turn_started_at  TIMESTAMPTZ,          -- 현재 턴 시작 시각 (타임아웃 계산)
    total_rounds     INTEGER NOT NULL DEFAULT 15,
    updated_at       TIMESTAMPTZ DEFAULT now()
);
```

### Edge Functions — 디렉토리 구조

```
supabase/
├── functions/
│   ├── _shared/                           ← 공용 타입·유틸
│   │   ├── types.ts                       ← BoardPick, DraftState 타입
│   │   └── draftUtils.ts                  ← generateSnakeDraftOrder (utils/draftUtils.ts 복사)
│   ├── start-draft/index.ts
│   ├── submit-pick/index.ts
│   └── draft-cron/index.ts                ← Supabase cron job
└── config.toml
```

**`start-draft/index.ts` 의사코드:**
```typescript
// POST /functions/v1/start-draft
// Body: { leagueId: string }
// Auth: admin_user_id만 호출 가능

export default async function handler(req: Request) {
    const { leagueId } = await req.json();

    // 1. 권한 확인
    const league = await supabase.from('leagues').select('*')
        .eq('id', leagueId).single();
    if (league.admin_user_id !== authUid) return error(403);

    // 2. 30명 전원 팀 선택 완료 확인
    const members = await supabase.from('room_members')
        .select('team_id').eq('room_id', league.room_id);
    const unassigned = members.filter(m => !m.team_id);
    if (unassigned.length > 0) return error(400, '팀 미선택 인원 존재');

    // 3. meta_players 전체 로드 (OVR 내림차순)
    const players = await supabase.from('meta_players')
        .select('id, base_attributes').order('ovr', { ascending: false });

    // 4. 스네이크 드래프트 순서 생성
    const teamIds = members.map(m => m.team_id);
    const totalRounds = Math.min(15, Math.floor(players.length / teamIds.length));
    const draftOrder = generateSnakeDraftOrder(teamIds, totalRounds);

    // 5. league_draft_state 초기화 + leagues.status 업데이트
    await supabase.from('league_draft_state').insert({
        league_id:    leagueId,
        status:       'in_progress',
        draft_order:  draftOrder,
        available_ids: players.map(p => p.id),
        total_rounds: totalRounds,
        turn_started_at: new Date().toISOString(),
    });
    await supabase.from('leagues').update({ status: 'drafting' }).eq('id', leagueId);

    // 6. 첫 번째 턴 브로드캐스트
    await supabase.channel(`draft:${leagueId}`)
        .send({ type: 'broadcast', event: 'DRAFT_STARTED',
                payload: { draftOrder, currentPickIdx: 0, turnTeamId: draftOrder[0] } });
}
```

**`submit-pick/index.ts` 의사코드:**
```typescript
// POST /functions/v1/submit-pick
// Body: { leagueId: string, playerId: string, isAutoPick?: boolean }

export default async function handler(req: Request) {
    const { leagueId, playerId, isAutoPick } = await req.json();

    // 1. 현재 드래프트 상태 로드 (FOR UPDATE로 행 잠금)
    const draft = await supabase.from('league_draft_state')
        .select('*').eq('league_id', leagueId).single();

    // 2. 현재 턴 팀 확인
    const currentTeamId = draft.draft_order[draft.current_pick_idx];
    const member = await supabase.from('room_members')
        .select('user_id').eq('team_id', currentTeamId).single();

    // 3. 호출자 권한 확인 (본인 턴이거나 cron 오토픽)
    if (!isAutoPick && member.user_id !== authUid) return error(403);

    // 4. 선수 유효성 확인 (아직 available)
    if (!draft.available_ids.includes(playerId)) return error(400, '이미 픽된 선수');

    // 5. 픽 기록 + 상태 업데이트 (원자적)
    const round = Math.floor(draft.current_pick_idx / 30) + 1;
    const pickInRound = (draft.current_pick_idx % 30) + 1;
    const newPick: BoardPick = { round, pickInRound, teamId: currentTeamId,
                                  playerId, pickedAt: new Date().toISOString() };
    const newIdx = draft.current_pick_idx + 1;
    const isDone = newIdx >= draft.draft_order.length;

    await supabase.from('league_draft_state').update({
        current_pick_idx: newIdx,
        picks:            [...draft.picks, newPick],
        available_ids:    draft.available_ids.filter(id => id !== playerId),
        status:           isDone ? 'completed' : 'in_progress',
        turn_started_at:  isDone ? null : new Date().toISOString(),
        updated_at:       new Date().toISOString(),
    }).eq('league_id', leagueId);

    // 6. 전체 참가자에게 브로드캐스트
    await supabase.channel(`draft:${leagueId}`)
        .send({ type: 'broadcast', event: 'PICK_MADE', payload: {
            pick: newPick,
            nextPickIdx: newIdx,
            nextTeamId: isDone ? null : draft.draft_order[newIdx],
        }});

    // 7. 드래프트 완료 시 — 각 멤버 roster_state 반영
    if (isDone) await finalizeDraft(leagueId, draft.picks);
}

// 오토픽: available_ids[0] (OVR 1위, 사전 정렬됨)
function getAutoPick(draft: DraftState): string {
    return draft.available_ids[0];
}
```

**`draft-cron/index.ts` (10초 간격):**
```typescript
// 역할 1: draft_scheduled_at 도달 리그 → start-draft 호출
// 역할 2: turn_started_at + pick_duration_sec 초과 턴 → 오토픽 실행
const overdueLeagues = await supabase.from('league_draft_state')
    .select('league_id, turn_started_at')
    .eq('status', 'in_progress')
    .lt('turn_started_at', new Date(Date.now() - pickDurationMs).toISOString());

for (const league of overdueLeagues) {
    const draft = await getDraftState(league.league_id);
    const autoPick = getAutoPick(draft);
    await fetch('/functions/v1/submit-pick', {
        body: JSON.stringify({ leagueId: league.league_id,
                               playerId: autoPick, isAutoPick: true })
    });
}
```

### 클라이언트 — `hooks/useLeagueDraft.ts` (신규)

```typescript
export function useLeagueDraft(leagueId: string) {
    const [draftState, setDraftState] = useState<DraftState | null>(null);

    useEffect(() => {
        // 1. 초기 상태 HTTP 로드 (재연결 복원용)
        supabase.from('league_draft_state').select('*')
            .eq('league_id', leagueId).single()
            .then(({ data }) => setDraftState(data));

        // 2. Realtime 브로드캐스트 구독
        const channel = supabase.channel(`draft:${leagueId}`)
            .on('broadcast', { event: 'PICK_MADE' }, ({ payload }) => {
                setDraftState(prev => ({
                    ...prev!,
                    picks: [...prev!.picks, payload.pick],
                    current_pick_idx: payload.nextPickIdx,
                }));
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [leagueId]);

    const submitPick = (playerId: string) =>
        fetch('/functions/v1/submit-pick', {
            method: 'POST',
            body: JSON.stringify({ leagueId, playerId }),
            headers: { Authorization: `Bearer ${session.access_token}` }
        });

    return { draftState, submitPick };
}
```

### `FantasyDraftView.tsx` 변경 범위

| 현재 (로컬) | 멀티 (서버 동기화) |
|---|---|
| `useState<BoardPick[]>` | `useLeagueDraft(leagueId).draftState.picks` |
| `setCurrentPickIndex(...)` | `draftState.current_pick_idx` |
| `handleAdvanceOnePick()` — CPU 픽 직접 실행 | CPU 픽은 서버 cron이 처리, 클라이언트는 수신만 |
| `onComplete(picks)` 콜백 | DRAFT_COMPLETED 이벤트 수신 시 라우팅 전환 |

UI 레이아웃(드래프트 보드, 픽 타이머, 선수 목록) 100% 재사용.

---

## Phase 3: 서버사이드 경기 시뮬레이션 + 라이브 스트리밍

### 전제 사항 (코드베이스 분석 결과)
- `GameState`는 **완전한 plain object** — `JSON.stringify` / `JSON.parse`로 직렬화/복원 가능
- `stepPossession(state: GameState): StepResult` — 순수 동기 함수, 외부 의존 없음
- `runFullGameSimulation(...)` — `while(running) { stepPossession(state) }` 단순 래퍼
- PBP 엔진 파일들에 Node.js 전용 API 없음 → Deno Edge Function 이관 가능
- `supabase/` 디렉토리 미존재 → 신규 구축 필요

### 아키텍처: "쿼터 단위 시뮬 + DB 적재 + 클라이언트 재생"

**왜 포세션마다 Realtime 스트리밍하지 않는가:**
- Edge Function은 HTTP request당 실행, 장시간 연결 유지 불가
- 포세션 1개 시뮬: ~0.1ms → 쿼터 전체: ~20-50ms → Edge Function 제한 완전 여유
- 쿼터 PBP를 DB에 저장 → Supabase Realtime DB 변경 감지 → 클라이언트가 저장된 이벤트를 속도 조절해 재생

**데이터 흐름:**
```
[schedule-games-cron]  매분 실행
  → league_sim_jobs WHERE status='queued' AND scheduled_at <= now() 조회
  → 각 job에 대해 simulate-game EF 호출 (비동기, 병렬)

[simulate-game EF]  game_id, quarter(1~4), checkpoint_state 수신
  1. quarter=1: createGameState(homeTeam, awayTeam, tactics, ...) 생성
     quarter>1: JSON.parse(job.checkpoint_state) 역직렬화
  2. while(!isQuarterEnd && !isGameEnd) { stepPossession(state) }
  3. 해당 쿼터의 StepResult[] → room_game_pbp 테이블에 batch INSERT
  4. JSON.stringify(state) → league_sim_jobs.checkpoint_state 저장
  5. 쿼터 전술 반영: room_members.tactics 읽어 state.userTeam.tactics 교체
  6. quarter < 4: simulate-game(quarter+1) 자기 자신 재호출
     quarter = 4: 최종 결과 → room_game_results INSERT, job.status = 'done'

[클라이언트 useMultiLiveGame.ts]
  → room_game_pbp (game_id) Supabase Realtime 구독 (INSERT 이벤트)
  → 수신된 StepResult를 로컬 playbackQueue에 추가
  → setInterval로 speed 배수에 따라 큐에서 꺼내 화면 렌더링 (기존 useLiveGame 로직 재사용)
```

### DB 스키마

```sql
-- 경기 PBP 이벤트 저장 테이블
CREATE TABLE room_game_pbp (
    id               BIGSERIAL    PRIMARY KEY,
    room_id          UUID         NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    game_id          TEXT         NOT NULL,     -- room_game_results.game_id FK
    quarter          SMALLINT     NOT NULL,     -- 1~4 (연장: 5~)
    possession_idx   INTEGER      NOT NULL,     -- 쿼터 내 포세션 번호
    step_result      JSONB        NOT NULL,     -- StepResult (logs, isQuarterEnd, ...)
    created_at       TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX idx_rgp_game_quarter
    ON room_game_pbp (game_id, quarter, possession_idx);

-- 시뮬 잡 큐
CREATE TABLE league_sim_jobs (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id        UUID         NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    room_id          UUID         NOT NULL REFERENCES rooms(id),
    game_date        TEXT         NOT NULL,     -- 처리할 sim_date
    status           TEXT         NOT NULL DEFAULT 'queued',
                                  -- 'queued' | 'running' | 'done' | 'failed'
    scheduled_real_at TIMESTAMPTZ NOT NULL,    -- 실제 서버 실행 예약 시각
    checkpoint_state JSONB,                    -- 쿼터 간 GameState JSON
    current_quarter  SMALLINT     DEFAULT 0,   -- 현재까지 완료된 쿼터
    started_at       TIMESTAMPTZ,
    finished_at      TIMESTAMPTZ,
    error_msg        TEXT,
    created_at       TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX idx_lsj_status ON league_sim_jobs (status, scheduled_real_at);
```

### Edge Functions — 디렉토리 구조

```
supabase/functions/
├── _shared/
│   ├── pbpEngine.ts        ← liveEngine.ts + pbpTypes.ts 복사 (Deno용)
│   ├── gameLoader.ts       ← DB에서 Team/tactics 조립하는 헬퍼
│   └── supabaseAdmin.ts    ← SERVICE_ROLE_KEY 사용 admin client
├── simulate-game/index.ts  ← 쿼터 단위 시뮬 핵심
├── schedule-games-cron/    ← cron 스케줄러
└── update-tactics/         ← 유저 전술 변경 수신
```

**`simulate-game/index.ts` 의사코드:**
```typescript
// POST /functions/v1/simulate-game
// Body: { jobId, gameId, quarter: 1|2|3|4 }
// 인증: SERVICE_ROLE (cron에서 직접 호출)

export default async function handler(req: Request) {
    const { jobId, gameId, quarter } = await req.json();

    // 1. 잡/경기 정보 조회
    const job = await adminClient.from('league_sim_jobs')
        .select('*, rooms(*)').eq('id', jobId).single();
    const game = await adminClient.from('room_game_results')
        .select('home_team_id, away_team_id').eq('game_id', gameId).single();

    // 2. GameState 준비
    let state: GameState;
    if (quarter === 1) {
        // 팀 데이터 + 전술 로드
        const homeTeam = await loadTeamForSim(game.home_team_id, job.room_id);
        const awayTeam = await loadTeamForSim(game.away_team_id, job.room_id);
        state = createGameState(homeTeam, awayTeam, null, undefined, ...);
    } else {
        // 이전 쿼터 체크포인트 복원
        state = JSON.parse(job.checkpoint_state) as GameState;

        // 쿼터 시작 전 최신 전술 반영 (유저 팀만)
        const userMember = await adminClient.from('room_members')
            .select('tactics, depth_chart, team_id')
            .eq('room_id', job.room_id).single();
        if (state.home.teamId === userMember.team_id) {
            state.home.tactics = userMember.tactics;
        } else if (state.away.teamId === userMember.team_id) {
            state.away.tactics = userMember.tactics;
        }
    }

    // 3. 해당 쿼터 시뮬 실행
    const pbpRows: PbpRow[] = [];
    let possessionIdx = 0;
    while (true) {
        const result: StepResult = stepPossession(state);
        pbpRows.push({ room_id: job.room_id, game_id: gameId,
                       quarter, possession_idx: possessionIdx++,
                       step_result: result });
        if (result.isQuarterEnd || result.isGameEnd) break;
    }

    // 4. PBP batch INSERT (Realtime 트리거가 클라이언트에 알림)
    await adminClient.from('room_game_pbp').insert(pbpRows);

    // 5. 체크포인트 저장
    await adminClient.from('league_sim_jobs').update({
        checkpoint_state: JSON.stringify(state),
        current_quarter:  quarter,
    }).eq('id', jobId);

    // 6. 다음 쿼터 or 종료 처리
    const isGameOver = state.isGameEnd || quarter === 4;
    if (!isGameOver) {
        // 자기 자신을 다음 쿼터로 재호출 (비동기)
        EdgeRuntime.waitUntil(
            fetch('/functions/v1/simulate-game', {
                method: 'POST',
                body: JSON.stringify({ jobId, gameId, quarter: quarter + 1 }),
                headers: { Authorization: `Bearer ${Deno.env.get('SERVICE_ROLE_KEY')}` }
            })
        );
    } else {
        // 경기 결과 확정
        const simResult = extractSimResult(state);
        await adminClient.from('room_game_results').update({
            home_score:  simResult.homeScore,
            away_score:  simResult.awayScore,
            box_score:   simResult.boxScore,
            is_complete: true,
        }).eq('game_id', gameId);
        await adminClient.from('league_sim_jobs').update({
            status: 'done', finished_at: new Date().toISOString()
        }).eq('id', jobId);
    }
}
```

**`schedule-games-cron/index.ts`:**
```typescript
// supabase/config.toml 에 cron 등록:
// [functions.schedule-games-cron]
// schedule = "* * * * *"    ← 매분 실행

export default async function handler(_req: Request) {
    // 1. 실행 대기 중인 잡 조회 (scheduled_real_at <= now)
    const jobs = await adminClient.from('league_sim_jobs')
        .select('id, room_id').eq('status', 'queued')
        .lte('scheduled_real_at', new Date().toISOString())
        .limit(50);

    // 2. 각 잡의 경기 목록 조회 + simulate-game 병렬 호출
    for (const job of jobs) {
        await adminClient.from('league_sim_jobs')
            .update({ status: 'running', started_at: now() }).eq('id', job.id);

        const games = await adminClient.from('room_game_results')
            .select('game_id').eq('room_id', job.room_id)
            .eq('sim_date', job.game_date).eq('is_complete', false);

        // 경기마다 Q1부터 시작 (이후 쿼터 연쇄 호출됨)
        await Promise.all(games.map(g =>
            fetch('/functions/v1/simulate-game', {
                method: 'POST',
                body: JSON.stringify({ jobId: job.id, gameId: g.game_id, quarter: 1 }),
            })
        ));
    }
}
```

### 클라이언트 — `hooks/useMultiLiveGame.ts` (신규)

기존 `useLiveGame.ts`와 동일한 인터페이스를 유지하면서 데이터 소스만 교체.

```typescript
// useLiveGame.ts와 반환 인터페이스 동일
export function useMultiLiveGame(roomId: string, gameId: string): LiveGameAPI {
    const playbackQueueRef = useRef<StepResult[]>([]);
    const [displayState, setDisplayState] = useState<LiveDisplayState>(emptyState);
    const speedRef = useRef<number>(1);

    useEffect(() => {
        // 1. 이미 시뮬된 PBP 일괄 로드 (경기 도중 접속 시)
        adminClient.from('room_game_pbp')
            .select('step_result').eq('game_id', gameId)
            .order('quarter').order('possession_idx')
            .then(({ data }) => {
                playbackQueueRef.current = data.map(r => r.step_result);
            });

        // 2. 신규 PBP Realtime 구독 (서버가 새 쿼터 시뮬 중일 때 실시간 수신)
        const channel = supabase.channel(`game-pbp-${gameId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'room_game_pbp',
                filter: `game_id=eq.${gameId}`
            }, ({ new: row }) => {
                playbackQueueRef.current.push(row.step_result);
            })
            .subscribe();

        // 3. 재생 루프 (기존 useLiveGame의 setInterval 로직 그대로)
        const interval = setInterval(() => {
            if (playbackQueueRef.current.length === 0) return;
            const step = playbackQueueRef.current.shift()!;
            applyStepToDisplayState(displayState, step, setDisplayState);
        }, BASE_INTERVAL_MS / speedRef.current);

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, [gameId]);

    // 전술 변경: 서버에 POST, "다음 쿼터부터 적용" 표시
    const applyTactics = (newTactics: TacticalSliders) => {
        fetch('/functions/v1/update-tactics', {
            method: 'POST',
            body: JSON.stringify({ roomId, tactics: newTactics }),
        });
        setPendingTacticsApplied(true); // UI에 "다음 쿼터부터 적용" 배지
    };

    return { displayState, applyTactics, setSpeed, /* ... */ };
}
```

### `update-tactics/index.ts` Edge Function

```typescript
// POST /functions/v1/update-tactics
// Body: { roomId: string, tactics: GameTactics }
// Auth: Supabase JWT (room_members RLS로 자동 필터)

export default async function handler(req: Request) {
    const { roomId, tactics } = await req.json();
    await supabase.from('room_members')
        .update({ tactics })
        .eq('room_id', roomId).eq('user_id', authUid);
    return new Response(JSON.stringify({ ok: true }));
}
```

### 시뮬 스케줄 생성 시점

멀티플레이어 경기 날짜는 **실제 현실 시각**에 매핑됨:
- 리그 개설 시 운영자가 "게임 1일차 = 2026-04-01 오전 9시 UTC" 같은 기준 설정
- `openingNight()` 호출 시 전체 82경기 일정 생성 + 각 경기 날짜에 대응하는 `league_sim_jobs` 일괄 생성
- `scheduled_real_at` = 기준일 + 날짜 오프셋 (예: 1일차 경기는 기준일+0, 2일차는 기준일+1일)

### 단위 테스트 전략

1. **PBP 엔진 Deno 이관 검증**: `supabase/functions/_shared/pbpEngine.ts` 로드 후 `createGameState()` + `stepPossession()` 호출 → 결과가 클라이언트와 동일한지 비교
2. **GameState 직렬화 검증**: `JSON.parse(JSON.stringify(state))` 후 `stepPossession()` 결과가 원본 state와 동일한지 확인
3. **로컬 개발**: `supabase start`로 로컬 Supabase 실행 → `supabase functions serve`로 Edge Function 로컬 테스트

---

## Phase 4: 유저간 트레이드

### 새 테이블
```sql
CREATE TABLE league_trade_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id),
    from_user_id UUID NOT NULL,
    to_user_id UUID NOT NULL,
    from_team_id TEXT NOT NULL,
    to_team_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',          -- 'pending' | 'accepted' | 'rejected' | 'expired'
    offered_player_ids JSONB DEFAULT '[]',
    requested_player_ids JSONB DEFAULT '[]',
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);
```

### 샐러리캡 비활성화 처리
```typescript
// tradeExecutor.ts 내 기존 코드
if (leagueConfig.capEnabled) {
    const legality = checkTradeLegalityDetailed(...);
    if (!legality.isLegal) throw new Error(legality.reason);
}
// cap_enabled = false → 검증 스킵, 선수 이동 로직만 실행
```

### 신규 파일
- `services/multiTradeService.ts`:
  - `proposeTrade()` → `league_trade_proposals` INSERT
  - `acceptTrade()` → 유효성 확인 → `tradeExecutor.executeTrade()` → Realtime 알림
  - `rejectTrade()` → status = 'rejected' → 제안자에게 알림

### UI 변경
- 기존 TradeView의 CPU 평가 UI 제거 (오퍼 분석 메시지 불필요)
- 상대 팀 선택 → 선수 선택 → 제안 전송 (3단계 심플 플로우)
- InboxView에 수신 트레이드 제안 렌더러 추가

---

## Phase 5: 비활성화 기능 정리

```typescript
// hooks/useLeagueConfig.ts (신규)
export function useLeagueConfig() {
    return {
        capEnabled: league?.cap_enabled ?? true,        // 싱글은 기본 true
        financeEnabled: league?.finance_enabled ?? true,
        coachingEnabled: league?.coaching_enabled ?? true,
        trainingEnabled: league?.training_enabled ?? true,
    };
}
```

- 사이드바/메뉴에서 `financeEnabled`, `coachingEnabled`, `trainingEnabled` 조건부 렌더링
- 비활성화 라우트 직접 접근 시 → 대시보드로 리다이렉트
- FA 관련 오프시즌 이벤트(`FA_OPEN`, `simulateCPUSigning`) → 멀티에서 스킵

---

## 주요 기술 위험 요소

| 위험 | 수준 | 대응 |
|------|------|------|
| Supabase Edge Function 냉각 지연 (cold start ~200ms) | 중간 | cron이 미리 웜업 ping 호출, 또는 경기 시작 5분 전 dummy 호출 |
| `simulate-game` 자기 재귀 호출 시 타임아웃 | 낮음 | 쿼터 1개 시뮬: ~50ms → 150초 제한에 여유. `EdgeRuntime.waitUntil`로 백그라운드 처리 |
| GameState 직렬화 크기 (30팀 경기 동시) | 낮음 | GameState ~50-100KB → 30경기 동시: 최대 3MB. JSONB 저장 문제 없음 |
| 팀 선택 동시성 경쟁 조건 | 중간 | `room_members(room_id, team_id)` UNIQUE 제약 + INSERT 실패 시 클라이언트 안내 |
| Realtime 연결 끊김 (드래프트 턴 누락) | 중간 | 재연결 시 `league_draft_state` 전체 HTTP 재fetch → 로컬 상태 재동기화 |
| `submit-pick` 동시 요청 (중복 픽) | 중간 | `league_draft_state` UPDATE WHERE current_pick_idx = 예상값 (낙관적 잠금) |
| PBP 엔진 import 체인 Deno 호환 | 낮음 | 코드베이스 분석 결과 Node.js 전용 API 없음. 이관 전 `deno check` 실행 권장 |

---

## 구현 순서 요약

```
Phase 0: Room 아키텍처 전환    ← 반드시 먼저 (기반)
  ↓
Phase 1: 리그 참가 시스템      ← 세션 생성/참가/팀선택
  ↓
Phase 2: 판타지 드래프트       ← 서버사이드 드래프트
  ↓
Phase 3: 서버사이드 시뮬       ← 가장 복잡, 핵심
  ↓
Phase 4: 유저간 트레이드       ← 단순 플로우
Phase 5: 기능 비활성화 정리    ← 마무리
```

---

## 검증 방법

- **Phase 0**: 기존 싱글플레이어 게임 플로우 전체 회귀 테스트 (팀선택→경기→오프시즌)
- **Phase 1**: 2개 브라우저에서 동시 팀 선택 → 중복 방지 확인, Realtime 대기방 갱신 확인
- **Phase 2**: 운영자 드래프트 시작 → 3개 클라이언트에서 픽 순서 동기화 확인, 타임아웃 CPU 오토픽 확인
- **Phase 3**: Edge Function 직접 호출 → Realtime 채널로 PBP 수신 확인, 쿼터 전술 변경 반영 확인
- **Phase 4**: 유저 A→B 트레이드 제안 → B 인박스 수신 → 수락 후 양쪽 로스터 반영 확인
- **Phase 5**: 멀티 리그에서 `/front-office`, `/fa-market`, `/training` 접근 → 리다이렉트 확인

---

## 문서 저장 위치
- 이 계획안은 승인 후 `docs/plan/multiplayer-plan.md` 에 저장됩니다.

---

## 핵심 파일 참조

- [docs/plan/room-architecture.md](docs/plan/room-architecture.md) — Phase 0 상세 설계 (DB SQL, 함수 매핑 포함)
- [services/persistence.ts](services/persistence.ts) — Phase 0 리팩토링 진원지
- [hooks/useGameData.ts](hooks/useGameData.ts) — Room 기반 전환 핵심 훅
- [services/game/engine/pbp/liveEngine.ts](services/game/engine/pbp/liveEngine.ts) — Edge Function 이관 대상
- [views/FantasyDraftView.tsx](views/FantasyDraftView.tsx) — 서버 상태 동기화 전환 대상
- [services/tradeEngine/tradeExecutor.ts](services/tradeEngine/tradeExecutor.ts) — cap_enabled 분기 추가 대상

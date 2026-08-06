/**
 * scheduler.ts — 30초 폴링 스케줄러.
 *
 * draft-scheduler EF 섹션 1·2를 Bun 서버로 이식.
 * 섹션 3(오토픽)은 DraftRoom.scheduleNext()가 대체 → 폴링 불필요.
 * 섹션 4(완료 처리)는 DraftRoom.onCompleted() → finalize.ts가 대체 → 폴링 불필요.
 *
 * 역할:
 *  A.   추첨 자동 실행: lottery_scheduled_at <= now → run_draft_lottery RPC
 *  A-1. 드래프트 룸 사전 준비: 로터리 완료 && draft_config 없음 → prepareDraftRoom (사전입장 지원)
 *  B.   드래프트 자동 시작: draft_scheduled_at <= now → startDraftForRoom (activateDraftRoom 경유)
 *  C.   고아 방 복구: 서버 재시작 시 진행 중 방 재로드 + 타이머 재개
 *  D.   completed/finalized 방 메모리 정리
 */
import { supabase } from './supabaseAdmin';
import { RoomManager } from './RoomManager';
import { startDraftForRoom, claimAndPrepareRoom } from './startDraft';
import { simWorkerPool } from './workers/simWorkerPool';
import { startPlayoffs } from './shared/playoffSeeder';

const POLL_INTERVAL_MS = 30_000;
const STALE_CLAIM_SWEEP_INTERVAL_MS = 5 * 60_000;

// setInterval은 콜백이 끝나길 기다리지 않는다 — 처리할 경기가 많아 한 번의 tick()이
// POLL_INTERVAL_MS보다 오래 걸리면, 이전 tick이 안 끝났는데 다음 tick이 그대로 겹쳐서
// 실행되어 같은 "아직 안 끝난" 경기를 두 tick이 동시에 처리하는 레이스가 생긴다
// (시리즈 승수 lost-update, 여분 경기 생성/결승 조기 노출로 이어짐). 이전 tick이 진행 중이면
// 다음 tick을 건너뛰어 겹침 자체를 막는다.
let tickRunning = false;

export function startScheduler(): void {
    // 부팅 즉시 고아 방 복구 실행 (재시작 대비)
    recoverOrphanedRooms().catch(e =>
        console.error('[scheduler] orphan recovery error:', e)
    );

    setInterval(() => {
        if (tickRunning) {
            console.log('[scheduler] previous tick still running — skip');
            return;
        }
        tickRunning = true;
        tick()
            .catch(e => console.error('[scheduler] tick error:', e))
            .finally(() => { tickRunning = false; });
    }, POLL_INTERVAL_MS);

    // game_sim_claims 고아 레코드 청소 — 워커 크래시 안전망(simWorkerPool.handleCrash)이
    // 못 잡는 극단적 상황 대비 이중 안전망. 부팅 즉시 1회 실행 + 5분 간격 반복.
    simWorkerPool.sweepStaleClaims().catch(e =>
        console.error('[scheduler] stale claim sweep error:', e)
    );
    setInterval(() => {
        simWorkerPool.sweepStaleClaims().catch(e =>
            console.error('[scheduler] stale claim sweep error:', e)
        );
    }, STALE_CLAIM_SWEEP_INTERVAL_MS);

    console.log('[scheduler] started (30s interval)');
}

// ── 메인 틱 ──────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
    const now = new Date().toISOString();

    await Promise.allSettled([
        runLotteries(now),
        runDraftRoomPrep(),
        runScheduledDraftStarts(now),
        runSimGames(now),
        checkSeasonCompletions(),
        cleanupCompletedRooms(),
    ]);
}

// ── F. 메인리그 정규시즌 완료 감지 → 플레이오프 자동 생성 ─────────────────────
// bracket_data is null 조건으로 이미 플레이오프가 생성된 리그는 스킵(중복 생성 방지).

async function checkSeasonCompletions(): Promise<void> {
    const { data: leagues } = await supabase
        .from('leagues')
        .select('id, match_format, finals_match_format, games_per_real_day, playoff_team_count')
        .eq('type', 'main_league')
        .eq('status', 'in_progress')
        .is('bracket_data', null);

    if (!leagues?.length) return;

    for (const league of leagues) {
        const { count: unplayed } = await supabase
            .from('games')
            .select('game_id', { count: 'exact', head: true })
            .eq('league_id', league.id).eq('is_playoff', false).eq('played', false);
        if (unplayed !== 0) continue;

        // count가 0인 게 "시즌 완료"가 아니라 "게임이 아직 하나도 안 생성됨"(드래프트 진행 중
        // 등)일 수도 있으므로, 정규시즌 게임이 실제로 존재하는지도 함께 확인한다.
        const { count: total } = await supabase
            .from('games')
            .select('game_id', { count: 'exact', head: true })
            .eq('league_id', league.id).eq('is_playoff', false);
        if (!total) continue;

        const { data: room } = await supabase.from('rooms').select('id').eq('league_id', league.id).maybeSingle();
        if (!room) continue;

        console.log(`[scheduler:season] league=${league.id} — regular season complete, starting playoffs`);
        await startPlayoffs(league, room.id).catch(err =>
            console.error(`[scheduler:season] startPlayoffs failed(${league.id}):`, err),
        );
    }
}

// ── A. 추첨 자동 실행 ────────────────────────────────────────────────────────

async function runLotteries(now: string): Promise<void> {
    const { data: leagues } = await supabase
        .from('leagues')
        .select('id, admin_user_id')
        .eq('status', 'recruiting')
        .not('lottery_scheduled_at', 'is', null)
        .lte('lottery_scheduled_at', now);

    for (const league of leagues ?? []) {
        const { data: room } = await supabase
            .from('rooms')
            .select('id')
            .eq('league_id', league.id)
            .eq('status', 'active')
            .maybeSingle();

        if (!room) continue;

        const { count } = await supabase
            .from('league_teams')
            .select('id', { count: 'exact', head: true })
            .eq('room_id', room.id)
            .not('draft_order', 'is', null);

        if ((count ?? 0) > 0) continue; // 추첨 이미 완료

        const { error } = await supabase.rpc('run_draft_lottery', {
            p_room_id:  room.id,
            p_admin_id: league.admin_user_id,
        });

        if (error && !error.message.includes('lottery_already_done')) {
            console.error(`[scheduler:lottery] league=${league.id}: ${error.message}`);
        } else if (!error) {
            console.log(`[scheduler:lottery] done league=${league.id}`);
            // 추첨 직후 곧바로 방 준비 — /run-lottery 엔드포인트(수동 로터리)와 동일하게,
            // 자동(예약) 로터리도 다음 스케줄러 틱(최대 30초)을 기다리지 않고 즉시 처리한다.
            // 원자적 클레임을 거치므로 다음 틱의 runDraftRoomPrep()과 겹쳐도 안전하다.
            const prep = await claimAndPrepareRoom(league.id, room.id);
            if (!prep.ok) {
                console.error(`[scheduler:lottery] prep failed league=${league.id}: ${prep.error}`);
            }
        }
    }
}

// ── A-1. [신규] 로터리 완료 후 드래프트 룸 사전 준비 (사전입장 지원) ──────────
// 로터리가 끝났는데(league_teams.draft_order 존재) 아직 draft_config가 없는 방을 찾아
// prepareDraftRoom()으로 미리 준비해둔다(cursor='waiting') — 그래야 예정 시각 전에도
// 유저가 룸에 입장해 풀/픽순서를 미리 볼 수 있고, activateDraftRoom()은 예정 시각에
// 커서만 가볍게 'active'로 뒤집으면 된다. 로터리가 수동(어드민 클릭)/자동(runLotteries)
// 어느 경로로 끝나든 폴링이라 다음 tick에서 여기서 잡힌다.
async function runDraftRoomPrep(): Promise<void> {
    const { data: leagues } = await supabase
        .from('leagues')
        .select('id')
        .eq('status', 'recruiting');

    for (const league of leagues ?? []) {
        const { data: room } = await supabase
            .from('rooms')
            .select('id, draft_config, draft_cursor')
            .eq('league_id', league.id)
            .eq('status', 'active')
            .maybeSingle();

        if (!room || room.draft_config) continue; // 방 없음, 또는 이미 준비됨
        if ((room.draft_cursor as any)?.status === 'preparing') continue; // 다른 tick이 준비 중

        const { count } = await supabase
            .from('league_teams')
            .select('id', { count: 'exact', head: true })
            .eq('room_id', room.id)
            .not('draft_order', 'is', null);

        if (!count) continue; // 로터리 아직 안 끝남

        // 원자적 클레임 + 준비는 claimAndPrepareRoom() 공용 헬퍼가 담당한다 — /run-lottery
        // 엔드포인트도 같은 헬퍼를 쓰므로 두 경로가 동시에 이 방을 준비하려 해도 draft_config가
        // 여전히 null일 때만 클레임에 성공해 중복 실행되지 않는다(둘 중 하나는 skipped로 조용히 빠짐).
        // draft_config를 클레임 마커로 쓰지 않는 이유(2026-07-24 장애 이력)는 startDraft.ts 참조.
        const result = await claimAndPrepareRoom(league.id, room.id);
        if (!result.ok) {
            console.error(`[scheduler:draft-prep] league=${league.id}: ${result.error}`);
        } else if (!result.skipped) {
            console.log(`[scheduler:draft-prep] room=${room.id} league=${league.id} prepared (waiting)`);
        }
    }
}

// ── B. 드래프트 자동 시작 ────────────────────────────────────────────────────

async function runScheduledDraftStarts(now: string): Promise<void> {
    const { data: leagues } = await supabase
        .from('leagues')
        .select('id, draft_total_rounds, draft_pick_duration_sec, draft_pool, draft_pool_strategy, draft_ovr_min, draft_ovr_max')
        .eq('status', 'recruiting')
        .not('draft_scheduled_at', 'is', null)
        .lte('draft_scheduled_at', now);

    for (const league of leagues ?? []) {
        const { data: room } = await supabase
            .from('rooms')
            .select('id, draft_cursor')
            .eq('league_id', league.id)
            .eq('status', 'active')
            .maybeSingle();

        if (!room) continue;
        if ((room.draft_cursor as any)?.status === 'active') continue;

        // 원자적 claim: recruiting → drafting (다른 서버 인스턴스/틱이 동시 처리 방지)
        // update() 뒤에 체이닝되는 select()는 PostgrestTransformBuilder.select(columns)로,
        // {count, head} 옵션을 받지 않는다(무시됨) — 반환된 rows 배열 길이로 판정해야 한다.
        const { data: claimedRows } = await supabase
            .from('leagues')
            .update({ status: 'drafting' })
            .eq('id', league.id)
            .eq('status', 'recruiting')
            .select('id');

        if (!claimedRows?.length) continue; // 이미 선점됨

        // claim 성공 → 드래프트 시작 (start는 내부에서 status를 다시 'drafting'으로 설정하지만, 이미 설정됨)
        const ok = await startDraftForRoom(league.id, room.id);
        if (!ok) {
            // 실패 시 recruiting으로 복원
            await supabase.from('leagues').update({ status: 'recruiting' }).eq('id', league.id);
        } else {
            console.log(`[scheduler:auto-start] room=${room.id} league=${league.id}`);
        }
    }
}

// ── C. 고아 방 복구 (서버 재시작 대비) ─────────────────────────────────────

async function recoverOrphanedRooms(): Promise<void> {
    const { data: activeRooms } = await supabase
        .from('rooms')
        .select('id, draft_cursor')
        .eq('status', 'active')
        .or("draft_cursor->>status.eq.active,draft_cursor->>status.eq.paused");

    if (!activeRooms?.length) {
        console.log('[scheduler] no orphaned rooms to recover');
        return;
    }

    let recovered = 0;
    for (const row of activeRooms) {
        // 이미 메모리에 있으면 스킵
        if (RoomManager.get(row.id)) continue;

        const cursor = (row.draft_cursor ?? {}) as any;
        if (cursor.status !== 'active' && cursor.status !== 'paused') continue;

        const room = await RoomManager.getOrLoad(row.id);
        if (!room) continue;

        if (cursor.status === 'active') {
            // 타이머 재개 (시간이 지나 있으면 즉시 픽 처리)
            room.scheduleNext();
        }
        // paused 상태는 타이머 없이 메모리만 로드
        recovered++;
    }

    if (recovered > 0) {
        console.log(`[scheduler] recovered ${recovered} orphaned room(s)`);
    }
}

// ── D. 완료/finalized 방 메모리 정리 ────────────────────────────────────────

async function cleanupCompletedRooms(): Promise<void> {
    for (const room of RoomManager.getAll()) {
        if (room.isCompleted()) {
            // finalize.ts가 이미 처리했거나 처리 중 — 타이머 없으므로 안전하게 제거
            // DraftRoom.onCompleted에서 finalizeDraft를 호출한 후 일정 시간이 지나면 정리
            // 여기서는 cursor.status='completed'인 방만 제거 (finalized는 별도)
            RoomManager.destroy(room.roomId);
        }
    }
}

// ── E. 리그 경기 시뮬레이션 폴링 ─────────────────────────────────────────────

// 경기 예정 1분 전 사전계산 (30초 폴링 대응)
const SIM_LEAD_MS = 60 * 1000;
// due 질의 배치 상한 — in_progress 리그가 7개×≤186경기인 현재 규모론 도달 불가하지만,
// 장기 다운타임 후 백로그가 쌓일 경우를 대비해 도달 시 경고만 남긴다.
const DUE_QUERY_LIMIT = 500;

// 실시각(ms) → KST 달력 날짜(YYYY-MM-DD). game.date(슬롯 기반 계산값)는 자정 근처에서
// 실제 KST 날짜와 어긋날 수 있어(예: 23:40 다음 슬롯이 00:10), sim_date 갱신 시에는
// 반드시 이 값을 써야 클라이언트의 kstDateKey()와 같은 날짜로 판정된다.
function kstDateFromMs(ms: number): string {
    const kst = new Date(ms + 9 * 3_600_000);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kst.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// [migration 2026-08-06] 방마다 rooms.schedule 전체를 Node 메모리로 읽어 JS로 훑던 것을
// games 테이블의 부분 인덱스(games_due_idx) 질의 하나로 대체 — scheduler.ts 원본 로직/버그
// 히스토리는 docs/history/dev-log.md 2026-08-06 항목 참조.
async function runSimGames(now: string): Promise<void> {
    const cutoffIso = new Date(Date.now() + SIM_LEAD_MS).toISOString();

    const { data: leagues } = await supabase
        .from('leagues')
        .select('id')
        .eq('status', 'in_progress');

    if (!leagues?.length) return;
    const leagueIds = leagues.map((l: any) => l.id);

    const { data: due } = await supabase
        .from('games')
        .select('room_id, game_id')
        .in('league_id', leagueIds)
        .eq('played', false)
        .not('scheduled_at', 'is', null)
        .lte('scheduled_at', cutoffIso)
        .order('scheduled_at', { ascending: true })
        .limit(DUE_QUERY_LIMIT);

    const tasks = (due ?? []).map(g => ({ roomId: g.room_id as string, gameId: g.game_id as string }));
    if (tasks.length >= DUE_QUERY_LIMIT) {
        console.warn(`[scheduler:sim] due 질의가 limit(${DUE_QUERY_LIMIT})에 도달 — 백로그 누적 의심`);
    }

    // 안전망: scheduled_at이 없는 미실행 경기는 이 질의에 절대 안 잡혀 영원히 자동 시뮬되지
    // 않으므로 눈에 띄게 경고 로그를 남긴다(정상 경로에선 finalize.ts가 항상 채움).
    const { count: orphanCount } = await supabase
        .from('games')
        .select('game_id', { count: 'exact', head: true })
        .in('league_id', leagueIds).eq('played', false).is('scheduled_at', null);
    if (orphanCount) {
        console.warn(`[scheduler:sim] scheduled_at 누락 미실행 경기 ${orphanCount}건 — 자동 시뮬 불가`);
    }

    if (tasks.length) {
        console.log(`[scheduler:sim] ${tasks.length} game(s) to simulate`);

        // 워커 풀이 동시성을 관리하므로 여기서는 전부 동시에 넘기기만 하면 된다 — 풀 크기만큼
        // 실제 병렬 처리되고, 나머지는 풀 내부 큐에서 대기한다. 메인 스레드는 이 await 동안
        // 블로킹되지 않으므로(워커에서 계산하는 동안 HTTP/WS 요청을 계속 처리 가능) 예전처럼
        // 경기 사이에 수동으로 양보(setImmediate)해줄 필요가 없다(2026-07-27 — worker thread 분리).
        const results = await Promise.allSettled(
            tasks.map(({ roomId, gameId }) => simWorkerPool.runSimulationInWorker(roomId, gameId)),
        );
        results.forEach((r, i) => {
            const { roomId, gameId } = tasks[i];
            if (r.status === 'rejected') {
                console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${r.reason}`);
            } else if (!r.value.ok && !r.value.skipped) {
                console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${r.value.error}`);
            }
        });
    }

    await advanceSimDates(leagueIds, now.slice(0, 10));
}

// [migration 2026-08-06] 방마다 스케줄 전체를 훑던 3중 루프를 집계 질의 2번으로 대체.
async function advanceSimDates(leagueIds: string[], today: string): Promise<void> {
    const nowIso = new Date().toISOString();

    // ① "이미 방송 시각이 지난 경기"가 있는 방(sim_date 전진 후보) — 그중 아직 미실행인 게
    // 하나라도 있으면 그 방은 전진 보류(기존 dueGames.every(played) 조건과 동일 의미).
    const { data: dueRows } = await supabase
        .from('games')
        .select('room_id, played')
        .in('league_id', leagueIds)
        .lte('scheduled_at', nowIso);

    const hasDue  = new Set<string>();
    const blocked = new Set<string>();
    for (const r of dueRows ?? []) {
        hasDue.add(r.room_id);
        if (!r.played) blocked.add(r.room_id);
    }

    // ② 방별 다음 미실행 경기 시각 (scheduled_at 오름차순 → 방마다 첫 row가 next)
    const { data: upcoming } = await supabase
        .from('games')
        .select('room_id, scheduled_at')
        .in('league_id', leagueIds)
        .eq('played', false)
        .order('scheduled_at', { ascending: true });

    const nextByRoom = new Map<string, string>();
    for (const r of upcoming ?? []) {
        if (r.scheduled_at && !nextByRoom.has(r.room_id)) nextByRoom.set(r.room_id, r.scheduled_at);
    }

    for (const roomId of hasDue) {
        if (blocked.has(roomId)) continue;
        const nextAt   = nextByRoom.get(roomId);
        const nextDate = nextAt ? kstDateFromMs(new Date(nextAt).getTime()) : today;
        // 값이 안 바뀌면 쓰지 않는다 — 매 tick마다 무조건 쓰면 그때마다 rooms Realtime UPDATE가
        // 전 접속자에게 불필요하게 브로드캐스트된다.
        await supabase.from('rooms').update({ sim_date: nextDate })
            .eq('id', roomId).neq('sim_date', nextDate);
    }
}

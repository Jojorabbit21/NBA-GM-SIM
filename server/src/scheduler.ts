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
import { runSimulation } from './simRunner';

const POLL_INTERVAL_MS = 30_000;

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
        cleanupCompletedRooms(),
    ]);
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

// game_seq → 현실 실행 시각 변환.
// 10분 단위로 반올림하면 경기 간격(intervalMinutes)이 10의 배수가 아닐 때(예: 15분) 슬롯마다
// 독립적으로 스냅되며 20분/10분이 번갈아 나오는 간격 불균일 버그가 생긴다 — 분 단위로만
// 반올림해 부동소수점 오차만 제거한다.
function gameSeqToRealMs(seq: number, simRealStartAt: string, gamesPerRealDay: number): number {
    const raw = new Date(simRealStartAt).getTime() + (seq / gamesPerRealDay) * 86_400_000;
    return Math.round(raw / 60_000) * 60_000;
}

// game.scheduledAt(SSOT, 생성 시점에 저장된 값)이 있으면 그대로 쓰고, 없는(레거시) 스케줄만
// game_seq로부터 재계산한다.
function resolveGameRealMs(game: any, league: LeagueRow | undefined): number | undefined {
    if (game.scheduledAt) return new Date(game.scheduledAt).getTime();
    const seq: number | undefined = game.game_seq;
    if (seq != null && league?.sim_real_start_at) {
        return gameSeqToRealMs(seq, league.sim_real_start_at, league.games_per_real_day ?? 5);
    }
    return undefined;
}

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

interface LeagueRow {
    id: string;
    sim_real_start_at: string | null;
    games_per_real_day: number;
}

interface RoomRow {
    id: string;
    league_id: string;
    schedule: any;
    sim_date: string;
}

async function runSimGames(now: string): Promise<void> {
    const cutoffMs = Date.now() + SIM_LEAD_MS;

    const { data: leagues } = await supabase
        .from('leagues')
        .select('id, sim_real_start_at, games_per_real_day')
        .eq('status', 'in_progress');

    if (!leagues?.length) return;

    const leagueMap = new Map<string, LeagueRow>(leagues.map((l: any) => [l.id, l]));
    const leagueIds = leagues.map((l: any) => l.id);

    const { data: rooms } = await supabase
        .from('rooms')
        .select('id, league_id, schedule, sim_date')
        .in('league_id', leagueIds);

    if (!rooms?.length) return;

    const tasks: { roomId: string; gameId: string }[] = [];

    for (const room of rooms as RoomRow[]) {
        const league = leagueMap.get(room.league_id);
        const schedule: any[] = room.schedule ?? [];

        for (const game of schedule) {
            if (game.played) continue;
            const realMs = resolveGameRealMs(game, league);
            if (realMs != null) {
                if (realMs <= cutoffMs) tasks.push({ roomId: room.id, gameId: game.id });
            } else {
                // 폴백: scheduledAt/game_seq 둘 다 없으면 당일 날짜 기준
                if (game.date === now.slice(0, 10)) tasks.push({ roomId: room.id, gameId: game.id });
            }
        }
    }

    if (!tasks.length) return;

    console.log(`[scheduler:sim] ${tasks.length} game(s) to simulate`);

    for (const { roomId, gameId } of tasks) {
        const result = await runSimulation(roomId, gameId);
        if (!result.ok && !result.skipped) {
            console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${result.error}`);
        }
    }

    await advanceSimDates(rooms as RoomRow[], leagueMap, now.slice(0, 10));
}

async function advanceSimDates(
    rooms:     RoomRow[],
    leagueMap: Map<string, LeagueRow>,
    today:     string,
): Promise<void> {
    const nowMs = Date.now();

    for (const room of rooms) {
        const league   = leagueMap.get(room.league_id);
        const schedule: any[] = room.schedule ?? [];

        let allCurrentPlayed: boolean;

        if (league?.sim_real_start_at) {
            const dueGames = schedule.filter((g: any) => {
                const realMs = resolveGameRealMs(g, league);
                return realMs != null && realMs <= nowMs;
            });
            allCurrentPlayed = dueGames.length > 0 && dueGames.every((g: any) => g.played);
        } else {
            const todayGames = schedule.filter((g: any) => g.date === today);
            allCurrentPlayed = todayGames.length > 0 && todayGames.every((g: any) => g.played);
        }

        if (allCurrentPlayed) {
            const upcoming = schedule
                .filter((g: any) => !g.played)
                .map((g: any) => {
                    const realMs = resolveGameRealMs(g, league);
                    if (realMs != null) return kstDateFromMs(realMs);
                    return g.date ?? '';
                })
                .filter(Boolean)
                .sort();
            const nextDate = upcoming[0] ?? today;
            await supabase.from('rooms').update({ sim_date: nextDate }).eq('id', room.id);
        }
    }
}

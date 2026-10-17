/**
 * fatigueRecovery.ts — 멀티플레이어 경기 간 체력 회복: 방 단위 DB 처리
 *
 * docs/plan/multiplayer-fatigue.md 3-3(가상 자정 회복) / 3-4(경기 직전 따라잡기, D7).
 * 순수 계산은 shared/multi/fatigueRecovery.ts, 선수 능력치 로딩은 playerLoader.ts.
 *
 * 호출 경로
 *   - scheduler(7단계): processRoomMidnights(roomId) — real_midnight_at이 지난 가상 날짜까지 방 전체 회복
 *   - simRunner(6단계): recoverPlayersThrough(roomId, game_date − 1, { playerIds }) — 이번 경기 양 팀 선수
 *     따라잡기. 타임라인이 없는 방(토너먼트·구 리그)은 이 경로가 유일한 회복 경로(D7)
 *
 * 동시성: 회복 결과는 apply_fatigue_recovery RPC로 "읽었을 때의 condition/condition_recovered_through가
 * 그대로일 때만" 반영한다. 그 사이 경기 종료 기록이 끼어들면 그 행은 건너뛰고(경기 결과 보존),
 * 다음 자정/따라잡기에서 새 값 기준으로 다시 계산된다.
 */
import { supabase } from './supabaseAdmin.ts';
import { loadRoomPlayers, type PlayerLoaderLeague } from './playerLoader.ts';
import { recoverThrough } from './shared/multi/fatigueRecovery.ts';
import { resolveMultiFatigueSettings } from './shared/types/simSettings.ts';

const CHUNK = 100;

interface RoomContext {
    leagueId: string | null;
    simSettings: any;
    league: PlayerLoaderLeague | null;
}

async function loadRoomContext(roomId: string): Promise<RoomContext> {
    const { data: room, error } = await supabase
        .from('rooms').select('league_id, sim_settings').eq('id', roomId).single();
    if (error || !room) throw new Error(`[fatigueRecovery] room ${roomId}: ${error?.message ?? 'not found'}`);
    let league: PlayerLoaderLeague | null = null;
    if (room.league_id) {
        const { data } = await supabase
            .from('leagues').select('use_custom_overrides, personal_draft_format').eq('id', room.league_id).maybeSingle();
        league = (data as PlayerLoaderLeague | null) ?? null;
    }
    return { leagueId: room.league_id ?? null, simSettings: room.sim_settings ?? null, league };
}

interface StateRow {
    player_id: string;
    condition: number | string | null;
    condition_recovered_through: string | null;
    last_game_date: string | null;
}

/** 회복이 필요한 행만: condition < 100 이고 아직 throughDate까지 반영 안 된 행 */
async function loadPendingRows(roomId: string, throughDate: string, playerIds?: string[]): Promise<StateRow[]> {
    const base = () => supabase
        .from('room_player_state')
        .select('player_id, condition, condition_recovered_through, last_game_date')
        .eq('room_id', roomId)
        .not('condition', 'is', null)
        .lt('condition', 100)
        .or(`condition_recovered_through.is.null,condition_recovered_through.lt.${throughDate}`);

    const out: StateRow[] = [];
    if (playerIds) {
        const ids = [...new Set(playerIds)];
        for (let i = 0; i < ids.length; i += CHUNK) {
            const { data, error } = await base().in('player_id', ids.slice(i, i + CHUNK));
            if (error) throw new Error(`[fatigueRecovery] room_player_state: ${error.message}`);
            out.push(...((data ?? []) as StateRow[]));
        }
    } else {
        const { data, error } = await base();
        if (error) throw new Error(`[fatigueRecovery] room_player_state: ${error.message}`);
        out.push(...((data ?? []) as StateRow[]));
    }
    return out;
}

export interface RecoveryResult {
    pending: number;   // 회복 대상으로 읽은 행
    updated: number;   // 실제 반영된 행 (동시 기록으로 건너뛴 행 제외)
}

/**
 * 선수들의 체력에 throughDate 자정까지의 회복을 반영한다.
 * playerIds를 주면 그 선수들만(경기 직전 따라잡기), 없으면 방 전체(자정 처리).
 */
export async function recoverPlayersThrough(
    roomId: string,
    throughDate: string,
    opts: { playerIds?: string[]; context?: RoomContext } = {},
): Promise<RecoveryResult> {
    const rows = await loadPendingRows(roomId, throughDate, opts.playerIds);
    if (rows.length === 0) return { pending: 0, updated: 0 };

    const ctx = opts.context ?? await loadRoomContext(roomId);
    const settings = resolveMultiFatigueSettings(ctx.simSettings);
    const players = await loadRoomPlayers(roomId, rows.map(r => r.player_id), ctx.league);

    const updates = rows.map(r => {
        const p = players.get(r.player_id);
        const expectedCondition = r.condition == null ? null : Number(r.condition);
        const next = recoverThrough(
            { condition: expectedCondition, recoveredThrough: r.condition_recovered_through, lastGameDate: r.last_game_date },
            throughDate, p?.stamina, p?.durability, settings,
        );
        return {
            player_id: r.player_id,
            condition: next.condition,
            recovered_through: next.recoveredThrough,
            expected_condition: expectedCondition,
            expected_recovered_through: r.condition_recovered_through,
        };
    });

    let updated = 0;
    for (let i = 0; i < updates.length; i += 500) {
        const { data, error } = await supabase.rpc('apply_fatigue_recovery', {
            p_room_id: roomId,
            p_rows: updates.slice(i, i + 500),
        });
        if (error) throw new Error(`[fatigueRecovery] apply_fatigue_recovery: ${error.message}`);
        updated += Number(data ?? 0);
    }
    return { pending: rows.length, updated };
}

/**
 * 스케줄러용: real_midnight_at이 지난 가장 최근 가상 날짜까지 방 전체 회복 후 rooms.fatigue_recovered_through 전진.
 * 타임라인(league_virtual_days)이 없는 방은 아무것도 하지 않는다 — 그런 방은 경기 직전 따라잡기만 쓴다(D7).
 */
export async function processRoomMidnights(roomId: string, now: Date = new Date()): Promise<{ throughDate: string | null } & RecoveryResult> {
    const { data: room, error: roomErr } = await supabase
        .from('rooms').select('fatigue_recovered_through').eq('id', roomId).single();
    if (roomErr || !room) throw new Error(`[fatigueRecovery] room ${roomId}: ${roomErr?.message ?? 'not found'}`);

    const { data: day, error: dayErr } = await supabase
        .from('league_virtual_days')
        .select('virtual_date')
        .eq('room_id', roomId)
        .lte('real_midnight_at', now.toISOString())
        .order('real_midnight_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (dayErr) throw new Error(`[fatigueRecovery] league_virtual_days: ${dayErr.message}`);
    const throughDate = (day as any)?.virtual_date as string | undefined;
    if (!throughDate) return { throughDate: null, pending: 0, updated: 0 };

    const done = (room as any).fatigue_recovered_through as string | null;
    if (done != null && done >= throughDate) return { throughDate: done, pending: 0, updated: 0 };

    const result = await recoverPlayersThrough(roomId, throughDate);

    // 행 갱신이 끝난 뒤에만 방 진행 지점을 전진 — 중간 실패 시 다음 tick이 같은 날짜를 다시 처리
    // (행 단위 condition_recovered_through 가드가 이중 적용을 막는다). 뒤로 돌리지 않도록 조건부.
    let q = supabase.from('rooms').update({ fatigue_recovered_through: throughDate }).eq('id', roomId);
    q = done == null ? q.is('fatigue_recovered_through', null) : q.eq('fatigue_recovered_through', done);
    const { error: upErr } = await q;
    if (upErr) throw new Error(`[fatigueRecovery] rooms.fatigue_recovered_through: ${upErr.message}`);

    return { throughDate, ...result };
}

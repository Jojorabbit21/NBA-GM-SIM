/**
 * finalize.ts — 드래프트 완료 후 시즌 초기화.
 *
 * draft-scheduler EF 섹션4를 Bun 서버로 이식.
 * leagues.status: 'drafting' → 'in_progress' 원자적 claim으로 중복 처리 방지.
 * 호출자: DraftRoom.onCompleted() (dynamic import)
 */
import { supabase } from './supabaseAdmin';
import { generateSeasonSchedule } from './shared/scheduleGenerator';
import { initializeTournamentBracket } from './shared/tournamentInitializer';
import { TEAM_DATA } from './shared/teamData';

function injectGameSeq(schedule: any[]): void {
    const uniqueDates = [...new Set(schedule.map((g: any) => g.date as string))].sort();
    const dateToSeq = new Map<string, number>(uniqueDates.map((d, i) => [d, i]));
    for (const game of schedule) {
        game.game_seq = dateToSeq.get(game.date) ?? 0;
    }
}

/**
 * claim 없이 강제로 브라켓/스케줄 생성.
 * 이미 in_progress이지만 schedule이 null인 리그 복구용.
 */
export async function forceInitSchedule(roomId: string): Promise<{ ok: boolean; error?: string }> {
    const { data: room } = await supabase
        .from('rooms')
        .select('id, league_id, draft_cursor, schedule')
        .eq('id', roomId)
        .single();

    if (!room) return { ok: false, error: 'room not found' };
    if (room.schedule) return { ok: false, error: 'schedule already exists' };

    const { data: league } = await supabase
        .from('leagues')
        .select('id, type, season_start_date, season_end_date, tournament_start_at, tournament_format, match_format, finals_match_format')
        .eq('id', room.league_id)
        .single();

    if (!league) return { ok: false, error: 'league not found' };

    const { data: leagueTeams } = await supabase
        .from('league_teams')
        .select('team_slug, roster')
        .eq('room_id', roomId);

    if (!leagueTeams?.length) return { ok: false, error: 'no league teams' };

    const rosterState: Record<string, { condition: number }> = {};
    for (const team of leagueTeams) {
        for (const playerId of (team.roster ?? [])) {
            rosterState[playerId] = { condition: 100 };
        }
    }

    const nowDate         = new Date();
    const tournamentStart = league.type === 'tournament' ? (league.tournament_start_at ?? null) : null;
    const seasonStartDate = tournamentStart ? tournamentStart.slice(0, 10) : nowDate.toISOString().slice(0, 10);
    // 10분 단위 정각으로 맞춰 이후 game_seq 계산 결과도 깔끔한 시각이 되도록 함
    const simRealStartAt  = new Date(Math.round(nowDate.getTime() / 600_000) * 600_000).toISOString();

    let schedule: any[];
    let bracketData: { series: any[]; schedule: any[] } | null = null;

    if (league.type === 'tournament') {
        const result = initializeTournamentBracket(
            leagueTeams as any,
            league.tournament_format ?? null,
            league.match_format ?? null,
            league.finals_match_format ?? null,
            `${room.league_id}-${seasonStartDate}`,
            seasonStartDate,
        );
        schedule    = result.schedule;
        bracketData = result;
    } else {
        const teamSlugs = new Set(leagueTeams.map((t: any) => t.team_slug));
        const filteredTeamData = Object.fromEntries(
            Object.entries(TEAM_DATA).filter(([slug]) => teamSlugs.has(slug)),
        );
        const seasonYear = parseInt(seasonStartDate.slice(0, 4), 10);
        const computedEnd = league.season_end_date ?? (() => {
            const d = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 14);
            return d.toISOString().slice(0, 10);
        })();
        schedule = generateSeasonSchedule(
            { seasonYear, seasonStart: seasonStartDate, regularSeasonEnd: computedEnd,
              allStarStart: `${seasonYear + 1}-02-13`, allStarEnd: `${seasonYear + 1}-02-18` },
            filteredTeamData as any,
        );
        injectGameSeq(schedule);
    }

    if (bracketData) {
        const { error } = await supabase.from('leagues').update({ bracket_data: bracketData, sim_real_start_at: simRealStartAt }).eq('id', room.league_id);
        if (error) return { ok: false, error: `bracket save: ${error.message}` };
    } else {
        await supabase.from('leagues').update({ sim_real_start_at: simRealStartAt }).eq('id', room.league_id);
    }

    const { error: saveErr } = await supabase.from('rooms').update({
        roster_state: rosterState,
        schedule,
        sim_date: seasonStartDate,
        draft_cursor: { ...(room.draft_cursor as any ?? {}), status: 'finalized', finalizedAt: simRealStartAt },
    }).eq('id', roomId);

    if (saveErr) return { ok: false, error: `rooms save: ${saveErr.message}` };

    console.log(`[finalize:force] ${roomId} — done, ${schedule.length} games, bracket=${!!bracketData}`);
    return { ok: true };
}

export async function finalizeDraft(roomId: string): Promise<void> {
    console.log(`[finalize] ${roomId} — start`);

    // ── 방 정보 조회 ──────────────────────────────────────────────────────────
    const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('id, league_id, draft_config, draft_cursor')
        .eq('id', roomId)
        .single();

    if (roomErr || !room) {
        console.error(`[finalize] room not found: ${roomId}`, roomErr?.message);
        return;
    }

    const cursor = (room.draft_cursor ?? {}) as any;
    if (cursor.status === 'finalized') {
        console.log(`[finalize] ${roomId} already finalized — skip`);
        return;
    }

    // ── 원자적 claim: drafting → in_progress ────────────────────────────────
    const { count: claimCount } = await supabase
        .from('leagues')
        .update({ status: 'in_progress' })
        .eq('id', room.league_id)
        .eq('status', 'drafting')
        .select('id', { count: 'exact', head: true });

    if (!claimCount) {
        console.log(`[finalize] ${roomId} — claim failed (already processed)`);
        return;
    }

    // ── 리그 정보 조회 ─────────────────────────────────────────────────────────
    const { data: league } = await supabase
        .from('leagues')
        .select('id, type, season_start_date, season_end_date, tournament_start_at, tournament_format, match_format, finals_match_format')
        .eq('id', room.league_id)
        .single();

    if (!league) {
        console.error(`[finalize] league not found: ${room.league_id}`);
        return;
    }

    // ── 리그 팀 / 로스터 조회 ─────────────────────────────────────────────────
    const { data: leagueTeams } = await supabase
        .from('league_teams')
        .select('team_slug, roster')
        .eq('room_id', roomId);

    if (!leagueTeams?.length) {
        console.error(`[finalize] no league teams for room ${roomId}`);
        return;
    }

    // 로스터 상태
    const rosterState: Record<string, { condition: number }> = {};
    for (const team of leagueTeams) {
        for (const playerId of (team.roster ?? [])) {
            rosterState[playerId] = { condition: 100 };
        }
    }

    // ── 날짜 계산 ────────────────────────────────────────────────────────────
    const nowDate        = new Date();
    const today          = nowDate.toISOString().slice(0, 10);
    // 10분 단위 정각으로 맞춰 이후 game_seq 계산 결과도 깔끔한 시각이 되도록 함
    const simRealStartAt = new Date(Math.round(nowDate.getTime() / 600_000) * 600_000).toISOString();

    const tournamentStart = league.type === 'tournament' ? (league.tournament_start_at ?? null) : null;
    const seasonStartDate = tournamentStart ? tournamentStart.slice(0, 10) : today;

    const adminDurDays = (() => {
        if (league.season_start_date && league.season_end_date) {
            return Math.max(7, Math.round(
                (new Date(league.season_end_date).getTime() - new Date(league.season_start_date).getTime()) / 86_400_000,
            ));
        }
        return 14;
    })();
    const endD = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + adminDurDays);
    const computedSeasonEndDate = endD.toISOString().slice(0, 10);

    // ── 일정 / 브라켓 생성 ──────────────────────────────────────────────────
    let schedule: any[];
    let bracketData: { series: any[]; schedule: any[] } | null = null;

    if (league.type === 'tournament') {
        const tendencySeed = `${room.league_id}-${seasonStartDate}`;
        const result = initializeTournamentBracket(
            leagueTeams as any,
            league.tournament_format ?? null,
            league.match_format ?? null,
            league.finals_match_format ?? null,
            tendencySeed,
            seasonStartDate,
        );
        schedule    = result.schedule;
        bracketData = result;
    } else {
        const teamSlugs = new Set(leagueTeams.map((t: any) => t.team_slug));
        const filteredTeamData = Object.fromEntries(
            Object.entries(TEAM_DATA).filter(([slug]) => teamSlugs.has(slug)),
        );
        const seasonYear = parseInt(seasonStartDate.slice(0, 4), 10);
        schedule = generateSeasonSchedule(
            {
                seasonYear,
                seasonStart:      seasonStartDate,
                regularSeasonEnd: computedSeasonEndDate,
                allStarStart:     `${seasonYear + 1}-02-13`,
                allStarEnd:       `${seasonYear + 1}-02-18`,
            },
            filteredTeamData as any,
        );
        injectGameSeq(schedule);
    }

    // ── 브라켓/리그 저장 ──────────────────────────────────────────────────────
    if (bracketData) {
        const { error: bracketErr } = await supabase
            .from('leagues')
            .update({ bracket_data: bracketData, sim_real_start_at: simRealStartAt })
            .eq('id', room.league_id);
        if (bracketErr) {
            console.error(`[finalize] bracket save error: ${bracketErr.message}`);
            return;
        }
    } else {
        await supabase.from('leagues').update({ sim_real_start_at: simRealStartAt }).eq('id', room.league_id);
    }

    // ── rooms 저장 ────────────────────────────────────────────────────────────
    const { error: saveErr } = await supabase
        .from('rooms')
        .update({
            roster_state: rosterState,
            schedule,
            sim_date:     seasonStartDate,
            draft_cursor: { status: 'finalized', finalizedAt: simRealStartAt },
        })
        .eq('id', roomId);

    if (saveErr) {
        console.error(`[finalize] rooms save error: ${saveErr.message}`);
    } else {
        console.log(`[finalize] ${roomId} — done (league=${room.league_id})`);
    }
}

/**
 * simRunner.ts — 단일 경기 PBP 시뮬레이션 (simulate-game EF → Fly 이식)
 *
 * export async function runSimulation(roomId, gameId): Promise<SimResult>
 */
import { supabase } from './supabaseAdmin.ts';
import { runFullGameSimulation } from './shared/engine/pbp/main.ts';
import { buildTeamForSim, mapRawPlayerToRuntimePlayer } from './shared/dataMapper.ts';
import { resolveNormalizationContext } from './shared/engine/pbp/leagueNormalization.ts';
import { calculatePlayerOvr } from './shared/utils/constants.ts';
import {
    advanceTournamentState,
    type PlayoffSeries as BPLSeries,
    type TournamentGame,
} from './shared/tournamentBracket.ts';
import { archiveTournament } from './shared/tournamentArchiver.ts';

export interface SimResult {
    ok: boolean;
    homeScore?: number;
    awayScore?: number;
    skipped?: boolean;
    reason?: string;
    simDurationMs?: number;
    error?: string;
}

// ── 공개 진입점 ───────────────────────────────────────────────────────────────

export async function runSimulation(roomId: string, gameId: string): Promise<SimResult> {
    const t0 = Date.now();
    console.log(`[simRunner] room=${roomId} game=${gameId}`);

    try {
        // ── 1. 방 데이터 로드 ──────────────────────────────────────────────
        const { data: room } = await supabase
            .from('rooms')
            .select('schedule, roster_state, tendency_seed, sim_settings, coaching_staff, league_id')
            .eq('id', roomId)
            .single();
        if (!room) return { ok: false, error: 'Room not found' };

        // custom_overrides 적용 여부 + 시간 압축 파라미터
        const { data: leagueData } = await supabase
            .from('leagues')
            .select('draft_pool, sim_real_start_at, games_per_real_day')
            .eq('id', room.league_id)
            .maybeSingle();
        const draftPools = (leagueData?.draft_pool ?? 'standard')
            .split(',').map((s: string) => s.trim());
        const useCustomOverrides = draftPools.includes('alltime');

        const schedule: any[] = room.schedule ?? [];
        const game = schedule.find((g: any) => g.id === gameId);
        if (!game) return { ok: false, error: 'Game not found in schedule' };
        if (game.played) return { ok: true, skipped: true, reason: 'already played' };

        const { homeTeamId, awayTeamId } = game;

        // ── 2. 리그 팀 + 선수 데이터 로드 ─────────────────────────────────
        const { data: leagueTeams } = await supabase
            .from('league_teams')
            .select('id, team_slug, team_name, roster')
            .eq('room_id', roomId)
            .in('team_slug', [homeTeamId, awayTeamId]);

        const homeTeamRow = leagueTeams?.find((t: any) => t.team_slug === homeTeamId);
        const awayTeamRow = leagueTeams?.find((t: any) => t.team_slug === awayTeamId);
        if (!homeTeamRow || !awayTeamRow) return { ok: false, error: 'Team data missing' };

        const allPlayerIds = [
            ...(homeTeamRow.roster ?? []),
            ...(awayTeamRow.roster ?? []),
        ];

        const { data: rawPlayers } = await supabase
            .from('meta_players')
            .select('id, name, position, base_attributes, tendencies')
            .in('id', allPlayerIds);

        const playerMap = new Map<string, any>();
        for (const raw of rawPlayers ?? []) {
            playerMap.set(String(raw.id), mapRawPlayerToRuntimePlayer(raw, useCustomOverrides));
        }

        const rosterState: Record<string, any> = (room.roster_state as any) ?? {};

        const homeTeam = buildTeamForSim(homeTeamRow, playerMap, rosterState);
        const awayTeam = buildTeamForSim(awayTeamRow, playerMap, rosterState);

        // ── 3. 전술/뎁스차트 로드 ─────────────────────────────────────────
        const { data: members } = await supabase
            .from('room_members')
            .select('team_id, tactics, depth_chart')
            .eq('room_id', roomId)
            .in('team_id', [homeTeamId, awayTeamId]);

        const homeMember  = members?.find((m: any) => m.team_id === homeTeamId);
        const awayMember  = members?.find((m: any) => m.team_id === awayTeamId);
        const homeTactics = (homeMember?.tactics    ?? null) as any;
        const awayTactics = (awayMember?.tactics    ?? null) as any;
        const homeDepth   = (homeMember?.depth_chart ?? null) as any;
        const awayDepth   = (awayMember?.depth_chart ?? null) as any;

        const coachingData = (room.coaching_staff ?? null) as any;
        const simSettings  = (room.sim_settings   ?? null) as any;
        const tendencySeed = room.tendency_seed   ?? '';

        // ── 3.5 League-relative normalization context ──────────────────────
        resolveNormalizationContext(simSettings, [homeTeam, awayTeam], calculatePlayerOvr);

        // ── 4. PBP 엔진 실행 ───────────────────────────────────────────────
        const { data: existingPbp } = await supabase
            .from('game_pbp')
            .select('game_start_time')
            .eq('room_id', roomId)
            .eq('game_id', gameId)
            .maybeSingle();
        const gameStartTime = (() => {
            const simStart = leagueData?.sim_real_start_at;
            const gprd     = leagueData?.games_per_real_day ?? 5;
            const seq: number | undefined = game.game_seq;
            if (simStart != null && seq != null) {
                const raw = new Date(simStart).getTime() + (seq / gprd) * 86_400_000;
                return new Date(Math.round(raw / 600_000) * 600_000).toISOString();
            }
            return existingPbp?.game_start_time ?? new Date().toISOString();
        })();

        const result = runFullGameSimulation(
            homeTeam,
            awayTeam,
            null,
            homeTactics,
            false,
            false,
            homeDepth,
            awayDepth,
            tendencySeed + ':' + gameId,
            simSettings,
            coachingData,
        );

        const simDurationMs = Date.now() - t0;
        const homeScore = result.homeScore ?? 0;
        const awayScore = result.awayScore ?? 0;

        console.log(`[simRunner] ${homeTeamId} ${homeScore} - ${awayScore} ${awayTeamId} (${simDurationMs}ms)`);

        // ── 5. game_pbp 저장 ───────────────────────────────────────────────
        await supabase.from('game_pbp').upsert({
            room_id:         roomId,
            game_id:         gameId,
            events:          result.pbpLogs ?? [],
            shot_events:     result.pbpShotEvents ?? [],
            home_box:        result.homeBox ?? [],
            away_box:        result.awayBox ?? [],
            home_score:      homeScore,
            away_score:      awayScore,
            home_team_id:    homeTeamId,
            away_team_id:    awayTeamId,
            game_start_time: gameStartTime,
            sim_duration_ms: simDurationMs,
            box_timeline:    result.boxTimeline ?? [],
        }, { onConflict: 'room_id,game_id' });

        // ── 6. rooms.schedule 업데이트 ─────────────────────────────────────
        const updatedSchedule = schedule.map((g: any) =>
            g.id === gameId ? { ...g, played: true, homeScore, awayScore } : g,
        );

        // ── 7. 토너먼트 처리 ───────────────────────────────────────────────
        if (game.seriesId) {
            await handleTournamentAdvance(
                roomId, (room as any).league_id ?? '', gameId, game.seriesId,
                homeTeamId, awayTeamId, homeScore, awayScore,
                updatedSchedule,
            );
        } else {
            await supabase.from('rooms').update({ schedule: updatedSchedule }).eq('id', roomId);
        }

        return { ok: true, homeScore, awayScore, simDurationMs };

    } catch (err) {
        console.error('[simRunner] error:', err);
        return { ok: false, error: String(err) };
    }
}

// ── 토너먼트 상태 전진 ────────────────────────────────────────────────────────

async function handleTournamentAdvance(
    roomId:          string,
    leagueId:        string,
    gameId:          string,
    seriesId:        string,
    homeTeamId:      string,
    awayTeamId:      string,
    homeScore:       number,
    awayScore:       number,
    updatedSchedule: any[],
) {
    const { data: leagueRow } = await supabase
        .from('leagues')
        .select('id, bracket_data, season_start_date, match_format, tournament_format, tournament_start_at')
        .eq('id', leagueId)
        .maybeSingle();

    if (!leagueRow?.bracket_data) {
        await supabase.from('rooms').update({ schedule: updatedSchedule }).eq('id', roomId);
        return;
    }

    const bracketData = leagueRow.bracket_data as { series: BPLSeries[]; schedule: TournamentGame[] };
    const series: BPLSeries[]           = bracketData.series   ?? [];
    const bracketSchedule: TournamentGame[] = bracketData.schedule ?? [];
    const tournStartAt = leagueRow.tournament_start_at as string | null;
    const startDate    = tournStartAt ? tournStartAt.slice(0, 10) : (leagueRow.season_start_date ?? '2025-10-21');

    const seriesObj = series.find(s => s.id === seriesId);
    if (!seriesObj || seriesObj.finished) {
        await supabase.from('rooms').update({ schedule: updatedSchedule }).eq('id', roomId);
        return;
    }

    // 승패 집계
    const homeWon = homeScore > awayScore;
    if (homeWon) {
        if (homeTeamId === seriesObj.higherSeedId) seriesObj.higherSeedWins++;
        else                                        seriesObj.lowerSeedWins++;
    } else {
        if (awayTeamId === seriesObj.higherSeedId) seriesObj.higherSeedWins++;
        else                                        seriesObj.lowerSeedWins++;
    }

    const bracketGame = bracketSchedule.find(g => g.id === gameId);
    if (bracketGame) {
        (bracketGame as any).played    = true;
        (bracketGame as any).homeScore = homeScore;
        (bracketGame as any).awayScore = awayScore;
    }

    if (seriesObj.higherSeedWins >= seriesObj.targetWins) {
        seriesObj.finished = true;
        seriesObj.winnerId = seriesObj.higherSeedId;
    } else if (seriesObj.lowerSeedWins >= seriesObj.targetWins) {
        seriesObj.finished = true;
        seriesObj.winnerId = seriesObj.lowerSeedId;
    }

    if (seriesObj.finished) {
        advanceTournamentState(series, bracketSchedule, seriesObj.targetWins, startDate);

        const existingIds = new Set(updatedSchedule.map((g: any) => g.id));
        for (const g of bracketSchedule) {
            if (!existingIds.has(g.id)) updatedSchedule.push(g as any);
        }
    }

    await Promise.all([
        supabase.from('rooms').update({ schedule: updatedSchedule }).eq('id', roomId),
        supabase.from('leagues')
            .update({ bracket_data: { series, schedule: bracketSchedule } })
            .eq('id', leagueRow.id),
    ]);

    const realSeries = series.filter(s => s.lowerSeedId !== 'BYE');
    const allDone    = realSeries.length > 0 && realSeries.every(s => s.finished);
    if (allDone) {
        console.log(`[simRunner] tournament complete — archiving league=${leagueId}`);
        const { error: archiveErr } = await archiveTournament(supabase, leagueId, roomId);
        if (archiveErr) console.error('[simRunner] archive error:', archiveErr);
        await supabase.from('leagues').update({ status: 'finished' }).eq('id', leagueId);
    }
}

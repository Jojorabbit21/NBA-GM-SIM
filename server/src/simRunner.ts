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
    targetWinsFromFormat,
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

export async function runSimulation(roomId: string, gameId: string, forceStartNow = false): Promise<SimResult> {
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
            // 관리자가 수동으로 시뮬 실행 시 — 원래 예정 시각과 무관하게 지금 바로 "방송 시작"
            if (forceStartNow) return new Date().toISOString();
            const simStart = leagueData?.sim_real_start_at;
            const gprd     = leagueData?.games_per_real_day ?? 5;
            const seq: number | undefined = game.game_seq;
            if (simStart != null && seq != null) {
                const raw = new Date(simStart).getTime() + (seq / gprd) * 86_400_000;
                return new Date(Math.round(raw / 600_000) * 600_000).toISOString();
            }
            return existingPbp?.game_start_time ?? new Date().toISOString();
        })();

        // userTeamId를 homeTeamId로 고정해 hTactics/aTactics 해석 로직의 "앵커" 역할만 하도록
        // 하고, awayTactics는 awayUserTactics로 별도 전달한다 — 이렇게 하면 홈/원정 어느 쪽이든
        // 저장된 전술(tactics)이 있으면 그 팀 것을 쓰고, 없으면 (null/undefined) 자동으로
        // generateAutoTactics() 폴백이 걸리는 두 경우 모두 올바르게 처리된다. 기존에는
        // userTeamId를 null로 하드코딩해 모든 팀이 무조건 자동 생성 전술로 덮어써졌었다.
        const result = runFullGameSimulation(
            homeTeam,
            awayTeam,
            homeTeamId,
            homeTactics ?? undefined,
            false,
            false,
            homeDepth,
            awayDepth,
            tendencySeed + ':' + gameId,
            simSettings,
            coachingData,
            awayTactics ?? undefined,
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
        // forceStartNow면 scheduledAt도 game_start_time과 맞춰줘야 일정/브라켓 화면이
        // 같은 시각 기준으로 LIVE 상태를 판정한다 (game_pbp.game_start_time만 바뀌고
        // schedule의 scheduledAt은 그대로면 화면엔 계속 "예정"으로 보이는 불일치 발생).
        const updatedSchedule = schedule.map((g: any) =>
            g.id === gameId
                ? { ...g, played: true, homeScore, awayScore, ...(forceStartNow ? { scheduledAt: gameStartTime } : {}) }
                : g,
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
        .select('id, bracket_data, season_start_date, match_format, finals_match_format, tournament_format, tournament_start_at, games_per_real_day')
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
    const intervalMinutes = 1440 / (leagueRow.games_per_real_day ?? 48);
    const finalsTargetWins = targetWinsFromFormat(
        (leagueRow as any).finals_match_format ?? leagueRow.match_format,
    );

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
        // 시리즈가 조기 확정되면(예: Bo3에서 2-0) 아직 실행되지 않은 잔여 예정 경기는
        // 무의미하므로 제거한다 — 해당 슬롯은 경기 없이 그냥 지나가는 휴식 기간이 된다.
        const prunedIds = new Set(
            bracketSchedule.filter(g => g.seriesId === seriesId && !g.played).map(g => g.id),
        );
        if (prunedIds.size > 0) {
            for (let i = bracketSchedule.length - 1; i >= 0; i--) {
                if (prunedIds.has(bracketSchedule[i].id)) bracketSchedule.splice(i, 1);
            }
            for (let i = updatedSchedule.length - 1; i >= 0; i--) {
                if (prunedIds.has(updatedSchedule[i].id)) updatedSchedule.splice(i, 1);
            }
        }

        advanceTournamentState(series, bracketSchedule, seriesObj.targetWins, finalsTargetWins, startDate, intervalMinutes);

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

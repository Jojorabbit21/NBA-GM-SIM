
/**
 * tournamentArchiver.ts — Writes a completed tournament's data into archive tables.
 * Called once from simulate-game when all series are finished.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { PlayoffSeries, TournamentGame } from './tournamentBracket.ts';

type SupabaseClient = ReturnType<typeof createClient>;

interface LeagueTeamRow {
    team_slug:     string;
    team_name:     string;
    team_abbr:     string | null;
    color_primary: string | null;
    user_id:       string | null;
}

interface PbpRow {
    game_id:      string;
    home_team_id: string;
    away_team_id: string;
    home_score:   number;
    away_score:   number;
    home_box:     any[] | null;
    away_box:     any[] | null;
}

// ── 진출 라운드별 순위 계산 ────────────────────────────────────────────────────

function computePlacements(
    series:   PlayoffSeries[],
    maxRound: number,
): Map<string, { placement: number; finalRound: number; seriesWins: number; seriesLosses: number }> {
    const result = new Map<string, { placement: number; finalRound: number; seriesWins: number; seriesLosses: number }>();

    // series wins/losses per team
    const winsMap  = new Map<string, number>();
    const lossMap  = new Map<string, number>();
    for (const s of series) {
        if (!s.finished || s.lowerSeedId === 'BYE') continue;
        const winner = s.winnerId!;
        const loser  = winner === s.higherSeedId ? s.lowerSeedId : s.higherSeedId;
        winsMap.set(winner, (winsMap.get(winner) ?? 0) + 1);
        lossMap.set(loser,  (lossMap.get(loser) ?? 0) + 1);
    }

    // Find which round each team was eliminated or won the final
    const eliminatedInRound = new Map<string, number>();
    for (const s of series) {
        if (!s.finished || s.lowerSeedId === 'BYE') continue;
        const loser = s.winnerId === s.higherSeedId ? s.lowerSeedId : s.higherSeedId;
        eliminatedInRound.set(loser, s.round);
        if (s.round === maxRound) {
            eliminatedInRound.set(s.winnerId!, maxRound); // champion also has a finalRound
        }
    }

    // Placement: champion=1, runner-up=2, lost in maxRound-1 → 3, maxRound-2 → 5, etc.
    // Teams lost in round R from the top: placement = 2^(maxRound-R) + 1 (tied group)
    const finalSeries = series.find(s => s.round === maxRound && s.finished);
    const championSlug  = finalSeries?.winnerId ?? null;
    const runnerUpSlug  = finalSeries
        ? (finalSeries.winnerId === finalSeries.higherSeedId
            ? finalSeries.lowerSeedId
            : finalSeries.higherSeedId)
        : null;

    for (const [slug, round] of eliminatedInRound) {
        let placement: number;
        if (slug === championSlug)  placement = 1;
        else if (slug === runnerUpSlug) placement = 2;
        else placement = Math.pow(2, maxRound - round) + 1;

        result.set(slug, {
            placement,
            finalRound:   round,
            seriesWins:   winsMap.get(slug)  ?? 0,
            seriesLosses: lossMap.get(slug)  ?? 0,
        });
    }

    return result;
}

// ── 메인 API ──────────────────────────────────────────────────────────────────

export async function archiveTournament(
    supabase:  SupabaseClient,
    leagueId:  string,
    roomId:    string,
): Promise<{ error: string | null }> {
    // 1. League + bracket
    const { data: league, error: leagueErr } = await supabase
        .from('leagues')
        .select('id, name, tournament_format, match_format, bracket_data, season_start_date')
        .eq('id', leagueId)
        .single();
    if (leagueErr || !league?.bracket_data) return { error: leagueErr?.message ?? 'No bracket data' };

    const bracketData    = league.bracket_data as { series: PlayoffSeries[]; schedule: TournamentGame[] };
    const series         = bracketData.series ?? [];
    const bracketSchedule = bracketData.schedule ?? [];

    // 2. League teams
    const { data: leagueTeams, error: teamsErr } = await supabase
        .from('league_teams')
        .select('team_slug, team_name, team_abbr, color_primary, user_id')
        .eq('room_id', roomId);
    if (teamsErr) return { error: teamsErr.message };

    // 3. All game_pbp for this room
    const { data: pbpRows, error: pbpErr } = await supabase
        .from('game_pbp')
        .select('game_id, home_team_id, away_team_id, home_score, away_score, home_box, away_box')
        .eq('room_id', roomId);
    if (pbpErr) return { error: pbpErr.message };

    // 4. Next edition
    const { data: editionRow } = await supabase
        .from('tournament_archives')
        .select('edition')
        .eq('league_id', leagueId)
        .order('edition', { ascending: false })
        .limit(1)
        .maybeSingle();
    const edition = (editionRow?.edition ?? 0) + 1;

    // 5. Champion / runner-up
    const maxRound     = series.reduce((mx, s) => Math.max(mx, s.round), 0);
    const finalSeries  = series.find(s => s.round === maxRound && s.finished);
    const championSlug = finalSeries?.winnerId ?? null;
    const runnerUpSlug = finalSeries
        ? (finalSeries.winnerId === finalSeries.higherSeedId
            ? finalSeries.lowerSeedId
            : finalSeries.higherSeedId)
        : null;
    const teams        = (leagueTeams ?? []) as LeagueTeamRow[];
    const champion     = teams.find(t => t.team_slug === championSlug);
    const runnerUp     = teams.find(t => t.team_slug === runnerUpSlug);

    // 6. Insert tournament_archives
    const { data: archive, error: archiveErr } = await supabase
        .from('tournament_archives')
        .insert({
            league_id:         leagueId,
            room_id:           roomId,
            edition,
            name:              league.name ?? 'Tournament',
            tournament_format: league.tournament_format ?? 'single_elimination',
            match_format:      league.match_format      ?? 'single_game',
            team_count:        teams.length,
            started_at:        league.season_start_date
                ? new Date(league.season_start_date).toISOString()
                : null,
            completed_at:      new Date().toISOString(),
            champion_slug:     champion?.team_slug  ?? null,
            champion_name:     champion?.team_name  ?? null,
            runner_up_slug:    runnerUp?.team_slug  ?? null,
            runner_up_name:    runnerUp?.team_name  ?? null,
            bracket_snapshot:  league.bracket_data,
        })
        .select('id')
        .single();
    if (archiveErr) return { error: archiveErr.message };

    const archiveId = archive.id;

    // 7. Team records
    const placements   = computePlacements(series, maxRound);
    const pbpList      = (pbpRows ?? []) as PbpRow[];

    // Compute game wins/losses and pts from pbp
    const gameWins   = new Map<string, number>();
    const gameLosses = new Map<string, number>();
    const ptsFor     = new Map<string, number>();
    const ptsAgainst = new Map<string, number>();

    for (const pbp of pbpList) {
        const homeWon = pbp.home_score > pbp.away_score;
        const homeSlug = pbp.home_team_id;
        const awaySlug = pbp.away_team_id;

        gameWins.set(homeSlug,   (gameWins.get(homeSlug)   ?? 0) + (homeWon ? 1 : 0));
        gameLosses.set(homeSlug, (gameLosses.get(homeSlug) ?? 0) + (homeWon ? 0 : 1));
        gameWins.set(awaySlug,   (gameWins.get(awaySlug)   ?? 0) + (homeWon ? 0 : 1));
        gameLosses.set(awaySlug, (gameLosses.get(awaySlug) ?? 0) + (homeWon ? 1 : 0));

        ptsFor.set(homeSlug,     (ptsFor.get(homeSlug)     ?? 0) + pbp.home_score);
        ptsAgainst.set(homeSlug, (ptsAgainst.get(homeSlug) ?? 0) + pbp.away_score);
        ptsFor.set(awaySlug,     (ptsFor.get(awaySlug)     ?? 0) + pbp.away_score);
        ptsAgainst.set(awaySlug, (ptsAgainst.get(awaySlug) ?? 0) + pbp.home_score);
    }

    const teamRecordRows = teams.map(t => {
        const p = placements.get(t.team_slug);
        return {
            archive_id:    archiveId,
            team_slug:     t.team_slug,
            team_name:     t.team_name,
            team_abbr:     t.team_abbr ?? null,
            color_primary: t.color_primary ?? null,
            user_id:       t.user_id ?? null,
            is_ai:         !t.user_id,
            placement:     p?.placement  ?? 99,
            final_round:   p?.finalRound ?? 0,
            series_wins:   p?.seriesWins  ?? 0,
            series_losses: p?.seriesLosses ?? 0,
            game_wins:     gameWins.get(t.team_slug)   ?? 0,
            game_losses:   gameLosses.get(t.team_slug) ?? 0,
            pts_for:       ptsFor.get(t.team_slug)     ?? 0,
            pts_against:   ptsAgainst.get(t.team_slug) ?? 0,
        };
    });

    if (teamRecordRows.length > 0) {
        const { error: trErr } = await supabase.from('tournament_team_records').insert(teamRecordRows);
        if (trErr) return { error: trErr.message };
    }

    // 8. Build lookup maps from bracket schedule
    const schedMap  = new Map<string, TournamentGame>();
    const seriesMap = new Map<string, PlayoffSeries>();
    for (const g of bracketSchedule) schedMap.set(g.id, g);
    for (const s of series)          seriesMap.set(s.id, s);

    // 9. Game log
    const gameLogRows = pbpList.map(pbp => {
        const sg      = schedMap.get(pbp.game_id);
        const s       = sg?.seriesId ? seriesMap.get(sg.seriesId) : null;
        const gameNum = sg?.id.match(/_G(\d+)$/)?.[1];
        return {
            archive_id: archiveId,
            game_id:    pbp.game_id,
            series_id:  sg?.seriesId ?? null,
            round:      s?.round ?? null,
            game_num:   gameNum ? parseInt(gameNum, 10) : null,
            home_slug:  pbp.home_team_id,
            away_slug:  pbp.away_team_id,
            home_score: pbp.home_score,
            away_score: pbp.away_score,
            played_at:  sg?.date ?? null,
        };
    });

    if (gameLogRows.length > 0) {
        const { error: glErr } = await supabase.from('tournament_game_log').insert(gameLogRows);
        if (glErr) return { error: glErr.message };
    }

    // 10. Per-game player stats
    const playerStatRows: any[] = [];
    for (const pbp of pbpList) {
        const sg    = schedMap.get(pbp.game_id);
        const s     = sg?.seriesId ? seriesMap.get(sg.seriesId) : null;
        const round = s?.round ?? null;

        const expandBox = (boxes: any[], teamSlug: string) => {
            for (const box of boxes ?? []) {
                playerStatRows.push({
                    archive_id:  archiveId,
                    game_id:     pbp.game_id,
                    series_id:   sg?.seriesId ?? null,
                    round,
                    player_id:   String(box.playerId ?? ''),
                    player_name: box.playerName ?? '',
                    team_slug:   teamSlug,
                    position:    box.position ?? null,
                    mp:          box.mp         ?? 0,
                    pts:         box.pts        ?? 0,
                    fgm:         box.fgm        ?? 0,
                    fga:         box.fga        ?? 0,
                    p3m:         box.p3m        ?? 0,
                    p3a:         box.p3a        ?? 0,
                    ftm:         box.ftm        ?? 0,
                    fta:         box.fta        ?? 0,
                    reb:         box.reb        ?? 0,
                    oreb:        box.offReb     ?? 0,
                    dreb:        box.defReb     ?? 0,
                    ast:         box.ast        ?? 0,
                    stl:         box.stl        ?? 0,
                    blk:         box.blk        ?? 0,
                    tov:         box.tov        ?? 0,
                    pf:          box.pf         ?? 0,
                    plus_minus:  box.plusMinus  ?? 0,
                });
            }
        };

        expandBox(pbp.home_box ?? [], pbp.home_team_id);
        expandBox(pbp.away_box ?? [], pbp.away_team_id);
    }

    if (playerStatRows.length > 0) {
        // Insert in batches of 500 to avoid request size limits
        for (let i = 0; i < playerStatRows.length; i += 500) {
            const batch = playerStatRows.slice(i, i + 500);
            const { error: psErr } = await supabase.from('tournament_game_player_stats').insert(batch);
            if (psErr) return { error: psErr.message };
        }
    }

    console.log(`[archiveTournament] league=${leagueId} edition=${edition} champion=${championSlug} games=${gameLogRows.length} playerRows=${playerStatRows.length}`);
    return { error: null };
}

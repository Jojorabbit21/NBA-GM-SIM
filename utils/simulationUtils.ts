
import { Team, PlayoffSeries, PlayerBoxScore } from '../types';
import { INITIAL_STATS } from './constants';

/**
 * Applies a box score to a team's roster player stats in-memory.
 * Mirrors stateReplayer's applyBoxScore to keep live session stats in sync with DB.
 * Mutates team.roster[].stats directly (assumes team is a copy from state).
 */
export const applyBoxToRoster = (team: Team, box: PlayerBoxScore[]) => {
    if (!box) return;
    box.forEach(statLine => {
        const player = team.roster.find(p => p.id === statLine.playerId);
        if (player) {
            if (!player.stats) player.stats = INITIAL_STATS();
            player.stats.g           += 1;
            player.stats.gs          += (statLine.gs       || 0);
            player.stats.mp          += (statLine.mp       || 0);
            player.stats.pts         += (statLine.pts      || 0);
            player.stats.reb         += (statLine.reb      || 0);
            player.stats.offReb      += (statLine.offReb   || 0);
            player.stats.defReb      += (statLine.defReb   || 0);
            player.stats.ast         += (statLine.ast      || 0);
            player.stats.stl         += (statLine.stl      || 0);
            player.stats.blk         += (statLine.blk      || 0);
            player.stats.tov         += (statLine.tov      || 0);
            player.stats.fgm         += (statLine.fgm      || 0);
            player.stats.fga         += (statLine.fga      || 0);
            player.stats.p3m         += (statLine.p3m      || 0);
            player.stats.p3a         += (statLine.p3a      || 0);
            player.stats.ftm         += (statLine.ftm      || 0);
            player.stats.fta         += (statLine.fta      || 0);
            player.stats.pf          += (statLine.pf       || 0);
            player.stats.plusMinus   += (statLine.plusMinus|| 0);

            Object.keys(statLine).forEach(key => {
                if (key.startsWith('zone_') && typeof (statLine as any)[key] === 'number') {
                    player.stats[key] = (player.stats[key] || 0) + ((statLine as any)[key] || 0);
                }
            });
            if (statLine.zoneData) {
                Object.keys(statLine.zoneData).forEach(key => {
                    const val = (statLine.zoneData as any)[key];
                    if (typeof val === 'number') {
                        player.stats[key] = (player.stats[key] || 0) + val;
                    }
                });
            }
        }
    });
};

/**
 * Updates Wins/Losses for two teams based on score.
 * Mutates the team objects directly (assumes they are copies from state).
 */
export const updateTeamStats = (home: Team, away: Team, homeScore: number, awayScore: number) => {
    if (homeScore > awayScore) {
        home.wins++;
        away.losses++;
    } else {
        home.losses++;
        away.wins++;
    }
};

/**
 * Updates the Playoff Series state based on a game result.
 * Mutates the series object directly.
 */
export const updateSeriesState = (
    seriesList: PlayoffSeries[], 
    seriesId: string, 
    homeTeamId: string, 
    awayTeamId: string, 
    homeScore: number, 
    awayScore: number
) => {
    const series = seriesList.find(s => s.id === seriesId);
    if (!series) return;

    if (homeScore > awayScore) {
        if (series.higherSeedId === homeTeamId) series.higherSeedWins++;
        else series.lowerSeedWins++;
    } else {
        if (series.higherSeedId === awayTeamId) series.higherSeedWins++;
        else series.lowerSeedWins++;
    }

    // Check for series completion
    if (series.higherSeedWins >= series.targetWins) {
        series.finished = true;
        series.winnerId = series.higherSeedId;
    } else if (series.lowerSeedWins >= series.targetWins) {
        series.finished = true;
        series.winnerId = series.lowerSeedId;
    }
};

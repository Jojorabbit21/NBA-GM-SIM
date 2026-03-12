
import { Team, PlayoffSeries, PlayerBoxScore } from '../types';
import { INITIAL_STATS } from './constants';

/**
 * Applies a box score to a team's roster player stats in-memory.
 * Mirrors stateReplayer's applyBoxScore to keep live session stats in sync with DB.
 * Mutates team.roster[].stats directly (assumes team is a copy from state).
 */
export const applyBoxToRoster = (team: Team, box: PlayerBoxScore[], isPlayoff = false) => {
    if (!box) return;
    box.forEach(statLine => {
        const player = team.roster.find(p => p.id === statLine.playerId);
        if (player) {
            // 정규시즌 vs 플레이오프 대상 선택
            const target = isPlayoff
                ? (player.playoffStats ??= INITIAL_STATS())
                : (player.stats ??= INITIAL_STATS());

            target.g           += (statLine.g || 0);
            target.gs          += (statLine.gs       || 0);
            target.mp          += (statLine.mp       || 0);
            target.pts         += (statLine.pts      || 0);
            target.reb         += (statLine.reb      || 0);
            target.offReb      += (statLine.offReb   || 0);
            target.defReb      += (statLine.defReb   || 0);
            target.ast         += (statLine.ast      || 0);
            target.stl         += (statLine.stl      || 0);
            target.blk         += (statLine.blk      || 0);
            target.tov         += (statLine.tov      || 0);
            target.fgm         += (statLine.fgm      || 0);
            target.fga         += (statLine.fga      || 0);
            target.p3m         += (statLine.p3m      || 0);
            target.p3a         += (statLine.p3a      || 0);
            target.ftm         += (statLine.ftm      || 0);
            target.fta         += (statLine.fta      || 0);
            target.pf          += (statLine.pf       || 0);
            target.techFouls   += (statLine.techFouls || 0);
            target.flagrantFouls += (statLine.flagrantFouls || 0);
            target.plusMinus   += (statLine.plusMinus|| 0);

            Object.keys(statLine).forEach(key => {
                if (key.startsWith('zone_') && typeof (statLine as any)[key] === 'number') {
                    (target as any)[key] = ((target as any)[key] || 0) + ((statLine as any)[key] || 0);
                }
            });
            if (statLine.zoneData) {
                Object.keys(statLine.zoneData).forEach(key => {
                    const val = (statLine.zoneData as any)[key];
                    if (typeof val === 'number') {
                        (target as any)[key] = ((target as any)[key] || 0) + val;
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
export const updateTeamStats = (home: Team, away: Team, homeScore: number, awayScore: number, isPlayoff = false) => {
    // 플레이오프 경기는 정규시즌 W/L에 포함하지 않음
    if (isPlayoff) return;
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
/**
 * Aggregates individual PlayerBoxScore[] into a single team-level stats object.
 * Used to attach homeStats/awayStats to Game objects for TeamGameLog display.
 */
export function sumTeamBoxScore(box: PlayerBoxScore[]): Record<string, number> {
    return box.reduce((acc: Record<string, number>, s) => {
        acc.fgm    += (s.fgm    || 0);
        acc.fga    += (s.fga    || 0);
        acc.p3m    += (s.p3m    || 0);
        acc.p3a    += (s.p3a    || 0);
        acc.ftm    += (s.ftm    || 0);
        acc.fta    += (s.fta    || 0);
        acc.reb    += (s.reb    || 0);
        acc.offReb += (s.offReb || 0);
        acc.defReb += (s.defReb || 0);
        acc.ast    += (s.ast    || 0);
        acc.stl    += (s.stl    || 0);
        acc.blk    += (s.blk    || 0);
        acc.tov    += (s.tov    || 0);
        acc.pf     += (s.pf     || 0);
        acc.techFouls += (s.techFouls || 0);
        acc.flagrantFouls += (s.flagrantFouls || 0);
        Object.keys(s).forEach(key => {
            if (key.startsWith('zone_') && typeof (s as any)[key] === 'number') {
                acc[key] = (acc[key] || 0) + ((s as any)[key] || 0);
            }
        });
        if (s.zoneData) {
            Object.keys(s.zoneData).forEach(key => {
                if (typeof (s.zoneData as any)[key] === 'number') {
                    acc[key] = (acc[key] || 0) + (s.zoneData as any)[key];
                }
            });
        }
        return acc;
    }, { fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, techFouls: 0, flagrantFouls: 0 });
}

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

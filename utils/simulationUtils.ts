
import { Team, PlayoffSeries, PlayerBoxScore, PbpLog, QuarterScores } from '../types';
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
            target.techFouls   = (target.techFouls || 0) + (statLine.techFouls || 0);
            target.flagrantFouls = (target.flagrantFouls || 0) + (statLine.flagrantFouls || 0);
            target.plusMinus   += (statLine.plusMinus|| 0);
            target.contestedAttempted = (target.contestedAttempted || 0) + (statLine.contestedAttempted || 0);
            target.contestedMade      = (target.contestedMade      || 0) + (statLine.contestedMade      || 0);
            target.defRimAttempted    = (target.defRimAttempted    || 0) + (statLine.defRimAttempted    || 0);
            target.defRimMade         = (target.defRimMade         || 0) + (statLine.defRimMade         || 0);
            target.defMidAttempted    = (target.defMidAttempted    || 0) + (statLine.defMidAttempted    || 0);
            target.defMidMade         = (target.defMidMade         || 0) + (statLine.defMidMade         || 0);
            target.defThreeAttempted  = (target.defThreeAttempted  || 0) + (statLine.defThreeAttempted  || 0);
            target.defThreeMade       = (target.defThreeMade       || 0) + (statLine.defThreeMade       || 0);
            target.defRAAttempted     = (target.defRAAttempted     || 0) + (statLine.defRAAttempted   || 0);
            target.defRAMade          = (target.defRAMade          || 0) + (statLine.defRAMade        || 0);
            target.defITPAttempted    = (target.defITPAttempted    || 0) + (statLine.defITPAttempted  || 0);
            target.defITPMade         = (target.defITPMade         || 0) + (statLine.defITPMade       || 0);
            target.defMIDAttempted    = (target.defMIDAttempted    || 0) + (statLine.defMIDAttempted  || 0);
            target.defMIDMade         = (target.defMIDMade         || 0) + (statLine.defMIDMade       || 0);
            target.defCNRAttempted    = (target.defCNRAttempted    || 0) + (statLine.defCNRAttempted  || 0);
            target.defCNRMade         = (target.defCNRMade         || 0) + (statLine.defCNRMade       || 0);
            target.defWINGAttempted   = (target.defWINGAttempted   || 0) + (statLine.defWINGAttempted || 0);
            target.defWINGMade        = (target.defWINGMade        || 0) + (statLine.defWINGMade      || 0);
            target.defATBAttempted    = (target.defATBAttempted    || 0) + (statLine.defATBAttempted  || 0);
            target.defATBMade         = (target.defATBMade         || 0) + (statLine.defATBMade       || 0);

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
        acc.contestedAttempted = (acc.contestedAttempted || 0) + (s.contestedAttempted || 0);
        acc.contestedMade      = (acc.contestedMade      || 0) + (s.contestedMade      || 0);
        acc.defRimAttempted    = (acc.defRimAttempted    || 0) + (s.defRimAttempted    || 0);
        acc.defRimMade         = (acc.defRimMade         || 0) + (s.defRimMade         || 0);
        acc.defMidAttempted    = (acc.defMidAttempted    || 0) + (s.defMidAttempted    || 0);
        acc.defMidMade         = (acc.defMidMade         || 0) + (s.defMidMade         || 0);
        acc.defThreeAttempted  = (acc.defThreeAttempted  || 0) + (s.defThreeAttempted  || 0);
        acc.defThreeMade       = (acc.defThreeMade       || 0) + (s.defThreeMade       || 0);
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

/**
 * pbpLogs에서 쿼터별 득점을 추출한다.
 * OT는 Q4에 합산. homeScore/awayScore로 최종 보정.
 */
export const extractQuarterScores = (
    pbpLogs: PbpLog[],
    homeTeamId: string,
    homeScore: number,
    awayScore: number,
): QuarterScores => {
    const home: [number, number, number, number] = [0, 0, 0, 0];
    const away: [number, number, number, number] = [0, 0, 0, 0];

    for (const log of pbpLogs) {
        if (log.type !== 'score' && log.type !== 'freethrow') continue;
        const pts = log.points ?? 0;
        if (pts === 0) continue;
        const qi = Math.min(3, log.quarter - 1); // Q1→0, Q2→1, Q3→2, Q4+OT→3
        if (log.teamId === homeTeamId) {
            home[qi] += pts;
        } else {
            away[qi] += pts;
        }
    }

    // 최종 스코어 보정 (엔진 quirk 대비) → Q4에 차이 반영
    const homeDiff = homeScore - (home[0] + home[1] + home[2] + home[3]);
    const awayDiff = awayScore - (away[0] + away[1] + away[2] + away[3]);
    if (homeDiff !== 0) home[3] += homeDiff;
    if (awayDiff !== 0) away[3] += awayDiff;

    return { home, away };
};

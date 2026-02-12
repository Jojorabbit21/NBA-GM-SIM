
import { Team, PlayoffSeries } from '../types';

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

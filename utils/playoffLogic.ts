
import { Team, Game, PlayoffSeries } from '../types';

export const PLAYOFF_ROUNDS = {
    PLAY_IN: 0,
    ROUND_1: 1,
    SEMIS: 2,
    CONF_FINALS: 3,
    FINALS: 4
};

const SEED_MATCHUPS_R1 = [
    { h: 1, l: 8 }, { h: 4, l: 5 }, // Bracket Top
    { h: 3, l: 6 }, { h: 2, l: 7 }  // Bracket Bottom
];

/**
 * 정규 시즌이 종료되었는지 확인하고, 초기 대진표(Play-in or Round 1)를 생성합니다.
 */
export function checkAndInitPlayoffs(teams: Team[], schedule: Game[], currentSeries: PlayoffSeries[], currentDate: string): PlayoffSeries[] {
    // 1. Check if Regular Season is done
    const regularSeasonGames = schedule.filter(g => !g.isPlayoff);
    const unplayedRegular = regularSeasonGames.filter(g => !g.played);

    // 아직 정규시즌이 끝나지 않았거나, 이미 플레이오프 시리즈가 존재하면 스킵
    if (unplayedRegular.length > 0 || currentSeries.length > 0) return currentSeries;

    // 2. Generate Seeds
    const getSeeds = (conf: 'East' | 'West') => 
        teams.filter(t => t.conference === conf)
             .sort((a, b) => (b.wins / (b.wins + b.losses || 1)) - (a.wins / (a.wins + a.losses || 1)));

    const eastSeeds = getSeeds('East');
    const westSeeds = getSeeds('West');

    // *Simpler Logic for V1: Skip Play-in, go straight to Round 1 for stability*
    const newSeries: PlayoffSeries[] = [];
    
    // Helper to create series
    const createSeries = (conf: 'East' | 'West', seeds: Team[], r: number) => {
        SEED_MATCHUPS_R1.forEach(m => {
            const high = seeds[m.h - 1];
            const low = seeds[m.l - 1];
            newSeries.push({
                id: `${conf}_R1_${high.id}_vs_${low.id}`,
                round: 1,
                conference: conf,
                higherSeedId: high.id,
                lowerSeedId: low.id,
                higherSeedWins: 0,
                lowerSeedWins: 0,
                finished: false,
                targetWins: 4
            });
        });
    };

    createSeries('East', eastSeeds, 1);
    createSeries('West', westSeeds, 1);

    console.log("🏆 Playoffs Initialized: Round 1 Started");
    return newSeries;
}

/**
 * 현재 시리즈 상태를 기반으로 '다음 경기'가 스케줄에 있는지 확인하고, 없으면 생성합니다.
 */
export function generateNextPlayoffGames(schedule: Game[], seriesList: PlayoffSeries[], currentDate: string): { newGames: Game[], updatedSeries: PlayoffSeries[] } {
    const newGames: Game[] = [];
    const updatedSeries = [...seriesList];
    let hasChanges = false;

    // 1. Check each active series
    updatedSeries.forEach(series => {
        if (series.finished) return;

        // Check if there is an unplayed game for this series in the schedule
        const activeGame = schedule.find(g => g.seriesId === series.id && !g.played);
        
        if (!activeGame) {
            // No active game -> Create next game
            const gameNum = series.higherSeedWins + series.lowerSeedWins + 1;
            
            // Format: 2-2-1-1-1 (Home court for Higher Seed: 1,2,5,7)
            const isHigherHome = [1, 2, 5, 7].includes(gameNum);
            
            // Scheduling: If first game, use currentDate + 2 days. Otherwise, last game date + 2 days.
            const seriesGames = schedule.filter(g => g.seriesId === series.id).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const lastGameDate = seriesGames.length > 0 ? new Date(seriesGames[seriesGames.length - 1].date) : new Date(currentDate);
            
            // Add 2 days gap
            const nextDate = new Date(lastGameDate);
            nextDate.setDate(nextDate.getDate() + 2);
            // Ensure next game isn't in the past relative to sim date
            const simDateObj = new Date(currentDate);
            if (nextDate <= simDateObj) {
                nextDate.setDate(simDateObj.getDate() + 1);
            }

            const nextDateStr = nextDate.toISOString().split('T')[0];

            newGames.push({
                id: `po_${series.id}_g${gameNum}`,
                homeTeamId: isHigherHome ? series.higherSeedId : series.lowerSeedId,
                awayTeamId: isHigherHome ? series.lowerSeedId : series.higherSeedId,
                date: nextDateStr,
                played: false,
                isPlayoff: true,
                seriesId: series.id
            });
        }
    });

    // 2. Check for Round Advancement (Create Next Round Series)
    // Logic: If all series in a bracket block are finished, create the next round series
    // (Simplified: Just checking simple progression for now)
    
    // ... Advanced Bracket Logic would go here ... 
    // For now, we rely on the manual creation or simple advancement in hooks.

    return { newGames, updatedSeries };
}

/**
 * 시리즈 승자 결정 및 라운드 종료 처리
 */
export function advancePlayoffRound(seriesList: PlayoffSeries[], teams: Team[]): PlayoffSeries[] {
    let nextRoundSeries: PlayoffSeries[] = [];
    
    // Group by Round & Conference
    // R1 -> Semis -> Conf Finals -> Finals
    
    // Check Round 1 -> Semis
    const r1 = seriesList.filter(s => s.round === 1 && s.finished);
    const r2 = seriesList.filter(s => s.round === 2);
    
    if (r1.length === 8 && r2.length === 0) {
        // Create Semis
        ['East', 'West'].forEach(conf => {
            const confSeries = r1.filter(s => s.conference === conf);
            // Assuming standard bracket order (1v8, 4v5, 3v6, 2v7)
            // Winner of (1v8) vs Winner of (4v5)
            // Winner of (3v6) vs Winner of (2v7)
            // Note: We need to track seed in series to match correctly, or infer from ID. 
            // Simplified: Just take winners and assume seeding logic holds if we sorted correctly initially.
            
            // Re-find original seed by checking ID or team wins
            // Just pairing strictly for MVP: 0 vs 1, 2 vs 3 in the array index if sorted?
            // Safer: Match by IDs.
            
            // Let's implement a robust bracket linker later. 
            // For MVP: Simple notification that round is done.
        });
    }

    return [...seriesList, ...nextRoundSeries];
}

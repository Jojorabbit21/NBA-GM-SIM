import { Team, Game, PlayoffSeries, Transaction } from '../../types';
import { advancePlayoffState, generateNextPlayoffGames, checkAndInitPlayoffs } from '../../utils/playoffLogic';
import { simulateCPUTrades } from '../../services/tradeEngine';
import { generateCPUTradeNews } from '../../services/geminiService';
import { savePlayoffState } from '../../services/playoffService';

export const handleSeasonEvents = async (
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[],
    currentSimDate: string,
    myTeamId: string,
    userId: string | undefined,
    isGuestMode: boolean
) => {
    let playoffUpdateTriggered = false;
    let newTransactions: Transaction[] = [];
    let newsItems: string[] = [];
    let tradeToast: string | null = null;
    let updatedSeries = [...playoffSeries]; // Clone for modification

    // 1. Playoffs
    if (updatedSeries.length > 0) {
        // Advance State
        const advancedSeries = advancePlayoffState(updatedSeries, teams);
        // If advancePlayoffState returns a new array reference, update our local ref
        if (advancedSeries !== updatedSeries) {
            updatedSeries = advancedSeries;
            playoffUpdateTriggered = true;
        }

        // Generate Next Games
        const { newGames, updatedSeries: nextSeries } = generateNextPlayoffGames(schedule, updatedSeries, currentSimDate);
        if (newGames.length > 0) {
            schedule.push(...newGames);
            updatedSeries = nextSeries;
            playoffUpdateTriggered = true;
        }
    } else {
        // Check Init
        const initializedSeries = checkAndInitPlayoffs(teams, schedule, [], currentSimDate);
        if (initializedSeries.length > 0) {
            updatedSeries = initializedSeries;
            playoffUpdateTriggered = true;
            
            // Generate First Games immediately
            const { newGames, updatedSeries: nextSeries } = generateNextPlayoffGames(schedule, updatedSeries, currentSimDate);
            schedule.push(...newGames);
            updatedSeries = nextSeries;
        }
    }

    // 2. CPU Trades
    // Only during Regular Season (Empty Playoffs)
    if (updatedSeries.length === 0) {
        const tradeResults = await simulateCPUTrades(teams, myTeamId, currentSimDate);
        if (tradeResults && tradeResults.transactions.length > 0) {
            for (const tx of tradeResults.transactions) {
                const cpuTx = { ...tx, date: currentSimDate };
                newTransactions.push(cpuTx);

                const news = await generateCPUTradeNews(cpuTx);
                if (news) {
                    newsItems.push(...news);
                    if (!tradeToast) tradeToast = `[TRADE] ${news[0]}`;
                }
            }
        }
    }

    // 3. Save Playoff State
    if (!isGuestMode && playoffUpdateTriggered && updatedSeries.length > 0 && userId) {
        const currentRound = Math.max(...updatedSeries.map(s => s.round));
        const isFinished = updatedSeries.some(s => s.round === 4 && s.finished);
        const championId = isFinished ? updatedSeries.find(s => s.round === 4)?.winnerId : undefined;
        
        await savePlayoffState(userId, myTeamId, updatedSeries, currentRound, isFinished, championId);
    }

    return { 
        updatedPlayoffSeries: updatedSeries,
        newTransactions, 
        newsItems, 
        tradeToast 
    };
};
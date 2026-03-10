import { Team, Game, PlayoffSeries, Transaction, RegSeasonChampionContent } from '../../types';
import { advancePlayoffState, generateNextPlayoffGames, checkAndInitPlayoffs } from '../../utils/playoffLogic';
import { simulateCPUTrades } from '../../services/tradeEngine';
import { runCPUTradeRound } from '../../services/tradeEngine/cpuTradeSimulator';
import { generateCPUTradeNews } from '../../services/geminiService';
import { savePlayoffState } from '../../services/playoffService';
import { runAwardVoting, SeasonAwardsContent } from '../../utils/awardVoting';
import { sendMessage } from '../../services/messageService';
import { buildRegSeasonChampionContent } from '../../services/reportGenerator';

export const handleSeasonEvents = async (
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[],
    currentSimDate: string,
    myTeamId: string,
    userId: string | undefined,
    isGuestMode: boolean,
    tendencySeed?: string
) => {
    let newTransactions: Transaction[] = [];
    let newsItems: string[] = [];
    let tradeToast: string | null = null;
    let updatedSeries = [...playoffSeries]; // Clone for modification

    // 1. Playoffs
    if (updatedSeries.length > 0) {
        // Advance State
        const advancedSeries = advancePlayoffState(updatedSeries, teams, schedule);
        if (advancedSeries !== updatedSeries) {
            updatedSeries = advancedSeries;
        }

        // Generate Next Games
        const { newGames, updatedSeries: nextSeries } = generateNextPlayoffGames(schedule, updatedSeries, currentSimDate);
        if (newGames.length > 0) {
            schedule.push(...newGames);
            updatedSeries = nextSeries;
        }
    } else {
        // Check Init
        const initializedSeries = checkAndInitPlayoffs(teams, schedule, [], currentSimDate);
        if (initializedSeries.length > 0) {
            updatedSeries = initializedSeries;

            // Generate First Games immediately
            const { newGames, updatedSeries: nextSeries } = generateNextPlayoffGames(schedule, updatedSeries, currentSimDate);
            schedule.push(...newGames);
            updatedSeries = nextSeries;

            // ★ 정규시즌 어워드 투표 발송
            if (!isGuestMode && userId) {
                const awardResult = runAwardVoting(teams, tendencySeed);
                await sendMessage(userId, myTeamId, currentSimDate, 'SEASON_AWARDS',
                    '[공식] 2025-26 정규시즌 어워드 투표 결과', awardResult);
                // ★ 정규시즌 우승팀 보고서 발송
                const championContent = buildRegSeasonChampionContent(teams, schedule);
                await sendMessage(userId, myTeamId, currentSimDate, 'REG_SEASON_CHAMPION',
                    `[속보] 2025-26 정규시즌 우승: ${championContent.championTeamName}`, championContent);
            }
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

    // 3. Save Playoff State — 플레이오프 진행 중이면 항상 저장
    // (updateSeriesState가 wins/finished를 직접 뮤테이션하므로,
    //  advancePlayoffState의 changed 플래그만으로는 변경 감지 불가)
    if (!isGuestMode && updatedSeries.length > 0 && userId) {
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

/**
 * handleSeasonEvents의 동기 버전 (배치 시뮬레이션용).
 * DB 저장, Gemini 호출, 뉴스 생성을 모두 생략.
 */
export const handleSeasonEventsSync = (
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[],
    currentSimDate: string,
    myTeamId: string,
    tendencySeed?: string
) => {
    let newTransactions: Transaction[] = [];
    let updatedSeries = [...playoffSeries];
    let awardContent: SeasonAwardsContent | null = null;
    let championContent: RegSeasonChampionContent | null = null;

    // 1. Playoffs
    if (updatedSeries.length > 0) {
        const advancedSeries = advancePlayoffState(updatedSeries, teams, schedule);
        if (advancedSeries !== updatedSeries) {
            updatedSeries = advancedSeries;
        }
        const { newGames, updatedSeries: nextSeries } = generateNextPlayoffGames(schedule, updatedSeries, currentSimDate);
        if (newGames.length > 0) {
            schedule.push(...newGames);
            updatedSeries = nextSeries;
        }
    } else {
        const initializedSeries = checkAndInitPlayoffs(teams, schedule, [], currentSimDate);
        if (initializedSeries.length > 0) {
            updatedSeries = initializedSeries;
            const { newGames, updatedSeries: nextSeries } = generateNextPlayoffGames(schedule, updatedSeries, currentSimDate);
            schedule.push(...newGames);
            updatedSeries = nextSeries;

            // ★ 정규시즌 어워드 투표 (배치 — sendMessage 생략, 반환)
            awardContent = runAwardVoting(teams, tendencySeed);
            // ★ 정규시즌 우승팀 보고서 (배치 — 반환)
            championContent = buildRegSeasonChampionContent(teams, schedule);
        }
    }

    // 2. CPU Trades (동기 — Gemini 뉴스 생략)
    if (updatedSeries.length === 0) {
        const tradeResults = runCPUTradeRound(teams, myTeamId, currentSimDate);
        if (tradeResults && tradeResults.transactions.length > 0) {
            for (const tx of tradeResults.transactions) {
                newTransactions.push({ ...tx, date: currentSimDate });
            }
        }
    }

    // playoffSeries 원본 배열 교체 (caller에서 참조 갱신 필요)
    playoffSeries.length = 0;
    playoffSeries.push(...updatedSeries);

    return { newTransactions, awardContent, championContent };
};

import { Team, Game, PlayoffSeries, Transaction, RegSeasonChampionContent } from '../../types';
import { LeaguePickAssets } from '../../types/draftAssets';
import { LeagueTradeBlocks, LeagueTradeOffers } from '../../types/trade';
import { LeagueGMProfiles } from '../../types/gm';
import { SeasonConfig, DEFAULT_SEASON_CONFIG } from '../../utils/seasonConfig';
import { updateTeamDirections } from '../../services/tradeEngine/gmProfiler';
import { advancePlayoffState, generateNextPlayoffGames, checkAndInitPlayoffs } from '../../utils/playoffLogic';
import { simulateCPUTrades } from '../../services/tradeEngine';
import { runCPUTradeRound } from '../../services/tradeEngine/cpuTradeSimulator';
import { syncCPUTradeBlocks, evaluateUserTradeBlock, evaluateUserProposals, expireOldOffers } from '../../services/tradeEngine/tradeBlockManager';
import { generateCPUTradeNews } from '../../services/geminiService';
import { savePlayoffState } from '../../services/playoffService';
import { runAwardVoting, SeasonAwardsContent } from '../../utils/awardVoting';
import { stampSeasonAwards, stampRegSeasonChampion } from '../../utils/awardStamper';
import { sendMessage, hasMessageOfType } from '../../services/messageService';
import { buildRegSeasonChampionContent } from '../../services/reportGenerator';

export const handleSeasonEvents = async (
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[],
    currentSimDate: string,
    myTeamId: string,
    userId: string | undefined,
    isGuestMode: boolean,
    tendencySeed?: string,
    leagueTradeBlocks?: LeagueTradeBlocks,
    leaguePickAssets?: LeaguePickAssets,
    leagueTradeOffers?: LeagueTradeOffers,
    leagueGMProfiles?: LeagueGMProfiles,
    seasonConfig?: SeasonConfig
) => {
    const seasonShort = seasonConfig?.seasonShort ?? DEFAULT_SEASON_CONFIG.seasonShort;
    let newTransactions: Transaction[] = [];
    let newsItems: string[] = [];
    let tradeToast: string | null = null;
    let updatedSeries = [...playoffSeries]; // Clone for modification
    let newTradeOffers: import('../../types/trade').PersistentTradeOffer[] = [];
    let acceptedProposals: import('../../types/trade').PersistentTradeOffer[] = [];
    let rejectedProposals: import('../../types/trade').PersistentTradeOffer[] = [];
    let overflowCutPlayers: import('../../types').Player[] = [];

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

            // ★ 정규시즌 어워드 투표 → 선수에 stamp
            {
                const awardResult = runAwardVoting(teams, tendencySeed);
                stampSeasonAwards(teams, awardResult, seasonShort);
                const championContent = buildRegSeasonChampionContent(teams, schedule);
                stampRegSeasonChampion(teams, seasonShort, championContent.championTeamId);
                if (!isGuestMode && userId) {
                    const [alreadySentAward, alreadySentChamp] = await Promise.all([
                        hasMessageOfType(userId, myTeamId, 'SEASON_AWARDS'),
                        hasMessageOfType(userId, myTeamId, 'REG_SEASON_CHAMPION'),
                    ]);
                    if (!alreadySentAward) {
                        await sendMessage(userId, myTeamId, currentSimDate, 'SEASON_AWARDS',
                            `[공식] ${seasonShort} 정규시즌 어워드 투표 결과`, awardResult);
                    }
                    // ★ 정규시즌 우승팀 보고서 발송
                    if (!alreadySentChamp) {
                        await sendMessage(userId, myTeamId, currentSimDate, 'REG_SEASON_CHAMPION',
                            `[속보] ${seasonShort} 정규시즌 우승: ${championContent.championTeamName}`, championContent);
                    }
                }
            }
        }
    }

    // 2. CPU Trades & Trade Block Evaluation
    // Only during Regular Season (Empty Playoffs)
    if (updatedSeries.length === 0) {
        // 2-0. GM 노선 업데이트
        if (leagueGMProfiles) {
            updateTeamDirections(teams, leagueGMProfiles, currentSimDate, seasonConfig?.tradeDeadline);
        }

        // 2-1. CPU 트레이드 블록 동기화
        if (leagueTradeBlocks && leaguePickAssets) {
            syncCPUTradeBlocks(teams, leagueTradeBlocks, leaguePickAssets, myTeamId, currentSimDate, leagueGMProfiles);
        }

        // 2-2. CPU-CPU 트레이드
        const tradeResults = await simulateCPUTrades(teams, myTeamId, currentSimDate, leaguePickAssets, leagueTradeBlocks, leagueGMProfiles, seasonConfig);
        if (tradeResults) {
            if (tradeResults.transactions.length > 0) {
                for (const tx of tradeResults.transactions) {
                    const cpuTx = { ...tx, date: currentSimDate };
                    newTransactions.push(cpuTx);

                    const news = await generateCPUTradeNews(cpuTx);
                    if (news) {
                        newsItems.push(...news);
                    }
                }
            }
            if (tradeResults.overflowCutPlayers?.length > 0) {
                overflowCutPlayers.push(...tradeResults.overflowCutPlayers);
            }
        }

        // 2-3. CPU가 유저 블록 평가 → 오퍼 생성
        if (leagueTradeBlocks && leaguePickAssets && leagueTradeOffers) {
            newTradeOffers = evaluateUserTradeBlock(
                myTeamId, teams, leagueTradeBlocks, leaguePickAssets, leagueTradeOffers, currentSimDate, leagueGMProfiles
            );

            // 오퍼 수신 메시지 발송
            if (!isGuestMode && userId) {
                for (const offer of newTradeOffers) {
                    const fromTeam = teams.find(t => t.id === offer.fromTeamId);
                    const offeredSummary = [
                        ...offer.offeredPlayers.map(p => p.playerName),
                        ...offer.offeredPicks.map(p => `${p.season} R${p.round}`),
                    ].join(', ');
                    await sendMessage(userId, myTeamId, currentSimDate, 'TRADE_OFFER_RECEIVED',
                        `[트레이드 제안] ${fromTeam?.name ?? ''}이(가) 트레이드를 제안했습니다`,
                        {
                            offerId: offer.id,
                            fromTeamId: offer.fromTeamId,
                            fromTeamName: fromTeam?.name ?? '',
                            offeredSummary,
                            analysis: offer.analysis || [],
                        }
                    );
                }
            }

            // 2-4. 유저가 보낸 제안에 CPU 응답
            const proposals = evaluateUserProposals(myTeamId, teams, leaguePickAssets, leagueTradeOffers, currentSimDate, leagueGMProfiles);
            acceptedProposals = proposals.accepted;
            rejectedProposals = proposals.rejected;

            // 응답 메시지 발송
            if (!isGuestMode && userId) {
                for (const p of [...acceptedProposals, ...rejectedProposals]) {
                    const toTeam = teams.find(t => t.id === p.toTeamId);
                    await sendMessage(userId, myTeamId, currentSimDate, 'TRADE_OFFER_RESPONSE',
                        `[트레이드 응답] ${toTeam?.name ?? ''}이(가) 제안을 ${p.status === 'accepted' ? '수락' : '거절'}했습니다`,
                        {
                            offerId: p.id,
                            fromTeamId: p.toTeamId,
                            fromTeamName: toTeam?.name ?? '',
                            accepted: p.status === 'accepted',
                        }
                    );
                }
            }

            // 2-5. 만료 오퍼 정리
            expireOldOffers(leagueTradeOffers, currentSimDate);
        }
    }

    // 3. Save Playoff State — 플레이오프 진행 중이면 항상 저장
    // (updateSeriesState가 wins/finished를 직접 뮤테이션하므로,
    //  advancePlayoffState의 changed 플래그만으로는 변경 감지 불가)
    if (!isGuestMode && updatedSeries.length > 0 && userId) {
        const currentRound = Math.max(...updatedSeries.map(s => s.round));
        const isFinished = updatedSeries.some(s => s.round === 4 && s.finished);
        const championId = isFinished ? updatedSeries.find(s => s.round === 4)?.winnerId : undefined;

        savePlayoffState(userId, myTeamId, updatedSeries, currentRound, isFinished, championId, seasonConfig?.seasonLabel)
            .catch(e => console.warn("⚠️ savePlayoffState failed (non-critical):", e));
    }

    return {
        updatedPlayoffSeries: updatedSeries,
        newTransactions,
        newsItems,
        tradeToast,
        newTradeOffers,
        acceptedProposals,
        rejectedProposals,
        overflowCutPlayers,
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
    tendencySeed?: string,
    leagueTradeBlocks?: LeagueTradeBlocks,
    leaguePickAssets?: LeaguePickAssets,
    leagueTradeOffers?: LeagueTradeOffers,
    leagueGMProfiles?: LeagueGMProfiles,
    seasonConfig?: SeasonConfig
) => {
    const seasonShort = seasonConfig?.seasonShort ?? DEFAULT_SEASON_CONFIG.seasonShort;
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

            // ★ 정규시즌 어워드 투표 (배치 — sendMessage 생략, 반환) → 선수에 stamp
            awardContent = runAwardVoting(teams, tendencySeed);
            stampSeasonAwards(teams, awardContent, seasonShort);
            // ★ 정규시즌 우승팀 보고서 (배치 — 반환) → 선수에 stamp
            championContent = buildRegSeasonChampionContent(teams, schedule);
            stampRegSeasonChampion(teams, seasonShort, championContent.championTeamId);
        }
    }

    // 2. CPU Trades & Trade Block Evaluation (동기 — Gemini 뉴스 생략)
    if (updatedSeries.length === 0) {
        // 2-0. GM 노선 업데이트
        if (leagueGMProfiles) {
            updateTeamDirections(teams, leagueGMProfiles, currentSimDate, seasonConfig?.tradeDeadline);
        }

        // 2-1. CPU 트레이드 블록 동기화
        if (leagueTradeBlocks && leaguePickAssets) {
            syncCPUTradeBlocks(teams, leagueTradeBlocks, leaguePickAssets, myTeamId, currentSimDate, leagueGMProfiles);
        }

        // 2-2. CPU-CPU 트레이드
        const tradeResults = runCPUTradeRound(teams, myTeamId, currentSimDate, leaguePickAssets, leagueTradeBlocks, leagueGMProfiles, seasonConfig);
        if (tradeResults && tradeResults.transactions.length > 0) {
            for (const tx of tradeResults.transactions) {
                newTransactions.push({ ...tx, date: currentSimDate });
            }
        }

        // 2-3~5. 유저 블록 평가 + 제안 응답 + 만료 (배치에서는 메시지 생략)
        if (leagueTradeBlocks && leaguePickAssets && leagueTradeOffers) {
            evaluateUserTradeBlock(myTeamId, teams, leagueTradeBlocks, leaguePickAssets, leagueTradeOffers, currentSimDate, leagueGMProfiles);
            evaluateUserProposals(myTeamId, teams, leaguePickAssets, leagueTradeOffers, currentSimDate, leagueGMProfiles);
            expireOldOffers(leagueTradeOffers, currentSimDate);
        }
    }

    // playoffSeries 원본 배열 교체 (caller에서 참조 갱신 필요)
    playoffSeries.length = 0;
    playoffSeries.push(...updatedSeries);

    return { newTransactions, awardContent, championContent };
};

// ── 시즌 전환 감지 (offseasonEventHandler로 이관) ──
// detectFinalsEnd + dispatchOffseasonEvent 는 offseasonEventHandler.ts에서 export
export { detectFinalsEnd, dispatchOffseasonEvent } from './offseasonEventHandler';
export type { OffseasonEventResult } from './offseasonEventHandler';

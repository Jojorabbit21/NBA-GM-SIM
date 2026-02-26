
import { Team, Player, TradeOffer, Transaction } from '../types';
import { generateOffers } from './tradeEngine/offerGenerator';
import { generateCounters } from './tradeEngine/counterGenerator';
import { runCPUTradeRound } from './tradeEngine/cpuTradeSimulator';

export async function generateTradeOffers(
    tradingPlayers: Player[],
    myTeam: Team,
    allTeams: Team[],
    desiredPositions: string[] = []
): Promise<TradeOffer[]> {
    return generateOffers(tradingPlayers, myTeam, allTeams, desiredPositions);
}

export async function generateCounterOffers(
    targetPlayers: Player[],
    targetTeam: Team,
    myTeam: Team,
    allTeams: Team[]
): Promise<TradeOffer[]> {
    return generateCounters(targetPlayers, targetTeam, myTeam, allTeams);
}

export async function simulateCPUTrades(
    allTeams: Team[],
    myTeamId: string | null,
    currentDate: string
): Promise<{ updatedTeams: Team[]; transactions: Transaction[] } | null> {
    return runCPUTradeRound(allTeams, myTeamId, currentDate);
}

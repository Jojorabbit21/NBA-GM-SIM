
import { Team, Player, TradeOffer, Transaction } from '../types';
import { generateOffers } from './tradeEngine/offerGenerator';
import { generateCounters } from './tradeEngine/counterGenerator';

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

// CPU 트레이드 시뮬레이션 (향후 구현 예정 — 현재 스텁)
export async function simulateCPUTrades(
    allTeams: Team[],
    myTeamId: string | null
): Promise<{ updatedTeams: Team[], transaction?: Transaction } | null> {
    return null;
}


import { Team, Player, TradeOffer, Transaction } from '../types';

// ==========================================================================================
//  💼 NBA GM SIMULATOR - TRADE ENGINE
// ==========================================================================================

export const TRADE_CONFIG = {
    BASE: {
        REPLACEMENT_LEVEL_OVR: 40,
        VALUE_EXPONENT: 2.8, 
    },
    AGE: {
        YOUNG_LIMIT: 23,
        HIGH_POT_THRESHOLD: 80,
        YOUNG_POT_BONUS: 0.02, 
        PRIME_START: 24,
        PRIME_END: 29,
        PRIME_BONUS: 1.1, 
        OLD_START: 32,
        OLD_PENALTY_PER_YEAR: 0.08, 
        MIN_OLD_VALUE: 0.3, 
    },
    NEEDS: {
        WEAKNESS_THRESHOLD: 75, 
        STRENGTH_THRESHOLD: 85, 
    },
    CONTEXT: {
        FIT_BONUS: 0.20, 
        REDUNDANCY_PENALTY: 0.15, 
        SALARY_DUMP_BONUS: 0.1, 
        EXPIRING_BONUS: 0.05, 
    },
    ACCEPTANCE: {
        DEFAULT_RATIO: 1.05, 
        STAR_SWAP_RATIO: 1.0, 
        REBUILDING_POT_VALUATION: 1.3, 
        WINNOW_VET_VALUATION: 1.2, 
    },
    DILUTION: {
        PACKAGE_SIZE_TRIGGER: 3, 
        LOW_ANCHOR_PENALTY: 0.60, 
        ROSTER_CLOG_PENALTY: 0.85,
    }
};

export function getPlayerTradeValue(p: Player): number {
    const C = TRADE_CONFIG;
    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, p.ovr);
    let baseValue = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    if (p.age <= C.AGE.YOUNG_LIMIT) {
        if (p.potential > p.ovr) {
            const potBonus = 1.0 + ((p.potential - 70) * C.AGE.YOUNG_POT_BONUS); 
            baseValue *= potBonus;
        }
    } else if (p.age >= C.AGE.PRIME_START && p.age <= C.AGE.PRIME_END) {
        baseValue *= C.AGE.PRIME_BONUS;
    } else if (p.age >= C.AGE.OLD_START) {
        const yearsOld = p.age - C.AGE.OLD_START + 1;
        const penalty = Math.pow(1 - C.AGE.OLD_PENALTY_PER_YEAR, yearsOld);
        baseValue *= Math.max(C.AGE.MIN_OLD_VALUE, penalty);
    }

    if (p.contractYears > 1) {
        const fairSalary = Math.pow(p.ovr - 65, 2) / 3; 
        if (p.salary < fairSalary * 0.7) baseValue *= 1.15; 
        else if (p.salary > fairSalary * 1.5) baseValue *= 0.8; 
    } else {
        baseValue *= 0.95; 
    }
    return Math.floor(baseValue);
}

function getTeamNeeds(team: Team): { needs: string[], strengths: string[], isContender: boolean } {
    const C = TRADE_CONFIG.NEEDS;
    const top8 = [...team.roster].sort((a,b) => b.ovr - a.ovr).slice(0, 8);
    if (top8.length === 0) return { needs: [], strengths: [], isContender: false };
    const avgOvr = top8.reduce((s, p) => s + p.ovr, 0) / top8.length;
    const isContender = avgOvr >= 80;
    const avg = (attr: keyof Player) => top8.reduce((sum, p) => sum + (p[attr] as number), 0) / top8.length;
    const needs: string[] = [];
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    positions.forEach(pos => {
        const playersAtPos = top8.filter(p => p.position === pos);
        if (playersAtPos.length === 0 || Math.max(...playersAtPos.map(p=>p.ovr)) < 75) {
            needs.push(pos);
        }
    });
    return { needs, strengths: [], isContender };
}

function getContextualTradeValue(player: Player, teamContext: Team, isAcquiring: boolean): number {
    const C = TRADE_CONFIG.CONTEXT;
    const A = TRADE_CONFIG.ACCEPTANCE;
    let value = getPlayerTradeValue(player);
    const { needs, isContender } = getTeamNeeds(teamContext);
    
    if (isAcquiring) {
        let fitMultiplier = 1.0;
        if (needs.includes(player.position)) fitMultiplier += C.FIT_BONUS;
        const playersAtPos = teamContext.roster.filter(p => p.position === player.position && p.ovr >= player.ovr - 3);
        if (playersAtPos.length >= 2) fitMultiplier -= C.REDUNDANCY_PENALTY;
        if (!isContender) {
            if (player.age <= 23 && player.potential > 80) fitMultiplier *= A.REBUILDING_POT_VALUATION;
            if (player.age > 30) fitMultiplier *= 0.7;
        } else {
            if (player.ovr >= 80) fitMultiplier *= A.WINNOW_VET_VALUATION;
        }
        value *= fitMultiplier;
    } else {
        const rank = [...teamContext.roster].sort((a,b) => b.ovr - a.ovr).findIndex(p => p.id === player.id);
        if (rank <= 2) value *= 1.2; 
    }
    return value;
}

export function generateTradeOffers(tradingPlayers: Player[], myTeam: Team, allTeams: Team[], desiredPositions: string[] = []): TradeOffer[] {
    const C = TRADE_CONFIG.ACCEPTANCE;
    const mySalary = tradingPlayers.reduce((sum, p) => sum + p.salary, 0);
    const offers: TradeOffer[] = [];
    const otherTeams = allTeams.filter(t => t.id !== myTeam.id);

    for (const targetTeam of otherTeams) {
        let userPackageValueToAI = 0;
        tradingPlayers.forEach(p => { userPackageValueToAI += getContextualTradeValue(p, targetTeam, true); });
        if (userPackageValueToAI < 100) continue;
        const candidates = [...targetTeam.roster].sort((a,b) => getPlayerTradeValue(a) - getPlayerTradeValue(b));
        for (let i = 0; i < 300; i++) { 
            const packSize = Math.floor(Math.random() * 3) + 1; 
            const tradePack: Player[] = [];
            const visitedIndices = new Set<number>();
            if (desiredPositions.length > 0) {
                 const desiredCandidates = candidates.filter(p => desiredPositions.includes(p.position));
                 if (desiredCandidates.length > 0) {
                     const primePlayer = desiredCandidates[Math.floor(Math.random() * desiredCandidates.length)];
                     const realIdx = candidates.findIndex(c => c.id === primePlayer.id);
                     if (realIdx !== -1) { visitedIndices.add(realIdx); tradePack.push(primePlayer); }
                 }
            }
            const remainingSlots = packSize - tradePack.length;
            for (let k = 0; k < remainingSlots; k++) {
                const idx = Math.floor(Math.random() * candidates.length);
                if (!visitedIndices.has(idx)) { visitedIndices.add(idx); tradePack.push(candidates[idx]); }
            }
            if (tradePack.length === 0) continue;
            if (desiredPositions.length > 0 && !tradePack.some(p => desiredPositions.includes(p.position))) continue; 
            let aiPackageValue = 0; let aiSalary = 0;
            tradePack.forEach(p => { aiPackageValue += getContextualTradeValue(p, targetTeam, false); aiSalary += p.salary; });
            const salaryRatio = mySalary > 0 ? aiSalary / mySalary : 0;
            const isSalaryMatch = Math.abs(mySalary - aiSalary) < 5 || (salaryRatio >= 0.75 && salaryRatio <= 1.30);
            if (isSalaryMatch && userPackageValueToAI >= aiPackageValue * C.DEFAULT_RATIO) {
                const isDup = offers.some(o => o.teamId === targetTeam.id && o.players.length === tradePack.length && o.players.every(p => tradePack.some(tp => tp.id === p.id)));
                if (!isDup) {
                    const rawUserVal = tradingPlayers.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                    const rawTargetVal = tradePack.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                    offers.push({ teamId: targetTeam.id, teamName: targetTeam.name, players: tradePack, diffValue: rawTargetVal - rawUserVal });
                }
            }
        }
    }
    return offers.sort((a, b) => b.diffValue - a.diffValue).slice(0, 5);
}

export function generateCounterOffers(targetPlayers: Player[], targetTeam: Team, myTeam: Team): TradeOffer[] {
    const C = TRADE_CONFIG.ACCEPTANCE;
    const targetValueToAI = targetPlayers.reduce((sum, p) => sum + getContextualTradeValue(p, targetTeam, false), 0);
    const targetSalary = targetPlayers.reduce((sum, p) => sum + p.salary, 0);
    const offers: TradeOffer[] = [];
    const myCandidates = [...myTeam.roster].sort((a,b) => getPlayerTradeValue(b) - getPlayerTradeValue(a));
    for (let i = 0; i < 50; i++) {
        const packSize = Math.floor(Math.random() * 2) + 1;
        const tradePack: Player[] = [];
        const visited = new Set<number>();
        for (let k = 0; k < packSize; k++) {
            const idx = Math.floor(Math.random() * myCandidates.length);
            if (!visited.has(idx)) { visited.add(idx); tradePack.push(myCandidates[idx]); }
        }
        if (tradePack.length === 0) continue;
        let myPackValueToAI = 0; let myPackSalary = 0;
        tradePack.forEach(p => { myPackValueToAI += getContextualTradeValue(p, targetTeam, true); myPackSalary += p.salary; });
        const salaryRatio = targetSalary > 0 ? myPackSalary / targetSalary : 0;
        const isSalaryMatch = Math.abs(targetSalary - myPackSalary) < 5 || (salaryRatio >= 0.75 && salaryRatio <= 1.30);
        if (isSalaryMatch && myPackValueToAI >= targetValueToAI * C.DEFAULT_RATIO) {
             const isDup = offers.some(o => o.players.length === tradePack.length && o.players.every(p => tradePack.some(tp => tp.id === p.id)));
             if (!isDup && myPackValueToAI <= targetValueToAI * 2.5) {
                const rawUserVal = tradePack.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                const rawTargetVal = targetPlayers.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                offers.push({ teamId: myTeam.id, teamName: myTeam.name, players: tradePack, diffValue: rawUserVal - rawTargetVal });
             }
        }
    }
    return offers.sort((a,b) => a.diffValue - b.diffValue).slice(0, 3);
}

/**
 * [CPU-CPU Trade Logic]
 * AI 구단들이 자율적으로 트레이드를 시뮬레이션합니다.
 */
export function simulateCPUTrades(allTeams: Team[], myTeamId: string | null): { updatedTeams: Team[], transaction?: Transaction } | null {
    const otherTeams = allTeams.filter(t => t.id !== myTeamId);
    if (otherTeams.length < 2) return null;

    // 1. 성향 기반 팀 분류
    const contenders = otherTeams.filter(t => (t.wins / (t.wins + t.losses || 1)) >= 0.55);
    const sellers = otherTeams.filter(t => (t.wins / (t.wins + t.losses || 1)) <= 0.40);

    if (contenders.length === 0 || sellers.length === 0) return null;

    // 2. 무작위 팀 매칭
    const buyer = contenders[Math.floor(Math.random() * contenders.length)];
    const seller = sellers[Math.floor(Math.random() * sellers.length)];

    // 3. 자산 구성 (Seller는 베테랑, Buyer는 유망주나 샐러리 필러)
    const sellerVets = seller.roster.filter(p => p.age >= 29 && p.ovr >= 78).sort((a, b) => b.ovr - a.ovr);
    if (sellerVets.length === 0) return null;
    const targetPlayer = sellerVets[0];

    const buyerAssets = buyer.roster.filter(p => p.id !== buyer.roster[0].id) // 코어 제외
                                    .sort((a, b) => getPlayerTradeValue(a) - getPlayerTradeValue(b));

    // 단순 매칭 시도 (1:1 or 1:2)
    for (let p of buyerAssets) {
        const valToSeller = getContextualTradeValue(p, seller, true);
        const valToBuyer = getContextualTradeValue(targetPlayer, buyer, true);
        const salaryDiff = Math.abs(p.salary - targetPlayer.salary);

        // CPU간 트레이드는 성사 조건을 조금 더 완화 (상호 니즈 일치 시)
        if (valToSeller >= getPlayerTradeValue(targetPlayer) * 0.9 && salaryDiff < 10) {
            const updatedTeams = allTeams.map(t => {
                if (t.id === seller.id) {
                    const roster = t.roster.filter(rp => rp.id !== targetPlayer.id);
                    return { ...t, roster: [...roster, p] };
                }
                if (t.id === buyer.id) {
                    const roster = t.roster.filter(rp => rp.id !== p.id);
                    return { ...t, roster: [...roster, targetPlayer] };
                }
                return t;
            });

            const tx: Transaction = {
                id: `cpu_tr_${Date.now()}`,
                date: 'TODAY',
                type: 'Trade',
                teamId: buyer.id,
                description: `[CPU] ${buyer.name} - ${seller.name} 트레이드 합의`,
                details: {
                    acquired: [{ id: targetPlayer.id, name: targetPlayer.name, ovr: targetPlayer.ovr, position: targetPlayer.position }],
                    traded: [{ id: p.id, name: p.name, ovr: p.ovr, position: p.position }],
                    partnerTeamId: seller.id,
                    partnerTeamName: seller.name
                }
            };

            return { updatedTeams, transaction: tx };
        }
    }

    return null;
}

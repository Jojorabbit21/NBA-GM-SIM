
import { createClient } from '@supabase/supabase-js';

// --- Types ---
interface Player {
  id: string;
  name: string;
  position: string;
  age: number;
  salary: number;
  contractYears: number;
  ovr: number;
  potential: number;
  [key: string]: any;
}

interface Team {
  id: string;
  name: string;
  roster: Player[];
  wins?: number;
  losses?: number;
}

interface TradeOffer {
  teamId: string;
  teamName: string;
  players: Player[];
  diffValue: number;
}

// --- Configuration (Secret Logic) ---
const TRADE_CONFIG = {
    BASE: { REPLACEMENT_LEVEL_OVR: 40, VALUE_EXPONENT: 2.8 },
    AGE: { 
        YOUNG_LIMIT: 23, HIGH_POT_THRESHOLD: 80, YOUNG_POT_BONUS: 0.02,
        PRIME_START: 24, PRIME_END: 29, PRIME_BONUS: 1.1,
        OLD_START: 32, OLD_PENALTY_PER_YEAR: 0.08, MIN_OLD_VALUE: 0.3 
    },
    NEEDS: { WEAKNESS_THRESHOLD: 75, STRENGTH_THRESHOLD: 85 },
    CONTEXT: { FIT_BONUS: 0.20, REDUNDANCY_PENALTY: 0.15, SALARY_DUMP_BONUS: 0.1, EXPIRING_BONUS: 0.05 },
    ACCEPTANCE: { DEFAULT_RATIO: 1.05, STAR_SWAP_RATIO: 1.0, REBUILDING_POT_VALUATION: 1.3, WINNOW_VET_VALUATION: 1.2 }
};

// --- Helper Functions ---
function getPlayerTradeValue(p: Player): number {
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

function getTeamNeeds(team: Team): { needs: string[], isContender: boolean } {
    const top8 = [...team.roster].sort((a,b) => b.ovr - a.ovr).slice(0, 8);
    if (top8.length === 0) return { needs: [], isContender: false };
    
    const avgOvr = top8.reduce((s, p) => s + p.ovr, 0) / top8.length;
    const isContender = avgOvr >= 80;
    
    const needs: string[] = [];
    ['PG', 'SG', 'SF', 'PF', 'C'].forEach(pos => {
        const playersAtPos = top8.filter(p => p.position.includes(pos));
        if (playersAtPos.length === 0 || Math.max(...playersAtPos.map(p=>p.ovr)) < 75) {
            needs.push(pos);
        }
    });
    return { needs, isContender };
}

function getContextualTradeValue(player: Player, teamContext: Team, isAcquiring: boolean): number {
    const C = TRADE_CONFIG.CONTEXT;
    const A = TRADE_CONFIG.ACCEPTANCE;
    let value = getPlayerTradeValue(player);
    const { needs, isContender } = getTeamNeeds(teamContext);
    
    if (isAcquiring) {
        let fitMultiplier = 1.0;
        if (needs.some(n => player.position.includes(n))) fitMultiplier += C.FIT_BONUS;
        
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

function mapDbPlayer(p: any): Player {
    const attr = p.base_attributes || {};
    return {
        id: p.id,
        name: p.name,
        position: p.position,
        age: p.age,
        salary: p.salary,
        contractYears: p.contract_years,
        ovr: attr.ovr || p.ovr || 75,
        potential: attr.potential || 75,
        ...attr
    };
}

// --- Vercel Request Handler ---
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { action, payload } = req.body;
        
        const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
        const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
        const supabaseClient = createClient(supabaseUrl, supabaseKey);

        let result: any = {};

        // 1. Fetch DB Data (Shared for all actions)
        const { data: teamsData, error: teamsError } = await supabaseClient
            .from('meta_teams')
            .select('*, meta_players(*)');
            
        if (teamsError) throw teamsError;

        const allTeams: Team[] = teamsData.map((t: any) => ({
            id: t.id,
            name: t.name,
            roster: (t.meta_players || []).map(mapDbPlayer),
            wins: 0, 
            losses: 0
        }));

        const myTeam = allTeams.find(t => t.id === payload.myTeamId);
        
        // --- Logic 1: Generate Offers (AI -> User) ---
        if (action === 'generate-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { tradingPlayers, desiredPositions } = payload;
            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);

            const mySalary = tradingPlayers.reduce((sum: number, p: Player) => sum + p.salary, 0);
            const offers: TradeOffer[] = [];
            const C = TRADE_CONFIG.ACCEPTANCE;

            for (const targetTeam of otherTeams) {
                let userPackageValueToAI = 0;
                tradingPlayers.forEach((p: Player) => { 
                    userPackageValueToAI += getContextualTradeValue(p, targetTeam, true); 
                });

                if (userPackageValueToAI < 100) continue;

                const candidates = [...targetTeam.roster].sort((a,b) => getPlayerTradeValue(a) - getPlayerTradeValue(b));
                
                for (let i = 0; i < 200; i++) {
                    const packSize = Math.floor(Math.random() * 3) + 1; 
                    const tradePack: Player[] = [];
                    const visitedIndices = new Set<number>();
                    
                    if (desiredPositions && desiredPositions.length > 0) {
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
                    if (desiredPositions && desiredPositions.length > 0 && !tradePack.some(p => desiredPositions.includes(p.position))) continue;

                    let aiPackageValue = 0; 
                    let aiSalary = 0;
                    
                    tradePack.forEach(p => { 
                        aiPackageValue += getContextualTradeValue(p, targetTeam, false);
                        aiSalary += p.salary; 
                    });

                    const salaryRatio = mySalary > 0 ? aiSalary / mySalary : 0;
                    const isSalaryMatch = Math.abs(mySalary - aiSalary) < 5 || (salaryRatio >= 0.75 && salaryRatio <= 1.30);

                    if (isSalaryMatch && userPackageValueToAI >= aiPackageValue * C.DEFAULT_RATIO) {
                        const isDup = offers.some(o => o.teamId === targetTeam.id && o.players.length === tradePack.length && o.players.every(p => tradePack.some(tp => tp.id === p.id)));
                        if (!isDup) {
                            const rawUserVal = tradingPlayers.reduce((s:number, p:Player) => s + getPlayerTradeValue(p), 0);
                            const rawTargetVal = tradePack.reduce((s:number, p:Player) => s + getPlayerTradeValue(p), 0);
                            offers.push({ 
                                teamId: targetTeam.id, 
                                teamName: targetTeam.name, 
                                players: tradePack, 
                                diffValue: rawTargetVal - rawUserVal 
                            });
                        }
                    }
                }
            }
            result = { offers: offers.sort((a, b) => b.diffValue - a.diffValue).slice(0, 5) };
        } 
        
        // --- Logic 2: Generate Counter Offers (User -> AI) ---
        else if (action === 'generate-counter-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { targetPlayers, targetTeamId } = payload;
            const targetTeam = allTeams.find(t => t.id === targetTeamId);
            if (!targetTeam) throw new Error("Target team not found");

            let targetPackageValue = 0;
            let targetSalary = 0;

            targetPlayers.forEach((p: Player) => {
                targetPackageValue += getContextualTradeValue(p, targetTeam, false); 
                targetSalary += p.salary;
            });

            const myCandidates = [...myTeam.roster].sort((a,b) => getPlayerTradeValue(b) - getPlayerTradeValue(a)); 
            const counterOffers: TradeOffer[] = [];
            const C = TRADE_CONFIG.ACCEPTANCE;

            for (let i = 0; i < 200; i++) {
                const packSize = Math.floor(Math.random() * 3) + 1;
                const tradePack: Player[] = [];
                const visited = new Set<number>();
                
                for (let k = 0; k < packSize; k++) {
                    const idx = Math.floor(Math.random() * myCandidates.length);
                    if (!visited.has(idx)) { visited.add(idx); tradePack.push(myCandidates[idx]); }
                }
                
                if (tradePack.length === 0) continue;

                let myPackageValueToAI = 0; 
                let mySalary = 0;

                tradePack.forEach(p => {
                    myPackageValueToAI += getContextualTradeValue(p, targetTeam, true);
                    mySalary += p.salary;
                });

                const salaryRatio = targetSalary > 0 ? mySalary / targetSalary : 0;
                const isSalaryMatch = Math.abs(targetSalary - mySalary) < 5 || (salaryRatio >= 0.75 && salaryRatio <= 1.30);

                if (isSalaryMatch && myPackageValueToAI >= targetPackageValue * C.DEFAULT_RATIO) {
                     const isDup = counterOffers.some(o => o.players.length === tradePack.length && o.players.every(p => tradePack.some(tp => tp.id === p.id)));
                     if (!isDup) {
                        const rawTargetVal = targetPlayers.reduce((s:number, p:Player) => s + getPlayerTradeValue(p), 0);
                        const rawUserVal = tradePack.reduce((s:number, p:Player) => s + getPlayerTradeValue(p), 0);
                        
                        counterOffers.push({ 
                            teamId: myTeam.id, 
                            teamName: myTeam.name, 
                            players: tradePack, 
                            diffValue: rawUserVal - rawTargetVal 
                        });
                     }
                }
            }
            result = { offers: counterOffers.sort((a,b) => a.diffValue - b.diffValue).slice(0, 3) };
        }

        // --- Logic 3: Simulate CPU Trades (AI <-> AI) ---
        else if (action === 'simulate-cpu-trades') {
            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);
            if (otherTeams.length < 2) {
                result = { success: false, reason: "Not enough teams" };
            } else {
                // Determine Buyers and Sellers
                // In a real DB-backed scenario, we could use wins/losses to identify buyers.
                // For now, we randomize to create dynamic league movement.
                const shuffled = [...otherTeams].sort(() => 0.5 - Math.random());
                const buyer = shuffled[0];
                const seller = shuffled[1];

                // Seller gives up a Veteran (OVR 78+, Age 26+, Salary > 5M)
                const sellerAssets = seller.roster
                    .filter(p => p.ovr >= 78 && p.age >= 26 && p.salary > 5) 
                    .sort((a, b) => b.ovr - a.ovr);
                
                if (sellerAssets.length > 0) {
                    const targetVet = sellerAssets[0];

                    // Buyer gives up a Young Prospect (Age <= 24, High Potential)
                    const buyerAssets = buyer.roster
                        .filter(p => p.age <= 24 && p.potential >= 80 && p.id !== buyer.roster[0].id) // Don't trade their best player
                        .sort((a, b) => b.potential - a.potential);
                    
                    if (buyerAssets.length > 0) {
                        const tradeAsset = buyerAssets[0];
                        const salaryDiff = targetVet.salary - tradeAsset.salary;
                        const buyerPackage = [tradeAsset];

                        // Salary Matching: If Vet is expensive, Buyer needs to add fillers
                        if (salaryDiff > 5) {
                            const filler = buyer.roster
                                .filter(p => p.id !== tradeAsset.id && p.ovr < 75)
                                .sort((a,b) => Math.abs(b.salary - salaryDiff) - Math.abs(a.salary - salaryDiff))[0];
                            if (filler) buyerPackage.push(filler);
                        }

                        const vetValue = getPlayerTradeValue(targetVet);
                        const packageValue = buyerPackage.reduce((sum, p) => sum + getPlayerTradeValue(p), 0);
                        const packageSalary = buyerPackage.reduce((sum, p) => sum + p.salary, 0);
                        
                        const salaryMatch = Math.abs(packageSalary - targetVet.salary) < 8 || (packageSalary > 0 && targetVet.salary / packageSalary < 1.25 && targetVet.salary / packageSalary > 0.75);
                        const valueFair = packageValue >= vetValue * 0.85; 

                        if (salaryMatch && valueFair) {
                            // Construct Transaction Object
                            const transaction = {
                                id: `cpu_tr_${Date.now()}`,
                                date: 'TODAY',
                                type: 'Trade',
                                teamId: buyer.id,
                                description: `[CPU] ${buyer.name} (Buyer) - ${seller.name} (Seller) 빅딜 성사`,
                                details: {
                                    acquired: [{ id: targetVet.id, name: targetVet.name, ovr: targetVet.ovr, position: targetVet.position }],
                                    traded: buyerPackage.map(p => ({ id: p.id, name: p.name, ovr: p.ovr, position: p.position })),
                                    partnerTeamId: seller.id,
                                    partnerTeamName: seller.name
                                }
                            };
                            result = { success: true, transaction };
                        } else {
                            result = { success: false, reason: "Trade conditions not met" };
                        }
                    } else {
                        result = { success: false, reason: "No buyer assets" };
                    }
                } else {
                    result = { success: false, reason: "No seller assets" };
                }
            }
        }
        else {
            throw new Error(`Unknown action: ${action}`);
        }

        res.status(200).json(result);

    } catch (error: any) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
}

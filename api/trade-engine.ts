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
  health?: 'Healthy' | 'Injured' | 'Day-to-Day'; 
  injuryType?: string;
  returnDate?: string;
  // Stats
  def: number;
  out: number; 
  reb: number;
  plm: number;
  ins: number; 
  ath: number;
  intDef: number;
  perDef: number;
  height: number;
  [key: string]: any;
}

interface Team {
  id: string;
  name: string;
  roster: Player[];
  wins?: number;
  losses?: number;
  salaryCap?: number;
  luxuryTaxLine?: number;
}

interface TradeOffer {
  teamId: string;
  teamName: string;
  players: Player[];
  diffValue: number;
  analysis?: string[];
}

interface TeamNeeds {
    weakPositions: string[];
    strongPositions: string[];
    statNeeds: string[]; // 'DEF', 'REB', '3PT'
    isContender: boolean;
    isSeller: boolean; 
    capSpace: number;
    isTaxPayer: boolean;
}

// --- Configuration ---
const TRADE_CONFIG = {
    BASE: { 
        REPLACEMENT_LEVEL_OVR: 40, 
        VALUE_EXPONENT: 3.0, 
        SUPERSTAR_PREMIUM_THRESHOLD: 94,
        SUPERSTAR_MULTIPLIER: 1.5 
    },
    CONTRACT: {
        VALUE_MULTIPLIER: 1.1, 
        BAD_CONTRACT_PENALTY: 0.7, 
    },
    NEEDS: { 
        POSITION_BONUS: 0.25,
        STAT_BONUS: 0.15,
        SALARY_DUMP_BONUS: 0.2 
    },
    SALARY: {
        CAP_LINE: 140,
        TAX_LINE: 170, 
        APRON_1: 178,
        APRON_2: 189
    },
    INJURY: { 
        DTD_PENALTY: 0.90, 
        INJURED_PENALTY: 0.10 
    },
    DEPTH: {
        MAX_CORE_ASSETS_IN_DEAL: 2, 
        MIN_ROSTER_SIZE: 13
    }
};

const normalizeName = (name: string): string => {
    if (!name) return "";
    return name.replace(/[\s\.\,\-\u3000\u00a0\u200b]+/g, '').replace(/(II|III|IV|Jr|Sr)$/i, '').toLowerCase().trim();
};

// 1. Calculate Base Trade Value
function getPlayerTradeValue(p: Player): number {
    const C = TRADE_CONFIG;
    const safeOvr = typeof p.ovr === 'number' ? p.ovr : 70;
    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, safeOvr);
    
    let baseValue = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    if (safeOvr >= C.BASE.SUPERSTAR_PREMIUM_THRESHOLD) baseValue *= C.BASE.SUPERSTAR_MULTIPLIER;
    else if (safeOvr >= 88) baseValue *= 1.15; 

    if (p.age <= 23 && p.potential > safeOvr) {
        const potDiff = p.potential - safeOvr;
        baseValue *= (1.0 + (potDiff * 0.05));
    } else if (p.age >= 32) {
        baseValue *= Math.max(0.1, 1.0 - ((p.age - 31) * 0.1));
    }

    if (safeOvr < 80 && p.salary > 20) baseValue *= C.CONTRACT.BAD_CONTRACT_PENALTY;

    if (p.health === 'Injured') {
        baseValue *= C.INJURY.INJURED_PENALTY;
    } else if (p.health === 'Day-to-Day') {
        baseValue *= C.INJURY.DTD_PENALTY;
    }

    return Math.max(1, Math.floor(baseValue));
}

// 2. Analyze Team Needs
function analyzeTeamSituation(team: Team): TeamNeeds {
    const roster = team.roster;
    const sorted = [...roster].sort((a, b) => b.ovr - a.ovr);
    const top8 = sorted.slice(0, 8);
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const weakPositions: string[] = [];
    const strongPositions: string[] = [];
    
    positions.forEach(pos => {
        const depth = roster.filter(p => p.position.includes(pos));
        const bestAtPos = depth.reduce((max, p) => p.ovr > (max?.ovr || 0) ? p : max, null as Player | null);
        if (!bestAtPos || bestAtPos.ovr < 75 || depth.length < 2) {
            weakPositions.push(pos);
        } else if (bestAtPos.ovr >= 85) {
            strongPositions.push(pos);
        }
    });

    const statNeeds: string[] = [];
    const avgDef = top8.reduce((sum, p) => sum + (p.def || 50), 0) / top8.length;
    const avgReb = top8.reduce((sum, p) => sum + (p.reb || 50), 0) / top8.length;
    const avgOut = top8.reduce((sum, p) => sum + (p.out || 50), 0) / top8.length;

    if (avgDef < 70) statNeeds.push('DEF');
    if (avgReb < 70) statNeeds.push('REB');
    if (avgOut < 70) statNeeds.push('3PT');

    const top3Ovr = sorted.slice(0, 3).reduce((sum, p) => sum + p.ovr, 0) / 3;
    const isContender = top3Ovr >= 85 || (team.wins || 0) > (team.losses || 0) + 5;
    const isSeller = !isContender && ((team.wins || 0) < (team.losses || 0) - 5);

    const currentCap = roster.reduce((sum, p) => sum + p.salary, 0);
    const capSpace = TRADE_CONFIG.SALARY.CAP_LINE - currentCap;
    const isTaxPayer = currentCap > TRADE_CONFIG.SALARY.TAX_LINE;

    return {
        weakPositions,
        strongPositions,
        statNeeds,
        isContender,
        isSeller,
        capSpace,
        isTaxPayer
    };
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { action, payload } = req.body;

    try {
        if (action === 'generate-offers') {
            const { myTeamId, leagueState, tradingPlayers, desiredPositions } = payload;
            const myTeam = leagueState.find((t: Team) => t.id === myTeamId);
            
            const offers: TradeOffer[] = [];
            const outgoingValue = tradingPlayers.reduce((sum: number, p: Player) => sum + getPlayerTradeValue(p), 0);
            
            for (const otherTeam of leagueState) {
                if (otherTeam.id === myTeamId) continue;
                const needs = analyzeTeamSituation(otherTeam);
                
                // Basic matching logic
                let interestScore = 0;
                tradingPlayers.forEach((p: Player) => {
                    if (needs.weakPositions.some(pos => p.position.includes(pos))) interestScore += 2;
                    if (needs.statNeeds.includes('DEF') && p.def > 75) interestScore += 1;
                    if (needs.isSeller && p.age < 25) interestScore += 2;
                    if (needs.isContender && p.ovr > 80) interestScore += 2;
                });

                if (interestScore > 0) {
                    const tradeable = otherTeam.roster
                        .filter((p: Player) => p.ovr < 90) // Simplified untouchable logic
                        .sort((a: Player, b: Player) => getPlayerTradeValue(b) - getPlayerTradeValue(a));
                    
                    let packageVal = 0;
                    const pkg: Player[] = [];
                    for (const p of tradeable) {
                        if (packageVal < outgoingValue * 1.1 && pkg.length < 3) {
                            pkg.push(p);
                            packageVal += getPlayerTradeValue(p);
                        }
                    }
                    
                    if (pkg.length > 0 && packageVal >= outgoingValue * 0.8) {
                        offers.push({
                            teamId: otherTeam.id,
                            teamName: otherTeam.name,
                            players: pkg,
                            diffValue: packageVal - outgoingValue,
                            analysis: [`Interest Score: ${interestScore}`]
                        });
                    }
                }
            }
            
            return res.status(200).json({ offers: offers.slice(0, 5) });
        }
        
        // Placeholder for other actions
        if (action === 'generate-counter-offers') {
             return res.status(200).json({ offers: [] });
        }

        if (action === 'simulate-cpu-trades') {
             return res.status(200).json({ success: true, transaction: null });
        }
        
        return res.status(400).json({ message: 'Unknown action' });
    } catch (e: any) {
        return res.status(500).json({ message: e.message });
    }
}
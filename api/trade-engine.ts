
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
  // Specific Stats for Need Analysis
  def: number;
  out: number; 
  reb: number;
  plm: number;
  intDef: number; // Added for detailed calculation
  perDef: number;
  threeCorner: number;
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

// --- Debug Logger ---
const DEBUG = true;
const LOG = (msg: string, data?: any) => {
    if (DEBUG) {
        if (data) console.log(`[TradeEngine] ${msg}`, JSON.stringify(data, null, 2));
        else console.log(`[TradeEngine] ${msg}`);
    }
};

// --- Configuration ---
const TRADE_CONFIG = {
    BASE: { 
        REPLACEMENT_LEVEL_OVR: 40, 
        // Reduced exponent to make values more linear and easier to match
        VALUE_EXPONENT: 2.5, 
        SUPERSTAR_PREMIUM_THRESHOLD: 88,
        SUPERSTAR_MULTIPLIER: 1.3 
    },
    CONTRACT: {
        VALUE_MULTIPLIER: 1.1, 
        BAD_CONTRACT_PENALTY: 0.8, 
    },
    NEEDS: { 
        POSITION_BONUS: 0.2,
        STAT_BONUS: 0.15,
        SALARY_DUMP_BONUS: 0.2 
    },
    SALARY: {
        TAX_LINE: 170, 
        FLOOR_MATCH: 0.75, 
        CEILING_MATCH: 1.25
    }
};

// --- Helper Functions ---

// 1. Calculate Base Trade Value
function getPlayerTradeValue(p: Player): number {
    const C = TRADE_CONFIG;
    // Safety check for OVR
    const safeOvr = typeof p.ovr === 'number' ? p.ovr : 70;
    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, safeOvr);
    
    // 1. Base OVR Value
    let baseValue = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    // 2. Superstar Premium
    if (safeOvr >= C.BASE.SUPERSTAR_PREMIUM_THRESHOLD) {
        baseValue *= C.BASE.SUPERSTAR_MULTIPLIER;
    }

    // 3. Age & Potential
    if (p.age <= 23) {
        if (p.potential > safeOvr) {
            const potBonus = 1.0 + Math.min(0.5, (p.potential - 70) * 0.02);
            baseValue *= potBonus;
        }
    } else if (p.age >= 32) {
        const decline = (p.age - 31) * 0.15;
        baseValue *= Math.max(0.1, 1.0 - decline);
    }

    // 4. Contract Efficiency (Simplified)
    if (safeOvr < 85 && p.salary > 25) {
         baseValue *= C.CONTRACT.BAD_CONTRACT_PENALTY;
    }

    return Math.max(1, Math.floor(baseValue));
}

// 2. Analyze Team Needs (Improved Logic)
function analyzeTeamSituation(team: Team): TeamNeeds {
    const roster = team.roster;
    // Sort by OVR for top-end talent check
    const sorted = [...roster].sort((a, b) => b.ovr - a.ovr);
    const top8 = sorted.slice(0, 8);
    
    // Position Depth Check (Improved mapping)
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const weakPositions: string[] = [];
    const strongPositions: string[] = [];
    
    positions.forEach(pos => {
        // Map general positions (G, F) to specific ones
        const depth = roster.filter(p => {
            if (p.ovr < 70) return false; 
            if (p.position === pos) return true;
            if ((pos === 'PG' || pos === 'SG') && p.position === 'G') return true;
            if ((pos === 'SF' || pos === 'PF') && p.position === 'F') return true;
            return false;
        });

        const bestAtPos = depth.length > 0 ? depth.reduce((max, p) => p.ovr > max.ovr ? p : max) : null;
        
        // Weak if no starter > 76 OR very thin depth
        if (!bestAtPos || bestAtPos.ovr < 76 || depth.length < 2) {
            weakPositions.push(pos);
        }
        // Strong if starter > 82 AND backup exists
        if (bestAtPos && bestAtPos.ovr > 82 && depth.length >= 3) {
            strongPositions.push(pos);
        }
    });

    // Stat Needs (Thresholds lowered slightly to be realistic)
    const statNeeds: string[] = [];
    const avgDef = top8.reduce((s, p) => s + (p.def || 50), 0) / top8.length;
    const avgOut = top8.reduce((s, p) => s + (p.out || 50), 0) / top8.length;
    const avgReb = top8.reduce((s, p) => s + (p.reb || 50), 0) / top8.length;

    if (avgDef < 65) statNeeds.push('DEF');
    if (avgOut < 68) statNeeds.push('3PT');
    if (avgReb < 60) statNeeds.push('REB');

    const totalSalary = roster.reduce((s, p) => s + p.salary, 0);
    const taxLine = team.luxuryTaxLine || TRADE_CONFIG.SALARY.TAX_LINE;
    const isTaxPayer = totalSalary > taxLine;
    
    const top2Ovr = (top8[0]?.ovr || 0) + (top8[1]?.ovr || 0);
    const isContender = top2Ovr > 170; // 85+ avg duo
    const isSeller = !isContender && (team.wins || 0) < (team.losses || 0) * 1.5;

    return { weakPositions, strongPositions, statNeeds, isContender, isSeller, capSpace: taxLine - totalSalary, isTaxPayer };
}

// 3. Contextual Value
function getContextualValue(player: Player, needs: TeamNeeds, isAcquiring: boolean, log: string[] = []): number {
    let value = getPlayerTradeValue(player);
    const C = TRADE_CONFIG.NEEDS;

    if (isAcquiring) {
        // Fit Bonus
        let fitMult = 1.0;
        if (needs.weakPositions.some(pos => player.position.includes(pos))) {
            fitMult += C.POSITION_BONUS;
        }
        if (needs.statNeeds.includes('DEF') && player.def > 75) fitMult += 0.1;
        if (needs.statNeeds.includes('3PT') && player.out > 75) fitMult += 0.1;
        if (needs.statNeeds.includes('REB') && player.reb > 75) fitMult += 0.1;

        value *= fitMult;

        // Strategy Bonus
        if (needs.isContender && player.ovr >= 80) value *= 1.2;
        if (needs.isSeller && player.age <= 23) value *= 1.25;

    } else {
        // Selling Logic
        if (needs.isSeller && player.age > 28) value *= 0.8; // Willing to dump vets
        if (needs.isContender && player.ovr > 78) value *= 1.2; // Reluctant to trade contributors
    }

    return Math.floor(value);
}

// 4. Untouchables
function getUntouchables(team: Team, needs: TeamNeeds): Set<string> {
    const untouchables = new Set<string>();
    const roster = [...team.roster].sort((a, b) => b.ovr - a.ovr);
    
    if (needs.isContender) {
        // Keep top 3 players
        roster.slice(0, 3).forEach(p => untouchables.add(p.id));
    } else {
        // Keep young prospects
        roster.filter(p => p.age <= 24 && p.potential >= 82).forEach(p => untouchables.add(p.id));
        // Franchise player if young
        if (roster[0] && roster[0].age <= 27) untouchables.add(roster[0].id);
    }
    return untouchables;
}

// 5. Data Mapper
function mapDbPlayer(p: any): Player {
    const attr = p.base_attributes || {};
    const v = (k1: string, k2: string, def = 50) => 
        (attr[k1] !== undefined ? attr[k1] : (p[k1] !== undefined ? p[k1] : (p[k2] !== undefined ? p[k2] : def)));

    const def = v('def', 'def', 50);
    const out = v('out', 'out', 50);
    const reb = v('reb', 'reb', 50);
    const plm = v('plm', 'plm', 50);

    return {
        id: p.id,
        name: p.name,
        position: p.position,
        age: p.age,
        salary: p.salary,
        contractYears: p.contract_years,
        ovr: attr.ovr || p.ovr || 70,
        potential: attr.potential || p.pot || 75,
        def, out, reb, plm,
        intDef: v('intDef', 'idef'), perDef: v('perDef', 'pdef'), threeCorner: v('threeCorner', '3c'),
        ...attr
    };
}


// --- API Handler ---
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { action, payload } = req.body;
        const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
        const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
        const supabaseClient = createClient(supabaseUrl, supabaseKey);

        LOG(`Action Received: ${action}`);

        const { data: teamsData, error: teamsError } = await supabaseClient
            .from('meta_teams')
            .select('*, meta_players(*)');
        if (teamsError) throw teamsError;

        const allTeams: Team[] = teamsData.map((t: any) => ({
            id: t.id, name: t.name, roster: (t.meta_players || []).map(mapDbPlayer),
            salaryCap: 140, luxuryTaxLine: 170 
        }));
        const myTeam = allTeams.find(t => t.id === payload.myTeamId);
        
        let result: any = null;

        if (action === 'generate-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { tradingPlayers, desiredPositions } = payload;
            const offers: TradeOffer[] = [];
            
            LOG(`Generating offers for ${tradingPlayers.length} players`, tradingPlayers.map((p: any) => `${p.name}(${p.ovr})`));

            const userSalary = tradingPlayers.reduce((sum: number, p: Player) => sum + p.salary, 0);
            const userOvrMax = Math.max(...tradingPlayers.map((p: Player) => p.ovr));
            const isSuperstarTrade = userOvrMax >= 88;

            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);

            for (const targetTeam of otherTeams) {
                const logs: string[] = [];
                const needs = analyzeTeamSituation(targetTeam);
                const untouchables = getUntouchables(targetTeam, needs);
                
                let userValueToAI = 0;
                tradingPlayers.forEach((p: Player) => {
                    const val = getContextualValue(p, needs, true, logs);
                    userValueToAI += val;
                });
                
                // [LOG] AI Valuation of User Package
                if (Math.random() < 0.1) {
                    LOG(`[Target: ${targetTeam.name}] AI values user package at ${userValueToAI}. Needs: ${needs.weakPositions.join(', ')}`);
                }

                // Threshold Check - lowered to catch even low value assets
                if (userValueToAI < 100) { 
                    // LOG(`Skipping ${targetTeam.name}: Value too low (${userValueToAI})`);
                    continue; 
                }

                // Candidate Pool: Exclude untouchables (unless superstar trade)
                let candidates = targetTeam.roster.filter(p => {
                     if (isSuperstarTrade) return p.ovr < 97; 
                     return !untouchables.has(p.id);
                });
                
                // Shuffle candidates to randomize logic, don't just sort low-to-high
                candidates = candidates.sort(() => Math.random() - 0.5);

                for (let i = 0; i < 30; i++) {
                    const pack: Player[] = [];
                    let packValue = 0;
                    let packSalary = 0;
                    
                    // 1. Mandatory Core Piece if Superstar Trade
                    if (isSuperstarTrade) {
                         const core = candidates.find(p => p.ovr >= 82 || (p.potential >= 88 && p.age <= 24));
                         if (!core) {
                             if (i === 0) LOG(`[Target: ${targetTeam.name}] No core assets for superstar trade.`);
                             break;
                         }
                         pack.push(core);
                         packValue += getContextualValue(core, needs, false);
                         packSalary += core.salary;
                    }

                    // 2. Fill Logic (Smarter Loop)
                    let attempts = 0;
                    const salaryMin = needs.isTaxPayer ? userSalary * 0.8 : userSalary * 0.75;
                    const valueTarget = userValueToAI; 

                    while (attempts < 20 && pack.length < 5) {
                        attempts++;
                        const isSalOk = packSalary >= salaryMin;
                        // AI is okay if it gives slightly less value (0.7) or more (1.3)
                        const isValOk = packValue >= valueTarget * 0.7; 

                        if (isSalOk && isValOk) break;

                        // What do we need?
                        const salDeficit = salaryMin - packSalary;
                        const valDeficit = valueTarget - packValue;
                        
                        let nextPiece: Player | undefined;
                        const pool = candidates.filter(p => !pack.includes(p));
                        
                        if (pool.length === 0) break;

                        if (!isValOk && valDeficit > 1500) { // If value gap is huge
                            // Need Value: Find best available player
                            const best = [...pool].sort((a,b) => getPlayerTradeValue(b) - getPlayerTradeValue(a))[0];
                            if (best && (packSalary + best.salary < userSalary * 1.35)) {
                                nextPiece = best;
                            } else {
                                // Fallback: Random but prefer younger/higher pot
                                nextPiece = pool.find(p => p.potential > 80);
                            }
                        } else if (!isSalOk) {
                            // Need Salary: Find player matching deficit
                            // Prioritize bad contracts if AI is rebuilding
                            if (needs.isSeller) {
                                nextPiece = pool.find(p => p.salary > 20) || pool.find(p => Math.abs(p.salary - salDeficit) < 5);
                            } else {
                                nextPiece = pool.find(p => Math.abs(p.salary - salDeficit) < 5) || pool.sort((a,b) => b.salary - a.salary)[0];
                            }
                        } else {
                            // Just filler (low value, low salary)
                            nextPiece = pool.find(p => p.ovr < 75 && p.salary < 5);
                        }

                        if (!nextPiece) nextPiece = pool[Math.floor(Math.random() * pool.length)];

                        if (nextPiece) {
                            pack.push(nextPiece);
                            packValue += getContextualValue(nextPiece, needs, false);
                            packSalary += nextPiece.salary;
                        }
                    }

                    // 3. Final Validation
                    const salRatio = userSalary > 0 ? packSalary / userSalary : 0;
                    const valRatio = userValueToAI > 0 ? packValue / userValueToAI : 0;
                    
                    const validSalary = Math.abs(packSalary - userSalary) < 5 || (salRatio >= 0.70 && salRatio <= 1.35); // Widened range
                    const validValue = valRatio >= 0.60 && valRatio <= 1.4; // Widened range

                    const posValid = desiredPositions.length === 0 || pack.some(p => desiredPositions.some((dp: string) => p.position.includes(dp)));

                    if (validSalary && validValue && posValid && pack.length > 0) {
                        const isDup = offers.some(o => o.teamId === targetTeam.id && o.players.every((p: Player) => pack.some((pk: Player) => pk.id === p.id)));
                        if (!isDup) {
                            LOG(`[Target: ${targetTeam.name}] Offer Created! PackValue: ${packValue}, UserValue: ${userValueToAI}, Ratio: ${valRatio.toFixed(2)}`);
                            const reason = [];
                            if (needs.weakPositions.length > 0) reason.push(`Weak: ${needs.weakPositions.join(',')}`);
                            if (isSuperstarTrade) reason.push("Blockbuster");
                            else if (packValue < userValueToAI) reason.push("Value Win");
                            
                            offers.push({
                                teamId: targetTeam.id,
                                teamName: targetTeam.name,
                                players: pack,
                                diffValue: packValue - userValueToAI,
                                analysis: reason
                            });
                        }
                    } else if (i === 0) {
                        // Log failure reason only for the first attempt to avoid spam
                        // LOG(`[Target: ${targetTeam.name}] Failed Logic: SalRatio=${salRatio.toFixed(2)} (${validSalary}), ValRatio=${valRatio.toFixed(2)} (${validValue}), Pack=${pack.length}`);
                    }
                }
            }
            LOG(`Total Offers Generated: ${offers.length}`);
            result = { offers: offers.sort((a, b) => b.diffValue - a.diffValue).slice(0, 5) };
        }

        else if (action === 'generate-counter-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { targetPlayers, targetTeamId } = payload;
            const targetTeam = allTeams.find(t => t.id === targetTeamId);
            if (!targetTeam) throw new Error("Target team not found");

            const needs = analyzeTeamSituation(targetTeam);
            const untouchables = getUntouchables(targetTeam, needs);

            if (targetPlayers.some((p: Player) => untouchables.has(p.id))) {
                 LOG(`Warning: Target includes untouchables.`);
            }

            let targetValueToAI = 0;
            let targetSalary = 0;
            targetPlayers.forEach((p: Player) => {
                let v = getContextualValue(p, needs, false); 
                targetValueToAI += v;
                targetSalary += p.salary;
            });

            LOG(`User targeting ${targetPlayers.length} players from ${targetTeam.name}. Total Val: ${targetValueToAI}`);

            const candidates = myTeam.roster.sort((a,b) => b.ovr - a.ovr);
            const offers: TradeOffer[] = [];

            for (let i = 0; i < 30; i++) {
                const pack: Player[] = [];
                let packValue = 0;
                let packSalary = 0;

                const neededPlayers = candidates.filter(p => needs.weakPositions.some(wp => p.position.includes(wp)) && !pack.includes(p));
                if (neededPlayers.length > 0) {
                     const p = neededPlayers[0];
                     pack.push(p);
                     packValue += getContextualValue(p, needs, true);
                     packSalary += p.salary;
                }

                let attempts = 0;
                while (attempts < 20 && pack.length < 5) {
                    attempts++;
                    const salaryNeeded = targetSalary - packSalary;
                    const valueNeeded = targetValueToAI - packValue;

                    if (Math.abs(salaryNeeded) < 5 && valueNeeded <= 0) break;

                    let pool = candidates.filter(p => !pack.includes(p));
                    let next: Player | undefined;

                    if (salaryNeeded > 5) {
                        next = pool.find(p => Math.abs(p.salary - salaryNeeded) < 5) || pool.find(p => p.salary < salaryNeeded + 5);
                    } else if (valueNeeded > 0) {
                         next = pool[0]; // Best remaining
                    } else {
                         next = pool.find(p => p.salary < 5); 
                    }

                    if (next) {
                         pack.push(next);
                         packValue += getContextualValue(next, needs, true);
                         packSalary += next.salary;
                    }
                }

                const salRatio = targetSalary > 0 ? packSalary / targetSalary : 0;
                const isSal = Math.abs(packSalary - targetSalary) < 5 || (salRatio >= 0.75 && salRatio <= 1.25);
                const isVal = packValue >= targetValueToAI * 0.9;

                if (isSal && isVal) {
                    const isDup = offers.some(o => o.players.every((p: Player) => pack.some((pk: Player) => pk.id === p.id)));
                    if (!isDup) {
                        offers.push({
                            teamId: myTeam.id,
                            teamName: myTeam.name,
                            players: pack,
                            diffValue: packValue - targetValueToAI,
                            analysis: [`Fair Exchange`]
                        });
                    }
                }
            }
            result = { offers: offers.sort((a,b) => a.diffValue - b.diffValue).slice(0, 3) };
        }
        
        else if (action === 'simulate-cpu-trades') {
            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);
            if (otherTeams.length < 2) {
                result = { success: false, reason: "Not enough teams" };
            } else {
                const sellers = otherTeams.filter(t => analyzeTeamSituation(t).isSeller);
                const buyers = otherTeams.filter(t => analyzeTeamSituation(t).isContender);
                
                if (sellers.length > 0 && buyers.length > 0) {
                    const seller = sellers[Math.floor(Math.random() * sellers.length)];
                    const buyer = buyers[Math.floor(Math.random() * buyers.length)];
                    
                    if (seller.id !== buyer.id) {
                         const tradeAsset = seller.roster.find(p => p.age >= 28 && p.salary > 10 && p.ovr > 78);
                         if (tradeAsset) {
                             const buyerAssets = buyer.roster.filter(p => (p.age <= 24 && p.potential > 75) || (p.salary > 5 && p.ovr < 75));
                             let pack: Player[] = [];
                             let packSal = 0;
                             let packVal = 0;
                             
                             buyerAssets.sort((a,b) => a.ovr - b.ovr); 
                             
                             for (const p of buyerAssets) {
                                 if (packSal >= tradeAsset.salary * 0.8) break;
                                 pack.push(p);
                                 packSal += p.salary;
                                 packVal += getPlayerTradeValue(p);
                             }

                             const assetVal = getPlayerTradeValue(tradeAsset);
                             const isSal = packSal >= tradeAsset.salary * 0.75 && packSal <= tradeAsset.salary * 1.25;
                             const isVal = packVal >= assetVal * 0.8; 

                             if (isSal && isVal && pack.length > 0) {
                                 result = {
                                     success: true,
                                     transaction: {
                                         id: `cpu_tr_${Date.now()}`,
                                         date: 'TODAY',
                                         type: 'Trade',
                                         teamId: buyer.id,
                                         description: `[CPU] ${buyer.name} acquires ${tradeAsset.name}`,
                                         details: {
                                             acquired: [{ id: tradeAsset.id, name: tradeAsset.name, ovr: tradeAsset.ovr, position: tradeAsset.position }],
                                             traded: pack.map((p: Player) => ({ id: p.id, name: p.name, ovr: p.ovr, position: p.position })),
                                             partnerTeamId: seller.id,
                                             partnerTeamName: seller.name
                                         }
                                     }
                                 };
                             }
                         }
                    }
                }
            }
            if (!result) result = { success: false, reason: "No valid CPU trade found" };
        }

        res.status(200).json(result);

    } catch (error: any) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
}

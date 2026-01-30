
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
        // [Balance] Increased exponent from 2.5 to 2.9 to emphasize QUALITY over QUANTITY.
        // Now 1x 85 OVR >>> 5x 70 OVR in math value.
        VALUE_EXPONENT: 2.9, 
        SUPERSTAR_PREMIUM_THRESHOLD: 88,
        SUPERSTAR_MULTIPLIER: 1.5 
    },
    CONTRACT: {
        VALUE_MULTIPLIER: 1.1, 
        BAD_CONTRACT_PENALTY: 0.8, 
    },
    NEEDS: { 
        POSITION_BONUS: 0.25,
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
    
    // 1. Base OVR Value (Exponential Curve)
    let baseValue = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    // 2. Superstar Premium (Significant Boost)
    if (safeOvr >= C.BASE.SUPERSTAR_PREMIUM_THRESHOLD) {
        baseValue *= C.BASE.SUPERSTAR_MULTIPLIER;
    }

    // 3. Age & Potential
    if (p.age <= 23) {
        // High potential young players get massive value boost
        if (p.potential > safeOvr) {
            const potDiff = p.potential - safeOvr;
            const potBonus = 1.0 + (potDiff * 0.05); // 5% bonus per potential point diff
            baseValue *= potBonus;
        }
    } else if (p.age >= 31) {
        // Age decline
        const decline = (p.age - 30) * 0.1;
        baseValue *= Math.max(0.1, 1.0 - decline);
    }

    // 4. Contract Efficiency
    // Don't penalize superstars for high salary, but penalize bad role players
    if (safeOvr < 80 && p.salary > 20) {
         baseValue *= C.CONTRACT.BAD_CONTRACT_PENALTY;
    }

    return Math.max(1, Math.floor(baseValue));
}

// 2. Analyze Team Needs
function analyzeTeamSituation(team: Team): TeamNeeds {
    const roster = team.roster;
    // Sort by OVR for top-end talent check
    const sorted = [...roster].sort((a, b) => b.ovr - a.ovr);
    const top8 = sorted.slice(0, 8);
    
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const weakPositions: string[] = [];
    const strongPositions: string[] = [];
    
    positions.forEach(pos => {
        const depth = roster.filter(p => p.position.includes(pos));
        const bestAtPos = depth.reduce((max, p) => p.ovr > (max?.ovr || 0) ? p : max, null as Player | null);
        
        // Weak if no starter > 75 OR very thin depth
        if (!bestAtPos || bestAtPos.ovr < 75 || depth.length < 2) {
            weakPositions.push(pos);
        }
        // Strong if starter > 82
        if (bestAtPos && bestAtPos.ovr > 82) {
            strongPositions.push(pos);
        }
    });

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
    
    // Contender Logic: If top 2 players average 85+ OVR
    const top2Ovr = (sorted[0]?.ovr || 0) + (sorted[1]?.ovr || 0);
    const isContender = top2Ovr > 170; 
    const isSeller = !isContender && (team.wins || 0) < (team.losses || 0) * 1.5;

    return { weakPositions, strongPositions, statNeeds, isContender, isSeller, capSpace: taxLine - totalSalary, isTaxPayer };
}

// 3. Contextual Value (Team's Perspective)
function getContextualValue(player: Player, needs: TeamNeeds, isAcquiring: boolean, log: string[] = []): number {
    let value = getPlayerTradeValue(player);
    const C = TRADE_CONFIG.NEEDS;

    if (isAcquiring) {
        // Fit Bonus
        let fitMult = 1.0;
        if (needs.weakPositions.some(pos => player.position.includes(pos))) {
            fitMult += C.POSITION_BONUS;
        }
        // Stat Need Bonus
        if (needs.statNeeds.includes('DEF') && player.def > 75) fitMult += 0.1;
        if (needs.statNeeds.includes('3PT') && player.out > 75) fitMult += 0.1;
        if (needs.statNeeds.includes('REB') && player.reb > 75) fitMult += 0.1;

        value *= fitMult;

        // Strategy Bonus
        if (needs.isContender && player.ovr >= 80) value *= 1.25; // Contenders overpay for "Win Now"
        if (needs.isSeller && player.age <= 23) value *= 1.35; // Sellers overpay for youth

    } else {
        // Selling Logic (Giving away)
        if (needs.isSeller && player.age > 28) value *= 0.7; // "Dump him"
        if (needs.isContender && player.ovr > 78) value *= 1.3; // "We need him"
    }

    return Math.floor(value);
}

// 4. Untouchables
function getUntouchables(team: Team, needs: TeamNeeds, isBlockbuster: boolean): Set<string> {
    const untouchables = new Set<string>();
    const roster = [...team.roster].sort((a, b) => b.ovr - a.ovr);
    
    // If it's a blockbuster (Superstar incoming), almost no one is untouchable except the Franchise Player
    if (isBlockbuster) {
        if (roster.length > 0) untouchables.add(roster[0].id); // Only the best player is safe
        return untouchables;
    }

    if (needs.isContender) {
        // Contenders keep their core 3
        roster.slice(0, 3).forEach(p => untouchables.add(p.id));
    } else {
        // Rebuilders keep young high-potential players
        roster.filter(p => p.age <= 24 && p.potential >= 85).forEach(p => untouchables.add(p.id));
        // And the best player if he's not old
        if (roster[0] && roster[0].age <= 28) untouchables.add(roster[0].id);
    }
    return untouchables;
}

// 5. Data Mapper
function mapDbPlayer(p: any): Player {
    const attr = p.base_attributes || {};
    const v = (k1: string, k2: string, def = 50) => 
        (attr[k1] !== undefined ? attr[k1] : (p[k1] !== undefined ? p[k1] : (p[k2] !== undefined ? p[k2] : def)));

    return {
        id: p.id,
        name: p.name,
        position: p.position,
        age: p.age,
        salary: p.salary,
        contractYears: p.contract_years,
        ovr: attr.ovr || p.ovr || 70,
        potential: attr.potential || p.pot || 75,
        def: v('def', 'def'), out: v('out', 'out'), reb: v('reb', 'reb'), plm: v('plm', 'plm'),
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

            // 1. Analyze User Package
            const userSalary = tradingPlayers.reduce((sum: number, p: Player) => sum + p.salary, 0);
            const userMaxOvr = Math.max(...tradingPlayers.map((p: Player) => p.ovr));
            
            // Define Trade Tier
            const isSuperstarTrade = userMaxOvr >= 88; // Getting an All-NBA guy
            const isStarTrade = userMaxOvr >= 80;     // Getting an All-Star/Starter
            
            // Headliner Quality Requirement (To prevent 5 scrubs for 1 star)
            // The AI must include at least one player close to this quality
            const requiredHeadlinerQuality = isSuperstarTrade ? 82 : (isStarTrade ? 76 : 0);

            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);

            for (const targetTeam of otherTeams) {
                const needs = analyzeTeamSituation(targetTeam);
                // If Superstar trade, relax untouchables (User is giving a GOD, AI should offer their best)
                const untouchables = getUntouchables(targetTeam, needs, isSuperstarTrade);
                
                let userValueToAI = 0;
                tradingPlayers.forEach((p: Player) => {
                    userValueToAI += getContextualValue(p, needs, true);
                });
                
                // Early Exit: If user offer is trash to this team, skip
                if (userValueToAI < 500) continue; 

                // 2. Candidate Selection
                let candidates = targetTeam.roster.filter(p => !untouchables.has(p.id));
                
                // Filter out really bad players unless they are salary filler
                // We want Quality assets first
                let qualityAssets = candidates.filter(p => {
                    if (isSuperstarTrade) return p.ovr >= 78 || p.potential >= 85;
                    if (isStarTrade) return p.ovr >= 74 || p.potential >= 80;
                    return true;
                });
                
                // If quality assets pool is empty for a major trade, fallback or skip
                if (isStarTrade && qualityAssets.length === 0) {
                     // Try to find *anyone* tradable who is decent
                     qualityAssets = candidates.filter(p => p.ovr >= 72); 
                     if (qualityAssets.length === 0) {
                         // LOG(`[Target: ${targetTeam.name}] No quality assets to match user package.`);
                         continue;
                     }
                }
                
                // 3. Generate Packages (Try multiple combos)
                for (let i = 0; i < 20; i++) {
                    const pack: Player[] = [];
                    let packValue = 0;
                    let packSalary = 0;
                    let hasHeadliner = false;

                    // A. Pick Headliner (Essential for quality match)
                    if (requiredHeadlinerQuality > 0) {
                        const potentialHeadliners = qualityAssets.filter(p => p.ovr >= requiredHeadlinerQuality || (p.potential >= 85 && p.age <= 23));
                        if (potentialHeadliners.length > 0) {
                            const headliner = potentialHeadliners[Math.floor(Math.random() * potentialHeadliners.length)];
                            pack.push(headliner);
                            packValue += getContextualValue(headliner, needs, false);
                            packSalary += headliner.salary;
                            hasHeadliner = true;
                        } else {
                            // If we can't find a single headliner for a superstar trade, we probably can't make this deal
                            if (isSuperstarTrade) break; 
                        }
                    }

                    // B. Fill the rest (Value & Salary matching)
                    // Shuffle rest of candidates
                    const pool = candidates.filter(p => !pack.includes(p)).sort(() => Math.random() - 0.5);
                    const salaryMin = userSalary * 0.75;
                    const valueTarget = userValueToAI; 

                    let attempts = 0;
                    while (pack.length < 5 && attempts < 50) {
                        attempts++;
                        const isSalOk = packSalary >= salaryMin;
                        const isValOk = packValue >= valueTarget * 0.85; // AI wants to win the trade slightly or be even

                        if (isSalOk && isValOk && hasHeadliner) break;

                        const salDeficit = salaryMin - packSalary;
                        const valDeficit = valueTarget - packValue;
                        
                        let nextPiece: Player | undefined;

                        if (!isValOk && valDeficit > 5000) {
                            // We need a GOOD piece, not filler
                            nextPiece = pool.find(p => getContextualValue(p, needs, false) > valDeficit * 0.3);
                        } else if (!isSalOk && salDeficit > 5) {
                            // We need Salary
                            nextPiece = pool.find(p => Math.abs(p.salary - salDeficit) < 5) || pool.find(p => p.salary > 5);
                        } else {
                            // Filler
                            nextPiece = pool[0]; 
                        }

                        if (nextPiece && !pack.includes(nextPiece)) {
                            // Don't add garbage to a superstar trade just for fun
                            if (isSuperstarTrade && nextPiece.ovr < 70 && !isSalOk) {
                                // Only add scrub if we desperately need salary matching
                            } else {
                                pack.push(nextPiece);
                                packValue += getContextualValue(nextPiece, needs, false);
                                packSalary += nextPiece.salary;
                                // Update headliner status if we accidentally picked a good one
                                if (nextPiece.ovr >= requiredHeadlinerQuality) hasHeadliner = true;
                                // Remove from pool
                                const idx = pool.indexOf(nextPiece);
                                if (idx > -1) pool.splice(idx, 1);
                            }
                        }
                    }

                    // 4. Validate Package
                    // Quality Check: Did we include a core piece?
                    const validQuality = !requiredHeadlinerQuality || hasHeadliner || (packValue > userValueToAI * 1.2); // If value is massive, maybe quantity is okay (rare)

                    // Salary Check
                    const salRatio = userSalary > 0 ? packSalary / userSalary : 0;
                    const validSalary = Math.abs(packSalary - userSalary) < 5 || (salRatio >= 0.70 && salRatio <= 1.35);

                    // Value Check
                    const valRatio = userValueToAI > 0 ? packValue / userValueToAI : 0;
                    const validValue = valRatio >= 0.85 && valRatio <= 1.4; // Tighter range

                    // Position Check
                    const posValid = desiredPositions.length === 0 || pack.some(p => desiredPositions.some((dp: string) => p.position.includes(dp)));

                    if (validQuality && validSalary && validValue && posValid && pack.length > 0) {
                        const isDup = offers.some(o => o.teamId === targetTeam.id && o.players.length === pack.length && o.players.every(p => pack.some(pk => pk.id === p.id)));
                        
                        if (!isDup) {
                            const reason = [];
                            if (hasHeadliner) reason.push("Core Asset Included");
                            if (needs.weakPositions.length > 0) reason.push(`Fits Needs: ${needs.weakPositions.join(',')}`);
                            
                            offers.push({
                                teamId: targetTeam.id,
                                teamName: targetTeam.name,
                                players: pack,
                                diffValue: packValue - userValueToAI,
                                analysis: reason
                            });
                        }
                    }
                }
            }
            
            // Sort by Best Value Difference for the user (High to Low)
            result = { offers: offers.sort((a, b) => b.diffValue - a.diffValue).slice(0, 5) };
        }

        else if (action === 'generate-counter-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { targetPlayers, targetTeamId } = payload;
            const targetTeam = allTeams.find(t => t.id === targetTeamId);
            if (!targetTeam) throw new Error("Target team not found");

            const needs = analyzeTeamSituation(targetTeam);
            // User is trying to take targetPlayers. Are they untouchable?
            const untouchables = getUntouchables(targetTeam, needs, false); 
            
            // Note: In manual proposal, we let user try for untouchables, but AI valuation will be extremely high.
            // If player is untouchable, AI demands 2x value.

            let targetValueToAI = 0;
            let targetSalary = 0;
            
            targetPlayers.forEach((p: Player) => {
                let v = getContextualValue(p, needs, false); 
                if (untouchables.has(p.id)) v *= 2.0; // "He's not for sale!" premium
                targetValueToAI += v;
                targetSalary += p.salary;
            });

            const candidates = myTeam.roster.sort((a,b) => b.ovr - a.ovr);
            const offers: TradeOffer[] = [];
            
            // Required Quality for User Assets
            const targetMaxOvr = Math.max(...targetPlayers.map((p: Player) => p.ovr));
            const requiredUserHeadliner = targetMaxOvr >= 85 ? 80 : (targetMaxOvr >= 80 ? 75 : 0);

            for (let i = 0; i < 30; i++) {
                const pack: Player[] = [];
                let packValue = 0;
                let packSalary = 0;
                let hasHeadliner = false;

                // A. Find matching piece for needs
                const neededPlayers = candidates.filter(p => needs.weakPositions.some(wp => p.position.includes(wp)) && !pack.includes(p));
                
                // Prioritize Headliner
                if (requiredUserHeadliner > 0) {
                    const elite = candidates.find(p => p.ovr >= requiredUserHeadliner && !pack.includes(p));
                    if (elite) {
                        pack.push(elite);
                        packValue += getContextualValue(elite, needs, true);
                        packSalary += elite.salary;
                        hasHeadliner = true;
                    }
                }

                // If no headliner yet, try to add a needed player or best available
                if (pack.length === 0) {
                     const p = neededPlayers[0] || candidates[0];
                     pack.push(p);
                     packValue += getContextualValue(p, needs, true);
                     packSalary += p.salary;
                }

                // B. Fill
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
                         if (next.ovr >= requiredUserHeadliner) hasHeadliner = true;
                    }
                }

                const salRatio = targetSalary > 0 ? packSalary / targetSalary : 0;
                const isSal = Math.abs(packSalary - targetSalary) < 5 || (salRatio >= 0.75 && salRatio <= 1.25);
                const isVal = packValue >= targetValueToAI;
                
                // Quality Check
                const isQuality = !requiredUserHeadliner || hasHeadliner;

                if (isSal && isVal && isQuality) {
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

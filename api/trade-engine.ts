
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
        // [Balance] Slightly reduced exponent to make trades easier
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
        if (!bestAtPos || bestAtPos.ovr < 75 || depth.length < 2) weakPositions.push(pos);
        if (bestAtPos && bestAtPos.ovr > 82) strongPositions.push(pos);
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
    
    const top2Ovr = (sorted[0]?.ovr || 0) + (sorted[1]?.ovr || 0);
    const isContender = top2Ovr > 170; 
    const isSeller = !isContender && (team.wins || 0) < (team.losses || 0) * 1.5;

    return { weakPositions, strongPositions, statNeeds, isContender, isSeller, capSpace: taxLine - totalSalary, isTaxPayer: totalSalary > taxLine };
}

// 3. Contextual Value (Team's Perspective)
function getContextualValue(player: Player, needs: TeamNeeds, isAcquiring: boolean): number {
    let value = getPlayerTradeValue(player);
    const C = TRADE_CONFIG.NEEDS;

    if (isAcquiring) {
        if (player.health === 'Injured') {
            if (needs.isContender) return -1 * (player.salary * 20);
            else if (player.salary > 5) return value - (player.salary * 10);
        }

        let fitMult = 1.0;
        if (needs.weakPositions.some(pos => player.position.includes(pos))) fitMult += C.POSITION_BONUS;
        if (needs.statNeeds.includes('DEF') && player.def > 75) fitMult += 0.1;
        if (needs.statNeeds.includes('3PT') && player.out > 75) fitMult += 0.1;
        if (needs.statNeeds.includes('REB') && player.reb > 75) fitMult += 0.1;

        value *= fitMult;

        if (needs.isContender && player.ovr >= 80) value *= 1.25; 
        if (needs.isSeller && player.age <= 23) value *= 1.35; 

    } else {
        if (needs.isSeller && player.age > 28) value *= 0.7; 
        if (needs.isContender && player.ovr > 80) value *= 1.3; 
    }

    return Math.floor(value);
}

// 4. Validate Trade Legality (Apron Rules)
function validateTradeLegality(team: Team, outgoing: Player[], incoming: Player[]): { valid: boolean; reason?: string } {
    const currentSalary = team.roster.reduce((sum, p) => sum + p.salary, 0);
    const outSal = outgoing.reduce((sum, p) => sum + p.salary, 0);
    const inSal = incoming.reduce((sum, p) => sum + p.salary, 0);
    
    const { CAP_LINE, TAX_LINE, APRON_1, APRON_2 } = TRADE_CONFIG.SALARY;

    if (currentSalary >= APRON_2) {
        if (outgoing.length > 1) return { valid: false, reason: "2nd Apron: Aggregation Ban" };
        if (inSal > outSal) return { valid: false, reason: "2nd Apron: Cannot increase salary" };
        return { valid: true };
    }

    if (currentSalary >= APRON_1) {
        if (inSal > outSal) return { valid: false, reason: "1st Apron: Max 100% match" };
        return { valid: true };
    }

    if (currentSalary >= TAX_LINE) {
        const maxIncoming = (outSal * 1.10) + 0.25;
        if (inSal > maxIncoming) return { valid: false, reason: "Taxpayer: Max 110% match" };
        return { valid: true };
    }

    if (currentSalary < CAP_LINE) {
        const room = CAP_LINE - currentSalary;
        if (inSal <= room + outSal + 0.1) return { valid: true };
    }

    const maxIncoming = (outSal * 1.25) + 0.25;
    if (inSal > maxIncoming) return { valid: false, reason: "Standard: Max 125% match" };

    return { valid: true };
}

// 5. Core Asset Filter
function getCoreAssetFilter(roster: Player[]): (p: Player) => boolean {
    const has90 = roster.some(p => p.ovr >= 90);
    const has85 = roster.some(p => p.ovr >= 85);
    return (p: Player) => {
        if (has90) return p.ovr >= 90;
        if (has85) return p.ovr >= 85;
        return false;
    };
}

// --- API Handler ---
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const logs: string[] = [];
    const LOG = (msg: string) => logs.push(`[${new Date().toISOString().split('T')[1].split('.')[0]}] ${msg}`);

    try {
        const { action, payload } = req.body;
        LOG(`Action Received: ${action}`);

        let allTeams: Team[] = [];

        // 1. Prefer Injected State (Optimization)
        if (payload.leagueState && Array.isArray(payload.leagueState) && payload.leagueState.length > 0) {
            allTeams = payload.leagueState;
            LOG(`Loaded ${allTeams.length} teams from client payload.`);
        } else {
            // Fallback to Supabase (Cold Start / Testing)
            // Note: This relies on Supabase Env Vars being present in Vercel
            try {
                const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
                const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
                if (!supabaseUrl || !supabaseKey) throw new Error("Supabase credentials missing in env");
                
                const supabaseClient = createClient(supabaseUrl, supabaseKey);
                const { data: teamsData, error: teamsError } = await supabaseClient
                    .from('meta_teams')
                    .select('*, meta_players(*)');
                if (teamsError) throw teamsError;

                // Simple mapper for fallback (Not perfect but enough for structure)
                allTeams = teamsData.map((t: any) => ({
                    id: t.id, name: t.name, roster: (t.meta_players || []).map((p:any) => ({...p, id: p.id, ovr: p.ovr || 50, salary: p.salary || 1})),
                    salaryCap: 140, luxuryTaxLine: 170 
                }));
                LOG(`Loaded ${allTeams.length} teams from Supabase fallback.`);
            } catch (e: any) {
                LOG(`Failed to load data from Supabase: ${e.message}`);
                return res.status(500).json({ error: "Failed to load league data", logs });
            }
        }
        
        const myTeam = allTeams.find(t => t.id === payload.myTeamId);
        let result: any = null;

        if (action === 'generate-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { tradingPlayers, desiredPositions } = payload;
            const offers: TradeOffer[] = [];

            const sortedUserPlayers = [...tradingPlayers].sort((a: Player, b: Player) => getPlayerTradeValue(b) - getPlayerTradeValue(a));
            const userMaxOvr = sortedUserPlayers.length > 0 ? sortedUserPlayers[0].ovr : 0;
            
            // Optimization: Filter targets to only those with matching needs or cap space
            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);
            
            // Calculate User Package Value
            // Loop once to determine value to avoid repetition
            // Use generic needs for value estimation to speed up
            let estimatedUserValue = 0;
            sortedUserPlayers.forEach(p => estimatedUserValue += getPlayerTradeValue(p));
            
            LOG(`User Package Est. Value: ${estimatedUserValue}`);

            for (const targetTeam of otherTeams) {
                const needs = analyzeTeamSituation(targetTeam);
                
                // Detailed Value Calculation per Team
                let userValueToAI = 0;
                sortedUserPlayers.forEach((p: Player) => {
                    userValueToAI += getContextualValue(p, needs, true);
                });

                if (userValueToAI < 50) continue; // Threshold lowered to find more offers

                // Candidate Filtering: Relaxed
                // We want to generate *some* offers, so we include non-core assets liberally
                const isCore = getCoreAssetFilter(targetTeam.roster);
                const candidates = targetTeam.roster.filter(p => {
                    // Don't trade superstars for peanuts
                    if (isCore(p) && userMaxOvr < 88) return false; 
                    return true;
                });
                
                // Shuffle for variety
                candidates.sort(() => Math.random() - 0.5);

                // Optimization: Reduce attempts to avoid timeout
                // 20 attempts -> 10 attempts
                const ATTEMPTS_LIMIT = 10;
                
                for (let i = 0; i < ATTEMPTS_LIMIT; i++) {
                    const pack: Player[] = [];
                    let packValue = 0;
                    let packSalary = 0;
                    
                    // Optimization: Filter candidates by value proximity first to reach target faster
                    let pool = [...candidates];
                    
                    const valueTarget = userValueToAI; 
                    let attempts = 0;
                    
                    while (pack.length < 5 && attempts < 30) {
                        attempts++;
                        
                        // [Relaxed] Accept 80% value match to generate more options
                        if (packValue >= valueTarget * 0.8) break; 

                        const valDeficit = valueTarget - packValue;
                        let nextPiece: Player | undefined;

                        // Heuristic selection
                        if (valDeficit > 3000) {
                            // Find big piece
                            nextPiece = pool.find(p => getPlayerTradeValue(p) > 2000 && !pack.includes(p));
                        } 
                        
                        if (!nextPiece) {
                            nextPiece = pool[Math.floor(Math.random() * pool.length)];
                        }

                        if (nextPiece && !pack.includes(nextPiece)) {
                            pack.push(nextPiece);
                            packValue += getContextualValue(nextPiece, needs, false);
                            packSalary += nextPiece.salary;
                            pool = pool.filter(p => p.id !== nextPiece!.id);
                        }
                    }

                    const valRatio = userValueToAI > 0 ? packValue / userValueToAI : 0;
                    // [Relaxed] Range 0.8 ~ 1.25
                    const validValue = valRatio >= 0.8 && valRatio <= 1.25; 

                    // Check Positions
                    const posValid = desiredPositions.length === 0 || pack.some(p => desiredPositions.some((dp: string) => p.position.includes(dp)));

                    if (validValue && posValid && pack.length > 0) {
                        // Check Salary Rules only if value aligns
                        const aiTradeValid = validateTradeLegality(targetTeam, pack, sortedUserPlayers);
                        const userTradeValid = validateTradeLegality(myTeam, sortedUserPlayers, pack);

                        if (aiTradeValid.valid && userTradeValid.valid) {
                            const isDup = offers.some(o => o.teamId === targetTeam.id && o.players.length === pack.length);
                            if (!isDup) {
                                offers.push({
                                    teamId: targetTeam.id,
                                    teamName: targetTeam.name,
                                    players: pack,
                                    diffValue: packValue - userValueToAI,
                                    analysis: [`Value Ratio: ${valRatio.toFixed(2)}`]
                                });
                                break; // Found one for this team, move to next team for diversity
                            }
                        }
                    }
                }
            }
            
            result = { offers: offers.sort((a, b) => b.diffValue - a.diffValue).slice(0, 5) };
            LOG(`Generated ${offers.length} offers.`);
        }

        else if (action === 'generate-counter-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { targetPlayers, targetTeamId } = payload;
            const targetTeam = allTeams.find(t => t.id === targetTeamId);
            if (!targetTeam) throw new Error("Target team not found");

            const needs = analyzeTeamSituation(targetTeam);
            let targetValueToAI = 0;
            targetPlayers.forEach((p: Player) => {
                targetValueToAI += getContextualValue(p, needs, false); 
            });
            
            LOG(`Counter Offer Target Value: ${targetValueToAI}`);

            const candidates = myTeam.roster.sort((a,b) => b.ovr - a.ovr);
            const offers: TradeOffer[] = [];

            // Optimization: 15 attempts
            for (let i = 0; i < 15; i++) {
                const pack: Player[] = [];
                let packValue = 0;
                let pool = candidates.filter(p => !pack.includes(p));
                let attempts = 0;
                
                while (pack.length < 5 && attempts < 30) {
                    attempts++;
                    const valueNeeded = targetValueToAI - packValue;
                    if (valueNeeded <= 0) break;

                    // Simple greedy + random approach
                    let next = pool[Math.floor(Math.random() * pool.length)];
                    
                    // Bias towards matching value
                    if (valueNeeded > 5000) {
                        const bigPiece = pool.find(p => getPlayerTradeValue(p) > 3000);
                        if (bigPiece) next = bigPiece;
                    }

                    if (next && !pack.includes(next)) {
                        pack.push(next);
                        packValue += getContextualValue(next, needs, true);
                        pool = pool.filter(p => p.id !== next!.id);
                    }
                }

                // Check Validity
                const userTradeValid = validateTradeLegality(myTeam, pack, targetPlayers);
                const aiTradeValid = validateTradeLegality(targetTeam, targetPlayers, pack);
                const isVal = packValue >= targetValueToAI * 0.95; // 95% match required for Counter

                if (userTradeValid.valid && aiTradeValid.valid && isVal) {
                    const isDup = offers.some(o => o.players.every((p: Player) => pack.some((pk: Player) => pk.id === p.id)));
                    if (!isDup) {
                        offers.push({
                            teamId: myTeam.id,
                            teamName: myTeam.name,
                            players: pack,
                            diffValue: packValue - targetValueToAI,
                            analysis: [`Value Met`]
                        });
                    }
                }
            }
            result = { offers: offers.sort((a,b) => a.diffValue - b.diffValue).slice(0, 3) };
            LOG(`Generated ${offers.length} counter-offers.`);
        }
        
        else if (action === 'simulate-cpu-trades') {
            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);
            if (otherTeams.length < 2) {
                result = { success: false, reason: "Not enough teams" };
            } else {
                // Simplified CPU Trade Logic
                const sellers = otherTeams.filter(t => analyzeTeamSituation(t).isSeller);
                const buyers = otherTeams.filter(t => analyzeTeamSituation(t).isContender);
                
                if (sellers.length > 0 && buyers.length > 0) {
                    const seller = sellers[Math.floor(Math.random() * sellers.length)];
                    const buyer = buyers[Math.floor(Math.random() * buyers.length)];
                    
                    if (seller.id !== buyer.id) {
                         const tradeAsset = seller.roster.find(p => p.age >= 28 && p.salary > 10 && p.ovr > 78 && p.health !== 'Injured');
                         if (tradeAsset) {
                             const buyerAssets = buyer.roster.filter(p => (p.age <= 24 && p.potential > 75 && p.health !== 'Injured') || (p.salary > 5 && p.ovr < 75 && p.health !== 'Injured'));
                             const pack: Player[] = [];
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
                             const isVal = packVal >= assetVal * 0.8; 

                             const buyerValid = validateTradeLegality(buyer, pack, [tradeAsset]);
                             const sellerValid = validateTradeLegality(seller, [tradeAsset], pack);

                             if (buyerValid.valid && sellerValid.valid && isVal && pack.length > 0) {
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

        res.status(200).json({ ...result, logs });

    } catch (error: any) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message, logs });
    }
}

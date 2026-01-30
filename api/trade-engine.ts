
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
  def?: number;
  out?: number; // 3pt/Shooting
  reb?: number;
  plm?: number;
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
    isSeller: boolean; // Seller due to bad record + high tax
    capSpace: number;
    isTaxPayer: boolean;
}

// --- Configuration ---
const TRADE_CONFIG = {
    BASE: { 
        REPLACEMENT_LEVEL_OVR: 40, 
        VALUE_EXPONENT: 3.5, 
        SUPERSTAR_PREMIUM_THRESHOLD: 88,
        SUPERSTAR_MULTIPLIER: 1.6 // Increased for realism
    },
    CONTRACT: {
        VALUE_MULTIPLIER: 1.25, // Good contract bonus
        BAD_CONTRACT_PENALTY: 0.6, // Albatross penalty
    },
    NEEDS: { 
        POSITION_BONUS: 0.25,
        STAT_BONUS: 0.15,
        SALARY_DUMP_BONUS: 0.3 // AI loves dumping bad salary if they are sellers
    },
    SALARY: {
        TAX_LINE: 170, // Hardcoded approximation if not provided
        FLOOR_MATCH: 0.75, // Simple matching rule
        CEILING_MATCH: 1.25
    }
};

// --- Helper Functions ---

// 1. Calculate Base Trade Value with Contract Efficiency
function getPlayerTradeValue(p: Player, debugLog: string[] = []): number {
    const C = TRADE_CONFIG;
    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, p.ovr);
    
    // 1. Base OVR Value (Exponential)
    let baseValue = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    // 2. Superstar Premium
    if (p.ovr >= C.BASE.SUPERSTAR_PREMIUM_THRESHOLD) {
        baseValue *= C.BASE.SUPERSTAR_MULTIPLIER;
    }

    // 3. Age & Potential
    if (p.age <= 23) {
        if (p.potential > p.ovr) {
            const potBonus = 1.0 + ((p.potential - 70) * 0.05);
            baseValue *= Math.max(1, potBonus);
        }
    } else if (p.age >= 32) {
        const decline = (p.age - 31) * 0.1;
        baseValue *= Math.max(0.2, 1.0 - decline);
    }

    // 4. Contract Efficiency (Value Contract vs Albatross)
    // Heuristic: Expected Salary = (OVR - 65)^2 / 8 (Rough curve)
    const expectedSalary = Math.max(1, Math.pow(p.ovr - 65, 2.2) / 10);
    const actualSalary = Math.max(1, p.salary);
    const valueRatio = expectedSalary / actualSalary;

    if (valueRatio > 1.5) {
        baseValue *= C.CONTRACT.VALUE_MULTIPLIER; // High OVR, Low Pay (Rookie scale or Steal)
        // debugLog.push(`[${p.name}] Value Contract (Efficient)`);
    } else if (valueRatio < 0.6 && p.contractYears > 1) {
        baseValue *= C.CONTRACT.BAD_CONTRACT_PENALTY; // Low OVR, High Pay
        // debugLog.push(`[${p.name}] Bad Contract (Inefficient)`);
    }

    return Math.floor(baseValue);
}

// 2. Analyze Team Needs (Position, Stats, Cap Status)
function analyzeTeamSituation(team: Team): TeamNeeds {
    const roster = team.roster;
    const sorted = [...roster].sort((a,b) => b.ovr - a.ovr);
    const top8 = sorted.slice(0, 8);
    
    // Position Depth
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const weakPositions: string[] = [];
    const strongPositions: string[] = [];
    
    positions.forEach(pos => {
        const depth = roster.filter(p => p.position.includes(pos));
        const starter = depth.reduce((max, p) => p.ovr > max.ovr ? p : max, {ovr:0} as Player);
        
        // Weak if starter < 76 or depth < 2
        if (starter.ovr < 76 || depth.length < 2) weakPositions.push(pos);
        // Strong if starter > 85 and backup > 78
        if (starter.ovr > 85 && depth.some(p => p.id !== starter.id && p.ovr > 78)) strongPositions.push(pos);
    });

    // Stat Needs (Compare avg of top 8 to league baselines)
    const statNeeds: string[] = [];
    const avgDef = top8.reduce((s, p) => s + (p.def || 50), 0) / 8;
    const avgOut = top8.reduce((s, p) => s + (p.out || 50), 0) / 8;
    const avgReb = top8.reduce((s, p) => s + (p.reb || 50), 0) / 8;

    if (avgDef < 65) statNeeds.push('DEF');
    if (avgOut < 70) statNeeds.push('3PT');
    if (avgReb < 60) statNeeds.push('REB');

    // Cap Situation
    const totalSalary = roster.reduce((s, p) => s + p.salary, 0);
    const taxLine = team.luxuryTaxLine || TRADE_CONFIG.SALARY.TAX_LINE;
    const isTaxPayer = totalSalary > taxLine;
    
    // Status
    const top2Ovr = (top8[0]?.ovr || 0) + (top8[1]?.ovr || 0);
    const isContender = top2Ovr > 170; // e.g. 85 + 85
    const isSeller = isTaxPayer && !isContender; // High tax but bad team -> Salary Dump mode

    return { weakPositions, strongPositions, statNeeds, isContender, isSeller, capSpace: taxLine - totalSalary, isTaxPayer };
}

// 3. Contextual Value (Does this player fit?)
function getContextualValue(player: Player, needs: TeamNeeds, isAcquiring: boolean, log: string[] = []): number {
    let value = getPlayerTradeValue(player, log);
    const C = TRADE_CONFIG.NEEDS;

    if (isAcquiring) {
        // Position Fit
        if (needs.weakPositions.some(pos => player.position.includes(pos))) {
            value *= (1 + C.POSITION_BONUS);
            // log.push(`[${player.name}] Fits Positional Need (${needs.weakPositions.join(',')})`);
        } else if (needs.strongPositions.some(pos => player.position.includes(pos))) {
            value *= 0.8; // Diminishing returns
        }

        // Stat Fit
        if (needs.statNeeds.includes('DEF') && (player.def || 0) > 80) value *= (1 + C.STAT_BONUS);
        if (needs.statNeeds.includes('3PT') && (player.out || 0) > 80) value *= (1 + C.STAT_BONUS);
        if (needs.statNeeds.includes('REB') && (player.reb || 0) > 80) value *= (1 + C.STAT_BONUS);

        // Salary Dump Context
        if (needs.isSeller && player.contractYears <= 1) {
            value *= (1 + C.SALARY_DUMP_BONUS); // Expiring contract is gold for sellers
            // log.push(`[${player.name}] Expiring Contract Bonus (Seller Mode)`);
        }
        
        // Contender Focus
        if (needs.isContender && player.ovr > 80) {
            value *= 1.2; // Contenders overpay for current talent
        } else if (!needs.isContender && player.age < 24 && player.potential > 80) {
            value *= 1.3; // Rebuilders overpay for youth
        }

    } else {
        // If trading away, Sellers undervalue their own vets to move them
        if (needs.isSeller && player.salary > 20) {
            value *= 0.8; // Willing to sell low
        }
    }

    return Math.floor(value);
}

// 4. Determine AI's Untouchables based on context
function getUntouchables(team: Team, needs: TeamNeeds): Set<string> {
    const untouchables = new Set<string>();
    const roster = [...team.roster].sort((a,b) => b.ovr - a.ovr);
    
    // Core logic
    if (needs.isContender) {
        // Keep top 3 players
        roster.slice(0, 3).forEach(p => untouchables.add(p.id));
    } else {
        // Rebuilder: Keep young prospects
        roster.filter(p => p.age <= 24 && p.potential >= 80).forEach(p => untouchables.add(p.id));
    }

    return untouchables;
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
        def: attr.def, out: attr.out, reb: attr.reb, plm: attr.plm, // Map stat categories
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

        const { data: teamsData, error: teamsError } = await supabaseClient
            .from('meta_teams')
            .select('*, meta_players(*)');
        if (teamsError) throw teamsError;

        const allTeams: Team[] = teamsData.map((t: any) => ({
            id: t.id, name: t.name, roster: (t.meta_players || []).map(mapDbPlayer),
            salaryCap: 140, luxuryTaxLine: 170 // Defaults if missing
        }));
        const myTeam = allTeams.find(t => t.id === payload.myTeamId);

        let result: any = null;

        // --- Action: Generate Offers (AI Proposes to User) ---
        if (action === 'generate-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { tradingPlayers } = payload;
            const offers: TradeOffer[] = [];
            
            const userSalary = tradingPlayers.reduce((sum: number, p: Player) => sum + p.salary, 0);
            const userOvrSum = tradingPlayers.reduce((sum: number, p: Player) => sum + p.ovr, 0);
            const userBestPlayer = [...tradingPlayers].sort((a: Player, b: Player) => b.ovr - a.ovr)[0];
            const isSuperstarTrade = userBestPlayer.ovr >= 90;

            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);

            for (const targetTeam of otherTeams) {
                const logs: string[] = [];
                const needs = analyzeTeamSituation(targetTeam);
                const untouchables = getUntouchables(targetTeam, needs);
                
                // 1. Evaluate User Package (Value to AI)
                let userValueToAI = 0;
                tradingPlayers.forEach((p: Player) => {
                    userValueToAI += getContextualValue(p, needs, true, logs);
                });

                if (userValueToAI < 500) continue; // Too low value to consider

                // 2. Identify Candidates from AI Roster
                // Filter out untouchables unless we are getting a Superstar
                let candidates = targetTeam.roster.filter(p => isSuperstarTrade || !untouchables.has(p.id));
                candidates.sort((a, b) => {
                    // Sort by: Expiring/Bad contracts first if Seller, otherwise by Value Match
                    if (needs.isSeller && a.contractYears <= 1) return -1;
                    return getPlayerTradeValue(a) - getPlayerTradeValue(b); // Sort Ascending value (fillers first)
                });
                
                // 3. Build Package (Iterative 1-to-Many logic)
                for (let i = 0; i < 30; i++) { // Max attempts per team
                    const pack: Player[] = [];
                    let packValue = 0;
                    let packSalary = 0;
                    
                    // Step A: Main Piece (Must exist)
                    // If User giving Star, AI must give Core piece
                    let mainPool = candidates;
                    if (isSuperstarTrade) {
                        mainPool = candidates.filter(p => p.ovr >= 80 || p.potential >= 88);
                    }
                    if (mainPool.length === 0) break; // Can't match star

                    const mainPiece = mainPool[Math.floor(Math.random() * Math.min(3, mainPool.length))];
                    pack.push(mainPiece);
                    packValue += getContextualValue(mainPiece, needs, false);
                    packSalary += mainPiece.salary;

                    // Step B: Fillers for Salary Matching (NBA Rules)
                    // Tax teams: 100% match or less incoming. Non-tax: 125% + 250k.
                    // Simplified: Tax teams aim for outgoing >= incoming. Non-tax allow outgoing >= incoming * 0.75
                    let salaryTargetMin = userSalary * 0.75;
                    let salaryTargetMax = userSalary * 1.25;
                    if (needs.isTaxPayer) {
                        salaryTargetMin = userSalary; // Must send out MORE salary to save tax
                    }

                    // Loop to add fillers
                    const remainingCandidates = candidates.filter(p => p.id !== mainPiece.id);
                    let attempts = 0;
                    
                    while (packSalary < salaryTargetMin && pack.length < 5 && attempts < 20) {
                        attempts++;
                        const needed = salaryTargetMin - packSalary;
                        // Find player close to needed salary
                        const filler = remainingCandidates.find(p => !pack.includes(p) && p.salary <= needed + 5 && p.salary >= needed - 5) 
                                       || remainingCandidates[Math.floor(Math.random() * remainingCandidates.length)];
                        
                        if (filler && !pack.includes(filler)) {
                            pack.push(filler);
                            packValue += getContextualValue(filler, needs, false);
                            packSalary += filler.salary;
                        }
                    }

                    // Step C: Validate
                    const isSalaryValid = packSalary >= salaryTargetMin * 0.9 && packSalary <= salaryTargetMax * 1.1; // 10% fuzz
                    const isValueValid = userValueToAI >= packValue * 1.0; // User must win or tie value (AI conservative)

                    // Superstars trade override: AI willing to overpay slightly if getting a 90+ OVR
                    const isSuperstarValid = isSuperstarTrade && userValueToAI >= packValue * 0.9;

                    if (isSalaryValid && (isValueValid || isSuperstarValid) && pack.length > 0) {
                        // Check duplicate
                        const isDup = offers.some(o => o.teamId === targetTeam.id && o.players.every((p: Player) => pack.some((pk: Player) => pk.id === p.id)));
                        if (!isDup) {
                            const analysis = [`[Needs] Weak: ${needs.weakPositions.join(',')} | Stat: ${needs.statNeeds.join(',')}`];
                            if (needs.isSeller) analysis.push(`[Strategy] Salary Dump / Rebuild Mode`);
                            if (isSuperstarTrade) analysis.push(`[Big Deal] Superstar Acquisition Mode`);
                            
                            offers.push({
                                teamId: targetTeam.id,
                                teamName: targetTeam.name,
                                players: pack,
                                diffValue: packValue - userValueToAI, // AI perspective
                                analysis
                            });
                        }
                    }
                }
            }
            result = { offers: offers.sort((a, b) => a.diffValue - b.diffValue).slice(0, 5) };
        }

        // --- Logic 2: Counter Offers (User -> AI) ---
        else if (action === 'generate-counter-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { targetPlayers, targetTeamId } = payload;
            const targetTeam = allTeams.find(t => t.id === targetTeamId);
            if (!targetTeam) throw new Error("Target team not found");

            const needs = analyzeTeamSituation(targetTeam);
            const untouchables = getUntouchables(targetTeam, needs);

            // 1. Is User asking for untouchable?
            const askingUntouchable = targetPlayers.some((p: Player) => untouchables.has(p.id));
            if (askingUntouchable) {
                // AI mostly refuses, unless user overpays significantly. 
                // For simplicity, we just return empty or very high demand.
            }

            // 2. Evaluate what user wants
            let valueUserWants = 0;
            let salaryUserWants = 0;
            targetPlayers.forEach((p: Player) => {
                valueUserWants += getContextualValue(p, needs, false); // Value AI loses
                salaryUserWants += p.salary;
            });

            // 3. AI searches User's roster for matching package
            const candidates = myTeam.roster.sort((a,b) => b.ovr - a.ovr);
            const offers: TradeOffer[] = [];

            for (let i=0; i<30; i++) {
                const pack: Player[] = [];
                let packValue = 0;
                let packSalary = 0;
                const packLogs: string[] = [];

                // Try to match salary
                let currentPool = candidates;
                
                // If AI needs specific position, filter for it first
                const posMatches = candidates.filter(p => needs.weakPositions.some(wp => p.position.includes(wp)));
                if (posMatches.length > 0 && Math.random() > 0.3) {
                    const p = posMatches[0];
                    pack.push(p);
                    packValue += getContextualValue(p, needs, true, packLogs);
                    packSalary += p.salary;
                }

                // Fill rest
                while(packSalary < salaryUserWants * 0.8 && pack.length < 5) {
                     const filler = candidates.find(p => !pack.includes(p) && p.salary < (salaryUserWants - packSalary + 5)) 
                                    || candidates[Math.floor(Math.random() * candidates.length)];
                     if (filler && !pack.includes(filler)) {
                        pack.push(filler);
                        packValue += getContextualValue(filler, needs, true);
                        packSalary += filler.salary;
                     } else {
                         break;
                     }
                }

                // Validation
                // AI demands profit: User Value > AI Value * 1.1
                if (packValue >= valueUserWants * 1.1 && Math.abs(packSalary - salaryUserWants) < 10) {
                     const isDup = offers.some(o => o.players.every((p: Player) => pack.some((pk: Player) => pk.id === p.id)));
                     if (!isDup) {
                        offers.push({
                            teamId: myTeam.id,
                            teamName: myTeam.name,
                            players: pack,
                            diffValue: packValue - valueUserWants,
                            analysis: [`AI Demands: Value ${Math.round(packValue)} vs Giving ${Math.round(valueUserWants)}`]
                        });
                     }
                }
            }
             result = { offers: offers.sort((a, b) => b.diffValue - a.diffValue).slice(0, 3) };
        }

        // --- Logic 3: CPU Trades (AI <-> AI) ---
        else if (action === 'simulate-cpu-trades') {
            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);
            if (otherTeams.length < 2) {
                result = { success: false, reason: "Not enough teams" };
            } else {
                // Find a logical trade pair (e.g., Seller vs Buyer)
                // Seller: Low Wins, High Salary
                // Buyer: High Wins OR Cap Space
                const sellers = otherTeams.filter(t => {
                    const needs = analyzeTeamSituation(t);
                    return needs.isSeller; 
                });
                const buyers = otherTeams.filter(t => {
                    const needs = analyzeTeamSituation(t);
                    return needs.isContender || needs.capSpace > 20;
                });
                
                // Fallback to random if no clear sellers/buyers
                const seller = sellers.length > 0 ? sellers[Math.floor(Math.random()*sellers.length)] : otherTeams[0];
                const buyer = buyers.length > 0 ? buyers[Math.floor(Math.random()*buyers.length)] : otherTeams[1];
                
                if (seller.id !== buyer.id) {
                     // Simple Veteran Dump Logic
                     // Seller gives Vet (High Sal, Age > 28)
                     // Buyer gives Young/Pick (Low Sal, Age < 25)
                     const vet = seller.roster.find(p => p.age > 28 && p.salary > 15 && p.ovr > 78);
                     
                     if (vet) {
                         const buyerAssets = buyer.roster.filter(p => p.age < 25 && p.potential > 75).sort((a,b) => b.potential - a.potential);
                         // Match salaries
                         const tradePack: Player[] = [];
                         let currentSal = 0;
                         // Add 1 good young player
                         if (buyerAssets[0]) {
                             tradePack.push(buyerAssets[0]);
                             currentSal += buyerAssets[0].salary;
                         }
                         // Fill salary
                         for (const p of buyer.roster) {
                             if (currentSal >= vet.salary * 0.8) break;
                             if (!tradePack.includes(p) && p.id !== buyerAssets[0].id) {
                                 tradePack.push(p);
                                 currentSal += p.salary;
                             }
                         }
                         
                         // Check Math
                         if (currentSal >= vet.salary * 0.75 && currentSal <= vet.salary * 1.25) {
                            result = {
                                success: true,
                                transaction: {
                                    id: `cpu_tr_${Date.now()}`,
                                    date: 'TODAY',
                                    type: 'Trade',
                                    teamId: buyer.id,
                                    description: `[CPU] ${buyer.name} acquires ${vet.name}`,
                                    details: {
                                        acquired: [{ id: vet.id, name: vet.name, ovr: vet.ovr, position: vet.position }],
                                        traded: tradePack.map((p: Player) => ({ id: p.id, name: p.name, ovr: p.ovr, position: p.position })),
                                        partnerTeamId: seller.id,
                                        partnerTeamName: seller.name
                                    }
                                }
                            };
                         }
                     }
                }
            }
            if (!result) result = { success: false, reason: "No logic match" };
        }

        res.status(200).json(result);
    } catch (error: any) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
}

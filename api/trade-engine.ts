
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

// --- Configuration ---
const TRADE_CONFIG = {
    BASE: { 
        REPLACEMENT_LEVEL_OVR: 40, 
        // Reduced exponent slightly to make 1-to-many trades mathematically possible
        VALUE_EXPONENT: 2.8, 
        SUPERSTAR_PREMIUM_THRESHOLD: 89,
        SUPERSTAR_MULTIPLIER: 1.4 
    },
    CONTRACT: {
        VALUE_MULTIPLIER: 1.2, 
        BAD_CONTRACT_PENALTY: 0.7, 
    },
    NEEDS: { 
        POSITION_BONUS: 0.3,
        STAT_BONUS: 0.2,
        SALARY_DUMP_BONUS: 0.25 
    },
    SALARY: {
        TAX_LINE: 170, 
        FLOOR_MATCH: 0.75, 
        CEILING_MATCH: 1.25
    }
};

// --- Helper Functions ---

// 1. Calculate Base Trade Value
function getPlayerTradeValue(p: Player, debugLog: string[] = []): number {
    const C = TRADE_CONFIG;
    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, p.ovr);
    
    // 1. Base OVR Value (Non-linear but flatter curve)
    let baseValue = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    // 2. Superstar Premium (Significant boost for 90+)
    if (p.ovr >= C.BASE.SUPERSTAR_PREMIUM_THRESHOLD) {
        baseValue *= C.BASE.SUPERSTAR_MULTIPLIER;
    }

    // 3. Age & Potential (Youth Premium)
    if (p.age <= 23) {
        if (p.potential > p.ovr) {
            // Potential bonus capped
            const potBonus = 1.0 + Math.min(0.5, (p.potential - 70) * 0.03);
            baseValue *= potBonus;
        }
    } else if (p.age >= 32) {
        // Veteran decline
        const decline = (p.age - 31) * 0.1;
        baseValue *= Math.max(0.3, 1.0 - decline);
    }

    // 4. Contract Efficiency (Avoid penalizing Superstars too much for high salary)
    const expectedSalary = Math.max(2, Math.pow(p.ovr - 60, 2) / 8);
    const actualSalary = Math.max(1, p.salary);
    
    // Only apply contract penalty if NOT a superstar (Superstars are worth max money)
    if (p.ovr < 85) {
        if (actualSalary > expectedSalary * 1.5) {
            baseValue *= C.CONTRACT.BAD_CONTRACT_PENALTY;
        } else if (actualSalary < expectedSalary * 0.7) {
            baseValue *= C.CONTRACT.VALUE_MULTIPLIER;
        }
    }

    return Math.floor(baseValue);
}

// 2. Analyze Team Needs (Fixed Logic)
function analyzeTeamSituation(team: Team): TeamNeeds {
    const roster = team.roster;
    // Sort by OVR for top-end talent check
    const sorted = [...roster].sort((a, b) => b.ovr - a.ovr);
    const top8 = sorted.slice(0, 8);
    
    // Position Depth Check (Check FULL roster, not just top 8)
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const weakPositions: string[] = [];
    const strongPositions: string[] = [];
    
    positions.forEach(pos => {
        // Count playable players (>74 OVR) at this position
        const depth = roster.filter(p => p.position.includes(pos) && p.ovr >= 74);
        const bestAtPos = depth.length > 0 ? depth.reduce((max, p) => p.ovr > max.ovr ? p : max) : null;
        
        if (!bestAtPos || bestAtPos.ovr < 77 || depth.length < 2) {
            weakPositions.push(pos);
        }
        if (bestAtPos && bestAtPos.ovr > 85 && depth.length >= 2) {
            strongPositions.push(pos);
        }
    });

    // Stat Needs (Compare avg of top 8)
    const statNeeds: string[] = [];
    
    // Calculate averages safely
    const avgDef = top8.reduce((s, p) => s + (p.def || 0), 0) / top8.length;
    const avgOut = top8.reduce((s, p) => s + (p.out || 0), 0) / top8.length;
    const avgReb = top8.reduce((s, p) => s + (p.reb || 0), 0) / top8.length;

    // Thresholds adjusted for the data scale (usually 40-99)
    // If team avg is below ~70, they are weak in that area.
    if (avgDef < 70) statNeeds.push('DEF');
    if (avgOut < 72) statNeeds.push('3PT');
    if (avgReb < 65) statNeeds.push('REB');

    // Cap Situation
    const totalSalary = roster.reduce((s, p) => s + p.salary, 0);
    const taxLine = team.luxuryTaxLine || TRADE_CONFIG.SALARY.TAX_LINE;
    const isTaxPayer = totalSalary > taxLine;
    
    // Status (Contender if they have 2 stars or high avg)
    const top2Ovr = (top8[0]?.ovr || 0) + (top8[1]?.ovr || 0);
    const isContender = top2Ovr > 175; // e.g. 88 + 87
    const isSeller = !isContender && (team.wins || 0) < (team.losses || 0);

    return { weakPositions, strongPositions, statNeeds, isContender, isSeller, capSpace: taxLine - totalSalary, isTaxPayer };
}

// 3. Contextual Value (Needs & Fit)
function getContextualValue(player: Player, needs: TeamNeeds, isAcquiring: boolean, log: string[] = []): number {
    let value = getPlayerTradeValue(player);
    const C = TRADE_CONFIG.NEEDS;

    if (isAcquiring) {
        // 1. Position Need
        if (needs.weakPositions.some(pos => player.position.includes(pos))) {
            value *= (1 + C.POSITION_BONUS);
            // log.push(`Fit: Need ${player.position}`);
        } else if (needs.strongPositions.some(pos => player.position.includes(pos))) {
            value *= 0.8; // Redundant
        }

        // 2. Stat Need
        let statBonus = 0;
        if (needs.statNeeds.includes('DEF') && player.def > 78) statBonus += 0.1;
        if (needs.statNeeds.includes('3PT') && player.out > 78) statBonus += 0.1;
        if (needs.statNeeds.includes('REB') && player.reb > 78) statBonus += 0.1;
        value *= (1 + Math.min(statBonus, 0.25));

        // 3. Contender / Seller Logic
        if (needs.isContender) {
            if (player.ovr >= 82) value *= 1.25; // Win-now premium
            if (player.potential > 85 && player.ovr < 75) value *= 0.7; // Don't care about prospects
        } 
        if (needs.isSeller) {
            if (player.age <= 23 || player.contractYears <= 1) value *= 1.3; // Rebuild pieces
            if (player.age > 28 && player.contractYears > 1) value *= 0.6; // Avoid long vets
        }

    } else {
        // When AI is giving up players
        // Sellers undervalue their expensive vets to clear books
        if (needs.isSeller && player.age > 27 && player.salary > 20) {
            value *= 0.85; 
        }
        // Contenders overvalue their rotation pieces
        if (needs.isContender && player.ovr > 78) {
            value *= 1.15;
        }
    }

    return Math.floor(value);
}

// 4. Untouchables (Logic Refined)
function getUntouchables(team: Team, needs: TeamNeeds): Set<string> {
    const untouchables = new Set<string>();
    const roster = [...team.roster].sort((a, b) => b.ovr - a.ovr);
    
    // Core Logic:
    // 1. Never trade the Franchise Player (Best Player) unless rebuilding (and getting a haul)
    // 2. Contenders keep their top 4.
    // 3. Rebuilders keep their young high-potential players.
    
    if (needs.isContender) {
        roster.slice(0, 4).forEach(p => untouchables.add(p.id));
    } else {
        // Rebuilder: Keep young talent
        roster.filter(p => p.age <= 24 && p.potential >= 85).forEach(p => untouchables.add(p.id));
        // Keep Franchise player if he is young
        if (roster[0] && roster[0].age <= 27) untouchables.add(roster[0].id);
    }
    return untouchables;
}

// 5. Data Mapper (Robust Stat Calculation)
function mapDbPlayer(p: any): Player {
    // Determine Attributes safely
    // Note: The CSV/DB keys might be lowercase or snake_case. 
    const attr = p.base_attributes || {};
    
    const v = (k1: string, k2: string, def = 50) => 
        (attr[k1] !== undefined ? attr[k1] : (p[k1] !== undefined ? p[k1] : (p[k2] !== undefined ? p[k2] : def)));

    // Calculate aggregated stats if missing
    const perDef = v('perDef', 'pdef');
    const intDef = v('intDef', 'idef');
    const steal = v('steal', 'stl');
    const blk = v('blk', 'blk');
    const def = v('def', 'def', Math.round((perDef + intDef + steal + blk) / 4));

    const close = v('closeShot', 'close');
    const mid = v('midRange', 'mid');
    const three = v('threeCorner', '3c'); // Proxy for 3pt
    const out = v('out', 'out', Math.round((close + mid + three) / 3));

    const oreb = v('offReb', 'oreb');
    const dreb = v('defReb', 'dreb');
    const reb = v('reb', 'reb', Math.round((oreb + dreb * 2) / 3));
    
    const passAcc = v('passAcc', 'pacc');
    const vision = v('passVision', 'pvis');
    const plm = v('plm', 'plm', Math.round((passAcc + vision) / 2));

    return {
        id: p.id,
        name: p.name,
        position: p.position,
        age: p.age,
        salary: p.salary,
        contractYears: p.contract_years,
        ovr: attr.ovr || p.ovr || 75,
        potential: attr.potential || p.pot || 75,
        def, out, reb, plm,
        intDef, perDef, threeCorner: three,
        ...attr
    };
}


// --- Main Handler ---
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

        // =================================================================
        // ACTION 1: Generate Offers (AI makes offers for user's players)
        // =================================================================
        if (action === 'generate-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { tradingPlayers, desiredPositions } = payload;
            const offers: TradeOffer[] = [];
            
            const userSalary = tradingPlayers.reduce((sum: number, p: Player) => sum + p.salary, 0);
            const userOvrMax = Math.max(...tradingPlayers.map((p: Player) => p.ovr));
            const isSuperstarTrade = userOvrMax >= 88;

            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);

            for (const targetTeam of otherTeams) {
                const logs: string[] = [];
                const needs = analyzeTeamSituation(targetTeam);
                
                // [Correction] Filter untouchables logic
                // If user offers a Superstar, AI is willing to trade its best players (except absolute Franchise Icons > 95 if they are competing)
                const untouchables = getUntouchables(targetTeam, needs);
                
                // 1. Evaluate Value of User's Package to AI
                let userValueToAI = 0;
                tradingPlayers.forEach((p: Player) => {
                    userValueToAI += getContextualValue(p, needs, true, logs);
                });

                if (userValueToAI < 500) continue; // Too low to bother

                // 2. Define Candidate Pool
                // If Superstar trade, expand pool to include almost everyone
                let candidates = targetTeam.roster.filter(p => {
                     if (isSuperstarTrade) return p.ovr < 96; // AI keeps top-5 league players
                     return !untouchables.has(p.id);
                });

                // Sort candidates:
                // If Seller: Prioritize getting rid of Bad Contracts / Old players
                // If Buyer: Prioritize keeping best players, trade away picks/prospects/fillers
                candidates.sort((a, b) => {
                    // Always try to dump bad contracts first
                    const aBad = a.salary > 20 && a.ovr < 80 ? 1 : 0;
                    const bBad = b.salary > 20 && b.ovr < 80 ? 1 : 0;
                    return bBad - aBad || getPlayerTradeValue(a) - getPlayerTradeValue(b); // Low value first
                });

                // 3. Construct Package (Retry loop)
                for (let i = 0; i < 40; i++) {
                    const pack: Player[] = [];
                    let packValue = 0;
                    let packSalary = 0;
                    
                    // [CRITICAL FIX] Core Piece Requirement
                    // If user gives Superstar, AI MUST include a Core Piece (Young Star or High OVR)
                    let forcedCore: Player | undefined;
                    if (isSuperstarTrade) {
                         const coreCandidates = candidates.filter(p => p.ovr >= 82 || (p.potential >= 88 && p.age <= 24));
                         if (coreCandidates.length === 0) break; // AI cannot afford superstar
                         forcedCore = coreCandidates[Math.floor(Math.random() * coreCandidates.length)];
                         
                         pack.push(forcedCore);
                         packValue += getContextualValue(forcedCore, needs, false);
                         packSalary += forcedCore.salary;
                    }

                    // Salary Match Targets
                    const salaryMin = needs.isTaxPayer ? userSalary * 0.8 : userSalary * 0.75;
                    const salaryMax = userSalary * 1.25 + 5; 

                    // Value Match Target
                    // AI wants to win the trade: AI Gives < User Gives
                    // But if AI really needs the position/stat, it pays closer to fair value.
                    const valueTarget = userValueToAI * 0.95; 

                    let attempts = 0;
                    const pool = candidates.filter(p => !pack.includes(p));

                    // Fill Logic
                    while (attempts < 20 && pack.length < 5) {
                        attempts++;
                        
                        // Condition to stop: Salary met AND Value is reasonable
                        // [FIX] Don't stop just because salary met. Check Value too.
                        const isSalOk = packSalary >= salaryMin;
                        const isValOk = packValue >= valueTarget * 0.85; // Allow slight underpay

                        if (isSalOk && isValOk) break;

                        // Selection Strategy
                        let nextPiece: Player | undefined;
                        
                        // If we need Salary: Find expensive player
                        if (!isSalOk) {
                            const needed = salaryMin - packSalary;
                            nextPiece = pool.find(p => !pack.includes(p) && p.salary >= needed * 0.5) || pool[Math.floor(Math.random()*pool.length)];
                        } 
                        // If we need Value (Sweetener): Find high value / low salary (Young/Pick equivalent)
                        else if (!isValOk) {
                            nextPiece = pool.find(p => !pack.includes(p) && p.ovr > 74 && p.salary < 10);
                        }

                        if (nextPiece && !pack.includes(nextPiece)) {
                            pack.push(nextPiece);
                            packValue += getContextualValue(nextPiece, needs, false);
                            packSalary += nextPiece.salary;
                        }
                    }

                    // Final Validation
                    const finalSalRatio = userSalary > 0 ? packSalary / userSalary : 0;
                    const finalValRatio = userValueToAI > 0 ? packValue / userValueToAI : 0;

                    // Strict salary rules
                    const salValid = Math.abs(packSalary - userSalary) < 5 || (finalSalRatio >= 0.75 && finalSalRatio <= 1.25);
                    
                    // Loose value rules (AI won't rip itself off, but will pay for stars)
                    // If Superstar trade, AI accepts paying 80% to 110% of value
                    // If Normal trade, AI accepts paying 70% to 100% of value
                    const minValRatio = isSuperstarTrade ? 0.80 : 0.70;
                    const maxValRatio = 1.1; 
                    const valValid = finalValRatio >= minValRatio && finalValRatio <= maxValRatio;

                    // Positional Filter (Optional)
                    const posValid = desiredPositions.length === 0 || pack.some(p => desiredPositions.some(dp => p.position.includes(dp)));

                    if (salValid && valValid && posValid && pack.length > 0) {
                        const isDup = offers.some(o => o.teamId === targetTeam.id && o.players.every((p: Player) => pack.some((pk: Player) => pk.id === p.id)));
                        if (!isDup) {
                            // Generate Analysis
                            const reasoning = [`[Needs] ${needs.weakPositions.join(', ')} | ${needs.statNeeds.join(', ')}`];
                            if (isSuperstarTrade) reasoning.push("[Strategy] Blockbuster Acquisition");
                            else if (needs.isSeller) reasoning.push("[Strategy] Rebuild / Salary Dump");
                            
                            // Highlight best asset
                            const best = pack.reduce((a,b) => a.ovr > b.ovr ? a : b);
                            reasoning.push(`[Key Asset] ${best.name} (${best.ovr})`);
                            
                            offers.push({
                                teamId: targetTeam.id,
                                teamName: targetTeam.name,
                                players: pack,
                                diffValue: packValue - userValueToAI,
                                analysis: reasoning
                            });
                        }
                    }
                }
            }
            // Return top 5 offers sorted by value for user
            result = { offers: offers.sort((a, b) => b.diffValue - a.diffValue).slice(0, 5) };
        }

        // =================================================================
        // ACTION 2: Generate Counter Offers (User requests specific players)
        // =================================================================
        else if (action === 'generate-counter-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { targetPlayers, targetTeamId } = payload;
            const targetTeam = allTeams.find(t => t.id === targetTeamId);
            if (!targetTeam) throw new Error("Target team not found");

            const needs = analyzeTeamSituation(targetTeam);
            
            // 1. Check Untouchables
            const untouchables = getUntouchables(targetTeam, needs);
            if (targetPlayers.some((p: Player) => untouchables.has(p.id))) {
                 // AI refuses to trade untouchables via this channel easily
                 // Could return empty or demanding huge overpay.
                 // For now, let's just apply a huge value multiplier to represent "unwillingness"
            }

            // 2. Valuation
            let targetValueToAI = 0; // Value AI loses
            let targetSalary = 0;
            targetPlayers.forEach((p: Player) => {
                let v = getContextualValue(p, needs, false); 
                if (untouchables.has(p.id)) v *= 2.0; // Penalty
                targetValueToAI += v;
                targetSalary += p.salary;
            });

            // 3. Search User Roster
            // AI wants players that fit its needs, or simply high value assets
            const candidates = myTeam.roster.sort((a,b) => b.ovr - a.ovr);
            const offers: TradeOffer[] = [];

            for (let i = 0; i < 30; i++) {
                const pack: Player[] = [];
                let packValue = 0;
                let packSalary = 0;

                // Priority: Matching Needs
                const neededPlayers = candidates.filter(p => 
                    needs.weakPositions.some(wp => p.position.includes(wp)) && 
                    !pack.includes(p)
                );
                
                // Add 1-2 needed players if available
                if (neededPlayers.length > 0) {
                     const p = neededPlayers[Math.floor(Math.random() * Math.min(3, neededPlayers.length))];
                     pack.push(p);
                     packValue += getContextualValue(p, needs, true);
                     packSalary += p.salary;
                }

                // Fill rest to match salary/value
                let attempts = 0;
                while (attempts < 20 && pack.length < 5) {
                    attempts++;
                    const salaryNeeded = targetSalary - packSalary;
                    const valueNeeded = targetValueToAI * 1.1 - packValue; // AI wants 10% profit

                    if (Math.abs(salaryNeeded) < 5 && valueNeeded <= 0) break;

                    let pool = candidates.filter(p => !pack.includes(p));
                    let next: Player | undefined;

                    // Logic: If salary far off, pick salary match. If value far off, pick best available.
                    if (salaryNeeded > 10) {
                        next = pool.find(p => Math.abs(p.salary - salaryNeeded) < 5);
                    } else if (valueNeeded > 0) {
                        next = pool[0]; // Best available
                    } else {
                        next = pool.find(p => p.salary < 5); // Filler
                    }

                    if (next) {
                         pack.push(next);
                         packValue += getContextualValue(next, needs, true);
                         packSalary += next.salary;
                    } else {
                         // Random fill
                         if (pool.length > 0) {
                             const p = pool[Math.floor(Math.random()*pool.length)];
                             pack.push(p);
                             packValue += getContextualValue(p, needs, true);
                             packSalary += p.salary;
                         }
                    }
                }

                // Validate
                const salRatio = targetSalary > 0 ? packSalary / targetSalary : 0;
                const isSal = Math.abs(packSalary - targetSalary) < 5 || (salRatio >= 0.75 && salRatio <= 1.25);
                const isVal = packValue >= targetValueToAI * 1.05; // AI demands 5% profit minimum

                if (isSal && isVal) {
                    const isDup = offers.some(o => o.players.every((p: Player) => pack.some((pk: Player) => pk.id === p.id)));
                    if (!isDup) {
                        offers.push({
                            teamId: myTeam.id,
                            teamName: myTeam.name,
                            players: pack,
                            diffValue: packValue - targetValueToAI,
                            analysis: [`Requesting assets to match value of ${Math.round(targetValueToAI)}`]
                        });
                    }
                }
            }
            result = { offers: offers.sort((a,b) => a.diffValue - b.diffValue).slice(0, 3) };
        }
        
        // =================================================================
        // ACTION 3: CPU v CPU Trades
        // =================================================================
        else if (action === 'simulate-cpu-trades') {
            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);
            if (otherTeams.length < 2) {
                result = { success: false, reason: "Not enough teams" };
            } else {
                // Find potential trade partners
                // Simple logic: Find a Seller and a Buyer
                const sellers = otherTeams.filter(t => analyzeTeamSituation(t).isSeller);
                const buyers = otherTeams.filter(t => analyzeTeamSituation(t).isContender);
                
                if (sellers.length > 0 && buyers.length > 0) {
                    const seller = sellers[Math.floor(Math.random() * sellers.length)];
                    const buyer = buyers[Math.floor(Math.random() * buyers.length)];
                    
                    if (seller.id !== buyer.id) {
                         // Seller gives Veteran (Age > 28, Salary > 10)
                         const tradeAsset = seller.roster.find(p => p.age >= 28 && p.salary > 10 && p.ovr > 78);
                         if (tradeAsset) {
                             // Buyer gives picks/youngs/salary filler
                             const buyerAssets = buyer.roster.filter(p => (p.age <= 24 && p.potential > 75) || (p.salary > 5 && p.ovr < 75)); // Young or Filler
                             
                             let pack: Player[] = [];
                             let packSal = 0;
                             let packVal = 0;
                             
                             // Sort buyer assets by "suitability" for trade (Fillers first, then young)
                             buyerAssets.sort((a,b) => a.ovr - b.ovr); 
                             
                             for (const p of buyerAssets) {
                                 if (packSal >= tradeAsset.salary * 0.8) break;
                                 pack.push(p);
                                 packSal += p.salary;
                                 packVal += getPlayerTradeValue(p);
                             }

                             // Check if trade works
                             const assetVal = getPlayerTradeValue(tradeAsset);
                             const isSal = packSal >= tradeAsset.salary * 0.75 && packSal <= tradeAsset.salary * 1.25;
                             const isVal = packVal >= assetVal * 0.8; // Buyer gets slight discount for taking salary

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

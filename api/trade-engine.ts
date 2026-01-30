
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

// --- Debug Logger ---
const DEBUG = true;
const LOG = (msg: string, data?: any) => {
    const timestamp = new Date().toISOString();
    if (data) console.log(`[${timestamp}] [TradeEngine] ${msg}`, JSON.stringify(data));
    else console.log(`[${timestamp}] [TradeEngine] ${msg}`);
};

// --- Configuration ---
const TRADE_CONFIG = {
    BASE: { 
        REPLACEMENT_LEVEL_OVR: 40, 
        VALUE_EXPONENT: 2.75, 
        SUPERSTAR_PREMIUM_THRESHOLD: 94,
        SUPERSTAR_MULTIPLIER: 1.3 
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

// --- Weights Constant (Synced with Client) ---
type PositionType = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
const POSITION_WEIGHTS: Record<PositionType, Record<string, number>> = {
  PG: { 
      closeShot: 10, midRange: 20, threeAvg: 25, ft: 10, shotIq: 45, offConsist: 25, 
      layup: 25, dunk: 0, postPlay: 0, drawFoul: 0, hands: 40, 
      intDef: 0, perDef: 0, steal: 0, blk: 0, helpDefIq: 0, passPerc: 0, defConsist: 0, 
      offReb: 0, defReb: 0, 
      speed: 0, agility: 0, strength: 0, vertical: 0, stamina: 15, hustle: 0, durability: 0, 
      passAcc: 25, handling: 15, spdBall: 10, passVision: 25, passIq: 50, 
      intangibles: 5, potential: 500, height: 0 
  },
  SG: { 
      closeShot: 300, midRange: 100, threeAvg: 150, ft: 100, shotIq: 500, offConsist: 500, 
      layup: 200, dunk: 150, postPlay: 0, drawFoul: 50, hands: 250, 
      intDef: 0, perDef: 0, steal: 0, blk: 0, helpDefIq: 0, passPerc: 0, defConsist: 5, 
      offReb: 0, defReb: 0, 
      speed: 0, agility: 0, strength: 0, vertical: 0, stamina: 0, hustle: 0, durability: 0, 
      passAcc: 0, handling: 0, spdBall: 0, passVision: 0, passIq: 0, 
      intangibles: 50, potential: 500, height: 30 
  },
  SF: { 
      closeShot: 300, midRange: 150, threeAvg: 50, ft: 150, shotIq: 300, offConsist: 500, 
      layup: 500, dunk: 100, postPlay: 0, drawFoul: 150, hands: 250, 
      intDef: 200, perDef: 200, steal: 10, blk: 0, helpDefIq: 10, passPerc: 10, defConsist: 0, 
      offReb: 0, defReb: 0, 
      speed: 0, agility: 100, strength: 0, vertical: 100, stamina: 200, hustle: 200, durability: 0, 
      passAcc: 0, handling: 0, spdBall: 0, passVision: 0, passIq: 0, 
      intangibles: 5, potential: 500, height: 100 
  },
  PF: { 
      closeShot: 450, midRange: 50, threeAvg: 50, ft: 150, shotIq: 100, offConsist: 600, 
      layup: 500, dunk: 350, postPlay: 0, drawFoul: 0, hands: 500, 
      intDef: 200, perDef: 50, steal: 0, blk: 50, helpDefIq: 0, passPerc: 0, defConsist: 0, 
      offReb: 100, defReb: 160, 
      speed: 0, agility: 0, strength: 100, vertical: 100, stamina: 100, hustle: 0, durability: 50, 
      passAcc: 50, handling: 50, spdBall: 0, passVision: 50, passIq: 50, 
      intangibles: 10, potential: 500, height: 150 
  },
  C: { 
      closeShot: 300, midRange: 0, threeAvg: 0, ft: 0, shotIq: 200, offConsist: 0, 
      layup: 0, dunk: 0, postPlay: 200, drawFoul: 250, hands: 200, 
      intDef: 250, perDef: 0, steal: 0, blk: 100, helpDefIq: 0, passPerc: 0, defConsist: 200, 
      offReb: 100, defReb: 100, 
      speed: 0, agility: 0, strength: 150, vertical: 0, stamina: 150, hustle: 0, durability: 150, 
      passAcc: 100, handling: 200, spdBall: 0, passVision: 0, passIq: 100, 
      intangibles: 15, potential: 500, height: 180 
  }
};

// --- Helper Functions ---

// 0. Attribute Mapper (DB Keys -> Runtime Keys)
function normalizeAttributes(attrs: any) {
    const get = (keys: string[]) => {
        for (const k of keys) {
            if (attrs[k] !== undefined) return Number(attrs[k]);
            if (attrs[k.toLowerCase()] !== undefined) return Number(attrs[k.toLowerCase()]);
        }
        return 50; // Default
    };

    return {
        // Shooting
        closeShot: get(['CLOSE', 'closeShot']),
        midRange: get(['MID', 'midRange']),
        threeCorner: get(['3C', 'threeCorner']),
        three45: get(['3_45', 'three45']),
        threeTop: get(['3T', 'threeTop']),
        ft: get(['FT', 'ft']),
        shotIq: get(['SIQ', 'shotIq']),
        offConsist: get(['OCON', 'offConsist']),
        
        // Inside
        layup: get(['LAY', 'layup']),
        dunk: get(['DNK', 'dunk']),
        postPlay: get(['POST', 'postPlay']),
        drawFoul: get(['DRAW', 'drawFoul']),
        hands: get(['HANDS', 'hands']),

        // Playmaking
        passAcc: get(['PACC', 'passAcc']),
        handling: get(['HANDL', 'handling']),
        spdBall: get(['SPWB', 'spdBall']),
        passVision: get(['PVIS', 'passVision']),
        passIq: get(['PIQ', 'passIq']),

        // Defense
        intDef: get(['IDEF', 'intDef']),
        perDef: get(['PDEF', 'perDef']),
        steal: get(['STL', 'steal']),
        blk: get(['BLK', 'blk']),
        helpDefIq: get(['HDEF', 'helpDefIq']),
        passPerc: get(['PPER', 'passPerc']),
        defConsist: get(['DCON', 'defConsist']),
        
        // Rebound
        offReb: get(['OREB', 'offReb']),
        defReb: get(['DREB', 'defReb']),
        
        // Athleticism
        speed: get(['SPD', 'speed']),
        agility: get(['AGI', 'agility']),
        strength: get(['STR', 'strength']),
        vertical: get(['VERT', 'vertical']),
        stamina: get(['STA', 'stamina']),
        hustle: get(['HUS', 'hustle']),
        durability: get(['DUR', 'durability']),
        
        // Meta
        potential: get(['POT', 'potential']),
        intangibles: get(['INTANGIBLES', 'intangibles']),
        height: get(['HEIGHT', 'height']) // Added for Center calculation
    };
}

// 0.1 Calculate OVR from Normalized Stats (Synced with Client Logic)
function calculateOvr(p: any): number {
    const position = p.position || 'PG';
    let posKey: PositionType = 'PG';
    if (position.includes('SG')) posKey = 'SG';
    else if (position.includes('SF')) posKey = 'SF';
    else if (position.includes('PF')) posKey = 'PF';
    else if (position.includes('C')) posKey = 'C';

    const weights = POSITION_WEIGHTS[posKey];
    
    // Prepare attribute object
    const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
    const attr: Record<string, number> = {
        closeShot: p.closeShot, midRange: p.midRange, threeAvg: threeAvg, ft: p.ft, shotIq: p.shotIq, offConsist: p.offConsist,
        layup: p.layup, dunk: p.dunk, postPlay: p.postPlay, drawFoul: p.drawFoul, hands: p.hands,
        passAcc: p.passAcc, handling: p.handling, spdBall: p.spdBall, passVision: p.passVision, passIq: p.passIq,
        stamina: p.stamina, intDef: p.intDef, perDef: p.perDef, steal: p.steal, blk: p.blk, helpDefIq: p.helpDefIq,
        passPerc: p.passPerc, defConsist: p.defConsist, offReb: p.offReb, defReb: p.defReb, potential: p.potential,
        intangibles: p.intangibles, height: p.height || 200, strength: p.strength, vertical: p.vertical,
        durability: p.durability, agility: p.agility, hustle: p.hustle, speed: p.speed
    };

    let totalVal = 0;
    let totalWeight = 0;

    for (const key in weights) {
        if (weights.hasOwnProperty(key)) {
            const w = weights[key];
            const val = attr[key] ?? 50;
            totalVal += val * w;
            totalWeight += w;
        }
    }

    return Math.min(99, Math.max(40, Math.round(totalWeight > 0 ? totalVal / totalWeight : 50)));
}

// 1. Calculate Base Trade Value
function getPlayerTradeValue(p: Player): number {
    const C = TRADE_CONFIG;
    const safeOvr = typeof p.ovr === 'number' ? p.ovr : 70;
    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, safeOvr);
    
    // 1. Base OVR Value (Exponential Curve)
    let baseValue = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    // 2. Superstar Premium
    if (safeOvr >= C.BASE.SUPERSTAR_PREMIUM_THRESHOLD) {
        baseValue *= C.BASE.SUPERSTAR_MULTIPLIER;
    } else if (safeOvr >= 88) {
        baseValue *= 1.15; 
    }

    // 3. Age & Potential
    if (p.age <= 23) {
        if (p.potential > safeOvr) {
            const potDiff = p.potential - safeOvr;
            const potBonus = 1.0 + (potDiff * 0.05); 
            baseValue *= potBonus;
        }
    } else if (p.age >= 32) {
        const decline = (p.age - 31) * 0.1;
        baseValue *= Math.max(0.1, 1.0 - decline);
    }

    // 4. Contract Efficiency
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
        
        if (!bestAtPos || bestAtPos.ovr < 75 || depth.length < 2) {
            weakPositions.push(pos);
        }
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
        if (needs.isContender && player.ovr >= 80) value *= 1.25; 
        if (needs.isSeller && player.age <= 23) value *= 1.35; 

    } else {
        // Selling Logic
        if (needs.isSeller && player.age > 28) value *= 0.7; // "Dump him"
        if (needs.isContender && player.ovr > 80) value *= 1.3; // "We need him"
    }

    return Math.floor(value);
}

// 4. Dynamic Core Asset Definition
function getCoreAssetFilter(roster: Player[]): (p: Player) => boolean {
    const has90 = roster.some(p => p.ovr >= 90);
    const has85 = roster.some(p => p.ovr >= 85);

    return (p: Player) => {
        if (has90) return p.ovr >= 90;
        if (has85) return p.ovr >= 85;
        return false;
    };
}

// 5. Data Mapper (DB -> Engine Player)
function mapDbPlayer(p: any): Player {
    // 1. Normalize Attributes from DB JSON
    const attrs = normalizeAttributes(p.base_attributes || {});
    
    // 2. Calculate Derived Stats
    const ins = (attrs.layup + attrs.dunk + attrs.postPlay + attrs.closeShot) / 4;
    const threeAvg = (attrs.threeCorner + attrs.three45 + attrs.threeTop) / 3;
    const out = (attrs.midRange + threeAvg + attrs.ft) / 3;
    const def = (attrs.perDef + attrs.intDef + attrs.steal + attrs.blk) / 4;
    const plm = (attrs.handling + attrs.passAcc + attrs.passVision) / 3;
    const reb = (attrs.offReb + attrs.defReb) / 2;
    const ath = (attrs.speed + attrs.agility + attrs.strength + attrs.vertical) / 4;
    
    // 3. Determine OVR
    // Recalculate using full weights instead of trusting DB OVR blindly (fixes Giannis issue)
    // The DB OVR might be outdated or calculated with a simpler formula.
    const calculatedOvr = calculateOvr({ ...attrs, position: p.position });
    const finalOvr = calculatedOvr;

    return {
        ...attrs, // Spread FIRST to avoid overwriting calculated overrides below

        id: p.id,
        name: p.name,
        position: p.position || 'G',
        age: Number(p.age || 20),
        salary: Number(p.salary || 1),
        contractYears: Number(p.contract_years || 1),
        ovr: finalOvr,
        
        // Override potential if needed (default from normalize is 50)
        potential: (attrs.potential && attrs.potential !== 50) ? attrs.potential : (finalOvr + 5),
        
        // Engine Specific Stats
        def, out, reb, plm, ins, ath,
        
        // Explicitly map keys that might be missing from spread if they came from calculations above
    };
}


// --- API Handler ---
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { action, payload } = req.body;
        LOG(`Action Received: ${action}`);

        const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
        const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
        const supabaseClient = createClient(supabaseUrl, supabaseKey);

        // Fetch DB Data - Single Source of Truth
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
            
            const isSuperstarTrade = userMaxOvr >= 94; // User offering a top-tier superstar
            
            LOG(`Generating offers for user package. Salary: ${userSalary}, MaxOVR: ${userMaxOvr}, Players: ${tradingPlayers.length}`);

            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);

            for (const targetTeam of otherTeams) {
                const needs = analyzeTeamSituation(targetTeam);
                const isCore = getCoreAssetFilter(targetTeam.roster); // Dynamic Core Logic

                // User Value Calculation
                let userValueToAI = 0;
                tradingPlayers.forEach((p: Player) => {
                    let val = getContextualValue(p, needs, true);
                    // [Feature] User Scarcity Premium: 
                    // If user puts a 95+ superstar on block, multiply value
                    if (p.ovr >= 95) val *= 1.5; // Toned down from 2.0 to ensure matches
                    else if (p.ovr >= 90) val *= 1.2;
                    userValueToAI += val;
                });
                
                if (userValueToAI < 300) continue; 

                // 2. Candidate Selection
                // Filter: AI protects its Core Assets unless getting a better player
                let candidates = targetTeam.roster.filter(p => {
                    if (isCore(p)) {
                        // AI only gives up Core if User offers Superstar (94+) AND Core is worse than User's player
                        if (isSuperstarTrade && p.ovr < userMaxOvr) return true; 
                        return false; // Otherwise protect core
                    }
                    return true;
                });
                
                // Shuffle for variety
                candidates.sort(() => Math.random() - 0.5);

                // 3. Generate Packages
                for (let i = 0; i < 20; i++) {
                    const pack: Player[] = [];
                    let packValue = 0;
                    let packSalary = 0;
                    
                    // Force Headliner Logic
                    if (isSuperstarTrade) {
                         // Try to find a matching star from candidates
                         const stars = candidates.filter(p => p.ovr >= 85 || (p.potential >= 88 && p.age <= 24)).sort((a,b) => b.ovr - a.ovr);
                         if (stars.length > 0) {
                             // Pick one of top 2 available stars
                             const star = stars[Math.floor(Math.random() * Math.min(2, stars.length))];
                             pack.push(star);
                             packValue += getContextualValue(star, needs, false);
                             packSalary += star.salary;
                         }
                    }

                    // Fill logic
                    const pool = candidates.filter(p => !pack.includes(p));
                    const salaryMin = userSalary * 0.75;
                    // Lower value target slightly to allow deals to happen (0.85 of user val)
                    const valueTarget = userValueToAI; 

                    let attempts = 0;
                    while (pack.length < 5 && attempts < 50) {
                        attempts++;
                        const isSalOk = packSalary >= salaryMin;
                        // AI wants to *receive* more value or at least equal.
                        // But to generate offers, we assume AI is willing to pay ~90% of user value if it fills a need
                        const isValOk = packValue >= valueTarget * 0.9;

                        if (isSalOk && isValOk) break;

                        const salDeficit = salaryMin - packSalary;
                        const valDeficit = valueTarget - packValue;
                        let nextPiece: Player | undefined;

                        if (!isValOk && valDeficit > 5000) {
                            // Need Value: Get best available
                            nextPiece = pool.sort((a,b) => getPlayerTradeValue(b) - getPlayerTradeValue(a))[0];
                        } else if (!isSalOk && salDeficit > 5) {
                            // Need Salary
                            nextPiece = pool.find(p => Math.abs(p.salary - salDeficit) < 5) || pool.find(p => p.salary > 5);
                        } else {
                            // Filler
                            nextPiece = pool[Math.floor(Math.random() * pool.length)]; 
                        }

                        if (nextPiece && !pack.includes(nextPiece)) {
                            pack.push(nextPiece);
                            packValue += getContextualValue(nextPiece, needs, false);
                            packSalary += nextPiece.salary;
                            // Remove from pool
                            const idx = pool.indexOf(nextPiece);
                            if (idx > -1) pool.splice(idx, 1);
                        }
                    }

                    // 4. Validation
                    const valRatio = userValueToAI > 0 ? packValue / userValueToAI : 0;
                    const validValue = valRatio >= 0.85 && valRatio <= 1.5;

                    const salRatio = userSalary > 0 ? packSalary / userSalary : 0;
                    const validSalary = Math.abs(packSalary - userSalary) < 5 || (salRatio >= 0.70 && salRatio <= 1.35);

                    const posValid = desiredPositions.length === 0 || pack.some(p => desiredPositions.some((dp: string) => p.position.includes(dp)));

                    if (validValue && validSalary && posValid && pack.length > 0) {
                        const isDup = offers.some(o => o.teamId === targetTeam.id && o.players.length === pack.length && o.players.every(p => pack.some(pk => pk.id === p.id)));
                        if (!isDup) {
                            offers.push({
                                teamId: targetTeam.id,
                                teamName: targetTeam.name,
                                players: pack,
                                diffValue: packValue - userValueToAI,
                                analysis: [`Value Ratio: ${valRatio.toFixed(2)}`, `Salary Ratio: ${salRatio.toFixed(2)}`]
                            });
                        }
                    }
                }
            }
            
            // Log if no offers
            if (offers.length === 0) {
                LOG("No offers generated. Relaxing constraints or user value too high?");
            }

            result = { offers: offers.sort((a, b) => b.diffValue - a.diffValue).slice(0, 5) };
        }

        else if (action === 'generate-counter-offers') {
            if (!myTeam) throw new Error("My team not found");
            const { targetPlayers, targetTeamId } = payload;
            const targetTeam = allTeams.find(t => t.id === targetTeamId);
            if (!targetTeam) throw new Error("Target team not found");

            const needs = analyzeTeamSituation(targetTeam);
            const isCore = getCoreAssetFilter(targetTeam.roster);

            const targetMaxOvr = Math.max(...targetPlayers.map((p: Player) => p.ovr));
            const isTargetingSuperstar = targetMaxOvr >= 95;

            let targetValueToAI = 0;
            let targetSalary = 0;
            
            targetPlayers.forEach((p: Player) => {
                let v = getContextualValue(p, needs, false); 
                // AI protecting its Superstar: High Markup
                if (isCore(p)) v *= 1.3; 
                targetValueToAI += v;
                targetSalary += p.salary;
            });
            
            LOG(`[Counter] Target Pkg Value: ${targetValueToAI}, Salary: ${targetSalary}`);

            // [Feature] User Buying Superstar Routes
            // Route A: 2x 90+ Players
            // Route B: 1x 90+ Player + High Potential Prospects
            let forcedPackageCandidates: Player[] = [];
            
            if (isTargetingSuperstar) {
                const user90s = myTeam.roster.filter(p => p.ovr >= 90);
                const userHighPot = myTeam.roster.filter(p => p.potential >= 88 && p.age <= 24 && p.ovr < 90);

                // Check for Route A (2x 90+)
                if (user90s.length >= 2) {
                    forcedPackageCandidates = user90s.slice(0, 2);
                    LOG(`[Route A] Found 2x 90+ players for superstar trade.`);
                } 
                // Check for Route B (1x 90+ & Prospects)
                else if (user90s.length >= 1 && userHighPot.length >= 2) {
                    forcedPackageCandidates = [user90s[0], ...userHighPot.slice(0, 2)];
                    LOG(`[Route B] Found 1x 90+ & prospects for superstar trade.`);
                }
            }

            const candidates = myTeam.roster.sort((a,b) => b.ovr - a.ovr);
            const offers: TradeOffer[] = [];

            for (let i = 0; i < 20; i++) {
                const pack: Player[] = [];
                
                // If special route identified, force those players first
                if (forcedPackageCandidates.length > 0 && i === 0) {
                     pack.push(...forcedPackageCandidates);
                }

                let packValue = pack.reduce((s,p) => s + getContextualValue(p, needs, true), 0);
                let packSalary = pack.reduce((s,p) => s + p.salary, 0);

                // Fill rest
                let pool = candidates.filter(p => !pack.includes(p));
                let attempts = 0;
                
                while (pack.length < 5 && attempts < 50) {
                    attempts++;
                    const salaryNeeded = targetSalary - packSalary;
                    const valueNeeded = targetValueToAI - packValue;

                    if (Math.abs(salaryNeeded) < 5 && valueNeeded <= 0) break;

                    let next: Player | undefined;

                    if (valueNeeded > 5000) {
                         next = pool[0]; // Need big value
                    } else if (salaryNeeded > 5) {
                         next = pool.find(p => Math.abs(p.salary - salaryNeeded) < 5) || pool.find(p => p.salary > 5);
                    } else {
                         next = pool.find(p => p.salary < 5); // Filler
                    }

                    if (next && !pack.includes(next)) {
                        pack.push(next);
                        packValue += getContextualValue(next, needs, true);
                        packSalary += next.salary;
                        pool = pool.filter(p => p.id !== next!.id);
                    }
                }

                const salRatio = targetSalary > 0 ? packSalary / targetSalary : 0;
                const isSal = Math.abs(packSalary - targetSalary) < 5 || (salRatio >= 0.75 && salRatio <= 1.25);
                const isVal = packValue >= targetValueToAI;

                // Special override: If Route A/B was used, AI is more lenient on exact value match
                const isSpecialRoute = forcedPackageCandidates.length > 0 && forcedPackageCandidates.every(fc => pack.includes(fc));
                
                if ((isSal && isVal) || (isSpecialRoute && isSal)) {
                    const isDup = offers.some(o => o.players.every((p: Player) => pack.some((pk: Player) => pk.id === p.id)));
                    if (!isDup) {
                        offers.push({
                            teamId: myTeam.id,
                            teamName: myTeam.name,
                            players: pack,
                            diffValue: packValue - targetValueToAI,
                            analysis: isSpecialRoute ? ["Superstar Swap Accepted"] : [`Value Met: ${Math.round(packValue)} >= ${Math.round(targetValueToAI)}`]
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

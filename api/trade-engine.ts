
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
        // [Balance] Increased to 3.15 to make stars strictly better than sum of parts
        VALUE_EXPONENT: 3.15, 
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

// [Update] Synced KNOWN_INJURIES for Server-Side CPU Trades with Dates
const KNOWN_INJURIES: Record<string, { type: string, returnDate: string }> = {
  // English Keys
  "jaysontatum": { type: "ACL (Season Out)", returnDate: "2026-07-01" },
  "tyresehaliburton": { type: "ACL (Season Out)", returnDate: "2026-07-01" },
  "taureanprince": { type: "Neck Surgery", returnDate: "2026-06-15" },
  "scoothenderson": { type: "Hamstring Strain", returnDate: "2025-11-05" },
  "sethcurry": { type: "Lower Back", returnDate: "2025-12-01" },
  "bradleybeal": { type: "Left Hip (Season Out)", returnDate: "2026-06-01" },
  "kyrieirving": { type: "Knee Surgery", returnDate: "2026-07-01" },
  "derecklively": { type: "Right Foot Surgery", returnDate: "2026-02-15" },
  "zachedey": { type: "Ankle Sprain", returnDate: "2026-02-01" },
  "scottypippenjr": { type: "Left Toe Fracture", returnDate: "2026-04-01" },
  "brandonclarke": { type: "Ankle Injury", returnDate: "2026-03-01" },
  "tyjerome": { type: "Calf Strain", returnDate: "2026-03-15" },
  "dejountemurray": { type: "Achilles Soreness", returnDate: "2026-01-15" },
  
  // Korean Keys (Fallback)
  "제이슨테이텀": { type: "ACL (Season Out)", returnDate: "2026-07-01" },
  "타이리스할리버튼": { type: "ACL (Season Out)", returnDate: "2026-07-01" },
  "토린프린스": { type: "Neck Surgery", returnDate: "2026-06-15" },
  "스쿳헨더슨": { type: "Hamstring Strain", returnDate: "2025-11-05" },
  "세스커리": { type: "Lower Back", returnDate: "2025-12-01" },
  "브래들리빌": { type: "Left Hip (Season Out)", returnDate: "2026-06-01" },
  "카이리어빙": { type: "Knee Surgery", returnDate: "2026-07-01" },
  "데렉라이블리": { type: "Right Foot Surgery", returnDate: "2026-02-15" },
  "잭이디": { type: "Ankle Sprain", returnDate: "2026-02-01" },
  "스카티피펜주니어": { type: "Left Toe Fracture", returnDate: "2026-04-01" },
  "브랜던클락": { type: "Ankle Injury", returnDate: "2026-03-01" },
  "타이제롬": { type: "Calf Strain", returnDate: "2026-03-15" },
  "디존테머레이": { type: "Achilles Soreness", returnDate: "2026-01-15" }
};

const normalizeName = (name: string): string => {
    if (!name) return "";
    return name.replace(/[\s\.\,\-\u3000\u00a0\u200b]+/g, '').replace(/(II|III|IV|Jr|Sr)$/i, '').toLowerCase().trim();
};

// --- OVR Weights ---
type PositionType = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
const POSITION_WEIGHTS: Record<PositionType, Record<string, number>> = {
  PG: { closeShot: 10, midRange: 20, threeAvg: 25, ft: 10, shotIq: 45, offConsist: 25, layup: 25, dunk: 0, postPlay: 0, drawFoul: 0, hands: 40, intDef: 0, perDef: 0, steal: 0, blk: 0, helpDefIq: 0, passPerc: 0, defConsist: 0, offReb: 0, defReb: 0, speed: 0, agility: 0, strength: 0, vertical: 0, stamina: 15, hustle: 0, durability: 0, passAcc: 25, handling: 15, spdBall: 10, passVision: 25, passIq: 50, intangibles: 5, potential: 500, height: 0 },
  SG: { closeShot: 300, midRange: 100, threeAvg: 150, ft: 100, shotIq: 500, offConsist: 500, layup: 200, dunk: 150, postPlay: 0, drawFoul: 50, hands: 250, intDef: 0, perDef: 0, steal: 0, blk: 0, helpDefIq: 0, passPerc: 0, defConsist: 5, offReb: 0, defReb: 0, speed: 0, agility: 0, strength: 0, vertical: 0, stamina: 0, hustle: 0, durability: 0, passAcc: 0, handling: 0, spdBall: 0, passVision: 0, passIq: 0, intangibles: 50, potential: 500, height: 30 },
  SF: { closeShot: 300, midRange: 150, threeAvg: 50, ft: 150, shotIq: 300, offConsist: 500, layup: 500, dunk: 100, postPlay: 0, drawFoul: 150, hands: 250, intDef: 200, perDef: 200, steal: 10, blk: 0, helpDefIq: 10, passPerc: 10, defConsist: 0, offReb: 0, defReb: 0, speed: 0, agility: 100, strength: 0, vertical: 100, stamina: 200, hustle: 200, durability: 0, passAcc: 0, handling: 0, spdBall: 0, passVision: 0, passIq: 0, intangibles: 5, potential: 500, height: 100 },
  PF: { closeShot: 450, midRange: 50, threeAvg: 50, ft: 150, shotIq: 100, offConsist: 600, layup: 500, dunk: 350, postPlay: 0, drawFoul: 0, hands: 500, intDef: 200, perDef: 50, steal: 0, blk: 50, helpDefIq: 0, passPerc: 0, defConsist: 0, offReb: 100, defReb: 160, speed: 0, agility: 0, strength: 100, vertical: 100, stamina: 100, hustle: 0, durability: 50, passAcc: 50, handling: 50, spdBall: 0, passVision: 50, passIq: 50, intangibles: 10, potential: 500, height: 150 },
  C: { closeShot: 300, midRange: 0, threeAvg: 0, ft: 0, shotIq: 200, offConsist: 0, layup: 0, dunk: 0, postPlay: 200, drawFoul: 250, hands: 200, intDef: 250, perDef: 0, steal: 0, blk: 100, helpDefIq: 0, passPerc: 0, defConsist: 200, offReb: 100, defReb: 100, speed: 0, agility: 0, strength: 150, vertical: 0, stamina: 150, hustle: 0, durability: 150, passAcc: 100, handling: 200, spdBall: 0, passVision: 0, passIq: 100, intangibles: 15, potential: 500, height: 180 }
};

// --- Helper Functions ---

function normalizeAttributes(attrs: any) {
    const get = (keys: string[]) => {
        for (const k of keys) {
            if (attrs[k] !== undefined) return Number(attrs[k]);
            if (attrs[k.toLowerCase()] !== undefined) return Number(attrs[k.toLowerCase()]);
        }
        return 50; 
    };
    return {
        closeShot: get(['CLOSE', 'closeShot']), midRange: get(['MID', 'midRange']),
        threeCorner: get(['3C', 'threeCorner']), three45: get(['3_45', 'three45']), threeTop: get(['3T', 'threeTop']),
        ft: get(['FT', 'ft']), shotIq: get(['SIQ', 'shotIq']), offConsist: get(['OCON', 'offConsist']),
        layup: get(['LAY', 'layup']), dunk: get(['DNK', 'dunk']), postPlay: get(['POST', 'postPlay']),
        drawFoul: get(['DRAW', 'drawFoul']), hands: get(['HANDS', 'hands']),
        passAcc: get(['PACC', 'passAcc']), handling: get(['HANDL', 'handling']), spdBall: get(['SPWB', 'spdBall']),
        passVision: get(['PVIS', 'passVision']), passIq: get(['PIQ', 'passIq']),
        intDef: get(['IDEF', 'intDef']), perDef: get(['PDEF', 'perDef']), steal: get(['STL', 'steal']),
        blk: get(['BLK', 'blk']), helpDefIq: get(['HDEF', 'helpDefIq']), passPerc: get(['PPER', 'passPerc']),
        defConsist: get(['DCON', 'defConsist']), offReb: get(['OREB', 'offReb']), defReb: get(['DREB', 'defReb']),
        speed: get(['SPD', 'speed']), agility: get(['AGI', 'agility']), strength: get(['STR', 'strength']),
        vertical: get(['VERT', 'vertical']), stamina: get(['STA', 'stamina']), hustle: get(['HUS', 'hustle']),
        durability: get(['DUR', 'durability']), potential: get(['POT', 'potential']),
        intangibles: get(['INTANGIBLES', 'intangibles']), height: get(['HEIGHT', 'height'])
    };
}

function calculateOvr(p: any): number {
    const position = p.position || 'PG';
    let posKey: PositionType = 'PG';
    if (position.includes('SG')) posKey = 'SG'; else if (position.includes('SF')) posKey = 'SF';
    else if (position.includes('PF')) posKey = 'PF'; else if (position.includes('C')) posKey = 'C';

    const weights = POSITION_WEIGHTS[posKey];
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
function getContextualValue(player: Player, needs: TeamNeeds, isAcquiring: boolean, log: string[] = []): number {
    let value = getPlayerTradeValue(player);
    const C = TRADE_CONFIG.NEEDS;

    if (isAcquiring) {
        if (player.health === 'Injured') {
            if (needs.isContender) {
                return -1 * (player.salary * 20);
            } else if (player.salary > 5) {
                return value - (player.salary * 10);
            }
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
    
    // Constants
    const { CAP_LINE, TAX_LINE, APRON_1, APRON_2 } = TRADE_CONFIG.SALARY;

    // 2nd Apron Rules
    if (currentSalary >= APRON_2) {
        // Aggregation Ban: Cannot send 2+ players to get 1 (or essentially aggregate salaries)
        // Simplified Logic: If sending > 1 player, reject.
        if (outgoing.length > 1) return { valid: false, reason: "2nd Apron: Aggregation Ban (Cannot send multiple players)" };
        
        // Dollar for Dollar: Incoming <= Outgoing
        if (inSal > outSal) return { valid: false, reason: "2nd Apron: Cannot increase salary" };
        
        return { valid: true };
    }

    // 1st Apron Rules
    if (currentSalary >= APRON_1) {
        // 100% Matching: Incoming <= Outgoing
        if (inSal > outSal) return { valid: false, reason: "1st Apron: Salary matching limited to 100%" };
        
        return { valid: true };
    }

    // Taxpayer Rules (Above Tax, Below Apron 1)
    if (currentSalary >= TAX_LINE) {
        // 110% Rule (Simplified from 125% -> 110%)
        const maxIncoming = (outSal * 1.10) + 0.25;
        if (inSal > maxIncoming) return { valid: false, reason: "Taxpayer: Max 110% matching exceeded" };
        return { valid: true };
    }

    // Standard Rules (Under Tax)
    // 125% + 0.25M Rule or Cap Space Absorption
    if (currentSalary < CAP_LINE) {
        const room = CAP_LINE - currentSalary;
        // If room exists, logic is complex, but generally if inSal fits in room + outSal, it's fine.
        if (inSal <= room + outSal + 0.1) return { valid: true };
    }

    const maxIncoming = (outSal * 1.25) + 0.25;
    if (inSal > maxIncoming) return { valid: false, reason: "Standard: Max 125% matching exceeded" };

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

// 6. Data Mapper (DB -> Engine Player)
function mapDbPlayer(p: any): Player {
    const attrs = normalizeAttributes(p.base_attributes || {});
    const a = p.base_attributes || {}; 
    
    const ins = (attrs.layup + attrs.dunk + attrs.postPlay + attrs.closeShot) / 4;
    const threeAvg = (attrs.threeCorner + attrs.three45 + attrs.threeTop) / 3;
    const out = (attrs.midRange + threeAvg + attrs.ft) / 3;
    const def = (attrs.perDef + attrs.intDef + attrs.steal + attrs.blk) / 4;
    const plm = (attrs.handling + attrs.passAcc + attrs.passVision) / 3;
    const reb = (attrs.offReb + attrs.defReb) / 2;
    const ath = (attrs.speed + attrs.agility + attrs.strength + attrs.vertical) / 4;
    
    const finalOvr = calculateOvr({ ...attrs, position: p.position });

    const normName = normalizeName(p.name);
    const injury = KNOWN_INJURIES[normName];
    const health = injury ? 'Injured' : 'Healthy';

    const age = Number(p.age ?? a.age ?? a.AGE ?? a.Age ?? 25);

    return {
        ...attrs,
        id: p.id,
        name: p.name,
        position: p.position || 'G',
        age,
        salary: Number(p.salary || 1),
        contractYears: Number(p.contract_years || 1),
        ovr: finalOvr,
        health, 
        injuryType: injury?.type,
        returnDate: injury?.returnDate,
        potential: (attrs.potential && attrs.potential !== 50) ? attrs.potential : (finalOvr + 5),
        def, out, reb, plm, ins, ath,
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

            // [Logic] Package Dilution Logic (CONDITIONAL)
            const sortedUserPlayers = [...tradingPlayers].sort((a: Player, b: Player) => getPlayerTradeValue(b) - getPlayerTradeValue(a));
            
            const userMaxOvr = sortedUserPlayers.length > 0 ? sortedUserPlayers[0].ovr : 0;
            const userMaxPot = Math.max(...tradingPlayers.map((p: Player) => p.potential));
            const userSalary = tradingPlayers.reduce((sum: number, p: Player) => sum + p.salary, 0);
            
            // Asset Tier Ceiling
            let maxOvrCeiling = 99;
            if (userMaxOvr < 75 && userMaxPot < 80) {
                maxOvrCeiling = 79; 
            } else if (userMaxOvr < 82) {
                maxOvrCeiling = userMaxOvr + 6; 
            }

            LOG(`Generating offers. Max User OVR: ${userMaxOvr}, Ceiling: ${maxOvrCeiling}`);

            const otherTeams = allTeams.filter(t => t.id !== payload.myTeamId);

            for (const targetTeam of otherTeams) {
                const needs = analyzeTeamSituation(targetTeam);
                const isCore = getCoreAssetFilter(targetTeam.roster);

                // [Logic] Calculate User Package Value with Conditional Dilution
                let userValueToAI = 0;
                let isDiluted = false;
                
                sortedUserPlayers.forEach((p: Player, idx: number) => {
                    let val = getContextualValue(p, needs, true);
                    
                    const isValuableAsset = p.ovr >= 80 || (p.age <= 24 && p.potential >= 80);
                    
                    if (!isValuableAsset) {
                        if (idx === 2) { val *= 0.5; isDiluted = true; } // 3rd best is a scrub? 50%
                        else if (idx === 3) { val *= 0.2; isDiluted = true; } // 4th best is a scrub? 20%
                        else if (idx >= 4) { val = 0.1; isDiluted = true; } // 5th best is a scrub? 10%
                    }
                    
                    userValueToAI += val;
                });
                
                if (userValueToAI < 100) continue; 

                // Filter candidates based on Tier Ceiling
                let candidates = targetTeam.roster.filter(p => {
                    if (p.ovr > maxOvrCeiling) return false;
                    
                    if (isCore(p)) {
                        if (p.ovr >= 90 && userMaxOvr < 88) return false;
                        return false; 
                    }
                    return true;
                });
                
                candidates.sort(() => Math.random() - 0.5);

                for (let i = 0; i < 20; i++) {
                    const pack: Player[] = [];
                    let packValue = 0;
                    let packSalary = 0;
                    
                    let pool = candidates.filter(p => !pack.includes(p));
                    
                    const valueTarget = userValueToAI; 

                    let attempts = 0;
                    while (pack.length < 5 && attempts < 50) {
                        attempts++;
                        
                        const isValOk = packValue >= valueTarget * 0.9;
                        if (isValOk) break; // We break on value first, check salary/apron later

                        const valDeficit = valueTarget - packValue;
                        let nextPiece: Player | undefined;

                        if (valDeficit > 5000) {
                            nextPiece = pool.sort((a,b) => getPlayerTradeValue(b) - getPlayerTradeValue(a))[0];
                        } else {
                            nextPiece = pool[Math.floor(Math.random() * pool.length)]; 
                        }

                        if (nextPiece && !pack.includes(nextPiece)) {
                            pack.push(nextPiece);
                            packValue += getContextualValue(nextPiece, needs, false);
                            packSalary += nextPiece.salary;
                            const idx = pool.findIndex(p => p.id === nextPiece!.id);
                            if (idx > -1) pool.splice(idx, 1);
                        }
                    }

                    const valRatio = userValueToAI > 0 ? packValue / userValueToAI : 0;
                    
                    // [Balance] If Dilution Applied, Cap Value Ratio at 1.0 (No Overpay allowed)
                    const maxRatio = isDiluted ? 1.0 : 1.15;
                    const validValue = valRatio >= 0.85 && valRatio <= maxRatio; 

                    const posValid = desiredPositions.length === 0 || pack.some(p => desiredPositions.some((dp: string) => p.position.includes(dp)));

                    // [Apron Logic] Validate Trade Rules
                    const aiTradeValid = validateTradeLegality(targetTeam, pack, sortedUserPlayers);
                    const userTradeValid = validateTradeLegality(myTeam, sortedUserPlayers, pack);

                    if (validValue && aiTradeValid.valid && userTradeValid.valid && posValid && pack.length > 0) {
                        const isDup = offers.some(o => o.teamId === targetTeam.id && o.players.length === pack.length && o.players.every(p => pack.some(pk => pk.id === p.id)));
                        if (!isDup) {
                            offers.push({
                                teamId: targetTeam.id,
                                teamName: targetTeam.name,
                                players: pack,
                                diffValue: packValue - userValueToAI,
                                analysis: [
                                    `Value Ratio: ${valRatio.toFixed(2)}`,
                                    isDiluted ? `Dilution Active` : `Standard Deal`
                                ]
                            });
                        }
                    }
                }
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
                if (isCore(p)) v *= 1.3; 
                targetValueToAI += v;
                targetSalary += p.salary;
            });
            
            let forcedPackageCandidates: Player[] = [];
            
            if (isTargetingSuperstar) {
                const user90s = myTeam.roster.filter(p => p.ovr >= 90);
                const userHighPot = myTeam.roster.filter(p => p.potential >= 88 && p.age <= 24 && p.ovr < 90);

                if (user90s.length >= 2) {
                    forcedPackageCandidates = user90s.slice(0, 2);
                } else if (user90s.length >= 1 && userHighPot.length >= 2) {
                    forcedPackageCandidates = [user90s[0], ...userHighPot.slice(0, 2)];
                }
            }

            const candidates = myTeam.roster.sort((a,b) => b.ovr - a.ovr);
            const offers: TradeOffer[] = [];

            for (let i = 0; i < 20; i++) {
                const pack: Player[] = [];
                
                if (forcedPackageCandidates.length > 0 && i === 0) {
                     pack.push(...forcedPackageCandidates);
                }

                // Apply Conditional Dilution to Package being built
                const sortedPack = [...pack].sort((a,b) => getPlayerTradeValue(b) - getPlayerTradeValue(a));
                let packValue = 0;
                
                sortedPack.forEach((p, idx) => {
                    let val = getContextualValue(p, needs, true);
                    const isValuableAsset = p.ovr >= 80 || (p.age <= 24 && p.potential >= 80);
                    
                    if (!isValuableAsset) {
                        if (idx === 2) val *= 0.5;
                        else if (idx === 3) val *= 0.2;
                        else if (idx >= 4) val = 0.1;
                    }
                    packValue += val;
                });

                let packSalary = pack.reduce((s,p) => s + p.salary, 0);

                let pool = candidates.filter(p => !pack.includes(p));
                let attempts = 0;
                
                while (pack.length < 5 && attempts < 50) {
                    attempts++;
                    const valueNeeded = targetValueToAI - packValue;

                    if (valueNeeded <= 0) break;

                    let next: Player | undefined;

                    if (valueNeeded > 5000) {
                         next = pool[0]; 
                    } else {
                         next = pool.find(p => p.salary < 5);
                    }

                    if (next && !pack.includes(next)) {
                        pack.push(next);
                        // Recalculate value with new member using Conditional Dilution
                        const newPack = [...pack, next].sort((a,b) => getPlayerTradeValue(b) - getPlayerTradeValue(a));
                        packValue = 0;
                        newPack.forEach((p, idx) => {
                            let val = getContextualValue(p, needs, true);
                            const isValuableAsset = p.ovr >= 80 || (p.age <= 24 && p.potential >= 80);
                            
                            if (!isValuableAsset) {
                                if (idx === 2) val *= 0.5;
                                else if (idx === 3) val *= 0.2;
                                else if (idx >= 4) val = 0.1;
                            }
                            packValue += val;
                        });
                        packSalary += next.salary;
                        pool = pool.filter(p => p.id !== next!.id);
                    }
                }

                // [Apron Logic] Validate Trade Rules
                // User is sending PACK, getting TARGET
                const userTradeValid = validateTradeLegality(myTeam, pack, targetPlayers);
                // AI is sending TARGET, getting PACK
                const aiTradeValid = validateTradeLegality(targetTeam, targetPlayers, pack);

                const isVal = packValue >= targetValueToAI;
                const isSpecialRoute = forcedPackageCandidates.length > 0 && forcedPackageCandidates.every(fc => pack.includes(fc));
                
                if ((userTradeValid.valid && aiTradeValid.valid && isVal) || (isSpecialRoute && userTradeValid.valid && aiTradeValid.valid)) {
                    const isDup = offers.some(o => o.players.every((p: Player) => pack.some((pk: Player) => pk.id === p.id)));
                    if (!isDup) {
                        offers.push({
                            teamId: myTeam.id,
                            teamName: myTeam.name,
                            players: pack,
                            diffValue: packValue - targetValueToAI,
                            analysis: isSpecialRoute ? ["Superstar Swap Accepted"] : [`Value Met`]
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
                         const tradeAsset = seller.roster.find(p => p.age >= 28 && p.salary > 10 && p.ovr > 78 && p.health !== 'Injured'); // Filter Injured for CPU trades
                         if (tradeAsset) {
                             const buyerAssets = buyer.roster.filter(p => (p.age <= 24 && p.potential > 75 && p.health !== 'Injured') || (p.salary > 5 && p.ovr < 75 && p.health !== 'Injured'));
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
                             const isVal = packVal >= assetVal * 0.8; 

                             // [Apron Logic] Validate Trade Rules
                             // Buyer sends PACK, gets ASSET
                             const buyerValid = validateTradeLegality(buyer, pack, [tradeAsset]);
                             // Seller sends ASSET, gets PACK
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

        res.status(200).json(result);

    } catch (error: any) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
}

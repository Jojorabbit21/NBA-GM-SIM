
import { Player, SeasonStats, Game, Team } from '../types';

export const SEASON_START_DATE = '2025-10-20';
export const TRADE_DEADLINE = '2026-02-06';

export const INITIAL_STATS = (): SeasonStats => ({
  g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
  fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0
});

export const getTeamLogoUrl = (id: string): string => {
  const ESPN_LOGO_ID_MAP: Record<string, string> = {
    'nop': 'no', 'uta': 'utah', 'sas': 'sa', 'gsw': 'gs', 'nyk': 'ny', 'lal': 'lal', 'lac': 'lac'
  };
  const espnId = ESPN_LOGO_ID_MAP[id] || id;
  return `https://a.espncdn.com/i/teamlogos/nba/500/${espnId}.png`;
};

export const INITIAL_TEAMS_DATA: { id: string, name: string, city: string, conference: 'East' | 'West', division: 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest' }[] = [
  { id: 'bos', name: '셀틱스', city: '보스턴', conference: 'East', division: 'Atlantic' },
  { id: 'bkn', name: '네츠', city: '브루클린', conference: 'East', division: 'Atlantic' },
  { id: 'nyk', name: '닉스', city: '뉴욕', conference: 'East', division: 'Atlantic' },
  { id: 'phi', name: '세븐티식서스', city: '필라델피아', conference: 'East', division: 'Atlantic' },
  { id: 'tor', name: '랩터스', city: '토론토', conference: 'East', division: 'Atlantic' },
  { id: 'chi', name: '불스', city: '시카고', conference: 'East', division: 'Central' },
  { id: 'cle', name: '캐벌리어스', city: '클리블랜드', conference: 'East', division: 'Central' },
  { id: 'det', name: '피스톤즈', city: '디트로이트', conference: 'East', division: 'Central' },
  { id: 'ind', name: '페이서스', city: '인디애나', conference: 'East', division: 'Central' },
  { id: 'mil', name: '벅스', city: '밀워키', conference: 'East', division: 'Central' },
  { id: 'atl', name: '호크스', city: '애틀랜타', conference: 'East', division: 'Southeast' },
  { id: 'cha', name: '호네츠', city: '샬럿', conference: 'East', division: 'Southeast' },
  { id: 'mia', name: '히트', city: '마이애미', conference: 'East', division: 'Southeast' },
  { id: 'orl', name: '매직', city: '올랜도', conference: 'East', division: 'Southeast' },
  { id: 'was', name: '위저즈', city: '워싱턴', conference: 'East', division: 'Southeast' },
  { id: 'den', name: '너게츠', city: '덴버', conference: 'West', division: 'Northwest' },
  { id: 'min', name: '팀버울브스', city: '미네소타', conference: 'West', division: 'Northwest' },
  { id: 'okc', name: '썬더', city: '오클라호마시티', conference: 'West', division: 'Northwest' },
  { id: 'por', name: '트레일블레이저스', city: '포틀랜드', conference: 'West', division: 'Northwest' },
  { id: 'uta', name: '재즈', city: '유타', conference: 'West', division: 'Northwest' },
  { id: 'gsw', name: '워리어스', city: '골든스테이트', conference: 'West', division: 'Pacific' },
  { id: 'lac', name: '클리퍼스', city: 'LA', conference: 'West', division: 'Pacific' },
  { id: 'lal', name: '레이커스', city: 'LA', conference: 'West', division: 'Pacific' },
  { id: 'phx', name: '선즈', city: '피닉스', conference: 'West', division: 'Pacific' },
  { id: 'sac', name: '킹스', city: '새크라멘토', conference: 'West', division: 'Pacific' },
  { id: 'dal', name: '매버릭스', city: '댈러스', conference: 'West', division: 'Southwest' },
  { id: 'hou', name: '로케츠', city: '휴스턴', conference: 'West', division: 'Southwest' },
  { id: 'mem', name: '그리즐리스', city: '멤피스', conference: 'West', division: 'Southwest' },
  { id: 'nop', name: '펠리컨스', city: '뉴올리언스', conference: 'West', division: 'Southwest' },
  { id: 'sas', name: '스퍼스', city: '샌안토니오', conference: 'West', division: 'Southwest' },
];

const KNOWN_INJURIES: Record<string, { type: string, returnDate: string }> = {
  "Jayson Tatum": { type: "ACL", returnDate: "2026-07-01" },
  "Tyrese Haliburton": { type: "ACL", returnDate: "2026-07-01" },
  "Taurean Prince": { type: "Unknown", returnDate: "2026-06-15" },
  "Scoot Henderson": { type: "Hamstring", returnDate: "2025-11-05" },
  "Seth Curry": { type: "Lower Back", returnDate: "2025-12-01" },
  "Bradley Beal": { type: "Left Hip", returnDate: "2026-06-01" },
  "Kyrie Irving": { type: "Knee", returnDate: "2026-07-01" },
  "Dereck Lively": { type: "Right Foot Surgery", returnDate: "2026-02-15" },
  "Zach Edey": { type: "Ankle", returnDate: "2026-02-01" },
  "Scotty Pippen Jr": { type: "Left Toe", returnDate: "2026-04-01" },
  "Brandon Clarke": { type: "Ankle", returnDate: "2026-03-01" },
  "Ty Jerome": { type: "Calf", returnDate: "2026-03-15" },
  "Dejounte Murray": { type: "Achilles", returnDate: "2026-01-15" }
};

export const parseCSVToObjects = (csv: string): any[] => {
    const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return [];
    
    // Remove BOM if present
    let headersLine = lines[0];
    if (headersLine.charCodeAt(0) === 0xFEFF) {
        headersLine = headersLine.slice(1);
    }

    const headers = headersLine.split(',').map(h => h.trim());
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        
        // Skip if column count significantly mismatches
        if (values.length < headers.length - 2) continue;
        
        const obj: any = {};
        headers.forEach((h, index) => {
            const val = values[index];
            // Basic number conversion for numeric-like strings, keeping others as strings
            if (val !== '' && !isNaN(Number(val))) {
                obj[h] = Number(val);
            } else {
                obj[h] = val;
            }
        });
        result.push(obj);
    }
    return result;
};

// Helper to calculate aggregated attributes and OVR
// Enhanced to handle both Snake Case (DB) and Short Codes/Upper Case (CSV raw)
const calculateAttributes = (p: any) => {
    const avg = (nums: number[]) => Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);

    // Helper for robust property access
    const getVal = (...keys: string[]) => {
        for (const k of keys) {
            if (p[k] !== undefined && p[k] !== null) return parseInt(p[k], 10);
            if (p[k.toLowerCase()] !== undefined && p[k.toLowerCase()] !== null) return parseInt(p[k.toLowerCase()], 10);
            if (p[k.toUpperCase()] !== undefined && p[k.toUpperCase()] !== null) return parseInt(p[k.toUpperCase()], 10);
        }
        return 50; // Default
    };

    const speed = getVal('speed', 'SPD');
    const agility = getVal('agility', 'AGI');
    const strength = getVal('strength', 'STR');
    const vertical = getVal('vertical', 'VERT', 'JMP');
    const stamina = getVal('stamina', 'STA');
    const hustle = getVal('hustle', 'HUS');
    const durability = getVal('durability', 'DUR');
    
    const closeShot = getVal('close_shot', 'closeShot', 'CLOSE');
    const midRange = getVal('mid_range', 'midRange', 'MID');
    const threeCorner = getVal('three_corner', 'threeCorner', '3C');
    const three45 = getVal('three_45', 'three45', '3_45');
    const threeTop = getVal('three_top', 'threeTop', '3T');
    const ft = getVal('ft', 'FT');
    const shotIq = getVal('shot_iq', 'shotIq', 'SIQ');
    const offConsist = getVal('off_consist', 'offConsist', 'OCON', 'OCN');

    const layup = getVal('layup', 'LAY');
    const dunk = getVal('dunk', 'DNK');
    const postPlay = getVal('post_play', 'postPlay', 'POST');
    const drawFoul = getVal('draw_foul', 'drawFoul', 'DRAW', 'DRF');
    const hands = getVal('hands', 'HANDS', 'HND');

    const passAcc = getVal('pass_acc', 'passAcc', 'PACC', 'PAS');
    const handling = getVal('handling', 'HANDL', 'HDL');
    const spdBall = getVal('spd_ball', 'spdBall', 'SPWB');
    const passIq = getVal('pass_iq', 'passIq', 'PIQ', 'IQ');
    const passVision = getVal('pass_vision', 'passVision', 'PVIS', 'VIS');

    const intDef = getVal('int_def', 'intDef', 'IDEF', 'INT');
    const perDef = getVal('per_def', 'perDef', 'PDEF', 'PER');
    const lockdown = getVal('lockdown', 'LOCK');
    const steal = getVal('steal', 'STL');
    const blk = getVal('block', 'blk', 'BLK');
    const helpDefIq = getVal('help_def_iq', 'helpDefIq', 'HDEF');
    const passPerc = getVal('pass_perc', 'passPerc', 'PPER', 'PRC');
    const defConsist = getVal('def_consist', 'defConsist', 'DCON', 'DCN');

    const offReb = getVal('off_reb', 'offReb', 'OREB', 'ORB');
    const defReb = getVal('def_reb', 'defReb', 'DREB', 'DRB') || (offReb + 15);

    // Aggregates
    const ath = avg([speed, agility, strength, vertical, stamina, hustle, durability]);
    const out = avg([closeShot, midRange, threeCorner, three45, threeTop, ft, shotIq, offConsist]);
    const ins = avg([layup, dunk, postPlay, drawFoul, hands]);
    const plm = avg([passAcc, handling, spdBall, passIq, passVision]);
    const def = avg([intDef, perDef, lockdown, steal, blk, helpDefIq, passPerc, defConsist]);
    const reb = avg([offReb, defReb]);

    // Robust String Fields
    const position = p.position || p.Position || p.POSITION || 'PG';
    const heightCm = p.height || p.Height || 200;
    const name = p.name || p.Name || p.NAME || 'Unknown';
    const age = p.age || p.Age || 20;
    const height = p.height || p.Height || 200;
    const weight = p.weight || p.Weight || 95;
    const salary = p.salary || p.Salary || 1;
    const contractYears = p.contract_years || p.contractYears || p.ContractYears || 1;

    // OVR Calculation
    let ovrRaw = 0;
    const threeAvg = (threeCorner + three45 + threeTop) / 3;
    const intangibles = getVal('intangibles', 'INTANGIBLES', 'INT'); // Note: INT sometimes means INT DEF, check context
    const potential = getVal('potential', 'POT');

    const calcNewOvr = (weights: {val: number, w: number}[]) => {
        let totalVal = 0;
        let totalWeight = 0;
        weights.forEach(item => {
            totalVal += item.val * item.w;
            totalWeight += item.w;
        });
        const rawAvg = totalWeight > 0 ? totalVal / totalWeight : 50;
        return Math.min(99, Math.max(40, Math.round(rawAvg)));
    };

    if (position.includes('PG')) {
        ovrRaw = calcNewOvr([
            { val: closeShot, w: 8 }, { val: midRange, w: 3 }, { val: threeAvg, w: 7 }, { val: ft, w: 5 }, { val: shotIq, w: 5 }, { val: offConsist, w: 5 },
            { val: layup, w: 2 }, { val: dunk, w: 0 }, { val: postPlay, w: 1 }, { val: drawFoul, w: 5 }, { val: hands, w: 2 },
            { val: intDef, w: 0 }, { val: perDef, w: 5 }, { val: steal, w: 0 }, { val: blk, w: 0 }, { val: helpDefIq, w: 3 }, { val: passPerc, w: 0 }, { val: defConsist, w: 1 },
            { val: offReb, w: 2 }, { val: defReb, w: 0 },
            { val: speed, w: 0 }, { val: agility, w: 3 }, { val: strength, w: 0 }, { val: vertical, w: 0 }, { val: stamina, w: 5 }, { val: hustle, w: 0 }, { val: durability, w: 3 },
            { val: passAcc, w: 10 }, { val: handling, w: 7 }, { val: spdBall, w: 7 }, { val: passVision, w: 7 }, { val: passIq, w: 10 },
            { val: intangibles, w: 10 }, { val: potential, w: 18 }
        ]);
    } else if (position.includes('SG')) {
        ovrRaw = calcNewOvr([
            { val: closeShot, w: 5 }, { val: midRange, w: 8 }, { val: threeAvg, w: 10 }, { val: ft, w: 5 }, { val: shotIq, w: 6 }, { val: offConsist, w: 7 },
            { val: layup, w: 2 }, { val: dunk, w: 0 }, { val: postPlay, w: 0 }, { val: drawFoul, w: 6 }, { val: hands, w: 1 },
            { val: intDef, w: 0 }, { val: perDef, w: 5 }, { val: steal, w: 0 }, { val: blk, w: 0 }, { val: helpDefIq, w: 5 }, { val: passPerc, w: 0 }, { val: defConsist, w: 0 },
            { val: offReb, w: 3 }, { val: defReb, w: 1 },
            { val: speed, w: 8 }, { val: agility, w: 2 }, { val: strength, w: 1 }, { val: vertical, w: 1 }, { val: stamina, w: 2 }, { val: hustle, w: 2 }, { val: durability, w: 1 },
            { val: passAcc, w: 7 }, { val: handling, w: 2 }, { val: spdBall, w: 1 }, { val: passVision, w: 2 }, { val: passIq, w: 2 },
            { val: intangibles, w: 14 }, { val: potential, w: 14 }, { val: heightCm, w: 4 }
        ]);
    } else if (position.includes('SF')) {
        ovrRaw = calcNewOvr([
            { val: closeShot, w: 4 }, { val: midRange, w: 2 }, { val: threeAvg, w: 2 }, { val: ft, w: 2 }, { val: shotIq, w: 2 }, { val: offConsist, w: 5 },
            { val: layup, w: 4 }, { val: dunk, w: 1 }, { val: postPlay, w: 0 }, { val: drawFoul, w: 3 }, { val: hands, w: 3},
            { val: intDef, w: 4 }, { val: perDef, w: 4 }, { val: steal, w: 2 }, { val: blk, w: 2 }, { val: helpDefIq, w: 4 }, { val: passPerc, w: 3 }, { val: defConsist, w: 3 },
            { val: offReb, w: 3 }, { val: defReb, w: 3 },
            { val: speed, w: 3 }, { val: agility, w: 3 }, { val: strength, w: 1 }, { val: vertical, w: 2 }, { val: stamina, w: 3 }, { val: hustle, w: 3 }, { val: durability, w: 3 },
            { val: passAcc, w: 1 }, { val: handling, w: 1 }, { val: spdBall, w: 1 }, { val: passVision, w: 1 }, { val: passIq, w: 3 },
            { val: intangibles, w: 10 }, { val: potential, w: 15 }, { val: heightCm, w: 6 }
        ]);
    } else if (position.includes('PF')) {
        ovrRaw = calcNewOvr([
            { val: closeShot, w: 5 }, { val: midRange, w: 1 }, { val: threeAvg, w: 1 }, { val: ft, w: 4 }, { val: shotIq, w: 1 }, { val: offConsist, w: 5 },
            { val: layup, w: 3 }, { val: dunk, w: 4 }, { val: postPlay, w: 4 }, { val: drawFoul, w: 4 }, { val: hands, w: 5},
            { val: intDef, w: 6 }, { val: perDef, w: 1 }, { val: steal, w: 1 }, { val: blk, w: 4 }, { val: helpDefIq, w: 2 }, { val: passPerc, w: 1 }, { val: defConsist, w: 5 },
            { val: offReb, w: 4 }, { val: defReb, w: 6 },
            { val: speed, w: 2 }, { val: agility, w: 2 }, { val: strength, w: 5 }, { val: vertical, w: 5 }, { val: stamina, w: 4 }, { val: hustle, w: 4 }, { val: durability, w: 5 },
            { val: passAcc, w: 1}, { val: handling, w: 1 }, { val: spdBall, w: 1 }, { val: passVision, w: 1 }, { val: passIq, w: 1 },
            { val: intangibles, w: 15 }, { val: potential, w: 12 }, { val: heightCm, w: 7 }
        ]);
    } else if (position.includes('C')) {
        ovrRaw = calcNewOvr([
            { val: closeShot, w: 10 }, { val: midRange, w: 2 }, { val: threeAvg, w: 2 }, { val: ft, w: 2 }, { val: shotIq, w: 3 }, { val: offConsist, w: 5 },
            { val: layup, w: 8 }, { val: dunk, w: 10 }, { val: postPlay, w: 10 }, { val: drawFoul, w: 5 }, { val: hands, w: 5},
            { val: intDef, w: 12 }, { val: perDef, w: 1 }, { val: steal, w: 1 }, { val: blk, w: 8 }, { val: helpDefIq, w: 1 }, { val: passPerc, w: 1 }, { val: defConsist, w: 6 },
            { val: offReb, w: 8 }, { val: defReb, w: 8 },
            { val: speed, w: 2 }, { val: agility, w: 2 }, { val: strength, w: 6 }, { val: vertical, w: 8 }, { val: stamina, w: 2 }, { val: hustle, w: 1 }, { val: durability, w: 6 },
            { val: passAcc, w: 1}, { val: handling, w: 1 }, { val: spdBall, w: 1 }, { val: passVision, w: 1 }, { val: passIq, w: 1 },
            { val: intangibles, w: 15 }, { val: potential, w: 10 }, { val: heightCm, w: 8 }
        ]);
    } else {
        ovrRaw = 70;
    }

    return {
        ovr: Math.max(40, Math.round(ovrRaw)),
        ath, out, ins, plm, def, reb,
        speed, agility, strength, vertical, stamina, hustle, durability,
        closeShot, midRange, threeCorner, three45, threeTop, ft, shotIq, offConsist,
        layup, dunk, postPlay, drawFoul, hands,
        passAcc, handling, spdBall, passIq, passVision,
        intDef, perDef, lockdown, steal, blk, helpDefIq, passPerc, defConsist,
        offReb, defReb,
        intangibles, potential,
        
        // Pass through core props to ensure they exist even if keys differ
        name, age, height, weight, salary, contractYears, position
    };
};

export const mapDatabasePlayerToRuntimePlayer = (p: any, teamId: string): Player => {
    const attrs = calculateAttributes(p);
    
    // Check known injuries
    const known = KNOWN_INJURIES[attrs.name];
    let health: 'Healthy' | 'Injured' | 'Day-to-Day' = 'Healthy';
    if (known) {
        health = 'Injured';
    } else if (p.health === 'Injured' || p.health === 'Day-to-Day') {
        health = p.health;
    } else if (p.Health === 'Injured' || p.Health === 'Day-to-Day') {
        health = p.Health;
    }
    
    const injuryType = known ? known.type : (p.injuryType || p.injury_type);
    const returnDate = known ? known.returnDate : (p.returnDate || p.return_date);

    // Sanitize ID
    let id = p.id;
    if (!id) {
        // Fallback ID generation
        const cleanName = attrs.name.replace(/[^a-zA-Z0-9]/g, '');
        id = `${teamId}_${cleanName}`;
    }
    id = String(id);

    return {
        id,
        ...attrs,
        position: attrs.position as any,
        health,
        injuryType,
        returnDate,
        condition: 100,
        revealedPotential: attrs.potential,
        stats: INITIAL_STATS()
    };
};

// FIX: Robust date parser map
const MONTH_MAP: Record<string, string> = { 
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', 
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' 
};

export const mapDatabaseScheduleToRuntimeGame = (dbGames: any[]): Game[] => {
    const games: Game[] = [];
    const createdGameKeys = new Set<string>();

    dbGames.forEach((row, i) => {
        // Robust key access for Team/Opponent
        // FIX: Add trim to handle potential whitespace issues
        const teamFull = (row.team_name || row.team || row.Team || '').trim();
        const oppFull = (row.opponent_name || row.opponent || row.Opponent || '').trim();
        const dateStrRaw = row.date || row.Date;
        
        if (!teamFull || !oppFull || !dateStrRaw) return;

        const findTeamId = (name: string) => {
            // Handle specific CSV spelling variants (Typos/Alternate spellings)
            if (name === '팀버울브즈') return 'min'; 
            if (name === '너겟츠') return 'den';

            // Also check if the name IS the ID directly
            const directMatch = INITIAL_TEAMS_DATA.find(t => t.id === name.toLowerCase());
            if (directMatch) return directMatch.id;

            const t = INITIAL_TEAMS_DATA.find(t => t.name === name || t.city === name || `${t.city} ${t.name}` === name);
            return t ? t.id : null;
        };

        const teamId = findTeamId(teamFull);
        const oppId = findTeamId(oppFull);

        if (!teamId || !oppId) return;

        let homeId, awayId;
        const site = row.site || row.Site || '';
        // In CSV/DB 'site' usually refers to where the 'team' is playing relative to 'opponent'
        // If site is '홈' (Home), then 'team' is home.
        if (site === '홈' || site === 'Home' || site === 'home') {
            homeId = teamId;
            awayId = oppId;
        } else {
            homeId = oppId;
            awayId = teamId;
        }

        // Handle Date parsing
        // FIX: Handle manual parsing for "Wed Oct 22 2025" format to avoid timezone shift
        let dateStr = dateStrRaw;
        
        // 1. Try ISO YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStrRaw)) {
            dateStr = dateStrRaw;
        } 
        // 2. Try CSV Format "Wed Oct 22 2025"
        else {
            const parts = dateStrRaw.split(' ').filter((p: string) => p.trim() !== '');
            // Expecting [DayOfWeek, Month, Day, Year] e.g. ["Tue", "Oct", "21", "2025"]
            if (parts.length === 4) {
               const month = MONTH_MAP[parts[1]];
               const day = parts[2].padStart(2, '0');
               const year = parts[3];
               if (month && day && year) {
                   dateStr = `${year}-${month}-${day}`;
               }
            } else {
                // Fallback to Date object if manual parsing fails
                const d = new Date(dateStrRaw);
                if (!isNaN(d.getTime())) {
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    dateStr = `${year}-${month}-${day}`;
                }
            }
        }

        const gameKey = `${dateStr}_${homeId}_${awayId}`;

        if (!createdGameKeys.has(gameKey)) {
            createdGameKeys.add(gameKey);
            games.push({
                id: row.id || `g_db_${i}`,
                homeTeamId: homeId,
                awayTeamId: awayId,
                date: dateStr,
                played: false, 
                homeScore: row.tm_score || row.TmScore || undefined,
                awayScore: row.opp_score || row.OppScore || undefined
            });
        }
    });

    return games.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// Deprecated CSV parsers (kept if needed for fallback, but main logic moved to map helpers)
export function parseRostersCSV(csv: string): Record<string, Player[]> {
    const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
    const rosterMap: Record<string, Player[]> = {};

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length < 45) continue; 

        const teamFull = values[0];
        const teamData = INITIAL_TEAMS_DATA.find(t => `${t.city} ${t.name}` === teamFull || t.name === teamFull);
        const teamKey = teamData?.id || 'unknown';
        
        const mockRow = {
            name: values[1],
            position: values[2],
            age: parseInt(values[3]),
            height: parseInt(values[4]),
            weight: parseInt(values[5]),
            salary: parseFloat(values[6]),
            contract_years: parseInt(values[7]),
            health: values[8],
            potential: parseInt(values[9]),
            intangibles: parseInt(values[10]),
            speed: parseInt(values[11]),
            agility: parseInt(values[12]),
            strength: parseInt(values[13]),
            vertical: parseInt(values[14]),
            stamina: parseInt(values[15]),
            hustle: parseInt(values[16]),
            durability: parseInt(values[17]),
            close_shot: parseInt(values[18]),
            mid_range: parseInt(values[19]),
            three_corner: parseInt(values[20]),
            three_45: parseInt(values[21]),
            three_top: parseInt(values[22]),
            ft: parseInt(values[23]),
            shot_iq: parseInt(values[24]),
            off_consist: parseInt(values[25]),
            layup: parseInt(values[26]),
            dunk: parseInt(values[27]),
            post_play: parseInt(values[28]),
            draw_foul: parseInt(values[29]),
            hands: parseInt(values[30]),
            pass_acc: parseInt(values[31]),
            handling: parseInt(values[32]),
            spd_ball: parseInt(values[33]),
            pass_iq: parseInt(values[34]),
            pass_vision: parseInt(values[35]),
            int_def: parseInt(values[36]),
            per_def: parseInt(values[37]),
            lockdown: parseInt(values[38]),
            steal: parseInt(values[39]),
            block: parseInt(values[40]),
            help_def_iq: parseInt(values[41]),
            pass_perc: parseInt(values[42]),
            def_consist: parseInt(values[43]),
            off_reb: parseInt(values[44]),
            def_reb: (values[45] && values[45] !== '') ? parseInt(values[45]) : undefined
        };

        if (teamKey !== 'unknown') {
            if (!rosterMap[teamKey]) rosterMap[teamKey] = [];
            rosterMap[teamKey].push(mapDatabasePlayerToRuntimePlayer(mockRow, teamKey));
        }
    }
    return rosterMap;
}

export function parseScheduleCSV(csv: string, teams: Team[]): Game[] {
    const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
    const dbRows = [];
    const startIndex = lines[0].toLowerCase().includes('date') ? 1 : 0;

    for(let i=startIndex; i<lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < 4) continue;
        dbRows.push({
            date: new Date(cols[0]).toISOString().split('T')[0], // Convert format
            team_name: cols[1],
            site: cols[2],
            opponent_name: cols[3],
            tm_score: null,
            opp_score: null
        });
    }
    return mapDatabaseScheduleToRuntimeGame(dbRows);
}

export function generateSeasonSchedule(myTeamId: string): Game[] {
  const games: Game[] = [];
  const teams = INITIAL_TEAMS_DATA.map(t => t.id);
  const startDate = new Date(SEASON_START_DATE);
  
  let currentDate = new Date(startDate);
  const endDate = new Date('2026-04-15');
  let gameIdCounter = 1;

  while (currentDate <= endDate) {
      const gamesToday = Math.floor(Math.random() * 6) + 5;
      const teamsPlaying = new Set<string>();

      for(let i=0; i<gamesToday; i++) {
          if (teamsPlaying.size >= teams.length - 1) break;

          let home = teams[Math.floor(Math.random() * teams.length)];
          while (teamsPlaying.has(home)) {
             home = teams[Math.floor(Math.random() * teams.length)];
          }
          teamsPlaying.add(home);

          let away = teams[Math.floor(Math.random() * teams.length)];
          while (teamsPlaying.has(away)) {
             away = teams[Math.floor(Math.random() * teams.length)];
          }
          teamsPlaying.add(away);

          games.push({
              id: `g_${gameIdCounter++}`,
              homeTeamId: home,
              awayTeamId: away,
              date: currentDate.toISOString().split('T')[0],
              played: false
          });
      }
      currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return games;
}

export function exportScheduleToCSV(schedule: Game[], teams: Team[]): string {
    let csv = "Date,HomeTeam,AwayTeam,HomeScore,AwayScore,Played\n";
    schedule.forEach(g => {
        csv += `${g.date},${g.homeTeamId},${g.awayTeamId},${g.homeScore || 0},${g.awayScore || 0},${g.played ? 'Y' : 'N'}\n`;
    });
    return csv;
}

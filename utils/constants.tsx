
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

export const normalizeName = (name: string): string => {
    if (!name) return "";
    return name
        .replace(/[\s\.\,\-\u3000\u00a0\u200b]+/g, '')
        .replace(/(II|III|IV|Jr|Sr)$/i, '')
        .toLowerCase()
        .trim();
};

const KNOWN_INJURIES: Record<string, { type: string, returnDate: string }> = {
  "jaysontatum": { type: "ACL (시즌 아웃)", returnDate: "2026-07-01" },
  "tyresehaliburton": { type: "ACL (시즌 아웃)", returnDate: "2026-07-01" },
  "taureanprince": { type: "목 수술 (6월 복귀 예정)", returnDate: "2026-06-15" },
  "scoothenderson": { type: "햄스트링 부상", returnDate: "2025-11-05" },
  "sethcurry": { type: "허리 부상 (요추 통증)", returnDate: "2025-12-01" },
  "bradleybeal": { type: "왼쪽 고관절 (시즌 아웃)", returnDate: "2026-06-01" },
  "kyrieirving": { type: "무릎 부상 수술", returnDate: "2026-07-01" },
  "derecklively": { type: "오른발 수술 (2월 복귀)", returnDate: "2026-02-15" },
  "zachedey": { type: "발목 염좌 (2월 복귀)", returnDate: "2026-02-01" },
  "scottypippen": { type: "왼쪽 발가락 골절", returnDate: "2026-04-01" },
  "brandonclarke": { type: "발목 부상", returnDate: "2026-03-01" },
  "tyjerome": { type: "종아리 부상", returnDate: "2026-03-15" },
  "dejountemurray": { type: "아킬레스건 통증", returnDate: "2026-01-15" }
};

export const parseCSVToObjects = (csv: string): any[] => {
    const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return [];
    let headersLine = lines[0];
    if (headersLine.charCodeAt(0) === 0xFEFF) headersLine = headersLine.slice(1);
    const headers = headersLine.split(',').map(h => h.trim());
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length < headers.length - 2) continue;
        const obj: any = {};
        headers.forEach((h, index) => {
            const val = values[index];
            if (val !== '' && !isNaN(Number(val))) obj[h] = Number(val);
            else obj[h] = val;
        });
        result.push(obj);
    }
    return result;
};

/**
 * 선수의 현재 능력치를 기반으로 오버롤을 계산합니다.
 */
export const calculatePlayerOvr = (p: any): number => {
    const position = p.position || 'PG';
    // 0값을 허용하는 threeAvg 계산 (NaN 방지)
    const tC = p.threeCorner ?? 0;
    const t45 = p.three45 ?? 0;
    const tTop = p.threeTop ?? 0;
    const threeAvg = p.threeAvg ?? ((tC + t45 + tTop) / 3);
    const heightCm = p.height || 200;

    const calc = (weights: {val: number, w: number}[]) => {
        let totalVal = 0;
        let totalWeight = 0;
        weights.forEach(item => {
            const value = item.val ?? 0; // undefined일 경우만 0으로 처리, 0은 그대로 유지
            totalVal += value * item.w;
            totalWeight += item.w;
        });
        const rawAvg = totalWeight > 0 ? totalVal / totalWeight : 50;
        return Math.min(99, Math.max(40, Math.round(rawAvg)));
    };

    if (position.includes('PG')) {
        return calc([
            { val: p.closeShot, w: 10 }, { val: p.midRange, w: 20 }, { val: threeAvg, w: 25 }, { val: p.ft, w: 10 }, { val: p.shotIq, w: 45 }, { val: p.offConsist, w: 25 },
            { val: p.layup, w: 25 }, { val: p.dunk, w: 0 }, { val: p.postPlay, w: 0 }, { val: p.drawFoul, w: 0 }, { val: p.hands, w: 40 },
            { val: p.intDef, w: 0 }, { val: p.perDef, w: 0 }, { val: p.steal, w: 0 }, { val: p.blk, w: 0 }, { val: p.helpDefIq, w: 0 }, { val: p.passPerc, w: 0 }, { val: p.defConsist, w: 0 },
            { val: p.offReb, w: 2 }, { val: p.defReb, w: 0 },
            { val: p.speed, w: 10 }, { val: p.agility, w: 10 }, { val: p.strength, w: 0 }, { val: p.vertical, w: 0 }, { val: p.stamina, w: 15 }, { val: p.hustle, w: 0 }, { val: p.durability, w: 0 },
            { val: p.passAcc, w: 25 }, { val: p.handling, w: 15 }, { val: p.spdBall, w: 10 }, { val: p.passVision, w: 25 }, { val: p.passIq, w: 50 },
            { val: p.intangibles, w: 5 }, { val: p.potential, w: 500 }
        ]);
    } else if (position.includes('SG')) {
        return calc([
            { val: p.closeShot, w: 45 }, { val: p.midRange, w: 45 }, { val: threeAvg, w: 45 }, { val: p.ft, w: 20 }, { val: p.shotIq, w: 80 }, { val: p.offConsist, w: 60 },
            { val: p.layup, w: 30 }, { val: p.dunk, w: 0 }, { val: p.postPlay, w: 0 }, { val: p.drawFoul, w: 0 }, { val: p.hands, w: 49 },
            { val: p.intDef, w: 0 }, { val: p.perDef, w: 15 }, { val: p.steal, w: 10 }, { val: p.blk, w: 0 }, { val: p.helpDefIq, w: 10 }, { val: p.passPerc, w: 0 }, { val: p.defConsist, w: 5 },
            { val: p.offReb, w: 1 }, { val: p.defReb, w: 1 },
            { val: p.speed, w: 40 }, { val: p.agility, w: 60 }, { val: p.strength, w: 0 }, { val: p.vertical, w: 0 }, { val: p.stamina, w: 30 }, { val: p.hustle, w: 0 }, { val: p.durability, w: 0 },
            { val: p.passAcc, w: 20 }, { val: p.handling, w: 25 }, { val: p.spdBall, w: 20 }, { val: p.passVision, w: 15 }, { val: p.passIq, w: 40 },
            { val: p.intangibles, w: 5 }, { val: p.potential, w: 500 }, { val: heightCm, w: 2 }
        ]);
    } else if (position.includes('SF')) {
        return calc([
            { val: p.closeShot, w: 200 }, { val: p.midRange, w: 200 }, { val: threeAvg, w: 200 }, { val: p.ft, w: 20 }, { val: p.shotIq, w: 100 }, { val: p.offConsist, w: 30 },
            { val: p.layup, w: 200 }, { val: p.dunk, w: 0 }, { val: p.postPlay, w: 0 }, { val: p.drawFoul, w: 0 }, { val: p.hands, w: 100 },
            { val: p.intDef, w: 100 }, { val: p.perDef, w: 100 }, { val: p.steal, w: 0 }, { val: p.blk, w: 0 }, { val: p.helpDefIq, w: 50 }, { val: p.passPerc, w: 0 }, { val: p.defConsist, w: 0 },
            { val: p.offReb, w: 0 }, { val: p.defReb, w: 0 },
            { val: p.speed, w: 50 }, { val: p.agility, w: 50 }, { val: p.strength, w: 50 }, { val: p.vertical, w: 50 }, { val: p.stamina, w: 100 }, { val: p.hustle, w: 50 }, { val: p.durability, w: 60 },
            { val: p.passAcc, w: 40 }, { val: p.handling, w: 0 }, { val: p.spdBall, w: 0 }, { val: p.passVision, w: 0 }, { val: p.passIq, w: 30 },
            { val: p.intangibles, w: 10 }, { val: p.potential, w: 500 }, { val: heightCm, w: 30 }
        ]);
    } else if (position.includes('PF')) {
        return calc([
            { val: p.closeShot, w: 5 }, { val: p.midRange, w: 1 }, { val: threeAvg, w: 1 }, { val: p.ft, w: 4 }, { val: p.shotIq, w: 1 }, { val: p.offConsist, w: 5 },
            { val: p.layup, w: 3 }, { val: p.dunk, w: 4 }, { val: p.postPlay, w: 4 }, { val: p.drawFoul, w: 4 }, { val: p.hands, w: 5},
            { val: p.intDef, w: 6 }, { val: p.perDef, w: 1 }, { val: p.steal, w: 1 }, { val: p.blk, w: 4 }, { val: p.helpDefIq, w: 2 }, { val: p.passPerc, w: 1 }, { val: p.defConsist, w: 5 },
            { val: p.offReb, w: 4 }, { val: p.defReb, w: 6 },
            { val: p.speed, w: 2 }, { val: p.agility, w: 2 }, { val: p.strength, w: 5 }, { val: p.vertical, w: 5 }, { val: p.stamina, w: 4 }, { val: p.hustle, w: 4 }, { val: p.durability, w: 5 },
            { val: p.passAcc, w: 1}, { val: p.handling, w: 1 }, { val: p.spdBall, w: 1 }, { val: p.passVision, w: 1 }, { val: p.passIq, w: 1 },
            { val: p.intangibles, w: 15 }, { val: p.potential, w: 12 }, { val: heightCm, w: 7 }
        ]);
    } else if (position.includes('C')) {
        return calc([
            { val: p.closeShot, w: 10 }, { val: p.midRange, w: 2 }, { val: threeAvg, w: 2 }, { val: p.ft, w: 2 }, { val: p.shotIq, w: 3 }, { val: p.offConsist, w: 5 },
            { val: p.layup, w: 8 }, { val: p.dunk, w: 10 }, { val: p.postPlay, w: 10 }, { val: p.drawFoul, w: 5 }, { val: p.hands, w: 5},
            { val: p.intDef, w: 12 }, { val: p.perDef, w: 1 }, { val: p.steal, w: 1 }, { val: p.blk, w: 8 }, { val: p.helpDefIq, w: 1 }, { val: p.passPerc, w: 1 }, { val: p.defConsist, w: 6 },
            { val: p.offReb, w: 8 }, { val: p.defReb, w: 8 },
            { val: p.speed, w: 2 }, { val: p.agility, w: 2 }, { val: p.strength, w: 6 }, { val: p.vertical, w: 8 }, { val: p.stamina, w: 2 }, { val: p.hustle, w: 1 }, { val: p.durability, w: 6 },
            { val: p.passAcc, w: 1}, { val: p.handling, w: 1 }, { val: p.spdBall, w: 1 }, { val: p.passVision, w: 1 }, { val: p.passIq, w: 1 },
            { val: p.intangibles, w: 15 }, { val: p.potential, w: 10 }, { val: heightCm, w: 8 }
        ]);
    }
    return 70;
};

const calculateAttributes = (p: any) => {
    const avg = (nums: number[]) => Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);

    const getVal = (...keys: string[]) => {
        for (const k of keys) {
            if (p[k] !== undefined && p[k] !== null) return parseInt(p[k], 10);
            if (p[k.toLowerCase()] !== undefined && p[k.toLowerCase()] !== null) return parseInt(p[k.toLowerCase()], 10);
            if (p[k.toUpperCase()] !== undefined && p[k.toUpperCase()] !== null) return parseInt(p[k.toUpperCase()], 10);
        }
        return 0; 
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

    const ath = avg([speed, agility, strength, vertical, stamina, hustle, durability]);
    const out = avg([closeShot, midRange, threeCorner, three45, threeTop, ft, shotIq, offConsist]);
    const ins = avg([layup, dunk, postPlay, drawFoul, hands]);
    const plm = avg([passAcc, handling, spdBall, passIq, passVision]);
    const def = avg([intDef, perDef, lockdown, steal, blk, helpDefIq, passPerc, defConsist]);
    const reb = avg([offReb, defReb]);

    const position = p.position || 'PG';
    const name = (p.name || 'Unknown').trim();
    const age = p.age || 20;
    const height = p.height || 200;
    const weight = p.weight || 95;
    const salary = p.salary || 1;
    const contractYears = p.contract_years || 1;
    const intangibles = getVal('intangibles', 'INTANGIBLES', 'INT'); 
    const potential = getVal('potential', 'POT');

    const attrObj = { 
        position, closeShot, midRange, threeCorner, three45, threeTop, ft, shotIq, offConsist, 
        layup, dunk, postPlay, drawFoul, hands, intDef, perDef, steal, blk, helpDefIq, passPerc, 
        defConsist, offReb, defReb, speed, agility, strength, vertical, stamina, hustle, 
        durability, passAcc, handling, spdBall, passVision, passIq, intangibles, potential, height 
    };

    const ovr = calculatePlayerOvr(attrObj);

    return {
        ovr, ath, out, ins, plm, def, reb,
        speed, agility, strength, vertical, stamina, hustle, durability,
        closeShot, midRange, threeCorner, three45, threeTop, ft, shotIq, offConsist,
        layup, dunk, postPlay, drawFoul, hands,
        passAcc, handling, spdBall, passIq, passVision,
        intDef, perDef, lockdown, steal, blk, helpDefIq, passPerc, defConsist,
        offReb, defReb,
        intangibles, potential,
        name, age, height, weight, salary, contractYears, position
    };
};

export const mapDatabasePlayerToRuntimePlayer = (p: any, teamId: string): Player => {
    const attrs = calculateAttributes(p);
    const searchName = normalizeName(attrs.name);
    const knownKey = Object.keys(KNOWN_INJURIES).find(k => normalizeName(k) === searchName);
    const known = knownKey ? KNOWN_INJURIES[knownKey] : undefined;
    let health: 'Healthy' | 'Injured' | 'Day-to-Day' = 'Healthy';
    if (known) health = 'Injured';
    else {
        const dbStatus = (p.health || "").toLowerCase();
        if (dbStatus.includes('injured') || dbStatus.includes('out') || dbStatus.includes('dtd')) health = dbStatus.includes('dtd') ? 'Day-to-Day' : 'Injured';
    }
    let injuryType = known ? known.type : (p.injuryType || (health !== 'Healthy' ? "재활 중" : ""));
    const returnDate = known ? known.returnDate : (p.returnDate || (health !== 'Healthy' ? '미정' : undefined));
    let id = p.id || `${teamId}_${searchName}`;
    return {
        id: String(id),
        ...attrs,
        position: attrs.position as any,
        health,
        injuryType: injuryType || undefined,
        returnDate,
        condition: health === 'Healthy' ? 100 : 40,
        revealedPotential: attrs.potential,
        stats: INITIAL_STATS(),
        playoffStats: INITIAL_STATS()
    };
};

const MONTH_MAP: Record<string, string> = { 
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', 
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' 
};

export const mapDatabaseScheduleToRuntimeGame = (dbGames: any[]): Game[] => {
    const games: Game[] = [];
    const createdGameKeys = new Set<string>();
    dbGames.forEach((row, i) => {
        const teamFull = (row.team_name || row.team || '').trim();
        const oppFull = (row.opponent_name || row.opponent || '').trim();
        const dateStrRaw = row.date || row.Date;
        if (!teamFull || !oppFull || !dateStrRaw) return;
        const findTeamId = (name: string) => {
            if (name === '팀버울브즈' || name === '팀버울브스') return 'min'; 
            if (name === '너겟츠' || name === '너게츠') return 'den';
            const directMatch = INITIAL_TEAMS_DATA.find(t => t.id === name.toLowerCase());
            if (directMatch) return directMatch.id;
            const t = INITIAL_TEAMS_DATA.find(t => t.name === name || t.city === name || `${t.city} ${t.name}` === name);
            return t ? t.id : null;
        };
        const teamId = findTeamId(teamFull);
        const oppId = findTeamId(oppFull);
        if (!teamId || !oppId) return;
        let homeId, awayId;
        const site = row.site || '';
        if (site === '홈' || site === 'Home') { homeId = teamId; awayId = oppId; } 
        else { homeId = oppId; awayId = teamId; }
        let dateStr = dateStrRaw;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStrRaw)) {
            const parts = dateStrRaw.split(' ').filter((p: string) => p.trim() !== '');
            if (parts.length === 4) {
               const month = MONTH_MAP[parts[1]];
               const day = parts[2].padStart(2, '0');
               const year = parts[3];
               if (month && day && year) dateStr = `${year}-${month}-${day}`;
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
                played: false
            });
        }
    });
    return games.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

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
            name: values[1], position: values[2], age: parseInt(values[3]), height: parseInt(values[4]), weight: parseInt(values[5]),
            salary: parseFloat(values[6]), contract_years: parseInt(values[7]), health: values[8], potential: parseInt(values[9]),
            intangibles: parseInt(values[10]), speed: parseInt(values[11]), agility: parseInt(values[12]), strength: parseInt(values[13]),
            vertical: parseInt(values[14]), stamina: parseInt(values[15]), hustle: parseInt(values[16]), durability: parseInt(values[17]),
            close_shot: parseInt(values[18]), mid_range: parseInt(values[19]), three_corner: parseInt(values[20]), three_45: parseInt(values[21]),
            three_top: parseInt(values[22]), ft: parseInt(values[23]), shot_iq: parseInt(values[24]), off_consist: parseInt(values[25]),
            layup: parseInt(values[26]), dunk: parseInt(values[27]), post_play: parseInt(values[28]), draw_foul: parseInt(values[29]),
            hands: parseInt(values[30]), pass_acc: parseInt(values[31]), handling: parseInt(values[32]), spd_ball: parseInt(values[33]),
            pass_iq: parseInt(values[34]), pass_vision: parseInt(values[35]), int_def: parseInt(values[36]), per_def: parseInt(values[37]),
            lockdown: parseInt(values[38]), steal: parseInt(values[39]), block: parseInt(values[40]), help_def_iq: parseInt(values[41]),
            pass_perc: parseInt(values[42]), def_consist: parseInt(values[43]), off_reb: parseInt(values[44]), def_reb: (values[45] && values[45] !== '') ? parseInt(values[45]) : undefined
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
    for(let i=1; i<lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < 4) continue;
        dbRows.push({
            date: new Date(cols[0]).toISOString().split('T')[0], team_name: cols[1], site: cols[2], opponent_name: cols[3]
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
          while (teamsPlaying.has(home)) home = teams[Math.floor(Math.random() * teams.length)];
          teamsPlaying.add(home);
          let away = teams[Math.floor(Math.random() * teams.length)];
          while (teamsPlaying.has(away)) away = teams[Math.floor(Math.random() * teams.length)];
          teamsPlaying.add(away);
          games.push({ id: `g_${gameIdCounter++}`, homeTeamId: home, awayTeamId: away, date: currentDate.toISOString().split('T')[0], played: false });
      }
      currentDate.setDate(currentDate.getDate() + 1);
  }
  return games;
}

export function exportScheduleToCSV(schedule: Game[], teams: Team[]): string {
    let csv = "Date,HomeTeam,AwayTeam,HomeScore,AwayScore,Played\n";
    schedule.forEach(g => { csv += `${g.date},${g.homeTeamId},${g.awayTeamId},${g.homeScore || 0},${g.awayScore || 0},${g.played ? 'Y' : 'N'}\n`; });
    return csv;
}


import { Player, SeasonStats, Game, Team } from '../types';
import { POSITION_WEIGHTS, PositionType } from './overallWeights';

export const SEASON_START_DATE = '2025-10-20'; // 25-26 Season Start
export const TRADE_DEADLINE = '2026-02-06';

export const INITIAL_STATS = (): SeasonStats => ({
  g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
  fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
  rimM: 0, rimA: 0, midM: 0, midA: 0
});

export const getTeamLogoUrl = (id: string): string => {
  const ESPN_LOGO_ID_MAP: Record<string, string> = {
    'nop': 'no', 'uta': 'utah', 'sas': 'sa', 'gsw': 'gs', 'nyk': 'ny', 'lal': 'lal', 'lac': 'lac', 'phx': 'phx', 'was': 'wsh'
  };
  const espnId = ESPN_LOGO_ID_MAP[id] || id;
  return `https://a.espncdn.com/i/teamlogos/nba/500/${espnId}.png`;
};

export const TEAM_OWNERS: Record<string, string> = {
  'atl': '토니 레슬러',
  'bos': '빌 치좀',
  'det': '톰 고어스',
  'nyk': '제임스 돌란',
  'chi': '제리 라인스도프',
  'was': '모뉴먼트 스포츠&엔터테인먼트',
  'phi': '해리스 블리처 스포츠 엔터테인먼트',
  'ind': '허버트 사이먼',
  'mia': '미키 애리슨',
  'bkn': '차이충신',
  'mil': '웨슬리 이든스 & 마크 래즈리',
  'cha': '릭 슈날 & 게이브 플롯킨',
  'tor': '메이플 리프 스포츠&엔터테인먼트',
  'cle': '댄 길버트',
  'orl': 'RDV 스포츠 Inc.',
  'sas': '스퍼츠 스포츠&엔터테인먼트',
  'den': '조쉬 크뢴케',
  'sac': '비베크 라나디베',
  'hou': '틸먼 퍼티타',
  'por': '토마스 던든',
  'gsw': '조 레이콥',
  'dal': '패트릭 듀몽',
  'uta': '라이언 스미스',
  'lal': '마크 월터',
  'mem': '멤피스 배스킷볼 LLC',
  'min': '마크 로리',
  'nop': '게일 벤슨',
  'okc': '프로페셔널 배스킷볼 클럽 LLC',
  'phx': '맷 이시비아',
  'lac': '스티브 발머'
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

const TEAM_NAME_MAP: Record<string, string> = {
  // Direct Match from CSV (Used for migration/seeding, but here for compatibility if needed)
  '보스턴 셀틱스': 'bos', '브루클린 네츠': 'bkn', '뉴욕 닉스': 'nyk', '필라델피아 세븐티식서스': 'phi', '토론토 랩터스': 'tor',
  '시카고 불스': 'chi', '클리블랜드 캐벌리어스': 'cle', '디트로이트 피스톤즈': 'det', '인디애나 페이서스': 'ind', '밀워키 벅스': 'mil',
  '애틀랜타 호크스': 'atl', '샬럿 호네츠': 'cha', '마이애미 히트': 'mia', '올랜도 매직': 'orl', '워싱턴 위저즈': 'was',
  '덴버 너게츠': 'den', '미네소타 팀버울브스': 'min', '오클라호마시티 썬더': 'okc', '포틀랜드 트레일블레이저스': 'por', '유타 재즈': 'uta',
  '골든스테이트 워리어스': 'gsw', 'la 클리퍼스': 'lac', '엘에이 클리퍼스': 'lac', 'la 레이커스': 'lal', '엘에이 레이커스': 'lal', '피닉스 선즈': 'phx',
  '새크라멘토 킹스': 'sac', '댈러스 매버릭스': 'dal', '휴스턴 로케츠': 'hou', '멤피스 그리즐리스': 'mem', '뉴올리언스 펠리컨스': 'nop', '샌안토니오 스퍼스': 'sas',

  // Common Aliases
  'boston': 'bos', 'celtics': 'bos', '보스턴': 'bos', '셀틱스': 'bos', 'bos': 'bos',
  'brooklyn': 'bkn', 'nets': 'bkn', '브루클린': 'bkn', '네츠': 'bkn', 'bkn': 'bkn', 'brk': 'bkn',
  'new york': 'nyk', 'knicks': 'nyk', 'ny': 'nyk', '뉴욕': 'nyk', '닉스': 'nyk', 'nyk': 'nyk',
  'philadelphia': 'phi', '76ers': 'phi', 'sixers': 'phi', '필라델피아': 'phi', '세븐티식서스': 'phi', 'phi': 'phi',
  'toronto': 'tor', 'raptors': 'tor', '토론토': 'tor', '랩터스': 'tor', 'tor': 'tor',
  'chicago': 'chi', 'bulls': 'chi', '시카고': 'chi', '불스': 'chi', 'chi': 'chi',
  'cleveland': 'cle', 'cavaliers': 'cle', 'cavs': 'cle', '클리블랜드': 'cle', '캐벌리어스': 'cle', 'cle': 'cle',
  'detroit': 'det', 'pistons': 'det', '디트로이트': 'det', '피스톤즈': 'det', 'det': 'det',
  'indiana': 'ind', 'pacers': 'ind', '인디애나': 'ind', '페이서스': 'ind', 'ind': 'ind',
  'milwaukee': 'mil', 'bucks': 'mil', '밀워키': 'mil', '벅스': 'mil', 'mil': 'mil',
  'atlanta': 'atl', 'hawks': 'atl', '애틀랜타': 'atl', '호크스': 'atl', 'atl': 'atl',
  'charlotte': 'cha', 'hornets': 'cha', '샬럿': 'cha', '호네츠': 'cha', 'cha': 'cha',
  'miami': 'mia', 'heat': 'mia', '마이애미': 'mia', '히트': 'mia', 'mia': 'mia',
  'orlando': 'orl', 'magic': 'orl', '올랜도': 'orl', '매직': 'orl', 'orl': 'orl',
  'washington': 'was', 'wizards': 'was', '워싱턴': 'was', '위저즈': 'was', 'was': 'was',
  'denver': 'den', 'nuggets': 'den', '덴버': 'den', '너게츠': 'den', 'den': 'den',
  'minnesota': 'min', 'timberwolves': 'min', 'wolves': 'min', '미네소타': 'min', '팀버울브스': 'min', 'min': 'min',
  'oklahoma city': 'okc', 'thunder': 'okc', 'okc': 'okc', '오클라호마시티': 'okc', '썬더': 'okc',
  'portland': 'por', 'trail blazers': 'por', 'blazers': 'por', '포틀랜드': 'por', '트레일블레이저스': 'por', 'por': 'por',
  'utah': 'uta', 'jazz': 'uta', '유타': 'uta', '재즈': 'uta', 'uta': 'uta',
  'golden state': 'gsw', 'warriors': 'gsw', 'gs': 'gsw', '골든스테이트': 'gsw', '워리어스': 'gsw', 'gsw': 'gsw',
  'la clippers': 'lac', 'clippers': 'lac', '클리퍼스': 'lac', 'lac': 'lac',
  'la lakers': 'lal', 'lakers': 'lal', '레이커스': 'lal', 'lal': 'lal',
  'phoenix': 'phx', 'suns': 'phx', '피닉스': 'phx', '선즈': 'phx', 'phx': 'phx',
  'sacramento': 'sac', 'kings': 'sac', '새크라멘토': 'sac', '킹스': 'sac', 'sac': 'sac',
  'dallas': 'dal', 'mavericks': 'dal', 'mavs': 'dal', '댈러스': 'dal', '매버릭스': 'dal', 'dal': 'dal',
  'houston': 'hou', 'rockets': 'hou', '휴스턴': 'hou', '로케츠': 'hou', 'hou': 'hou',
  'memphis': 'mem', 'grizzlies': 'mem', '멤피스': 'mem', '그리즐리스': 'mem', 'mem': 'mem',
  'new orleans': 'nop', 'pelicans': 'nop', 'pels': 'nop', '뉴올리언스': 'nop', '펠리컨스': 'nop', 'nop': 'nop',
  'san antonio': 'sas', 'spurs': 'sas', '샌안토니오': 'sas', '스퍼스': 'sas', 'sas': 'sas'
};

export const normalizeName = (name: string): string => {
    if (!name) return "";
    return name
        .replace(/[\s\.\,\-\u3000\u00a0\u200b]+/g, '')
        .replace(/(II|III|IV|Jr|Sr)$/i, '')
        .toLowerCase()
        .trim();
};

const SORTED_KEYS = Object.keys(TEAM_NAME_MAP).sort((a, b) => b.length - a.length);

export const resolveTeamId = (input: string): string => {
    if (!input) return 'unknown';
    const normalized = input.toLowerCase().trim();
    if (TEAM_NAME_MAP[normalized]) return TEAM_NAME_MAP[normalized];
    for (const key of SORTED_KEYS) {
        if (normalized.includes(key)) {
            return TEAM_NAME_MAP[key];
        }
    }
    return 'unknown';
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

// [Cleanup] Parse CSV removed from runtime. Data now comes strictly from Supabase.
// Only used in migration scripts if needed, but not here.
export const parseCSVToObjects = (csv: string): any[] => {
    // Legacy support for seeding if absolutely necessary, otherwise unused in main app
    const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return [];
    let headersLine = lines[0];
    if (headersLine.charCodeAt(0) === 0xFEFF) headersLine = headersLine.slice(1);
    const headers = headersLine.split(',').map(h => h.trim().toLowerCase());
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length < headers.length - 1) continue;
        const obj: any = {};
        headers.forEach((h, index) => {
            const val = values[index];
            if (val !== undefined && val !== '' && !isNaN(Number(val))) obj[h] = Number(val);
            else obj[h] = val;
        });
        result.push(obj);
    }
    return result;
};

export const calculatePlayerOvr = (p: any, overridePosition?: string): number => {
    const position = overridePosition || p.position || p.Position || 'PG';
    
    let posKey: PositionType = 'PG';
    if (position.includes('SG')) posKey = 'SG';
    else if (position.includes('SF')) posKey = 'SF';
    else if (position.includes('PF')) posKey = 'PF';
    else if (position.includes('C')) posKey = 'C';
    
    const weights = POSITION_WEIGHTS[posKey];

    // Helper: Safely access properties.
    // If p is a runtime Player object, keys are already camelCase.
    // If p comes from DB, we expect 'base_attributes' to be handled before calling this, 
    // or p should be the already-mapped object.
    const v = (key: string, altKey?: string) => {
        if (p[key] !== undefined) return Number(p[key]);
        if (altKey && p[altKey] !== undefined) return Number(p[altKey]);
        return 50; 
    };

    // Calculate standardized attributes for weight calculation
    const threeAvg = (v('threeCorner') + v('three45') + v('threeTop')) / 3;

    const attr: Record<string, number> = {
        closeShot: v('closeShot'),
        midRange: v('midRange'),
        threeAvg: threeAvg,
        ft: v('ft'),
        shotIq: v('shotIq'),
        offConsist: v('offConsist'),
        layup: v('layup'),
        dunk: v('dunk'),
        postPlay: v('postPlay'),
        drawFoul: v('drawFoul'),
        hands: v('hands'),
        passAcc: v('passAcc'),
        handling: v('handling'),
        spdBall: v('spdBall'),
        passVision: v('passVision'),
        passIq: v('passIq'),
        stamina: v('stamina'),
        intDef: v('intDef'),
        perDef: v('perDef'),
        steal: v('steal'),
        blk: v('blk'),
        helpDefIq: v('helpDefIq'),
        passPerc: v('passPerc'),
        defConsist: v('defConsist'),
        offReb: v('offReb'),
        defReb: v('defReb'),
        potential: v('potential'),
        intangibles: v('intangibles'),
        height: v('height', '200'),
        strength: v('strength'),
        vertical: v('vertical'),
        durability: v('durability'),
        agility: v('agility'),
        hustle: v('hustle'),
        speed: v('speed'),
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
};

// [Critical Update] Strictly rely on Supabase `base_attributes` structure
// Removed ambiguous fallback logic (looking for "LAY" or "3C" at top level).
export const mapDatabasePlayerToRuntimePlayer = (p: any, teamId: string): Player => {
    // 1. Extract Attributes from DB JSONB column
    const a = p.base_attributes || {};

    // Helper to get value from DB keys (usually UPPERCASE short codes) or map to default
    // We explicitly map the DB short keys to runtime long keys here.
    const getVal = (shortKey: string, longKey: string) => {
        // Check short key, long key, and lowercase variants inside base_attributes
        return Number(a[shortKey] ?? a[longKey] ?? a[shortKey.toLowerCase()] ?? a[longKey.toLowerCase()] ?? 50);
    };

    const name = p.name || "Unknown Player";
    const norm = normalizeName(name);
    const injury = KNOWN_INJURIES[norm];

    // 2. Map Stats
    // Shooting
    const closeShot = getVal('CLOSE', 'closeShot');
    const midRange = getVal('MID', 'midRange');
    const threeCorner = getVal('3C', 'threeCorner');
    const three45 = getVal('3_45', 'three45');
    const threeTop = getVal('3T', 'threeTop');
    const ft = getVal('FT', 'ft');
    const shotIq = getVal('SIQ', 'shotIq');
    const offConsist = getVal('OCON', 'offConsist');

    // Inside
    const layup = getVal('LAY', 'layup');
    const dunk = getVal('DNK', 'dunk');
    const postPlay = getVal('POST', 'postPlay');
    const drawFoul = getVal('DRAW', 'drawFoul');
    const hands = getVal('HANDS', 'hands');

    // Playmaking
    const passAcc = getVal('PACC', 'passAcc');
    const handling = getVal('HANDL', 'handling');
    const spdBall = getVal('SPWB', 'spdBall');
    const passVision = getVal('PVIS', 'passVision');
    const passIq = getVal('PIQ', 'passIq');

    // Defense
    const intDef = getVal('IDEF', 'intDef');
    const perDef = getVal('PDEF', 'perDef');
    const steal = getVal('STL', 'steal');
    const blk = getVal('BLK', 'blk');
    const helpDefIq = getVal('HDEF', 'helpDefIq');
    const passPerc = getVal('PPER', 'passPerc');
    const defConsist = getVal('DCON', 'defConsist');

    // Rebounding
    const offReb = getVal('OREB', 'offReb');
    const defReb = getVal('DREB', 'defReb');

    // Athleticism
    const speed = getVal('SPD', 'speed');
    const agility = getVal('AGI', 'agility');
    const strength = getVal('STR', 'strength');
    const vertical = getVal('VERT', 'vertical');
    const stamina = getVal('STA', 'stamina');
    const hustle = getVal('HUS', 'hustle');
    const durability = getVal('DUR', 'durability');

    // Meta
    const intangibles = getVal('INTANGIBLES', 'intangibles');
    const potential = getVal('POT', 'potential');

    // 3. Derived Aggregates
    const threeAvg = (threeCorner + three45 + threeTop) / 3;
    const ins = Math.round((layup + dunk + postPlay) / 3);
    const out = Math.round((closeShot + midRange + threeAvg) / 3);
    const plm = Math.round((passAcc + handling + passVision) / 3);
    const def = Math.round((intDef + perDef + steal + blk) / 4);
    const reb = Math.round((offReb + defReb) / 2);
    const ath = Math.round((speed + agility + strength + vertical) / 4);

    // 4. Calculate OVR
    // Trust DB OVR if it exists and > 40, else recalculate
    const dbOvr = p.ovr || a.ovr;
    const runtimePlayerForCalc = {
        position: p.position || 'G',
        closeShot, midRange, threeCorner, three45, threeTop, ft, shotIq, offConsist,
        layup, dunk, postPlay, drawFoul, hands,
        passAcc, handling, spdBall, passVision, passIq,
        intDef, perDef, steal, blk, helpDefIq, passPerc, defConsist,
        offReb, defReb,
        speed, agility, strength, vertical, stamina, hustle, durability,
        intangibles, potential, height: p.height
    };
    const calculatedOvr = calculatePlayerOvr(runtimePlayerForCalc);
    const ovr = (dbOvr && dbOvr > 40) ? dbOvr : calculatedOvr;

    return {
        id: p.id || `p_${norm}_${teamId}_${Date.now()}`,
        name,
        position: p.position || 'G',
        age: p.age || 25,
        height: p.height || 200,
        weight: p.weight || 100,
        salary: p.salary || 1.0,
        contractYears: p.contract_years || 1,
        health: injury ? 'Injured' : 'Healthy',
        injuryType: injury?.type,
        returnDate: injury?.returnDate,
        condition: 100,
        ovr,
        potential: potential || (ovr + 5),
        revealedPotential: potential || (ovr + 5),
        intangibles,
        
        // Stats
        speed, agility, strength, vertical, stamina, hustle, durability, ath,
        closeShot, midRange, threeCorner, three45, threeTop, ft, shotIq, offConsist, out,
        layup, dunk, postPlay, drawFoul, hands, ins,
        passAcc, handling, spdBall, passIq, passVision, plm,
        intDef, perDef, steal, blk, helpDefIq, passPerc, defConsist, def,
        offReb, defReb, reb,

        stats: INITIAL_STATS(),
        playoffStats: INITIAL_STATS()
    };
};

export const mapDatabaseScheduleToRuntimeGame = (rows: any[]): Game[] => {
    return rows.map(r => {
        // Handle explicit DB columns (home_team_id, away_team_id)
        if (r.home_team_id && r.away_team_id) {
             return {
                 id: r.id || `g_${r.home_team_id}_${r.away_team_id}_${r.game_date}`,
                 homeTeamId: r.home_team_id,
                 awayTeamId: r.away_team_id,
                 date: r.game_date,
                 homeScore: r.home_score ?? undefined,
                 awayScore: r.away_score ?? undefined,
                 played: !!r.played,
                 isPlayoff: r.is_playoff || false,
                 seriesId: r.series_id || undefined
             };
        }

        // Fallback for CSV-like structure
        let dateStr = r.date || r.Date;
        if (dateStr && dateStr.includes(' ')) {
            try {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                    dateStr = d.toISOString().split('T')[0];
                }
            } catch(e) {}
        }

        const site = r.site || r.Site;
        const homeName = (site === '홈' || site === 'Home') ? (r.team || r.Team) : (r.opponent || r.Opponent);
        const awayName = (site === '홈' || site === 'Home') ? (r.opponent || r.Opponent) : (r.team || r.Team);

        const homeTeamId = resolveTeamId(homeName);
        const awayTeamId = resolveTeamId(awayName);

        return {
            id: r.id || `g_${homeTeamId}_${awayTeamId}_${dateStr}`,
            homeTeamId,
            awayTeamId,
            date: dateStr,
            homeScore: r.tmscore || r.home_score || undefined,
            awayScore: r.oppscore || r.away_score || undefined,
            played: !!(r.tmscore || r.home_score),
            isPlayoff: r.isplayoff || false,
            seriesId: r.seriesid || undefined
        };
    });
};

export const generateSeasonSchedule = (myTeamId: string): Game[] => {
  const games: Game[] = [];
  const teamIds = INITIAL_TEAMS_DATA.map(t => t.id);
  const startDate = new Date(SEASON_START_DATE);
  for (let i = 0; i < 82; i++) {
    const oppIdx = (teamIds.indexOf(myTeamId) + i + 1) % teamIds.length;
    const opponentId = teamIds[oppIdx];
    const gameDate = new Date(startDate);
    gameDate.setDate(startDate.getDate() + i * 2);
    const isHome = i % 2 === 0;
    games.push({ id: `game_${i}_${myTeamId}`, homeTeamId: isHome ? myTeamId : opponentId, awayTeamId: isHome ? opponentId : myTeamId, date: gameDate.toISOString().split('T')[0], played: false });
  }
  return games;
};

export const exportScheduleToCSV = (schedule: Game[]) => {
  const headers = ['id', 'date', 'homeTeamId', 'awayTeamId', 'homeScore', 'awayScore', 'played', 'isPlayoff'];
  const rows = schedule.map(g => [g.id, g.date, g.homeTeamId, g.awayTeamId, g.homeScore ?? '', g.awayScore ?? '', g.played, g.isPlayoff ?? false]);
  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'nba_schedule.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

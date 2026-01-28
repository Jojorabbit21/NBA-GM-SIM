
import { Player, SeasonStats, Game, Team } from '../types';

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
  'atl': '토니 레슬러', 'bos': '빌 치좀', 'det': '톰 고어스', 'nyk': '제임스 돌란', 'chi': '제리 라인스도프',
  'was': '모뉴먼트 스포츠&엔터테인먼트', 'phi': '해리스 블리처 스포츠 엔터테인먼트', 'ind': '허버트 사이먼',
  'mia': '미키 애리슨', 'bkn': '차이충신', 'mil': '웨슬리 이든스 & 마크 래즈리', 'cha': '릭 슈날 & 게이브 플롯킨',
  'tor': '메이플 리프 스포츠&엔터테인먼트', 'cle': '댄 길버트', 'orl': 'RDV 스포츠 Inc.', 'sas': '스퍼츠 스포츠&엔터테인먼트',
  'den': '조쉬 크뢴케', 'sac': '비베크 라나디베', 'hou': '틸먼 퍼티타', 'por': '토마스 던든', 'gsw': '조 레이콥',
  'dal': '패트릭 듀몽', 'uta': '라이언 스미스', 'lal': '마크 월터', 'mem': '멤피스 배스킷볼 LLC',
  'min': '마크 로리', 'nop': '게일 벤슨', 'okc': '프로페셔널 배스킷볼 클럽 LLC', 'phx': '맷 이시비아', 'lac': '스티브 발머'
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
  // [Canonical IDs - Self Mapping]
  'bos': 'bos', 'bkn': 'bkn', 'nyk': 'nyk', 'phi': 'phi', 'tor': 'tor',
  'chi': 'chi', 'cle': 'cle', 'det': 'det', 'ind': 'ind', 'mil': 'mil',
  'atl': 'atl', 'cha': 'cha', 'mia': 'mia', 'orl': 'orl', 'was': 'was',
  'den': 'den', 'min': 'min', 'okc': 'okc', 'por': 'por', 'uta': 'uta',
  'gsw': 'gsw', 'lac': 'lac', 'lal': 'lal', 'phx': 'phx', 'sac': 'sac',
  'dal': 'dal', 'hou': 'hou', 'mem': 'mem', 'nop': 'nop', 'sas': 'sas',

  // [Short Korean Names]
  '셀틱스': 'bos', '네츠': 'bkn', '닉스': 'nyk', '세븐티식서스': 'phi', '랩터스': 'tor',
  '불스': 'chi', '캐벌리어스': 'cle', '피스톤즈': 'det', '페이서스': 'ind', '벅스': 'mil',
  '호크스': 'atl', '호네츠': 'cha', '히트': 'mia', '매직': 'orl', '위저즈': 'was',
  '너게츠': 'den', '너겟츠': 'den', '팀버울브스': 'min', '팀버울브즈': 'min', '썬더': 'okc', '트레일블레이저스': 'por', '재즈': 'uta',
  '워리어스': 'gsw', '클리퍼스': 'lac', '레이커스': 'lal', '선즈': 'phx', '킹스': 'sac',
  '매버릭스': 'dal', '로케츠': 'hou', '그리즐리스': 'mem', '펠리컨스': 'nop', '스퍼스': 'sas',

  // [Full Korean Names]
  '보스턴 셀틱스': 'bos', '브루클린 네츠': 'bkn', '뉴욕 닉스': 'nyk', '필라델피아 세븐티식서스': 'phi', '토론토 랩터스': 'tor',
  '시카고 불스': 'chi', '클리블랜드 캐벌리어스': 'cle', '디트로이트 피스톤즈': 'det', '인디애나 페이서스': 'ind', '밀워키 벅스': 'mil',
  '애틀랜타 호크스': 'atl', '샬럿 호네츠': 'cha', '마이애미 히트': 'mia', '올랜도 매직': 'orl', '워싱턴 위저즈': 'was',
  '덴버 너게츠': 'den', '미네소타 팀버울브스': 'min', '오클라호마시티 썬더': 'okc', '포틀랜드 트레일블레이저스': 'por', '유타 재즈': 'uta',
  '골든스테이트 워리어스': 'gsw', 'la 클리퍼스': 'lac', '엘에이 클리퍼스': 'lac', 'la 레이커스': 'lal', '엘에이 레이커스': 'lal',
  '피닉스 선즈': 'phx', '새크라멘토 킹스': 'sac', '댈러스 매버릭스': 'dal', '휴스턴 로케츠': 'hou', '멤피스 그리즐리스': 'mem',
  '뉴올리언스 펠리컨스': 'nop', '샌안토니오 스퍼스': 'sas',
  
  // [English Names]
  'boston': 'bos', 'celtics': 'bos', 'brooklyn': 'bkn', 'nets': 'bkn', 'new york': 'nyk', 'knicks': 'nyk', 'philadelphia': 'phi', 'sixers': 'phi',
  'toronto': 'tor', 'raptors': 'tor', 'chicago': 'chi', 'bulls': 'chi', 'cleveland': 'cle', 'cavs': 'cle', 'detroit': 'det', 'pistons': 'det',
  'indiana': 'ind', 'pacers': 'ind', 'milwaukee': 'mil', 'bucks': 'mil', 'atlanta': 'atl', 'hawks': 'atl', 'charlotte': 'cha', 'hornets': 'cha',
  'miami': 'mia', 'heat': 'mia', 'orlando': 'orl', 'magic': 'orl', 'washington': 'was', 'wizards': 'was', 'denver': 'den', 'nuggets': 'den',
  'minnesota': 'min', 'timberwolves': 'min', 'oklahoma city': 'okc', 'thunder': 'okc', 'portland': 'por', 'trail blazers': 'por', 'utah': 'uta', 'jazz': 'uta',
  'golden state': 'gsw', 'warriors': 'gsw', 'clippers': 'lac', 'lakers': 'lal', 'phoenix': 'phx', 'suns': 'phx', 'sacramento': 'sac', 'kings': 'sac',
  'dallas': 'dal', 'mavericks': 'dal', 'houston': 'hou', 'rockets': 'hou', 'memphis': 'mem', 'grizzlies': 'mem', 'new orleans': 'nop', 'pelicans': 'nop',
  'san antonio': 'sas', 'spurs': 'sas'
};

export const normalizeName = (name: string): string => {
    if (!name) return "";
    return name.replace(/[\s\.\,\-\u3000\u00a0\u200b]+/g, '').replace(/(II|III|IV|Jr|Sr)$/i, '').toLowerCase().trim();
};

export const resolveTeamId = (input: string): string => {
    if (!input) return 'unknown';
    const normalized = input.toLowerCase().trim();
    
    // 0. Check if it's already a valid canonical ID (e.g. 'bos', 'gsw')
    // This allows the function to be idempotent (resolveTeamId('bos') -> 'bos')
    const validIds = Object.values(TEAM_NAME_MAP);
    if (validIds.includes(normalized)) return normalized;

    // 1. Direct Map Lookup (O(1))
    if (TEAM_NAME_MAP[normalized]) return TEAM_NAME_MAP[normalized];

    // 2. Partial Match (Safer)
    // Only verify if the INPUT contains the key (e.g. "Boston Celtics" contains "celtics")
    if (normalized.length >= 3) {
        for (const key in TEAM_NAME_MAP) {
             if (normalized.includes(key)) {
                 return TEAM_NAME_MAP[key];
             }
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

export const parseCSVToObjects = (csv: string): any[] => {
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
    const position = overridePosition || p.position || 'PG';
    const v = (key: string, def = 70) => {
        // [Flat Support] Directly check the object properties (case-insensitive)
        const val = p[key] ?? p[key.toLowerCase()] ?? p[key.toUpperCase()];
        return (val !== undefined && val !== null) ? Number(val) : def;
    };
    
    const threeAvg = (v('threecorner', v('3c', v('three_corner', 0))) + v('three45', v('3_45', 0)) + v('threetop', v('3t', v('three_top', 0)))) / 3 || v('out', 70);

    const attr = {
        close: v('closeshot', v('close', 70)),
        mid: v('midrange', v('mid', 70)),
        threeAvg: threeAvg,
        ft: v('ft', 70),
        shotIq: v('shotIq', v('siq', 70)),
        offConsist: v('offconsist', v('ocon', 70)),
        layup: v('layup', v('lay', 70)),
        dunk: v('dunk', v('dnk', 70)),
        post: v('postplay', v('post', 70)),
        drawFoul: v('drawfoul', v('draw', 70)),
        hands: v('hands', 70),
        passAcc: v('passacc', v('pacc', 70)),
        handling: v('handling', v('handl', 70)),
        spdBall: v('spdball', v('spwb', 70)),
        passVision: v('passvision', v('pvis', 70)),
        passIq: v('passiq', v('piq', 70)),
        stamina: v('stamina', v('sta', 70)),
        intDef: v('intdef', v('idef', 70)),
        perDef: v('perdef', v('pdef', 70)),
        steal: v('steal', v('stl', 70)),
        blk: v('blk', 70),
        helpDefIq: v('helpdefiq', v('hdef', 70)),
        passPerc: v('passperc', v('pper', 70)),
        defConsist: v('defconsist', v('dcon', 70)),
        offReb: v('offreb', v('oreb', 70)),
        defReb: v('defreb', v('dreb', 70)),
        potential: v('potential', v('pot', 75)),
        intangibles: v('intangibles', 70),
        height: v('height', 200),
        strength: v('strength', v('str', 70)),
        vertical: v('vertical', v('vert', 70)),
        durability: v('durability', v('dur', 70)),
        agility: v('agility', v('agi', 70)),
        hustle: v('hustle', v('hus', 70)),
        speed: v('speed', v('spd', 70)),
    };

    const calc = (weights: {val: number, w: number}[]) => {
        let totalVal = 0, totalWeight = 0;
        weights.forEach(item => { totalVal += item.val * item.w; totalWeight += item.w; });
        return Math.min(99, Math.max(40, Math.round(totalWeight > 0 ? totalVal / totalWeight : 50)));
    };

    if (position.includes('PG')) {
        return calc([{ val: attr.close, w: 10 }, { val: attr.mid, w: 20 }, { val: attr.threeAvg, w: 25 }, { val: attr.ft, w: 10 }, { val: attr.shotIq, w: 45 }, { val: attr.offConsist, w: 25 }, { val: attr.layup, w: 25 }, { val: attr.hands, w: 40 }, { val: attr.stamina, w: 15 }, { val: attr.passAcc, w: 25 }, { val: attr.handling, w: 15 }, { val: attr.spdBall, w: 10 }, { val: attr.passVision, w: 25 }, { val: attr.passIq, w: 50 }, { val: attr.intangibles, w: 5 }, { val: attr.potential, w: 500 }]);
    } else if (position.includes('SG')) {
        return calc([{ val: attr.close, w: 300 }, { val: attr.mid, w: 100 }, { val: attr.threeAvg, w: 150 }, { val: attr.ft, w: 100 }, { val: attr.shotIq, w: 500 }, { val: attr.offConsist, w: 500 }, { val: attr.layup, w: 200 }, { val: attr.dunk, w: 150 }, { val: attr.hands, w: 250 }, { val: attr.intangibles, w: 50 }, { val: attr.potential, w: 500 }, { val: attr.height, w: 30 }]);
    } else if (position.includes('SF')) {
        return calc([{ val: attr.close, w: 300 }, { val: attr.mid, w: 150 }, { val: attr.threeAvg, w: 50 }, { val: attr.ft, w: 150 }, { val: attr.shotIq, w: 300 }, { val: attr.offConsist, w: 500 }, { val: attr.layup, w: 500 }, { val: attr.dunk, w: 100 }, { val: attr.drawFoul, w: 150 }, { val: attr.hands, w: 250 }, { val: attr.intDef, w: 200 }, { val: attr.perDef, w: 200 }, { val: attr.vertical, w: 100 }, { val: attr.stamina, w: 200 }, { val: attr.hustle, w: 200 }, { val: attr.potential, w: 500 }, { val: attr.height, w: 100 }]);
    } else if (position.includes('PF')) {
        return calc([{ val: attr.close, w: 450 }, { val: attr.offConsist, w: 600 }, { val: attr.layup, w: 500 }, { val: attr.dunk, w: 350 }, { val: attr.hands, w: 500 }, { val: attr.intDef, w: 200 }, { val: attr.offReb, w: 100 }, { val: attr.defReb, w: 160 }, { val: attr.strength, w: 100 }, { val: attr.vertical, w: 100 }, { val: attr.potential, w: 500 }, { val: attr.height, w: 150 }]);
    } else if (position.includes('C')) {
        return calc([{ val: attr.close, w: 300 }, { val: attr.shotIq, w: 200 }, { val: attr.post, w: 200 }, { val: attr.drawFoul, w: 250 }, { val: attr.hands, w: 200 }, { val: attr.intDef, w: 250 }, { val: attr.blk, w: 100 }, { val: attr.defConsist, w: 200 }, { val: attr.offReb, w: 100 }, { val: attr.defReb, w: 100 }, { val: attr.strength, w: 150 }, { val: attr.stamina, w: 150 }, { val: attr.durability, w: 150 }, { val: attr.passAcc, w: 100 }, { val: attr.handling, w: 200 }, { val: attr.passIq, w: 100 }, { val: attr.potential, w: 500 }, { val: attr.height, w: 180 }]);
    }
    return 70;
};

export const mapDatabasePlayerToRuntimePlayer = (p: any, teamId: string): Player => {
    const v = (key: string, def: any = 70) => {
        const val = p[key] ?? p[key.toLowerCase()] ?? p[key.toUpperCase()];
        return (val !== undefined && val !== null) ? val : def;
    };

    const name = p.name || p.Name || v('name', "Unknown Player");
    const norm = normalizeName(name);
    const injury = KNOWN_INJURIES[norm];
    const ovr = calculatePlayerOvr(p);
    
    return {
        id: p.id || `p_${norm}_${teamId}_${Date.now()}`,
        name,
        position: p.position || v('position', 'G'),
        age: p.age || v('age', 25),
        height: p.height || v('height', 200),
        weight: p.weight || v('weight', 100),
        salary: p.salary || v('salary', 1.0),
        contractYears: v('contract_years', v('contractyears', v('contractYears', 1))),
        health: injury ? 'Injured' : 'Healthy',
        injuryType: injury?.type,
        returnDate: injury?.returnDate,
        condition: 100,
        ovr,
        potential: v('potential', v('pot', ovr + 5)),
        revealedPotential: v('potential', v('pot', ovr + 5)),
        intangibles: v('intangibles', 70), 
        speed: v('speed', v('spd', 70)),
        agility: v('agility', v('agi', 70)),
        strength: v('strength', v('str', 70)),
        vertical: v('vertical', v('vert', 70)),
        stamina: v('stamina', v('sta', 70)),
        hustle: v('hustle', v('hus', 70)),
        durability: v('durability', v('dur', 70)),
        ath: Math.round((v('spd', 70) + v('agi', 70) + v('str', 70) + v('vert', 70)) / 4),
        closeShot: v('closeshot', v('close', 70)),
        midRange: v('midrange', v('mid', 70)),
        threeCorner: v('threecorner', v('3c', 70)),
        three45: v('three45', v('3_45', 70)),
        threeTop: v('threetop', v('3t', 70)),
        ft: v('ft', 70),
        shotIq: v('shotIq', v('siq', 70)),
        offConsist: v('offconsist', v('ocon', 70)),
        out: Math.round((v('close', 70) + v('mid', 70) + v('threecorner', v('3c', 70))) / 3),
        layup: v('layup', v('lay', 70)),
        dunk: v('dunk', v('dnk', 70)),
        postPlay: v('postplay', v('post', 70)),
        drawFoul: v('drawfoul', v('draw', 70)),
        hands: v('hands', 70),
        ins: Math.round((v('lay', 70) + v('dunk', 70) + v('post', 70)) / 3),
        passAcc: v('passacc', v('pacc', 70)),
        handling: v('handling', v('handl', 70)),
        spdBall: v('spdball', v('spwb', 70)),
        passIq: v('passiq', v('piq', 70)),
        passVision: v('passvision', v('pvis', 70)),
        plm: Math.round((v('pacc', 70) + v('handl', 70) + v('pvis', 70)) / 3),
        intDef: v('intdef', v('idef', 70)),
        perDef: v('perdef', v('pdef', 70)),
        steal: v('steal', v('stl', 70)),
        blk: v('blk', 70),
        helpDefIq: v('helpdefiq', v('hdef', 70)),
        passPerc: v('passperc', v('pper', 70)),
        defConsist: v('defconsist', v('dcon', 70)),
        def: Math.round((v('idef', 70) + v('pdef', 70) + v('stl', 70) + v('blk', 70)) / 4),
        offReb: v('offreb', v('oreb', 70)),
        defReb: v('defreb', v('dreb', 70)),
        reb: Math.round((v('oreb', 70) + v('dreb', 70)) / 2),
        stats: INITIAL_STATS(),
        playoffStats: INITIAL_STATS()
    };
};

export const mapDatabaseScheduleToRuntimeGame = (rows: any[]): Game[] => {
    return rows.map(r => {
        if (r.home_team_id && r.away_team_id) {
             return {
                 id: r.id, homeTeamId: r.home_team_id, awayTeamId: r.away_team_id, date: r.game_date,
                 homeScore: r.home_score ?? undefined, awayScore: r.away_score ?? undefined,
                 played: !!r.played, isPlayoff: r.is_playoff || false, seriesId: r.series_id || undefined
             };
        }
        return {
            id: r.id || `g_${resolveTeamId(r.team)}_${resolveTeamId(r.opponent)}_${r.date}`,
            homeTeamId: resolveTeamId(r.site === '홈' ? r.team : r.opponent),
            awayTeamId: resolveTeamId(r.site === '홈' ? r.opponent : r.team),
            date: r.date, homeScore: r.tmscore || undefined, awayScore: r.oppscore || undefined,
            played: !!r.tmscore, isPlayoff: r.isplayoff || false, seriesId: r.seriesid || undefined
        };
    });
};

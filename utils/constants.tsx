
import { Player, SeasonStats, Game, Team } from '../types';

export const SEASON_START_DATE = '2025-10-22'; // 25-26 Season Start
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

// Robust Team Name Mapping (Handles English, Korean, City, Team Name, and Common Abbreviations)
const TEAM_NAME_MAP: Record<string, string> = {
  // Explicit Full Korean Names (from players.csv)
  '보스턴 셀틱스': 'bos',
  '브루클린 네츠': 'bkn',
  '뉴욕 닉스': 'nyk',
  '필라델피아 세븐티식서스': 'phi',
  '토론토 랩터스': 'tor',
  '시카고 불스': 'chi',
  '클리블랜드 캐벌리어스': 'cle',
  '디트로이트 피스톤즈': 'det',
  '인디애나 페이서스': 'ind',
  '밀워키 벅스': 'mil',
  '애틀랜타 호크스': 'atl',
  '샬럿 호네츠': 'cha',
  '마이애미 히트': 'mia',
  '올랜도 매직': 'orl',
  '워싱턴 위저즈': 'was',
  '덴버 너게츠': 'den',
  '미네소타 팀버울브스': 'min',
  '오클라호마시티 썬더': 'okc',
  '포틀랜드 트레일블레이저스': 'por',
  '유타 재즈': 'uta',
  '골든스테이트 워리어스': 'gsw',
  'la 클리퍼스': 'lac', '엘에이 클리퍼스': 'lac',
  'la 레이커스': 'lal', '엘에이 레이커스': 'lal',
  '피닉스 선즈': 'phx',
  '새크라멘토 킹스': 'sac',
  '댈러스 매버릭스': 'dal',
  '휴스턴 로케츠': 'hou',
  '멤피스 그리즐리스': 'mem',
  '뉴올리언스 펠리컨스': 'nop',
  '샌안토니오 스퍼스': 'sas',

  // Atlantic
  'boston': 'bos', 'celtics': 'bos', '보스턴': 'bos', '셀틱스': 'bos', 'bos': 'bos',
  'brooklyn': 'bkn', 'nets': 'bkn', '브루클린': 'bkn', '네츠': 'bkn', 'bkn': 'bkn', 'brk': 'bkn',
  'new york': 'nyk', 'knicks': 'nyk', 'ny': 'nyk', '뉴욕': 'nyk', '닉스': 'nyk', 'nyk': 'nyk',
  'philadelphia': 'phi', '76ers': 'phi', 'sixers': 'phi', '필라델피아': 'phi', '세븐티식서스': 'phi', 'phi': 'phi',
  'toronto': 'tor', 'raptors': 'tor', '토론토': 'tor', '랩터스': 'tor', 'tor': 'tor',
  // Central
  'chicago': 'chi', 'bulls': 'chi', '시카고': 'chi', '불스': 'chi', 'chi': 'chi',
  'cleveland': 'cle', 'cavaliers': 'cle', 'cavs': 'cle', '클리블랜드': 'cle', '캐벌리어스': 'cle', 'cle': 'cle',
  'detroit': 'det', 'pistons': 'det', '디트로이트': 'det', '피스톤즈': 'det', 'det': 'det',
  'indiana': 'ind', 'pacers': 'ind', '인디애나': 'ind', '페이서스': 'ind', 'ind': 'ind',
  'milwaukee': 'mil', 'bucks': 'mil', '밀워키': 'mil', '벅스': 'mil', 'mil': 'mil',
  // Southeast
  'atlanta': 'atl', 'hawks': 'atl', '애틀랜타': 'atl', '호크스': 'atl', 'atl': 'atl',
  'charlotte': 'cha', 'hornets': 'cha', '샬럿': 'cha', '호네츠': 'cha', 'cha': 'cha', 'cho': 'cha', 'charlote': 'cha',
  'miami': 'mia', 'heat': 'mia', '마이애미': 'mia', '히트': 'mia', 'mia': 'mia',
  'orlando': 'orl', 'magic': 'orl', '올랜도': 'orl', '매직': 'orl', 'orl': 'orl',
  'washington': 'was', 'wizards': 'was', '워싱턴': 'was', '위저즈': 'was', 'was': 'was',
  // Northwest
  'denver': 'den', 'nuggets': 'den', '덴버': 'den', '너게츠': 'den', '너겟츠': 'den', 'den': 'den',
  'minnesota': 'min', 'timberwolves': 'min', 'wolves': 'min', '미네소타': 'min', '팀버울브스': 'min', '팀버울브즈': 'min', 'min': 'min',
  'oklahoma city': 'okc', 'thunder': 'okc', 'okc': 'okc', '오클라호마시티': 'okc', '오클': 'okc', '썬더': 'okc',
  'portland': 'por', 'trail blazers': 'por', 'blazers': 'por', '포틀랜드': 'por', '트레일블레이저스': 'por', 'por': 'por',
  'utah': 'uta', 'jazz': 'uta', '유타': 'uta', '재즈': 'uta', 'uta': 'uta',
  // Pacific
  'golden state': 'gsw', 'warriors': 'gsw', 'gs': 'gsw', '골든스테이트': 'gsw', '워리어스': 'gsw', 'gsw': 'gsw',
  'la clippers': 'lac', 'clippers': 'lac', '클리퍼스': 'lac', 'lac': 'lac',
  'la lakers': 'lal', 'lakers': 'lal', '레이커스': 'lal', 'lal': 'lal',
  'phoenix': 'phx', 'suns': 'phx', '피닉스': 'phx', '선즈': 'phx', 'phx': 'phx', 'pho': 'phx', 'pheonix': 'phx', 'phonix': 'phx',
  'sacramento': 'sac', 'kings': 'sac', '새크라멘토': 'sac', '킹스': 'sac', 'sac': 'sac',
  // Southwest
  'dallas': 'dal', 'mavericks': 'dal', 'mavs': 'dal', '댈러스': 'dal', '매버릭스': 'dal', 'dal': 'dal',
  'houston': 'hou', 'rockets': 'hou', '휴스턴': 'hou', '로케츠': 'hou', 'hou': 'hou',
  'memphis': 'mem', 'grizzlies': 'mem', '멤피스': 'mem', '그리즐리스': 'mem', 'mem': 'mem',
  'new orleans': 'nop', 'pelicans': 'nop', 'pels': 'nop', '뉴올리언스': 'nop', '펠리컨스': 'nop', 'nop': 'nop', 'no': 'nop',
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
    
    // 1. Direct Match (O(1))
    if (TEAM_NAME_MAP[normalized]) return TEAM_NAME_MAP[normalized];

    // 2. Partial Match (Longest keys first)
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

export const parseCSVToObjects = (csv: string): any[] => {
    const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return [];
    let headersLine = lines[0];
    if (headersLine.charCodeAt(0) === 0xFEFF) headersLine = headersLine.slice(1);
    const headers = headersLine.split(',').map(h => h.trim().toLowerCase());
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        // Handle comma inside quotes (simple version) or split by comma
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
        return p[key] ?? p[key.toLowerCase()] ?? p[key.replace(/([A-Z])/g, "_$1").toLowerCase()] ?? def;
    };
    
    const threeAvg = (v('threec', v('3c')) + v('three45', v('3_45')) + v('threet', v('3t'))) / 3;

    const attr = {
        close: v('closeShot', v('close')),
        mid: v('midRange', v('mid')),
        threeAvg: threeAvg || v('threeAvg'),
        ft: v('ft'),
        shotIq: v('shotIq', v('siq')),
        offConsist: v('offConsist', v('ocon')),
        layup: v('layup', v('lay')),
        dunk: v('dunk', v('dnk')),
        post: v('postPlay', v('post')),
        drawFoul: v('drawFoul', v('draw')),
        hands: v('hands'),
        passAcc: v('passAcc', v('pacc')),
        handling: v('handling', v('handl')),
        spdBall: v('spdBall', v('spwb')),
        passVision: v('passVision', v('pvis')),
        passIq: v('passIq', v('piq')),
        stamina: v('stamina', v('sta')),
        intDef: v('intDef', v('idef')),
        perDef: v('perDef', v('pdef')),
        steal: v('steal', v('stl')),
        blk: v('blk'),
        helpDefIq: v('helpDefIq', v('hdef')),
        passPerc: v('passPerc', v('pper')),
        defConsist: v('defConsist', v('dcon')),
        offReb: v('offReb', v('oreb')),
        defReb: v('defReb', v('dreb')),
        potential: v('potential', v('pot')),
        intangibles: v('intangibles', 70),
        height: v('height', 200),
        strength: v('strength', v('str')),
        vertical: v('vertical', v('vert')),
        durability: v('durability', v('dur')),
        agility: v('agility', v('agi')),
        hustle: v('hustle', v('hus')),
        speed: v('speed', v('spd')),
    };

    const calc = (weights: {val: number, w: number}[]) => {
        let totalVal = 0;
        let totalWeight = 0;
        weights.forEach(item => {
            totalVal += (item.val ?? 0) * item.w;
            totalWeight += item.w;
        });
        return Math.min(99, Math.max(40, Math.round(totalWeight > 0 ? totalVal / totalWeight : 50)));
    };

    if (position.includes('PG')) {
        return calc([{ val: attr.close, w: 10 }, { val: attr.mid, w: 20 }, { val: attr.threeAvg, w: 25 }, { val: attr.ft, w: 10 }, { val: attr.shotIq, w: 45 }, { val: attr.offConsist, w: 25 }, { val: attr.layup, w: 25 }, { val: attr.hands, w: 40 }, { val: attr.stamina, w: 15 }, { val: attr.passAcc, w: 25 }, { val: attr.handling, w: 15 }, { val: attr.spdBall, w: 10 }, { val: attr.passVision, w: 25 }, { val: attr.passIq, w: 50 }, { val: attr.intangibles, w: 5 }, { val: attr.potential, w: 500 }]);
    } else if (position.includes('SG')) {
        return calc([
            { val: attr.close, w: 300 }, { val: attr.mid, w: 100 }, { val: attr.threeAvg, w: 150 }, { val: attr.ft, w: 100 }, { val: attr.shotIq, w: 500 }, { val: attr.offConsist, w: 500 }, { val: attr.layup, w: 200 }, { val: attr.dunk, w: 150 }, { val: attr.post, w: 0 }, { val: attr.drawFoul, w: 50 }, { val: attr.hands, w: 250 }, { val: attr.intDef, w: 0 }, { val: attr.perDef, w: 0 }, { val: attr.steal, w: 0 }, { val: attr.blk, w: 0 }, { val: attr.helpDefIq, w: 0 }, { val: attr.passPerc, w: 0 }, { val: attr.defConsist, w: 5 }, { val: attr.offReb, w: 0 }, { val: attr.defReb, w: 0 }, { val: attr.speed, w: 0 }, { val: attr.agility, w: 0 }, { val: attr.strength, w: 0 }, { val: attr.vertical, w: 0 }, { val: attr.stamina, w: 0 }, { val: attr.hustle, w: 0 }, { val: attr.durability, w: 0 }, { val: attr.passAcc, w: 0 }, { val: attr.handling, w: 0 }, { val: attr.spdBall, w: 0 }, { val: attr.passVision, w: 0 }, { val: attr.passIq, w: 0 }, { val: attr.intangibles, w: 50 }, { val: attr.potential, w: 500 }, { val: attr.height, w: 30 }
        ]);
    } else if (position.includes('SF')) {
        return calc([
            { val: attr.close, w: 300 }, { val: attr.mid, w: 150 }, { val: attr.threeAvg, w: 50 }, { val: attr.ft, w: 150 }, { val: attr.shotIq, w: 300 }, { val: attr.offConsist, w: 500 }, { val: attr.layup, w: 500 }, { val: attr.dunk, w: 100 }, { val: attr.post, w: 0 }, { val: attr.drawFoul, w: 150 }, { val: attr.hands, w: 250 }, { val: attr.intDef, w: 200 }, { val: attr.perDef, w: 200 }, { val: attr.steal, w: 10 }, { val: attr.blk, w: 0 }, { val: attr.helpDefIq, w: 10 }, { val: attr.passPerc, w: 10 }, { val: attr.defConsist, w: 0 }, { val: attr.speed, w: 0 }, { val: attr.agility, w: 100 }, { val: attr.strength, w: 0 }, { val: attr.vertical, w: 100 }, { val: attr.stamina, w: 200 }, { val: attr.hustle, w: 200 }, { val: attr.durability, w: 0 }, { val: attr.passAcc, w: 0 }, { val: attr.handling, w: 0 }, { val: attr.spdBall, w: 0 }, { val: attr.passVision, w: 0 }, { val: attr.passIq, w: 0 }, { val: attr.offReb, w: 0 }, { val: attr.defReb, w: 0 }, { val: attr.intangibles, w: 5 }, { val: attr.potential, w: 500 }, { val: attr.height, w: 100 }
        ]);
    } else if (position.includes('PF')) {
        return calc([{ val: attr.close, w: 250 }, { val: attr.mid, w: 60 }, { val: attr.threeAvg, w: 40 }, { val: attr.ft, w: 30 }, { val: attr.shotIq, w: 100 }, { val: attr.layup, w: 240 }, { val: attr.dunk, w: 120 }, { val: attr.post, w: 120 }, { val: attr.hands, w: 100 }, { val: attr.intDef, w: 140 }, { val: attr.defConsist, w: 100 }, { val: attr.offReb, w: 150 }, { val: attr.defReb, w: 150 }, { val: attr.strength, w: 120 }, { val: attr.vertical, w: 120 }, { val: attr.stamina, w: 100 }, { val: attr.durability, w: 100 }, { val: attr.intangibles, w: 7 }, { val: attr.potential, w: 500 }, { val: attr.height, w: 150 }]);
    } else if (position.includes('C')) {
        return calc([
            { val: attr.close, w: 300 }, { val: attr.mid, w: 0 }, { val: attr.threeAvg, w: 0 }, { val: attr.ft, w: 0 }, { val: attr.shotIq, w: 200 }, { val: attr.offConsist, w: 0 }, { val: attr.layup, w: 0 }, { val: attr.dunk, w: 0 }, { val: attr.post, w: 200 }, { val: attr.drawFoul, w: 250 }, { val: attr.hands, w: 200 }, { val: attr.intDef, w: 250 }, { val: attr.perDef, w: 0 }, { val: attr.steal, w: 0 }, { val: attr.blk, w: 100 }, { val: attr.helpDefIq, w: 0 }, { val: attr.passPerc, w: 0 }, { val: attr.defConsist, w: 200 }, { val: attr.offReb, w: 100 }, { val: attr.defReb, w: 100 }, { val: attr.speed, w: 0 }, { val: attr.agility, w: 0 }, { val: attr.strength, w: 150 }, { val: attr.vertical, w: 0 }, { val: attr.stamina, w: 150 }, { val: attr.hustle, w: 0 }, { val: attr.durability, w: 150 }, { val: attr.passAcc, w: 100 }, { val: attr.handling, w: 200 }, { val: attr.spdBall, w: 0 }, { val: attr.passVision, w: 0 }, { val: attr.passIq, w: 100 }, { val: attr.intangibles, w: 15 }, { val: attr.potential, w: 500 }, { val: attr.height, w: 180 }
        ]);
    }
    return 70;
};

export const mapDatabasePlayerToRuntimePlayer = (p: any, teamId: string): Player => {
    // Helper to get value case-insensitively
    const v = (key: string, def: any = 70) => {
        return p[key] ?? p[key.toLowerCase()] ?? p[key.replace(/([A-Z])/g, "_$1").toLowerCase()] ?? def;
    };

    const name = v('name', v('full_name', v('Name', "Unknown Player")));
    const norm = normalizeName(name);
    const injury = KNOWN_INJURIES[norm];
    const ovr = calculatePlayerOvr(p);
    
    return {
        id: p.id || `p_${norm}_${teamId}_${Date.now()}`,
        name,
        position: v('position', 'G'),
        age: v('age', 25),
        height: v('height', 200),
        weight: v('weight', 100),
        salary: v('salary', 1.0),
        contractYears: v('contract_years', v('contractyears', v('contractYears', 1))),
        health: injury ? 'Injured' : 'Healthy',
        injuryType: injury?.type,
        returnDate: injury?.returnDate,
        condition: 100,
        ovr,
        potential: v('potential', v('pot', ovr + 5)),
        revealedPotential: v('potential', v('pot', ovr + 5)),
        intangibles: v('intangibles', 75),
        speed: v('speed', v('spd')),
        agility: v('agility', v('agi')),
        strength: v('strength', v('str')),
        vertical: v('vertical', v('vert')),
        stamina: v('stamina', v('sta')),
        hustle: v('hustle', v('hus')),
        durability: v('durability', v('dur')),
        ath: Math.round(((v('spd') + v('agi') + v('str') + v('vert')) || 280) / 4),
        closeShot: v('closeShot', v('close')),
        midRange: v('midRange', v('mid')),
        threeCorner: v('threeCorner', v('threec', v('3c'))),
        three45: v('three45', v('3_45')),
        threeTop: v('threeTop', v('threet', v('3t'))),
        ft: v('ft'),
        shotIq: v('shotIq', v('siq')),
        offConsist: v('offConsist', v('ocon')),
        out: Math.round((v('close', 70) + v('mid', 70) + v('threec', 70)) / 3),
        layup: v('layup', v('lay')),
        dunk: v('dunk', v('dnk')),
        postPlay: v('postPlay', v('post')),
        drawFoul: v('drawFoul', v('draw')),
        hands: v('hands'),
        ins: Math.round((v('lay', 70) + v('dnk', 70) + v('post', 70)) / 3),
        passAcc: v('passAcc', v('pacc')),
        handling: v('handling', v('handl')),
        spdBall: v('spdBall', v('spwb')),
        passIq: v('passIq', v('piq')),
        passVision: v('passVision', v('pvis')),
        plm: Math.round((v('pacc', 70) + v('handl', 70) + v('pvis', 70)) / 3),
        intDef: v('intDef', v('idef')),
        perDef: v('perDef', v('pdef')),
        steal: v('steal', v('stl')),
        blk: v('blk'),
        helpDefIq: v('helpDefIq', v('hdef')),
        passPerc: v('passPerc', v('pper')),
        defConsist: v('defConsist', v('dcon')),
        def: Math.round((v('idef', 70) + v('pdef', 70) + v('stl', 70) + v('blk', 70)) / 4),
        offReb: v('offReb', v('oreb')),
        defReb: v('defReb', v('dreb')),
        reb: Math.round((v('oreb', 70) + v('dreb', 70)) / 2),
        stats: INITIAL_STATS(),
        playoffStats: INITIAL_STATS()
    };
};

export const mapDatabaseScheduleToRuntimeGame = (rows: any[]): Game[] => {
    return rows.map(r => {
        let dateStr = r.date;
        if (dateStr && dateStr.includes(' ')) {
            try {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                    dateStr = d.toISOString().split('T')[0];
                }
            } catch(e) {}
        }

        const site = r.site;
        const homeName = site === '홈' ? r.team : r.opponent;
        const awayName = site === '홈' ? r.opponent : r.team;

        // Use robust resolver for Schedule too
        const homeTeamId = resolveTeamId(homeName);
        const awayTeamId = resolveTeamId(awayName);

        return {
            id: r.id || `g_${homeTeamId}_${awayTeamId}_${dateStr}`,
            homeTeamId,
            awayTeamId,
            date: dateStr,
            homeScore: r.tmscore || undefined,
            awayScore: r.oppscore || undefined,
            played: !!(r.tmscore),
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

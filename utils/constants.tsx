
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

// Normalize Name: Remove dots, spaces, hyphens, and lowercase for robust matching
export const normalizeName = (name: string): string => {
    if (!name) return "";
    return name
        .replace(/[\s\.\,\-\u3000\u00a0\u200b]+/g, '') // Remove all spaces and punctuation
        .replace(/(II|III|IV|Jr|Sr)$/i, '') // Remove suffixes
        .toLowerCase()
        .trim();
};

const SORTED_KEYS = Object.keys(INITIAL_TEAMS_DATA).sort((a: any, b: any) => b.length - a.length);

export const resolveTeamId = (input: string): string => {
    if (!input) return 'unknown';
    const normalized = input.toLowerCase().trim();
    const found = INITIAL_TEAMS_DATA.find(t => 
      t.name.toLowerCase() === normalized || 
      t.city.toLowerCase() === normalized || 
      (t.city + ' ' + t.name).toLowerCase() === normalized
    );
    return found ? found.id : 'unknown';
};

// [Critical] Known Injuries Database
// Keys must be fully normalized (lowercase, no spaces)
// Date Format: YYYY-MM-DD
export const KNOWN_INJURIES: Record<string, { type: string, returnDate: string }> = {
  // Boston
  "jaysontatum": { type: "ACL (Season Out)", returnDate: "2026-07-01" },
  
  // Pacers
  "tyresehaliburton": { type: "ACL (Season Out)", returnDate: "2026-07-01" },
  
  // Bucks
  "taureanprince": { type: "Neck Surgery", returnDate: "2026-06-15" },
  
  // Portland
  "scoothenderson": { type: "Hamstring Strain", returnDate: "2025-11-05" },
  
  // Warriors
  "sethcurry": { type: "Lower Back", returnDate: "2025-12-01" },
  
  // Clippers
  "bradleybeal": { type: "Left Hip (Season Out)", returnDate: "2026-06-01" },
  
  // Mavs
  "kyrieirving": { type: "Knee Surgery", returnDate: "2026-07-01" },
  "derecklively": { type: "Right Foot Surgery", returnDate: "2026-02-15" },
  
  // Grizzlies
  "zachedey": { type: "Ankle Sprain", returnDate: "2026-02-01" },
  "scottypippen": { type: "Left Toe Fracture", returnDate: "2026-04-01" },
  "brandonclarke": { type: "Ankle Injury", returnDate: "2026-03-01" },
  "tyjerome": { type: "Calf Strain", returnDate: "2026-03-15" },
  
  // Pelicans
  "dejountemurray": { type: "Achilles Soreness", returnDate: "2026-01-15" }
};

export const calculatePlayerOvr = (p: any, overridePosition?: string): number => {
    const position = overridePosition || p.position || p.Position || 'PG';
    
    let posKey: PositionType = 'PG';
    if (position.includes('SG')) posKey = 'SG';
    else if (position.includes('SF')) posKey = 'SF';
    else if (position.includes('PF')) posKey = 'PF';
    else if (position.includes('C')) posKey = 'C';
    
    const weights = POSITION_WEIGHTS[posKey];

    const v = (key: string, altKey?: string) => {
        if (p[key] !== undefined) return Number(p[key]);
        if (altKey && p[altKey] !== undefined) return Number(p[altKey]);
        return 50; 
    };

    const threeAvg = (v('threeCorner') + v('three45') + v('threeTop')) / 3;

    const attr: Record<string, number> = {
        closeShot: v('closeShot'), midRange: v('midRange'), threeAvg: threeAvg, ft: v('ft'),
        shotIq: v('shotIq'), offConsist: v('offConsist'), layup: v('layup'), dunk: v('dunk'),
        postPlay: v('postPlay'), drawFoul: v('drawFoul'), hands: v('hands'), passAcc: v('passAcc'),
        handling: v('handling'), spdBall: v('spdBall'), passVision: v('passVision'), passIq: v('passIq'),
        stamina: v('stamina'), intDef: v('intDef'), perDef: v('perDef'), steal: v('steal'),
        blk: v('blk'), helpDefIq: v('helpDefIq'), passPerc: v('passPerc'), defConsist: v('defConsist'),
        offReb: v('offReb'), defReb: v('defReb'), potential: v('potential'), intangibles: v('intangibles'),
        height: v('height', '200'), strength: v('strength'), vertical: v('vertical'),
        durability: v('durability'), agility: v('agility'), hustle: v('hustle'), speed: v('speed'),
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

export const mapDatabasePlayerToRuntimePlayer = (p: any, teamId: string): Player => {
    const a = p.base_attributes || {};
    const getVal = (shortKey: string, longKey: string) => {
        return Number(a[shortKey] ?? a[longKey] ?? a[shortKey.toLowerCase()] ?? a[longKey.toLowerCase()] ?? 50);
    };

    const name = p.name || "Unknown Player";
    
    // [Fix] Injury Override Logic
    // 1. Check normalized name against KNOWN_INJURIES
    // 2. If match found, FORCE 'Injured' status regardless of DB value
    const norm = normalizeName(name);
    const knownInjury = KNOWN_INJURIES[norm];
    
    // Default from DB (usually 'Healthy' or previously saved state)
    let health: 'Healthy' | 'Injured' | 'Day-to-Day' = (p.health as any) || 'Healthy';
    let injuryType = p.injuryType;
    let returnDate = p.returnDate;

    // Apply Override if known injury exists
    if (knownInjury) {
        health = 'Injured';
        injuryType = knownInjury.type;
        returnDate = knownInjury.returnDate;
    }

    // Stats Mapping
    const closeShot = getVal('CLOSE', 'closeShot');
    const midRange = getVal('MID', 'midRange');
    const threeCorner = getVal('3C', 'threeCorner');
    const three45 = getVal('3_45', 'three45');
    const threeTop = getVal('3T', 'threeTop');
    const ft = getVal('FT', 'ft');
    const shotIq = getVal('SIQ', 'shotIq');
    const offConsist = getVal('OCON', 'offConsist');
    const layup = getVal('LAY', 'layup');
    const dunk = getVal('DNK', 'dunk');
    const postPlay = getVal('POST', 'postPlay');
    const drawFoul = getVal('DRAW', 'drawFoul');
    const hands = getVal('HANDS', 'hands');
    const passAcc = getVal('PACC', 'passAcc');
    const handling = getVal('HANDL', 'handling');
    const spdBall = getVal('SPWB', 'spdBall');
    const passVision = getVal('PVIS', 'passVision');
    const passIq = getVal('PIQ', 'passIq');
    const intDef = getVal('IDEF', 'intDef');
    const perDef = getVal('PDEF', 'perDef');
    const steal = getVal('STL', 'steal');
    const blk = getVal('BLK', 'blk');
    const helpDefIq = getVal('HDEF', 'helpDefIq');
    const passPerc = getVal('PPER', 'passPerc');
    const defConsist = getVal('DCON', 'defConsist');
    const offReb = getVal('OREB', 'offReb');
    const defReb = getVal('DREB', 'defReb');
    const speed = getVal('SPD', 'speed');
    const agility = getVal('AGI', 'agility');
    const strength = getVal('STR', 'strength');
    const vertical = getVal('VERT', 'vertical');
    const stamina = getVal('STA', 'stamina');
    const hustle = getVal('HUS', 'hustle');
    const durability = getVal('DUR', 'durability');
    const intangibles = getVal('INTANGIBLES', 'intangibles');
    const potential = getVal('POT', 'potential');

    const threeAvg = (threeCorner + three45 + threeTop) / 3;
    const ins = Math.round((layup + dunk + postPlay) / 3);
    const out = Math.round((closeShot + midRange + threeAvg) / 3);
    const plm = Math.round((passAcc + handling + passVision) / 3);
    const def = Math.round((intDef + perDef + steal + blk) / 4);
    const reb = Math.round((offReb + defReb) / 2);
    const ath = Math.round((speed + agility + strength + vertical) / 4);

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
        
        health,
        injuryType,
        returnDate,
        
        condition: 100,
        ovr,
        potential: potential || (ovr + 5),
        revealedPotential: potential || (ovr + 5),
        intangibles,
        
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

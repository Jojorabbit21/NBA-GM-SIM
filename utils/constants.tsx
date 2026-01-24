
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
    
    // 3점슛 평균 계산 보강 (DB 필드 또는 세부 필드 참조)
    let threeAvg = 70;
    if (p.threeAvg !== undefined) {
        threeAvg = p.threeAvg;
    } else {
        const tC = p.threeCorner ?? p.p3m ?? 70;
        const t45 = p.three45 ?? p.p3a ?? 70;
        const tTop = p.threeTop ?? 70;
        threeAvg = (tC + t45 + tTop) / 3;
    }
    
    const heightCm = p.height || 200;

    const calc = (weights: {val: number, w: number}[]) => {
        let totalVal = 0;
        let totalWeight = 0;
        weights.forEach(item => {
            const value = item.val ?? 0;
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
            { val: p.closeShot, w: 250 }, { val: p.midRange, w: 60 }, { val: threeAvg, w: 40 }, { val: p.ft, w: 30 }, { val: p.shotIq, w: 100 }, { val: p.offConsist, w: 0 },
            { val: p.layup, w: 240 }, { val: p.dunk, w: 120 }, { val: p.postPlay, w: 120 }, { val: p.drawFoul, w: 50 }, { val: p.hands, w: 100 },
            { val: p.intDef, w: 140 }, { val: p.perDef, w: 50 }, { val: p.steal, w: 0 }, { val: p.blk, w: 0 }, { val: p.helpDefIq, w: 0 }, { val: p.passPerc, w: 0 }, { val: p.defConsist, w: 100 },
            { val: p.offReb, w: 150 }, { val: p.defReb, w: 150 },
            { val: p.speed, w: 60 }, { val: p.agility, w: 60 }, { val: p.strength, w: 120 }, { val: p.vertical, w: 120 }, { val: p.stamina, w: 100 }, { val: p.hustle, w: 40 }, { val: p.durability, w: 100 },
            { val: p.passAcc, w: 30 }, { val: p.handling, w: 20 }, { val: p.spdBall, w: 0 }, { val: p.passVision, w: 40 }, { val: p.passIq, w: 40 },
            { val: p.intangibles, w: 7 }, { val: p.potential, w: 500 }, { val: heightCm, w: 150 }
        ]);
    } else if (position.includes('C')) {
        return calc([
            { val: p.closeShot, w: 250 }, { val: p.midRange, w: 140 }, { val: threeAvg, w: 100 }, { val: p.ft, w: 100 }, { val: p.shotIq, w: 100 }, { val: p.offConsist, w: 200 },
            { val: p.layup, w: 200 }, { val: p.dunk, w: 250 }, { val: p.postPlay, w: 250 }, { val: p.drawFoul, w: 80 }, { val: p.hands, w: 200 },
            { val: p.intDef, w: 200 }, { val: p.perDef, w: 0 }, { val: p.steal, w: 0 }, { val: p.blk, w: 200 }, { val: p.helpDefIq, w: 0 }, { val: p.passPerc, w: 0 }, { val: p.defConsist, w: 100 },
            { val: p.offReb, w: 140 }, { val: p.defReb, w: 200 },
            { val: p.speed, w: 0 }, { val: p.agility, w: 0 }, { val: p.strength, w: 50 }, { val: p.vertical, w: 120 }, { val: p.stamina, w: 100 }, { val: p.hustle, w: 0 }, { val: p.durability, w: 100 },
            { val: p.passAcc, w: 60 }, { val: p.handling, w: 0 }, { val: p.spdBall, w: 0 }, { val: p.passVision, w: 30 }, { val: p.passIq, w: 80 },
            { val: p.intangibles, w: 6 }, { val: p.potential, w: 500 }, { val: heightCm, w: 180 }
        ]);
    }
    return 70;
};

/**
 * DB에서 불러온 선수 데이터를 런타임용 Player 객체로 변환하며 OVR을 재계산합니다.
 */
export const mapDatabasePlayerToRuntimePlayer = (p: any, teamId: string): Player => {
    const stats = INITIAL_STATS();
    const ovr = calculatePlayerOvr(p); // 런타임 최신 공식 적용
    const norm = normalizeName(p.name || "");
    const injury = KNOWN_INJURIES[norm];
    
    return {
        id: p.id || `p_${norm}_${teamId}_${Date.now()}`,
        name: p.name || "Unknown Player",
        position: p.position || 'G',
        age: p.age || 25,
        height: p.height || 200,
        weight: p.weight || 100,
        salary: p.salary || 1.0,
        contractYears: p.contractYears || 1,
        health: injury ? 'Injured' : 'Healthy',
        injuryType: injury?.type,
        returnDate: injury?.returnDate,
        condition: 100,
        ovr,
        potential: p.potential || ovr + 5,
        revealedPotential: p.potential || ovr + 5,
        intangibles: p.intangibles || 75,
        
        speed: p.speed || 70, agility: p.agility || 70, strength: p.strength || 70, vertical: p.vertical || 70,
        stamina: p.stamina || 70, hustle: p.hustle || 70, durability: p.durability || 70, ath: p.ath || 70,
        
        closeShot: p.closeShot || 70, midRange: p.midRange || 70, threeCorner: p.threeCorner || 70,
        three45: p.three45 || 70, threeTop: p.threeTop || 70, ft: p.ft || 70, shotIq: p.shotIq || 70,
        offConsist: p.offConsist || 70, out: p.out || 70,
        
        layup: p.layup || 70, dunk: p.dunk || 70, postPlay: p.postPlay || 70, drawFoul: p.drawFoul || 70,
        hands: p.hands || 70, ins: p.ins || 70,
        
        passAcc: p.passAcc || 70, handling: p.handling || 70, spdBall: p.spdBall || 70,
        passIq: p.passIq || 70, passVision: p.passVision || 70, plm: p.plm || 70,
        
        intDef: p.intDef || 70, perDef: p.perDef || 70, steal: p.steal || 70, blk: p.blk || 70,
        helpDefIq: p.helpDefIq || 70, passPerc: p.passPerc || 70, defConsist: p.defConsist || 70, def: p.def || 70,
        
        offReb: p.offReb || 70, defReb: p.defReb || 70, reb: p.reb || 70,
        
        stats,
        playoffStats: INITIAL_STATS()
    };
};

/**
 * DB에서 불러온 일정 데이터를 런타임용 Game 객체로 변환합니다.
 */
export const mapDatabaseScheduleToRuntimeGame = (rows: any[]): Game[] => {
    return rows.map(r => ({
        id: r.id || `g_${r.home_team_id || r.homeTeamId}_${r.away_team_id || r.awayTeamId}_${r.date}`,
        homeTeamId: r.home_team_id || r.homeTeamId,
        awayTeamId: r.away_team_id || r.awayTeamId,
        date: r.date,
        homeScore: r.home_score || r.homeScore,
        awayScore: r.away_score || r.awayScore,
        played: r.played === true || r.played === 'true' || !!(r.home_score || r.homeScore),
        isPlayoff: r.is_playoff || r.isPlayoff || false,
        seriesId: r.series_id || r.seriesId,
        boxScore: r.box_score || r.boxScore
    }));
};

/**
 * 기본 시즌 일정을 생성합니다. (DB에 없을 경우)
 */
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
    games.push({
      id: `game_${i}_${myTeamId}`,
      homeTeamId: isHome ? myTeamId : opponentId,
      awayTeamId: isHome ? opponentId : myTeamId,
      date: gameDate.toISOString().split('T')[0],
      played: false
    });
  }
  return games;
};

/**
 * 시즌 일정을 CSV로 내보냅니다.
 */
export const exportScheduleToCSV = (games: Game[]) => {
  const headers = "id,homeTeamId,awayTeamId,date,homeScore,awayScore,played,isPlayoff,seriesId\n";
  const rows = games.map(g => 
    `${g.id},${g.homeTeamId},${g.awayTeamId},${g.date},${g.homeScore || ''},${g.awayScore || ''},${g.played},${g.isPlayoff || false},${g.seriesId || ''}`
  ).join('\n');
  
  const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "nba_schedule_2026.csv");
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

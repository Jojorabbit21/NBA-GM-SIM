
import { Player, SeasonStats, Game, Team } from './types';

export const SEASON_START_DATE = '2025-10-21';
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

export function parseRostersCSV(csv: string): Record<string, Player[]> {
  const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
  const rosterMap: Record<string, Player[]> = {};

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 45) continue; 

    const teamFull = values[0];
    const teamData = INITIAL_TEAMS_DATA.find(t => `${t.city} ${t.name}` === teamFull || t.name === teamFull);
    const teamKey = teamData?.id || 'unknown';
    const playerName = values[1];
    const position = values[2] as string;
    const age = parseInt(values[3]) || 20;
    
    let health = values[8] as 'Healthy' | 'Injured' | 'Day-to-Day' || 'Healthy';
    let injuryType = undefined;
    let returnDate = undefined;

    if (KNOWN_INJURIES[playerName]) {
        health = 'Injured';
        injuryType = KNOWN_INJURIES[playerName].type;
        returnDate = KNOWN_INJURIES[playerName].returnDate;
    }

    const avg = (nums: number[]) => Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);

    const potential = parseInt(values[9]) || 70;
    const intangibles = parseInt(values[10]) || 50;

    const speed = parseInt(values[11]) || 50;
    const agility = parseInt(values[12]) || 50;
    const strength = parseInt(values[13]) || 50;
    const vertical = parseInt(values[14]) || 50;
    const stamina = parseInt(values[15]) || 50;
    const hustle = parseInt(values[16]) || 50;
    const durability = parseInt(values[17]) || 50;
    
    // [ATH] 운동능력 (Athleticism)
    const ath = avg([speed, agility, strength, vertical, stamina, hustle, durability]);

    const closeShot = parseInt(values[18]) || 50;
    const midRange = parseInt(values[19]) || 50;
    const threeCorner = parseInt(values[20]) || 50;
    const three45 = parseInt(values[21]) || 50;
    const threeTop = parseInt(values[22]) || 50;
    const ft = parseInt(values[23]) || 50;
    const shotIq = parseInt(values[24]) || 50;
    const offConsist = parseInt(values[25]) || 50;

    // [OUT] 외곽 공격력 (Outside Scoring)
    const out = avg([closeShot, midRange, threeCorner, three45, threeTop, ft, shotIq, offConsist]);

    const layup = parseInt(values[26]) || 50;
    const dunk = parseInt(values[27]) || 50;
    const postPlay = parseInt(values[28]) || 50;
    const drawFoul = parseInt(values[29]) || 50;
    const hands = parseInt(values[30]) || 50;

    // [INS] 인사이드 공격력 (Inside Scoring)
    const ins = avg([layup, dunk, postPlay, drawFoul, hands]);

    const passAcc = parseInt(values[31]) || 50;
    const handling = parseInt(values[32]) || 50;
    const spdBall = parseInt(values[33]) || 50;
    const passIq = parseInt(values[34]) || 50;
    const passVision = parseInt(values[35]) || 50;

    // [PLM] 플레이메이킹 (Playmaking)
    const plm = avg([passAcc, handling, spdBall, passIq, passVision]);

    const intDef = parseInt(values[36]) || 50;
    const perDef = parseInt(values[37]) || 50;
    const lockdown = parseInt(values[38]) || 50;
    const steal = parseInt(values[39]) || 50;
    const block = parseInt(values[40]) || 50;
    const helpDefIq = parseInt(values[41]) || 50;
    const passPerc = parseInt(values[42]) || 50;
    const defConsist = parseInt(values[43]) || 50;

    // [DEF] 수비력 (Defense)
    const def = avg([intDef, perDef, lockdown, steal, block, helpDefIq, passPerc, defConsist]);

    const offReb = parseInt(values[44]) || 50;
    const defReb = (values[45] && values[45] !== '') ? parseInt(values[45]) : (offReb + 15);

    // [REB] 리바운드 (Rebounding)
    const reb = avg([offReb, defReb]);

    let ovrRaw = 0;
    const heightCm = parseInt(values[4]) || 200;

    // [New OVR Calculation 2.1 - Adjusted for 2K Scale]
    // Including 'weak' stats with low weights to pull down OVR for specialists (e.g., non-shooting bigs).
    // This prevents players with 99 Dunk/Reb but 25 Shooting from being 95+ OVR.
    
    const threeAvg = (threeCorner + three45 + threeTop) / 3;
    const calcNewOvr = (weights: {val: number, w: number}[]) => {
        let totalVal = 0;
        let totalWeight = 0;
        weights.forEach(item => {
            totalVal += item.val * item.w;
            totalWeight += item.w;
        });
        const rawAvg = totalWeight > 0 ? totalVal / totalWeight : 50;
        // No artificial boost curve. Pure weighted average matches 2K scale better for "flawed" players.
        return Math.min(99, Math.max(40, Math.round(rawAvg)));
    };

    if (position.includes('PG')) {
        ovrRaw = calcNewOvr([
            // OUT
            { val: closeShot, w: 8 },
            { val: midRange, w: 3 },
            { val: threeAvg, w: 7 },
            { val: ft, w: 5 },
            { val: shotIq, w: 5 },
            { val: offConsist, w: 5 },
            // INS
            { val: layup, w: 2 },
            { val: dunk, w: 0 },
            { val: postPlay, w: 1 },
            { val: drawFoul, w: 5 },
            { val: hands, w: 2 },
            // DEF
            { val: intDef, w: 0 },
            { val: perDef, w: 5 }, 
            { val: steal, w: 0 },
            { val: block, w: 0 },
            { val: helpDefIq, w: 3 }, // Weakness inclusion
            { val: passPerc, w: 0 },
            { val: defConsist, w: 1 },
            // REB
            { val: offReb, w: 2 },
            { val: defReb, w: 0 },
            // ATH
            { val: speed, w: 0 }, 
            { val: agility, w: 3 }, // Weakness inclusion
            { val: strength, w: 0 },
            { val: vertical, w: 0 },
            { val: stamina, w: 5 },
            { val: hustle, w: 0 },
            { val: durability, w: 3 },
            // PLM
            { val: passAcc, w: 10 }, 
            { val: handling, w: 7 }, 
            { val: spdBall, w: 7 },
            { val: passVision, w: 7 }, 
            { val: passIq, w: 10 },
            // POT&INT&HGT
            { val: intangibles, w: 10 },
            { val: potential, w: 18 }
            //{ val: heightCm, w: 2 }
        ]);
    } else if (position.includes('SG')) {
        ovrRaw = calcNewOvr([            
            // OUT
            { val: closeShot, w: 5 },
            { val: midRange, w: 8 },
            { val: threeAvg, w: 10 },
            { val: ft, w: 5 },
            { val: shotIq, w: 6 },
            { val: offConsist, w: 7 },
            // INS
            { val: layup, w: 2 },
            { val: dunk, w: 0 },
            { val: postPlay, w: 0 },
            { val: drawFoul, w: 6 },
            { val: hands, w: 1 },
            // DEF
            { val: intDef, w: 0 },
            { val: perDef, w: 5 }, 
            { val: steal, w: 0 },
            { val: block, w: 0 },
            { val: helpDefIq, w: 5 }, // Weakness inclusion
            { val: passPerc, w: 0 },
            { val: defConsist, w: 0 },
            // REB
            { val: offReb, w: 3 },
            { val: defReb, w: 1 },
            // ATH
            { val: speed, w: 8 }, 
            { val: agility, w: 2 }, // Weakness inclusion
            { val: strength, w: 1 },
            { val: vertical, w: 1 },
            { val: stamina, w: 2 },
            { val: hustle, w: 2 },
            { val: durability, w: 1 },
            // PLM
            { val: passAcc, w: 7 }, 
            { val: handling, w: 2 }, 
            { val: spdBall, w: 1 },
            { val: passVision, w: 2 }, 
            { val: passIq, w: 2 },
            // POT&INT&HGT
            { val: intangibles, w: 14 },
            { val: potential, w: 14 },
            { val: heightCm, w: 4 }
        ]);
    } else if (position.includes('SF')) {
        ovrRaw = calcNewOvr([
            // OUT
            { val: closeShot, w: 4 },
            { val: midRange, w: 2 },
            { val: threeAvg, w: 2 },
            { val: ft, w: 2 },
            { val: shotIq, w: 2 },
            { val: offConsist, w: 5 },
            // INS
            { val: layup, w: 4 },
            { val: dunk, w: 1 },
            { val: postPlay, w: 0 },
            { val: drawFoul, w: 3 },
            { val: hands, w: 3},
            // DEF
            { val: intDef, w: 4 },
            { val: perDef, w: 4 }, 
            { val: steal, w: 2 },
            { val: block, w: 2 },
            { val: helpDefIq, w: 4 }, // Weakness inclusion
            { val: passPerc, w: 3 },
            { val: defConsist, w: 3 },
            // REB
            { val: offReb, w: 3 },
            { val: defReb, w: 3 },
            // ATH
            { val: speed, w: 3 }, 
            { val: agility, w: 3 }, // Weakness inclusion
            { val: strength, w: 1 },
            { val: vertical, w: 2 },
            { val: stamina, w: 3 },
            { val: hustle, w: 3 },
            { val: durability, w: 3 },
            // PLM
            { val: passAcc, w: 1 }, 
            { val: handling, w: 1 }, 
            { val: spdBall, w: 1 },
            { val: passVision, w: 1 }, 
            { val: passIq, w: 3 },
            // POT&INT&HGT
            { val: intangibles, w: 10 },
            { val: potential, w: 15 },
            { val: heightCm, w: 6 }
        ]);
    } else if (position.includes('PF')) {
        ovrRaw = calcNewOvr([
            // OUT
            { val: closeShot, w: 5 },
            { val: midRange, w: 1 },
            { val: threeAvg, w: 1 },
            { val: ft, w: 4 },
            { val: shotIq, w: 1 },
            { val: offConsist, w: 5 },
            // INS
            { val: layup, w: 3 },
            { val: dunk, w: 4 },
            { val: postPlay, w: 4 },
            { val: drawFoul, w: 4 },
            { val: hands, w: 5},
            // DEF
            { val: intDef, w: 6 },
            { val: perDef, w: 1 }, 
            { val: steal, w: 1 },
            { val: block, w: 4 },
            { val: helpDefIq, w: 2 }, // Weakness inclusion
            { val: passPerc, w: 1 },
            { val: defConsist, w: 5 },
            // REB
            { val: offReb, w: 4 },
            { val: defReb, w: 6 },
            // ATH
            { val: speed, w: 2 }, 
            { val: agility, w: 2 }, // Weakness inclusion
            { val: strength, w: 5 },
            { val: vertical, w: 5 },
            { val: stamina, w: 4 },
            { val: hustle, w: 4 },
            { val: durability, w: 5 },
            // PLM
            { val: passAcc, w: 1}, 
            { val: handling, w: 1 }, 
            { val: spdBall, w: 1 },
            { val: passVision, w: 1 }, 
            { val: passIq, w: 1 },
            // POT&INT&HGT
            { val: intangibles, w: 15 },
            { val: potential, w: 12 },
            { val: heightCm, w: 7 }
        ]);
    } else if (position.includes('C')) {
        ovrRaw = calcNewOvr([
            // OUT
            { val: closeShot, w: 10 },
            { val: midRange, w: 2 },
            { val: threeAvg, w: 2 },
            { val: ft, w: 2 },
            { val: shotIq, w: 3 },
            { val: offConsist, w: 5 },
            // INS
            { val: layup, w: 8 },
            { val: dunk, w: 10 },
            { val: postPlay, w: 10 },
            { val: drawFoul, w: 5 },
            { val: hands, w: 5},
            // DEF
            { val: intDef, w: 12 },
            { val: perDef, w: 1 }, 
            { val: steal, w: 1 },
            { val: block, w: 8 },
            { val: helpDefIq, w: 1 }, // Weakness inclusion
            { val: passPerc, w: 1 },
            { val: defConsist, w: 6 },
            // REB
            { val: offReb, w: 8 },
            { val: defReb, w: 8 },
            // ATH
            { val: speed, w: 2 }, 
            { val: agility, w: 2 }, // Weakness inclusion
            { val: strength, w: 6 },
            { val: vertical, w: 8 },
            { val: stamina, w: 2 },
            { val: hustle, w: 1 },
            { val: durability, w: 6 },
            // PLM
            { val: passAcc, w: 1}, 
            { val: handling, w: 1 }, 
            { val: spdBall, w: 1 },
            { val: passVision, w: 1 }, 
            { val: passIq, w: 1 },
            // POT&INT&HGT
            { val: intangibles, w: 15 },
            { val: potential, w: 10 },
            { val: heightCm, w: 8 }
        ]);
    } else {
        ovrRaw = 70;
    }

    const ovr = Math.max(40, Math.round(ovrRaw));

    const p: Player = {
      id: teamKey !== 'unknown' ? `${teamKey}-${values[1].toLowerCase().replace(/ /g, '-')}` : Math.random().toString(36).substr(2, 9),
      name: playerName,
      position: values[2] as any,
      age: age,
      height: heightCm,
      weight: parseInt(values[5]) || 90,
      salary: parseFloat(values[6]) || 1.0,
      contractYears: parseInt(values[7]) || 1,
      health: health,
      injuryType: injuryType,
      returnDate: returnDate,
      condition: 100,
      ovr: ovr,
      potential: potential,
      revealedPotential: potential,
      intangibles: intangibles,

      ath, speed, agility, strength, vertical, stamina, hustle, durability,
      out, closeShot, midRange, threeCorner, three45, threeTop, ft, shotIq, offConsist,
      ins, layup, dunk, postPlay, drawFoul, hands,
      plm, passAcc, handling, spdBall, passIq, passVision,
      def, intDef, perDef, lockdown, steal, blk: block, helpDefIq, passPerc, defConsist,
      reb, offReb, defReb,

      stats: INITIAL_STATS()
    };
    
    if (teamKey !== 'unknown') {
        if (!rosterMap[teamKey]) rosterMap[teamKey] = [];
        rosterMap[teamKey].push(p);
    }
  }
  return rosterMap;
}

export function generateSeasonSchedule(myTeamId: string): Game[] {
  const games: Game[] = [];
  const teams = INITIAL_TEAMS_DATA.map(t => t.id);
  const startDate = new Date(SEASON_START_DATE);
  
  let currentDate = new Date(startDate);
  const endDate = new Date('2026-04-15');
  let gameIdCounter = 1;

  // Simple random schedule generator
  while (currentDate <= endDate) {
      // 5-10 games per day across the league
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

export function parseScheduleCSV(csv: string, teams: Team[]): Game[] {
    const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
    const games: Game[] = [];
    const createdGameKeys = new Set<string>(); 
    const startIndex = lines[0].toLowerCase().includes('date') ? 1 : 0;

    for(let i=startIndex; i<lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < 4) continue;
        
        const dateRaw = cols[0]; 
        const teamName = cols[1]; 
        const site = cols[2]; 
        const oppName = cols[3]; 

        const findTeamId = (name: string) => {
            const t = INITIAL_TEAMS_DATA.find(t => t.name === name || t.city === name || `${t.city} ${t.name}` === name);
            return t ? t.id : null;
        };

        const teamId = findTeamId(teamName);
        const oppId = findTeamId(oppName);

        if (!teamId || !oppId) continue;

        let homeId, awayId;
        if (site === '홈') {
            homeId = teamId;
            awayId = oppId;
        } else {
            homeId = oppId;
            awayId = teamId;
        }

        const dateObj = new Date(dateRaw);
        if (isNaN(dateObj.getTime())) continue;
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const gameKey = `${dateStr}_${homeId}_${awayId}`;
        
        if (!createdGameKeys.has(gameKey)) {
            createdGameKeys.add(gameKey);
            games.push({
                id: `g_csv_${i}`,
                homeTeamId: homeId,
                awayTeamId: awayId,
                date: dateStr,
                played: false
            });
        }
    }
    
    return games.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function exportScheduleToCSV(schedule: Game[], teams: Team[]): string {
    let csv = "Date,HomeTeam,AwayTeam,HomeScore,AwayScore,Played\n";
    schedule.forEach(g => {
        csv += `${g.date},${g.homeTeamId},${g.awayTeamId},${g.homeScore || 0},${g.awayScore || 0},${g.played ? 'Y' : 'N'}\n`;
    });
    return csv;
}

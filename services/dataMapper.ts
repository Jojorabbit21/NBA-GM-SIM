
import { Team, Player, Game } from '../types';
import { FALLBACK_TEAMS, resolveTeamId, getTeamLogoUrl } from '../utils/constants';
import { calculateOvr } from '../utils/ovrUtils';

// --- Helper: Flexible Column Getter ---
const getCol = (item: any, keys: string[]) => {
    for (const k of keys) {
        if (item[k] !== undefined && item[k] !== null) return item[k];
    }
    return undefined;
};

/**
 * Supabase에서 불러온 Raw Player 데이터를 앱 내 Team[] 구조로 변환
 */
export const mapPlayersToTeams = (playersData: any[]): Team[] => {
    return FALLBACK_TEAMS.map((t) => {
        const teamId = t.id;
        
        const roster = playersData
            .filter((p: any) => {
                const rawTeamId = getCol(p, ['base_team_id', 'team_id', 'Team', 'Tm', 'team']);
                if (!rawTeamId) return false;
                const resolved = resolveTeamId(rawTeamId);
                return resolved === teamId;
            })
            .map((p: any) => mapRawPlayerToRuntimePlayer(p));

        return {
            id: teamId,
            name: t.name,
            city: t.city,
            logo: getTeamLogoUrl(teamId),
            conference: t.conference as 'East' | 'West',
            division: t.division as 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest',
            wins: 0,
            losses: 0,
            budget: 150,
            salaryCap: 140,
            luxuryTaxLine: 170,
            roster: roster
        };
    });
};

/**
 * 개별 선수 데이터 변환 (Raw DB Object -> Player Object)
 */
const mapRawPlayerToRuntimePlayer = (raw: any): Player => {
    // DB의 base_attributes 컬럼 파싱 (JSON or Object)
    const baseAttrs = typeof raw.base_attributes === 'string' 
        ? JSON.parse(raw.base_attributes) 
        : (raw.base_attributes || {});
        
    // raw 데이터와 baseAttrs 병합 (baseAttrs가 우선순위 높음)
    const p = { ...raw, ...baseAttrs };

    // 1. Categories (Defaults to 70 if missing to allow OVR calc to function)
    const ins = Number(getCol(p, ['ins', 'INS', 'Inside']) || 70);
    const out = Number(getCol(p, ['out', 'OUT', 'Outside']) || 70);
    const ath = Number(getCol(p, ['ath', 'ATH', 'Athleticism']) || 70);
    const plm = Number(getCol(p, ['plm', 'PLM', 'Playmaking']) || 70);
    const def = Number(getCol(p, ['def', 'DEF', 'Defense']) || 70);
    const reb = Number(getCol(p, ['reb', 'REB', 'Rebound']) || 70);

    // 2. Specific Stats Mapping (Checking all known variations)
    const statsObj = {
        // Offensive
        closeShot: Number(getCol(p, ['close', 'closeShot', 'CloseShot', 'Close']) || ins),
        midRange: Number(getCol(p, ['mid', 'midRange', 'MidRange', 'Mid']) || out),
        threeCorner: Number(getCol(p, ['3c', 'threeCorner', 'ThreeCorner', '3PtCorner']) || out),
        three45: Number(getCol(p, ['3_45', 'three45', 'Three45', '3Pt45']) || out),
        threeTop: Number(getCol(p, ['3t', 'threeTop', 'ThreeTop', '3PtTop']) || out),
        ft: Number(getCol(p, ['ft', 'FT', 'FreeThrow']) || 75),
        shotIq: Number(getCol(p, ['siq', 'shotIq', 'ShotIQ', 'IQ']) || 75),
        offConsist: Number(getCol(p, ['ocon', 'offConsist', 'OffConsist', 'Consistency']) || 70),
        
        // Inside
        layup: Number(getCol(p, ['lay', 'layup', 'Layup']) || ins),
        dunk: Number(getCol(p, ['dnk', 'dunk', 'Dunk']) || ins),
        postPlay: Number(getCol(p, ['post', 'postPlay', 'PostPlay', 'Post']) || ins),
        drawFoul: Number(getCol(p, ['draw', 'drawFoul', 'DrawFoul']) || 70),
        hands: Number(getCol(p, ['hands', 'Hands']) || 70),

        // Playmaking
        passAcc: Number(getCol(p, ['pacc', 'passAcc', 'PassAcc', 'Passing']) || plm),
        handling: Number(getCol(p, ['handl', 'handling', 'Handling', 'Handle']) || plm),
        spdBall: Number(getCol(p, ['spwb', 'spdBall', 'SpdBall', 'SpeedWithBall']) || plm),
        passIq: Number(getCol(p, ['piq', 'passIq', 'PassIQ']) || plm),
        passVision: Number(getCol(p, ['pvis', 'passVision', 'PassVision', 'Vision']) || plm),

        // Defense
        intDef: Number(getCol(p, ['idef', 'intDef', 'IntDef', 'InteriorDef']) || def),
        perDef: Number(getCol(p, ['pdef', 'perDef', 'PerDef', 'PerimeterDef', 'lock']) || def),
        steal: Number(getCol(p, ['stl', 'steal', 'Steal', 'STL']) || def),
        blk: Number(getCol(p, ['blk', 'Blk', 'Block', 'BLK']) || def),
        helpDefIq: Number(getCol(p, ['hdef', 'helpDefIq', 'HelpDefIQ']) || 70),
        passPerc: Number(getCol(p, ['pper', 'passPerc', 'PassPerc', 'PassPerception']) || 70),
        defConsist: Number(getCol(p, ['dcon', 'defConsist', 'DefConsist']) || 70),

        // Rebound
        offReb: Number(getCol(p, ['oreb', 'offReb', 'OffReb', 'ORB']) || reb),
        defReb: Number(getCol(p, ['dreb', 'defReb', 'DefReb', 'DRB']) || reb),

        // Athleticism
        speed: Number(getCol(p, ['spd', 'speed', 'Speed', 'SPD']) || ath),
        agility: Number(getCol(p, ['agi', 'agility', 'Agility', 'AGI']) || ath),
        strength: Number(getCol(p, ['str', 'strength', 'Strength', 'STR']) || ath),
        vertical: Number(getCol(p, ['vert', 'vertical', 'Vertical', 'JMP']) || ath),
        stamina: Number(getCol(p, ['sta', 'stamina', 'Stamina', 'STA']) || 80),
        hustle: Number(getCol(p, ['hus', 'hustle', 'Hustle']) || 75),
        durability: Number(getCol(p, ['dur', 'durability', 'Durability']) || 80),
        
        // Misc
        intangibles: Number(getCol(p, ['intangibles', 'Intangibles']) || 70),
        height: Number(getCol(p, ['height', 'Height', 'Ht']) || 200),

        // Fallbacks for Category Averages (Used by OVR calculator if specifics missing)
        ins, out, ath, plm, def, reb
    };

    const position = getCol(p, ['position', 'Pos', 'Position', 'POS']) || "G";
    
    // 3. Determine OVR (ALWAYS CALCULATE FROM STATS)
    // Always use the centralized calculator to ensure OVR reflects current weights
    const ovr = calculateOvr(statsObj, position);
    
    // Determine Potential
    const potentialRaw = Number(getCol(p, ['pot', 'potential', 'POT', 'Potential']));
    // If potential is missing or less than OVR (data error), set it to at least OVR
    const potential = (potentialRaw && !isNaN(potentialRaw)) ? Math.max(potentialRaw, ovr) : Math.max(75, ovr + 5);

    return {
        id: getCol(p, ['id', 'player_id', 'PlayerID']) || `p_${Math.random().toString(36).substr(2, 9)}`,
        name: getCol(p, ['name', 'Player', 'Name', 'player_name']) || "Unknown Player",
        position,
        age: Number(getCol(p, ['age', 'Age']) || 20),
        height: statsObj.height,
        weight: Number(getCol(p, ['weight', 'Weight', 'Wt']) || 100),
        salary: Number(getCol(p, ['salary', 'Salary']) || 5),
        contractYears: Number(getCol(p, ['contractyears', 'contractYears', 'ContractYears']) || 1),
        
        ovr,
        potential,
        revealedPotential: potential, // For now, revealed is same as actual
        
        health: (getCol(p, ['health']) || 'Healthy') as 'Healthy' | 'Injured' | 'Day-to-Day',
        condition: 100,

        ...statsObj,

        stats: p.stats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 },
        playoffStats: p.playoffStats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 }
    };
};

/**
 * 스케줄 데이터 변환 (Raw DB Schedule -> Game[])
 */
export const mapDatabaseScheduleToRuntimeGame = (rows: any[]): Game[] => {
    return rows.map(r => {
        let dateStr = getCol(r, ['Date', 'date', 'game_date', 'Start', 'start']) || '2025-10-20';
        try {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                dateStr = d.toISOString().split('T')[0];
            }
        } catch(e) {}

        const homeCol = getCol(r, ['Home', 'home', 'HomeTeam', 'home_team_id', 'Home/Neutral', 'home_neutral']);
        const awayCol = getCol(r, ['Away', 'away', 'Visitor', 'visitor', 'AwayTeam', 'away_team_id', 'Visitor/Neutral', 'visitor_neutral']);
        
        let homeTeamId = resolveTeamId(homeCol);
        let awayTeamId = resolveTeamId(awayCol);

        const gid = getCol(r, ['id', 'game_id']) || `g_${homeTeamId}_${awayTeamId}_${dateStr}`;

        const homePts = getCol(r, ['PTS.1', 'home_pts', 'home_score']);
        const awayPts = getCol(r, ['PTS', 'away_pts', 'away_score']);
        
        const isPlayed = (homePts !== undefined && homePts !== null && homePts !== "") && 
                         (awayPts !== undefined && awayPts !== null && awayPts !== "");

        return {
            id: String(gid),
            homeTeamId,
            awayTeamId,
            date: dateStr,
            homeScore: isPlayed ? Number(homePts) : undefined,
            awayScore: isPlayed ? Number(awayPts) : undefined,
            played: isPlayed,
            isPlayoff: false,
            seriesId: undefined
        };
    }).filter(g => g.homeTeamId !== 'unknown' && g.awayTeamId !== 'unknown');
};

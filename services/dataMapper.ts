
import { Team, Player, Game } from '../types';
import { FALLBACK_TEAMS, resolveTeamId, getTeamLogoUrl } from '../utils/constants';
import { KNOWN_INJURIES } from '../utils/injuries';
import { calculateOvr } from '../utils/ovrUtils';
import { LAKERS_DEFAULTS } from '../data/playerDefaults';

// --- Helper: Flexible Column Getter ---
const getCol = (item: any, keys: string[]) => {
    for (const k of keys) {
        if (item[k] !== undefined && item[k] !== null) return item[k];
    }
    return undefined;
};

// --- Helper: Generate Stable ID ---
const generateStableId = (name: string, teamId: string): string => {
    const cleanName = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${teamId}_${cleanName}`;
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
    
    const name = getCol(raw, ['name', 'Player', 'Name', 'player_name']) || "Unknown Player";

    // [New] DB의 tendencies 컬럼 파싱 및 레이커스 기본값 적용
    let tendencies = typeof raw.tendencies === 'string'
        ? JSON.parse(raw.tendencies)
        : (raw.tendencies || undefined);
    
    // DB에 데이터가 없고 레이커스 선수라면 정의된 현실적인 기본값 적용
    if (!tendencies && LAKERS_DEFAULTS[name]) {
        tendencies = LAKERS_DEFAULTS[name];
    }
        
    // raw 데이터와 baseAttrs 병합 (baseAttrs가 우선순위 높음)
    const p = { ...raw, ...baseAttrs };

    // 1. Categories
    const ins = Number(getCol(p, ['ins', 'INS', 'Inside']) || 70);
    const out = Number(getCol(p, ['out', 'OUT', 'Outside']) || 70);
    const ath = Number(getCol(p, ['ath', 'ATH', 'Athleticism']) || 70);
    const plm = Number(getCol(p, ['plm', 'PLM', 'Playmaking']) || 70);
    const def = Number(getCol(p, ['def', 'DEF', 'Defense']) || 70);
    const reb = Number(getCol(p, ['reb', 'REB', 'Rebound']) || 70);

    // 2. Specific Stats Mapping
    const statsObj = {
        closeShot: Number(getCol(p, ['close', 'closeShot', 'CloseShot', 'Close']) || ins),
        midRange: Number(getCol(p, ['mid', 'midRange', 'MidRange', 'Mid']) || out),
        threeCorner: Number(getCol(p, ['3c', 'threeCorner', 'ThreeCorner', '3PtCorner']) || out),
        three45: Number(getCol(p, ['3_45', 'three45', 'Three45', '3Pt45']) || out),
        threeTop: Number(getCol(p, ['3t', 'threeTop', 'ThreeTop', '3PtTop']) || out),
        ft: Number(getCol(p, ['ft', 'FT', 'FreeThrow']) || 75),
        shotIq: Number(getCol(p, ['siq', 'shotIq', 'ShotIQ', 'IQ']) || 75),
        offConsist: Number(getCol(p, ['ocon', 'offConsist', 'OffConsist', 'Consistency']) || 70),
        layup: Number(getCol(p, ['lay', 'layup', 'Layup']) || ins),
        dunk: Number(getCol(p, ['dnk', 'dunk', 'Dunk']) || ins),
        postPlay: Number(getCol(p, ['post', 'postPlay', 'PostPlay', 'Post']) || ins),
        drawFoul: Number(getCol(p, ['draw', 'drawFoul', 'DrawFoul']) || 70),
        hands: Number(getCol(p, ['hands', 'Hands']) || 70),
        passAcc: Number(getCol(p, ['pacc', 'passAcc', 'PassAcc', 'Passing']) || plm),
        handling: Number(getCol(p, ['handl', 'handling', 'Handling', 'Handle']) || plm),
        spdBall: Number(getCol(p, ['spwb', 'spdBall', 'SpdBall', 'SpeedWithBall']) || plm),
        passIq: Number(getCol(p, ['piq', 'passIq', 'PassIQ']) || plm),
        passVision: Number(getCol(p, ['pvis', 'passVision', 'PassVision', 'Vision']) || plm),
        intDef: Number(getCol(p, ['idef', 'intDef', 'IntDef', 'InteriorDef']) || def),
        perDef: Number(getCol(p, ['pdef', 'perDef', 'PerDef', 'PerimeterDef', 'lock']) || def),
        steal: Number(getCol(p, ['stl', 'steal', 'Steal', 'STL']) || def),
        blk: Number(getCol(p, ['blk', 'Blk', 'Block', 'BLK']) || def),
        helpDefIq: Number(getCol(p, ['hdef', 'helpDefIq', 'HelpDefIQ']) || 70),
        passPerc: Number(getCol(p, ['pper', 'passPerc', 'PassPerc', 'PassPerception']) || 70),
        defConsist: Number(getCol(p, ['dcon', 'defConsist', 'DefConsist']) || 70),
        offReb: Number(getCol(p, ['oreb', 'offReb', 'OffReb', 'ORB']) || reb),
        defReb: Number(getCol(p, ['dreb', 'defReb', 'DefReb', 'DRB']) || reb),
        speed: Number(getCol(p, ['spd', 'speed', 'Speed', 'SPD']) || ath),
        agility: Number(getCol(p, ['agi', 'agility', 'Agility', 'AGI']) || ath),
        strength: Number(getCol(p, ['str', 'strength', 'Strength', 'STR']) || ath),
        vertical: Number(getCol(p, ['vert', 'vertical', 'Vertical', 'JMP']) || ath),
        stamina: Number(getCol(p, ['sta', 'stamina', 'Stamina', 'STA']) || 80),
        hustle: Number(getCol(p, ['hus', 'hustle', 'Hustle']) || 75),
        durability: Number(getCol(p, ['dur', 'durability', 'Durability']) || 80),
        intangibles: Number(getCol(p, ['intangibles', 'Intangibles']) || 70),
        height: Number(getCol(p, ['height', 'Height', 'Ht']) || 200),
        ins, out, ath, plm, def, reb
    };

    const position = getCol(p, ['position', 'Pos', 'Position', 'POS']) || "G";
    const rawTeamId = getCol(p, ['base_team_id', 'team_id', 'Team', 'Tm', 'team']) || 'fa';
    const teamId = resolveTeamId(rawTeamId);
    
    const ovr = calculateOvr(statsObj, position);
    const potentialRaw = Number(getCol(p, ['pot', 'potential', 'POT', 'Potential']));
    const potential = (potentialRaw && !isNaN(potentialRaw)) ? Math.max(potentialRaw, ovr) : Math.max(75, ovr + 5);

    let health = (getCol(p, ['health']) || 'Healthy') as 'Healthy' | 'Injured' | 'Day-to-Day';
    let injuryType = undefined;
    let returnDate = undefined;

    if (KNOWN_INJURIES[name]) {
        health = 'Injured';
        injuryType = KNOWN_INJURIES[name].type;
        returnDate = KNOWN_INJURIES[name].returnDate;
    } else {
        const nameLower = name.toLowerCase().trim();
        for (const key in KNOWN_INJURIES) {
             const keyLower = key.toLowerCase().trim();
             if (nameLower.includes(keyLower) || keyLower.includes(nameLower)) {
                 health = 'Injured';
                 injuryType = KNOWN_INJURIES[key].type;
                 returnDate = KNOWN_INJURIES[key].returnDate;
                 break;
             }
        }
    }

    const dbId = getCol(p, ['id', 'player_id', 'PlayerID']);
    const id = dbId ? String(dbId) : generateStableId(name, teamId);

    const avg3pt = Math.round((statsObj.threeCorner + statsObj.three45 + statsObj.threeTop) / 3);
    const calculatedIns = Math.round((statsObj.layup + statsObj.dunk + statsObj.postPlay + statsObj.drawFoul + statsObj.hands) / 5);
    const calculatedOut = Math.round((statsObj.closeShot + statsObj.midRange + avg3pt + statsObj.ft + statsObj.shotIq + statsObj.offConsist) / 6);
    const calculatedPlm = Math.round((statsObj.passAcc + statsObj.handling + statsObj.spdBall + statsObj.passIq + statsObj.passVision) / 5);
    const calculatedDef = Math.round((statsObj.intDef + statsObj.perDef + statsObj.steal + statsObj.blk + statsObj.helpDefIq + statsObj.passPerc + statsObj.defConsist) / 7);
    const calculatedReb = Math.round((statsObj.offReb + statsObj.defReb) / 2);
    const calculatedAth = Math.round((statsObj.speed + statsObj.agility + statsObj.strength + statsObj.vertical + statsObj.stamina + statsObj.hustle + statsObj.durability) / 7);

    const defaultStats = { 
        g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, 
        fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, pf: 0,
        plusMinus: 0,
        zone_rim_m: 0, zone_rim_a: 0,
        zone_paint_m: 0, zone_paint_a: 0,
        zone_mid_l_m: 0, zone_mid_l_a: 0,
        zone_mid_c_m: 0, zone_mid_c_a: 0,
        zone_mid_r_m: 0, zone_mid_r_a: 0,
        zone_c3_l_m: 0, zone_c3_l_a: 0,
        zone_c3_r_m: 0, zone_c3_r_a: 0,
        zone_atb3_l_m: 0, zone_atb3_l_a: 0,
        zone_atb3_c_m: 0, zone_atb3_c_a: 0,
        zone_atb3_r_m: 0, zone_atb3_r_a: 0
    };

    return {
        id,
        name,
        position,
        age: Number(getCol(p, ['age', 'Age']) || 20),
        height: statsObj.height,
        weight: Number(getCol(p, ['weight', 'Weight', 'Wt']) || 100),
        salary: Number(getCol(p, ['salary', 'Salary']) || 5),
        contractYears: Number(getCol(p, ['contractyears', 'contractYears', 'ContractYears']) || 1),
        ovr,
        potential,
        revealedPotential: potential,
        health,
        injuryType,
        returnDate,
        condition: 100,
        ...statsObj,
        ins: calculatedIns,
        out: calculatedOut,
        plm: calculatedPlm,
        def: calculatedDef,
        reb: calculatedReb,
        ath: calculatedAth,
        stats: p.stats || defaultStats,
        playoffStats: p.playoffStats || defaultStats,
        tendencies: tendencies
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

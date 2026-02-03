import { Team, Player, Game } from '../types';
import { calculateOvr } from '../utils/ovrUtils';
import { resolveTeamId, FALLBACK_TEAMS } from '../utils/constants';
import { KNOWN_INJURIES } from '../utils/injuries';

// Helper to get value from multiple possible column names (case-insensitive handling)
const getCol = (obj: any, keys: string[]) => {
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
        const lowerKey = key.toLowerCase();
        const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowerKey);
        if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null && obj[foundKey] !== '') return obj[foundKey];
    }
    return undefined;
};

// Generate a stable ID if missing (based on name and team)
const generateStableId = (name: string, teamId: string) => {
    return `${teamId}_${name.replace(/\s+/g, '_').toLowerCase()}_${Math.floor(Math.random() * 1000)}`;
};

export const mapPlayersToTeams = (playersData: any[]): Team[] => {
    const teamsMap: Record<string, Team> = {};

    // Initialize empty teams from FALLBACK_TEAMS to ensure all 30 teams exist
    FALLBACK_TEAMS.forEach(t => {
        teamsMap[t.id] = {
            ...t,
            wins: 0,
            losses: 0,
            budget: 150, // Default
            salaryCap: 140, // Default
            luxuryTaxLine: 170, // Default
            roster: []
        };
    });

    playersData.forEach(p => {
        // Map Stats with fallbacks
        const statsObj: any = {
            closeShot: Number(getCol(p, ['closeShot', 'close_shot', 'inside', 'INS']) || 70),
            midRange: Number(getCol(p, ['midRange', 'mid_range', 'mid', 'MID']) || 70),
            threeCorner: Number(getCol(p, ['threeCorner', 'three_corner', '3pt', '3PT']) || 70),
            three45: Number(getCol(p, ['three45', 'three_45']) || 70),
            threeTop: Number(getCol(p, ['threeTop', 'three_top']) || 70),
            ft: Number(getCol(p, ['ft', 'free_throw', 'FT']) || 70),
            shotIq: Number(getCol(p, ['shotIq', 'shot_iq', 'iq', 'IQ']) || 70),
            offConsist: Number(getCol(p, ['offConsist', 'off_consist', 'consistency']) || 70),
            
            layup: Number(getCol(p, ['layup', 'Layup']) || 70),
            dunk: Number(getCol(p, ['dunk', 'Dunk']) || 70),
            postPlay: Number(getCol(p, ['postPlay', 'post_play', 'post']) || 70),
            drawFoul: Number(getCol(p, ['drawFoul', 'draw_foul']) || 70),
            hands: Number(getCol(p, ['hands', 'Hands']) || 70),
            
            passAcc: Number(getCol(p, ['passAcc', 'pass_acc', 'pass']) || 70),
            handling: Number(getCol(p, ['handling', 'ball_handling', 'handle']) || 70),
            spdBall: Number(getCol(p, ['spdBall', 'speed_ball']) || 70),
            passVision: Number(getCol(p, ['passVision', 'vision']) || 70),
            passIq: Number(getCol(p, ['passIq', 'pass_iq']) || 70),
            
            intDef: Number(getCol(p, ['intDef', 'interior_defense', 'int_def']) || 70),
            perDef: Number(getCol(p, ['perDef', 'perimeter_defense', 'per_def']) || 70),
            steal: Number(getCol(p, ['steal', 'Steal']) || 70),
            blk: Number(getCol(p, ['blk', 'block', 'BLK']) || 70),
            helpDefIq: Number(getCol(p, ['helpDefIq', 'help_def']) || 70),
            passPerc: Number(getCol(p, ['passPerc', 'pass_perception']) || 70),
            defConsist: Number(getCol(p, ['defConsist', 'def_consist']) || 70),
            
            offReb: Number(getCol(p, ['offReb', 'oreb', 'ORB']) || 70),
            defReb: Number(getCol(p, ['defReb', 'dreb', 'DRB']) || 70),
            
            speed: Number(getCol(p, ['speed', 'SPD']) || 70),
            agility: Number(getCol(p, ['agility', 'AGI']) || 70),
            strength: Number(getCol(p, ['strength', 'STR']) || 70),
            vertical: Number(getCol(p, ['vertical', 'JMP']) || 70),
            stamina: Number(getCol(p, ['stamina', 'STA']) || 70),
            hustle: Number(getCol(p, ['hustle', 'HUS']) || 70),
            durability: Number(getCol(p, ['durability', 'DUR']) || 70),
            
            intangibles: Number(getCol(p, ['intangibles', 'INT']) || 70),
            height: Number(getCol(p, ['height', 'hgt', 'HT']) || 200),
            
            // Fallbacks for Category Averages (Used by OVR calculator if specifics missing)
            ins: Number(getCol(p, ['ins', 'INS']) || 70), 
            out: Number(getCol(p, ['out', 'OUT']) || 70),
            ath: Number(getCol(p, ['ath', 'ATH']) || 70),
            plm: Number(getCol(p, ['plm', 'PLM']) || 70),
            def: Number(getCol(p, ['def', 'DEF']) || 70),
            reb: Number(getCol(p, ['reb', 'REB']) || 70)
        };

        const position = getCol(p, ['position', 'Pos', 'Position', 'POS']) || "G";
        const name = getCol(p, ['name', 'Player', 'Name', 'player_name']) || "Unknown Player";
        
        // Resolve Team ID for stable ID generation fallback
        const rawTeamId = getCol(p, ['base_team_id', 'team_id', 'Team', 'Tm', 'team']) || 'fa';
        const teamId = resolveTeamId(rawTeamId);
        
        // 3. Determine OVR (ALWAYS CALCULATE FROM STATS)
        const ovr = calculateOvr(statsObj, position);

        // [Fix] Calculate Category Averages dynamically from detailed stats
        // This ensures the UI displays correct averages even if DB columns for categories are 70 (default)
        const avg3pt = Math.round((statsObj.threeCorner + statsObj.three45 + statsObj.threeTop) / 3);
        
        const calculatedIns = Math.round((statsObj.layup + statsObj.dunk + statsObj.postPlay + statsObj.drawFoul + statsObj.hands) / 5);
        const calculatedOut = Math.round((statsObj.closeShot + statsObj.midRange + avg3pt + statsObj.ft + statsObj.shotIq + statsObj.offConsist) / 6);
        const calculatedPlm = Math.round((statsObj.passAcc + statsObj.handling + statsObj.spdBall + statsObj.passIq + statsObj.passVision) / 5);
        const calculatedDef = Math.round((statsObj.intDef + statsObj.perDef + statsObj.steal + statsObj.blk + statsObj.helpDefIq + statsObj.passPerc + statsObj.defConsist) / 7);
        const calculatedReb = Math.round((statsObj.offReb + statsObj.defReb) / 2);
        const calculatedAth = Math.round((statsObj.speed + statsObj.agility + statsObj.strength + statsObj.vertical + statsObj.stamina + statsObj.hustle + statsObj.durability) / 7);
        
        // Determine Potential
        const potentialRaw = Number(getCol(p, ['pot', 'potential', 'POT', 'Potential']));
        const potential = (potentialRaw && !isNaN(potentialRaw)) ? Math.max(potentialRaw, ovr) : Math.max(75, ovr + 5);

        // [Fix] Handle Known Injuries - Enhanced Matching Logic
        let health: 'Healthy' | 'Injured' | 'Day-to-Day' = (getCol(p, ['health']) || 'Healthy') as any;
        let injuryType = undefined;
        let returnDate = undefined;

        // 1. Try Exact Match
        if (KNOWN_INJURIES[name]) {
            health = 'Injured';
            injuryType = KNOWN_INJURIES[name].type;
            returnDate = KNOWN_INJURIES[name].returnDate;
        } else {
            // 2. Try Partial Match (for cases like "Dereck Lively II" vs "Dereck Lively")
            // Loop through keys and see if one includes the other
            const nameLower = name.toLowerCase().trim();
            for (const key in KNOWN_INJURIES) {
                 const keyLower = key.toLowerCase().trim();
                 // Check if the DB name contains the Key OR the Key contains the DB name
                 // e.g. "Dereck Lively II" contains "Dereck Lively"
                 if (nameLower.includes(keyLower) || keyLower.includes(nameLower)) {
                     health = 'Injured';
                     injuryType = KNOWN_INJURIES[key].type;
                     returnDate = KNOWN_INJURIES[key].returnDate;
                     break;
                 }
            }
        }

        // [Fix] Use DB ID if available, otherwise generate stable ID
        const dbId = getCol(p, ['id', 'player_id', 'PlayerID']);
        const id = dbId ? String(dbId) : generateStableId(name, teamId);

        const player: Player = {
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

            // Use calculated averages for display instead of raw DB values
            ins: calculatedIns, 
            out: calculatedOut, 
            ath: calculatedAth, 
            plm: calculatedPlm, 
            def: calculatedDef, 
            reb: calculatedReb,

            stats: p.stats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, pf: 0, zone_rim_m: 0, zone_rim_a: 0, zone_paint_m: 0, zone_paint_a: 0, zone_mid_l_m: 0, zone_mid_l_a: 0, zone_mid_c_m: 0, zone_mid_c_a: 0, zone_mid_r_m: 0, zone_mid_r_a: 0, zone_c3_l_m: 0, zone_c3_l_a: 0, zone_c3_r_m: 0, zone_c3_r_a: 0, zone_atb3_l_m: 0, zone_atb3_l_a: 0, zone_atb3_c_m: 0, zone_atb3_c_a: 0, zone_atb3_r_m: 0, zone_atb3_r_a: 0 },
            playoffStats: p.playoffStats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, pf: 0, zone_rim_m: 0, zone_rim_a: 0, zone_paint_m: 0, zone_paint_a: 0, zone_mid_l_m: 0, zone_mid_l_a: 0, zone_mid_c_m: 0, zone_mid_c_a: 0, zone_mid_r_m: 0, zone_mid_r_a: 0, zone_c3_l_m: 0, zone_c3_l_a: 0, zone_c3_r_m: 0, zone_c3_r_a: 0, zone_atb3_l_m: 0, zone_atb3_l_a: 0, zone_atb3_c_m: 0, zone_atb3_c_a: 0, zone_atb3_r_m: 0, zone_atb3_r_a: 0 }
        };

        if (teamsMap[teamId]) {
            teamsMap[teamId].roster.push(player);
        }
    });

    return Object.values(teamsMap);
};

export const mapDatabaseScheduleToRuntimeGame = (dbSchedule: any[]): Game[] => {
    return dbSchedule.map(g => ({
        id: String(g.id),
        homeTeamId: resolveTeamId(g.home_team),
        awayTeamId: resolveTeamId(g.away_team),
        date: g.date,
        played: false,
        isPlayoff: false
    }));
};

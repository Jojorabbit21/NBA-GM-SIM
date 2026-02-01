
import { Team, Player, Game } from '../types';
import { FALLBACK_TEAMS, resolveTeamId, getTeamLogoUrl } from '../utils/constants';

// --- Helper: Flexible Column Getter ---
// 다양한 컬럼명 변주(대소문자, 약어 등)에 대응하기 위한 헬퍼
const getCol = (item: any, keys: string[]) => {
    for (const k of keys) {
        if (item[k] !== undefined && item[k] !== null) return item[k];
    }
    return undefined;
};

/**
 * Supabase에서 불러온 Raw Player 데이터를 앱 내 Team[] 구조로 변환
 * 핵심: base_team_id 컬럼을 최우선으로 확인하여 팀에 배정함
 */
export const mapPlayersToTeams = (playersData: any[]): Team[] => {
    return FALLBACK_TEAMS.map((t) => {
        const teamId = t.id; // e.g., 'atl', 'bos'
        
        // 1. 해당 팀에 소속된 선수 필터링
        const roster = playersData
            .filter((p: any) => {
                // [Critical] 단장님 지시: 'base_team_id' 최우선 참조
                // DB의 base_team_id는 'bos', 'chi' 같은 약어로 저장되어 있음.
                const rawTeamId = getCol(p, ['base_team_id', 'team_id', 'Team', 'Tm']);
                
                if (!rawTeamId) return false;

                // resolveTeamId를 거쳐 표준 ID('bos', 'atl' 등)로 변환 후 비교
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
const mapRawPlayerToRuntimePlayer = (p: any): Player => {
    return {
        id: getCol(p, ['id', 'player_id', 'PlayerID']) || `p_${Math.random().toString(36).substr(2, 9)}`,
        name: getCol(p, ['name', 'Player', 'Name', 'player_name']) || "Unknown Player",
        position: getCol(p, ['position', 'Pos', 'Position', 'POS']) || "G",
        age: Number(getCol(p, ['age', 'Age']) || 20),
        height: Number(getCol(p, ['height', 'Height', 'Ht']) || 200),
        weight: Number(getCol(p, ['weight', 'Weight', 'Wt']) || 100),
        salary: Number(getCol(p, ['salary', 'Salary']) || 5),
        contractYears: Number(getCol(p, ['contractYears', 'ContractYears']) || 1),
        
        // Game Attributes (Default to 70 if missing)
        ovr: Number(getCol(p, ['ovr', 'OVR', 'Overall']) || 70),
        potential: Number(getCol(p, ['potential', 'POT', 'Potential']) || 75),
        revealedPotential: Number(getCol(p, ['potential', 'POT', 'Potential']) || 75),
        
        health: 'Healthy' as const,
        condition: 100,

        // Detailed Stats (Map or Default)
        ins: Number(getCol(p, ['ins', 'INS']) || 70),
        out: Number(getCol(p, ['out', 'OUT']) || 70),
        ath: Number(getCol(p, ['ath', 'ATH']) || 70),
        plm: Number(getCol(p, ['plm', 'PLM']) || 70),
        def: Number(getCol(p, ['def', 'DEF']) || 70),
        reb: Number(getCol(p, ['reb', 'REB']) || 70),

        // Sub-attributes (Derived or Direct)
        closeShot: Number(getCol(p, ['closeShot']) || getCol(p, ['ins']) || 70),
        midRange: Number(getCol(p, ['midRange']) || getCol(p, ['out']) || 70),
        threeCorner: Number(getCol(p, ['threeCorner', 'threePoint']) || getCol(p, ['out']) || 70),
        three45: Number(getCol(p, ['three45']) || getCol(p, ['out']) || 70),
        threeTop: Number(getCol(p, ['threeTop']) || getCol(p, ['out']) || 70),
        ft: Number(getCol(p, ['ft', 'FT']) || 75),
        shotIq: Number(getCol(p, ['shotIq']) || 75),
        offConsist: Number(getCol(p, ['offConsist']) || 70),
        
        layup: Number(getCol(p, ['layup']) || getCol(p, ['ins']) || 70),
        dunk: Number(getCol(p, ['dunk']) || getCol(p, ['ins']) || 70),
        postPlay: Number(getCol(p, ['postPlay']) || getCol(p, ['ins']) || 70),
        drawFoul: Number(getCol(p, ['drawFoul']) || 70),
        hands: Number(getCol(p, ['hands']) || 70),

        passAcc: Number(getCol(p, ['passAcc']) || getCol(p, ['plm']) || 70),
        handling: Number(getCol(p, ['handling']) || getCol(p, ['plm']) || 70),
        spdBall: Number(getCol(p, ['spdBall']) || getCol(p, ['plm']) || 70),
        passIq: Number(getCol(p, ['passIq']) || getCol(p, ['plm']) || 70),
        passVision: Number(getCol(p, ['passVision']) || getCol(p, ['plm']) || 70),

        intDef: Number(getCol(p, ['intDef']) || getCol(p, ['def']) || 70),
        perDef: Number(getCol(p, ['perDef']) || getCol(p, ['def']) || 70),
        steal: Number(getCol(p, ['steal', 'STL']) || getCol(p, ['def']) || 70),
        blk: Number(getCol(p, ['blk', 'BLK']) || getCol(p, ['def']) || 70),
        helpDefIq: Number(getCol(p, ['helpDefIq']) || 70),
        passPerc: Number(getCol(p, ['passPerc']) || 70),
        defConsist: Number(getCol(p, ['defConsist']) || 70),

        offReb: Number(getCol(p, ['offReb', 'ORB']) || getCol(p, ['reb']) || 70),
        defReb: Number(getCol(p, ['defReb', 'DRB']) || getCol(p, ['reb']) || 70),

        speed: Number(getCol(p, ['speed', 'SPD']) || getCol(p, ['ath']) || 70),
        agility: Number(getCol(p, ['agility', 'AGI']) || getCol(p, ['ath']) || 70),
        strength: Number(getCol(p, ['strength', 'STR']) || getCol(p, ['ath']) || 70),
        vertical: Number(getCol(p, ['vertical', 'JMP']) || getCol(p, ['ath']) || 70),
        stamina: Number(getCol(p, ['stamina', 'STA']) || getCol(p, ['ath']) || 80),
        hustle: Number(getCol(p, ['hustle']) || 75),
        durability: Number(getCol(p, ['durability']) || 80),
        intangibles: Number(getCol(p, ['intangibles']) || 70),

        // Runtime Stats Containers
        stats: p.stats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 },
        playoffStats: p.playoffStats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 }
    };
};

/**
 * 스케줄 데이터 변환 (Raw DB Schedule -> Game[])
 */
export const mapDatabaseScheduleToRuntimeGame = (rows: any[]): Game[] => {
    return rows.map(r => {
        // 1. Try to get Date
        let dateStr = getCol(r, ['Date', 'date', 'game_date', 'Start', 'start']) || '2025-10-20';
        try {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                dateStr = d.toISOString().split('T')[0];
            }
        } catch(e) {}

        // 2. Identify Home/Away
        const homeCol = getCol(r, ['Home', 'home', 'HomeTeam', 'home_team_id', 'Home/Neutral', 'home_neutral']);
        const awayCol = getCol(r, ['Away', 'away', 'Visitor', 'visitor', 'AwayTeam', 'away_team_id', 'Visitor/Neutral', 'visitor_neutral']);
        
        let homeTeamId = resolveTeamId(homeCol);
        let awayTeamId = resolveTeamId(awayCol);

        // 3. Game ID
        const gid = getCol(r, ['id', 'game_id']) || `g_${homeTeamId}_${awayTeamId}_${dateStr}`;

        // 4. Scores
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

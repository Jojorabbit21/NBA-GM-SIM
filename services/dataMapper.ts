
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
const mapRawPlayerToRuntimePlayer = (raw: any): Player => {
    // [Critical Update] meta_players의 base_attributes JSON 컬럼 처리
    // DB의 base_attributes 컬럼에 세부 스탯이 묶여 있는 경우를 대비해 최상위 객체로 병합
    const baseAttrs = typeof raw.base_attributes === 'string' 
        ? JSON.parse(raw.base_attributes) 
        : (raw.base_attributes || {});
        
    const p = { ...raw, ...baseAttrs };

    // 1. 기본 능력치 (Base Stats)
    const ins = Number(getCol(p, ['ins', 'INS', 'Inside']) || 70);
    const out = Number(getCol(p, ['out', 'OUT', 'Outside']) || 70);
    const ath = Number(getCol(p, ['ath', 'ATH', 'Athleticism']) || 70);
    const plm = Number(getCol(p, ['plm', 'PLM', 'Playmaking']) || 70);
    const def = Number(getCol(p, ['def', 'DEF', 'Defense']) || 70);
    const reb = Number(getCol(p, ['reb', 'REB', 'Rebound']) || 70);

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
        ins, out, ath, plm, def, reb,

        // Sub-attributes (Checking capitalized and lowercase variations)
        // Offensive
        closeShot: Number(getCol(p, ['closeShot', 'CloseShot', 'Close', 'close_shot']) || ins),
        midRange: Number(getCol(p, ['midRange', 'MidRange', 'Mid', 'mid_range']) || out),
        threeCorner: Number(getCol(p, ['threeCorner', 'ThreeCorner', '3PtCorner', 'three_corner']) || out),
        three45: Number(getCol(p, ['three45', 'Three45', '3Pt45', 'three_45']) || out),
        threeTop: Number(getCol(p, ['threeTop', 'ThreeTop', '3PtTop', 'three_top']) || out),
        ft: Number(getCol(p, ['ft', 'FT', 'FreeThrow']) || 75),
        shotIq: Number(getCol(p, ['shotIq', 'ShotIQ', 'IQ', 'shot_iq']) || 75),
        offConsist: Number(getCol(p, ['offConsist', 'OffConsist', 'Consistency', 'off_consist']) || 70),
        
        // Inside
        layup: Number(getCol(p, ['layup', 'Layup']) || ins),
        dunk: Number(getCol(p, ['dunk', 'Dunk']) || ins),
        postPlay: Number(getCol(p, ['postPlay', 'PostPlay', 'Post', 'post_play']) || ins),
        drawFoul: Number(getCol(p, ['drawFoul', 'DrawFoul', 'draw_foul']) || 70),
        hands: Number(getCol(p, ['hands', 'Hands']) || 70),

        // Playmaking
        passAcc: Number(getCol(p, ['passAcc', 'PassAcc', 'Passing', 'pass_acc']) || plm),
        handling: Number(getCol(p, ['handling', 'Handling', 'Handle']) || plm),
        spdBall: Number(getCol(p, ['spdBall', 'SpdBall', 'SpeedWithBall', 'spd_ball']) || plm),
        passIq: Number(getCol(p, ['passIq', 'PassIQ', 'pass_iq']) || plm),
        passVision: Number(getCol(p, ['passVision', 'PassVision', 'Vision', 'pass_vision']) || plm),

        // Defense
        intDef: Number(getCol(p, ['intDef', 'IntDef', 'InteriorDef', 'int_def']) || def),
        perDef: Number(getCol(p, ['perDef', 'PerDef', 'PerimeterDef', 'per_def']) || def),
        steal: Number(getCol(p, ['steal', 'Steal', 'STL']) || def),
        blk: Number(getCol(p, ['blk', 'Blk', 'Block', 'BLK']) || def),
        helpDefIq: Number(getCol(p, ['helpDefIq', 'HelpDefIQ', 'help_def_iq']) || 70),
        passPerc: Number(getCol(p, ['passPerc', 'PassPerc', 'PassPerception', 'pass_perc']) || 70),
        defConsist: Number(getCol(p, ['defConsist', 'DefConsist', 'def_consist']) || 70),

        // Rebound
        offReb: Number(getCol(p, ['offReb', 'OffReb', 'ORB', 'off_reb']) || reb),
        defReb: Number(getCol(p, ['defReb', 'DefReb', 'DRB', 'def_reb']) || reb),

        // Athleticism
        speed: Number(getCol(p, ['speed', 'Speed', 'SPD']) || ath),
        agility: Number(getCol(p, ['agility', 'Agility', 'AGI']) || ath),
        strength: Number(getCol(p, ['strength', 'Strength', 'STR']) || ath),
        vertical: Number(getCol(p, ['vertical', 'Vertical', 'JMP']) || ath),
        stamina: Number(getCol(p, ['stamina', 'Stamina', 'STA']) || 80),
        hustle: Number(getCol(p, ['hustle', 'Hustle']) || 75),
        durability: Number(getCol(p, ['durability', 'Durability']) || 80),
        intangibles: Number(getCol(p, ['intangibles', 'Intangibles']) || 70),

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


import { Game, Player, Team } from '../types';
import { calculateOvr, getOVRThreshold } from './ovrUtils';
export { getOVRThreshold } from './ovrUtils';
export type { OvrTier } from './ovrUtils';
import { TEAM_DATA, TeamStaticData } from '../data/teamData';
import { TEAM_ID_MAP } from '../data/mappings';
import { editorLogoUrls } from './editorState';

import { DEFAULT_SEASON_CONFIG } from './seasonConfig';

export const APP_NAME = 'Basketball GM Simulator';
export const APP_YEAR = String(DEFAULT_SEASON_CONFIG.endYear);
export const APP_FULL_NAME = `${APP_NAME} ${APP_YEAR}`;

/** @deprecated buildSeasonConfig(n) 사용 권장 */
export const SEASON_START_DATE = DEFAULT_SEASON_CONFIG.startDate;
/** @deprecated buildSeasonConfig(n) 사용 권장 */
export const TRADE_DEADLINE = DEFAULT_SEASON_CONFIG.tradeDeadline;

// League Financial Constants (달러) — 2025-26 실제 금액
export const LEAGUE_FINANCIALS = {
    SALARY_FLOOR:   139_182_000,
    SALARY_CAP:     154_647_000,
    TAX_LEVEL:      187_895_000,
    FIRST_APRON:    195_945_000,
    SECOND_APRON:   207_824_000,
};

// Signing Exception Amounts (달러) — 2025-26
export const SIGNING_EXCEPTIONS = {
    NON_TAX_MLE:  14_104_000,  // Non-Taxpayer MLE (1차 에이프런 미만 팀, 최대 4년)
    TAXPAYER_MLE:  5_685_000,  // Taxpayer MLE (1~2차 에이프런 사이 팀, 최대 2년)
    // Room Exception, Bi-Annual Exception: 복잡도 대비 가치 낮음 → 미구현
};

/** @deprecated buildSeasonConfig(n) 사용 권장 */
export const CALENDAR_EVENTS = {
    ALL_STAR_START: DEFAULT_SEASON_CONFIG.allStarStart,
    ALL_STAR_END: DEFAULT_SEASON_CONFIG.allStarEnd
};

// Adapter for existing code using TEAM_OWNERS
export let TEAM_OWNERS: Record<string, string> = Object.values(TEAM_DATA).reduce((acc, team) => {
    acc[team.id] = team.owner;
    return acc;
}, {} as Record<string, string>);

// Adapter for existing code using FALLBACK_TEAMS
export let FALLBACK_TEAMS = Object.values(TEAM_DATA).map((t: TeamStaticData) => ({
    id: t.id,
    city: t.city,
    name: t.name,
    conference: t.conference,
    division: t.division
}));

/** TEAM_DATA 뮤테이션 후 파생 상수를 재계산 */
export function rebuildDerivedConstants(): void {
    TEAM_OWNERS = Object.values(TEAM_DATA).reduce((acc, team) => {
        acc[team.id] = team.owner;
        return acc;
    }, {} as Record<string, string>);

    FALLBACK_TEAMS = Object.values(TEAM_DATA).map((t: TeamStaticData) => ({
        id: t.id,
        city: t.city,
        name: t.name,
        conference: t.conference,
        division: t.division,
    }));
}

export const INITIAL_STATS = () => ({
    g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
    fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
    rimM: 0, rimA: 0, midM: 0, midA: 0,
    pf: 0,
    techFouls: 0,
    flagrantFouls: 0,
    plusMinus: 0,
    
    // --- New 10-Zone Shooting Data ---
    zone_rim_m: 0, zone_rim_a: 0,
    zone_paint_m: 0, zone_paint_a: 0, // Merged Paint
    zone_mid_l_m: 0, zone_mid_l_a: 0,
    zone_mid_c_m: 0, zone_mid_c_a: 0,
    zone_mid_r_m: 0, zone_mid_r_a: 0,
    zone_c3_l_m: 0, zone_c3_l_a: 0,
    zone_c3_r_m: 0, zone_c3_r_a: 0,
    zone_atb3_l_m: 0, zone_atb3_l_a: 0,
    zone_atb3_c_m: 0, zone_atb3_c_a: 0,
    zone_atb3_r_m: 0, zone_atb3_r_a: 0
});

export const resolveTeamId = (nameOrId: string | null | undefined): string => {
    if (!nameOrId) return 'unknown';
    const input = String(nameOrId).toLowerCase().trim();
    
    // Check main data first
    if (TEAM_DATA[input]) return input;

    // Check mappings
    if (TEAM_ID_MAP[input]) return TEAM_ID_MAP[input];

    // Partial match fallback (Slower but robust)
    for (const key in TEAM_ID_MAP) {
        if (input.includes(key)) return TEAM_ID_MAP[key];
    }
    // Also check against city/names in TEAM_DATA
    for (const team of Object.values(TEAM_DATA)) {
        if (input.includes(team.city.toLowerCase()) || input.includes(team.name.toLowerCase())) {
            return team.id;
        }
    }

    return 'unknown';
};

export const getTeamLogoUrl = (teamId: string): string => {
    const id = resolveTeamId(teamId);
    const editorUrl = editorLogoUrls.get(id);
    if (editorUrl) return editorUrl;
    return `/logos/${id}.svg`;
};

// [Critical] 항상 능력치 기반으로 OVR 동적 계산 (성장/퇴화 반영)
export const calculatePlayerOvr = (p: Player, position?: string): number => {
    return calculateOvr(p, position || p.position);
};

export const generateSeasonSchedule = (myTeamId: string): Game[] => {
    return [];
};

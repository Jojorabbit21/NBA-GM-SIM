
import { Game, Player, Team } from '../types';
import { calculateOvr } from './ovrUtils';
import { TEAM_DATA, TeamStaticData } from '../data/teamData';
import { TEAM_ID_MAP } from '../data/mappings';

export const SEASON_START_DATE = '2025-10-20';
export const TRADE_DEADLINE = '2026-02-06';

// League Financial Constants ($M)
export const LEAGUE_FINANCIALS = {
    SALARY_CAP: 140,
    TAX_LEVEL: 170,
    FIRST_APRON: 178,
    SECOND_APRON: 189
};

// Calendar Events
export const CALENDAR_EVENTS = {
    ALL_STAR_START: '2026-02-13',
    ALL_STAR_END: '2026-02-18'
};

// Adapter for existing code using TEAM_OWNERS
export const TEAM_OWNERS: Record<string, string> = Object.values(TEAM_DATA).reduce((acc, team) => {
    acc[team.id] = team.owner;
    return acc;
}, {} as Record<string, string>);

// Adapter for existing code using FALLBACK_TEAMS
export const FALLBACK_TEAMS = Object.values(TEAM_DATA).map((t: TeamStaticData) => ({
    id: t.id,
    city: t.city,
    name: t.name,
    conference: t.conference,
    division: t.division
}));

export const INITIAL_STATS = () => ({
    g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
    fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
    rimM: 0, rimA: 0, midM: 0, midA: 0,
    pf: 0,
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
    return `/logos/${id}.svg`;
};

// [Critical] Import OVR calc from logic file to ensure consistency
export const calculatePlayerOvr = (p: Player, position?: string): number => {
    return calculateOvr(p, position || p.position);
};

export const generateSeasonSchedule = (myTeamId: string): Game[] => {
    return [];
};

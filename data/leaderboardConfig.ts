
// Types
export type SortKey = string;
export type ViewMode = 'Players' | 'Teams';
export type StatCategory = 'Traditional' | 'Shooting' | 'Advanced' | 'Opponent';
export type Operator = '>' | '<' | '>=' | '<=' | '=';

export interface FilterItem {
    id: string;
    type: 'stat' | 'date';
    category?: string;
    operator?: Operator;
    value?: number | string;
    label: string;
}

export interface ColumnDef {
    key: string;
    label: string;
    width: number;
    sortable?: boolean;
    isHeatmap?: boolean;
    isInverse?: boolean; // Lower is better (TOV, PA, etc)
    format?: 'number' | 'percent' | 'string' | 'custom';
    stickyLeft?: number; // Pixel value for sticky positioning
    stickyShadow?: boolean; // Show shadow on this sticky column
    category?: StatCategory | 'Common'; // Which tab this column belongs to
}

// Column Widths
export const WIDTHS = {
    RANK: 50,
    NAME: 200,
    POS: 50,
    OVR: 50,
    STAT: 55,
    PCT: 60,
    ZONE: 45, // Narrower for dense zone stats
    W: 40,
    L: 40,
};

// Filter Options - Traditional
export const TRADITIONAL_STAT_OPTIONS = [
    { value: 'pts', label: 'PTS' },
    { value: 'reb', label: 'REB' },
    { value: 'oreb', label: 'OREB' },
    { value: 'dreb', label: 'DREB' },
    { value: 'ast', label: 'AST' },
    { value: 'stl', label: 'STL' },
    { value: 'blk', label: 'BLK' },
    { value: 'tov', label: 'TOV' },
    { value: 'fgm', label: 'FGM' },
    { value: 'fga', label: 'FGA' },
    { value: 'fg%', label: 'FG%' },
    { value: '3pm', label: '3PM' },
    { value: '3pa', label: '3PA' },
    { value: '3p%', label: '3P%' },
    { value: 'ftm', label: 'FTM' },
    { value: 'fta', label: 'FTA' },
    { value: 'ts%', label: 'TS%' },
    { value: 'ovr', label: 'OVR' },
];

// Filter Options - Advanced
export const ADVANCED_STAT_OPTIONS = [
    { value: 'ts%', label: 'TS%' },
    { value: 'efg%', label: 'eFG%' },
    { value: 'tov%', label: 'TOV%' },
    { value: 'usg%', label: 'USG%' },
    { value: 'ast%', label: 'AST%' },
    { value: 'orb%', label: 'ORB%' },
    { value: 'drb%', label: 'DRB%' },
    { value: 'trb%', label: 'TRB%' },
    { value: 'stl%', label: 'STL%' },
    { value: 'blk%', label: 'BLK%' },
    { value: '3par', label: '3PAr' },
    { value: 'ftr', label: 'FTr' },
];

// Filter Options - Opponent
export const OPPONENT_STAT_OPTIONS = [
    { value: 'opp_pts', label: 'Opp PTS' },
    { value: 'opp_fg%', label: 'Opp FG%' },
    { value: 'opp_3p%', label: 'Opp 3P%' },
    { value: 'opp_ast', label: 'Opp AST' },
    { value: 'opp_reb', label: 'Opp REB' },
    { value: 'opp_oreb', label: 'Opp OREB' },
    { value: 'opp_stl', label: 'Opp STL' },
    { value: 'opp_blk', label: 'Opp BLK' },
    { value: 'opp_tov', label: 'Opp TOV' },
    { value: 'opp_pf', label: 'Opp PF' },
];

// Zone Definitions
const ZONES = [
    { key: 'zone_rim', label: 'RIM' },
    { key: 'zone_paint', label: 'PNT' },
    { key: 'zone_mid_l', label: 'MID-L' },
    { key: 'zone_mid_c', label: 'MID-C' },
    { key: 'zone_mid_r', label: 'MID-R' },
    { key: 'zone_c3_l', label: 'C3-L' },
    { key: 'zone_c3_r', label: 'C3-R' },
    { key: 'zone_atb3_l', label: 'ATB-L' },
    { key: 'zone_atb3_c', label: 'ATB-C' },
    { key: 'zone_atb3_r', label: 'ATB-R' },
];

// Filter Options - Shooting (Generated from Zones)
export const SHOOTING_STAT_OPTIONS = ZONES.flatMap(z => [
    { value: `${z.key}_m`, label: `${z.label} Makes` },
    { value: `${z.key}_a`, label: `${z.label} Attempts` },
    { value: `${z.key}_pct`, label: `${z.label} %` },
]);

// Helper to generate shooting columns
const generateShootingColumns = (): ColumnDef[] => {
    const cols: ColumnDef[] = [];
    // [Updated] Removed PTS and TS% from Shooting columns as requested

    ZONES.forEach(z => {
        cols.push(
            { key: `${z.key}_m`, label: `${z.label} M`, width: WIDTHS.ZONE, sortable: true, isHeatmap: true, category: 'Shooting', format: 'number' },
            { key: `${z.key}_a`, label: `${z.label} A`, width: WIDTHS.ZONE, sortable: true, isHeatmap: true, category: 'Shooting', format: 'number' },
            { key: `${z.key}_pct`, label: `${z.label} %`, width: WIDTHS.ZONE + 10, sortable: true, isHeatmap: true, category: 'Shooting', format: 'percent' }
        );
    });

    return cols;
};

const SHOOTING_COLUMNS = generateShootingColumns();

// Advanced Columns
const ADVANCED_COLUMNS: ColumnDef[] = [
    { key: 'ts%', label: 'TS%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'percent' },
    { key: 'efg%', label: 'eFG%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'percent' },
    { key: 'tov%', label: 'TOV%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, isInverse: true, category: 'Advanced', format: 'percent' },
    { key: 'usg%', label: 'USG%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'percent' },
    { key: 'ast%', label: 'AST%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'percent' },
    { key: 'orb%', label: 'ORB%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'percent' },
    { key: 'drb%', label: 'DRB%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'percent' },
    { key: 'trb%', label: 'TRB%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'percent' },
    { key: 'stl%', label: 'STL%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'percent' },
    { key: 'blk%', label: 'BLK%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'percent' },
    { key: '3par', label: '3PAr', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'percent' },
    { key: 'ftr', label: 'FTr', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'percent' },
];

// Opponent Columns (Teams Only)
const OPPONENT_COLUMNS: ColumnDef[] = [
    { key: 'opp_pts', label: 'Opp PTS', width: WIDTHS.STAT, sortable: true, isHeatmap: true, isInverse: true, category: 'Opponent', format: 'number' },
    { key: 'opp_fg%', label: 'Opp FG%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, isInverse: true, category: 'Opponent', format: 'percent' },
    { key: 'opp_3p%', label: 'Opp 3P%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, isInverse: true, category: 'Opponent', format: 'percent' },
    { key: 'opp_ast', label: 'Opp AST', width: WIDTHS.STAT, sortable: true, isHeatmap: true, isInverse: true, category: 'Opponent', format: 'number' },
    { key: 'opp_reb', label: 'Opp REB', width: WIDTHS.STAT, sortable: true, isHeatmap: true, isInverse: true, category: 'Opponent', format: 'number' },
    { key: 'opp_oreb', label: 'Opp OREB', width: WIDTHS.STAT, sortable: true, isHeatmap: true, isInverse: true, category: 'Opponent', format: 'number' },
    { key: 'opp_stl', label: 'Opp STL', width: WIDTHS.STAT, sortable: true, isHeatmap: true, isInverse: true, category: 'Opponent', format: 'number' },
    { key: 'opp_blk', label: 'Opp BLK', width: WIDTHS.STAT, sortable: true, isHeatmap: true, isInverse: true, category: 'Opponent', format: 'number' },
    { key: 'opp_tov', label: 'Opp TOV', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Opponent', format: 'number' }, // High opp TOV is good for us
    { key: 'opp_pf', label: 'Opp PF', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Opponent', format: 'number' }, // High opp PF is good for us
];


// Column Definitions for Players
export const PLAYER_COLUMNS: ColumnDef[] = [
    // Sticky Columns
    { key: 'rank', label: '#', width: WIDTHS.RANK, stickyLeft: 0, category: 'Common' },
    { key: 'name', label: 'PLAYER', width: WIDTHS.NAME, sortable: true, stickyLeft: WIDTHS.RANK, category: 'Common' },
    { key: 'position', label: 'POS', width: WIDTHS.POS, sortable: true, stickyLeft: WIDTHS.RANK + WIDTHS.NAME, category: 'Common' },
    { key: 'ovr', label: 'OVR', width: WIDTHS.OVR, sortable: true, stickyLeft: WIDTHS.RANK + WIDTHS.NAME + WIDTHS.POS, stickyShadow: true, category: 'Common' },
    
    // [Updated] Moved G and MP to Traditional category so they are hidden in Shooting view
    { key: 'g', label: 'G', width: WIDTHS.STAT, sortable: true, category: 'Traditional' },
    { key: 'mp', label: 'MIN', width: WIDTHS.STAT, sortable: true, category: 'Traditional', format: 'number' },

    // Traditional Stats
    { key: 'pts', label: 'PTS', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'oreb', label: 'OREB', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'dreb', label: 'DREB', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'reb', label: 'REB', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'ast', label: 'AST', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'stl', label: 'STL', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'blk', label: 'BLK', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'tov', label: 'TOV', width: WIDTHS.STAT, sortable: true, isHeatmap: true, isInverse: true, category: 'Traditional', format: 'number' },
    { key: 'fg%', label: 'FG%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: '3p%', label: '3P%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: 'ft%', label: 'FT%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: 'ts%', label: 'TS%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: 'pm', label: '+/-', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },

    // Shooting Stats
    ...SHOOTING_COLUMNS,

    // Advanced Stats
    ...ADVANCED_COLUMNS
];

// Advanced Columns for Teams (USG%/ORB%/DRB%/TRB% 는 선수 전용 지표이므로 제외, POSS/PACE 추가)
const TEAMS_ADVANCED_COLUMNS: ColumnDef[] = [
    ...ADVANCED_COLUMNS.filter(col => !['usg%', 'orb%', 'drb%', 'trb%'].includes(col.key)),
    { key: 'poss', label: 'POSS', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'number' },
    { key: 'pace', label: 'PACE', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'number' },
];

// Column Definitions for Teams
export const TEAM_COLUMNS: ColumnDef[] = [
    // Sticky
    { key: 'rank', label: '#', width: WIDTHS.RANK, stickyLeft: 0, category: 'Common' },
    { key: 'name', label: 'TEAM NAME', width: WIDTHS.NAME, sortable: true, stickyLeft: WIDTHS.RANK, stickyShadow: true, category: 'Common' },

    // Common
    { key: 'wins', label: 'W', width: WIDTHS.W, sortable: true, isHeatmap: true, category: 'Common' },
    { key: 'losses', label: 'L', width: WIDTHS.L, sortable: true, isHeatmap: true, isInverse: true, category: 'Common' },
    { key: 'winPct', label: 'WIN%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Common', format: 'string' }, // .305 style

    // Traditional
    { key: 'pts', label: 'PTS', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'pa', label: 'PA', width: WIDTHS.STAT, sortable: true, isHeatmap: true, isInverse: true, category: 'Traditional', format: 'number' },
    { key: 'oreb', label: 'OREB', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'dreb', label: 'DREB', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'reb', label: 'REB', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'ast', label: 'AST', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'stl', label: 'STL', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'blk', label: 'BLK', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },
    { key: 'tov', label: 'TOV', width: WIDTHS.STAT, sortable: true, isHeatmap: true, isInverse: true, category: 'Traditional', format: 'number' },
    { key: 'fg%', label: 'FG%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: '3p%', label: '3P%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: 'ft%', label: 'FT%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: 'ts%', label: 'TS%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: 'pm', label: '+/-', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },

    // Shooting
    ...SHOOTING_COLUMNS,

    // Advanced (Teams 전용 컬럼셋)
    ...TEAMS_ADVANCED_COLUMNS,

    // Opponent
    ...OPPONENT_COLUMNS
];

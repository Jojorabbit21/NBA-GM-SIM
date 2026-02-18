
// Types
export type SortKey = string;
export type ViewMode = 'Players' | 'Teams';
export type StatCategory = 'Traditional' | 'Shooting';
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
    STAT: 50,
    PCT: 60,
    ZONE: 65,
    W: 40,
    L: 40,
};

// Filter Options
export const STAT_OPTIONS = [
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
    { value: 'rim%', label: 'RIM%' },
    { value: 'mid%', label: 'MID%' },
    { value: 'ovr', label: 'OVR' },
];

// Column Definitions for Players
export const PLAYER_COLUMNS: ColumnDef[] = [
    // Sticky Columns
    { key: 'rank', label: '#', width: WIDTHS.RANK, stickyLeft: 0, category: 'Common' },
    { key: 'name', label: 'PLAYER', width: WIDTHS.NAME, sortable: true, stickyLeft: WIDTHS.RANK, category: 'Common' },
    { key: 'position', label: 'POS', width: WIDTHS.POS, sortable: true, stickyLeft: WIDTHS.RANK + WIDTHS.NAME, category: 'Common' },
    { key: 'ovr', label: 'OVR', width: WIDTHS.OVR, sortable: true, stickyLeft: WIDTHS.RANK + WIDTHS.NAME + WIDTHS.POS, stickyShadow: true, category: 'Common' },
    
    // Common Stats
    { key: 'g', label: 'G', width: WIDTHS.STAT, sortable: true, category: 'Common' },
    { key: 'mp', label: 'MIN', width: WIDTHS.STAT, sortable: true, category: 'Common', format: 'number' },

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
    { key: 'pts', label: 'PTS', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Shooting', format: 'number' },
    { key: 'rimM', label: 'RIM M/A', width: WIDTHS.ZONE, category: 'Shooting', format: 'custom' },
    { key: 'rim%', label: 'RIM%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Shooting', format: 'percent' },
    { key: 'midM', label: 'MID M/A', width: WIDTHS.ZONE, category: 'Shooting', format: 'custom' },
    { key: 'mid%', label: 'MID%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Shooting', format: 'percent' },
    { key: '3pM', label: '3PT M/A', width: WIDTHS.ZONE, category: 'Shooting', format: 'custom' },
    { key: '3p%', label: '3P%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Shooting', format: 'percent' },
    { key: 'ts%', label: 'TS%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Shooting', format: 'percent' },
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
    { key: 'pts', label: 'PTS', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Shooting', format: 'number' },
    { key: 'rimM', label: 'RIM M/A', width: WIDTHS.ZONE, category: 'Shooting', format: 'custom' },
    { key: 'rim%', label: 'RIM%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Shooting', format: 'percent' },
    { key: 'midM', label: 'MID M/A', width: WIDTHS.ZONE, category: 'Shooting', format: 'custom' },
    { key: 'mid%', label: 'MID%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Shooting', format: 'percent' },
    { key: '3pM', label: '3PT M/A', width: WIDTHS.ZONE, category: 'Shooting', format: 'custom' },
    { key: '3p%', label: '3P%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Shooting', format: 'percent' },
    { key: 'ts%', label: 'TS%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Shooting', format: 'percent' },
];

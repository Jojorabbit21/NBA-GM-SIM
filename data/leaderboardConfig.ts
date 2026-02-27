
// Types
export type SortKey = string;
export type ViewMode = 'Players' | 'Teams';
export type StatCategory = 'Traditional' | 'Shooting' | 'Advanced' | 'Opponent' | 'Attributes';
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
    playerProp?: string; // For Attributes columns: the actual Player object property name (when key differs)
    attrGroup?: string; // Attributes 탭 전용: 카테고리 그룹 (OVERALL, INSIDE, OUTSIDE 등)
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
    { value: 'pf', label: 'PF' },
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
    { value: 'ortg', label: 'ORTG' },
    { value: 'drtg', label: 'DRTG' },
    { value: 'nrtg', label: 'NRTG' },
    { value: 'tf', label: 'TF' },
    { value: 'ff', label: 'FF' },
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

// Filter Options - Attributes
export const ATTRIBUTES_STAT_OPTIONS = [
    { value: 'ins', label: 'INS' },
    { value: 'out', label: 'OUT' },
    { value: 'ath', label: 'ATH' },
    { value: 'plm', label: 'PLM' },
    { value: 'def', label: 'DEF' },
    { value: 'attr_reb', label: 'REB' },
    { value: 'layup', label: 'Layup' },
    { value: 'dunk', label: 'Dunk' },
    { value: 'closeShot', label: 'Close Shot' },
    { value: 'postPlay', label: 'Post Play' },
    { value: 'hands', label: 'Hands' },
    { value: 'drawFoul', label: 'Draw Foul' },
    { value: 'midRange', label: 'Mid Range' },
    { value: 'threeTop', label: '3PT Top' },
    { value: 'three45', label: '3PT 45°' },
    { value: 'threeCorner', label: '3PT Corner' },
    { value: 'ft', label: 'Free Throw' },
    { value: 'shotIq', label: 'Shot IQ' },
    { value: 'offConsist', label: 'Off Consistency' },
    { value: 'passAcc', label: 'Pass Acc' },
    { value: 'handling', label: 'Handling' },
    { value: 'spdBall', label: 'Spd w/ Ball' },
    { value: 'passIq', label: 'Pass IQ' },
    { value: 'passVision', label: 'Pass Vision' },
    { value: 'intDef', label: 'Interior Def' },
    { value: 'perDef', label: 'Perimeter Def' },
    { value: 'steal', label: 'Steal' },
    { value: 'attr_blk', label: 'Block' },
    { value: 'helpDefIq', label: 'Help Def' },
    { value: 'passPerc', label: 'Pass Perception' },
    { value: 'defConsist', label: 'Def Consistency' },
    { value: 'offReb', label: 'Off Rebound' },
    { value: 'defReb', label: 'Def Rebound' },
    { value: 'speed', label: 'Speed' },
    { value: 'agility', label: 'Agility' },
    { value: 'strength', label: 'Strength' },
    { value: 'vertical', label: 'Vertical' },
    { value: 'stamina', label: 'Stamina' },
    { value: 'hustle', label: 'Hustle' },
    { value: 'durability', label: 'Durability' },
];

// Attribute key → Player property mapping (only needed when they differ)
export const ATTR_PLAYER_PROPS: Record<string, string> = {
    'attr_reb': 'reb',
    'attr_blk': 'blk',
};

// All attribute column keys (used by hooks for detection)
export const ATTRIBUTE_KEYS = new Set([
    'ins', 'out', 'ath', 'plm', 'def', 'attr_reb',
    'layup', 'dunk', 'closeShot', 'postPlay', 'hands', 'drawFoul',
    'midRange', 'threeTop', 'three45', 'threeCorner', 'ft', 'shotIq', 'offConsist',
    'passAcc', 'handling', 'spdBall', 'passIq', 'passVision',
    'intDef', 'perDef', 'steal', 'attr_blk', 'helpDefIq', 'passPerc', 'defConsist',
    'offReb', 'defReb',
    'speed', 'agility', 'strength', 'vertical', 'stamina', 'hustle', 'durability',
]);

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
    { key: 'tf', label: 'TF', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'number' },
    { key: 'ff', label: 'FF', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'number' },
];

// Attributes Columns (Players Only)
const ATTR_W = 44; // Narrower for dense attribute ratings
const ATTRIBUTES_COLUMNS: ColumnDef[] = [
    // Overall
    { key: 'ins',      label: 'INS',     width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OVERALL' },
    { key: 'out',      label: 'OUT',     width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OVERALL' },
    { key: 'ath',      label: 'ATH',     width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OVERALL' },
    { key: 'plm',      label: 'PLM',     width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OVERALL' },
    { key: 'def',      label: 'DEF',     width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OVERALL' },
    { key: 'attr_reb', label: 'REB',     width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OVERALL', playerProp: 'reb' },
    // Inside / Finishing
    { key: 'layup',     label: 'LAY',    width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'INSIDE' },
    { key: 'dunk',      label: 'DNK',    width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'INSIDE' },
    { key: 'closeShot', label: 'CLOSE',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'INSIDE' },
    { key: 'postPlay',  label: 'POST',   width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'INSIDE' },
    { key: 'hands',     label: 'HAND',   width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'INSIDE' },
    { key: 'drawFoul',  label: 'DRAW',   width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'INSIDE' },
    // Outside Shooting
    { key: 'midRange',    label: 'MID',    width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OUTSIDE' },
    { key: 'threeTop',    label: '3PT-T',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OUTSIDE' },
    { key: 'three45',     label: '3PT-45', width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OUTSIDE' },
    { key: 'threeCorner', label: '3PT-C',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OUTSIDE' },
    { key: 'ft',          label: 'FT',     width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OUTSIDE' },
    { key: 'shotIq',      label: 'SHT IQ', width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OUTSIDE' },
    { key: 'offConsist',  label: 'O-CON',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'OUTSIDE' },
    // Playmaking
    { key: 'passAcc',    label: 'PASS',   width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'PLAYMAKING' },
    { key: 'handling',   label: 'HANDL',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'PLAYMAKING' },
    { key: 'spdBall',    label: 'SPDBL',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'PLAYMAKING' },
    { key: 'passIq',     label: 'PSS IQ', width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'PLAYMAKING' },
    { key: 'passVision', label: 'VISN',   width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'PLAYMAKING' },
    // Defense
    { key: 'intDef',     label: 'INT-D',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'DEFENSE' },
    { key: 'perDef',     label: 'PER-D',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'DEFENSE' },
    { key: 'steal',      label: 'STL-R',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'DEFENSE' },
    { key: 'attr_blk',   label: 'BLK-R',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'DEFENSE', playerProp: 'blk' },
    { key: 'helpDefIq',  label: 'H-DEF',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'DEFENSE' },
    { key: 'passPerc',   label: 'P-PRC',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'DEFENSE' },
    { key: 'defConsist', label: 'D-CON',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'DEFENSE' },
    // Rebounding
    { key: 'offReb',  label: 'OREB',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'REBOUND' },
    { key: 'defReb',  label: 'DREB',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'REBOUND' },
    // Athleticism
    { key: 'speed',      label: 'SPD',   width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'ATHLETIC' },
    { key: 'agility',    label: 'AGI',   width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'ATHLETIC' },
    { key: 'strength',   label: 'STR',   width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'ATHLETIC' },
    { key: 'vertical',   label: 'VERT',  width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'ATHLETIC' },
    { key: 'stamina',    label: 'STA',   width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'ATHLETIC' },
    { key: 'hustle',     label: 'HST',   width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'ATHLETIC' },
    { key: 'durability', label: 'DUR',   width: ATTR_W, sortable: true, category: 'Attributes', attrGroup: 'ATHLETIC' },
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
    { key: 'pf', label: 'PF', width: WIDTHS.STAT, sortable: true, isHeatmap: true, isInverse: true, category: 'Traditional', format: 'number' },
    { key: 'fg%', label: 'FG%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: '3p%', label: '3P%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: 'ft%', label: 'FT%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: 'ts%', label: 'TS%', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'percent' },
    { key: 'pm', label: '+/-', width: WIDTHS.STAT, sortable: true, isHeatmap: true, category: 'Traditional', format: 'number' },

    // Shooting Stats
    ...SHOOTING_COLUMNS,

    // Advanced Stats
    ...ADVANCED_COLUMNS,

    // Attributes (Players Only)
    ...ATTRIBUTES_COLUMNS
];

// Advanced Columns for Teams (USG%/ORB%/DRB%/TRB% 는 선수 전용 지표이므로 제외, POSS/PACE/ORTG/DRTG/NRTG 추가)
const TEAMS_ADVANCED_COLUMNS: ColumnDef[] = [
    ...ADVANCED_COLUMNS.filter(col => !['usg%', 'orb%', 'drb%', 'trb%'].includes(col.key)),
    { key: 'ortg', label: 'ORTG', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'number' },
    { key: 'drtg', label: 'DRTG', width: WIDTHS.PCT, sortable: true, isHeatmap: true, isInverse: true, category: 'Advanced', format: 'number' },
    { key: 'nrtg', label: 'NRTG', width: WIDTHS.PCT, sortable: true, isHeatmap: true, category: 'Advanced', format: 'number' },
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

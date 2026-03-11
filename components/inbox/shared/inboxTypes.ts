export type SortKey = 'default' | 'mp' | 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'fgm' | 'fg%' | 'p3m' | '3p%' | 'ftm' | 'ft%' | 'pm';

export type ChampStatTab = 'Traditional' | 'Advanced';
export type TeamStatTab = 'Traditional' | 'Advanced' | 'Opponent';

export type StatColDef = { key: string; label: string; fmt: 'num' | 'pct' | 'diff'; inv?: boolean };

import type { ChampStatTab, TeamStatTab, StatColDef } from './inboxTypes';

export const CHAMP_TAB_LABELS: Record<ChampStatTab, string> = { Traditional: '기본', Advanced: '어드밴스드' };

export const SR_TAB_LABELS: Record<TeamStatTab, string> = {
    Traditional: '기본',
    Advanced: '어드밴스드',
    Opponent: '상대팀',
};

export const SR_TEAM_COLS: Record<TeamStatTab, StatColDef[]> = {
    Traditional: [
        { key: 'pts', label: 'PTS', fmt: 'num' }, { key: 'pa', label: 'PA', fmt: 'num', inv: true },
        { key: 'reb', label: 'REB', fmt: 'num' }, { key: 'ast', label: 'AST', fmt: 'num' },
        { key: 'stl', label: 'STL', fmt: 'num' }, { key: 'blk', label: 'BLK', fmt: 'num' },
        { key: 'tov', label: 'TOV', fmt: 'num', inv: true },
        { key: 'fg%', label: 'FG%', fmt: 'pct' }, { key: '3p%', label: '3P%', fmt: 'pct' },
        { key: 'ft%', label: 'FT%', fmt: 'pct' }, { key: 'pm', label: '+/-', fmt: 'diff' },
    ],
    Advanced: [
        { key: 'ts%', label: 'TS%', fmt: 'pct' }, { key: 'efg%', label: 'eFG%', fmt: 'pct' },
        { key: 'tov%', label: 'TOV%', fmt: 'pct', inv: true }, { key: 'ast%', label: 'AST%', fmt: 'pct' },
        { key: 'stl%', label: 'STL%', fmt: 'pct' }, { key: 'blk%', label: 'BLK%', fmt: 'pct' },
        { key: '3par', label: '3PAr', fmt: 'pct' }, { key: 'ftr', label: 'FTr', fmt: 'pct' },
        { key: 'ortg', label: 'ORTG', fmt: 'num' }, { key: 'drtg', label: 'DRTG', fmt: 'num', inv: true },
        { key: 'nrtg', label: 'NRTG', fmt: 'diff' },
        { key: 'poss', label: 'POSS', fmt: 'num' }, { key: 'pace', label: 'PACE', fmt: 'num' },
    ],
    Opponent: [
        { key: 'opp_pts', label: 'PTS', fmt: 'num', inv: true }, { key: 'opp_fg%', label: 'FG%', fmt: 'pct', inv: true },
        { key: 'opp_3p%', label: '3P%', fmt: 'pct', inv: true }, { key: 'opp_ast', label: 'AST', fmt: 'num', inv: true },
        { key: 'opp_reb', label: 'REB', fmt: 'num', inv: true }, { key: 'opp_oreb', label: 'OREB', fmt: 'num', inv: true },
        { key: 'opp_stl', label: 'STL', fmt: 'num', inv: true }, { key: 'opp_blk', label: 'BLK', fmt: 'num', inv: true },
        { key: 'opp_tov', label: 'TOV', fmt: 'num' }, { key: 'opp_pf', label: 'PF', fmt: 'num' },
    ],
};

export const CHAMP_TEAM_COLS: Record<ChampStatTab, StatColDef[]> = {
    Traditional: SR_TEAM_COLS.Traditional,
    Advanced: SR_TEAM_COLS.Advanced,
};

export const HOF_SCORE_COLS = [
    { key: 'total', label: '총점' },
    { key: 'season', label: '정규시즌' },
    { key: 'ptDiff', label: '득실차' },
    { key: 'stat', label: '팀 스탯' },
    { key: 'playoff', label: '플레이오프' },
];

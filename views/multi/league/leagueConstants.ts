
export const TIER_LABEL: Record<string, string> = {
    d1: 'D1',
    d2: 'D2',
    d3: 'D3',
};

export const STATUS_LABEL: Record<string, string> = {
    recruiting:  '모집 중',
    drafting:    '드래프트 중',
    in_progress: '시즌 진행',
    finished:    '종료',
};

export const TOURNAMENT_FORMAT_LABEL: Record<string, string> = {
    single_elim:  '싱글 엘리미',
    double_elim:  '더블 엘리미',
    round_robin:  '라운드 로빈',
};

export const MATCH_FORMAT_LABEL: Record<string, string> = {
    best_of_1: '단판',
    best_of_3: '3전 2선승',
    best_of_7: '7전 4선승',
};

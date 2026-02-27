
/**
 * 선수 능력치 그룹/라벨 공유 설정 (Single Source of Truth)
 * 사용처: RosterGrid, LeaderboardConfig, PlayerDetailModal
 */

export interface AttrGroupDef {
    id: string;
    label: string;
    keys: string[];
}

/** 능력치 카테고리 그룹 — 각 그룹의 첫 번째 키는 카테고리 평균 */
export const ATTR_GROUPS: AttrGroupDef[] = [
    { id: 'INS', label: 'INSIDE', keys: ['ins', 'closeShot', 'layup', 'dunk', 'postPlay', 'drawFoul', 'hands'] },
    { id: 'OUT', label: 'OUTSIDE', keys: ['out', 'midRange', 'threeCorner', 'three45', 'threeTop', 'ft', 'shotIq', 'offConsist'] },
    { id: 'PLM', label: 'PLAYMAKING', keys: ['plm', 'passAcc', 'handling', 'spdBall', 'passVision', 'passIq'] },
    { id: 'DEF', label: 'DEFENSE', keys: ['def', 'intDef', 'perDef', 'steal', 'blk', 'helpDefIq', 'passPerc', 'defConsist'] },
    { id: 'REB', label: 'REBOUND', keys: ['reb', 'offReb', 'defReb'] },
    { id: 'ATH', label: 'ATHLETIC', keys: ['ath', 'speed', 'agility', 'strength', 'vertical', 'stamina', 'hustle', 'durability'] },
];

/** 카테고리 평균 키 세트 */
export const ATTR_AVG_KEYS = new Set(['ins', 'out', 'plm', 'def', 'reb', 'ath']);

/** 컬럼 헤더 짧은 라벨 (roster & leaderboard 공유) */
export const ATTR_LABEL: Record<string, string> = {
    // Category averages
    ins: 'AVG', out: 'AVG', plm: 'AVG', def: 'AVG', reb: 'AVG', ath: 'AVG',
    // Inside
    closeShot: 'CLS', layup: 'LAY', dunk: 'DNK', postPlay: 'POST', drawFoul: 'DRAW', hands: 'HAND',
    // Outside
    midRange: 'MID', threeCorner: '3C', three45: '3-45', threeTop: '3T', ft: 'FT', shotIq: 'SIQ', offConsist: 'OCON',
    // Playmaking
    passAcc: 'PASS', handling: 'HNDL', spdBall: 'SPDB', passVision: 'VISN', passIq: 'PIQ',
    // Defense
    intDef: 'INTD', perDef: 'PERD', steal: 'STL', blk: 'BLK', helpDefIq: 'HELP', passPerc: 'PPRC', defConsist: 'DCON',
    // Rebound
    offReb: 'OREB', defReb: 'DREB',
    // Athletic
    speed: 'SPD', agility: 'AGI', strength: 'STR', vertical: 'VERT', stamina: 'STA', hustle: 'HST', durability: 'DUR',
};

/** 전체 능력치 이름 — 툴팁용 (한국어 + 영어) */
export const ATTR_NAME_MAP: Record<string, string> = {
    ins: '인사이드 득점 평균 (Inside Scoring Avg)',
    closeShot: '근접 슛 (Close Shot)',
    layup: '레이업 (Layup)',
    dunk: '덩크 (Dunk)',
    postPlay: '포스트 플레이 (Post Play)',
    drawFoul: '파울 유도 (Draw Foul)',
    hands: '핸즈 (Hands)',
    out: '외곽 득점 평균 (Outside Scoring Avg)',
    midRange: '중거리 슛 (Mid-Range)',
    threeCorner: '코너 3점 (Corner 3pt)',
    three45: '45도 3점 (45° 3pt)',
    threeTop: '탑 3점 (Top 3pt)',
    ft: '자유투 (Free Throw)',
    shotIq: '슛 지능 (Shot IQ)',
    offConsist: '공격 기복 (Offensive Consistency)',
    plm: '플레이메이킹 평균 (Playmaking Avg)',
    passAcc: '패스 정확도 (Pass Accuracy)',
    handling: '볼 핸들링 (Ball Handling)',
    spdBall: '볼 핸들링 속도 (Speed with Ball)',
    passVision: '시야 (Pass Vision)',
    passIq: '패스 지능 (Pass IQ)',
    def: '수비 평균 (Defense Avg)',
    intDef: '내곽 수비 (Interior Defense)',
    perDef: '외곽 수비 (Perimeter Defense)',
    steal: '스틸 (Steal)',
    blk: '블록 (Block)',
    helpDefIq: '헬프 수비 지능 (Help Def IQ)',
    passPerc: '패스 차단 (Pass Perception)',
    defConsist: '수비 기복 (Defensive Consistency)',
    reb: '리바운드 평균 (Rebound Avg)',
    offReb: '공격 리바운드 (Offensive Rebound)',
    defReb: '수비 리바운드 (Defensive Rebound)',
    ath: '운동 능력 평균 (Athleticism Avg)',
    speed: '속도 (Speed)',
    agility: '민첩성 (Agility)',
    strength: '힘 (Strength)',
    vertical: '점프력 (Vertical)',
    stamina: '지구력 (Stamina)',
    hustle: '허슬 (Hustle)',
    durability: '내구도 (Durability)',
};

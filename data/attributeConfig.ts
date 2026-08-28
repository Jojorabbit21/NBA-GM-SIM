
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
    { id: 'PLM', label: 'PLAYMAKING', keys: ['plm', 'passAcc', 'handling', 'spdBall', 'passVision', 'passIq', 'offBallMovement'] },
    { id: 'DEF', label: 'DEFENSE', keys: ['def', 'intDef', 'perDef', 'steal', 'blk', 'helpDefIq', 'passPerc', 'defConsist'] },
    { id: 'REB', label: 'REBOUND', keys: ['reb', 'offReb', 'defReb', 'boxOut'] },
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
    passAcc: 'PASS', handling: 'HNDL', spdBall: 'SPDB', passVision: 'VISN', passIq: 'PIQ', offBallMovement: 'OBM',
    // Defense
    intDef: 'INTD', perDef: 'PERD', steal: 'STL', blk: 'BLK', helpDefIq: 'HELP', passPerc: 'PPRC', defConsist: 'DCON',
    // Rebound
    offReb: 'OREB', defReb: 'DREB', boxOut: 'BOX',
    // Athletic
    speed: 'SPD', agility: 'AGI', strength: 'STR', vertical: 'VERT', stamina: 'STA', hustle: 'HST', durability: 'DUR',
};

/** 능력치 한글 짧은 라벨 — PlayerDetailView 등 UI 표시용 */
export const ATTR_KR_LABEL: Record<string, string> = {
    // Category headers
    ins: '인사이드', out: '아웃사이드', plm: '패스&기회창출', def: '수비', reb: '리바운드', ath: '운동 능력',
    // Inside
    closeShot: '훅/플로터', layup: '레이업', dunk: '덩크', postPlay: '포스트 플레이', drawFoul: '파울 유도', hands: '볼 간수',
    // Outside
    midRange: '미드레인지', threeCorner: '코너 3점', three45: '윙 3점', threeTop: '탑 3점', ft: '자유투', shotIq: '슈팅 IQ', offConsist: '공격 일관성',
    // Playmaking
    passAcc: '패스 정확도', handling: '볼 핸들링', spdBall: '드리블 속도', passVision: '패스 시야', passIq: '패스 지능', offBallMovement: '오프볼 무브먼트',
    // Defense
    intDef: '인사이드 수비', perDef: '퍼리미터 수비', steal: '스틸', blk: '블락', helpDefIq: '도움 수비 지능', passPerc: '패스 경로 예측', defConsist: '수비 일관성',
    // Rebound
    offReb: '공격 리바운드', defReb: '수비 리바운드', boxOut: '박스아웃',
    // Athletic
    speed: '속도', agility: '민첩성', strength: '근력', vertical: '점프력', stamina: '지구력', hustle: '허슬', durability: '내구도',
};

// "능력치" 탭(RosterGrid)/리더보드 Attributes 카테고리/선수 프로필 능력치 위젯 전용 압축
// 컬럼 — 원래 36개 능력치를 21개로 줄인 표시 전용 뷰(사용자 요청). 여러 raw 능력치를
// 평균 내 하나로 합친 항목(sourceKeys.length > 1)과, 단일 능력치를 그대로 보여주는 항목이
// 섞여 있다. DraftView/시즌 리포트는 여전히 위의 ATTR_GROUPS(전체 36개)를 그대로 쓴다.
export interface CompactAttrItem {
    key: string;
    label: string;
    sourceKeys: string[];
    /** PlayerDetailView 등에서 쓸 한글 표시명 — 없으면 sourceKeys의 한글명을 "/"로 이어붙인다. */
    krLabel?: string;
}
export interface CompactAttrGroup { id: string; label: string; items: CompactAttrItem[] }

export const COMPACT_ATTR_GROUPS: CompactAttrGroup[] = [
    { id: 'INS', label: 'INSIDE', items: [
        { key: 'insCombo', label: 'INS', sourceKeys: ['closeShot', 'layup'], krLabel: '골밑 득점' },
        { key: 'dunk', label: 'DUNK', sourceKeys: ['dunk'] },
        { key: 'postPlay', label: 'POST', sourceKeys: ['postPlay'] },
    ] },
    { id: 'OUT', label: 'OUTSIDE', items: [
        { key: 'midRange', label: 'MID', sourceKeys: ['midRange'] },
        { key: 'threeCombo', label: '3PT', sourceKeys: ['threeCorner', 'three45', 'threeTop'], krLabel: '3점' },
        { key: 'ft', label: 'FT', sourceKeys: ['ft'] },
        { key: 'shotIq', label: 'SIQ', sourceKeys: ['shotIq'] },
    ] },
    { id: 'PLM', label: 'PLAYMAKING', items: [
        { key: 'passAcc', label: 'PASS', sourceKeys: ['passAcc'] },
        { key: 'handling', label: 'HNDL', sourceKeys: ['handling'] },
        { key: 'passIq', label: 'PIQ', sourceKeys: ['passIq'] },
    ] },
    { id: 'DEF', label: 'DEFENSE', items: [
        { key: 'intDef', label: 'INTD', sourceKeys: ['intDef'] },
        { key: 'perDef', label: 'PERD', sourceKeys: ['perDef'] },
        { key: 'steal', label: 'STL', sourceKeys: ['steal'] },
        { key: 'blk', label: 'BLK', sourceKeys: ['blk'] },
        { key: 'defConsist', label: 'DCON', sourceKeys: ['defConsist'] },
    ] },
    { id: 'REB', label: 'REBOUND', items: [
        { key: 'offReb', label: 'OREB', sourceKeys: ['offReb'] },
        { key: 'defReb', label: 'DREB', sourceKeys: ['defReb'] },
    ] },
    { id: 'ATH', label: 'ATHLETIC', items: [
        { key: 'spdCombo', label: 'SPD', sourceKeys: ['speed', 'agility'], krLabel: '속도' },
        { key: 'strength', label: 'STR', sourceKeys: ['strength'] },
        { key: 'vertical', label: 'VERT', sourceKeys: ['vertical'] },
        { key: 'stamina', label: 'STA', sourceKeys: ['stamina'] },
    ] },
];

/** 압축 항목 키 → 정의 (단일 항목 조회용) */
export const COMPACT_ITEM_BY_KEY: Record<string, CompactAttrItem> = Object.fromEntries(
    COMPACT_ATTR_GROUPS.flatMap(g => g.items).map(item => [item.key, item]),
);

/** 단일 능력치면 그 값 그대로, 복수(콤보)면 평균(반올림) — 표시/정렬/팀·리그 평균 계산에서 공통 사용. */
export function getCompactAttrValue(p: any, item: CompactAttrItem): number {
    const sum = item.sourceKeys.reduce((s, k) => s + (p[k] || 0), 0);
    return Math.round(sum / item.sourceKeys.length);
}

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
    offBallMovement: '오프볼 무브먼트 (Off-Ball Movement)',
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
    boxOut: '박스아웃 (Box Out)',
    ath: '운동 능력 평균 (Athleticism Avg)',
    speed: '속도 (Speed)',
    agility: '민첩성 (Agility)',
    strength: '힘 (Strength)',
    vertical: '점프력 (Vertical)',
    stamina: '지구력 (Stamina)',
    hustle: '허슬 (Hustle)',
    durability: '내구도 (Durability)',
};

// injuryGrades.ts — 부상 등급(GRADE 1~5) 정의 + 판정 로직 공용 모듈 (2026-09 재설계)
//
// stateUpdater.ts(경기 중 부상)와 fatigueSystem.ts(훈련 중 부상, 서버는 미사용 dead code지만
// 미러 유지)가 이 파일을 쓴다. 별도 파일로 뺀 이유: stateUpdater.ts가 이미 fatigueSystem.ts를
// import하고 있어서, fatigueSystem.ts가 stateUpdater.ts에서 직접 가져오면 A→B→A 순환
// 임포트가 된다(CLAUDE.md 규칙1).
//
// 미러 쌍: services/game/engine/injuryGrades.ts. 여길 고치면 거기도 같이 고칠 것.

export const GRADE_BASE_WEIGHT = [55, 27, 12, 4.5, 1.5];
export const GRADE_REF_DUR = 70;
export const GRADE_K_DUR = 0.03;

export interface GradeConfig {
    severity: 'Grade1' | 'Grade2' | 'Grade3' | 'Grade4' | 'Grade5';
    injuries: string[];
    durations: string[];
}

export const GRADE_CONFIG: GradeConfig[] = [
    // [2026-11-05] 경기 중(·훈련 중) 코트에서 생길 수 있는 부상만 남김 — 질병·만성 경직(감기·식중독·질병·허리 경직·목 경직)은
    //   경기 사이 부상으로 분리 예정. 뭉뚱그린 이름(타박상·열상·근육 파열·인대 파열·골절·어깨 부상)은 부위별 이름으로 세분화.
    //   등급 가중치·기간은 그대로라 등급 분포는 불변, 등급 안에서 뽑히는 이름만 달라진다.
    {
        severity: 'Grade1',
        injuries: ['무릎 통증', '팔꿈치 타박상', '정강이 타박상', '허벅지 타박상', '안면 타박상', '무릎 타박상', '어깨 타박상', '손 타박상', '발 타박상', '눈가 열상'],
        durations: ['1일', '3일', '1주'],
    },
    {
        severity: 'Grade2',
        injuries: ['발목 염좌', '무릎 염좌', '손가락 염좌', '손목 염좌', '고관절 타박상', '갈비뼈 타박상', '발가락 염좌', '손가락 골절', '코뼈 골절'],
        durations: ['2주', '3주', '1개월'],
    },
    {
        severity: 'Grade3',
        injuries: ['햄스트링 염좌', '종아리 염좌', '발목 인대 손상', '허리 경련', '어깨 탈구', '사타구니 염좌', '무릎 내측인대 염좌', '대퇴사두근 염좌', '안와골절', '엄지 인대 파열', '복사근 파열'],
        durations: ['1개월', '2개월', '3개월'],
    },
    {
        severity: 'Grade4',
        injuries: ['손목 골절', '발 골절', '족저근막 파열', '햄스트링 파열', '종아리 근육 파열', '대퇴사두근 파열', '사타구니 근육 파열', '무릎 내측인대 파열', '발목 인대 파열', '리스프랑 인대 파열', '어깨 관절와순 파열', '반월판 파열'],
        durations: ['3개월', '4개월', '6개월'],
    },
    {
        severity: 'Grade5',
        injuries: ['전방십자인대 파열', '후방십자인대 파열', '아킬레스건 파열', '정강이뼈 골절'],
        durations: ['10개월', '12개월', '14개월'],
    },
];

/**
 * [2026-11-05] 부상명 → 부위. 경기 중 PBP 문구("무릎 부위를 붙잡고…")와 진단 전 표시("무릎 부상")에 쓴다 —
 * 진단명은 경기 후 진단 발표 때 공개. 옛 저장 데이터의 이름(허리 경직 등)도 포함, 없는 이름은 getInjuryBodyPart가 null.
 */
export const INJURY_BODY_PART: Record<string, string> = {
    '무릎 통증': '무릎', '팔꿈치 타박상': '팔꿈치', '정강이 타박상': '정강이', '허벅지 타박상': '허벅지',
    '안면 타박상': '얼굴', '무릎 타박상': '무릎', '어깨 타박상': '어깨', '손 타박상': '손', '발 타박상': '발', '눈가 열상': '눈가',
    '발목 염좌': '발목', '무릎 염좌': '무릎', '손가락 염좌': '손가락', '손목 염좌': '손목', '고관절 타박상': '엉덩이',
    '갈비뼈 타박상': '옆구리', '발가락 염좌': '발가락', '손가락 골절': '손가락', '코뼈 골절': '코',
    '햄스트링 염좌': '햄스트링', '종아리 염좌': '종아리', '발목 인대 손상': '발목', '허리 경련': '허리', '어깨 탈구': '어깨',
    '사타구니 염좌': '사타구니', '무릎 내측인대 염좌': '무릎', '대퇴사두근 염좌': '허벅지', '안와골절': '눈가',
    '엄지 인대 파열': '엄지손가락', '복사근 파열': '옆구리',
    '손목 골절': '손목', '발 골절': '발', '족저근막 파열': '발바닥', '햄스트링 파열': '햄스트링', '종아리 근육 파열': '종아리',
    '대퇴사두근 파열': '허벅지', '사타구니 근육 파열': '사타구니', '무릎 내측인대 파열': '무릎', '발목 인대 파열': '발목',
    '리스프랑 인대 파열': '발', '어깨 관절와순 파열': '어깨',
    '전방십자인대 파열': '무릎', '후방십자인대 파열': '무릎', '아킬레스건 파열': '발뒤꿈치', '반월판 파열': '무릎', '정강이뼈 골절': '정강이',
    // 옛 이름(2026-11-05 이전 저장분)
    '어깨 부상': '어깨', '허리 경직': '허리', '목 경직': '목', '족저근막염 수술': '발바닥', '열상': '얼굴',
};

/** 걷기에 쓰는 부위 — 경기 중 문구에서 "절뚝이며"(하체) / "감싼 채"(상체)를 가른다. */
export const LOWER_BODY_PARTS = new Set(['무릎', '정강이', '허벅지', '발', '발목', '발가락', '엉덩이', '햄스트링', '종아리', '사타구니', '발바닥', '발뒤꿈치']);

export function getInjuryBodyPart(injuryType: string | null | undefined): string | null {
    if (!injuryType) return null;
    return INJURY_BODY_PART[injuryType] ?? null;
}

/** durability 기반 가중치 랜덤 선택(낮을수록 긴 기간에 가중). */
export function pickWeighted<T>(options: T[], dur: number): T {
    const n = options.length;
    const bias = (70 - dur) * 0.05;
    const weights = options.map((_, i) => {
        const normalized = i / (n - 1);
        return Math.max(0.1, 1 + bias * (normalized * 2 - 1));
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < n; i++) {
        roll -= weights[i];
        if (roll <= 0) return options[i];
    }
    return options[n - 1];
}

/**
 * 부상 등급(1~5) 결정 — "기본 확률 + 내구도 가산" 가중치 중 하나를 뽑는다.
 * @param severityMultiplier 등급 3 이상 가중치에 추가로 곱하는 배율(기본 1.0).
 */
export function pickInjuryGrade(
    dur: number,
    majorInjuryFrequency: number,
    severityMultiplier: number = 1.0,
): GradeConfig {
    const durBias = (GRADE_REF_DUR - dur) * GRADE_K_DUR;
    const weights = GRADE_BASE_WEIGHT.map((base, i) => {
        const severityIndex = i / (GRADE_BASE_WEIGHT.length - 1);
        let w = base * Math.max(0.05, 1 + durBias * (severityIndex * 2 - 1));
        if (i >= 2) w *= majorInjuryFrequency * severityMultiplier;
        return Math.max(0, w);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return GRADE_CONFIG[i];
    }
    return GRADE_CONFIG[GRADE_CONFIG.length - 1];
}

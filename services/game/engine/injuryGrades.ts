// injuryGrades.ts — 부상 등급(GRADE 1~5) 정의 + 판정 로직 공용 모듈 (2026-09 재설계)
//
// stateUpdater.ts(경기 중 부상)와 fatigueSystem.ts(휴식일 훈련 부상) 양쪽이 이 파일을 쓴다.
// 별도 파일로 뺀 이유: stateUpdater.ts가 이미 fatigueSystem.ts를 import하고 있어서,
// fatigueSystem.ts가 stateUpdater.ts에서 직접 가져오면 A→B→A 순환 임포트가 된다
// (CLAUDE.md 규칙1 — 공통 의존성은 별도 파일로 분리).
//
// 미러 쌍: server/src/shared/engine/injuryGrades.ts. 여길 고치면 거기도 같이 고칠 것.

/**
 * GRADE_BASE_WEIGHT: 기준 내구도(GRADE_REF_DUR)에서의 등급별 기본 가중치(1~5단계 순).
 * GRADE_K_DUR: 내구도 1당 가중치 이동 강도 — 기준보다 낮으면 중증 쪽(인덱스 큰 쪽)으로,
 * 높으면 경증 쪽으로 가중치가 쏠린다(공식은 duration pickWeighted의 bias와 동일 구조).
 * majorInjuryFrequency는 GRADE 3 이상에만 곱해 "중대 부상 비중"만 조절하고, 발생 자체의
 * 빈도(injuryFrequency)와는 완전히 분리한다.
 */
export const GRADE_BASE_WEIGHT = [55, 27, 12, 4.5, 1.5];
export const GRADE_REF_DUR = 70;
export const GRADE_K_DUR = 0.03;

export interface GradeConfig {
    severity: 'Grade1' | 'Grade2' | 'Grade3' | 'Grade4' | 'Grade5';
    injuries: string[];
    /** 짧→긴 순, durability 가중 랜덤(pickWeighted)으로 그중 하나 선택 */
    durations: string[];
}

export const GRADE_CONFIG: GradeConfig[] = [
    {
        severity: 'Grade1',
        injuries: ['무릎 통증', '타박상', '팔꿈치 타박상', '정강이 타박상', '허벅지 타박상', '안면 타박상', '열상', '감기'],
        durations: ['1일', '3일', '1주'],
    },
    {
        severity: 'Grade2',
        injuries: ['발목 염좌', '허리 경직', '손가락 염좌', '손목 염좌', '고관절 타박상', '갈비뼈 타박상', '발가락 염좌', '목 경직', '식중독'],
        durations: ['2주', '3주', '1개월'],
    },
    {
        severity: 'Grade3',
        injuries: ['햄스트링 염좌', '종아리 염좌', '발목 인대 손상', '허리 경련', '어깨 부상', '사타구니 염좌', '무릎 내측인대 염좌', '대퇴사두근 염좌', '질병'],
        durations: ['1개월', '2개월', '3개월'],
    },
    {
        severity: 'Grade4',
        injuries: ['코뼈 골절', '안와골절', '족저근막염 수술', '근육 파열', '인대 파열'],
        durations: ['3개월', '4개월', '6개월'],
    },
    {
        severity: 'Grade5',
        injuries: ['전방십자인대 파열', '후방십자인대 파열', '아킬레스건 파열', '골절', '반월판 파열'],
        durations: ['10개월', '12개월', '14개월'],
    },
];

/** durability 기반 가중치 랜덤 선택(낮을수록 긴 기간에 가중) — 등급(GRADE) 선택과 등급 내
 *  duration 선택 양쪽에서 재사용. dur 40 → bias 1.5(긴 쪽), dur 70 → bias 0(균등),
 *  dur 99 → bias -1.45(짧은 쪽). */
export function pickWeighted<T>(options: T[], dur: number): T {
    const n = options.length;
    const bias = (70 - dur) * 0.05;
    const weights = options.map((_, i) => {
        const normalized = i / (n - 1); // 0(짧/경)~1(긴/중)
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
 * @param severityMultiplier 등급 3 이상 가중치에 추가로 곱하는 배율(기본 1.0) — 경기 중
 *   부상(1.0)과 훈련 중 부상(fatigueSystem.ts, 더 낮은 값)이 서로 다른 심각도 분포를
 *   쓰기 위한 훅. majorInjuryFrequency와 곱해져서 함께 적용된다.
 */
export function pickInjuryGrade(
    dur: number,
    majorInjuryFrequency: number,
    severityMultiplier: number = 1.0,
): GradeConfig {
    const durBias = (GRADE_REF_DUR - dur) * GRADE_K_DUR;
    const weights = GRADE_BASE_WEIGHT.map((base, i) => {
        const severityIndex = i / (GRADE_BASE_WEIGHT.length - 1); // 0(GRADE1)~1(GRADE5)
        let w = base * Math.max(0.05, 1 + durBias * (severityIndex * 2 - 1));
        if (i >= 2) w *= majorInjuryFrequency * severityMultiplier; // GRADE 3~5만 배율 적용
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


export interface SliderStep {
    value: number;
    label: string;
}

// pnrDefense는 엔진이 0-2를 직접 사용하므로 여기에 포함하지 않음
export const SLIDER_STEPS: Record<string, SliderStep[]> = {
    // ── 공격 슬라이더 ──
    pace: [
        { value: 2, label: '느림' },
        { value: 5, label: '보통' },
        { value: 9, label: '빠름' },
    ],
    ballMovement: [
        { value: 2, label: '드리블 위주' },
        { value: 5, label: '보통' },
        { value: 8, label: '패스 위주' },
    ],
    offReb: [
        { value: 2, label: '백코트 우선' },
        { value: 5, label: '보통' },
        { value: 8, label: '적극 가담' },
    ],

    // ── 공격 루트 비중 ──
    play_pnr: [
        { value: 2, label: '소극적' },
        { value: 5, label: '보통' },
        { value: 9, label: '적극적' },
    ],
    play_iso: [
        { value: 2, label: '소극적' },
        { value: 5, label: '보통' },
        { value: 9, label: '적극적' },
    ],
    play_post: [
        { value: 2, label: '소극적' },
        { value: 5, label: '보통' },
        { value: 9, label: '적극적' },
    ],
    play_cns: [
        { value: 2, label: '소극적' },
        { value: 5, label: '보통' },
        { value: 9, label: '적극적' },
    ],
    play_drive: [
        { value: 2, label: '소극적' },
        { value: 5, label: '보통' },
        { value: 9, label: '적극적' },
    ],

    // ── 슈팅 전략 ──
    shot_3pt: [
        { value: 2, label: '소극적' },
        { value: 5, label: '보통' },
        { value: 9, label: '적극적' },
    ],
    shot_rim: [
        { value: 2, label: '소극적' },
        { value: 5, label: '보통' },
        { value: 9, label: '적극적' },
    ],
    shot_mid: [
        { value: 2, label: '소극적' },
        { value: 5, label: '보통' },
        { value: 9, label: '적극적' },
    ],

    // ── 온볼 수비 ──
    defIntensity: [
        { value: 2, label: '느슨' },
        { value: 5, label: '보통' },
        { value: 8, label: '타이트' },
    ],
    switchFreq: [
        { value: 2, label: '파이트 쓰루' },
        { value: 5, label: '혼합' },
        { value: 8, label: '스위치 우선' },
    ],
    fullCourtPress: [
        { value: 1, label: '안함' },
        { value: 4, label: '가끔' },
        { value: 8, label: '자주' },
    ],

    // ── 오프볼 수비 ──
    helpDef: [
        { value: 2, label: '거의 안함' },
        { value: 5, label: '보통' },
        { value: 8, label: '적극 지원' },
    ],
    zoneFreq: [
        { value: 1, label: '거의 안함' },
        { value: 5, label: '보통' },
        { value: 9, label: '지역 고수' },
    ],
    defReb: [
        { value: 2, label: '속공 전환' },
        { value: 5, label: '보통' },
        { value: 8, label: '박스아웃' },
    ],
};

/** 엔진 값 → 가장 가까운 step 인덱스 */
export function valueToStep(key: string, engineValue: number): number {
    const steps = SLIDER_STEPS[key];
    if (!steps) return 0;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < steps.length; i++) {
        const dist = Math.abs(steps[i].value - engineValue);
        if (dist < minDist) { minDist = dist; closest = i; }
    }
    return closest;
}

/** step 인덱스 → 엔진 값 */
export function stepToValue(key: string, stepIndex: number): number {
    const steps = SLIDER_STEPS[key];
    if (!steps) return 5;
    return steps[Math.max(0, Math.min(stepIndex, steps.length - 1))].value;
}

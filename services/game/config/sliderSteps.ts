
export interface SliderStep {
    value: number;
    label: string;
}

// 10단계(1~10) 전 구간을 그대로 노출 — 엔진 공식이 실제로 1~10 연속값을 사용하므로
// (예: (defIntensity-5)*0.003) UI도 3단계로 뭉개지 않고 전체 해상도를 그대로 보여준다.
// pnrDefense는 엔진이 0-2를 직접 사용하므로 여기에 포함하지 않음
const TEN_STEPS: SliderStep[] = Array.from({ length: 10 }, (_, i) => ({
    value: i + 1,
    label: String(i + 1),
}));

export const SLIDER_STEPS: Record<string, SliderStep[]> = {
    // ── 공격 슬라이더 ──
    pace: TEN_STEPS,
    ballMovement: TEN_STEPS,
    offReb: TEN_STEPS,

    // ── 코칭 철학 ──
    playStyle: TEN_STEPS,
    insideOut: TEN_STEPS,
    pnrFreq: TEN_STEPS,

    // ── 슈팅 전략 ──
    shot_3pt: TEN_STEPS,
    shot_rim: TEN_STEPS,
    shot_mid: TEN_STEPS,

    // ── 온볼 수비 ──
    defIntensity: TEN_STEPS,
    switchFreq: TEN_STEPS,
    fullCourtPress: TEN_STEPS,

    // ── 오프볼 수비 ──
    helpDef: TEN_STEPS,
    zoneFreq: TEN_STEPS,
    defReb: TEN_STEPS,
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


export interface SliderStep {
    value: number;
    label: string;
}

// 5단계 구간 라벨(1 / 2~4 / 5~6 / 7~9 / 10)을 1~10 전체 값에 매핑.
// 엔진 공식은 실제 1~10 연속값을 그대로 사용하므로 value는 그대로 두고 label만 구간별로 부여.
function buildTieredSteps(v1: string, v2to4: string, v5to6: string, v7to9: string, v10: string): SliderStep[] {
    const labels = [v1, v2to4, v2to4, v2to4, v5to6, v5to6, v7to9, v7to9, v7to9, v10];
    return labels.map((label, i) => ({ value: i + 1, label }));
}

const FREQUENCY_STEPS = buildTieredSteps('매우 낮음', '낮음', '보통', '높음', '매우 높음');

export const SLIDER_STEPS: Record<string, SliderStep[]> = {
    // ── 공격 슬라이더 ──
    pace: buildTieredSteps('정돈된 공격', '지공 위주', '보통', '속공 위주', '런앤건'),
    ballMovement: buildTieredSteps('히어로볼', '아이솔레이션', '보통', '패스 위주', '시스템 농구'),
    offReb: buildTieredSteps('전원 크래시', '적극 가담', '보통', '빠른 백코트', '시도하지 않음'),

    // ── 코칭 철학 ──
    insideOut: buildTieredSteps('페인트존 공략', '인사이드', '균형', '아웃사이드', '3점 선호'),
    pnrFreq: buildTieredSteps('픽앤롤 사용하지 않음', '보다 적은 픽앤롤', '보통', '보다 많은 픽앤롤', '적극적 픽앤롤 사용'),

    // ── 슈팅 전략 ──
    shot_3pt: FREQUENCY_STEPS,
    shot_rim: FREQUENCY_STEPS,
    shot_mid: FREQUENCY_STEPS,

    // ── 온볼 수비 ──
    defIntensity: buildTieredSteps('거의 압박하지 않음', '적은 압박', '적당히 압박', '다소 강한 압박', '매우 강한 압박'),
    switchFreq: buildTieredSteps('스위치 하지 않음', '보다 적은 스위치', '적당한 스위치', '잦은 스위치', '무한 스위치'),
    fullCourtPress: buildTieredSteps('매우 낮은 압박', '낮은 압박 강도', '적당한 압박 강도', '강한 전방 압박', '하프코트 더블팀'),

    // ── 오프볼 수비 ──
    helpDef: buildTieredSteps('도움 수비 없음', '자기 위치 고수', '균형', '적극적 도움 수비', '강한 도움 수비'),
    zoneFreq: buildTieredSteps('강한 맨투맨 커버리지', '적당한 맨투맨 커버리지', '상황에 따름', '존 디펜스 고수', '강한 존 디펜스'),
    defReb: buildTieredSteps('전원 트랜지션 전환', '보다 적은 리바운더', '보통', '더 많은 리바운더', '적극적 박스아웃'),
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

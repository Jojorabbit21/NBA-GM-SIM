/**
 * 1라운드 루키 스케일 표 — 순수 모듈(외부 import 없음, 서버 안전).
 * [2026-09-22] services/draft/rookieGenerator.ts에서 분리. rookieGenerator는 LEAGUE_FINANCIALS →
 * constants → gameConfigService → supabaseClient 부작용 체인을 끌어와 서버(finalize)에서 import할 수
 * 없어서, 계약 생성(server/src/shared/draftContracts.ts)이 쓰는 표/계산만 여기로 옮겼다.
 * rookieGenerator.ts는 같은 이름을 그대로 re-export 하므로 기존 호출부는 변경 없음.
 *
 * RookieScale = SalaryCap × PickScalePct — 캡 금액만 넣으면 어떤 시즌이든 비율대로 계산된다.
 */

/** 1~30픽 1년차 루키 스케일 = 캡 × 이 비율(%). 2026-27 실제 CBA 수치 기준(픽별 고정,
 *  시즌이 바뀌어도 비율 자체는 거의 불변 — 실제로 CBA는 "전년 대비 캡 상승률만큼 모든
 *  루키 스케일 금액도 동일 비율로 상승"한다고 명시하므로 100% 고정은 아니지만 매우 안정적). */
export const ROOKIE_SCALE_PICK_PCT: number[] = [
    7.4502, 6.6659, 5.9861, 5.3971, 4.8874,  // 1-5
    4.4395, 4.0521, 3.7120, 3.4123, 3.2418,  // 6-10
    3.0796, 2.9258, 2.7794, 2.6407, 2.5083,  // 11-15
    2.3830, 2.2638, 2.1507, 2.0540, 1.9715,  // 16-20
    1.8927, 1.8171, 1.7445, 1.6748, 1.6076,  // 21-25
    1.5544, 1.5095, 1.5001, 1.4893, 1.4785,  // 26-30
];

/** 2년차/3년차는 1년차의 고정 배수(CBA 실제 스케일 그대로 — 복리 아님, 둘 다 1년차 기준). */
export const ROOKIE_SCALE_Y2_MULT = 1.05;
export const ROOKIE_SCALE_Y3_MULT = 1.10;

// 4년차(3→4년차 옵션 연봉 인상률)는 픽마다 들쭉날쭉해서(1~10픽은 완만하게 26~27.5%,
// 11픽/21픽에서 큰 폭으로 점프한 뒤 다시 완만해지는 구간별 패턴) 30개 값을 통째로
// 하드코딩하는 대신, 그 굴곡을 그대로 따라가는 10개 앵커 포인트 사이를 선형보간한다.
// (사용자가 준 실측 표와 비교 검증: 중간 픽 오차 0.1~0.2%p 이내로 근접.)
const FOURTH_YEAR_RAISE_ANCHORS: [pick: number, raisePct: number][] = [
    [1, 26.1], [10, 27.5], [11, 32.7], [15, 53.3], [16, 53.4],
    [20, 54.2], [21, 59.3], [25, 80.1], [26, 80.3], [30, 80.5],
];

/** 픽 번호(1~30) → 3년차 대비 4년차 인상률(%), 앵커 포인트 사이 선형보간. */
export function estimateFourthYearRaisePct(pick: number): number {
    const p = Math.max(1, Math.min(30, pick));
    for (let i = 0; i < FOURTH_YEAR_RAISE_ANCHORS.length - 1; i++) {
        const [p0, r0] = FOURTH_YEAR_RAISE_ANCHORS[i];
        const [p1, r1] = FOURTH_YEAR_RAISE_ANCHORS[i + 1];
        if (p >= p0 && p <= p1) {
            if (p1 === p0) return r0;
            return r0 + (r1 - r0) * ((p - p0) / (p1 - p0));
        }
    }
    return FOURTH_YEAR_RAISE_ANCHORS[FOURTH_YEAR_RAISE_ANCHORS.length - 1][1];
}

/**
 * 1라운드 픽의 4년 루키 스케일 계약 연봉을 계산한다 — RookieScale = SalaryCap × PickPct,
 * multiplier(0.80~1.20)로 실제 체결 연봉을 스케일 기준금액의 80~120% 사이에서 조정한다
 * (실제 NBA CBA 규정 그대로). 100% 기준 금액을 먼저 계산한 뒤 4개 연차 전부에 동일한
 * multiplier를 곱한다(사용자가 전달한 rookie_contract() 파이썬 의사코드와 동일한 순서).
 */
export function calcRookieScaleYears(pick: number, salaryCap: number, multiplier: number = 1.0): number[] {
    const pct = ROOKIE_SCALE_PICK_PCT[Math.max(1, Math.min(30, pick)) - 1];
    const y1 = salaryCap * (pct / 100);
    const y2 = y1 * ROOKIE_SCALE_Y2_MULT;
    const y3 = y1 * ROOKIE_SCALE_Y3_MULT;
    const y4 = y3 * (1 + estimateFourthYearRaisePct(pick) / 100);
    return [y1, y2, y3, y4].map(v => Math.round(v * multiplier));
}

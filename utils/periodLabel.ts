// periodLabel.ts — 화면용 피리어드(쿼터·연장) 라벨. [2026-10-26] 연장전 P4 (docs/plan/overtime-system.md)
//
// 연장전 도입 전 경기(그리고 연장전 스위치가 꺼진 경기)는 경기 종료 로그와 동점 버저비터 포세션이 "5쿼터"로 찍혀 있다 —
// q > 4를 그대로 연장으로 표시하면 옛 경기가 OT1로 보인다. 그래서 경기의 실제 연장 수(otPeriods = "N차 연장 시작" 로그 수,
// countOvertimePeriods)를 받아 그 범위를 넘는 피리어드는 4쿼터로 접는다. otPeriods를 모르면(라이브 요약 등) q > 4를 연장으로 본다.
import { countOvertimePeriods } from '../services/game/engine/pbp/periodRules';

export { countOvertimePeriods };

/** 표시용 피리어드 번호 — 1~4 그대로, 실제 연장 범위 밖의 5쿼터 이상(옛 경기 종료·버저비터)은 4. */
export function normalizePeriod(quarter: number, otPeriods?: number): number {
    if (quarter <= 4 || otPeriods === undefined) return quarter;
    return Math.min(quarter, 4 + Math.max(0, otPeriods));
}

/** 짧은 라벨 — 'Q1' 형식(기본) 또는 '1Q' 형식, 연장은 둘 다 OT1·OT2. */
export function periodShortLabel(quarter: number, otPeriods?: number, style: 'Q1' | '1Q' = 'Q1'): string {
    const q = normalizePeriod(quarter, otPeriods);
    if (q > 4) return `OT${q - 4}`;
    return style === 'Q1' ? `Q${q}` : `${q}Q`;
}

/** 한국어 라벨 — 1쿼터~4쿼터, 1차 연장·2차 연장. */
export function periodKoreanLabel(quarter: number, otPeriods?: number): string {
    const q = normalizePeriod(quarter, otPeriods);
    return q > 4 ? `${q - 4}차 연장` : `${q}쿼터`;
}

/** 필터 탭 등 — 이 경기의 피리어드 목록 [1, 2, 3, 4, (5, 6)]. */
export function periodList(otPeriods: number): number[] {
    return Array.from({ length: 4 + Math.max(0, otPeriods) }, (_, i) => i + 1);
}

/** [2026-10-26] 쿼터별 득점 배열을 실제 피리어드 수(4 + 연장)로 접는다 — 서버가 옛 경기에 저장한 5칸
 *  (5번째 = 경기 종료 로그 칸, 대개 0, 동점 버저비터 경기만 득점)은 4쿼터에 합친다. */
export function foldPeriodScores(scores: number[], otPeriods: number): number[] {
    const n = 4 + Math.max(0, otPeriods);
    const out = Array.from({ length: n }, (_, i) => scores[i] ?? 0);
    for (let i = n; i < scores.length; i++) out[n - 1] += scores[i] ?? 0;
    return out;
}

/** [2026-10-26] 경기 결과의 연장 표기 — 0회 '', 1회 'OT', 2회 '2OT' (스코어보드 관례). */
export function overtimeTag(otPeriods?: number | null): string {
    if (!otPeriods || otPeriods <= 0) return '';
    return otPeriods === 1 ? 'OT' : `${otPeriods}OT`;
}

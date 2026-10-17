/**
 * fatigueRecovery.ts — 멀티플레이어 경기 간 체력 회복 (순수 계산, 서버 전용)
 *
 * docs/plan/multiplayer-fatigue.md 3-3/3-4. 가상 날짜 D의 자정마다 체력 부족분(100 − condition)을
 * 비율로 줄인다 — 그날 출전했으면 overnightKeep, 아니면 restDayKeep만큼 부족분이 남는다.
 *
 * room_player_state 의미 (이 모듈이 전제하는 규칙):
 *   condition                    — 체력. NULL = 100(완전 휴식)으로 간주
 *   condition_recovered_through  — 이 condition에 자정 회복이 반영된 마지막 가상 날짜.
 *                                  경기 종료 기록 시 game_date − 1(경기는 그날 자정 전에 열리므로)
 *   last_game_date               — 마지막으로 실제 출전(mp > 0)한 가상 날짜
 *
 * 싱글은 이 모듈을 쓰지 않는다(D3) — 싱글 휴식일 회복은 fatigueSystem.applyRestDayRecovery 그대로.
 */
import { SIM_CONFIG } from '../game/config/constants.ts';
import type { MultiFatigueSettings } from '../types/simSettings.ts';

/** 'YYYY-MM-DD' + n일 (UTC 기준 순수 날짜 연산) */
export function addDays(date: string, n: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/**
 * stamina/durability가 높을수록 부족분이 덜 남는다 — 경기 중 회복(calculateRecovery)과 같은 계수.
 * 50/50 = 1.0, 90/90 = 0.8, 30/30 = 1.1
 */
export function recoveryKeepModifier(stamina: number | undefined, durability: number | undefined): number {
    const C = SIM_CONFIG.FATIGUE;
    return 1
        - ((stamina ?? 50) - 50) / 100 * C.RECOVERY_STAMINA_FACTOR
        - ((durability ?? 50) - 50) / 100 * C.RECOVERY_DURABILITY_FACTOR;
}

/** 자정 1회 회복. playedThatDay = 그 날짜에 실제 출전했는지 */
export function applyMidnightRecovery(
    condition: number,
    playedThatDay: boolean,
    stamina: number | undefined,
    durability: number | undefined,
    settings: Pick<MultiFatigueSettings, 'fatigueOvernightKeep' | 'fatigueRestDayKeep'>,
): number {
    const keep = playedThatDay ? settings.fatigueOvernightKeep : settings.fatigueRestDayKeep;
    const deficit = Math.max(0, 100 - condition);
    const next = 100 - deficit * keep * recoveryKeepModifier(stamina, durability);
    return Math.min(100, Math.max(0, next));
}

export interface ConditionState {
    condition: number | null;
    recoveredThrough: string | null;
    lastGameDate: string | null;
}

/**
 * recoveredThrough 다음 날부터 throughDate까지 자정 회복을 하루씩 적용한다.
 * - 스케줄러 자정 처리(타임라인 있는 방)와 경기 직전 따라잡기(모든 방, D7) 공용.
 * - 이미 throughDate까지 반영됐으면 그대로 돌려준다(멱등).
 * - condition NULL은 이미 100이므로 날짜만 전진.
 * - recoveredThrough NULL + condition 있음 = 기록 시점을 알 수 없는 행(신규 칼럼 도입 전 서버가 쓴 값 등)
 *   → 완전 회복(100)으로 정리한다. 계획 D1(기존 체력 리셋)과 같은 취지.
 */
export function recoverThrough(
    state: ConditionState,
    throughDate: string,
    stamina: number | undefined,
    durability: number | undefined,
    settings: Pick<MultiFatigueSettings, 'fatigueOvernightKeep' | 'fatigueRestDayKeep'>,
): { condition: number | null; recoveredThrough: string } {
    if (state.condition == null) return { condition: null, recoveredThrough: throughDate };
    if (state.recoveredThrough == null) return { condition: 100, recoveredThrough: throughDate };
    if (state.recoveredThrough >= throughDate) return { condition: state.condition, recoveredThrough: state.recoveredThrough };

    let c = state.condition;
    for (let d = addDays(state.recoveredThrough, 1); d <= throughDate; d = addDays(d, 1)) {
        if (c >= 99.95) { c = 100; break; }   // 오프시즌처럼 긴 공백은 만충 즉시 종료
        c = applyMidnightRecovery(c, state.lastGameDate === d, stamina, durability, settings);
    }
    return { condition: parseFloat(c.toFixed(1)), recoveredThrough: throughDate };
}

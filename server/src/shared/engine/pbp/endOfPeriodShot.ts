import type { GameState, LivePlayer } from './pbpTypes.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';
import { REGULATION_PERIODS } from './periodRules.ts';

/**
 * [2026-11-05] 피리어드 막판 슛 (client 미러 참조, SIM_CONFIG.END_OF_PERIOD, docs/history/dev-log.md 11-05).
 * 이전엔 남은 1~2초에 백코트에서 인바운드해도 평소 하프코트 공격(픽앤롤·컷인 레이업 등, 야투율 ~48%)을 했다.
 * 샷클락 꺼진 구간 + 남은 시간 ≤ 6초에서, 공이 어디서 시작하는지(백코트/프런트코트)와 남은 시간으로 정한다:
 *  - 백코트 ≤ 2초: 하프라인 뒤에서 히브(약 2%) — 1초면 인바운드 받는 사이 시간 만료(40%, 슛 없음)
 *  - 백코트 3~4초: 하프라인을 막 넘긴 장거리 슛(약 5.5%)
 *  - 백코트 5~6초: 밀고 올라가 빠른 공격(Transition 고정 + 막판 슛 최대 페널티)
 *  - 프런트코트(타임아웃 전진·공격 리바운드·사이드 인바운드) ≤ 2초: 캐치앤슛 고정 + 막판 슛 최대 페널티
 * 4Q·연장 앞선 팀은 드리블 아웃, 파울 작전 대상이면 고의 파울이 먼저(liveEngine).
 */
export type EndShotPlan =
    | { kind: 'expire' }
    | { kind: 'heave'; band: 'far' | 'half'; shooter: LivePlayer; hitProb: number; distanceFt: number }
    | { kind: 'rush' }
    | { kind: 'catchShoot' };

export function decideEndOfPeriodShot(state: GameState): EndShotPlan | null {
    const C = SIM_CONFIG.END_OF_PERIOD;
    const T = state.gameClock;
    if (T <= 0 || T > C.MAX_CLOCK || T > state.shotClock) return null;
    const off = state.possession === 'home' ? state.home : state.away;
    const def = off === state.home ? state.away : state.home;
    if (off.onCourt.length === 0) return null;
    if (state.quarter >= REGULATION_PERIODS && off.score > def.score) return null;   // 앞선 팀은 드리블 아웃

    const frontcourt = state.inbound?.spot === 'frontcourt' || state.lastEntryWasOffReb === true || state.lastEntryWasFlagrant === true;
    if (frontcourt) return T <= C.FAR_MAX ? { kind: 'catchShoot' } : null;

    if (T > C.HALF_MAX) return { kind: 'rush' };
    if (T <= 1 && Math.random() < C.EXPIRE_AT_ONE) return { kind: 'expire' };
    const band: 'far' | 'half' = T <= C.FAR_MAX ? 'far' : 'half';
    const [lo, hi] = band === 'far' ? C.FAR_DIST : C.HALF_DIST;
    // 던지는 선수 — 공을 받는 핸들러(코트 위 최고 핸들러)
    const shooter = [...off.onCourt].sort((a, b) => b.archetypes.handler - a.archetypes.handler)[0];
    return {
        kind: 'heave', band, shooter,
        hitProb: band === 'far' ? C.FAR_HIT : C.HALF_HIT,
        distanceFt: Math.round(lo + Math.random() * (hi - lo)),
    };
}

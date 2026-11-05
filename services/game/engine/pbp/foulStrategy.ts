import type { GameState, LivePlayer } from './pbpTypes';
import { SIM_CONFIG } from '../../config/constants';
import { REGULATION_PERIODS } from './periodRules';

/**
 * [2026-11-05] 파울 작전 (server 미러 참조, SIM_CONFIG.FOUL_STRATEGY, docs/history/dev-log.md 11-05).
 * 매 공격 시작 시 수비 팀 기준으로 판정 — 발동하면 liveEngine이 일반 공격 대신 고의 파울 결과를 만든다.
 *  - 'trailing'(파울 작전): 4Q·연장 60초 이하, 수비 팀 1~9점 뒤짐(쓰리 포제션 이내), 수비 팀 가비지 타임 아님
 *    (가비지 해제 후 주전이 돌아오면 가능), 샷클락 꺼짐(안 하면 상대가 드리블 아웃)이면 무조건, 켜져 있으면 3점 이상 뒤질 때만
 *    (1~2점 차는 정상 수비로 스톱을 노림). 최소 시간 제한 없음(자유투 뒤 즉시 타임아웃 → 프런트코트 전진 → 빠른 슛).
 *  - 'upThree'(역파울 작전): 수비 팀이 정확히 3점 앞서고 6초 이하 — 동점 3점을 쏘기 전에 끊는다.
 * 파울은 공을 잡은 선수에게만(마지막 2분 공과 떨어진 곳 파울은 자유투 1개 + 공격권, NBA Rule 12B) —
 * 공격 팀은 자유투가 좋은 선수에게 공을 주려 하므로 받는 선수는 자유투 능력치 가중, 파울하는 선수는 파울 수가 가장 적은 수비 선수.
 * 팀 파울·보너스는 기존 규정 그대로(정규 5번째·연장 4번째부터 자유투, 그 전엔 사이드 인바운드로 공격권 유지 → 다음 공격에서 다시 판정).
 */
export type FoulStrategyKind = 'trailing' | 'upThree';

export interface FoulStrategyPlan {
    kind: FoulStrategyKind;
    fouler: LivePlayer;
    target: LivePlayer;
    time: number;   // 인바운드~파울까지(초)
}

export function decideFoulStrategy(state: GameState): FoulStrategyPlan | null {
    const C = SIM_CONFIG.FOUL_STRATEGY;
    if (state.quarter < REGULATION_PERIODS || state.gameClock <= 0 || state.gameClock > C.CLOCK) return null;
    const off = state.possession === 'home' ? state.home : state.away;
    const def = off === state.home ? state.away : state.home;
    if (off.onCourt.length === 0 || def.onCourt.length === 0) return null;
    const deficit = off.score - def.score;   // 수비 팀 기준 뒤진 점수(음수 = 수비 팀 리드)
    const clockOff = state.gameClock <= state.shotClock;

    let kind: FoulStrategyKind | null = null;
    if (deficit >= 1 && deficit <= C.MAX_DEFICIT && !def.garbage && (clockOff || deficit >= C.CLOCK_ON_MIN_DEFICIT)) kind = 'trailing';
    else if (-deficit === C.UP_THREE.LEAD && state.gameClock <= C.UP_THREE.CLOCK) kind = 'upThree';
    if (!kind) return null;

    // 받는 선수 — 자유투 능력치 가중(공격 팀이 자유투 좋은 선수에게 공을 준다)
    const weights = off.onCourt.map(p => Math.pow(Math.max(1, p.attr.ft) / 100, C.RECEIVER_FT_EXP));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let target = off.onCourt[off.onCourt.length - 1];
    for (let i = 0; i < off.onCourt.length; i++) { r -= weights[i]; if (r <= 0) { target = off.onCourt[i]; break; } }

    // 파울하는 선수 — 파울 수가 가장 적은 선수(5반칙은 다른 선택지가 없을 때만), 동률이면 OVR 낮은 선수
    const pool = def.onCourt.some(p => p.pf < 5) ? def.onCourt.filter(p => p.pf < 5) : def.onCourt;
    const fouler = [...pool].sort((a, b) => a.pf - b.pf || a.ovr - b.ovr)[0];

    const [lo, hi] = C.TIME;
    const time = Math.min(state.gameClock, lo + Math.floor(Math.random() * (hi - lo + 1)));
    return { kind, fouler, target, time };
}

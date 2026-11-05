import type { GameState, PossessionResult } from './pbpTypes';
import type { BoxTick, TeamMiscByGame, TeamMiscStats } from '../../../../types';

// [2026-11-05] 팀 미스크 득점 4종(POTV / FBPS / PITP / SPTS) 경기 중 누적. 정의는 types/engine.ts TeamMiscStats 참조.
// 엔진 판정(어떤 공격권이 턴오버 직후·공격 리바운드 이후인지)을 그대로 따르므로 PBP 로그를 사후 분석하는 것과 같은 결과가 나온다.
// server 미러: server/src/shared/engine/pbp/teamMisc.ts

/** 팀 턴오버로 집계되는 결과(statsMappers.recordPlayTypeStat의 tov 기준과 동일) */
const TURNOVER_TYPES: ReadonlySet<PossessionResult['type']> = new Set(['turnover', 'offensiveFoul', 'shotClockViolation']);

export function emptyTeamMisc(): TeamMiscByGame {
    const zero = (): TeamMiscStats => ({ potv: 0, fbps: 0, pitp: 0, spts: 0 });
    return { home: zero(), away: zero() };
}

/**
 * 포세션 결과 1건을 누적하고 공격권 추적 상태를 다음으로 넘긴다. liveEngine.stepPossession에서
 * applyPossessionResult·공격권 유지 판정(retained) 직후, 공격권 전환 전에 호출.
 * scoreBefore = applyPossessionResult 호출 직전 점수(자유투·앤드원 득점 포함해 이번 결과의 득점을 차이로 계산).
 */
export function trackTeamMisc(
    state: GameState,
    result: PossessionResult,
    scoreBefore: { home: number; away: number },
    isOffReb: boolean,
    retained: boolean,
): BoxTick['m'] | null {
    if (!state.teamMisc) state.teamMisc = emptyTeamMisc();
    const side: 'home' | 'away' = result.offTeam.id === state.home.id ? 'home' : 'away';
    const other: 'home' | 'away' = side === 'home' ? 'away' : 'home';

    // 추적 상태가 이 공격팀과 다르면(경기 시작·쿼터 시작·강제 포세션) 일반 공격권으로 시작
    let tracker = state.miscTracker;
    if (!tracker || tracker.side !== side) tracker = { side, fromTov: false, orb: false };

    const stats = state.teamMisc[side];
    const before = [stats.potv, stats.fbps, stats.pitp, stats.spts];
    const pts = state[side].score - scoreBefore[side];
    if (pts > 0) {
        if (tracker.orb) stats.spts += pts;               // 공격 리바운드 이후 득점(턴오버 직후 공격권이어도 여기로)
        else if (tracker.fromTov) stats.potv += pts;   // 턴오버 직후 첫 공격(리바운드 전)
    }
    if (result.type === 'score' && result.points) {
        if (result.zone === 'Rim' || result.zone === 'Paint') stats.pitp += result.points;
        if (result.playType === 'Transition') stats.fbps += result.points;
    }

    // 박스 틱용 델타(공격팀 기준 [potv, fbps, pitp, spts]) — 변화 없으면 null(틱 용량 절약)
    const delta: [number, number, number, number] = [stats.potv - before[0], stats.fbps - before[1], stats.pitp - before[2], stats.spts - before[3]];

    if (retained) {
        // 공격권 유지: 공격 리바운드면 이후 득점은 SPTS, 파울·테크니컬로 이어진 공격은 상태 그대로
        if (isOffReb) tracker.orb = true;
        state.miscTracker = tracker;
    } else {
        state.miscTracker = { side: other, fromTov: TURNOVER_TYPES.has(result.type), orb: false };
    }
    return delta.some(v => v !== 0) ? delta : null;
}

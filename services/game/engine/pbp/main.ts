
import { Team, GameTactics, DepthChart, SimulationResult } from '../../../../types';
import { createGameState, stepPossession, extractSimResult } from './liveEngine';

/**
 * CPU/배치 방식 전체 경기 시뮬레이션.
 * 내부적으로 liveEngine의 createGameState + stepPossession 루프를 사용.
 * 외부 API는 기존과 동일하게 유지 → CPU 경기 코드 무변경.
 */
export function runFullGameSimulation(
    homeTeam: Team,
    awayTeam: Team,
    userTeamId: string | null,
    userTactics?: GameTactics,
    isHomeB2B: boolean = false,
    isAwayB2B: boolean = false,
    homeDepthChart?: DepthChart | null,
    awayDepthChart?: DepthChart | null
): SimulationResult {

    const state = createGameState(
        homeTeam, awayTeam, userTeamId, userTactics,
        isHomeB2B, isAwayB2B, homeDepthChart, awayDepthChart
    );

    // 전체 경기를 동기적으로 완주 (배치 방식)
    let running = true;
    while (running) {
        const step = stepPossession(state);
        if (step.isGameEnd) {
            running = false;
        }
    }

    return extractSimResult(state);
}

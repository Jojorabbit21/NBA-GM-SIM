
import type { Player, GameTactics, TacticalSliders } from '../../../../../types';
import type { PossessionResult, TeamState } from '../pbpTypes';
import type { SandboxStep } from '../choreographyTypes';
import { subZoneToZone } from '../choreographyTypes';
import { initTeamState } from '../initializer';
import { buildVirtualTeam, buildDefaultDepthChart } from '../../../../../utils/quickPlay';
import { generateAutoTactics } from '../../../../gameEngine';

// ─────────────────────────────────────────────────────────────
// §12-1 — Synthetic PossessionResult builder. Director's-cut sandbox mode: bypasses every
// Math.random() roll in simulatePossession()/resolvePlayAction() entirely. Admin-picked
// playType/zone/outcome/roster go straight into a PossessionResult-shaped object that
// generateChoreography() consumes exactly as if it came from the real PBP engine — the
// generator itself never knows (or needs to know) whether a result is real or synthetic.
// ─────────────────────────────────────────────────────────────

/** Builds a full TeamState (with real LivePlayer[], reusing the exact same init path as a
 *  real game) from a chosen 5-player roster + tactical sliders. Reused for both offense and
 *  defense sides — mirrors PbpGameModePanel.handleStart()'s team-building sequence exactly. */
export function buildSandboxTeamState(teamId: string, roster: Player[], sliderOverrides?: Partial<TacticalSliders>): TeamState {
    const team = buildVirtualTeam(teamId, roster);
    const tactics: GameTactics = generateAutoTactics(team);
    if (sliderOverrides) {
        tactics.sliders = { ...tactics.sliders, ...sliderOverrides };
    }
    const depthChart = buildDefaultDepthChart(roster, tactics);
    return initTeamState(team, tactics, depthChart);
}

function findOnCourt(team: TeamState, playerId: string | undefined) {
    if (!playerId) return undefined;
    return team.onCourt.find(p => p.playerId === playerId);
}

/** §12-1. Turns one admin-authored SandboxStep into a PossessionResult-shaped object.
 *  Milestone 1 scope: only the fields CatchShoot's generator (§8-6) reads are populated
 *  meaningfully; everything else follows the real type's optionality. */
export function buildSyntheticPossessionResult(
    step: SandboxStep,
    offTeam: TeamState,
    defTeam: TeamState,
): PossessionResult {
    const actor = findOnCourt(offTeam, step.actorId);
    if (!actor) {
        throw new Error(`[Sandbox] actorId ${step.actorId} not found in offense onCourt roster`);
    }
    const assister = findOnCourt(offTeam, step.assisterId);
    const zone = subZoneToZone(step.subZone);
    const isScore = step.outcome === 'score';
    const points: 0 | 1 | 2 | 3 = isScore ? (zone === '3PT' ? 3 : 2) : 0;

    const resultType: PossessionResult['type'] =
        step.outcome === 'score' ? 'score'
        : step.outcome === 'miss' ? 'miss'
        : step.outcome === 'turnover' ? 'turnover'
        : 'foul';

    // 미스일 때만 의미 있음 — offTeam/defTeam 어느 쪽 onCourt에서 찾았는지로 reboundType을
    // 역산한다(관리자가 팀 구분 없이 rebounderId 하나만 지정하므로). 못 찾으면 둘 다 undefined —
    // generateCatchShoot()의 크래시/바운스 로직은 그 경우 bounce beat 없이 기존처럼 shoot에서
    // 릴을 끝낸다.
    const offRebounder = findOnCourt(offTeam, step.rebounderId);
    const defRebounder = !offRebounder ? findOnCourt(defTeam, step.rebounderId) : undefined;
    const rebounder = offRebounder ?? defRebounder;
    const reboundType: PossessionResult['reboundType'] = offRebounder ? 'off' : defRebounder ? 'def' : undefined;

    return {
        type: resultType,
        offTeam,
        defTeam,
        actor,
        assister,
        rebounder,
        reboundType,
        playType: step.playType,
        zone,
        subZone: step.subZone,
        points,
        isAndOne: false,
        pnrCoverage: step.pnrCoverage,
        isZone: step.isZone,
        isSwitch: step.isSwitch,
        isBotchedSwitch: step.isBotchedSwitch,
        entry: step.entry,
        inbounderId: step.inbounderId,
    };
}

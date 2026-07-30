
import { TeamState, LivePlayer } from './pbpTypes.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';

/**
 * Step 1: ORB% 확률 계산
 */
export function calculateOrbChance(
    offTeam: TeamState,
    defTeam: TeamState
): number {
    const cfg = SIM_CONFIG.REBOUND;

    // [2026-07-30] 공격/수비 리바운드 전용 공식 분리 (client 미러 참고)
    const calcOffPower = (team: TeamState) =>
        team.onCourt.reduce((sum, p) => {
            return sum + (p.attr.offReb * cfg.ORB_REB_WEIGHT + p.attr.hustle * cfg.ORB_HUSTLE_WEIGHT + p.attr.vertical * cfg.ORB_VERTICAL_WEIGHT);
        }, 0);
    const calcDefPower = (team: TeamState) =>
        team.onCourt.reduce((sum, p) => {
            return sum + (p.attr.defReb * cfg.DRB_REB_WEIGHT + p.attr.boxOut * cfg.DRB_BOXOUT_WEIGHT + p.attr.vertical * cfg.DRB_VERTICAL_WEIGHT + p.attr.strength * cfg.DRB_STRENGTH_WEIGHT);
        }, 0);

    const offPower = calcOffPower(offTeam);
    const defPower = calcDefPower(defTeam);

    const qualityAdj = defPower > 0
        ? (offPower / defPower - 1) * cfg.QUALITY_FACTOR
        : 0;

    const sliderAdj =
        (offTeam.tactics.sliders.offReb - 5) * cfg.SLIDER_IMPACT
      - (defTeam.tactics.sliders.defReb - 5) * cfg.SLIDER_IMPACT;

    return Math.max(cfg.MIN_ORB_RATE, Math.min(cfg.MAX_ORB_RATE,
        cfg.BASE_ORB_RATE + qualityAdj + sliderAdj));
}

/**
 * Step 2: 팀 내 리바운더 선택
 */
function selectRebounder(team: TeamState, shooterId: string, isOffensive: boolean): LivePlayer {
    const cfg = SIM_CONFIG.REBOUND;

    const candidates = team.onCourt.map(p => {
        const shooterPenalty = p.playerId === shooterId ? cfg.SHOOTER_PENALTY : 1.0;

        // [2026-07-30] 공격/수비 리바운드 전용 공식 분리 (client 미러 참고)
        let score = (
            isOffensive
                ? p.attr.offReb * cfg.ORB_REB_WEIGHT + p.attr.hustle * cfg.ORB_HUSTLE_WEIGHT + p.attr.vertical * cfg.ORB_VERTICAL_WEIGHT
                : p.attr.defReb * cfg.DRB_REB_WEIGHT + p.attr.boxOut * cfg.DRB_BOXOUT_WEIGHT + p.attr.vertical * cfg.DRB_VERTICAL_WEIGHT + p.attr.strength * cfg.DRB_STRENGTH_WEIGHT
        ) * shooterPenalty;

        // [2026-07-30] ARCHETYPES_ENABLED=false로 비활성화 (client 미러 참고)
        if (cfg.ARCHETYPES_ENABLED &&
            (p.attr.offReb >= cfg.HARVESTER_REB_THRESHOLD || p.attr.defReb >= cfg.HARVESTER_REB_THRESHOLD)) {
            score *= cfg.HARVESTER_SCORE_MULTIPLIER;
        }

        if (cfg.ARCHETYPES_ENABLED && isOffensive &&
            p.attr.height <= cfg.RAIDER_MAX_HEIGHT &&
            p.attr.offReb >= cfg.RAIDER_OFFREB_THRESHOLD &&
            p.attr.vertical >= cfg.RAIDER_VERTICAL_THRESHOLD) {
            score *= cfg.RAIDER_SCORE_MULTIPLIER;
        }

        // [2026-07-30] 결정론적 배율로 전환 + 계수 0.6→0.3 (client 미러 참고)
        score *= (0.7 + (p.tendencies?.motorIntensity ?? 1.0) * 0.3);

        return { p, score };
    });

    const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);
    let r = Math.random() * totalScore;
    for (const c of candidates) {
        r -= c.score;
        if (r <= 0) return c.p;
    }
    return candidates[candidates.length - 1].p;
}

/**
 * 리바운드 해결
 */
export function resolveRebound(homeTeam: TeamState, awayTeam: TeamState, shooterId: string): { player: LivePlayer, type: 'off' | 'def' } {
    const isHomeShooter = homeTeam.onCourt.some(p => p.playerId === shooterId);
    const offTeam = isHomeShooter ? homeTeam : awayTeam;
    const defTeam = isHomeShooter ? awayTeam : homeTeam;

    const orbChance = calculateOrbChance(offTeam, defTeam);
    const isOffensiveRebound = Math.random() < orbChance;

    const winningTeam = isOffensiveRebound ? offTeam : defTeam;
    const player = selectRebounder(winningTeam, shooterId, isOffensiveRebound);
    const type = isOffensiveRebound ? 'off' : 'def';

    return { player, type };
}

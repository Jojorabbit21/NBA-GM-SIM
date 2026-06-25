
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

    const calcPower = (team: TeamState, rebAttr: 'offReb' | 'defReb') =>
        team.onCourt.reduce((sum, p) => {
            return sum + (p.attr[rebAttr] * 0.5 + p.attr.vertical * 0.2 + p.attr.strength * 0.15 + p.attr.boxOut * 0.15);
        }, 0);

    const offPower = calcPower(offTeam, 'offReb');
    const defPower = calcPower(defTeam, 'defReb');

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
    const rebAttr: 'offReb' | 'defReb' = isOffensive ? 'offReb' : 'defReb';

    const candidates = team.onCourt.map(p => {
        const shooterPenalty = p.playerId === shooterId ? cfg.SHOOTER_PENALTY : 1.0;

        let score = (
            p.attr[rebAttr] * 0.5 +
            p.attr.vertical * 0.2 +
            p.attr.strength * 0.15 +
            p.attr.boxOut * 0.15
        ) * shooterPenalty;

        if (p.attr.offReb >= cfg.HARVESTER_REB_THRESHOLD || p.attr.defReb >= cfg.HARVESTER_REB_THRESHOLD) {
            score *= cfg.HARVESTER_SCORE_MULTIPLIER;
        }

        if (isOffensive &&
            p.attr.height <= cfg.RAIDER_MAX_HEIGHT &&
            p.attr.offReb >= cfg.RAIDER_OFFREB_THRESHOLD &&
            p.attr.vertical >= cfg.RAIDER_VERTICAL_THRESHOLD) {
            score *= cfg.RAIDER_SCORE_MULTIPLIER;
        }

        score *= Math.random() * (0.7 + (p.tendencies?.motorIntensity ?? 1.0) * 0.6);

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


import { TeamState, LivePlayer } from './pbpTypes';
import { SIM_CONFIG } from '../../config/constants';

/**
 * Step 1: ORB% 확률 계산 (공격 리바운드 vs 수비 리바운드)
 * NBA 평균 ~23% 기준, 슬라이더 + 팀 능력치로 조정
 *
 * 공식: orbChance = clamp(MIN, MAX, BASE + qualityAdj + sliderAdj)
 * - qualityAdj: 공격팀 offReb 파워 vs 수비팀 defReb 파워 비율
 * - sliderAdj: offReb/defReb 슬라이더 차이 반영
 */
export function calculateOrbChance(
    offTeam: TeamState,
    defTeam: TeamState
): number {
    const cfg = SIM_CONFIG.REBOUND;

    // 팀별 리바운드 파워 계산 (코트 5인)
    // 공격팀은 offReb(공격 리바운드 능력), 수비팀은 defReb(수비 리바운드 능력) 사용
    const calcPower = (team: TeamState, rebAttr: 'offReb' | 'defReb') =>
        team.onCourt.reduce((sum, p) => {
            const posBonus = p.position === 'C' ? cfg.POS_WEIGHT_C
                : p.position === 'PF' ? cfg.POS_WEIGHT_PF
                : cfg.POS_WEIGHT_DEFAULT;
            return sum + (p.attr[rebAttr] * 0.6 + p.attr.vertical * 0.2 + (p.attr.height - 180) * 0.5) * posBonus;
        }, 0);

    const offPower = calcPower(offTeam, 'offReb');
    const defPower = calcPower(defTeam, 'defReb');

    // 능력치 차이 보정
    const qualityAdj = defPower > 0
        ? (offPower / defPower - 1) * cfg.QUALITY_FACTOR
        : 0;

    // 슬라이더 보정
    const sliderAdj =
        (offTeam.tactics.sliders.offReb - 5) * cfg.SLIDER_IMPACT
      - (defTeam.tactics.sliders.defReb - 5) * cfg.SLIDER_IMPACT;

    return Math.max(cfg.MIN_ORB_RATE, Math.min(cfg.MAX_ORB_RATE,
        cfg.BASE_ORB_RATE + qualityAdj + sliderAdj));
}

/**
 * Step 2: 팀 내 리바운더 선택
 * OFF/DEF 판정 이후 해당 팀 5인 중 누가 리바운드를 잡는지 결정
 * - 공격 리바운드 → offReb 능력치, 수비 리바운드 → defReb 능력치 사용
 */
function selectRebounder(team: TeamState, shooterId: string, isOffensive: boolean): LivePlayer {
    const cfg = SIM_CONFIG.REBOUND;
    const rebAttr: 'offReb' | 'defReb' = isOffensive ? 'offReb' : 'defReb';

    const candidates = team.onCourt.map(p => {
        const posBonus = p.position === 'C' ? cfg.POS_WEIGHT_C
            : p.position === 'PF' ? cfg.POS_WEIGHT_PF
            : cfg.POS_WEIGHT_DEFAULT;
        const shooterPenalty = p.playerId === shooterId ? cfg.SHOOTER_PENALTY : 1.0;

        const score = (
            p.attr[rebAttr] * 0.6 +
            p.attr.vertical * 0.2 +
            (p.attr.height - 180) * 0.5
        ) * posBonus * shooterPenalty * Math.random();

        return { p, score };
    });

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].p;
}

/**
 * 리바운드 해결 (기존 API 유지)
 * 1단계: OFF vs DEF 확률 판정 (calculateOrbChance)
 * 2단계: 해당 팀 내 리바운더 선택 (selectRebounder)
 */
export function resolveRebound(homeTeam: TeamState, awayTeam: TeamState, shooterId: string): { player: LivePlayer, type: 'off' | 'def' } {
    // 슈터 팀 판별
    const isHomeShooter = homeTeam.onCourt.some(p => p.playerId === shooterId);
    const offTeam = isHomeShooter ? homeTeam : awayTeam;
    const defTeam = isHomeShooter ? awayTeam : homeTeam;

    // Step 1: OFF vs DEF 확률 판정
    const orbChance = calculateOrbChance(offTeam, defTeam);
    const isOffensiveRebound = Math.random() < orbChance;

    // Step 2: 팀 내 리바운더 선택
    const winningTeam = isOffensiveRebound ? offTeam : defTeam;
    const player = selectRebounder(winningTeam, shooterId, isOffensiveRebound);
    const type = isOffensiveRebound ? 'off' : 'def';

    return { player, type };
}

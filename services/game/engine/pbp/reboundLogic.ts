
import { TeamState, LivePlayer } from './pbpTypes';
import { SIM_CONFIG } from '../../config/constants';
import { interpolateCurve } from './flowEngine';

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
    // [2026-07-30] 공격/수비 리바운드는 요구 능력치가 다름 — 상황별 전용 공식으로 분리
    // 공격: 밖에서 뛰어들어와 경합 → offReb + hustle + vertical
    // 수비: 이미 박스아웃으로 포지션을 잡은 상태 → defReb + boxOut + vertical + strength
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

    const candidates = team.onCourt.map(p => {
        const shooterPenalty = p.playerId === shooterId ? cfg.SHOOTER_PENALTY : 1.0;

        // [2026-07-30] 공격/수비 리바운드 전용 공식 분리 (calculateOrbChance와 동일 가중치)
        const baseScore = isOffensive
            ? p.attr.offReb * cfg.ORB_REB_WEIGHT + p.attr.hustle * cfg.ORB_HUSTLE_WEIGHT + p.attr.vertical * cfg.ORB_VERTICAL_WEIGHT
            : p.attr.defReb * cfg.DRB_REB_WEIGHT + p.attr.boxOut * cfg.DRB_BOXOUT_WEIGHT + p.attr.vertical * cfg.DRB_VERTICAL_WEIGHT + p.attr.strength * cfg.DRB_STRENGTH_WEIGHT;

        // [2026-07-31] 룰렛이 너무 평평하다는 피드백 — 능력치 점수를 지수(SKILL_EXPONENT=2.0)로
        // 증폭해 실력 격차가 배분 격차로 더 뚜렷하게 드러나도록 함(팀 내 개인 배정 단계에만 적용).
        let score = Math.pow(baseScore, cfg.SKILL_EXPONENT) * shooterPenalty;

        // F-1. Harvester: 압도적 리바운드 능력치 보유자
        // [2026-07-30] ARCHETYPES_ENABLED=false로 비활성화 (다른 히든 아키타입 계열과 통일)
        if (cfg.ARCHETYPES_ENABLED &&
            (p.attr.offReb >= cfg.HARVESTER_REB_THRESHOLD || p.attr.defReb >= cfg.HARVESTER_REB_THRESHOLD)) {
            score *= cfg.HARVESTER_SCORE_MULTIPLIER;
        }

        // F-2. Raider: 키 작지만 공격 리바운드 + 점프력 우수 (공격 리바운드 전용)
        if (cfg.ARCHETYPES_ENABLED && isOffensive &&
            p.attr.height <= cfg.RAIDER_MAX_HEIGHT &&
            p.attr.offReb >= cfg.RAIDER_OFFREB_THRESHOLD &&
            p.attr.vertical >= cfg.RAIDER_VERTICAL_THRESHOLD) {
            score *= cfg.RAIDER_SCORE_MULTIPLIER;
        }

        // [2026-07-31] motorIntensity 단독 ±15% → motor/신장/포지션 3분할 곱셈 보정으로 재설계.
        // 각 요소 0.5~1.5 범위로 정규화 후 계수(0.1)를 곱해 합산 — 셋 다 극단으로 몰리면 기존과
        // 동일하게 최대 ±15%, 보통은 서로 상쇄되어 순수 모터 하나가 좌우하던 것보다 완만해짐.
        // ⚠ types/player.ts 텐던시 문서의 "motor 단독 ±15%" 스펙은 이제 이 설계와 불일치(추후 검토).
        const motorFactor = p.tendencies?.motorIntensity ?? 1.0;
        const heightFactor = interpolateCurve(p.attr.height, cfg.HEIGHT_CURVE);
        const posFactor = cfg.POSITION_FACTOR[p.position] ?? 1.0;
        score *= (0.7 + motorFactor * cfg.MOTOR_COEFF + heightFactor * cfg.HEIGHT_COEFF + posFactor * cfg.POSITION_COEFF);

        return { p, score };
    });

    // Weighted random: 점수 비례 확률 선택 (winner-take-all 방지)
    const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);
    let r = Math.random() * totalScore;
    for (const c of candidates) {
        r -= c.score;
        if (r <= 0) return c.p;
    }
    return candidates[candidates.length - 1].p;
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

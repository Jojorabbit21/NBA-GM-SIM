
// 오프시즌 훈련 엔진
// 코칭스태프 능력치 × 훈련 프로그램 배분 → 선수 능력치 성장

import type { Team } from '../../types/team';
import type { Player } from '../../types/player';
import type { CoachingStaff, LeagueCoachingData } from '../../types/coaching';
import type {
    LeagueTrainingConfigs,
    TrainingProgramKey,
} from '../../types/training';
import {
    TRAINING_PROGRAM_KEYS,
    TRAINING_PROGRAM_ATTRS,
    calcTotalTrainingPoints,
} from '../../types/training';
import type { TrainingEfficiency } from '../../types/training';
import type { SkillAttribute } from '../playerDevelopment/playerAging';
import { applyDevelopmentResult } from '../playerDevelopment/playerAging';
import type { PerGameResult } from '../playerDevelopment/playerAging';
import { calculateOvr } from '../../utils/ovrUtils';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const BASE_GROWTH_PER_PT = 0.025; // 포인트당 기본 성장량

// 나이별 성장 배율
function getAgeMult(age: number, programKey: TrainingProgramKey): number {
    const isPhysical = programKey === 'explosivnessTraining' || programKey === 'strengthTraining';
    if (age <= 22) return 1.3;
    if (age <= 25) return 1.0;
    if (age <= 29) return 0.7;
    if (age <= 33) return isPhysical ? 0.2 : 0.4;
    return isPhysical ? 0.05 : 0.2;
}

// ─────────────────────────────────────────────
// 코치 효율 계산
// ─────────────────────────────────────────────

/**
 * 코칭스태프 능력치 → 각 훈련 프로그램별 효율 계산 (0.5~1.0)
 * 코치 미배치 슬롯은 0.5 기본값
 */
export function computeTrainingEfficiency(
    staff: CoachingStaff,
    budget: number,
    trainingInvestmentMult?: number,
): TrainingEfficiency {
    const oc = staff.offenseCoordinator?.abilities;
    const dc = staff.defenseCoordinator?.abilities;
    const hc = staff.headCoach?.abilities;
    const dev = staff.developmentCoach?.abilities;
    const trainer = staff.trainingCoach?.abilities;

    // 능력치 가중합 → 0~10 스케일 → 0.5~1.0으로 정규화
    // coachEff = rawScore / 10 * 0.5 + 0.5
    function norm(raw: number): number {
        return Math.min(1.0, Math.max(0.5, raw / 10 * 0.5 + 0.5));
    }

    // OC 담당
    const shootingEff = oc
        ? norm(oc.teaching * 0.5 + oc.schemeDepth * 0.3 + oc.communication * 0.2)
        : 0.5;
    const insideEff = oc
        ? norm(oc.teaching * 0.6 + oc.playerEval * 0.2 + oc.communication * 0.2)
        : 0.5;
    const playmakingEff = oc
        ? norm(oc.teaching * 0.4 + oc.schemeDepth * 0.4 + oc.communication * 0.2)
        : 0.5;

    // DC 담당
    const manDefEff = dc
        ? norm(dc.teaching * 0.6 + dc.playerEval * 0.2 + dc.communication * 0.2)
        : 0.5;
    const helpDefEff = dc
        ? norm(dc.teaching * 0.4 + dc.schemeDepth * 0.4 + dc.communication * 0.2)
        : 0.5;
    const reboundEff = dc
        ? norm(dc.teaching * 0.5 + dc.adaptability * 0.3 + dc.communication * 0.2)
        : 0.5;

    // TrainingCoach 담당
    const explosivnessEff = trainer
        ? norm(trainer.athleticTraining * 0.7 + trainer.conditioning * 0.3)
        : 0.5;
    const strengthEff = trainer
        ? norm(trainer.conditioning * 0.6 + trainer.athleticTraining * 0.4)
        : 0.5;

    // HC + Dev 공동 담당 (전술 훈련)
    // 한쪽만 있을 경우 해당 가중치 합산 (최대 0.5), norm이 0.5로 클램프되어 효율 50% 최저 보장
    const offTacticsRaw =
        (hc ? hc.mentalCoaching * 0.3 + hc.motivation * 0.2 : 0) +
        (dev ? dev.schemeDepth * 0.3 + dev.teaching * 0.2 : 0);
    const offTacticsEff = (hc || dev) ? norm(offTacticsRaw) : 0.5;

    const defTacticsRaw =
        (hc ? hc.mentalCoaching * 0.3 + hc.adaptability * 0.2 : 0) +
        (dev ? dev.schemeDepth * 0.3 + dev.teaching * 0.2 : 0);
    const defTacticsEff = (hc || dev) ? norm(defTacticsRaw) : 0.5;

    // HC 전체 보정 (globalMult) × 훈련 투자 보정
    const baseGlobalMult = hc
        ? 1.0 + (hc.motivation * 0.3 + hc.playerRelation * 0.4 + hc.adaptability * 0.3) / 10 * 0.2
        : 1.0;
    const globalMult = baseGlobalMult * (trainingInvestmentMult ?? 1.0);

    // Dev 코치 보정 배율 (선수 나이 조건은 processOffseasonTraining에서 판단)
    const youngPlayerMult = dev
        ? 1 + dev.developmentVision / 40
        : 1.0;
    const rookieMult = dev
        ? 1 + dev.experienceTransfer / 35
        : 1.0;

    const totalPoints = calcTotalTrainingPoints(budget);

    return {
        shootingEff,
        insideEff,
        playmakingEff,
        manDefEff,
        helpDefEff,
        reboundEff,
        explosivnessEff,
        strengthEff,
        offTacticsEff,
        defTacticsEff,
        globalMult,
        youngPlayerMult,
        rookieMult,
        totalPoints,
    };
}

// ─────────────────────────────────────────────
// 프로그램 키 → TrainingEfficiency 필드 매핑
// ─────────────────────────────────────────────

const EFF_KEY_MAP: Record<TrainingProgramKey, keyof TrainingEfficiency> = {
    shootingTraining:      'shootingEff',
    insideTraining:        'insideEff',
    playmakingTraining:    'playmakingEff',
    manDefTraining:        'manDefEff',
    helpDefTraining:       'helpDefEff',
    reboundTraining:       'reboundEff',
    explosivnessTraining:  'explosivnessEff',
    strengthTraining:      'strengthEff',
    offTacticsTraining:    'offTacticsEff',
    defTacticsTraining:    'defTacticsEff',
};

// ─────────────────────────────────────────────
// 선수 1명 훈련 결과 계산
// ─────────────────────────────────────────────

function computePlayerTrainingResult(
    player: Player,
    programAlloc: Record<TrainingProgramKey, number>,
    eff: TrainingEfficiency,
): PerGameResult {
    const age = (player as any).age ?? 25;
    const fractionalDeltas: Partial<Record<SkillAttribute, number>> = {};
    const integerChanges: Partial<Record<SkillAttribute, number>> = {};

    // 기존 소수점 누적값
    const existingFrac: Partial<Record<SkillAttribute, number>> =
        (player.fractionalGrowth as any) ?? {};

    for (const programKey of TRAINING_PROGRAM_KEYS) {
        const pts = programAlloc[programKey] ?? 0;
        if (pts <= 0) continue;

        const coachEff = eff[EFF_KEY_MAP[programKey]] as number;
        const ageMult = getAgeMult(age, programKey);

        // youngPlayerMult / rookieMult: age 조건 적용
        const yMult = age <= 25 ? eff.youngPlayerMult : 1.0;
        const rMult = age <= 22 ? eff.rookieMult : 1.0;

        const programDelta =
            pts * coachEff * BASE_GROWTH_PER_PT * eff.globalMult * ageMult * yMult * rMult;

        const attrs = TRAINING_PROGRAM_ATTRS[programKey] as SkillAttribute[];
        const deltaPerAttr = programDelta / attrs.length;

        for (const attr of attrs) {
            const prev = existingFrac[attr] ?? 0;
            const newAcc = prev + deltaPerAttr;
            const intPart = Math.floor(newAcc);

            fractionalDeltas[attr] = (fractionalDeltas[attr] ?? 0) + deltaPerAttr;
            if (intPart > 0) {
                integerChanges[attr] = (integerChanges[attr] ?? 0) + intPart;
            }
        }
    }

    return {
        playerId: player.id,
        fractionalDeltas,
        integerChanges,
        changeEvents: [],
    };
}

// ─────────────────────────────────────────────
// 오프시즌 훈련 메인 함수
// ─────────────────────────────────────────────

/**
 * 오프시즌 훈련 처리 — moratoriumStart 직후 processOffseason() 다음에 호출
 *
 * @param teams         모든 팀 배열
 * @param trainingConfigs  팀별 훈련 설정 (league_training_configs)
 * @param coachingData  팀별 코칭스태프 (league_coaching_data)
 */
export function processOffseasonTraining(
    teams: Team[],
    trainingConfigs: LeagueTrainingConfigs | null | undefined,
    coachingData: LeagueCoachingData | null | undefined,
    trainingInvestmentMults?: Record<string, number>,
): void {
    if (!trainingConfigs || !coachingData) return;

    for (const team of teams) {
        const config = trainingConfigs[team.id];
        const staff = coachingData[team.id];
        if (!config || !staff) continue;

        const investMult = trainingInvestmentMults?.[team.id] ?? 1.0;
        const eff = computeTrainingEfficiency(staff, config.budget, investMult);
        const totalPoints = eff.totalPoints;

        // 프로그램별 포인트 배분 (개별 최대 cap: totalPoints × 0.5)
        const maxPerProgram = Math.floor(totalPoints * 0.5);
        const allocCapped: Record<TrainingProgramKey, number> = {} as any;
        for (const key of TRAINING_PROGRAM_KEYS) {
            allocCapped[key] = Math.min(config.program[key] ?? 0, maxPerProgram);
        }

        for (const player of team.roster) {
            const result = computePlayerTrainingResult(player, allocCapped, eff);
            // 변화가 있는 경우에만 적용
            const hasChange = Object.values(result.integerChanges).some(v => (v ?? 0) !== 0)
                || Object.values(result.fractionalDeltas).some(v => (v ?? 0) !== 0);
            if (hasChange) {
                applyDevelopmentResult(player, result);
            }
        }
    }
}

// ─────────────────────────────────────────────
// OVR 계산 헬퍼 (미사용이지만 향후 활용 가능)
// ─────────────────────────────────────────────

export function getPlayerOvrAfterTraining(player: Player): number {
    return calculateOvr(player);
}


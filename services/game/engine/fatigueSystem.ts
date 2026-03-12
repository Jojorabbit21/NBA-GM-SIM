
import { LivePlayer } from './pbp/pbpTypes';
import { TacticalSliders, Player, Team } from '../../../types';
import { SIM_CONFIG } from '../config/constants';

/**
 * Calculates incremental fatigue during a possession based on various factors.
 */
export function calculateIncrementalFatigue(
    player: LivePlayer,
    timeTakenSeconds: number,
    sliders: TacticalSliders,
    isB2B: boolean,
    isStopper: boolean,
    injuryFrequency: number = 1.0
) {
    const C = SIM_CONFIG.FATIGUE;
    let drain = (timeTakenSeconds / 60) * C.DRAIN_BASE;

    // Mitigation based on player stamina attribute
    // stamina 50 = 기준(변화 없음), 90 = 12% 감소, 30 = 6% 증가
    const staminaMitigation = (player.attr.stamina - 50) / 100;
    drain *= (1 - staminaMitigation * 0.30);

    if (isB2B) drain *= 1.5;
    if (isStopper) drain *= 1.3;

    // [New] Full Court Press Fatigue Impact
    // Pressing consumes significantly more energy.
    // Scale: Level 1 (0% penalty) -> Level 10 (45% penalty)
    if (sliders.fullCourtPress > 1) {
        const pressPenalty = (sliders.fullCourtPress - 1) * 0.05;
        drain *= (1.0 + pressPenalty);
    }

    // [Fix] player.currentCondition이 0 미만으로 계산에 참여하지 않도록 Math.max 처리
    const effectiveCondition = Math.max(0, player.currentCondition);
    const cumulativeFatiguePenalty = 1.0 + Math.max(0, (100 - effectiveCondition) * 0.012);
    drain *= cumulativeFatiguePenalty;

    // Injury Check (Micro-roll) — injuriesEnabled는 stateUpdater에서 체크
    // 기본 확률(0.03%) + 체력 저하 시 추가 확률 (durability 반영)
    let injuryOccurred = false;
    const durability = player.attr?.durability ?? 70;
    // 기본 부상 확률: durability 비선형 커브
    // dur 90+: 0.05/10000 (철인), dur 70: 0.17, dur 55: 0.31 (경계)
    // dur 55 이하: 이차함수 급등 (dur 50: 1.31, dur 45: 4.31, dur 40: 9.31)
    // dur 40 미만은 40으로 취급 (바닥)
    const clampedDur = Math.max(40, durability);
    let baseInjuryChance: number;
    if (clampedDur >= 55) {
        baseInjuryChance = Math.max(0.05, 0.8 - clampedDur * 0.009);
    } else {
        // 55~40: 전 구간 급경사 (gap² × 0.04)
        const gap = 55 - clampedDur;
        baseInjuryChance = 0.305 + gap * gap * 0.04;
    }
    // 체력 저하 추가 확률: 체력 35 이하부터 완만 증가, 10 이하에서 소폭 급등
    let fatigueBonus = 0;
    if (effectiveCondition < 35) {
        fatigueBonus = (35 - effectiveCondition) * 0.15;
    }
    if (effectiveCondition < 10) {
        fatigueBonus += (10 - effectiveCondition) * 0.5;
    }
    const totalChance = (baseInjuryChance + fatigueBonus) * injuryFrequency;
    const roll = Math.random() * 10000;
    if (roll < totalChance) {
        injuryOccurred = true;
    }

    return { drain, injuryOccurred };
}

/**
 * 선수별 체력 회복량 계산 (Stamina + Durability 반영)
 * 벤치 회복, 타임아웃, 쿼터 휴식, 하프타임 등 모든 회복에 공통 적용.
 *
 * stamina 50 / durability 50 = 기준(변화 없음)
 * stamina 90 / durability 90 = +12% / +8% = 총 +20% 회복량
 * stamina 30 / durability 30 = -6% / -4% = 총 -10% 회복량
 */
export function calculateRecovery(player: LivePlayer, baseAmount: number): number {
    const C = SIM_CONFIG.FATIGUE;
    const staminaBonus  = ((player.attr.stamina    ?? 50) - 50) / 100;
    const durabilityBonus = ((player.attr.durability ?? 50) - 50) / 100;
    const multiplier = 1
        + staminaBonus   * C.RECOVERY_STAMINA_FACTOR
        + durabilityBonus * C.RECOVERY_DURABILITY_FACTOR;
    return baseAmount * multiplier;
}

export interface TrainingInjury {
    playerId: string;
    playerName: string;
    teamId: string;
    injuryType: string;
    duration: string;
    severity: 'Minor' | 'Major' | 'Season-Ending';
}

/**
 * 비경기일 휴식 회복: 모든 팀의 모든 선수에게 REST_DAY_RECOVERY 적용.
 * stamina/durability가 높을수록 더 빠르게 회복.
 *
 * 훈련 중 부상: 건강한 선수 중 durability가 낮은 선수는 훈련/일상 활동 중 부상 가능.
 * 경기 중 부상 확률의 ~1/5 수준. 3단계 등급 (Minor/Major/Season-Ending).
 * 경기 중보다 중증(SE/Major) 비율 절반으로 감소.
 * dur 90+: 거의 0%, dur 55 이하: 급증 (비선형 커브 동일)
 *
 * 기본 40pt 회복 기준:
 *   stamina 50 / durability 50 → 40 회복
 *   stamina 90 / durability 90 → 48 회복
 *   stamina 30 / durability 30 → 36 회복
 */
export function applyRestDayRecovery(teams: Team[], injuryFrequency: number = 1.0): TrainingInjury[] {
    const C = SIM_CONFIG.FATIGUE;
    const base = C.REST_DAY_RECOVERY;
    const trainingInjuries: TrainingInjury[] = [];

    for (const team of teams) {
        for (const player of team.roster) {
            // 체력 회복
            const current = player.condition ?? 100;
            if (current < 100) {
                const staminaBonus = ((player.stamina ?? 50) - 50) / 100;
                const durabilityBonus = ((player.durability ?? 50) - 50) / 100;
                const multiplier = 1
                    + staminaBonus * C.RECOVERY_STAMINA_FACTOR
                    + durabilityBonus * C.RECOVERY_DURABILITY_FACTOR;

                const recovery = base * multiplier;
                const newCondition = Math.min(100, current + recovery);
                const delta = newCondition - current;

                player.condition = parseFloat(newCondition.toFixed(1));
                player.conditionDelta = parseFloat(delta.toFixed(1));
            }

            // 훈련 중 부상 체크 (건강한 선수만)
            if (player.health !== 'Healthy') continue;

            const durability = player.durability ?? 70;
            const clampedDur = Math.max(40, durability);
            let baseChance: number;
            if (clampedDur >= 55) {
                // dur 55~99: 완만 (경기 중의 1/5)
                baseChance = Math.max(0.01, (0.8 - clampedDur * 0.009)) * 0.2;
            } else {
                // dur 40~55: 이차함수 급등 (경기 중의 1/5)
                const gap = 55 - clampedDur;
                baseChance = (0.305 + gap * gap * 0.04) * 0.2;
            }

            const totalChance = baseChance * injuryFrequency;
            const roll = Math.random() * 10000;
            if (roll >= totalChance) continue;

            // 부상 등급 결정 (Minor / Major / Season-Ending)
            // 경기 중보다 중증 비율 낮춤: SE 절반, Major 절반
            const tierRoll = Math.random() * 100;
            const seThreshold = Math.max(0.5, (12 - durability * 0.12)) * 0.5;
            const majorThreshold = seThreshold + Math.max(5, (40 - durability * 0.3)) * 0.5;

            let type: string;
            let duration: string;
            let severity: 'Minor' | 'Major' | 'Season-Ending';

            // pickWeighted: 낮은 durability → 긴 기간에 가중
            const pickWeighted = (options: string[], dur: number): string => {
                const n = options.length;
                const bias = (70 - dur) * 0.05;
                const weights = options.map((_, i) => {
                    const normalized = i / (n - 1);
                    return Math.max(0.1, 1 + bias * (normalized * 2 - 1));
                });
                const wTotal = weights.reduce((a, b) => a + b, 0);
                let r = Math.random() * wTotal;
                for (let i = 0; i < n; i++) {
                    r -= weights[i];
                    if (r <= 0) return options[i];
                }
                return options[n - 1];
            };

            if (tierRoll < seThreshold) {
                severity = 'Season-Ending';
                const seInjuries = ['전방십자인대(ACL) 파열', '아킬레스건 파열', '골절', '반월판 파열'];
                type = seInjuries[Math.floor(Math.random() * seInjuries.length)];
                duration = '시즌아웃';
            } else if (tierRoll < majorThreshold) {
                severity = 'Major';
                const majorInjuries = ['햄스트링 부상', '종아리 부상', '발목 인대 손상', '허리 경련', '어깨 부상', '사타구니 부상'];
                type = majorInjuries[Math.floor(Math.random() * majorInjuries.length)];
                duration = pickWeighted(['2주', '3주', '1개월'], durability);
            } else {
                severity = 'Minor';
                const minorInjuries = ['근육 경직', '타박상', '발목 염좌', '무릎 통증', '허리 경직'];
                type = minorInjuries[Math.floor(Math.random() * minorInjuries.length)];
                duration = pickWeighted(['당일 복귀', '3일', '1주'], durability);
            }

            player.health = 'Injured';
            player.injuryType = type;
            // returnDate는 호출측에서 computeReturnDate로 변환
            player.returnDate = duration;

            trainingInjuries.push({
                playerId: player.id,
                playerName: player.name,
                teamId: team.id,
                injuryType: type,
                duration,
                severity,
            });
        }
    }

    return trainingInjuries;
}

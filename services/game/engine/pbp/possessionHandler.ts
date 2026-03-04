
import { GameState, PossessionResult, LivePlayer, TeamState, ClutchContext } from './pbpTypes';
import { resolvePlayAction } from './playTypes';
import { calculateHitRate, interpolateCurve } from './flowEngine';
import { resolveRebound } from './reboundLogic';
import { getTopPlayerGravity, getTeamOptionRanks } from './usageSystem';
import { PlayType } from '../../../../types';
import { SIM_CONFIG } from '../../config/constants';
import { computePlayTypeWeights } from '../../config/playTypeProfiles';
import { resolveDynamicZone } from '../shotDistribution';

type PnrCoverage = 'drop' | 'hedge' | 'blitz' | 'none';

/**
 * Identify Defender using Sliders
 */
function identifyDefender(
    defTeam: TeamState,
    actor: LivePlayer,
    secondaryActor: LivePlayer | undefined,
    playType: PlayType,
    isActorAce: boolean,
    targetZone: 'Rim' | 'Paint' | 'Mid' | '3PT',
    isZone: boolean,  // Pre-calculated in simulatePossession (probabilistic: zoneFreq*0.08)
    screener?: LivePlayer  // OffBallScreen: 스크리너 (수비 스위치 기준)
): { defender: LivePlayer, isSwitch: boolean, isBotchedSwitch: boolean, pnrCoverage: PnrCoverage, screenerDefender?: LivePlayer } {

    const sliders = defTeam.tactics.sliders;

    if (isZone) {
        // Funnel inside shots to Bigs
        if (targetZone === 'Rim' || targetZone === 'Paint') {
            const anchor = defTeam.onCourt.find(p => p.position === 'C') ||
                           defTeam.onCourt.find(p => p.position === 'PF');
            if (anchor) return { defender: anchor, isSwitch: false, isBotchedSwitch: false, pnrCoverage: 'none' };
        }
    }

    // 1. Ace Stopper Logic (If explicitly set in Tactics, still respected)
    if (isActorAce && defTeam.tactics.stopperId && !isZone) {
        const stopper = defTeam.onCourt.find(p => p.playerId === defTeam.tactics.stopperId);
        if (stopper) return { defender: stopper, isSwitch: false, isBotchedSwitch: false, pnrCoverage: 'none' };
    }

    // 2. Default Defender
    let defender = defTeam.onCourt.find(p => p.position === actor.position);
    if (!defender) defender = defTeam.onCourt[Math.floor(Math.random() * 5)];

    // 3. Switch Logic
    // Driven by 'switchFreq' slider (1-10)
    // 1 = 5%, 5 = 25%, 10 = 50% base switch chance on screens
    const isScreenPlay = ['PnR_Handler', 'PnR_Roll', 'PnR_Pop', 'Handoff', 'OffBallScreen'].includes(playType);

    // OffBallScreen: screener의 포지션으로 수비수 탐색, 나머지: secondaryActor 사용
    const screenPlayer = screener || secondaryActor;

    if (isScreenPlay && !isZone && screenPlayer) {
        const switchChance = sliders.switchFreq * 0.05;

        if (Math.random() < switchChance) {
            // Find screener's defender
            let switchDef = defTeam.onCourt.find(p => p.position === screenPlayer.position);
            if (!switchDef) switchDef = defTeam.onCourt.find(p => p.playerId !== defender!.playerId);

            if (switchDef) {
                // Botched Switch Check based on HelpDef slider
                // Lower HelpDef = Higher confusion risk
                const confusionChance = Math.max(0, (10 - sliders.helpDef) * 0.02);
                const isBotched = Math.random() < confusionChance;

                return { defender: switchDef, isSwitch: true, isBotchedSwitch: isBotched, pnrCoverage: 'none' };
            }
        }

        // 4. PnR Coverage (스위치 실패 시, PnR 플레이에서만)
        const isPnrPlay = ['PnR_Handler', 'PnR_Roll', 'PnR_Pop'].includes(playType);
        if (isPnrPlay) {
            const pnrDef = Math.max(0, Math.min(2, Math.round(sliders.pnrDefense)));
            const dist = SIM_CONFIG.PNR_COVERAGE.DIST[pnrDef] || SIM_CONFIG.PNR_COVERAGE.DIST[1];
            const [dropPct, hedgePct] = dist;

            const roll = Math.random();
            let coverage: PnrCoverage;
            if (roll < dropPct) coverage = 'drop';
            else if (roll < dropPct + hedgePct) coverage = 'hedge';
            else coverage = 'blitz';

            // 빅맨(스크리너 수비수) 식별
            const screenerDef = defTeam.onCourt.find(p => p.position === screenPlayer.position)
                             || defTeam.onCourt.find(p => p.position === 'C')
                             || defTeam.onCourt.find(p => p.position === 'PF');

            return { defender, isSwitch: false, isBotchedSwitch: false, pnrCoverage: coverage, screenerDefender: screenerDef || undefined };
        }
    }

    return { defender, isSwitch: false, isBotchedSwitch: false, pnrCoverage: 'none' };
}

/**
 * 턴오버/스틸 판정 (인과관계 정상화 재설계)
 *
 * A. 스틸 판정 (수비가 원인 → 턴오버가 결과)
 *    A-1. 온볼 스틸: 주 수비자가 볼 핸들러에게서 직접 탈취
 *    A-2. 패싱레인 스틸: 오프볼 수비자가 패스를 가로챔 (패스 플레이 전용)
 *
 * B. 비강제 턴오버 (공격자 자체 실수, 스틸 아님)
 *    핸들링 실수, 악송구, 밟힘 등
 */
function calculateTurnoverChance(
    offTeam: TeamState,
    defTeam: TeamState,
    actor: LivePlayer,
    defender: LivePlayer,
    playType: PlayType,
    pnrCoverage: PnrCoverage = 'none'
): { isTurnover: boolean, isSteal: boolean, stealer?: LivePlayer } {

    const stlCfg = SIM_CONFIG.STEAL;
    const sliders = offTeam.tactics.sliders;
    const defIntensity = defTeam.tactics.sliders.defIntensity;

    const isPassPlay = playType === 'CatchShoot' || playType === 'Handoff'
        || playType === 'PnR_Handler' || playType === 'PnR_Roll'
        || playType === 'PnR_Pop' || playType === 'Cut'
        || playType === 'OffBallScreen' || playType === 'DriveKick';

    // ================================================================
    // A-1. 온볼 스틸 (주 수비자 → 볼 핸들러 직접 탈취)
    // ================================================================
    const onballBase = interpolateCurve(defender.attr.stl, stlCfg.ONBALL_STEAL_CURVE);
    // 공격자 핸들링 저항: handling 높을수록 스틸당할 확률 감소
    const handlingResist = (actor.attr.handling - 70) * stlCfg.HANDLING_RESIST_COEFF;
    // 수비 강도 슬라이더 보너스 (defIntensity > 5일 때 소폭 증가)
    const intensityBonus = Math.max(0, (defIntensity - 5) * 0.003);
    // PnR 블리츠: 더블팀 압박으로 온볼 스틸 확률 증가
    const pnrCfg = SIM_CONFIG.PNR_COVERAGE;
    const blitzBonus = (pnrCoverage === 'blitz' && playType === 'PnR_Handler') ? 0.02 : 0;

    const onballProb = Math.max(0.005, onballBase - handlingResist + intensityBonus + blitzBonus);

    if (Math.random() < onballProb) {
        return { isTurnover: true, isSteal: true, stealer: defender };
    }

    // ================================================================
    // A-2. 패싱레인 스틸 (오프볼 수비자 → 패스 가로채기, 패스 플레이 전용)
    // ================================================================
    if (isPassPlay) {
        // 공격자 패스 정확도 저항
        const passResist = (actor.attr.passAcc - 70) * stlCfg.PASSACC_RESIST_COEFF;

        for (const helper of defTeam.onCourt) {
            if (helper.playerId === defender.playerId) continue;

            // passPerc 가중 stl: 패싱레인 읽기 능력 반영
            const effectiveStl = helper.attr.stl * 0.7 + helper.attr.passPerc * 0.3;
            const laneBase = interpolateCurve(effectiveStl, stlCfg.LANE_STEAL_CURVE);
            const laneProb = Math.max(0.001, laneBase - passResist);

            if (Math.random() < laneProb) {
                return { isTurnover: true, isSteal: true, stealer: helper };
            }
        }
    }

    // ================================================================
    // B. 비강제 턴오버 (공격자 자체 실수, 스틸 기록 없음)
    // ================================================================
    let baseProb = 0.06;

    // 볼무브 리스크: 패스 많이 돌릴수록 실수 확률 증가
    const rawPassRisk = Math.max(0, (sliders.ballMovement - 5) * 0.004);
    const teamAvgVision = offTeam.onCourt.reduce((s, p) => s + p.attr.passVision, 0) / 5;
    const visionDampen = Math.max(0.85, Math.min(1.15, 1 - (teamAvgVision - 70) * 0.005));
    const passRisk = rawPassRisk * visionDampen;

    // 수비 압박: 수비 강도가 높으면 실수 유발
    const pressureRisk = Math.max(0, (defIntensity - 5) * 0.005);

    // 공격자 능력치: 핸들링/IQ/손 부족 → 실수
    const handlingFactor = (70 - actor.attr.handling) * 0.001;
    const iqFactor = (70 - actor.attr.passIq) * 0.001;
    const isContactPlay = playType === 'PostUp' || playType === 'PnR_Handler' || playType === 'PnR_Roll' || playType === 'PnR_Pop';
    const handsFactor = (70 - actor.attr.hands) * (isContactPlay ? 0.0015 : 0.0005);
    const passAccFactor = (70 - actor.attr.passAcc) * (isPassPlay ? 0.0012 : 0.0005);

    // 플레이타입 컨텍스트
    let contextRisk = 0;
    if (playType === 'Transition') {
        contextRisk = 0.03;
        contextRisk += Math.max(0, (70 - actor.attr.passAcc)) * 0.001;
    } else if (playType === 'Iso') contextRisk = 0.01;
    else if (playType === 'PostUp') contextRisk = 0.02;

    // PnR 커버리지 압박
    if (pnrCoverage === 'blitz' && playType === 'PnR_Handler') {
        contextRisk += pnrCfg.BLITZ_TOV_BONUS;
    }
    if (pnrCoverage === 'hedge' && playType === 'PnR_Handler') {
        contextRisk += pnrCfg.HEDGE_TOV_BONUS;
    }

    // 침착성 (SaveTendency)
    const composureFactor = -(actor.tendencies?.composure ?? 0) * 0.01;

    // 드리블 갭 리스크: speed↑ spdBall↓ 차이
    let dribbleGapRisk = 0;
    const isDribblePlay = playType === 'Iso' || playType === 'Cut' || playType === 'Transition' || playType === 'PnR_Handler';
    if (isDribblePlay) {
        dribbleGapRisk = Math.max(0, actor.attr.speed - actor.attr.spdBall) * 0.001;
    }

    // Needle 아키타입: 패스 플레이 턴오버 감소
    let needleReduction = 0;
    const pmCfg = SIM_CONFIG.PLAYMAKING;
    if (pmCfg.ENABLED && isPassPlay &&
        actor.attr.passAcc >= pmCfg.NEEDLE_PASSACC_THRESHOLD &&
        actor.attr.passIq >= pmCfg.NEEDLE_PASSIQ_THRESHOLD) {
        needleReduction = pmCfg.NEEDLE_TOV_REDUCTION;
    }

    let unforcedProb = baseProb + passRisk + pressureRisk + handlingFactor + iqFactor
        + handsFactor + passAccFactor + contextRisk + composureFactor
        + dribbleGapRisk - needleReduction;

    unforcedProb = Math.max(0.015, Math.min(0.18, unforcedProb));

    if (Math.random() < unforcedProb) {
        return { isTurnover: true, isSteal: false };
    }

    // C. 턴오버 없음
    return { isTurnover: false, isSteal: false };
}

/**
 * 모멘텀 런 보너스 계산 (에포크 diff 기반)
 * 런 팀의 hitRate에 소폭 보너스 적용. 타임아웃이 유일한 차단 수단.
 */
function getMomentumBonus(state: GameState, offTeamId: string): number {
    const m = state.momentum;
    if (!m.activeRun || m.activeRun.teamId !== offTeamId) return 0;

    const diff = offTeamId === state.home.id
        ? m.homeEpochPts - m.awayEpochPts
        : m.awayEpochPts - m.homeEpochPts;

    if (diff < 8)  return 0;
    if (diff < 12) return 0.015; //  8-11pt 런: +1.5%
    if (diff < 16) return 0.025; // 12-15pt 런: +2.5%
    return 0.035;                 // 16pt+  런: +3.5% (상한)
}

export function simulatePossession(state: GameState, options?: { minHitRate?: number; clutchContext?: ClutchContext }): PossessionResult {
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = state.possession === 'home' ? state.away : state.home;
    const sliders = offTeam.tactics.sliders;

    // 1. Play Selection based on Sliders
    let selectedPlayType: PlayType = 'Iso';
    let isSecondChance = false;

    if (state.shotClock === 14 && state.gameClock < 720) {
        // High OffReb slider increases immediate putback chance
        // [Fix] Reduced: was 0.5+(offReb*0.03) → max 80%. Now realistic 25-35%.
        const putbackChance = 0.15 + (sliders.offReb * 0.02);
        if (Math.random() < putbackChance) {
            selectedPlayType = 'Putback';
            isSecondChance = true;
        }
    }

    if (!isSecondChance) {
        // 3개 추상 슬라이더 → 10개 하프코트 플레이타입 가중치 산출
        const weights = computePlayTypeWeights(sliders);

        // Star Gravity: 1옵션의 공격력이 높을수록 Hero 플레이 비중 증가
        // 현실 NBA에서 에이스가 코트에 있으면 팀 전술 자체가 스타 중심으로 변하는 것을 반영
        const topGravity = getTopPlayerGravity(offTeam);
        const gravityBoost = Math.min(0.30, Math.max(0, (topGravity - 65) * 0.015));
        // gravity 90 → min(0.30, 0.375) = 0.30 → Hero 30% 증가
        // gravity 78 → 0.195 → Hero 20% 증가
        // gravity 65 이하 → 0 (벤치 유닛은 시스템 플레이 유지)
        weights['Iso'] *= (1 + gravityBoost);
        weights['PnR_Handler'] *= (1 + gravityBoost);
        weights['PostUp'] *= (1 + gravityBoost * 0.5);

        // Clutch Play Selection: 경기 상황에 따른 전술 보정
        const cc = options?.clutchContext;
        if (cc?.isClutch) {
            const isOffTrailing = (state.possession === 'home' && cc.trailingTeamSide === 'home') ||
                                  (state.possession === 'away' && cc.trailingTeamSide === 'away');
            const isOffLeading = cc.trailingTeamSide !== null && !isOffTrailing;

            if (isOffTrailing && cc.scoreDiff >= 3) {
                // 뒤지는 팀: 3점 비중 대폭 증가, 포스트업 감소
                weights['CatchShoot'] *= (1 + cc.desperation * 0.8);
                weights['PnR_Pop'] *= (1 + cc.desperation * 0.5);
                weights['PostUp'] *= (1 - cc.desperation * 0.4);
                weights['Cut'] *= (1 - cc.desperation * 0.3);
            } else if (isOffLeading) {
                // 이기는 팀: Iso/PostUp 비중 증가 (시간 소비 목적)
                weights['Iso'] *= (1 + cc.desperation * 0.5);
                weights['PostUp'] *= (1 + cc.desperation * 0.4);
                weights['CatchShoot'] *= (1 - cc.desperation * 0.3);
                weights['Transition'] = 0; // 속공 자제
            }
        }

        // Add Transition chance based on Pace
        // Pace 10 -> High transition
        if (Math.random() < (sliders.pace * 0.03)) {
             selectedPlayType = 'Transition';
        } else {
            // Weighted Random Choice
            const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
            let r = Math.random() * totalW;
            for (const [pt, w] of Object.entries(weights)) {
                r -= w;
                if (r <= 0) {
                    selectedPlayType = pt as PlayType;
                    break;
                }
            }
        }
    }

    const playCtx = resolvePlayAction(offTeam, selectedPlayType, sliders);
    const { actor, secondaryActor, screener, preferredZone, bonusHitRate, shotType } = playCtx;
    const isActorAce = actor.playerId === offTeam.acePlayerId;

    // 2. Identify Defender
    // zoneFreq=1: 8% 발동, zoneFreq=5: 40%, zoneFreq=10: 80%
    const isZone = Math.random() < defTeam.tactics.sliders.zoneFreq * 0.08;
    const { defender, isSwitch, isBotchedSwitch, pnrCoverage, screenerDefender } = identifyDefender(
        defTeam, actor, secondaryActor, selectedPlayType, isActorAce, preferredZone, isZone, screener
    );

    // 3. Shooting Foul Check (존별 단일 확률 + drawFoul 커브)
    // 이중 게이트(baseFoul × shootingRatio) 제거 → 존별 직접 슈팅파울 확률
    const defIntensity = defTeam.tactics.sliders.defIntensity;
    const offFoulConfig = SIM_CONFIG.FOUL_EVENTS;
    const sFoulCfg = SIM_CONFIG.SHOOTING_FOUL;

    // 존별 기본 슈팅파울 확률
    let shootingFoulRate = preferredZone === 'Rim' ? sFoulCfg.BASE_RATE_RIM
        : preferredZone === 'Paint' ? sFoulCfg.BASE_RATE_PAINT
        : preferredZone === 'Mid' ? sFoulCfg.BASE_RATE_MID
        : sFoulCfg.BASE_RATE_3PT;

    // drawFoul 커브 보정 (존별 스케일링)
    const drawFoulBonus = interpolateCurve(actor.attr.drFoul, sFoulCfg.DRAW_FOUL_CURVE);
    const zoneScale = sFoulCfg.ZONE_CURVE_SCALE[preferredZone] ?? 1.0;
    shootingFoulRate += drawFoulBonus * zoneScale;

    // defIntensity 보정: intensity 6-10에서 슈팅파울 증가
    shootingFoulRate += Math.max(0, (defIntensity - 5)) * sFoulCfg.DEF_INTENSITY_FACTOR;

    // Manipulator 아키타입: 엘리트 파울 드로어 보너스
    if (actor.attr.drFoul >= sFoulCfg.MANIPULATOR_DRFOUL_THRESHOLD &&
        actor.attr.shotIq >= sFoulCfg.MANIPULATOR_SHOTIQ_THRESHOLD) {
        shootingFoulRate += sFoulCfg.MANIPULATOR_BONUS;
    }

    // [SaveTendency] foulProneness: 수비자 파울 성향
    shootingFoulRate += (defender.tendencies?.foulProneness ?? 0) * 0.02;

    // Foul Trouble: 파울 트러블 수비자는 조심스럽게 수비 → 파울 확률 감소 + 수비력 약화
    const ft = SIM_CONFIG.FOUL_TROUBLE;
    const defFouls = defender.pf;
    const foulProbMod = defFouls >= 5 ? ft.PROB_MOD[5] : defFouls >= 4 ? ft.PROB_MOD[4] : defFouls >= 3 ? ft.PROB_MOD[3] : 1.0;
    shootingFoulRate *= foulProbMod;
    // DEF_PENALTY → hitRate 보너스 (×0.10 스케일링: 4파울 +1.5%, 5파울 +4%)
    const foulDefPenalty = defFouls >= 5 ? ft.DEF_PENALTY[5] * 0.10 : defFouls >= 4 ? ft.DEF_PENALTY[4] * 0.10 : 0;

    // 클램프
    shootingFoulRate = Math.max(sFoulCfg.MIN_RATE, Math.min(sFoulCfg.MAX_RATE, shootingFoulRate));

    if (Math.random() < shootingFoulRate) {
        // ★ Flagrant Foul Conversion (수비 파울 중 일부가 플래그런트로 전환)
        if (Math.random() < offFoulConfig.FLAGRANT_CONVERT_RATE) {
            const isFlagrant2 = Math.random() < offFoulConfig.FLAGRANT_2_CHANCE;
            return {
                type: 'flagrantFoul' as const,
                offTeam, defTeam, actor, defender, points: 0 as const,
                isAndOne: false, playType: selectedPlayType, isSwitch,
                isFlagrant2, isZone,
            };
        }
        return {
            type: 'freethrow',
            offTeam, defTeam, actor, defender, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch, isZone
        };
    }

    // 3.2 Non-Shooting Foul (팀 파울 / 루스볼 — 보너스 상황에서만 FT)
    const nsFoulCfg = SIM_CONFIG.NON_SHOOTING_FOUL;
    let nonShootingFoulRate = nsFoulCfg.BASE_RATE + Math.max(0, (defIntensity - 5)) * nsFoulCfg.DEF_INTENSITY_FACTOR;
    nonShootingFoulRate *= foulProbMod;
    nonShootingFoulRate = Math.min(nsFoulCfg.MAX_RATE, nonShootingFoulRate);

    if (Math.random() < nonShootingFoulRate) {
        return {
            type: 'foul',
            offTeam, defTeam, actor, defender, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch, isZone
        };
    }

    // 3.5 Offensive Foul Check (차지 / 일리걸 스크린)
    let offensiveFoulChance = offFoulConfig.OFFENSIVE_FOUL_BASE;
    if (selectedPlayType === 'PostUp' || selectedPlayType === 'Iso') {
        offensiveFoulChance = offFoulConfig.POST_OFFENSIVE_FOUL_RATE;
    } else if (selectedPlayType === 'PnR_Handler' || selectedPlayType === 'PnR_Roll' || selectedPlayType === 'PnR_Pop') {
        offensiveFoulChance += offFoulConfig.SCREEN_FOUL_RATE;
    }
    if (defender) {
        offensiveFoulChance += (defender.attr.helpDefIq - 70) * offFoulConfig.CHARGE_BONUS_PER_DEF_IQ;
    }
    offensiveFoulChance = Math.max(0.005, Math.min(0.04, offensiveFoulChance));

    if (Math.random() < offensiveFoulChance) {
        return {
            type: 'offensiveFoul' as const,
            offTeam, defTeam, actor, defender,
            points: 0 as const, isAndOne: false, playType: selectedPlayType, isSwitch, isZone
        };
    }

    // 3.6 Technical Foul Check (독립 이벤트, 낮은 확률)
    // [SaveTendency] temperament: hot-headed(+1.0) → 1.8x tech foul chance, cool(-1.0) → 0.2x
    const techChance = offFoulConfig.TECHNICAL_FOUL_CHANCE
        * (1 + (defender.tendencies?.temperament ?? 0) * 0.8);
    if (Math.random() < techChance) {
        return {
            type: 'technicalFoul' as const,
            offTeam, defTeam, actor, defender,
            points: 0 as const, isAndOne: false, playType: selectedPlayType, isSwitch, isZone
        };
    }

    // 3.7 Shot Clock Violation Check (수비 전술 + 공격 볼무브 트레이드-오프)
    const offSliders = offTeam.tactics.sliders;
    const defSliders = defTeam.tactics.sliders;
    const shotClockChance = offFoulConfig.SHOT_CLOCK_BASE
        + defSliders.defIntensity * offFoulConfig.SHOT_CLOCK_DEF_INTENSITY_FACTOR
        + defSliders.zoneUsage * offFoulConfig.SHOT_CLOCK_ZONE_USAGE_FACTOR
        + defSliders.helpDef * offFoulConfig.SHOT_CLOCK_HELP_DEF_FACTOR
        + Math.max(0, 5 - offSliders.pace) * offFoulConfig.SHOT_CLOCK_LOW_PACE_FACTOR
        + offSliders.ballMovement * offFoulConfig.SHOT_CLOCK_HIGH_BM_FACTOR;

    if (Math.random() < shotClockChance) {
        return {
            type: 'shotClockViolation' as const,
            offTeam, defTeam, actor,
            points: 0 as const, isAndOne: false, playType: selectedPlayType, isSwitch, isZone
        };
    }

    // 4. Turnover / Steal Check (Enhanced Logic with Baseline + Context)
    const tovResult = calculateTurnoverChance(offTeam, defTeam, actor, defender, selectedPlayType, pnrCoverage);
    
    if (tovResult.isTurnover) {
        return {
            type: 'turnover',
            offTeam, defTeam, actor,
            defender: tovResult.stealer || defender, // Assign credit to helper if Shadow trait triggered
            isSteal: tovResult.isSteal,
            points: 0, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
            pnrCoverage: pnrCoverage !== 'none' ? pnrCoverage : undefined
        };
    }

    // 5. Shot Calculation
    // Zone Quality Modifier: zoneUsage=10(숙련) → FG% -1.5%, zoneUsage=5(평균) → 0%, zoneUsage=1(부족) → +1.2%
    const zoneQualityMod = isZone
        ? (5 - defTeam.tactics.sliders.zoneUsage) * 0.003
        : 0;

    // [SaveTendency] shotDiscipline: ±1.5% hit rate (good shot selection)
    const shotDiscMod = (actor.tendencies?.shotDiscipline ?? 0) * 0.015;

    // [SaveTendency] ego: option rank performance differential
    // 1옵션(에이스) + ego=+1.0 → +1.5%, 5옵션 + ego=+1.0 → -1.5%
    const actorOptionRank = getTeamOptionRanks(offTeam).get(actor.playerId) || 3;
    const egoMod = (actor.tendencies?.ego ?? 0) * ((3 - actorOptionRank) / 2) * 0.015;

    // [A-1] 어시스트 퀄리티: 패서의 passVision이 높으면 슈터가 더 좋은 위치에서 캐치
    const assistQualityMod = secondaryActor
        ? (secondaryActor.attr.passVision - 70) * 0.001
        : 0;

    // [A-3] CatchShoot/Handoff 오픈 탐지: 패서 시야가 넓으면 더 좋은 오픈 찬스
    let openDetectionMod = 0;
    if (secondaryActor && (selectedPlayType === 'CatchShoot' || selectedPlayType === 'Handoff'
        || selectedPlayType === 'OffBallScreen' || selectedPlayType === 'DriveKick')) {
        openDetectionMod = (secondaryActor.attr.passVision - 70) * 0.0015;
    }

    // [B-2] 어시스트 전달 퀄리티: 패서의 passAcc가 높으면 슈터가 리듬 유지
    const deliveryQualityMod = secondaryActor
        ? (secondaryActor.attr.passAcc - 70) * 0.0008
        : 0;

    // [B-4] PnR 랍패스 메카닉: PnR_Roll + Rim + Dunk/Layup → 랍 시도/성공 판정
    let lobBonus = 0;
    if (selectedPlayType === 'PnR_Roll' && preferredZone === 'Rim'
        && (shotType === 'Dunk' || shotType === 'Layup') && secondaryActor) {
        const handler = secondaryActor;
        const roller = actor;

        // 랍 시도 확률: 롤러 수직, 핸들러 시야, 수비 커버리지
        let lobChance = 0.15;
        lobChance += (roller.attr.vertical - 70) * 0.003;
        lobChance += (handler.attr.passVision - 70) * 0.002;
        if (pnrCoverage === 'blitz') lobChance += 0.10;
        if (pnrCoverage === 'drop') lobChance -= 0.08;
        lobChance = Math.max(0.05, Math.min(0.45, lobChance));

        if (Math.random() < lobChance) {
            // 랍 성공 판정: passAcc가 핵심
            const lobSuccessRate = Math.max(0.15, Math.min(0.90,
                0.50
                + (handler.attr.passAcc - 70) * 0.008
                + (roller.attr.hands - 70) * 0.004
                + (roller.attr.vertical - 70) * 0.003
            ));

            if (Math.random() < lobSuccessRate) {
                lobBonus = 0.08; // 성공: 이지 피니시 보너스
            } else {
                // 실패: 악송구 턴오버
                return {
                    type: 'turnover',
                    offTeam, defTeam, actor, defender,
                    isSteal: false,
                    points: 0, isAndOne: false,
                    playType: selectedPlayType, isSwitch, isZone,
                    pnrCoverage: pnrCoverage !== 'none' ? pnrCoverage : undefined
                };
            }
        }
    }

    // --- PLAYMAKING ARCHETYPE BONUSES (패서 히든 아키타입) ---
    let playmakingBonus = 0;
    const pmCfg = SIM_CONFIG.PLAYMAKING;
    if (pmCfg.ENABLED && secondaryActor) {
        const pa = secondaryActor.attr;

        // G-1. Clairvoyant: 어시스트 시 슈터 hitRate +2%
        if (pa.passIq >= pmCfg.CLAIRVOYANT_PASSIQ_THRESHOLD &&
            pa.passVision >= pmCfg.CLAIRVOYANT_PASSVISION_THRESHOLD &&
            pa.passAcc >= pmCfg.CLAIRVOYANT_PASSACC_THRESHOLD) {
            playmakingBonus += pmCfg.CLAIRVOYANT_HITRATE_BONUS;
        }

        // G-2. Overseer: PnR_Roll/PnR_Pop 시 롤러 hitRate +3%
        if ((selectedPlayType === 'PnR_Roll' || selectedPlayType === 'PnR_Pop') &&
            pa.passIq >= pmCfg.OVERSEER_PASSIQ_THRESHOLD &&
            pa.passAcc >= pmCfg.OVERSEER_PASSACC_THRESHOLD) {
            playmakingBonus += pmCfg.OVERSEER_PNR_ROLLER_BONUS;
        }
    }

    // 3PT 서브존 결정 (hitRate에 개별 능력치 적용 + 스탯 기록 일관성)
    const subZone = preferredZone === '3PT' ? resolveDynamicZone(actor, '3PT') : undefined;

    const shotContext = calculateHitRate(
        actor, defender, defTeam,
        selectedPlayType, preferredZone,
        sliders, // Pass full sliders
        bonusHitRate + zoneQualityMod + getMomentumBonus(state, offTeam.id) + foulDefPenalty + shotDiscMod + egoMod + assistQualityMod + openDetectionMod + deliveryQualityMod + lobBonus + playmakingBonus,
        offTeam.acePlayerId,
        isBotchedSwitch, isSwitch,
        options?.minHitRate,
        state.possession === 'home',
        options?.clutchContext,
        pnrCoverage,
        screenerDefender,
        shotType,
        subZone
    );

    const isScore = Math.random() < shotContext.rate;

    // And-1: 득점 성공 + 슈팅 파울 동시 발생 (전 존, shotType별 배율)
    let isAndOne = false;
    if (isScore) {
        const andOneBase = (preferredZone === 'Rim' || preferredZone === 'Paint') ? 0.03 : 0.012;
        const intensityMod = Math.max(0, (defIntensity - 5) * 0.004);
        // drawFoul 커브 기반 And-1 보정 (DRAW_FOUL_CURVE × AND1_CURVE_SCALE)
        const drawFoulAndOneMod = interpolateCurve(actor.attr.drFoul, sFoulCfg.DRAW_FOUL_CURVE) * sFoulCfg.AND1_CURVE_SCALE;
        // shotType별 And-1 배율: Dunk 1.5x, Layup 1.0x, Pullup 0.15x 등
        const and1Mult = SIM_CONFIG.SHOT_DEFENSE.AND1_MULT[shotType ?? 'Layup'] ?? 1.0;
        if (Math.random() < Math.max(0, (andOneBase + intensityMod + drawFoulAndOneMod) * and1Mult)) {
            isAndOne = true;
        }
    }

    // Rebound & Block Resolution
    if (!isScore) {
        // --- BLOCK CALCULATION LOGIC START ---
        let isBlock = false;
        let finalDefender = defender; // Default to primary defender

        // Only calc block if we have a defender context
        if (defender && preferredZone) {
            const blkCfg = SIM_CONFIG.BLOCK;

            // A. Determine Base Probability by Zone (원래 값 복원)
            let blockProb = 0;
            if (preferredZone === 'Rim') blockProb = blkCfg.BASE_RIM;
            else if (preferredZone === 'Paint') blockProb = blkCfg.BASE_PAINT;
            else if (preferredZone === 'Mid') blockProb = blkCfg.BASE_MID;
            else if (preferredZone === '3PT') blockProb = blkCfg.BASE_3PT;

            // B. Defender Attribute Modifiers (커브 기반)
            const defBlk = defender.attr.blk;
            const defVert = defender.attr.vertical;
            const defHeight = defender.attr.height;

            const blkBonus = interpolateCurve(defBlk, blkCfg.BLK_CURVE);
            const heightBonus = Math.max(0, (defHeight - 200) * blkCfg.HEIGHT_FACTOR);

            blockProb += blkBonus + heightBonus;

            // C. ELITE THRESHOLD BONUSES (Blocker Archetypes — 조건부 발동)
            let archetypeBonus = 0;

            if (blkCfg.ENABLED) {
                // D-2. The Alien: Rim + Paint 존에서만 발동 (긴 팔로 영역 커버)
                if (defHeight >= 216 && defBlk >= 80 &&
                    (preferredZone === 'Rim' || preferredZone === 'Paint')) {
                    archetypeBonus = blkCfg.ARCHETYPE_ALIEN;
                }
                // D-3. Skywalker: Transition + Cut에서만 발동 (체이스다운/헬프사이드)
                else if (defVert >= 95 && defBlk >= 75 &&
                    (selectedPlayType === 'Transition' || selectedPlayType === 'Cut')) {
                    archetypeBonus = blkCfg.ARCHETYPE_SKYWALKER;
                }
                // D-4. Defensive Anchor: 1차 블락 아닌 헬프 블락에서 발동 (아래 F 섹션)
            }

            blockProb += archetypeBonus;

            // D. Offense Resistance (Avoidance)
            // High ShotIQ and High Release point (Height) reduces block chance
            const offResist = ((actor.attr.shotIq - 70) * 0.001) + ((actor.attr.height - 190) * 0.0005);
            blockProb -= Math.max(0, offResist);

            // D-2. PnR Coverage Block Modifiers
            const pnrBlkCfg = SIM_CONFIG.PNR_COVERAGE;
            if (pnrCoverage === 'drop' && (preferredZone === 'Rim' || preferredZone === 'Paint')) {
                blockProb += pnrBlkCfg.DROP_BLOCK_BONUS;  // +3% 블록 (빅맨이 림 보호)
            }
            if (pnrCoverage === 'blitz' && (preferredZone === 'Rim' || preferredZone === 'Paint')) {
                blockProb -= pnrBlkCfg.BLITZ_BLOCK_PENALTY;  // -2% 블록 (빅맨이 핸들러에 몰림)
            }

            // --- ZONE SHOOTING ARCHETYPES: Block Reduction ---
            const zCfg = SIM_CONFIG.ZONE_SHOOTING;
            if (zCfg.ENABLED) {
                // B-3. Tyrant: Rim/Paint에서 블락 확률 감소
                if ((preferredZone === 'Rim' || preferredZone === 'Paint') &&
                    actor.attr.ins >= zCfg.TYRANT_INS_THRESHOLD &&
                    (actor.attr.strength >= zCfg.TYRANT_STRENGTH_THRESHOLD ||
                     actor.attr.vertical >= zCfg.TYRANT_VERTICAL_THRESHOLD)) {
                    blockProb -= zCfg.TYRANT_BLOCK_REDUCTION;
                }

                // B-4. Levitator: Paint에서 블락 확률 50% 감소
                if (preferredZone === 'Paint' &&
                    actor.attr.closeShot >= zCfg.FLOATER_CLOSESHOT_THRESHOLD &&
                    actor.attr.agility >= zCfg.FLOATER_AGILITY_THRESHOLD &&
                    actor.attr.height <= zCfg.FLOATER_MAX_HEIGHT) {
                    blockProb *= zCfg.FLOATER_BLOCK_MULTIPLIER;
                }

                // B-6. Ascendant: 가드의 수직 도약으로 Rim 블락 회피
                if (preferredZone === 'Rim' &&
                    (actor.position === 'PG' || actor.position === 'SG') &&
                    actor.attr.vertical >= zCfg.ASCENDANT_VERTICAL_THRESHOLD &&
                    actor.attr.closeShot >= zCfg.ASCENDANT_CLOSESHOT_THRESHOLD) {
                    blockProb *= zCfg.ASCENDANT_BLOCK_MULTIPLIER;
                }
            }

            // E-0. shotType별 블록 배율
            const blockMult = SIM_CONFIG.SHOT_DEFENSE.BLOCK_MULT[shotType ?? 'Layup'] ?? 1.0;
            blockProb *= blockMult;
            // Dunk 전용: 공격자 strength/vertical 블록 저항
            if (shotType === 'Dunk') {
                blockProb -= Math.max(0, (actor.attr.strength - 70)) * SIM_CONFIG.SHOT_DEFENSE.DUNK_STR_RESIST;
                blockProb -= Math.max(0, (actor.attr.vertical - 70)) * SIM_CONFIG.SHOT_DEFENSE.DUNK_VERT_RESIST;
            }

            // E. Roll Primary Block
            if (Math.random() < Math.max(0, blockProb)) {
                isBlock = true;
            }
            // F. Help Defense Block (Inside + Mid-range)
            else if ((preferredZone === 'Rim' || preferredZone === 'Paint' || preferredZone === 'Mid') && !isBlock) {
                 const potentialHelpers = defTeam.onCourt.filter(p => p.playerId !== defender.playerId);
                 potentialHelpers.sort((a, b) => b.attr.blk - a.attr.blk);
                 const helper = potentialHelpers[0];

                 if (helper) {
                     let helpChance = blkCfg.HELP_BASE;
                     if (helper.attr.blk >= blkCfg.HELP_BLK_THRESHOLD) helpChance += blkCfg.HELP_BLK_BONUS;
                     if (helper.archetypes.rimProtector > blkCfg.HELP_RIM_THRESHOLD) helpChance += blkCfg.HELP_RIM_BONUS;

                     // D-4. Defensive Anchor: 스마트 로테이션 → 헬프 블락 확률 2배
                     if (blkCfg.ENABLED && helper.attr.helpDefIq >= 92 && helper.attr.blk >= 80) {
                         helpChance *= blkCfg.ARCHETYPE_ANCHOR_HELP_MULT;
                     }

                     // Mid-range: 체이스다운 블락은 림보다 희귀
                     if (preferredZone === 'Mid') helpChance *= blkCfg.HELP_MID_FACTOR;

                     if (Math.random() < helpChance) {
                         isBlock = true;
                         finalDefender = helper;
                     }
                 }
            }
        }
        // --- BLOCK CALCULATION LOGIC END ---

        // Team Rebound Check (dead ball, out-of-bounds → 개인 리바운드 미기록)
        let rebounder: LivePlayer | undefined;
        let reboundType: 'off' | 'def' | undefined;

        if (Math.random() >= SIM_CONFIG.REBOUND.TEAM_REB_RATE_FG) {
            const reb = resolveRebound(state.home, state.away, actor.playerId);
            rebounder = reb.player;
            reboundType = reb.type;
        }

        return {
            type: 'miss',
            offTeam, defTeam,
            actor,
            defender: finalDefender, // Updated to blocker if help block occurred
            rebounder,
            reboundType,
            points: 0,
            zone: preferredZone,
            playType: selectedPlayType,
            shotType,
            isBlock, // Calculated Result
            isAndOne: false,
            matchupEffect: shotContext.matchupEffect,
            isAceTarget: shotContext.isAceTarget,
            isSwitch,
            isMismatch: shotContext.isMismatch,
            pnrCoverage: pnrCoverage !== 'none' ? pnrCoverage : undefined,
            subZone, isZone
        };
    }

    const points = preferredZone === '3PT' ? 3 : 2;
    return {
        type: 'score', offTeam, defTeam, actor, assister: secondaryActor, points, zone: preferredZone, playType: selectedPlayType, shotType, isAndOne, matchupEffect: shotContext.matchupEffect, isAceTarget: shotContext.isAceTarget, isSwitch, isMismatch: shotContext.isMismatch, isBotchedSwitch,
        pnrCoverage: pnrCoverage !== 'none' ? pnrCoverage : undefined,
        subZone, isZone
    };
}

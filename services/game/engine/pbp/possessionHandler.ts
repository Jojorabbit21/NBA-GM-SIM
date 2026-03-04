
import { GameState, PossessionResult, LivePlayer, TeamState, ClutchContext } from './pbpTypes';
import { resolvePlayAction } from './playTypes';
import { calculateHitRate } from './flowEngine';
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
 * Calculates Turnover/Steal Probability based on Defender Archetypes
 * Updated: Single-roll logic to prevent double-dipping and reduce excessive turnovers.
 */
function calculateTurnoverChance(
    offTeam: TeamState,
    defTeam: TeamState,
    actor: LivePlayer,
    defender: LivePlayer,
    playType: PlayType,
    pnrCoverage: PnrCoverage = 'none'
): { isTurnover: boolean, isSteal: boolean, stealer?: LivePlayer } {
    
    const sliders = offTeam.tactics.sliders;
    const defIntensity = defTeam.tactics.sliders.defIntensity;

    // 1. Base Turnover Probability (Significantly Lowered)
    // Old: ~25% base -> New: ~13% target average
    let baseProb = 0.085;

    // 2. Modifiers
    // Ball Movement: High passing increases risk slightly (0.005 per point > 5)
    const rawPassRisk = Math.max(0, (sliders.ballMovement - 5) * 0.004);
    // [A-2] 팀 평균 passVision으로 패스 리스크 완화 (시야 좋은 팀 = 복잡한 볼무브에서도 안정)
    const teamAvgVision = offTeam.onCourt.reduce((s, p) => s + p.attr.passVision, 0) / 5;
    const visionDampen = Math.max(0.85, Math.min(1.15, 1 - (teamAvgVision - 70) * 0.005));
    const passRisk = rawPassRisk * visionDampen;
    
    // Defense Intensity: Pressure increases TOV (0.008 per point > 5)
    const pressureRisk = Math.max(0, (defIntensity - 5) * 0.008);
    
    // Actor Attributes: Bad handle/IQ increases risk
    // Handle 90 -> -0.02, Handle 50 -> +0.02
    const handlingFactor = (70 - actor.attr.handling) * 0.001;
    const iqFactor = (70 - actor.attr.passIq) * 0.001;
    // Hands: 볼 확보/컨트롤 → 턴오버 저항 (기본 0.0005/pt, PostUp/PnR에서 0.0015/pt)
    const isContactPlay = playType === 'PostUp' || playType === 'PnR_Handler' || playType === 'PnR_Roll' || playType === 'PnR_Pop';
    const handsFactor = (70 - actor.attr.hands) * (isContactPlay ? 0.0015 : 0.0005);

    // [B-1] 패스 정확도 부족 → 패스 미스 턴오버 (패스 관련 플레이에서 강화)
    const isPassPlay = playType === 'CatchShoot' || playType === 'Handoff'
        || playType === 'PnR_Handler' || playType === 'PnR_Roll'
        || playType === 'PnR_Pop' || playType === 'Cut'
        || playType === 'OffBallScreen' || playType === 'DriveKick';
    const passAccFactor = (70 - actor.attr.passAcc) * (isPassPlay ? 0.0012 : 0.0005);

    // Play Type Context
    let contextRisk = 0;
    if (playType === 'Transition') {
        contextRisk = 0.03; // Fast breaks are risky
        // [B-3] 속공 롱패스 리스크: passAcc 부족 시 추가 턴오버
        contextRisk += Math.max(0, (70 - actor.attr.passAcc)) * 0.001;
    }
    else if (playType === 'Iso') contextRisk = 0.01;
    else if (playType === 'PostUp') contextRisk = 0.02; // Crowded paint

    // PnR Coverage Turnover Modifiers
    const pnrCfg = SIM_CONFIG.PNR_COVERAGE;
    if (pnrCoverage === 'blitz' && playType === 'PnR_Handler') {
        contextRisk += pnrCfg.BLITZ_TOV_BONUS;  // +4% 턴오버 (더블팀 압박)
    }
    if (pnrCoverage === 'hedge' && playType === 'PnR_Handler') {
        contextRisk += pnrCfg.HEDGE_TOV_BONUS;  // +1.5% 턴오버 (빅맨 쇼 압박)
    }

    // --- STEAL ARCHETYPE BONUSES (턴오버 유발력) ---
    const stlCfg = SIM_CONFIG.STEAL;
    const da = defender.attr;
    let archetypeRisk = 0;

    if (stlCfg.ENABLED) {
        // A. The Clamp: 비활성화 (스틸 아키타입 밸런스 조정)
        // if (da.perDef >= stlCfg.CLAMP_PERIMDEF_THRESHOLD && da.stl >= stlCfg.CLAMP_STL_THRESHOLD) {
        //     archetypeRisk += stlCfg.CLAMP_TOV_BONUS;
        // }

        // B. The Pickpocket: 접촉 플레이(PostUp/Iso/Cut) 전용
        if (da.stl >= stlCfg.PICKPOCKET_STL_THRESHOLD && da.agility >= stlCfg.PICKPOCKET_AGILITY_THRESHOLD) {
            if (playType === 'PostUp' || playType === 'Iso' || playType === 'Cut') {
                archetypeRisk += stlCfg.PICKPOCKET_TOV_BONUS;
            }
        }

        // C. The Hawk: 상대 팀이 패스를 많이 돌릴 때 (ballMovement ≥ threshold)
        if (da.helpDefIq >= stlCfg.HAWK_HELPDEF_THRESHOLD &&
            da.passPerc >= stlCfg.HAWK_PASSPERC_THRESHOLD &&
            da.stl >= stlCfg.HAWK_STL_THRESHOLD) {
            if (offTeam.tactics.sliders.ballMovement >= stlCfg.HAWK_BM_THRESHOLD) {
                archetypeRisk += stlCfg.HAWK_TOV_BONUS;
            }
        }

        // E. The Press: 비활성화 (스틸 아키타입 밸런스 조정)
        // if (da.speed >= stlCfg.PRESS_SPEED_THRESHOLD &&
        //     da.stamina >= stlCfg.PRESS_STAMINA_THRESHOLD &&
        //     da.hustle >= stlCfg.PRESS_HUSTLE_THRESHOLD) {
        //     if (playType === 'Transition') {
        //         archetypeRisk += stlCfg.PRESS_TOV_BONUS;
        //     }
        // }
    }

    // Calculate Total Turnover Probability
    // [SaveTendency] composure: ±1% turnover probability (positive composure = fewer turnovers)
    const composureFactor = -(actor.tendencies?.composure ?? 0) * 0.01;

    // speed↑ spdBall↓ 갭: 드리블 플레이에서 볼 컨트롤 실수 위험 (gap 20pt → +2%)
    let dribbleGapRisk = 0;
    const isDribblePlay = playType === 'Iso' || playType === 'Cut' || playType === 'Transition' || playType === 'PnR_Handler';
    if (isDribblePlay) {
        dribbleGapRisk = Math.max(0, actor.attr.speed - actor.attr.spdBall) * 0.001;
    }

    // --- PLAYMAKING ARCHETYPE: Needle (패스 플레이 턴오버 감소) ---
    let needleReduction = 0;
    const pmCfg = SIM_CONFIG.PLAYMAKING;
    if (pmCfg.ENABLED && isPassPlay &&
        actor.attr.passAcc >= pmCfg.NEEDLE_PASSACC_THRESHOLD &&
        actor.attr.passIq >= pmCfg.NEEDLE_PASSIQ_THRESHOLD) {
        needleReduction = pmCfg.NEEDLE_TOV_REDUCTION;
    }

    // [Gradual] 수비자 stl → 볼 탈취 압박 (모든 상황, stl 90: +1.6%, stl 50: -1.6%)
    const defStlPressure = (da.stl - 70) * 0.0008;
    // [Gradual] 수비자 passPerc → 패싱레인 읽기 (패싱 플레이 전용, 비패싱 = 0)
    const defLaneReading = isPassPlay ? (da.passPerc - 70) * 0.0010 : 0;

    let totalTovProb = baseProb + passRisk + pressureRisk + handlingFactor + iqFactor + handsFactor + passAccFactor + contextRisk + archetypeRisk + composureFactor + dribbleGapRisk + defStlPressure + defLaneReading - needleReduction;

    // Cap Probability (Min 2%, Max 25%)
    totalTovProb = Math.max(0.02, Math.min(0.25, totalTovProb));

    // 3. Roll for Turnover
    if (Math.random() > totalTovProb) {
        return { isTurnover: false, isSteal: false };
    }

    // 4. If Turnover Occurred, Determine if it was a Steal
    // This depends on the defender's ability
    let isSteal = false;
    let stealer: LivePlayer | undefined = undefined;

    // Base Steal Ratio (What % of turnovers are steals?)
    // NBA Avg: ~50% of TOVs result in steals (the rest are out-of-bounds, violations, etc.)
    // [Fix] Reduced from 0.50 to 0.45 base; archetype bonuses cut to cap at ~0.70
    let stealRatio = 0.45;

    // Defender Bonuses
    const d = defender.attr;

    // [Gradual] stl → 스틸 실행력 (모든 상황, stl 90: +6%, stl 50: -6%)
    stealRatio += (d.stl - 70) * 0.003;
    // [Gradual] passPerc → 인터셉트 위치 확보 (패싱 플레이 전용)
    if (isPassPlay) {
        stealRatio += (d.passPerc - 70) * 0.0025;
    }

    // Archetype 1: "The Glove" (On-Ball) — was +0.20/+0.10, now +0.15/+0.08
    if (d.stl >= 90) stealRatio += 0.15;
    else if (d.stl >= 80) stealRatio += 0.08;

    // Archetype 2: "Interceptor" (Passing Lanes) — was +0.15, now +0.10 (max combined ~0.70)
    if (d.passPerc >= 85 && d.agility >= 85) stealRatio += 0.10;

    // E. The Press: 비활성화 (스틸 아키타입 밸런스 조정)
    // if (stlCfg.ENABLED && playType === 'Transition' &&
    //     d.speed >= stlCfg.PRESS_SPEED_THRESHOLD &&
    //     d.stamina >= stlCfg.PRESS_STAMINA_THRESHOLD &&
    //     d.hustle >= stlCfg.PRESS_HUSTLE_THRESHOLD) {
    //     stealRatio += stlCfg.PRESS_STEAL_RATIO_BONUS;
    // }

    // [Safety] stealRatio 상하한 (NBA 현실: 최대 ~75%)
    stealRatio = Math.max(0.15, Math.min(0.75, stealRatio));

    // Archetype 3: "The Shadow" (Help Defender)
    // Check if a helper steals it instead of primary defender
    const shadow = defTeam.onCourt.find(p => 
        p.playerId !== defender.playerId && 
        p.attr.stl >= 85 && 
        p.attr.helpDefIq >= 90
    );

    if (Math.random() < stealRatio) {
        isSteal = true;
        // 20% chance the steal comes from the helper (Shadow) if available
        if (shadow && Math.random() < 0.20) {
            stealer = shadow;
        } else {
            stealer = defender;
        }
    }

    return { isTurnover: true, isSteal, stealer };
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

    // 3. Defensive Foul Check (Intensity Slider)
    // [Fix] Linear growth capped at 18%: intensity=5→15.5%, intensity>=7→18% cap
    const defIntensity = defTeam.tactics.sliders.defIntensity;
    const offFoulConfig = SIM_CONFIG.FOUL_EVENTS;
    let baseFoulChance = Math.min(0.18, 0.08 + (defIntensity * 0.015));

    // Manipulator 아키타입: 엘리트 파울 드로어는 baseFoulChance 자체를 상승 (18% 캡 무시)
    if (actor.attr.drFoul >= offFoulConfig.MANIPULATOR_DRFOUL_THRESHOLD &&
        actor.attr.shotIq >= offFoulConfig.MANIPULATOR_SHOTIQ_THRESHOLD) {
        baseFoulChance += offFoulConfig.MANIPULATOR_FOUL_BONUS;
    }

    // [SaveTendency] foulProneness: ±2% foul chance for defender
    baseFoulChance += (defender.tendencies?.foulProneness ?? 0) * 0.02;
    baseFoulChance = Math.max(0.03, baseFoulChance); // Minimum 3%

    // Foul Trouble: 파울 트러블 수비자는 조심스럽게 수비 → 파울 확률 감소 + 수비력 약화
    const ft = SIM_CONFIG.FOUL_TROUBLE;
    const defFouls = defender.pf;
    const foulProbMod = defFouls >= 5 ? ft.PROB_MOD[5] : defFouls >= 4 ? ft.PROB_MOD[4] : defFouls >= 3 ? ft.PROB_MOD[3] : 1.0;
    baseFoulChance *= foulProbMod;
    // DEF_PENALTY → hitRate 보너스 (×0.10 스케일링: 4파울 +1.5%, 5파울 +4%)
    const foulDefPenalty = defFouls >= 5 ? ft.DEF_PENALTY[5] * 0.10 : defFouls >= 4 ? ft.DEF_PENALTY[4] * 0.10 : 0;

    if (Math.random() < baseFoulChance) {
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

        // Shooting foul vs Team foul 구분
        // [Fix] 파울 빈도는 18% 캡, 하지만 슈팅 파울 비율은 intensity로 차등 스케일링
        // → intensity 7과 10은 파울 횟수는 같지만 10이 더 비싼 파울(슈팅파울)을 많이 유발
        const isInsidePlay = preferredZone === 'Rim' || preferredZone === 'Paint';
        const intensityBonus = Math.max(0, defIntensity - 5);
        // drawFoul 보정: 70 기준 ±0.15%/pt (drFoul 50→-3%, 70→0%, 90→+3%, 99→+4.35%)
        const drawFoulMod = (actor.attr.drFoul - offFoulConfig.DRAW_FOUL_BASELINE) * offFoulConfig.DRAW_FOUL_SHOOTING_FACTOR;
        const shootingFoulChance = isInsidePlay
            ? Math.min(0.65, 0.45 + intensityBonus * 0.015 + drawFoulMod)
            : preferredZone === 'Mid'
            ? Math.min(0.40, 0.25 + intensityBonus * 0.012 + drawFoulMod)
            : Math.min(0.25, 0.10 + intensityBonus * 0.008 + drawFoulMod);
        const isShootingFoul = Math.random() < shootingFoulChance;

        return {
            type: isShootingFoul ? 'freethrow' : 'foul',
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

    // And-1: 득점 성공 + 슈팅 파울 동시 발생 (Rim/Paint 공격에서만)
    // defIntensity=5: 3%, defIntensity=10: 5%
    let isAndOne = false;
    if (isScore && (preferredZone === 'Rim' || preferredZone === 'Paint')) {
        const andOneBase = 0.03;
        const intensityMod = Math.max(0, (defIntensity - 5) * 0.004);
        // drawFoul 보정: 70 기준 ±0.05%/pt (drFoul 50→-1%, 90→+1%)
        const drawFoulAndOneMod = (actor.attr.drFoul - offFoulConfig.DRAW_FOUL_BASELINE) * offFoulConfig.DRAW_FOUL_AND1_FACTOR;
        // shotType별 And-1 배율: Dunk 1.5x, Floater 0.3x 등
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

            // B. Defender Attribute Modifiers (3× 이전 계수)
            const defBlk = defender.attr.blk;
            const defVert = defender.attr.vertical;
            const defHeight = defender.attr.height;

            const heightBonus = Math.max(0, (defHeight - 200) * blkCfg.HEIGHT_FACTOR);
            const statBonus = ((defBlk - 70) * blkCfg.BLK_STAT_FACTOR) + ((defVert - 70) * blkCfg.VERT_STAT_FACTOR);

            blockProb += (heightBonus + statBonus);

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

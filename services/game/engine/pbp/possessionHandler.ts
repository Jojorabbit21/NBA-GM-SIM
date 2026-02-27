
import { GameState, PossessionResult, LivePlayer, TeamState, ClutchContext } from './pbpTypes';
import { resolvePlayAction } from './playTypes';
import { calculateHitRate } from './flowEngine';
import { resolveRebound } from './reboundLogic';
import { getTopPlayerGravity } from './usageSystem';
import { PlayType } from '../../../../types';
import { SIM_CONFIG } from '../../config/constants';

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
    isZone: boolean  // Pre-calculated in simulatePossession (probabilistic: zoneFreq*0.08)
): { defender: LivePlayer, isSwitch: boolean, isBotchedSwitch: boolean } {

    const sliders = defTeam.tactics.sliders;

    if (isZone) {
        // Funnel inside shots to Bigs
        if (targetZone === 'Rim' || targetZone === 'Paint') {
            const anchor = defTeam.onCourt.find(p => p.position === 'C') || 
                           defTeam.onCourt.find(p => p.position === 'PF');
            if (anchor) return { defender: anchor, isSwitch: false, isBotchedSwitch: false };
        }
    }

    // 1. Ace Stopper Logic (If explicitly set in Tactics, still respected)
    if (isActorAce && defTeam.tactics.stopperId && !isZone) {
        const stopper = defTeam.onCourt.find(p => p.playerId === defTeam.tactics.stopperId);
        if (stopper) return { defender: stopper, isSwitch: false, isBotchedSwitch: false };
    }

    // 2. Default Defender
    let defender = defTeam.onCourt.find(p => p.position === actor.position);
    if (!defender) defender = defTeam.onCourt[Math.floor(Math.random() * 5)];

    // 3. Switch Logic
    // Driven by 'switchFreq' slider (1-10)
    // 1 = 5%, 5 = 25%, 10 = 50% base switch chance on screens
    const isScreenPlay = ['PnR_Handler', 'PnR_Roll', 'PnR_Pop', 'Handoff'].includes(playType);
    
    if (isScreenPlay && !isZone && secondaryActor) {
        const switchChance = sliders.switchFreq * 0.05;
        
        if (Math.random() < switchChance) {
            // Find screener's defender
            let switchDef = defTeam.onCourt.find(p => p.position === secondaryActor.position);
            if (!switchDef) switchDef = defTeam.onCourt.find(p => p.playerId !== defender!.playerId);
            
            if (switchDef) {
                // Botched Switch Check based on HelpDef slider
                // Lower HelpDef = Higher confusion risk
                const confusionChance = Math.max(0, (10 - sliders.helpDef) * 0.02);
                const isBotched = Math.random() < confusionChance;
                
                return { defender: switchDef, isSwitch: true, isBotchedSwitch: isBotched };
            }
        }
    }

    return { defender, isSwitch: false, isBotchedSwitch: false };
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
    playType: PlayType
): { isTurnover: boolean, isSteal: boolean, stealer?: LivePlayer } {
    
    const sliders = offTeam.tactics.sliders;
    const defIntensity = defTeam.tactics.sliders.defIntensity;

    // 1. Base Turnover Probability (Significantly Lowered)
    // Old: ~25% base -> New: ~13% target average
    let baseProb = 0.08; 

    // 2. Modifiers
    // Ball Movement: High passing increases risk slightly (0.005 per point > 5)
    const passRisk = Math.max(0, (sliders.ballMovement - 5) * 0.004);
    
    // Defense Intensity: Pressure increases TOV (0.008 per point > 5)
    const pressureRisk = Math.max(0, (defIntensity - 5) * 0.008);
    
    // Actor Attributes: Bad handle/IQ increases risk
    // Handle 90 -> -0.02, Handle 50 -> +0.02
    const handlingFactor = (70 - actor.attr.handling) * 0.001; 
    const iqFactor = (70 - actor.attr.passIq) * 0.001;

    // Play Type Context
    let contextRisk = 0;
    if (playType === 'Transition') contextRisk = 0.03; // Fast breaks are risky
    else if (playType === 'Iso') contextRisk = 0.01;
    else if (playType === 'PostUp') contextRisk = 0.02; // Crowded paint

    // --- STEAL ARCHETYPE BONUSES (턴오버 유발력) ---
    const stlCfg = SIM_CONFIG.STEAL;
    const da = defender.attr;
    let archetypeRisk = 0;

    if (stlCfg.ENABLED) {
        // A. The Clamp: 질식 수비 → 모든 플레이에서 턴오버 유발
        if (da.perDef >= stlCfg.CLAMP_PERIMDEF_THRESHOLD && da.stl >= stlCfg.CLAMP_STL_THRESHOLD) {
            archetypeRisk += stlCfg.CLAMP_TOV_BONUS;
        }

        // B. The Pickpocket: 접촉 플레이(PostUp/Iso/Cut) 전용
        if (da.stl >= stlCfg.PICKPOCKET_STL_THRESHOLD && da.hands >= stlCfg.PICKPOCKET_HANDS_THRESHOLD) {
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

        // E. The Press: Transition 전용 풀코트 프레스
        if (da.speed >= stlCfg.PRESS_SPEED_THRESHOLD &&
            da.stamina >= stlCfg.PRESS_STAMINA_THRESHOLD &&
            da.hustle >= stlCfg.PRESS_HUSTLE_THRESHOLD) {
            if (playType === 'Transition') {
                archetypeRisk += stlCfg.PRESS_TOV_BONUS;
            }
        }
    }

    // Calculate Total Turnover Probability
    let totalTovProb = baseProb + passRisk + pressureRisk + handlingFactor + iqFactor + contextRisk + archetypeRisk;

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

    // Archetype 1: "The Glove" (On-Ball) — was +0.20/+0.10, now +0.15/+0.08
    if (d.stl >= 90) stealRatio += 0.15;
    else if (d.stl >= 80) stealRatio += 0.08;

    // Archetype 2: "Interceptor" (Passing Lanes) — was +0.15, now +0.10 (max combined ~0.70)
    if (d.passPerc >= 85 && d.agility >= 85) stealRatio += 0.10;

    // E. The Press: Transition에서 스틸 비율 추가 증가
    if (stlCfg.ENABLED && playType === 'Transition' &&
        d.speed >= stlCfg.PRESS_SPEED_THRESHOLD &&
        d.stamina >= stlCfg.PRESS_STAMINA_THRESHOLD &&
        d.hustle >= stlCfg.PRESS_HUSTLE_THRESHOLD) {
        stealRatio += stlCfg.PRESS_STEAL_RATIO_BONUS;
    }

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
        // Calculate total weight
        const weights: Record<string, number> = {
            'Iso': sliders.play_iso,
            'PnR_Handler': sliders.play_pnr * 0.6,
            'PnR_Roll': sliders.play_pnr * 0.2,
            'PnR_Pop': sliders.play_pnr * 0.2,
            'PostUp': sliders.play_post,
            'CatchShoot': sliders.play_cns,
            'Cut': sliders.play_drive,
            'Handoff': 2, // Base
            'Transition': 0 // Handled by pace check
        };

        // Star Gravity: 1옵션의 공격력이 높을수록 Hero 플레이 비중 증가
        // 현실 NBA에서 에이스가 코트에 있으면 팀 전술 자체가 스타 중심으로 변하는 것을 반영
        const topGravity = getTopPlayerGravity(offTeam);
        const gravityBoost = Math.max(0, (topGravity - 60) * 0.03);
        // gravity 80 → boost 0.6 → Iso 60% 증가
        // gravity 70 → boost 0.3 → Iso 30% 증가
        // gravity 60 이하 → boost 0 (벤치 유닛은 시스템 플레이 유지)
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
    const { actor, secondaryActor, preferredZone, bonusHitRate } = playCtx;
    const isActorAce = actor.playerId === offTeam.acePlayerId;

    // 2. Identify Defender
    // zoneFreq=1: 8% 발동, zoneFreq=5: 40%, zoneFreq=10: 80%
    const isZone = Math.random() < defTeam.tactics.sliders.zoneFreq * 0.08;
    const { defender, isSwitch, isBotchedSwitch } = identifyDefender(
        defTeam, actor, secondaryActor, selectedPlayType, isActorAce, preferredZone, isZone
    );

    // 3. Defensive Foul Check (Intensity Slider)
    // [Fix] Linear growth capped at 18%: intensity=5→15.5%, intensity>=7→18% cap
    const defIntensity = defTeam.tactics.sliders.defIntensity;
    let baseFoulChance = Math.min(0.18, 0.08 + (defIntensity * 0.015));

    // Foul Trouble: 파울 트러블 수비자는 조심스럽게 수비 → 파울 확률 감소 + 수비력 약화
    const ft = SIM_CONFIG.FOUL_TROUBLE;
    const defFouls = defender.pf;
    const foulProbMod = defFouls >= 5 ? ft.PROB_MOD[5] : defFouls >= 4 ? ft.PROB_MOD[4] : defFouls >= 3 ? ft.PROB_MOD[3] : 1.0;
    baseFoulChance *= foulProbMod;
    // DEF_PENALTY → hitRate 보너스 (×0.10 스케일링: 4파울 +1.5%, 5파울 +4%)
    const foulDefPenalty = defFouls >= 5 ? ft.DEF_PENALTY[5] * 0.10 : defFouls >= 4 ? ft.DEF_PENALTY[4] * 0.10 : 0;

    const offFoulConfig = SIM_CONFIG.FOUL_EVENTS;

    if (Math.random() < baseFoulChance) {
        // ★ Flagrant Foul Conversion (수비 파울 중 일부가 플래그런트로 전환)
        if (Math.random() < offFoulConfig.FLAGRANT_CONVERT_RATE) {
            const isFlagrant2 = Math.random() < offFoulConfig.FLAGRANT_2_CHANCE;
            return {
                type: 'flagrantFoul' as const,
                offTeam, defTeam, actor, defender, points: 0 as const,
                isAndOne: false, playType: selectedPlayType, isSwitch,
                isFlagrant2,
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
            offTeam, defTeam, actor, defender, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch
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
            points: 0 as const, isAndOne: false, playType: selectedPlayType, isSwitch
        };
    }

    // 3.6 Technical Foul Check (독립 이벤트, 낮은 확률)
    if (Math.random() < offFoulConfig.TECHNICAL_FOUL_CHANCE) {
        return {
            type: 'technicalFoul' as const,
            offTeam, defTeam, actor, defender,
            points: 0 as const, isAndOne: false, playType: selectedPlayType, isSwitch
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
            points: 0 as const, isAndOne: false, playType: selectedPlayType, isSwitch
        };
    }

    // 4. Turnover / Steal Check (Enhanced Logic with Baseline + Context)
    const tovResult = calculateTurnoverChance(offTeam, defTeam, actor, defender, selectedPlayType);
    
    if (tovResult.isTurnover) {
        return {
            type: 'turnover', 
            offTeam, defTeam, actor, 
            defender: tovResult.stealer || defender, // Assign credit to helper if Shadow trait triggered
            isSteal: tovResult.isSteal, 
            points: 0, isAndOne: false, playType: selectedPlayType, isSwitch
        };
    }

    // 5. Shot Calculation
    // Zone Quality Modifier: zoneUsage=10(숙련) → FG% -1.5%, zoneUsage=5(평균) → 0%, zoneUsage=1(부족) → +1.2%
    const zoneQualityMod = isZone
        ? (5 - defTeam.tactics.sliders.zoneUsage) * 0.003
        : 0;

    const shotContext = calculateHitRate(
        actor, defender, defTeam,
        selectedPlayType, preferredZone,
        sliders, // Pass full sliders
        bonusHitRate + zoneQualityMod + getMomentumBonus(state, offTeam.id) + foulDefPenalty,
        offTeam.acePlayerId,
        isBotchedSwitch, isSwitch,
        options?.minHitRate,
        state.possession === 'home',
        options?.clutchContext
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
        if (Math.random() < Math.max(0, andOneBase + intensityMod + drawFoulAndOneMod)) {
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
            const defIQ = defender.attr.helpDefIq;

            const heightBonus = Math.max(0, (defHeight - 200) * blkCfg.HEIGHT_FACTOR);
            const statBonus = ((defBlk - 70) * blkCfg.BLK_STAT_FACTOR) + ((defVert - 70) * blkCfg.VERT_STAT_FACTOR);

            blockProb += (heightBonus + statBonus);

            // C. ELITE THRESHOLD BONUSES (Blocker Archetypes)
            let archetypeBonus = 0;

            if (blkCfg.ENABLED) {
                // Type 1: "The Wall" (Elite Rating)
                if (defBlk >= 97) {
                    archetypeBonus = blkCfg.ARCHETYPE_WALL;
                }
                // Type 2: "The Alien" (Length Freak)
                else if (defHeight >= 216 && defBlk >= 80) {
                    archetypeBonus = blkCfg.ARCHETYPE_ALIEN;
                }
                // Type 3: "Skywalker" (Athletic Beast)
                else if (defVert >= 95 && defBlk >= 75) {
                    archetypeBonus = blkCfg.ARCHETYPE_SKYWALKER;
                }
                // Type 4: "Defensive Anchor" (High IQ Positioning)
                else if (defIQ >= 92 && defBlk >= 80) {
                    archetypeBonus = blkCfg.ARCHETYPE_ANCHOR;
                }
            }

            blockProb += archetypeBonus;

            // D. Offense Resistance (Avoidance)
            // High ShotIQ and High Release point (Height) reduces block chance
            const offResist = ((actor.attr.shotIq - 70) * 0.001) + ((actor.attr.height - 190) * 0.0005);
            blockProb -= Math.max(0, offResist);

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

        const { player: rebounder, type: reboundType } = resolveRebound(state.home, state.away, actor.playerId);

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
            isBlock, // Calculated Result
            isAndOne: false,
            matchupEffect: shotContext.matchupEffect,
            isAceTarget: shotContext.isAceTarget,
            isSwitch,
            isMismatch: shotContext.isMismatch
        };
    }

    const points = preferredZone === '3PT' ? 3 : 2;
    return {
        type: 'score', offTeam, defTeam, actor, assister: secondaryActor, points, zone: preferredZone, playType: selectedPlayType, isAndOne, matchupEffect: shotContext.matchupEffect, isAceTarget: shotContext.isAceTarget, isSwitch, isMismatch: shotContext.isMismatch, isBotchedSwitch
    };
}

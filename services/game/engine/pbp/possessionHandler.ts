
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

    // Calculate Total Turnover Probability
    let totalTovProb = baseProb + passRisk + pressureRisk + handlingFactor + iqFactor + contextRisk;

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

    if (Math.random() < baseFoulChance) {
        // Shooting foul vs Team foul 구분
        // [Fix] 파울 빈도는 18% 캡, 하지만 슈팅 파울 비율은 intensity로 차등 스케일링
        // → intensity 7과 10은 파울 횟수는 같지만 10이 더 비싼 파울(슈팅파울)을 많이 유발
        const isInsidePlay = preferredZone === 'Rim' || preferredZone === 'Paint';
        const intensityBonus = Math.max(0, defIntensity - 5);
        const shootingFoulChance = isInsidePlay
            ? Math.min(0.60, 0.45 + intensityBonus * 0.015) // 5→45%, 7→48%, 10→52.5%
            : preferredZone === 'Mid'
            ? Math.min(0.35, 0.25 + intensityBonus * 0.012) // 5→25%, 7→27%, 10→31%
            : Math.min(0.20, 0.10 + intensityBonus * 0.008); // 5→10%, 7→12%, 10→14%
        const isShootingFoul = Math.random() < shootingFoulChance;

        return {
            type: isShootingFoul ? 'freethrow' : 'foul',
            offTeam, defTeam, actor, defender, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch
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
        if (Math.random() < (andOneBase + intensityMod)) {
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
            // A. Determine Base Probability by Zone
            // [Fix] Halved base rates: old Rim 10% → 5%, Paint 5% → 3%, Mid 3.5% → 1.5%, 3PT 1% → 0.5%
            let blockProb = 0;
            if (preferredZone === 'Rim') blockProb = 0.05;        // 5%
            else if (preferredZone === 'Paint') blockProb = 0.03; // 3%
            else if (preferredZone === 'Mid') blockProb = 0.015;  // 1.5%
            else if (preferredZone === '3PT') blockProb = 0.005;  // 0.5%

            // B. Defender Attribute Modifiers
            const defBlk = defender.attr.blk;
            const defVert = defender.attr.vertical;
            const defHeight = defender.attr.height;
            const defIQ = defender.attr.helpDefIq;

            // Height bonus: +0.5% per 10cm over 200cm
            const heightBonus = Math.max(0, (defHeight - 200) * 0.0005);
            // Stat bonus: Reduced by half
            const statBonus = ((defBlk - 70) * 0.0005) + ((defVert - 70) * 0.00025);

            blockProb += (heightBonus + statBonus);

            // C. ELITE THRESHOLD BONUSES (Blocker Archetypes)
            // [Fix] Reduced archetype bonuses: max combined rate ~12-15% for elite blockers
            let archetypeBonus = 0;

            // Type 1: "The Wall" (Elite Rating) — was 12%, now 4.5%
            if (defBlk >= 97) {
                archetypeBonus = 0.045;
            }
            // Type 2: "The Alien" (Length Freak) — was 10%, now 3%
            else if (defHeight >= 216 && defBlk >= 80) {
                archetypeBonus = 0.03;
            }
            // Type 3: "Skywalker" (Athletic Beast) — was 8%, now 2.5%
            else if (defVert >= 95 && defBlk >= 75) {
                archetypeBonus = 0.025;
            }
            // Type 4: "Defensive Anchor" (High IQ Positioning) — was 6%, now 1.5%
            else if (defIQ >= 92 && defBlk >= 80) {
                archetypeBonus = 0.015;
            }

            blockProb += archetypeBonus;

            // D. Offense Resistance (Avoidance)
            // High ShotIQ and High Release point (Height) reduces block chance
            const offResist = ((actor.attr.shotIq - 70) * 0.001) + ((actor.attr.height - 190) * 0.0005);
            blockProb -= Math.max(0, offResist);

            // E. Roll Primary Block
            if (Math.random() < Math.max(0, blockProb)) {
                isBlock = true;
            }
            // F. Help Defense Block (Only inside)
            // [Fix] Reduced help block cap: was up to 9%, now max 5%
            else if ((preferredZone === 'Rim' || preferredZone === 'Paint') && !isBlock) {
                 // Find best blocker on team who isn't the primary defender
                 const potentialHelpers = defTeam.onCourt.filter(p => p.playerId !== defender.playerId);
                 potentialHelpers.sort((a, b) => b.attr.blk - a.attr.blk);
                 const helper = potentialHelpers[0];

                 if (helper) {
                     // Helper base chance is lower because they have to rotate
                     let helpChance = 0.01;
                     // Helper attributes
                     if (helper.attr.blk >= 90) helpChance += 0.02;
                     if (helper.archetypes.rimProtector > 80) helpChance += 0.02;

                     if (Math.random() < helpChance) {
                         isBlock = true;
                         finalDefender = helper; // Switch credit to helper
                     }
                 }
            }
        }
        // --- BLOCK CALCULATION LOGIC END ---

        const { player: rebounder } = resolveRebound(state.home, state.away, actor.playerId);
        
        return {
            type: 'miss', 
            offTeam, defTeam, 
            actor, 
            defender: finalDefender, // Updated to blocker if help block occurred
            rebounder, 
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

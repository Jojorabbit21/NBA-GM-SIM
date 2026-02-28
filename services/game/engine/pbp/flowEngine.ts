
import { SIM_CONFIG } from '../../config/constants';
import { LivePlayer, TeamState, ClutchContext } from './pbpTypes';
import { calculateAceStopperImpact } from '../aceStopperSystem';
import { Player, PlayType, TacticalSliders } from '../../../../types';

export function flattenPlayer(lp: LivePlayer): Player {
    return { ...lp.attr, ...lp, stats: {} as any } as unknown as Player;
}

function calculateTeamDefensiveRating(team: TeamState) {
    let intDef = 0, perDef = 0, pressure = 0, help = 0;
    team.onCourt.forEach(p => {
        intDef += p.attr.intDef;
        perDef += p.attr.perDef;
        pressure += p.attr.def;
        help += p.attr.helpDefIq;
    });
    return { intDef: intDef/5, perDef: perDef/5, pressure: pressure/5, help: help/5 };
}

export interface HitRateResult {
    rate: number;
    matchupEffect: number;
    isAceTarget: boolean;
    isMismatch: boolean;
}

export function calculateHitRate(
    actor: LivePlayer,
    defender: LivePlayer,
    defTeam: TeamState,
    playType: PlayType,
    preferredZone: 'Rim' | 'Paint' | 'Mid' | '3PT',
    offSliders: TacticalSliders, // [New] Offense Sliders
    bonusHitRate: number,
    acePlayerId?: string,
    isBotchedSwitch: boolean = false,
    isSwitch: boolean = false,
    minHitRate?: number, // [New] Buzzer beater: enforce hit rate lower bound
    isHome: boolean = false,
    clutchContext?: ClutchContext
): HitRateResult {
    const S = SIM_CONFIG.SHOOTING;
    let hitRate = 0.45;

    // 1. Base Hit Rate [EDITED BY USER! DO NOT CHANGE!]
    if (preferredZone === 'Rim' || preferredZone === 'Paint') hitRate = S.INSIDE_BASE_PCT;
    else if (preferredZone === 'Mid') hitRate = S.MID_BASE_PCT;
    else if (preferredZone === '3PT') hitRate = S.THREE_BASE_PCT;

    hitRate += bonusHitRate; // playTypes/zoneQualityMod 보정치 적용

    // [Fix] 존별 정확한 공격 능력치 매핑
    const zoneOffRating = preferredZone === '3PT' ? actor.attr.threeVal
        : preferredZone === 'Mid' ? actor.attr.mid
        : preferredZone === 'Rim'
            ? (actor.attr.layup * 0.40 + actor.attr.dunk * 0.35 + actor.attr.closeShot * 0.25)
            : (actor.attr.postPlay * 0.45 + actor.attr.closeShot * 0.30 + actor.attr.hands * 0.25);

    // 0. Botched Switch = Wide Open Shot (선수 능력치 반영, 고정값 제거)
    if (isBotchedSwitch) {
        const attackerShooting = zoneOffRating;
        const openShotBonus    = 0.20;
        const attackerMod      = (attackerShooting - 70) * 0.001;
        return {
            rate: Math.min(0.82, hitRate + openShotBonus + attackerMod),
            matchupEffect: 0, isAceTarget: false, isMismatch: false
        };
    }

    // 2. Offense vs Defense Attributes + Fatigue
    const fatigueOff = actor.currentCondition / 100;    // 0~1 (condition 70 = 0.7 기준 중립)
    const fatigueDef = defender.currentCondition / 100;

    // 피로도 → FG% 보정
    // 공격자: condition 0 → -7%, condition 70 → 0, condition 100 → +3%
    hitRate += (fatigueOff - 0.70) * 0.10;
    // [SaveTendency] focusDrift: extra FG% loss when heavily fatigued (condition < 60%)
    if (fatigueOff < 0.60) {
        hitRate -= (actor.tendencies?.focusDrift ?? 0) * (0.60 - fatigueOff) * 0.05;
    }
    // 수비자: condition 0 → +3.5%, condition 70 → 0, condition 100 → -1.5%
    hitRate -= (fatigueDef - 0.70) * 0.05;

    const offRating = zoneOffRating;
    const baseDefRating = preferredZone === '3PT' ? defender.attr.perDef : defender.attr.intDef;
    // [SaveTendency] defensiveMotor: ±3pt to effective def rating
    const defRating = baseDefRating + (defender.tendencies?.defensiveMotor ?? 0) * 3;
    
    // Apply Sliders
    // Def Intensity: Reduces Shot PCT
    // [Update] Reduced impact (0.01 -> 0.005) to prevent FG% crash
    const intensityMod = (defTeam.tactics.sliders.defIntensity - 5) * 0.005;
    
    // Help Defense: Reduces Rim/Paint PCT
    // [Update] Reduced impact (0.015 -> 0.008)
    const helpMod = (defTeam.tactics.sliders.helpDef - 5) * 0.008;

    hitRate += (offRating - defRating) * 0.002;
    hitRate -= intensityMod;

    if (preferredZone === 'Rim' || preferredZone === 'Paint') {
        hitRate -= helpMod;
    }

    // --- ZONE SHOOTING ARCHETYPES ---
    const zCfg = SIM_CONFIG.ZONE_SHOOTING;
    if (zCfg.ENABLED) {
        // B-1. Mr. Fundamental: 엘리트 미드레인지 슈터
        if (preferredZone === 'Mid' && actor.attr.mid >= zCfg.FUNDAMENTAL_MID_THRESHOLD) {
            // 클러치(Q4 ≤5분, 접전) + Mid → +3%
            if (clutchContext?.isClutch) hitRate += zCfg.FUNDAMENTAL_CLUTCH_BONUS;
            // ISO + Mid → +3% (중첩 가능)
            if (playType === 'ISO') hitRate += zCfg.FUNDAMENTAL_ISO_BONUS;
        }

        // B-2. Rangemaster: 엘리트 3PT 슈터, 클러치에서 추가 보너스
        if (preferredZone === '3PT' && clutchContext?.isClutch &&
            actor.attr.threeVal >= zCfg.RANGEMASTER_THREEVAL_THRESHOLD &&
            actor.attr.shotIq >= zCfg.RANGEMASTER_SHOTIQ_THRESHOLD) {
            hitRate += zCfg.RANGEMASTER_CLUTCH_BONUS;
        }

        // B-3. Tyrant: 피지컬 피니셔, Rim/Paint hitRate 보너스
        if ((preferredZone === 'Rim' || preferredZone === 'Paint') &&
            actor.attr.ins >= zCfg.TYRANT_INS_THRESHOLD &&
            (actor.attr.strength >= zCfg.TYRANT_STRENGTH_THRESHOLD ||
             actor.attr.vertical >= zCfg.TYRANT_VERTICAL_THRESHOLD)) {
            hitRate += zCfg.TYRANT_HITRATE_BONUS;
        }

        // B-5. Afterburner: 폭발적 스피드로 트랜지션 마무리력 상승
        if (playType === 'Transition' &&
            actor.attr.speed >= zCfg.AFTERBURNER_SPEED_THRESHOLD &&
            actor.attr.agility >= zCfg.AFTERBURNER_AGILITY_THRESHOLD) {
            hitRate += zCfg.AFTERBURNER_TRANSITION_BONUS;
        }
    }

    // 3. Mismatch Logic (스위치 발생 시에만 적용)
    let isMismatch = false;
    if (isSwitch) {
        const heightDiff  = defender.attr.height - actor.attr.height; // 양수 = 수비자가 더 큼
        const speedAdv    = actor.attr.speed     - defender.attr.speed;
        const agilityAdv  = actor.attr.agility   - defender.attr.agility;
        const strengthAdv = actor.attr.strength  - defender.attr.strength;

        // Guard on Big: Speed+Agility 이동 능력 우위 (힘은 무관)
        const mobilityAdv  = (speedAdv + agilityAdv) / 2;
        const isGuardOnBig = heightDiff >= 10 && mobilityAdv >= 10;

        // Big on Guard: Strength + Height 우위
        const isBigOnGuard = -heightDiff >= 10 && strengthAdv >= 15;

        // Skill Mismatch: 존에 따라 적절한 아키타입 점수 비교
        let offSkill: number;
        let defSkill: number;
        if (preferredZone === '3PT' || preferredZone === 'Mid') {
            offSkill = actor.archetypes.spacer;
            defSkill  = defender.archetypes.perimLock;
        } else {
            // Rim / Paint: 드라이버 or 포스트 스코어러 중 높은 값
            offSkill = Math.max(actor.archetypes.driver, actor.archetypes.postScorer);
            defSkill  = defender.archetypes.rimProtector;
        }
        const skillGap = offSkill - defSkill;

        if (isGuardOnBig || isBigOnGuard || skillGap >= 15) {
            isMismatch = true;
            // 격차에 비례한 공격 이점, 최대 +12%
            const intensity     = Math.max(skillGap, 15);
            const mismatchBonus = Math.min(0.12, (intensity / 100) * 0.3);
            hitRate += mismatchBonus;
        } else {
            // 성공적 스위치: 미스매치 없이 포지션을 잘 잡은 수비자 → 공격자 공간 축소
            hitRate -= 0.03;
        }
    }

    // 4. Ace Stopper Impact
    const isStopperActive = defTeam.tactics.stopperId === defender.playerId &&
                            actor.playerId === acePlayerId;
    
    let matchupEffect = 0;
    if (isStopperActive) {
        const impact = calculateAceStopperImpact(flattenPlayer(actor), flattenPlayer(defender), defender.mp);
        hitRate *= (1 + (impact / 100));
        matchupEffect = impact;
    }

    // 5. Pace Penalty (Haste)
    // [Fix] Graduated: each point above 5 adds -1% FG (was binary -3% at pace>7)
    // pace=5: 0%, pace=6: -1%, pace=7: -2%, pace=8: -3%, pace=9: -4%, pace=10: -5%
    if (offSliders.pace > 5) {
        hitRate -= (offSliders.pace - 5) * 0.01;
    }

    // 6. Home Court Advantage
    if (isHome) {
        hitRate += SIM_CONFIG.GAME_ENV.HOME_ADVANTAGE;
    }

    // 7. Clutch Modifier (Q4 접전 상황)
    // intangibles(50%) + offConsist(30%) + shotIq(20%) → 70 기준 ±보정
    if (clutchContext?.isClutch) {
        const cCfg = SIM_CONFIG.CLUTCH_ARCHETYPE;
        const a = actor.attr;

        const clutchRating = (a.intangibles * 0.50 + a.offConsist * 0.30 + a.shotIq * 0.20) / 100;
        let clutchModifier = (clutchRating - 0.70) * 0.10;
        // [SaveTendency] clutchGene: ±3% hit rate in clutch
        clutchModifier += (actor.tendencies?.clutchGene ?? 0) * 0.03;

        if (cCfg.ENABLED) {
            // A-1. The Closer: 클러치 보정치 2배
            if (a.intangibles >= cCfg.CLOSER_INTANGIBLES_THRESHOLD &&
                a.shotIq >= cCfg.CLOSER_SHOTIQ_THRESHOLD) {
                clutchModifier *= cCfg.CLOSER_MODIFIER_MULTIPLIER;
            }
        }

        hitRate += clutchContext.isSuperClutch ? clutchModifier * 1.5 : clutchModifier;

        // A-2. Ice in Veins: 프레셔 페널티 면제
        const isIce = cCfg.ENABLED &&
                      a.intangibles >= cCfg.ICE_INTANGIBLES_THRESHOLD &&
                      a.offConsist >= cCfg.ICE_OFFCONSIST_THRESHOLD;
        if (!isIce) {
            hitRate -= 0.015; // 프레셔 페널티 (Ice in Veins만 면제)
        }

        // A-3. Big Stage Player: 클러치 + 인사이드 = 추가 보너스
        if (cCfg.ENABLED &&
            (preferredZone === 'Rim' || preferredZone === 'Paint') &&
            a.intangibles >= cCfg.BIGSTAGE_INTANGIBLES_THRESHOLD &&
            a.strength >= cCfg.BIGSTAGE_STRENGTH_THRESHOLD &&
            a.ins >= cCfg.BIGSTAGE_INS_THRESHOLD) {
            hitRate += cCfg.BIGSTAGE_INSIDE_BONUS;
        }
    }

    // 8. Hot/Cold Streak (±4% 캡)
    if (actor.hotColdRating !== 0) {
        // [SaveTendency] confidenceSensitivity: scales hot/cold amplitude (0.3x~1.7x)
        let temperatureBonus = actor.hotColdRating * 0.04 * (actor.tendencies?.confidenceSensitivity ?? 1.0);
        // 콜드 스트릭 완화: offConsist가 높으면 멘탈 회복
        if (temperatureBonus < 0) {
            const consistencyRecover = (actor.attr.offConsist / 100) * 0.5;
            temperatureBonus *= (1 - consistencyRecover);
        }
        hitRate += temperatureBonus;
    }

    let finalRate = Math.max(0.05, Math.min(0.95, hitRate));
    // Buzzer beater: enforce lower bound (minHitRate) if provided
    if (minHitRate !== undefined) finalRate = Math.max(finalRate, minHitRate);

    return {
        rate: finalRate,
        matchupEffect,
        isAceTarget: isStopperActive,
        isMismatch
    };
}

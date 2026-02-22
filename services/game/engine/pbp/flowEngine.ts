
import { SIM_CONFIG } from '../../config/constants';
import { LivePlayer, TeamState } from './pbpTypes';
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
    isSwitch: boolean = false
): HitRateResult {
    const S = SIM_CONFIG.SHOOTING;
    let hitRate = 0.45;

    // 1. Base Hit Rate [EDITED BY USER! DO NOT CHANGE!]
    if (preferredZone === 'Rim' || preferredZone === 'Paint') hitRate = S.INSIDE_BASE_PCT;
    else if (preferredZone === 'Mid') hitRate = S.MID_BASE_PCT;
    else if (preferredZone === '3PT') hitRate = S.THREE_BASE_PCT;

    hitRate += bonusHitRate; // playTypes/zoneQualityMod 보정치 적용

    // 0. Botched Switch = Wide Open Shot (선수 능력치 반영, 고정값 제거)
    if (isBotchedSwitch) {
        const attackerShooting = preferredZone === '3PT' ? actor.attr.out : actor.attr.ins;
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
    // 수비자: condition 0 → +3.5%, condition 70 → 0, condition 100 → -1.5%
    hitRate -= (fatigueDef - 0.70) * 0.05;

    const offRating = preferredZone === '3PT' ? actor.attr.out : actor.attr.ins;
    const defRating = preferredZone === '3PT' ? defender.attr.perDef : defender.attr.intDef;
    
    // Apply Sliders
    // Def Intensity: Reduces Shot PCT
    // [Update] Reduced impact (0.01 -> 0.005) to prevent FG% crash
    const intensityMod = (defTeam.tactics.sliders.defIntensity - 5) * 0.005;
    
    // Help Defense: Reduces Rim/Paint PCT
    // [Update] Reduced impact (0.015 -> 0.008)
    const helpMod = (defTeam.tactics.sliders.helpDef - 5) * 0.008;

    hitRate += (offRating - defRating) * 0.003;
    hitRate -= intensityMod;

    if (preferredZone === 'Rim' || preferredZone === 'Paint') {
        hitRate -= helpMod;
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

    return {
        rate: Math.max(0.05, Math.min(0.95, hitRate)),
        matchupEffect,
        isAceTarget: isStopperActive,
        isMismatch
    };
}

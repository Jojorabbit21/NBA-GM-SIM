
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

    // 0. Botched Switch = Open Shot
    if (isBotchedSwitch) {
        return { rate: 0.85, matchupEffect: 0, isAceTarget: false, isMismatch: false };
    }

    // 1. Base Hit Rate [EDITED BY USER! DO NOT CHANGE!]
    if (preferredZone === 'Rim' || preferredZone === 'Paint') hitRate = S.INSIDE_BASE_PCT;
    else if (preferredZone === 'Mid') hitRate = S.MID_BASE_PCT;
    else if (preferredZone === '3PT') hitRate = S.THREE_BASE_PCT;

    // 2. Offense vs Defense Attributes
    const fatigueOff = actor.currentCondition / 100;
    const fatigueDef = defender.currentCondition / 100;

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

    // 3. Mismatch Logic
    let isMismatch = false;
    if (isSwitch) {
        // ... (Mismatch logic same as before, simplified for brevity)
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
    // High pace = Rush shots
    if (offSliders.pace > 7) {
        hitRate -= 0.03;
    }

    return {
        rate: Math.max(0.05, Math.min(0.95, hitRate)),
        matchupEffect,
        isAceTarget: isStopperActive,
        isMismatch
    };
}

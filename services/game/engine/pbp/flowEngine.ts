
import { SIM_CONFIG } from '../../config/constants';
import { LivePlayer, TeamState } from './pbpTypes';
import { calculateAceStopperImpact } from '../aceStopperSystem';
import { Player, PlayType, OffenseTactic } from '../../../../types';

// Helper to convert LivePlayer to Player (flat structure)
export function flattenPlayer(lp: LivePlayer): Player {
    return {
        id: lp.playerId,
        name: lp.playerName,
        position: lp.position,
        ovr: lp.ovr,
        condition: lp.currentCondition,
        // Map attributes
        speed: lp.attr.speed,
        agility: lp.attr.agility,
        strength: lp.attr.strength,
        vertical: lp.attr.vertical,
        stamina: lp.attr.stamina,
        durability: lp.attr.durability,
        hustle: lp.attr.hustle,
        height: lp.attr.height,
        weight: lp.attr.weight,
        
        handling: lp.attr.handling,
        hands: lp.attr.hands,
        passAcc: lp.attr.pas,
        passVision: lp.attr.passVision,
        passIq: lp.attr.passIq,
        shotIq: lp.attr.shotIq,
        offConsist: lp.attr.offConsist,
        postPlay: lp.attr.postPlay,
        
        def: lp.attr.def,
        intDef: lp.attr.intDef,
        perDef: lp.attr.perDef,
        blk: lp.attr.blk,
        steal: lp.attr.stl,
        helpDefIq: lp.attr.helpDefIq,
        defConsist: lp.attr.defConsist,
        drawFoul: lp.attr.drFoul,
        
        reb: lp.attr.reb,
        
        stats: {} as any,
        
        age: 25, salary: 0, contractYears: 0, potential: 0,
        // [Fix] Add revealedPotential to satisfy Player interface
        revealedPotential: lp.ovr,
        ins: lp.attr.ins, out: lp.attr.out, midRange: lp.attr.mid, ft: lp.attr.ft,
        threeCorner: lp.attr.threeVal, three45: lp.attr.threeVal, threeTop: lp.attr.threeVal,
        closeShot: lp.attr.ins, layup: lp.attr.ins, dunk: lp.attr.ins,
        spdBall: lp.attr.speed,
        passPerc: 50,
        offReb: lp.attr.reb, defReb: lp.attr.reb,
        plm: 70, ath: 70,
        intangibles: 50,
        health: 'Healthy'
    };
}

function calculateTeamDefensiveRating(team: TeamState) {
    // Simple aggregation of on-court defensive stats
    let intDef = 0;
    let perDef = 0;
    let pressure = 0;
    let help = 0;
    
    team.onCourt.forEach(p => {
        intDef += p.attr.intDef;
        perDef += p.attr.perDef;
        pressure += p.attr.def;
        help += p.attr.helpDefIq;
    });
    
    return {
        intDef: intDef / 5,
        perDef: perDef / 5,
        pressure: pressure / 5,
        help: help / 5
    };
}

export interface HitRateResult {
    rate: number;
    matchupEffect: number;
    isAceTarget: boolean;
    isMismatch: boolean; // [New]
}

export function calculateHitRate(
    actor: LivePlayer,
    defender: LivePlayer,
    defTeam: TeamState,
    playType: PlayType,
    preferredZone: 'Rim' | 'Paint' | 'Mid' | '3PT',
    paceSlider: number,
    offTactic: OffenseTactic, 
    bonusHitRate: number,
    attEfficiency: number,
    defEfficiency: number,
    acePlayerId?: string,
    isBotchedSwitch: boolean = false, // [New]
    isSwitch: boolean = false // [New]
): HitRateResult {
    const S = SIM_CONFIG.SHOOTING;
    let hitRate = 0.45;

    // 0. Check Botched Switch (Open Shot)
    if (isBotchedSwitch) {
        // Massive Bonus, limited Defense impact
        return {
            rate: 0.85, // Almost guaranteed open look
            matchupEffect: 0,
            isAceTarget: false,
            isMismatch: false
        };
    }

    // 1. Base Percentages from Constants
    if (preferredZone === 'Rim') hitRate = S.INSIDE_BASE_PCT; // 0.58
    else if (preferredZone === 'Mid') hitRate = S.MID_BASE_PCT; // 0.40
    else if (preferredZone === '3PT') hitRate = S.THREE_BASE_PCT; // 0.35
    else hitRate = 0.45; 

    // 2. Attribute Delta (Offense vs Defense)
    const fatigueOff = actor.currentCondition / 100;
    const fatigueDef = defender.currentCondition / 100;

    const offRating = preferredZone === '3PT' ? (actor.attr.out * fatigueOff) : (actor.attr.ins * fatigueOff);
    
    let defStat = defender.attr.perDef;
    let defImpactFactor = S.MID_DEF_IMPACT;

    if (preferredZone === 'Rim') {
        defStat = (defender.attr.intDef * 0.7) + (defender.attr.blk * 0.3);
        defImpactFactor = S.INSIDE_DEF_IMPACT;
    } else if (preferredZone === '3PT') {
        defStat = defender.attr.perDef;
        defImpactFactor = S.THREE_DEF_IMPACT;
    }

    const foulCount = defender.pf;
    const FT_CONFIG = SIM_CONFIG.FOUL_TROUBLE.DEF_PENALTY;
    let defPenalty = 0;
    
    if (foulCount >= 5) defPenalty = FT_CONFIG[5]; 
    else if (foulCount === 4) defPenalty = FT_CONFIG[4]; 

    const defRating = defStat * fatigueDef * (1 - defPenalty);
    
    // Base Matchup Calculation
    hitRate += (offRating - defRating) * defImpactFactor;

    // [New] Switch Mismatch Calculation
    let isMismatch = false;
    let mismatchModifier = 0;

    if (isSwitch) {
        const isActorBig = ['C', 'PF'].includes(actor.position);
        const isDefenderSmall = ['PG', 'SG'].includes(defender.position);
        
        const isActorSmall = ['PG', 'SG'].includes(actor.position);
        const isDefenderBig = ['C', 'PF'].includes(defender.position);

        // Case A: Big vs Small (Post Mismatch)
        if (isActorBig && isDefenderSmall && (preferredZone === 'Rim' || preferredZone === 'Paint')) {
             // Advantage: Strength Diff
             const strDelta = actor.attr.strength - defender.attr.strength;
             if (strDelta > 10) {
                 isMismatch = true;
                 mismatchModifier = strDelta * 0.002; // +2% to +5% typically
             }
        }
        // Case B: Small vs Big (Speed/Perimeter Mismatch)
        else if (isActorSmall && isDefenderBig && (preferredZone === '3PT' || preferredZone === 'Mid')) {
             // Advantage: Speed/Agility vs PerDef
             const spdDelta = (actor.attr.speed + actor.attr.agility)/2 - (defender.attr.speed + defender.attr.perDef)/2;
             if (spdDelta > 10) {
                 isMismatch = true;
                 mismatchModifier = spdDelta * 0.0025; // +2.5% to +6% typically
             }
        }
    }

    // [New] Help Defense Mitigation (Balance Control)
    // If mismatch exists, team help defense tries to rotate
    if (isMismatch) {
        const teamDefMetrics = calculateTeamDefensiveRating(defTeam);
        // Team Help IQ determines if rotation arrives
        const helpChance = teamDefMetrics.help / 120; // ~0.5 to 0.8
        
        if (Math.random() < helpChance) {
            // Help arrived! Reduce mismatch advantage
            mismatchModifier *= 0.3; // Slash bonus by 70%
            // Note: In logs we could say "Help Defense mitigated mismatch" but keeping it simple for now
        }
        hitRate += mismatchModifier;
    }

    // [New] Apply Team Defensive Metrics (Standard Help)
    // This is the base help defense that always applies
    const teamDefMetrics = calculateTeamDefensiveRating(defTeam);
    let helpImpact = 0;
    if (preferredZone === 'Rim' || preferredZone === 'Paint') {
        helpImpact = (teamDefMetrics.intDef + teamDefMetrics.help - 140) * 0.002;
    } else {
        helpImpact = (teamDefMetrics.perDef + teamDefMetrics.pressure + teamDefMetrics.help - 210) * 0.001;
    }
    hitRate -= helpImpact; 

    // 3. Tactical & Ace Stopper Impact
    const isStopperActive = defTeam.tactics.defenseTactics.includes('AceStopper') && 
                            defTeam.tactics.stopperId === defender.playerId &&
                            actor.playerId === acePlayerId; 
    
    let matchupEffect = 0;
    let isAceTarget = false;

    if (isStopperActive) {
        const flatAce = flattenPlayer(actor);
        const flatStopper = flattenPlayer(defender);
        const stopperMp = defender.mp; 

        const impactPercent = calculateAceStopperImpact(flatAce, flatStopper, stopperMp);
        const adjustedImpact = impactPercent * (1 - defPenalty);
        
        hitRate = hitRate * (1 + (adjustedImpact / 100));

        matchupEffect = adjustedImpact;
        isAceTarget = true;
    }

    // 4. Efficiency Modifiers
    hitRate += bonusHitRate; 
    hitRate *= attEfficiency; 
    hitRate *= (2.0 - defEfficiency); 

    // Haste Malus
    if (playType !== 'Transition') {
        if (paceSlider >= 7) {
            let sliderMalus = 0;
            if (paceSlider === 7) sliderMalus = 0.03;
            else if (paceSlider === 8) sliderMalus = 0.04;
            else if (paceSlider === 9) sliderMalus = 0.05;
            else if (paceSlider === 10) sliderMalus = 0.07;

            const composure = actor.attr.shotIq;
            const mitigation = Math.max(0, (composure - 70) * 0.001); 
            
            hitRate -= Math.max(0, sliderMalus - mitigation);
        }

        if (offTactic === 'SevenSeconds') {
            hitRate -= 0.05; 
        }
    }
    
    if (playType === 'Transition') {
        const defPace = defTeam.tactics.sliders.pace;
        if (defPace > 7) {
            hitRate += 0.15; 
        }
    }
    
    return {
        rate: Math.max(0.05, Math.min(0.95, hitRate)),
        matchupEffect,
        isAceTarget,
        isMismatch // Return status
    };
}

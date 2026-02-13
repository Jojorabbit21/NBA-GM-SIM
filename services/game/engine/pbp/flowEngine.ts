
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

export function calculateHitRate(
    actor: LivePlayer,
    defender: LivePlayer,
    defTeam: TeamState,
    playType: PlayType,
    preferredZone: 'Rim' | 'Paint' | 'Mid' | '3PT',
    paceSlider: number,
    offTactic: OffenseTactic, // [New] Added Tactic for Haste Malus
    bonusHitRate: number,
    attEfficiency: number,
    defEfficiency: number
): number {
    const S = SIM_CONFIG.SHOOTING;
    let hitRate = 0.45;

    // 1. Base Percentages from Constants
    if (preferredZone === 'Rim') hitRate = S.INSIDE_BASE_PCT; // 0.58
    else if (preferredZone === 'Mid') hitRate = S.MID_BASE_PCT; // 0.40
    else if (preferredZone === '3PT') hitRate = S.THREE_BASE_PCT; // 0.35
    else hitRate = 0.45; 

    // 2. Attribute Delta (Offense vs Defense)
    // Fatigue applied
    const fatigueOff = actor.currentCondition / 100;
    const fatigueDef = defender.currentCondition / 100;

    const offRating = preferredZone === '3PT' ? (actor.attr.out * fatigueOff) : (actor.attr.ins * fatigueOff);
    
    // Defensive Stat Selection (Perimeter vs Interior)
    let defStat = defender.attr.perDef;
    let defImpactFactor = S.MID_DEF_IMPACT;

    if (preferredZone === 'Rim') {
        defStat = (defender.attr.intDef * 0.7) + (defender.attr.blk * 0.3);
        defImpactFactor = S.INSIDE_DEF_IMPACT;
    } else if (preferredZone === '3PT') {
        defStat = defender.attr.perDef;
        defImpactFactor = S.THREE_DEF_IMPACT;
    }

    // [New] Foul Trouble Penalty Calculation
    const foulCount = defender.pf;
    const FT_CONFIG = SIM_CONFIG.FOUL_TROUBLE.DEF_PENALTY;
    let defPenalty = 0;
    
    if (foulCount >= 5) defPenalty = FT_CONFIG[5]; // e.g. 0.40
    else if (foulCount === 4) defPenalty = FT_CONFIG[4]; // e.g. 0.15

    // Apply Def Rating with Fatigue and Foul Trouble Penalty
    const defRating = defStat * fatigueDef * (1 - defPenalty);
    
    // Apply Delta (Individual Matchup)
    // e.g. (90 - 70) * 0.004 = +0.08 (+8%)
    hitRate += (offRating - defRating) * defImpactFactor;

    // [New] Apply Team Defensive Metrics (Help Defense)
    const teamDefMetrics = calculateTeamDefensiveRating(defTeam);
    let helpImpact = 0;
    if (preferredZone === 'Rim' || preferredZone === 'Paint') {
        // Interior Help: IntDef + HelpIQ
        helpImpact = (teamDefMetrics.intDef + teamDefMetrics.help - 140) * 0.002;
    } else {
        // Perimeter Pressure: PerDef + Pressure + HelpIQ
        helpImpact = (teamDefMetrics.perDef + teamDefMetrics.pressure + teamDefMetrics.help - 210) * 0.001;
    }
    hitRate -= helpImpact; // Higher team defense reduces hit rate

    // 3. Tactical & Ace Stopper Impact
    const isStopperActive = defTeam.tactics.defenseTactics.includes('AceStopper') && 
                            defTeam.tactics.stopperId === defender.playerId;
    
    if (isStopperActive) {
        // Calculate detailed impact from AceStopper System
        const flatAce = flattenPlayer(actor);
        const flatStopper = flattenPlayer(defender);
        const stopperMp = defender.mp; 

        // calculateAceStopperImpact returns percentage (e.g. -15 for -15%)
        const impactPercent = calculateAceStopperImpact(flatAce, flatStopper, stopperMp);
        
        // If in foul trouble, the stopper impact is significantly reduced (closer to 0 or positive)
        const adjustedImpact = impactPercent * (1 - defPenalty);
        
        hitRate = hitRate * (1 + (adjustedImpact / 100));
    }

    // 4. Efficiency Modifiers
    hitRate += bonusHitRate; // From PlayType (e.g. +15% for Dunk)
    hitRate *= attEfficiency; // Team spacing/fit bonus
    hitRate *= (2.0 - defEfficiency); // Defense coordination penalty

    // [New] Haste Malus (Revised)
    // Apply penalty for high pace and SevenSeconds tactic
    if (playType !== 'Transition') {
        // Pace Slider Penalty (7+)
        if (paceSlider >= 7) {
            let sliderMalus = 0;
            if (paceSlider === 7) sliderMalus = 0.03;
            else if (paceSlider === 8) sliderMalus = 0.04;
            else if (paceSlider === 9) sliderMalus = 0.05;
            else if (paceSlider === 10) sliderMalus = 0.07;

            // Mitigation by ShotIQ (High IQ players resist rushing)
            const composure = actor.attr.shotIq;
            const mitigation = Math.max(0, (composure - 70) * 0.001); // Small offset for elite players
            
            hitRate -= Math.max(0, sliderMalus - mitigation);
        }

        // Tactic Penalty
        if (offTactic === 'SevenSeconds') {
            hitRate -= 0.05; // -5% Flat
        }
    }
    
    // [New] Transition Defense Breakdown
    if (playType === 'Transition') {
        const defPace = defTeam.tactics.sliders.pace;
        if (defPace > 7) {
            hitRate += 0.15; // +15% success against fast teams (bad transition D)
        }
    }
    
    return Math.max(0.05, Math.min(0.95, hitRate));
}

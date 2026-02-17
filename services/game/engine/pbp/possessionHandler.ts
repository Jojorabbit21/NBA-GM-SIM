
import { GameState, PossessionResult, LivePlayer, TeamState } from './pbpTypes';
import { resolvePlayAction } from './playTypes';
import { calculateHitRate, flattenPlayer } from './flowEngine';
import { resolveRebound } from './reboundLogic';
import { calculatePlaymakingStats } from '../playmakingSystem';
import { SIM_CONFIG } from '../../config/constants';
import { PlayType } from '../../../../types';

/**
 * Identify Defender using Sliders
 */
function identifyDefender(
    defTeam: TeamState, 
    actor: LivePlayer, 
    secondaryActor: LivePlayer | undefined, 
    playType: PlayType,
    isActorAce: boolean,
    targetZone: 'Rim' | 'Paint' | 'Mid' | '3PT'
): { defender: LivePlayer, isSwitch: boolean, isBotchedSwitch: boolean } {
    
    const sliders = defTeam.tactics.sliders;
    
    // 0. Zone Defense Override
    // If zoneFreq is high (>=8), treat as Zone Defense
    const isZone = sliders.zoneFreq >= 8;

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
 * Updated: Applies baseline bonus + situational boost
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

    // 1. Base Turnover Chance (Mental & Handling)
    // High ball movement (Pass heavy) slightly increases intercept risk but opens floor
    const passRisk = sliders.ballMovement * 0.01;
    const pressureRisk = defIntensity * 0.015;
    
    // Base chance ~10% modified by attributes
    const handlingFactor = (100 - actor.attr.handling) * 0.002; // Bad handle = higher risk
    const iqFactor = (100 - actor.attr.passIq) * 0.001; // Bad IQ = higher risk

    let tovChance = 0.05 + passRisk + pressureRisk + handlingFactor + iqFactor;

    // 2. Steal Calculation with Elite Archetypes
    // We check if the primary defender OR a helper triggers a steal
    let isTurnover = false;
    let isSteal = false;
    let stealer: LivePlayer | undefined = undefined;
    
    let totalBonus = 0;

    // A. Check Primary Defender Archetypes
    const d = defender.attr;
    const isGuard = defender.position.includes('G');
    
    // Archetype 1: "The Glove" (On-Ball Lockdown)
    // Criteria: High Steal + PerDef + Strength
    if (d.stl >= 90 && d.perDef >= 85 && d.strength >= 70) {
        totalBonus += 0.03; // Baseline Pressure
        if (['Iso', 'PnR_Handler'].includes(playType)) {
            totalBonus += 0.12; // Situational Boost (On-Ball)
        }
    } else if (d.stl >= 80 && d.perDef >= 80) {
        totalBonus += 0.01; // Minor Baseline
        if (['Iso', 'PnR_Handler'].includes(playType)) {
            totalBonus += 0.04; // Minor Situational
        }
    }

    // Archetype 2: "The Interceptor" (Passing Lane / Wingspan)
    // Criteria: Height > Avg for position + High Pass Perception + Decent Steal
    const hasLength = (isGuard && d.height >= 193) || (!isGuard && d.height >= 203);
    if (hasLength && d.passPerc >= 85 && d.stl >= 75) {
         totalBonus += 0.02; // Baseline Obstruction
         if (['CatchShoot', 'Cut', 'PnR_Roll', 'PnR_Pop'].includes(playType)) {
             totalBonus += 0.10; // Situational Boost (Passing Lanes)
         }
    }

    // Archetype 3: "Grand Theft" (Raw Stat God)
    // Criteria: Elite Steal Rating
    if (d.stl >= 96) {
        totalBonus += 0.08; // Pure instinct, always active
    }

    // Archetype 4: "Cookie Monster" (Agility/Reaction)
    // Criteria: Steal + Agility
    if (d.stl >= 80 && d.agility >= 90) {
        totalBonus += 0.02; // Baseline Reflex
        if (['Handoff', 'Transition'].includes(playType)) {
            totalBonus += 0.10; // Situational Boost (Chaos)
        }
    }

    // Apply Primary Defender Steal Calculation
    // Base TOV probability is influenced by defense intensity + actor mistakes
    // Steal bonus is added on top.
    if (Math.random() < (tovChance * 0.5 + totalBonus)) {
        isTurnover = true;
        isSteal = true;
        stealer = defender;
    } 
    else if (Math.random() < tovChance) {
        // Unforced Turnover (Bad pass, dribble off foot, etc.)
        isTurnover = true;
        isSteal = false;
    } else {
        isTurnover = false;
    }

    // B. Archetype 5: "The Shadow" (Help Defender Steal - The Roamer)
    // If no turnover yet, check if a helper snipes it
    if (!isTurnover && ['PostUp', 'Cut', 'Iso'].includes(playType)) {
        // Find best help stealer who isn't the primary defender
        const shadow = defTeam.onCourt.find(p => 
            p.playerId !== defender.playerId && 
            p.attr.stl >= 85 && 
            p.attr.helpDefIq >= 90
        );

        if (shadow) {
            // Surprise double team steal chance
            // Shadow trait gives flat chance to create turnover
            if (Math.random() < 0.06) {
                isTurnover = true;
                isSteal = true;
                stealer = shadow;
            }
        }
    }

    return { isTurnover, isSteal, stealer };
}

export function simulatePossession(state: GameState): PossessionResult {
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = state.possession === 'home' ? state.away : state.home;
    const sliders = offTeam.tactics.sliders;

    // 1. Play Selection based on Sliders
    let selectedPlayType: PlayType = 'Iso';
    let isSecondChance = false;

    if (state.shotClock === 14 && state.gameClock < 720) {
        // High OffReb slider increases immediate putback chance
        const putbackChance = 0.5 + (sliders.offReb * 0.03); 
        if (Math.random() < putbackChance) {
            selectedPlayType = 'Putback';
            isSecondChance = true;
        }
    }

    if (!isSecondChance) {
        // Calculate total weight
        const weights = {
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

    const playCtx = resolvePlayAction(offTeam, selectedPlayType);
    const { actor, secondaryActor, preferredZone, shotType, bonusHitRate } = playCtx;
    const isActorAce = actor.playerId === offTeam.acePlayerId;

    // 2. Identify Defender
    const { defender, isSwitch, isBotchedSwitch } = identifyDefender(
        defTeam, actor, secondaryActor, selectedPlayType, isActorAce, preferredZone
    );

    // 3. Defensive Foul Check (Intensity Slider)
    const defIntensity = defTeam.tactics.sliders.defIntensity;
    const baseFoulChance = 0.08 + (defIntensity * 0.015); // Higher intensity = More fouls
    
    if (Math.random() < baseFoulChance) {
        return {
            type: 'foul', offTeam, defTeam, actor, defender, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch
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
    const shotContext = calculateHitRate(
        actor, defender, defTeam, 
        selectedPlayType, preferredZone, 
        sliders, // Pass full sliders
        bonusHitRate, 
        offTeam.acePlayerId,
        isBotchedSwitch, isSwitch
    );

    const isScore = Math.random() < shotContext.rate;
    
    // Rebound & Block Resolution
    if (!isScore) {
        // --- BLOCK CALCULATION LOGIC START ---
        let isBlock = false;
        let finalDefender = defender; // Default to primary defender

        // Only calc block if we have a defender context
        if (defender && preferredZone) {
            // A. Determine Base Probability by Zone
            let blockProb = 0;
            if (preferredZone === 'Rim') blockProb = 0.10;        // 10%
            else if (preferredZone === 'Paint') blockProb = 0.05; // 5%
            else if (preferredZone === 'Mid') blockProb = 0.035;  // 3.5%
            else if (preferredZone === '3PT') blockProb = 0.01;   // 1%

            // B. Defender Attribute Modifiers
            const defBlk = defender.attr.blk;
            const defVert = defender.attr.vertical;
            const defHeight = defender.attr.height;
            const defIQ = defender.attr.helpDefIq;
            
            // Height bonus: +1% per 10cm over 200cm
            const heightBonus = Math.max(0, (defHeight - 200) * 0.001); 
            // Stat bonus: Average impact
            const statBonus = ((defBlk - 70) * 0.001) + ((defVert - 70) * 0.0005);
            
            blockProb += (heightBonus + statBonus);

            // C. ELITE THRESHOLD BONUSES (Blocker Archetypes)
            let archetypeBonus = 0;

            // Type 1: "The Wall" (Elite Rating)
            if (defBlk >= 97) {
                archetypeBonus = 0.12; 
            } 
            // Type 2: "The Alien" (Length Freak)
            else if (defHeight >= 216 && defBlk >= 80) {
                archetypeBonus = 0.10;
            }
            // Type 3: "Skywalker" (Athletic Beast)
            else if (defVert >= 95 && defBlk >= 75) {
                archetypeBonus = 0.08;
            }
            // Type 4: "Defensive Anchor" (High IQ Positioning)
            else if (defIQ >= 92 && defBlk >= 80) {
                archetypeBonus = 0.06;
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
            else if ((preferredZone === 'Rim' || preferredZone === 'Paint') && !isBlock) {
                 // Find best blocker on team who isn't the primary defender
                 const potentialHelpers = defTeam.onCourt.filter(p => p.playerId !== defender.playerId);
                 potentialHelpers.sort((a, b) => b.attr.blk - a.attr.blk);
                 const helper = potentialHelpers[0];

                 if (helper) {
                     // Helper base chance is lower because they have to rotate
                     let helpChance = 0.02; 
                     // Helper attributes
                     if (helper.attr.blk >= 90) helpChance += 0.04;
                     if (helper.archetypes.rimProtector > 80) helpChance += 0.03;
                     
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
        type: 'score', offTeam, defTeam, actor, assister: secondaryActor, points, zone: preferredZone, playType: selectedPlayType, isAndOne: false, matchupEffect: shotContext.matchupEffect, isAceTarget: shotContext.isAceTarget, isSwitch, isMismatch: shotContext.isMismatch, isBotchedSwitch
    };
}

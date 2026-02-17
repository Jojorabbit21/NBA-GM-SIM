
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

    // 4. Turnover Check (Ball Movement Slider)
    // High ball movement (Pass heavy) slightly increases intercept risk but opens floor
    const passRisk = sliders.ballMovement * 0.01;
    const pressureRisk = defIntensity * 0.02;
    const tovChance = 0.10 + passRisk + pressureRisk;

    if (Math.random() < tovChance && Math.random() > (actor.attr.handling / 150)) {
        return {
            type: 'turnover', offTeam, defTeam, actor, defender, isSteal: true, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch
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
    
    // ... (Rest of logic: Block, Rebound, etc. using updated sliders)
    // Rebound Resolution
    if (!isScore) {
        const { player: rebounder } = resolveRebound(state.home, state.away, actor.playerId);
        return {
            type: 'miss', offTeam, defTeam, actor, defender, rebounder, points: 0, zone: preferredZone, playType: selectedPlayType, isBlock: false, isAndOne: false, matchupEffect: shotContext.matchupEffect, isAceTarget: shotContext.isAceTarget, isSwitch, isMismatch: shotContext.isMismatch
        };
    }

    const points = preferredZone === '3PT' ? 3 : 2;
    return {
        type: 'score', offTeam, defTeam, actor, assister: secondaryActor, points, zone: preferredZone, playType: selectedPlayType, isAndOne: false, matchupEffect: shotContext.matchupEffect, isAceTarget: shotContext.isAceTarget, isSwitch, isMismatch: shotContext.isMismatch, isBotchedSwitch
    };
}

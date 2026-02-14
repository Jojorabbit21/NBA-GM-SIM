
import { GameState, PossessionResult, LivePlayer, TeamState } from './pbpTypes';
import { resolvePlayAction } from './playTypes';
import { calculateHitRate, flattenPlayer } from './flowEngine';
import { resolveRebound } from './reboundLogic';
import { calculatePlaymakingStats } from '../playmakingSystem';
import { SIM_CONFIG } from '../../config/constants';
import { OFFENSE_STRATEGY_CONFIG } from './strategyMap';
import { PlayType } from '../../../../types';

/**
 * Determines who guards the current actor.
 * Includes Logic for Switch Defense & Communication Breakdowns.
 */
function identifyDefender(
    defTeam: TeamState, 
    actor: LivePlayer, 
    secondaryActor: LivePlayer | undefined, 
    playType: PlayType
): { defender: LivePlayer, isSwitch: boolean, isBotchedSwitch: boolean } {
    
    // 1. Default Defender (Positional Match)
    let primaryDefender = defTeam.onCourt.find(p => p.position === actor.position);
    // Fallback: If exact match missing (e.g. 2 PGs on court), pick random or closest
    if (!primaryDefender) {
        // Fallback logic: Match Guard with Guard, Big with Big if possible
        const isActorGuard = ['PG', 'SG'].includes(actor.position);
        primaryDefender = defTeam.onCourt.find(p => isActorGuard ? ['PG', 'SG'].includes(p.position) : ['PF', 'C'].includes(p.position));
    }
    // Hard Fallback
    if (!primaryDefender) primaryDefender = defTeam.onCourt[Math.floor(Math.random() * 5)];

    // 2. Check for Switch Situation
    const isScreenPlay = ['PnR_Handler', 'PnR_Roll', 'PnR_Pop', 'Handoff'].includes(playType);
    const defTactic = defTeam.tactics.defenseTactics[0]; // Primary tactic
    
    // Zone Defense does NOT switch (they guard areas)
    if (!isScreenPlay || defTactic === 'ZoneDefense' || !secondaryActor) {
        return { defender: primaryDefender, isSwitch: false, isBotchedSwitch: false };
    }

    // 3. Determine Switch Probability based on Intensity & Tactic
    // Base chance depends on slider (1-10)
    const intensity = defTeam.tactics.sliders.defIntensity;
    let switchChance = 0.1 + (intensity * 0.05); // 15% to 60%

    if (defTactic === 'AceStopper' || defTactic === 'ManToManPerimeter') {
        switchChance += 0.15; // More likely to switch to stay tight
    }

    if (Math.random() > switchChance) {
        return { defender: primaryDefender, isSwitch: false, isBotchedSwitch: false };
    }

    // 4. Execute Switch
    // Find the defender who was guarding the screener (secondaryActor)
    let switchDefender = defTeam.onCourt.find(p => p.position === secondaryActor.position);
    // Fallback if positional match fails
    if (!switchDefender) switchDefender = defTeam.onCourt.find(p => p.playerId !== primaryDefender!.playerId);
    
    if (!switchDefender) return { defender: primaryDefender, isSwitch: false, isBotchedSwitch: false };

    // 5. Check for Communication Breakdown (Botched Switch)
    // Low HelpIQ increases chance of both defenders messing up
    const avgIq = (primaryDefender.attr.helpDefIq + switchDefender.attr.helpDefIq) / 2;
    // Breakdown chance: (100 - avgIQ) * 0.4. e.g. IQ 70 -> 12% chance.
    const breakdownChance = Math.max(0, (100 - avgIq) * 0.003); 
    
    const isBotched = Math.random() < breakdownChance;

    return { 
        defender: switchDefender, 
        isSwitch: true, 
        isBotchedSwitch: isBotched 
    };
}


/**
 * Determines the outcome of a single possession.
 */
export function simulatePossession(state: GameState): PossessionResult {
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = state.possession === 'home' ? state.away : state.home;

    // 1. Resolve Play Action (Who does what?)
    const tacticName = offTeam.tactics.offenseTactics[0] || 'Balance';
    const strategy = OFFENSE_STRATEGY_CONFIG[tacticName];
    
    let selectedPlayType: PlayType = 'Iso';
    
    if (strategy && strategy.playDistribution) {
        const rand = Math.random();
        let cumulative = 0;
        for (const [pType, prob] of Object.entries(strategy.playDistribution)) {
            cumulative += prob;
            if (rand < cumulative) {
                selectedPlayType = pType as PlayType;
                break;
            }
        }
    } else {
        const playTypes = ['Iso', 'PnR_Handler', 'PnR_Roll', 'CatchShoot', 'PostUp', 'Cut'] as const;
        selectedPlayType = playTypes[Math.floor(Math.random() * playTypes.length)];
    }

    const playCtx = resolvePlayAction(offTeam, selectedPlayType);
    const { actor, secondaryActor, preferredZone, shotType, bonusHitRate } = playCtx;

    // 2. Identify Defender (with Switch Logic)
    const { defender, isSwitch, isBotchedSwitch } = identifyDefender(defTeam, actor, secondaryActor, selectedPlayType);

    // 3. Defensive Foul Check (Non-Shooting)
    const defIntensity = defTeam.tactics.sliders.defIntensity;
    const baseFoulChance = 0.08 + ((defIntensity - 5) * 0.015);
    const disciplineFactor = (100 - defender.attr.defConsist) / 200; 
    
    const foulCount = defender.pf;
    const FT_CONFIG = SIM_CONFIG.FOUL_TROUBLE.PROB_MOD;
    let foulTroubleMod = 1.0;
    
    if (foulCount >= 5) foulTroubleMod = FT_CONFIG[5];
    else if (foulCount === 4) foulTroubleMod = FT_CONFIG[4];
    else if (foulCount === 3) foulTroubleMod = FT_CONFIG[3];

    const finalFoulChance = (baseFoulChance + (disciplineFactor * 0.05)) * foulTroubleMod;

    if (Math.random() < finalFoulChance) {
        return {
            type: 'foul',
            offTeam, defTeam, actor,
            defender: defender,
            points: 0,
            isAndOne: false,
            playType: selectedPlayType,
            isSwitch
        };
    }

    // 4. Turnover Check
    const pmStats = calculatePlaymakingStats(
        flattenPlayer(actor), 
        48.0, 
        15,   
        offTeam.tactics.sliders,
        offTeam.tactics.offenseTactics[0], 
        false, 
        undefined 
    );
    
    const expectedTovPerGame = pmStats.tov; 
    let tovProbability = expectedTovPerGame / 100;
    const pressure = (defender.attr.stl * 0.7 + defender.attr.perDef * 0.3) / 100; 
    const pressureFactor = pressure * 0.08; 
    
    tovProbability += pressureFactor;
    tovProbability *= 1.5;

    // Switch Pressure: Sometimes switches cause confusion for offense too
    if (isSwitch) tovProbability += 0.02;

    const finalTovChance = Math.max(0.01, Math.min(0.40, tovProbability));

    if (Math.random() < finalTovChance) {
        const stealChance = (defender.attr.stl / 100) * 0.8;
        const isSteal = Math.random() < stealChance;
        
        return {
            type: 'turnover',
            offTeam, defTeam, actor,
            defender: isSteal ? defender : undefined,
            isSteal,
            points: 0,
            isAndOne: false,
            playType: selectedPlayType,
            isSwitch
        };
    }

    // 5. Shot Calculation
    const shotContext = calculateHitRate(
        actor, defender, defTeam, 
        selectedPlayType, preferredZone, 
        offTeam.tactics.sliders.pace,
        offTeam.tactics.offenseTactics[0], 
        bonusHitRate, 
        1.0, 1.0,
        offTeam.acePlayerId,
        isBotchedSwitch, // Pass breakdown info
        isSwitch         // Pass switch info
    );

    const hitRate = shotContext.rate;
    const isScore = Math.random() < hitRate;
    
    // Check Block
    let isBlock = false;
    if (!isScore && preferredZone !== '3PT') {
        const blockMod = foulTroubleMod; 
        const blockChance = ((defender.attr.blk + defender.attr.vertical) / 800) * blockMod; 
        if (Math.random() < blockChance) isBlock = true;
    }

    // Shooting Foul Check
    let shootingFoulChance = (actor.attr.drFoul * 0.7 + (100 - defender.attr.foulTendency) * 0.3) / 600;
    if (preferredZone === 'Rim') shootingFoulChance *= 2.0;
    // Mismatches often lead to fouls
    if (shotContext.isMismatch) shootingFoulChance *= 1.2;

    shootingFoulChance *= foulTroubleMod;
    
    const isShootingFoul = Math.random() < shootingFoulChance;

    // 6. Result Generation
    if (isScore) {
        const points = preferredZone === '3PT' ? 3 : 2;
        const isAndOne = isShootingFoul; 

        return {
            type: 'score',
            offTeam, defTeam, actor, assister: secondaryActor,
            defender: isAndOne ? defender : undefined,
            points: points as 2|3,
            zone: preferredZone,
            playType: selectedPlayType,
            shotType,
            isAndOne,
            matchupEffect: shotContext.matchupEffect,
            isAceTarget: shotContext.isAceTarget,
            isSwitch,
            isMismatch: shotContext.isMismatch,
            isBotchedSwitch
        };
    } else {
        if (isShootingFoul) {
             return {
                type: 'freethrow',
                offTeam, defTeam, actor,
                defender: defender,
                points: 0,
                isAndOne: false,
                playType: selectedPlayType,
                matchupEffect: shotContext.matchupEffect,
                isAceTarget: shotContext.isAceTarget,
                isSwitch,
                isMismatch: shotContext.isMismatch
            };
        }

        const { player: rebounder } = resolveRebound(state.home, state.away, actor.playerId);
        
        return {
            type: 'miss', 
            offTeam, defTeam, actor,
            defender: isBlock ? defender : undefined,
            rebounder,
            points: 0,
            zone: preferredZone,
            playType: selectedPlayType,
            shotType,
            isBlock,
            isAndOne: false,
            matchupEffect: shotContext.matchupEffect,
            isAceTarget: shotContext.isAceTarget,
            isSwitch,
            isMismatch: shotContext.isMismatch
        };
    }
}


import { GameState, PossessionResult, LivePlayer, TeamState } from './pbpTypes';
import { resolvePlayAction } from './playTypes';
import { calculateHitRate, flattenPlayer } from './flowEngine';
import { resolveRebound } from './reboundLogic';
import { calculatePlaymakingStats } from '../playmakingSystem';
import { calculateFoulStats } from '../foulSystem'; 
import { SIM_CONFIG } from '../../config/constants';

/**
 * Determines the outcome of a single possession.
 */
export function simulatePossession(state: GameState): PossessionResult {
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = state.possession === 'home' ? state.away : state.home;

    // 1. Resolve Play Action (Who does what?)
    const playTypes = ['Iso', 'PnR_Handler', 'PnR_Roll', 'CatchShoot', 'PostUp', 'Cut'] as const;
    const selectedPlayType = playTypes[Math.floor(Math.random() * playTypes.length)];

    const playCtx = resolvePlayAction(offTeam, selectedPlayType);
    const { actor, secondaryActor, preferredZone, shotType, bonusHitRate } = playCtx;

    // 2. Identify Defender
    let defender = defTeam.onCourt.find(p => p.position === actor.position);
    if (!defender) defender = defTeam.onCourt[Math.floor(Math.random() * 5)];

    // 3. Defensive Foul Check (Non-Shooting / Reach-in / Illegal Screen etc.)
    // Base 9% chance for a defensive foul on the floor (not shooting)
    // Adjusted by Def Intensity slider (5 is mid)
    const defIntensity = defTeam.tactics.sliders.defIntensity;
    const baseFoulChance = 0.08 + ((defIntensity - 5) * 0.015);
    
    // Individual Discipline Factor
    // Low discipline / High aggression increases foul chance
    const disciplineFactor = (100 - defender.attr.defConsist) / 200; // 0.0 to 0.5
    
    // [New] Foul Trouble Modifier (Probability Reduction)
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
            playType: selectedPlayType
        };
    }

    // 4. Turnover Check
    const pmStats = calculatePlaymakingStats(
        flattenPlayer(actor), 
        1.0, 
        1, 
        offTeam.tactics.sliders,
        false, 
        undefined 
    );
    
    const tovChance = Math.max(0.05, Math.min(0.25, (pmStats.tov / 100))); 
    if (Math.random() < tovChance) {
        const isSteal = Math.random() < 0.6;
        return {
            type: 'turnover',
            offTeam, defTeam, actor,
            defender: isSteal ? defender : undefined,
            isSteal,
            points: 0,
            isAndOne: false,
            playType: selectedPlayType
        };
    }

    // 5. Shot Calculation
    const hitRate = calculateHitRate(
        actor, defender, defTeam, 
        selectedPlayType, preferredZone, 
        offTeam.tactics.sliders.pace, 
        bonusHitRate, 
        1.0, 1.0 
    );

    const isScore = Math.random() < hitRate;
    
    // Check Block
    let isBlock = false;
    if (!isScore && preferredZone !== '3PT') {
        // [Update] Apply foul trouble logic to blocks too (less aggressive contests)
        const blockMod = foulTroubleMod; // Re-use the probability modifier as block aggression modifier
        const blockChance = ((defender.attr.blk + defender.attr.vertical) / 800) * blockMod; 
        if (Math.random() < blockChance) isBlock = true;
    }

    // Shooting Foul Check (And-1 or Missed Shot Foul)
    // Higher probability if driving to rim.
    let shootingFoulChance = (actor.attr.drFoul * 0.7 + (100 - defender.attr.foulTendency) * 0.3) / 600;
    if (preferredZone === 'Rim') shootingFoulChance *= 2.0;
    
    // [Update] Apply Foul Trouble Modifier to shooting fouls as well
    shootingFoulChance *= foulTroubleMod;
    
    const isShootingFoul = Math.random() < shootingFoulChance;

    // 6. Result Generation
    if (isScore) {
        const points = preferredZone === '3PT' ? 3 : 2;
        // And-1?
        const isAndOne = isShootingFoul; 

        return {
            type: 'score',
            offTeam, defTeam, actor, assister: secondaryActor,
            defender: isAndOne ? defender : undefined, // Assign defender if And-1 for PF count
            points: points as 2|3,
            zone: preferredZone,
            playType: selectedPlayType,
            shotType,
            isAndOne
        };
    } else {
        // Miss
        // If shooting foul on miss -> It's a foul result (Free Throws)
        // For simulation simplicity in PBP log, we treat it as 'freethrow' type or just 'foul' that leads to points?
        // Let's treat it as 'freethrow' type which implies points from line.
        if (isShootingFoul) {
             return {
                type: 'freethrow',
                offTeam, defTeam, actor,
                defender: defender,
                points: 0, // Points added in applyPossessionResult via FT calculation
                isAndOne: false,
                playType: selectedPlayType
            };
        }

        // Clean Miss -> Rebound
        const { player: rebounder, type: rebType } = resolveRebound(state.home, state.away, actor.playerId);
        
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
            isAndOne: false
        };
    }
}


import { GameState, PossessionResult, LivePlayer, TeamState } from './pbpTypes';
import { resolvePlayAction } from './playTypes';
import { calculateHitRate, flattenPlayer } from './flowEngine';
import { resolveRebound } from './reboundLogic';
import { calculatePlaymakingStats } from '../playmakingSystem';

/**
 * Determines the outcome of a single possession.
 * 1. Who attacks?
 * 2. What play?
 * 3. Matchup?
 * 4. Score/Miss/TO/Foul?
 */
export function simulatePossession(state: GameState): PossessionResult {
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = state.possession === 'home' ? state.away : state.home;

    // 1. Resolve Play Action (Who does what?)
    // Basic logic: Select play based on tactics, then select actor based on Archetypes
    // Randomly pick a play type based on distribution
    const tacticName = offTeam.tactics.offenseTactics[0] || 'Balance';
    // Ideally we pass TacticConfig here, but for now we simplify PlayType selection logic in resolvePlayAction
    // Need to select a PlayType. Let's create a simple weighted selector or rely on resolvePlayAction's internal fallback?
    // Actually resolvePlayAction takes a specific PlayType.
    // Let's pick a PlayType randomly first.
    const playTypes = ['Iso', 'PnR_Handler', 'PnR_Roll', 'CatchShoot', 'PostUp', 'Cut'] as const;
    const selectedPlayType = playTypes[Math.floor(Math.random() * playTypes.length)]; // Simplified for now, can be weighted later

    const playCtx = resolvePlayAction(offTeam, selectedPlayType);
    const { actor, secondaryActor, preferredZone, shotType, bonusHitRate } = playCtx;

    // 2. Identify Defender (Simple positional matchup for now)
    // Find defender with matching position or fallback
    let defender = defTeam.onCourt.find(p => p.position === actor.position);
    if (!defender) defender = defTeam.onCourt[Math.floor(Math.random() * 5)]; // Switch/Help

    // 3. Turnover Check
    // Use playmakingSystem logic
    // We approximate "MP" influence by passing 1.0 (since this is 1 possession)
    const pmStats = calculatePlaymakingStats(
        flattenPlayer(actor), 
        1.0, // normalized MP
        1, // 1 FGA equivalent
        offTeam.tactics.sliders,
        false, // Is Ace Target? (TODO: Link this)
        undefined // Stopper
    );
    
    // 0.15 is arbitrary base TO chance per possession, scaled by stats
    // This is a probabilistic check
    const tovChance = Math.max(0.05, Math.min(0.25, (pmStats.tov / 100))); 
    if (Math.random() < tovChance) {
        // Turnover!
        const isSteal = Math.random() < 0.6; // 60% of TOs are steals
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

    // 4. Foul Check (Shooting Foul)
    // Based on DrawFoul vs FoulTendency
    // Base 15% foul rate roughly
    let foulChance = (actor.attr.drFoul * 0.7 + (100 - defender.attr.foulTendency) * 0.3) / 500;
    if (preferredZone === 'Rim') foulChance *= 1.5;
    
    if (Math.random() < foulChance) {
        // Shooting Foul!
        // Determine if it's an And-1 later in shot calc? 
        // For simplicity, let's say 20% of fouls are And-1s if shot is made.
        // We will proceed to shot calculation, but flag potential FTs.
    }

    // 5. Shot Calculation
    const hitRate = calculateHitRate(
        actor, defender, defTeam, 
        selectedPlayType, preferredZone, 
        offTeam.tactics.sliders.pace, 
        bonusHitRate, 
        1.0, 1.0 // Efficiencies placeholders
    );

    const isScore = Math.random() < hitRate;
    
    // Check Block
    let isBlock = false;
    if (!isScore && preferredZone !== '3PT') {
        // Block chance based on defender's block rating
        const blockChance = (defender.attr.blk + defender.attr.vertical) / 800; // rough calc
        if (Math.random() < blockChance) isBlock = true;
    }

    // 6. Result Generation
    if (isScore) {
        const points = preferredZone === '3PT' ? 3 : 2;
        // And-1 check?
        const isAndOne = Math.random() < (foulChance * 0.3); // 30% of fouls on made shots

        return {
            type: 'score',
            offTeam, defTeam, actor, assister: secondaryActor,
            points: points as 2|3,
            zone: preferredZone,
            playType: selectedPlayType,
            shotType,
            isAndOne
        };
    } else {
        // Miss -> Rebound
        // Determine Rebounder
        const { player: rebounder, type: rebType } = resolveRebound(state.home, state.away, actor.playerId);
        
        return {
            type: 'miss', // Miss implies rebound will happen
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

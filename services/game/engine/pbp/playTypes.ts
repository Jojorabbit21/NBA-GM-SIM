
import { PlayType } from '../../../../types';
import { LivePlayer, TeamState } from './pbpTypes';
import { ArchetypeRatings } from './archetypeSystem';

// ==========================================================================================
//  🏀 PLAY TYPE SYSTEM
//  Specific tactical actions and their execution logic.
// ==========================================================================================

export interface PlayContext {
    playType: PlayType;
    actor: LivePlayer;
    secondaryActor?: LivePlayer; // Screener, Passer, etc.
    preferredZone: 'Rim' | 'Paint' | 'Mid' | '3PT';
    shotType: 'Dunk' | 'Layup' | 'Jumper' | 'Pullup' | 'Hook' | 'CatchShoot';
    bonusHitRate: number; // Tactic success bonus
}

/**
 * Executes the logic to select the best actor and setup the play context.
 */
export function resolvePlayAction(team: TeamState, playType: PlayType): PlayContext {
    const players = team.onCourt;

    // [Fix] Weighted Random Selection instead of "Winner Takes All"
    // This prevents superstars from taking 100% of shots.
    const pickWeightedActor = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
        let pool = players;
        if (excludeId) pool = pool.filter(p => p.playerId !== excludeId);
        
        // 1. Calculate Score & Raise to Power (to emphasize skill gap but allow variance)
        // Power of 2.0 makes 90 rated player significantly more likely than 70, but not guaranteed.
        const candidates = pool.map(p => {
            const rawScore = criteria(p);
            // Ensure minimum weight of 1 to prevent errors
            const weight = Math.pow(Math.max(1, rawScore), 2.5); 
            return { p, weight };
        });

        // 2. Total Weight
        const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);

        // 3. Random Pick (Roulette Wheel)
        let random = Math.random() * totalWeight;
        
        for (const c of candidates) {
            random -= c.weight;
            if (random <= 0) return c.p;
        }
        
        // Fallback
        return candidates[0].p;
    };

    switch (playType) {
        case 'Iso': {
            // Best Iso Scorer (Handling + Agility + Shot Creation)
            const actor = pickWeightedActor(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);
            return {
                playType,
                actor,
                preferredZone: 'Mid',
                shotType: 'Pullup',
                bonusHitRate: 0.05 // Iso is tough, low bonus
            };
        }
        case 'PnR_Handler': {
            // Best Handler
            const actor = pickWeightedActor(p => p.archetypes.handler);
            const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId);
            return {
                playType,
                actor,
                secondaryActor: screener,
                preferredZone: 'Mid', // Pullup off screen or drive
                shotType: 'Pullup',
                bonusHitRate: 0.10 // PnR creates advantage
            };
        }
        case 'PnR_Roll': {
            // Handler passes to Roller
            const screener = pickWeightedActor(p => p.archetypes.roller + p.archetypes.screener * 0.5);
            const handler = pickWeightedActor(p => p.archetypes.handler, screener.playerId);
            return {
                playType,
                actor: screener, // Finisher
                secondaryActor: handler, // Assister
                preferredZone: 'Rim',
                shotType: 'Dunk', // or Layup
                bonusHitRate: 0.15 // High percentage shot
            };
        }
        case 'PnR_Pop': {
            // Handler passes to Popper
            const popper = pickWeightedActor(p => p.archetypes.popper);
            const handler = pickWeightedActor(p => p.archetypes.handler, popper.playerId);
            return {
                playType,
                actor: popper,
                secondaryActor: handler,
                preferredZone: '3PT',
                shotType: 'CatchShoot',
                bonusHitRate: 0.08
            };
        }
        case 'PostUp': {
            // Best Post Scorer
            const actor = pickWeightedActor(p => p.archetypes.postScorer);
            return {
                playType,
                actor,
                preferredZone: 'Paint',
                shotType: 'Hook', // or Fadeaway
                bonusHitRate: 0.05
            };
        }
        case 'CatchShoot': {
            // Best Spacer
            const actor = pickWeightedActor(p => p.archetypes.spacer);
            const passer = pickWeightedActor(p => p.archetypes.handler + p.archetypes.connector, actor.playerId);
            return {
                playType,
                actor,
                secondaryActor: passer,
                preferredZone: '3PT',
                shotType: 'CatchShoot',
                bonusHitRate: 0.12 // Assisted shot
            };
        }
        case 'Cut': {
            // Best Driver/Cutter (Off-ball movement)
            const actor = pickWeightedActor(p => p.archetypes.driver + p.attr.shotIq * 0.5); 
            const passer = pickWeightedActor(p => p.archetypes.connector, actor.playerId);
            return {
                playType,
                actor,
                secondaryActor: passer,
                preferredZone: 'Rim',
                shotType: 'Layup',
                bonusHitRate: 0.15 // Easy bucket
            };
        }
        case 'Handoff': {
            // Shooter getting ball from Big
            const actor = pickWeightedActor(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
            const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId);
            return {
                playType,
                actor,
                secondaryActor: big,
                preferredZone: 'Mid',
                shotType: 'CatchShoot', // or Drive
                bonusHitRate: 0.10
            };
        }
        case 'Transition': {
            // Fast break
            const actor = pickWeightedActor(p => p.attr.speed + p.archetypes.driver);
            return {
                playType,
                actor,
                preferredZone: 'Rim',
                shotType: 'Layup',
                bonusHitRate: 0.20 // Transition is efficient
            };
        }
        case 'Putback': {
            // Second Chance points (Rebounder immediately goes up)
            // Prioritize players with high Rebound & Inside scoring
            const actor = pickWeightedActor(p => p.attr.reb * 0.6 + p.attr.ins * 0.4);
            return {
                playType,
                actor,
                preferredZone: 'Rim',
                shotType: 'Layup', // Or Dunk
                bonusHitRate: 0.25 // High bonus as defense is scrambling
            };
        }
        default: {
            // Fallback: Random Iso
            const actor = players[Math.floor(Math.random() * players.length)];
            return { playType: 'Iso', actor, preferredZone: 'Mid', shotType: 'Jumper', bonusHitRate: 0 };
        }
    }
}

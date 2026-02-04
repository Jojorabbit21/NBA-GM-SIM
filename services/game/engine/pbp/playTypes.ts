
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

    // Helper to pick best fit player based on criteria
    const pickBest = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
        let pool = players;
        if (excludeId) pool = pool.filter(p => p.playerId !== excludeId);
        
        // Add some randomness so the best player doesn't take 100% of shots
        const weighted = pool.map(p => ({ 
            p, 
            score: criteria(p) * (0.8 + Math.random() * 0.4) // +/- 20% variance
        }));
        
        return weighted.sort((a, b) => b.score - a.score)[0].p;
    };

    switch (playType) {
        case 'Iso': {
            // Best Iso Scorer (Handling + Agility + Shot Creation)
            const actor = pickBest(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);
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
            const actor = pickBest(p => p.archetypes.handler);
            const screener = pickBest(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId);
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
            const screener = pickBest(p => p.archetypes.roller + p.archetypes.screener * 0.5);
            const handler = pickBest(p => p.archetypes.handler, screener.playerId);
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
            const popper = pickBest(p => p.archetypes.popper);
            const handler = pickBest(p => p.archetypes.handler, popper.playerId);
            return {
                playType,
                actor,
                secondaryActor: handler,
                preferredZone: '3PT',
                shotType: 'CatchShoot',
                bonusHitRate: 0.08
            };
        }
        case 'PostUp': {
            // Best Post Scorer
            const actor = pickBest(p => p.archetypes.postScorer);
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
            const actor = pickBest(p => p.archetypes.spacer);
            const passer = pickBest(p => p.archetypes.handler + p.archetypes.connector, actor.playerId);
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
            // [Fix] Changed p.attr.iq to p.attr.shotIq as 'iq' does not exist in attribute map
            const actor = pickBest(p => p.archetypes.driver + p.attr.shotIq * 0.5); 
            const passer = pickBest(p => p.archetypes.connector, actor.playerId);
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
            const actor = pickBest(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
            const big = pickBest(p => p.archetypes.screener, actor.playerId);
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
            const actor = pickBest(p => p.attr.speed + p.archetypes.driver);
            return {
                playType,
                actor,
                preferredZone: 'Rim',
                shotType: 'Layup',
                bonusHitRate: 0.20 // Transition is efficient
            };
        }
        default: {
            // Fallback: Random Iso
            const actor = players[0];
            return { playType: 'Iso', actor, preferredZone: 'Mid', shotType: 'Jumper', bonusHitRate: 0 };
        }
    }
}
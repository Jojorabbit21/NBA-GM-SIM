
import { PlayType } from '../../../../types';
import { LivePlayer, TeamState } from './pbpTypes';
import { getTeamOptionRanks, getContextualMultiplier } from './usageSystem';

// ==========================================================================================
//  🏀 PLAY TYPE SYSTEM
//  Specific tactical actions and their execution logic.
//  Updated with Usage Priority System (Option Ranks) & Balanced Hit Rates
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

    // [New] 1. Calculate Option Ranks for current lineup (1~5)
    const optionRanks = getTeamOptionRanks(team);

    // [Fix] Weighted Random Selection with Option System Integration
    const pickWeightedActor = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
        let pool = players;
        if (excludeId) pool = pool.filter(p => p.playerId !== excludeId);
        
        const candidates = pool.map(p => {
            // A. Base Skill Score (Existing Logic)
            const rawScore = criteria(p);
            
            // B. Option Multiplier (New Logic)
            const rank = optionRanks.get(p.playerId) || 3;
            const usageMultiplier = getContextualMultiplier(rank, playType);

            // C. Final Weight = Skill^2.5 * OptionMultiplier
            // Power of 2.5 emphasizes skill gap, OptionMultiplier enforces hierarchy
            const weight = Math.pow(Math.max(1, rawScore), 2.5) * usageMultiplier;

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
            
            const lovesThree = actor.attr.threeVal >= 80;
            const takeThree = lovesThree && Math.random() < 0.55; 

            return {
                playType,
                actor,
                preferredZone: takeThree ? '3PT' : 'Mid',
                shotType: 'Pullup',
                bonusHitRate: 0.00 // [Down] 0.02 -> 0.00 (Pure Skill)
            };
        }
        case 'PnR_Handler': {
            // Best Handler
            const actor = pickWeightedActor(p => p.archetypes.handler);
            const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId);
            
            const lovesThree = actor.attr.threeVal >= 78;
            const takeThree = lovesThree && Math.random() < 0.45;

            return {
                playType,
                actor,
                secondaryActor: screener,
                preferredZone: takeThree ? '3PT' : 'Mid', 
                shotType: 'Pullup',
                bonusHitRate: 0.03 // [Down] 0.05 -> 0.03
            };
        }
        case 'PnR_Roll': {
            // Handler passes to Roller (Finisher)
            const screener = pickWeightedActor(p => p.archetypes.roller + p.archetypes.screener * 0.5);
            const handler = pickWeightedActor(p => p.archetypes.handler, screener.playerId);
            return {
                playType,
                actor: screener, // Finisher
                secondaryActor: handler, // Assister
                preferredZone: 'Rim',
                shotType: 'Dunk',
                bonusHitRate: 0.06 // [Down] 0.08 -> 0.06
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
                bonusHitRate: 0.03 // [Down] 0.04 -> 0.03
            };
        }
        case 'PostUp': {
            // Best Post Scorer (Usually Rank 1-2 Bigs)
            const actor = pickWeightedActor(p => p.archetypes.postScorer);
            return {
                playType,
                actor,
                preferredZone: 'Paint',
                shotType: 'Hook', 
                bonusHitRate: 0.01 // [Down] 0.03 -> 0.01
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
                bonusHitRate: 0.05 // [Down] 0.06 -> 0.05
            };
        }
        case 'Cut': {
            // Best Driver/Cutter
            const actor = pickWeightedActor(p => p.archetypes.driver + p.attr.shotIq * 0.5); 
            const passer = pickWeightedActor(p => p.archetypes.connector, actor.playerId);
            return {
                playType,
                actor,
                secondaryActor: passer,
                preferredZone: 'Rim',
                shotType: 'Layup',
                bonusHitRate: 0.06 // [Down] 0.08 -> 0.06
            };
        }
        case 'Handoff': {
            // Shooter getting ball from Big
            const actor = pickWeightedActor(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
            const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId);
            
            const lovesThree = actor.attr.threeVal >= 75;
            
            return {
                playType,
                actor,
                secondaryActor: big,
                preferredZone: lovesThree ? '3PT' : 'Mid',
                shotType: 'CatchShoot',
                bonusHitRate: 0.04 // [Down] 0.05 -> 0.04
            };
        }
        case 'Transition': {
            // Fast break
            const actor = pickWeightedActor(p => p.attr.speed + p.archetypes.driver);
            
            const lovesThree = actor.attr.threeVal >= 82;
            const takeThree = lovesThree && Math.random() < 0.40;

            return {
                playType,
                actor,
                preferredZone: takeThree ? '3PT' : 'Rim',
                shotType: takeThree ? 'Pullup' : 'Layup',
                bonusHitRate: 0.10 // [Down] 0.12 -> 0.10
            };
        }
        case 'Putback': {
            // Second Chance
            const actor = pickWeightedActor(p => p.attr.reb * 0.6 + p.attr.ins * 0.4);
            return {
                playType,
                actor,
                preferredZone: 'Rim',
                shotType: 'Layup', 
                bonusHitRate: 0.12 // [Down] 0.15 -> 0.12
            };
        }
        default: {
            const actor = players[Math.floor(Math.random() * players.length)];
            return { playType: 'Iso', actor, preferredZone: 'Mid', shotType: 'Jumper', bonusHitRate: 0 };
        }
    }
}

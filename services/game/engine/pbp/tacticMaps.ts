
import { OffenseTactic, DefenseTactic } from '../../../../types';
import { ArchetypeRatings } from './archetypeSystem';

interface TacticConfig {
    // Usage Weights: Which archetypes are prioritized to take action?
    usage: Partial<Record<keyof ArchetypeRatings, number>>;
    
    // Fit Weights: Which archetypes contribute to Team Efficiency?
    fit: Partial<Record<keyof ArchetypeRatings, number>>;
    
    // Pace Modifier: -5 (Slow) to +5 (Fast). Only for Offense.
    paceMod?: number;

    // Shot Selection Bias: Modifiers for shot types [Rim, Mid, 3PT]
    shotBias?: { rim: number; mid: number; three: number };
}

export const OFFENSE_TACTIC_CONFIG: Record<OffenseTactic, TacticConfig> = {
    'Balance': {
        usage: { handler: 2, isoScorer: 2, postScorer: 1.5, driver: 1.5 },
        fit: { connector: 2, handler: 1, spacer: 1 },
        paceMod: 0,
        shotBias: { rim: 1.0, mid: 1.0, three: 1.0 }
    },
    'PaceAndSpace': {
        usage: { handler: 3, spacer: 2, driver: 2 }, 
        fit: { spacer: 3, handler: 2, popper: 1 }, 
        paceMod: 3, 
        shotBias: { rim: 1.1, mid: 0.4, three: 1.5 } 
    },
    'PerimeterFocus': {
        usage: { handler: 3, isoScorer: 2, spacer: 2 }, 
        fit: { screener: 2, handler: 2, spacer: 1 }, 
        paceMod: 1,
        shotBias: { rim: 0.8, mid: 1.2, three: 1.2 } 
    },
    'PostFocus': {
        usage: { postScorer: 4, roller: 2 }, 
        fit: { postScorer: 3, spacer: 1, connector: 2 }, 
        paceMod: -3, 
        shotBias: { rim: 1.3, mid: 1.1, three: 0.6 } 
    },
    'Grind': {
        usage: { isoScorer: 3, postScorer: 2 }, 
        fit: { connector: 2, screener: 2, isoScorer: 2 }, 
        paceMod: -5, 
        shotBias: { rim: 1.0, mid: 1.3, three: 0.7 } 
    },
    'SevenSeconds': {
        usage: { handler: 3, driver: 3, spacer: 2 }, 
        fit: { handler: 2, driver: 2, spacer: 2 }, 
        paceMod: 5, 
        shotBias: { rim: 1.4, mid: 0.2, three: 1.4 } 
    }
};

// Defensive Tactics: Determine WHO contests the shot (Usage) and HOW WELL the team defends (Fit)
export const DEFENSE_TACTIC_CONFIG: Record<DefenseTactic, TacticConfig> = {
    'ManToManPerimeter': {
        // Active perimeter defenders and connectors (helpers) contest more
        usage: { perimLock: 3, connector: 2, driver: 1 },
        // Need fast, agile defenders
        fit: { perimLock: 3, connector: 2, driver: 1 } // Replaced 'speed' with 'driver' as proxy for speed/agility
    },
    'ZoneDefense': {
        // Bigs contest more in zone (funneling inside)
        usage: { rimProtector: 4, rebounder: 2 },
        // Need length and discipline
        fit: { rimProtector: 3, connector: 2, rebounder: 2 }
    },
    'AceStopper': {
        // The stopper takes the challenge
        usage: { perimLock: 5, rimProtector: 2 },
        // Relies on individual brilliance
        fit: { perimLock: 4, rimProtector: 2 }
    }
};

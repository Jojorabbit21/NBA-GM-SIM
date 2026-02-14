
import { OffenseTactic, DefenseTactic, PlayType } from '../../../../types';
import { ArchetypeRatings } from './archetypeSystem';

interface StrategyConfig {
    // Play Distribution: Probability of calling each play type (Must sum to ~1.0)
    playDistribution: Partial<Record<PlayType, number>>;
    
    // Fit Weights: Which archetypes contribute to Team Efficiency? (Legacy support for efficiency calc)
    fit: Partial<Record<keyof ArchetypeRatings, number>>;
    
    // Pace Modifier: -5 (Slow) to +5 (Fast).
    // [Updated] No longer used for direct time subtraction, but kept for legacy reference if needed.
    paceMod?: number;

    // [New] Base Time per Possession (Seconds)
    baseTime: number;

    // Shot Selection Bias: Modifiers for shot types [Rim, Mid, 3PT]
    shotBias?: { rim: number; mid: number; three: number };
}

// [Update] Adjusted distributions to ensure 3PA/FGA ratio is between 35% and 50%
export const OFFENSE_STRATEGY_CONFIG: Record<OffenseTactic, StrategyConfig> = {
    'Balance': {
        playDistribution: {
            'Iso': 0.15,
            'PnR_Handler': 0.20,
            'PnR_Roll': 0.10,
            'PnR_Pop': 0.10, // Added explicit Pop for spacing
            'PostUp': 0.10,
            'CatchShoot': 0.25, // Increased base 3pt chance
            'Cut': 0.05,
            'Handoff': 0.05
        },
        fit: { connector: 2, handler: 1, spacer: 1 },
        paceMod: 0,
        baseTime: 15.0
    },
    'PaceAndSpace': {
        playDistribution: {
            'CatchShoot': 0.45, // High volume 3s
            'PnR_Handler': 0.15, // Drive & Kick
            'PnR_Pop': 0.15, // Stretch Bigs
            'Iso': 0.10,
            'Cut': 0.10,
            'Transition': 0.05
        },
        fit: { spacer: 3, handler: 2, popper: 1 }, 
        paceMod: 3,
        baseTime: 13.5
    },
    'PerimeterFocus': {
        playDistribution: {
            'PnR_Handler': 0.30,
            'PnR_Roll': 0.15,
            'PnR_Pop': 0.10,
            'Iso': 0.20, // Perimeter Iso
            'CatchShoot': 0.20,
            'Handoff': 0.05
        },
        fit: { screener: 2, handler: 2, spacer: 1 }, 
        paceMod: 1,
        baseTime: 16.0
    },
    'PostFocus': {
        playDistribution: {
            'PostUp': 0.35, // Reduced from 0.50 to allow kick-outs
            'CatchShoot': 0.25, // Kick-out 3s are crucial in modern post play
            'Cut': 0.15,
            'PnR_Handler': 0.15,
            'Iso': 0.10
        },
        fit: { postScorer: 3, spacer: 1, connector: 2 }, 
        paceMod: -3,
        baseTime: 18.0
    },
    'Grind': {
        playDistribution: {
            'Iso': 0.25,
            'PostUp': 0.20,
            'PnR_Handler': 0.20,
            'CatchShoot': 0.20, // Must take open shots even in grind
            'Cut': 0.10,
            'Handoff': 0.05
        },
        fit: { connector: 2, screener: 2, isoScorer: 2 }, 
        paceMod: -5,
        baseTime: 19.5
    },
    'SevenSeconds': {
        playDistribution: {
            'Transition': 0.30, 
            'CatchShoot': 0.30, // Early 3s
            'PnR_Handler': 0.20,
            'PnR_Pop': 0.10,
            'Iso': 0.10
        },
        fit: { handler: 2, driver: 2, spacer: 2 }, 
        paceMod: 5,
        baseTime: 12.0
    }
};

// Defensive Tactics: Determine WHO contests the shot (Usage) and HOW WELL the team defends (Fit)
export const DEFENSE_STRATEGY_CONFIG: Record<DefenseTactic, any> = {
    'ManToManPerimeter': {
        usage: { perimLock: 3, connector: 2, driver: 1 },
        fit: { perimLock: 3, connector: 2, driver: 1 }
    },
    'ZoneDefense': {
        usage: { rimProtector: 4, rebounder: 2 },
        fit: { rimProtector: 3, connector: 2, rebounder: 2 }
    },
    'AceStopper': {
        usage: { perimLock: 5, rimProtector: 2 },
        fit: { perimLock: 4, rimProtector: 2 }
    }
};

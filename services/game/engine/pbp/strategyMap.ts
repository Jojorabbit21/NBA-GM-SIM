
import { OffenseTactic, DefenseTactic, PlayType } from '../../../../types';
import { ArchetypeRatings } from './archetypeSystem';

interface StrategyConfig {
    // Play Distribution: Probability of calling each play type (Must sum to ~1.0)
    playDistribution: Partial<Record<PlayType, number>>;
    
    // Fit Weights: Which archetypes contribute to Team Efficiency? (Legacy support for efficiency calc)
    fit: Partial<Record<keyof ArchetypeRatings, number>>;
    
    // Pace Modifier: -5 (Slow) to +5 (Fast).
    paceMod?: number;
}

export const OFFENSE_STRATEGY_CONFIG: Record<OffenseTactic, StrategyConfig> = {
    'Balance': {
        playDistribution: {
            'Iso': 0.15,
            'PnR_Handler': 0.20,
            'PnR_Roll': 0.15,
            'PostUp': 0.15,
            'CatchShoot': 0.20,
            'Cut': 0.10,
            'Handoff': 0.05
        },
        fit: { connector: 2, handler: 1, spacer: 1 },
        paceMod: 0
    },
    'PaceAndSpace': {
        playDistribution: {
            'CatchShoot': 0.40,
            'PnR_Handler': 0.20,
            'PnR_Pop': 0.15,
            'Iso': 0.10,
            'Cut': 0.10,
            'PostUp': 0.05
        },
        fit: { spacer: 3, handler: 2, popper: 1 }, 
        paceMod: 3
    },
    'PerimeterFocus': {
        playDistribution: {
            'PnR_Handler': 0.35,
            'PnR_Roll': 0.20,
            'Iso': 0.20,
            'CatchShoot': 0.15,
            'Handoff': 0.10,
            'PostUp': 0.0
        },
        fit: { screener: 2, handler: 2, spacer: 1 }, 
        paceMod: 1
    },
    'PostFocus': {
        playDistribution: {
            'PostUp': 0.50,
            'Cut': 0.15,
            'CatchShoot': 0.15,
            'PnR_Handler': 0.10,
            'Iso': 0.10
        },
        fit: { postScorer: 3, spacer: 1, connector: 2 }, 
        paceMod: -3
    },
    'Grind': {
        playDistribution: {
            'Iso': 0.30,
            'PostUp': 0.30,
            'PnR_Handler': 0.20,
            'CatchShoot': 0.10,
            'Cut': 0.10
        },
        fit: { connector: 2, screener: 2, isoScorer: 2 }, 
        paceMod: -5
    },
    'SevenSeconds': {
        playDistribution: {
            'Transition': 0.25, // Artificial boost to transition logic
            'CatchShoot': 0.25,
            'PnR_Handler': 0.20,
            'PnR_Roll': 0.15,
            'Iso': 0.15
        },
        fit: { handler: 2, driver: 2, spacer: 2 }, 
        paceMod: 5
    }
};

// Defensive Tactics: Determine WHO contests the shot (Usage) and HOW WELL the team defends (Fit)
// [Note] Defense strategies don't select PlayTypes, but they modify success rates.
// We keep the old structure for Defense as it works well for the "Resistance" model.
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

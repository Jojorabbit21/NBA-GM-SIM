
export const SIM_CONFIG = {
    GAME_ENV: {
        BASE_POSSESSIONS: 85, 
        HOME_ADVANTAGE: 0.02,
        PACE_SLIDER_IMPACT: 0.02, 
        SCORING_MODIFIER: 1.05, 
    },
    FATIGUE: {
        DRAIN_BASE: 2.5, 
        BENCH_RECOVERY_RATE: 5.0, 
        STAMINA_SAVE_FACTOR: 0.015,
        DURABILITY_FACTOR: 0.005,
        FATIGUE_PENALTY_LOW: 0.02,
        FATIGUE_PENALTY_MED: 0.10,
        FATIGUE_PENALTY_HIGH: 0.25,
    },
    STATS: {
        STL_BASE_FACTOR: 0.08,
        BLK_GUARD_FACTOR: 0.015,
        BLK_BIG_FACTOR: 0.05,
        AST_BASE_FACTOR: 0.25,
        TOV_USAGE_FACTOR: 0.20, // [Up] Increased from 0.12 to 0.20 to generate more turnovers
    },
    SHOOTING: {
        INSIDE_BASE_PCT: 0.58,
        MID_BASE_PCT: 0.40,
        THREE_BASE_PCT: 0.35,
        INSIDE_DEF_IMPACT: 0.004,
        MID_DEF_IMPACT: 0.005,
        THREE_DEF_IMPACT: 0.006,
    },
    // [New] Foul Trouble Logic
    FOUL_TROUBLE: {
        // Multiplier for Foul Probability (Lower = Less likely to foul)
        PROB_MOD: {
            3: 0.85, // Caution
            4: 0.60, // Danger
            5: 0.30  // Survival Mode (Matador Defense)
        },
        // Penalty for Defensive Attributes (Higher = Worse defense)
        // Trade-off for playing safe to avoid fouls
        DEF_PENALTY: {
            3: 0.0,  // No penalty at 3
            4: 0.15, // 15% stat reduction
            5: 0.40  // 40% stat reduction (Open lane)
        }
    }
};

export const POSITION_PENALTY_MAP: Record<string, number> = {
    'PG': 1.0, 'SG': 1.0, 'SF': 1.0, 'PF': 1.0, 'C': 1.0
};

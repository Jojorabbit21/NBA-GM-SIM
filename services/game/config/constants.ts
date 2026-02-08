
export const SIM_CONFIG = {
    GAME_ENV: {
        BASE_POSSESSIONS: 85, 
        HOME_ADVANTAGE: 0.02,
        PACE_SLIDER_IMPACT: 0.02, 
        SCORING_MODIFIER: 1.05, 
    },
    FATIGUE: {
        // [Balance Patch] 3.5 -> 1.8로 하향 (36분 출전 시 기본 64.8 소모)
        DRAIN_BASE: 1.8, 
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
        TOV_USAGE_FACTOR: 0.12,
    },
    SHOOTING: {
        INSIDE_BASE_PCT: 0.58,
        MID_BASE_PCT: 0.40,
        THREE_BASE_PCT: 0.35,
        INSIDE_DEF_IMPACT: 0.004,
        MID_DEF_IMPACT: 0.005,
        THREE_DEF_IMPACT: 0.006,
    }
};

export const POSITION_PENALTY_MAP: Record<string, number> = {
    'PG': 1.0, 'SG': 1.0, 'SF': 1.0, 'PF': 1.0, 'C': 1.0
};

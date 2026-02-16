
export const SIM_CONFIG = {
    GAME_ENV: {
        BASE_POSSESSIONS: 85, 
        HOME_ADVANTAGE: 0.02,
        PACE_SLIDER_IMPACT: 0.02, 
        SCORING_MODIFIER: 0.94, // [Down] 1.00 -> 0.94 (전체 득점 볼륨 6% 하향)
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
        TOV_USAGE_FACTOR: 0.20,
    },
    SHOOTING: {
        // [Balance Update] 야투율 인플레이션 억제를 위한 베이스 확률 대폭 하향 (High Risk)
        INSIDE_BASE_PCT: 0.45, // 0.50 -> 0.45
        MID_BASE_PCT: 0.32,    // 0.36 -> 0.32
        THREE_BASE_PCT: 0.30,  // 0.33 -> 0.30
        
        // [Balance Update] 수비 스탯의 영향력 대폭 강화 (High Return for High Skill Gap)
        // 수비가 좋으면 성공률을 더 많이 깎아먹음
        INSIDE_DEF_IMPACT: 0.008, // 0.005 -> 0.008
        MID_DEF_IMPACT: 0.008,    // 0.006 -> 0.008
        THREE_DEF_IMPACT: 0.010,  // 0.007 -> 0.010
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

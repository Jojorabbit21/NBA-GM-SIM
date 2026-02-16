
export const SIM_CONFIG = {
    GAME_ENV: {
        BASE_POSSESSIONS: 85, 
        HOME_ADVANTAGE: 0.02,
        PACE_SLIDER_IMPACT: 0.02, 
        SCORING_MODIFIER: 0.94, 
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
        // [Balance Update] 3점슛 밸런스 조정 (Avg 35%, Elite 40% Max)
        INSIDE_BASE_PCT: 0.45, 
        MID_BASE_PCT: 0.32,    
        THREE_BASE_PCT: 0.27,  // 0.30 -> 0.27 (기본 난이도 상승)
        
        // [Balance Update] 능력치 격차가 성공률에 미치는 영향 축소
        INSIDE_DEF_IMPACT: 0.008, 
        MID_DEF_IMPACT: 0.008,    
        THREE_DEF_IMPACT: 0.005,  // 0.010 -> 0.005 (격차가 커도 성공률이 폭증하지 않음)
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


export const SIM_CONFIG = {
    GAME_ENV: {
        BASE_POSSESSIONS: 98, // [Update] Adjusted to modern NBA average (approx 100)
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
        // [Normalization v3] bonusHitRate가 이제 실제 적용됨 → 기본값 하향 재조정
        // bonusHitRate 미적용 시절 보상값 해제: Rim -5%, Mid -4%, 3PT -2%
        // 목표 FG% (bonus 없이): Rim 57%, Mid 38%, 3PT 34%
        INSIDE_BASE_PCT: 0.57,
        MID_BASE_PCT: 0.38,
        THREE_BASE_PCT: 0.34,
        
        // [Normalization] Reduced Defense Impact to prevent > 140pt games (or < 60)
        // Attribute gaps now matter slightly less, pulling results to average.
        // Old: 0.003 - 0.004 range. New: 0.0025 range.
        INSIDE_DEF_IMPACT: 0.0025, 
        MID_DEF_IMPACT: 0.0025,    
        THREE_DEF_IMPACT: 0.0020, 
    },
    // Foul Trouble Logic
    FOUL_TROUBLE: {
        PROB_MOD: {
            3: 0.85, 
            4: 0.60, 
            5: 0.30  
        },
        DEF_PENALTY: {
            3: 0.0,  
            4: 0.15, 
            5: 0.40  
        }
    }
};

export const POSITION_PENALTY_MAP: Record<string, number> = {
    'PG': 1.0, 'SG': 1.0, 'SF': 1.0, 'PF': 1.0, 'C': 1.0
};

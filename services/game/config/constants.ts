
// ==========================================================================================
//  🏀 NBA GM SIMULATOR - GAME CONFIGURATION
//  Centralized constants for game physics, probabilities, and penalties.
// ==========================================================================================

export const SIM_CONFIG = {
    GAME_ENV: {
        // [Balance Patch v4] Increased base possessions from 80 to 85 to ensure 95-125 PPG range.
        BASE_POSSESSIONS: 85, 
        HOME_ADVANTAGE: 0.02,
        PACE_SLIDER_IMPACT: 0.02, 
        SCORING_MODIFIER: 1.05, // 점수 보강을 위해 모디파이어 상향
    },
    FATIGUE: {
        // [Balance Patch] Increased from 2.8 to 3.5 to ensure players get tired
        DRAIN_BASE: 3.5, 
        STAMINA_SAVE_FACTOR: 0.015,
        DURABILITY_FACTOR: 0.005,
        FATIGUE_PENALTY_LOW: 0.02,
        FATIGUE_PENALTY_MED: 0.10,
        FATIGUE_PENALTY_HIGH: 0.25,
    },
    INJURY: {
        BASE_RISK: 0.0005,
        RISK_LOW_COND: 0.005,
        RISK_CRITICAL_COND: 0.08,
        SEVERE_INJURY_CHANCE: 0.65,
    },
    SHOOTING: {
        INSIDE_BASE_PCT: 0.58,
        INSIDE_DEF_IMPACT: 0.004,
        MID_BASE_PCT: 0.40,
        MID_DEF_IMPACT: 0.003,
        THREE_BASE_PCT: 0.35,
        THREE_DEF_IMPACT: 0.003,
        OPEN_SHOT_BONUS: 0.05,
        CONTESTED_PENALTY: 0.15,
    },
    STATS: {
        REB_BASE_FACTOR: 0.23,
        AST_BASE_FACTOR: 0.14,
        STL_BASE_FACTOR: 0.036,
        BLK_GUARD_FACTOR: 0.035,
        BLK_BIG_FACTOR: 0.055,
        TOV_USAGE_FACTOR: 0.08,
    }
};

// 포지션 불일치 페널티 매핑 (단위: 1.0 = 100%)
export const POSITION_PENALTY_MAP: Record<string, Record<string, number>> = {
  'PG': { 'SG': 0.03, 'SF': 0.10, 'PF': 0.50, 'C': 1.00 },
  'SG': { 'PG': 0.03, 'SF': 0.05, 'PF': 0.50, 'C': 1.00 },
  'SF': { 'PG': 0.25, 'SG': 0.05, 'PF': 0.25, 'C': 0.40 },
  'PF': { 'PG': 0.40, 'SG': 0.30, 'SF': 0.05, 'C': 0.10 },
  'C':  { 'PG': 0.50, 'SG': 0.50, 'SF': 0.35, 'PF': 0.10 }
};

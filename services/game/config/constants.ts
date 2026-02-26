
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
    // Foul Events (오펜시브 파울 / 테크니컬 / 플래그런트 / 샷클락 바이올레이션)
    FOUL_EVENTS: {
        // 오펜시브 파울
        OFFENSIVE_FOUL_BASE: 0.015,
        CHARGE_BONUS_PER_DEF_IQ: 0.0003,
        POST_OFFENSIVE_FOUL_RATE: 0.025,
        SCREEN_FOUL_RATE: 0.008,

        // 테크니컬 파울
        TECHNICAL_FOUL_CHANCE: 0.003,
        FLAGRANT_CONVERT_RATE: 0.05,
        FLAGRANT_2_CHANCE: 0.10,

        // 샷클락 바이올레이션 (수비 전술 + 공격 볼무브 트레이드-오프)
        SHOT_CLOCK_BASE: 0.003,
        SHOT_CLOCK_DEF_INTENSITY_FACTOR: 0.001,
        SHOT_CLOCK_ZONE_USAGE_FACTOR: 0.0008,
        SHOT_CLOCK_HELP_DEF_FACTOR: 0.0006,
        SHOT_CLOCK_LOW_PACE_FACTOR: 0.001,
        SHOT_CLOCK_HIGH_BM_FACTOR: 0.0008,
    },
    // Rebound System (2-Step: ORB% 판정 → 팀 내 리바운더 선택)
    REBOUND: {
        BASE_ORB_RATE: 0.23,          // NBA 평균 ORB% (2023-24: 22.8%)
        MIN_ORB_RATE: 0.12,           // 하한 (극단적 수비 우위)
        MAX_ORB_RATE: 0.38,           // 상한 (극단적 공격 리바 크래쉬)
        SLIDER_IMPACT: 0.012,         // 슬라이더 1포인트당 ORB% ±1.2%
        QUALITY_FACTOR: 0.08,         // 팀 리바 능력 차이 반영 계수
        POS_WEIGHT_C: 1.3,            // 센터 리바운드 가중치
        POS_WEIGHT_PF: 1.2,           // 파워포워드 가중치
        POS_WEIGHT_DEFAULT: 1.0,      // 기본 가중치
        SHOOTER_PENALTY: 0.3,         // 슈터 본인 리바 확률 감소
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

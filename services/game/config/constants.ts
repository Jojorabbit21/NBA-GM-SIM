
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
        TIMEOUT_RECOVERY: 3,        // 타임아웃 시 전 선수 기본 회복량
        QUARTER_BREAK_RECOVERY: 4,  // 쿼터 휴식(1Q→2Q, 3Q→4Q) 시 전 선수 기본 회복량
        HALFTIME_RECOVERY: 12,      // 하프타임(2Q→3Q) 시 전 선수 기본 회복량
        RECOVERY_STAMINA_FACTOR: 0.30,    // 회복 시 Stamina 영향 계수
        RECOVERY_DURABILITY_FACTOR: 0.20, // 회복 시 Durability 영향 계수
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
    // Block System (미스 중 블락 판정)
    BLOCK: {
        // 존별 베이스 블락 확률 (원래 값 복원)
        BASE_RIM: 0.10,           // 10% (was 5%)
        BASE_PAINT: 0.05,         // 5%  (was 3%)
        BASE_MID: 0.035,          // 3.5% (was 1.5%)
        BASE_3PT: 0.01,           // 1%  (was 0.5%)

        // 수비자 능력치 보정 계수 (3× 이전값)
        BLK_STAT_FACTOR: 0.0015,  // (defBlk - 70) × factor
        VERT_STAT_FACTOR: 0.00075,// (defVert - 70) × factor
        HEIGHT_FACTOR: 0.001,     // (defHeight - 200) × factor

        // 엘리트 블로커 아키타입 보너스
        ARCHETYPE_WALL: 0.08,     // blk ≥ 97
        ARCHETYPE_ALIEN: 0.06,    // height ≥ 216 && blk ≥ 80
        ARCHETYPE_SKYWALKER: 0.05,// vert ≥ 95 && blk ≥ 75
        ARCHETYPE_ANCHOR: 0.03,   // helpDefIq ≥ 92 && blk ≥ 80

        // 헬프 블락 (림 프로텍터 회전 블락)
        HELP_BASE: 0.02,          // 기본 확률
        HELP_BLK_THRESHOLD: 85,   // 블락 능력치 기준
        HELP_BLK_BONUS: 0.03,     // 기준 이상 시 추가
        HELP_RIM_THRESHOLD: 75,   // 림프로텍터 아키타입 기준
        HELP_RIM_BONUS: 0.03,     // 기준 이상 시 추가
        HELP_MID_FACTOR: 0.5,     // 미드레인지 헬프 블락 효과 배수
    },
    // Steal Archetypes (턴오버 유발 히든 아키타입)
    STEAL: {
        // A. The Clamp (질식 수비) — Kawhi, Scottie Pippen
        CLAMP_PERIMDEF_THRESHOLD: 92,
        CLAMP_STL_THRESHOLD: 80,
        CLAMP_TOV_BONUS: 0.03,        // +3% 턴오버 확률

        // B. The Pickpocket (볼 스트립) — CP3, Marcus Smart
        PICKPOCKET_STL_THRESHOLD: 85,
        PICKPOCKET_HANDS_THRESHOLD: 85,
        PICKPOCKET_TOV_BONUS: 0.04,   // +4% (접촉 플레이 전용)

        // C. The Hawk (패싱레인 사냥꾼) — Draymond, Jimmy Butler
        HAWK_HELPDEF_THRESHOLD: 85,
        HAWK_PASSPERC_THRESHOLD: 80,
        HAWK_STL_THRESHOLD: 75,
        HAWK_BM_THRESHOLD: 7,         // 상대 ballMovement ≥ 7 시 발동
        HAWK_TOV_BONUS: 0.03,         // +3% 턴오버 확률

        // E. The Press (풀코트 프레스) — Pat Beverley, Tony Allen
        PRESS_SPEED_THRESHOLD: 85,
        PRESS_STAMINA_THRESHOLD: 85,
        PRESS_HUSTLE_THRESHOLD: 85,
        PRESS_TOV_BONUS: 0.05,        // +5% (Transition 전용)
        PRESS_STEAL_RATIO_BONUS: 0.15, // +15% 스틸 비율
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

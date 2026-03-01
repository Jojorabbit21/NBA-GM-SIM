
export const SIM_CONFIG = {
    GAME_ENV: {
        BASE_POSSESSIONS: 98, // [Update] Adjusted to modern NBA average (approx 100)
        HOME_ADVANTAGE: 0.02,
        PACE_SLIDER_IMPACT: 0.02, 
        SCORING_MODIFIER: 0.94, 
    },
    FATIGUE: {
        DRAIN_BASE: 2.5,
        BENCH_RECOVERY_RATE: 3.0,
        TIMEOUT_RECOVERY: 1,        // 타임아웃 시 전 선수 기본 회복량
        QUARTER_BREAK_RECOVERY: 1.5,// 쿼터 휴식(1Q→2Q, 3Q→4Q) 시 전 선수 기본 회복량
        HALFTIME_RECOVERY: 5,       // 하프타임(2Q→3Q) 시 전 선수 기본 회복량
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

        // drawFoul 공격자 파울 유도 보정
        DRAW_FOUL_BASELINE: 70,              // 중립 기준점
        DRAW_FOUL_SHOOTING_FACTOR: 0.0015,   // 슈팅파울 비율: (drFoul - 70) × factor
        DRAW_FOUL_AND1_FACTOR: 0.0005,       // And-1 확률: (drFoul - 70) × factor

        // Manipulator 아키타입 (파울 유도 장인) — Harden, Embiid, Trae Young
        MANIPULATOR_DRFOUL_THRESHOLD: 95,    // drFoul ≥ 95
        MANIPULATOR_SHOTIQ_THRESHOLD: 88,    // shotIq ≥ 88
        MANIPULATOR_FOUL_BONUS: 0.03,        // baseFoulChance +3% (18% 캡 무시)
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

        // F-1. Harvester (하베스터) — Andre Drummond, DeAndre Jordan
        HARVESTER_REB_THRESHOLD: 95,         // offReb ≥ 95 OR defReb ≥ 95
        HARVESTER_SCORE_MULTIPLIER: 1.3,     // 리바운드 선택 점수 ×1.3

        // F-2. Raider (레이더) — Dennis Rodman, Charles Barkley
        RAIDER_MAX_HEIGHT: 200,              // height ≤ 200
        RAIDER_OFFREB_THRESHOLD: 90,         // offReb ≥ 90
        RAIDER_VERTICAL_THRESHOLD: 90,       // vertical ≥ 90
        RAIDER_SCORE_MULTIPLIER: 1.4,        // 공격 리바운드 선택 점수 ×1.4
    },
    // Block System (미스 중 블락 판정)
    BLOCK: {
        ENABLED: true,              // 블락 아키타입 마스터 스위치
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
        ENABLED: true,              // 스틸 아키타입 마스터 스위치
        // A. The Clamp (질식 수비) — Kawhi, Scottie Pippen
        CLAMP_PERIMDEF_THRESHOLD: 92,
        CLAMP_STL_THRESHOLD: 80,
        CLAMP_TOV_BONUS: 0.03,        // +3% 턴오버 확률

        // B. The Pickpocket (볼 스트립) — CP3, Marcus Smart
        PICKPOCKET_STL_THRESHOLD: 85,
        PICKPOCKET_AGILITY_THRESHOLD: 92,
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
    // Clutch Hidden Archetypes (flowEngine.ts clutch section)
    CLUTCH_ARCHETYPE: {
        ENABLED: true,              // 클러치 아키타입 마스터 스위치

        // A-1. The Closer (마무리 장인) — Kobe, MJ, Kawhi
        CLOSER_INTANGIBLES_THRESHOLD: 90,
        CLOSER_SHOTIQ_THRESHOLD: 85,
        CLOSER_MODIFIER_MULTIPLIER: 2.0,    // clutchModifier × 2

        // A-2. Ice in Veins (냉혈한) — Dame, Kyrie, Dirk
        ICE_INTANGIBLES_THRESHOLD: 85,
        ICE_OFFCONSIST_THRESHOLD: 88,
        // 효과: 프레셔 페널티(-1.5%) 면제

        // A-3. Big Stage Player (대무대 사나이) — LeBron, Giannis
        BIGSTAGE_INTANGIBLES_THRESHOLD: 85,
        BIGSTAGE_STRENGTH_THRESHOLD: 85,
        BIGSTAGE_INS_THRESHOLD: 85,
        BIGSTAGE_INSIDE_BONUS: 0.03,        // Rim/Paint +3%
    },
    // Zone Shooting Hidden Archetypes (flowEngine.ts + possessionHandler.ts)
    ZONE_SHOOTING: {
        ENABLED: true,              // 구역별 야투 아키타입 마스터 스위치

        // B-1. Mr. Fundamental (미드레인지의 정석) — KD, DeRozan
        FUNDAMENTAL_MID_THRESHOLD: 97,
        FUNDAMENTAL_CLUTCH_BONUS: 0.03,     // 클러치 + Mid +3%
        FUNDAMENTAL_ISO_BONUS: 0.03,        // ISO + Mid +3%

        // B-2. Rangemaster (사거리의 지배자) — Steph Curry, Dame
        RANGEMASTER_THREEVAL_THRESHOLD: 90,
        RANGEMASTER_SHOTIQ_THRESHOLD: 85,
        RANGEMASTER_CLUTCH_BONUS: 0.015,    // 클러치 + 3PT +1.5%

        // B-3. Tyrant (페인트 존의 폭군) — Giannis, Shaq, Zion
        TYRANT_INS_THRESHOLD: 90,
        TYRANT_STRENGTH_THRESHOLD: 88,
        TYRANT_VERTICAL_THRESHOLD: 88,
        TYRANT_HITRATE_BONUS: 0.03,         // Rim/Paint +3%
        TYRANT_BLOCK_REDUCTION: 0.03,       // 블락 확률 -3%

        // B-4. Levitator (레비테이터) — Tony Parker, Trae Young
        FLOATER_CLOSESHOT_THRESHOLD: 96,
        FLOATER_AGILITY_THRESHOLD: 85,
        FLOATER_MAX_HEIGHT: 195,
        FLOATER_BLOCK_MULTIPLIER: 0.50,     // 블락 확률 × 0.5

        // B-5. Afterburner (애프터버너) — Ja Morant, De'Aaron Fox, Russell Westbrook
        AFTERBURNER_SPEED_THRESHOLD: 95,
        AFTERBURNER_AGILITY_THRESHOLD: 93,
        AFTERBURNER_TRANSITION_BONUS: 0.02,  // Transition hitRate +2%

        // B-6. Ascendant (어센던트) — Ja Morant, Zach LaVine, Derrick Rose
        ASCENDANT_VERTICAL_THRESHOLD: 95,
        ASCENDANT_CLOSESHOT_THRESHOLD: 93,
        ASCENDANT_BLOCK_MULTIPLIER: 0.60,    // Rim 블락 확률 × 0.6 (PG/SG 전용)
    },
    // PnR Defense Coverage (Drop / Hedge / Blitz)
    PNR_COVERAGE: {
        // Probability distribution by slider value (0=Drop, 1=Hedge, 2=Blitz)
        // [dropPct, hedgePct, blitzPct]
        DIST: {
            0: [0.70, 0.20, 0.10],  // Drop focused
            1: [0.15, 0.60, 0.25],  // Hedge balanced (default)
            2: [0.10, 0.20, 0.70],  // Blitz focused
        } as Record<number, [number, number, number]>,
        // Drop: 빅맨이 림 보호, 핸들러 미드레인지 허용
        DROP_HANDLER_MID_BONUS: 0.04,
        DROP_HANDLER_3PT_BONUS: 0.01,
        DROP_ROLL_PENALTY: 0.04,
        DROP_POP_BONUS: 0.015,
        DROP_BLOCK_BONUS: 0.03,
        // Hedge: 빅맨이 순간 앞으로 나와 핸들러 지연 후 복귀
        HEDGE_HANDLER_PENALTY: 0.02,
        HEDGE_ROLL_BONUS: 0.03,
        HEDGE_SLOW_BIG_EXTRA: 0.02,
        HEDGE_SLOW_BIG_THRESHOLD: 55,
        HEDGE_TOV_BONUS: 0.015,
        // Blitz: 더블팀 고위험 고보상
        BLITZ_HANDLER_PENALTY: 0.08,
        BLITZ_ROLL_BONUS: 0.07,
        BLITZ_POP_BONUS: 0.06,
        BLITZ_BLOCK_PENALTY: 0.02,
        BLITZ_TOV_BONUS: 0.04,
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

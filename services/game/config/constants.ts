
export const SIM_CONFIG = {
    GAME_ENV: {
        BASE_POSSESSIONS: 98, // [Update] Adjusted to modern NBA average (approx 100)
        HOME_ADVANTAGE: 0.02,
        PACE_SLIDER_IMPACT: 0.02, 
        SCORING_MODIFIER: 0.94, 
    },
    FATIGUE: {
        DRAIN_BASE: 1.5,
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
        REST_DAY_RECOVERY: 40,          // 비경기일 1일 휴식 시 기본 회복량 (stamina/durability 보정 적용)
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
        
        // Per-zone/shotType 수비 계수 (offense/defense 분리)
        THREE_DEF_COEFF: 0.001,     // 3PT
        INSIDE_DEF_COEFF: 0.0015,   // Rim/Paint (Layup, Floater, Hook)
        MID_DEF_COEFF: 0.0012,      // Mid (Pullup, Jumper, Fadeaway)
        DUNK_DEF_COEFF: 0.002,      // Dunk only (수비 영향 최대)

        // [3PT Non-linear Curve] 공격 능력치→FG% 비선형 커브
        // 25-85: 감속형 완만 (5%→33%), 86-99: 급경사 (33%→42%)
        THREE_OFF_CURVE: [
            [25, -0.234], [40, -0.154], [55, -0.084], [70, -0.014],
            [85, +0.046], [90, +0.078], [95, +0.110], [99, +0.136],
        ] as [number, number][],
        THREE_CORNER_BONUS: 0.015,

        // [Layup] 33%→48%(plateau@90)→60%(steep 91-99)
        LAYUP_OFF_CURVE: [
            [25, -0.135], [40, -0.105], [55, -0.075], [70, -0.045],
            [85, -0.005], [90, +0.015], [95, +0.075], [99, +0.135],
        ] as [number, number][],

        // [Dunk] 65%→92% (균일 상승, 수비 영향 최대)
        DUNK_OFF_CURVE: [
            [40, +0.199], [55, +0.269], [70, +0.339], [80, +0.389],
            [90, +0.429], [99, +0.469],
        ] as [number, number][],

        // [Mid] Pullup/Jumper/Fadeaway 공통: 23%→41%(plateau@92)→50%
        MID_OFF_CURVE: [
            [25, -0.083], [40, -0.033], [55, +0.007], [70, +0.047],
            [85, +0.077], [92, +0.097], [95, +0.137], [99, +0.187],
        ] as [number, number][],

        // [Floater] 33%→52% (완만 가속, breakpoint 없음)
        FLOATER_OFF_CURVE: [
            [50, -0.177], [60, -0.147], [70, -0.107], [80, -0.067],
            [85, -0.047], [90, -0.027], [95, -0.007], [99, +0.013],
        ] as [number, number][],

        // [Hook] 30%→55% (키 큰 센터 전용)
        HOOK_OFF_CURVE: [
            [50, -0.217], [60, -0.167], [70, -0.107], [80, -0.037],
            [85, -0.017], [90, +0.003], [95, +0.023], [99, +0.033],
        ] as [number, number][],

        // shotIq + offConsist 일관성 시스템 (모든 존)
        SHOTIQ_NOISE_COEFF: 0.0008,
        CONSIST_NOISE_COEFF: 0.0010,
        CONSIST_BASELINE: 70,
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
    // Shooting Foul (존별 단일 게이트 + drawFoul 커브)
    // 이중 게이트(baseFoulChance × shootingFoulRatio) 제거 → 존별 직접 확률
    SHOOTING_FOUL: {
        // 존별 기본 슈팅파울 확률 (NBA 2023-24 기준)
        BASE_RATE_RIM: 0.16,       // NBA Rim FTA rate ~21.5% (drawFoul 70 기준 16%)
        BASE_RATE_PAINT: 0.10,     // Floater/Paint (Rim과 Mid 사이)
        BASE_RATE_MID: 0.045,      // 미드레인지 (잡다한 슈팅파울)
        BASE_RATE_3PT: 0.025,      // 3점 슈팅파울 (착지 공간 침범 등)

        // drawFoul 커브: 선수 능력치 → 슈팅파울 확률 보정
        // drFoul 99 (+19%p) vs drFoul 50 (-4.3%p) → 격차 ~23%p (NBA ~24%p)
        DRAW_FOUL_CURVE: [
            [40, -0.06],
            [55, -0.035],
            [70, 0.00],     // 중립 기준점
            [80, 0.035],
            [85, 0.065],
            [90, 0.10],
            [95, 0.15],
            [99, 0.19],
        ] as [number, number][],

        // 존별 커브 스케일링 (Rim 100%, Paint 80%, Mid 50%, 3PT 25%)
        // → 인사이드에서 drawFoul 영향이 크고, 3점에서는 작음
        ZONE_CURVE_SCALE: { 'Rim': 1.0, 'Paint': 0.8, 'Mid': 0.5, '3PT': 0.25 } as Record<string, number>,

        // defIntensity 보정: intensity 6-10에서 슈팅파울 증가
        DEF_INTENSITY_FACTOR: 0.006,

        // Manipulator 아키타입 (Harden, Embiid, Trae Young)
        MANIPULATOR_DRFOUL_THRESHOLD: 95,
        MANIPULATOR_SHOTIQ_THRESHOLD: 88,
        MANIPULATOR_BONUS: 0.03,

        // And-1 drawFoul 커브 스케일 (DRAW_FOUL_CURVE × 이 값)
        AND1_CURVE_SCALE: 0.15,

        // 클램프
        MIN_RATE: 0.01,
        MAX_RATE: 0.40,
    },
    // Non-Shooting Foul (팀 파울 / 루스볼 파울 — 보너스 상황에서만 FT)
    NON_SHOOTING_FOUL: {
        BASE_RATE: 0.025,
        DEF_INTENSITY_FACTOR: 0.004,
        MAX_RATE: 0.06,
    },
    // Rebound System (2-Step: ORB% 판정 → 팀 내 리바운더 선택)
    REBOUND: {
        BASE_ORB_RATE: 0.23,          // NBA 평균 ORB% (2023-24: 22.8%)
        MIN_ORB_RATE: 0.12,           // 하한 (극단적 수비 우위)
        MAX_ORB_RATE: 0.38,           // 상한 (극단적 공격 리바 크래쉬)
        SLIDER_IMPACT: 0.012,         // 슬라이더 1포인트당 ORB% ±1.2%
        QUALITY_FACTOR: 0.08,         // 팀 리바 능력 차이 반영 계수
        SHOOTER_PENALTY: 0.3,         // 슈터 본인 리바 확률 감소
        TEAM_REB_RATE_FG: 0.10,       // FG 미스 → 팀 리바운드 확률 (개인 미기록, NBA 평균 ~10%)
        TEAM_REB_RATE_FT: 0.15,       // FT 라스트샷 미스 → 팀 리바운드 확률

        // F-1. Harvester (하베스터) — Andre Drummond, DeAndre Jordan
        HARVESTER_REB_THRESHOLD: 95,         // offReb ≥ 95 OR defReb ≥ 95
        HARVESTER_SCORE_MULTIPLIER: 1.3,     // 리바운드 선택 점수 ×1.3

        // F-2. Raider (레이더) — Dennis Rodman, Charles Barkley
        RAIDER_MAX_HEIGHT: 200,              // height ≤ 200
        RAIDER_OFFREB_THRESHOLD: 90,         // offReb ≥ 90
        RAIDER_VERTICAL_THRESHOLD: 90,       // vertical ≥ 90
        RAIDER_SCORE_MULTIPLIER: 1.4,        // 공격 리바운드 선택 점수 ×1.4
    },
    // Block System (미스 중 블락 판정, 커브 기반)
    BLOCK: {
        ENABLED: false, // ★ TEMPORARY: 아키타입 비활성화
        // 존별 베이스 블락 확률 (pre-shot 방식: 전체 슛 대상이므로 낮게 설정)
        BASE_RIM: 0.08,
        BASE_PAINT: 0.045,
        BASE_MID: 0.025,
        BASE_3PT: 0.007,

        // 블락 능력치 커브: blk → 추가 블락 확률 (pre-shot 기준)
        BLK_CURVE: [
            [40, -0.015], [55, -0.008], [70, 0.00],
            [80, 0.020], [85, 0.038], [90, 0.058],
            [95, 0.085], [99, 0.105],
        ] as [number, number][],

        // 키 보너스 (블락에서는 키가 독립적으로 중요)
        HEIGHT_FACTOR: 0.0006,

        // 수직 점프 보너스 (vertical 70 기준, 초과분 × 계수)
        VERT_FACTOR: 0.0006,

        // 엘리트 블로커 아키타입 보너스 (조건부 발동)
        ARCHETYPE_ALIEN: 0.03,
        ARCHETYPE_SKYWALKER: 0.05,
        ARCHETYPE_ANCHOR_HELP_MULT: 2.0,

        // 헬프 블락 (림 프로텍터 회전 블락)
        HELP_BASE: 0.025,
        HELP_BLK_THRESHOLD: 82,
        HELP_BLK_BONUS: 0.025,
        HELP_RIM_THRESHOLD: 75,
        HELP_RIM_BONUS: 0.03,
        HELP_MID_FACTOR: 0.5,
    },
    // Steal System (커브 기반 재설계)
    STEAL: {
        // 온볼 스틸 커브: 수비자 stl → 스틸 확률 (주 수비자 전용)
        // 85까지 완만, 90부터 급가속 (stl 95 → ~2.7 SPG, stl 99 → ~3.2 SPG 목표)
        ONBALL_STEAL_CURVE: [
            [40, 0.015], [55, 0.025], [70, 0.040],
            [80, 0.055], [85, 0.070], [90, 0.095],
            [95, 0.145], [99, 0.170],
        ] as [number, number][],

        // 패싱레인 스틸 커브: 오프볼 수비자 stl → 패스 가로채기 확률
        // 패스 플레이 전용, 주 수비자 외 4명 각각 판정
        LANE_STEAL_CURVE: [
            [40, 0.001], [55, 0.002], [70, 0.004],
            [80, 0.006], [85, 0.009], [90, 0.013],
            [95, 0.022], [99, 0.028],
        ] as [number, number][],

        // 공격자 핸들링 저항 계수 (온볼 스틸 확률에서 감산)
        // handling 90 → 스틸 확률 -2%, handling 50 → +2%
        HANDLING_RESIST_COEFF: 0.001,

        // 패스 정확도 저항 계수 (패싱레인 스틸 확률에서 감산)
        // passAcc 90 → 레인 스틸 확률 -1%, passAcc 50 → +1%
        PASSACC_RESIST_COEFF: 0.0005,
    },
    // Playmaking Archetypes (플레이메이킹 히든 아키타입)
    PLAYMAKING: {
        ENABLED: false,              // ★ TEMPORARY: 아키타입 비활성화

        // G-1. Clairvoyant (천리안) — CP3, Magic, LeBron, Jokic
        CLAIRVOYANT_PASSIQ_THRESHOLD: 92,
        CLAIRVOYANT_PASSVISION_THRESHOLD: 90,
        CLAIRVOYANT_PASSACC_THRESHOLD: 90,
        CLAIRVOYANT_HITRATE_BONUS: 0.02,  // 어시스트 시 슈터 hitRate +2%

        // G-2. Overseer (오버시어) — Trae Young, Luka, Harden
        OVERSEER_PASSIQ_THRESHOLD: 88,
        OVERSEER_PASSACC_THRESHOLD: 95,
        OVERSEER_PNR_ROLLER_BONUS: 0.03,  // PnR_Roller hitRate +3%

        // G-3. Needle (니들) — Steve Nash, Jason Kidd, Rajon Rondo
        NEEDLE_PASSACC_THRESHOLD: 93,
        NEEDLE_PASSIQ_THRESHOLD: 88,
        NEEDLE_TOV_REDUCTION: 0.03,       // 패스 플레이 턴오버 -3%
    },
    // Clutch Hidden Archetypes (flowEngine.ts clutch section)
    CLUTCH_ARCHETYPE: {
        ENABLED: false,              // ★ TEMPORARY: 아키타입 비활성화

        // A-1. Curtain Call (커튼콜) — Kobe, MJ, Kawhi
        CLOSER_INTANGIBLES_THRESHOLD: 90,
        CLOSER_SHOTIQ_THRESHOLD: 85,
        CLOSER_MODIFIER_MULTIPLIER: 1.6,    // clutchModifier × 1.6

        // A-2. Ice in Veins (냉혈한) — Dame, Kyrie, Dirk
        ICE_INTANGIBLES_THRESHOLD: 85,
        ICE_OFFCONSIST_THRESHOLD: 88,
        // 효과: 프레셔 페널티(-1.5%) 면제

        // A-3. High Roller (하이 롤러) — LeBron, Giannis
        BIGSTAGE_INTANGIBLES_THRESHOLD: 85,
        BIGSTAGE_STRENGTH_THRESHOLD: 85,
        BIGSTAGE_INS_THRESHOLD: 85,
        BIGSTAGE_INSIDE_BONUS: 0.03,        // Rim/Paint +3%
    },
    // Zone Shooting Hidden Archetypes (flowEngine.ts + possessionHandler.ts)
    ZONE_SHOOTING: {
        ENABLED: false,              // ★ TEMPORARY: 아키타입 비활성화

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
        TYRANT_HITRATE_BONUS: 0.015,        // Rim/Paint +1.5%
        TYRANT_BLOCK_REDUCTION: 0.03,       // 블락 확률 -3%

        // B-4. Levitator (레비테이터) — Tony Parker, Trae Young
        FLOATER_CLOSESHOT_THRESHOLD: 96,
        FLOATER_AGILITY_THRESHOLD: 85,
        FLOATER_MAX_HEIGHT: 195,
        FLOATER_BLOCK_MULTIPLIER: 0.50,     // 블락 확률 × 0.5

        // B-5. Afterburner (애프터버너) — Ja Morant, De'Aaron Fox, Russell Westbrook
        AFTERBURNER_SPEED_THRESHOLD: 95,
        AFTERBURNER_SPDBALL_THRESHOLD: 90,
        AFTERBURNER_AGILITY_THRESHOLD: 93,
        AFTERBURNER_TRANSITION_BONUS: 0.02,  // Transition hitRate +2%

        // B-6. Ascendant (어센던트) — Ja Morant, Zach LaVine, Derrick Rose
        ASCENDANT_VERTICAL_THRESHOLD: 95,
        ASCENDANT_CLOSESHOT_THRESHOLD: 93,
        ASCENDANT_BLOCK_MULTIPLIER: 0.60,    // Rim 블락 확률 × 0.6 (PG/SG 전용)

        // B-7. Deadeye (데드아이) — KD, Klay Thompson, Khris Middleton
        DEADEYE_SHOTIQ_THRESHOLD: 88,
        DEADEYE_OFFCONSIST_THRESHOLD: 88,
        DEADEYE_CONTEST_MULTIPLIER: 0.90,    // 3PT 전용, contestFactor × 0.9
    },
    // Finish System: resolveFinish에서 마무리 타입 결정 (playTypes.ts)
    FINISH: {
        BASELINE: 60,
        DUNK_VERT_MIN: 70,
        DUNK_STR_MIN: 65,
        DUNK_WEIGHT: 1.5,
        LAYUP_WEIGHT: 1.0,
        FLOATER_CLOSESHOT_MIN: 80,
        FLOATER_WEIGHT: 0.7,
        HOOK_HEIGHT_MIN: 208,
        HOOK_CLOSESHOT_MIN: 80,
        HOOK_WEIGHT: 0.8,
        MID_MIN: 72,
        MID_DRIVE_WEIGHT: 0.5,    // Pullup (drive)
        MID_POST_WEIGHT: 0.7,     // Jumper (post/roll)
        FADEAWAY_POSTPLAY_MIN: 80,
        FADEAWAY_MID_MIN: 85,
        FADEAWAY_CLOSESHOT_MIN: 85,
        FADEAWAY_WEIGHT: 0.6,
        PAINT_JUMPER_CLOSESHOT_MIN: 75,  // Short Jumper (Paint) 진입 임계값
        PAINT_JUMPER_WEIGHT: 0.6,        // closeShot 기반 페인트존 점퍼 가중치
    },
    // Shot Defense: shotType별 수비 차등 (flowEngine + possessionHandler)
    SHOT_DEFENSE: {
        CONTEST: { Dunk: 0.85, Layup: 1.0, Floater: 0.6, Hook: 0.5, Pullup: 0.8, Jumper: 0.85, Fadeaway: 0.4, CatchShoot: 1.0 } as Record<string, number>,
        BLOCK_MULT: { Dunk: 0.85, Layup: 1.0, Floater: 0.35, Hook: 0.55, Pullup: 0.7, Jumper: 0.6, Fadeaway: 0.25, CatchShoot: 1.0 } as Record<string, number>,
        AND1_MULT: { Dunk: 1.5, Layup: 1.0, Floater: 0.3, Hook: 0.5, Pullup: 0.15, Jumper: 0.10, Fadeaway: 0.10, CatchShoot: 0.08 } as Record<string, number>,
        DUNK_STR_RESIST: 0.001,
        DUNK_VERT_RESIST: 0.0005,
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
    // Zone Selection: selectZone 임계값 필터 (존 선호도 기반 플레이 리다이렉트)
    ZONE_SELECTION: {
        ZONE_PREF_THRESHOLD: 0.15,  // 이 값 미만의 zonePref는 selectZone 후보에서 제거
    },
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

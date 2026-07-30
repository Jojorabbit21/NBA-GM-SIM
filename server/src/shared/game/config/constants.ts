
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

        // [defIntensity 체력 트레이드오프] 1단계 +5%p(드레인 절약) ~ 10단계 -8%p(드레인 추가) 선형
        DEF_INTENSITY_CURVE: [[1, 5], [10, -8]] as [number, number][],

        // [pace 체력 트레이드오프 2026-07 신규] 5단계 미만은 페널티 없음, 5단계 +5% ~ 10단계 +15% 선형
        PACE_FATIGUE_THRESHOLD: 5,
        PACE_FATIGUE_BASE: 5,        // %, pace===threshold일 때
        PACE_FATIGUE_PER_LEVEL: 2,   // %, threshold 초과 1단계당 추가
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
        // x=0 기준점 추가: dunk 능력이 낮은 선수는 페널티 적용
        DUNK_OFF_CURVE: [
            [0, +0.059], [40, +0.199], [55, +0.269], [70, +0.339], [80, +0.389],
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

        // [defIntensity 매치업 게이팅] 수비자 능력 vs 공격자 능력 차이(diff)에 따라
        // defIntensity 슬라이더의 FG% 억제 효과를 0~1 배율로 조정. diff = 수비능력 - 공격능력.
        // 실제 레이팅 분포 기준(perDef 중앙값 69 vs 3점/미드 공격 중앙값 77~78,
        // intDef 중앙값 59 vs 레이업/덩크 중앙값 72~79)으로 breakpoint 보정 — 인테리어(intDef)가
        // 퍼리미터(perDef)보다 전반적으로 9~10점 낮게 분포돼 있어 커브를 분리했다.
        DEF_INTENSITY_MATCHUP_CURVE_PERIMETER: [   // 3PT/Mid — 수비자 perDef 기준
            [-40, 0.0], [-20, 0.25], [-8, 0.45], [5, 0.75], [15, 1.0],
        ] as [number, number][],
        DEF_INTENSITY_MATCHUP_CURVE_INTERIOR: [    // Rim/Paint — 수비자 intDef 기준
            [-50, 0.0], [-25, 0.20], [-15, 0.45], [5, 0.75], [15, 1.0],
        ] as [number, number][],
    },
    // Foul Events (오펜시브 파울 / 테크니컬 / 플래그런트 / 샷클락 바이올레이션)
    FOUL_EVENTS: {
        // 오펜시브 파울 — [2026-07-29] 차징/일리걸 스크린 분리(client 미러 상세 참조)
        OFFENSIVE_FOUL_BASE: 0.015,
        CHARGE_BONUS_PER_DEF_CONSIST: 0.0003,
        POST_OFFENSIVE_FOUL_RATE: 0.025,
        SCREEN_FOUL_RATE: 0.008,
        OFFBALL_SCREEN_FOUL_RATE: 0.025,

        // 테크니컬 파울 (공수 양팀 전원 중 temperament 가중 선택)
        TECHNICAL_FOUL_BASE: 0.003,
        TECH_TEMPERAMENT_POWER: 2.0,     // 커브 지수: temperament 높을수록 급격히 증가
        TECH_DEFICIT_PER_POINT: 0.015,
        TECH_DEFICIT_MAX_BOOST: 0.5,

        // 플래그런트 파울 (독립 이벤트, foulProneness 주 영향 + temperament 보조)
        // 목표: 팀당 시즌 ~4-5개 (8200포제션 기준)
        FLAGRANT_BASE: 0.0004,           // 포제션당 0.04% (중립 팀 ~5개/시즌)
        FLAGRANT_FOULPRONE_WEIGHT: 0.7,  // foulProneness 기여 비중
        FLAGRANT_TEMPER_WEIGHT: 0.3,     // temperament 기여 비중
        FLAGRANT_CURVE_POWER: 2.5,       // 커브 지수: 높을수록 고값 선수에 집중
        FLAGRANT_MAX_RATE: 0.0015,       // 실링 0.15% (더티 팀 ~12개/시즌)
        FLAGRANT_2_CHANCE: 0.10,

        // 싸움 → 출장정지 (temperament >= 0.5인 선수만 대상)
        // 목표: 리그 전체 시즌 ~5-10건 (246,000포제션 기준)
        FIGHT_TEMPERAMENT_THRESHOLD: 0.5,   // 이 이상만 싸움 후보
        FIGHT_BASE_CHANCE: 0.00003,          // 포제션당 0.003%
        FIGHT_TEMPERAMENT_SCALE: 3.0,        // temperament 스케일링 (0.5→1x, 1.0→2.5x)
        FIGHT_SUSPENSION_MIN: 1,             // 출장정지 최소
        FIGHT_SUSPENSION_MAX: 5,             // 출장정지 최대

        // 샷클락 바이올레이션 (공격 볼무브 트레이드-오프) — defIntensity 연동 제거됨(2026-07)
        // [2026-07-26] zoneUsage 항목 제거 — 인과관계 없음(존은 개인압박이 약해 오히려 셋업시간을 늘려주는 쪽)
        SHOT_CLOCK_BASE: 0.003,
        SHOT_CLOCK_HELP_DEF_FACTOR: 0.0006,
        SHOT_CLOCK_LOW_PACE_FACTOR: 0.001,
        SHOT_CLOCK_HIGH_BM_FACTOR: 0.0008,
        // [2026-07-26] fullCourtPress 트레이드오프 — defIntensity에서 이전
        // (fullCourtPress-1) × 계수, 10단계 기준 +1.0%p
        PRESS_SHOT_CLOCK_FACTOR: 0.01 / 9,

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
        // [2026-07-30] 80~90 구간 하향 — 95/99와의 격차 확대 (client 미러 참고)
        DRAW_FOUL_CURVE: [
            [40, -0.06],
            [55, -0.035],
            [70, 0.00],     // 중립 기준점
            [80, 0.015],
            [85, 0.035],
            [90, 0.06],
            [95, 0.15],
            [99, 0.19],
        ] as [number, number][],

        // [2026-07-30] Rim/Paint/Mid/3PT 100/80/50/25% → 60/50/30/20%로 재조정 (client 미러 참고)
        ZONE_CURVE_SCALE: { 'Rim': 0.6, 'Paint': 0.5, 'Mid': 0.3, '3PT': 0.2 } as Record<string, number>,

        // [2026-07-30] 수비자 파울회피 스킬 커브 (client 미러 참고) — 존 기준 분리, 포지션 무관
        INTERIOR_SKILL_CURVE: [   // Rim/Paint — intDef*0.65 + defConsist*0.35
            // [2026-07-30] 88/93/97 상위권 강화 (client 미러 참고)
            [45, 0.025], [60, 0.010], [72, 0.000],
            [82, -0.020], [88, -0.05], [93, -0.065], [97, -0.09],
        ] as [number, number][],
        PERIMETER_SKILL_CURVE: [  // Mid/3PT — perDef*0.65 + defConsist*0.35
            [45, 0.025], [55, 0.012], [71, 0.000],
            [80, -0.012], [86, -0.022], [92, -0.035], [97, -0.045],
        ] as [number, number][],

        // defIntensity 보정: 5.5 기준 대칭(1단계 -3.0%p ~ 10단계 +3.0%p)
        // 기존 max(0,(x-5))*0.006(10단계 기준 5*0.006=3.0%p)의 최댓값을 그대로 유지하며
        // 대칭화 — 새 center(5.5)까지 거리(4.5)로 나눠 동일한 3.0%p 최댓값을 재현한다.
        DEF_INTENSITY_FACTOR: (5 * 0.006) / 4.5,

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
        // defIntensity 보정: 5.5 기준 대칭(1단계 -2.0%p ~ 10단계 +2.0%p)
        // 기존 max(0,(x-5))*0.004(10단계 기준 5*0.004=2.0%p)의 최댓값을 그대로 유지
        DEF_INTENSITY_FACTOR: (5 * 0.004) / 4.5,
        MAX_RATE: 0.06,
        // [2026-07-30] PostUp 1.5%p→0.6%p 재조정 (client 미러 참고) — PnR_Roll(1.0%p)은 유지
        PLAYTYPE_MOD: {
            'PostUp': 0.006,
            'Iso': 0.012,
            'PnR_Roll': 0.010,
            'PnR_Handler': 0.008,
            'DriveKick': 0.008,
            'Cut': 0.006,
            'CatchShoot': -0.010,
        } as Partial<Record<string, number>>,
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

        // [2026-07-30] 수비/공격 리바운드 능력치 요구치가 다름 (client 미러 참고)
        // 수비: defReb+boxOut(이미 자리 잡음) / 공격: offReb+hustle(뛰어들어 경합)
        DRB_REB_WEIGHT: 0.65,
        DRB_BOXOUT_WEIGHT: 0.20,
        DRB_VERTICAL_WEIGHT: 0.05,
        DRB_STRENGTH_WEIGHT: 0.10,
        ORB_REB_WEIGHT: 0.80,
        ORB_HUSTLE_WEIGHT: 0.10,
        ORB_VERTICAL_WEIGHT: 0.10,

        // [2026-07-30] 다른 히든 아키타입 계열과 통일해 비활성화 (client 미러 참고)
        ARCHETYPES_ENABLED: false,

        // F-1. Harvester (하베스터) — Andre Drummond, DeAndre Jordan
        HARVESTER_REB_THRESHOLD: 95,         // offReb ≥ 95 OR defReb ≥ 95
        HARVESTER_SCORE_MULTIPLIER: 1.3,     // 리바운드 선택 점수 ×1.3

        // F-2. Raider (레이더) — Dennis Rodman, Charles Barkley
        RAIDER_MAX_HEIGHT: 200,              // height ≤ 200
        RAIDER_OFFREB_THRESHOLD: 90,         // offReb ≥ 90
        RAIDER_VERTICAL_THRESHOLD: 90,       // vertical ≥ 90
        RAIDER_SCORE_MULTIPLIER: 1.4,        // 공격 리바운드 선택 점수 ×1.4
    },
    // Defensive Rebound 속공 트레이드오프 (2026-07 신규) — defReb 낮게 설정 시 속공 전환 이점 + 체력 대가
    DEF_REB_TRANSITION: {
        // A. 빈도 보너스 (Transition 선택확률에 가산, 우리 defReb<5일 때만): (5-defReb) × 계수
        FREQ_BONUS_PER_LEVEL: 0.15 / 4,   // 최대 +15%p (defReb=1)
        FREQ_THRESHOLD: 5,

        // B. 성공률 보너스 (Transition hitRate에 가산, 상대offReb≥7일 때만): (상대offReb-7) × 계수
        SUCCESS_BONUS_PER_LEVEL: 0.05 / 3, // 최대 +5%p (상대offReb=10)
        SUCCESS_THRESHOLD: 7,

        // C. 체력 페널티 (매 포제션 상시, 우리 defReb<5일 때만, %p 단위): (5-defReb) × 계수
        FATIGUE_PENALTY_PER_LEVEL: 1.5 / 4, // 최대 +1.5%p (defReb=1)

        // B-2. [2026-07 신규] 백코트 페널티 — offReb 낮게 설정 시(상대offReb<5) 크래시 대신 백코트,
        // 상대(우리) Transition hitRate 페널티. B와 대칭(같은 변수, 반대 방향, 동일 최대폭)
        RETREAT_PENALTY_PER_LEVEL: 0.05 / 4, // 최대 -5%p (상대offReb=1)
        RETREAT_THRESHOLD: 5,
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

        // [2026-07-26] fullCourtPress 트레이드오프 — defIntensity에서 이전
        // (fullCourtPress-1) × 계수, 1단계 0%p ~ 10단계 최댓값(체력 소모와 짝을 이룸)
        PRESS_STEAL_COEFF: 0.015 / 9,   // 10단계 기준 +1.5%p (온볼 스틸)
        PRESS_TOV_COEFF: 0.025 / 9,     // 10단계 기준 +2.5%p (비강제 턴오버 유발)
        PRESS_LANE_STEAL_COEFF: 0.0075 / 9,  // 10단계 기준 +0.75%p (패싱레인 스틸, 헬퍼별 개별 적용)
    },
    // Help Defense System (2026-07 재설계 — 전 구역 적용, 명시적 헬퍼 지정)
    HELP_DEFENSE: {
        // 헬프 시도 확률: 1단계 10% ~ 10단계 80%
        ATTEMPT_BASE: 0.10,
        ATTEMPT_PER_LEVEL: 0.70 / 9,

        // 존별 헬퍼 후보 포지션 풀 (해당 포지션이 온코트에 없으면 전체 폴백)
        // [2026-07-30] Rim/Paint 전 포지션으로 확장, 선정은 helpDefIq 가중치로 (client 미러 참고)
        ZONE_POSITIONS: {
            Rim: ['PG', 'SG', 'SF', 'PF', 'C'],
            Paint: ['PG', 'SG', 'SF', 'PF', 'C'],
            Mid: ['PG', 'SG', 'SF', 'PF'],
            '3PT': ['PG', 'SG', 'SF'],
        } as Record<'Rim' | 'Paint' | 'Mid' | '3PT', string[]>,

        // 성공 게이트: helpDefIq(인지) × 평균(민첩,속력)(실행) — 둘 다 만족해야 성공
        IQ_GATE_MIN: 60,
        IQ_GATE_MAX: 100,
        PHYS_GATE_MIN: 55,
        PHYS_GATE_MAX: 95,

        // [2026-07-30] 빈도(ATTEMPT)만 슬라이더 연동, 강도는 고정값으로 전환 (client 미러 참고)
        HITRATE_PENALTY: 0.033,
        FOUL_BONUS: 0.006,
    },
    // [2026-07-30] PostUp 크로스매치 (client 미러 참고) — BASE 하한 + helpDef 슬라이더 가산
    POST_CROSS_MATCH: {
        BASE: 0.15,
        PER_LEVEL: 0.20 / 9,
    },
    // [2026-07-30] PnR_Roll 전용 스위치 하한 (client 미러 참고)
    PNR_ROLL_SWITCH_MIN: 0.15,
    // Zone Defense System (2026-07 전면 재설계) — 존/맨투맨 진짜 트레이드오프 + 플레이타입별 카운터
    ZONE_DEFENSE: {
        // 인테리어 억제 (기존 유지, Rim/Paint/Mid 한정 — 기존엔 전 구역 적용 버그)
        INTERIOR_COEFF: 0.003,

        // 3점 오픈 보너스 — zoneUsage와 같은 방향(골밑 몰빵↔외곽 노출 트레이드오프), 1단계 0%p ~ 10단계 +1.0%p
        THREE_OPEN_PER_LEVEL: 0.01 / 9,

        // 플레이타입별 존 전용 보정 (zoneUsage 스케일, Transition 제외)
        ISO_ZONE_PENALTY_PER_LEVEL: 0.015 / 9,           // 최대 -1.5%p
        POSTUP_ZONE_PENALTY_PER_LEVEL: 0.02 / 9,         // 최대 -2.0%p
        CUT_ZONE_BONUS_PER_LEVEL: 0.02 / 9,              // 최대 +2.0%p
        CATCHSHOOT_ZONE_BONUS_PER_LEVEL: 0.015 / 9,      // 최대 +1.5%p
        DRIVEKICK_ZONE_BONUS_PER_LEVEL: 0.015 / 9,       // 최대 +1.5%p
        OFFBALLSCREEN_ZONE_PENALTY_PER_LEVEL: 0.015 / 9, // 최대 -1.5%p

        // OffBallScreen 맨투맨 전용 보너스 (switchFreq 낮을수록 큼, 스크린이 개인 수비수를 떼어내는 효과)
        OFFBALLSCREEN_MAN_BONUS_PER_LEVEL: 0.015 / 9,    // 최대 +1.5%p (switchFreq=1)

        // fullCourtPress × zoneFreq 감쇠 — 존 비중 높을수록 프레스 효과 최대 50%까지 감소
        PRESS_ZONE_DAMPEN_PER_LEVEL: 0.5 / 9,
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
        ZONE_PREF_THRESHOLD: 0.15,  // 이 값 미만의 zonePref는 selectZone에서 후보 제거가 아니라 ×0.2 가중치 페널티
        SLIDER_SENSITIVITY: 0.5,    // 전술 슬라이더가 존 선택 비중을 흔드는 폭 (0=슬라이더 무효, 1=슬라이더 최대 2배/0배)
    },
    // Play Selection: pickWeightedActor의 역할(슈터/패서) 기반 playStyle 배율
    PLAY_SELECTION: {
        PLAYSTYLE_SHOOTER_K: 0.25,  // 슈터 픽: weight *= (1 + ps*K) — 슛선호(+)일수록 액터로 더 자주
        PLAYSTYLE_PASSER_K: 0.25,   // 패서 픽: weight *= (1 - ps*K) — 패스선호(-)일수록 패서로 더 자주
    },
    // Position Weight: PostUp/PnR_Roll 액터 선정에 포지션별 배율을 곱해 빅맨 편중을 보정
    // (아키타입 점수만으로는 C/PF/SF 간 실력 차이가 거의 없어 순수 스킬 경쟁으론 센터가 밀림 — 32 TEST 실측 확인)
    POSITION_WEIGHT: {
        POST_UP: { C: 0.6, PF: 0.2, SF: 0.1, SG: 0.05, PG: 0.05 } as Record<string, number>,
        PNR_ROLL: { C: 0.7, PF: 0.3, SF: 0, SG: 0, PG: 0 } as Record<string, number>,
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
    },
    // League-Relative Skill Normalization
    // 리그 평균이 기준보다 높으면 능력치를 기준 대역으로 끌어내려 득점 인플레 방지
    NORMALIZATION: {
        ENABLED: true,                  // master switch (false → 완전 no-op)
        MU_REF: 75,                     // calibration anchor — 표준 리그 로테이션 평균 OVR
        DEFAULT_K: 0.7,                 // 기본 압축 계수 (0=끔, 1=완전 평준화)
        K_MIN: 0,
        K_MAX: 1,
        ROTATION_SIZE: 9,               // 팀당 로테이션 선수 수 (μ_league 산정 대상)
        TARGET_ATTRS: [
            // 슈팅 효율 (calculateHitRate)
            'layup', 'dunk', 'closeShot', 'mid', 'postPlay',
            'intDef', 'perDef', 'def', 'helpDefIq', 'defConsist',
            'shotIq', 'offConsist',
            // 림 어택 보너스 + 드리블 갭 비율 유지
            'spdBall', 'speed',
            // 체력/회복 (높은 pace 대가)
            'stamina', 'durability',
            // 턴오버 저항 (높은 pace 대가)
            'handling', 'passAcc', 'passIq', 'passVision', 'hands',
            // ORB/블록 과다 억제
            'offReb', 'blk',
            // 파울 드로잉
            'drFoul',
        ] as string[],
        ATTR_K_BOOST: { drFoul: 2.5 } as Record<string, number>,
    },
};

export const POSITION_PENALTY_MAP: Record<string, number> = {
    'PG': 1.0, 'SG': 1.0, 'SF': 1.0, 'PF': 1.0, 'C': 1.0
};

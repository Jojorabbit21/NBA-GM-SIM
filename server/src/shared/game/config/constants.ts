
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
        TIMEOUT_RECOVERY: 0.5,      // 타임아웃 시 전 선수 기본 회복량 ([2026-10-22] 1 → 0.5: 타임아웃 7회·의무 도입으로 경기당 횟수 증가 보정)
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

        // [pace 체력 트레이드오프] [2026-10-25] 중립 기준 대칭 커브(%) — 1단계 −8 / 5단계 0 / 10단계 +30 (하네스 F30).
        // 이전: THRESHOLD 5 / BASE 5 / PER_LEVEL 2 (pace ≥ 5만, 5단계 +5% ~ 10단계 +15%)
        PACE_FATIGUE_CURVE: [[1, -8], [5, 0], [10, 30]] as [number, number][],
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
        // [2026-09-10] 0.38 → 0.40 — 실제 NBA 미드레인지 평균(~40~41%)에 맞춰 소폭 상향.
        // 빅맨 볼륨/효율 과다 조사 후속 조치 1건(가드가 미드 점퍼로 밀렸을 때의 기대값이
        // Rim(1.14)/3PT(0.948)에 비해 지나치게 낮았던 문제 완화 — 완전한 해법은 아니고
        // 격차를 소폭 줄이는 수준, docs/history/dev-log.md 참고).
        MID_BASE_PCT: 0.40,
        THREE_BASE_PCT: 0.34,
        
        // Per-zone/shotType 수비 계수 (offense/defense 분리)
        THREE_DEF_COEFF: 0.001,     // 3PT
        INSIDE_DEF_COEFF: 0.0015,   // Rim/Paint (Layup, Floater, Hook)
        MID_DEF_COEFF: 0.0012,      // Mid (Pullup, Jumper, Fadeaway)
        DUNK_DEF_COEFF: 0.002,      // Dunk only (수비 영향 최대)

        // [3PT Non-linear Curve] 공격 능력치→FG% 비선형 커브
        // [2026-10-25] 상위 구간 완화 + 하위 구간 하향(K1, 사용자 목표: 75 미만 기대 25~28% / 95~98 약 40% / 99 41~42%).
        // 커브 밖 가산(수비·체력·보너스 등)이 구간 무관 약 +0.345라 "목표 성공률 − 0.345"로 역산.
        // [2026-10-25] 80~84 구간 36% 목표(사용자) — 80 −.005→+.008, 85 +.020→+.024 (K3)
        // 이전: [25,-.234] [40,-.154] [55,-.084] [70,-.014] [85,+.046] [90,+.078] [95,+.110] [99,+.136] (95+ 기대 46%, 커리 48.6%)
        THREE_OFF_CURVE: [
            [25, -0.265], [40, -0.195], [55, -0.125], [70, -0.055],
            [75, -0.030], [80, +0.008], [85, +0.024], [90, +0.042],
            [95, +0.060], [99, +0.072],
        ] as [number, number][],
        THREE_CORNER_BONUS: 0.015,

        // [Layup] 33%→48%(plateau@90)→60%(steep 91-99)
        // [2026-10-25] 2점 과효율 보정(사용자 결정 "림 +5") — 엔진 2P% .577 vs NBA .545, 페인트 .575 vs 3~10ft .452, 미드 .494 vs .41~.45.
        // INSIDE/MID_BASE_PCT(사용자 잠금)는 그대로, 커브만 이동. 결과(하네스): 2P% .550 · 림 .630 · 페인트 .444 · 미드 .432 · TS .577.
        // 레이업 전 구간 +0.05 (이전: [25,-.135] [40,-.105] [55,-.075] [70,-.045] [85,-.005] [90,+.015] [95,+.075] [99,+.135])
        LAYUP_OFF_CURVE: [
            [25, -0.085], [40, -0.055], [55, -0.025], [70, +0.005],
            [85, +0.045], [90, +0.065], [95, +0.125], [99, +0.185],
        ] as [number, number][],

        // [Dunk] 60.5%→85% (균일 상승, 수비 영향 최대)
        // [2026-08-01 Fix] 기존 커브는 dunk 80+에서 INSIDE_BASE_PCT(57%)와 합쳐지면 수비 반영
        // 전부터 이미 95% 하드캡 근처/초과(dunk 90=99.9%, 99=103.9%)라 수비가 사실상 무력화됨.
        // INSIDE_BASE_PCT는 Layup/Floater/Hook엔 문제없어(최대치도 캡까지 여유 충분) 그대로 두고,
        // 유독 폭이 큰 Dunk 커브만 약 60% 스케일로 압축 — dunk=99 기준 수비 반영 전 85%로 하향.
        // x=0 기준점 추가: dunk 능력이 낮은 선수는 페널티 적용
        DUNK_OFF_CURVE: [
            [0, +0.035], [40, +0.119], [55, +0.161], [70, +0.202], [80, +0.232],
            [90, +0.256], [99, +0.280],
        ] as [number, number][],

        // [Mid] Pullup/Jumper/Fadeaway 공통: 23%→41%(plateau@92)→50%
        // [2026-10-25] 전 구간 −0.06 (이전: [25,-.083] [40,-.033] [55,+.007] [70,+.047] [85,+.077] [92,+.097] [95,+.137] [99,+.187])
        MID_OFF_CURVE: [
            [25, -0.143], [40, -0.093], [55, -0.053], [70, -0.013],
            [85, +0.017], [92, +0.037], [95, +0.077], [99, +0.127],
        ] as [number, number][],

        // [2026-10-25] 페인트 점퍼 전용 — 이전엔 MID_OFF_CURVE를 INSIDE_BASE_PCT(57%) 위에 얹어 기대 63.7%(림 레이업보다 높음).
        // = 이전 MID_OFF_CURVE − 0.177 (기대 약 46%)
        PAINT_JUMPER_OFF_CURVE: [
            [25, -0.260], [40, -0.210], [55, -0.170], [70, -0.130],
            [85, -0.100], [92, -0.080], [95, -0.040], [99, +0.010],
        ] as [number, number][],

        // [Floater] 33%→52% (완만 가속, breakpoint 없음)
        // [2026-10-25] 전 구간 −0.10 (이전: [50,-.177] [60,-.147] [70,-.107] [80,-.067] [85,-.047] [90,-.027] [95,-.007] [99,+.013])
        FLOATER_OFF_CURVE: [
            [50, -0.277], [60, -0.247], [70, -0.207], [80, -0.167],
            [85, -0.147], [90, -0.127], [95, -0.107], [99, -0.087],
        ] as [number, number][],

        // [Hook] 30%→55% (키 큰 센터 전용)
        // [2026-10-25] 전 구간 −0.11 (이전: [50,-.217] [60,-.167] [70,-.107] [80,-.037] [85,-.017] [90,+.003] [95,+.023] [99,+.033])
        HOOK_OFF_CURVE: [
            [50, -0.327], [60, -0.277], [70, -0.217], [80, -0.147],
            [85, -0.127], [90, -0.107], [95, -0.087], [99, -0.077],
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

        // [2026-10-18] Rim/Paint 슈터 체격 보너스 — 빅맨이 골밑에서 크기 이점을 전혀 못 받던 문제(C 레이업 45%,
        // C 덩크 68%로 가드보다 낮음). 수비수와 비교하지 않는 절대값(C vs C 매치업에서도 작동).
        // 덩크 외 슛: 키, 덩크: 근력+키. 하네스 4920경기 검증값(1배) — docs/history/dev-log.md 참고.
        FINISHER_SIZE: {
            HEIGHT_BASE: 200,            // cm
            NON_DUNK_HEIGHT_COEFF: 0.002, // 213cm → +2.6%p
            NON_DUNK_CAP: 0.05,
            DUNK_STR_BASE: 70,
            DUNK_STR_COEFF: 0.0015,       // str 99 → +4.35%p
            DUNK_STR_CAP: 0.045,
            DUNK_HEIGHT_COEFF: 0.0015,    // 216cm → +2.4%p
            DUNK_HEIGHT_CAP: 0.035,
        },
    },
    // Foul Events (오펜시브 파울 / 테크니컬 / 플래그런트 / 샷클락 바이올레이션)
    FOUL_EVENTS: {
        // 오펜시브 파울 — [2026-07-29] 차징/일리걸 스크린 분리(client 미러 상세 참조)
        OFFENSIVE_FOUL_BASE: 0.010,   // [2026-10-24] 0.015 → 0.010 (client 미러 참고)
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
        // [2026-10-18] 5개 계수 전부 ×0.4 비례 축소 — 실리그(180경기) 팀당 경기당 1.51회로 실제 NBA
        // (~0.55회, 2006-07/2018-19 집계)의 약 2.8배였음. 슬라이더 간 비율은 유지.
        // 이전 값: BASE 0.003 / HELP 0.0006 / LOW_PACE 0.001 / HIGH_BM 0.0008 / PRESS 0.01/9
        SHOT_CLOCK_BASE: 0.0012,
        SHOT_CLOCK_HELP_DEF_FACTOR: 0.00024,
        SHOT_CLOCK_LOW_PACE_FACTOR: 0.0004,
        SHOT_CLOCK_HIGH_BM_FACTOR: 0.00032,
        // [2026-07-26] fullCourtPress 트레이드오프 — defIntensity에서 이전
        // (fullCourtPress-1) × 계수, 10단계 기준 +0.4%p
        PRESS_SHOT_CLOCK_FACTOR: 0.004 / 9,

    },
    // Shooting Foul (존별 단일 게이트 + drawFoul 커브)
    // 이중 게이트(baseFoulChance × shootingFoulRatio) 제거 → 존별 직접 확률
    SHOOTING_FOUL: {
        // 존별 기본 슈팅파울 확률 (NBA 2023-24 기준)
        // [2026-09-10] 0.16 → 0.13 — 빅맨 파울 트러블 과중 조사 후속 조치. base 자체는 원래
        // drawFoul 70(평균) 기준 NBA 벤치마킹 값이지만, 여기에 zoneScale(아래)·
        // INTERIOR_SKILL_CURVE·defIntensity·foulProneness가 전부 곱/합연산으로 추가로 얹혀
        // 실전 평균 확률이 base보다 상당히 높게 나온다 — base를 19% 낮춰 이 복합 배율들이
        // 그대로 살아있는 채로 최종 확률만 전반적으로 완화(docs/history/dev-log.md 참고).
        // [2026-09-14] 0.13 → 0.10, PAINT 0.10 → 0.08 (client 미러 참고 — 빅맨 파울 confound
        // 실측 후속 조치, docs/history/dev-log.md 참고).
        BASE_RATE_RIM: 0.10,
        BASE_RATE_PAINT: 0.08,     // Floater/Paint (Rim과 Mid 사이)
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
        // [2026-09-10] Rim 0.6 → 0.5 — Paint와 동률로 맞춤. 딱히 Paint보다 더 커야 할 근거가
        // 약했고, 엘리트 공격수의 drawFoul 보너스가 골밑에서만 유독 3배(3PT 대비) 증폭되던
        // 것을 완화(빅맨 파울 트러블 조사 후속 조치, docs/history/dev-log.md 참고).
        ZONE_CURVE_SCALE: { 'Rim': 0.5, 'Paint': 0.5, 'Mid': 0.3, '3PT': 0.2 } as Record<string, number>,

        // [2026-07-30] 수비자 파울회피 스킬 커브 (client 미러 참고) — 존 기준 분리, 포지션 무관
        // [2026-09-10] 저~중구간 완화(중립점 72→60) — 기존엔 intDef 72 미만(로테이션/벤치급
        // 빅맨 다수 포함)이 전부 추가 페널티(+0.010~+0.025) 대상이었음. 88 이상 엘리트 구간
        // 할인폭은 그대로 유지(빅맨 파울 트러블 조사 후속 조치, docs/history/dev-log.md 참고).
        // [2026-09-14] 72 이상만 비대칭 2배 확대, 45/60 원본 유지 (client 미러 참고 — 대칭 2배는
        // 약한 수비 빅맨 페널티도 같이 커지는 부작용 있었음, docs/history/dev-log.md 참고).
        INTERIOR_SKILL_CURVE: [   // Rim/Paint — intDef*0.65 + defConsist*0.35
            [45, 0.010], [60, 0.000], [72, -0.020],
            [82, -0.060], [88, -0.10], [93, -0.13], [97, -0.18],
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
        // [2026-10-25] 0.025 → 0.05, MAX 0.06 → 0.12 (사용자 결정 C1) — 하네스: 파울 14.3→16.7, FTA 18.5→19.8, FTr .222→.241(NBA .244),
        // 파울아웃 0.032→0.055/팀경기, 포세션 95.3→94.4(보너스 전 파울이 시간 소모)
        BASE_RATE: 0.05,
        // defIntensity 보정: 5.5 기준 대칭(1단계 -2.0%p ~ 10단계 +2.0%p)
        // 기존 max(0,(x-5))*0.004(10단계 기준 5*0.004=2.0%p)의 최댓값을 그대로 유지
        DEF_INTENSITY_FACTOR: (5 * 0.004) / 4.5,
        MAX_RATE: 0.12,
        // [2026-07-30] PostUp 1.5%p→0.6%p 재조정 (client 미러 참고) — PnR_Roll(1.0%p)은 유지
        // [2026-09-10] PostUp/PnR_Roll 추가 완화 — 이 엔진에서 두 플레이타입은 거의 전적으로
        // 빅맨이 액터(PostUp)/스크리너-롤맨(PnR_Roll)이라, 여기 모디파이어가 곧 빅맨 파울
        // 누적으로 직결된다. Iso/PnR_Handler/DriveKick/Cut은 대부분 가드가 액터라 그대로 둠
        // (빅맨 파울 트러블 조사 후속 조치, docs/history/dev-log.md 참고).
        PLAYTYPE_MOD: {
            'PostUp': 0.003,
            'Iso': 0.012,
            'PnR_Roll': 0.006,
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
        // [2026-10-26] 수비 defReb 5 초과 구간 전용 — 1.2%p면 대가 없는 이득이라 절반으로 체감 (offReb·5 이하는 SLIDER_IMPACT)
        DEF_SLIDER_IMPACT_ABOVE_MID: 0.006,
        QUALITY_FACTOR: 0.08,         // 팀 리바 능력 차이 반영 계수
        SHOOTER_PENALTY: 0.3,         // 슈터 본인 리바 확률 감소
        // [2026-07-31] TEAM_REB_RATE_FG/FT 제거 (client 미러 참고)

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

        // [2026-07-31] 룰렛 지수 증폭 + motor/신장/포지션 보정 (client 미러 참고)
        SKILL_EXPONENT: 2.0,
        MOTOR_COEFF: 0.1,
        HEIGHT_COEFF: 0.1,
        POSITION_COEFF: 0.1,
        HEIGHT_CURVE: [
            [170, 0.5], [185, 0.65], [193, 0.85], [198, 1.00],
            [206, 1.20], [213, 1.40], [229, 1.50],
        ] as [number, number][],
        POSITION_FACTOR: { C: 1.5, PF: 1.2, SF: 1.0, SG: 1.0, PG: 1.0 } as Record<string, number>,
    },
    // Defensive Rebound 속공 트레이드오프 (2026-07 신규) — defReb 낮게 설정 시 속공 전환 이점 + 체력 대가
    // [2026-10-25] pace 속공 확률(pace × 0.03)을 공격권이 넘어온 방식에 따라 배율 — 라이브볼(수비 리바운드·스틸)↑, 데드볼↓,
    // 공격 리바운드(풋백 아닌 경우)는 이미 하프코트라 0. 가중평균 ≈ 1.0이 되도록 잡은 초안(측정 튜닝).
    TRANSITION_ENTRY: {
        ENABLED: true,
        DEF_REB_MULT: 2.0,
        STEAL_MULT: 2.0,
        DEAD_BALL_MULT: 0.35,
        OFF_REB_MULT: 0,
        // 진입 방식별 속공 성공률 가산(기본 속공 보너스 +0.04 위에) — 데드볼 속공은 수비가 정돈된 얼리 오펜스라 보너스 상쇄.
        // 스틸 진입은 STEAL_TRANSITION(골밑 +0.07)이 담당. 하네스: 속공 PPP 수비리바 1.018→1.067 / 데드볼 1.007→0.939, 리그 득점 불변.
        DEF_REB_HIT_BONUS: 0.03,
        DEAD_BALL_HIT_BONUS: -0.04,
    },
    // [2026-10-25] 속공 러너 스피드 보정 — 속공 림·페인트 마무리에 ((speed + spdBall)/2 − CENTER) × COEFF, ±CAP.
    // CENTER = 실제 속공 슈터 평균(PBL 79.6)이라 리그 전체 영향 0. 하네스: 리그 득점·TS 불변, 속공 PPP 댈러스(로스터 스피드 82.7) 1.039→1.048 /
    // 덴버(67.6) 1.037→1.026. 페이스 슬라이더 설명 "발이 빠른 선수가 있다면 유용"의 실제 구현.
    TRANSITION_SPEED: {
        ENABLED: true,
        CENTER: 80,
        COEFF: 0.0025,
        CAP: 0.04,
    },
    // [2026-10-24] 라이브볼 스틸 → 다음 포세션 속공 연결 (possessionHandler.ts, liveEngine.ts lastEntryWasSteal)
    // 모든 스틸 공통(블리츠 트랩 스틸·프레스 트랩 스틸 포함). 하네스(PBL 시드2×1230경기) 확정값:
    // 스틸 후 속공 비율 13%→58%, 스틸 후 속공 PPP 1.02→1.18(일반 속공 1.05), 리그 PPP +0.005, 팀 득점 +1.3/경기.
    STEAL_TRANSITION: {
        ENABLED: true,
        FREQ_BONUS: 0.45,   // Transition 선택 확률 가산 (기본 pace×0.03에 더함)
        HIT_BONUS: 0.07,    // 스틸에서 이어진 Transition 슛 성공률 가산 (사용자 결정, 0.03은 너무 낮음)
    },
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

        // D. [2026-10-26] 박스아웃 페널티 — 우리 defReb>5면 리바운드에 인원을 더 남겨 속공 출발이 늦음.
        // 우리 수비 리바운드로 시작한 Transition hitRate에 -(defReb-5) × 계수 (A·C의 위쪽 대칭)
        BOXOUT_PENALTY_PER_LEVEL: 0.10 / 5, // 최대 -10%p (defReb=10)
        BOXOUT_THRESHOLD: 5,
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
        // [2026-10-25] ARCHETYPE_ANCHOR_HELP_MULT / HELP_* 헬프 블락 상수 삭제 — 헬프 블락은 RIM_PROTECTION(림 프로텍터 개입)으로 대체
    },
    // [2026-10-25] 림 프로텍터 개입 (Rim/Paint 슛 전용) — 1차 블락(BLOCK)과 별개로, 1차 수비수가 아닌 코트 위 림 프로텍터가 개입.
    // 이전 헬프 블락은 헬퍼 선정이 helpDefIq만 보고 성공 게이트가 민첩·속도라 느린 정통 센터(무톰보·고베어 등)는 헬프 블락 0이었음.
    // 흐름: 선정(rimProtector 가중) → 개입 판정(P_engage, 파울 판정 전) → 개입 시 프로텍터 파울 몫 가산 → 1차 블락 실패 시 개입 블락 판정.
    RIM_PROTECTION: {
        // 선정: 1차 수비수 제외 코트 위 4명, 가중치 max(0, rimProtector − SELECT_FLOOR)^SELECT_POWER
        SELECT_FLOOR: 50,
        SELECT_POWER: 1,               // 하네스 보정: 2(제곱)는 팀 최고 센터에 몰려 두 번째 빅맨(blk 80대)이 목표의 75%에 그침
        // 개입 확률 P_engage
        ENGAGE_BASE: 0.65,
        ENGAGE_HELP_IQ: 0.006,          // × (프로텍터 helpDefIq − 75)
        ENGAGE_HELP_SLIDER: 0.02,       // × (helpDef 슬라이더 − 5)
        ZONE_USAGE_BONUS: 0.012,        // 지역방어 포세션(속공 제외): × (zoneUsage − 1) → 최대 +0.108. 지역방어가 자동으로 붙이는 drop은 아래 드랍 보너스 미적용(이중 부과 방지)
        DROP_ENGAGE_BONUS: 0.15,        // 맨투맨 PnR 3종 + 실제 drop 커버리지 (이전 PNR_COVERAGE.DROP_BLOCK_BONUS 0.03을 1차 수비수에서 이쪽으로 이전)
        BLITZ_ENGAGE_PENALTY: 0.10,     // 맨투맨 PnR 3종 + 실제 blitz 커버리지 (이전 PNR_COVERAGE.BLITZ_BLOCK_PENALTY 0.02를 이전)
        NON_PNR_DROP_TENDENCY: 0.10,    // 맨투맨 비PnR 하프코트: × (PNR_COVERAGE.DIST의 drop 비율 − blitz 비율) → 슬라이더 0 +0.075 / 1 0 / 2 −0.055
        ENGAGE_MIN: 0.20,
        ENGAGE_MAX: 0.90,
        // 개입 블락 확률: 커브(blk) + 키·점프(BLOCK과 같은 계수) → 슈터 회피(BLOCK과 동일) 적용
        // 하네스 보정(PBL 10시즌): 33분 환산 BPG 목표 60 .35 / 70 .6 / 80 1.2 / 85 1.5 / 90 1.95 / 95 2.7 / 99 3.6, 팀 약 6
        BLK_CURVE: [
            [50, 0.000], [60, 0.030], [70, 0.080], [80, 0.140],
            [85, 0.170], [90, 0.200], [95, 0.250], [99, 0.310],
        ] as [number, number][],
        PAINT_MULT: 0.75,
        // 개입 대가 — 프로텍터 파울 몫(슈팅 파울 확률에 가산, 파울 시 기여 비율만큼 프로텍터 귀속)
        // 수비 정교함 intDef×0.65 + defConsist×0.35 → 가산 확률
        FOUL_CURVE: [
            [45, 0.040], [60, 0.030], [72, 0.022], [82, 0.015],
            [88, 0.010], [93, 0.007], [97, 0.005],
        ] as [number, number][],
        FOUL_PAINT_MULT: 0.75,
        FOUL_PRONENESS_FACTOR: 0.01,    // × foulProneness(−1~+1)
    },
    // Steal System (커브 기반 재설계)
    STEAL: {
        // 온볼 스틸 커브: 수비자 stl → 스틸 확률 (주 수비자 전용)
        // [2026-10-24] 스틸 구성 재조정 — 하/중위 상향 + 상위 급경사 완화(평탄 B). 이전 커브(90부터 급가속)는 배율을 올리면
        // 엘리트 스틸러에게만 몰려 SPG 4~5가 나왔음. 이전: [40,.015] [55,.025] [70,.040] [80,.055] [85,.070] [90,.095] [95,.145] [99,.170]
        ONBALL_STEAL_CURVE: [
            [40, 0.030], [55, 0.040], [70, 0.052],
            [80, 0.060], [85, 0.067], [90, 0.075],
            [95, 0.085], [99, 0.095],
        ] as [number, number][],

        // 패싱레인 스틸 커브: 오프볼 수비자 stl → 패스 가로채기 확률
        // 패스 플레이 전용, 주 수비자 외 4명 각각 판정
        // [2026-10-24] 약 4배 상향 + 상위 평탄화(A, 사용자 결정) — 팀당 경기 레인 스틸 0.96 → 2.87. 상위 급경사를 그대로 키우면
        // 엘리트 스틸러가 다른 4명의 패스까지 가로채 SPG 3.7+가 나왔음. 이전: [40,.001] [55,.002] [70,.004] [80,.006] [85,.009] [90,.013] [95,.022] [99,.028]
        LANE_STEAL_CURVE: [
            [40, 0.005], [55, 0.009], [70, 0.016],
            [80, 0.022], [85, 0.027], [90, 0.033],
            [95, 0.040], [99, 0.045],
        ] as [number, number][],

        // 공격자 볼스킬 저항 계수 (온볼 스틸 확률에서 감산)
        // [2026-08-01] handling 전용이었으나 플레이타입별로 handling/hands를 선택 반영하도록
        // 바뀌어 이름 변경(BALL_SKILL_RESIST_COEFF) — 값/의미(스탯 90→스틸확률 -2%, 50→+2%)는 동일.
        BALL_SKILL_RESIST_COEFF: 0.001,

        // 패스 정확도 저항 계수 (패싱레인 스틸 확률에서 감산)
        // passAcc 90 → 레인 스틸 확률 -1%, passAcc 50 → +1%
        PASSACC_RESIST_COEFF: 0.0005,

        // [2026-10-23] PRESS_STEAL/TOV/LANE_STEAL_COEFF 삭제 — 프레스 효과는 FULL_COURT_PRESS(포세션 시작 단계)로 이전
    },
    // [2026-10-23] Full-court press — 포세션 시작 시 "공 운반자 vs 매치업 수비수" 1대1 압박 + 7단계 이상에서 가끔 트랩.
    // 프레스 계수 f = (fullCourtPress-1)/9 × (1 - (zoneFreq-1) × ZONE_DEFENSE.PRESS_ZONE_DAMPEN_PER_LEVEL).
    // 상대 공격 리바운드로 이어진 포세션은 프레스 불가(적용 제외). 하네스(PBL 30팀, 3시즌) 기준 프레스 10의
    // 평균 순득실 +1.7/100포세션("약간 이득"), 트랩 성공률 중앙값 ~15%.
    FULL_COURT_PRESS: {
        // 대결 점수
        HANDLER_WEIGHTS: { handling: 0.35, spdBall: 0.30, speed: 0.20, agility: 0.15 } as Record<string, number>,
        DEFENDER_WEIGHTS: { perDef: 0.50, defConsist: 0.25, agility: 0.25 } as Record<string, number>,
        // 1대1: 뚫림 확률 = f × 커브(핸들러 점수 - 수비 점수)
        BREAK_CURVE: [[-20, 0.02], [-10, 0.05], [-5, 0.09], [0, 0.13], [5, 0.19], [10, 0.27], [20, 0.40]] as [number, number][],
        BREAK_HIT_BONUS: 0.04,          // 뚫림 → 이번 포세션 슛 성공률 +4%p
        PRESSURE_TOV_BASE: 0.04,        // 1대1 압박 턴오버 = f × clamp(BASE - gap×SLOPE, 0, MAX)
        PRESSURE_TOV_SLOPE: 0.006,
        PRESSURE_TOV_MAX: 0.12,
        PRESSURE_TOV_STEAL_SHARE: 0.5,  // 압박 턴오버 중 스틸(수비수 귀속) 비율
        REACH_IN_MAX: 0.06,             // 1대1 리치인 = 고단계배율 × MAX × f² × 스틸 능력 보정 × 수비수 파울 배율
        REACH_IN_CLEAN_MIN: 0.6,        // 보정 = max(MIN, 1 - (stl-70)/75)
        // 트랩: fullCourtPress ≥ TRAP_MIN_LEVEL 에서만. 확률 = TRAP_MIN_RATE → TRAP_MAX_RATE를 MIN_LEVEL~10단계 선형 보간
        // (5단계 5% / 6단계 8.4% / 7단계 11.8% / 8단계 15.2% / 9단계 18.6% / 10단계 22%) × 지역 방어 감쇠
        TRAP_MIN_LEVEL: 5,
        TRAP_MIN_RATE: 0.05,
        TRAP_MAX_RATE: 0.22,
        TRAP_OFF_WEIGHTS: { handling: 0.40, passVision: 0.35, passAcc: 0.25 } as Record<string, number>,
        TRAP_HELPER_WEIGHTS: { helpDefIq: 0.50, perDef: 0.25, agility: 0.25 } as Record<string, number>,
        TRAP_TOV_BASE: 0.19,            // 트랩 성공률 = clamp(BASE - gap×SLOPE, MIN, MAX), gap = 공격 점수 - 트랩 수비 점수
        TRAP_TOV_SLOPE: 0.015,
        TRAP_TOV_MIN: 0.03,
        TRAP_TOV_MAX: 0.45,
        TRAP_FOUL_BASE: 0.08,           // 트랩 파울 = 고단계배율 × (BASE + EXTRA × f²) × (1 + foulProneness합×0.25) × 두 수비수 파울 배율 평균
        TRAP_FOUL_EXTRA: 0.12,
        ESCAPE_HIT_BONUS: 0.08,         // 트랩 탈출 → 이번 포세션 슛 성공률 +8%p
        ESCAPE_SHOOTING_FOUL_BONUS: 0.03,
        // 시간: 버틴 포세션 + f×MAX초(넘어오는 데 걸린 시간), 뚫림/탈출 -FAST_CUT초, 프레스 턴오버·파울 3~6초
        HOLD_EXTRA_TIME_MAX: 3,
        BREAK_TIME_CUT: 4,
        // 9~10단계 "도박 단계" 배율 — 이득(트랩 확률, 트랩/압박 턴오버의 매치업 민감도)과 위험(뚫림 확률, 뚫림·탈출 슛 보너스,
        // 체력 소모)을 같이 키운다. 위험은 능력치에 따라 갈리므로 앞선 수비가 강한 팀만 순이득.
        HIGH_LEVEL_MULT: { 9: 1.25, 10: 1.5 } as Record<number, number>,
        HIGH_LEVEL_FOUL_MULT: { 9: 1.25, 10: 1.5 } as Record<number, number>,
        // 지친 프레스 수비수: 체력이 THRESHOLD 미만이면 1%p당 수비 점수 -DEF_PENALTY%(최저 DEF_MULT_MIN), 파울 +FOUL_PENALTY%
        FATIGUE_THRESHOLD: 85,
        FATIGUE_DEF_PENALTY: 1.5,
        FATIGUE_DEF_MULT_MIN: 0.4,
        FATIGUE_FOUL_PENALTY: 3,
        // 수비수 파울 배율 = 체력 배율 × clamp(1 − (defConsist−70)×0.03, 0.4, 1.6) × clamp(1 − (수비 점수−80)×0.02, 0.6, 1.4)
        FOUL_CONSIST_NEUTRAL: 70, FOUL_CONSIST_SLOPE: 0.03, FOUL_CONSIST_MIN: 0.4, FOUL_CONSIST_MAX: 1.6,
        FOUL_DEF_NEUTRAL: 80, FOUL_DEF_SLOPE: 0.02, FOUL_DEF_MIN: 0.6, FOUL_DEF_MAX: 1.4,
        // 프레스 체력 소모(fatigueSystem): 프레스를 거는 수비 포세션에서만. 고단계배율 × DRAIN_MAX × ((단계−1)/9)^DRAIN_EXP
        // × 스태미나 배율 clamp(1 − (stamina−80)×0.03, 0.5, 1.5). C·PF 슬롯은 단계를 1 + (단계−1)×BIG_SHARE로 환산.
        DRAIN_MAX: 0.5,
        DRAIN_EXP: 1.5,
        DRAIN_STAMINA_NEUTRAL: 80, DRAIN_STAMINA_SLOPE: 0.03, DRAIN_STAMINA_MIN: 0.5, DRAIN_STAMINA_MAX: 1.5,
        DRAIN_BIG_SHARE: 0.5,
    },
    // [2026-10-23] 샷클락 막판 슛 페널티 — 슛 시점 잔여 샷클락(= 샷클락 - 이번 포세션 소요시간)이 4초 미만일 때.
    // 근거: 82games 2003-04 리그 집계 21초 이상 소요 포세션 100포세션당 91.8 (16~20초 100.6, 약 -9%).
    // 클러치 능력((intangibles×.5+offConsist×.3+shotIq×.2)/100 + clutchGene×.05)이 높으면 최대 MITIGATION_MAX만큼 감쇄.
    LATE_SHOT_CLOCK: {
        PENALTY_CURVE: [[1, 0.06], [2, 0.045], [3, 0.025], [4, 0]] as [number, number][],
        CLUTCH_NEUTRAL: 0.65,
        CLUTCH_RANGE: 0.30,
        MITIGATION_MAX: 0.4,
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
    // [2026-07-31] 포제션 시간 (client 미러 참고) — pace 압축으로 고페이스 팀 득점 폭주 방지
    POSSESSION_TIME: {
        // [2026-10-25] 19 → 18 (사용자 결정) — 중립 pace 5에서도 포세션 95.1(NBA 같은 공식 101.4)로 6개 부족했음. 18: 실제 전술 100.9 / pace5 102.2
        BASE: 18,
        PACE_NEUTRAL: 5,
        PACE_COMPRESSION: 0.2,
    },
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
        DUNK_VERT_MIN: 70,          // reach(vertical + height bonus) threshold
        // [2026-10-18] DUNK_STR_MIN(65) removed — strength applies only at dunk resolution
        DUNK_HEIGHT_BASE: 200,      // cm
        DUNK_HEIGHT_VERT_BONUS: 1.0,
        DUNK_WEIGHT: 1.5,
        LAYUP_WEIGHT: 1.0,
        FLOATER_CLOSESHOT_MIN: 80,
        FLOATER_WEIGHT: 0.7,
        // [2026-10-18] HOOK_HEIGHT_MIN(208) 삭제 → 연속 키 배율 clamp((h-BASE)/SPAN, 0, CAP)^POW, HOOK_WEIGHT 0.8 → 1.6
        HOOK_CLOSESHOT_MIN: 80,
        HOOK_WEIGHT: 1.6,
        HOOK_HEIGHT_BASE: 200,      // cm, 이하는 훅 배율 0
        HOOK_HEIGHT_SPAN: 15,       // 215cm에서 배율 1.0
        HOOK_HEIGHT_CAP: 1.5,       // (h-BASE)/SPAN 상한 → 최대 배율 2.25
        HOOK_HEIGHT_POW: 2,         // 제곱형: 206cm 0.16, 211cm 0.54, 216cm 1.14
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
        // [2026-10-24] 블리츠 재설계(SIM_CONFIG.BLITZ)에 맞춰 재조정 — 블리츠가 "트랩 탈출 실패 = 턴오버/스틸, 성공 = 노마크"
        // 양자택일이 되면서 기본값(헷지)의 블리츠 25%가 과해짐. 사용자 결정 "강분포". 이전: 0 [.70,.20,.10] / 1 [.15,.60,.25] / 2 [.10,.20,.70].
        // 실효 비중은 지역 방어(항상 드롭)·스위치가 먼저 가져가 훨씬 낮음(블리츠 설정에서 핸들러 포세션의 약 29%).
        DIST: {
            0: [0.80, 0.15, 0.05],  // Drop focused
            1: [0.15, 0.70, 0.15],  // Hedge balanced (default)
            2: [0.10, 0.25, 0.65],  // Blitz focused
        } as Record<number, [number, number, number]>,
        // Drop: 빅맨이 림 보호, 핸들러 미드레인지 허용
        DROP_HANDLER_MID_BONUS: 0.04,
        DROP_HANDLER_3PT_BONUS: 0.01,
        DROP_ROLL_PENALTY: 0.04,
        DROP_POP_BONUS: 0.015,
        // [2026-10-25] DROP_BLOCK_BONUS(0.03) 삭제 → RIM_PROTECTION.DROP_ENGAGE_BONUS로 이전
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
        // [2026-10-25] BLITZ_BLOCK_PENALTY(0.02) 삭제 → RIM_PROTECTION.BLITZ_ENGAGE_PENALTY로 이전
        BLITZ_TOV_BONUS: 0.04,
    },
    // [2026-10-24] 스크린 판정 (PnR_Handler/PnR_Roll/PnR_Pop/Handoff) — possessionHandler.ts resolveScreen()
    // power = screener 아키타입(근력·키·몸무게) × 0.7 + offBallMovement(타이밍) × 0.3
    // evade = 스크린을 받는 수비수 agility × 0.4 + perDef × 0.3 + strength × 0.3
    // gap = power − evade → 클린/실패 확률(나머지 = 부분). 평균 C 스크리너 vs 평균 가드 수비수 ≈ gap −6.
    SCREEN: {
        ENABLED: true,
        // 스크린 자격(PnR_Handler 스크리너·Handoff 빅) — 체격 점수 이 값 이상, 슬롯 포지션 무관. PnR_Roll/Pop은 POSITION_WEIGHT.PNR_ROLL.
        // 55 기준 자격 비율(PBL): PG 4% / SG 2% / SF 40% / PF 78% / C 96% — 드레이먼드 그린 56·바클리 67 포함, 위긴스 48 제외.
        ELIGIBLE_PHYSIQUE_MIN: 55,
        PHYSIQUE_WEIGHT: 0.7,
        TIMING_WEIGHT: 0.3,
        EVADE_AGILITY: 0.4,
        EVADE_PERDEF: 0.3,
        EVADE_STRENGTH: 0.3,
        CLEAN_CURVE: [[-30, 0.10], [-6, 0.35], [15, 0.60], [30, 0.70]] as [number, number][],
        FAIL_CURVE: [[-30, 0.55], [-6, 0.30], [15, 0.15], [30, 0.10]] as [number, number][],
        CLEAN_BONUS: 0.05,      // 클린 스크린: 슈터 성공률 +5%p
        PARTIAL_BONUS: 0.02,    // 부분 성공: +2%p
        ZONE_MULT: 0.5,         // 지역 방어: 수비가 사람을 따라가지 않아 스크린 효과 절반
    },    // [2026-10-24] 블리츠 재설계 (possessionHandler.ts resolveBlitzTrap / playTypes.ts resolveBlitzPassOut)
    // PnR_Handler + 블리츠: 트랩 탈출 판정 → 성공 = 패스아웃(노마크), 실패 = 턴오버/스틸(STEAL_TRANSITION으로 속공 연결).
    // 기존 커버리지 무관 PnR_Handler 킥아웃(PNR_HANDLER_KICKOUT 확률부)은 폐지, 블리츠 핸들러 슛 감점(PNR_COVERAGE.BLITZ_HANDLER_PENALTY/
    // BLITZ_TOV_BONUS)은 PnR_Handler에선 더 이상 도달하지 않음(Roll/Pop 블리츠 보너스는 유지). 수치는 측정 튜닝 중(임시값).
    BLITZ: {
        ENABLED: true,
        HANDLER_HANDLING_W: 0.5,
        HANDLER_PASSVISION_W: 0.25,
        HANDLER_PASSIQ_W: 0.25,
        TRAP_PERDEF_W: 0.4,
        TRAP_STL_W: 0.3,
        TRAP_AGILITY_W: 0.3,
        // gap = 핸들러 점수 − 트랩 점수 → 탈출 확률. [2026-10-24] C3 확정(사용자 결정) — 가파른 곡선: 약한 핸들러는 크게 당하고
        // 엘리트 핸들러는 블리츠를 역이용. PBL gap 분포 p10 −6 / p50 +10 / p90 +24. 하네스: 블리츠 포세션당 득점 0.911(트랩 TOV 17.5%,
        // 패스아웃 PPP 1.255), gap<0 0.71 ~ gap20+ 1.06. (C0 [[-20,.55],[0,.72],[20,.85],[40,.92]]는 트랩 TOV 25%로 과함)
        ESCAPE_CURVE: [[-20, 0.50], [0, 0.80], [20, 0.93], [40, 0.97]] as [number, number][],
        FAIL_STEAL_SHARE: 0.6,   // 탈출 실패 중 스틸 비율(나머지 = 비강제 턴오버: 트래블링·악송구 등)
        SCREENER_SHARE: 0.22,    // 패스아웃 중 스크리너가 받는 비율 (사용자 결정 20~25%)
        OPEN_BONUS: 0.05,        // 위크사이드 노마크 성공률 보너스 (+ 핸들러 passIq 보너스, 스크리너는 BLITZ_ROLL/POP_BONUS)
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
    // [2026-09-10] POST_UP 스프레드 12배(0.6~0.05) → 2배(1.0~0.5)로 완화 — 포스트업은 PnR_Roll과
    // 달리 스크린 없이 순수 스코어링 스킬(postScorer)로 승부하는 플레이타입이라, 듀란트/커닝험형
    // 엘리트 포스트업 가드·윙이 평범한 빅맨에게도 항상 밀리는 문제 완화(docs/history/dev-log.md 참고).
    // [2026-09-10] PNR_ROLL에 SF 0.15 신규 추가(빅윙 SF 플레이 다양성 목적) — 신장·체격상 PF급
    // 스크린/롤이 가능한 SF가 실제 존재(존 디펜스 앵커 작업 때 확인한 신장 분포와 동일 근거).
    // C 0.7→0.5, PF 0.3 유지 — SF 추가분만큼 C 비중을 낮춰 합계 스케일 유지.
    POSITION_WEIGHT: {
        // [2026-09-15] POST_UP 제거 (client 미러 참고)
        // [2026-10-24] PnR_Roll/Pop 전용(Handoff·PnR_Handler 스크리너는 SIM_CONFIG.SCREEN.ELIGIBLE_PHYSIQUE_MIN 체격 자격으로 이전).
        PNR_ROLL: { C: 0.5, PF: 0.3, SF: 0.15, SG: 0, PG: 0 } as Record<string, number>,
    },
    // [2026-10-24] PostUp 액터 선정 = postScorer × (1 − w) + 체격(calculateScreenerPhysique) × w (playTypes.ts)
    POST_SELECTION: {
        PHYSIQUE_WEIGHT: 0.4,
    },
    // [2026-07-31] PostUp 킥아웃 (client 미러 참고)
    POST_KICKOUT: {
        PASSING_MIN: 40,
        PASSING_MAX: 99,
        PROB_MIN: 0,
        PROB_MAX: 0.40,
        CURVE_EXPONENT: 1.3,
        PASSIQ_BONUS_NEUTRAL: 70,
        PASSIQ_BONUS_SCALE: 0.02,
    },
    // [2026-07-31] PnR_Roll 킥아웃 (client 미러 참고) — PROB_MAX만 절반(0.20)
    PNR_ROLL_KICKOUT: {
        PASSING_MIN: 40,
        PASSING_MAX: 99,
        PROB_MIN: 0,
        PROB_MAX: 0.20,
        CURVE_EXPONENT: 1.3,
        PASSIQ_BONUS_NEUTRAL: 70,
        PASSIQ_BONUS_SCALE: 0.02,
    },
    // [2026-07-31] Iso/PnR_Handler 킥아웃 (client 미러 참고) — playStyle 보정 최초 적용
    ISO_KICKOUT: {
        PASSING_MIN: 40,
        PASSING_MAX: 99,
        PROB_MIN: 0,
        PROB_MAX: 0.40,
        CURVE_EXPONENT: 1.3,
        PASSIQ_BONUS_NEUTRAL: 70,
        PASSIQ_BONUS_SCALE: 0.02,
    },
    PNR_HANDLER_KICKOUT: {
        PASSING_MIN: 40,
        PASSING_MAX: 99,
        PROB_MIN: 0,
        PROB_MAX: 0.40,
        CURVE_EXPONENT: 1.3,
        PASSIQ_BONUS_NEUTRAL: 70,
        PASSIQ_BONUS_SCALE: 0.02,
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


export const SIM_CONFIG = {
    GAME_ENV: {
        BASE_POSSESSIONS: 85, 
        HOME_ADVANTAGE: 0.02,
        PACE_SLIDER_IMPACT: 0.02, 
        SCORING_MODIFIER: 1.05, 
    },
    FATIGUE: {
        DRAIN_BASE: 2.5, // [Updated] 1.0 -> 2.5 (36분 출전 시 약 60% 소모 목표)
        /*
            선수가 36분을 뛰고 12분을 벤치에서 쉬는 시나리오를 기준으로 계산했습니다.
            벤치 회복량 (Gain):
            휴식 시간: 12분 (48분 - 36분)
            회복 속도 (BENCH_RECOVERY_RATE): 분당 5.0
            총 회복량: 12분 × 5.0 = 60
            목표 체력 (Target):
            목표: 60% 손실 (잔여 체력 40)
            이를 위해서는 경기 중 '회복량(60) + 목표 손실량(60) = 총 120' 의 체력을 코트 위에서 소모해야 합니다.
            필요한 소모율 (Required Drain):
            총 120의 체력을 36분 동안 소모해야 함.
            분당 필요 소모량: 120 / 36 ≈ 3.33
            보정 (Adjustment):
            현재 로직에는 cumulativeFatiguePenalty (체력이 낮을수록 소모량 증가)가 있습니다.
            체력이 100일 때는 1.0배, 40일 때는 약 1.7배 더 빨리 닳습니다. 평균적으로 약 1.35배의 가속이 붙습니다.
            따라서 DRAIN_BASE는 3.33보다 낮아야 합니다.
            3.33 / 1.35 ≈ 2.46
            ➡️ 결론: 2.5 로 설정하면, 피로 누적 페널티와 합쳐져 36분 출전 시 약 40~45 정도의 체력이 남게 됩니다. (가혹하지만 현실적인 수치)
        */
        BENCH_RECOVERY_RATE: 5.0, // 분당 체력 회복량
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
        TOV_USAGE_FACTOR: 0.12,
    },
    SHOOTING: {
        INSIDE_BASE_PCT: 0.58,
        MID_BASE_PCT: 0.40,
        THREE_BASE_PCT: 0.35,
        INSIDE_DEF_IMPACT: 0.004,
        MID_DEF_IMPACT: 0.005,
        THREE_DEF_IMPACT: 0.006,
    }
};

export const POSITION_PENALTY_MAP: Record<string, number> = {
    'PG': 1.0, 'SG': 1.0, 'SF': 1.0, 'PF': 1.0, 'C': 1.0
};

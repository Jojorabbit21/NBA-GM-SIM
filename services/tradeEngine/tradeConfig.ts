
export const TRADE_CONFIG = {
    BASE: {
        REPLACEMENT_LEVEL_OVR: 40,
        VALUE_EXPONENT: 3.8,
        SUPERSTAR_PREMIUM_THRESHOLD: 90,
        SUPERSTAR_MULTIPLIER: 1.8,
        STAR_MULTIPLIER: 1.2,
    },
    AGE: {
        YOUNG_PREMIUM_AGE: 23,
        YOUNG_PREMIUM_RATE: 0.08,
        DECLINE_START_AGE: 30,
        DECLINE_RATE_PER_YEAR: 0.12,
        DECLINE_FLOOR: 0.15,
    },
    CONTRACT: {
        BAD_CONTRACT_OVR: 78,
        BAD_CONTRACT_SALARY: 15,
        BAD_CONTRACT_PENALTY: 0.6,
        EXPIRING_BONUS: 1.05,
        LONG_BAD_PENALTY: 0.85,
    },
    INJURY: {
        DTD_PENALTY: 0.90,
        INJURED_PENALTY: 0.10,
    },
    DEPTH: {
        MAX_PACKAGE_SIZE: 3,
        MIN_ROSTER_SIZE: 13,
        PACKAGE_WEIGHTS: [1.0, 0.8, 0.2, 0.05, 0.05],
    },
    SALARY: {
        CAP_LINE: 141,
        TAX_LINE: 171,
        APRON_1: 178,
        APRON_2: 189,
    },
    OFFERS: {
        MAX_OFFERS: 5,
        MIN_VALUE_RATIO: 0.95,
        INTEREST_VALUE_MARGIN: 0.05,
        SUPERSTAR_PROTECTION_OVR: 92,
    },
    COUNTER: {
        BALANCED_MULTIPLIER: 1.05,
        ALTERNATIVE_MULTIPLIER: 1.15,
        OVERPAY_CEILING: 1.3,
        STAR_PROTECTION_OVR: 88,
        PREMIUM_ASSET_OVR: 82,
        PREMIUM_POTENTIAL: 88,
        MAX_PACKAGE_SIZE: 4,
    },
    CPU_TRADE: {
        // 점진적 확률 곡선
        BASE_PROBABILITY: 0.05,
        MAX_PROBABILITY: 0.40,
        PROBABILITY_EXPONENT: 2.2,

        // 매칭 & 가치
        MIN_VALUE_RATIO: 0.95,
        MAX_VALUE_RATIO: 1.10,
        IMPROVEMENT_THRESHOLD: 0.02,

        // 트레이드 가능 선수 기준
        UNTOUCHABLE_OVR: 88,
        EXCESS_DEPTH_THRESHOLD: 3,
        LOW_VALUE_DUMP_OVR: 72,
        BAD_CONTRACT_SALARY_FLOOR: 12,

        // 매칭 후보
        MAX_CANDIDATE_PAIRS: 15,
        MAX_TRADES_PER_DAY: 2,
        NEAR_DEADLINE_DAYS: 14,

        // 보너스 점수
        POSITION_NEED_BONUS: 3.0,
        STAT_NEED_BONUS: 1.5,
        DEPTH_BONUS: 1.0,
        BAD_CONTRACT_DUMP_BONUS: 2.0,
    },
};

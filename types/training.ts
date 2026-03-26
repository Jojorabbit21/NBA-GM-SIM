// 훈련 시스템 타입 정의
// 오프시즌 한정, 총 훈련 포인트를 10개 프로그램에 배분하는 방식

// 10개 훈련 프로그램별 배분 포인트 (합계 ≤ totalPoints)
export interface TrainingProgramConfig {
    // 공격 훈련 (OC 담당)
    shootingTraining:      number;  // 슈팅 훈련 → midRange, threeCorner, three45, threeTop, ft, offConsist
    insideTraining:        number;  // 인사이드 훈련 → closeShot, layup, dunk, postPlay, drawFoul, hands
    playmakingTraining:    number;  // 플레이메이킹 훈련 → passAcc, handling, spdBall, passVision, offBallMovement

    // 수비 훈련 (DC 담당)
    manDefTraining:        number;  // 대인 수비 훈련 → perDef, intDef, steal, blk
    helpDefTraining:       number;  // 팀 수비 훈련 → helpDefIq, passPerc, defConsist
    reboundTraining:       number;  // 리바운드 훈련 → offReb, defReb, boxOut

    // 운동능력 훈련 (TrainingCoach 담당)
    explosivnessTraining:  number;  // 폭발력 훈련 → speed, agility, vertical
    strengthTraining:      number;  // 근력·지구력 훈련 → strength, stamina, hustle, durability

    // 전술 훈련 (HC + Dev 담당)
    offTacticsTraining:    number;  // 공격 전술 훈련 → shotIq, passIq, passVision
    defTacticsTraining:    number;  // 수비 전술 훈련 → helpDefIq, defConsist, intangibles
}

export const TRAINING_PROGRAM_KEYS = [
    'shootingTraining',
    'insideTraining',
    'playmakingTraining',
    'manDefTraining',
    'helpDefTraining',
    'reboundTraining',
    'explosivnessTraining',
    'strengthTraining',
    'offTacticsTraining',
    'defTacticsTraining',
] as const;

export type TrainingProgramKey = typeof TRAINING_PROGRAM_KEYS[number];

export const TRAINING_PROGRAM_LABELS: Record<TrainingProgramKey, string> = {
    shootingTraining:      '슈팅 훈련',
    insideTraining:        '인사이드 훈련',
    playmakingTraining:    '플레이메이킹 훈련',
    manDefTraining:        '대인 수비 훈련',
    helpDefTraining:       '팀 수비 훈련',
    reboundTraining:       '리바운드 훈련',
    explosivnessTraining:  '폭발력 훈련',
    strengthTraining:      '근력·지구력 훈련',
    offTacticsTraining:    '공격 전술 훈련',
    defTacticsTraining:    '수비 전술 훈련',
};

// 각 훈련 프로그램이 영향을 주는 능력치 목록
export const TRAINING_PROGRAM_ATTRS: Record<TrainingProgramKey, string[]> = {
    shootingTraining:      ['midRange', 'threeCorner', 'three45', 'threeTop', 'ft', 'offConsist'],
    insideTraining:        ['closeShot', 'layup', 'dunk', 'postPlay', 'drawFoul', 'hands'],
    playmakingTraining:    ['passAcc', 'handling', 'spdBall', 'passVision', 'offBallMovement'],
    manDefTraining:        ['perDef', 'intDef', 'steal', 'blk'],
    helpDefTraining:       ['helpDefIq', 'passPerc', 'defConsist'],
    reboundTraining:       ['offReb', 'defReb', 'boxOut'],
    explosivnessTraining:  ['speed', 'agility', 'vertical'],
    strengthTraining:      ['strength', 'stamina', 'hustle', 'durability'],
    offTacticsTraining:    ['shotIq', 'passIq', 'passVision'],
    defTacticsTraining:    ['helpDefIq', 'defConsist', 'intangibles'],
};

export interface TeamTrainingConfig {
    program: TrainingProgramConfig;
    budget: number;  // 훈련 예산 ($0 ~ $20,000,000)
}

// 리그 전체 팀별 훈련 설정
export type LeagueTrainingConfigs = Record<string, TeamTrainingConfig>;

// 기본 훈련 설정 (포인트 균등 배분)
export function getDefaultTrainingConfig(): TeamTrainingConfig {
    return {
        budget: 3_000_000,
        program: {
            shootingTraining:     10,
            insideTraining:       10,
            playmakingTraining:   10,
            manDefTraining:       10,
            helpDefTraining:      10,
            reboundTraining:      10,
            explosivnessTraining: 10,
            strengthTraining:     10,
            offTacticsTraining:   10,
            defTacticsTraining:   10,
        },
    };
}

// 총 훈련 포인트 계산
export function calcTotalTrainingPoints(budget: number): number {
    return Math.floor(80 + budget / 250_000);
}

// 내부 훈련 효율 계산 결과
export interface TrainingEfficiency {
    shootingEff:      number;  // 0.5~1.0
    insideEff:        number;
    playmakingEff:    number;
    manDefEff:        number;
    helpDefEff:       number;
    reboundEff:       number;
    explosivnessEff:  number;
    strengthEff:      number;
    offTacticsEff:    number;
    defTacticsEff:    number;
    globalMult:       number;  // 1.0~1.2 (HC 전체 보정)
    youngPlayerMult:  number;  // age≤25 추가 배율
    rookieMult:       number;  // age≤22 추가 배율
    totalPoints:      number;  // 80 + budget/250_000
}

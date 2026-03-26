
import {
    HeadCoach, HeadCoachPreferences, CoachAbilities, TrainingCoachAbilities,
    OffenseCoordinator, DefenseCoordinator, DevelopmentCoach, TrainingCoach,
    CoachingStaff, CoachFAPool, LeagueCoachingData, StaffRole,
} from '../../types/coaching';

// ── DB에서 로드된 스태프 데이터 싱글턴 ──
let COACH_DATA: Record<string, HeadCoach> = {};

type StaffPerTeam = {
    headCoach?: HeadCoach;
    offenseCoordinator?: OffenseCoordinator;
    defenseCoordinator?: DefenseCoordinator;
    developmentCoach?: DevelopmentCoach;
    trainingCoach?: TrainingCoach;
};
let STAFF_DATA: Record<string, StaffPerTeam> = {};

type MetaCoachRow = {
    team_id: string;
    role?: string | null;
    coach_name: string;
    preferences?: HeadCoachPreferences | string | null;
    abilities?: CoachAbilities | TrainingCoachAbilities | string | null;
    contract_years: number;
    contract_salary: number;
    contract_years_remaining: number;
};

/**
 * meta_coaches DB 데이터(전 직무)로 싱글턴 교체
 * queries.ts의 useBaseData()에서 앱 시작 시 호출
 */
export function populateStaffData(rows: MetaCoachRow[]): void {
    const newCoachData: Record<string, HeadCoach> = {};
    const newStaffData: Record<string, StaffPerTeam> = {};

    for (const row of rows) {
        const teamId = row.team_id;
        if (!newStaffData[teamId]) newStaffData[teamId] = {};

        const contractSalary = row.contract_salary < 1000
            ? Math.round(row.contract_salary * 1_000_000)
            : row.contract_salary;
        const abilities = row.abilities
            ? (typeof row.abilities === 'string' ? JSON.parse(row.abilities) : row.abilities)
            : undefined;

        const role = row.role ?? 'head_coach';

        if (role === 'head_coach') {
            const prefs = row.preferences
                ? (typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences)
                : null;
            if (!prefs) continue; // HC는 preferences 필수
            const hc: HeadCoach = {
                id: `coach_${teamId}`,
                name: row.coach_name,
                preferences: prefs,
                abilities: (abilities as CoachAbilities) ?? generateDefaultCoachAbilities(stringToHash(teamId + ':hc')),
                contractYears: row.contract_years,
                contractSalary,
                contractYearsRemaining: row.contract_years_remaining,
            };
            newCoachData[teamId] = hc;
            newStaffData[teamId].headCoach = hc;
        } else if (role === 'offense_coord') {
            newStaffData[teamId].offenseCoordinator = {
                id: `coach_oc_${teamId}`,
                name: row.coach_name,
                abilities: (abilities as CoachAbilities) ?? generateOCAbilities(stringToHash(teamId + ':oc')),
                contractYears: row.contract_years,
                contractSalary,
                contractYearsRemaining: row.contract_years_remaining,
            };
        } else if (role === 'defense_coord') {
            newStaffData[teamId].defenseCoordinator = {
                id: `coach_dc_${teamId}`,
                name: row.coach_name,
                abilities: (abilities as CoachAbilities) ?? generateDCAbilities(stringToHash(teamId + ':dc')),
                contractYears: row.contract_years,
                contractSalary,
                contractYearsRemaining: row.contract_years_remaining,
            };
        } else if (role === 'development') {
            newStaffData[teamId].developmentCoach = {
                id: `coach_dev_${teamId}`,
                name: row.coach_name,
                abilities: (abilities as CoachAbilities) ?? generateDevAbilities(stringToHash(teamId + ':dev')),
                contractYears: row.contract_years,
                contractSalary,
                contractYearsRemaining: row.contract_years_remaining,
            };
        } else if (role === 'training') {
            newStaffData[teamId].trainingCoach = {
                id: `coach_trainer_${teamId}`,
                name: row.coach_name,
                abilities: (abilities as TrainingCoachAbilities) ?? generateTrainerAbilities(stringToHash(teamId + ':trainer')),
                contractYears: row.contract_years,
                contractSalary,
                contractYearsRemaining: row.contract_years_remaining,
            };
        }
    }

    COACH_DATA = newCoachData;
    STAFF_DATA = newStaffData;
}

/**
 * @deprecated populateStaffData()로 대체 — HC 전용
 */
export function populateCoachData(rows: MetaCoachRow[]): void {
    populateStaffData(rows);
}

// ── Seeded Random Helpers ──

function stringToHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function seededNormalInt(seed: number, mean: number, stdev: number, min: number, max: number): number {
    const u1 = Math.max(0.0001, seededRandom(seed));
    const u2 = seededRandom(seed + 7919);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(min, Math.min(max, Math.round(mean + z * stdev)));
}

const FIRST_NAMES = [
    'James', 'Mike', 'Steve', 'Tom', 'Rick', 'Doc', 'Gregg', 'Erik',
    'Tyronn', 'Billy', 'Monty', 'Ime', 'Chauncey', 'Wes', 'Taylor',
    'Darvin', 'Joe', 'Mark', 'Nate', 'Dwane', 'Nick', 'Terry',
    'Quin', 'Jason', 'Kenny', 'Chris', 'Jacque', 'Willie', 'Adrian',
    'J.B.', 'Alvin', 'Scott', 'Kevin', 'Dan', 'Stephen', 'Larry',
    'Brian', 'Rex', 'Patrick', 'Marcus', 'David', 'Anthony', 'Robert',
    'Charles', 'Paul', 'Andrew', 'Ryan', 'Sean', 'Derek', 'Aaron',
];

const LAST_NAMES = [
    'Williams', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Anderson',
    'Thomas', 'Jackson', 'Harris', 'Martin', 'Thompson', 'Robinson', 'Clark',
    'Lewis', 'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Hill',
    'Scott', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Turner',
    'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart',
    'Morris', 'Rogers', 'Reed', 'Cooper', 'Bailey', 'Rivera', 'Cox',
    'Howard', 'Ward', 'Torres', 'Peterson', 'Gray', 'Ramirez',
];

function generateCoachName(seed: number): string {
    const fi = Math.floor(seededRandom(seed) * FIRST_NAMES.length);
    const li = Math.floor(seededRandom(seed + 31) * LAST_NAMES.length);
    return `${FIRST_NAMES[fi]} ${LAST_NAMES[li]}`;
}

// ── CoachAbilities 생성 (역할별 주력 능력치 편향) ──

/**
 * 기본 CoachAbilities 생성 (균등)
 */
function generateDefaultCoachAbilities(baseSeed: number): CoachAbilities {
    return {
        teaching:            seededNormalInt(baseSeed + 1,  5, 1, 2, 10),
        schemeDepth:         seededNormalInt(baseSeed + 2,  5, 1, 2, 10),
        communication:       seededNormalInt(baseSeed + 3,  5, 1, 2, 10),
        playerEval:          seededNormalInt(baseSeed + 4,  5, 1, 2, 10),
        motivation:          seededNormalInt(baseSeed + 5,  5, 1, 2, 10),
        playerRelation:      seededNormalInt(baseSeed + 6,  5, 1, 2, 10),
        adaptability:        seededNormalInt(baseSeed + 7,  5, 1, 2, 10),
        developmentVision:   seededNormalInt(baseSeed + 8,  5, 1, 2, 10),
        experienceTransfer:  seededNormalInt(baseSeed + 9,  5, 1, 2, 10),
        mentalCoaching:      seededNormalInt(baseSeed + 10, 5, 1, 2, 10),
    };
}

/**
 * HC 특화 능력치 (motivation, playerRelation, adaptability, mentalCoaching 상향)
 */
function generateHCAbilities(baseSeed: number): CoachAbilities {
    return {
        teaching:            seededNormalInt(baseSeed + 1,  5, 1, 2, 10),
        schemeDepth:         seededNormalInt(baseSeed + 2,  5, 1, 2, 10),
        communication:       seededNormalInt(baseSeed + 3,  6, 1, 3, 10),
        playerEval:          seededNormalInt(baseSeed + 4,  6, 1, 3, 10),
        motivation:          seededNormalInt(baseSeed + 5,  7, 1, 4, 10), // HC 주력
        playerRelation:      seededNormalInt(baseSeed + 6,  7, 1, 4, 10), // HC 주력
        adaptability:        seededNormalInt(baseSeed + 7,  6, 1, 3, 10), // HC 주력
        developmentVision:   seededNormalInt(baseSeed + 8,  5, 1, 2,  9),
        experienceTransfer:  seededNormalInt(baseSeed + 9,  5, 1, 2,  9),
        mentalCoaching:      seededNormalInt(baseSeed + 10, 7, 1, 4, 10), // HC 주력
    };
}

/**
 * OC 특화 능력치 (teaching, schemeDepth, communication 상향)
 */
function generateOCAbilities(baseSeed: number): CoachAbilities {
    return {
        teaching:            seededNormalInt(baseSeed + 1,  7, 1, 4, 10), // OC 주력
        schemeDepth:         seededNormalInt(baseSeed + 2,  7, 1, 4, 10), // OC 주력
        communication:       seededNormalInt(baseSeed + 3,  7, 1, 4, 10), // OC 주력
        playerEval:          seededNormalInt(baseSeed + 4,  6, 1, 3,  9),
        motivation:          seededNormalInt(baseSeed + 5,  5, 1, 2,  9),
        playerRelation:      seededNormalInt(baseSeed + 6,  5, 1, 2,  9),
        adaptability:        seededNormalInt(baseSeed + 7,  5, 1, 2,  9),
        developmentVision:   seededNormalInt(baseSeed + 8,  4, 1, 1,  8),
        experienceTransfer:  seededNormalInt(baseSeed + 9,  4, 1, 1,  8),
        mentalCoaching:      seededNormalInt(baseSeed + 10, 5, 1, 2,  8),
    };
}

/**
 * DC 특화 능력치 (teaching, schemeDepth, communication 상향 — OC와 유사 구조)
 */
function generateDCAbilities(baseSeed: number): CoachAbilities {
    return {
        teaching:            seededNormalInt(baseSeed + 1,  7, 1, 4, 10), // DC 주력
        schemeDepth:         seededNormalInt(baseSeed + 2,  7, 1, 4, 10), // DC 주력
        communication:       seededNormalInt(baseSeed + 3,  7, 1, 4, 10), // DC 주력
        playerEval:          seededNormalInt(baseSeed + 4,  6, 1, 3,  9),
        motivation:          seededNormalInt(baseSeed + 5,  5, 1, 2,  9),
        playerRelation:      seededNormalInt(baseSeed + 6,  5, 1, 2,  9),
        adaptability:        seededNormalInt(baseSeed + 7,  5, 1, 2,  9),
        developmentVision:   seededNormalInt(baseSeed + 8,  4, 1, 1,  8),
        experienceTransfer:  seededNormalInt(baseSeed + 9,  4, 1, 1,  8),
        mentalCoaching:      seededNormalInt(baseSeed + 10, 5, 1, 2,  8),
    };
}

/**
 * Dev 특화 능력치 (developmentVision, experienceTransfer, playerEval, playerRelation 상향)
 */
function generateDevAbilities(baseSeed: number): CoachAbilities {
    return {
        teaching:            seededNormalInt(baseSeed + 1,  6, 1, 3,  9),
        schemeDepth:         seededNormalInt(baseSeed + 2,  6, 1, 3,  9),
        communication:       seededNormalInt(baseSeed + 3,  6, 1, 3,  9),
        playerEval:          seededNormalInt(baseSeed + 4,  7, 1, 4, 10), // Dev 주력
        motivation:          seededNormalInt(baseSeed + 5,  6, 1, 3,  9),
        playerRelation:      seededNormalInt(baseSeed + 6,  7, 1, 4, 10), // Dev 주력
        adaptability:        seededNormalInt(baseSeed + 7,  6, 1, 3,  9),
        developmentVision:   seededNormalInt(baseSeed + 8,  7, 1, 4, 10), // Dev 주력
        experienceTransfer:  seededNormalInt(baseSeed + 9,  7, 1, 4, 10), // Dev 주력
        mentalCoaching:      seededNormalInt(baseSeed + 10, 6, 1, 3, 10), // Dev 주력
    };
}

/**
 * Trainer 특화 능력치 (athleticTraining, recovery, conditioning)
 */
function generateTrainerAbilities(baseSeed: number): TrainingCoachAbilities {
    return {
        athleticTraining: seededNormalInt(baseSeed + 1, 6, 1, 3, 10),
        recovery:         seededNormalInt(baseSeed + 2, 6, 1, 3, 10),
        conditioning:     seededNormalInt(baseSeed + 3, 6, 1, 3, 10),
    };
}

// ── 계약 생성 헬퍼 ──

function generateContract(baseSeed: number, baseSalary: number, salaryVariance: number): {
    contractYears: number;
    contractSalary: number;
    contractYearsRemaining: number;
} {
    const contractYears = seededNormalInt(baseSeed + 20, 3, 0.8, 2, 4);
    const contractSalary = Math.round(
        Math.max(500_000, seededNormalInt(baseSeed + 21, baseSalary, salaryVariance, baseSalary * 0.5, baseSalary * 2))
    );
    return { contractYears, contractSalary, contractYearsRemaining: contractYears };
}

// ── 5개 직무 생성 함수 ──

export function generateHeadCoach(teamId: string, tendencySeed: string): HeadCoach {
    if (COACH_DATA[teamId]) {
        return { ...COACH_DATA[teamId] };
    }
    const baseSeed = stringToHash(tendencySeed + ':hc:' + teamId);
    const name = generateCoachName(baseSeed);
    const preferences: HeadCoachPreferences = {
        offenseIdentity: seededNormalInt(baseSeed + 1, 5.5, 2, 1, 10),
        tempo:           seededNormalInt(baseSeed + 2, 5.5, 2, 1, 10),
        scoringFocus:    seededNormalInt(baseSeed + 3, 5.5, 2, 1, 10),
        pnrEmphasis:     seededNormalInt(baseSeed + 4, 5.5, 2, 1, 10),
        defenseStyle:    seededNormalInt(baseSeed + 5, 5.5, 2, 1, 10),
        helpScheme:      seededNormalInt(baseSeed + 6, 5.5, 2, 1, 10),
        zonePreference:  seededNormalInt(baseSeed + 7, 5.5, 2, 1, 10),
    };
    const extremity = Object.values(preferences).reduce((sum, v) => sum + Math.abs(v - 5.5), 0) / 7;
    const { contractYears, contractSalary, contractYearsRemaining } = generateContract(
        baseSeed, Math.round((6 + extremity * 2) * 1_000_000), 1_500_000
    );
    return {
        id: `coach_hc_${teamId}`,
        name,
        preferences,
        abilities: generateHCAbilities(baseSeed + 100),
        contractYears,
        contractSalary,
        contractYearsRemaining,
    };
}

export function generateOffenseCoordinator(seed: string): OffenseCoordinator {
    const baseSeed = stringToHash(seed);
    const { contractYears, contractSalary, contractYearsRemaining } = generateContract(
        baseSeed, 2_500_000, 800_000
    );
    return {
        id: `coach_oc_${baseSeed}`,
        name: generateCoachName(baseSeed),
        abilities: generateOCAbilities(baseSeed + 100),
        contractYears,
        contractSalary,
        contractYearsRemaining,
    };
}

export function generateDefenseCoordinator(seed: string): DefenseCoordinator {
    const baseSeed = stringToHash(seed);
    const { contractYears, contractSalary, contractYearsRemaining } = generateContract(
        baseSeed, 2_500_000, 800_000
    );
    return {
        id: `coach_dc_${baseSeed}`,
        name: generateCoachName(baseSeed),
        abilities: generateDCAbilities(baseSeed + 100),
        contractYears,
        contractSalary,
        contractYearsRemaining,
    };
}

export function generateDevelopmentCoach(seed: string): DevelopmentCoach {
    const baseSeed = stringToHash(seed);
    const { contractYears, contractSalary, contractYearsRemaining } = generateContract(
        baseSeed, 2_000_000, 600_000
    );
    return {
        id: `coach_dev_${baseSeed}`,
        name: generateCoachName(baseSeed),
        abilities: generateDevAbilities(baseSeed + 100),
        contractYears,
        contractSalary,
        contractYearsRemaining,
    };
}

export function generateTrainingCoach(seed: string): TrainingCoach {
    const baseSeed = stringToHash(seed);
    const { contractYears, contractSalary, contractYearsRemaining } = generateContract(
        baseSeed, 1_500_000, 500_000
    );
    return {
        id: `coach_trainer_${baseSeed}`,
        name: generateCoachName(baseSeed),
        abilities: generateTrainerAbilities(baseSeed + 100),
        contractYears,
        contractSalary,
        contractYearsRemaining,
    };
}

// ── 리그 전체 스태프 생성 ──

/**
 * 30팀 전체 CoachingStaff 생성
 * DB 헤드코치 데이터 우선 반영, 나머지 직무는 시드 기반 생성
 */
export function generateLeagueStaff(teamIds: string[], tendencySeed: string): LeagueCoachingData {
    const data: LeagueCoachingData = {};

    for (const teamId of teamIds) {
        const staffDb = STAFF_DATA[teamId];
        const ocSeed  = `${tendencySeed}:oc:${teamId}`;
        const dcSeed  = `${tendencySeed}:dc:${teamId}`;
        const devSeed = `${tendencySeed}:dev:${teamId}`;
        const trSeed  = `${tendencySeed}:trainer:${teamId}`;

        data[teamId] = {
            headCoach:          staffDb?.headCoach          ?? generateHeadCoach(teamId, tendencySeed),
            offenseCoordinator: staffDb?.offenseCoordinator ?? generateOffenseCoordinator(ocSeed),
            defenseCoordinator: staffDb?.defenseCoordinator ?? generateDefenseCoordinator(dcSeed),
            developmentCoach:   staffDb?.developmentCoach   ?? generateDevelopmentCoach(devSeed),
            trainingCoach:      staffDb?.trainingCoach      ?? generateTrainingCoach(trSeed),
        };
    }

    return data;
}

/**
 * 기존 LeagueCoachingData에서 모든 슬롯이 채워지지 않은 팀 보완
 */
export function ensureFullStaff(data: LeagueCoachingData, teamIds: string[], tendencySeed: string): LeagueCoachingData {
    const result = { ...data };
    for (const teamId of teamIds) {
        const existing = result[teamId] ?? {};
        if (!existing.headCoach) {
            existing.headCoach = generateHeadCoach(teamId, tendencySeed);
        }
        if (!existing.offenseCoordinator) {
            existing.offenseCoordinator = generateOffenseCoordinator(`${tendencySeed}:oc:${teamId}`);
        }
        if (!existing.defenseCoordinator) {
            existing.defenseCoordinator = generateDefenseCoordinator(`${tendencySeed}:dc:${teamId}`);
        }
        if (!existing.developmentCoach) {
            existing.developmentCoach = generateDevelopmentCoach(`${tendencySeed}:dev:${teamId}`);
        }
        if (!existing.trainingCoach) {
            existing.trainingCoach = generateTrainingCoach(`${tendencySeed}:trainer:${teamId}`);
        }
        result[teamId] = existing as CoachingStaff;
    }
    return result;
}

// ── FA 코치 풀 생성 ──

const FA_POOL_SIZES: Record<StaffRole, number> = {
    headCoach:          10,
    offenseCoordinator: 12,
    defenseCoordinator: 12,
    developmentCoach:   10,
    trainingCoach:       8,
};

/**
 * 코치 FA 풀 초기 생성
 * 각 직무별 FA_POOL_SIZES 만큼 생성
 */
export function generateCoachFAPool(tendencySeed: string): CoachFAPool {
    const pool: CoachFAPool = {
        headCoaches:         [],
        offenseCoordinators: [],
        defenseCoordinators: [],
        developmentCoaches:  [],
        trainingCoaches:     [],
    };

    for (let i = 0; i < FA_POOL_SIZES.headCoach; i++) {
        pool.headCoaches.push(generateHeadCoach(`fa_hc_${i}`, tendencySeed));
    }
    for (let i = 0; i < FA_POOL_SIZES.offenseCoordinator; i++) {
        pool.offenseCoordinators.push(generateOffenseCoordinator(`${tendencySeed}:fa_oc_${i}`));
    }
    for (let i = 0; i < FA_POOL_SIZES.defenseCoordinator; i++) {
        pool.defenseCoordinators.push(generateDefenseCoordinator(`${tendencySeed}:fa_dc_${i}`));
    }
    for (let i = 0; i < FA_POOL_SIZES.developmentCoach; i++) {
        pool.developmentCoaches.push(generateDevelopmentCoach(`${tendencySeed}:fa_dev_${i}`));
    }
    for (let i = 0; i < FA_POOL_SIZES.trainingCoach; i++) {
        pool.trainingCoaches.push(generateTrainingCoach(`${tendencySeed}:fa_trainer_${i}`));
    }

    return pool;
}

// ── 기존 호환 함수 ──

/**
 * @deprecated generateLeagueStaff()로 대체
 */
export function generateLeagueCoaches(teamIds: string[], tendencySeed: string): LeagueCoachingData {
    return generateLeagueStaff(teamIds, tendencySeed);
}

/**
 * 특정 팀의 코치 선호값 가져오기 (없으면 undefined)
 */
export function getCoachPreferences(
    coachingData: LeagueCoachingData | null | undefined,
    teamId: string
): HeadCoachPreferences | undefined {
    return coachingData?.[teamId]?.headCoach?.preferences;
}


import {
    Coach, HeadCoach, HeadCoachPreferences, CoachAbilities,
    OffenseCoordinator, DefenseCoordinator, DevelopmentCoach, TrainingCoach,
    CoachingStaff, CoachFAPool, LeagueCoachingData, StaffRole,
} from '../../types/coaching';


// ── DB에서 로드된 스태프 데이터 싱글턴 ──
let COACH_DATA: Record<string, Coach> = {};

type StaffPerTeam = {
    headCoach?: Coach;
    offenseCoordinator?: Coach;
    defenseCoordinator?: Coach;
    developmentCoach?: Coach;
    trainingCoach?: Coach;
};
let STAFF_DATA: Record<string, StaffPerTeam> = {};

let COACH_FA_DATA: CoachFAPool = { coaches: [] };

// ── 새 DB 스키마: id(UUID) + base_attributes JSONB ──
type CoachBaseAttributes = {
    role: 'hc' | 'oc' | 'dc' | 'dev' | 'tr' | null;
    current_team: string | null;
    age?: number | null;
    abilities?: CoachAbilities | null;
    preferences?: HeadCoachPreferences | null;
    contract: { years: number; salary: number; years_remaining: number };
};

type MetaCoachRow = {
    id: string;
    coach_name: string;
    base_attributes: CoachBaseAttributes | string;
};

/**
 * meta_coaches DB 데이터(전 직무)로 싱글턴 교체.
 * current_team이 null인 코치는 FA풀로 분류.
 * queries.ts의 useBaseData()에서 앱 시작 시 호출
 */
export function populateStaffData(rows: MetaCoachRow[]): void {
    const newCoachData: Record<string, Coach> = {};
    const newStaffData: Record<string, StaffPerTeam> = {};
    const newFAData: CoachFAPool = { coaches: [] };

    for (const row of rows) {
        const attrs: CoachBaseAttributes = typeof row.base_attributes === 'string'
            ? JSON.parse(row.base_attributes)
            : row.base_attributes;

        const { role, current_team: teamId, contract } = attrs;
        const contractSalary = contract.salary < 1000
            ? Math.round(contract.salary * 1_000_000)
            : contract.salary;
        const idSeed = stringToHash(row.id);

        const coach: Coach = {
            id: row.id,
            name: row.coach_name,
            age: attrs.age ?? generateCoachAge(idSeed),
            abilities: attrs.abilities ?? generateCoachAbilities(idSeed),
            preferences: attrs.preferences ?? generatePreferences(idSeed),
            contractYears: contract.years,
            contractSalary,
            contractYearsRemaining: contract.years_remaining,
        };

        if (!teamId) {
            // FA 풀 — role=null, 슬롯 무관
            newFAData.coaches.push(coach);
        } else {
            if (!newStaffData[teamId]) newStaffData[teamId] = {};
            if (role === 'hc') {
                newCoachData[teamId] = coach;
                newStaffData[teamId].headCoach = coach;
            } else if (role === 'oc') {
                newStaffData[teamId].offenseCoordinator = coach;
            } else if (role === 'dc') {
                newStaffData[teamId].defenseCoordinator = coach;
            } else if (role === 'dev') {
                newStaffData[teamId].developmentCoach = coach;
            } else if (role === 'tr') {
                newStaffData[teamId].trainingCoach = coach;
            }
        }
    }

    COACH_DATA = newCoachData;
    STAFF_DATA = newStaffData;
    COACH_FA_DATA = newFAData;
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

const COACH_FIRST_NAMES = [
    '에런', '아담', '앨런', '앤디', '배리', '벤', '빌', '밥', '브래드', '브라이언',
    '카를로스', '채드', '크리스', '크레이그', '댄', '데이브', '데니스', '데릭', '돈', '더그',
    '드류', '에드', '에릭', '프랭크', '프레드', '게리', '조지', '글렌', '그렉', '잭',
    '제임스', '제이슨', '제이', '제프', '제리', '짐', '조', '존', '조쉬', '저스틴',
    '키스', '케빈', '래리', '루크', '마크', '매트', '마이클', '마이크', '네이트', '닉',
    '팻', '폴', '필', '랜디', '레이', '릭', '롭', '론', '라이언', '샘',
    '스콧', '숀', '스탠', '스티브', '테일러', '테리', '팀', '토드', '톰', '토니',
    '트래비스', '타일러', '빅터', '웨이드', '월터', '웨인', '윌',
];

const COACH_LAST_NAMES = [
    '애덤스', '앨런', '앤더슨', '베이커', '반스', '벨', '브라운', '번스', '카터', '클라크',
    '콜', '콜린스', '쿡', '쿠퍼', '콕스', '데이비스', '에드워즈', '에반스', '피셔', '포스터',
    '가르시아', '깁슨', '그레이엄', '그랜트', '그린', '그리핀', '홀', '해리스', '하트', '힐',
    '하워드', '휴즈', '헌터', '잭슨', '젠킨스', '존슨', '존스', '조던', '켈리', '킹',
    '리', '루이스', '롱', '마틴', '마르티네스', '밀러', '미첼', '무어', '모건', '모리스',
    '넬슨', '파커', '패터슨', '필립스', '프라이스', '리드', '리처드슨', '로버츠', '로빈슨', '로저스',
    '로스', '스콧', '심슨', '스미스', '스튜어트', '테일러', '토마스', '톰슨', '터너', '워커',
    '워드', '왓슨', '화이트', '윌리엄스', '윌슨', '우드', '라이트', '영',
];

function generateCoachName(seed: number): string {
    const fi = Math.floor(seededRandom(seed) * COACH_FIRST_NAMES.length);
    const li = Math.floor(seededRandom(seed + 31) * COACH_LAST_NAMES.length);
    return `${COACH_FIRST_NAMES[fi]} ${COACH_LAST_NAMES[li]}`;
}

// ── CoachPreferences / Age 생성 ──

/** 7개 전술 선호도 생성 — 모든 코치 공통 */
function generatePreferences(baseSeed: number): HeadCoachPreferences {
    return {
        offenseIdentity: seededNormalInt(baseSeed + 1,  5.5, 2, 1, 10),
        tempo:           seededNormalInt(baseSeed + 2,  5.5, 2, 1, 10),
        scoringFocus:    seededNormalInt(baseSeed + 3,  5.5, 2, 1, 10),
        pnrEmphasis:     seededNormalInt(baseSeed + 4,  5.5, 2, 1, 10),
        defenseStyle:    seededNormalInt(baseSeed + 5,  5.5, 2, 1, 10),
        helpScheme:      seededNormalInt(baseSeed + 6,  5.5, 2, 1, 10),
        zonePreference:  seededNormalInt(baseSeed + 7,  5.5, 2, 1, 10),
    };
}

/** 코치 나이 생성 — 35~72, 평균 48 */
function generateCoachAge(baseSeed: number): number {
    return seededNormalInt(baseSeed + 500, 48, 8, 35, 72);
}

// ── CoachAbilities 생성 ──

/**
 * 코치 전체 수준 1~10. min(U1,U2)×10 → 가파른 우측 치우침.
 * P(q≤3)≈51%, P(q≤5)≈75%, P(q≥8)≈4%
 */
function coachQuality(seed: number): number {
    const u1 = seededRandom(seed);
    const u2 = seededRandom(seed + 1009);
    return Math.max(1, Math.min(10, Math.round(Math.min(u1, u2) * 10)));
}

/** quality 주변 ±2 noise로 개별 능력치 생성 */
function abilityVal(seed: number, quality: number): number {
    const noise = seededNormalInt(seed, 0, 1, -2, 2);
    return Math.max(1, Math.min(10, quality + noise));
}

/**
 * 모든 코치 공통 13개 능력치 생성 (슬롯 무관).
 * quality가 전체 수준을 결정, 각 능력치는 ±2 noise로 독립 생성.
 */
function generateCoachAbilities(baseSeed: number): CoachAbilities {
    const q = coachQuality(baseSeed);
    return {
        teaching:           abilityVal(baseSeed + 1,  q),
        schemeDepth:        abilityVal(baseSeed + 2,  q),
        communication:      abilityVal(baseSeed + 3,  q),
        playerEval:         abilityVal(baseSeed + 4,  q),
        motivation:         abilityVal(baseSeed + 5,  q),
        playerRelation:     abilityVal(baseSeed + 6,  q),
        adaptability:       abilityVal(baseSeed + 7,  q),
        developmentVision:  abilityVal(baseSeed + 8,  q),
        experienceTransfer: abilityVal(baseSeed + 9,  q),
        mentalCoaching:     abilityVal(baseSeed + 10, q),
        athleticTraining:   abilityVal(baseSeed + 11, q),
        recovery:           abilityVal(baseSeed + 12, q),
        conditioning:       abilityVal(baseSeed + 13, q),
    };
}

// ── 역할별 연봉 밴드 ──

const SALARY_BANDS: Record<StaffRole, { min: number; max: number }> = {
    headCoach:          { min: 3_000_000, max: 15_000_000 },
    offenseCoordinator: { min:   600_000, max:  3_500_000 },
    defenseCoordinator: { min:   600_000, max:  3_500_000 },
    developmentCoach:   { min:   200_000, max:  2_000_000 },
    trainingCoach:      { min:   150_000, max:  1_200_000 },
};

// ── OVR 계산 ──

/** 역할별 핵심 능력치 가중 평균 → 1~10 OVR (abilities 직접 받음) */
function calcOVRFromAbilities(abilities: CoachAbilities, role: StaffRole): number {
    const a = abilities;
    if (role === 'trainingCoach') {
        return Math.round((a.athleticTraining + a.recovery + a.conditioning) / 3);
    }
    if (role === 'developmentCoach') {
        const vals = [a.teaching, a.developmentVision, a.experienceTransfer, a.communication, a.playerRelation, a.motivation];
        return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    }
    if (role === 'offenseCoordinator' || role === 'defenseCoordinator') {
        const vals = [a.schemeDepth, a.adaptability, a.communication, a.teaching, a.mentalCoaching, a.playerEval];
        return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    }
    // headCoach: 코칭 능력치 10개 평균
    const vals = [a.teaching, a.schemeDepth, a.communication, a.playerEval, a.motivation,
                  a.playerRelation, a.adaptability, a.developmentVision, a.experienceTransfer, a.mentalCoaching];
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

/** 코치 OVR (외부 공개) */
export function calcCoachOVR(coach: Coach, role: StaffRole): number {
    return calcOVRFromAbilities(coach.abilities, role);
}

/**
 * 코치 요구 연봉.
 * @param situation 'fa' = FA 신규 영입 (시장가), 'extension' = 계약 연장 (10% 잔류 할인)
 */
export function calcCoachDemandSalary(
    coach: Coach,
    role: StaffRole,
    situation: 'fa' | 'extension' = 'fa',
): number {
    const { min, max } = SALARY_BANDS[role];
    // Anchor demand to the coach's actual contractSalary, not a fresh OVR-based market calc.
    // FA: demand 10% premium over previous salary; extension: slight discount for loyalty.
    const base = situation === 'extension'
        ? Math.round(coach.contractSalary * 0.95)
        : Math.round(coach.contractSalary * 1.1);
    return Math.max(min, Math.min(max, base));
}

// ── 계약 생성 헬퍼 ──

/** OVR 기반 계약 생성 — 시드 편차 ±15% */
function generateContractByOVR(baseSeed: number, ovr: number, role: StaffRole): {
    contractYears: number;
    contractSalary: number;
    contractYearsRemaining: number;
} {
    const { min, max } = SALARY_BANDS[role];
    const contractYears = seededNormalInt(baseSeed + 20, 3, 0.8, 2, 4);
    const base = Math.round(min + (max - min) * ((ovr - 1) / 9));
    const variance = Math.round(base * 0.15);
    const contractSalary = Math.max(min, Math.min(max,
        seededNormalInt(baseSeed + 21, base, variance, min, max)
    ));
    return { contractYears, contractSalary, contractYearsRemaining: contractYears };
}

// ── 5개 직무 생성 함수 ──

export function generateHeadCoach(teamId: string, tendencySeed: string): HeadCoach {
    if (COACH_DATA[teamId]) {
        return { ...COACH_DATA[teamId] };
    }
    const baseSeed = stringToHash(tendencySeed + ':hc:' + teamId);
    const abilities = generateCoachAbilities(baseSeed + 100);
    const ovr = calcOVRFromAbilities(abilities, 'headCoach');
    const { contractYears, contractSalary, contractYearsRemaining } = generateContractByOVR(baseSeed, ovr, 'headCoach');
    return {
        id: `coach_hc_${teamId}`,
        name: generateCoachName(baseSeed),
        age: generateCoachAge(baseSeed),
        preferences: generatePreferences(baseSeed),
        abilities,
        contractYears,
        contractSalary,
        contractYearsRemaining,
    };
}

export function generateOffenseCoordinator(seed: string): OffenseCoordinator {
    const baseSeed = stringToHash(seed);
    const abilities = generateCoachAbilities(baseSeed + 100);
    const ovr = calcOVRFromAbilities(abilities, 'offenseCoordinator');
    const { contractYears, contractSalary, contractYearsRemaining } = generateContractByOVR(baseSeed, ovr, 'offenseCoordinator');
    return {
        id: `coach_oc_${baseSeed}`,
        name: generateCoachName(baseSeed),
        age: generateCoachAge(baseSeed),
        preferences: generatePreferences(baseSeed),
        abilities,
        contractYears,
        contractSalary,
        contractYearsRemaining,
    };
}

export function generateDefenseCoordinator(seed: string): DefenseCoordinator {
    const baseSeed = stringToHash(seed);
    const abilities = generateCoachAbilities(baseSeed + 100);
    const ovr = calcOVRFromAbilities(abilities, 'defenseCoordinator');
    const { contractYears, contractSalary, contractYearsRemaining } = generateContractByOVR(baseSeed, ovr, 'defenseCoordinator');
    return {
        id: `coach_dc_${baseSeed}`,
        name: generateCoachName(baseSeed),
        age: generateCoachAge(baseSeed),
        preferences: generatePreferences(baseSeed),
        abilities,
        contractYears,
        contractSalary,
        contractYearsRemaining,
    };
}

export function generateDevelopmentCoach(seed: string): DevelopmentCoach {
    const baseSeed = stringToHash(seed);
    const abilities = generateCoachAbilities(baseSeed + 100);
    const ovr = calcOVRFromAbilities(abilities, 'developmentCoach');
    const { contractYears, contractSalary, contractYearsRemaining } = generateContractByOVR(baseSeed, ovr, 'developmentCoach');
    return {
        id: `coach_dev_${baseSeed}`,
        name: generateCoachName(baseSeed),
        age: generateCoachAge(baseSeed),
        preferences: generatePreferences(baseSeed),
        abilities,
        contractYears,
        contractSalary,
        contractYearsRemaining,
    };
}

export function generateTrainingCoach(seed: string): TrainingCoach {
    const baseSeed = stringToHash(seed);
    const abilities = generateCoachAbilities(baseSeed + 100);
    const ovr = calcOVRFromAbilities(abilities, 'trainingCoach');
    const { contractYears, contractSalary, contractYearsRemaining } = generateContractByOVR(baseSeed, ovr, 'trainingCoach');
    return {
        id: `coach_trainer_${baseSeed}`,
        name: generateCoachName(baseSeed),
        age: generateCoachAge(baseSeed),
        preferences: generatePreferences(baseSeed),
        abilities,
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
 * 코치 FA 풀 반환.
 * DB에 FA 코치(current_team=null)가 있으면 그것을 우선 사용.
 * 없으면 시드 기반으로 생성(폴백).
 */
export function generateCoachFAPool(tendencySeed: string): CoachFAPool {
    if (COACH_FA_DATA.coaches.length > 0) return { coaches: [...COACH_FA_DATA.coaches] };

    // 폴백: DB에 FA 코치가 없을 때 코드 생성 (슬롯 무관 — 역할은 headCoach로 OVR 계산)
    const total = Object.values(FA_POOL_SIZES).reduce((a, b) => a + b, 0);
    const coaches: Coach[] = [];
    for (let i = 0; i < total; i++) {
        const seed = stringToHash(`${tendencySeed}:fa:${i}`);
        const abilities = generateCoachAbilities(seed + 100);
        // FA 풀은 슬롯 무관이므로 일반 코칭 능력치(headCoach 기준)로 OVR 산출 후
        // OC/DC 밴드 범위로 계약 생성 (중간 티어 기준)
        const ovr = calcOVRFromAbilities(abilities, 'offenseCoordinator');
        const { contractYears, contractSalary, contractYearsRemaining } = generateContractByOVR(seed, ovr, 'offenseCoordinator');
        coaches.push({
            id: `fa_coach_${seed}`,
            name: generateCoachName(seed),
            age: generateCoachAge(seed),
            preferences: generatePreferences(seed),
            abilities,
            contractYears,
            contractSalary,
            contractYearsRemaining,
        });
    }
    return { coaches };
}

// ── 기존 세이브 마이그레이션 ──

/**
 * 세이브에서 로드된 코치에 age/preferences가 없으면 시드 기반으로 채워줌.
 * (이전 버전 세이브 데이터 호환용)
 */
export function normalizeCoach(raw: any): Coach {
    const idSeed = stringToHash(raw.id ?? '');
    return {
        ...raw,
        age:         raw.age         ?? generateCoachAge(idSeed),
        preferences: raw.preferences ?? generatePreferences(idSeed),
        abilities:   raw.abilities   ?? generateCoachAbilities(idSeed),
    };
}

/** CoachingStaff 전체를 normalizeCoach 적용 */
export function normalizeCoachingData(raw: any): LeagueCoachingData {
    const result: LeagueCoachingData = {};
    for (const [teamId, staff] of Object.entries(raw ?? {})) {
        const s = staff as any;
        result[teamId] = {
            headCoach:          s.headCoach          ? normalizeCoach(s.headCoach)          : null,
            offenseCoordinator: s.offenseCoordinator ? normalizeCoach(s.offenseCoordinator) : null,
            defenseCoordinator: s.defenseCoordinator ? normalizeCoach(s.defenseCoordinator) : null,
            developmentCoach:   s.developmentCoach   ? normalizeCoach(s.developmentCoach)   : null,
            trainingCoach:      s.trainingCoach       ? normalizeCoach(s.trainingCoach)       : null,
        };
    }
    return result;
}

/** CoachFAPool 전체를 normalizeCoach 적용 */
export function normalizeCoachFAPool(raw: any): CoachFAPool {
    if (!raw?.coaches) return { coaches: [] };
    return { coaches: (raw.coaches as any[]).map(normalizeCoach) };
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

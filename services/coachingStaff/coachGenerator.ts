
import { HeadCoach, HeadCoachPreferences, CoachingStaff, LeagueCoachingData } from '../../types/coaching';

// ── DB에서 로드된 코치 데이터 싱글턴 (single source of truth) ──

let COACH_DATA: Record<string, HeadCoach> = {};

/**
 * meta_coaches DB 데이터로 싱글턴 교체
 * queries.ts의 useBaseData()에서 앱 시작 시 호출
 */
export function populateCoachData(rows: { team_id: string; coach_name: string; preferences: HeadCoachPreferences | string; contract_years: number; contract_salary: number; contract_years_remaining: number }[]): void {
    const newData: Record<string, HeadCoach> = {};
    for (const row of rows) {
        const prefs = typeof row.preferences === 'string'
            ? JSON.parse(row.preferences) : row.preferences;
        newData[row.team_id] = {
            id: `coach_${row.team_id}`,
            name: row.coach_name,
            preferences: prefs,
            contractYears: row.contract_years,
            contractSalary: row.contract_salary,
            contractYearsRemaining: row.contract_years_remaining,
        };
    }
    COACH_DATA = newData;
}

// ── Seeded Random Helpers (DB에 없는 팀용 fallback) ──

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
    'Brian', 'Rex', 'Patrick', 'Marcus',
];

const LAST_NAMES = [
    'Williams', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Anderson',
    'Thomas', 'Jackson', 'Harris', 'Martin', 'Thompson', 'Robinson', 'Clark',
    'Lewis', 'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Hill',
    'Scott', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Turner',
    'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart',
    'Morris', 'Rogers', 'Reed',
];

function generateCoachName(seed: number): string {
    const fi = Math.floor(seededRandom(seed) * FIRST_NAMES.length);
    const li = Math.floor(seededRandom(seed + 31) * LAST_NAMES.length);
    return `${FIRST_NAMES[fi]} ${LAST_NAMES[li]}`;
}

// ── 코치 생성 ──

/**
 * 팀 ID 기반 코치 조회
 * DB 데이터에 있으면 반환, 없으면 시드 기반 랜덤 생성 (fallback)
 */
export function generateHeadCoach(teamId: string, tendencySeed: string): HeadCoach {
    // DB 데이터 우선
    if (COACH_DATA[teamId]) {
        return { ...COACH_DATA[teamId] };
    }
    // fallback: 시드 기반 랜덤 생성 (DB 미로드 또는 커스텀 팀)
    const baseSeed = stringToHash(tendencySeed + ':coach:' + teamId);

    const name = generateCoachName(baseSeed);

    const preferences: HeadCoachPreferences = {
        offenseIdentity: seededNormalInt(baseSeed + 1, 5.5, 2, 1, 10),
        tempo: seededNormalInt(baseSeed + 2, 5.5, 2, 1, 10),
        scoringFocus: seededNormalInt(baseSeed + 3, 5.5, 2, 1, 10),
        pnrEmphasis: seededNormalInt(baseSeed + 4, 5.5, 2, 1, 10),
        defenseStyle: seededNormalInt(baseSeed + 5, 5.5, 2, 1, 10),
        helpScheme: seededNormalInt(baseSeed + 6, 5.5, 2, 1, 10),
        zonePreference: seededNormalInt(baseSeed + 7, 5.5, 2, 1, 10),
    };

    const extremity = Object.values(preferences).reduce((sum, v) => sum + Math.abs(v - 5.5), 0) / 7;
    const contractYears = seededNormalInt(baseSeed + 10, 3, 0.8, 2, 4);
    const contractSalary = Math.round(5 + extremity * 2);

    return {
        id: `coach_${teamId}`,
        name,
        preferences,
        contractYears,
        contractSalary,
        contractYearsRemaining: contractYears,
    };
}

/**
 * 30팀 전체 코칭 데이터 생성
 * DB 데이터를 베이스로, 누락 팀은 시드 기반 생성
 */
export function generateLeagueCoaches(teamIds: string[], tendencySeed: string): LeagueCoachingData {
    const data: LeagueCoachingData = {};
    // DB에 로드된 데이터 우선 반영
    for (const [teamId, coach] of Object.entries(COACH_DATA)) {
        data[teamId] = { headCoach: { ...coach } };
    }
    // 누락된 팀은 시드 기반 생성
    for (const teamId of teamIds) {
        if (!data[teamId]) {
            data[teamId] = {
                headCoach: generateHeadCoach(teamId, tendencySeed),
            };
        }
    }
    return data;
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

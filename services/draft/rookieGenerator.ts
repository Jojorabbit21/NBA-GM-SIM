/**
 * 신인 선수 생성기
 *
 * 드래프트 클래스를 자동 생성한다.
 * 각 선수의 base_attributes는 meta_players와 동일한 JSONB 형식으로,
 * mapRawPlayerToRuntimePlayer() 파이프라인과 완전 호환.
 *
 * 생성 로직:
 * 1. 포지션 분배 (PG 6, SG 6, SF 6, PF 6, C 6 = 30명 기본)
 * 2. 능력치 프로파일: 순위(rank)에 따른 기본 능력치 → 포지션별 편향 적용
 * 3. 포텐셜: 상위 픽 후보일수록 높은 pot
 * 4. 계약: 루키 스케일 (슬롯별 고정 금액)
 */

import { GeneratedPlayerRow } from '../../types/generatedPlayer';

// ── 상수 ──

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

/** 37개 스킬 (CSV 단축키) */
const SKILL_KEYS = [
    'close', 'mid', '3c', '3_45', '3t', 'ft', 'siq', 'ocon',
    'lay', 'dnk', 'post', 'draw', 'hands',
    'pacc', 'handl', 'spwb', 'piq', 'pvis', 'obm',
    'idef', 'pdef', 'stl', 'blk', 'hdef', 'pper', 'dcon',
    'oreb', 'dreb', 'box',
    'spd', 'agi', 'str', 'vert', 'sta', 'hus', 'dur',
] as const;

/** 포지션별 주요 스킬 가중치 (높을수록 해당 포지션에서 높은 값 생성) */
const POSITION_SKILL_BIAS: Record<string, Partial<Record<typeof SKILL_KEYS[number], number>>> = {
    PG: { pacc: 12, handl: 10, spwb: 8, piq: 12, pvis: 12, '3c': 6, '3_45': 6, '3t': 8, spd: 8, agi: 6, siq: 10, obm: 5 },
    SG: { mid: 8, '3c': 8, '3_45': 10, '3t': 10, close: 8, siq: 8, ocon: 8, ft: 6, spd: 5, agi: 5, draw: 5 },
    SF: { mid: 6, '3c': 5, '3_45': 5, '3t': 5, lay: 6, close: 6, pdef: 6, hdef: 5, dreb: 5, str: 4, vert: 4 },
    PF: { lay: 8, dnk: 8, post: 6, idef: 8, dreb: 8, oreb: 6, blk: 5, str: 6, vert: 6, hands: 6, box: 5 },
    C: { post: 10, dnk: 8, idef: 10, blk: 10, dreb: 10, oreb: 8, str: 8, vert: 6, hands: 8, box: 8, dur: 5 },
};

/** 포지션별 약점 스킬 (낮게 생성) */
const POSITION_SKILL_PENALTY: Record<string, Partial<Record<typeof SKILL_KEYS[number], number>>> = {
    PG: { post: -10, idef: -5, blk: -10, oreb: -8, dreb: -3, str: -5, dnk: -3 },
    SG: { post: -8, idef: -3, blk: -8, oreb: -5 },
    SF: {},
    PF: { '3t': -5, pacc: -5, handl: -5, spwb: -8, piq: -3, pvis: -3 },
    C: { '3c': -8, '3_45': -10, '3t': -10, handl: -10, spwb: -10, pacc: -5, piq: -5, pvis: -5, spd: -5, agi: -5, pdef: -5, stl: -3 },
};

/** 신인 연봉 슬롯 (1~30픽, 단위: $) — NBA 루키 스케일 기반 간소화 */
const ROOKIE_SALARIES: number[] = [
    12_000_000, 10_800_000, 9_700_000, 8_800_000, 8_000_000,  // 1-5
    7_200_000,  6_500_000,  5_900_000, 5_400_000, 5_000_000,  // 6-10
    4_600_000,  4_300_000,  4_000_000, 3_700_000, 3_500_000,  // 11-15
    3_300_000,  3_100_000,  2_900_000, 2_700_000, 2_500_000,  // 16-20
    2_400_000,  2_300_000,  2_200_000, 2_100_000, 2_000_000,  // 21-25
    1_900_000,  1_800_000,  1_800_000, 1_700_000, 1_700_000,  // 26-30
];

/** 키 범위 (cm) — 포지션별 */
const HEIGHT_RANGES: Record<string, [number, number]> = {
    PG: [180, 193],
    SG: [190, 200],
    SF: [196, 206],
    PF: [200, 211],
    C: [206, 218],
};

/** 몸무게 범위 (kg) — 포지션별 */
const WEIGHT_RANGES: Record<string, [number, number]> = {
    PG: [77, 93],
    SG: [84, 100],
    SF: [93, 109],
    PF: [100, 116],
    C: [107, 125],
};

// ── 이름 생성 데이터 ──

const FIRST_NAMES = [
    'James', 'Marcus', 'Jaylen', 'Darius', 'Isaiah', 'Malik', 'Tre', 'DeAndre',
    'Jordan', 'Cameron', 'Brandon', 'Tyrese', 'Jalen', 'Coby', 'Keldon',
    'Anfernee', 'Immanuel', 'Desmond', 'Keegan', 'Jabari', 'Chet', 'Paolo',
    'Scoot', 'Victor', 'Amen', 'Ausar', 'Zach', 'Donovan', 'Jarace', 'Reed',
    'AJ', 'Cason', 'Keyonte', 'Kobe', 'Dereck', 'Gradey', 'Tari', 'Leonard',
    'Nikola', 'Yves', 'Bilal', 'Terquavion', 'Taylor', 'Kris', 'Brandin',
    'Andre', 'Dariq', 'Maxwell', 'Jett', 'Trayce', 'Colby', 'Sidy', 'Jaylin',
    'Mouhamed', 'Kel\'el', 'Jalen', 'Toumani', 'Brice', 'Noah', 'Julian',
];

const LAST_NAMES = [
    'Williams', 'Johnson', 'Brown', 'Smith', 'Davis', 'Thompson', 'Harris',
    'Robinson', 'Walker', 'Mitchell', 'Carter', 'Jackson', 'Young', 'Green',
    'Murray', 'Henderson', 'Wallace', 'Bridges', 'Washington', 'Cunningham',
    'Holmgren', 'Banchero', 'Wembanyama', 'Thompson', 'Howard', 'Miller',
    'Griffin', 'Sensabaugh', 'Sheppard', 'Whitmore', 'Hendricks', 'Eason',
    'Missi', 'Coulibaly', 'Ware', 'Edey', 'Risacher', 'Castle', 'Clingan',
    'Topic', 'Buzelis', 'Filipowski', 'Dick', 'Hood-Schifino', 'Podziemski',
    'Lewis', 'Whitehead', 'Jones', 'Clark', 'Dillingham', 'Walter', 'Cissoko',
    'Diallo', 'Gueye', 'Ware', 'Camara', 'Salaun', 'Clowney', 'Phillips',
];

// ── PRNG (시드 기반) ──

class SeededRandom {
    private state: number;

    constructor(seed: string) {
        // Simple hash → seed
        let h = 0;
        for (let i = 0; i < seed.length; i++) {
            h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
        }
        this.state = Math.abs(h) || 1;
    }

    /** 0~1 균일 분포 */
    next(): number {
        // xorshift32
        this.state ^= this.state << 13;
        this.state ^= this.state >> 17;
        this.state ^= this.state << 5;
        return Math.abs(this.state % 1000000) / 1000000;
    }

    /** min~max 정수 (양 끝 포함) */
    intRange(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /** 정규분포 근사 (Box-Muller) */
    normal(mean: number, stddev: number): number {
        const u1 = Math.max(0.0001, this.next());
        const u2 = this.next();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z * stddev;
    }

    /** 배열 셔플 */
    shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}

// ── 핵심 함수 ──

/**
 * 드래프트 클래스 생성
 *
 * @param userId    사용자 ID
 * @param seasonNumber  시즌 번호 (1 = 첫 시즌)
 * @param seed      결정론적 시드 (tendencySeed + seasonNumber 조합 권장)
 * @param count     생성할 선수 수 (기본 60)
 * @returns         GeneratedPlayerRow 배열 (DB 저장용)
 */
export function generateDraftClass(
    userId: string,
    seasonNumber: number,
    seed: string,
    count: number = 60
): GeneratedPlayerRow[] {
    const rng = new SeededRandom(`${seed}_draft_${seasonNumber}`);
    const players: GeneratedPlayerRow[] = [];

    // 포지션 배분: 균등 분배 + 나머지 랜덤
    const positionPool: string[] = [];
    const perPos = Math.floor(count / POSITIONS.length);
    for (const pos of POSITIONS) {
        for (let i = 0; i < perPos; i++) positionPool.push(pos);
    }
    const remaining = count - positionPool.length;
    for (let i = 0; i < remaining; i++) {
        positionPool.push(POSITIONS[rng.intRange(0, POSITIONS.length - 1)]);
    }
    const shuffledPositions = rng.shuffle(positionPool);

    // 이름 풀 셔플
    const firstNames = rng.shuffle([...FIRST_NAMES]);
    const lastNames = rng.shuffle([...LAST_NAMES]);

    for (let i = 0; i < count; i++) {
        const position = shuffledPositions[i];
        const rank = i + 1; // 1 = 가장 높은 재능

        // 이름 생성 (중복 허용하되 최대한 다양하게)
        const firstName = firstNames[i % firstNames.length];
        const lastName = lastNames[i % lastNames.length];
        const name = `${firstName} ${lastName}`;

        // 나이: 19~23, 상위 픽은 19~20이 많음
        const ageBias = rank <= 10 ? 0 : rank <= 20 ? 1 : 2;
        const age = Math.min(23, Math.max(19, 19 + ageBias + (rng.next() < 0.4 ? 1 : 0)));

        // 키/몸무게
        const [hMin, hMax] = HEIGHT_RANGES[position];
        const [wMin, wMax] = WEIGHT_RANGES[position];
        const height = rng.intRange(hMin, hMax);
        const weight = rng.intRange(wMin, wMax);

        // 능력치 생성
        const attrs = generateAttributes(rng, position, rank, count);

        // 포텐셜: 상위 순위일수록 높은 pot
        const potBase = rank <= 5 ? 88 : rank <= 14 ? 82 : rank <= 30 ? 76 : 70;
        const pot = clamp(Math.round(rng.normal(potBase, 4)), 65, 98);

        // 연봉
        const salarySlot = Math.min(rank, 30) - 1;
        const salary = ROOKIE_SALARIES[salarySlot] ?? 1_700_000;

        // 계약 (4년 루키 스케일)
        const yearSalaries = [
            salary,
            Math.round(salary * 1.05),
            Math.round(salary * 1.10),
            Math.round(salary * 1.15),
        ];

        const baseAttributes: Record<string, any> = {
            ...attrs,
            pot,
            height,
            weight,
            contract: {
                years: yearSalaries,
                currentYear: 0,
                type: 'rookie',
            },
        };

        const id = `gen_${generateUUID(rng)}`;

        players.push({
            id,
            user_id: userId,
            season_number: seasonNumber,
            draft_pick: null,
            draft_team_id: null,
            status: 'fa',
            base_attributes: {
                name,
                position,
                age,
                salary,
                contractYears: 4,
                ...baseAttributes,
            },
            age_at_draft: age,
        });
    }

    return players;
}

// ── 내부 함수 ──

/**
 * 능력치 생성
 * rank 기반 기본 레벨 + 포지션별 편향 + 랜덤 변동
 */
function generateAttributes(
    rng: SeededRandom,
    position: string,
    rank: number,
    totalCount: number
): Record<string, number> {
    // rank → 기본 능력치 레벨 (상위 픽일수록 높음)
    // rank 1 → baseLevel ~72, rank 30 → ~55, rank 60 → ~45
    const t = (rank - 1) / (totalCount - 1); // 0~1, 0=최고
    const baseLevel = Math.round(72 - t * 27); // 72 → 45

    const attrs: Record<string, number> = {};
    const biases = POSITION_SKILL_BIAS[position] ?? {};
    const penalties = POSITION_SKILL_PENALTY[position] ?? {};

    for (const key of SKILL_KEYS) {
        const bias = biases[key] ?? 0;
        const penalty = penalties[key] ?? 0;

        // 기본값 + 포지션 편향 + 랜덤 변동
        const variation = rng.normal(0, 6);
        const raw = baseLevel + bias + penalty + variation;

        attrs[key] = clamp(Math.round(raw), 25, 90);
    }

    return attrs;
}

function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

function generateUUID(rng: SeededRandom): string {
    const hex = '0123456789abcdef';
    const segments = [8, 4, 4, 4, 12];
    return segments.map(len => {
        let s = '';
        for (let i = 0; i < len; i++) {
            s += hex[Math.floor(rng.next() * 16)];
        }
        return s;
    }).join('-');
}

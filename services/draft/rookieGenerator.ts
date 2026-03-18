/**
 * 신인 선수 생성기
 *
 * 드래프트 클래스를 자동 생성한다.
 * 각 선수의 base_attributes는 meta_players와 동일한 JSONB 형식으로,
 * mapRawPlayerToRuntimePlayer() 파이프라인과 완전 호환.
 *
 * 생성 로직:
 * 1. 클래스 품질(classGrade) 결정 — 풍작/흉작 변동
 * 2. 포지션 분배 — 불균형 (시드에 따라 8~16명)
 * 3. 능력치 프로파일: 순위(rank)에 따른 기본 능력치 → 포지션별 편향 적용
 * 4. 포텐셜: classGrade 반영 + 제너레이셔널 탤런트 초희귀 롤
 * 5. 이름: 다문화 풀 (~180개 이름/성)
 * 6. 계약: 루키 스케일 (슬롯별 고정 금액)
 */

import { GeneratedPlayerRow } from '../../types/generatedPlayer';
import { PlayerContract } from '../../types/player';

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
export const ROOKIE_SALARIES: number[] = [
    12_000_000, 10_800_000, 9_700_000, 8_800_000, 8_000_000,  // 1-5
    7_200_000,  6_500_000,  5_900_000, 5_400_000, 5_000_000,  // 6-10
    4_600_000,  4_300_000,  4_000_000, 3_700_000, 3_500_000,  // 11-15
    3_300_000,  3_100_000,  2_900_000, 2_700_000, 2_500_000,  // 16-20
    2_400_000,  2_300_000,  2_200_000, 2_100_000, 2_000_000,  // 21-25
    1_900_000,  1_800_000,  1_800_000, 1_700_000, 1_700_000,  // 26-30
];

/** 키 범위 (cm) — 포지션별 */
const HEIGHT_RANGES: Record<string, [number, number]> = {
    PG: [178, 198],
    SG: [183, 203],
    SF: [195, 205],
    PF: [200, 211],
    C: [206, 225],
};

/** 몸무게 범위 (kg) — 포지션별 */
const WEIGHT_RANGES: Record<string, [number, number]> = {
    PG: [77, 98],
    SG: [77, 100],
    SF: [93, 109],
    PF: [100, 116],
    C: [107, 125],
};

// ── 다문화 이름 풀 (~180 first / ~180 last) ──

interface NamePool {
    first: string[];
    last: string[];
    weight: number; // 선택 가중치 (합계 = 1.0)
}

const NAME_POOLS: NamePool[] = [
    // 아프리칸 아메리칸 (~40%) — first ~72, last ~72
    // 일반적인 흑인 이름/성 (실존 NBA 선수와 겹치지 않도록 가상 조합)
    {
        weight: 0.40,
        first: [
            '데릭', '저메인', '마르셀', '타이론', '앙투안', '라숀', '디언',
            '자보리스', '트레본', '케샤드', '라마르', '타이릭', '디마커스', '마키스',
            '자리우스', '케드릭', '라퀸', '트레바', '디온테', '마르텔',
            '자콰리', '안타비어스', '드웨인', '케온', '라본', '타이셔',
            '디마리오', '잘릴', '트레일', '케몬트', '안토니오', '드루',
            '마이카', '자메인', '라셀', '키드', '트레메인', '디앤젤로',
            '마르케스', '자린', '라토니', '케이난', '트리스탄', '디마르',
            '칼릴', '안타완', '라마이클', '타이리', '제본', '마르쿠스',
            '케이쇼', '드렐', '자이릭', '라다리우스', '트레비우스', '키몬',
            '안타니', '디셔', '마르비스', '자브릴', '라킨', '타이번',
            '케이던', '드라몬', '잘라드', '라니어', '트레언', '마카이',
            '디론', '자이엘', '케이시', '라몬트', '타이릭', '안도니',
        ],
        last: [
            '페리', '커밍스', '배넌', '크로포드', '레인', '파우더스',
            '벨포드', '하먼', '크리든', '맥피', '스탠포드', '블레이크리',
            '콜드웰', '하스킨스', '프레즐리', '마운트', '셀던', '로이스턴',
            '타운즈리', '배링턴', '플레밍', '크레인', '하켓', '밀번',
            '스탠턴', '볼드윈', '프리먼', '켄달', '하우저', '맥카시',
            '스코필드', '베닝턴', '프레임', '코너', '하이타워', '메이슨',
            '스파이비', '블랜차드', '포틀랜드', '클레이본', '허친슨', '맥그래스',
            '실즈', '뱅크스', '펀더벅', '카펜터', '에버렛', '매킨리',
            '셀비', '바이넘', '프라이어', '크로스비', '해밀턴', '모건필드',
            '시어러', '블랙웰', '파슨스', '클링턴', '헤이즈먼', '맥도웰',
            '소머빌', '보더스', '플래너건', '콜맨', '허드슨', '메이필드',
            '스톤', '밴더빌트', '펠튼', '커닝스', '엘우드', '뉴섬',
        ],
    },
    // 유럽 (동유럽/서유럽/발칸) (~20%) — first ~36, last ~36
    {
        weight: 0.20,
        first: [
            '밀란', '드라간', '스테판', '마르코', '알렉산다르', '블라디미르', '이반',
            '토마시', '야쿠프', '아담', '미로슬라프', '바츨라프', '줄리앙', '마티유',
            '피에르', '앙투안', '마테오', '로렌초', '엔리코', '줄리오',
            '빌헬름', '하인츠', '프리드리히', '카를', '에밀', '라르스',
            '스벤', '에릭', '요한', '클라우스', '안드레이', '세르게이',
            '드미트리', '파벨', '일리야', '아르템',
        ],
        last: [
            '코바체비치', '페트로비치', '밀로셰비치', '스토야코비치', '라도비치', '쿠즈마노비치',
            '드라기치', '토도로비치', '시모노비치', '브라노비치', '마르코비치', '칼리니치',
            '노바첵', '드보르작', '코발스키', '라디체비치', '벨린스키', '푸소',
            '가르시아', '몬테로', '브루니', '콘테', '쉰들러', '한센',
            '크리스텐센', '볼트', '벡스트롬', '칼손', '코즐로프', '모로조프',
            '레베데프', '소콜로프', '바실리예프', '셰르바코프', '마체크', '보고슬라프스키',
        ],
    },
    // 히스패닉/라틴 (~10%) — first ~18, last ~18
    {
        weight: 0.10,
        first: [
            '에밀리아노', '마테오', '로드리고', '페르난도', '에스테반', '알바로', '이그나시오',
            '루시아노', '에두아르도', '마르코스', '엔리케', '발렌틴', '카밀로',
            '레오나르도', '호나우두', '라미로', '곤살로', '다미안',
        ],
        last: [
            '카스티요', '몬토야', '에스코바르', '아길라르', '세르반테스', '카마초', '델가도',
            '피게로아', '갈레고스', '이바라', '라미레즈', '나바로', '오르테가', '팔렌시아',
            '킨타나', '리베라', '솔리스', '발데즈',
        ],
    },
    // 아프리칸 (서/동아프리카) (~10%) — first ~18, last ~18
    {
        weight: 0.10,
        first: [
            '이브라힘', '아마두', '오마르', '유수프', '이사', '알리우', '카디',
            '살리우', '마마두', '압둘라이', '모디보', '바카리', '코나테', '아부',
            '치디', '은나디', '오비나', '에메카',
        ],
        last: [
            '투레', '시소코', '카네', '바', '시세', '키타', '드라메',
            '사노', '상가레', '콘데', '잔코', '디우프', '사르', '디아뉴',
            '오누', '에제', '우구아', '오비',
        ],
    },
    // 아시안/퍼시픽 (~5%) — first ~9, last ~9
    {
        weight: 0.05,
        first: [
            '다이키', '소라', '히로토', '류타', '켄토', '타쿠미', '유마',
            '하루키', '코이치',
        ],
        last: [
            '나카무라', '사사키', '이토', '오카다', '모리', '후지타',
            '마츠모토', '하야시', '야마시타',
        ],
    },
    // 앵글로/기타 백인 (~15%) — first ~27, last ~27
    {
        weight: 0.15,
        first: [
            '브렌던', '콜턴', '트래비스', '가렛', '딜런', '웨슬리', '닐',
            '랜든', '프레스턴', '코너', '대런', '커티스', '스펜서', '와이어트',
            '매튜', '네이선', '배럿', '카슨', '세스', '저스틴', '재러드',
            '스카일러', '마일스', '블레이크', '로건', '피어스', '대시엘',
        ],
        last: [
            '크로스', '하트', '피셔', '랜드', '셰퍼드', '칼라일', '번스',
            '웹스터', '워필드', '클레이턴', '마샬', '프랭클린', '하몬드', '벡스터',
            '펄킨스', '머레이', '브래드포드', '서머스', '월턴', '챈들러', '아처',
            '필딩', '커크', '래드포드', '엘리엇', '가필드', '엘스워스',
        ],
    },
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

    /** 가중 확률 선택 (weights 합 = 1.0) */
    weightedIndex(weights: number[]): number {
        const r = this.next();
        let cumulative = 0;
        for (let i = 0; i < weights.length; i++) {
            cumulative += weights[i];
            if (r < cumulative) return i;
        }
        return weights.length - 1;
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

    // ── 클래스 품질 결정 ──
    const classGrade = rng.normal(0, 1); // 표준정규분포: >1.5 풍작, <-1.5 흉작
    const potOffset = clamp(Math.round(classGrade * 3), -5, 5);

    // ── 포지션 분배: 불균형 ──
    const positionPool = buildPositionPool(rng, count);
    const shuffledPositions = rng.shuffle(positionPool);

    // ── 이름 풀 문화권별 셔플 ──
    const poolWeights = NAME_POOLS.map(p => p.weight);

    for (let i = 0; i < count; i++) {
        const position = shuffledPositions[i];
        const rank = i + 1; // 1 = 가장 높은 재능

        // 이름 생성 (문화권 가중 선택 → 해당 풀에서 랜덤)
        const name = generateName(rng, poolWeights);

        // 나이: 19~23, 상위 픽은 19~20이 많음
        const ageBias = rank <= 10 ? 0 : rank <= 20 ? 1 : 2;
        const age = Math.min(23, Math.max(19, 19 + ageBias + (rng.next() < 0.4 ? 1 : 0)));

        // 키/몸무게
        const height = generateHeight(rng, position);
        const [wMin, wMax] = WEIGHT_RANGES[position];
        const weight = rng.intRange(wMin, wMax);

        // 능력치 생성
        const attrs = generateAttributes(rng, position, rank, count);

        // 포텐셜: classGrade 반영 + 제너레이셔널 탤런트 롤
        const pot = generatePotential(rng, rank, potOffset);

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

// ── 루키 계약 엔진 ──

/** 2라운드 픽 최저 연봉 */
const SECOND_ROUND_SALARY = 1_500_000;

/**
 * 픽 순번에 맞는 루키 계약을 생성한다.
 * - 1라운드 (1~30픽): 4년 루키 스케일, 매년 5% 인상
 * - 2라운드 (31~60픽): 2년 최저 연봉 계약
 *
 * 드래프트 완료 시 호출하여 생성 순서 기반 임시 계약을 실제 픽 순번 계약으로 교체한다.
 */
export function calcRookieContract(pickNumber: number): PlayerContract {
    if (pickNumber <= 30) {
        const salary = ROOKIE_SALARIES[pickNumber - 1] ?? ROOKIE_SALARIES[29];
        return {
            years: [
                salary,
                Math.round(salary * 1.05),
                Math.round(salary * 1.10),
                Math.round(salary * 1.15),
            ],
            currentYear: 0,
            type: 'rookie',
        };
    }
    // 2라운드: 2년 최저 연봉
    return {
        years: [
            SECOND_ROUND_SALARY,
            Math.round(SECOND_ROUND_SALARY * 1.05),
        ],
        currentYear: 0,
        type: 'rookie',
    };
}

// ── 내부 함수 ──

/**
 * 불균형 포지션 풀 생성
 * 포지션별 인원을 정규분포로 결정 (8~16), 합계를 count에 맞춤
 */
function buildPositionPool(rng: SeededRandom, count: number): string[] {
    const base = Math.floor(count / POSITIONS.length); // 12
    const counts: number[] = [];

    // 각 포지션 인원: 정규분포(base, 2.5), 8~16 clamp
    for (let i = 0; i < POSITIONS.length; i++) {
        counts.push(clamp(Math.round(rng.normal(base, 2.5)), 8, 16));
    }

    // 합계 보정: count에 맞추기
    let sum = counts.reduce((a, b) => a + b, 0);
    while (sum !== count) {
        if (sum > count) {
            // 가장 많은 포지션에서 1명 제거
            const maxIdx = counts.indexOf(Math.max(...counts));
            if (counts[maxIdx] > 8) { counts[maxIdx]--; sum--; }
            else break;
        } else {
            // 가장 적은 포지션에 1명 추가
            const minIdx = counts.indexOf(Math.min(...counts));
            if (counts[minIdx] < 16) { counts[minIdx]++; sum++; }
            else break;
        }
    }

    const pool: string[] = [];
    for (let i = 0; i < POSITIONS.length; i++) {
        for (let j = 0; j < counts[i]; j++) {
            pool.push(POSITIONS[i]);
        }
    }
    return pool;
}

/**
 * 키 생성 — 센터는 좌편향 분포 (큰 키일수록 희귀)
 */
function generateHeight(rng: SeededRandom, position: string): number {
    const [hMin, hMax] = HEIGHT_RANGES[position];
    if (position === 'C') {
        // 지수적 감소: hMin 근처 밀집, hMax에 가까울수록 급격히 희귀
        const raw = hMin + (hMax - hMin) * (1 - Math.pow(rng.next(), 2.5));
        return clamp(Math.round(raw), hMin, hMax);
    }
    return rng.intRange(hMin, hMax);
}

/**
 * 포텐셜 생성
 * classGrade 기반 오프셋 + 제너레이셔널 탤런트 초희귀 롤
 */
function generatePotential(rng: SeededRandom, rank: number, potOffset: number): number {
    // 제너레이셔널 탤런트: 1~5픽 한정, 3% 확률
    if (rank <= 5 && rng.next() < 0.03) {
        return rng.intRange(95, 99);
    }

    const potBase = rank <= 5 ? 82 : rank <= 14 ? 76 : rank <= 30 ? 70 : 65;
    return clamp(Math.round(rng.normal(potBase + potOffset, 4)), 55, 99);
}

/**
 * 다문화 이름 생성
 * 문화권을 가중 확률로 선택 → 해당 풀에서 이름/성 랜덤 선택
 */
function generateName(rng: SeededRandom, poolWeights: number[]): string {
    const poolIdx = rng.weightedIndex(poolWeights);
    const pool = NAME_POOLS[poolIdx];
    const first = pool.first[Math.floor(rng.next() * pool.first.length)];
    const last = pool.last[Math.floor(rng.next() * pool.last.length)];
    return `${first} ${last}`;
}

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
    // rank 1 → baseLevel ~65, rank 30 → ~51, rank 60 → ~43
    const t = (rank - 1) / (totalCount - 1); // 0~1, 0=최고
    const baseLevel = Math.round(65 - t * 22); // 65 → 43

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

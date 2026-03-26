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
import { CareerSeasonStat, ContractType, PlayerContract, PlayerPopularity } from '../../types/player';
import { LEAGUE_FINANCIALS } from '../../utils/constants';

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

/** 루키 스케일 기준 캡 (2025-26 시즌 고정) */
const _ROOKIE_BASE_CAP = 154_647_000;

/** 신인 연봉 슬롯 (1~30픽, 단위: $) — 2025-26 기준값, calcRookieContract()에서 현재 캡 비율로 보정됨 */
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

        // 연봉 (현재 캡 기준 비율 보정)
        const capScale = LEAGUE_FINANCIALS.SALARY_CAP / _ROOKIE_BASE_CAP;
        const salarySlot = Math.min(rank, 30) - 1;
        const salary = Math.round((ROOKIE_SALARIES[salarySlot] ?? 1_700_000) * capScale);

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
    const capScale = LEAGUE_FINANCIALS.SALARY_CAP / _ROOKIE_BASE_CAP;
    if (pickNumber <= 30) {
        const salary = Math.round((ROOKIE_SALARIES[pickNumber - 1] ?? ROOKIE_SALARIES[29]) * capScale);
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
    const secondRound = Math.round(SECOND_ROUND_SALARY * capScale);
    return {
        years: [
            secondRound,
            Math.round(secondRound * 1.05),
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
    return buildAttrMap(rng, position, baseLevel);
}

function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

/** baseLevel을 직접 받아 포지션 편향/패널티를 적용한 능력치 맵 생성 */
function buildAttrMap(rng: SeededRandom, position: string, baseLevel: number): Record<string, number> {
    const attrs: Record<string, number> = {};
    const biases = POSITION_SKILL_BIAS[position] ?? {};
    const penalties = POSITION_SKILL_PENALTY[position] ?? {};
    for (const key of SKILL_KEYS) {
        const bias = biases[key] ?? 0;
        const penalty = penalties[key] ?? 0;
        const variation = rng.normal(0, 6);
        attrs[key] = clamp(Math.round(baseLevel + bias + penalty + variation), 25, 90);
    }
    return attrs;
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

// ── 초기 FA 풀 히스토리 생성 헬퍼 ──

/**
 * 포지션/티어별 NBA 입단 나이 추정
 * High 티어(tierIdx=0)는 일찍 입단하는 경향, Low 티어는 늦은 경향
 */
function getEntryAge(position: string, tierIdx: number, rng: SeededRandom): number {
    // 포지션별 기본 범위 (min, max)
    const posRanges: Record<string, [number, number]> = {
        PG: [19, 22],
        SG: [19, 22],
        SF: [19, 23],
        PF: [19, 23],
        C: [20, 23],
    };
    const [minAge, maxAge] = posRanges[position] ?? [19, 23];
    // 티어가 높을수록(0) 일찍 입단 (min~min+1), 낮을수록 늦게 입단 (max-1~max)
    const tierBias = tierIdx === 0 ? -1 : tierIdx === 1 ? 0 : 1;
    const biasedMin = clamp(minAge + tierBias, minAge, maxAge - 1);
    const biasedMax = clamp(maxAge + tierBias, biasedMin + 1, maxAge);
    return rng.intRange(biasedMin, biasedMax);
}

/** 2025-26 루키 스케일 Year 1 연봉 (1~30픽, 인덱스 0=1픽) */
const ROOKIE_SCALE_Y1: readonly number[] = [
    14_758_000, 13_081_000, 11_486_000, 10_291_000,  9_397_000,
     8_679_000,  8_067_000,  7_567_000,  7_137_000,  6_792_000,
     6_532_000,  6_314_000,  6_109_000,  5_945_000,  5_786_000,
     5_673_000,  5_554_000,  5_454_000,  5_355_000,  5_280_000,
     5_205_000,  5_132_000,  5_077_000,  5_020_000,  4_966_000,
     4_923_000,  4_869_000,  4_828_000,  4_787_000,  4_747_000,
] as const;
const ROOKIE_SCALE_RAISE = 0.08;   // 루키 스케일 연간 인상률

/** 드래프트 정보 */
type DraftInfo = { round: 1 | 2 | null; pick: number | null };

/**
 * 능력치(OVR)에 따라 드래프트 라운드/픽 번호를 생성한다.
 * usedPicks로 연도별 중복 배정을 방지한다.
 * - 1라운드: 1~30픽, 2라운드: 31~60픽, null: 언드래프트
 */
function generateDraftPick(
    approxOvr: number,
    draftYear: number,
    usedPicks: Map<number, Set<number>>,
    rng: SeededRandom,
): DraftInfo {
    const yearUsed = usedPicks.get(draftYear) ?? new Set<number>();
    if (!usedPicks.has(draftYear)) usedPicks.set(draftYear, yearUsed);

    // OVR 기반 선호 픽 범위 결정
    let pickRange: [number, number] | null;
    if (approxOvr >= 84)      pickRange = [1,  5];
    else if (approxOvr >= 78) pickRange = [1, 14];
    else if (approxOvr >= 72) pickRange = [15, 30];
    else if (approxOvr >= 66) pickRange = rng.next() < 0.30 ? [25, 30] : [31, 45];
    else if (approxOvr >= 58) pickRange = rng.next() < 0.65 ? [31, 60] : null;
    else                      pickRange = rng.next() < 0.25 ? [45, 60] : null;

    if (pickRange == null) return { round: null, pick: null };

    const [min, max] = pickRange;
    // 선호 범위 내 미사용 픽 → 소진 시 1~60 전체 폴백
    const preferred = Array.from({ length: max - min + 1 }, (_, i) => min + i)
        .filter(p => !yearUsed.has(p));
    const pool = preferred.length > 0
        ? preferred
        : Array.from({ length: 60 }, (_, i) => i + 1).filter(p => !yearUsed.has(p));

    if (pool.length === 0) return { round: null, pick: null }; // 해당 연도 전 픽 소진

    const pick = pool[rng.intRange(0, pool.length - 1)];
    yearUsed.add(pick);
    return { round: pick <= 30 ? 1 : 2, pick };
}

/**
 * 드래프트 픽 기반 직전 계약 생성 (CBA 규정 준수)
 *
 * yos <= 4:
 *   1라운드 → 루키 스케일 계약 (NBA CBA 필수, 슬롯 연봉 × 1.08/yr)
 *   2라운드 / 언드래프트 → 미니멈 수준
 * yos > 4: 루키 이후 베테랑/미니멈 계약 (FA 오퍼 역산)
 */
function generatePrevContract(
    draftInfo: DraftInfo,
    yos: number,
    salary: number,
    faType: ContractType,
    rng: SeededRandom,
): { years: number[]; type: ContractType } {
    if (yos <= 4) {
        if (draftInfo.round === 1 && draftInfo.pick != null) {
            // 1라운드: 루키 스케일 (4년 계약 중 yos년분)
            const year1 = ROOKIE_SCALE_Y1[draftInfo.pick - 1];
            const years = Array.from(
                { length: yos },
                (_, i) => Math.round(year1 * Math.pow(1 + ROOKIE_SCALE_RAISE, i))
            );
            return { years, type: 'rookie' };
        }
        // 2라운드 / 언드래프트: 미니멈 수준 단기 계약
        const base = draftInfo.round === 2 ? 2_100_000 : 1_930_000;
        return {
            years: Array.from({ length: yos }, (_, i) => Math.round(base * Math.pow(1.05, i))),
            type: 'min',
        };
    }

    // yos > 4: 루키 이후 계약 (FA 오퍼 연봉 기반 역산)
    const rate = 0.05;
    const aav = salary * (0.85 + rng.next() * 0.30);
    const len = yos >= 7 ? rng.intRange(3, 5) : rng.intRange(2, 4);
    const factors = Array.from({ length: len }, (_, i) => Math.pow(1 + rate, i));
    const base = Math.round(aav * len / factors.reduce((a, b) => a + b, 0));
    return { years: factors.map(f => Math.round(base * f)), type: faType };
}

/**
 * 능력치 기반 직전 시즌 성적 생성 — CareerSeasonStat 형식
 * PlayerDetailView 기록 탭과 NegotiationScreen 직전 시즌 섹션에서 공통 사용
 */
function generateCareerStatRow(
    attrs: Record<string, number>,
    position: string,
    ovr: number,
    age: number,
    seasonStartYear: number,  // 시즌 시작 연도 (예: 2024 → "2024-25")
    team: string,
    rng: SeededRandom
): CareerSeasonStat {
    // ±15% 분산 적용 헬퍼
    const vary = (val: number): number => {
        const factor = 1 + (rng.next() * 0.30 - 0.15);
        return Math.max(0, val * factor);
    };

    const isBig = position === 'PF' || position === 'C';
    const isGuard = position === 'PG' || position === 'SG';

    // GP, GS, MIN
    const gp = rng.intRange(40, 75);
    const starterRate = ovr >= 75 ? 0.90 : ovr >= 65 ? 0.60 : 0.25;
    const gs = Math.round(gp * clamp(rng.next() * starterRate + (ovr >= 75 ? 0.05 : 0), 0, 1));
    const baseMpg = ovr >= 80 ? 30 : ovr >= 70 ? 24 : ovr >= 60 ? 20 : 16;
    const min = clamp(Math.round(vary(baseMpg)), 14, 36);

    // 2점슛 성공률 — close/lay/siq 기반 (내부 계산용, 직접 저장 안 함)
    const twoPtBase = ((attrs['close'] ?? 60) + (attrs['lay'] ?? 60) + (attrs['siq'] ?? 65)) / 3;
    const twoPt_pct = clamp(vary(twoPtBase / 250 + 0.32), 0.38, 0.72);

    // 3P% (avg attr~50 → ~33%, elite~85 → ~41%)
    const threeBase = ((attrs['3c'] ?? 50) + (attrs['3_45'] ?? 50) + (attrs['3t'] ?? 50)) / 3;
    const fg3_pct = clamp(Math.round(vary(threeBase / 450 + 0.22) * 1000) / 1000, 0.20, 0.45);

    // FT% (attr 70 → ~76%, attr 85 → ~85%)
    const ftBase = attrs['ft'] ?? 70;
    const ft_pct = clamp(Math.round(vary(ftBase / 170 + 0.35) * 1000) / 1000, 0.40, 0.95);

    // FGA per game — OVR 기반 사용률
    const baseUsage = ovr >= 80 ? 0.26 : ovr >= 70 ? 0.21 : ovr >= 60 ? 0.17 : 0.14;
    const fga = clamp(Math.round(vary(min * baseUsage) * 10) / 10, 3, 22);

    // 3PA per game — 포지션별 3점 성향
    const threePARate = isGuard ? 0.44 : position === 'SF' ? 0.33 : 0.13;
    const fg3a = clamp(Math.round(vary(fga * threePARate) * 10) / 10, 0, fga * 0.75);

    // FG% = 2점슛/3점슛 성공의 가중 평균 (3점 시도 비중 반영)
    const twoPA = Math.max(fga - fg3a, 0);
    const fg_pct = clamp(
        Math.round(((twoPA * twoPt_pct + fg3a * fg3_pct) / (fga || 1)) * 1000) / 1000,
        0.30, 0.65
    );

    // FTA per game — per-36분 기준 능력치 산출 후 실제 분 환산
    const ftaPer36 = (attrs['draw'] ?? 55) / 10 - 2.5; // draw=60→3.5, draw=80→5.5
    const fta = clamp(Math.round(vary(Math.max(0.8, ftaPer36) * min / 36) * 10) / 10, 0.3, 9);

    // Makes per game
    const fgm = Math.round(fga * fg_pct * 10) / 10;
    const fg3m = Math.round(fg3a * fg3_pct * 10) / 10;
    const ftm = Math.round(fta * ft_pct * 10) / 10;

    // pts = 2*FGM + FG3M + FTM  (FG3M already counted once in FGM)
    const pts = Math.round((2 * fgm + fg3m + ftm) * 10) / 10;

    // REB — per-36분 기준 환산 (출전시간과 비례해 자연스러운 커리어 아크 형성)
    const rebBase = ((attrs['oreb'] ?? 55) + (attrs['dreb'] ?? 55)) / 2;
    const posFactor = position === 'C' ? 1.4 : position === 'PF' ? 1.2 : position === 'SF' ? 0.9 : 0.6;
    const rebPer36 = (rebBase - 50) / 6 * posFactor + 5 * posFactor;
    const reb = clamp(Math.round(vary(rebPer36 * min / 36) * 10) / 10, 0.5, 15);
    const orebRatio = isBig ? 0.33 : 0.18;
    const oreb = Math.round(reb * orebRatio * 10) / 10;
    const dreb = Math.round((reb - oreb) * 10) / 10;

    // AST — per-36분 기준 환산
    const passBase = ((attrs['pacc'] ?? 55) + (attrs['piq'] ?? 55)) / 2;
    const guardFactor = position === 'PG' ? 1.5 : position === 'SG' ? 0.9 : position === 'SF' ? 0.7 : 0.4;
    const astPer36 = (passBase - 50) / 5 * guardFactor + 2 * guardFactor;
    const ast = clamp(Math.round(vary(astPer36 * min / 36) * 10) / 10, 0.5, 12);

    // STL, BLK, TOV, PF — per-36분 기준 환산
    const stlBase = ((attrs['pdef'] ?? 55) + (attrs['stl'] ?? 55)) / 2;
    const stlPer36 = (stlBase - 50) / 15 + 0.9;
    const stl = clamp(Math.round(vary(stlPer36 * min / 36) * 10) / 10, 0.3, 3.0);

    const blkBase = ((attrs['idef'] ?? 55) + (attrs['blk'] ?? 55)) / 2;
    const centerFactor = position === 'C' ? 1.5 : position === 'PF' ? 1.1 : 0.5;
    const blkPer36 = (blkBase - 50) / 15 * centerFactor + 0.6 * centerFactor;
    const blk = clamp(Math.round(vary(blkPer36 * min / 36) * 10) / 10, 0.1, 3.5);

    const tov = clamp(Math.round(vary(ast * 0.20 + 0.5) * 10) / 10, 0.3, 4.0);
    const pf = clamp(Math.round(vary(2.8 * min / 36) * 10) / 10, 1.0, 4.0);

    // Advanced stats
    const ts_pct = Math.round(pts / (2 * (fga + 0.44 * fta) || 1) * 1000) / 1000;
    const efg_pct = Math.round((fgm + 0.5 * fg3m) / (fga || 1) * 1000) / 1000;
    const tov_pct = Math.round(tov / ((fga + 0.44 * fta + tov) || 1) * 1000) / 1000;
    const fg3a_rate = Math.round(fg3a / (fga || 1) * 1000) / 1000;
    const fta_rate = Math.round(fta / (fga || 1) * 1000) / 1000;

    // 시즌 문자열: "2024-25" 형식
    const season = `${seasonStartYear}-${String(seasonStartYear + 1).slice(-2)}`;

    return {
        season,
        team,
        age,
        gp, gs, min, pts,
        oreb, dreb, reb, ast, stl, blk, tov, pf,
        fgm, fga, fg3m, fg3a, ftm, fta,
        fg_pct, fg3_pct, ft_pct,
        ts_pct, efg_pct, tov_pct, fg3a_rate, fta_rate,
    };
}

/**
 * 시즌별 OVR 커리어 아크 계산
 * 현재 OVR에서 역산해 해당 시즌 나이에 맞는 OVR 추정:
 * - 전성기(28세) 이전: 선형 성장
 * - 전성기 이후: 0.75 OVR/년 하락
 */
const ROOKIE_ENTRY_AGE = 18; // NBA 최소 입단 나이 (ratio 기준점)

/** 30개 팀 약어 (생성 선수 커리어 팀 배정용) */
const NBA_TEAM_IDS = [
    'atl','bos','bkn','cha','chi','cle','dal','den','det','gs',
    'hou','ind','law','lam','mem','mia','mil','min','no','nyk',
    'okc','orl','phi','phx','por','sac','sa','tor','uta','was',
] as const;

/**
 * yos 시즌 분량의 팀 시퀀스를 생성한다.
 * - 매 시즌 약 22% 확률로 팀 이동 (평균 4~5시즌 한 팀 체류)
 * - 스타(ovr ≥ 75)는 이동 빈도 약간 낮춤 (더 오래 한 팀에 머묾)
 */
function generateTeamSequence(yos: number, ovr: number, rng: SeededRandom): string[] {
    const moveProb = ovr >= 75 ? 0.17 : 0.23;
    const teams: string[] = [];
    let current = NBA_TEAM_IDS[rng.intRange(0, NBA_TEAM_IDS.length - 1)];
    for (let i = 0; i < yos; i++) {
        if (i > 0 && rng.next() < moveProb) {
            // 같은 팀으로 이동하지 않도록 다른 팀 선택
            let next: string;
            do { next = NBA_TEAM_IDS[rng.intRange(0, NBA_TEAM_IDS.length - 1)]; }
            while (next === current);
            current = next;
        }
        teams.push(current.toUpperCase());
    }
    return teams;
}

/** age → baseline 기간 내 선형 성장 비율 (0~1) */
const growthRatio = (age: number, baseline: number): number =>
    Math.max(0, (age - ROOKIE_ENTRY_AGE) / Math.max(1, baseline - ROOKIE_ENTRY_AGE));

function calcSeasonOvr(currentOvr: number, seasonAge: number, currentAge: number): number {
    if (seasonAge >= currentAge) return currentOvr;
    const peakAge = 28;
    if (currentAge <= peakAge) {
        // 아직 성장 중 — 초기 시즌일수록 비례적으로 낮음
        return clamp(Math.round(currentOvr * (0.78 + 0.22 * growthRatio(seasonAge, currentAge))), 38, currentOvr);
    }
    // 전성기 지남 — 전성기 OVR 역산 후 아크 적용
    const peakOvr = currentOvr + (currentAge - peakAge) * 0.75;
    if (seasonAge <= peakAge) {
        return clamp(Math.round(peakOvr * (0.78 + 0.22 * growthRatio(seasonAge, peakAge))), 38, Math.round(peakOvr));
    }
    return clamp(Math.round(peakOvr - (seasonAge - peakAge) * 0.75), 38, Math.round(peakOvr));
}

/**
 * OVR / 나이 / 커리어 성적 기반 선수 인기도 생성
 * national: 전국 인기 (OVR 주도)
 * local:    연고지 인기 (national ± 편차, 약간 높은 경향)
 */
function generatePopularity(
    ovr: number,
    age: number,
    stats: CareerSeasonStat,
    rng: SeededRandom,
): PlayerPopularity {
    // OVR 기반 national 기준값
    let base: number;
    if (ovr >= 85)      base = 58 + rng.next() * 20;  // 58~78
    else if (ovr >= 78) base = 35 + rng.next() * 22;  // 35~57
    else if (ovr >= 70) base = 14 + rng.next() * 20;  // 14~34
    else                base =  2 + rng.next() * 12;  //  2~14

    // 나이 보정: 전성기(27-31) +4, 노장(35+) -6, 어린 선수(23-) -2
    const ageMod = age >= 27 && age <= 31 ?  4
                 : age >= 35              ? -6
                 : age <= 23             ? -2
                 : 0;

    // 성적 보정: PPG 20+ +4, 15+ +2
    const statMod = stats.pts >= 20 ? 4 : stats.pts >= 15 ? 2 : 0;

    const national = clamp(Math.round(base + ageMod + statMod), 0, 100);

    // local: national 기준 ±12 노이즈, 약간 높은 경향(+4)
    const local = clamp(Math.round(national + 4 + (rng.next() * 24 - 12)), 0, 100);

    return { national, local };
}

// ── 초기 FA 풀 생성 ──

export const DEFAULT_FA_POOL_SIZE = 65;

// 티어별 파라미터
const FA_TIER_BASE_MEAN = [67, 57, 47] as const;             // 능력치 기준값 평균
const FA_TIER_BASE_CLAMP: [number, number][] = [[58, 78], [48, 68], [38, 58]];
const FA_TIER_AGE: [number, number][] = [[24, 33], [22, 36], [22, 38]];
const FA_TIER_SALARY: [number, number][] = [
    [10_000_000, 18_000_000],   // High: 스타터급
    [3_000_000,  8_000_000],    // Mid: 롤플레이어
    [1_800_000,  3_000_000],    // Low: 미니멈 근처
];
const FA_TIER_YEARS: [number, number][] = [[2, 3], [1, 3], [1, 2]];
const FA_TIER_CONTRACT_TYPE = ['veteran', 'veteran', 'min'] as const;
const FA_TIER_WEIGHTS = [0.20, 0.45, 0.35]; // high / mid / low

/**
 * 게임 시작 시 초기 FA 풀을 생성한다.
 *
 * 루키 드래프트 클래스와 달리 베테랑 선수들로 구성되며,
 * 3개 티어(High/Mid/Low)에 따라 능력치·나이·계약이 결정된다.
 * season_number = 0 으로 드래프트 클래스와 구분.
 *
 * @param userId            사용자 ID
 * @param seed              tendencySeed (결정론적 시드)
 * @param count             생성할 선수 수 (기본 65)
 * @param currentSeasonYear 현재 시즌 시작 연도 (draft_year 역산용, 예: 2025)
 */
export function generateInitialFAPool(
    userId: string,
    seed: string,
    count: number = DEFAULT_FA_POOL_SIZE,
    currentSeasonYear: number = 2025
): GeneratedPlayerRow[] {
    const rng = new SeededRandom(`${seed}_init_fa`);
    const players: GeneratedPlayerRow[] = [];

    const positionPool = buildPositionPool(rng, count);
    const shuffledPositions = rng.shuffle(positionPool);
    const poolWeights = NAME_POOLS.map(p => p.weight);

    // 드래프트 연도별 사용된 픽 번호 추적 (같은 연도 중복 배정 방지)
    const usedPicks = new Map<number, Set<number>>();

    for (let i = 0; i < count; i++) {
        const position = shuffledPositions[i];
        const tierIdx = rng.weightedIndex(FA_TIER_WEIGHTS); // 0=High, 1=Mid, 2=Low

        const name = generateName(rng, poolWeights);

        // 나이
        const [ageMin, ageMax] = FA_TIER_AGE[tierIdx];
        const age = rng.intRange(ageMin, ageMax);

        // 키/몸무게
        const height = generateHeight(rng, position);
        const [wMin, wMax] = WEIGHT_RANGES[position];
        const weight = rng.intRange(wMin, wMax);

        // 능력치 (티어별 baseLevel 적용)
        const [clampMin, clampMax] = FA_TIER_BASE_CLAMP[tierIdx];
        const baseLevel = clamp(Math.round(rng.normal(FA_TIER_BASE_MEAN[tierIdx], 4)), clampMin, clampMax);
        const attrs = buildAttrMap(rng, position, baseLevel);

        // 포텐셜: 나이가 많을수록 낮음, 티어에 따라 천장 결정
        const ageFactor = age <= 25 ? 1.0 : age <= 28 ? 0.65 : age <= 32 ? 0.25 : 0.0;
        const potCeiling = FA_TIER_BASE_MEAN[tierIdx] + 12;
        const pot = clamp(Math.round(rng.normal(baseLevel + ageFactor * (potCeiling - baseLevel) * 0.5, 4)), 40, 92);

        // 계약
        const [salMin, salMax] = FA_TIER_SALARY[tierIdx];
        const salary = rng.intRange(salMin, salMax);
        const [yMin, yMax] = FA_TIER_YEARS[tierIdx];
        const contractYears = rng.intRange(yMin, yMax);
        const contractType = FA_TIER_CONTRACT_TYPE[tierIdx];
        const yearSalaries = Array.from({ length: contractYears }, (_, yr) =>
            Math.round(salary * Math.pow(1.04, yr))
        );

        // ── 히스토리 데이터 생성 ──

        // OVR 근사: baseLevel을 기반으로 간단 추정 (정확한 calculateOvr 대신)
        const approxOvr = clamp(baseLevel + (tierIdx === 0 ? 8 : tierIdx === 1 ? 2 : -4), 40, 95);

        // 서비스 타임 계산
        const entryAge = getEntryAge(position, tierIdx, rng);
        const yos = Math.max(1, age - entryAge); // 최소 1년 보장
        const draftYear = currentSeasonYear - yos;

        // 직전 계약 연봉: asking salary 기반 (일관된 스케일 유지)
        // 드래프트 픽 생성 (OVR 기반, 연도별 중복 방지)
        const draftInfo = generateDraftPick(approxOvr, draftYear, usedPicks, rng);

        // 직전 계약 생성 (픽 기반 루키 스케일 or 베테랑)
        const prevContract = generatePrevContract(draftInfo, yos, salary, contractType, rng);
        const prevSalary = Math.round(prevContract.years.reduce((a, b) => a + b, 0) / prevContract.years.length);

        // 전체 커리어 기록 생성 (yos 시즌 × 1행)
        const teamSequence = generateTeamSequence(yos, approxOvr, rng);

        // 직전 팀 tenure: 마지막 팀에서 연속으로 뛴 시즌 수
        const lastTeamId = teamSequence[teamSequence.length - 1];
        let prevTeamTenure = 0;
        for (let i = teamSequence.length - 1; i >= 0 && teamSequence[i] === lastTeamId; i--) {
            prevTeamTenure++;
        }
        const careerHistory: CareerSeasonStat[] = [];
        for (let yr = 0; yr < yos; yr++) {
            const seasonStartYear = draftYear + yr;
            const seasonAge = entryAge + yr;
            const seasonOvr = calcSeasonOvr(approxOvr, seasonAge, age);
            careerHistory.push(generateCareerStatRow(attrs, position, seasonOvr, seasonAge, seasonStartYear, teamSequence[yr], rng));
        }

        // 인기도: 직전 시즌(마지막 행, 아직 순방향) 기준으로 산정 후 역순 정렬
        const lastRow = careerHistory[careerHistory.length - 1];
        const popularity = generatePopularity(approxOvr, age, lastRow, rng);
        careerHistory.reverse(); // 최신 시즌이 앞에 오도록

        const id = `gen_${generateUUID(rng)}`;

        players.push({
            id,
            user_id: userId,
            season_number: 0,   // 초기 FA 풀 구분자 (드래프트 클래스와 구별)
            draft_pick: null,
            draft_team_id: null,
            status: 'fa',
            base_attributes: {
                name,
                position,
                age,
                salary,
                contractYears,
                ...attrs,
                pot,
                height,
                weight,
                contract: {
                    years: yearSalaries,
                    currentYear: 0,
                    type: contractType,
                },
                // 히스토리 필드 (mapRawPlayerToRuntimePlayer에서 Player로 매핑)
                draft_year: draftYear,
                draft_round: draftInfo.round,
                draft_pick: draftInfo.pick,
                prev_salary: prevSalary,
                prev_team_tenure: prevTeamTenure,
                prev_contract: {
                    years: prevContract.years,
                    currentYear: prevContract.years.length, // 이미 완료된 계약
                    type: prevContract.type,
                },
                career_history: careerHistory,
                popularity,
            },
            age_at_draft: age,
        });
    }

    return players;
}

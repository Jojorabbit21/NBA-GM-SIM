
import { Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { stringToHash } from '../../utils/hiddenTendencies';
import { TRADE_DEADLINE } from '../../utils/constants';
import {
    GMProfile, GMPersonalityType, GMSliders, TeamDirection,
    LeagueGMProfiles, GM_PERSONALITY_TYPES, GM_SLIDER_PRESETS,
} from '../../types/gm';

// ── DB에서 로드된 GM 데이터 싱글턴 (single source of truth) ──

let GM_DATA: Record<string, { name: string; personalityType: GMPersonalityType; sliders: GMSliders }> = {};

/**
 * meta_gms DB 데이터로 싱글턴 교체
 * queries.ts의 useBaseData()에서 앱 시작 시 호출
 */
export function populateGMData(rows: { team_id: string; gm_name: string; personality_type: string; sliders: GMSliders | string }[]): void {
    const newData: Record<string, { name: string; personalityType: GMPersonalityType; sliders: GMSliders }> = {};
    for (const row of rows) {
        const sliders = typeof row.sliders === 'string' ? JSON.parse(row.sliders) : row.sliders;
        newData[row.team_id] = {
            name: row.gm_name,
            personalityType: row.personality_type as GMPersonalityType,
            sliders,
        };
    }
    GM_DATA = newData;
}

// ── Seeded Random Helpers (DB에 없는 팀용 fallback) ──

function seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// ── GM 이름 풀 — fallback용 (한글 음차) ──

const GM_FIRST_NAMES = [
    '샘', '롭', '대릴', '팻', '밥', '대니', '미치', '엘튼',
    '닐', '제프', '코비', '몬테', '캘빈', '니코', '브래드',
    '라파엘', '레온', '제임스', '트로이', '데이비드', '스콧', '데니스',
    '리치', '아르투라스', '잭', '팀', '로렌스', '마크', '트레이잔',
    '크리스', '윌', '숀', '테드', '브라이언', '글렌', '맷',
    '웨스', '마이크', '라이언', '존',
];

const GM_LAST_NAMES = [
    '프레스티', '펠린카', '모리', '라일리', '마이어스', '에인지', '쿠프착',
    '브랜드', '올시', '웰트먼', '올트먼', '모리스', '부스', '해리슨',
    '스티븐스', '스톤', '로즈', '존스', '위버', '그리핀', '페리',
    '린지', '조', '프랭크', '카르니소바스', '로우', '코넬리', '에버슬리',
    '바텔스타인', '월러스', '하디', '마크스', '스테판스키', '윌러',
    '그리어', '설리번', '랭던', '웹스터', '맥도너', '밥콕',
];

function generateGMName(seed: number): string {
    const fi = Math.floor(seededRandom(seed) * GM_FIRST_NAMES.length);
    const li = Math.floor(seededRandom(seed + 31) * GM_LAST_NAMES.length);
    return `${GM_FIRST_NAMES[fi]} ${GM_LAST_NAMES[li]}`;
}

// ── 프로필 생성 ──

/**
 * 팀 ID 기반 GM 프로필 조회
 * DB 데이터에 있으면 반환, 없으면 시드 기반 랜덤 생성 (fallback)
 */
function generateGMProfile(teamId: string, tendencySeed: string): GMProfile {
    // DB 데이터 우선
    if (GM_DATA[teamId]) {
        const db = GM_DATA[teamId];
        return {
            teamId,
            name: db.name,
            personalityType: db.personalityType,
            sliders: { ...db.sliders },
            direction: 'standPat',
        };
    }

    // fallback: 시드 기반 랜덤 생성 (DB 미로드 또는 커스텀 팀)
    const baseSeed = stringToHash(tendencySeed + ':gm:' + teamId);

    const typeIndex = Math.floor(seededRandom(baseSeed) * GM_PERSONALITY_TYPES.length);
    const personalityType = GM_PERSONALITY_TYPES[typeIndex];

    const preset = GM_SLIDER_PRESETS[personalityType];
    const sliders: GMSliders = {
        aggressiveness: clampSlider(preset.aggressiveness + sliderJitter(baseSeed + 1)),
        starWillingness: clampSlider(preset.starWillingness + sliderJitter(baseSeed + 2)),
        youthBias: clampSlider(preset.youthBias + sliderJitter(baseSeed + 3)),
        riskTolerance: clampSlider(preset.riskTolerance + sliderJitter(baseSeed + 4)),
        pickWillingness: clampSlider(preset.pickWillingness + sliderJitter(baseSeed + 5)),
    };

    const name = generateGMName(stringToHash(tendencySeed + ':gm:name:' + teamId));

    return {
        teamId,
        name,
        personalityType,
        sliders,
        direction: 'standPat',
    };
}

function sliderJitter(seed: number): number {
    const r = seededRandom(seed);
    if (r < 0.33) return -1;
    if (r > 0.66) return 1;
    return 0;
}

function clampSlider(value: number): number {
    return Math.max(1, Math.min(10, value));
}

// ── 리그 전체 프로필 생성 ──

export function generateLeagueGMProfiles(
    teamIds: string[],
    tendencySeed: string,
    myTeamId?: string,
): LeagueGMProfiles {
    const profiles: LeagueGMProfiles = {};
    // DB에 로드된 데이터 우선 반영
    for (const teamId of Object.keys(GM_DATA)) {
        if (teamId === myTeamId) continue;
        profiles[teamId] = generateGMProfile(teamId, tendencySeed);
    }
    // 누락된 팀은 시드 기반 생성
    for (const teamId of teamIds) {
        if (teamId === myTeamId) continue;
        if (!profiles[teamId]) {
            profiles[teamId] = generateGMProfile(teamId, tendencySeed);
        }
    }
    return profiles;
}

// ── 노선 판별 ──

const DIRECTION_ORDER: TeamDirection[] = ['winNow', 'buyer', 'standPat', 'seller', 'tanking'];

function shiftDirection(current: TeamDirection, delta: number): TeamDirection {
    const idx = DIRECTION_ORDER.indexOf(current);
    const newIdx = Math.max(0, Math.min(DIRECTION_ORDER.length - 1, idx + delta));
    return DIRECTION_ORDER[newIdx];
}

export function determineTeamDirection(
    team: Team,
    profile: GMProfile,
    currentDate: string,
): TeamDirection {
    const totalGames = (team.wins || 0) + (team.losses || 0);
    const winPct = totalGames > 0 ? (team.wins || 0) / totalGames : 0.5;

    const sorted = [...team.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
    const top3Ovr = sorted.length >= 3
        ? sorted.slice(0, 3).reduce((s, p) => s + calculatePlayerOvr(p), 0) / 3
        : sorted.reduce((s, p) => s + calculatePlayerOvr(p), 0) / Math.max(sorted.length, 1);

    // 기본 노선 판별
    let direction: TeamDirection;
    if (winPct >= 0.600 && top3Ovr >= 87) {
        direction = 'winNow';
    } else if (winPct >= 0.550 || top3Ovr >= 85) {
        direction = 'buyer';
    } else if (winPct >= 0.400) {
        direction = 'standPat';
    } else if (winPct >= 0.300) {
        direction = 'seller';
    } else {
        direction = 'tanking';
    }

    // GM 성격에 의한 노선 시프트 (±1 단계)
    const pt = profile.personalityType;
    if (pt === 'winNow' && winPct >= 0.500) {
        direction = shiftDirection(direction, -1); // 상향 (winNow 방향)
    } else if (pt === 'rebuilder' && winPct < 0.500) {
        direction = shiftDirection(direction, 1); // 하향 (seller/tanking 방향)
    } else if (pt === 'starHunter' && top3Ovr < 88) {
        direction = shiftDirection(direction, -1); // 스타 갈망 → 상향
    } else if (pt === 'youthMovement' && winPct < 0.450) {
        direction = shiftDirection(direction, 1); // 적극 해체
    }
    // balanced, valueTrader, defenseFocused: 시프트 없음

    return direction;
}

// ── 노선 업데이트 (매 시뮬 일 호출) ──

export function updateTeamDirections(
    teams: Team[],
    profiles: LeagueGMProfiles,
    currentDate: string,
    tradeDeadline?: string,
): void {
    const deadlineDate = new Date(tradeDeadline ?? TRADE_DEADLINE);
    const lockDate = new Date(deadlineDate);
    lockDate.setDate(lockDate.getDate() - 14); // 데드라인 2주 전
    const current = new Date(currentDate);

    for (const team of teams) {
        const profile = profiles[team.id];
        if (!profile) continue;

        // 이미 노선 확정된 경우 변경 불가
        if (profile.directionSetDate) continue;

        const newDirection = determineTeamDirection(team, profile, currentDate);
        profile.direction = newDirection;

        // 데드라인 2주 전 → 노선 확정
        if (current >= lockDate) {
            profile.directionSetDate = currentDate;
        }
    }
}

// ── 노선별 트레이드 파라미터 ──

export interface DirectionTradeParams {
    protectedCount: number;      // 보호 선수 수 (top N)
    valueRatioMin: number;       // 오퍼 수락 최소 가치 비율
    tradeChanceMultiplier: number; // 거래 확률 배수
    improvementThreshold: number;  // 팀력 개선 최소 임계값
    prefersYouth: boolean;       // 젊은 선수 선호
    prefersStars: boolean;       // 스타 선수 선호
    willDumpVeterans: boolean;   // 베테랑 방출 의향
}

export function getDirectionParams(direction: TeamDirection): DirectionTradeParams {
    switch (direction) {
        case 'winNow':
            return {
                protectedCount: 2,
                valueRatioMin: 0.85,
                tradeChanceMultiplier: 1.5,
                improvementThreshold: -0.005,
                prefersYouth: false,
                prefersStars: true,
                willDumpVeterans: false,
            };
        case 'buyer':
            return {
                protectedCount: 3,
                valueRatioMin: 0.90,
                tradeChanceMultiplier: 1.2,
                improvementThreshold: 0.001,
                prefersYouth: false,
                prefersStars: true,
                willDumpVeterans: false,
            };
        case 'standPat':
            return {
                protectedCount: 5,
                valueRatioMin: 0.98,
                tradeChanceMultiplier: 0.5,
                improvementThreshold: 0.005,
                prefersYouth: false,
                prefersStars: false,
                willDumpVeterans: false,
            };
        case 'seller':
            return {
                protectedCount: 1,
                valueRatioMin: 0.80,
                tradeChanceMultiplier: 1.2,
                improvementThreshold: -0.01,
                prefersYouth: true,
                prefersStars: false,
                willDumpVeterans: true,
            };
        case 'tanking':
            return {
                protectedCount: 0,
                valueRatioMin: 0.75,
                tradeChanceMultiplier: 1.5,
                improvementThreshold: -0.02,
                prefersYouth: true,
                prefersStars: false,
                willDumpVeterans: true,
            };
    }
}

// ── GM 슬라이더 설명 (UI용) ──

export interface GMSliderResult {
    tag: string;
    desc: string;
}

const SLIDER_TIERS: Record<keyof GMSliders, { label: string; tiers: [string, string][] }> = {
    aggressiveness: {
        label: '공격성',
        tiers: [
            ['소극적', '트레이드를 거의 하지 않으며 현상 유지를 선호'],
            ['신중한', '합리적인 거래만 추진하며 리스크를 최소화'],
            ['보통', '기회가 오면 거래를 추진하되 무리하지 않음'],
            ['적극적', '팀 개선을 위해 거래를 자주 시도'],
            ['매우 적극적', '트레이드 시장에서 가장 활발하게 움직임'],
        ],
    },
    starWillingness: {
        label: '스타 의향',
        tiers: [
            ['스타 기피', '스타 영입보다 균형 잡힌 로스터를 선호'],
            ['실용적', '적정 가격이면 스타 영입을 고려'],
            ['보통', '스타 선수에 관심을 보이되 합리적 대가 요구'],
            ['스타 선호', '스타급 선수 영입에 적극적이며 프리미엄 지불 가능'],
            ['스타 집착', '최고 스타를 위해서라면 큰 대가도 지불'],
        ],
    },
    youthBias: {
        label: '유스 편향',
        tiers: [
            ['즉전력 선호', '경험 많은 베테랑과 즉전력을 중시'],
            ['균형 추구', '나이보다 실력을 우선시'],
            ['보통', '젊은 선수와 베테랑을 균형 있게 활용'],
            ['유스 선호', '젊은 선수의 잠재력을 높이 평가'],
            ['유스 올인', '미래를 위해 젊은 선수 수집에 집중'],
        ],
    },
    riskTolerance: {
        label: '리스크 허용',
        tiers: [
            ['안전 제일', '부상 선수나 불확실한 거래를 극도로 기피'],
            ['보수적', '검증된 선수만 추구하며 리스크 최소화'],
            ['보통', '적절한 리스크는 감수하되 과도한 도박은 회피'],
            ['도전적', '잠재력이 있다면 부상 선수도 영입 가능'],
            ['도박사', '높은 리스크-하이 리턴 거래를 선호'],
        ],
    },
    pickWillingness: {
        label: '픽 방출',
        tiers: [
            ['픽 수호자', '드래프트 픽을 절대 내놓지 않음'],
            ['픽 보수적', '확실한 거래에만 픽을 포함'],
            ['보통', '필요시 픽을 거래에 포함할 의향'],
            ['픽 관대', '즉전력을 위해 픽을 기꺼이 방출'],
            ['픽 탕진', '원하는 선수를 위해 여러 픽도 방출 가능'],
        ],
    },
};

export function getGMSliderResult(key: keyof GMSliders, value: number): GMSliderResult {
    const axis = SLIDER_TIERS[key];
    const tierIndex = Math.min(Math.floor((value - 1) / 2), 4);
    const [tag, desc] = axis.tiers[tierIndex];
    return { tag, desc };
}

export function getGMSliderLabel(key: keyof GMSliders): string {
    return SLIDER_TIERS[key].label;
}

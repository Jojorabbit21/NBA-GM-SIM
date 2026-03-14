
import { Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { stringToHash } from '../../utils/hiddenTendencies';
import { TRADE_DEADLINE } from '../../utils/constants';
import {
    GMProfile, GMPersonalityType, GMSliders, TeamDirection,
    LeagueGMProfiles, GM_PERSONALITY_TYPES, GM_SLIDER_PRESETS,
} from '../../types/gm';

// ── Seeded Random Helpers (coachGenerator 패턴) ──

function seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// ── GM 이름 풀 ──

const GM_FIRST_NAMES = [
    'Sam', 'Rob', 'Daryl', 'Pat', 'Bob', 'Danny', 'Mitch', 'Elton',
    'Neil', 'Jeff', 'Koby', 'Monte', 'Calvin', 'Nico', 'Brad',
    'Rafael', 'Leon', 'James', 'Troy', 'David', 'Scott', 'Dennis',
    'Rich', 'Arturas', 'Zach', 'Tim', 'Lawrence', 'Marc', 'Trajan',
    'Chris', 'Will', 'Sean', 'Ted', 'Brian', 'Glen', 'Matt',
    'Wes', 'Mike', 'Ryan', 'John',
];

const GM_LAST_NAMES = [
    'Presti', 'Pelinka', 'Morey', 'Riley', 'Myers', 'Ainge', 'Kupchak',
    'Brand', 'Olshey', 'Weltman', 'Altman', 'Morris', 'Booth', 'Harrison',
    'Stevens', 'Stone', 'Rose', 'Jones', 'Weaver', 'Griffin', 'Perry',
    'Lindsey', 'Cho', 'Frank', 'Karnisovas', 'Lowe', 'Connelly', 'Eversley',
    'Bartelstein', 'Wallace', 'Hardy', 'Marks', 'Stefanski', 'Wheeler',
    'Grier', 'Sullivan', 'Langdon', 'Webster', 'McDonough', 'Babcock',
];

function generateGMName(seed: number): string {
    const fi = Math.floor(seededRandom(seed) * GM_FIRST_NAMES.length);
    const li = Math.floor(seededRandom(seed + 31) * GM_LAST_NAMES.length);
    return `${GM_FIRST_NAMES[fi]} ${GM_LAST_NAMES[li]}`;
}

// ── 프로필 생성 ──

function generateGMProfile(teamId: string, tendencySeed: string): GMProfile {
    const baseSeed = stringToHash(tendencySeed + ':gm:' + teamId);

    // 성격 타입 결정
    const typeIndex = Math.floor(seededRandom(baseSeed) * GM_PERSONALITY_TYPES.length);
    const personalityType = GM_PERSONALITY_TYPES[typeIndex];

    // 프리셋 슬라이더에 ±1 변동 적용
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
        direction: 'standPat', // 시즌 시작 시 기본값
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
): LeagueGMProfiles {
    const profiles: LeagueGMProfiles = {};
    for (const teamId of teamIds) {
        profiles[teamId] = generateGMProfile(teamId, tendencySeed);
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
): void {
    const deadlineDate = new Date(TRADE_DEADLINE);
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

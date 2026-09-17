import type { Player, PlayerStats } from '../../types/player';
import type { Team } from '../../types/team';
import type { FARole, FADemandResult, MarketCondition } from '../../types/fa';
import { ARCHETYPE_TO_FA_ROLE } from '../../types/archetype';
import { LEAGUE_FINANCIALS } from '../../utils/constants';
import { isSeasonEndingGrade, isMajorTierGrade, isNonMinorGrade } from '../../utils/injurySeverity';
import { stringToHash, generateSaveTendencies } from '../../utils/hiddenTendencies';
import { isRoseRuleEligible, isSuperMaxEligible } from './contractEligibility';

// ─────────────────────────────────────────────────────────────
// Role Weights (percentile-weighted, sum ≈ 1.0 per role)
// ─────────────────────────────────────────────────────────────

interface RoleWeights {
    pts: number; ast: number; reb: number; stl: number; blk: number;
    tov_inv: number; fta: number; p3a: number; ts_pct: number;
    p3_pct: number; avail: number; def: number;
}

const ROLE_WEIGHTS: Record<FARole, RoleWeights> = {
    lead_guard:   { pts: 0.20, ast: 0.24, ts_pct: 0.16, p3_pct: 0.08, tov_inv: 0.10, fta: 0.07, avail: 0.10, stl: 0.05, blk: 0.00, reb: 0.00, p3a: 0.00, def: 0.00 },
    combo_guard:  { pts: 0.25, ast: 0.18, p3_pct: 0.14, ts_pct: 0.14, tov_inv: 0.08, stl: 0.06, avail: 0.10, def: 0.05, blk: 0.00, reb: 0.00, fta: 0.00, p3a: 0.00 },
    '3and_d':     { p3_pct: 0.18, p3a: 0.12, ts_pct: 0.14, def: 0.22, stl: 0.08, tov_inv: 0.06, avail: 0.12, pts: 0.08, blk: 0.00, reb: 0.00, fta: 0.00, ast: 0.00 },
    shot_creator: { pts: 0.28, ts_pct: 0.16, ast: 0.14, reb: 0.08, tov_inv: 0.08, avail: 0.10, def: 0.06, stl: 0.10, blk: 0.00, fta: 0.00, p3a: 0.00, p3_pct: 0.00 },
    stretch_big:  { p3_pct: 0.20, ts_pct: 0.16, reb: 0.18, def: 0.14, blk: 0.08, avail: 0.12, pts: 0.12, ast: 0.00, stl: 0.00, tov_inv: 0.00, fta: 0.00, p3a: 0.00 },
    rim_big:      { reb: 0.20, blk: 0.18, def: 0.18, ts_pct: 0.14, fta: 0.07, avail: 0.12, pts: 0.10, tov_inv: 0.05, ast: 0.00, stl: 0.00, p3a: 0.00, p3_pct: 0.00 },
    floor_big:    { reb: 0.22, ast: 0.14, ts_pct: 0.14, def: 0.16, avail: 0.14, pts: 0.12, tov_inv: 0.08, stl: 0.00, blk: 0.00, fta: 0.00, p3a: 0.00, p3_pct: 0.00 },
};

const AWARD_BONUS: Partial<Record<string, number>> = {
    MVP: 10, ALL_NBA_1: 8, DPOY: 6, FINALS_MVP: 5,
    ALL_NBA_2: 6, ALL_NBA_3: 5, ALL_DEF_1: 4, ALL_DEF_2: 3,
    CHAMPION: 2, REG_SEASON_CHAMPION: 1,
};

// ─────────────────────────────────────────────────────────────
// Step 1: FA 롤 결정
// ─────────────────────────────────────────────────────────────

export function determineFARole(player: Player): FARole {
    if (player.archetypeState) {
        return ARCHETYPE_TO_FA_ROLE[player.archetypeState.primary];
    }
    // Fallback: position + attribute based
    const pos = player.position;
    const threeAvg = ((player.threeCorner ?? 50) + (player.three45 ?? 50) + (player.threeTop ?? 50)) / 3;

    if (pos === 'PG') {
        return (player.handling ?? 50) + (player.passIq ?? 50) >= 130 ? 'lead_guard' : 'combo_guard';
    }
    if (pos === 'SG' || pos === 'SF') {
        const threeAndDScore = (threeAvg + (player.perDef ?? 50)) / 2;
        const shotCreatorScore = ((player.handling ?? 50) + (player.midRange ?? 50)) / 2;
        return threeAndDScore >= shotCreatorScore ? '3and_d' : 'shot_creator';
    }
    if (pos === 'PF') {
        return threeAvg >= 72 ? 'stretch_big' : 'floor_big';
    }
    // C
    return (player.blk ?? 50) + (player.intDef ?? 50) >= 120 ? 'rim_big' : 'floor_big';
}

// ─────────────────────────────────────────────────────────────
// Step 2: 롤별 퍼포먼스 스코어 (백분위 정규화)
// ─────────────────────────────────────────────────────────────

interface PerGameDerived {
    pts: number; ast: number; reb: number; stl: number; blk: number;
    tov: number; fta: number; p3a: number;
    tsPct: number; p3Pct: number; avail: number; def: number;
}

function toPerGame(stats: PlayerStats): PerGameDerived {
    const g = Math.max(1, stats.g);
    const tsPct = stats.pts > 0 && (stats.fga + stats.fta) > 0
        ? stats.pts / (2 * (stats.fga + 0.44 * stats.fta))
        : 0;
    const p3Pct = stats.p3a > 0 ? stats.p3m / stats.p3a : 0;
    const avail = Math.min(1, stats.g / 60) * Math.min(1, stats.mp / 1800);
    return {
        pts:   stats.pts / g,
        ast:   stats.ast / g,
        reb:   stats.reb / g,
        stl:   stats.stl / g,
        blk:   stats.blk / g,
        tov:   stats.tov / g,
        fta:   stats.fta / g,
        p3a:   stats.p3a / g,
        tsPct,
        p3Pct,
        avail: avail * 100,
        def:   (stats.stl / g) + (stats.blk / g) * 0.7,
    };
}

function percentileOf(sortedAsc: number[], value: number): number {
    if (sortedAsc.length === 0) return 50;
    let count = 0;
    for (const v of sortedAsc) {
        if (v <= value) count++;
    }
    return (count / sortedAsc.length) * 100;
}

function calcRoleScore(playerStats: PlayerStats, role: FARole, pool: PlayerStats[]): number {
    const validPool = pool.filter(s => s.g >= 10);
    if (validPool.length === 0) return 50;

    const poolDerived = validPool.map(toPerGame);
    const my = toPerGame(playerStats);
    const w = ROLE_WEIGHTS[role];

    const sorted = (key: keyof PerGameDerived) =>
        [...poolDerived.map(p => p[key])].sort((a, b) => a - b);

    const pct = (key: keyof PerGameDerived, invert = false) => {
        const s = sorted(key);
        const rank = percentileOf(s, my[key]);
        return invert ? 100 - rank : rank;
    };

    const score =
        w.pts     * pct('pts') +
        w.ast     * pct('ast') +
        w.reb     * pct('reb') +
        w.stl     * pct('stl') +
        w.blk     * pct('blk') +
        w.tov_inv * pct('tov', true) +
        w.fta     * pct('fta') +
        w.p3a     * pct('p3a') +
        w.ts_pct  * pct('tsPct') +
        w.p3_pct  * pct('p3Pct') +
        w.avail   * pct('avail') +
        w.def     * pct('def');

    return Math.min(100, Math.max(0, score));
}

// ─────────────────────────────────────────────────────────────
// Step 3: 신뢰도 계수
// ─────────────────────────────────────────────────────────────

function calcReliability(stats?: PlayerStats): number {
    if (!stats || stats.g === 0) return 0.35;
    return 0.35 + 0.65 * Math.min(1, stats.g / 60) * Math.min(1, stats.mp / 1800);
}

// ─────────────────────────────────────────────────────────────
// Step 4: 수상 보너스 (직전 시즌, 상한 +12)
// ─────────────────────────────────────────────────────────────

function calcAwardBonus(player: Player, currentSeason: string): number {
    const [startStr] = currentSeason.split('-');
    const prevStart = parseInt(startStr) - 1;
    const prevSeason = `${prevStart}-${String(prevStart + 1).slice(-2)}`;

    const allAwards = [
        ...(player.career_history ?? []).flatMap(s => (s.awards ?? []).map(a => ({ ...a, season: a.season || s.season }))),
        ...(player.awards ?? []),
    ];

    const total = allAwards
        .filter(a => a.season === prevSeason)
        .reduce((sum, a) => sum + (AWARD_BONUS[a.type] ?? 0), 0);

    return Math.min(12, total);
}

// ─────────────────────────────────────────────────────────────
// Step 5: 나이 보정
// ─────────────────────────────────────────────────────────────

function calcAgeBonus(age: number, adjustedPerf: number): number {
    const hi = adjustedPerf >= 75;
    if (age <= 22) return hi ? 4 : 6;
    if (age <= 26) return hi ? 2 : 4;
    if (age <= 30) return hi ? 1 : 2;
    if (age <= 33) return hi ? -2 : -4;
    if (age <= 35) return hi ? -3 : -7;
    return hi ? -5 : -10;
}

// ─────────────────────────────────────────────────────────────
// Step 6: 부상 패널티 (최대 -12)
// ─────────────────────────────────────────────────────────────

function calcInjuryPenalty(player: Player): number {
    if (!player.injuryHistory || player.injuryHistory.length === 0) return 0;

    const recent = player.injuryHistory.slice(-6);
    let penalty = 0;

    if (recent.some(e => isSeasonEndingGrade(e.severity))) penalty += 8;

    const majorCount = recent.filter(e => isMajorTierGrade(e.severity)).length;
    if (majorCount >= 2) penalty += 5;
    else if (majorCount === 1) penalty += 2;

    const nonMinorCount = recent.filter(e => isNonMinorGrade(e.severity)).length;
    if (nonMinorCount >= 3) penalty += 2;

    if (player.age >= 30) penalty = Math.round(penalty * 1.5);

    return Math.min(12, penalty);
}

// ─────────────────────────────────────────────────────────────
// Step 7: 시장 희소성/수요 보정
// ─────────────────────────────────────────────────────────────

function ratioToScarcityBonus(ratio: number): number {
    if (ratio >= 3.0) return 6;
    if (ratio >= 2.0) return 4;
    if (ratio >= 1.5) return 2;
    if (ratio >= 1.0) return 0;
    if (ratio >= 0.5) return -2;
    return -4;
}

// ─────────────────────────────────────────────────────────────
// Step 8: Score → Cap Share 티어
// ─────────────────────────────────────────────────────────────

function scoreToCapShare(score: number): number {
    if (score >= 90) return 0.325;
    if (score >= 82) return 0.255;
    if (score >= 72) return 0.185;
    if (score >= 60) return 0.125;
    if (score >= 48) return 0.075;
    if (score >= 35) return 0.040;
    return 0.015;
}

// ─────────────────────────────────────────────────────────────
// Step 9: YOS → 개인 맥스 실링 + 베테랑 미니멈
// ─────────────────────────────────────────────────────────────

export function calcYOSBounds(yos: number, player?: Player, salaryCapOverride?: number): { maxAllowed: number; vetMin: number } {
    const cap = salaryCapOverride ?? LEAGUE_FINANCIALS.SALARY_CAP;
    // 데릭 로즈 룰: YOS 0~6 + 루키 3시즌 내 수상 → 30%
    const roseRule = yos < 7 && !!player && isRoseRuleEligible(player);
    const maxAllowed = yos >= 10 ? cap * 0.35 : yos >= 7 ? cap * 0.30 : roseRule ? cap * 0.30 : cap * 0.25;
    const vetMin     = yos >= 7  ? 3_000_000  : yos >= 4 ? 2_200_000  : 1_500_000;
    return { maxAllowed, vetMin };
}

function calcAskingYears(age: number, marketValueScore: number): number {
    const highValue = marketValueScore > 60;
    if (age <= 25) return highValue ? 5 : 4;
    if (age <= 29) return highValue ? 4 : 3;
    if (age <= 32) return highValue ? 3 : 2;
    if (age <= 35) return highValue ? 2 : 1;
    return 1;
}

// ─────────────────────────────────────────────────────────────
// buildMarketConditions — 시장 개설 시 1회 호출
// ─────────────────────────────────────────────────────────────

export function buildMarketConditions(
    allPlayers: Player[],
    expiredPlayers: Player[],
    teams: Team[],
): Record<FARole, MarketCondition> {
    const roles: FARole[] = ['lead_guard', 'combo_guard', '3and_d', 'shot_creator', 'stretch_big', 'rim_big', 'floor_big'];

    // Supply: FA 후보 중 롤별 선수 수
    const roleSupply: Record<FARole, number> = {} as Record<FARole, number>;
    for (const role of roles) roleSupply[role] = 0;
    for (const p of expiredPlayers) {
        roleSupply[determineFARole(p)]++;
    }

    // Demand: 팀별 롤 강도 (해당 롤 최대 OVR) → 하위 25% 팀 수
    const teamStrengths: Record<FARole, number[]> = {} as Record<FARole, number[]>;
    for (const role of roles) teamStrengths[role] = [];

    for (const team of teams) {
        for (const role of roles) {
            const strength = team.roster
                .filter(p => determineFARole(p) === role)
                .reduce((max, p) => Math.max(max, p.ovr), 0);
            teamStrengths[role].push(strength);
        }
    }

    const result: Record<FARole, MarketCondition> = {} as Record<FARole, MarketCondition>;
    for (const role of roles) {
        const strengths = teamStrengths[role];
        const sorted = [...strengths].sort((a, b) => a - b);
        const threshold = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
        const roleDemand = strengths.filter(s => s <= threshold).length;
        const supply = roleSupply[role];

        result[role] = {
            roleSupply: supply,
            roleDemand,
            ratio: supply > 0 ? roleDemand / supply : roleDemand > 0 ? 10 : 0,
        };
    }
    return result;
}

// ─────────────────────────────────────────────────────────────
// OVR → 롤 스코어 추정 (스탯 없는 생성 FA 선수 폴백용)
// ─────────────────────────────────────────────────────────────

function ovrToRoleScore(ovr: number): number {
    if (ovr >= 95) return 96;
    if (ovr >= 88) return 84;
    if (ovr >= 82) return 72;
    if (ovr >= 75) return 60;
    if (ovr >= 68) return 48;
    if (ovr >= 60) return 35;
    return 20;
}

// ─────────────────────────────────────────────────────────────
// calcFADemand — 선수 FA 요구 조건 산정 (메인)
// ─────────────────────────────────────────────────────────────

export function calcFADemand(
    player: Player,
    allPlayers: Player[],
    marketConditions: Record<FARole, MarketCondition>,
    currentSeasonYear: number,
    currentSeason: string,
    tendencySeed: string,
    salaryCapOverride?: number,
): FADemandResult {
    const faRole = determineFARole(player);

    // Step 2~3: Role score + reliability
    // 스탯이 없는 생성 FA 선수는 OVR 기반으로 추정 (reliability 0.65 적용)
    const pool = allPlayers.filter(p => p.stats && p.stats.g >= 1).map(p => p.stats!);
    let roleScore: number;
    let reliability: number;
    if (player.stats && player.stats.g >= 1) {
        roleScore  = calcRoleScore(player.stats, faRole, pool);
        reliability = calcReliability(player.stats);
    } else {
        roleScore  = ovrToRoleScore(player.ovr ?? 60);
        reliability = 0.65;
    }
    const adjustedPerfScore = roleScore * reliability;

    // Step 4~6: Bonuses & penalties
    const awardBonus    = calcAwardBonus(player, currentSeason);
    const ageBonus      = calcAgeBonus(player.age, adjustedPerfScore);
    const injuryPenalty = calcInjuryPenalty(player);

    // Step 7: Market bonus
    const mc = marketConditions[faRole];
    const scarcityBonus = ratioToScarcityBonus(mc.ratio);
    const demandBonus   = Math.min(5, Math.floor(mc.roleDemand / 3));

    const tendencies = generateSaveTendencies(tendencySeed, player.id);
    const financialAmbition = tendencies.financialAmbition;
    const ambitionScale = 0.7 + financialAmbition * 0.6;

    // Step 8: MarketValueScore → targetSalary
    const marketValueScore =
        adjustedPerfScore
        + awardBonus
        + ageBonus
        + scarcityBonus * ambitionScale
        + demandBonus   * ambitionScale
        - injuryPenalty;

    const capShare = scoreToCapShare(marketValueScore);
    let targetSalary = (salaryCapOverride ?? LEAGUE_FINANCIALS.SALARY_CAP) * capShare;

    // Step 9: YOS 상/하한
    const yos = currentSeasonYear - (player.draftYear ?? currentSeasonYear);
    const { maxAllowed, vetMin } = calcYOSBounds(yos, player, salaryCapOverride);
    targetSalary = Math.max(vetMin, Math.min(maxAllowed, targetSalary));

    // Step 10: 맥스 요구 게이트
    // 슈퍼맥스/로즈룰 자격자는 수상 이력 자체가 근거 → 퍼포먼스·시장 조건 무관하게 허용
    const hasSpecialDesignation = isSuperMaxEligible(player, currentSeasonYear)
        || isRoseRuleEligible(player);
    const canDemandMax = hasSpecialDesignation
        || (marketValueScore >= 90 && (scarcityBonus + demandBonus) >= 4);
    if (!canDemandMax && targetSalary >= maxAllowed) {
        targetSalary = maxAllowed * 0.92;
    }

    // Step 11: 협상 범위 (결정론적 시드)
    const hash = stringToHash(tendencySeed + player.id + currentSeason);
    const r1 = (hash % 1000) / 1000;
    const r2 = ((hash >> 10) % 1000) / 1000;

    const askMultiplier  = 1.03 + financialAmbition * 0.14 * r1;   // 1.03~1.17
    const walkMultiplier = 0.80 + (1.0 - financialAmbition) * 0.19 * r2; // 0.80~0.99

    const openingAsk = Math.min(maxAllowed, Math.max(vetMin, targetSalary * askMultiplier));
    const walkAway   = Math.min(targetSalary, Math.max(vetMin, targetSalary * walkMultiplier));

    const askingYears = calcAskingYears(player.age, marketValueScore);

    // Step 12: 희망 변동률(askingRaisePercent)/변동률 최저선(walkAwayRaisePercent) —
    // financialAmbition 하나로 두 값을 함께 결정(대칭 구조): 높을수록 해마다 연봉이
    // 오르는 상향식을 더 강하게 원하고(ask가 5%에 가까워짐), 동시에 하향식을 더
    // 못 참는다(walkAway가 0%에 가까워져 조금만 하향해도 거부감이 최대치). 낮을수록
    // 반대 — 애초에 상향식을 안 바라고(ask가 0%에 가까움), 꽤 가파른 하향식까지
    // 용인한다(walkAway가 -5%까지 내려감). walkAwayRaisePercent는 walkAwaySalary와
    // 동일하게 화면에 노출하지 않는 히든 트레잇 — calcDeclineAversionPenalty가 비교
    // 기준점으로만 사용.
    // [2026-09-17 Fix] 기준을 8→5로 변경 — 협상 화면의 변동률 상한(maxRaisePercent,
    // MultiNegotiationView.tsx)은 버드 예외(bird_full/bird_early) 2종만 ±8%고 나머지
    // 전부(캡스페이스/MLE/미니멈/BAE/논버드/2라운드 예외 등 대다수) ±5%다. 8을 기준으로
    // 두면 실제로 거의 못 만나는 -8%가 "완전히 관대해지는" 지점이 되어, 흔히 쓰이는
    // ±5% 범위 안에서는 walkAway(예: financialAmbition=0이면 -8%)에 절대 도달하지
    // 못해 하향식 거부감이 구조적으로 항상 과소평가됐다(사용자 지적 — "-8%가 최저선이면
    // 하향식 계약에 너무 관대해지는 것 아닌가"). 실제로 가장 흔한 상한인 5를 기준으로
    // 삼아 일반적인 협상 범위 안에서 거부감 곡선이 제대로 작동하게 함(버드 예외로 ±8%까지
    // 쓰는 드문 경우엔 -5% 지점에서 이미 steepness가 1로 꽉 차 있어 그 이상 내려가도
    // 추가로 더 관대해지진 않음 — Math.min(1, ...) 클램프).
    const askingRaisePercent = Math.round(financialAmbition * 5 * 10) / 10;
    const walkAwayRaisePercent = Math.round((-5 + financialAmbition * 5) * 10) / 10;

    // [2026-09-17] 하향식 계약 거부감에 나이/직전 시즌 성적 반영 — 사용자 스펙: "27세
    // 이상"이거나 "직전 시즌 성적이 좋지 않았던 경우" 하향식을 더 잘 받아들인다, 우선순위는
    // 나이 > 직전 시즌 성적 > 재정적 야망 > 우승욕(calcDeclineAversionPenalty에서 실제
    // 가중치로 구현). declineAgeTolerance: 27세 미만 0, 27~35세 선형 증가, 35세 이상 1.
    const declineAgeTolerance = Math.min(1, Math.max(0, (player.age - 27) / 8));
    // declinePerfTolerance: roleScore(0~100 백분위, 이미 위에서 계산됨)가 50(평균) 이상이면
    // 0, 낮을수록(부진할수록) 1에 가까워짐.
    const declinePerfTolerance = Math.min(1, Math.max(0, (50 - roleScore) / 50));

    return {
        askingSalary:   Math.round(openingAsk),
        walkAwaySalary: Math.round(walkAway),
        targetSalary:   Math.round(targetSalary),
        askingYears,
        askingRaisePercent,
        walkAwayRaisePercent,
        declineAgeTolerance:  Math.round(declineAgeTolerance * 100) / 100,
        declinePerfTolerance: Math.round(declinePerfTolerance * 100) / 100,
        marketValueScore: Math.round(marketValueScore * 10) / 10,
        faRole,
    };
}

// ─────────────────────────────────────────────────────────────
// evaluateFAOffer — 오퍼 수락 여부 판정
// ─────────────────────────────────────────────────────────────

// 우승욕(winDesire) 높은 선수가 약팀(플레이오프 진출 확률 낮음) 오퍼를 꺼리는 정도(0~1).
// winDesire<=0.5(우승에 크게 연연 안 함)면 0 — 팀 전력과 무관하게 조건만 본다.
// contenderScore(플레이오프 진출 확률)가 0.5 미만으로 내려갈수록, 그리고 winDesire가
// 0.5보다 강할수록 패널티가 커진다(최대 1).
// export: MultiNegotiationView.tsx가 거절 사유(TEAM_TOO_WEAK vs DECLINING_CONTRACT) 대사를
// 고를 때 어느 패널티가 더 컸는지 판단하는 용도로 재사용 — 공식을 뷰 레이어에 따로 복제하면
// 드리프트 위험이 생기므로 반드시 이 함수를 그대로 가져다 쓸 것.
export function calcTeamFitPenalty(winDesire: number, contenderScore: number): number {
    if (winDesire <= 0.5) return 0;
    const desireStrength = (winDesire - 0.5) * 2;            // 0~1
    const weakness = Math.max(0, 0.5 - contenderScore) * 2;  // 0~1
    return desireStrength * weakness;
}

// [2026-09-17] 하향식(변동률이 음수 — 1년차가 제일 높고 이후 연차로 갈수록 깎이는) 계약에
// 대한 거부감. 기본적으로 이런 구조는 전부 꺼리되(사용자 스펙: "기본적으로는 하향식
// 계약은 거부감을 갖게 됨"), financialAmbition(재정적 야망)이 기본 축 — 야망이 낮을수록
// 거부감이 낮다.
// [2026-09-17 Fix×2] 나이/직전 시즌 성적 팩터 추가 요청 — "27세 이상"이거나 "직전 시즌
// 성적이 좋지 않았던 경우" 하향식을 더 잘 받아들인다는 스펙, 우선순위는 "나이 > 직전
// 시즌 성적 > 재정적 야망 > 우승 욕심"이 맞다는 사용자 확인. 네 팩터를 하나의 감산식으로
// 구현: financialAmbition(기본 축, 가중치 1.0 그 자체)에서 ageOffset(가중치 1.0 —
// 나이 하나만으로도 이론상 financialAmbition을 완전히 상쇄할 수 있어야 "1순위"라는
// 요청에 부합)·perfOffset(가중치 0.7 — 나이보다는 약하지만 재정적 야망 자체(그 자체가
// 기준선)보다는 강한 영향력)·contenderOffset(가중치 0.3, 기존 그대로 — "약간의
// 가중치"인 4순위)를 순서대로 뺀다. 가중치 내림차순(1.0 > 0.7 > [기준 1.0] > 0.3)이
// 곧 우선순위 순서.
// ageTolerance/perfTolerance는 calcFADemand()가 미리 계산해 FADemandResult에 담아두는
// declineAgeTolerance/declinePerfTolerance를 그대로 받는다(둘 다 0~1, 클수록 하향식에
// 관대) — 여기서 나이/스탯을 직접 계산하지 않음(이 함수는 player 객체 자체를 안 받음).
//
// 하락 폭 정규화 기준은 고정 -8%가 아니라 선수 개인의 walkAwayRaisePercent(calcFADemand
// Step 12, financialAmbition으로 -5~0% 사이 결정)로 비교 — "본인의 희망 변동률과
// 최저선을 설정"하라는 요청. walkAwayRaisePercent는 walkAwaySalary처럼 화면에 노출되지
// 않는 히든 트레잇이고, 여기서는 순수 비교(거부감이 최대치에 도달하는 지점)용으로만
// 쓰인다 — 절대적인 "이 밑으로는 무조건 거절"이 아니라(그건 salary walkAway의 역할),
// aversion(위 4팩터 조합 최대치) × steepness(0~1, walkAway 지점에서 1) 형태로 여전히
// 확률적.
export function calcDeclineAversionPenalty(
    financialAmbition: number,
    winDesire: number,
    contenderScore: number,
    raisePercent: number,
    walkAwayRaisePercent: number,
    ageTolerance: number = 0,
    perfTolerance: number = 0,
): number {
    if (raisePercent >= 0) return 0; // 하향식(음수)일 때만 적용 — 정액/상승 계약은 해당 없음.
    const ageOffset = ageTolerance * 1.0;   // 1순위 — 완전 상쇄 가능
    const perfOffset = perfTolerance * 0.7; // 2순위 — 나이보다 약하게
    const contenderOffset = winDesire * contenderScore * 0.3; // 4순위 — 기존 "약간"
    const aversion = Math.max(0, financialAmbition - ageOffset - perfOffset - contenderOffset);
    // walkAwayRaisePercent(항상 <=0)까지의 거리를 기준으로 정규화 — 딱 그 지점에서
    // steepness=1(최대 거부감), 0%에 가까울수록 0에 수렴.
    const range = Math.abs(walkAwayRaisePercent);
    const steepness = range > 0 ? Math.min(1, Math.abs(raisePercent) / range) : 1;
    return aversion * steepness;
}

// 오퍼 제출 "전에" 화면에 보여줄 대략적인 수락 확률(0~1) — evaluateFAOffer()와 완전히
// 같은 수식을 쓰되 시드 난수 롤 없이 확률값 자체를 반환한다(정보 표시 전용, 실제 판정은
// 여전히 evaluateFAOffer()가 함). 두 함수의 내부 롤 순서가 달라(evaluateFAOffer는 연수→
// 팀전력 순으로 두 번 독립 롤, 여기는 한 번에 결합 확률) 특정 seed에서 "표시된 확률"과
// "실제 결과"가 정확히 같은 난수원을 공유하진 않지만, 분포상 기대값은 동일해서 사용자
// 관점에서는 신뢰할 만한 사전 지표가 된다.
export function estimateAcceptProbability(
    offer: { salary: number; years: number; raisePercent?: number },
    demand: FADemandResult,
    winDesire?: number,
    contenderScore?: number,
    financialAmbition?: number,
): number {
    const teamFitPenalty = (winDesire !== undefined && contenderScore !== undefined)
        ? calcTeamFitPenalty(winDesire, contenderScore)
        : 0;
    // [2026-09-16 Fix] 계수/캡이 둘 다 0.6이면 penalty=1(최악의 미스매치)이어도
    // teamFitRejectProb이 정확히 0.6에서 멈춰, "요구가 이상" 분기의 확률 하한이 1-0.6=0.4
    // ("보통" 경계)로 고정돼 "어려움"/"매우 어려움"에 절대 도달할 수 없었다(마이애미 26위
    // 세션에서 전원 "보통" 이상으로만 뜨던 버그의 원인). 0.85로 올려 극단적 미스매치는
    // 실제로 "매우 어려움"까지 내려가게 함.
    const teamFitRejectProb = Math.min(0.85, teamFitPenalty * 0.85);

    // [2026-09-17] 하향식(변동률 음수) 계약 거부감 — calcDeclineAversionPenalty 참고.
    // teamFit보다 비중이 작은 "구조 선호"라 캡을 0.6으로 낮게 둔다(팀 전력 미스매치처럼
    // 절대적인 딜브레이커까지는 아니라는 설계 판단).
    const declinePenalty = (financialAmbition !== undefined && winDesire !== undefined && contenderScore !== undefined && offer.raisePercent !== undefined)
        ? calcDeclineAversionPenalty(
            financialAmbition, winDesire, contenderScore, offer.raisePercent, demand.walkAwayRaisePercent ?? -5,
            demand.declineAgeTolerance ?? 0, demand.declinePerfTolerance ?? 0,
        )
        : 0;
    const declineRejectProb = Math.min(0.6, declinePenalty * 0.6);

    const yearsShort = Math.max(0, (demand.askingYears ?? 0) - offer.years);

    if (offer.salary >= demand.askingSalary) {
        const yearsRejectProb = yearsShort >= 2 ? Math.min(0.55, (yearsShort - 1) * 0.25) : 0;
        return (1 - yearsRejectProb) * (1 - teamFitRejectProb) * (1 - declineRejectProb);
    }
    if (offer.salary < demand.walkAwaySalary) return 0;

    const range = demand.askingSalary - demand.walkAwaySalary;
    if (range <= 0) return 0;

    let acceptProb = (offer.salary - demand.walkAwaySalary) / range;

    if (demand.askingYears) {
        const yearsDiff = demand.askingYears - offer.years;
        const yearsFactor = yearsDiff > 0
            ? Math.max(0.55, 1.0 - yearsDiff * 0.12)
            : Math.min(1.10, 1.0 + Math.abs(yearsDiff) * 0.04);
        acceptProb *= yearsFactor;
    }
    if (teamFitPenalty > 0) acceptProb *= (1 - teamFitPenalty * 0.85);
    if (declinePenalty > 0) acceptProb *= (1 - declineRejectProb);

    return Math.max(0, Math.min(1, acceptProb));
}

// ─────────────────────────────────────────────────────────────
// Two-Way 계약 수락 판정 — 일반 FA 오퍼와 완전히 다른 축
// ─────────────────────────────────────────────────────────────
// 투웨이 연봉(0 YOS 미니멈의 50%, 일할계산)은 항상 일반 FA 수요(walkAwaySalary — 최소
// 하한이 YOS별 베테랑 미니멈)보다 한참 낮아, evaluateFAOffer()의 금액 기준 판정을 그대로
// 쓰면 어떤 선수든 무조건 거절한다(사용자 리포트). 하지만 실제로는 "저연차(YOS 낮음) +
// 시장가치 낮은" 선수일수록 애초에 정규 계약을 받을 가능성 자체가 희박해, "일단 NBA
// 로스터에 남는" 투웨이 기회를 오히려 긍정적으로 받아들인다 — 그래서 오퍼 금액을 아예
// 보지 않고 YOS/시장가치만으로 별도 판정한다(투웨이 급여는 사실상 고정 산식이라 협상의
// 여지가 없다는 실제 구조와도 부합).
//
// [2026-09-16 Fix] 처음엔 "시장가치" 대신 raw OVR(calculatePlayerOvr)을 썼는데, 그러면
// calcFADemand()가 산출한 marketValueScore(스탯 percentile+나이+부상 등을 반영한 진짜
// 시장가치)와 완전히 동떨어진 축이 되어 앞뒤가 안 맞는 상황이 생겼다 — 미니멈 연봉
// 제안조차 "어려움"으로 뜨는 선수(marketValueScore가 scoreToCapShare 최하위 티어보다
// 높아 vetMin 제안이 자기 기대보다 낮다고 느끼는 선수)가, 투웨이(미니멈보다도 훨씬
// 낮은 급여)는 오히려 "높음"으로 뜨는 모순. marketValueScore를 그대로 재사용하면
// scoreToCapShare의 최하위 티어(<35, 대략 진짜 "미니멈 캐릭터" 선수) 근처에서만
// 투웨이를 반기고, 그 이상(미니멈보다 더 받을 자격이 있다고 스스로 느끼는 선수)이면
// 똑같이 꺼리게 되어 두 판정이 서로 어긋나지 않는다.
function twoWayAcceptProbability(yos: number, marketValueScore: number): number {
    // YOS 4년 이상은 애초에 협상 화면에서 투웨이 자체를 선택할 수 없다(UI 가드) — 방어적으로도 0.
    if (yos >= 4) return 0;

    // YOS: 0(신인)이면 1.0, 4에 가까울수록 0으로 선형 감소 — 연차가 쌓일수록 "이 정도면
    // 정규 계약을 노려볼 나이"라는 인식이 강해진다.
    const yosFactor = Math.max(0, 1 - yos / 4);
    // 시장가치: scoreToCapShare()의 최하위 티어 경계(35)보다도 한참 낮아야(<30 부근)
    // "진짜 미니멈/투웨이 캐릭터"로 보고 1.0에 가깝게, 30 이상이면(미니멈보다 나은 대우를
    // 기대할 근거가 있는 선수) 0으로 급격히 떨어진다.
    const qualityFactor = Math.max(0, Math.min(1, (30 - marketValueScore) / 30));

    // 가중 평균(연차 50% : 시장가치 50%) — 신인이라는 이유만으로도 어느 정도 받아들이지만,
    // 시장가치가 이미 미니멈 이상을 기대할 만하면(qualityFactor 낮음) 그마저도 덜 받아들이도록 낮춘다.
    const combined = yosFactor * 0.5 + qualityFactor * 0.5;

    // 완전히 0/1로 수렴하지 않도록 5~95%로 클램프 — 신인이라도 자존심에 거절할 수 있고,
    // 조건이 나빠 보여도 궁지에 몰린 베테랑이 받아들일 여지는 남겨둔다.
    return Math.max(0.05, Math.min(0.95, combined));
}

/** 협상 화면에서 제출 "전" 실시간 표시용 — evaluateTwoWayOffer()와 동일한 확률을
 *  난수 롤 없이 그대로 반환한다(estimateAcceptProbability와 같은 관계). marketValueScore는
 *  calcFADemand()가 반환한 FADemandResult.marketValueScore를 그대로 넘기면 된다. */
export function estimateTwoWayAcceptProbability(yos: number, marketValueScore: number): number {
    return twoWayAcceptProbability(yos, marketValueScore);
}

export function evaluateTwoWayOffer(yos: number, marketValueScore: number, seed: string): boolean {
    const prob = twoWayAcceptProbability(yos, marketValueScore);
    const hash = stringToHash(seed + 'twoway');
    const rand = (hash % 10000) / 10000;
    return rand < prob;
}

export function evaluateFAOffer(
    offer: { salary: number; years: number; raisePercent?: number },
    demand: FADemandResult,
    seed: string,
    // [2026-09-16] 팀 전력(약팀 기피) 반영 — 둘 다 지정할 때만 동작, 하나라도 생략하면
    // teamFitPenalty=0으로 기존 동작과 100% 동일(기존 호출부인 processUserOffer 등은
    // 이 인자들을 안 넘기므로 영향 없음). winDesire는 SaveTendencies.winDesire(0~1),
    // contenderScore는 플레이오프 진출 확률(0~1, 멀티는 computePlayoffOddsMap 재사용).
    winDesire?: number,
    contenderScore?: number,
    // [2026-09-17] 하향식(변동률 음수) 계약 거부감 — offer.raisePercent와 함께 셋 다
    // 지정할 때만 동작(calcDeclineAversionPenalty 참고), 하나라도 생략하면 기존 동작과
    // 100% 동일.
    financialAmbition?: number,
): boolean {
    const teamFitPenalty = (winDesire !== undefined && contenderScore !== undefined)
        ? calcTeamFitPenalty(winDesire, contenderScore)
        : 0;
    const declinePenalty = (financialAmbition !== undefined && winDesire !== undefined && contenderScore !== undefined && offer.raisePercent !== undefined)
        ? calcDeclineAversionPenalty(
            financialAmbition, winDesire, contenderScore, offer.raisePercent, demand.walkAwayRaisePercent ?? -5,
            demand.declineAgeTolerance ?? 0, demand.declinePerfTolerance ?? 0,
        )
        : 0;

    // Years evaluation: how many years short of asking
    const yearsShort = Math.max(0, (demand.askingYears ?? 0) - offer.years);

    if (offer.salary >= demand.askingSalary) {
        // Salary is sufficient but years may be too short
        if (yearsShort >= 2) {
            // 2 years short: 25% reject, 3 years: 50%, capped at 55%
            const rejectProb = Math.min(0.55, (yearsShort - 1) * 0.25);
            const hash = stringToHash(seed + 'yr' + String(offer.years));
            if ((hash % 10000) / 10000 < rejectProb) return false;
        }
        // 연봉이 충분해도 우승욕 강한 선수는 가망 없는 팀이면 그냥 거절할 수 있음.
        // [2026-09-16 Fix] estimateAcceptProbability()와 동일하게 0.6→0.85 — 예전 캡으로는
        // 최악의 미스매치여도 거절확률이 60%를 못 넘어 "가능성" 지표가 절대 "어려움" 밑으로
        // 안 내려가던 문제(자세한 계산은 estimateAcceptProbability 주석 참고)를 판정 로직도
        // 똑같이 겪고 있었음 — 표시값과 실제 판정이 어긋나지 않도록 같이 맞춤.
        if (teamFitPenalty > 0) {
            const rejectProb = Math.min(0.85, teamFitPenalty * 0.85);
            const hash = stringToHash(seed + 'fit');
            if ((hash % 10000) / 10000 < rejectProb) return false;
        }
        // 하향식 계약 거부감 — estimateAcceptProbability()와 동일하게 0.6 캡, 별도 시드로
        // 독립 롤(팀 전력 거절과 같은 롤을 공유하면 둘이 항상 같이 붙거나 같이 안 붙는
        // 상관관계가 생겨버림).
        if (declinePenalty > 0) {
            const rejectProb = Math.min(0.6, declinePenalty * 0.6);
            const hash = stringToHash(seed + 'decline');
            if ((hash % 10000) / 10000 < rejectProb) return false;
        }
        return true;
    }
    if (offer.salary < demand.walkAwaySalary) return false;

    const range = demand.askingSalary - demand.walkAwaySalary;
    if (range <= 0) return false;

    let acceptProb = (offer.salary - demand.walkAwaySalary) / range;

    // yearsFactor: 1 year short = ×0.88, 2 = ×0.76, 3 = ×0.64 (floor ×0.55)
    // years extra: 1 over = ×1.04, capped at ×1.10
    if (demand.askingYears) {
        const yearsDiff = demand.askingYears - offer.years;
        const yearsFactor = yearsDiff > 0
            ? Math.max(0.55, 1.0 - yearsDiff * 0.12)
            : Math.min(1.10, 1.0 + Math.abs(yearsDiff) * 0.04);
        acceptProb *= yearsFactor;
    }

    if (teamFitPenalty > 0) acceptProb *= (1 - teamFitPenalty * 0.85);
    if (declinePenalty > 0) acceptProb *= (1 - Math.min(0.6, declinePenalty * 0.6));

    const hash = stringToHash(seed + String(offer.salary) + String(offer.years));
    const rand = (hash % 10000) / 10000;

    return rand < acceptProb;
}

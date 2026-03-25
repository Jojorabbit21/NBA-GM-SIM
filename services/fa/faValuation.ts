import type { Player, PlayerStats } from '../../types/player';
import type { Team } from '../../types/team';
import type { FARole, FADemandResult, MarketCondition } from '../../types/fa';
import { ARCHETYPE_TO_FA_ROLE } from '../../types/archetype';
import { LEAGUE_FINANCIALS } from '../../utils/constants';
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

    if (recent.some(e => e.severity === 'Season-Ending')) penalty += 8;

    const majorCount = recent.filter(e => e.severity === 'Major').length;
    if (majorCount >= 2) penalty += 5;
    else if (majorCount === 1) penalty += 2;

    const nonMinorCount = recent.filter(e => e.severity !== 'Minor').length;
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

function calcYOSBounds(yos: number, player?: Player): { maxAllowed: number; vetMin: number } {
    const cap = LEAGUE_FINANCIALS.SALARY_CAP;
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
    let targetSalary = LEAGUE_FINANCIALS.SALARY_CAP * capShare;

    // Step 9: YOS 상/하한
    const yos = currentSeasonYear - (player.draftYear ?? currentSeasonYear);
    const { maxAllowed, vetMin } = calcYOSBounds(yos, player);
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

    return {
        askingSalary:   Math.round(openingAsk),
        walkAwaySalary: Math.round(walkAway),
        targetSalary:   Math.round(targetSalary),
        askingYears,
        marketValueScore: Math.round(marketValueScore * 10) / 10,
        faRole,
    };
}

// ─────────────────────────────────────────────────────────────
// evaluateFAOffer — 오퍼 수락 여부 판정
// ─────────────────────────────────────────────────────────────

export function evaluateFAOffer(
    offer: { salary: number; years: number },
    demand: FADemandResult,
    seed: string,
): boolean {
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

    const hash = stringToHash(seed + String(offer.salary) + String(offer.years));
    const rand = (hash % 10000) / 10000;

    return rand < acceptProb;
}

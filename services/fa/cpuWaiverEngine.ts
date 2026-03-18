import type { Team, DeadMoneyEntry, ReleaseType } from '../../types/team';
import type { Player } from '../../types/player';
import type { LeagueFAMarket } from '../../types/fa';
import type { GMProfile, GMPersonalityType, TeamDirection, LeagueGMProfiles } from '../../types/gm';
import { LEAGUE_FINANCIALS } from '../../utils/constants';
import { releasePlayerToMarket, calcTeamPayroll } from './faMarketBuilder';
import { determineFARole } from './faValuation';
import { stringToHash } from '../../utils/hiddenTendencies';
import { getPlayerTradeValue } from '../tradeEngine/tradeValue';

// ─────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────

type WaiverReason =
    | 'roster_overflow'   // 15인 초과 강제 방출
    | 'salary_efficiency' // 연봉 대비 성과 부족
    | 'age_rebuild'       // 리빌딩 방향 — 고령 베테랑 방출
    | 'cap_space'         // FA 영입 공간 확보
    | 'defense_upgrade'   // 수비 집중 성향 — 수비력 낮은 선수 교체
    | 'redundancy'        // 동일 역할 과포화
    | 'contract_burden';  // 장기 계약 비효율

export interface CPUWaiverResult {
    teams: Team[];
    market: LeagueFAMarket;
    waivers: Array<{
        teamId: string;
        playerId: string;
        playerName: string;
        reason: WaiverReason;
        releaseType: ReleaseType;
        deadMoney: number;
    }>;
    /** 트레이드 가치가 있어 웨이버 대신 트레이드 블록에 올릴 선수 */
    preferTradeBlock: Array<{
        teamId: string;
        playerId: string;
        playerName: string;
    }>;
}

// ─────────────────────────────────────────────────────────────
// Internal Types
// ─────────────────────────────────────────────────────────────

interface WaiverPersonalityParams {
    patience: number;           // 0~1: 낮을수록 빨리 방출
    winNowBias: number;         // 0~1: 현재 기여 우선
    prospectBias: number;       // 0~1: 젊은/잠재력 높은 선수 보호
    financialDiscipline: number; // 0~1: 비효율 계약 정리 적극성
    riskTolerance: number;      // 0~1: noise 진폭
    loyaltyBias: number;        // 0~1: 장기 팀원 보호
    churnTendency: number;      // 0~1: 로스터 끝단 갈아엎는 성향
    defenseEmphasis: number;    // 0~1: defenseFocused 전용
    maxWaivers: number;
}

interface ReleaseDecision {
    type: ReleaseType;
    deadMoneyAmount: number;
    stretchYearsTotal?: number;
}

// ─────────────────────────────────────────────────────────────
// Personality Presets
// ─────────────────────────────────────────────────────────────

const PERSONALITY_PRESETS: Record<GMPersonalityType, WaiverPersonalityParams> = {
    balanced:       { patience: 0.50, winNowBias: 0.50, prospectBias: 0.50, financialDiscipline: 0.50, riskTolerance: 0.50, loyaltyBias: 0.50, churnTendency: 0.40, defenseEmphasis: 0.50, maxWaivers: 2 },
    winNow:         { patience: 0.30, winNowBias: 0.85, prospectBias: 0.30, financialDiscipline: 0.55, riskTolerance: 0.60, loyaltyBias: 0.35, churnTendency: 0.55, defenseEmphasis: 0.50, maxWaivers: 2 },
    rebuilder:      { patience: 0.65, winNowBias: 0.25, prospectBias: 0.85, financialDiscipline: 0.70, riskTolerance: 0.45, loyaltyBias: 0.40, churnTendency: 0.65, defenseEmphasis: 0.40, maxWaivers: 4 },
    starHunter:     { patience: 0.35, winNowBias: 0.60, prospectBias: 0.35, financialDiscipline: 0.50, riskTolerance: 0.55, loyaltyBias: 0.30, churnTendency: 0.60, defenseEmphasis: 0.40, maxWaivers: 2 },
    valueTrader:    { patience: 0.50, winNowBias: 0.45, prospectBias: 0.55, financialDiscipline: 0.90, riskTolerance: 0.35, loyaltyBias: 0.45, churnTendency: 0.50, defenseEmphasis: 0.45, maxWaivers: 3 },
    defenseFocused: { patience: 0.50, winNowBias: 0.55, prospectBias: 0.45, financialDiscipline: 0.55, riskTolerance: 0.50, loyaltyBias: 0.50, churnTendency: 0.45, defenseEmphasis: 0.90, maxWaivers: 2 },
    youthMovement:  { patience: 0.70, winNowBias: 0.20, prospectBias: 0.90, financialDiscipline: 0.65, riskTolerance: 0.50, loyaltyBias: 0.45, churnTendency: 0.75, defenseEmphasis: 0.35, maxWaivers: 4 },
};

const DIRECTION_PATIENCE_MOD: Record<TeamDirection, number> = {
    winNow: 1.20, buyer: 1.10, standPat: 1.00, seller: 0.70, tanking: 0.45,
};
const DIRECTION_CHURN_MOD: Record<TeamDirection, number> = {
    winNow: 0.80, buyer: 0.90, standPat: 1.00, seller: 1.40, tanking: 1.80,
};
const DIRECTION_MAX_WAIVER_DELTA: Record<TeamDirection, number> = {
    winNow: -1, buyer: 0, standPat: 0, seller: 1, tanking: 2,
};

/** 트레이드 가능 기준 — 이 값 이상이면 웨이버 대신 트레이드 블록 */
const TRADEABLE_VALUE_FLOOR = 100;

const MIN_ROSTER = 8;
const MAX_ROSTER = 15;

// ─────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 1): number {
    return Math.min(max, Math.max(min, v));
}

function normalize(v: number, lo: number, hi: number): number {
    if (hi <= lo) return 0;
    return clamp((v - lo) / (hi - lo));
}

function getAnnualSalary(player: Player): number {
    if ((player.salary ?? 0) > 0) return player.salary ?? 0;
    const c = player.contract;
    if (!c) return 0;
    return c.years[c.currentYear] ?? c.years[0] ?? 0;
}

function getRemainingYears(player: Player): number {
    const c = player.contract;
    if (!c) return 0;
    return Math.max(0, c.years.length - c.currentYear - 1);
}

function getTotalRemainingValue(player: Player): number {
    const c = player.contract;
    if (!c) return getAnnualSalary(player);
    return c.years.slice(c.currentYear).reduce((s, v) => s + v, 0);
}

/** OVR 88+ && age <= 33 → 절대 방출 불가 스타 */
function starProtected(player: Player): boolean {
    return player.ovr >= 88 && player.age <= 33;
}

// ─────────────────────────────────────────────────────────────
// Personality Params Builder
// ─────────────────────────────────────────────────────────────

function buildPersonalityParams(
    personality: GMPersonalityType,
    sliders: GMProfile['sliders'],
    direction: TeamDirection,
): WaiverPersonalityParams {
    const base = { ...PERSONALITY_PRESETS[personality] };

    const aggFactor   = sliders.aggressiveness / 10;
    const youthFactor = sliders.youthBias / 10;
    const riskFactor  = sliders.riskTolerance / 10;

    const churnTendency  = clamp(base.churnTendency * DIRECTION_CHURN_MOD[direction] * (0.5 + aggFactor * 0.5));
    const prospectBias   = clamp(base.prospectBias * (0.5 + youthFactor));
    const riskTolerance  = clamp(base.riskTolerance * (0.5 + riskFactor));
    const patience       = clamp(base.patience * DIRECTION_PATIENCE_MOD[direction]);
    const maxWaivers     = Math.max(1,
        base.maxWaivers
        + DIRECTION_MAX_WAIVER_DELTA[direction]
        + (aggFactor >= 0.8 ? 1 : 0)
    );

    return { ...base, patience, prospectBias, riskTolerance, churnTendency, maxWaivers };
}

// ─────────────────────────────────────────────────────────────
// KeepValue Components
// ─────────────────────────────────────────────────────────────

function calcCurrentContribution(
    player: Player,
    teamRoster: Player[],
    params: WaiverPersonalityParams,
): number {
    const abilityScore = normalize(player.ovr, 60, 100);

    const myRole = determineFARole(player);
    const sameRolePlayers = teamRoster.filter(p => determineFARole(p) === myRole && p.id !== player.id);
    const roleAvgOvr = sameRolePlayers.length > 0
        ? sameRolePlayers.reduce((s, p) => s + p.ovr, 0) / sameRolePlayers.length
        : 70;
    const roleFit = normalize(player.ovr - roleAvgOvr, -20, 20);

    const depthPenalty = normalize(sameRolePlayers.length, 0, 5);
    const durability   = normalize(player.stamina ?? 50, 30, 100);

    const defRating = (
        (player.intDef ?? 50) + (player.perDef ?? 50) +
        (player.helpDefIq ?? 50) + (player.defConsist ?? 50)
    ) / 4;
    const defContrib       = normalize(defRating, 40, 90);
    const defPenaltyFactor = 1.0 - params.defenseEmphasis * (1.0 - defContrib) * 0.4;

    const raw = (
        0.45 * abilityScore +
        0.30 * roleFit +
        0.15 * (1 - depthPenalty) +
        0.10 * durability
    ) * defPenaltyFactor;

    return clamp(raw);
}

function calcDevelopmentValue(
    player: Player,
    params: WaiverPersonalityParams,
): number {
    let ageCurve: number;
    if (player.age <= 24) {
        ageCurve = 1.0;
    } else if (player.age <= 30) {
        ageCurve = normalize(30 - player.age, 0, 6);
    } else {
        ageCurve = 0;
    }

    const growthRoom   = Math.max(0, (player.potential ?? player.ovr) - player.ovr);
    const potentialScore = normalize(growthRoom, 0, 30);

    const raw = clamp(
        0.45 * potentialScore +
        0.35 * ageCurve +
        0.20 * params.prospectBias
    );

    // 유망주 강제 보호 하한
    if (player.age <= 24 && (player.potential ?? 0) >= 80) {
        return Math.max(0.70, raw);
    }
    return raw;
}

function calcContractValue(player: Player): number {
    const salary    = getAnnualSalary(player);
    const salaryM   = salary / 1_000_000;
    const remaining = getRemainingYears(player);

    const salaryEfficiency = normalize(salaryM > 0 ? player.ovr / salaryM : 20, 0, 20);

    // 잔여 연수 유연성: 잔여 적을수록 높음 (0년=0.8, 1~3년=0.5, 4년+=감점)
    let guaranteeFlex: number;
    if (remaining === 0) {
        guaranteeFlex = 0.8;
    } else if (remaining <= 3) {
        guaranteeFlex = 0.5;
    } else {
        guaranteeFlex = Math.max(0, normalize(6 - remaining, 0, 3)) * 0.3;
    }

    const controlYears   = remaining >= 1 && remaining <= 3 ? 0.5 : remaining > 3 ? 0.2 : 0.8;
    const teamOptionBonus = player.contract?.option?.type === 'team' ? 0.1 : 0;

    return clamp(
        0.50 * salaryEfficiency +
        0.30 * guaranteeFlex +
        0.20 * controlYears +
        teamOptionBonus
    );
}

function calcRosterUtility(player: Player, teamRoster: Player[]): number {
    const myRole      = determineFARole(player);
    const sameRoleCount = teamRoster.filter(p => determineFARole(p) === myRole && p.id !== player.id).length;

    const roleNeed          = normalize(4 - sameRoleCount, 0, 4);
    const redundancyPenalty = sameRoleCount >= 4 ? 1.0 : normalize(sameRoleCount, 0, 4);

    const positionCount   = teamRoster.filter(p => p.position === player.position && p.id !== player.id).length;
    const injuryInsurance = positionCount <= 1 ? 0.8 : 0.3;

    return clamp(
        0.45 * roleNeed +
        0.30 * (1 - redundancyPenalty) +
        0.25 * injuryInsurance
    );
}

function calcOptionValue(player: Player, market: LeagueFAMarket): number {
    const myRole      = determineFARole(player);
    const remaining   = getRemainingYears(player);

    const tradeMatchValue = (remaining >= 1 && remaining <= 3) ? 0.6 : 0.2;

    const roleEntries = market.entries.filter(e => e.status === 'available' && e.faRole === myRole);
    const scarcityRisk = roleEntries.length === 0
        ? 1.0
        : normalize(5 - roleEntries.length, 0, 5);

    const upside         = Math.max(0, (player.potential ?? player.ovr) - player.ovr);
    const upsideUnrealized = normalize(upside, 0, 20);

    return clamp(
        0.40 * tradeMatchValue +
        0.35 * scarcityRisk +
        0.25 * upsideUnrealized
    );
}

function calcKeepValue(
    player: Player,
    teamRoster: Player[],
    market: LeagueFAMarket,
    params: WaiverPersonalityParams,
    direction: TeamDirection,
): number {
    const A = calcCurrentContribution(player, teamRoster, params);
    const B = calcDevelopmentValue(player, params);
    const C = calcContractValue(player);
    const D = calcRosterUtility(player, teamRoster);
    const E = calcOptionValue(player, market);

    let wA = 0.32, wB = 0.22, wC = 0.18, wD = 0.22, wE = 0.06;

    // 팀 방향 보정
    if (direction === 'winNow' || direction === 'buyer') {
        wA += 0.08; wB -= 0.08;
    } else if (direction === 'tanking' || direction === 'seller') {
        wB += 0.10; wA -= 0.10;
    }

    // winNowBias 슬라이더 반영 (최대 ±0.05)
    const winNowAdj = (params.winNowBias - 0.5) * 0.10;
    wA += winNowAdj; wB -= winNowAdj;

    return clamp(wA * A + wB * B + wC * C + wD * D + wE * E);
}

// ─────────────────────────────────────────────────────────────
// Replacement Value
// ─────────────────────────────────────────────────────────────

function calcReplacementValue(player: Player, market: LeagueFAMarket): number {
    const myRole   = determineFARole(player);
    const mySalary = getAnnualSalary(player);

    const faPlayerMap = new Map<string, Player>(
        (market.players ?? []).map(p => [p.id, p])
    );

    const candidates = market.entries.filter(e => e.status === 'available' && e.faRole === myRole);
    if (candidates.length === 0) return 0.3;

    const salaryLo = mySalary * 0.70;
    const salaryHi = mySalary * 1.50;

    let bestOvr = 0;
    let bestAskingSalary = 0;

    // 비용 유사 후보 우선 탐색
    for (const e of candidates) {
        if (e.askingSalary < salaryLo || e.askingSalary > salaryHi) continue;
        const faPlayer = faPlayerMap.get(e.playerId);
        if (faPlayer && faPlayer.ovr > bestOvr) {
            bestOvr = faPlayer.ovr;
            bestAskingSalary = e.askingSalary;
        }
    }

    // 비용 범위 내 후보 없으면 역할 내 최고 OVR 재탐색
    if (bestOvr === 0) {
        for (const e of candidates) {
            const faPlayer = faPlayerMap.get(e.playerId);
            if (faPlayer && faPlayer.ovr > bestOvr) {
                bestOvr = faPlayer.ovr;
                bestAskingSalary = e.askingSalary;
            }
        }
        if (bestOvr === 0) return 0.3;
    }

    const abilityScore       = normalize(bestOvr, 60, 100);
    const costDelta          = bestAskingSalary - mySalary;
    const signingCostPenalty = costDelta > 0 ? normalize(costDelta, 0, 10_000_000) * 0.25 : 0;
    const integrationRisk    = 0.05;

    return clamp(abilityScore - signingCostPenalty - integrationRisk);
}

// ─────────────────────────────────────────────────────────────
// Wave Pressure & Decision
// ─────────────────────────────────────────────────────────────

function calcNetWavePressure(
    player: Player,
    keepValue: number,
    replacementValue: number,
    params: WaiverPersonalityParams,
    tendencySeed: string,
): number {
    const remaining        = getRemainingYears(player);
    const guaranteePenalty = normalize(remaining, 0, 4) * 0.3;
    const waiveCostPenalty = clamp(
        0.50 * guaranteePenalty +
        0.25 * params.patience +
        0.15 * params.loyaltyBias
    );
    const churnBonus = params.churnTendency * 0.08;

    // 결정론적 noise (seed 기반)
    const hashVal = stringToHash(tendencySeed + player.id + String(player.ovr));
    const rand    = ((hashVal % 10000) / 10000) * 2 - 1;  // -1~+1
    const noise   = rand * 0.04 * params.riskTolerance;

    return replacementValue - keepValue - waiveCostPenalty + churnBonus + noise;
}

function decideWaiver(netWavePressure: number): 'KEEP' | 'MONITOR' | 'WAIVE' {
    if (netWavePressure >= 0.18) return 'WAIVE';
    if (netWavePressure >= 0.05) return 'MONITOR';
    return 'KEEP';
}

function classifyWaiverReason(
    player: Player,
    teamRoster: Player[],
    direction: TeamDirection,
): WaiverReason {
    const myRole        = determineFARole(player);
    const sameRoleCount = teamRoster.filter(p => determineFARole(p) === myRole && p.id !== player.id).length;
    const remaining     = getRemainingYears(player);
    const totalRemaining = getTotalRemainingValue(player);

    if (sameRoleCount >= 3) return 'redundancy';
    if (remaining >= 3 && totalRemaining > 15_000_000) return 'contract_burden';
    if ((direction === 'tanking' || direction === 'seller') && player.age >= 30) return 'age_rebuild';
    return 'salary_efficiency';
}

// ─────────────────────────────────────────────────────────────
// Release Type Decision
// ─────────────────────────────────────────────────────────────

function chooseCPUReleaseType(
    player: Player,
    params: WaiverPersonalityParams,
    direction: TeamDirection,
): ReleaseDecision {
    const remaining      = getRemainingYears(player);
    const totalRemaining = getTotalRemainingValue(player);
    const annualSalary   = getAnnualSalary(player);

    // 케이스 1: 잔여 1년 이하 OR 총액 $5M 미만 → 단순 웨이브
    if (remaining <= 1 || totalRemaining < 5_000_000) {
        const deadMoneyAmount = Math.max(0, totalRemaining - annualSalary);
        return { type: 'waive', deadMoneyAmount };
    }

    // 케이스 2: 잔여 3년+ && 총액 $20M+ && 공격적 리빌딩 → stretch
    const isAggressiveRebuild =
        direction === 'tanking' ||
        direction === 'seller' ||
        params.prospectBias >= 0.80;

    if (remaining >= 3 && totalRemaining > 20_000_000 && isAggressiveRebuild) {
        const stretchYearsTotal = 2 * remaining - 1;
        const deadMoneyAmount   = Math.round(totalRemaining / stretchYearsTotal);
        return { type: 'stretch', deadMoneyAmount, stretchYearsTotal };
    }

    // 케이스 3: 잔여 2년+ && OVR 68 이상 → buyout (잔여의 70%)
    if (remaining >= 2 && player.ovr >= 68) {
        const deadMoneyAmount = Math.round(totalRemaining * 0.70);
        return { type: 'buyout', deadMoneyAmount };
    }

    // 기본: waive
    const deadMoneyAmount = Math.max(0, totalRemaining - annualSalary);
    return { type: 'waive', deadMoneyAmount };
}

// ─────────────────────────────────────────────────────────────
// Trade-First Filter Helper
// ─────────────────────────────────────────────────────────────

/** 트레이드 가치가 충분하면 preferTradeBlock에 추가하고 true 반환 (웨이버 스킵) */
function tryPreferTrade(
    player: Player,
    teamId: string,
    preferTradeBlock: CPUWaiverResult['preferTradeBlock'],
): boolean {
    if (getPlayerTradeValue(player) > TRADEABLE_VALUE_FLOOR) {
        preferTradeBlock.push({ teamId, playerId: player.id, playerName: player.name });
        return true;
    }
    return false;
}

// ─────────────────────────────────────────────────────────────
// Shared Release Helper
// ─────────────────────────────────────────────────────────────

function executeRelease(
    player: Player,
    team: Team,
    releaseDecision: ReleaseDecision,
    updatedMarket: LeagueFAMarket,
    updatedTeams: Team[],
    tendencySeed: string,
    currentSeasonYear: number,
    currentSeason: string,
): LeagueFAMarket {
    // DeadMoneyEntry 추가
    if (releaseDecision.deadMoneyAmount > 0) {
        const dead: DeadMoneyEntry = {
            playerId:         player.id,
            playerName:       player.name,
            amount:           releaseDecision.deadMoneyAmount,
            season:           currentSeason,
            releaseType:      releaseDecision.type,
            stretchYearsTotal:     releaseDecision.stretchYearsTotal,
            stretchYearsRemaining: releaseDecision.stretchYearsTotal,  // 매 오프시즌 차감
        };
        team.deadMoney = [...(team.deadMoney ?? []), dead];
    }

    // FA 시장에 선수 추가
    const allPlayers = updatedTeams.flatMap(t => t.roster);
    return releasePlayerToMarket(
        updatedMarket,
        player,
        allPlayers,
        updatedTeams,
        `${currentSeasonYear}-07-01`,
        tendencySeed,
        currentSeasonYear,
        currentSeason,
        team.id,  // prevTeamId (Bird Rights용)
    );
}

// ─────────────────────────────────────────────────────────────
// Main Function
// ─────────────────────────────────────────────────────────────

export function simulateCPUWaivers(
    teams: Team[],
    market: LeagueFAMarket,
    userTeamId: string,
    leagueGMProfiles: LeagueGMProfiles,
    tendencySeed: string,
    currentSeasonYear: number,
    currentSeason: string,
    options?: {
        /** true → Phase 2 자발적 웨이버 건너뜀 (FA 개막 조기 웨이버용) */
        skipVoluntary?: boolean;
    },
): CPUWaiverResult {
    const updatedTeams: Team[] = teams.map(t => ({ ...t, roster: [...t.roster], deadMoney: [...(t.deadMoney ?? [])] }));
    let updatedMarket          = { ...market };
    const waivers:           CPUWaiverResult['waivers']           = [];
    const preferTradeBlock:  CPUWaiverResult['preferTradeBlock']  = [];

    const cpuTeams = updatedTeams.filter(t => t.id !== userTeamId);

    for (const team of cpuTeams) {
        const profile         = leagueGMProfiles[team.id] as GMProfile | undefined;
        const personalityType = profile?.personalityType ?? 'balanced';
        const direction       = profile?.direction ?? 'standPat';
        const sliders         = profile?.sliders ?? { aggressiveness: 5, starWillingness: 5, youthBias: 5, riskTolerance: 5, pickWillingness: 5 };
        const params          = buildPersonalityParams(personalityType, sliders, direction);

        let waiversThisSeason = 0;

        // ── Phase 1: 강제 방출 (로스터 15인 초과) ──
        while (team.roster.length > MAX_ROSTER) {
            const releaseCandidates = [...team.roster]
                .filter(p => !starProtected(p))
                .sort((a, b) => a.ovr - b.ovr);

            const target = releaseCandidates[0];
            if (!target) break;  // 스타만 남은 경우 overflow 미해결 허용

            const releaseDecision = chooseCPUReleaseType(target, params, direction);
            updatedMarket = executeRelease(
                target, team, releaseDecision,
                updatedMarket, updatedTeams, tendencySeed, currentSeasonYear, currentSeason,
            );
            team.roster = team.roster.filter(p => p.id !== target.id);
            waivers.push({
                teamId: team.id, playerId: target.id, playerName: target.name,
                reason: 'roster_overflow', releaseType: releaseDecision.type, deadMoney: releaseDecision.deadMoneyAmount,
            });
            waiversThisSeason++;
        }

        // Phase 1 이후 로스터 기준으로 평가 — Phase 2와 Phase 3에서 공유 사용
        const evaluated = team.roster
            .filter(p => !starProtected(p))
            .map(p => {
                const keepValue        = calcKeepValue(p, team.roster, updatedMarket, params, direction);
                const replacementValue = calcReplacementValue(p, updatedMarket);
                const netWavePressure  = calcNetWavePressure(p, keepValue, replacementValue, params, tendencySeed);
                const decision         = decideWaiver(netWavePressure);
                return { player: p, keepValue, netWavePressure, decision };
            });

        // ── Phase 2: 성향 기반 자발적 방출 (KeepValue 모델) ──
        if (!options?.skipVoluntary) {
            if (waiversThisSeason < params.maxWaivers && team.roster.length > MIN_ROSTER + 1) {
                // WAIVE 결정된 선수를 압력 높은 순으로 정렬
                const waiverCandidates = evaluated
                    .filter(e => e.decision === 'WAIVE')
                    .sort((a, b) => b.netWavePressure - a.netWavePressure);

                for (const { player } of waiverCandidates) {
                    if (waiversThisSeason >= params.maxWaivers) break;
                    if (team.roster.length <= MIN_ROSTER + 1) break;

                    // 트레이드 우선 필터: 트레이드 가치가 충분하면 웨이버 대신 블록 추가
                    if (tryPreferTrade(player, team.id, preferTradeBlock)) continue;

                    const reason          = classifyWaiverReason(player, team.roster, direction);
                    const releaseDecision = chooseCPUReleaseType(player, params, direction);
                    updatedMarket = executeRelease(
                        player, team, releaseDecision,
                        updatedMarket, updatedTeams, tendencySeed, currentSeasonYear, currentSeason,
                    );
                    team.roster = team.roster.filter(p => p.id !== player.id);
                    waivers.push({
                        teamId: team.id, playerId: player.id, playerName: player.name,
                        reason, releaseType: releaseDecision.type, deadMoney: releaseDecision.deadMoneyAmount,
                    });
                    waiversThisSeason++;
                }
            }
        }

        // ── Phase 3: FA 공간 확보 (페이롤 1차 에이프런 초과 시) ──
        const payroll = calcTeamPayroll(team);
        if (
            payroll > LEAGUE_FINANCIALS.FIRST_APRON &&
            waiversThisSeason < params.maxWaivers &&
            (direction === 'tanking' || direction === 'seller')  // standPat 제외
        ) {
            if (team.roster.length > MIN_ROSTER + 1) {
                // Phase 2에서 계산한 keepValue 재사용 — 현재 로스터에 남아있는 선수만 필터
                const rosterIds = new Set(team.roster.map(p => p.id));
                const capTarget = evaluated
                    .filter(e => rosterIds.has(e.player.id))
                    .sort((a, b) => a.keepValue - b.keepValue)[0];

                if (capTarget) {
                    if (!tryPreferTrade(capTarget.player, team.id, preferTradeBlock)) {
                        const releaseDecision = chooseCPUReleaseType(capTarget.player, params, direction);
                        updatedMarket = executeRelease(
                            capTarget.player, team, releaseDecision,
                            updatedMarket, updatedTeams, tendencySeed, currentSeasonYear, currentSeason,
                        );
                        team.roster = team.roster.filter(p => p.id !== capTarget.player.id);
                        waivers.push({
                            teamId: team.id, playerId: capTarget.player.id, playerName: capTarget.player.name,
                            reason: 'cap_space', releaseType: releaseDecision.type, deadMoney: releaseDecision.deadMoneyAmount,
                        });
                    }
                }
            }
        }
    }

    if (waivers.length > 0) {
        console.log(
            `🔄 CPU Waivers: ${waivers.length} released — ` +
            waivers.map(w => `${w.playerName}(${w.reason}/${w.releaseType})`).join(', ')
        );
    }
    if (preferTradeBlock.length > 0) {
        console.log(
            `📋 CPU Trade Block (waiver deferred): ${preferTradeBlock.length} — ` +
            preferTradeBlock.map(e => e.playerName).join(', ')
        );
    }

    return { teams: updatedTeams, market: updatedMarket, waivers, preferTradeBlock };
}

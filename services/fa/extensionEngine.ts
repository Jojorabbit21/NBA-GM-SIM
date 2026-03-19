/**
 * Contract Extension Negotiation Engine
 *
 * 선수는 시장가치(BATNA)와 대체 선택지를 알고 있다.
 * loyalty / winDesire 텐던시를 처음으로 실제 로직에 사용하는 구현.
 *
 * 핵심 공식:
 *   Opening Ask > Target AAV >= BATNA >= Reservation Floor > Insult Threshold
 */

import type { Player, PlayerContract } from '../../types/player';
import type { Team } from '../../types/team';
import type { FARole, FADemandResult, MarketCondition } from '../../types/fa';
import { generateSaveTendencies, stringToHash } from '../../utils/hiddenTendencies';
import { calcFADemand, determineFARole } from './faValuation';
import { analyzeTeamSituation } from '../tradeEngine/teamAnalysis';
import { LEAGUE_FINANCIALS, getOVRThreshold } from '../../utils/constants';
import { formatMoney } from '../../utils/formatMoney';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 1): number {
    return Math.max(lo, Math.min(hi, v));
}

// 중립 시장 컨디션 (FA 개막 전 익스텐션에서 사용)
const NEUTRAL_MARKET_CONDITION: MarketCondition = { roleSupply: 5, roleDemand: 5, ratio: 1.0 };
const NEUTRAL_MARKET: Record<FARole, MarketCondition> = {
    lead_guard:   NEUTRAL_MARKET_CONDITION,
    combo_guard:  NEUTRAL_MARKET_CONDITION,
    '3and_d':     NEUTRAL_MARKET_CONDITION,
    shot_creator: NEUTRAL_MARKET_CONDITION,
    stretch_big:  NEUTRAL_MARKET_CONDITION,
    rim_big:      NEUTRAL_MARKET_CONDITION,
    floor_big:    NEUTRAL_MARKET_CONDITION,
};

// OVR 기반 연봉 하한 (염가 계약 버그 방지) — 티어 기준은 getOVRThreshold()로 동적 계산
function getTierFloor(ovr: number): number {
    if (ovr >= getOVRThreshold('SUPERSTAR')) return 30_000_000;
    if (ovr >= getOVRThreshold('STAR'))      return 20_000_000;
    if (ovr >= getOVRThreshold('STARTER'))   return 9_000_000;
    if (ovr >= getOVRThreshold('ROLE'))      return 4_000_000;
    return 1_100_000;
}

// ─────────────────────────────────────────────────────────────
// Types (엔진 내부 사용)
// ─────────────────────────────────────────────────────────────

/** SaveTendencies에서 파생한 협상용 성격 지표 (6개) */
export interface ExtensionPersonality {
    pride: number;             // 0~1  (ego → 모욕선 결정)
    financialAmbition: number; // 0~1  (돈 우선도, 카운터 양보 폭)
    loyalty: number;           // 0~1  (원소속팀 Floor 완화)
    winDesire: number;         // 0~1  (강팀 선호 보너스)
    patience: number;          // 0~1  (협상 라운드 허용)
    riskAversion: number;      // 0~1  (장기계약 선호, 안정성 할인)
}

/** 협상 핵심 5값 */
export interface ExtensionDemand {
    openingAsk: number;        // 처음 요구 금액 (앵커)
    targetAAV: number;         // 적정 AAV
    reservationFloor: number;  // 최소 수용선 (BATNA * 0.82 이상 하드 보장)
    insultThreshold: number;   // 모욕선 (Floor * 0.86~0.94, pride 비례)
    batnaAAV: number;          // 대체 시장 기대치
    askingYears: number;       // 요구 연수 (FA보다 1년 짧음, 최소 1)
}

/** 협상 감정 상태 (React state로 라운드 간 유지) */
export interface NegotiationState {
    playerId: string;
    demand: ExtensionDemand;
    personality: ExtensionPersonality;
    // 감정 (0~1)
    respect: number;
    trust: number;
    frustration: number;
    // 이력
    roundsUsed: number;
    lowballCount: number;
    lastOfferAAV: number;
    currentCounterAAV: number;
    currentCounterYears: number;
    // 플래그
    walkedAway: boolean;
    signed: boolean;
}

/** 유저가 제출하는 오퍼 */
export interface ExtensionOfferContext {
    years: number;
    annualSalary: number;
    contenderScore: number; // 0~1 (팀 강팀 여부)
}

/** 오퍼 평가 결과 */
export type NegotiationResponse =
    | { outcome: 'ACCEPT'; contract: PlayerContract }
    | { outcome: 'COUNTER'; counterAAV: number; counterYears: number; message: string }
    | { outcome: 'REJECT_HARD'; message: string }
    | { outcome: 'WALKED_AWAY'; message: string };

// ─────────────────────────────────────────────────────────────
// getExtensionCandidates
// ─────────────────────────────────────────────────────────────

/** 익스텐션 협상 가능한 선수 목록 반환 */
export function getExtensionCandidates(myTeam: Team): Player[] {
    return myTeam.roster.filter(p => {
        if ((p.contractYears ?? 0) > 2) return false;
        if ((p.contractYears ?? 0) < 1) return false;
        if (p.contract?.option?.type === 'player') return false;
        // Season-Ending 부상 제외
        if (p.health === 'Injured') {
            const recentSE = p.injuryHistory?.some(h => h.severity === 'Season-Ending');
            if (recentSE) return false;
        }
        return true;
    });
}

// ─────────────────────────────────────────────────────────────
// buildExtensionPersonality
// ─────────────────────────────────────────────────────────────

/** SaveTendencies + 선수 나이로 성격 지표 6개 산출 */
export function buildExtensionPersonality(player: Player, tendencySeed: string): ExtensionPersonality {
    const st = generateSaveTendencies(tendencySeed, player.id);

    return {
        pride:             clamp((st.ego + 1) / 2),
        financialAmbition: clamp(st.financialAmbition),
        loyalty:           clamp(st.loyalty),
        winDesire:         clamp(st.winDesire),
        patience:          clamp(1.0 - (st.temperament + 1) / 2),
        riskAversion:      clamp((player.age - 24) / 12),
    };
}

// ─────────────────────────────────────────────────────────────
// calcExtensionBATNA
// ─────────────────────────────────────────────────────────────

/**
 * 선수의 대체 시장 기대치 (BATNA).
 * FA 시장가치의 95%를 기준으로 하되, OVR 티어 하한 보장.
 */
export function calcExtensionBATNA(
    player: Player,
    allPlayers: Player[],
    tendencySeed: string,
    currentSeasonYear: number,
    currentSeason: string,
    marketConditions?: Record<FARole, MarketCondition>,
): number {
    const mc = marketConditions ?? NEUTRAL_MARKET;
    const faDemand = calcFADemand(player, allPlayers, mc, currentSeasonYear, currentSeason, tendencySeed);
    const tieredFloor = getTierFloor(player.ovr);
    return Math.max(faDemand.targetSalary * 0.95, tieredFloor);
}

// ─────────────────────────────────────────────────────────────
// buildExtensionDemand
// ─────────────────────────────────────────────────────────────

/**
 * 협상 핵심 5값 산출 — 내부 헬퍼 (pre-computed FADemandResult 사용).
 * initNegotiationState에서 calcFADemand를 한 번만 호출하기 위해 분리.
 */
function _buildDemandFromFA(
    player: Player,
    personality: ExtensionPersonality,
    batnaAAV: number,
    faDemand: FADemandResult,
    isContender: boolean,
    tieredFloor: number,
): ExtensionDemand {
    const securityDiscount = 1.0 - personality.riskAversion * 0.12 * (1 - personality.financialAmbition * 0.5);
    const targetAAV = Math.max(tieredFloor, faDemand.targetSalary * securityDiscount);

    const loyaltyRelief   = personality.loyalty * 0.08;
    const winDesireRelief = isContender ? personality.winDesire * 0.06 : 0;
    const totalRelief     = Math.min(loyaltyRelief + winDesireRelief, 0.12);

    const reservationFloor = Math.max(
        batnaAAV * (1.0 - totalRelief),
        batnaAAV * 0.82,
        tieredFloor,
    );

    const openingAsk = Math.min(
        LEAGUE_FINANCIALS.SALARY_CAP * 0.35,
        Math.max(reservationFloor * 1.06, faDemand.askingSalary * 0.92),
    );

    const insultThreshold = reservationFloor * (0.94 - personality.pride * 0.08);
    const askingYears = Math.max(1, faDemand.askingYears - 1);

    return {
        openingAsk:       Math.round(openingAsk),
        targetAAV:        Math.round(targetAAV),
        reservationFloor: Math.round(reservationFloor),
        insultThreshold:  Math.round(insultThreshold),
        batnaAAV:         Math.round(batnaAAV),
        askingYears,
    };
}

/**
 * 협상 핵심 5값 산출 (공개 API).
 * loyalty / winDesire가 Reservation Floor 완화에 반영됨.
 */
export function buildExtensionDemand(
    player: Player,
    personality: ExtensionPersonality,
    batnaAAV: number,
    allPlayers: Player[],
    tendencySeed: string,
    currentSeasonYear: number,
    currentSeason: string,
    isContender: boolean,
    marketConditions?: Record<FARole, MarketCondition>,
): ExtensionDemand {
    const mc = marketConditions ?? NEUTRAL_MARKET;
    const faDemand = calcFADemand(player, allPlayers, mc, currentSeasonYear, currentSeason, tendencySeed);
    const tieredFloor = getTierFloor(player.ovr);
    return _buildDemandFromFA(player, personality, batnaAAV, faDemand, isContender, tieredFloor);
}

// ─────────────────────────────────────────────────────────────
// initNegotiationState
// ─────────────────────────────────────────────────────────────

/** 선수를 선택할 때 협상 상태 초기화 */
export function initNegotiationState(
    player: Player,
    myTeam: Team,
    allPlayers: Player[],
    tendencySeed: string,
    currentSeasonYear: number,
    currentSeason: string,
    marketConditions?: Record<FARole, MarketCondition>,
): NegotiationState {
    const teamAnalysis = analyzeTeamSituation(myTeam);
    const isContender  = teamAnalysis.isContender;
    const personality  = buildExtensionPersonality(player, tendencySeed);

    // calcFADemand는 allPlayers 450명을 12회 정렬하는 무거운 연산 — 1회만 호출
    const mc       = marketConditions ?? NEUTRAL_MARKET;
    const faDemand = calcFADemand(player, allPlayers, mc, currentSeasonYear, currentSeason, tendencySeed);
    const tieredFloor = getTierFloor(player.ovr);

    const batnaAAV = Math.max(faDemand.targetSalary * 0.95, tieredFloor);
    const demand   = _buildDemandFromFA(player, personality, batnaAAV, faDemand, isContender, tieredFloor);

    return {
        playerId: player.id,
        demand,
        personality,
        respect:    0.70,
        trust:      0.75, // 원소속팀이므로 기본 신뢰 상승
        frustration: 0.00,
        roundsUsed: 0,
        lowballCount: 0,
        lastOfferAAV: 0,
        currentCounterAAV:   demand.openingAsk,
        currentCounterYears: demand.askingYears,
        walkedAway: false,
        signed: false,
    };
}

// ─────────────────────────────────────────────────────────────
// calcOfferUtility
// ─────────────────────────────────────────────────────────────

/**
 * 오퍼의 선수 입장 효용 계산 (0~1+).
 * 모욕선 이하면 -1 (강제 거절).
 */
function calcOfferUtility(
    offer: ExtensionOfferContext,
    state: NegotiationState,
): number {
    const { demand, personality } = state;

    // 모욕선 이하 → 강제 차단
    if (offer.annualSalary < demand.insultThreshold) return -1;

    const moneyScore     = clamp(offer.annualSalary / demand.targetAAV, 0, 1.5);
    const preferredGuarantee = demand.targetAAV * demand.askingYears;
    const totalGuarantee     = offer.annualSalary * offer.years;
    const guaranteeScore = clamp(totalGuarantee / preferredGuarantee, 0, 1.5);

    // loyalty: 원소속팀 잔류 보너스
    const loyaltyBonus   = personality.loyalty * 0.30;
    // winDesire: 강팀 선호 보너스
    const winDesireBonus = personality.winDesire * offer.contenderScore * 0.25;
    const teamScore      = clamp(loyaltyBonus + winDesireBonus, 0, 0.80);

    const emotionScore = clamp(
        state.respect * 0.5 + state.trust * 0.5 - state.frustration,
        0, 1,
    );

    // 연수 적합도: 요구 연수에 가까울수록 높음
    const yearsDiff  = Math.abs(offer.years - demand.askingYears);
    const yearsScore = clamp(1.0 - yearsDiff * 0.2);

    return (
        0.48 * moneyScore +
        0.14 * guaranteeScore +
        0.14 * teamScore +
        0.14 * emotionScore +
        0.10 * yearsScore
    );
}

// ─────────────────────────────────────────────────────────────
// generateCounterOffer
// ─────────────────────────────────────────────────────────────

function generateCounterOffer(state: NegotiationState): { counterAAV: number; counterYears: number } {
    const { demand, personality } = state;

    // 점진적 양보: 라운드 진행 + 재정야망 + 짜증에 따라 양보 폭 조정
    const concessionStep = Math.max(0,
        (state.currentCounterAAV - demand.reservationFloor) *
        (0.20 - personality.financialAmbition * 0.12) *
        (1.0 - state.frustration * 0.50)
    );

    const counterAAV = Math.max(
        demand.reservationFloor,
        state.currentCounterAAV - concessionStep,
    );

    return {
        counterAAV:   Math.round(counterAAV),
        counterYears: demand.askingYears,
    };
}

// ─────────────────────────────────────────────────────────────
// evaluateExtensionOffer  (메인 평가 함수)
// ─────────────────────────────────────────────────────────────

/**
 * 유저 오퍼를 평가하고 NegotiationState를 갱신하여 반환.
 *
 * @returns { response, updatedState }
 */
export function evaluateExtensionOffer(
    offer: ExtensionOfferContext,
    state: NegotiationState,
    tendencySeed: string,
): { response: NegotiationResponse; updatedState: NegotiationState } {
    const { demand, personality } = state;
    let next = { ...state, roundsUsed: state.roundsUsed + 1, lastOfferAAV: offer.annualSalary };

    // ── 규칙 1: 모욕선 이하 → REJECT_HARD + 감정 악화
    if (offer.annualSalary < demand.insultThreshold) {
        next = {
            ...next,
            respect:      clamp(next.respect - 0.25),
            frustration:  clamp(next.frustration + 0.30),
            lowballCount: next.lowballCount + 1,
        };

        // ── 규칙 2: 3회 누적 → WALKED_AWAY
        if (next.lowballCount >= 3) {
            next = { ...next, walkedAway: true };
            return {
                response: { outcome: 'WALKED_AWAY', message: '더 이상 이 팀과 협상하지 않겠습니다.' },
                updatedState: next,
            };
        }

        return {
            response: {
                outcome: 'REJECT_HARD',
                message: `이 제안은 모욕적입니다. (최소 ${formatMoney(demand.insultThreshold)} 이상)`,
            },
            updatedState: next,
        };
    }

    // ── 규칙 2: WALKED_AWAY 상태 유지
    if (state.walkedAway) {
        return {
            response: { outcome: 'WALKED_AWAY', message: '협상이 이미 결렬되었습니다.' },
            updatedState: state,
        };
    }

    // ── 규칙 3: 같은 금액 재제시 패널티
    const sameOffer = state.lastOfferAAV > 0 && Math.abs(offer.annualSalary - state.lastOfferAAV) < 500_000;
    if (sameOffer) {
        next = { ...next, frustration: clamp(next.frustration + 0.10) };
    }

    // ── 감정 변화 (모욕선 이상 오퍼)
    if (offer.annualSalary < demand.reservationFloor) {
        next = {
            ...next,
            respect:      clamp(next.respect - 0.10),
            frustration:  clamp(next.frustration + 0.15),
            lowballCount: next.lowballCount + 1,
        };
    } else if (offer.annualSalary >= demand.targetAAV) {
        next = {
            ...next,
            respect:     clamp(next.respect + 0.10),
            trust:       clamp(next.trust + 0.05),
            frustration: clamp(next.frustration - 0.05),
        };
    }

    // ── 규칙 4: 수락 판정
    const utility = calcOfferUtility(offer, next);
    const acceptThreshold = 0.90 - next.frustration * 0.10;

    if (!sameOffer && utility >= acceptThreshold) {
        const contract = buildExtensionContract(offer.annualSalary, offer.years);
        next = { ...next, signed: true };
        return {
            response: { outcome: 'ACCEPT', contract },
            updatedState: next,
        };
    }

    // ── 규칙 5: 카운터
    const { counterAAV, counterYears } = generateCounterOffer(next);
    next = {
        ...next,
        currentCounterAAV:   counterAAV,
        currentCounterYears: counterYears,
    };

    return {
        response: {
            outcome: 'COUNTER',
            counterAAV,
            counterYears,
            message: `제 요구는 ${formatMoney(counterAAV)} / ${counterYears}년입니다.`,
        },
        updatedState: next,
    };
}

// ─────────────────────────────────────────────────────────────
// buildExtensionContract
// ─────────────────────────────────────────────────────────────

/** 수락된 오퍼로 PlayerContract 생성 */
export function buildExtensionContract(annualSalary: number, years: number): PlayerContract {
    return {
        years: Array.from({ length: years }, (_, i) =>
            Math.round(annualSalary * Math.pow(1.05, i)),
        ),
        currentYear: 0,
        type: 'extension',
    };
}

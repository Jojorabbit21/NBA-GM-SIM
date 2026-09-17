
// 멀티플레이어 RFA/QO 관련 의사결정 — 선수측(QO 수락/보류) + 팀측(미배정 팀 QO 텐더/
// 오퍼시트 매칭 자동 판단) 순수 함수 모음.
//
// [2026-09-17] 설계 전용 라운드 — plans/mellow-booping-sunbeam.md 참고. rfaEligibility.ts와
// 마찬가지로 아직 이 파일을 호출하는 트리거는 없다.
import type { Player } from '../../../types/player';
import type { FADemandResult } from '../../../types/fa';
import { stringToHash } from '../../../utils/hiddenTendencies';

// ─────────────────────────────────────────────────────────────
// 선수측: QO를 그 자리에서 수락(1년 확정)할지, 보류(RFA 시장 대기)할지
// ─────────────────────────────────────────────────────────────
//
// 싱글플레이어엔 이 로직이 없다 — QO가 실제로 선수에게 제시된 적이 없어서(FAMarketEntry.
// qualifyingOffer가 write-only 죽은 필드). 가장 가까운 기존 패턴은 faValuation.ts의 투웨이
// 전용 별도 축 모델(twoWayAcceptProbability/evaluateTwoWayOffer)이다 — 일반 evaluateFAOffer의
// walkAway 이분법을 그대로 쓰면 QO는 거의 항상 walkAwaySalary보다 낮아 100% 거절로 나오는
// 동일한 구조적 문제가 있어(투웨이와 같은 이유), 투웨이처럼 별도 축으로 설계했다.

/**
 * QO 수락 확률(표시/판단 공용). calcFADemand()가 계산한 targetSalary(내부 목표가)에 QO가
 * 가까울수록 "그냥 받자" 확률이 오르고, financialAmbition(다년 대박 계약을 노리는 성향,
 * generateSaveTendencies()로 이미 존재)이 클수록 보류 쪽으로 기운다.
 */
export function qoAcceptProbability(
    qoSalary: number,
    demand: FADemandResult,
    financialAmbition: number,
): number {
    const marketRatio = Math.min(1.2, qoSalary / Math.max(1, demand.targetSalary));
    let prob = Math.max(0, Math.min(1, (marketRatio - 0.5) / 0.7)); // ratio 0.5→0, 1.2→1

    prob *= (1 - financialAmbition * 0.5);

    return Math.max(0.03, Math.min(0.97, prob)); // 투웨이 모델과 동일하게 극단값 방지
}

/**
 * QO 수락/보류 확정 판단. 결정론적 해시 기반(같은 seed+qoSalary면 항상 같은 결과) —
 * evaluateFAOffer/evaluateTwoWayOffer와 동일한 재현성 원칙.
 *
 * 'hold'가 나오면 선수는 공식 RFA 상태로 진입한다 — 이후 원소속팀과 신규 다년계약 협상
 * (기존 evaluateFAOffer/MultiNegotiationView.tsx 협상 흐름 그대로 재사용 가능, RFA라고
 * 다를 거 없음) 또는 타팀 오퍼시트를 기다리는 두 갈래로 갈린다. 오퍼시트 자체의 수락 판단은
 * 기존 evaluateFAOffer(RFA도 walkAway/asking 기준 동일 — 싱글의 processOfferSheet 주석과
 * 동일 원칙)를 그대로 재사용하면 된다.
 */
export function evaluateQOOffer(
    qoSalary: number,
    demand: FADemandResult,
    financialAmbition: number,
    seed: string,
): 'accept' | 'hold' {
    const prob = qoAcceptProbability(qoSalary, demand, financialAmbition);
    const hash = stringToHash(seed + 'qo' + String(qoSalary));
    return (hash % 10000) / 10000 < prob ? 'accept' : 'hold';
}

// ─────────────────────────────────────────────────────────────
// 팀측: 미배정(CPU) 팀의 QO 텐더 / 오퍼시트 매칭 자동 판단
// ─────────────────────────────────────────────────────────────
//
// 유저(사람) 팀은 수동 결정 — 이 파일은 미배정 팀 전용 간이 규칙만 다룬다. UI/RPC 배선은
// 이번 범위 밖이라 함수 시그니처만 제공한다.

/** 싱글플레이어(offseasonEventHandler.ts)에서 검증된 단일 임계값 그대로 재사용. */
export function shouldAutoTenderQO(player: Player): boolean {
    return player.ovr >= 70;
}

/**
 * 싱글플레이어(faMarketBuilder.ts resolveExpiredOfferSheets)의 매칭 규칙 재사용 — 단,
 * apron1Amount는 싱글처럼 하드코딩 상수(LEAGUE_FINANCIALS.FIRST_APRON)를 쓰지 않고
 * 호출부가 리그별 leagues.apron1_amount를 넘기도록 파라미터화했다(멀티는 리그마다 캡/
 * 에이프런 금액이 다름 — buildMultiFADemand와 동일한 이유).
 */
export function shouldAutoMatchOfferSheet(
    player: Player,
    teamPayroll: number,
    apron1Amount: number,
): boolean {
    return player.ovr >= 80 && teamPayroll < apron1Amount;
}

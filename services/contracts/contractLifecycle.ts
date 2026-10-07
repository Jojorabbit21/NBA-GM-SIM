// contractLifecycle.ts — 계약 수명주기(연차 진행·다음 계약 승격·시즌 커버 판정) 순수 함수.
// [2026-10-01] PlayerContract.nextContract(이미 체결된 미래 연장/재계약) 슬롯 도입과 함께 신설.
// 클라(services/contracts/)와 서버(server/src/shared/contracts/) 미러 쌍 — import 경로만 다르고 본문은 동일해야 한다.
// 외부 의존 없음(draftSalaryScale.ts와 같은 이유 — 서버에서 import해도 부작용 체인이 따라오지 않도록).
//
// 아직 멀티플레이어에는 "계약 연차 자동 진행" 트리거가 없다(rfaEligibility.ts 주석 참고) — 그 트리거를
// 만들 때 advanceContractSeason()을 쓰면 nextContract 승격이 자동으로 따라온다. 싱글플레이어는
// services/playerDevelopment/playerAging.ts의 오프시즌 계약 만료 체크에 연결돼 있다.

import type { PlayerContract } from '../../types/player';

export interface AdvanceContractResult {
    /** 진행 후 계약. 만료(다음 계약 없음)면 null. */
    contract: PlayerContract | null;
    /** 현재 계약이 끝나 nextContract가 현재 계약으로 승격됐는지. */
    promoted: boolean;
    /** 현재 계약이 끝났고 다음 계약도 없어 FA가 되는지. */
    expired: boolean;
}

/** 시즌이 하나 지났을 때의 계약 상태 — currentYear+1, 끝에 닿으면 nextContract 승격 또는 만료.
 *  옵션 거절 등 조기 종료는 다루지 않는다(호출부가 그 전에 처리). */
export function advanceContractSeason(contract: PlayerContract): AdvanceContractResult {
    const nextYear = contract.currentYear + 1;
    if (nextYear < contract.years.length) {
        return { contract: { ...contract, currentYear: nextYear }, promoted: false, expired: false };
    }
    if (contract.nextContract && contract.nextContract.years.length > 0) {
        return { contract: { ...contract.nextContract, currentYear: 0 }, promoted: true, expired: false };
    }
    return { contract: null, promoted: false, expired: true };
}

/** 이 계약(다음 계약 포함)이 해당 시즌(시작 연도)에 유효한지 — yearSeasons가 있는 계약만 판정 가능. */
export function contractCoversSeason(contract: PlayerContract | null | undefined, seasonStartYear: number): boolean {
    if (!contract) return false;
    const ys = contract.yearSeasons;
    if (Array.isArray(ys) && ys.length > 0 && ys[0] <= seasonStartYear && ys[ys.length - 1] >= seasonStartYear) return true;
    return contractCoversSeason(contract.nextContract, seasonStartYear);
}

export interface FlatContractYear {
    amount: number;
    /** 실제 시즌 연도(yearSeasons가 없으면 undefined). */
    season?: number;
    /** 'current' = 현재 계약 연차, 'next' = 다음 계약(연장) 연차. */
    segment: 'current' | 'next';
    /** 그 연차의 옵션. */
    option?: { type: 'team' | 'player'; year: number };
    /** 원 계약 안에서의 인덱스. */
    indexInContract: number;
    contract: PlayerContract;
}

/** 현재 계약의 currentYear부터 다음 계약 끝까지를 한 줄로 편 배열 — 재정 표/잔여 합계 등 "앞으로 받을 돈"
 *  표시용. 반환 배열의 i번째가 "현재 시즌 + i". */
export function flattenRemainingYears(contract: PlayerContract): FlatContractYear[] {
    const out: FlatContractYear[] = [];
    let seg: PlayerContract | undefined = contract;
    let first = true;
    while (seg) {
        const start = first ? seg.currentYear : 0;
        for (let i = start; i < seg.years.length; i++) {
            out.push({
                amount: seg.years[i],
                season: seg.yearSeasons?.[i],
                segment: first ? 'current' : 'next',
                option: seg.options?.find(o => o.year === i),
                indexInContract: i,
                contract: seg,
            });
        }
        seg = seg.nextContract;
        first = false;
    }
    return out;
}

/** 다음 계약이 체결돼 있는지(계약 종료 시 FA가 아님). */
export function hasNextContract(contract: PlayerContract | null | undefined): boolean {
    return !!(contract?.nextContract && contract.nextContract.years.length > 0);
}

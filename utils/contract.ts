import type { Player } from '../types';

/** 이번 시즌 연봉 — contract.years[currentYear]. (멀티의 p.salary도 같은 값으로 파생되지만 계약 원본에서 직접 읽는다.) */
export function getCurrentSeasonSalary(p: Pick<Player, 'contract'>): number {
    if (!p.contract) return 0;
    return p.contract.years[p.contract.currentYear] ?? 0;
}

/**
 * AAV(Average Annual Value) — 현재 계약 "전체" 총액 / 전체 연수.
 * contract.years는 서명 시점부터의 연차별 연봉 전부(지난 연차 포함, currentYear가 현재 인덱스)라 그대로 합산한다.
 */
export function getContractAav(p: Pick<Player, 'contract'>): number {
    if (!p.contract || p.contract.years.length === 0) return 0;
    const total = p.contract.years.reduce((sum, v) => sum + v, 0);
    return total / p.contract.years.length;
}

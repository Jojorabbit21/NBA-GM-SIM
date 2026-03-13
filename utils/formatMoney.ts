
/** 달러 정수 → 축약 표시 ($51.4M, $250K, $500) */
export function formatMoney(dollars: number): string {
    const abs = Math.abs(dollars);
    const sign = dollars < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
    return `${sign}$${abs}`;
}

/** 달러 정수 → 전체 달러 표기 ($155,300,000) */
export function formatMoneyFull(dollars: number): string {
    return `$${Math.round(dollars).toLocaleString()}`;
}

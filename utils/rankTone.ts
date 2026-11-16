// 리그 내 순위 구간 색 — 30팀 기준 1~5 / 6~10 / 11~20 / 21~25 / 26~30. 팀 수가 다른 리그(가상 팀 보충 등)도
// 같은 비율로 나뉘도록 비율로 계산한다. 팀 호버 카드(TeamHoverCard)와 파워랭킹 뉴스 표(PowerRankingCard)가 같이 쓴다.
export function rankTone(rank: number, total: number): string {
    const r = rank / Math.max(1, total);
    if (r <= 1 / 6) return 'text-emerald-400';
    if (r <= 1 / 3) return 'text-emerald-200';
    if (r <= 2 / 3) return 'text-slate-300';
    if (r <= 5 / 6) return 'text-amber-400';
    return 'text-rose-400';
}

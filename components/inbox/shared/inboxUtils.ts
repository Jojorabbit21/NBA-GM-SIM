export const fmtStatVal = (v: number | undefined, fmt: 'num' | 'pct' | 'diff'): string => {
    if (v == null) return '-';
    if (fmt === 'pct') return v > 0 ? '.' + (v * 1000).toFixed(0).padStart(3, '0') : '-';
    if (fmt === 'diff') return v === 0 ? '0.0' : (v > 0 ? '+' : '') + v.toFixed(1);
    return v.toFixed(1);
};

export function makeComputeRank(
    allTeamsStats: { teamId: string; stats: Record<string, number> }[] | undefined,
    focusTeamId: string
) {
    return (key: string, inverse?: boolean): number => {
        if (!allTeamsStats) return 0;
        const sorted = [...allTeamsStats].sort((a, b) =>
            inverse ? (a.stats[key] ?? 0) - (b.stats[key] ?? 0) : (b.stats[key] ?? 0) - (a.stats[key] ?? 0)
        );
        return sorted.findIndex(t => t.teamId === focusTeamId) + 1;
    };
}

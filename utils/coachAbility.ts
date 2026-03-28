export function coachAbilityLabel(v: number): string {
    if (v >= 9) return '뛰어남';
    if (v >= 7) return '매우 좋음';
    if (v >= 6) return '좋음';
    if (v >= 4) return '보통';
    if (v >= 3) return '미숙함';
    if (v >= 2) return '매우 미숙함';
    return '형편없음';
}

export function coachAbilityColor(v: number): string {
    if (v >= 9) return 'text-emerald-400';
    if (v >= 7) return 'text-green-400';
    if (v >= 6) return 'text-indigo-300';
    if (v >= 4) return 'text-slate-400';
    if (v >= 3) return 'text-amber-400';
    if (v >= 2) return 'text-orange-400';
    return 'text-rose-400';
}

export function coachAbilityBarColor(v: number): string {
    if (v >= 9) return '#34d399'; // emerald-400
    if (v >= 7) return '#4ade80'; // green-400
    if (v >= 6) return '#a5b4fc'; // indigo-300
    if (v >= 4) return '#94a3b8'; // slate-400
    if (v >= 3) return '#fbbf24'; // amber-400
    if (v >= 2) return '#fb923c'; // orange-400
    return '#f87171';             // rose-400
}

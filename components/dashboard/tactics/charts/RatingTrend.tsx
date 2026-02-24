
import React, { useMemo } from 'react';
import { Player } from '../../../../types';

interface RatingTrendProps {
    roster: Player[];
    gameRatings?: { date: string; ortg: number; drtg: number }[];
}

export const RatingTrend: React.FC<RatingTrendProps> = ({ roster, gameRatings }) => {
    const seasonRating = useMemo(() => {
        const totalPts = roster.reduce((s, p) => s + p.stats.pts, 0);
        const totalFGA = roster.reduce((s, p) => s + p.stats.fga, 0);
        const totalFTA = roster.reduce((s, p) => s + p.stats.fta, 0);
        const totalORB = roster.reduce((s, p) => s + p.stats.offReb, 0);
        const totalTOV = roster.reduce((s, p) => s + p.stats.tov, 0);
        const totalG = roster.length > 0 ? Math.max(...roster.map(p => p.stats.g)) : 0;

        // NBA possession estimate: FGA + 0.44*FTA - ORB + TOV
        const teamPoss = totalFGA + 0.44 * totalFTA - totalORB + totalTOV;
        const ortg = teamPoss > 0 ? (totalPts / teamPoss) * 100 : 0;

        return { ortg: Math.round(ortg * 10) / 10, games: totalG };
    }, [roster]);

    // Trend line rendering (Phase 2)
    const hasTrend = gameRatings && gameRatings.length >= 2;

    const trendSvg = useMemo(() => {
        if (!hasTrend || !gameRatings) return null;

        const recent = gameRatings.slice(-15); // Last 15 games
        const W = 200;
        const H = 80;
        const padX = 5;
        const padY = 10;

        const allValues = recent.flatMap(g => [g.ortg, g.drtg]);
        const minVal = Math.min(...allValues) - 3;
        const maxVal = Math.max(...allValues) + 3;
        const range = maxVal - minVal || 1;

        const toX = (i: number) => padX + (i / (recent.length - 1)) * (W - padX * 2);
        const toY = (val: number) => padY + (1 - (val - minVal) / range) * (H - padY * 2);

        const ortgPoints = recent.map((g, i) => `${toX(i)},${toY(g.ortg)}`).join(' ');
        const drtgPoints = recent.map((g, i) => `${toX(i)},${toY(g.drtg)}`).join(' ');

        return { ortgPoints, drtgPoints, W, H, minVal, maxVal };
    }, [gameRatings, hasTrend]);

    return (
        <div className="flex flex-col gap-3">
            <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">공수 효율</h5>

            {/* Season Overall */}
            <div className="flex gap-4">
                <div className="flex-1 bg-slate-900/50 rounded-lg p-3 border border-slate-800">
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">ORTG</span>
                    <div className="text-xl font-black text-white tabular-nums mt-0.5">{seasonRating.ortg || '—'}</div>
                    <span className="text-[9px] text-slate-500">{seasonRating.games}G 기준</span>
                </div>
                <div className="flex-1 bg-slate-900/50 rounded-lg p-3 border border-slate-800">
                    <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">DRTG</span>
                    <div className="text-xl font-black text-white tabular-nums mt-0.5">—</div>
                    <span className="text-[9px] text-slate-500">상대 데이터 필요</span>
                </div>
            </div>

            {/* Trend Chart (Phase 2) */}
            {trendSvg && (
                <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-800">
                    <svg viewBox={`0 0 ${trendSvg.W} ${trendSvg.H}`} className="w-full">
                        {/* Grid */}
                        <line x1="5" y1={trendSvg.H / 2} x2={trendSvg.W - 5} y2={trendSvg.H / 2} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="4 2" />
                        {/* ORTG Line */}
                        <polyline points={trendSvg.ortgPoints} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" />
                        {/* DRTG Line */}
                        <polyline points={trendSvg.drtgPoints} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                    <div className="flex gap-3 mt-1 text-[9px]">
                        <span className="text-emerald-400 flex items-center gap-1"><div className="w-3 h-0.5 bg-emerald-500 rounded" /> ORTG</span>
                        <span className="text-red-400 flex items-center gap-1"><div className="w-3 h-0.5 bg-red-500 rounded" /> DRTG</span>
                    </div>
                </div>
            )}

            {!hasTrend && (
                <div className="text-[9px] text-slate-600">* 2경기 이상 진행 후 트렌드 표시</div>
            )}
        </div>
    );
};

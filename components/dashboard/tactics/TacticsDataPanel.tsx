
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../types';
import { RadarChart } from './charts/RadarChart';
import { TeamZoneChart } from './charts/TeamZoneChart';
import { PlayTypePPP } from './charts/PlayTypePPP';

interface TacticsDataPanelProps {
    section: 'offense' | 'defense';
    sliders: TacticalSliders;
    roster: Player[];
}

// Compact inline risk bar
const RiskBar: React.FC<{ label: string; value: number; desc: string }> = ({ label, value, desc }) => {
    const pct = Math.min(100, Math.max(0, value));
    const color = pct < 35 ? '#10b981' : pct < 65 ? '#eab308' : '#ef4444';
    return (
        <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest w-16 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }} />
            </div>
            <span className="text-xs font-black text-white tabular-nums w-7 text-right">{Math.round(pct)}</span>
            <span className="text-[9px] text-slate-600 w-28 text-right truncate">{desc}</span>
        </div>
    );
};

export const TacticsDataPanel: React.FC<TacticsDataPanelProps> = ({ section, sliders, roster }) => {

    if (section === 'offense') {
        return (
            <div className="flex flex-col gap-6">
                {/* Row 1: Radar + Zone Heatmap side by side */}
                <div className="grid grid-cols-2 gap-4">
                    <RadarChart roster={roster} />
                    <TeamZoneChart roster={roster} />
                </div>

                {/* Row 2: Play Type PPP */}
                <PlayTypePPP sliders={sliders} roster={roster} />
            </div>
        );
    }

    // Defense section — compact inline layout
    const seasonOrtg = useMemo(() => {
        const totalPts = roster.reduce((s, p) => s + p.stats.pts, 0);
        const totalFGA = roster.reduce((s, p) => s + p.stats.fga, 0);
        const totalFTA = roster.reduce((s, p) => s + p.stats.fta, 0);
        const totalORB = roster.reduce((s, p) => s + p.stats.offReb, 0);
        const totalTOV = roster.reduce((s, p) => s + p.stats.tov, 0);
        const totalG = roster.length > 0 ? Math.max(...roster.map(p => p.stats.g)) : 0;
        const teamPoss = totalFGA + 0.44 * totalFTA - totalORB + totalTOV;
        const ortg = teamPoss > 0 ? (totalPts / teamPoss) * 100 : 0;
        return { ortg: Math.round(ortg * 10) / 10, games: totalG };
    }, [roster]);

    const riskValues = useMemo(() => {
        const foul = ((sliders.defIntensity - 1) / 9) * 50 + ((sliders.fullCourtPress - 1) / 9) * 30 + 10;
        const tov = ((sliders.ballMovement - 1) / 9) * 35 + ((11 - sliders.defIntensity) / 9) * 25 + 15;
        return { foulRisk: Math.round(foul), tovRate: Math.round(tov) };
    }, [sliders]);

    return (
        <div className="flex flex-col gap-4">
            {/* ORTG */}
            <div className="flex items-baseline gap-3">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">ORTG</span>
                <span className="text-2xl font-black text-white tabular-nums">{seasonOrtg.ortg || '—'}</span>
                <span className="text-[10px] text-slate-500">{seasonOrtg.games}G 기준</span>
            </div>

            {/* Risk Gauges */}
            <div className="flex flex-col gap-2.5">
                <RiskBar label="파울 위험" value={riskValues.foulRisk} desc={`압박 ${sliders.defIntensity} · 풀코트 ${sliders.fullCourtPress}`} />
                <RiskBar label="턴오버율" value={riskValues.tovRate} desc={`볼회전 ${sliders.ballMovement} · 압박 ${sliders.defIntensity}`} />
            </div>
        </div>
    );
};

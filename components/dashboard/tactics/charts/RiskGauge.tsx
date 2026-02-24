
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../../types';

interface RiskGaugeProps {
    sliders: TacticalSliders;
    roster: Player[];
}

const GaugeBar: React.FC<{
    label: string;
    predicted: number;
    actual: number | null;
    description: string;
}> = ({ label, predicted, actual, description }) => {
    const pctPredicted = Math.min(100, Math.max(0, predicted));
    const pctActual = actual !== null ? Math.min(100, Math.max(0, actual)) : null;

    const getColor = (pct: number) => {
        if (pct < 35) return '#10b981';
        if (pct < 65) return '#eab308';
        return '#ef4444';
    };

    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                <span className="text-[10px] font-bold text-slate-500">{description}</span>
            </div>
            <svg viewBox="0 0 200 24" className="w-full">
                {/* Track */}
                <rect x="0" y="8" width="200" height="8" rx="4" fill="#0f172a" />
                {/* Fill */}
                <rect x="0" y="8" width={pctPredicted * 2} height="8" rx="4" fill={getColor(pctPredicted)} fillOpacity="0.6" />
                {/* Predicted Marker */}
                <line x1={pctPredicted * 2} y1="4" x2={pctPredicted * 2} y2="20" stroke={getColor(pctPredicted)} strokeWidth="2.5" strokeLinecap="round" />
                {/* Actual Marker (if available) */}
                {pctActual !== null && (
                    <g>
                        <line x1={pctActual * 2} y1="4" x2={pctActual * 2} y2="20" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
                    </g>
                )}
                {/* Labels */}
                <text x="4" y="5" fill="#475569" fontSize="7" fontWeight="700">LOW</text>
                <text x="176" y="5" fill="#475569" fontSize="7" fontWeight="700">HIGH</text>
            </svg>
            {pctActual !== null && (
                <div className="flex items-center gap-2 text-[9px] text-slate-500">
                    <span className="flex items-center gap-1">
                        <div className="w-2 h-0.5 rounded" style={{ backgroundColor: getColor(pctPredicted) }} />
                        예측
                    </span>
                    <span className="flex items-center gap-1">
                        <div className="w-2 h-0.5 rounded bg-white" style={{ borderBottom: '1px dashed white' }} />
                        실제
                    </span>
                </div>
            )}
        </div>
    );
};

export const RiskGauge: React.FC<RiskGaugeProps> = ({ sliders, roster }) => {

    const { foulRisk, tovRate, actualFoulRate, actualTovRate } = useMemo(() => {
        // Predicted risk from slider values (0-100 scale)
        const foul = ((sliders.defIntensity - 1) / 9) * 50 + ((sliders.fullCourtPress - 1) / 9) * 30 + 10;
        const tov = ((sliders.ballMovement - 1) / 9) * 35 + ((11 - sliders.defIntensity) / 9) * 25 + 15;

        // Actual season rates from roster stats
        const totalG = roster.reduce((sum, p) => sum + p.stats.g, 0) / 5; // ~team games
        const totalPF = roster.reduce((sum, p) => sum + p.stats.pf, 0);
        const totalTOV = roster.reduce((sum, p) => sum + p.stats.tov, 0);
        const totalFGA = roster.reduce((sum, p) => sum + p.stats.fga, 0);

        const actualFoul = totalG > 0 ? Math.min(100, (totalPF / totalG / 25) * 100) : null;
        const actualTov = totalFGA > 0 ? Math.min(100, (totalTOV / (totalFGA + totalTOV) * 100) * 4) : null;

        return {
            foulRisk: Math.round(foul),
            tovRate: Math.round(tov),
            actualFoulRate: actualFoul !== null ? Math.round(actualFoul) : null,
            actualTovRate: actualTov !== null ? Math.round(actualTov) : null,
        };
    }, [sliders, roster]);

    const foulDesc = `수비압박 ${sliders.defIntensity} + 풀코트 ${sliders.fullCourtPress}`;
    const tovDesc = `볼회전 ${sliders.ballMovement} + 수비압박 ${sliders.defIntensity}`;

    return (
        <div className="flex flex-col gap-4">
            <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">수비 리스크</h5>
            <GaugeBar label="파울 위험도" predicted={foulRisk} actual={actualFoulRate} description={foulDesc} />
            <GaugeBar label="턴오버 유발률" predicted={tovRate} actual={actualTovRate} description={tovDesc} />
        </div>
    );
};

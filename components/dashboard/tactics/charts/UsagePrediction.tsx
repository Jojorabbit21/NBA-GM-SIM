
import React, { useMemo } from 'react';
import { Player } from '../../../../types';
import { calculatePlayerOvr } from '../../../../utils/constants';

interface UsagePredictionProps {
    roster: Player[];
}

// Mirror engine's calculateScoringGravity (usageSystem.ts)
const calcGravity = (p: Player): number => {
    const baseOffense = ((p as any).ins * 0.4) + ((p as any).out * 0.3) + ((p as any).midRange * 0.2) + ((p as any).ft * 0.1);
    const mentality = ((p as any).offConsist * 0.4) + ((p as any).shotIq * 0.4) + ((p as any).plm * 0.2);
    return baseOffense * 0.6 + mentality * 0.4;
};

const getShortName = (name: string): string => {
    const parts = name.split(' ');
    if (parts.length <= 1) return name;
    const last = parts[parts.length - 1];
    if (['Jr.', 'Jr', 'II', 'III', 'IV', 'Sr.', 'Sr'].includes(last)) {
        return parts.length >= 3 ? parts[parts.length - 2] : parts[0];
    }
    return last;
};

export const UsagePrediction: React.FC<UsagePredictionProps> = ({ roster }) => {
    const data = useMemo(() => {
        if (roster.length === 0) return [];

        const sorted = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
        const rotationPlayers = sorted.slice(0, Math.min(8, sorted.length));

        const gravities = rotationPlayers.map(p => ({
            player: p,
            gravity: calcGravity(p),
        }));

        const totalGravity = gravities.reduce((s, g) => s + g.gravity, 0);

        return gravities
            .sort((a, b) => b.gravity - a.gravity)
            .slice(0, 6)
            .map(({ player, gravity }) => {
                const predUsage = totalGravity > 0 ? (gravity / totalGravity) * 100 : 12.5;

                // Basketball-Reference 표준 USG% 공식
                // USG% = (FGA + 0.44×FTA + TOV) × (TmMP / 5) / (MP × (TmFGA + 0.44×TmFTA + TmTOV))
                let actualUsage: number | null = null;
                const s = player.stats;
                if (s.g > 0 && s.mp > 0) {
                    const playerPoss = s.fga + 0.44 * s.fta + s.tov;
                    const teamMin = roster.reduce((sum, p2) => sum + (p2.stats.mp || 0), 0);
                    const teamUsage = roster.reduce((sum, p2) => {
                        return sum + p2.stats.fga + 0.44 * p2.stats.fta + p2.stats.tov;
                    }, 0);
                    actualUsage = (s.mp > 0 && teamUsage > 0 && teamMin > 0)
                        ? (playerPoss * (teamMin / 5)) / (s.mp * teamUsage) * 100
                        : null;
                }

                return {
                    name: player.name,
                    predUsage: Math.round(predUsage * 10) / 10,
                    actualUsage: actualUsage !== null ? Math.round(actualUsage * 10) / 10 : null,
                };
            });
    }, [roster]);

    if (data.length === 0) return null;

    const maxUsage = Math.max(...data.map(d => d.predUsage), 30);

    return (
        <div className="flex flex-col gap-3">
            <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">활용도 예측</h5>
            <div className="space-y-2">
                {data.map((item, i) => {
                    const barWidth = (item.predUsage / maxUsage) * 100;
                    const opacity = 1 - i * 0.1;
                    return (
                        <div key={item.name} className="space-y-0.5">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-300 truncate max-w-[100px]">{getShortName(item.name)}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[13px] font-black text-white tabular-nums">{item.predUsage.toFixed(0)}%</span>
                                    {item.actualUsage !== null && (
                                        <span className="text-xs font-bold text-slate-400 tabular-nums">실 {item.actualUsage.toFixed(0)}%</span>
                                    )}
                                </div>
                            </div>
                            <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{ width: `${barWidth}%`, backgroundColor: '#6366f1', opacity }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="text-xs text-slate-400 text-right">* 능력치 기반 예측 {data.some(d => d.actualUsage !== null) && '/ 실적 USG%'}</div>
        </div>
    );
};

export { calcGravity };

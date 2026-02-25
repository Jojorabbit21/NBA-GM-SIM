
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../types';
import { calculatePlayerOvr } from '../../../utils/constants';
import { DefensiveStats } from '../../../utils/defensiveStats';
import { RadarChart } from './charts/RadarChart';
import { TeamZoneChart } from './charts/TeamZoneChart';
import { PlayTypePPP } from './charts/PlayTypePPP';
import { PLAY_TYPES, getPlayTypeDistribution } from './charts/playTypeConstants';

interface TacticsDataPanelProps {
    sliders: TacticalSliders;
    roster: Player[];
    defensiveStats?: DefensiveStats;
}

// Mirror engine's calculateScoringGravity (usageSystem.ts)
const calcGravity = (p: Player): number => {
    const baseOffense = ((p as any).ins * 0.4) + ((p as any).out * 0.3) + ((p as any).midRange * 0.2) + ((p as any).ft * 0.1);
    const mentality = ((p as any).offConsist * 0.4) + ((p as any).shotIq * 0.4) + ((p as any).plm * 0.2);
    return baseOffense * 0.6 + mentality * 0.4;
};

// Compact inline risk bar — indigo single color, 0-100 index
const RiskBar: React.FC<{ label: string; value: number; desc: string }> = ({ label, value, desc }) => {
    const pct = Math.min(100, Math.max(0, value));
    return (
        <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-300 w-20 shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: '#6366f1', opacity: 0.6 }} />
            </div>
            <span className="text-xs font-black text-white tabular-nums w-14 text-right">{Math.round(pct)}<span className="text-xs font-bold text-slate-500"> /100</span></span>
            <span className="text-xs text-slate-400 w-32 text-right truncate">{desc}</span>
        </div>
    );
};

// Defensive stat row
const DefStatRow: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = 'text-white' }) => (
    <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400">{label}</span>
        <span className={`text-xs font-black tabular-nums ${color}`}>{value}</span>
    </div>
);

export const TacticsDataPanel: React.FC<TacticsDataPanelProps> = ({ sliders, roster, defensiveStats }) => {

    // Offense risk values
    const offenseRisk = useMemo(() => {
        const dist = getPlayTypeDistribution(sliders);
        const isoIdx = PLAY_TYPES.findIndex(pt => pt.key === 'iso');
        const driveIdx = PLAY_TYPES.findIndex(pt => pt.key === 'drive');
        const isoShare = dist[isoIdx] || 0;
        const driveShare = dist[driveIdx] || 0;

        const tovRisk = ((sliders.pace - 1) / 9) * 30
            + ((10 - sliders.ballMovement) / 9) * 35
            + (isoShare / 100) * 25
            + 10;

        const sorted = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
        const rot = sorted.slice(0, Math.min(8, sorted.length));
        const teamAvgDrawFoul = rot.length > 0
            ? rot.reduce((s, p) => s + ((p as any).drawFoul || 70), 0) / rot.length
            : 70;
        const foulDraw = (driveShare / 100) * 40 + (teamAvgDrawFoul / 100) * 40 + 20;

        const gravities = rot.map(p => calcGravity(p));
        const totalGravity = gravities.reduce((s, g) => s + g, 0);
        const topUsage = totalGravity > 0 ? (Math.max(...gravities) / totalGravity) * 100 : 12.5;
        const aceDep = Math.min(100, (topUsage / 12.5) * 30);

        return {
            tovRisk: Math.round(tovRisk),
            foulDraw: Math.round(foulDraw),
            aceDep: Math.round(aceDep),
            isoShare,
            driveShare,
            teamAvgDrawFoul: Math.round(teamAvgDrawFoul),
            topUsage: Math.round(topUsage),
        };
    }, [sliders, roster]);

    // Defense risk values
    const defRiskValues = useMemo(() => {
        const foul = ((sliders.defIntensity - 1) / 9) * 50 + ((sliders.fullCourtPress - 1) / 9) * 30 + 10;
        const tov = ((sliders.ballMovement - 1) / 9) * 35 + ((11 - sliders.defIntensity) / 9) * 25 + 15;
        return { foulRisk: Math.round(foul), tovRate: Math.round(tov) };
    }, [sliders]);

    return (
        <div className="flex flex-col gap-5">
            {/* Section 1: Radar + Zone Heatmap — vertically centered */}
            <div className="flex flex-col gap-2 pb-5 border-b border-slate-800">
                <div className="flex gap-4">
                    <h5 className="flex-1 text-sm font-black text-slate-300 uppercase tracking-widest">로스터 레이더</h5>
                    <h5 className="flex-1 text-sm font-black text-slate-300 uppercase tracking-widest">슈팅 존 히트맵</h5>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <RadarChart roster={roster} hideTitle />
                    </div>
                    <div className="flex-1">
                        <TeamZoneChart roster={roster} fullWidth hideTitle />
                    </div>
                </div>
            </div>

            {/* Section 2: Play Type Analysis + Shot Zone Comparison */}
            <div className="pb-5 border-b border-slate-800">
                <PlayTypePPP sliders={sliders} roster={roster} />
            </div>

            {/* Section 3: Defensive Performance */}
            <div className="pb-5 border-b border-slate-800">
                <div className="flex items-center justify-between mb-3">
                    <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">수비 성과</h5>
                    {defensiveStats && defensiveStats.gamesPlayed > 0 && (
                        <span className="text-[11px] text-slate-500">{defensiveStats.gamesPlayed}경기 평균</span>
                    )}
                </div>
                {!defensiveStats || defensiveStats.gamesPlayed === 0 ? (
                    <p className="text-xs text-slate-500">경기 데이터 없음</p>
                ) : (
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">긍정적 지표</span>
                            <DefStatRow label="스틸" value={`${defensiveStats.teamStlPerGame.toFixed(1)} /G`} color="text-emerald-300" />
                            <DefStatRow label="블록" value={`${defensiveStats.teamBlkPerGame.toFixed(1)} /G`} color="text-emerald-300" />
                            <DefStatRow label="수비 리바운드" value={`${defensiveStats.teamDrbPerGame.toFixed(1)} /G`} color="text-emerald-300" />
                            <DefStatRow label="유발 턴오버" value={`${defensiveStats.oppTovPerGame.toFixed(1)} /G`} color="text-emerald-300" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">부정적 지표</span>
                            <DefStatRow label="실점" value={`${defensiveStats.oppPtsPerGame.toFixed(1)} /G`} color="text-red-300" />
                            <DefStatRow label="상대 FG%" value={`${defensiveStats.oppFgPct.toFixed(1)}%`} color="text-red-300" />
                            <DefStatRow label="상대 3P%" value={`${defensiveStats.oppThreePct.toFixed(1)}%`} color="text-red-300" />
                            <DefStatRow label="파울" value={`${defensiveStats.teamPfPerGame.toFixed(1)} /G`} color="text-red-300" />
                        </div>
                    </div>
                )}
            </div>

            {/* Section 4: Risk Analysis */}
            <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                    <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">리스크 분석</h5>
                    <span className="text-[11px] text-slate-500">0-100 위험 지수</span>
                </div>
                <RiskBar label="턴오버 위험" value={offenseRisk.tovRisk} desc={`페이스 ${sliders.pace} · 볼무브 ${sliders.ballMovement}`} />
                <RiskBar label="파울 유발력" value={offenseRisk.foulDraw} desc={`드라이브 ${offenseRisk.driveShare.toFixed(0)}% · DF ${offenseRisk.teamAvgDrawFoul}`} />
                <RiskBar label="에이스 의존" value={offenseRisk.aceDep} desc={`1옵션 USG ${offenseRisk.topUsage}%`} />
                <div className="h-px bg-slate-800 my-1" />
                <RiskBar label="수비 파울" value={defRiskValues.foulRisk} desc={`압박 ${sliders.defIntensity} · 풀코트 ${sliders.fullCourtPress}`} />
                <RiskBar label="수비 턴오버" value={defRiskValues.tovRate} desc={`볼회전 ${sliders.ballMovement} · 압박 ${sliders.defIntensity}`} />
            </div>
        </div>
    );
};

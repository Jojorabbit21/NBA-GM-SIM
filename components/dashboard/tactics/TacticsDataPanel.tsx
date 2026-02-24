
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../types';
import { RadarChart } from './charts/RadarChart';
import { TeamZoneChart } from './charts/TeamZoneChart';
import { PlayTypePPP } from './charts/PlayTypePPP';
import { ShotDistribution } from './charts/ShotDistribution';
import { UsagePrediction } from './charts/UsagePrediction';
import { PLAY_TYPES, getPlayTypeDistribution } from './charts/playTypeConstants';
import { calcGravity } from './charts/UsagePrediction';

interface TacticsDataPanelProps {
    sliders: TacticalSliders;
    roster: Player[];
}

// Compact inline risk bar — indigo single color
const RiskBar: React.FC<{ label: string; value: number; desc: string }> = ({ label, value, desc }) => {
    const pct = Math.min(100, Math.max(0, value));
    return (
        <div className="flex items-center gap-3">
            <span className="text-xs font-black text-slate-300 uppercase tracking-widest w-20 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: '#6366f1', opacity: 0.6 }} />
            </div>
            <span className="text-[13px] font-black text-white tabular-nums w-7 text-right">{Math.round(pct)}</span>
            <span className="text-xs text-slate-400 w-32 text-right truncate">{desc}</span>
        </div>
    );
};

export const TacticsDataPanel: React.FC<TacticsDataPanelProps> = ({ sliders, roster }) => {

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

        const sorted = [...roster].sort((a, b) => b.ovr - a.ovr);
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

    // Season ORTG
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

    // Defense risk values
    const defRiskValues = useMemo(() => {
        const foul = ((sliders.defIntensity - 1) / 9) * 50 + ((sliders.fullCourtPress - 1) / 9) * 30 + 10;
        const tov = ((sliders.ballMovement - 1) / 9) * 35 + ((11 - sliders.defIntensity) / 9) * 25 + 15;
        return { foulRisk: Math.round(foul), tovRate: Math.round(tov) };
    }, [sliders]);

    return (
        <div className="flex flex-col gap-6">
            {/* Row 1: Radar + Zone Heatmap */}
            <div className="grid grid-cols-2 gap-4">
                <RadarChart roster={roster} />
                <TeamZoneChart roster={roster} />
            </div>

            {/* Row 2: Play Type PPP (with inline key players) */}
            <PlayTypePPP sliders={sliders} roster={roster} />

            {/* Row 3: Shot Distribution + Usage Prediction */}
            <div className="grid grid-cols-2 gap-4">
                <ShotDistribution sliders={sliders} roster={roster} />
                <UsagePrediction roster={roster} />
            </div>

            {/* Row 4: ORTG */}
            {seasonOrtg.games > 0 && (
                <div className="flex items-baseline gap-3">
                    <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">ORTG</span>
                    <span className="text-2xl font-black text-white tabular-nums">{seasonOrtg.ortg || '—'}</span>
                    <span className="text-xs text-slate-400">{seasonOrtg.games}G 기준</span>
                </div>
            )}

            {/* Row 5: Combined Risk Analysis */}
            <div className="flex flex-col gap-2.5">
                <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">리스크 분석</h5>
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

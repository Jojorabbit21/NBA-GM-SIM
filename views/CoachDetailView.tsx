
import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { HeadCoach } from '../types/coaching';
import { TEAM_DATA } from '../data/teamData';
import { getTeamTheme } from '../utils/teamTheme';
import { getTeamLogoUrl } from '../utils/constants';

interface CoachDetailViewProps {
    coach: HeadCoach;
    teamId: string;
    onBack: () => void;
}

// ── 선호 축 정의 ──
const PREF_AXES: {
    key: keyof HeadCoach['preferences'];
    lowLabel: string;
    highLabel: string;
    group: 'offense' | 'defense';
}[] = [
    { key: 'offenseIdentity', lowLabel: '히어로볼',        highLabel: '시스템농구',      group: 'offense' },
    { key: 'tempo',           lowLabel: '하프코트',        highLabel: '런앤건',          group: 'offense' },
    { key: 'scoringFocus',    lowLabel: '페인트존',        highLabel: '3점라인',         group: 'offense' },
    { key: 'pnrEmphasis',     lowLabel: 'ISO/포스트',      highLabel: 'PnR 헤비',       group: 'offense' },
    { key: 'defenseStyle',    lowLabel: '보수적 대인',     highLabel: '공격적 프레셔',   group: 'defense' },
    { key: 'helpScheme',      lowLabel: '1:1 고수',        highLabel: '적극 로테이션',   group: 'defense' },
    { key: 'zonePreference',  lowLabel: '대인 전용',       highLabel: '존 위주',         group: 'defense' },
];

const getPrefColor = (val: number): string => {
    if (val >= 9) return '#d946ef';  // fuchsia-500
    if (val >= 7) return '#34d399';  // emerald-400
    if (val >= 4) return '#fbbf24';  // amber-400
    return '#64748b';                // slate-500
};

const getPrefBgColor = (val: number): string => {
    if (val >= 9) return 'rgba(217,70,239,0.15)';
    if (val >= 7) return 'rgba(52,211,153,0.15)';
    if (val >= 4) return 'rgba(251,191,36,0.15)';
    return 'rgba(100,116,139,0.1)';
};

export const CoachDetailView: React.FC<CoachDetailViewProps> = ({ coach, teamId, onBack }) => {
    const teamInfo = TEAM_DATA[teamId];
    const teamColors = teamInfo?.colors || null;
    const theme = getTeamTheme(teamId, teamColors);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onBack]);

    const offenseAxes = PREF_AXES.filter(a => a.group === 'offense');
    const defenseAxes = PREF_AXES.filter(a => a.group === 'defense');

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">

                {/* ═══ HEADER ═══ */}
                <div className="border-b border-white/5 relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
                    <div className="absolute inset-0 bg-black/40 pointer-events-none" />

                    {/* Back button */}
                    <div className="px-6 pt-5 pb-4 relative z-10">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-1.5 bg-black/30 hover:bg-black/50 backdrop-blur-sm ring-1 ring-white/15 px-3 py-1.5 rounded-lg transition-colors"
                            style={{ color: theme.text }}
                        >
                            <ArrowLeft size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">뒤로</span>
                        </button>
                    </div>

                    {/* Coach name */}
                    <div className="px-6 pt-1 pb-4 relative z-10 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-black/20 ring-1 ring-white/10 flex items-center justify-center">
                            <span className="text-xl font-black" style={{ color: theme.accent }}>HC</span>
                        </div>
                        <h2 className="text-3xl font-black uppercase tracking-tight" style={{ color: theme.text }}>
                            {coach.name}
                        </h2>
                    </div>

                    <div className="mx-6" />

                    {/* Info table */}
                    <div className="px-6 py-3 relative z-10">
                        <table className="text-sm" style={{ color: theme.text, opacity: 0.7 }}>
                            <thead>
                                <tr className="text-xs uppercase tracking-wider border-b border-white/15" style={{ opacity: 0.5 }}>
                                    <th className="pr-8 pb-2 text-left font-bold">팀</th>
                                    <th className="pr-8 pb-2 text-left font-bold">연봉</th>
                                    <th className="pr-8 pb-2 text-left font-bold">계약기간</th>
                                    <th className="pb-2 text-left font-bold">잔여기간</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="font-bold">
                                    <td className="pr-8 pt-2">
                                        <span className="flex items-center gap-1.5">
                                            <img src={getTeamLogoUrl(teamId)} className="w-4 h-4 object-contain" alt="" />
                                            {teamInfo ? `${teamInfo.city} ${teamInfo.name}` : teamId.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="pr-8 pt-2">${coach.contractSalary}M</td>
                                    <td className="pr-8 pt-2">{coach.contractYears}년</td>
                                    <td className="pt-2">{coach.contractYearsRemaining}년</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="h-6" />
                </div>

                {/* ═══ BODY ═══ */}
                <div className="text-xs bg-slate-950">

                    {/* ═══ SECTION: 전술 성향 ═══ */}
                    <div>
                        {/* Offense */}
                        <div className="px-6 py-3 bg-slate-700 flex items-center">
                            <span className="text-sm font-black text-slate-300 uppercase tracking-widest">Offense Philosophy</span>
                        </div>
                        <div className="divide-y divide-slate-800/50">
                            {offenseAxes.map(axis => {
                                const val = coach.preferences[axis.key];
                                return <PreferenceBar key={axis.key} val={val} lowLabel={axis.lowLabel} highLabel={axis.highLabel} />;
                            })}
                        </div>

                        {/* Defense */}
                        <div className="px-6 py-3 bg-slate-700 flex items-center border-t-2 border-slate-700">
                            <span className="text-sm font-black text-slate-300 uppercase tracking-widest">Defense Philosophy</span>
                        </div>
                        <div className="divide-y divide-slate-800/50">
                            {defenseAxes.map(axis => {
                                const val = coach.preferences[axis.key];
                                return <PreferenceBar key={axis.key} val={val} lowLabel={axis.lowLabel} highLabel={axis.highLabel} />;
                            })}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

// ── Preference Bar Component ──
const PreferenceBar: React.FC<{ val: number; lowLabel: string; highLabel: string }> = ({ val, lowLabel, highLabel }) => {
    const pct = ((val - 1) / 9) * 100; // 1→0%, 10→100%
    const color = getPrefColor(val);
    const bgColor = getPrefBgColor(val);

    return (
        <div className="px-6 py-4 hover:bg-white/5 transition-colors">
            {/* Labels row */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-bold ko-normal">{lowLabel}</span>
                <span className="font-mono font-black text-sm tabular-nums" style={{ color }}>{val}</span>
                <span className="text-xs text-slate-500 font-bold ko-normal">{highLabel}</span>
            </div>
            {/* Bar */}
            <div className="relative h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{
                        width: `${pct}%`,
                        backgroundColor: color,
                        opacity: 0.7,
                        boxShadow: `0 0 8px ${bgColor}`,
                    }}
                />
                {/* Marker dot */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-slate-900 shadow-lg transition-all duration-500"
                    style={{
                        left: `${pct}%`,
                        transform: `translate(-50%, -50%)`,
                        backgroundColor: color,
                    }}
                />
            </div>
        </div>
    );
};

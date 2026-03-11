
import React from 'react';
import { HeadCoach, HeadCoachPreferences } from '../../types/coaching';

interface CoachProfileCardProps {
    coach: HeadCoach | null | undefined;
}

const PREFERENCE_AXES: {
    key: keyof HeadCoachPreferences;
    category: 'offense' | 'defense';
    leftLabel: string;
    rightLabel: string;
}[] = [
    // 공격 철학
    { key: 'offenseIdentity', category: 'offense', leftLabel: '히어로 볼', rightLabel: '시스템 농구' },
    { key: 'tempo', category: 'offense', leftLabel: '그라인드', rightLabel: '런앤건' },
    { key: 'scoringFocus', category: 'offense', leftLabel: '페인트존', rightLabel: '3점 라인' },
    { key: 'pnrEmphasis', category: 'offense', leftLabel: 'ISO/포스트', rightLabel: 'PnR 헤비' },
    // 수비 철학
    { key: 'defenseStyle', category: 'defense', leftLabel: '보수적 대인', rightLabel: '공격적 프레셔' },
    { key: 'helpScheme', category: 'defense', leftLabel: '1:1 고수', rightLabel: '적극 로테이션' },
    { key: 'zonePreference', category: 'defense', leftLabel: '대인 전용', rightLabel: '존 위주' },
];

const PreferenceBar: React.FC<{ value: number; leftLabel: string; rightLabel: string }> = ({ value, leftLabel, rightLabel }) => {
    const pct = ((value - 1) / 9) * 100;
    return (
        <div className="flex items-center gap-3 py-1.5">
            <span className="text-[10px] text-slate-500 w-20 text-right shrink-0 ko-tight">{leftLabel}</span>
            <div className="flex-1 relative h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                />
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg shadow-indigo-500/30 border-2 border-indigo-400 transition-all"
                    style={{ left: `calc(${pct}% - 6px)` }}
                />
            </div>
            <span className="text-[10px] text-slate-500 w-20 shrink-0 ko-tight">{rightLabel}</span>
            <span className="text-[11px] font-mono text-indigo-400 w-5 text-center font-bold">{value}</span>
        </div>
    );
};

export const CoachProfileCard: React.FC<CoachProfileCardProps> = ({ coach }) => {
    if (!coach) {
        return (
            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6">
                <p className="text-slate-500 text-sm ko-normal">코치 데이터가 없습니다</p>
            </div>
        );
    }

    const offenseAxes = PREFERENCE_AXES.filter(a => a.category === 'offense');
    const defenseAxes = PREFERENCE_AXES.filter(a => a.category === 'defense');

    return (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-5">
            {/* 코치 이름 + 계약 정보 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <span className="text-lg">🏀</span>
                    </div>
                    <div>
                        <h3 className="text-white font-black text-base tracking-wide">{coach.name}</h3>
                        <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">HEAD COACH</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                        ${coach.contractSalary}M
                    </span>
                    <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold">
                        {coach.contractYearsRemaining}yr
                    </span>
                </div>
            </div>

            {/* 공격 철학 */}
            <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">OFFENSE PHILOSOPHY</h4>
                <div className="space-y-0.5">
                    {offenseAxes.map(axis => (
                        <PreferenceBar
                            key={axis.key}
                            value={coach.preferences[axis.key]}
                            leftLabel={axis.leftLabel}
                            rightLabel={axis.rightLabel}
                        />
                    ))}
                </div>
            </div>

            {/* 수비 철학 */}
            <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">DEFENSE PHILOSOPHY</h4>
                <div className="space-y-0.5">
                    {defenseAxes.map(axis => (
                        <PreferenceBar
                            key={axis.key}
                            value={coach.preferences[axis.key]}
                            leftLabel={axis.leftLabel}
                            rightLabel={axis.rightLabel}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

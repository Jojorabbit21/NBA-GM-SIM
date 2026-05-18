import React, { useState } from 'react';

const MODULE_ENTRIES = [
    { key: 'spotUpShooting',    label: '스팟업 슈팅' },
    { key: 'shotCreation',      label: '샷 창출' },
    { key: 'rimFinishing',      label: '림 피니시' },
    { key: 'postCraft',         label: '포스트' },
    { key: 'playmaking',        label: '플레이메이킹' },
    { key: 'offballAttack',     label: '오프볼' },
    { key: 'poaDefense',        label: 'POA 수비' },
    { key: 'teamDefense',       label: '팀 수비' },
    { key: 'rimProtection',     label: '림 보호' },
    { key: 'rebounding',        label: '리바운드' },
    { key: 'motorAvailability', label: '모터/가용성' },
];

function barColor(v: number) {
    if (v >= 85) return 'bg-emerald-500';
    if (v >= 75) return 'bg-indigo-500';
    if (v >= 65) return 'bg-amber-500';
    return 'bg-red-500/80';
}
function numColor(v: number) {
    if (v >= 85) return 'text-emerald-400';
    if (v >= 75) return 'text-indigo-400';
    if (v >= 65) return 'text-amber-400';
    return 'text-red-400';
}

export interface PlayerCardData {
    name: string;
    position: string;
    age: number | string | null;
    team: string;
    base: {
        displayOvr: number;
        rawOvr: number;
        modules: Record<string, number>;
        primaryArchetype: string;
        secondaryArchetype: string | null;
        tags: string[];
    };
    co: {
        displayOvr: number;
        rawOvr: number;
        modules: Record<string, number>;
        primaryArchetype: string;
        secondaryArchetype: string | null;
        tags: string[];
    } | null;
}

interface Props {
    data: PlayerCardData;
    tagLabelMap: Record<string, string>;
    onClose: () => void;
}

const PlayerCardModal: React.FC<Props> = ({ data, tagLabelMap, onClose }) => {
    const [mode, setMode] = useState<'base' | 'co'>('base');
    const hasCo = !!data.co;
    const active = (mode === 'co' && hasCo) ? data.co! : data.base;

    const activeTags = active.tags.map(t => tagLabelMap[t] ?? t);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative w-80 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* 헤더 배너 */}
                <div className="bg-gradient-to-br from-indigo-900/80 to-slate-900 px-5 pt-5 pb-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[11px] font-semibold tracking-widest text-indigo-300 uppercase mb-0.5">
                                {data.position} · {data.age != null ? `${data.age}세` : '—'} · {data.team || 'FA'}
                            </p>
                            <h2 className="text-xl font-black text-white leading-tight">{data.name}</h2>
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                {active.primaryArchetype}
                                {active.secondaryArchetype && active.secondaryArchetype !== active.primaryArchetype && (
                                    <span className="text-slate-600"> / {active.secondaryArchetype}</span>
                                )}
                            </p>
                        </div>
                        {/* OVR 뱃지 */}
                        <div className="flex flex-col items-center ml-3 shrink-0">
                            <div className="w-14 h-14 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex flex-col items-center justify-center">
                                <span className="text-2xl font-black text-white leading-none">{active.displayOvr}</span>
                                <span className="text-[9px] text-slate-500 mt-0.5">OVR</span>
                            </div>
                        </div>
                    </div>

                    {/* 태그 */}
                    {activeTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2.5">
                            {activeTags.map(t => (
                                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
                                    {t}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* 토글 + 모듈 */}
                <div className="px-5 pb-5 pt-3">
                    {/* Base / CO 토글 */}
                    {hasCo && (
                        <div className="flex rounded-lg overflow-hidden border border-white/10 mb-4 text-xs font-semibold">
                            <button
                                onClick={() => setMode('base')}
                                className={`flex-1 py-1.5 transition-colors ${mode === 'base' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'}`}
                            >
                                기본
                            </button>
                            <button
                                onClick={() => setMode('co')}
                                className={`flex-1 py-1.5 transition-colors ${mode === 'co' ? 'bg-amber-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'}`}
                            >
                                커스텀
                            </button>
                        </div>
                    )}

                    {/* 모듈 바 그래프 */}
                    <div className="space-y-1.5">
                        {MODULE_ENTRIES.map(({ key, label }) => {
                            const val = Math.round(active.modules[key] ?? 0);
                            // CO 모드일 때 기본값과 차이 표시
                            const baseVal = Math.round(data.base.modules[key] ?? 0);
                            const diff = (mode === 'co' && hasCo) ? val - baseVal : 0;
                            return (
                                <div key={key} className="flex items-center gap-2">
                                    <span className="w-20 text-[10px] text-slate-400 shrink-0 text-right">{label}</span>
                                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${barColor(val)}`}
                                            style={{ width: `${Math.min(val, 99)}%` }}
                                        />
                                    </div>
                                    <span className={`w-8 text-right text-[11px] font-bold tabular-nums shrink-0 ${numColor(val)}`}>
                                        {val}
                                    </span>
                                    {diff !== 0 && (
                                        <span className={`text-[10px] font-semibold w-7 shrink-0 ${diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {diff > 0 ? `+${diff}` : diff}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* raw OVR */}
                    <p className="text-[10px] text-slate-600 text-right mt-3">raw {active.rawOvr.toFixed(1)}</p>
                </div>

                {/* 닫기 버튼 */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors text-lg leading-none"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};

export default PlayerCardModal;

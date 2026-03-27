
import React, { useState, useMemo } from 'react';
import { ChevronRight, Check } from 'lucide-react';
import {
    GMPersonalityType,
    GM_PERSONALITY_TYPES,
    GM_PERSONALITY_LABELS,
    GM_SLIDER_PRESETS,
    GMSliders,
} from '../types/gm';

interface GMCreationViewProps {
    onComplete: (data: {
        firstName: string;
        lastName: string;
        birthYear: number;
        personalityType: GMPersonalityType;
        sliders: GMSliders;
    }) => Promise<void>;
    isLoading?: boolean;
}

const SLIDER_LABELS: Record<keyof GMSliders, string> = {
    aggressiveness:  '공격성',
    starWillingness: '스타 선호',
    youthBias:       '유스 편중',
    riskTolerance:   '리스크 감내',
    pickWillingness: '픽 활용',
};

const SLIDER_COLORS: Record<keyof GMSliders, string> = {
    aggressiveness:  '#ef4444',
    starWillingness: '#facc15',
    youthBias:       '#34d399',
    riskTolerance:   '#fb923c',
    pickWillingness: '#38bdf8',
};

const DEFAULT_SLIDERS: GMSliders = { aggressiveness: 5, starWillingness: 5, youthBias: 5, riskTolerance: 5, pickWillingness: 5 };

/** 슬라이더 값에서 가장 가까운 성격 타입 자동 결정 */
function findClosestPersonality(sliders: GMSliders): GMPersonalityType {
    let best: GMPersonalityType = 'balanced';
    let minDist = Infinity;
    for (const type of GM_PERSONALITY_TYPES) {
        const p = GM_SLIDER_PRESETS[type];
        const dist =
            (sliders.aggressiveness  - p.aggressiveness)  ** 2 +
            (sliders.starWillingness - p.starWillingness) ** 2 +
            (sliders.youthBias       - p.youthBias)       ** 2 +
            (sliders.riskTolerance   - p.riskTolerance)   ** 2 +
            (sliders.pickWillingness - p.pickWillingness) ** 2;
        if (dist < minDist) { minDist = dist; best = type; }
    }
    return best;
}

// ─── Slider Row ───────────────────────────────────────────────────────────────

const SliderRow: React.FC<{
    sliderKey: keyof GMSliders;
    value: number;
    onChange: (val: number) => void;
}> = ({ sliderKey, value, onChange }) => {
    const color = SLIDER_COLORS[sliderKey];
    const pct = ((value - 1) / 9) * 100;
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-300">{SLIDER_LABELS[sliderKey]}</span>
                <span className="text-sm font-black tabular-nums text-white">{value}</span>
            </div>
            <div className="relative h-8 flex items-center">
                {/* Track background */}
                <div className="w-full h-1.5 rounded-full bg-slate-700 relative">
                    <div
                        className="absolute left-0 top-0 h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                </div>
                {/* Handle */}
                <div
                    className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-md border border-slate-300 pointer-events-none transition-all"
                    style={{ left: `calc(${pct}% - ${(pct * 0.14).toFixed(2)}px)` }}
                />
                <input
                    type="range"
                    min={1} max={10} step={1}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                />
            </div>
        </div>
    );
};

// ─── Main View ────────────────────────────────────────────────────────────────

export const GMCreationView: React.FC<GMCreationViewProps> = ({ onComplete, isLoading }) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [lastName,   setLastName]   = useState('');
    const [firstName,  setFirstName]  = useState('');
    const [birthYearStr, setBirthYearStr] = useState('');
    const [sliders, setSliders] = useState<GMSliders>(DEFAULT_SLIDERS);

    const birthYear = parseInt(birthYearStr, 10);
    const step1Valid = lastName.trim() !== '' && firstName.trim() !== '' &&
        !isNaN(birthYear) && birthYear >= 1940 && birthYear <= 2000;

    const closestPersonality = useMemo(() => findClosestPersonality(sliders), [sliders]);

    const setSlider = (key: keyof GMSliders, val: number) =>
        setSliders(prev => ({ ...prev, [key]: val }));

    const goToStep = (n: 1 | 2) => {
        if (n === 2 && !step1Valid) return;
        setStep(n);
    };

    const handleSubmit = async () => {
        if (!step1Valid || isLoading) return;
        await onComplete({
            firstName: firstName.trim(),
            lastName:  lastName.trim(),
            birthYear,
            personalityType: closestPersonality,
            sliders,
        });
    };

    return (
        <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden ko-normal pretendard">
            {/* Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-3xl" />
                <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-indigo-900/10 rounded-full blur-3xl" />
            </div>

            <div className="max-w-md w-full relative">
                {/* Title */}
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-black text-white uppercase tracking-tight">단장 프로필 생성</h1>
                </div>

                {/* Step Indicator */}
                <div className="flex items-center justify-center gap-3 mb-6">
                    {([1, 2] as const).map(n => (
                        <React.Fragment key={n}>
                            <button
                                onClick={() => goToStep(n)}
                                disabled={n === 2 && !step1Valid}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all
                                    ${step === n
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                                        : step > n
                                            ? 'bg-indigo-800 text-indigo-300 hover:bg-indigo-700 cursor-pointer'
                                            : 'bg-slate-800 text-slate-500 cursor-default'
                                    }`}
                            >
                                {step > n ? <Check size={14} /> : n}
                            </button>
                            {n < 2 && (
                                <div className={`h-px w-16 transition-all ${step > 1 ? 'bg-indigo-700' : 'bg-slate-800'}`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Card */}
                <div className="bg-slate-900/80 border border-slate-800 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden">
                    <div className="p-8">
                        {/* ── Step 1 ── */}
                        {step === 1 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <h2 className="text-lg font-black text-white mb-1">기본 정보 입력</h2>
                                <p className="text-sm text-slate-500 mb-6">단장으로서의 프로필을 설정해 주세요.</p>

                                <div className="flex gap-4 mb-4">
                                    <div className="flex-1">
                                        <label className="text-sm font-medium text-slate-500 mb-2.5 block ml-1">성</label>
                                        <input
                                            type="text"
                                            value={lastName}
                                            onChange={e => setLastName(e.target.value)}
                                            maxLength={10}
                                            placeholder="홍"
                                            className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-xl py-4 px-5 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-700"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-sm font-medium text-slate-500 mb-2.5 block ml-1">이름</label>
                                        <input
                                            type="text"
                                            value={firstName}
                                            onChange={e => setFirstName(e.target.value)}
                                            maxLength={10}
                                            placeholder="길동"
                                            className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-xl py-4 px-5 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-700"
                                        />
                                    </div>
                                </div>

                                <div className="mb-8">
                                    <label className="text-sm font-medium text-slate-500 mb-2.5 block ml-1">출생 연도</label>
                                    <input
                                        type="number"
                                        value={birthYearStr}
                                        onChange={e => setBirthYearStr(e.target.value)}
                                        min={1940}
                                        max={2000}
                                        placeholder="1980"
                                        className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-xl py-4 px-5 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-700"
                                    />
                                    <p className="text-[10px] font-medium text-slate-600 mt-1.5 ml-1">1940 ~ 2000 사이 연도를 입력하세요.</p>
                                </div>

                                <button
                                    onClick={() => setStep(2)}
                                    disabled={!step1Valid}
                                    className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-xl transition-all duration-200 shadow-lg shadow-indigo-900/20 disabled:shadow-none uppercase tracking-widest active:scale-[0.98]"
                                >
                                    다음
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}

                        {/* ── Step 2 ── */}
                        {step === 2 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-black text-white">단장 성향 설정</h2>
                                    <span className="text-sm font-black text-indigo-300">
                                        {GM_PERSONALITY_LABELS[closestPersonality]}
                                    </span>
                                </div>

                                {/* Sliders */}
                                <div className="space-y-5 mb-6">
                                    {(Object.keys(DEFAULT_SLIDERS) as Array<keyof GMSliders>).map(key => (
                                        <SliderRow
                                            key={key}
                                            sliderKey={key}
                                            value={sliders[key]}
                                            onChange={val => setSlider(key, val)}
                                        />
                                    ))}
                                </div>

                                <button
                                    onClick={handleSubmit}
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-xl transition-all duration-200 shadow-lg shadow-indigo-900/20 disabled:shadow-none uppercase tracking-widest active:scale-[0.98]"
                                >
                                    {isLoading ? <span className="animate-pulse">저장 중...</span> : '프로필 생성'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

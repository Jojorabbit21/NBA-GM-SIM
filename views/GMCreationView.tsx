
import React, { useState } from 'react';
import { ChevronRight, Check, UserCircle2 } from 'lucide-react';
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
    }) => Promise<void>;
    isLoading?: boolean;
}

const PERSONALITY_DESCRIPTIONS: Record<GMPersonalityType, string> = {
    balanced:       '팀 전력과 미래를 균형 있게 운영',
    winNow:         '현재 우승을 위해 모든 것을 올인',
    rebuilder:      '장기적 재건을 통한 강팀 구축',
    starHunter:     '슈퍼스타 영입으로 팀 전력 극대화',
    valueTrader:    '가성비 선수 발굴로 효율 추구',
    defenseFocused: '탄탄한 수비 조직을 바탕으로 승부',
    youthMovement:  '젊은 선수 육성으로 미래를 향해',
};

const SLIDER_LABELS: Record<keyof GMSliders, string> = {
    aggressiveness:  '공격성',
    starWillingness: '스타 선호',
    youthBias:       '유스 편중',
    riskTolerance:   '리스크 감내',
    pickWillingness: '픽 활용',
};

const SLIDER_COLORS: Record<keyof GMSliders, string> = {
    aggressiveness:  'bg-red-500',
    starWillingness: 'bg-yellow-400',
    youthBias:       'bg-emerald-400',
    riskTolerance:   'bg-orange-400',
    pickWillingness: 'bg-sky-400',
};

// ─── Mini Slider Bar ──────────────────────────────────────────────────────────

const MiniSliderBar: React.FC<{ label: string; value: number; colorClass: string }> = ({ label, value, colorClass }) => (
    <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 w-14 flex-shrink-0 truncate">{label}</span>
        <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${value * 10}%` }} />
        </div>
        <span className="text-[10px] text-slate-600 w-3 text-right">{value}</span>
    </div>
);

// ─── Personality Card ─────────────────────────────────────────────────────────

const PersonalityCard: React.FC<{
    type: GMPersonalityType;
    selected: boolean;
    onClick: () => void;
}> = ({ type, selected, onClick }) => {
    const presets = GM_SLIDER_PRESETS[type];
    return (
        <button
            onClick={onClick}
            className={`relative text-left p-4 rounded-2xl border transition-all duration-200 cursor-pointer
                ${selected
                    ? 'border-indigo-500 bg-indigo-600/10 shadow-lg shadow-indigo-900/20'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
                }`}
        >
            {selected && (
                <div className="absolute top-3 right-3 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                    <Check size={11} className="text-white" />
                </div>
            )}
            <p className={`font-black text-sm mb-0.5 ${selected ? 'text-indigo-300' : 'text-white'}`}>
                {GM_PERSONALITY_LABELS[type]}
            </p>
            <p className="text-[11px] text-slate-500 mb-3 leading-snug">
                {PERSONALITY_DESCRIPTIONS[type]}
            </p>
            <div className="space-y-1.5">
                {(Object.keys(presets) as Array<keyof GMSliders>).map(key => (
                    <MiniSliderBar
                        key={key}
                        label={SLIDER_LABELS[key]}
                        value={presets[key]}
                        colorClass={SLIDER_COLORS[key]}
                    />
                ))}
            </div>
        </button>
    );
};

// ─── Main View ────────────────────────────────────────────────────────────────

export const GMCreationView: React.FC<GMCreationViewProps> = ({ onComplete, isLoading }) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [lastName,   setLastName]   = useState('');
    const [firstName,  setFirstName]  = useState('');
    const [birthYearStr, setBirthYearStr] = useState('');
    const [personality, setPersonality] = useState<GMPersonalityType | null>(null);

    const birthYear = parseInt(birthYearStr, 10);
    const step1Valid = lastName.trim() !== '' && firstName.trim() !== '' &&
        !isNaN(birthYear) && birthYear >= 1940 && birthYear <= 2000;

    const handleSubmit = async () => {
        if (!personality || !step1Valid || isLoading) return;
        await onComplete({
            firstName: firstName.trim(),
            lastName:  lastName.trim(),
            birthYear,
            personalityType: personality,
        });
    };

    return (
        <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 lg:p-8 relative overflow-hidden ko-normal pretendard">
            {/* Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-3xl" />
                <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-indigo-900/10 rounded-full blur-3xl" />
            </div>

            <div className="max-w-2xl w-full relative">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-3">
                        <UserCircle2 size={20} className="text-indigo-400" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">GM Profile Setup</span>
                    </div>
                    <h1 className="text-2xl font-black text-white uppercase tracking-tight">단장 프로필 생성</h1>
                </div>

                {/* Step Indicator */}
                <div className="flex items-center justify-center gap-3 mb-8">
                    {[1, 2].map(n => (
                        <React.Fragment key={n}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all
                                ${step === n ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                                  : step > n ? 'bg-indigo-800 text-indigo-300'
                                  : 'bg-slate-800 text-slate-500'}`}>
                                {step > n ? <Check size={14} /> : n}
                            </div>
                            {n < 2 && (
                                <div className={`h-px w-16 transition-all ${step > 1 ? 'bg-indigo-700' : 'bg-slate-800'}`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
                    <div className="h-1 w-full bg-gradient-to-r from-indigo-700 via-indigo-400 to-indigo-700" />

                    <div className="p-8">
                        {/* ── Step 1 ── */}
                        {step === 1 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <h2 className="text-lg font-black text-white mb-1">기본 정보 입력</h2>
                                <p className="text-sm text-slate-500 mb-6">단장으로서의 프로필을 설정해 주세요.</p>

                                <div className="flex gap-4 mb-4">
                                    <div className="flex-1">
                                        <label className="text-xs font-semibold text-slate-400 mb-2 block">성</label>
                                        <input
                                            type="text"
                                            value={lastName}
                                            onChange={e => setLastName(e.target.value)}
                                            maxLength={10}
                                            placeholder="홍"
                                            className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-xl py-3.5 px-4 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-700"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs font-semibold text-slate-400 mb-2 block">이름</label>
                                        <input
                                            type="text"
                                            value={firstName}
                                            onChange={e => setFirstName(e.target.value)}
                                            maxLength={10}
                                            placeholder="길동"
                                            className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-xl py-3.5 px-4 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-700"
                                        />
                                    </div>
                                </div>

                                <div className="mb-8">
                                    <label className="text-xs font-semibold text-slate-400 mb-2 block">출생 연도</label>
                                    <input
                                        type="number"
                                        value={birthYearStr}
                                        onChange={e => setBirthYearStr(e.target.value)}
                                        min={1940}
                                        max={2000}
                                        placeholder="1980"
                                        className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-xl py-3.5 px-4 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-700"
                                    />
                                    <p className="text-[11px] text-slate-600 mt-1.5 ml-1">1940 ~ 2000 사이 연도를 입력하세요.</p>
                                </div>

                                <button
                                    onClick={() => setStep(2)}
                                    disabled={!step1Valid}
                                    className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-xl transition-all duration-200 shadow-lg shadow-indigo-900/30 disabled:shadow-none"
                                >
                                    다음
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}

                        {/* ── Step 2 ── */}
                        {step === 2 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center justify-between mb-1">
                                    <h2 className="text-lg font-black text-white">단장 성격 선택</h2>
                                    <button
                                        onClick={() => setStep(1)}
                                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        ← 이전
                                    </button>
                                </div>
                                <p className="text-sm text-slate-500 mb-5">성격에 따라 트레이드·FA 전략이 결정됩니다.</p>

                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    {GM_PERSONALITY_TYPES.map(type => (
                                        <PersonalityCard
                                            key={type}
                                            type={type}
                                            selected={personality === type}
                                            onClick={() => setPersonality(type)}
                                        />
                                    ))}
                                </div>

                                <button
                                    onClick={handleSubmit}
                                    disabled={!personality || isLoading}
                                    className="w-full flex items-center justify-center gap-3 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-xl transition-all duration-200 shadow-lg shadow-indigo-900/30 disabled:shadow-none"
                                >
                                    {isLoading ? (
                                        <span className="animate-pulse">저장 중...</span>
                                    ) : (
                                        <>
                                            <UserCircle2 size={18} />
                                            단장 취임
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

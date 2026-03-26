
import React, { useState, useMemo } from 'react';
import { ArrowLeft, Dumbbell } from 'lucide-react';
import {
    TeamTrainingConfig,
    TrainingProgramKey,
    TRAINING_PROGRAM_KEYS,
    TRAINING_PROGRAM_LABELS,
    TRAINING_PROGRAM_ATTRS,
    calcTotalTrainingPoints,
} from '../types/training';
import { CoachingStaff } from '../types/coaching';
import { computeTrainingEfficiency } from '../services/coachingStaff/trainingEngine';
import { TrainingEfficiency } from '../types/training';
import { formatMoney } from '../utils/formatMoney';

interface TrainingViewProps {
    teamId: string;
    trainingConfig: TeamTrainingConfig;
    coachingStaff: CoachingStaff | null;
    onSave: (config: TeamTrainingConfig) => void;
    onBack: () => void;
}

const MAX_BUDGET = 20_000_000;
const BUDGET_STEP = 250_000;

// 효율 키 매핑
const EFF_KEY_MAP: Record<TrainingProgramKey, keyof TrainingEfficiency> = {
    shootingTraining:     'shootingEff',
    insideTraining:       'insideEff',
    playmakingTraining:   'playmakingEff',
    manDefTraining:       'manDefEff',
    helpDefTraining:      'helpDefEff',
    reboundTraining:      'reboundEff',
    explosivnessTraining: 'explosivnessEff',
    strengthTraining:     'strengthEff',
    offTacticsTraining:   'offTacticsEff',
    defTacticsTraining:   'defTacticsEff',
};

// 훈련 그룹핑
const TRAINING_GROUPS: { label: string; keys: TrainingProgramKey[]; color: string }[] = [
    { label: '공격', keys: ['shootingTraining', 'insideTraining', 'playmakingTraining'], color: 'text-amber-400' },
    { label: '수비', keys: ['manDefTraining', 'helpDefTraining', 'reboundTraining'], color: 'text-rose-400' },
    { label: '운동능력', keys: ['explosivnessTraining', 'strengthTraining'], color: 'text-emerald-400' },
    { label: '전술', keys: ['offTacticsTraining', 'defTacticsTraining'], color: 'text-indigo-400' },
];

function effToPercent(eff: number): number {
    // eff: 0.5~1.0 → 0~100%
    return Math.round((eff - 0.5) / 0.5 * 100);
}

function getEffColor(pct: number): string {
    if (pct >= 70) return 'text-emerald-400 bg-emerald-400/20';
    if (pct >= 40) return 'text-amber-400 bg-amber-400/20';
    return 'text-rose-400 bg-rose-400/20';
}

function getBarColor(pct: number): string {
    if (pct >= 70) return 'bg-emerald-500';
    if (pct >= 40) return 'bg-amber-500';
    return 'bg-rose-500';
}

export const TrainingView: React.FC<TrainingViewProps> = ({
    teamId,
    trainingConfig,
    coachingStaff,
    onSave,
    onBack,
}) => {
    const [budget, setBudget] = useState(trainingConfig.budget);
    const [program, setProgram] = useState({ ...trainingConfig.program });

    const totalPoints = calcTotalTrainingPoints(budget);

    const usedPoints = useMemo(() =>
        TRAINING_PROGRAM_KEYS.reduce((sum, key) => sum + (program[key] ?? 0), 0),
        [program]
    );

    const remaining = totalPoints - usedPoints;
    const isOverBudget = usedPoints > totalPoints;
    const canSave = !isOverBudget;

    const efficiency: TrainingEfficiency | null = useMemo(() => {
        if (!coachingStaff) return null;
        return computeTrainingEfficiency(coachingStaff, budget);
    }, [coachingStaff, budget]);

    const handleProgramChange = (key: TrainingProgramKey, value: number) => {
        const clamped = Math.max(0, Math.min(value, totalPoints));
        setProgram(prev => ({ ...prev, [key]: clamped }));
    };

    const handleSave = () => {
        if (!canSave) return;
        onSave({ budget, program });
    };

    const handleReset = () => {
        const even = Math.floor(totalPoints / TRAINING_PROGRAM_KEYS.length);
        const newProgram = {} as typeof program;
        TRAINING_PROGRAM_KEYS.forEach(key => { newProgram[key] = even; });
        setProgram(newProgram);
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden bg-slate-950">

            {/* ═══ 상단 헤더 ═══ */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900 shrink-0">
                <button
                    onClick={onBack}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors text-slate-300"
                >
                    <ArrowLeft size={14} />
                </button>
                <div className="flex items-center gap-2 flex-1">
                    <Dumbbell size={16} className="text-indigo-400" />
                    <h1 className="text-sm font-black text-white uppercase tracking-widest">훈련 계획</h1>
                </div>
                {/* 총 포인트 요약 */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">총 포인트</span>
                    <span className="text-sm font-black font-mono text-indigo-400 tabular-nums">{totalPoints}</span>
                    <span className="text-xs text-slate-600">pts</span>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <div className="p-4 flex flex-col gap-4 max-w-4xl mx-auto">

                    {/* ═══ 예산 섹션 ═══ */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700">
                            <span className="text-xs font-black text-white uppercase tracking-widest">훈련 예산</span>
                        </div>
                        <div className="p-4 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400">예산이 높을수록 훈련 포인트가 증가합니다</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-base font-black font-mono text-emerald-400 tabular-nums">{formatMoney(budget)}</span>
                                    <span className="text-xs text-slate-500">→</span>
                                    <span className="text-xs font-black text-indigo-400 font-mono">{totalPoints}pts</span>
                                </div>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={MAX_BUDGET}
                                step={BUDGET_STEP}
                                value={budget}
                                onChange={e => setBudget(Number(e.target.value))}
                                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-indigo-500"
                            />
                            <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                                <span>$0</span>
                                <span>$5M</span>
                                <span>$10M</span>
                                <span>$15M</span>
                                <span>$20M</span>
                            </div>
                        </div>
                    </div>

                    {/* ═══ 포인트 배분 요약 ═══ */}
                    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${isOverBudget ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-900 border-slate-800'}`}>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">배분 포인트</span>
                            <span className={`text-sm font-black font-mono tabular-nums ${isOverBudget ? 'text-rose-400' : 'text-white'}`}>
                                {usedPoints}
                            </span>
                            <span className="text-xs text-slate-600">/</span>
                            <span className="text-xs font-black font-mono text-indigo-400 tabular-nums">{totalPoints}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {isOverBudget ? (
                                <span className="text-xs font-black text-rose-400">초과 {usedPoints - totalPoints}pts</span>
                            ) : (
                                <span className="text-xs text-slate-500">잔여 <span className="font-mono text-slate-300 font-bold">{remaining}</span>pts</span>
                            )}
                            <button
                                onClick={handleReset}
                                className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
                            >
                                균등 배분
                            </button>
                        </div>
                    </div>

                    {/* ═══ 훈련 프로그램 섹션 ═══ */}
                    {TRAINING_GROUPS.map(group => (
                        <div key={group.label} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                            <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700 flex items-center gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-slate-800 ${group.color}`}>{group.label}</span>
                                <span className="text-xs font-black text-white uppercase tracking-widest">훈련</span>
                            </div>
                            <div className="divide-y divide-slate-800/50">
                                {group.keys.map(key => {
                                    const pts = program[key] ?? 0;
                                    const effVal = efficiency ? (efficiency[EFF_KEY_MAP[key]] as number) : null;
                                    const effPct = effVal !== null ? effToPercent(effVal) : null;
                                    const barPct = Math.min(100, (pts / Math.max(totalPoints, 1)) * 100);
                                    const attrs = TRAINING_PROGRAM_ATTRS[key];

                                    return (
                                        <div key={key} className="px-4 py-3 flex flex-col gap-2">
                                            <div className="flex items-center gap-3">
                                                {/* 라벨 + 능력치 목록 */}
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-white">{TRAINING_PROGRAM_LABELS[key]}</span>
                                                        {effPct !== null ? (
                                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${getEffColor(effPct)}`}>
                                                                효율 {effPct}%
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-slate-500 bg-slate-800">
                                                                코치 없음 (효율 50%)
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {attrs.map(attr => (
                                                            <span key={attr} className="text-[9px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded font-mono">{attr}</span>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* 포인트 입력 */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        onClick={() => handleProgramChange(key, pts - 1)}
                                                        disabled={pts <= 0}
                                                        className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 text-sm font-black transition-colors flex items-center justify-center"
                                                    >
                                                        −
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={totalPoints}
                                                        value={pts}
                                                        onChange={e => handleProgramChange(key, Number(e.target.value))}
                                                        className="w-14 text-center text-xs font-black font-mono text-white bg-slate-800 border border-slate-700 rounded-lg py-1 focus:outline-none focus:border-indigo-500"
                                                    />
                                                    <button
                                                        onClick={() => handleProgramChange(key, pts + 1)}
                                                        disabled={pts >= totalPoints}
                                                        className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 text-sm font-black transition-colors flex items-center justify-center"
                                                    >
                                                        +
                                                    </button>
                                                    <span className="text-[10px] text-slate-600 w-6 text-right font-mono">pts</span>
                                                </div>
                                            </div>

                                            {/* 진행 바 */}
                                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-200 ${isOverBudget ? 'bg-rose-500' : getBarColor(effPct ?? 50)}`}
                                                    style={{ width: `${barPct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* ═══ 코치 효율 요약 ═══ */}
                    {efficiency && (
                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                            <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700">
                                <span className="text-xs font-black text-white uppercase tracking-widest">코치 효율 요약</span>
                            </div>
                            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-slate-500">전체 보정</span>
                                    <span className="text-sm font-black font-mono text-indigo-400">×{efficiency.globalMult.toFixed(2)}</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-slate-500">젊은 선수 배율</span>
                                    <span className="text-sm font-black font-mono text-emerald-400">×{efficiency.youngPlayerMult.toFixed(2)}</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-slate-500">루키 배율</span>
                                    <span className="text-sm font-black font-mono text-amber-400">×{efficiency.rookieMult.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ═══ 저장 버튼 ═══ */}
                    <div className="flex gap-3 pb-4">
                        <button
                            onClick={onBack}
                            className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!canSave}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-colors ${
                                canSave
                                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                        >
                            {isOverBudget ? `포인트 초과 (${usedPoints - totalPoints}pts)` : '저장'}
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};


import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from './common/Modal';
import { RotateCcw, Save } from 'lucide-react';
import { SimSettings, DEFAULT_SIM_SETTINGS, SIM_SETTINGS_META, SimSettingMeta } from '../types/simSettings';

interface SimSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    simSettings: SimSettings;
    onUpdate: (settings: SimSettings) => void;
}

// ── 개별 설정 행 (토글) ──
const ToggleRow: React.FC<{
    meta: SimSettingMeta;
    value: boolean;
    onChange: (v: boolean) => void;
}> = ({ meta, value, onChange }) => (
    <div className="flex items-center justify-between py-3">
        <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-200 ko-normal">{meta.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
        </div>
        <button
            onClick={() => onChange(!value)}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ${
                value ? 'bg-indigo-600' : 'bg-slate-700'
            }`}
        >
            <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    value ? 'translate-x-5' : 'translate-x-0'
                }`}
            />
        </button>
    </div>
);

// ── 개별 설정 행 (숫자 슬라이더) ──
const NumberRow: React.FC<{
    meta: SimSettingMeta;
    value: number;
    onChange: (v: number) => void;
    defaultValue: number;
}> = ({ meta, value, onChange, defaultValue }) => {
    const { min = 0, max = 1, step = 0.1 } = meta;
    const isDefault = value === defaultValue;

    // step에 따른 소수점 자릿수
    const decimals = step < 1 ? (step < 0.01 ? 3 : step < 0.1 ? 2 : 1) : 0;

    // 채워진 비율 계산
    const fillPercent = ((value - min) / (max - min)) * 100;

    // 슬라이더 배경 (채워진 부분 + 빈 부분)
    const sliderStyle = useMemo(() => ({
        background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${fillPercent}%, #334155 ${fillPercent}%, #334155 100%)`,
    }), [fillPercent]);

    return (
        <div className="flex items-center gap-4 py-3">
            {/* 좌측: 제목 + 설명 (50%) */}
            <div className="w-1/2 min-w-0">
                <p className="text-sm font-bold text-slate-200 ko-normal">{meta.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
            </div>

            {/* 우측: 슬라이더 + 값 (50%) */}
            <div className="w-1/2 flex items-center gap-2">
                <span className="text-xs text-slate-600 font-mono w-8 text-right flex-shrink-0">{min.toFixed(decimals)}</span>
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    style={sliderStyle}
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500
                        [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(99,102,241,0.5)]
                        [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-all
                        [&::-webkit-slider-thumb]:hover:bg-indigo-400"
                />
                <span className="text-xs text-slate-600 font-mono w-8 flex-shrink-0">{max.toFixed(decimals)}</span>
                <span className={`text-xs font-mono font-bold tabular-nums w-10 text-right flex-shrink-0 ${isDefault ? 'text-slate-300' : 'text-indigo-400'}`}>
                    {value.toFixed(decimals)}
                </span>
                <div className="w-4 flex-shrink-0">
                    {!isDefault && (
                        <button
                            onClick={() => onChange(defaultValue)}
                            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                            title="기본값으로 복원"
                        >
                            <RotateCcw size={12} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export const SimSettingsModal: React.FC<SimSettingsModalProps> = ({
    isOpen, onClose, simSettings, onUpdate,
}) => {
    const [draft, setDraft] = useState<SimSettings>({ ...simSettings });

    // 모달 열릴 때 최신 settings 반영
    useEffect(() => {
        if (isOpen) setDraft({ ...simSettings });
    }, [isOpen, simSettings]);

    const handleChange = (key: keyof SimSettings, value: number | boolean) => {
        setDraft(prev => ({ ...prev, [key]: value }));
    };

    const hasChanges = (Object.keys(draft) as (keyof SimSettings)[]).some(
        k => draft[k] !== simSettings[k]
    );

    const isAllDefault = (Object.keys(draft) as (keyof SimSettings)[]).every(
        k => draft[k] === DEFAULT_SIM_SETTINGS[k]
    );

    const handleSave = () => {
        onUpdate(draft);
        onClose();
    };

    const handleResetAll = () => {
        setDraft({ ...DEFAULT_SIM_SETTINGS });
    };

    // 카테고리별 그룹화
    const categories = SIM_SETTINGS_META.reduce<Record<string, SimSettingMeta[]>>((acc, meta) => {
        if (!acc[meta.category]) acc[meta.category] = [];
        acc[meta.category].push(meta);
        return acc;
    }, {});

    const footer = (
        <div className="flex items-center justify-between">
            <button
                onClick={handleResetAll}
                disabled={isAllDefault}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
                <RotateCcw size={14} />
                전체 초기화
            </button>
            <button
                onClick={handleSave}
                disabled={!hasChanges}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            >
                <Save size={14} />
                저장
            </button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md" title="시뮬레이션 설정" footer={footer}>
            <div className="p-6 space-y-6">
                {Object.entries(categories).map(([category, metas]) => (
                    <div key={category}>
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">
                            {category}
                        </h4>
                        <div className="divide-y divide-slate-800/50">
                            {metas.map(meta => {
                                const val = draft[meta.key];
                                if (meta.type === 'toggle') {
                                    return (
                                        <ToggleRow
                                            key={meta.key}
                                            meta={meta}
                                            value={val as boolean}
                                            onChange={(v) => handleChange(meta.key, v)}
                                        />
                                    );
                                }
                                return (
                                    <NumberRow
                                        key={meta.key}
                                        meta={meta}
                                        value={val as number}
                                        defaultValue={DEFAULT_SIM_SETTINGS[meta.key] as number}
                                        onChange={(v) => handleChange(meta.key, v)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    );
};

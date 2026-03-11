
import React, { useState, useEffect } from 'react';
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
        <div className="min-w-0">
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

// ── 개별 설정 행 (숫자 인풋) ──
const NumberRow: React.FC<{
    meta: SimSettingMeta;
    value: number;
    onChange: (v: number) => void;
    defaultValue: number;
}> = ({ meta, value, onChange, defaultValue }) => {
    const { min = 0, max = 1, step = 0.1 } = meta;
    const isDefault = value === defaultValue;
    const isInteger = step >= 1;

    const decimals = isInteger ? 0 : (step < 0.01 ? 3 : step < 0.1 ? 2 : 1);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw === '' || raw === '-') return;
        const parsed = isInteger ? parseInt(raw, 10) : parseFloat(raw);
        if (isNaN(parsed)) return;
        const clamped = Math.min(max, Math.max(min, parsed));
        onChange(isInteger ? clamped : parseFloat(clamped.toFixed(decimals)));
    };

    return (
        <div className="flex items-center justify-between py-3">
            {/* 좌측: 제목 + 리셋 / 설명(범위 포함) */}
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-200 ko-normal">{meta.label}</p>
                    {!isDefault && (
                        <button
                            onClick={() => onChange(defaultValue)}
                            className="text-slate-500 hover:text-slate-300 transition-colors"
                            title="기본값으로 복원"
                        >
                            <RotateCcw size={12} />
                        </button>
                    )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                    {meta.description} ({min.toFixed(decimals)}~{max.toFixed(decimals)})
                </p>
            </div>

            {/* 우측: 인풋 (고정 폭, 우측 정렬) */}
            <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={isInteger ? value : value.toFixed(decimals)}
                onChange={handleInputChange}
                className={`w-20 h-8 bg-slate-950 border rounded-lg px-2 text-xs font-mono font-bold tabular-nums text-center flex-shrink-0 ml-4
                    focus:outline-none focus:border-indigo-500 focus:text-white transition-colors
                    [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
                    ${isDefault ? 'border-slate-700 text-slate-300' : 'border-indigo-500/50 text-indigo-400'}`}
            />
        </div>
    );
};

export const SimSettingsModal: React.FC<SimSettingsModalProps> = ({
    isOpen, onClose, simSettings, onUpdate,
}) => {
    const [draft, setDraft] = useState<SimSettings>({ ...simSettings });

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
        <Modal isOpen={isOpen} onClose={onClose} size="md" title="시뮬레이션 설정" footer={footer} className="!rounded-2xl">
            <div className="px-8 py-4">
                {SIM_SETTINGS_META.map(meta => {
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
        </Modal>
    );
};

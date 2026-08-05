
import React from 'react';
import { HEX_COLOR_RE } from '../../utils/colorContrast';

// TeamSetupModal/TeamSettingsModal이 각자 반복 정의하던 "컬러 피커 + 헥스 텍스트 입력" 한 쌍을
// 공용 컴포넌트로 통합 — 라벨/값만 바꿔가며 재사용.

interface ColorFieldProps {
    label: string;
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

export const ColorField: React.FC<ColorFieldProps> = ({ label, value, onChange, disabled, placeholder }) => {
    const safe = HEX_COLOR_RE.test(value) ? value : '#000000';
    return (
        <div>
            <label className="text-xs text-slate-400 ko-normal block mb-1">{label}</label>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    value={safe}
                    disabled={disabled}
                    onChange={e => onChange(e.target.value)}
                    className="w-9 h-9 rounded-lg border border-slate-700 cursor-pointer bg-transparent p-0.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <input
                    type="text"
                    value={value}
                    disabled={disabled}
                    onChange={e => onChange(e.target.value)}
                    maxLength={7}
                    placeholder={placeholder}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                />
            </div>
        </div>
    );
};

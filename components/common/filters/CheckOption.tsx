// CheckOption.tsx — 필터 패널의 라디오/체크박스 한 줄. [2026-10-13]
// 선수 상세 샷 차트 필터가 같은 className 문자열(appearance-none + border-2 + indigo 체크)을 7블록에 복붙하던 것을
// 모았다(docs/plan/ui-audit/03-player-detail.md 후보 5). 라디오는 가운데 점이 보이게 inset 그림자, 체크박스는 채움만.
import React from 'react';

interface CheckOptionProps {
    type: 'radio' | 'checkbox';
    checked: boolean;
    onChange: () => void;
    label: React.ReactNode;
    /** 라디오 그룹 이름(type="radio"일 때) */
    name?: string;
    disabled?: boolean;
    className?: string;
}

const INPUT_BASE = 'w-4 h-4 shrink-0 cursor-pointer appearance-none border-2 border-slate-600 bg-slate-950 checked:border-indigo-500 checked:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const INPUT_BY_TYPE = {
    radio: 'rounded-full checked:shadow-[inset_0_0_0_2.5px_rgb(2,6,23)]',
    checkbox: 'rounded',
} as const;

export const CheckOption: React.FC<CheckOptionProps> = ({ type, checked, onChange, label, name, disabled = false, className = '' }) => (
    <label className={`flex items-center gap-2.5 py-1 cursor-pointer group ${className}`}>
        <input
            type={type}
            name={name}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className={`${INPUT_BASE} ${INPUT_BY_TYPE[type]}`}
        />
        <span className={`text-sm transition-colors ${checked ? 'text-white font-bold' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
    </label>
);

/** 필터 그룹(소제목 + 옵션 목록). divide-y 컨테이너 안에서 `py-3`로 간격을 맞춘다. */
export const CheckOptionGroup: React.FC<{ title: React.ReactNode; children: React.ReactNode; className?: string; footer?: React.ReactNode }> = ({ title, children, className = '', footer }) => (
    <div className={`py-3 ${className}`}>
        <div className="text-xs font-bold text-slate-500 mb-2">{title}</div>
        <div className="flex flex-col gap-1">{children}</div>
        {footer}
    </div>
);

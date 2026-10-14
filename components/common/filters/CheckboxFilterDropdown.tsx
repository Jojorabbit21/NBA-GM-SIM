import React, { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { FilterTrigger } from './FilterTrigger';

export interface CheckboxFilterOption {
    value: string;
    label: React.ReactNode;
    /** 체크박스와 라벨 사이(팀 배지 등) */
    icon?: React.ReactNode;
}

interface CheckboxFilterDropdownProps {
    label: React.ReactNode;
    /** 문자열이면 value=label로 취급 */
    options: (string | CheckboxFilterOption)[];
    selected: string[];
    /** 토글·모두 선택 결과를 통째로 돌려준다(개별 toggle/toggleAll 핸들러를 호출부가 들 필요 없음) */
    onChange: (next: string[]) => void;
    /** 패널 너비 — 팀 목록처럼 긴 라벨은 w-64 */
    width?: 'w-48' | 'w-64';
}

const CheckRow: React.FC<{ checked: boolean; icon?: React.ReactNode; label: React.ReactNode; onClick: () => void }> = ({ checked, icon, label, onClick }) => (
    <div onClick={onClick} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors">
        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
            checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'
        }`}>
            {checked && <Check size={10} className="text-white" />}
        </div>
        {icon}
        <span className={`text-sm font-semibold truncate ${checked ? 'text-white' : 'text-slate-400'}`}>{label}</span>
    </div>
);

/**
 * 체크박스 다중 선택 필터 드롭다운 — 2026-10-12 공용화(docs/plan/ui-buttons.md 3-4).
 * 패널은 fixed 포지셔닝(overflow-x-auto 툴바의 클리핑 우회)으로 트리거 우측 하단에 붙고,
 * 투명 백드롭 클릭으로 닫힌다. "모두 선택"은 전부 선택 ↔ 전부 해제 토글.
 */
export const CheckboxFilterDropdown: React.FC<CheckboxFilterDropdownProps> = ({ label, options, selected, onChange, width = 'w-48' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState({ top: 0, right: 0 });

    const items: CheckboxFilterOption[] = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o));
    const allSelected = items.length > 0 && selected.length === items.length;

    const handleToggleOpen = () => {
        if (!isOpen && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        }
        setIsOpen(v => !v);
    };
    const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
    const toggleAll = () => onChange(allSelected ? [] : items.map(i => i.value));

    return (
        <div className="relative">
            <FilterTrigger ref={btnRef} label={label} count={selected.length} onClick={handleToggleOpen} aria-expanded={isOpen} />

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-popover" onClick={() => setIsOpen(false)} />
                    <div
                        className={`fixed ${width} bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-popover animate-in fade-in zoom-in-95 duration-150`}
                        style={{ top: pos.top, right: pos.right }}
                    >
                        <div className="p-2 max-h-80 overflow-y-auto custom-scrollbar space-y-1">
                            <CheckRow checked={allSelected} label="모두 선택" onClick={toggleAll} />
                            <div className="h-px bg-slate-800 mx-2 my-1" />
                            {items.map(item => (
                                <CheckRow
                                    key={item.value}
                                    checked={selected.includes(item.value)}
                                    icon={item.icon}
                                    label={item.label}
                                    onClick={() => toggle(item.value)}
                                />
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

import React, { useEffect, useState } from 'react';
import { ChevronDown, Filter, Plus, X } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { OPERATORS, type Operator } from '../../../utils/statFilter';

export interface StatFilterOption {
    value: string;
    label: string;
}

export interface StatFilterDraft {
    category: string;
    operator: Operator;
    value: number;
    /** "득점 >= 20" 형태의 칩 라벨 */
    label: string;
}

interface StatFilterBarProps {
    options: StatFilterOption[];
    onAdd: (draft: StatFilterDraft) => void;
}

/**
 * [카테고리 ▾][연산자 ▾][값][+] 스탯 부등호 필터 입력 바 — 2026-10-12 공용화(docs/plan/ui-buttons.md 3-4).
 * 리더보드 툴바·FA·드래프트 풀이 복제하던 36px 컨테이너. 카테고리/연산자/값은 내부 상태로 들고,
 * Enter 또는 + 클릭 시 onAdd로 완성된 필터를 넘기고 값만 비운다.
 */
export const StatFilterBar: React.FC<StatFilterBarProps> = ({ options, onAdd }) => {
    const [category, setCategory] = useState(options[0]?.value ?? '');
    const [operator, setOperator] = useState<Operator>('>=');
    const [value, setValue] = useState('');

    // 옵션 목록이 바뀌어(리더보드 카테고리 전환) 현재 선택이 사라지면 첫 항목으로 되돌린다
    useEffect(() => {
        if (!options.some(o => o.value === category)) setCategory(options[0]?.value ?? '');
    }, [options, category]);

    const handleAdd = () => {
        if (!value) return;
        const label = options.find(o => o.value === category)?.label ?? category;
        onAdd({ category, operator, value: parseFloat(value), label: `${label} ${operator} ${value}` });
        setValue('');
    };

    return (
        <div className="flex items-center h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm shrink-0">
            <div className="px-3 flex items-center justify-center border-r border-slate-800 h-full text-slate-500">
                <Filter size={14} />
            </div>
            <div className="border-r border-slate-800">
                <Dropdown
                    trigger={
                        <button type="button" className="h-[36px] px-3 flex items-center gap-1.5 text-sm font-semibold text-white transition-colors whitespace-nowrap">
                            <span className="max-w-[96px] truncate">{options.find(o => o.value === category)?.label ?? category}</span>
                            <ChevronDown size={12} className="text-slate-600 shrink-0" />
                        </button>
                    }
                    items={options.map(opt => ({
                        id: opt.value,
                        label: <span className="text-sm">{opt.label}</span>,
                        onClick: () => setCategory(opt.value),
                        active: category === opt.value,
                    }))}
                    width="w-48"
                    align="left"
                />
            </div>
            <div className="border-r border-slate-800">
                <Dropdown
                    trigger={
                        <button type="button" className="h-[36px] px-3 flex items-center text-sm font-semibold text-indigo-400 transition-colors whitespace-nowrap">
                            {operator}
                        </button>
                    }
                    items={OPERATORS.map(op => ({
                        id: op,
                        label: <span className="text-sm">{op}</span>,
                        onClick: () => setOperator(op),
                        active: operator === op,
                    }))}
                    width="w-16"
                    align="left"
                />
            </div>
            <input
                type="number"
                placeholder="값"
                className="h-full bg-transparent px-3 w-16 text-sm font-semibold text-white outline-none placeholder:text-slate-700 [&::-webkit-inner-spin-button]:appearance-none"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button
                type="button"
                onClick={handleAdd}
                aria-label="필터 추가"
                title="필터 추가"
                className="h-full px-3 flex items-center justify-center border-l border-slate-800 text-slate-500 hover:text-white hover:bg-indigo-600/20 transition-colors rounded-r-lg"
            >
                <Plus size={14} />
            </button>
        </div>
    );
};

interface FilterChipsProps {
    chips: { id: string; label: string }[];
    onRemove: (id: string) => void;
    onClear: () => void;
    /** 툴바 좌우 패딩에 맞춘다(FA/드래프트 풀 px-4, 리더보드 px-6) */
    inset?: 'px-4' | 'px-6';
}

/** StatFilterBar로 추가된 필터 칩 목록 + "모두 제거". 칩이 없으면 아무것도 그리지 않는다. */
export const FilterChips: React.FC<FilterChipsProps> = ({ chips, onRemove, onClear, inset = 'px-4' }) => {
    if (chips.length === 0) return null;
    const margin = inset === 'px-4' ? 'mx-4' : 'mx-6';
    return (
        <>
            <div className={`h-px bg-slate-800/60 ${margin} mb-3`} />
            <div className={`${inset} pb-3 flex flex-wrap gap-2 animate-in slide-in-from-top-2`}>
                {chips.map(chip => (
                    <div key={chip.id} className="flex items-center gap-2 px-3 py-1 bg-indigo-900/30 border border-indigo-500/30 rounded-full text-sm font-semibold text-indigo-300">
                        <span>{chip.label}</span>
                        <IconButton label="필터 제거" size="xs" tone="inherit" onClick={() => onRemove(chip.id)}><X size={12} /></IconButton>
                    </div>
                ))}
                <Button variant="link" onClick={onClear} className="ml-2">모두 제거</Button>
            </div>
        </>
    );
};

// SplitButton.tsx — 메인 동작 버튼 + 옵션 쉐브론이 한 몸인 분할 버튼. [2026-10-13]
// 뎁스 차트/로테이션 툴바의 "AI 위임" 버튼 3개가 각자 상태·ref·바깥 클릭 리스너·absolute 팝업을 복붙하던 것
// (docs/plan/ui-audit/09-tactics.md 후보 2). 팝업은 공용 Dropdown(포탈·z-popover·바깥 클릭 닫기)을 그대로 쓴다.
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, type ButtonVariant, type ButtonSize } from './Button';
import { IconButton } from './IconButton';
import { Dropdown } from './Dropdown';

export interface SplitButtonItem {
    id: string;
    label: React.ReactNode;
    /** 라벨 아래 작은 보조 설명(예: "주전 36분 / 벤치 12분") */
    sub?: React.ReactNode;
    onClick: () => void;
}

interface SplitButtonProps {
    /** 메인 버튼 라벨 */
    children: React.ReactNode;
    /** 메인 버튼 클릭(보통 items[0]과 같은 동작) */
    onClick: () => void;
    items: SplitButtonItem[];
    variant?: Extract<ButtonVariant, 'primary' | 'secondary' | 'success'>;
    size?: Extract<ButtonSize, 'sm' | 'md'>;
    /** 팝업 폭(Tailwind 리터럴) */
    width?: string;
    disabled?: boolean;
    className?: string;
}

// 쉐브론 버튼을 메인 버튼과 같은 색으로 — IconButton tone을 variant별로 덮어쓴다.
const CHEVRON_TONE: Record<NonNullable<SplitButtonProps['variant']>, string> = {
    primary: '!bg-indigo-600 hover:!bg-indigo-500 !border-indigo-600 !text-white',
    secondary: '!bg-slate-800 hover:!bg-slate-700 !border-slate-700 !text-slate-300 hover:!text-white',
    success: '!bg-emerald-600 hover:!bg-emerald-500 !border-emerald-600 !text-white',
};

export const SplitButton: React.FC<SplitButtonProps> = ({
    children, onClick, items, variant = 'primary', size = 'md', width = 'w-48', disabled = false, className = '',
}) => {
    const [open, setOpen] = useState(false);
    return (
        <div className={`relative flex shadow-md ${className}`}>
            <Button variant={variant} size={size} shape="md" onClick={onClick} disabled={disabled} className="rounded-r-none">
                {children}
            </Button>
            <Dropdown
                align="right"
                width={width}
                isOpen={open}
                onOpenChange={setOpen}
                trigger={
                    <IconButton
                        label="옵션"
                        tone="solid"
                        size={size === 'sm' ? 'md' : 'lg'}
                        disabled={disabled}
                        className={`rounded-l-none ${CHEVRON_TONE[variant]}`}
                    >
                        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    </IconButton>
                }
                items={items.map(it => ({
                    id: it.id,
                    label: (
                        <span className="flex flex-col gap-0.5 text-sm">
                            <span>{it.label}</span>
                            {it.sub && <span className="text-xs text-slate-500 font-normal">{it.sub}</span>}
                        </span>
                    ),
                    onClick: it.onClick,
                }))}
            />
        </div>
    );
};

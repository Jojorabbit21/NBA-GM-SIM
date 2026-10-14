import React from 'react';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
    /** xs[2026-10-13] = 표 셀 안 이름 옆에 붙는 한 글자~두 글자 꼬리표(TW 등): px-1 py-0.5 text-[10px] leading-none */
    size?: 'xs' | 'sm' | 'md';
    /** pill(기본, rounded-full) / square(rounded) — 표 셀 안 꼬리표는 square */
    shape?: 'pill' | 'square';
    /** 마우스 오버 설명(예: "Two-Way 계약") */
    title?: string;
    className?: string;
    icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
    children,
    variant = 'neutral',
    size = 'md',
    shape = 'pill',
    title,
    className = '',
    icon
}) => {
    const baseStyles = `inline-flex items-center justify-center font-black border ${shape === 'square' ? 'rounded' : 'rounded-full'}`;

    const sizes = {
        xs: "px-1 py-0.5 text-[10px] leading-none shrink-0",
        sm: "px-2 py-0.5 text-[9px]",
        md: "px-3 py-1 text-[10px]"
    };

    const variants = {
        neutral: "bg-slate-800 text-slate-300 border-slate-700",
        brand: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
        success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        warning: "bg-amber-500/10 text-amber-400 border-amber-500/30",
        danger: "bg-red-500/10 text-red-400 border-red-500/30",
        info: "bg-blue-500/10 text-blue-400 border-blue-500/30"
    };

    return (
        <span className={`${baseStyles} ${sizes[size]} ${variants[variant]} ${className}`} title={title}>
            {icon && <span className="mr-1.5">{icon}</span>}
            {children}
        </span>
    );
};

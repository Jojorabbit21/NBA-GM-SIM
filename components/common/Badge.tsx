
import React from 'react';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
    size?: 'sm' | 'md';
    className?: string;
    icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ 
    children, 
    variant = 'neutral', 
    size = 'md',
    className = '',
    icon
}) => {
    const baseStyles = "inline-flex items-center justify-center font-black uppercase tracking-wider rounded-full border";
    
    const sizes = {
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
        <span className={`${baseStyles} ${sizes[size]} ${variants[variant]} ${className}`}>
            {icon && <span className="mr-1.5">{icon}</span>}
            {children}
        </span>
    );
};


import React from 'react';

interface OvrBadgeProps {
    value: number;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

export const OvrBadge: React.FC<OvrBadgeProps> = ({ value, size = 'md', className = '' }) => {
    const baseStyles = "flex items-center justify-center font-black oswald shadow-lg text-shadow-ovr transition-all leading-none";
    
    const sizeStyles = {
        sm: "w-6 h-6 text-[10px] rounded",
        md: "w-8 h-8 text-sm rounded-md",
        lg: "w-11 h-11 text-xl rounded-lg",
        xl: "w-16 h-16 text-3xl rounded-xl"
    };

    let colorStyles = "";
    if (value >= 95) colorStyles = 'bg-gradient-to-b from-fuchsia-300 via-fuchsia-500 to-fuchsia-700 text-white shadow-[0_0_15px_rgba(232,121,249,0.6)] border border-white/50 ring-1 ring-fuchsia-500/50';
    else if (value >= 90) colorStyles = 'bg-gradient-to-br from-red-500 via-red-600 to-rose-700 text-white shadow-red-500/40 border border-red-400/50';
    else if (value >= 85) colorStyles = 'bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 text-white shadow-blue-500/40 border border-blue-400/50';
    else if (value >= 80) colorStyles = 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white shadow-emerald-500/40 border border-emerald-400/50';
    else if (value >= 75) colorStyles = 'bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-600 text-white shadow-amber-500/40 border border-amber-300/50';
    else if (value >= 70) colorStyles = 'bg-gradient-to-br from-slate-300 via-slate-400 to-zinc-600 text-white shadow-slate-500/30 border border-slate-200/50';
    else colorStyles = 'bg-gradient-to-br from-amber-700 via-amber-800 to-stone-900 text-amber-100/80 shadow-orange-900/40 border border-amber-600/30';

    return (
        <div className={`${baseStyles} ${sizeStyles[size]} ${colorStyles} ${className}`}>
            {value}
        </div>
    );
};

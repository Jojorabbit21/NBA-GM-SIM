
import React from 'react';

interface OvrBadgeProps {
    value: number;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

export const OvrBadge: React.FC<OvrBadgeProps> = ({ value, size = 'md', className = '' }) => {
    const baseStyles = "flex items-center justify-center font-black shadow-lg text-shadow-ovr transition-all leading-none";
    
    const sizeStyles = {
        sm: "w-6 h-6 text-[10px] rounded",
        md: "w-8 h-8 text-sm rounded-md",
        lg: "w-11 h-11 text-xl rounded-lg",
        xl: "w-16 h-16 text-3xl rounded-xl"
    };

    let colorStyles = "";
    if (value >= 97)      colorStyles = 'bg-gradient-to-br from-white via-amber-200 to-yellow-500 text-yellow-900 shadow-[0_0_20px_rgba(253,224,71,0.8),0_0_40px_rgba(253,224,71,0.4)] border border-white/70 ring-1 ring-yellow-300/60';
    else if (value >= 94)  colorStyles = 'bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 text-white shadow-[0_0_14px_rgba(251,191,36,0.7)] border border-amber-200/50';
    else if (value >= 91)  colorStyles = 'bg-gradient-to-br from-orange-400 via-red-500 to-rose-600 text-white shadow-[0_0_12px_rgba(249,115,22,0.5)] border border-orange-400/50';
    else if (value >= 88)  colorStyles = 'bg-gradient-to-br from-violet-400 via-purple-600 to-fuchsia-700 text-white shadow-[0_0_10px_rgba(139,92,246,0.5)] border border-violet-400/40';
    else if (value >= 85)  colorStyles = 'bg-gradient-to-br from-cyan-400 via-cyan-600 to-sky-700 text-white shadow-[0_0_10px_rgba(34,211,238,0.4)] border border-cyan-400/40';
    else if (value >= 82)  colorStyles = 'bg-gradient-to-br from-teal-400 via-teal-600 to-emerald-800 text-white shadow-teal-500/30 border border-teal-400/40';
    else if (value >= 79)  colorStyles = 'bg-gradient-to-br from-indigo-400 via-indigo-600 to-blue-800 text-white shadow-indigo-500/30 border border-indigo-400/30';
    else if (value >= 76)  colorStyles = 'bg-gradient-to-br from-slate-400 via-slate-500 to-slate-700 text-white shadow-slate-600/20 border border-slate-400/30';
    else if (value >= 73)  colorStyles = 'bg-gradient-to-br from-stone-400 via-stone-600 to-zinc-700 text-stone-100 shadow-stone-700/20 border border-stone-400/30';
    else                   colorStyles = 'bg-gradient-to-br from-orange-800 via-stone-800 to-neutral-900 text-orange-200/70 shadow-orange-900/20 border border-orange-800/30';

    return (
        <div className={`${baseStyles} ${sizeStyles[size]} ${colorStyles} ${className}`}>
            {value}
        </div>
    );
};

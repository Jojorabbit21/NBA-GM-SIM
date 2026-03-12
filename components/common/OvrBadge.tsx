
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
    if (value >= 97)      colorStyles = 'bg-gradient-to-br from-fuchsia-200 via-fuchsia-400 to-violet-700 text-white shadow-[0_0_20px_rgba(192,132,252,0.7),0_0_40px_rgba(232,121,249,0.4)] border border-fuchsia-200/70 ring-1 ring-fuchsia-300/60';
    else if (value >= 94)  colorStyles = 'bg-gradient-to-br from-violet-400 via-purple-600 to-purple-900 text-white shadow-[0_0_14px_rgba(139,92,246,0.6)] border border-violet-400/50';
    else if (value >= 91)  colorStyles = 'bg-gradient-to-br from-fuchsia-400 via-fuchsia-600 to-fuchsia-800 text-white shadow-[0_0_10px_rgba(232,121,249,0.5)] border border-fuchsia-400/40';
    else if (value >= 88)  colorStyles = 'bg-gradient-to-br from-pink-400 via-pink-600 to-pink-800 text-white shadow-[0_0_10px_rgba(244,114,182,0.4)] border border-pink-400/40';
    else if (value >= 85)  colorStyles = 'bg-gradient-to-br from-rose-400 via-rose-600 to-rose-800 text-white shadow-rose-500/30 border border-rose-400/40';
    else if (value >= 82)  colorStyles = 'bg-gradient-to-br from-red-400 via-red-600 to-red-800 text-white shadow-red-500/30 border border-red-400/40';
    else if (value >= 79)  colorStyles = 'bg-gradient-to-br from-orange-400 via-orange-600 to-orange-800 text-white shadow-orange-600/30 border border-orange-400/30';
    else if (value >= 76)  colorStyles = 'bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-900 text-white shadow-amber-700/20 border border-amber-400/30';
    else if (value >= 73)  colorStyles = 'bg-gradient-to-br from-stone-400 via-stone-600 to-zinc-700 text-stone-100 shadow-stone-700/20 border border-stone-400/30';
    else                   colorStyles = 'bg-gradient-to-br from-stone-500 via-stone-600 to-stone-700 text-white shadow-stone-700/20 border border-stone-400/30';

    return (
        <div className={`${baseStyles} ${sizeStyles[size]} ${colorStyles} ${className}`}>
            {value}
        </div>
    );
};

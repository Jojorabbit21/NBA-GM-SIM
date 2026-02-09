
import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'brand';
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    isLoading?: boolean;
    loadingText?: string;
    icon?: React.ReactNode;
    fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    loadingText,
    icon,
    fullWidth = false,
    className = '',
    disabled,
    ...props
}) => {
    // Base Styles
    const baseStyles = "inline-flex items-center justify-center font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 rounded-2xl";

    // Size Styles
    const sizeStyles = {
        xs: "px-3 py-1.5 text-[10px] gap-1.5",
        sm: "px-4 py-2 text-xs gap-2",
        md: "px-6 py-3 text-xs gap-2.5",
        lg: "px-8 py-4 text-sm gap-3",
        xl: "px-10 py-5 text-base gap-4"
    };

    // Variant Styles
    const variantStyles = {
        primary: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30 ring-1 ring-indigo-500/50",
        secondary: "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700",
        danger: "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30",
        ghost: "bg-transparent hover:bg-slate-800/50 text-slate-400 hover:text-white",
        outline: "bg-transparent border-2 border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white",
        brand: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
    };

    const widthClass = fullWidth ? "w-full" : "";

    return (
        <button
            className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${widthClass} ${className}`}
            disabled={isLoading || disabled}
            {...props}
        >
            {isLoading ? (
                <>
                    <Loader2 className={`animate-spin ${size === 'xs' || size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'}`} />
                    {loadingText || children}
                </>
            ) : (
                <>
                    {icon}
                    {children}
                </>
            )}
        </button>
    );
};

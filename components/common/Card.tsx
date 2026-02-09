
import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    variant?: 'default' | 'glass' | 'outline' | 'flat';
    padding?: 'none' | 'sm' | 'md' | 'lg';
    onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ 
    children, 
    className = '', 
    variant = 'default',
    padding = 'md',
    onClick
}) => {
    const baseStyles = "rounded-3xl overflow-hidden transition-all";
    
    const variants = {
        default: "bg-slate-900 border border-slate-800 shadow-xl",
        glass: "bg-slate-900/80 border border-slate-800/50 backdrop-blur-sm shadow-2xl",
        outline: "bg-transparent border border-slate-800",
        flat: "bg-slate-950/50 border border-slate-800/50"
    };

    const paddings = {
        none: "",
        sm: "p-4",
        md: "p-6",
        lg: "p-8"
    };

    const clickableStyles = onClick ? "cursor-pointer hover:border-slate-600 active:scale-[0.99]" : "";

    return (
        <div 
            className={`${baseStyles} ${variants[variant]} ${paddings[padding]} ${clickableStyles} ${className}`}
            onClick={onClick}
        >
            {children}
        </div>
    );
};

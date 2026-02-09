
import React from 'react';

interface PageHeaderProps {
    title: React.ReactNode;
    description?: string;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, icon, actions, className = '' }) => {
    return (
        <div className={`flex flex-col md:flex-row justify-between items-center gap-6 border-b border-slate-800 pb-6 flex-shrink-0 relative z-[70] ${className}`}>
            <div className="flex-1">
                <div className="flex items-center gap-4">
                    {icon && (
                        <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 shadow-sm text-indigo-500">
                            {icon}
                        </div>
                    )}
                    <div>
                        <h2 className="text-4xl lg:text-5xl font-black ko-tight text-slate-100 uppercase tracking-tight leading-none">
                            {title}
                        </h2>
                        {description && (
                            <p className="text-sm font-bold text-slate-500 mt-1.5 ml-1">
                                {description}
                            </p>
                        )}
                    </div>
                </div>
            </div>
            
            {actions && (
                <div className="flex items-center gap-3">
                    {actions}
                </div>
            )}
        </div>
    );
};

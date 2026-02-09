
import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { OvrBadge } from './OvrBadge';

// --- Types ---
export type CellVariant = 'text' | 'player' | 'stat' | 'attribute' | 'ovr' | 'rank' | 'badge';

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
    children: React.ReactNode;
    className?: string;
}

interface TableHeadProps extends React.HTMLAttributes<HTMLTableSectionElement> {
    children: React.ReactNode;
    sticky?: boolean;
    className?: string;
}

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
    children: React.ReactNode;
}

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
}

interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
    children: React.ReactNode;
    align?: 'left' | 'center' | 'right';
    width?: string;
    sortable?: boolean;
    sortDirection?: 'asc' | 'desc' | null;
    onSort?: () => void;
    className?: string;
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
    children?: React.ReactNode;
    value?: any; // For smart rendering
    variant?: CellVariant;
    align?: 'left' | 'center' | 'right';
    className?: string;
    // Variant specific props
    subText?: string;
    image?: string;
    onClick?: () => void;
    colorScale?: boolean; // For attributes (70/80/90 colors)
}

// --- Helper for Attribute Colors ---
const getAttrColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

// --- Components ---

export const Table = ({ children, className = '', ...props }: TableProps) => (
    <div className={`w-full overflow-x-auto custom-scrollbar ${className}`}>
        <table className="w-full text-left border-collapse table-auto" {...props}>
            {children}
        </table>
    </div>
);

export const TableHead = ({ children, sticky = true, className = '', ...props }: TableHeadProps) => (
    <thead className={`${sticky ? 'sticky top-0 z-20' : ''} bg-slate-950 border-b border-slate-800 ${className}`} {...props}>
        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
            {children}
        </tr>
    </thead>
);

export const TableBody = ({ children, ...props }: TableBodyProps) => (
    <tbody className="divide-y divide-slate-800/50" {...props}>
        {children}
    </tbody>
);

export const TableRow = ({ children, className = '', onClick, ...props }: TableRowProps) => (
    <tr 
        onClick={onClick}
        className={`transition-colors hover:bg-slate-900/60 ${onClick ? 'cursor-pointer group' : ''} ${className}`}
        {...props}
    >
        {children}
    </tr>
);

export const TableHeaderCell = ({ 
    children, 
    align = 'center', 
    width, 
    sortable = false, 
    sortDirection = null, 
    onSort,
    className = '',
    ...props
}: TableHeaderCellProps) => {
    const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
    const cursorClass = sortable ? 'cursor-pointer hover:text-white select-none' : '';

    return (
        <th 
            className={`py-3 px-2 ${alignClass} ${cursorClass} ${className}`}
            style={{ width }}
            onClick={sortable ? onSort : undefined}
            {...props}
        >
            <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
                <span>{children}</span>
                {sortable && (
                    <span className="text-slate-600">
                        {sortDirection === 'asc' && <ArrowUp size={12} className="text-indigo-400" strokeWidth={3} />}
                        {sortDirection === 'desc' && <ArrowDown size={12} className="text-indigo-400" strokeWidth={3} />}
                        {!sortDirection && <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}
                    </span>
                )}
            </div>
        </th>
    );
};

export const TableCell = ({ 
    children, 
    value, 
    variant = 'text', 
    align, 
    className = '',
    subText,
    image,
    onClick,
    colorScale = false,
    ...props
}: TableCellProps) => {
    
    // Default Alignments based on variant
    const getAlign = () => {
        if (align) return align;
        if (variant === 'player') return 'left';
        if (variant === 'stat') return 'right';
        if (variant === 'attribute') return 'center';
        if (variant === 'ovr') return 'center';
        return 'left';
    };
    
    const finalAlign = getAlign();
    const alignClass = finalAlign === 'left' ? 'text-left' : finalAlign === 'right' ? 'text-right' : 'text-center';

    const renderContent = () => {
        if (children) return children;

        switch (variant) {
            case 'player':
                return (
                    <div className="flex items-center gap-3">
                        {/* {image && <img src={image} className="w-8 h-8 rounded-full object-cover bg-slate-800" alt="" />} */}
                        <div className="flex flex-col min-w-0">
                            <span 
                                className={`text-xs font-bold text-slate-200 truncate ${onClick ? 'group-hover:text-indigo-400 group-hover:underline cursor-pointer' : ''}`}
                                onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
                            >
                                {value}
                            </span>
                            {subText && <span className="text-[10px] font-bold text-slate-500">{subText}</span>}
                        </div>
                    </div>
                );
            case 'stat':
                return (
                    <span className="font-mono font-bold text-xs text-slate-300 tabular-nums">
                        {value}
                    </span>
                );
            case 'attribute':
                const numVal = Number(value);
                const colorClass = colorScale ? getAttrColor(numVal) : 'text-slate-400';
                return (
                    <span className={`font-mono font-black text-xs tabular-nums ${colorClass}`}>
                        {value}
                    </span>
                );
            case 'ovr':
                return <OvrBadge value={Number(value)} size="sm" />;
            case 'badge':
                return (
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${className}`}>
                        {value}
                    </span>
                );
            default:
                return <span className="text-sm font-medium text-slate-300">{value}</span>;
        }
    };

    return (
        <td className={`py-2 px-2 ${alignClass} ${className}`} {...props}>
            {renderContent()}
        </td>
    );
};

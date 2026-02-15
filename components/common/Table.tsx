import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { OvrBadge } from './OvrBadge';

// --- Types ---
export type CellVariant = 'text' | 'player' | 'stat' | 'attribute' | 'ovr' | 'rank' | 'badge';

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
    children?: React.ReactNode;
    className?: string;
    fullHeight?: boolean; 
    style?: React.CSSProperties;
}

interface TableHeadProps extends React.HTMLAttributes<HTMLTableSectionElement> {
    children?: React.ReactNode;
    className?: string;
    noRow?: boolean; 
}

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
    children?: React.ReactNode;
}

interface TableFootProps extends React.HTMLAttributes<HTMLTableSectionElement> {
    children?: React.ReactNode;
    className?: string;
}

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
    children?: React.ReactNode;
    className?: string;
    onClick?: () => void;
}

interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
    children?: React.ReactNode;
    align?: 'left' | 'center' | 'right';
    width?: string | number;
    sortable?: boolean;
    sortDirection?: 'asc' | 'desc' | null;
    onSort?: () => void;
    className?: string;
    stickyLeft?: boolean;
    style?: React.CSSProperties;
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
    children?: React.ReactNode;
    value?: any; 
    variant?: CellVariant;
    align?: 'left' | 'center' | 'right';
    className?: string;
    subText?: string;
    image?: string;
    onClick?: () => void;
    colorScale?: boolean; 
    stickyLeft?: boolean;
    style?: React.CSSProperties;
}

const getAttrColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

export const Table = ({ children, className = '', fullHeight = true, style, ...props }: TableProps) => (
    <div className={`w-full overflow-auto custom-scrollbar relative bg-slate-900 border border-slate-800 rounded-xl shadow-lg ${fullHeight ? 'h-full' : ''} ${className}`} style={style}>
        <table className="w-full text-left border-separate border-spacing-0" {...props}>
            {children}
        </table>
    </div>
);

export const TableHead = ({ children, className = '', noRow = false, ...props }: TableHeadProps) => (
    <thead className={`bg-slate-950 sticky top-0 z-40 border-b border-slate-800 shadow-sm ${className}`} {...props}>
        {noRow ? children : (
            <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-10">
                {children}
            </tr>
        )}
    </thead>
);

export const TableBody = ({ children, ...props }: TableBodyProps) => (
    <tbody className="bg-slate-900" {...props}>
        {children}
    </tbody>
);

export const TableFoot = ({ children, className = '', ...props }: TableFootProps) => (
    <tfoot className={`bg-slate-950 border-t border-slate-700 ${className}`} {...props}>
        {children}
    </tfoot>
);

export const TableRow = ({ children, className = '', onClick, ...props }: TableRowProps) => (
    <tr 
        onClick={onClick}
        className={`transition-colors hover:bg-white/5 ${onClick ? 'cursor-pointer group' : ''} ${className}`}
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
    stickyLeft = false,
    style,
    ...props
}: TableHeaderCellProps) => {
    const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
    const cursorClass = sortable ? 'cursor-pointer hover:text-white select-none' : '';
    const stickyClass = stickyLeft ? 'sticky left-0 z-50 bg-slate-950' : '';
    const cellStyle = { ...style, width: width, minWidth: width };

    return (
        <th 
            className={`py-3 px-1.5 whitespace-nowrap border-b border-slate-800 ${alignClass} ${cursorClass} ${stickyClass} ${className}`}
            style={cellStyle}
            onClick={sortable ? onSort : undefined}
            {...props}
        >
            <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
                <span className="truncate min-w-0">{children}</span>
                
                {sortable && sortDirection && (
                    <span className="flex-shrink-0">
                        {sortDirection === 'asc' && <ArrowUp size={10} className="text-indigo-400" strokeWidth={3} />}
                        {sortDirection === 'desc' && <ArrowDown size={10} className="text-indigo-400" strokeWidth={3} />}
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
    stickyLeft = false,
    style,
    ...props
}: TableCellProps) => {
    
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
    const stickyClass = stickyLeft ? 'sticky left-0 z-30' : '';
    
    const renderContent = () => {
        if (children !== undefined && children !== null) return children;

        switch (variant) {
            case 'player':
                return (
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col min-w-0">
                            <span 
                                className={`font-bold text-slate-200 truncate ${onClick ? 'group-hover:text-indigo-400 group-hover:underline cursor-pointer' : ''}`}
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
                    <span className="font-mono font-bold text-slate-300 tabular-nums">
                        {value}
                    </span>
                );
            case 'attribute':
                const numVal = Number(value);
                const colorClass = colorScale ? getAttrColor(numVal) : 'text-slate-400';
                return (
                    <span className={`font-mono font-black tabular-nums ${colorClass}`}>
                        {value}
                    </span>
                );
            case 'ovr':
                return <OvrBadge value={Number(value)} size="sm" className="shadow-none" />;
            case 'badge':
                return (
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${className}`}>
                        {value}
                    </span>
                );
            default:
                return <span className="font-medium text-slate-300">{value}</span>;
        }
    };

    return (
        <td className={`py-2 px-3 whitespace-nowrap border-b border-slate-800/50 ${alignClass} ${stickyClass} ${className}`} style={style} {...props}>
            {renderContent()}
        </td>
    );
};
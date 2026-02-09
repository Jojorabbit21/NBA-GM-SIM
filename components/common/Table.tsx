
import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { OvrBadge } from './OvrBadge';

// --- Types ---
export type CellVariant = 'text' | 'player' | 'stat' | 'attribute' | 'ovr' | 'rank' | 'badge';

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
    children: React.ReactNode;
    className?: string;
    // 만약 테이블이 부모 높이를 꽉 채우지 않고 내용물만큼만 커져야 한다면 false로 설정
    fullHeight?: boolean; 
}

interface TableHeadProps extends React.HTMLAttributes<HTMLTableSectionElement> {
    children: React.ReactNode;
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
    // 첫 번째 컬럼 고정 등을 위해 필요시 사용
    stickyLeft?: boolean;
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
    stickyLeft?: boolean;
}

// --- Helper for Attribute Colors ---
const getAttrColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

// --- Components ---

// [Architectural Fix] Table Wrapper is now the definitive scroll container.
export const Table = ({ children, className = '', fullHeight = true, ...props }: TableProps) => (
    <div className={`w-full overflow-auto custom-scrollbar relative bg-slate-900 border border-slate-800 rounded-xl shadow-lg ${fullHeight ? 'h-full' : ''} ${className}`}>
        <table className="w-full text-left border-collapse border-spacing-0" {...props}>
            {children}
        </table>
    </div>
);

// [Architectural Fix] Header is sticky by default within the wrapper.
export const TableHead = ({ children, className = '', ...props }: TableHeadProps) => (
    <thead className={`bg-slate-950/95 backdrop-blur-sm sticky top-0 z-40 border-b border-slate-800 shadow-sm ${className}`} {...props}>
        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-10">
            {children}
        </tr>
    </thead>
);

export const TableBody = ({ children, ...props }: TableBodyProps) => (
    <tbody className="divide-y divide-slate-800/50 bg-slate-900/30" {...props}>
        {children}
    </tbody>
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
    ...props
}: TableHeaderCellProps) => {
    const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
    const cursorClass = sortable ? 'cursor-pointer hover:text-white select-none' : '';
    // [Architectural Fix] Explicit background color to prevent transparency issues when scrolling
    const stickyClass = stickyLeft ? 'sticky left-0 z-50 bg-slate-950 border-r border-slate-800' : '';

    return (
        <th 
            className={`py-3 px-3 whitespace-nowrap bg-slate-950 ${alignClass} ${cursorClass} ${stickyClass} ${className}`}
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
    stickyLeft = false,
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
    // [Architectural Fix] Explicit background needed for sticky columns
    const stickyClass = stickyLeft ? 'sticky left-0 z-30 bg-slate-900 border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.3)]' : '';

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
        <td className={`py-2 px-3 whitespace-nowrap ${alignClass} ${stickyClass} ${className}`} {...props}>
            {renderContent()}
        </td>
    );
};

import React, { createContext, useContext, useMemo } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { OvrBadge } from './OvrBadge';
// [2026-10-19] colorScale 능력치 셀도 공용 15단계 스케일 사용(예전 자체 4단계: 90 fuchsia / 80 emerald / 70 amber / 그 외 slate-500)
import { getAttrColor } from '../../utils/attrRatingColor';

// --- Types ---
export type CellVariant = 'text' | 'player' | 'stat' | 'attribute' | 'ovr' | 'rank' | 'badge';

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
    children?: React.ReactNode;
    className?: string;
    fullHeight?: boolean;
    style?: React.CSSProperties;
    tableStyle?: React.CSSProperties;
    /**
     * [2026-10-12] 열 세로 구분선을 Table 단위로 켜고 끈다(기본 true). 켜지면 모든
     * TableHeaderCell/TableCell(sticky 포함)에 `border-r`이 붙고 마지막 열만 제외된다.
     * 셀마다 border-r을 직접 붙이던 방식은 열마다 빠지거나 겹쳐서(전수 감사 0-3) 폐기.
     */
    dividers?: boolean;
    /** 세로 구분선 색(기본 TABLE_LINE_DEFAULTS.vertical). 허용값만 — Tailwind JIT가 완전한 클래스명을 봐야 하므로 동적 문자열 불가. */
    verticalLine?: TableLineTone;
    /** 가로 구분선 색(행 하단·헤더 하단·푸터 상단·외곽, 기본 TABLE_LINE_DEFAULTS.horizontal). */
    horizontalLine?: TableLineTone;
    /**
     * [2026-10-13] card(기본) = 지금까지의 모양(둥근 박스·그림자·sticky 헤더·slate-950 헤더 배경).
     * bare = 레터/문서 안에 끼워 넣는 표 — 박스·그림자·sticky 없이 `overflow-x-auto`만, 헤더 배경 slate-800/60, 본문 배경 투명.
     * 뉴스피드 레터 표 17개가 "카드형이라 raw <table>로 걷어냈다"던 이탈을 공용으로 되돌리기 위한 변형.
     */
    variant?: 'card' | 'bare' | 'flush';
    /** compact = 헤더 h-8·셀 py-1.5 px-2(레터 표). 기본은 헤더 h-10·셀 py-2 px-3.
     *  phone[2026-10-27] = 폰 표(docs/ui/mobile-design-system.md §9-1): 헤더 h-9·글자 12/700, 셀 px-2 py-1, 행 h-11(44). */
    density?: 'default' | 'compact' | 'phone';
    /**
     * [2026-10-27] 스크롤 상자. self(기본) = 지금까지처럼 Table 래퍼가 overflow-auto. parent = 래퍼에 overflow를 두지 않고
     * 바깥 스크롤 영역(폰 탭 콘텐츠처럼 세로+가로를 한 상자가 맡는 곳)을 sticky 기준으로 쓴다 — 표 안에 가로 스크롤 상자가 또 있으면
     * sticky bottom(팀 평균 행)이 그 상자 끝을 기준으로 걸려 떠 보인다.
     */
    scroll?: 'self' | 'parent';
}

/**
 * [2026-10-13] sticky 왼쪽 고정 열. `true`는 예전 호환(left-0, 배경 없음 — GameOnOffTab·LeaderboardTable).
 * 숫자는 px 오프셋이고, 이때 Table이 (1) position:sticky + left, (2) 섹션별 불투명 배경
 * (thead/tfoot = slate-950, tbody = slate-900 + 행 hover 시 slate-800), (3) z-index(헤더 50 / 바디 30)를
 * 전부 붙인다. 로스터 4개 표가 `getStickyStyle` 사본으로 하던 일을 흡수한 것(ui-audit/08-roster.md 후보 7).
 * 열 너비 고정이 필요하면 `width`를 함께 넘긴다(width/minWidth/maxWidth 동시 적용).
 */
export type StickyLeft = boolean | number;
type TableSection = 'head' | 'body' | 'foot';
const TableSectionContext = createContext<TableSection>('body');
const STICKY_BG: Record<TableSection, string> = {
    head: 'bg-slate-950',
    body: 'bg-slate-900 group-hover:bg-slate-800',
    foot: 'bg-slate-950',
};
// bare 표는 본문/푸터 배경이 투명(레터/문서 흐름)이라 섹션 배경을 단정할 수 없어 위치·z-index만 붙인다 — 필요하면 호출부가 className으로 bg 지정.
// 헤더만은 [2026-10-14]부터 불투명 bg-slate-800이라 sticky 헤더 셀에도 같은 색을 자동으로 붙인다(가로 스크롤 시 뒤 글자 비침 방지).
const BARE_STICKY_BG: Record<TableSection, string> = { head: 'bg-slate-800', body: '', foot: '' };
const stickyParts = (stickyLeft: StickyLeft | undefined, section: TableSection, bare: boolean, zClass: string, legacyClass: string) => {
    if (typeof stickyLeft === 'number') {
        return { cls: `sticky ${zClass} ${bare ? BARE_STICKY_BG[section] : STICKY_BG[section]}`, style: { left: stickyLeft } as React.CSSProperties };
    }
    return { cls: stickyLeft ? legacyClass : '', style: undefined };
};
const widthStyle = (width: string | number | undefined): React.CSSProperties | undefined =>
    width === undefined ? undefined : { width, minWidth: width, maxWidth: width };

/** 표 선 색 허용값. 'none'은 선 없음. 새 값을 추가하면 아래 LINE_CLASS 네 맵에도 완전한 클래스명을 같이 넣을 것. */
export type TableLineTone = 'slate-600' | 'slate-700' | 'slate-800' | 'slate-900' | 'none';

/** 앱 전역 기본값 — 2026-10-12 사용자 결정(600 → 700 → 800). 여기 한 곳만 바꾸면 공용 Table을 쓰는 모든 표가 따라간다. */
export const TABLE_LINE_DEFAULTS: { vertical: TableLineTone; horizontal: TableLineTone } = {
    vertical: 'slate-800',
    horizontal: 'slate-800',
};

// 색 토큰은 Tailwind가 스캔할 수 있게 완전한 클래스명 리터럴로 둔다. 방향(border-r/b/t)은 접두 상수.
const LINE_COLOR: Record<TableLineTone, string> = {
    'slate-600': 'border-slate-600', 'slate-700': 'border-slate-700', 'slate-800': 'border-slate-800', 'slate-900': 'border-slate-900', none: '',
};
const lineClass = (dir: 'border-r' | 'border-b' | 'border-t' | 'border', tone: TableLineTone) =>
    tone === 'none' ? '' : `${dir} ${LINE_COLOR[tone]}`;

interface TableLineContextValue { dividers: boolean; v: TableLineTone; h: TableLineTone; bare: boolean; compact: boolean; phone: boolean }
const TableLineContext = createContext<TableLineContextValue>({ dividers: true, v: TABLE_LINE_DEFAULTS.vertical, h: TABLE_LINE_DEFAULTS.horizontal, bare: false, compact: false, phone: false });
const useTableLines = () => {
    const { dividers, v, h, bare, compact, phone } = useContext(TableLineContext);
    return {
        vClass: dividers && v !== 'none' ? `${lineClass('border-r', v)} last:border-r-0` : '',
        hClass: lineClass('border-b', h),
        tClass: lineClass('border-t', h),
        bare, compact, phone,
    };
};

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
    /** [2026-10-27] 스크롤 상자 하단에 고정(px 또는 CSS 길이). 폰 표 "팀 평균" 행 — 하단 탭 바 위에 걸리도록 `calc(56px + env(safe-area-inset-bottom))`. */
    stickyBottom?: string | number;
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
    stickyLeft?: StickyLeft;
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
    stickyLeft?: StickyLeft;
    /** 열 너비 고정(width/minWidth/maxWidth). sticky 열처럼 폭이 흔들리면 안 되는 셀에서 사용. */
    width?: string | number;
    style?: React.CSSProperties;
}

interface TableGroupHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
    children?: React.ReactNode;
    colSpan?: number;
    /** 첫 그룹("선수 정보")처럼 가로 스크롤에도 고정돼야 하면 px 오프셋(보통 0) */
    stickyLeft?: number;
    className?: string;
}

export const Table = ({
    children, className = '', fullHeight, style, tableStyle,
    dividers = true, verticalLine = TABLE_LINE_DEFAULTS.vertical, horizontalLine = TABLE_LINE_DEFAULTS.horizontal,
    variant = 'card', density = 'default', scroll = 'self',
    ...props
}: TableProps) => {
    const bare = variant === 'bare';
    const compact = density === 'compact';
    const phone = density === 'phone';
    // 컨텍스트 값을 고정해 Table 리렌더 때 셀 전체가 불필요하게 다시 그려지지 않게 한다.
    const lines = useMemo(() => ({ dividers, v: verticalLine, h: horizontalLine, bare, compact, phone }), [dividers, verticalLine, horizontalLine, bare, compact, phone]);
    const fillHeight = fullHeight ?? !bare; // bare는 내용 높이만(레터 흐름 안), card는 기존처럼 h-full
    // flush[2026-10-13] = 탭 콘텐츠 영역을 꽉 채우는 풀블리드 표(로스터 탭 4개). 둥근 모서리·좌우/상단 외곽선 없이
    // 아래 외곽선·그림자만 — 예전엔 card에 `!rounded-none !border-x-0 !border-t-0 !bg-slate-950`를 덧씌워 만들던 모양.
    const wrapClass = scroll === 'parent'
        ? `w-full relative ${className}`   // 바깥 스크롤 상자 사용 — 표 폭은 w-max 테이블이 결정
        : bare
        ? `w-full overflow-x-auto relative ${className}`
        : variant === 'flush'
            ? `w-full overflow-auto custom-scrollbar relative bg-slate-950 ${lineClass('border-b', horizontalLine)} shadow-lg ${fillHeight ? 'h-full' : ''} ${className}`
            : `w-full overflow-auto custom-scrollbar relative bg-slate-900 ${lineClass('border', horizontalLine)} rounded-xl shadow-lg ${fillHeight ? 'h-full' : ''} ${className}`;
    return (
        <div className={wrapClass} style={style}>
            <table className={`${scroll === 'parent' ? 'w-max min-w-full' : 'w-full'} text-left border-separate border-spacing-0`} style={tableStyle} {...props}>
                <TableLineContext.Provider value={lines}>
                    {children}
                </TableLineContext.Provider>
            </table>
        </div>
    );
};

export const TableHead = ({ children, className = '', noRow = false, ...props }: TableHeadProps) => {
    const { hClass, bare, compact, phone } = useTableLines();
    // [2026-10-14] bare 헤더 bg-slate-800/60(반투명) → bg-slate-800(불투명). 반투명은 호스트 배경을 모르는 표를 한 값으로
    // 처리하려던 편의였지만, sticky 셀을 불투명으로 맞출 수 없고 화면마다 결과 색이 달라져 폐기(사용자 결정). 푸터 틴트는 유지.
    const headClass = bare ? `bg-slate-800 ${hClass}` : `bg-slate-950 sticky top-0 z-40 ${hClass} shadow-sm`;
    return (
    <thead className={`${headClass} ${className}`} {...props}>
        <TableSectionContext.Provider value="head">
            {noRow ? children : (
                <tr className={`text-slate-400 font-bold ${phone ? 'h-9 text-xs' : compact ? 'h-8 text-sm' : 'h-10 text-sm'}`}>
                    {children}
                </tr>
            )}
        </TableSectionContext.Provider>
    </thead>
    );
};

/** 그룹 헤더 행(`<tr className="h-10">` 안)에 들어가는 colSpan 셀 — "선수 정보"·"시즌별 페이롤"·존별 스탯 그룹 등.
 *  children 없이 쓰면 빈 스페이서(아래 외곽선만). 글자는 그룹 헤더 톤(slate-500, ui-typography.md 위계). */
export const TableGroupHeaderCell = ({ children, colSpan, stickyLeft, className = '', ...props }: TableGroupHeaderCellProps) => {
    const { vClass, hClass, phone } = useTableLines();
    const sticky = stickyLeft !== undefined;
    // 빈 스페이서(라벨 없는 열 위)는 세로선을 긋지 않는다 — 그룹 라벨이 있는 칸의 오른쪽 선만 그룹 경계로 보이게.
    const vertical = children != null ? vClass : '';
    return (
        <th
            colSpan={colSpan}
            className={`bg-slate-950 px-2 align-middle ${hClass} ${vertical} ${sticky ? 'sticky z-50' : ''} ${className}`}
            style={sticky ? { left: stickyLeft } : undefined}
            {...props}
        >
            {children != null && (
                <div className="h-full flex items-center justify-center">
                    <span className={`${phone ? 'text-xs' : 'text-sm'} font-bold text-slate-500 ko-normal`}>{children}</span>
                </div>
            )}
        </th>
    );
};

export const TableBody = ({ children, ...props }: TableBodyProps) => {
    const { bare } = useTableLines();
    return (
        <tbody className={bare ? '' : 'bg-slate-900'} {...props}>
            <TableSectionContext.Provider value="body">{children}</TableSectionContext.Provider>
        </tbody>
    );
};

export const TableFoot = ({ children, className = '', stickyBottom, style, ...props }: TableFootProps) => {
    const { tClass, bare } = useTableLines();
    const stickyCls = stickyBottom !== undefined ? 'sticky z-40' : '';
    const footStyle = stickyBottom !== undefined ? { ...style, bottom: stickyBottom } : style;
    return (
        <tfoot className={`${bare ? 'bg-slate-800/40' : 'bg-slate-950'} ${tClass} ${stickyCls} ${className}`} style={footStyle} {...props}>
            <TableSectionContext.Provider value="foot">{children}</TableSectionContext.Provider>
        </tfoot>
    );
};

// `group`은 항상 붙인다 — sticky 셀(stickyLeft 숫자)이 행 hover를 `group-hover:`로 따라가기 위함. 스타일 자체는 없음.
export const TableRow = ({ children, className = '', onClick, ...props }: TableRowProps) => {
    const { phone } = useTableLines();
    return (
    <tr
        onClick={onClick}
        className={`hover:bg-white/5 group ${phone ? 'h-11 active:bg-white/5' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}
        {...props}
    >
        {children}
    </tr>
    );
};

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
    const section = useContext(TableSectionContext);
    const { vClass, hClass, compact, bare, phone } = useTableLines();
    // [2026-10-27] z-index는 섹션 기준 — thead 안에서는 50(헤더 z-40 위), tbody 안(그룹 머리 행의 sticky 라벨 셀)에서는 30(TableCell과 동일).
    // 본문 헤더 셀이 50이면 세로 스크롤 때 sticky top 헤더(z-40)를 덮고 지나간다(폰 순위표 컨퍼런스 그룹 머리에서 발견).
    const sticky = stickyParts(stickyLeft, section, bare, section === 'head' ? 'z-50' : 'z-30', 'sticky left-0 z-50 bg-slate-950');
    // 예전 호환: width만 넘기면 width/minWidth(maxWidth 없음). sticky 숫자 열은 폭이 흔들리면 안 되므로 maxWidth까지.
    const cellStyle = { ...style, ...(typeof stickyLeft === 'number' ? widthStyle(width) : { width, minWidth: width }), ...sticky.style };

    return (
        <th
            className={`${phone ? 'py-0 px-2' : compact ? 'py-1.5 px-2' : 'py-3 px-1.5'} whitespace-nowrap ${hClass} ${vClass} ${alignClass} ${cursorClass} ${sticky.cls} ${className}`}
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
    width,
    style,
    ...props
}: TableCellProps) => {
    
    const getAlign = () => {
        if (align) return align;
        if (variant === 'player') return 'left';
        if (variant === 'stat') return 'right';
        if (variant === 'attribute') return 'center';
        if (variant === 'ovr') return 'center';
        return 'center';
    };
    
    const finalAlign = getAlign();
    const alignClass = finalAlign === 'left' ? 'text-left' : finalAlign === 'right' ? 'text-right' : 'text-center';
    const section = useContext(TableSectionContext);
    const { vClass, hClass, compact, bare, phone } = useTableLines();
    const sticky = stickyParts(stickyLeft, section, bare, 'z-30', 'sticky left-0 z-30');
    const cellStyle = (width !== undefined || sticky.style) ? { ...style, ...widthStyle(width), ...sticky.style } : style;
    
    const renderContent = () => {
        if (children !== undefined && children !== null) return children;

        switch (variant) {
            case 'player':
                return (
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col min-w-0">
                            <span 
                                className={`font-semibold text-slate-200 truncate ${onClick ? 'group-hover:text-indigo-400 group-hover:underline cursor-pointer' : ''}`}
                                onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
                            >
                                {value}
                            </span>
                            {subText && <span className="text-xs font-medium text-slate-500">{subText}</span>}
                        </div>
                    </div>
                );
            case 'stat':
                return (
                    <span className="font-semibold text-slate-200 tabular-nums">
                        {value}
                    </span>
                );
            case 'attribute':
                const numVal = Number(value);
                const colorClass = colorScale ? getAttrColor(numVal) : 'text-slate-400';
                return (
                    <span className={`font-semibold tabular-nums ${colorClass}`}>
                        {value}
                    </span>
                );
            case 'ovr':
                return <OvrBadge value={Number(value)} size="sm" className="shadow-none" />;
            case 'badge':
                return (
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${className}`}>
                        {value}
                    </span>
                );
            default:
                return <span className="font-semibold text-slate-200">{value}</span>;
        }
    };

    return (
        <td className={`${phone ? 'py-1 px-2' : compact ? 'py-1.5 px-2' : 'py-2 px-3'} whitespace-nowrap ${hClass} ${vClass} ${alignClass} ${sticky.cls} ${className}`} style={cellStyle} {...props}>
            {renderContent()}
        </td>
    );
};
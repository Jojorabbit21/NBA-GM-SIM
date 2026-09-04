import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Minus } from 'lucide-react';
import type { InjuryHistoryEntry } from '../../types/player';

/** 로스터 등 테이블에서 선수 이름 옆에 붙는 부상/출장정지 상태 배지 — 원 안에 흰 아이콘.
 *  GRADE1~2(경증)는 주황+십자가, GRADE3~5(중증~시즌아웃급)는 빨강+십자가, 출장정지
 *  (Suspension)는 파랑+마이너스(-). 다른 테이블(전술/트레이드 등)에서도 재사용할 공통
 *  에셋이므로 표시 여부/색상 로직만 담당하고, "지금 활성 상태인지" 판정은 호출부
 *  (MultiRosterView.tsx 등)에서 한다. */

const SEVERITY_COLOR: Record<InjuryHistoryEntry['severity'], string> = {
    Grade1: 'bg-orange-500',
    Grade2: 'bg-orange-500',
    Grade3: 'bg-red-500',
    Grade4: 'bg-red-500',
    Grade5: 'bg-red-500',
    Suspension: 'bg-blue-500',
};

/** 배지 배경색과 짝을 이루는 텍스트 색상 — 호버카드 등에서 "부상"/"출장정지" 라벨을
 *  배지와 같은 색으로 맞출 때 재사용(PlayerHoverCard.tsx 참고). */
export const SEVERITY_TEXT_COLOR: Record<InjuryHistoryEntry['severity'], string> = {
    Grade1: 'text-orange-500',
    Grade2: 'text-orange-500',
    Grade3: 'text-red-500',
    Grade4: 'text-red-500',
    Grade5: 'text-red-500',
    Suspension: 'text-blue-500',
};

interface InjuryStatusBadgeProps {
    severity: InjuryHistoryEntry['severity'];
    /** 마우스 오버 시 표시할 텍스트(부상명/복귀일 등) — 없으면 툴팁 생략 */
    title?: string;
    size?: number;
    /** 내부 아이콘(십자가/마이너스) 크기 — 생략 시 size*0.65로 자동 계산 */
    iconSize?: number;
    /** 아이콘 선 두께(lucide strokeWidth) — 기본 3 */
    strokeWidth?: number;
    className?: string;
}

const TOOLTIP_GAP = 6; // 배지 위쪽 여백(px) — 기존 mb-1.5(0.375rem=6px)와 동일

// [2026-09-03] "커스텀 툴팁으로 통일" 요청 이후, 로스터 테이블에서 sticky 컬럼(이름/포지션
// 등, position:sticky + z-index:30 — RosterGrid.tsx의 getStickyStyle)에 툴팁이 가려지는
// 버그 발견. sticky 요소는 그 자체로 독립 stacking context를 만들어서, 그 안에 있는
// 절대위치 자식(툴팁)의 z-index는 "그 sticky 셀 내부"에서만 의미가 있다 — 옆/다른 행의
// sticky 셀(동일 z-index:30)이 툴팁 위를 덮어버림. CSS group-hover로는 테이블의 stacking
// 구조를 벗어날 방법이 없어, 툴팁을 document.body에 포탈로 렌더하는 방식으로 전환했다.
// position:fixed + getBoundingClientRect()의 뷰포트 좌표를 그대로 쓰므로 스크롤 컨테이너/
// sticky 컬럼과 무관하게 항상 배지 바로 위에 그려진다. 호버 시에만(mouseenter 1회) 좌표를
// 계산하고 그 결과로만 포탈을 마운트하므로 렌더/스크롤마다 도는 비용은 없다.
export const InjuryStatusBadge: React.FC<InjuryStatusBadgeProps> = ({
    severity,
    title,
    size = 14,
    iconSize,
    strokeWidth = 3,
    className = '',
}) => {
    const Icon = severity === 'Suspension' ? Minus : Plus;
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

    const showTooltip = () => {
        if (!title || !anchorRef.current) return;
        const rect = anchorRef.current.getBoundingClientRect();
        setTooltipPos({ top: rect.top - TOOLTIP_GAP, left: rect.left + rect.width / 2 });
    };
    const hideTooltip = () => setTooltipPos(null);

    return (
        <span
            ref={anchorRef}
            className={`inline-flex items-center justify-center rounded-full shrink-0 ${SEVERITY_COLOR[severity]} ${className}`}
            style={{ width: size, height: size }}
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
        >
            <Icon size={iconSize ?? Math.round(size * 0.65)} strokeWidth={strokeWidth} className="text-white" />
            {tooltipPos && title && createPortal(
                <span
                    className="pointer-events-none fixed -translate-x-1/2 -translate-y-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-xs font-normal text-slate-200 whitespace-nowrap shadow-xl z-[9999]"
                    style={{ top: tooltipPos.top, left: tooltipPos.left }}
                >
                    {title}
                </span>,
                document.body,
            )}
        </span>
    );
};

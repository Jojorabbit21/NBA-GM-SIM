import React from 'react';
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

export const InjuryStatusBadge: React.FC<InjuryStatusBadgeProps> = ({
    severity,
    title,
    size = 14,
    iconSize,
    strokeWidth = 3,
    className = '',
}) => {
    const Icon = severity === 'Suspension' ? Minus : Plus;
    return (
        <span
            title={title}
            className={`inline-flex items-center justify-center rounded-full shrink-0 ${SEVERITY_COLOR[severity]} ${className}`}
            style={{ width: size, height: size }}
        >
            <Icon size={iconSize ?? Math.round(size * 0.65)} strokeWidth={strokeWidth} className="text-white" />
        </span>
    );
};

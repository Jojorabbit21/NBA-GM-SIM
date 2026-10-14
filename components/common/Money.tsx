import React from 'react';
import { formatMoney, formatMoneyFull } from '../../utils/formatMoney';

export type MoneyFormat = 'short' | 'full';

interface MoneyProps {
    value: number;
    /** 'short' = $51.4M(기본, 앱 전역 기본 표기) / 'full' = $51,400,000 */
    format?: MoneyFormat;
    /** true면 +/− 부호를 붙이고 방향에 따라 색을 칠한다(0은 중립). */
    signed?: boolean;
    /**
     * signed일 때 "양수가 좋은 방향"인지(기본 true). 캡 여유분·순이익처럼 커질수록 좋은 값은 true,
     * 지출·페이롤 증가처럼 커질수록 나쁜 값은 false. 좋은 방향 = emerald, 나쁜 방향 = red.
     */
    goodWhenPositive?: boolean;
    className?: string;
}

/**
 * 금액 표기 공용 — 2026-10-12 결정(ui-consolidation 0-4):
 *   · 기본 표기는 축약형(`$51.4M`), 표의 금액 열은 우측 정렬 + `tabular-nums` 고정
 *   · 증감은 부호를 붙이고 "내 팀에 좋은 방향 = 초록 / 나쁜 방향 = 빨강" 하나로 통일
 * 글자 크기·굵기·기본 색은 호출부 className이 정한다(이 컴포넌트는 숫자 폭 고정과 부호색만 책임).
 */
export const Money: React.FC<MoneyProps> = ({ value, format = 'short', signed = false, goodWhenPositive = true, className = '' }) => {
    const abs = Math.abs(value);
    const body = format === 'full' ? formatMoneyFull(abs) : formatMoney(abs);
    if (!signed) {
        return <span className={`tabular-nums whitespace-nowrap ${className}`}>{value < 0 ? `-${body}` : body}</span>;
    }
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    const isGood = value === 0 ? null : (value > 0) === goodWhenPositive;
    const tone = isGood === null ? '' : isGood ? 'text-emerald-400' : 'text-red-400';
    return <span className={`tabular-nums whitespace-nowrap ${tone} ${className}`}>{sign}{body}</span>;
};

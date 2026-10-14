
import React from 'react';
import { CountBadge } from './CountBadge';
import { StatusDot } from './StatusDot';
import type { InlineNoticeTone } from './InlineNotice';

interface TabBarProps<T extends string> {
    tabs: {
        id: T;
        label: string;
        badge?: number;
        /** [2026-10-13] 라벨 오른쪽 16px 상태 점(StatusDot sm) — 탭 단위 "항목별 상태"(미저장 등)에만.
         *  액션 실패의 1차 표시로는 쓰지 않는다(그건 탭 바 아래 InlineNotice). */
        dot?: { tone: InlineNoticeTone; label: string };
    }[];
    activeTab: T;
    onTabChange: (tab: T) => void;
    /** 탭 버튼 영역 우측 끝에 추가로 배치할 컨텐츠 (예: 저장 버튼) */
    rightSlot?: React.ReactNode;
    /** 지정 시 팀 테마 색상(헤더와 동일)으로 배경/텍스트를 칠한다 — 미지정이면 기존 slate/indigo 스타일 유지 */
    theme?: { bg: string; text: string; accent: string };
    /** theme 미지정 시 배경색 클래스 오버라이드 (기본값 bg-slate-950) */
    bgClassName?: string;
}

export function TabBar<T extends string>({ tabs, activeTab, onTabChange, rightSlot, theme, bgClassName }: TabBarProps<T>) {
    return (
        <div
            className={`px-8 border-b flex items-center gap-8 h-14 flex-shrink-0 ${theme ? 'border-black/20' : `border-slate-800 ${bgClassName ?? 'bg-slate-950'}`}`}
            style={theme ? { backgroundColor: theme.bg } : undefined}
        >
            {tabs.map(t => {
                const isActive = activeTab === t.id;
                return (
                    <button
                        key={t.id}
                        onClick={() => onTabChange(t.id)}
                        className={`flex items-center transition-all h-full border-b-2 font-black tracking-tight text-sm ko-normal ${
                            theme
                                ? isActive ? '' : 'hover:opacity-100'
                                : isActive ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'
                        }`}
                        style={theme ? {
                            color: theme.text,
                            opacity: isActive ? 1 : 0.6,
                            borderColor: isActive ? theme.accent : 'transparent',
                        } : undefined}
                    >
                        <span className="relative inline-flex items-center">
                            {t.label}
                            {t.dot && <StatusDot size="sm" tone={t.dot.tone} label={t.dot.label} className="ml-1.5" />}
                            {/* 미확인 항목이 있는 탭에 표시 — 사이드바 NavItem과 같은 공용 CountBadge. */}
                            <CountBadge count={t.badge} className="absolute -top-2 -right-3" />
                        </span>
                    </button>
                );
            })}
            {rightSlot && <div className="ml-auto flex items-center gap-3">{rightSlot}</div>}
        </div>
    );
}

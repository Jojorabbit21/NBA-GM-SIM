// PhoneDraftBoardStrip.tsx — 헤더 아래 상시 보드 스트립(접이식). [2026-11-08]
// docs/ui/mobile-design-system.md §9-0-4 "보드 스트립": 토글 바 32("보드" + 요약 + ▾/▴) + 펼침 시 보드 영역 174(DraftBoard phone).
// 수동 토글만(스크롤 자동 접힘 없음), 접힘 상태는 localStorage 기억. 보드 전용 탭은 없다.
import React, { useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const STORAGE_KEY = 'draft.board.expanded';
const BOARD_H = 174;

function readExpanded(): boolean {
    try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; }
}

export const PhoneDraftBoardStrip: React.FC<{ summary: string; children: React.ReactNode }> = ({ summary, children }) => {
    const [expanded, setExpanded] = useState<boolean>(readExpanded);
    const toggle = useCallback(() => {
        setExpanded(prev => {
            const next = !prev;
            try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* 저장 불가 환경은 무시 */ }
            return next;
        });
    }, []);
    return (
        <section aria-label="드래프트 보드" className="shrink-0 bg-slate-950 border-b border-slate-800">
            <button
                type="button"
                onClick={toggle}
                aria-expanded={expanded}
                aria-controls="phone-draft-board"
                className="w-full h-8 pl-4 pr-3 flex items-center justify-between bg-slate-800/30 text-xs font-bold text-slate-400 active:bg-slate-800/50"
            >
                <span>보드 <span className="ml-1 font-medium text-slate-500">{summary}</span></span>
                <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
                <div id="phone-draft-board" className="overflow-hidden px-1.5 pt-1 pb-1.5" style={{ height: BOARD_H }}>
                    <div className="h-full bg-slate-900/60 overflow-hidden">{children}</div>
                </div>
            )}
        </section>
    );
};

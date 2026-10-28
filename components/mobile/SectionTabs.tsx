// SectionTabs.tsx — 폰 "순위" 탭 안의 동위 화면 전환 탭 바 44(리그 순위 ↔ 리더보드). [2026-10-28]
// docs/ui/mobile-design-system.md §9-1-13. 공용 상단 바 바로 아래, 화면 제목 줄을 대신한다. 홈 동/서부·순위표 모드 탭 바와 같은 모양
// (text-sm font-black, 활성 indigo-400 밑줄 2px). 우측 `right` 슬롯 = 화면별 액션(검색·필터·셀렉터), `replace`가 있으면 줄 전체를 그 노드로(검색 활성).
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export type SeasonSectionId = 'standings' | 'leaderboard';

const SECTION_TABS: { id: SeasonSectionId; label: string; path: string }[] = [
    { id: 'standings', label: '리그 순위', path: 'standings' },
    { id: 'leaderboard', label: '리더보드', path: 'leaderboard' },
];

export const SectionTabs: React.FC<{ active: SeasonSectionId; right?: React.ReactNode; replace?: React.ReactNode }> = ({ active, right, replace }) => {
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    return (
        <div role="tablist" aria-label="순위 화면" className="shrink-0 h-11 pl-4 pr-2 flex items-center gap-5 bg-slate-900 border-b border-slate-800">
            {replace ?? (
                <>
                    {SECTION_TABS.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={active === t.id}
                            onClick={() => { if (active !== t.id) navigate(`/multi/leagues/${leagueId}/season/${t.path}`); }}
                            className={`h-full text-sm font-black tracking-tight border-b-2 whitespace-nowrap ${active === t.id ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                    <span className="flex-1" />
                    {right}
                </>
            )}
        </div>
    );
};

// MobileSearchSheet.tsx — 폰 상단 바 검색(H6 변형) 풀스크린 페이지. [2026-10-27 모바일 셸]
// docs/ui/mobile-design-system.md §8-2-1 H6: 제목·액션 자리가 입력 40/16px + "취소"로 교체. 결과는 데스크톱 MultiGlobalSearch와
// 같은 규칙(leagueSearch.ts) — 팀 ≤5 · 선수 ≤20, 그룹 헤더 "팀"/"선수". 행 48, 탭 = 이동 + 닫기. z-modal(500), 탭 바 위.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { calculatePlayerOvr } from '../../utils/constants';
import { searchLeagueEntities, groupLeagueSearchResults, SEARCH_CATEGORY_LABELS, type LeagueSearchResult } from '../dashboard/leagueSearch';
import type { Player } from '../../types';
import type { LeagueTeamRow } from '../../services/multi/roomQueries';

interface MobileSearchSheetProps {
    open: boolean;
    onClose: () => void;
    leagueTeams: LeagueTeamRow[];
    poolPlayers: Player[];
    rosterMap: Map<string, string>;
    onViewPlayer: (player: Player, teamSlug: string | null) => void;
    onViewTeam: (teamSlug: string) => void;
}

export const MobileSearchSheet: React.FC<MobileSearchSheetProps> = ({ open, onClose, leagueTeams, poolPlayers, rosterMap, onViewPlayer, onViewTeam }) => {
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) { setQuery(''); return; }
        // 열리면 바로 키보드 — 포커스는 렌더 다음 틱에.
        const id = window.setTimeout(() => inputRef.current?.focus(), 0);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => { window.clearTimeout(id); document.removeEventListener('keydown', onKey); };
    }, [open, onClose]);

    const results = useMemo(() => searchLeagueEntities(query, leagueTeams, poolPlayers, rosterMap), [query, leagueTeams, poolPlayers, rosterMap]);
    const grouped = useMemo(() => groupLeagueSearchResults(results), [results]);
    const hasQuery = query.trim().length > 0;

    const select = (r: LeagueSearchResult) => {
        onClose();
        if (r.type === 'team') onViewTeam(r.team.team_slug);
        else onViewPlayer(r.player, r.teamSlug);
    };

    if (!open) return null;
    return createPortal(
        <div role="dialog" aria-modal="true" aria-label="팀, 선수 검색" className="fixed inset-0 z-modal flex flex-col bg-slate-950">
            <div className="shrink-0 pt-safe border-b border-slate-800">
                <div className="h-14 flex items-center gap-2 px-3">
                    <label className="flex-1 h-10 flex items-center gap-2 px-3 rounded-lg bg-slate-900 border border-slate-700 focus-within:border-slate-500">
                        <Search size={18} className="text-slate-500 shrink-0" />
                        {/* type="search"는 WebKit이 자체 지우기(X)를 그려 우리 X와 겹친다(2026-10-27 스크린샷) → text + inputMode만 */}
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode="search"
                            enterKeyHint="search"
                            autoComplete="off"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="팀, 선수 검색"
                            aria-label="팀, 선수 검색"
                            className="flex-1 min-w-0 bg-transparent border-none outline-none text-base text-white placeholder:text-slate-500"
                        />
                        {query && (
                            <button type="button" aria-label="검색어 지우기" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="w-7 h-7 -mr-1 flex items-center justify-center rounded-md text-slate-400 active:bg-white/10">
                                <X size={16} />
                            </button>
                        )}
                    </label>
                    <button type="button" onClick={onClose} className="h-10 px-2 text-sm font-semibold text-slate-200 shrink-0 active:opacity-70">취소</button>
                </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-safe">
                {!hasQuery ? (
                    <p className="px-4 py-6 text-sm text-slate-500">팀 이름이나 선수 이름을 입력하세요.</p>
                ) : grouped.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-500">검색 결과 없음</p>
                ) : grouped.map(group => (
                    <div key={group.type}>
                        <div className="h-8 px-4 flex items-center bg-slate-900 text-xs font-semibold text-slate-400">{SEARCH_CATEGORY_LABELS[group.type]}</div>
                        {group.items.map((r, i) => (
                            <button key={i} type="button" onClick={() => select(r)} className="w-full h-12 px-4 flex items-center gap-3 text-left border-b border-slate-800 active:bg-white/5">
                                {r.type === 'team' ? (
                                    <>
                                        <TeamLogo teamId={r.team.team_slug} teamName={r.team.team_abbr} size="custom" className="w-6 h-6 shrink-0" shadow={false} />
                                        <span className="flex-1 min-w-0 text-sm font-semibold text-slate-200 truncate">{r.team.team_name}</span>
                                    </>
                                ) : (
                                    <>
                                        <OvrBadge value={calculatePlayerOvr(r.player)} size="sm" className="shrink-0" />
                                        <span className="flex-1 min-w-0 text-sm font-semibold text-slate-200 truncate">{r.player.name}</span>
                                        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap shrink-0">{r.teamAbbr ?? 'Free Agent'} · {r.player.position}</span>
                                    </>
                                )}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
        </div>,
        document.body,
    );
};

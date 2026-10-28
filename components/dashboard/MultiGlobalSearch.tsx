
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { OvrBadge } from '../common/OvrBadge';
import { calculatePlayerOvr } from '../../utils/constants';
import { TeamLogo } from '../common/TeamLogo';
import { IconButton } from '../common/IconButton';
import type { Player } from '../../types';
import type { LeagueTeamRow } from '../../services/multi/roomQueries';
import { searchLeagueEntities, groupLeagueSearchResults, SEARCH_CATEGORY_LABELS, type LeagueSearchResult } from './leagueSearch';

// [2026-10-27] 결과 타입·매칭 규칙은 leagueSearch.ts로 이동(모바일 검색 시트와 공유). 여기 동작은 동일.
type SearchResult = LeagueSearchResult;

interface MultiGlobalSearchProps {
    leagueTeams:   LeagueTeamRow[];
    poolPlayers:   Player[];
    rosterMap:     Map<string, string>;   // playerId → team_slug
    onViewPlayer:  (player: Player, teamSlug: string | null) => void;
    onViewTeam:    (teamSlug: string) => void;
}

const CATEGORY_LABELS = SEARCH_CATEGORY_LABELS;

// 접힘(아이콘+"검색" 라벨) / 펼침(입력창) / 결과 드롭다운 폭(px).
const COLLAPSED_W = 72;
const EXPANDED_W  = 200;
const DROPDOWN_W  = 340;

export const MultiGlobalSearch: React.FC<MultiGlobalSearchProps> = ({
    leagueTeams,
    poolPlayers,
    rosterMap,
    onViewPlayer,
    onViewTeam,
}) => {
    const [query,     setQuery]     = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [isOpen,    setIsOpen]    = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef     = useRef<HTMLInputElement>(null);

    const results = useMemo<SearchResult[]>(() => searchLeagueEntities(query, leagueTeams, poolPlayers, rosterMap), [query, leagueTeams, poolPlayers, rosterMap]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node))
                setIsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Esc: 닫기 + 비우기 + 포커스 해제(→ 아이콘으로 접힘)
            if (e.key === 'Escape') { setIsOpen(false); setQuery(''); inputRef.current?.blur(); }
            // ⌘K / Ctrl+K: 어디서든 검색창 펼치기
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const handleSelect = (result: SearchResult) => {
        setIsOpen(false);
        setQuery('');
        if (result.type === 'team') onViewTeam(result.team.team_slug);
        if (result.type === 'player') onViewPlayer(result.player, result.teamSlug);
    };

    const grouped = useMemo(() => groupLeagueSearchResults(results), [results]);

    const showDropdown = isOpen && query.trim().length > 0;

    // [2026-10-12] 헤더 폭 확보 — 평소엔 32px 아이콘으로 접혀 있다가 포커스/입력 중에만 200px로
    // 펼친다(기존 고정 340px). 컨테이너는 접힌 크기(w-8 h-7)로 고정하고 입력 패널은 absolute
    // right-0으로 왼쪽을 향해 겹쳐 펼쳐지므로, 펼쳐져도 헤더 좌측(상태 칸)이 밀리지 않는다.
    // 결과 드롭다운은 입력창 폭과 무관하게 340px(우측 정렬)을 유지 — 선수명+팀+포지션이 들어가야 함.
    const isExpanded = isFocused || query.length > 0;

    return (
        <div ref={containerRef} className="relative h-7 shrink-0" style={{ width: COLLAPSED_W }}>
            <div
                className={`absolute inset-y-0 right-0 flex items-center gap-2 px-2 cursor-text border transition-[width,background-color,border-color] duration-200 ${
                    isFocused
                        ? 'bg-slate-800 border-slate-600'
                        : 'bg-slate-900 border-slate-700 hover:border-slate-600'
                }`}
                style={{ width: isExpanded ? EXPANDED_W : COLLAPSED_W, boxShadow: 'inset 0px 2px 4px rgba(0,0,0,0.15)' }}
                onClick={() => inputRef.current?.focus()}
                title={isExpanded ? undefined : '검색 (⌘K)'}
            >
                <Search size={16} className="text-slate-500 shrink-0" />
                {/* 접힌 상태 라벨 — 아이콘만으로는 검색 기능임이 안 드러나 "검색" 텍스트 병기(사용자 요청). */}
                {!isExpanded && (
                    <span className="text-sm font-medium text-slate-400 whitespace-nowrap select-none">검색</span>
                )}
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
                    onFocus={() => { setIsFocused(true); setIsOpen(true); }}
                    onBlur={() => setIsFocused(false)}
                    placeholder="팀, 선수 검색"
                    aria-label="팀, 선수 검색"
                    className={`bg-transparent border-none outline-none flex-1 text-sm font-medium text-white placeholder:text-slate-500 min-w-0 transition-opacity duration-150 ${
                        isExpanded ? 'opacity-100' : 'opacity-0 w-0'
                    }`}
                />
                {isExpanded && query && (
                    <IconButton
                        label="검색어 지우기"
                        size="sm"
                        onClick={e => { e.stopPropagation(); setQuery(''); inputRef.current?.focus(); }}
                    >
                        <X size={14} />
                    </IconButton>
                )}

            {/* 결과 패널은 입력 패널의 자식 — 입력창 좌측 모서리에 자연히 정렬된다(폭은 입력창보다 넓어 오른쪽으로 이어짐). */}
            {showDropdown && (
                <div
                    className="absolute left-0 top-full mt-1 rounded-sm overflow-hidden z-[200] bg-slate-900 border border-slate-700 max-h-[320px] overflow-y-auto custom-scrollbar scrollbar-slate cursor-default"
                    onClick={e => e.stopPropagation()}
                    style={{
                        width: DROPDOWN_W,
                        boxShadow: '0px 20px 25px -5px rgba(0,0,0,0.1), 0px 10px 10px -5px rgba(0,0,0,0.04)',
                    }}
                >
                    {grouped.length === 0 ? (
                        <div className="bg-slate-800 px-3 py-1">
                            <span className="text-xs font-semibold text-slate-400">검색 결과 없음</span>
                        </div>
                    ) : grouped.map(group => (
                        <div key={group.type}>
                            <div className="bg-slate-800 px-3 py-1">
                                <span className="text-xs font-semibold text-slate-400">
                                    {CATEGORY_LABELS[group.type]}
                                </span>
                            </div>
                            {group.items.map((result, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSelect(result)}
                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-800 transition-colors text-left"
                                >
                                    {result.type === 'team' && (
                                        <>
                                            {/* [2026-09-07] 다른 화면들과 동일한 TeamLogo 공용
                                                (리그 로고 1회 폴백)으로 교체(사용자 요청, 기존 TeamLogo는
                                                싱글플레이어용 구버전 로고만 참조). */}
                                            <TeamLogo teamId={result.team.team_slug} teamName={result.team.team_abbr} size="custom" className="w-6 h-6 shrink-0" shadow={false} />
                                            <span className="text-xs font-semibold text-slate-300 truncate flex-1">
                                                {result.team.team_name}
                                            </span>
                                        </>
                                    )}
                                    {result.type === 'player' && (
                                        <>
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <OvrBadge value={calculatePlayerOvr(result.player)} size="sm" className="shrink-0" />
                                                <span className="text-xs font-semibold text-slate-300 truncate">
                                                    {result.player.name}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                                                    {result.teamAbbr ?? 'Free Agent'}
                                                </span>
                                                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                                                    {result.player.position}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
            </div>
        </div>
    );
};

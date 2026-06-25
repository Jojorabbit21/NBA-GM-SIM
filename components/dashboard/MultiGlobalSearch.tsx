
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { TeamLogo } from '../common/TeamLogo';
import { OvrBadge } from '../common/OvrBadge';
import { calculatePlayerOvr } from '../../utils/constants';
import type { Player } from '../../types';
import type { LeagueTeamRow } from '../../services/multi/roomQueries';

type SearchResult =
    | { type: 'team';   team: LeagueTeamRow }
    | { type: 'player'; player: Player; teamSlug: string | null; teamAbbr: string | null; teamColor: string | null };

interface MultiGlobalSearchProps {
    leagueTeams:   LeagueTeamRow[];
    poolPlayers:   Player[];
    rosterMap:     Map<string, string>;   // playerId → team_slug
    onViewPlayer:  (player: Player, teamSlug: string | null) => void;
    onViewTeam:    (teamSlug: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = { team: '팀', player: '선수' };

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

    // 팀 이름 역인덱스
    const teamBySlug = useMemo(() => {
        const m = new Map<string, LeagueTeamRow>();
        for (const t of leagueTeams) m.set(t.team_slug, t);
        return m;
    }, [leagueTeams]);

    const results = useMemo<SearchResult[]>(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const out: SearchResult[] = [];

        // 팀 검색
        let teamCount = 0;
        for (const t of leagueTeams) {
            if (teamCount >= 5) break;
            if (t.team_name.toLowerCase().includes(q) || t.team_slug.includes(q) || t.team_abbr.toLowerCase().includes(q)) {
                out.push({ type: 'team', team: t });
                teamCount++;
            }
        }

        // 선수 검색
        let playerCount = 0;
        for (const player of poolPlayers) {
            if (playerCount >= 20) break;
            if (!player.name.toLowerCase().includes(q)) continue;
            const slug  = rosterMap.get(player.id) ?? null;
            const team  = slug ? teamBySlug.get(slug) ?? null : null;
            out.push({
                type:       'player',
                player,
                teamSlug:   slug,
                teamAbbr:   team?.team_abbr ?? null,
                teamColor:  team?.color_primary ?? null,
            });
            playerCount++;
        }

        return out;
    }, [query, leagueTeams, poolPlayers, rosterMap, teamBySlug]);

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
            if (e.key === 'Escape') { setIsOpen(false); setQuery(''); }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const handleSelect = (result: SearchResult) => {
        setIsOpen(false);
        setQuery('');
        if (result.type === 'team')   onViewTeam(result.team.team_slug);
        if (result.type === 'player') onViewPlayer(result.player, result.teamSlug);
    };

    const grouped = useMemo(() => {
        const order: SearchResult['type'][] = ['team', 'player'];
        return order
            .map(type => ({ type, items: results.filter(r => r.type === type) }))
            .filter(g => g.items.length > 0);
    }, [results]);

    const showDropdown = isOpen && query.trim().length > 0;

    return (
        <div ref={containerRef} className="relative w-[340px]">
            <div
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 cursor-text border ${
                    isFocused
                        ? 'bg-surface-sunken border-border-emphasis'
                        : 'bg-surface-flat border-border-default hover:border-border-emphasis'
                }`}
                style={{ boxShadow: 'inset 0px 2px 4px rgba(0,0,0,0.15)' }}
                onClick={() => inputRef.current?.focus()}
            >
                <Search size={16} className="text-text-disabled shrink-0" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
                    onFocus={() => { setIsFocused(true); setIsOpen(true); }}
                    onBlur={() => setIsFocused(false)}
                    placeholder="팀, 선수 검색"
                    className="bg-transparent border-none outline-none flex-1 text-sm font-medium text-text-primary placeholder:text-text-disabled min-w-0"
                />
                {query && (
                    <button
                        onClick={e => { e.stopPropagation(); setQuery(''); inputRef.current?.focus(); }}
                        className="shrink-0"
                    >
                        <X size={14} className="text-text-muted hover:text-text-primary transition-colors" />
                    </button>
                )}
            </div>

            {showDropdown && (
                <div
                    className="absolute left-0 top-full mt-1 w-full rounded-xl overflow-hidden z-[200] bg-surface-card border border-border-default max-h-[320px] overflow-y-auto custom-scrollbar"
                    style={{ boxShadow: '0px 20px 25px -5px rgba(0,0,0,0.1), 0px 10px 10px -5px rgba(0,0,0,0.04)' }}
                >
                    {grouped.length === 0 ? (
                        <div className="bg-surface-sidebar px-3 py-2">
                            <span className="text-xs font-semibold text-text-muted">검색 결과 없음</span>
                        </div>
                    ) : grouped.map(group => (
                        <div key={group.type}>
                            <div className="bg-surface-sidebar px-3 py-2">
                                <span className="text-xs font-semibold text-text-muted">
                                    {CATEGORY_LABELS[group.type]}
                                </span>
                            </div>
                            {group.items.map((result, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSelect(result)}
                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover transition-colors text-left"
                                >
                                    {result.type === 'team' && (
                                        <>
                                            <TeamLogo teamId={result.team.team_slug} size="custom" className="w-6 h-6 shrink-0" />
                                            <span className="text-xs font-semibold text-text-muted truncate flex-1">
                                                {result.team.team_name}
                                            </span>
                                        </>
                                    )}
                                    {result.type === 'player' && (
                                        <>
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <OvrBadge value={calculatePlayerOvr(result.player)} size="sm" className="!w-4 !h-4 !text-[10px] shrink-0" />
                                                <span className="text-xs font-semibold text-text-muted truncate">
                                                    {result.player.name}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span
                                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
                                                    style={{
                                                        backgroundColor: result.teamColor ?? '#3f3f46',
                                                        color: '#ffffff',
                                                    }}
                                                >
                                                    {result.teamAbbr ?? 'FA'}
                                                </span>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-card text-text-secondary border border-border-default whitespace-nowrap">
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
    );
};

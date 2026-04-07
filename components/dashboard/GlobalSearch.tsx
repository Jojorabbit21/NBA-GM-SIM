
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { Team, Player } from '../../types';
import { GMProfile } from '../../types/gm';
import { HeadCoach } from '../../types/coaching';
import { TeamLogo } from '../common/TeamLogo';
import { OvrBadge } from '../common/OvrBadge';
import { calculatePlayerOvr } from '../../utils/constants';
import { TEAM_DATA } from '../../data/teamData';

type SearchResult =
    | { type: 'team'; teamId: string; teamName: string }
    | { type: 'player'; player: Player; teamId: string; teamName: string }
    | { type: 'gm'; profile: GMProfile; teamId: string; teamName: string }
    | { type: 'coach'; coach: HeadCoach; teamId: string; teamName: string };

interface GlobalSearchProps {
    allTeams: Team[];
    leagueGMProfiles?: Record<string, GMProfile>;
    coachingData?: Record<string, { headCoach: HeadCoach | null }>;
    onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
    onViewTeam: (teamId: string) => void;
    onViewGM: (teamId: string) => void;
    onViewCoach: (teamId: string) => void;
}

function getFullTeamName(teamId: string): string {
    const td = TEAM_DATA[teamId];
    return td ? `${td.city} ${td.name}` : teamId;
}

const CATEGORY_LABELS: Record<string, string> = {
    team: '팀',
    player: '선수',
    gm: '단장',
    coach: '코치',
};

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
    allTeams,
    leagueGMProfiles,
    coachingData,
    onViewPlayer,
    onViewTeam,
    onViewGM,
    onViewCoach,
}) => {
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const results = useMemo<SearchResult[]>(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const out: SearchResult[] = [];

        let teamCount = 0;
        for (const team of allTeams) {
            if (teamCount >= 5) break;
            const td = TEAM_DATA[team.id];
            const fullName = td ? `${td.city} ${td.name}` : team.name;
            if (fullName.toLowerCase().includes(q) || team.id.includes(q)) {
                out.push({ type: 'team', teamId: team.id, teamName: fullName });
                teamCount++;
            }
        }

        let playerCount = 0;
        for (const team of allTeams) {
            if (playerCount >= 15) break;
            const teamName = getFullTeamName(team.id);
            for (const player of team.roster) {
                if (playerCount >= 15) break;
                if (player.name.toLowerCase().includes(q)) {
                    out.push({ type: 'player', player, teamId: team.id, teamName });
                    playerCount++;
                }
            }
        }

        if (leagueGMProfiles) {
            let gmCount = 0;
            for (const [teamId, profile] of Object.entries(leagueGMProfiles)) {
                if (gmCount >= 5) break;
                if (profile.name.toLowerCase().includes(q)) {
                    out.push({ type: 'gm', profile, teamId, teamName: getFullTeamName(teamId) });
                    gmCount++;
                }
            }
        }

        if (coachingData) {
            let coachCount = 0;
            for (const [teamId, staff] of Object.entries(coachingData)) {
                if (coachCount >= 5) break;
                const coach = staff.headCoach;
                if (coach && coach.name.toLowerCase().includes(q)) {
                    out.push({ type: 'coach', coach, teamId, teamName: getFullTeamName(teamId) });
                    coachCount++;
                }
            }
        }

        return out;
    }, [query, allTeams, leagueGMProfiles, coachingData]);

    // 외부 클릭 감지
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Esc 키
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, []);

    const handleSelect = (result: SearchResult) => {
        setIsOpen(false);
        setQuery('');
        switch (result.type) {
            case 'team': onViewTeam(result.teamId); break;
            case 'player': onViewPlayer(result.player, result.teamId, result.teamName); break;
            case 'gm': onViewGM(result.teamId); break;
            case 'coach': onViewCoach(result.teamId); break;
        }
    };

    const grouped = useMemo(() => {
        const order: SearchResult['type'][] = ['team', 'player', 'gm', 'coach'];
        return order
            .map(type => ({ type, items: results.filter(r => r.type === type) }))
            .filter(g => g.items.length > 0);
    }, [results]);

    const showDropdown = isOpen && query.trim().length > 0;

    return (
        <div ref={containerRef} className="relative w-[398px]">
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
                    placeholder="팀, 선수, 코칭스태프 검색"
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

            {/* 결과 드롭다운 */}
            {showDropdown && (
                <div className="absolute left-0 top-full mt-1 w-full rounded-xl overflow-hidden z-[200] bg-surface-card border border-border-default max-h-[320px] overflow-y-auto custom-scrollbar"
                    style={{ boxShadow: '0px 20px 25px -5px rgba(0,0,0,0.1), 0px 10px 10px -5px rgba(0,0,0,0.04)' }}
                >
                    {grouped.length === 0 ? (
                        <div className="bg-surface-sidebar px-3 py-2">
                            <span className="text-xs font-semibold text-text-muted">검색 결과 없음</span>
                        </div>
                    ) : (
                        grouped.map(group => (
                            <div key={group.type}>
                                {/* Category Header */}
                                <div className="bg-surface-sidebar px-3 py-2">
                                    <span className="text-xs font-semibold text-text-muted">
                                        {CATEGORY_LABELS[group.type]}
                                    </span>
                                </div>
                                {/* Items */}
                                {group.items.map((result, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSelect(result)}
                                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover transition-colors text-left"
                                    >
                                        {result.type === 'team' && (
                                            <>
                                                <TeamLogo teamId={result.teamId} size="custom" className="w-6 h-6 shrink-0" />
                                                <span className="text-xs font-semibold text-text-muted truncate flex-1">{result.teamName}</span>
                                            </>
                                        )}
                                        {result.type === 'player' && (() => {
                                            const tc = TEAM_DATA[result.teamId]?.colors;
                                            return (
                                                <>
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <OvrBadge value={calculatePlayerOvr(result.player)} size="sm" className="!w-4 !h-4 !text-[10px] shrink-0" />
                                                        <span className="text-xs font-semibold text-text-muted truncate">{result.player.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" style={{ backgroundColor: tc?.primary ?? '#3f3f46', color: tc?.text ?? '#ffffff' }}>
                                                            {result.teamId.toUpperCase()}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-card text-text-secondary border border-border-default whitespace-nowrap">
                                                            {result.player.position}
                                                        </span>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                        {(result.type === 'gm' || result.type === 'coach') && (() => {
                                            const tc = TEAM_DATA[result.teamId]?.colors;
                                            return (
                                                <>
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-info-muted text-status-info-text shrink-0 whitespace-nowrap">
                                                            {result.type === 'gm' ? 'GM' : '코치'}
                                                        </span>
                                                        <span className="text-xs font-semibold text-text-muted truncate">
                                                            {result.type === 'gm' ? result.profile.name : result.coach.name}
                                                        </span>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 whitespace-nowrap" style={{ backgroundColor: tc?.primary ?? '#3f3f46', color: tc?.text ?? '#ffffff' }}>
                                                        {result.teamId.toUpperCase()}
                                                    </span>
                                                </>
                                            );
                                        })()}
                                    </button>
                                ))}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

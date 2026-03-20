
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
    const [isHovered, setIsHovered] = useState(false);
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

    // 피그마 시안: 기본(#374151 bg, #4b5563 border), 호버(dashed border 변경), 포커스(인디고 border)
    const borderStyle = isFocused
        ? '2px solid #6366f1'
        : isHovered
        ? '2px dashed #6366f1'
        : '2px solid #4b5563';

    return (
        <div ref={containerRef} className="relative w-[398px]">
            <div
                className="flex items-center justify-between px-6 py-3 rounded-2xl transition-all duration-200 cursor-text"
                style={{
                    background: '#374151',
                    border: borderStyle,
                    boxShadow: 'inset 0px 2px 4px rgba(0,0,0,0.06)',
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={() => inputRef.current?.focus()}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
                    onFocus={() => { setIsFocused(true); setIsOpen(true); }}
                    onBlur={() => setIsFocused(false)}
                    placeholder="팀, 선수, 코칭스태프 검색"
                    className="bg-transparent border-none outline-none flex-1 text-sm font-bold text-gray-100 placeholder-gray-400 min-w-0"
                />
                {query ? (
                    <button
                        onClick={e => { e.stopPropagation(); setQuery(''); inputRef.current?.focus(); }}
                        className="flex-shrink-0 ml-2"
                    >
                        <X size={16} className="text-gray-400 hover:text-gray-200 transition-colors" />
                    </button>
                ) : (
                    <Search size={18} className="text-gray-400 flex-shrink-0 ml-2" />
                )}
            </div>

            {/* 결과 드롭다운 */}
            {showDropdown && (
                <div
                    className="absolute left-0 top-full mt-1 w-full rounded-xl overflow-hidden shadow-2xl z-[200]"
                    style={{
                        background: '#1e293b',
                        border: '1px solid rgba(255,255,255,0.1)',
                    }}
                >
                    {grouped.length === 0 ? (
                        <div className="px-4 py-4 text-sm text-slate-500 text-center">검색 결과 없음</div>
                    ) : (
                        <div className="max-h-80 overflow-y-auto custom-scrollbar">
                            {grouped.map(group => (
                                <div key={group.type}>
                                    {/* 카테고리 헤더 */}
                                    <div className="px-3 py-1.5 bg-slate-950/50">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                            {CATEGORY_LABELS[group.type]}
                                        </span>
                                    </div>
                                    {group.items.map((result, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleSelect(result)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-500/20 transition-colors text-left"
                                        >
                                            {result.type === 'team' && (
                                                <>
                                                    <TeamLogo teamId={result.teamId} size="sm" />
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <span className="text-sm font-semibold text-slate-100 truncate">{result.teamName}</span>
                                                    </div>
                                                </>
                                            )}
                                            {result.type === 'player' && (
                                                <>
                                                    <OvrBadge value={calculatePlayerOvr(result.player)} size="sm" className="!w-7 !h-7 !text-[10px] flex-shrink-0" />
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <span className="text-sm font-semibold text-slate-100 truncate">{result.player.name}</span>
                                                        <span className="text-xs text-slate-400 truncate">{result.player.position} · {result.teamName}</span>
                                                    </div>
                                                </>
                                            )}
                                            {result.type === 'gm' && (
                                                <>
                                                    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                                                        <span className="text-[10px] text-slate-300 font-bold">단</span>
                                                    </div>
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <span className="text-sm font-semibold text-slate-100 truncate">{result.profile.name}</span>
                                                        <span className="text-xs text-slate-400 truncate">{result.teamName} 단장</span>
                                                    </div>
                                                </>
                                            )}
                                            {result.type === 'coach' && (
                                                <>
                                                    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                                                        <span className="text-[10px] text-slate-300 font-bold">코</span>
                                                    </div>
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <span className="text-sm font-semibold text-slate-100 truncate">{result.coach.name}</span>
                                                        <span className="text-xs text-slate-400 truncate">{result.teamName} 코치</span>
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
            )}
        </div>
    );
};

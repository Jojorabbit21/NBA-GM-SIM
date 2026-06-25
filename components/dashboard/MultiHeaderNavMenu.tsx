
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { MultiGlobalSearch } from './MultiGlobalSearch';
import type { Player } from '../../types';
import type { LeagueTeamRow } from '../../services/multi/roomQueries';

interface MultiHeaderNavMenuProps {
    teamPrimaryColor?: string;
    leagueTeams:   LeagueTeamRow[];
    poolPlayers:   Player[];
    rosterMap:     Map<string, string>;
    onViewPlayer:  (player: Player, teamSlug: string | null) => void;
    onViewTeam:    (teamSlug: string) => void;
}

type DropdownId = 'team' | 'league' | null;

interface DropdownItem {
    label: string;
    path: string;
    dividerBefore?: boolean;
}

export const MultiHeaderNavMenu: React.FC<MultiHeaderNavMenuProps> = ({
    teamPrimaryColor,
    leagueTeams,
    poolPlayers,
    rosterMap,
    onViewPlayer,
    onViewTeam,
}) => {
    const navigate      = useNavigate();
    const { pathname }  = useLocation();
    const { leagueId }  = useParams<{ leagueId: string }>();
    const base          = `/multi/leagues/${leagueId}/season`;

    const [openDropdown, setOpenDropdown] = useState<DropdownId>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggle = (id: DropdownId) =>
        setOpenDropdown(prev => (prev === id ? null : id));

    const handleNav = (path: string) => {
        setOpenDropdown(null);
        navigate(path);
    };

    const activeStyle: React.CSSProperties = {
        backgroundColor: teamPrimaryColor ?? '#4f46e5',
        color: '#ffffff',
    };

    const tabBase    = 'flex items-center gap-1 px-3 py-0.5 rounded-lg text-base font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap select-none';
    const tabDefault = 'text-zinc-500 hover:text-zinc-300';

    const isHomeActive   = pathname === base;
    const isTeamActive   = pathname.startsWith(`${base}/roster`) || pathname.startsWith(`${base}/tactics`);
    const isLeagueActive = pathname.startsWith(`${base}/standings`) || pathname.startsWith(`${base}/leaderboard`) || pathname.startsWith(`${base}/schedule`);

    const isItemActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

    const teamItems: DropdownItem[] = [
        { label: '로스터',   path: `${base}/roster` },
        { label: '전술 설정', path: `${base}/tactics` },
    ];

    const leagueItems: DropdownItem[] = [
        { label: '순위표',    path: `${base}/standings` },
        { label: '리더보드',  path: `${base}/leaderboard` },
        { label: '일정',      path: `${base}/schedule` },
    ];

    const DropdownPanel: React.FC<{ items: DropdownItem[]; minWidth?: string }> = ({
        items,
        minWidth = '160px',
    }) => (
        <div
            className="absolute top-full left-0 mt-2 bg-black border border-zinc-700 rounded-lg p-2 flex flex-col gap-0.5 z-[200]"
            style={{ minWidth }}
        >
            {items.map(item => {
                const active = isItemActive(item.path);
                return (
                    <React.Fragment key={item.path}>
                        {item.dividerBefore && <div className="my-1 border-t border-zinc-700" />}
                        <button
                            onClick={() => handleNav(item.path)}
                            className={`px-3 py-1 text-xs rounded text-left transition-colors ${
                                active
                                    ? 'bg-white/15 text-white font-semibold'
                                    : 'font-medium text-zinc-400 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            {item.label}
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );

    return (
        <div ref={containerRef} className="flex items-center gap-6">
            {/* Nav 탭 묶음 */}
        <div className="flex items-center gap-12">
            {/* 홈 */}
            <button
                onClick={() => navigate(base)}
                className={`${tabBase} ${isHomeActive ? '' : tabDefault}`}
                style={isHomeActive ? activeStyle : undefined}
            >
                홈
            </button>

            {/* 내 팀 */}
            <div className="relative">
                <button
                    onClick={() => toggle('team')}
                    className={`${tabBase} ${isTeamActive ? '' : tabDefault}`}
                    style={isTeamActive ? activeStyle : undefined}
                >
                    내 팀
                    {openDropdown === 'team'
                        ? <ChevronUp size={16} className="shrink-0" />
                        : <ChevronDown size={16} className="shrink-0" />
                    }
                </button>
                {openDropdown === 'team' && <DropdownPanel items={teamItems} minWidth="120px" />}
            </div>

            {/* 리그 */}
            <div className="relative">
                <button
                    onClick={() => toggle('league')}
                    className={`${tabBase} ${isLeagueActive ? '' : tabDefault}`}
                    style={isLeagueActive ? activeStyle : undefined}
                >
                    리그
                    {openDropdown === 'league'
                        ? <ChevronUp size={16} className="shrink-0" />
                        : <ChevronDown size={16} className="shrink-0" />
                    }
                </button>
                {openDropdown === 'league' && <DropdownPanel items={leagueItems} />}
            </div>
        </div>{/* end Nav 탭 묶음 */}

        {/* 검색창 */}
        <MultiGlobalSearch
            leagueTeams={leagueTeams}
            poolPlayers={poolPlayers}
            rosterMap={rosterMap}
            onViewPlayer={onViewPlayer}
            onViewTeam={onViewTeam}
        />
    </div>
    );
};

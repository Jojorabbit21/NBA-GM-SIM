
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Team, Player } from '../../types';
import { GMProfile } from '../../types/gm';
import { GlobalSearch } from './GlobalSearch';

interface HeaderNavMenuProps {
  teamId: string;
  teamPrimaryColor?: string;
  isRegularSeasonOver: boolean;
  hasProspects: boolean;
  gmDisplayName?: string;
  unreadMessagesCount: number;
  allTeams?: Team[];
  coachingData?: Record<string, { headCoach: any }>;
  leagueGMProfiles?: Record<string, GMProfile>;
  onSearchViewPlayer?: (player: Player, teamId?: string, teamName?: string) => void;
  onSearchViewTeam?: (teamId: string) => void;
  onSearchViewGM?: (teamId: string) => void;
  onSearchViewCoach?: (teamId: string) => void;
}

type DropdownId = 'league' | 'org' | 'team' | null;

export const HeaderNavMenu: React.FC<HeaderNavMenuProps> = ({
  teamId,
  teamPrimaryColor,
  isRegularSeasonOver,
  hasProspects,
  gmDisplayName,
  unreadMessagesCount,
  allTeams,
  coachingData,
  leagueGMProfiles,
  onSearchViewPlayer,
  onSearchViewTeam,
  onSearchViewGM,
  onSearchViewCoach,
}) => {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
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

  const toggleDropdown = (id: DropdownId) => {
    setOpenDropdown(prev => (prev === id ? null : id));
  };

  const handleNav = (path: string) => {
    setOpenDropdown(null);
    navigate(path);
  };

  // 드롭다운 항목 active 판별
  const isItemActive = (itemPath: string): boolean => {
    const [itemPathname, itemQuery] = itemPath.split('?');
    if (itemQuery) {
      return pathname === itemPathname && search === `?${itemQuery}`;
    }
    if (itemPathname === '/front-office') {
      return pathname.startsWith('/front-office') && !search.includes('tab=salary');
    }
    return pathname.startsWith(itemPathname);
  };

  const isHomeActive = pathname === '/';
  const isInboxActive = pathname.startsWith('/inbox');
  const isLeagueActive =
    pathname.startsWith('/standings') ||
    pathname.startsWith('/leaderboard') ||
    pathname.startsWith('/transactions') ||
    pathname.startsWith('/fa-market') ||
    pathname.startsWith('/schedule') ||
    pathname.startsWith('/playoffs');
  const isOrgActive =
    pathname.startsWith('/front-office') ||
    pathname.startsWith('/draft-board') ||
    pathname.startsWith('/gm/');
  const isTeamActive =
    pathname.startsWith('/locker-room') || pathname.startsWith('/tactics');

  const activeStyle: React.CSSProperties = {
    backgroundColor: teamPrimaryColor ?? '#4f46e5',
    color: '#ffffff',
  };

  const tabBase =
    'flex items-center gap-1 px-3 py-0.5 rounded-lg text-base font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap select-none';
  const tabDefault = 'text-zinc-500 hover:text-zinc-300';

  const leagueItems = [
    { label: '순위표', path: '/standings' },
    { label: '리더보드', path: '/leaderboard' },
    { label: '선수 이동', path: '/transactions' },
    { label: '자유 계약', path: '/fa-market' },
    { label: '리그 일정', path: '/schedule' },
    ...(isRegularSeasonOver ? [{ label: '플레이오프', path: '/playoffs' }] : []),
  ];

  const orgItems = [
    { label: '프론트 오피스', path: '/front-office' },
    { label: '샐러리', path: '/front-office?tab=salary' },
    ...(hasProspects ? [{ label: '드래프트 보드', path: '/draft-board' }] : []),
    ...(gmDisplayName ? [{ label: '내 프로필', path: `/gm/${teamId}` }] : []),
  ];

  const teamItems = [
    { label: '로스터', path: '/locker-room' },
    { label: '전술', path: '/tactics' },
  ];

  const DropdownPanel: React.FC<{
    items: { label: string; path: string }[];
    minWidth?: string;
  }> = ({ items, minWidth = '160px' }) => (
    <div
      className="absolute top-full left-0 mt-2 bg-black border border-zinc-700 rounded-lg p-2 flex flex-col gap-0.5 z-[200]"
      style={{ minWidth }}
    >
      {items.map(item => {
        const active = isItemActive(item.path);
        return (
          <button
            key={item.path}
            onClick={() => handleNav(item.path)}
            className={`px-3 py-1 text-xs rounded text-left transition-colors ${
              active
                ? 'bg-white/15 text-white font-semibold'
                : 'font-medium text-zinc-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={containerRef} className="flex items-center gap-6">
      {/* Nav tabs */}
      <div className="flex items-center gap-12">
        {/* 홈 */}
        <button
          onClick={() => navigate('/')}
          className={`${tabBase} ${isHomeActive ? '' : tabDefault}`}
          style={isHomeActive ? activeStyle : undefined}
        >
          홈
        </button>

        {/* 받은메일함 */}
        <button
          onClick={() => navigate('/inbox')}
          className={`${tabBase} relative ${isInboxActive ? '' : tabDefault}`}
          style={isInboxActive ? activeStyle : undefined}
        >
          받은메일함
          {unreadMessagesCount > 0 && (
            <span className="absolute -top-1.5 -right-2.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold">
              {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
            </span>
          )}
        </button>

        {/* 리그 */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('league')}
            className={`${tabBase} ${isLeagueActive ? '' : tabDefault}`}
            style={isLeagueActive ? activeStyle : undefined}
          >
            리그
            {openDropdown === 'league' ? (
              <ChevronUp size={16} className="shrink-0" />
            ) : (
              <ChevronDown size={16} className="shrink-0" />
            )}
          </button>
          {openDropdown === 'league' && <DropdownPanel items={leagueItems} />}
        </div>

        {/* 구단 */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('org')}
            className={`${tabBase} ${isOrgActive ? '' : tabDefault}`}
            style={isOrgActive ? activeStyle : undefined}
          >
            구단
            {openDropdown === 'org' ? (
              <ChevronUp size={16} className="shrink-0" />
            ) : (
              <ChevronDown size={16} className="shrink-0" />
            )}
          </button>
          {openDropdown === 'org' && <DropdownPanel items={orgItems} />}
        </div>

        {/* 팀 */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('team')}
            className={`${tabBase} ${isTeamActive ? '' : tabDefault}`}
            style={isTeamActive ? activeStyle : undefined}
          >
            팀
            {openDropdown === 'team' ? (
              <ChevronUp size={16} className="shrink-0" />
            ) : (
              <ChevronDown size={16} className="shrink-0" />
            )}
          </button>
          {openDropdown === 'team' && (
            <DropdownPanel items={teamItems} minWidth="120px" />
          )}
        </div>
      </div>

      {/* GlobalSearch */}
      {allTeams && onSearchViewPlayer && onSearchViewTeam && onSearchViewGM && onSearchViewCoach && (
        <GlobalSearch
          allTeams={allTeams}
          coachingData={coachingData}
          leagueGMProfiles={leagueGMProfiles}
          onViewPlayer={onSearchViewPlayer}
          onViewTeam={onSearchViewTeam}
          onViewGM={onSearchViewGM}
          onViewCoach={onSearchViewCoach}
        />
      )}
    </div>
  );
};

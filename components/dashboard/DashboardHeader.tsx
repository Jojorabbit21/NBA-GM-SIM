
import React, { useState, useCallback } from 'react';
import { Loader2, Play, ChevronRight, FastForward, ChevronDown, ChevronUp } from 'lucide-react';
import { Team, Game, PlayoffSeries, Player } from '../../types';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';
import { getTeamTheme, getButtonTheme } from '../../utils/teamTheme';
import { SeasonKeyDates } from '../../utils/seasonConfig';
import { PendingOffseasonAction } from '../../types/app';
import { DateSkipDropdown, formatDateKorean } from './DateSkipDropdown';
import { GlobalSearch } from './GlobalSearch';
import { GMProfile } from '../../types/gm';

interface DashboardHeaderProps {
  team: Team;
  nextGame?: Game;
  opponent?: Team;
  isHome: boolean;
  isGameToday: boolean;
  isSimulating?: boolean;
  simProgress?: { percent: number; label: string } | null;
  onSimClick: () => void;
  onAutoSimClick?: () => void;
  currentSeries?: PlayoffSeries;
  currentSimDate?: string;
  conferenceRank?: number;
  streak?: string;
  conferenceName?: string;
  isSeasonOver?: boolean;
  pendingOffseasonAction?: PendingOffseasonAction;
  keyDates?: SeasonKeyDates;
  onSkipToDate?: (targetDate: string, label: string) => void;
  onSimulateFullSeason?: () => void;
  // 오늘/내일 경기 정보
  todayOpponentName?: string;
  tomorrowDate?: string;
  tomorrowOpponentName?: string;
  // 검색 기능
  allTeams?: Team[];
  coachingData?: Record<string, { headCoach: any }>;
  leagueGMProfiles?: Record<string, GMProfile>;
  onSearchViewPlayer?: (player: Player, teamId?: string, teamName?: string) => void;
  onSearchViewTeam?: (teamId: string) => void;
  onSearchViewGM?: (teamId: string) => void;
  onSearchViewCoach?: (teamId: string) => void;
}

/** ISO 날짜 → 간략 한글 포맷 (월 일) */
function formatDateShort(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  team, nextGame, opponent, isHome, isGameToday, isSimulating, simProgress,
  onSimClick, onAutoSimClick, currentSeries, currentSimDate, conferenceRank,
  streak, conferenceName, isSeasonOver, pendingOffseasonAction, keyDates,
  onSkipToDate, onSimulateFullSeason,
  todayOpponentName, tomorrowDate, tomorrowOpponentName,
  allTeams, coachingData, leagueGMProfiles,
  onSearchViewPlayer, onSearchViewTeam, onSearchViewGM, onSearchViewCoach,
}) => {
  const [pressedBtn, setPressedBtn] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const isOffseasonBlocked = !!pendingOffseasonAction;
  const [isSkipDropdownOpen, setIsSkipDropdownOpen] = useState(false);

  const handleSkipToDate = useCallback((targetDate: string, label: string) => {
    if (!onSkipToDate) return;
    const ok = window.confirm(`${label} (${targetDate})까지 시뮬레이션을 진행합니다.\n계속하시겠습니까?`);
    if (ok) onSkipToDate(targetDate, label);
  }, [onSkipToDate]);

  const handleSimulateFullSeason = useCallback(() => {
    if (!onSimulateFullSeason) return;
    const ok = window.confirm('시즌 끝까지 시뮬레이션을 진행합니다.\n계속하시겠습니까?');
    if (ok) onSimulateFullSeason();
  }, [onSimulateFullSeason]);

  const teamColors = TEAM_DATA[team.id]?.colors || null;
  const theme = getTeamTheme(team.id, teamColors);
  const btnTheme = getButtonTheme(team.id, teamColors);

  // 메인 버튼 글로시 스타일
  const isLightBg = (() => {
    const hex = btnTheme.bg.replace('#', '');
    if (hex.length < 6) return false;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
  })();

  const mainBtnStyle = (id: string): React.CSSProperties => {
    const isPressed = pressedBtn === id;
    const isHovered = hoveredBtn === id;
    const hl = isLightBg ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)';
    const hlMid = isLightBg ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)';
    const shBot = isLightBg ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.1)';
    const progressGradient = simProgress
      ? `linear-gradient(90deg, ${btnTheme.bg} 0%, ${btnTheme.bg} ${simProgress.percent}%, rgba(0,0,0,0.35) ${simProgress.percent + 0.5}%, rgba(0,0,0,0.25) 100%)`
      : undefined;
    return {
      backgroundColor: btnTheme.bg,
      backgroundImage: simProgress
        ? progressGradient
        : isPressed
        ? `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.02) 40%, transparent 50%, rgba(0,0,0,0.15) 100%)`
        : `linear-gradient(180deg, ${hl} 0%, ${hlMid} 45%, transparent 50%, ${shBot} 100%)`,
      color: btnTheme.text,
      transform: isPressed ? 'scale(0.97)' : 'scale(1)',
      transition: 'all 0.15s ease',
      filter: isHovered && !isPressed ? 'brightness(1.05)' : isPressed ? 'brightness(0.9)' : 'brightness(1)',
    };
  };

  const btnHandlers = (id: string) => ({
    onMouseDown: () => !isSimulating && setPressedBtn(id),
    onMouseUp: () => setPressedBtn(null),
    onMouseEnter: () => !isSimulating && setHoveredBtn(id),
    onMouseLeave: () => { setPressedBtn(null); setHoveredBtn(null); },
  });

  // 연승/연패 텍스트
  const streakText = streak && streak !== '-'
    ? `${streak.startsWith('W') ? '🔥' : '❄️'}${streak.replace('W', '').replace('L', '')}${streak.startsWith('W') ? '연승' : '연패'} 중`
    : '';

  // 메인 버튼 레이블
  const mainBtnLabel = (() => {
    if (simProgress) return simProgress.label;
    if (isSimulating) return '처리 중';
    if (isGameToday) return '경기 시작';
    if (isSeasonOver) return '오프시즌';
    return '내일로 이동';
  })();

  // 서브 버튼 (코치에게 위임) 레이블
  const subBtnLabel = opponent
    ? `코치에게 위임 (vs ${TEAM_DATA[opponent.id]?.name || opponent.name})`
    : '코치에게 위임';

  return (
    <div
      className="w-full sticky top-0 z-[100] flex items-center h-[100px] relative"
      style={{
        backgroundColor: theme.bg,
        borderBottom: '2px solid #374151',
      }}
    >
      {/* 어두운 오버레이 (가독성) */}
      <div className="absolute inset-0 bg-black/10 pointer-events-none" />

      {/* ① 왼쪽: 팀 정보 */}
      <div className="flex items-center gap-4 pl-8 flex-1 min-w-0 relative z-10">
        <TeamLogo
          teamId={team.id}
          size="custom"
          className="w-[60px] h-[60px] shrink-0 drop-shadow-lg"
        />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="text-2xl font-semibold text-white leading-8 truncate"
            style={{ fontFamily: 'Inter, "Noto Sans KR", sans-serif' }}
          >
            {TEAM_DATA[team.id] ? `${TEAM_DATA[team.id].city} ${TEAM_DATA[team.id].name}` : team.name}
          </span>
          <div className="flex items-center gap-3 text-sm font-bold leading-5 flex-wrap">
            <span className="text-white whitespace-nowrap">
              {conferenceName} 컨퍼런스 {conferenceRank}위
            </span>
            <span className="text-emerald-400 whitespace-nowrap">
              {team.wins}W-{team.losses}L
            </span>
            {streakText && (
              <span className="text-white whitespace-nowrap">{streakText}</span>
            )}
          </div>
        </div>
      </div>

      {/* ② 가운데: 검색창 (절대 중앙) */}
      <div className="absolute left-1/2 -translate-x-1/2 z-10">
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

      {/* ③ 오른쪽: 데이트 스키퍼 + 액션 버튼 */}
      <div className="flex items-center gap-3 pr-4 shrink-0 relative z-10">
        {/* 데이트 스키퍼 */}
        {currentSimDate && keyDates && onSkipToDate && (
          <div className="relative">
            <button
              onClick={() => setIsSkipDropdownOpen(prev => !prev)}
              className="flex items-center justify-between gap-4 px-4 py-2 rounded-lg transition-all duration-150 hover:brightness-110"
              style={{
                background: '#111827',
                border: '2px solid #4b5563',
                minWidth: '260px',
              }}
            >
              <div className="flex flex-col gap-1 text-left">
                {/* 오늘 */}
                <div className="flex items-center gap-4">
                  <span className="text-xs font-semibold text-indigo-400 whitespace-nowrap leading-4">
                    오늘 {formatDateShort(currentSimDate)}
                  </span>
                  <span className="text-sm font-semibold text-gray-100 whitespace-nowrap leading-5">
                    {todayOpponentName ? `vs ${todayOpponentName}` : '일정 없음'}
                  </span>
                </div>
                {/* 내일 */}
                <div className="flex items-center gap-4">
                  <span className="text-xs font-semibold text-indigo-400 whitespace-nowrap leading-4">
                    내일 {tomorrowDate ? formatDateShort(tomorrowDate) : ''}
                  </span>
                  <span className="text-sm font-semibold text-gray-100 whitespace-nowrap leading-5">
                    {tomorrowOpponentName ? `vs ${tomorrowOpponentName}` : '일정 없음'}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-gray-400">
                {isSkipDropdownOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>

            <DateSkipDropdown
              isOpen={isSkipDropdownOpen}
              onClose={() => setIsSkipDropdownOpen(false)}
              currentSimDate={currentSimDate}
              keyDates={keyDates}
              onSkipToDate={handleSkipToDate}
              onSimulateFullSeason={handleSimulateFullSeason}
              isSimulating={!!isSimulating}
              themeText={theme.text}
              isOffseason={isSeasonOver}
            />
          </div>
        )}

        {/* 액션 버튼 그룹 */}
        <div className="flex flex-col gap-2">
          {/* 메인 버튼: 경기 시작 / 내일로 이동 */}
          <button
            onClick={onSimClick}
            disabled={isSimulating || isOffseasonBlocked}
            {...btnHandlers('sim')}
            className="flex items-center justify-between rounded-lg h-9 disabled:opacity-40 disabled:cursor-not-allowed select-none overflow-hidden"
            style={{
              ...mainBtnStyle('sim'),
              border: '1px solid rgba(255,255,255,0.4)',
              minWidth: '160px',
            }}
          >
            {/* 텍스트 영역 */}
            <span
              className="flex items-center gap-2 px-3 text-base font-semibold text-white whitespace-nowrap h-full"
              style={{ borderRight: '1px solid rgba(0,0,0,0.3)' }}
            >
              {(simProgress || isSimulating) ? (
                <><Loader2 size={15} className="animate-spin shrink-0" /> {mainBtnLabel}</>
              ) : isGameToday ? (
                <><Play size={14} fill="currentColor" className="shrink-0" /> 경기 시작</>
              ) : (
                mainBtnLabel
              )}
            </span>
            {/* 화살표 아이콘 영역 */}
            <span className="flex items-center justify-center px-2 h-full">
              <ChevronRight size={20} color="white" />
            </span>
          </button>

          {/* 서브 버튼: 코치에게 위임 (경기 당일에만) */}
          {isGameToday && onAutoSimClick && (
            <button
              onClick={onAutoSimClick}
              disabled={isSimulating || isOffseasonBlocked}
              className="flex items-center justify-center px-3 h-6 rounded text-xs font-bold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed select-none whitespace-nowrap transition-all hover:brightness-95"
              style={{
                backgroundImage: 'linear-gradient(rgba(254,254,254,0) 0%, rgba(0,0,0,0.15) 100%), linear-gradient(90deg, #e5e7eb 0%, #e5e7eb 100%)',
                border: '1px solid white',
              }}
            >
              {subBtnLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

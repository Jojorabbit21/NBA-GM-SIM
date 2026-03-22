
import React, { useState, useCallback } from 'react';
import { Loader2, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import {
  buildHeaderGradient,
  type GradientStyleId,
} from '../../utils/dashboardGradient';
import { Team, Game, PlayoffSeries, Player } from '../../types';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';
import { getTeamTheme, getButtonTheme } from '../../utils/teamTheme';
import { SeasonKeyDates } from '../../utils/seasonConfig';
import { PendingOffseasonAction } from '../../types/app';
import { DateSkipDropdown, formatDateKorean, UpcomingGame } from './DateSkipDropdown';
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
  // 데이트 스키퍼 드롭다운용 미래 5경기
  upcomingGames?: UpcomingGame[];
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
  todayOpponentName, tomorrowDate, tomorrowOpponentName, upcomingGames,
  allTeams, coachingData, leagueGMProfiles,
  onSearchViewPlayer, onSearchViewTeam, onSearchViewGM, onSearchViewCoach,
}) => {
  const [pressedBtn, setPressedBtn] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const [gradientStyle] = useState<GradientStyleId>('noise_glow');
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

  const headerBg = teamColors
    ? buildHeaderGradient(gradientStyle, teamColors)
    : '#0a1628';

  const mainBtnStyle = (id: string): React.CSSProperties => {
    const isPressed = pressedBtn === id;
    const isHovered = hoveredBtn === id;
    const progressGradient = simProgress
      ? `linear-gradient(90deg, ${btnTheme.bg} 0%, ${btnTheme.bg} ${simProgress.percent}%, rgba(0,0,0,0.35) ${simProgress.percent + 0.5}%, rgba(0,0,0,0.25) 100%)`
      : undefined;
    return {
      backgroundColor: btnTheme.bg,
      backgroundImage: simProgress ? progressGradient : undefined,
      color: btnTheme.text,
      transform: isPressed ? 'scale(0.97)' : 'scale(1)',
      transition: 'all 0.15s ease',
      filter: isHovered && !isPressed ? 'brightness(1.08)' : isPressed ? 'brightness(0.88)' : 'brightness(1)',
    };
  };

  const btnHandlers = (id: string) => ({
    onMouseDown: () => !isSimulating && setPressedBtn(id),
    onMouseUp: () => setPressedBtn(null),
    onMouseEnter: () => !isSimulating && setHoveredBtn(id),
    onMouseLeave: () => { setPressedBtn(null); setHoveredBtn(null); },
  });

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
      className="w-full sticky top-0 z-[100] flex items-center h-[100px] relative overflow-hidden"
      style={{
        background: '#0a1628',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* 블러 처리된 그라디언트 레이어 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: headerBg,
          filter: 'blur(24px)',
          transform: 'scale(1.1)', // blur 엣지 번짐 방지
        }}
      />

      {/* ① 왼쪽: 팀 정보 */}
      <div className="flex items-center gap-4 pl-8 flex-1 min-w-0 relative z-10">
        <TeamLogo
          teamId={team.id}
          size="custom"
          className="w-[60px] h-[60px] shrink-0 drop-shadow-lg"
        />
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-2xl font-semibold text-white leading-8 truncate"
              style={{ fontFamily: 'Inter, "Noto Sans KR", sans-serif' }}
            >
              {TEAM_DATA[team.id] ? `${TEAM_DATA[team.id].city} ${TEAM_DATA[team.id].name}` : team.name}
            </span>
            <span className="text-lg font-bold text-emerald-400 whitespace-nowrap leading-8 shrink-0">
              {team.wins}W-{team.losses}L
            </span>
          </div>
          {currentSimDate && keyDates && onSkipToDate && (
            <div className="relative">
              <button
                onClick={() => setIsSkipDropdownOpen(prev => !prev)}
                className="flex items-center gap-1.5 text-sm leading-5 text-slate-400 hover:text-slate-200 transition-colors duration-150 group"
              >
                <span className="font-medium whitespace-nowrap">
                  오늘 {formatDateShort(currentSimDate)}
                </span>
                <span className="text-slate-600">·</span>
                <span className="font-semibold text-slate-300 whitespace-nowrap group-hover:text-white transition-colors">
                  {todayOpponentName ? `vs ${todayOpponentName}` : '일정 없음'}
                </span>
                <span className="shrink-0">
                  {isSkipDropdownOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
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
                upcomingGames={upcomingGames}
              />
            </div>
          )}
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

      {/* ③ 오른쪽: 액션 버튼 */}
      <div className="flex items-center gap-3 pr-4 shrink-0 relative z-10">
        {/* 액션 버튼 그룹 — 총 높이 68px */}
        <div className="flex flex-col gap-2" style={{ width: '177px' }}>
          {/* 메인 버튼 — Action: h-9(36px) + gap-2(8px) + sub h-6(24px) = 68px, NoAction: h-[68px] */}
          <button
            onClick={onSimClick}
            disabled={isSimulating || isOffseasonBlocked}
            {...btnHandlers('sim')}
            className={`flex items-center justify-between rounded-lg disabled:opacity-40 disabled:cursor-not-allowed select-none overflow-hidden w-full ${
              isGameToday ? 'h-9' : 'h-[68px]'
            }`}
            style={{
              ...mainBtnStyle('sim'),
              border: '1px solid rgba(255,255,255,0.4)',
            }}
          >
            {isGameToday ? (
              /* Case B: 경기 당일 — 좌측 텍스트 | 우측 chevron */
              <>
                <span
                  className="flex items-center gap-2 px-3 text-base font-semibold whitespace-nowrap h-full flex-1"
                  style={{ borderRight: '1px solid rgba(0,0,0,0.3)' }}
                >
                  {(simProgress || isSimulating)
                    ? <><Loader2 size={15} className="animate-spin shrink-0" /> {mainBtnLabel}</>
                    : mainBtnLabel}
                </span>
                <span
                  className="flex items-center justify-center p-2 h-full"
                  style={{ borderLeft: '1px solid rgba(255,255,255,0.4)' }}
                >
                  <ChevronRight size={24} color="currentColor" />
                </span>
              </>
            ) : (
              /* Case A: 날짜 이동 — 단순 텍스트 중앙 정렬 */
              <span className="flex items-center justify-center gap-2 text-base font-semibold whitespace-nowrap w-full">
                {(simProgress || isSimulating)
                  ? <><Loader2 size={15} className="animate-spin shrink-0" /> {mainBtnLabel}</>
                  : mainBtnLabel}
              </span>
            )}
          </button>

          {/* 서브 버튼: 코치에게 위임 (경기 당일에만) h-6(24px) */}
          {isGameToday && onAutoSimClick && (
            <button
              onClick={onAutoSimClick}
              disabled={isSimulating || isOffseasonBlocked}
              className="flex items-center justify-center px-3 h-6 rounded text-xs font-bold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed select-none whitespace-nowrap transition-all hover:brightness-95 w-full"
              style={{
                backgroundImage: 'linear-gradient(rgba(254,254,254,0) 0%, rgba(0,0,0,0.3) 100%), linear-gradient(90deg, #e5e7eb 0%, #e5e7eb 100%)',
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

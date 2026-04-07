
import React, { useCallback, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ActionButtonPrimary, ActionButtonSecondary } from './ActionButton';
import { Team, Game, PlayoffSeries, Player } from '../../types';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';
import { getTeamTheme } from '../../utils/teamTheme';
import { SeasonKeyDates } from '../../utils/seasonConfig';
import { PendingOffseasonAction } from '../../types/app';
import { DateSkipDropdown, formatDateKorean, UpcomingGame } from './DateSkipDropdown';
import { HeaderNavMenu } from './HeaderNavMenu';
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
  // 헤더 네비게이션 메뉴
  isRegularSeasonOver?: boolean;
  hasProspects?: boolean;
  gmDisplayName?: string;
  unreadMessagesCount?: number;
  // 검색 기능
  allTeams?: Team[];
  coachingData?: Record<string, { headCoach: any }>;
  leagueGMProfiles?: Record<string, GMProfile>;
  onSearchViewPlayer?: (player: Player, teamId?: string, teamName?: string) => void;
  onSearchViewTeam?: (teamId: string) => void;
  onSearchViewGM?: (teamId: string) => void;
  onSearchViewCoach?: (teamId: string) => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
  isRegularSeasonOver, hasProspects, gmDisplayName, unreadMessagesCount,
  allTeams, coachingData, leagueGMProfiles,
  onSearchViewPlayer, onSearchViewTeam, onSearchViewGM, onSearchViewCoach,
}) => {
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

  const borderColor = hexToRgba(teamColors?.secondary ?? teamColors?.tertiary ?? '#ffffff', 0.4);
  const headerGradient = `linear-gradient(97.5deg, transparent 58%, ${hexToRgba(teamColors?.primary ?? '#0a1628', 0.25)} 89%)`;

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
      className="w-full sticky top-0 z-[100] flex items-center h-[80px] relative"
      style={{
        backgroundImage: headerGradient,
        borderBottom: `2px solid ${borderColor}`,
      }}
    >
      {/* backdrop-blur 오버레이 */}
      <div className="absolute inset-0 backdrop-blur-[20px] bg-[rgba(0,0,0,0.1)] pointer-events-none" />

      {/* ① 왼쪽: 팀 정보 */}
      <div className="flex items-center gap-4 pl-8 flex-1 min-w-0 relative z-10">
        {/* 팀 로고 — zinc-800 배경, 4px border, rounded-full */}
        <div className="w-[60px] h-[60px] shrink-0 rounded-full bg-surface-card border-4 border-border-dim flex items-center justify-center overflow-hidden">
          <TeamLogo
            teamId={team.id}
            size="custom"
            className="w-[44px] h-[44px] drop-shadow-lg"
          />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl font-semibold text-white leading-7 truncate">
              {TEAM_DATA[team.id] ? `${TEAM_DATA[team.id].city} ${TEAM_DATA[team.id].name}` : team.name}
            </span>
            <span className="text-lg font-medium text-status-success-default whitespace-nowrap leading-7 shrink-0">
              {team.wins}W-{team.losses}L
            </span>
          </div>
          {currentSimDate && keyDates && onSkipToDate && (
            <div className="relative">
              <button
                onClick={() => setIsSkipDropdownOpen(prev => !prev)}
                className="flex items-center gap-1.5 text-sm leading-5 text-text-primary hover:opacity-80 transition-opacity duration-150"
              >
                <span className="font-medium whitespace-nowrap">
                  오늘 {formatDateShort(currentSimDate)}
                </span>
                <span className="text-text-muted">·</span>
                <span className="font-medium text-text-primary whitespace-nowrap">
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

      {/* ② 가운데: 네비게이션 메뉴 + 검색창 (절대 중앙) */}
      <div className="absolute left-1/2 -translate-x-1/2 z-10">
        <HeaderNavMenu
          teamId={team.id}
          teamPrimaryColor={teamColors?.primary}
          isRegularSeasonOver={!!isRegularSeasonOver}
          hasProspects={!!hasProspects}
          gmDisplayName={gmDisplayName}
          unreadMessagesCount={unreadMessagesCount ?? 0}
          allTeams={allTeams}
          coachingData={coachingData}
          leagueGMProfiles={leagueGMProfiles}
          onSearchViewPlayer={onSearchViewPlayer}
          onSearchViewTeam={onSearchViewTeam}
          onSearchViewGM={onSearchViewGM}
          onSearchViewCoach={onSearchViewCoach}
        />
      </div>

      {/* ③ 오른쪽: 액션 버튼 */}
      <div className="flex items-center gap-2 pr-8 shrink-0 relative z-10">
        <ActionButtonPrimary
          label={mainBtnLabel}
          onClick={onSimClick}
          disabled={isOffseasonBlocked}
          loading={!!isSimulating || !!simProgress}
          loadingLabel={simProgress?.label ?? '처리 중'}
          showChevron={isGameToday}
          size="medium"
          className="w-[200px]"
        />
        {isGameToday && onAutoSimClick && (
          <ActionButtonSecondary
            icon={<ChevronDown size={20} />}
            onClick={onAutoSimClick}
            disabled={!!isSimulating || isOffseasonBlocked}
            size="medium"
          />
        )}
      </div>
    </div>
  );
};

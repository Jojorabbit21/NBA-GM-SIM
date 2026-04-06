
import React, { Suspense, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Team, Game, PlayoffSeries, GameTactics, Player } from '../types';
import { PendingOffseasonAction, OffseasonPhase } from '../types/app';
import { GMProfile } from '../types/gm';
import { SeasonKeyDates } from '../utils/seasonConfig';
import { ContentLoader } from './Loader';
import { DashboardHeader } from './dashboard/DashboardHeader';
import type { UpcomingGame } from './dashboard/DateSkipDropdown';
import { calculatePlayerOvr } from '../utils/constants';
import { computeStandingsStats } from '../utils/standingsStats';
import { TEAM_DATA } from '../data/teamData';

interface MainLayoutProps {
    children: React.ReactNode;
    sidebarProps: {
        team: Team | undefined;
        currentSimDate: string;
        isGuestMode: boolean;
        unreadMessagesCount: number;
        userEmail?: string;
        gmDisplayName?: string;
        onResetClick: () => void;
        onEditorClick: () => void;
        onSimSettingsClick: () => void;
        onLogout: () => void;
        pendingOffseasonAction: PendingOffseasonAction;
        hasProspects: boolean;
        offseasonPhase?: OffseasonPhase | null;
        onSimulateSeason?: () => void;
        onSkipToDate?: (targetDate: string, label: string) => void;
        keyDates?: SeasonKeyDates;
    };
    gameHeaderProps: {
        schedule: Game[];
        teams: Team[];
        onSim: (tactics: GameTactics, skipAnimation?: boolean) => void;
        onLiveSim: (tactics: GameTactics) => void;
        isSimulating: boolean;
        simProgress: { percent: number; label: string } | null;
        playoffSeries: PlayoffSeries[];
        userTactics: GameTactics | null;
        coachingData?: Record<string, { headCoach: any }>;
        leagueGMProfiles?: Record<string, GMProfile>;
        onSearchViewPlayer?: (player: Player, teamId?: string, teamName?: string) => void;
        onSearchViewTeam?: (teamId: string) => void;
        onSearchViewGM?: (teamId: string) => void;
        onSearchViewCoach?: (teamId: string) => void;
    };
}

/** ISO 날짜에 N일을 더한 날짜 반환 (로컬 타임존 기준) */
function addDays(isoDate: string, n: number): string {
    const d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() + n);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, sidebarProps, gameHeaderProps }) => {
    const { pathname } = useLocation();
    const { team, currentSimDate } = sidebarProps;
    const { schedule, teams, onSim, onLiveSim, isSimulating, simProgress, playoffSeries, userTactics,
            coachingData, leagueGMProfiles, onSearchViewPlayer, onSearchViewTeam, onSearchViewGM, onSearchViewCoach } = gameHeaderProps;

    const nextGame = useMemo(() => {
        if (!team?.id) return undefined;
        const myGames = schedule.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id);
        myGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return myGames.find(g => !g.played);
    }, [schedule, team?.id]);

    const isHome = nextGame?.homeTeamId === team?.id;
    const opponentId = isHome ? nextGame?.awayTeamId : nextGame?.homeTeamId;
    const opponent = useMemo(() => teams.find(t => t.id === opponentId), [teams, opponentId]);

    const isGameToday = useMemo(() => {
        if (!nextGame || !currentSimDate) return false;
        return nextGame.date === currentSimDate && !nextGame.played;
    }, [nextGame, currentSimDate]);

    const isRegularSeasonOver = useMemo(() => {
        const regularGames = schedule.filter(g => !g.isPlayoff);
        return regularGames.length > 0 && regularGames.every(g => g.played);
    }, [schedule]);

    const isPostseasonOver = useMemo(() => {
        if (!isRegularSeasonOver) return false;
        if (playoffSeries.length === 0) return false;
        return playoffSeries.some(s => s.round === 4 && s.finished);
    }, [isRegularSeasonOver, playoffSeries]);

    const currentSeries = useMemo(() => {
        if (!nextGame?.isPlayoff || !nextGame.seriesId || !playoffSeries) return undefined;
        return playoffSeries.find(s => s.id === nextGame.seriesId);
    }, [nextGame, playoffSeries]);

    const { conferenceRank, streak, conferenceName } = useMemo(() => {
        if (!team) return { conferenceRank: 0, streak: '-', conferenceName: '' };
        const stats = computeStandingsStats(teams, schedule);
        const myConf = TEAM_DATA[team.id]?.conference;
        const confTeams = teams
            .filter(t => TEAM_DATA[t.id]?.conference === myConf)
            .sort((a, b) => {
                const pctA = stats[a.id]?.pct ?? 0;
                const pctB = stats[b.id]?.pct ?? 0;
                if (pctB !== pctA) return pctB - pctA;
                return (stats[b.id]?.wins ?? 0) - (stats[a.id]?.wins ?? 0);
            });
        return {
            conferenceRank: confTeams.findIndex(t => t.id === team.id) + 1,
            streak: stats[team.id]?.streak || '-',
            conferenceName: myConf === 'East' ? '동부' : '서부',
        };
    }, [team, teams, schedule]);

    // 오늘/내일 경기 + 미래 5경기 계산
    const { todayOpponentName, tomorrowDate, tomorrowOpponentName, upcomingGames } = useMemo(() => {
        if (!team?.id || !currentSimDate) {
            return { todayOpponentName: undefined, tomorrowDate: undefined, tomorrowOpponentName: undefined, upcomingGames: [] as UpcomingGame[] };
        }

        const nextDay = addDays(currentSimDate, 1);

        const getOpponentName = (game: Game): string => {
            const oppId = game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId;
            const td = TEAM_DATA[oppId];
            return td ? td.name : oppId;
        };

        const myUnplayed = schedule
            .filter(g => (g.homeTeamId === team.id || g.awayTeamId === team.id) && !g.played)
            .sort((a, b) => a.date.localeCompare(b.date));

        const todayGame = myUnplayed.find(g => g.date === currentSimDate);
        const tomorrowGame = myUnplayed.find(g => g.date === nextDay);

        // 미래 5경기 (오늘 포함, 최대 5개)
        const upcoming: UpcomingGame[] = myUnplayed.slice(0, 5).map(g => ({
            date: g.date,
            opponentName: getOpponentName(g),
            isToday: g.date === currentSimDate,
        }));

        return {
            todayOpponentName: todayGame ? getOpponentName(todayGame) : undefined,
            tomorrowDate: nextDay,
            tomorrowOpponentName: tomorrowGame ? getOpponentName(tomorrowGame) : undefined,
            upcomingGames: upcoming,
        };
    }, [team?.id, currentSimDate, schedule]);

    const isFullHeightView = pathname.startsWith('/draft/') || pathname.startsWith('/rookie-draft') || pathname.startsWith('/draft-history') || pathname.startsWith('/draft-lottery');
    const isNoPaddingView = pathname === '/' || pathname.startsWith('/locker-room') || pathname.startsWith('/inbox') || pathname.startsWith('/roster') || pathname.startsWith('/standings') || pathname.startsWith('/leaderboard') || pathname.startsWith('/schedule') || pathname.startsWith('/transactions') || pathname.startsWith('/player') || pathname.startsWith('/coach') || pathname.startsWith('/gm/') || pathname.startsWith('/playoffs') || pathname.startsWith('/front-office') || pathname.startsWith('/draft-board') || pathname.startsWith('/fa-market') || pathname.startsWith('/tactics') || pathname.startsWith('/training');

    return (
        <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200 selection:bg-indigo-500/30">
            <Sidebar
                team={sidebarProps.team}
                isGuestMode={sidebarProps.isGuestMode}
                unreadMessagesCount={sidebarProps.unreadMessagesCount}
                userEmail={sidebarProps.userEmail}
                gmDisplayName={sidebarProps.gmDisplayName}
                isRegularSeasonOver={isRegularSeasonOver}
                isPostseasonOver={isPostseasonOver}
                pendingOffseasonAction={sidebarProps.pendingOffseasonAction}
                hasProspects={sidebarProps.hasProspects}
                offseasonPhase={sidebarProps.offseasonPhase}
                onResetClick={sidebarProps.onResetClick}
                onEditorClick={sidebarProps.onEditorClick}
                onSimSettingsClick={sidebarProps.onSimSettingsClick}
                onLogout={sidebarProps.onLogout}
            />
            <main className={`flex-1 relative flex flex-col transition-all duration-500 ${isFullHeightView || isNoPaddingView ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'}`}>
                {!isFullHeightView && team && (
                    <DashboardHeader
                        team={team}
                        nextGame={nextGame}
                        opponent={opponent}
                        isHome={isHome}
                        isGameToday={isGameToday}
                        isSimulating={isSimulating}
                        simProgress={simProgress}
                        onSimClick={() => userTactics && (isGameToday ? onLiveSim(userTactics) : onSim(userTactics, false))}
                        onAutoSimClick={() => userTactics && onSim(userTactics, true)}
                        currentSeries={currentSeries}
                        currentSimDate={currentSimDate}
                        conferenceRank={conferenceRank}
                        streak={streak}
                        conferenceName={conferenceName}
                        isSeasonOver={isPostseasonOver}
                        pendingOffseasonAction={sidebarProps.pendingOffseasonAction}
                        keyDates={sidebarProps.keyDates}
                        onSkipToDate={sidebarProps.onSkipToDate}
                        onSimulateFullSeason={sidebarProps.onSimulateSeason}
                        todayOpponentName={todayOpponentName}
                        tomorrowDate={tomorrowDate}
                        tomorrowOpponentName={tomorrowOpponentName}
                        upcomingGames={upcomingGames}
                        allTeams={teams}
                        coachingData={coachingData}
                        leagueGMProfiles={leagueGMProfiles}
                        onSearchViewPlayer={onSearchViewPlayer}
                        onSearchViewTeam={onSearchViewTeam}
                        onSearchViewGM={onSearchViewGM}
                        onSearchViewCoach={onSearchViewCoach}
                    />
                )}

                <div className={`flex-1 ${isFullHeightView || isNoPaddingView ? 'min-h-0' : 'p-8 lg:p-12'}`}>
                    <Suspense fallback={<ContentLoader />}>
                        {children}
                    </Suspense>
                </div>
            </main>
        </div>
    );
};

export default MainLayout;

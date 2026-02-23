
import React, { Suspense, useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { AppView, Team, Game, PlayoffSeries, GameTactics } from '../types';
import FullScreenLoader from './FullScreenLoader';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { calculatePlayerOvr } from '../utils/constants';

interface MainLayoutProps {
    children: React.ReactNode;
    sidebarProps: {
        team: Team | undefined;
        currentSimDate: string;
        currentView: AppView;
        isGuestMode: boolean;
        unreadMessagesCount: number;
        onNavigate: (view: AppView) => void;
        onResetClick: () => void;
        onLogout: () => void;
    };
    gameHeaderProps: {
        schedule: Game[];
        teams: Team[];
        onSim: (tactics: GameTactics, skipAnimation?: boolean) => void;
        onLiveSim: (tactics: GameTactics) => void;
        isSimulating: boolean;
        playoffSeries: PlayoffSeries[];
        userTactics: GameTactics | null;
    };
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, sidebarProps, gameHeaderProps }) => {
    const { team, currentSimDate } = sidebarProps;
    const { schedule, teams, onSim, onLiveSim, isSimulating, playoffSeries, userTactics } = gameHeaderProps;

    // Common logic moved from DashboardView to Layout level
    const nextGame = useMemo(() => {
        if (!team?.id) return undefined;
        const myGames = schedule.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id);
        myGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return myGames.find(g => !g.played) || myGames[myGames.length - 1];
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

    const currentSeries = useMemo(() => {
        if (!nextGame?.isPlayoff || !nextGame.seriesId || !playoffSeries) return undefined;
        return playoffSeries.find(s => s.id === nextGame.seriesId);
    }, [nextGame, playoffSeries]);

    const myOvr = useMemo(() => {
        if (!team?.roster?.length) return 0;
        return Math.round(team.roster.reduce((s, p) => s + calculatePlayerOvr(p), 0) / team.roster.length);
    }, [team?.roster]);

    const opponentOvrValue = useMemo(() => {
        if (!opponent?.roster?.length) return 0;
        return Math.round(opponent.roster.reduce((s, p) => s + calculatePlayerOvr(p), 0) / opponent.roster.length);
    }, [opponent?.roster]);

    return (
        <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200 selection:bg-indigo-500/30">
            <Sidebar {...sidebarProps} isRegularSeasonOver={isRegularSeasonOver} />
            <main className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col">
                {/* Global Game Header */}
                {team && (
                    <DashboardHeader 
                        team={team}
                        nextGame={nextGame}
                        opponent={opponent}
                        isHome={isHome}
                        myOvr={myOvr}
                        opponentOvrValue={opponentOvrValue}
                        isGameToday={isGameToday}
                        isSimulating={isSimulating}
                        onSimClick={() => userTactics && onLiveSim(userTactics)}
                        onAutoSimClick={() => userTactics && onSim(userTactics, true)}
                        currentSeries={currentSeries}
                        currentSimDate={currentSimDate}
                    />
                )}
                
                <div className="flex-1 p-8 lg:p-12">
                    <Suspense fallback={<FullScreenLoader />}>
                        {children}
                    </Suspense>
                </div>
                <Footer onNavigate={sidebarProps.onNavigate} />
            </main>
        </div>
    );
};

export default MainLayout;

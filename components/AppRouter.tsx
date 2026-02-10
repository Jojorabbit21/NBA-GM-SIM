
import React from 'react';
import { AppView, Team } from '../types';
import { GameSimulatingView } from '../views/GameSimulationView';
import { GameResultView } from '../views/GameResultView';
import { DashboardView } from '../views/DashboardView';
import { RosterView } from '../views/RosterView';
import { ScheduleView } from '../views/ScheduleView';
import { StandingsView } from '../views/StandingsView';
import { LeaderboardView } from '../views/LeaderboardView';
import { TransactionsView } from '../views/TransactionsView';
import { PlayoffsView } from '../views/PlayoffsView';
import { HelpView } from '../views/HelpView';
import { OvrCalculatorView } from '../views/OvrCalculatorView';
import { InboxView } from '../views/InboxView';
import { OnboardingView } from '../views/OnboardingView';
import { Loader2 } from 'lucide-react';

interface AppRouterProps {
    view: AppView;
    setView: (view: AppView) => void;
    gameData: any;
    sim: any;
    session: any;
    unreadCount: number;
    refreshUnreadCount: () => void;
    setToastMessage: (msg: string | null) => void;
}

const AppRouter: React.FC<AppRouterProps> = ({ 
    view, setView, gameData, sim, session, unreadCount, refreshUnreadCount, setToastMessage 
}) => {
    const myTeam = gameData.teams.find((t: Team) => t.id === gameData.myTeamId);

    if (view === 'GameSim' && sim.activeGame) {
        // [Fix] Pass pbpLogs to View so animation follows actual engine events
        const pbpLogs = sim.tempSimulationResult?.pbpLogs || [];
        
        return (
            <GameSimulatingView 
                homeTeam={gameData.teams.find((t: Team) => t.id === sim.activeGame.homeTeamId)!} 
                awayTeam={gameData.teams.find((t: Team) => t.id === sim.activeGame.awayTeamId)!} 
                userTeamId={gameData.myTeamId} 
                pbpLogs={pbpLogs}
                onSimulationComplete={() => sim.finalizeSimRef.current?.()} 
            />
        );
    }

    if (view === 'GameResult' && sim.lastGameResult) {
        return (
            <GameResultView 
                result={sim.lastGameResult} 
                myTeamId={gameData.myTeamId!} 
                teams={gameData.teams} 
                onFinish={() => { 
                    const d = new Date(gameData.currentSimDate);
                    d.setDate(d.getDate() + 1);
                    const nextDate = d.toISOString().split('T')[0];
                    gameData.setCurrentSimDate(nextDate);
                    sim.clearLastGameResult(); 
                    sim.setIsSimulating(false); 
                    setView('Dashboard'); 
                    gameData.forceSave({ currentSimDate: nextDate });
                }} 
            />
        );
    }

    switch (view) {
        case 'Dashboard':
            if (myTeam && gameData.userTactics) {
                return (
                    <DashboardView 
                        team={myTeam} teams={gameData.teams} schedule={gameData.schedule}
                        onSim={sim.handleExecuteSim} tactics={gameData.userTactics}
                        onUpdateTactics={gameData.setUserTactics} currentSimDate={gameData.currentSimDate}
                        isSimulating={sim.isSimulating}
                        onShowSeasonReview={() => setView('SeasonReview')}
                        onShowPlayoffReview={() => setView('PlayoffReview')}
                        depthChart={gameData.depthChart} onUpdateDepthChart={gameData.setDepthChart}
                    />
                );
            } else if (myTeam && !gameData.userTactics) {
                return (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 size={40} className="text-indigo-500 animate-spin" />
                    </div>
                );
            }
            return null;
        case 'Roster':
            return <RosterView allTeams={gameData.teams} myTeamId={gameData.myTeamId!} />;
        case 'Schedule':
            return <ScheduleView schedule={gameData.schedule} teamId={gameData.myTeamId!} teams={gameData.teams} onExport={() => {}} currentSimDate={gameData.currentSimDate} />;
        case 'Standings':
            return <StandingsView teams={gameData.teams} onTeamClick={() => {}} />;
        case 'Leaderboard':
            return <LeaderboardView teams={gameData.teams} />;
        case 'Transactions':
            return (
                <TransactionsView 
                    team={myTeam!} teams={gameData.teams} setTeams={gameData.setTeams}
                    addNews={() => {}} onShowToast={setToastMessage} currentSimDate={gameData.currentSimDate}
                    transactions={gameData.transactions} onAddTransaction={(tx) => gameData.setTransactions((prev: any) => [tx, ...prev])}
                    onForceSave={gameData.forceSave} userId={session?.user?.id} refreshUnreadCount={refreshUnreadCount}
                />
            );
        case 'Playoffs':
            return <PlayoffsView teams={gameData.teams} schedule={gameData.schedule} series={gameData.playoffSeries} setSeries={gameData.setPlayoffSeries} setSchedule={gameData.setSchedule} myTeamId={gameData.myTeamId!} />;
        case 'Help':
            return <HelpView onBack={() => setView('Dashboard')} />;
        case 'OvrCalculator':
            return <OvrCalculatorView teams={gameData.teams} />;
        case 'Inbox':
            return <InboxView myTeamId={gameData.myTeamId!} userId={session?.user?.id} teams={gameData.teams} onUpdateUnreadCount={refreshUnreadCount} />;
        case 'Onboarding':
            return myTeam ? <OnboardingView team={myTeam} onComplete={() => setView('Dashboard')} /> : null;
        default:
            return null;
    }
};

export default AppRouter;

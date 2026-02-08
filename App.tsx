
import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useAuth } from './hooks/useAuth';
import { useGameData } from './hooks/useGameData';
import { useSimulation } from './hooks/useSimulation';
import { GameSimulatingView } from './views/GameSimulationView';
import { GameResultView } from './views/GameResultView';
import { DashboardView } from './views/DashboardView';
import { TeamSelectView } from './views/TeamSelectView';
import { OnboardingView } from './views/OnboardingView';
import { RosterView } from './views/RosterView';
import { ScheduleView } from './views/ScheduleView';
import { StandingsView } from './views/StandingsView';
import { LeaderboardView } from './views/LeaderboardView';
import { TransactionsView } from './views/TransactionsView';
import { PlayoffsView } from './views/PlayoffsView';
import { HelpView } from './views/HelpView';
import { OvrCalculatorView } from './views/OvrCalculatorView';
import { InboxView } from './views/InboxView';
import { Sidebar } from './components/Sidebar';
import { Toast } from './components/SharedComponents';
import { AppView } from './types';
import { Loader2 } from 'lucide-react';
import { AuthView } from './views/AuthView';
import { fetchUnreadMessageCount } from './services/messageService';

/* [Fix] Added FullScreenLoader component which was missing */
const FullScreenLoader = () => (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-[1000] backdrop-blur-md">
        <Loader2 size={64} className="text-indigo-500 animate-spin mb-4 opacity-50" />
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs animate-pulse">Loading Simulation...</p>
    </div>
);

const App: React.FC = () => {
    /* [Fix] Declared view, setView, sim, gameData, session, etc. inside the component body */
    const { session, isGuestMode, setIsGuestMode, authLoading, handleLogout } = useAuth();
    const gameData = useGameData(session, isGuestMode);
    const [view, setView] = useState<AppView>('Dashboard');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);

    const advanceDate = useCallback((newDate: string, overrides: any) => {
        gameData.setCurrentSimDate(newDate);
        if (overrides.teams) gameData.setTeams(overrides.teams);
        if (overrides.schedule) gameData.setSchedule(overrides.schedule);
    }, [gameData]);

    const refreshUnreadCount = useCallback(async () => {
        if (session?.user?.id && gameData.myTeamId) {
            const count = await fetchUnreadMessageCount(session.user.id, gameData.myTeamId);
            setUnreadCount(count);
        }
    }, [session, gameData.myTeamId]);

    const sim = useSimulation(
        gameData.teams, gameData.setTeams,
        gameData.schedule, gameData.setSchedule,
        gameData.myTeamId,
        gameData.currentSimDate,
        advanceDate,
        gameData.playoffSeries, gameData.setPlayoffSeries,
        gameData.setTransactions,
        gameData.setNews,
        setToastMessage,
        gameData.forceSave,
        session, isGuestMode,
        refreshUnreadCount,
        gameData.depthChart
    );

    useEffect(() => {
        if (!authLoading && !session && !isGuestMode) {
            setView('Auth' as any);
        } else if (gameData.myTeamId && view === ('Auth' as any)) {
            setView('Dashboard');
        }
    }, [authLoading, session, isGuestMode, gameData.myTeamId, view]);

    useEffect(() => {
        refreshUnreadCount();
    }, [refreshUnreadCount, gameData.currentSimDate]);

    // Switch view to simulation or result automatically
    useEffect(() => {
        if (sim.activeGame) setView('GameSim' as any);
    }, [sim.activeGame]);

    useEffect(() => {
        if (sim.lastGameResult) setView('GameResult' as any);
    }, [sim.lastGameResult]);

    if (authLoading || gameData.isSaveLoading) return <FullScreenLoader />;
    
    if (!session && !isGuestMode) return <AuthView onGuestLogin={() => setIsGuestMode(true)} />;

    if (!gameData.myTeamId) {
        return (
            <TeamSelectView 
                teams={gameData.teams} 
                isInitializing={gameData.isBaseDataLoading} 
                onSelectTeam={gameData.handleSelectTeam} 
            />
        );
    }

    const myTeam = gameData.teams.find(t => t.id === gameData.myTeamId);

    return (
        <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200 selection:bg-indigo-500/30">
            <Sidebar 
                team={myTeam}
                currentSimDate={gameData.currentSimDate}
                currentView={view}
                isGuestMode={isGuestMode}
                unreadMessagesCount={unreadCount}
                onNavigate={setView}
                onResetClick={gameData.handleResetData}
                onLogout={handleLogout}
            />
            
            <main className="flex-1 overflow-y-auto custom-scrollbar relative p-8 lg:p-12">
                <Suspense fallback={<FullScreenLoader />}>
                    {/* [Fix] Restored GameSim logic from the provided snippet */}
                    {view === ('GameSim' as any) && sim.activeGame && (
                        <GameSimulatingView 
                            homeTeam={gameData.teams.find(t => t.id === sim.activeGame!.homeTeamId)!} 
                            awayTeam={gameData.teams.find(t => t.id === sim.activeGame!.awayTeamId)!} 
                            userTeamId={gameData.myTeamId} 
                            finalHomeScore={sim.activeGame.homeScore} 
                            finalAwayScore={sim.activeGame.awayScore} 
                            onSimulationComplete={() => sim.finalizeSimRef.current?.()} 
                        />
                    )}
                    
                    {/* [Fix] Restored GameResult logic from the provided snippet with automatic date advancement */}
                    {view === ('GameResult' as any) && sim.lastGameResult && (
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
                    )}

                    {/* Basic App Views */}
                    {view === 'Dashboard' && myTeam && (
                        <DashboardView 
                            team={myTeam}
                            teams={gameData.teams}
                            schedule={gameData.schedule}
                            onSim={sim.handleExecuteSim}
                            tactics={gameData.userTactics || { offenseTactics: ['Balance'], defenseTactics: ['ManToManPerimeter'], sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 1, zoneUsage: 2 }, starters: { PG: '', SG: '', SF: '', PF: '', C: '' }, rotationMap: {}, minutesLimits: {} }}
                            onUpdateTactics={gameData.setUserTactics}
                            currentSimDate={gameData.currentSimDate}
                            isSimulating={sim.isSimulating}
                            onShowSeasonReview={() => setView('SeasonReview' as any)}
                            onShowPlayoffReview={() => setView('PlayoffReview' as any)}
                            depthChart={gameData.depthChart}
                            onUpdateDepthChart={gameData.setDepthChart}
                        />
                    )}

                    {view === 'Roster' && (
                        <RosterView allTeams={gameData.teams} myTeamId={gameData.myTeamId!} />
                    )}

                    {view === 'Schedule' && (
                        <ScheduleView 
                            schedule={gameData.schedule} 
                            teamId={gameData.myTeamId!} 
                            teams={gameData.teams} 
                            onExport={() => {}} 
                            currentSimDate={gameData.currentSimDate} 
                        />
                    )}

                    {view === 'Standings' && (
                        <StandingsView teams={gameData.teams} onTeamClick={(id) => {}} />
                    )}

                    {view === 'Leaderboard' && (
                        <LeaderboardView teams={gameData.teams} />
                    )}

                    {view === 'Transactions' && (
                        <TransactionsView 
                            team={myTeam!} 
                            teams={gameData.teams} 
                            setTeams={gameData.setTeams} 
                            addNews={(n) => {}} 
                            onShowToast={setToastMessage} 
                            currentSimDate={gameData.currentSimDate}
                            transactions={gameData.transactions}
                            onAddTransaction={(tx) => gameData.setTransactions(prev => [tx, ...prev])}
                            onForceSave={gameData.forceSave}
                            userId={session?.user?.id}
                            refreshUnreadCount={refreshUnreadCount}
                        />
                    )}

                    {view === 'Playoffs' && (
                        <PlayoffsView 
                            teams={gameData.teams} 
                            schedule={gameData.schedule} 
                            series={gameData.playoffSeries} 
                            setSeries={gameData.setPlayoffSeries}
                            setSchedule={gameData.setSchedule}
                            myTeamId={gameData.myTeamId!}
                        />
                    )}

                    {view === 'Help' && (
                        <HelpView onBack={() => setView('Dashboard')} />
                    )}

                    {view === 'OvrCalculator' && (
                        <OvrCalculatorView teams={gameData.teams} />
                    )}

                    {view === 'Inbox' && (
                        <InboxView 
                            myTeamId={gameData.myTeamId!} 
                            userId={session?.user?.id} 
                            teams={gameData.teams} 
                            onUpdateUnreadCount={refreshUnreadCount} 
                        />
                    )}

                    {view === 'Onboarding' && myTeam && (
                        <OnboardingView team={myTeam} onComplete={() => setView('Dashboard')} />
                    )}
                </Suspense>
                
                {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
            </main>
        </div>
    );
};

/* [Fix] Added default export for App component to resolve index.tsx import error */
export default App;

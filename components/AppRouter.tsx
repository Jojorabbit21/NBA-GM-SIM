
import React, { useState, useEffect, useRef } from 'react';
import { AppView, Team, GameTactics, DraftPoolType } from '../types';
import { GameSimulatingView } from '../views/GameSimulationView';
import { LiveGameView } from '../views/LiveGameView';
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
import { FantasyDraftView } from '../views/FantasyDraftView';
import { DraftHistoryView } from '../views/DraftHistoryView';
import { DraftLotteryView } from '../views/DraftLotteryView';
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
    draftPoolType?: DraftPoolType | null;
}

const AppRouter: React.FC<AppRouterProps> = ({
    view, setView, gameData, sim, session, unreadCount, refreshUnreadCount, setToastMessage, draftPoolType
}) => {
    const myTeam = gameData.teams.find((t: Team) => t.id === gameData.myTeamId);
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
    const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
    const previousViewRef = useRef<AppView>('Dashboard');
    const scheduleMonthRef = useRef<Date | null>(null);

    // Reset selected team when leaving Roster view (unless navigating from Standings)
    useEffect(() => {
        if (view !== 'Roster') {
            setSelectedTeamId(null);
        }
    }, [view]);

    // Live Game Mode (인터랙티브 경기)
    if (view === 'LiveGame' && sim.liveGameTarget) {
        const { homeTeam, awayTeam, userGame } = sim.liveGameTarget;
        const userTactics: GameTactics = gameData.userTactics!;
        const homeDepthChart = homeTeam.id === gameData.myTeamId ? gameData.depthChart : null;
        const awayDepthChart = awayTeam.id === gameData.myTeamId ? gameData.depthChart : null;

        // 전체화면 오버레이 — 사이드바/헤더를 완전히 덮음
        return (
            <div className="fixed inset-0 z-[9999] bg-slate-950">
                <LiveGameView
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    userTeamId={gameData.myTeamId!}
                    userTactics={userTactics}
                    homeDepthChart={homeDepthChart}
                    awayDepthChart={awayDepthChart}
                    onGameEnd={async (result) => {
                        await sim.finalizeLiveGame(result);
                        setView('GameResult');
                    }}
                />
            </div>
        );
    }

    if (view === 'GameSim' && sim.activeGame) {
        // [Fix] Pass pbpLogs AND pbpShotEvents to View so animation follows actual engine events
        const pbpLogs = sim.tempSimulationResult?.pbpLogs || [];
        const pbpShotEvents = sim.tempSimulationResult?.pbpShotEvents || [];
        
        return (
            <GameSimulatingView 
                homeTeam={gameData.teams.find((t: Team) => t.id === sim.activeGame.homeTeamId)!} 
                awayTeam={gameData.teams.find((t: Team) => t.id === sim.activeGame.awayTeamId)!} 
                userTeamId={gameData.myTeamId} 
                pbpLogs={pbpLogs}
                pbpShotEvents={pbpShotEvents}
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
                    // Only advance date if it's a live simulation, not a replay
                    // Checking if currentSimDate matches the result date can be tricky due to timezones,
                    // but usually "Finish" implies moving on.
                    // However, if we came from Inbox, we just want to go back to Inbox or Dashboard without advancing.
                    // For now, let's keep it simple: if it was a real sim, date was advanced INSIDE useSimulation.
                    // Here we just clear the view.
                    
                    // Actually, date advancement is triggered here in original code.
                    // We need to know if this is a "Replay" or "Live".
                    // A simple check: if gameData.currentSimDate == result.date, it's likely Live (or same day replay).
                    // If result.date < currentSimDate, it is definitely a replay.
                    
                    const resultDate = new Date(sim.lastGameResult.date);
                    const currentDate = new Date(gameData.currentSimDate);
                    
                    // If result is from the past, go back to wherever we came from
                    if (resultDate < currentDate) {
                        sim.clearLastGameResult();
                        setView(previousViewRef.current);
                    } else {
                        // Live Sim completion logic
                        const d = new Date(gameData.currentSimDate);
                        d.setDate(d.getDate() + 1);
                        const nextDate = d.toISOString().split('T')[0];
                        gameData.setCurrentSimDate(nextDate);
                        sim.clearLastGameResult(); 
                        sim.setIsSimulating(false); 
                        setView('Dashboard'); 
                        gameData.forceSave({ currentSimDate: nextDate });
                    }
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
                        onForceSave={gameData.forceSave}
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
            return <RosterView allTeams={gameData.teams} myTeamId={gameData.myTeamId!} initialTeamId={selectedTeamId} />;
        case 'Schedule':
            return (
                <ScheduleView
                    schedule={gameData.schedule}
                    teamId={gameData.myTeamId!}
                    teams={gameData.teams}
                    currentSimDate={gameData.currentSimDate}
                    userId={session?.user?.id}
                    initialMonth={scheduleMonthRef.current}
                    onMonthChange={(d: Date) => { scheduleMonthRef.current = d; }}
                    onViewGameResult={(result) => {
                        previousViewRef.current = 'Schedule';
                        sim.loadSavedGameResult(result);
                        setView('GameResult');
                    }}
                />
            );
        case 'Standings':
            return (
                <StandingsView
                    teams={gameData.teams}
                    schedule={gameData.schedule}
                    onTeamClick={(id) => {
                        setSelectedTeamId(id);
                        setView('Roster');
                    }}
                />
            );
        case 'Leaderboard':
            return <LeaderboardView teams={gameData.teams} schedule={gameData.schedule} />;
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
            return <OvrCalculatorView teams={gameData.teams} freeAgents={gameData.freeAgents} />;
        case 'Inbox':
            return (
                <InboxView
                    myTeamId={gameData.myTeamId!}
                    userId={session?.user?.id}
                    teams={gameData.teams}
                    onUpdateUnreadCount={refreshUnreadCount}
                    onViewGameResult={(result) => {
                        previousViewRef.current = 'Inbox';
                        sim.loadSavedGameResult(result);
                        setView('GameResult');
                    }}
                />
            );
        case 'DraftLottery':
            return (
                <DraftLotteryView
                    myTeamId={gameData.myTeamId!}
                    savedOrder={gameData.draftPicks?.order || null}
                    onSaveOrder={async (order) => {
                        await gameData.saveDraftOrder(order, draftPoolType || 'alltime');
                    }}
                    onComplete={(order) => {
                        setDraftOrder(order);
                        setView('DraftRoom');
                    }}
                />
            );
        case 'DraftRoom':
            return (
                <div className="fixed inset-0 z-[9999] bg-slate-950">
                    <FantasyDraftView
                        teams={gameData.teams}
                        myTeamId={gameData.myTeamId!}
                        draftPoolType={draftPoolType || gameData.draftPicks?.poolType || 'alltime'}
                        freeAgents={gameData.freeAgents}
                        draftTeamOrder={draftOrder || gameData.draftPicks?.order}
                        onBack={() => setView('Dashboard')}
                        onComplete={(picks) => {
                            gameData.handleDraftComplete(picks);
                            setView('Dashboard');
                        }}
                    />
                </div>
            );
        case 'DraftHistory':
            return (
                <DraftHistoryView
                    myTeamId={gameData.myTeamId!}
                    draftPicks={gameData.draftPicks}
                />
            );
        default:
            return null;
    }
};

export default AppRouter;

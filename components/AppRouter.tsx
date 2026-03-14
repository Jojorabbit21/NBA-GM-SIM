
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppView, Team, Player, GameTactics, DraftPoolType } from '../types';
import { GameSimulatingView } from '../views/GameSimulationView';
import { LiveGameView } from '../views/LiveGameView';
import { GameResultView } from '../views/GameResultView';

import { DashboardView, DashboardTab } from '../views/DashboardView';
import { RosterView } from '../views/RosterView';
import { ScheduleView } from '../views/ScheduleView';
import { StandingsView } from '../views/StandingsView';
import { LeaderboardView, LeaderboardFilterState } from '../views/LeaderboardView';
import { TransactionsView } from '../views/TransactionsView';
import { PlayoffsView } from '../views/PlayoffsView';
import { HelpView } from '../views/HelpView';
import { OvrCalculatorView } from '../views/OvrCalculatorView';
import { InboxView } from '../views/InboxView';
import { FantasyDraftView } from '../views/FantasyDraftView';
import { DraftHistoryView } from '../views/DraftHistoryView';
import { DraftLotteryView } from '../views/DraftLotteryView';
import { PlayerDetailView } from '../views/PlayerDetailView';
import { CoachDetailView } from '../views/CoachDetailView';
import { GMDetailView } from '../views/GMDetailView';
import { HallOfFameView } from '../views/HallOfFameView';
import { FrontOfficeView } from '../views/FrontOfficeView';
import { calculatePlayerOvr } from '../utils/constants';
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
    const [viewPlayerData, setViewPlayerData] = useState<{ player: Player; teamName?: string; teamId?: string } | null>(null);
    const [viewCoachData, setViewCoachData] = useState<{ coach: any; teamId: string } | null>(null);
    const [viewGMTeamId, setViewGMTeamId] = useState<string | null>(null);
    const previousViewRef = useRef<AppView>('Dashboard');
    const scheduleMonthRef = useRef<Date | null>(null);
    const leaderboardStateRef = useRef<LeaderboardFilterState | null>(null);
    const [dashboardInitialTab, setDashboardInitialTab] = useState<DashboardTab | undefined>(undefined);

    const handleViewPlayer = useCallback((player: Player, teamId?: string, teamName?: string) => {
        setViewPlayerData({ player, teamName, teamId });
        previousViewRef.current = view;
        setView('PlayerDetail');
    }, [view, setView]);

    const handleViewCoach = useCallback((teamId: string) => {
        const coach = gameData.coachingData?.[teamId]?.headCoach;
        if (!coach) return;
        setViewCoachData({ coach, teamId });
        previousViewRef.current = view;
        setView('CoachDetail');
    }, [view, setView, gameData.coachingData]);

    const handleViewGM = useCallback((teamId: string) => {
        const gm = gameData.leagueGMProfiles?.[teamId];
        if (!gm) return;
        setViewGMTeamId(teamId);
        previousViewRef.current = view;
        setView('GMDetail');
    }, [view, setView, gameData.leagueGMProfiles]);

    // Reset selected team when leaving Roster view (preserve when navigating to GameResult/PlayerDetail so back works)
    useEffect(() => {
        if (view !== 'Roster' && view !== 'GameResult' && view !== 'PlayerDetail') {
            setSelectedTeamId(null);
        }
        // Dashboard 탭 초기값은 한 번 소비 후 리셋
        if (view !== 'Dashboard') {
            setDashboardInitialTab(undefined);
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
                    tendencySeed={gameData.tendencySeed || undefined}
                    simSettings={gameData.simSettings}
                    onGameEnd={async (result) => {
                        await sim.finalizeLiveGame(result);
                        setView('GameResult');
                    }}
                />
            </div>
        );
    }

    // Hall of Fame — 풀스크린 오버레이
    if (view === 'HallOfFame') {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-950">
                <HallOfFameView
                    currentUserId={session?.user?.id}
                    currentHofId={gameData.hofId}
                    onBack={() => setView(previousViewRef.current)}
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
                coachingData={gameData.coachingData}
                onFinish={() => {
                    const resultDate = new Date(sim.lastGameResult.date);
                    const currentDate = new Date(gameData.currentSimDate);

                    if (resultDate < currentDate) {
                        sim.clearLastGameResult();
                        setView(previousViewRef.current);
                    } else {
                        const d = new Date(gameData.currentSimDate);
                        d.setDate(d.getDate() + 1);
                        const nextDate = d.toISOString().split('T')[0];
                        gameData.setCurrentSimDate(nextDate);
                        sim.clearLastGameResult();
                        sim.setIsSimulating(false);
                        setView('Dashboard');
                        gameData.forceSave({ currentSimDate: nextDate, withSnapshot: true });
                    }
                }}
            />
        );
    }

    // AI 경기 참관 오버레이 (리그 일정에서 참관 시 — LiveGameView 재사용)
    if (sim.spectateTarget) {
        return (
            <div className="fixed inset-0 z-[9999] bg-slate-950">
                <LiveGameView
                    homeTeam={sim.spectateTarget.homeTeam}
                    awayTeam={sim.spectateTarget.awayTeam}
                    userTeamId={null}
                    simSettings={gameData.simSettings}
                    onGameEnd={async (result) => {
                        await sim.finalizeSpectateGame(result);
                        setView('Schedule');
                    }}
                />
            </div>
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
                        depthChart={gameData.depthChart} onUpdateDepthChart={gameData.setDepthChart}
                        onForceSave={gameData.forceSave}
                        tendencySeed={gameData.tendencySeed || undefined}
                        onViewPlayer={handleViewPlayer}
                        userId={session?.user?.id}
                        onViewGameResult={(result) => {
                            previousViewRef.current = 'Dashboard';
                            sim.loadSavedGameResult(result);
                            setView('GameResult');
                        }}
                        coachingData={gameData.coachingData}
                        initialTab={dashboardInitialTab}
                        onCoachClick={handleViewCoach}
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
        case 'PlayerDetail':
            if (viewPlayerData) {
                return (
                    <PlayerDetailView
                        player={{...viewPlayerData.player, ovr: calculatePlayerOvr(viewPlayerData.player)}}
                        teamName={viewPlayerData.teamName}
                        teamId={viewPlayerData.teamId}
                        allTeams={gameData.teams}
                        tendencySeed={gameData.tendencySeed || undefined}
                        onBack={() => {
                            setViewPlayerData(null);
                            setView(previousViewRef.current);
                        }}
                    />
                );
            }
            setView('Dashboard');
            return null;
        case 'CoachDetail':
            if (viewCoachData) {
                return (
                    <CoachDetailView
                        coach={viewCoachData.coach}
                        teamId={viewCoachData.teamId}
                        onBack={() => {
                            setViewCoachData(null);
                            setView(previousViewRef.current);
                        }}
                    />
                );
            }
            setView('Dashboard');
            return null;
        case 'GMDetail':
            if (viewGMTeamId && gameData.leagueGMProfiles?.[viewGMTeamId]) {
                return (
                    <GMDetailView
                        gmProfile={gameData.leagueGMProfiles[viewGMTeamId]}
                        teamId={viewGMTeamId}
                        teams={gameData.teams}
                        leagueGMProfiles={gameData.leagueGMProfiles}
                        myTeamId={gameData.myTeamId}
                        userNickname={session?.user?.email?.split('@')[0]}
                        onBack={() => {
                            setViewGMTeamId(null);
                            setView(previousViewRef.current);
                        }}
                        onViewGM={(id) => setViewGMTeamId(id)}
                    />
                );
            }
            setView('Dashboard');
            return null;
        case 'Roster':
            return <RosterView allTeams={gameData.teams} myTeamId={gameData.myTeamId!} initialTeamId={selectedTeamId} tendencySeed={gameData.tendencySeed || undefined} onViewPlayer={handleViewPlayer} schedule={gameData.schedule} userId={session?.user?.id} onViewGameResult={(result) => { previousViewRef.current = 'Roster'; sim.loadSavedGameResult(result); setView('GameResult'); }} coachingData={gameData.coachingData} onCoachClick={(coachTeamId) => { handleViewCoach(coachTeamId); }} onGMClick={handleViewGM} leaguePickAssets={gameData.leaguePickAssets} leagueGMProfiles={gameData.leagueGMProfiles} userNickname={session?.user?.email?.split('@')[0]} />;
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
                    onSpectateGame={(gameId: string) => {
                        if (gameData.userTactics) {
                            sim.handleExecuteSim(gameData.userTactics, false, gameId);
                        }
                    }}
                    onStartUserGame={() => {
                        if (gameData.userTactics) {
                            sim.handleStartLiveGame(gameData.userTactics);
                        }
                    }}
                    isSimulating={sim.isSimulating}
                    playoffSeries={gameData.playoffSeries}
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
            return <LeaderboardView teams={gameData.teams} schedule={gameData.schedule} tendencySeed={gameData.tendencySeed || undefined} onViewPlayer={handleViewPlayer} onTeamClick={(id) => { setSelectedTeamId(id); setView('Roster'); }} savedState={leaderboardStateRef.current} onStateChange={(s) => { leaderboardStateRef.current = s; }} />;
        case 'Transactions':
            return (
                <TransactionsView
                    team={myTeam!} teams={gameData.teams} setTeams={gameData.setTeams}
                    addNews={() => {}} onShowToast={setToastMessage} currentSimDate={gameData.currentSimDate}
                    transactions={gameData.transactions} onAddTransaction={(tx) => gameData.setTransactions((prev: any) => [tx, ...prev])}
                    onForceSave={gameData.forceSave} userId={session?.user?.id} refreshUnreadCount={refreshUnreadCount}
                    tendencySeed={gameData.tendencySeed || undefined}
                    onViewPlayer={handleViewPlayer}
                    userTactics={gameData.userTactics ?? undefined}
                    setUserTactics={gameData.setUserTactics}
                    leagueTradeBlocks={gameData.leagueTradeBlocks}
                    setLeagueTradeBlocks={gameData.setLeagueTradeBlocks}
                    leagueTradeOffers={gameData.leagueTradeOffers}
                    setLeagueTradeOffers={gameData.setLeagueTradeOffers}
                    leaguePickAssets={gameData.leaguePickAssets ?? undefined}
                    setLeaguePickAssets={gameData.setLeaguePickAssets}
                    leagueGMProfiles={gameData.leagueGMProfiles}
                />
            );
        case 'Playoffs':
            return <PlayoffsView
                teams={gameData.teams} schedule={gameData.schedule} series={gameData.playoffSeries}
                setSeries={gameData.setPlayoffSeries} setSchedule={gameData.setSchedule} myTeamId={gameData.myTeamId!}
                userId={session?.user?.id}
                onViewGameResult={(result) => {
                    previousViewRef.current = 'Playoffs';
                    sim.loadSavedGameResult(result);
                    setView('GameResult');
                }}
            />;
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
                    tendencySeed={gameData.tendencySeed || undefined}
                    currentSimDate={gameData.currentSimDate}
                    onViewPlayer={handleViewPlayer}
                    onViewGameResult={(result) => {
                        previousViewRef.current = 'Inbox';
                        sim.loadSavedGameResult(result);
                        setView('GameResult');
                    }}
                    onNavigateToHof={() => {
                        previousViewRef.current = 'Inbox';
                        setView('HallOfFame');
                    }}
                />
            );
        case 'DraftLottery':
            return (
                <DraftLotteryView
                    myTeamId={gameData.myTeamId!}
                    savedOrder={gameData.draftPicks?.order || null}
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
        case 'FrontOffice':
            return (
                <FrontOfficeView
                    team={myTeam!}
                    teams={gameData.teams}
                    currentSimDate={gameData.currentSimDate}
                    myTeamId={gameData.myTeamId!}
                    coachingData={gameData.coachingData}
                    onCoachClick={handleViewCoach}
                    onGMClick={handleViewGM}
                    leaguePickAssets={gameData.leaguePickAssets}
                    leagueGMProfiles={gameData.leagueGMProfiles}
                    userNickname={session?.user?.email?.split('@')[0]}
                />
            );
        default:
            return null;
    }
};

export default AppRouter;

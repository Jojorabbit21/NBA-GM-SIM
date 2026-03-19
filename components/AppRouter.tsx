
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppView, Team, Player, GameTactics, DraftPoolType, DeadMoneyEntry, ReleaseType } from '../types';
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
import { InboxView } from '../views/InboxView';
import { FantasyDraftView } from '../views/FantasyDraftView';
import { RookieDraftView } from '../views/RookieDraftView';
import { DraftView } from '../views/DraftView';
import { DraftHistoryView } from '../views/DraftHistoryView';
import { DraftLotteryView } from '../views/DraftLotteryView';
import { PlayerDetailView } from '../views/PlayerDetailView';
import { CoachDetailView } from '../views/CoachDetailView';
import { GMDetailView } from '../views/GMDetailView';
import { HallOfFameView } from '../views/HallOfFameView';
import { FrontOfficeView } from '../views/FrontOfficeView';
import { FAView } from '../views/FAView';
import { calculatePlayerOvr } from '../utils/constants';
import { Loader2 } from 'lucide-react';
import { sendMessage } from '../services/messageService';
import { TEAM_DATA } from '../data/teamData';
import { LotteryResultContent, LotteryResultEntry, FASigningContent, FAReleaseContent, ExtensionSignedContent } from '../types/message';
import { releasePlayerToMarket } from '../services/fa/faMarketBuilder';

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
    const seasonShort: string = gameData.seasonConfig?.seasonShort ?? '2025-26';
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
                    seasonShort={seasonShort}
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
                        seasonStartYear={gameData.seasonConfig?.startYear}
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
                        seasonShort={seasonShort}
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
                        onBack={() => {
                            setViewGMTeamId(null);
                            setView(previousViewRef.current);
                        }}
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
                    seasonStartYear={gameData.seasonConfig?.startYear}
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
                    seasonConfig={gameData.seasonConfig ?? undefined}
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
        case 'Inbox':
            return (
                <InboxView
                    myTeamId={gameData.myTeamId!}
                    userId={session?.user?.id}
                    teams={gameData.teams}
                    onUpdateUnreadCount={refreshUnreadCount}
                    tendencySeed={gameData.tendencySeed || undefined}
                    currentSimDate={gameData.currentSimDate}
                    seasonShort={seasonShort}
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
                    onNavigateToDraft={() => {
                        previousViewRef.current = 'Inbox';
                        setView('DraftBoard');
                    }}
                    onNavigateToDraftLottery={() => {
                        previousViewRef.current = 'Inbox';
                        setView('DraftLottery');
                    }}
                    onTeamOptionExecuted={(playerId, exercised) => {
                        const newTeams = gameData.teams.map(t => {
                            if (t.id !== gameData.myTeamId) return t;
                            if (exercised) {
                                // 행사: 옵션 필드 제거 (다음 시즌 중복 체크 방지)
                                return { ...t, roster: t.roster.map(p =>
                                    p.id === playerId && p.contract?.option
                                        ? { ...p, contract: { ...p.contract, option: undefined } }
                                        : p
                                ) };
                            } else {
                                // 거부: 로스터에서 제거
                                return { ...t, roster: t.roster.filter(p => p.id !== playerId) };
                            }
                        });
                        gameData.setTeams(newTeams);
                        gameData.forceSave({ teams: newTeams, withSnapshot: true });
                    }}
                />
            );
        case 'DraftLottery':
            return (
                <DraftLotteryView
                    myTeamId={gameData.myTeamId!}
                    savedOrder={gameData.lotteryResult?.finalOrder || gameData.draftPicks?.order || null}
                    lotteryMetadata={gameData.lotteryResult || null}
                    resolvedDraftOrder={gameData.resolvedDraftOrder || null}
                    seasonShort={seasonShort}
                    onComplete={(order) => {
                        setDraftOrder(order);
                        // 오프시즌 로터리 (판타지 드래프트가 아닌 경우) → 대시보드로 복귀
                        if (!gameData.draftPicks?.order) {
                            // 로터리 확인 완료 → viewed 플래그 저장 (새로고침 시 재진입 방지)
                            if (gameData.lotteryResult) {
                                const updatedResult = { ...gameData.lotteryResult, viewed: true };
                                gameData.setLotteryResult(updatedResult);
                                gameData.forceSave({ lotteryResult: updatedResult });

                                // 로터리 결과 인박스 발송 (사용자가 추첨 애니메이션을 본 뒤에만 발송 — 스포일러 방지)
                                if (session?.user?.id && gameData.myTeamId) {
                                    const lr = gameData.lotteryResult;
                                    const resolved = gameData.resolvedDraftOrder;
                                    const lotteryTeamMap = new Map<string, any>(lr.lotteryTeams.map((lt: any) => [lt.teamId, lt]));
                                    const movementMap = new Map<string, any>(lr.pickMovements.map((pm: any) => [pm.teamId, pm]));
                                    const resolvedPickMap = resolved?.picks
                                        ? new Map<number, any>(resolved.picks.map((p: any) => [p.pickNumber, p]))
                                        : null;
                                    const myPick = lr.finalOrder.indexOf(gameData.myTeamId) + 1;
                                    const entries: LotteryResultEntry[] = lr.finalOrder.map((teamId: string, i: number) => {
                                        const pick = i + 1;
                                        const team = gameData.teams.find((t: Team) => t.id === teamId);
                                        const td = TEAM_DATA[teamId];
                                        const lt = lotteryTeamMap.get(teamId);
                                        const mv = movementMap.get(teamId);
                                        const resolvedPick = resolvedPickMap?.get(pick);
                                        const currentOwner = resolvedPick && resolvedPick.currentTeamId !== teamId ? resolvedPick.currentTeamId : undefined;
                                        const currentOwnerTd = currentOwner ? TEAM_DATA[currentOwner] : undefined;
                                        return {
                                            pick,
                                            teamId,
                                            teamName: td ? `${td.city} ${td.name}` : teamId,
                                            wins: team?.wins ?? 0,
                                            losses: team?.losses ?? 0,
                                            odds: lt ? lt.odds : 0,
                                            movement: mv ? (mv.preLotteryPosition - mv.finalPosition) : 0,
                                            isLotteryTeam: !!lt,
                                            currentTeamId: currentOwner,
                                            currentTeamName: currentOwnerTd ? `${currentOwnerTd.city} ${currentOwnerTd.name}` : currentOwner,
                                            pickNote: resolvedPick?.note,
                                        };
                                    });
                                    const lotteryContent: LotteryResultContent = { myTeamPick: myPick, entries };
                                    const lotteryMsgTitle = gameData.seasonConfig?.seasonLabel
                                        ? `[리그 소식] ${gameData.seasonConfig.seasonLabel} 드래프트 로터리 추첨 결과`
                                        : '[리그 소식] 드래프트 로터리 추첨 결과';
                                    sendMessage(session.user.id, gameData.myTeamId, gameData.currentSimDate, 'LOTTERY_RESULT', lotteryMsgTitle, lotteryContent)
                                        .then(() => refreshUnreadCount())
                                        .catch(e => console.warn('⚠️ Lottery result message failed:', e));
                                }
                            }
                            setView('Dashboard');
                        } else {
                            setView('DraftRoom');
                        }
                    }}
                />
            );
        case 'DraftBoard':
            // 드래프트 보드 + 로터리 결과 통합 뷰
            if (gameData.prospects?.length > 0) {
                return (
                    <DraftView
                        prospects={gameData.prospects}
                        onDraft={() => {}}
                        team={myTeam!}
                        readOnly
                        lotteryResult={gameData.lotteryResult}
                        resolvedDraftOrder={gameData.resolvedDraftOrder || null}
                        teams={gameData.teams}
                        myTeamId={gameData.myTeamId || undefined}
                    />
                );
            }
            return null;
        case 'DraftRoom':
            // 오프시즌 루키 드래프트 (prospects 존재 = 루키 드래프트 모드)
            if (gameData.prospects?.length > 0) {
                // lotteryResult 없으면 팀 ID 배열을 기본 순서로 사용 (RookieDraftView가 snake order fallback 처리)
                const draftTeamOrder = gameData.lotteryResult?.finalOrder || gameData.teams.map((t: Team) => t.id);
                return (
                    <div className="fixed inset-0 z-[9999] bg-slate-950">
                        <RookieDraftView
                            teams={gameData.teams}
                            myTeamId={gameData.myTeamId!}
                            draftOrder={draftTeamOrder}
                            resolvedDraftOrder={gameData.resolvedDraftOrder || null}
                            draftClass={gameData.prospects}
                            onComplete={(picks) => {
                                gameData.handleRookieDraftComplete(picks);
                                setView('Dashboard');
                            }}
                        />
                    </div>
                );
            }
            // 판타지 드래프트 (게임 시작 시 커스텀 모드)
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
                    seasonShort={seasonShort}
                    coachingData={gameData.coachingData}
                    onCoachClick={handleViewCoach}
                    onGMClick={handleViewGM}
                    leaguePickAssets={gameData.leaguePickAssets}
                    leagueGMProfiles={gameData.leagueGMProfiles}
                    userNickname={session?.user?.email?.split('@')[0]}
                />
            );
        case 'FAMarket': {
            const currentSeasonYear = new Date(gameData.currentSimDate).getFullYear();
            return (
                <FAView
                    leagueFAMarket={gameData.leagueFAMarket ?? null}
                    faPlayerMap={gameData.faPlayerMap ?? {}}
                    myTeam={myTeam!}
                    teams={gameData.teams}
                    tendencySeed={gameData.tendencySeed || ''}
                    currentSeasonYear={currentSeasonYear}
                    currentSeason={seasonShort}
                    onOfferAccepted={(playerId, contract, signingType, updatedMarket) => {
                        const faPlayer = gameData.faPlayerMap?.[playerId];
                        if (!faPlayer) return;
                        const salary = contract.years[contract.currentYear] ?? contract.years[0];
                        const signedPlayer = {
                            ...faPlayer,
                            contract,
                            salary,
                            contractYears: contract.years.length,
                            teamTenure: 0,
                        };
                        const newTeams = gameData.teams.map((t: Team) =>
                            t.id === gameData.myTeamId
                                ? { ...t, roster: [...t.roster, signedPlayer] }
                                : t
                        );
                        gameData.setTeams(newTeams);
                        // players 배열 유지 (faPlayerMap 재구성용)
                        const marketWithPlayers = { ...updatedMarket, players: gameData.leagueFAMarket?.players };
                        gameData.setLeagueFAMarket(marketWithPlayers);
                        gameData.forceSave({ teams: newTeams, leagueFAMarket: marketWithPlayers });
                        // FA_SIGNING 서신 발송
                        if (session?.user?.id && gameData.myTeamId) {
                            const signingContent: FASigningContent = {
                                playerId,
                                playerName: faPlayer.name,
                                position: faPlayer.position,
                                ovr: faPlayer.ovr,
                                salary,
                                years: contract.years.length,
                                signingType,
                            };
                            sendMessage(session.user.id, gameData.myTeamId, gameData.currentSimDate,
                                'FA_SIGNING', `[FA 서명] ${faPlayer.name} 영입 완료`, signingContent);
                        }
                        // 트랜잭션 기록
                        gameData.setTransactions((prev: any) => [{
                            id: `fa_${playerId}_${Date.now()}`,
                            date: gameData.currentSimDate,
                            type: 'fa_signing',
                            teamId: gameData.myTeamId,
                            description: `FA 서명: ${faPlayer.name} (${signingType})`,
                            details: null,
                        }, ...prev]);
                    }}
                    onReleasePlayer={(playerId, releaseType, buyoutAmount) => {
                        const player = myTeam?.roster.find((p: Player) => p.id === playerId);
                        if (!player) return;

                        const contract = player.contract;
                        const totalRemaining = contract && contract.years.length > 0
                            ? contract.years.slice(contract.currentYear).reduce((s: number, v: number) => s + v, 0)
                            : (player.salary ?? 0);
                        const remainingYears = contract
                            ? contract.years.length - contract.currentYear
                            : 1;

                        // 방출 방식별 데드캡 계산
                        let deadAmount: number;
                        let stretchYearsTotal: number | undefined;

                        if (releaseType === 'waive') {
                            deadAmount = totalRemaining;
                        } else if (releaseType === 'stretch') {
                            stretchYearsTotal = Math.max(1, 2 * remainingYears - 1);
                            deadAmount = Math.round(totalRemaining / stretchYearsTotal);
                        } else {
                            // buyout: 협의된 금액 (최소값 보장)
                            deadAmount = buyoutAmount ?? totalRemaining;
                        }

                        const newDeadEntry: DeadMoneyEntry = {
                            playerId: player.id,
                            playerName: player.name,
                            amount: deadAmount,
                            season: gameData.currentSeason ?? '',
                            releaseType,
                            ...(stretchYearsTotal !== undefined && {
                                stretchYearsTotal,
                                stretchYearsRemaining: stretchYearsTotal,
                            }),
                        };

                        const newTeams = gameData.teams.map((t: Team) =>
                            t.id === gameData.myTeamId
                                ? {
                                    ...t,
                                    roster: t.roster.filter((p: Player) => p.id !== playerId),
                                    deadMoney: [...(t.deadMoney ?? []), newDeadEntry],
                                }
                                : t
                        );
                        gameData.setTeams(newTeams);
                        const allPlayers = newTeams.flatMap((t: Team) => t.roster);
                        const updatedMarket = releasePlayerToMarket(
                            gameData.leagueFAMarket ?? null,
                            player,
                            allPlayers,
                            newTeams,
                            gameData.currentSimDate,
                            gameData.tendencySeed ?? '',
                            currentSeasonYear,
                            seasonShort,
                            gameData.myTeamId ?? undefined,
                        );
                        gameData.setLeagueFAMarket(updatedMarket);

                        // FA_RELEASE 서신 발송
                        if (session?.user?.id && gameData.myTeamId) {
                            const prevSalary = player.salary ?? player.contract?.years[player.contract?.currentYear ?? 0] ?? 0;
                            const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
                                waive:   '웨이브',
                                stretch: '스트레치 웨이브',
                                buyout:  '바이아웃',
                            };
                            const releaseContent: FAReleaseContent = {
                                playerId,
                                playerName: player.name,
                                position: player.position,
                                ovr: player.ovr,
                                prevSalary,
                                releaseType,
                                deadCapAmount: deadAmount,
                            };
                            sendMessage(session.user.id, gameData.myTeamId, gameData.currentSimDate,
                                'FA_RELEASE',
                                `[${RELEASE_TYPE_LABELS[releaseType]}] ${player.name} 방출`,
                                releaseContent);
                        }
                        // 트랜잭션 기록
                        gameData.setTransactions((prev: any) => [{
                            id: `rel_${playerId}_${Date.now()}`,
                            date: gameData.currentSimDate,
                            type: 'fa_release',
                            teamId: gameData.myTeamId,
                            description: `방출(${releaseType}): ${player.name} — 데드캡 ${(deadAmount / 1_000_000).toFixed(1)}M`,
                            details: null,
                        }, ...prev]);
                        gameData.forceSave({ teams: newTeams, leagueFAMarket: updatedMarket });
                    }}
                    onExtensionOffer={(playerId, contract) => {
                        const player = myTeam?.roster.find((p: Player) => p.id === playerId);
                        if (!player) return;
                        const newTeams = gameData.teams.map((t: Team) => {
                            if (t.id !== gameData.myTeamId) return t;
                            return {
                                ...t,
                                roster: t.roster.map((p: Player) =>
                                    p.id !== playerId ? p : {
                                        ...p,
                                        contract,
                                        salary: contract.years[0],
                                        contractYears: contract.years.length,
                                    }
                                ),
                            };
                        });
                        gameData.setTeams(newTeams);
                        gameData.forceSave({ teams: newTeams });
                        if (session?.user?.id && gameData.myTeamId) {
                            const extContent: ExtensionSignedContent = {
                                playerId,
                                playerName: player.name,
                                position: player.position,
                                ovr: player.ovr,
                                salary: contract.years[0],
                                years: contract.years.length,
                            };
                            sendMessage(session.user.id, gameData.myTeamId, gameData.currentSimDate,
                                'EXTENSION_SIGNED', `[계약 익스텐션] ${player.name}과 연장 계약 체결`, extContent);
                        }
                    }}
                    onTeamOptionDecide={(playerId, exercised) => {
                        const newTeams = gameData.teams.map((t: Team) => {
                            if (t.id !== gameData.myTeamId) return t;
                            if (exercised) {
                                // 행사: 옵션 필드 제거 (다음 시즌 중복 체크 방지)
                                return { ...t, roster: t.roster.map((p: Player) =>
                                    p.id === playerId && p.contract?.option
                                        ? { ...p, contract: { ...p.contract, option: undefined } }
                                        : p
                                ) };
                            } else {
                                // 거부: 로스터에서 제거 (FA로 이동)
                                return { ...t, roster: t.roster.filter((p: Player) => p.id !== playerId) };
                            }
                        });
                        gameData.setTeams(newTeams);
                        gameData.forceSave({ teams: newTeams, withSnapshot: true });
                    }}
                    onViewPlayer={handleViewPlayer}
                />
            );
        }
        default:
            return null;
    }
};

export default AppRouter;

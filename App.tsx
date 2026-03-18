
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { useGameData } from './hooks/useGameData';
import { useSimulation } from './hooks/useSimulation';
import { TeamSelectView } from './views/TeamSelectView';
import { AuthView } from './views/AuthView';
import { Toast } from './components/SharedComponents';
import { AppView, RosterMode, DraftPoolType } from './types';
import { PendingOffseasonAction } from './types/app';
import { TEAM_DATA } from './data/teamData';
import { fetchUnreadMessageCount } from './services/messageService';
import { useFullSeasonSim } from './hooks/useFullSeasonSim';
import { FullSeasonSimModal } from './components/simulation/FullSeasonSimModal';
import { checkUserHasSubmitted } from './services/hallOfFameService';
import { useUpdateChecker } from './hooks/useUpdateChecker';
import { UpdateToast } from './components/UpdateToast';

// 신규 생성된 모듈 모듈 임포트
import FullScreenLoader, { DatabaseErrorView } from './components/FullScreenLoader';
import SkeletonLoader from './components/SkeletonLoader';
import MainLayout from './components/MainLayout';
import AppRouter from './components/AppRouter';
import { ResetDataModal } from './components/ResetDataModal';
import { EditorModal } from './components/EditorModal';
import { SimSettingsModal } from './components/SimSettingsModal';
import { OnboardingView } from './views/OnboardingView';
import { ModeSelectView } from './views/ModeSelectView';
import { DraftPoolSelectView } from './views/DraftPoolSelectView';

const App: React.FC = () => {
    const queryClient = useQueryClient();
    const { session, isGuestMode, setIsGuestMode, authLoading, handleLogout } = useAuth();
    const [rosterMode, setRosterMode] = useState<RosterMode | null>(null);
    const gameData = useGameData(session, isGuestMode, rosterMode);
    const [view, setView] = useState<AppView>('Dashboard');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
    const [draftPoolType, setDraftPoolType] = useState<DraftPoolType | null>(null);
    const [hasSubmittedHof, setHasSubmittedHof] = useState(false);
    const updateAvailable = useUpdateChecker();
    const [updateDismissed, setUpdateDismissed] = useState(false);
    const handleResetClick = useCallback(() => setIsResetModalOpen(true), []);
    const handleEditorClick = useCallback(() => setIsEditorModalOpen(true), []);
    const [isSimSettingsOpen, setIsSimSettingsOpen] = useState(false);
    const handleSimSettingsClick = useCallback(() => setIsSimSettingsOpen(true), []);

    const advanceDate = useCallback((newDate: string, overrides: any) => {
        gameData.setCurrentSimDate(newDate);
        if (overrides.teams) gameData.setTeams(overrides.teams);
        if (overrides.schedule) gameData.setSchedule(overrides.schedule);
        if (overrides.seasonNumber) gameData.setSeasonNumber(overrides.seasonNumber);
        if (overrides.currentSeason) gameData.setCurrentSeason(overrides.currentSeason);
    }, [gameData]);

    const refreshUnreadCount = useCallback(async () => {
        if (session?.user?.id && gameData.myTeamId) {
            const count = await fetchUnreadMessageCount(session.user.id, gameData.myTeamId);
            setUnreadCount(count);
        }
    }, [session, gameData.myTeamId]);

    const sim = useSimulation(
        gameData.teams, gameData.setTeams, gameData.schedule, gameData.setSchedule,
        gameData.myTeamId, gameData.currentSimDate, advanceDate,
        gameData.playoffSeries, gameData.setPlayoffSeries,
        gameData.transactions, gameData.setTransactions,
        gameData.setNews, setToastMessage, gameData.forceSave,
        session, isGuestMode, refreshUnreadCount, gameData.depthChart,
        gameData.tendencySeed || undefined,
        gameData.hofId,
        () => setHasSubmittedHof(true),
        gameData.simSettings,
        gameData.coachingData,
        gameData.leagueTradeBlocks,
        gameData.setLeagueTradeBlocks,
        gameData.leagueTradeOffers,
        gameData.leaguePickAssets,
        gameData.leagueGMProfiles,
        gameData.seasonConfig,
        gameData.lotteryResult,
        gameData.setLotteryResult,
        gameData.offseasonPhase,
        gameData.setOffseasonPhase,
        useCallback((targetView: string) => {
            setView(targetView as any);
        }, []),
        gameData.prospects,
        gameData.setProspects,
        gameData.setLeaguePickAssets,
        gameData.setResolvedDraftOrder,
        gameData.retiredPlayerIds,
        gameData.setRetiredPlayerIds,
        gameData.setLeagueFAMarket,
        gameData.leagueFAMarket,
    );

    const { handleSimulateSeason, batchProgress, handleCancelBatch } = useFullSeasonSim(
        gameData.teams, gameData.setTeams, gameData.schedule, gameData.setSchedule,
        gameData.myTeamId, gameData.currentSimDate, gameData.setCurrentSimDate,
        gameData.playoffSeries, gameData.setPlayoffSeries,
        gameData.transactions, gameData.setTransactions,
        gameData.forceSave, session, isGuestMode,
        gameData.userTactics, gameData.depthChart,
        gameData.tendencySeed || undefined,
        gameData.hofId,
        () => setHasSubmittedHof(true),
        gameData.simSettings,
        gameData.coachingData,
        gameData.seasonConfig,
        gameData.offseasonPhase
    );

    // 오프시즌 이벤트 상태 계산: 사이드바 버튼 + 시뮬 차단 결정
    const pendingOffseasonAction = useMemo<PendingOffseasonAction>(() => {
        if (gameData.offseasonPhase !== 'POST_LOTTERY') return null;
        // 로터리 결과가 아직 viewed되지 않았으면 로터리 확인 필요
        if (gameData.lotteryResult && !gameData.lotteryResult.viewed) return 'lottery';
        // 로터리 확인 완료 + 드래프트 날짜 도래 → 신인 드래프트
        const rookieDraftDate = gameData.seasonConfig?.keyDates?.rookieDraft;
        if (gameData.prospects?.length > 0 && rookieDraftDate && gameData.currentSimDate >= rookieDraftDate) return 'draft';
        return null;
    }, [gameData.offseasonPhase, gameData.lotteryResult, gameData.prospects, gameData.seasonConfig, gameData.currentSimDate]);

    // 인증 및 라우팅 상태 감시
    useEffect(() => {
        if (!authLoading && !session && !isGuestMode) {
            setView('Auth' as any);
        } else if (gameData.myTeamId && view === ('Auth' as any)) {
            setView('Dashboard');
        }
    }, [authLoading, session, isGuestMode, gameData.myTeamId, view]);

    // 리로드 시 미완료 드래프트 감지 — 게임 시작 직후 커스텀 모드에서만 자동 이동
    // (오프시즌 로터리/드래프트는 offseasonEventHandler가 날짜 기반으로 처리)
    useEffect(() => {
        if (gameData.myTeamId && gameData.draftPicks?.order && !gameData.draftPicks?.teams && rosterMode === 'custom') {
            setView('DraftLottery');
            if (gameData.draftPicks.poolType) {
                setDraftPoolType(gameData.draftPicks.poolType);
            }
        }
    }, [gameData.myTeamId, gameData.draftPicks, rosterMode]);

    // 리로드 시 오프시즌 POST_LOTTERY 상태 → 사이드바 버튼으로 진입 (자동 전환 제거)

    // HOF 제출 여부 확인 (hof_id 기반)
    useEffect(() => {
        if (gameData.hofId) {
            checkUserHasSubmitted(gameData.hofId).then(setHasSubmittedHof);
        } else {
            setHasSubmittedHof(false);
        }
    }, [gameData.hofId]);

    useEffect(() => { refreshUnreadCount(); }, [refreshUnreadCount, gameData.currentSimDate]);
    useEffect(() => { if (sim.activeGame) setView('GameSim' as any); }, [sim.activeGame]);
    useEffect(() => { if (sim.lastGameResult) setView('GameResult' as any); }, [sim.lastGameResult]);
    useEffect(() => { if (sim.liveGameTarget) setView('LiveGame' as any); }, [sim.liveGameTarget]);

    const handleResetConfirm = async () => {
        setIsResetting(true);
        await gameData.handleResetData();
        setRosterMode(null);
        setDraftPoolType(null);
        setIsResetting(false);
        setIsResetModalOpen(false);
    };

    const handleSelectTeamAndOnboard = useCallback(async (teamId: string) => {
        if (rosterMode === 'custom') {
            // 커스텀 모드: 단순 셔플 (로터리는 첫 시즌 이후 오프시즌부터 가동)
            setView('DraftLottery');
            const teamIds = Object.keys(TEAM_DATA);
            for (let i = teamIds.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
            }
            await gameData.saveDraftOrder(teamIds, draftPoolType || 'alltime', teamId);
            gameData.setMyTeamId(teamId);
            return true;
        }
        // 기본 모드: 온보딩 진행
        setView('Onboarding' as any);
        const success = await gameData.handleSelectTeam(teamId);
        if (!success) setView('Dashboard');
        else await refreshUnreadCount(); // 구단주 서신 발송 후 배지 갱신
        return success;
    }, [gameData.handleSelectTeam, gameData.setMyTeamId, rosterMode, refreshUnreadCount]);

    // 전역 상태에 따른 가드 렌더링
    // 1. authLoading: 인증 확인 중 → 정적 메세지
    if (authLoading) return <FullScreenLoader message="잠시만 기다려주세요..." />;
    // 2. 미로그인: 인증 화면 (랜덤 메세지가 뜨지 않도록 isSaveLoading보다 먼저)
    if (!session && !isGuestMode) return <AuthView onGuestLogin={() => setIsGuestMode(true)} />;
    // 2-1. Supabase 서버 연결 실패: 에러 화면 + 재시도 버튼
    if (gameData.isBaseDataError) return <DatabaseErrorView onRetry={() => queryClient.invalidateQueries({ queryKey: ['baseData'] })} />;
    // 3. 로그인 후 게임 데이터 로딩: 스켈레톤 UI + 프로그레스
    if (gameData.isSaveLoading) return <SkeletonLoader progress={gameData.loadingProgress} />;
    if (!gameData.myTeamId) {
        // 팀 선택 처리 중(await 대기)이면 로더
        if ((view as string) === 'Onboarding' || (view as string) === 'DraftRoom' || (view as string) === 'DraftLottery') return <FullScreenLoader message="잠시만 기다려주세요..." />;
        // 1단계: 모드 선택
        if (!rosterMode) return <ModeSelectView onSelectMode={setRosterMode} />;
        // 2단계: 커스텀 모드 → 드래프트풀 선택
        if (rosterMode === 'custom' && !draftPoolType) return <DraftPoolSelectView onSelectPool={setDraftPoolType} onBack={() => setRosterMode(null)} />;
        // 3단계: 팀 선택
        return <TeamSelectView teams={gameData.teams} isInitializing={gameData.isBaseDataLoading} onSelectTeam={handleSelectTeamAndOnboard} seasonShort={gameData.seasonConfig?.seasonShort ?? '2025-26'} />;
    }

    const myTeam = gameData.teams.find((t: any) => t.id === gameData.myTeamId);

    // OnboardingView는 MainLayout 없이 단독 full-screen 렌더링 (Dashboard flash 방지)
    if ((view as string) === 'Onboarding' && myTeam) {
        return (
            <div className="fixed inset-0 z-[500]">
                <OnboardingView team={myTeam} onComplete={() => setView('Dashboard')} seasonShort={gameData.seasonConfig?.seasonShort ?? '2025-26'} />
            </div>
        );
    }

    return (
        <>
            <MainLayout
                sidebarProps={{
                    team: myTeam,
                    currentSimDate: gameData.currentSimDate,
                    currentView: view,
                    isGuestMode,
                    unreadMessagesCount: unreadCount,
                    userEmail: session?.user?.email,
                    pendingOffseasonAction,
                    hasProspects: (gameData.prospects?.length ?? 0) > 0,
                    offseasonPhase: gameData.offseasonPhase,
                    onNavigate: setView,
                    onResetClick: handleResetClick,
                    onEditorClick: handleEditorClick,
                    onSimSettingsClick: handleSimSettingsClick,
                    onLogout: () => handleLogout(() => {
                        gameData.cleanupData();
                        setRosterMode(null);
                        setDraftPoolType(null);
                    }),
                    onSimulateSeason: () => handleSimulateSeason(),
                    onSkipToDate: (targetDate: string) => handleSimulateSeason(targetDate),
                    keyDates: gameData.seasonConfig?.keyDates,
                }}
                gameHeaderProps={{
                    schedule: gameData.schedule,
                    teams: gameData.teams,
                    onSim: sim.handleExecuteSim,
                    onLiveSim: sim.handleStartLiveGame,
                    isSimulating: sim.isSimulating,
                    simProgress: sim.simProgress,
                    playoffSeries: gameData.playoffSeries,
                    userTactics: gameData.userTactics
                }}
            >
                <AppRouter
                    view={view} setView={setView} gameData={gameData}
                    sim={sim} session={session} unreadCount={unreadCount}
                    refreshUnreadCount={refreshUnreadCount} setToastMessage={setToastMessage}
                    draftPoolType={draftPoolType}
                />
                {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

                <ResetDataModal
                    isOpen={isResetModalOpen}
                    isLoading={isResetting}
                    onClose={() => setIsResetModalOpen(false)}
                    onConfirm={handleResetConfirm}
                />
                <EditorModal
                    isOpen={isEditorModalOpen}
                    onClose={() => setIsEditorModalOpen(false)}
                />
                <SimSettingsModal
                    isOpen={isSimSettingsOpen}
                    onClose={() => setIsSimSettingsOpen(false)}
                    simSettings={gameData.simSettings}
                    onUpdate={gameData.setSimSettings}
                />
            </MainLayout>
            {/* 시즌 전체 시뮬레이션 프로그레스 모달 — MainLayout 바깥에서 렌더링하여 stacking context 회피 */}
            {batchProgress && (
                <FullSeasonSimModal progress={batchProgress} onCancel={() => handleCancelBatch()} />
            )}
            {updateAvailable && !updateDismissed && (
                <UpdateToast
                    onRefresh={() => window.location.reload()}
                    onDismiss={() => setUpdateDismissed(true)}
                />
            )}
        </>
    );
};

export default App;

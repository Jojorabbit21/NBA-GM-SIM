
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './hooks/useAuth';
import { useGameData } from './hooks/useGameData';
import { useSimulation } from './hooks/useSimulation';
import { TeamSelectView } from './views/TeamSelectView';
import { AuthView } from './views/AuthView';
import { Toast } from './components/SharedComponents';
import { AppView, RosterMode, DraftPoolType } from './types';
import { fetchUnreadMessageCount } from './services/messageService';

// 신규 생성된 모듈 모듈 임포트
import FullScreenLoader from './components/FullScreenLoader';
import MainLayout from './components/MainLayout';
import AppRouter from './components/AppRouter';
import { ResetDataModal } from './components/ResetDataModal';
import { EditorModal } from './components/EditorModal';
import { OnboardingView } from './views/OnboardingView';
import { ModeSelectView } from './views/ModeSelectView';
import { DraftPoolSelectView } from './views/DraftPoolSelectView';

const App: React.FC = () => {
    const { session, isGuestMode, setIsGuestMode, authLoading, handleLogout } = useAuth();
    const gameData = useGameData(session, isGuestMode);
    const [view, setView] = useState<AppView>('Dashboard');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
    const [rosterMode, setRosterMode] = useState<RosterMode | null>(null);
    const [draftPoolType, setDraftPoolType] = useState<DraftPoolType | null>(null);
    const handleResetClick = useCallback(() => setIsResetModalOpen(true), []);
    const handleEditorClick = useCallback(() => setIsEditorModalOpen(true), []);

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
        gameData.teams, gameData.setTeams, gameData.schedule, gameData.setSchedule,
        gameData.myTeamId, gameData.currentSimDate, advanceDate,
        gameData.playoffSeries, gameData.setPlayoffSeries, gameData.setTransactions,
        gameData.setNews, setToastMessage, gameData.forceSave,
        session, isGuestMode, refreshUnreadCount, gameData.depthChart
    );

    // 인증 및 라우팅 상태 감시
    useEffect(() => {
        if (!authLoading && !session && !isGuestMode) {
            setView('Auth' as any);
        } else if (gameData.myTeamId && view === ('Auth' as any)) {
            setView('Dashboard');
        }
    }, [authLoading, session, isGuestMode, gameData.myTeamId, view]);

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
            // 커스텀 모드: 팀 저장 후 DraftRoom 직행 (온보딩 스킵)
            setView('DraftRoom' as any);
            const success = await gameData.handleSelectTeam(teamId);
            if (!success) setView('Dashboard');
            return success;
        }
        // 기본 모드: 온보딩 진행
        setView('Onboarding' as any);
        const success = await gameData.handleSelectTeam(teamId);
        if (!success) setView('Dashboard');
        return success;
    }, [gameData.handleSelectTeam, rosterMode]);

    // 전역 상태에 따른 가드 렌더링
    // 1. authLoading: 인증 확인 중 → 정적 메세지
    if (authLoading) return <FullScreenLoader message="잠시만 기다려주세요..." />;
    // 2. 미로그인: 인증 화면 (랜덤 메세지가 뜨지 않도록 isSaveLoading보다 먼저)
    if (!session && !isGuestMode) return <AuthView onGuestLogin={() => setIsGuestMode(true)} />;
    // 3. 로그인 후 게임 데이터 로딩: 랜덤 메세지
    if (gameData.isSaveLoading) return <FullScreenLoader />;
    if (!gameData.myTeamId) {
        // 팀 선택 처리 중(await 대기)이면 로더
        if ((view as string) === 'Onboarding' || (view as string) === 'DraftRoom') return <FullScreenLoader message="잠시만 기다려주세요..." />;
        // 1단계: 모드 선택
        if (!rosterMode) return <ModeSelectView onSelectMode={setRosterMode} />;
        // 2단계: 커스텀 모드 → 드래프트풀 선택
        if (rosterMode === 'custom' && !draftPoolType) return <DraftPoolSelectView onSelectPool={setDraftPoolType} onBack={() => setRosterMode(null)} />;
        // 3단계: 팀 선택
        return <TeamSelectView teams={gameData.teams} isInitializing={gameData.isBaseDataLoading} onSelectTeam={handleSelectTeamAndOnboard} />;
    }

    const myTeam = gameData.teams.find((t: any) => t.id === gameData.myTeamId);

    // OnboardingView는 MainLayout 없이 단독 full-screen 렌더링 (Dashboard flash 방지)
    if ((view as string) === 'Onboarding' && myTeam) {
        return (
            <div className="fixed inset-0 z-[500]">
                <OnboardingView team={myTeam} onComplete={() => setView('Dashboard')} />
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
                    onNavigate: setView,
                    onResetClick: handleResetClick,
                    onEditorClick: handleEditorClick,
                    onLogout: handleLogout
                }}
                gameHeaderProps={{
                    schedule: gameData.schedule,
                    teams: gameData.teams,
                    onSim: sim.handleExecuteSim,
                    onLiveSim: sim.handleStartLiveGame,
                    isSimulating: sim.isSimulating,
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
            </MainLayout>
        </>
    );
};

export default App;

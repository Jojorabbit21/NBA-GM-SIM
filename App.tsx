
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { useGameData } from './hooks/useGameData';
import { useSimulation } from './hooks/useSimulation';
import { RosterMode, DraftPoolType, Player } from './types';
import { PendingOffseasonAction, PlayMode } from './types/app';
import { fetchUnreadMessageCount } from './services/messageService';
import { supabase } from './services/supabaseClient';
import { useFullSeasonSim } from './hooks/useFullSeasonSim';
import { FullSeasonSimModal } from './components/simulation/FullSeasonSimModal';
import { checkUserHasSubmitted } from './services/hallOfFameService';
import { useUpdateChecker } from './hooks/useUpdateChecker';
import { UpdateToast } from './components/UpdateToast';
import GameContext from './hooks/useGameContext';
import type { GameContextValue } from './hooks/useGameContext';

import Loader, { DatabaseErrorView } from './components/Loader';
import ProtectedLayout from './components/ProtectedLayout';
import MultiProtectedLayout from './components/MultiProtectedLayout';
import AdminGuard from './components/AdminGuard';
import MultiDraftLayout from './components/MultiDraftLayout';

// Multi Pages — 비동기 로드
import LeagueListView from './views/multi/league/LeagueListView';
import LeagueLobbyView from './views/multi/league/LeagueLobbyView';
import LeagueSettingsView from './views/multi/league/LeagueSettingsView';
import MultiDraftView from './views/multi/league/MultiDraftView';
import { LeagueLayout } from './views/multi/league/LeagueLayout';
import MultiSeasonPage from './pages/MultiSeasonPage';
import { MultiSeasonLayout } from './views/multi/season/MultiSeasonLayout';
import MultiStandingsView from './views/multi/season/MultiStandingsView';
import MultiScheduleView from './views/multi/season/MultiScheduleView';
import MultiRosterView from './views/multi/season/MultiRosterView';
import MultiComingSoonView from './views/multi/season/MultiComingSoonView';
import MultiTacticsView from './views/multi/season/MultiTacticsView';
import MultiGamePbpView from './views/multi/season/MultiGamePbpView';
import MultiLeaderboardView from './views/multi/season/MultiLeaderboardView';
import AdminSimView from './views/multi/league/AdminSimView';

// Pages — 비보호 라우트
import AuthPage from './pages/AuthPage';
import QuickPlayPage from './pages/QuickPlayPage';
import ModeSelectPage from './pages/ModeSelectPage';
import DraftPoolSelectPage from './pages/DraftPoolSelectPage';
import TeamSelectPage from './pages/TeamSelectPage';
import GMCreationPage from './pages/GMCreationPage';
import OnboardingPage from './pages/OnboardingPage';

// Pages — 보호 라우트
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import RosterPage from './pages/RosterPage';
import SchedulePage from './pages/SchedulePage';
import StandingsPage from './pages/StandingsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import TransactionsPage from './pages/TransactionsPage';
import PlayoffsPage from './pages/PlayoffsPage';
import InboxPage from './pages/InboxPage';
import HelpPage from './pages/HelpPage';
import FrontOfficePage from './pages/FrontOfficePage';
import FAMarketPage from './pages/FAMarketPage';
import HallOfFamePage from './pages/HallOfFamePage';
import PlayerDetailPage from './pages/PlayerDetailPage';
import CoachDetailPage from './pages/CoachDetailPage';
import GMDetailPage from './pages/GMDetailPage';
import GameResultPage from './pages/GameResultPage';
import DraftLotteryPage from './pages/DraftLotteryPage';
import DraftRoomPage from './pages/DraftRoomPage';
import DraftBoardPage from './pages/DraftBoardPage';
import DraftHistoryPage from './pages/DraftHistoryPage';
import TacticsPage from './pages/TacticsPage';
import PlayerEditorPage from './pages/PlayerEditorPage';
import EditorLayout from './pages/EditorLayout';
import ArchetypeConfigPage from './pages/ArchetypeConfigPage';
import DraftSimPage from './pages/DraftSimPage';

// 오프시즌 이벤트 → URL 매핑 (useSimulation onOffseasonEvent 용)
const OFFSEASON_VIEW_TO_PATH: Record<string, string> = {
    DraftLottery: '/draft-lottery',
    DraftRoom:    '/draft/',
};

const ADMIN_USER_ID = 'd2f6a469-9182-4dac-a098-278e6e758c79';

const App: React.FC = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { session, isGuestMode, authLoading, handleLogout } = useAuth();
    const [quickplayOnly, setQuickplayOnly] = useState(false);
    const [rosterMode, setRosterModeState] = useState<RosterMode | null>(() => {
        const stored = localStorage.getItem('nbagm:rosterMode');
        return stored === 'custom' || stored === 'standard' ? stored : null;
    });
    const setRosterMode = useCallback((mode: RosterMode | null) => {
        setRosterModeState(mode);
        if (mode) localStorage.setItem('nbagm:rosterMode', mode);
        else      localStorage.removeItem('nbagm:rosterMode');
    }, []);
    const [playModeState, setPlayModeState] = useState<PlayMode | null>(() => {
        const stored = localStorage.getItem('nbagm:playMode');
        return stored === 'single' || stored === 'multi' ? stored : null;
    });
    const setPlayMode = useCallback((mode: PlayMode | null) => {
        setPlayModeState(mode);
        if (mode) localStorage.setItem('nbagm:playMode', mode);
        else      localStorage.removeItem('nbagm:playMode');
    }, []);
    const isAdminRoute = pathname.startsWith('/admin');
    const gameData = useGameData(isAdminRoute ? null : session, isGuestMode, rosterMode, pathname.startsWith('/multi'));

    // ─── App-level state ──────────────────────────────────────────────────────
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [viewPlayerData, setViewPlayerData] = useState<{ player: Player; teamName?: string; teamId?: string } | null>(null);
    const [viewCoachData, setViewCoachData] = useState<{ coach: any; teamId: string } | null>(null);
    const [viewGMTeamId, setViewGMTeamId] = useState<string | null>(null);
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
    const [draftPoolType, setDraftPoolTypeState] = useState<DraftPoolType | null>(() => {
        const stored = localStorage.getItem('nbagm:draftPoolType');
        return stored === 'current' || stored === 'alltime' ? stored : null;
    });
    const setDraftPoolType = useCallback((type: DraftPoolType | null) => {
        setDraftPoolTypeState(type);
        if (type) localStorage.setItem('nbagm:draftPoolType', type);
        else      localStorage.removeItem('nbagm:draftPoolType');
    }, []);
    const [hasSubmittedHof, setHasSubmittedHof] = useState(false);
    const updateAvailable = useUpdateChecker();
    const [updateDismissed, setUpdateDismissed] = useState(false);
    const [isSimSettingsOpen, setIsSimSettingsOpen] = useState(false);

    // ─── Callbacks ───────────────────────────────────────────────────────────
    const handleResetClick = useCallback(() => setIsResetModalOpen(true), []);
    const handleEditorClick = useCallback(() => setIsEditorModalOpen(true), []);
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

    // ─── useSimulation ────────────────────────────────────────────────────────
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
            const path = OFFSEASON_VIEW_TO_PATH[targetView];
            if (path) navigate(path);
        }, [navigate]),
        gameData.prospects,
        gameData.setProspects,
        gameData.setLeaguePickAssets,
        gameData.setResolvedDraftOrder,
        gameData.retiredPlayerIds,
        gameData.setRetiredPlayerIds,
        gameData.setLeagueFAMarket,
        gameData.leagueFAMarket,
        gameData.myTeamId ? (gameData.leagueInvestmentState[gameData.myTeamId]?.allocationConfirmed ?? false) : false,
        gameData.setLeagueInvestmentState,
        gameData.setLeagueTradeOffers,
    );

    // ─── useFullSeasonSim ─────────────────────────────────────────────────────
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
        gameData.offseasonPhase,
        gameData.leagueTradeBlocks,
        gameData.leaguePickAssets,
        gameData.leagueTradeOffers,
        gameData.leagueGMProfiles,
        gameData.seasonNumber,
        gameData.leagueFAMarket,
        gameData.setOffseasonPhase,
        gameData.setLeagueFAMarket,
    );

    // ─── pendingOffseasonAction ───────────────────────────────────────────────
    const pendingOffseasonAction = useMemo<PendingOffseasonAction>(() => {
        if (gameData.offseasonPhase !== 'POST_LOTTERY') return null;
        if (gameData.lotteryResult && !gameData.lotteryResult.viewed) return 'lottery';
        const rookieDraftDate = gameData.seasonConfig?.keyDates?.rookieDraft;
        if (gameData.prospects?.length > 0 && rookieDraftDate && gameData.currentSimDate >= rookieDraftDate) return 'draft';
        return null;
    }, [gameData.offseasonPhase, gameData.lotteryResult, gameData.prospects, gameData.seasonConfig, gameData.currentSimDate]);

    const logout = useCallback(() => {
        handleLogout(() => {
            gameData.cleanupData();
            setRosterMode(null);
            setDraftPoolType(null);
            setPlayMode(null);
        });
    }, [handleLogout, gameData, setRosterMode, setDraftPoolType, setPlayMode]);

    // ─── handleResetConfirm ───────────────────────────────────────────────────
    const handleResetConfirm = async () => {
        setIsResetting(true);
        await gameData.handleResetData();
        setRosterMode(null);
        setDraftPoolType(null);
        setPlayMode(null);
        setIsResetting(false);
        setIsResetModalOpen(false);
    };

    // ─── contextValue ─────────────────────────────────────────────────────────
    const contextValue: GameContextValue = {
        session,
        isGuestMode,
        authLoading,
        logout,
        gameData,
        sim,
        handleSimulateSeason,
        batchProgress,
        handleCancelBatch,
        setToastMessage,
        unreadCount,
        refreshUnreadCount,
        pendingOffseasonAction,
        playMode: playModeState,
        setPlayMode,
        rosterMode,
        setRosterMode,
        draftPoolType,
        setDraftPoolType,
        hasSubmittedHof,
        viewPlayerData,
        setViewPlayerData,
        viewCoachData,
        setViewCoachData,
        viewGMTeamId,
        setViewGMTeamId,
        selectedTeamId,
        setSelectedTeamId,
        toastMessage,
        isResetModalOpen,
        isResetting,
        openResetModal: handleResetClick,
        closeResetModal: () => setIsResetModalOpen(false),
        handleResetConfirm,
        isEditorModalOpen,
        openEditor: handleEditorClick,
        closeEditor: () => setIsEditorModalOpen(false),
        isSimSettingsOpen,
        openSimSettings: handleSimSettingsClick,
        closeSimSettings: () => setIsSimSettingsOpen(false),
    };

    // ─── useEffects ───────────────────────────────────────────────────────────
    // HOF 제출 여부 확인
    useEffect(() => {
        if (gameData.hofId) {
            checkUserHasSubmitted(gameData.hofId).then(setHasSubmittedHof);
        } else {
            setHasSubmittedHof(false);
        }
    }, [gameData.hofId]);

    // 시뮬 날짜 변경 시 미읽음 카운트 갱신
    useEffect(() => { refreshUnreadCount(); }, [refreshUnreadCount, gameData.currentSimDate]);

    // 탭이 다시 활성화될 때 클라이언트 상태 동기화
    // (background throttling으로 시뮬 중 씹힌 메시지/카운트를 자동 복구)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshUnreadCount();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [refreshUnreadCount]);

    useEffect(() => {
        supabase
            .from('meta_config')
            .select('value')
            .eq('key', 'quickplay_only')
            .single()
            .then(({ data }) => {
                setQuickplayOnly(data?.value === true);
            });
    }, []);

    const isAdmin = session?.user?.id === ADMIN_USER_ID;
    const shouldRestrictToQuickPlay = quickplayOnly && !isAdmin;

    // ─── 전역 가드 (Router 진입 전) ───────────────────────────────────────────
    if (authLoading) return <Loader message="잠시만 기다려주세요..." />;
    if (gameData.isBaseDataError) {
        return <DatabaseErrorView onRetry={() => queryClient.invalidateQueries({ queryKey: ['baseData'] })} onLogout={logout} />;
    }

    // ─── 메인 렌더 ────────────────────────────────────────────────────────────
    return (
        <GameContext.Provider value={contextValue}>
            <>
                <Routes>
                    {/* ── Admin 라우트 (AdminGuard: 미로그인 → /auth?redirect=, 비관리자 → /) ── */}
                    <Route path="/admin/player-editor" element={<Navigate to="/admin/editor/player" replace />} />
                    <Route element={<AdminGuard />}>
                        <Route path="/admin" element={<Navigate to="/admin/editor/player" replace />} />
                        <Route path="/admin/editor" element={<EditorLayout userId={session?.user?.id} />}>
                            <Route index element={<Navigate to="player" replace />} />
                            <Route path="player" element={<PlayerEditorPage />} />
                            <Route path="archetype" element={<ArchetypeConfigPage />} />
                            <Route path="draft-sim" element={<DraftSimPage />} />
                        </Route>
                    </Route>

                    {/* ── 비보호 라우트 ── */}
                    <Route path="/" element={<AuthPage quickplayOnly={shouldRestrictToQuickPlay} />} />
                    <Route path="/auth" element={<AuthPage quickplayOnly={shouldRestrictToQuickPlay} />} />
                    <Route path="/quick" element={<QuickPlayPage />} />
                    <Route path="/mode-select" element={<ModeSelectPage />} />
                    <Route path="/draft-pool-select" element={<DraftPoolSelectPage />} />
                    <Route path="/select-team" element={<TeamSelectPage />} />
                    <Route path="/gm-creation" element={<GMCreationPage />} />
                    <Route path="/onboarding" element={<OnboardingPage />} />

                    {/* ── 멀티플레이어 + 보호 라우트 (quickplay_only 모드에서는 비활성) ── */}
                    {!shouldRestrictToQuickPlay && (<>
                        <Route element={<MultiProtectedLayout />}>
                            <Route path="/multi" element={<LeagueListView />} />
                            <Route element={<LeagueLayout />}>
                                <Route path="/multi/leagues/:leagueId/lobby"    element={<LeagueLobbyView />} />
                                <Route path="/multi/leagues/:leagueId/settings" element={<LeagueSettingsView />} />
                                <Route path="/multi/leagues/:leagueId/admin/sim" element={<AdminSimView />} />
                                <Route path="/multi/leagues/:leagueId/season" element={<MultiSeasonLayout />}>
                                    <Route index element={<MultiSeasonPage />} />
                                    <Route path="roster"       element={<MultiRosterView />} />
                                    <Route path="standings"    element={<MultiStandingsView />} />
                                    <Route path="schedule"     element={<MultiScheduleView />} />
                                    <Route path="leaderboard"  element={<MultiLeaderboardView />} />
                                    <Route path="tactics"      element={<MultiTacticsView />} />
                                    <Route path="front-office" element={<MultiComingSoonView title="프론트 오피스" />} />
                                    <Route path="game/:gameId" element={<MultiGamePbpView />} />
                                </Route>
                            </Route>
                        </Route>

                        <Route element={<MultiDraftLayout />}>
                            <Route element={<LeagueLayout />}>
                                <Route path="/multi/leagues/:leagueId/draft" element={<MultiDraftView />} />
                            </Route>
                        </Route>

                        <Route element={<ProtectedLayout />}>
                            <Route path="/home" element={<HomePage />} />
                            <Route path="/locker-room" element={<DashboardPage />} />
                            <Route path="/roster" element={<RosterPage />} />
                            <Route path="/roster/:teamId" element={<RosterPage />} />
                            <Route path="/schedule" element={<SchedulePage />} />
                            <Route path="/standings" element={<StandingsPage />} />
                            <Route path="/leaderboard" element={<LeaderboardPage />} />
                            <Route path="/transactions" element={<TransactionsPage />} />
                            <Route path="/playoffs" element={<PlayoffsPage />} />
                            <Route path="/inbox" element={<InboxPage />} />
                            <Route path="/help" element={<HelpPage />} />
                            <Route path="/front-office" element={<FrontOfficePage />} />
                            <Route path="/fa-market" element={<FAMarketPage />} />
                            <Route path="/hall-of-fame" element={<HallOfFamePage />} />
                            <Route path="/player/:playerId" element={<PlayerDetailPage />} />
                            <Route path="/coach/:coachId" element={<CoachDetailPage />} />
                            <Route path="/gm/:teamId" element={<GMDetailPage />} />
                            <Route path="/result/:gameId" element={<GameResultPage />} />
                            <Route path="/draft-lottery" element={<DraftLotteryPage />} />
                            <Route path="/draft/*" element={<DraftRoomPage />} />
                            <Route path="/rookie-draft" element={<DraftRoomPage />} />
                            <Route path="/draft-board" element={<DraftBoardPage />} />
                            <Route path="/draft-history" element={<DraftHistoryPage />} />
                            <Route path="/tactics" element={<TacticsPage />} />
                            <Route path="*" element={<Navigate to="/home" replace />} />
                        </Route>
                    </>)}

                    {/* quickplay_only 모드: 위에서 매칭되지 않은 모든 경로 → /quick */}
                    {shouldRestrictToQuickPlay && (
                        <Route path="*" element={<Navigate to="/quick" replace />} />
                    )}
                </Routes>

                {/* 시즌 전체 시뮬레이션 프로그레스 모달 — Routes 바깥에서 렌더링 */}
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
        </GameContext.Provider>
    );
};

export default App;


import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { useGameData } from './hooks/useGameData';
import { useSimulation } from './hooks/useSimulation';
import { RosterMode, DraftPoolType, Player } from './types';
import { PendingOffseasonAction } from './types/app';
import { fetchUnreadMessageCount } from './services/messageService';
import { useFullSeasonSim } from './hooks/useFullSeasonSim';
import { FullSeasonSimModal } from './components/simulation/FullSeasonSimModal';
import { checkUserHasSubmitted } from './services/hallOfFameService';
import { useUpdateChecker } from './hooks/useUpdateChecker';
import { UpdateToast } from './components/UpdateToast';
import GameContext from './hooks/useGameContext';
import type { GameContextValue } from './hooks/useGameContext';

import FullScreenLoader, { DatabaseErrorView } from './components/FullScreenLoader';
import ProtectedLayout from './components/ProtectedLayout';

// Pages — 비보호 라우트
import AuthPage from './pages/AuthPage';
import ModeSelectPage from './pages/ModeSelectPage';
import DraftPoolSelectPage from './pages/DraftPoolSelectPage';
import TeamSelectPage from './pages/TeamSelectPage';
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

// 오프시즌 이벤트 → URL 매핑 (useSimulation onOffseasonEvent 용)
const OFFSEASON_VIEW_TO_PATH: Record<string, string> = {
    DraftLottery: '/draft-lottery',
    DraftRoom:    '/draft/',
};

const App: React.FC = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { session, isGuestMode, authLoading, handleLogout } = useAuth();
    const [rosterMode, setRosterMode] = useState<RosterMode | null>(null);
    const gameData = useGameData(session, isGuestMode, rosterMode);

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
    const [draftPoolType, setDraftPoolType] = useState<DraftPoolType | null>(null);
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
        });
    }, [handleLogout, gameData, setRosterMode, setDraftPoolType]);

    // ─── handleResetConfirm ───────────────────────────────────────────────────
    const handleResetConfirm = async () => {
        setIsResetting(true);
        await gameData.handleResetData();
        setRosterMode(null);
        setDraftPoolType(null);
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

    // ─── 전역 가드 (Router 진입 전) ───────────────────────────────────────────
    if (authLoading) return <FullScreenLoader message="잠시만 기다려주세요..." />;
    if (gameData.isBaseDataError) {
        return <DatabaseErrorView onRetry={() => queryClient.invalidateQueries({ queryKey: ['baseData'] })} />;
    }

    // ─── 메인 렌더 ────────────────────────────────────────────────────────────
    return (
        <GameContext.Provider value={contextValue}>
            <>
                <Routes>
                    {/* ── 비보호 라우트 ── */}
                    <Route path="/auth" element={<AuthPage />} />
                    <Route path="/mode-select" element={<ModeSelectPage />} />
                    <Route path="/draft-pool-select" element={<DraftPoolSelectPage />} />
                    <Route path="/select-team" element={<TeamSelectPage />} />
                    <Route path="/onboarding" element={<OnboardingPage />} />

                    {/* ── 보호 라우트 (ProtectedLayout이 인증/팀선택 가드 담당) ── */}
                    <Route element={<ProtectedLayout />}>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/dashboard" element={<DashboardPage />} />
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
                        {/* 404 → 홈으로 */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
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

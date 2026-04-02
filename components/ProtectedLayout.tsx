import React, { useEffect, useCallback } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useGame } from '../hooks/useGameContext';
import { LiveGameView } from '../views/LiveGameView';
import { Toast } from './SharedComponents';
import { ResetDataModal } from './ResetDataModal';
import { EditorModal } from './EditorModal';
import { SimSettingsModal } from './SimSettingsModal';
import MainLayout from './MainLayout';
import SkeletonLoader from './SkeletonLoader';
import type { Player } from '../types';

// ─── ProtectedLayout ─────────────────────────────────────────────────────────

const ProtectedLayout: React.FC = () => {
    const {
        session, isGuestMode, gameData, sim,
        rosterMode, draftPoolType,
        toastMessage, setToastMessage,
        unreadCount, pendingOffseasonAction,
        selectedTeamId, setSelectedTeamId,
        setViewPlayerData,
        openEditor, openResetModal, openSimSettings,
        closeEditor, closeResetModal, closeSimSettings,
        isEditorModalOpen, isResetModalOpen, isSimSettingsOpen,
        isResetting, handleResetConfirm,
        handleSimulateSeason,
        logout,
    } = useGame();

    const navigate   = useNavigate();
    const location   = useLocation();
    const myTeam     = gameData.teams.find((t: any) => t.id === gameData.myTeamId);

    const userGMProfile = gameData.leagueGMProfiles?.[gameData.myTeamId ?? ''];
    const gmDisplayName = userGMProfile?.firstName && userGMProfile?.lastName
        ? `${userGMProfile.lastName} ${userGMProfile.firstName}`
        : undefined;

    // ─── GameResult 네비게이션 ────────────────────────────────────────────
    useEffect(() => {
        if (!sim.lastGameResult) return;
        const gameId: string = sim.lastGameResult.gameId ?? 'unknown';
        navigate(`/result/${gameId}`, { state: { result: sim.lastGameResult } });
    }, [sim.lastGameResult, navigate]);

    // ─── Roster 이탈 시 selectedTeamId 초기화 ────────────────────────────
    useEffect(() => {
        const p = location.pathname;
        if (!p.startsWith('/roster') && !p.startsWith('/result') && !p.startsWith('/player')) {
            setSelectedTeamId(null);
        }
    }, [location.pathname, setSelectedTeamId]);

    // ─── 핸들러 ──────────────────────────────────────────────────────────

    const handleViewPlayer = useCallback((player: Player, teamId?: string, teamName?: string) => {
        setViewPlayerData({ player, teamId, teamName });
        navigate(`/player/${player.id}`, { state: { player, teamId, teamName } });
    }, [navigate, setViewPlayerData]);

    // ─── 인증 가드 (hooks 이후에 위치) ───────────────────────────────────

    if (!session && !isGuestMode) return <Navigate to="/auth" replace />;

    // ─── 데이터 로딩 ─────────────────────────────────────────────────────

    if (gameData.isSaveLoading) return <SkeletonLoader progress={gameData.loadingProgress} message={gameData.loadingMessage} />;

    // ─── 초기화 에러 가드 (세이브 덮어쓰기 방지) ─────────────────────────

    if (gameData.hasInitError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white gap-4">
                <p className="text-red-400 text-lg font-semibold">게임 데이터를 불러오는 중 오류가 발생했습니다.</p>
                <p className="text-gray-400 text-sm">페이지를 새로고침하거나 잠시 후 다시 시도해 주세요.</p>
                <button
                    className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm"
                    onClick={() => window.location.reload()}
                >
                    새로고침
                </button>
            </div>
        );
    }

    // ─── 팀 선택 가드 ────────────────────────────────────────────────────

    if (!gameData.myTeamId) {
        if (!rosterMode) return <Navigate to="/mode-select" replace />;
        if (rosterMode === 'custom' && !draftPoolType) return <Navigate to="/draft-pool-select" replace />;
        return <Navigate to="/select-team" replace />;
    }

    // ─── 미완료 드래프트 감지 (커스텀 모드 초기 진입 시) ─────────────────

    if (gameData.draftPicks?.order && !gameData.draftPicks?.teams && rosterMode === 'custom') {
        return <Navigate to="/draft-lottery" replace />;
    }

    // ─── LiveGame / Spectate 오버레이용 변수 사전 계산 ───────────────────

    const liveTarget       = sim.liveGameTarget;
    const liveHomeDepth    = liveTarget?.homeTeam?.id === gameData.myTeamId ? gameData.depthChart : null;
    const liveAwayDepth    = liveTarget?.awayTeam?.id === gameData.myTeamId ? gameData.depthChart : null;

    // ─── 렌더 ────────────────────────────────────────────────────────────

    return (
        <MainLayout
            sidebarProps={{
                team: myTeam,
                currentSimDate: gameData.currentSimDate,
                isGuestMode,
                unreadMessagesCount: unreadCount,
                userEmail: session?.user?.email,
                gmDisplayName,
                pendingOffseasonAction,
                hasProspects: (gameData.prospects?.length ?? 0) > 0,
                offseasonPhase: gameData.offseasonPhase,
                onResetClick: openResetModal,
                onEditorClick: openEditor,
                onSimSettingsClick: openSimSettings,
                onLogout: logout,
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
                userTactics: gameData.userTactics,
                coachingData: gameData.coachingData,
                leagueGMProfiles: gameData.leagueGMProfiles,
                onSearchViewPlayer: handleViewPlayer,
                onSearchViewTeam: (teamId: string) => {
                    setSelectedTeamId(teamId);
                    navigate(`/roster/${teamId}`);
                },
                onSearchViewGM: (teamId: string) => {
                    if (gameData.leagueGMProfiles?.[teamId]) navigate(`/gm/${teamId}`);
                },
                onSearchViewCoach: (teamId: string) => {
                    const coach = gameData.coachingData?.[teamId]?.headCoach;
                    if (coach) navigate(`/coach/${coach.id}`);
                },
            }}
        >
            {/* ─── LiveGame 오버레이 (URL 미변경) ─── */}
            {liveTarget && (
                <div className="fixed inset-0 z-[9999] bg-slate-950">
                    <LiveGameView
                        homeTeam={liveTarget.homeTeam}
                        awayTeam={liveTarget.awayTeam}
                        userTeamId={gameData.myTeamId!}
                        userTactics={gameData.userTactics!}
                        homeDepthChart={liveHomeDepth}
                        awayDepthChart={liveAwayDepth}
                        tendencySeed={gameData.tendencySeed || undefined}
                        simSettings={gameData.simSettings}
                        onGameEnd={async (result) => {
                            // finalizeLiveGame 내부에서 setLastGameResult → 상단 useEffect가 /result/:gameId 로 navigate
                            await sim.finalizeLiveGame(result);
                        }}
                    />
                </div>
            )}

            {/* ─── Spectate 오버레이 (URL 미변경) ─── */}
            {sim.spectateTarget && (
                <div className="fixed inset-0 z-[9999] bg-slate-950">
                    <LiveGameView
                        homeTeam={sim.spectateTarget.homeTeam}
                        awayTeam={sim.spectateTarget.awayTeam}
                        userTeamId={null}
                        simSettings={gameData.simSettings}
                        onGameEnd={async (result) => {
                            await sim.finalizeSpectateGame(result);
                            navigate('/schedule');
                        }}
                    />
                </div>
            )}

            {/* ─── 현재 라우트 콘텐츠 ─── */}
            <Outlet />

            {/* ─── 전역 UI ─── */}
            {toastMessage && (
                <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
            )}

            <ResetDataModal
                isOpen={isResetModalOpen}
                isLoading={isResetting}
                onClose={closeResetModal}
                onConfirm={handleResetConfirm}
            />

            <EditorModal
                isOpen={isEditorModalOpen}
                onClose={closeEditor}
            />

            <SimSettingsModal
                isOpen={isSimSettingsOpen}
                onClose={closeSimSettings}
                simSettings={gameData.simSettings}
                onUpdate={gameData.setSimSettings}
            />
        </MainLayout>
    );
};

export default ProtectedLayout;

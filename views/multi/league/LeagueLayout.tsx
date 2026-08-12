
import React, { createContext, useContext } from 'react';
import { Outlet, useParams, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useCurrentLeague } from '../../../hooks/useCurrentLeague';
import type { CurrentLeagueState } from '../../../hooks/useCurrentLeague';
import { useGame } from '../../../hooks/useGameContext';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import { SeasonCtx } from '../season/seasonContext';

// ── Context ───────────────────────────────────────────────────────────────────

const LeagueCtx = createContext<CurrentLeagueState | null>(null);

/**
 * /multi/leagues/:leagueId/* 하위 라우트에서 리그 데이터를 공유하는 컨텍스트 훅.
 * LeagueLayout 안에서만 호출 가능.
 */
export function useLeagueContext(): CurrentLeagueState {
    const ctx = useContext(LeagueCtx);
    if (!ctx) {
        throw new Error('useLeagueContext must be used inside <LeagueLayout>');
    }
    return ctx;
}

// ── Layout ────────────────────────────────────────────────────────────────────

/**
 * 리그 서브라우트 공유 레이아웃.
 * - 리그 데이터를 한 번만 로드하여 Context로 공유 → 라우트 전환 시 재로딩 없음.
 * - 로딩 중에는 로더를 표시하고 Outlet을 숨긴다 (stale data 플래시 방지).
 * - 시즌 데이터(useMultiGameData)도 여기서 함께 로드해 SeasonCtx로 제공한다 — 예전엔
 *   MultiSeasonLayout에서 호출해서 로비/설정 화면을 오갈 때마다(시즌 섹션을 벗어났다 돌아올 때)
 *   MultiSeasonLayout이 언마운트→재마운트되며 매번 재로딩됐다. 리그 진입 시 1회만 로드되도록
 *   여기로 끌어올리되, 로비/설정 화면은 시즌 데이터를 기다릴 필요가 없으므로 이 레이아웃 자체의
 *   로딩 게이트는 기본적으로 리그 데이터(state.isLoading)만 기준으로 삼는다.
 * - [2026-08-11 Fix] 다만 /season 하위 라우트로 곧바로 진입(새로고침 등)하는 경우, 여기서
 *   state.isLoading만 기다리고 Outlet을 내려주면 MultiSeasonLayout이 이어서 gameData.isLoading을
 *   또 기다리며 자기 자신의 로더를 띄워 "로더가 두 번 뜨는" 것처럼 보이는 문제가 있었다. /season
 *   경로일 때만 이 레이아웃이 gameData.isLoading까지 함께 기다려 하나의 로더로 합친다.
 */
export function LeagueLayout() {
    const { leagueId } = useParams<{ leagueId: string }>();
    const location = useLocation();
    const state = useCurrentLeague();
    const { session } = useGame();
    const gameData = useMultiGameData(session, state.room?.id ?? null);

    const isSeasonRoute = location.pathname.includes('/season');
    const isLoading = state.isLoading || (isSeasonRoute && gameData.isLoading);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-screen bg-gray-950">
                <Loader2 size={32} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <LeagueCtx.Provider value={state}>
            <SeasonCtx.Provider value={gameData}>
                <Outlet />
            </SeasonCtx.Provider>
        </LeagueCtx.Provider>
    );
}


import React, { createContext, useContext } from 'react';
import { Outlet, useParams } from 'react-router-dom';
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
 *   로딩 게이트는 그대로 리그 데이터(state.isLoading)만 기준으로 삼는다 — 시즌 데이터 로딩 여부는
 *   MultiSeasonLayout이 SeasonCtx를 통해 자체적으로 판단한다.
 */
export function LeagueLayout() {
    const { leagueId } = useParams<{ leagueId: string }>();
    const state = useCurrentLeague();
    const { session } = useGame();
    const gameData = useMultiGameData(session, state.room?.id ?? null);

    if (state.isLoading) {
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

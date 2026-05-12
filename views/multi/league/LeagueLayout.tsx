
import React, { createContext, useContext } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useCurrentLeague } from '../../../hooks/useCurrentLeague';
import type { CurrentLeagueState } from '../../../hooks/useCurrentLeague';

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
 */
export function LeagueLayout() {
    const { leagueId } = useParams<{ leagueId: string }>();
    const state = useCurrentLeague();

    if (state.isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-screen bg-gray-950">
                <Loader2 size={32} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <LeagueCtx.Provider value={state}>
            <Outlet />
        </LeagueCtx.Provider>
    );
}

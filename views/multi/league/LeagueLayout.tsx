
import React, { createContext, useContext } from 'react';
import { Outlet, Navigate, useParams, useLocation } from 'react-router-dom';
import { useCurrentLeague } from '../../../hooks/useCurrentLeague';
import { useLeagueNotifications } from '../../../hooks/useLeagueNotifications';
import { useLeagueTransactionsRealtime } from '../../../hooks/useLeagueTransactionsRealtime';
import type { CurrentLeagueState } from '../../../hooks/useCurrentLeague';
import { useGame } from '../../../hooks/useGameContext';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import { SeasonCtx } from '../season/seasonContext';
import { useLeagueBootstrap } from '../../../hooks/useLeagueBootstrap';
import { LeagueBootstrapErrorScreen } from '../../../components/multi/LeagueBootstrapErrorScreen';
import { LeagueLoadingScreen } from '../../../components/multi/LeagueLoadingScreen';
import { LeagueChatDock } from '../../../components/multi/LeagueChatDock';
import { LeagueAccessBlockedScreen } from '../../../components/multi/LeagueAccessBlockedScreen';
import { isLeagueSpectatable, isSpectatorPathAllowed } from '../../../utils/spectatorAccess';

// ── Context ───────────────────────────────────────────────────────────────────

/** 리그 컨텍스트 값 — useCurrentLeague 결과 + 관전 여부.
 *  isSpectator: 참가자가 아닌 로그인 유저가 관전 허용 리그를 읽기 전용으로 보는 중(2026-10-19). 쓰기 UI는 이 값이 true면 숨기거나 막는다. */
export type LeagueContextValue = CurrentLeagueState & { isSpectator: boolean };

const LeagueCtx = createContext<LeagueContextValue | null>(null);

/**
 * /multi/leagues/:leagueId/* 하위 라우트에서 리그 데이터를 공유하는 컨텍스트 훅.
 * LeagueLayout 안에서만 호출 가능.
 */
export function useLeagueContext(): LeagueContextValue {
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
    const { session, isAdmin: isGlobalAdmin, isAdminLoading } = useGame();
    const gameData = useMultiGameData(session, state.room?.id ?? null);
    // [2026-10-02] 리그 진행 알림(트레이드 제안 도착/결과, 리그 이벤트) → 전역 토스트. 리그 레이아웃에 한 번만.
    const myTeam = state.leagueTeams.find(t => t.user_id === session?.user?.id) ?? null;
    const myUserId = session?.user?.id ?? null;
    const isChatMember = !!myUserId && state.members.some(m => m.user_id === myUserId);
    // [2026-10-19] 관전 판정 — 참가자(멤버 또는 팀 보유)·리그 어드민·전역 어드민이 아닌 로그인 유저.
    // members 조회가 일시 실패해 []로 와도 진짜 참가자가 막히지 않도록 league_teams(전체 공개)의 user_id도 함께 본다.
    const isLeagueAdmin = !!myUserId && state.league?.admin_user_id === myUserId;
    const isParticipant = isChatMember || !!myTeam || isLeagueAdmin || isGlobalAdmin;
    const isNonParticipant = !!myUserId && !!state.league && !state.isLoading && !isAdminLoading && !isParticipant;
    const spectatable = isLeagueSpectatable(state.league);
    const isSpectator = isNonParticipant && spectatable;
    const isAccessBlocked = isNonParticipant && !spectatable;
    useLeagueNotifications({ roomId: state.room?.id ?? null, leagueId, leagueTeams: state.leagueTeams, myTeam });
    // [2026-10-16] FA 서명/방출 기록 실시간 반영 — 조기 return(로딩 화면) 위에서 호출해야 훅 순서가 유지된다.
    useLeagueTransactionsRealtime(state.room?.id ?? null);

    const isSeasonRoute = location.pathname.includes('/season');
    const isLoading = state.isLoading || (isSeasonRoute && gameData.isLoading);

    // [2026-10-06] 부트스트랩 게이트 — 리그/시즌 데이터가 끝난 뒤 공통 쿼리를 미리 받아 캐시에 넣고 나서 Outlet을 내린다.
    // 그동안은 아래 스피너가 그대로 이어진다(전용 진행률 화면은 같은 날 접음 — 로딩이 1초 안쪽이라 막대가 안 보였고
    // 화면이 두 번 바뀌는 게 더 거슬렸음). 전부 캐시에 있으면 즉시 ready. 확정 실패만 별도 안내 화면. 상세: hooks/useLeagueBootstrap.ts.
    const boot = useLeagueBootstrap({
        enabled: !isLoading && !state.error && !isAccessBlocked,
        league: state.league, room: state.room, leagueTeams: state.leagueTeams, myTeam,
    });

    if (isAccessBlocked) {
        // 모집/드래프트 단계는 관전 불가, 그 외(진행/종료)는 어드민이 관전을 꺼 둔 경우.
        const inDraftStage = state.league?.status === 'recruiting' || state.league?.status === 'drafting';
        return <LeagueAccessBlockedScreen reason={inDraftStage ? 'draft' : 'disabled'} />;
    }
    // 관전자는 허용 목록 밖 URL(전술/트레이드/설정/드래프트 등)로 들어오면 시즌 홈으로 돌려보낸다.
    if (isSpectator && !isSpectatorPathAllowed(location.pathname)) {
        return <Navigate to={`/multi/leagues/${leagueId}/season`} replace />;
    }

    const bootPending = !state.error && (boot.status === 'idle' || boot.status === 'loading');
    if (isLoading || bootPending) {
        return <LeagueLoadingScreen />;   // 스피너 + 재치 문구(2026-10-06)
    }
    if (!state.error && boot.status === 'failed') {
        return <LeagueBootstrapErrorScreen boot={boot} />;
    }

    return (
        <LeagueCtx.Provider value={{ ...state, isSpectator }}>
            <SeasonCtx.Provider value={gameData}>
                <Outlet />
                {/* [2026-10-17] 리그 채팅 FAB + 위젯 — 리그 참가자만. 한 번만 마운트해 화면 이동에도 구독·열림·초안이 유지된다. */}
                {isChatMember && state.room && myUserId && <LeagueChatDock roomId={state.room.id} userId={myUserId} />}
            </SeasonCtx.Provider>
        </LeagueCtx.Provider>
    );
}

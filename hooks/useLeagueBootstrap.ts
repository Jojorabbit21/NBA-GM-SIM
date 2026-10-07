/**
 * useLeagueBootstrap — 리그 진입 부트스트랩 게이트.
 *
 * [2026-10-06] 리그 레이아웃이 리그·룸·팀·시즌 데이터를 받은 뒤, 멀티 화면 대부분이 공유하는 공통 쿼리와 홈 전용
 * 쿼리를 한꺼번에 미리 받아 React Query 캐시에 넣고 나서야 화면을 보여준다. 전에는 홈이 마운트되며 열 개 남짓을
 * 각자 쏴서 "따로 실패(토스트 연발) · 따로 늦게 뜸"이 생겼다(docs/plan/league-bootstrap-gate-plan.md).
 * 로딩 중 표시는 LeagueLayout의 기존 스피너가 그대로 이어진다(같은 날 진행률 화면을 접음 — 실제 로딩이 1초
 * 안쪽이라 막대가 보이지 않았음). 확정 실패만 LeagueBootstrapErrorScreen이 그린다.
 *
 * 규칙(사용자 결정):
 *  - 대상: multiSearchPool · metaPlayerOrder · gameShortCodes · leagueRawPlayers · leagueRawSeasonInjury ·
 *    playerSeasonStatsLeague · homeLeagueTransactions · leagueNewsStories(홈이 쓰는 필터 3종) · pendingTradeCount(내 팀 있을 때).
 *    각 쿼리는 해당 훅이 export한 옵션 팩토리를 그대로 써서 키·함수가 화면 쪽 useQuery와 완전히 같다.
 *  - 캐시에 데이터가 이미 있는 쿼리는 기다리지 않는다(전부 있으면 스피너 없이 즉시 ready). 신선도는 화면 쪽
 *    useQuery가 마운트 시 평소처럼 재조회해 맞춘다(그 실패는 토스트 대상에서 제외 — bootstrapQueryKeys.ts).
 *  - 실패는 조용히 3초 간격으로 3회 재시도(실패한 것만). 사용자에게는 스피너 그대로. 3회 모두 실패했을 때만
 *    확정 실패 — 네트워크/DB면 "다시 시도"(실패분 재요청), 401이면 "다시 로그인".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { LeagueRow, RoomRow, LeagueTeamRow } from '../services/multi/roomQueries';
import { multiSearchPoolQuery } from './useMultiSearchData';
import { metaPlayerOrderQuery } from './usePlayerShortCodes';
import { gameShortCodesQuery } from './useGameShortCodes';
import { leagueRawPlayersQuery, leagueRawSeasonInjuryQuery } from './useLeagueRawStats';
import { playerSeasonStatsLeagueQuery } from './usePlayerSeasonStatsLeague';
import { homeLeagueTransactionsQuery } from './useHomeLeagueTransactions';
import { leagueNewsStoriesQuery } from './useLeagueHeadlines';
import { pendingTradeCountQuery } from './usePendingTradeCount';
import { isAuthExpiryError } from '../services/notifications/errorCollector';

export const BOOTSTRAP_RETRY_MAX = 3;
export const BOOTSTRAP_RETRY_DELAY_MS = 3000;

export type BootstrapStatus = 'idle' | 'loading' | 'ready' | 'failed';
export type BootstrapFailKind = 'network' | 'auth';

export interface LeagueBootstrapState {
    status: BootstrapStatus;
    failKind: BootstrapFailKind | null;
    /** 확정 실패 후 수동 재시도(실패한 쿼리만). */
    retry: () => void;
}

interface Entry {
    key: readonly unknown[];
    run: (qc: QueryClient) => Promise<unknown>;
}

interface BootstrapInput {
    enabled: boolean;
    league: LeagueRow | null;
    room: RoomRow | null;
    leagueTeams: LeagueTeamRow[];
    /** 내 팀 — 없으면(관전 어드민 등) pendingTradeCount는 대상에서 제외. */
    myTeam: LeagueTeamRow | null;
}

function buildEntries(input: BootstrapInput): Entry[] {
    const { league, room, leagueTeams, myTeam } = input;
    if (!league || !room) return [];
    const roomId = room.id;
    const allRosterIds = [...new Set(leagueTeams.flatMap(t => t.roster ?? []))];
    const sortedIds = [...allRosterIds].sort();
    const mySlug = myTeam?.team_slug ?? null;
    const entries: Entry[] = [];
    const add = (opts: { queryKey: readonly unknown[]; queryFn: (ctx: any) => Promise<any>; staleTime?: number; gcTime?: number }) =>
        entries.push({ key: opts.queryKey, run: qc => qc.fetchQuery({ ...opts, retry: false } as any) });
    const addInfinite = (opts: { queryKey: readonly unknown[]; queryFn: (ctx: any) => Promise<any>; initialPageParam: number; getNextPageParam: any }) =>
        entries.push({ key: opts.queryKey, run: qc => qc.fetchInfiniteQuery({ ...opts, retry: false } as any) });

    add(multiSearchPoolQuery(league));
    add(metaPlayerOrderQuery());
    add(gameShortCodesQuery(roomId));
    if (allRosterIds.length > 0) {
        add(leagueRawPlayersQuery(roomId, allRosterIds));
        add(leagueRawSeasonInjuryQuery(roomId, allRosterIds));
        add(playerSeasonStatsLeagueQuery(roomId, sortedIds, false));
    }
    add(homeLeagueTransactionsQuery(roomId));
    // 홈이 쓰는 뉴스피드 필터 3종(pages/MultiSeasonPage.tsx: 최신 뉴스 / 거래 / 부상·결장)
    addInfinite(leagueNewsStoriesQuery(roomId, mySlug));
    addInfinite(leagueNewsStoriesQuery(roomId, mySlug, { types: ['trade'] }));
    addInfinite(leagueNewsStoriesQuery(roomId, mySlug, { types: ['injury', 'suspension'] }));
    if (myTeam) add(pendingTradeCountQuery(roomId, myTeam.id));
    return entries;
}

export function useLeagueBootstrap(input: BootstrapInput): LeagueBootstrapState {
    const queryClient = useQueryClient();
    const [state, setState] = useState<Omit<LeagueBootstrapState, 'retry'>>({ status: 'idle', failKind: null });
    const runIdRef = useRef(0);
    const pendingRef = useRef<Entry[]>([]);

    const { enabled, league, room, leagueTeams, myTeam } = input;
    const roomId = room?.id ?? null;
    const leagueId = league?.id ?? null;
    const rosterKey = leagueTeams.map(t => (t.roster ?? []).join(',')).join('|');
    const myTeamId = myTeam?.id ?? null;

    /** pending 목록을 병렬로 받고, 실패분만 모아 조용히 재시도. */
    const runPending = useCallback(async (runId: number, attempt: number) => {
        const targets = pendingRef.current;
        if (targets.length === 0) { setState({ status: 'ready', failKind: null }); return; }
        const results = await Promise.allSettled(targets.map(e => e.run(queryClient)));
        if (runIdRef.current !== runId) return;   // 리그/룸이 바뀌어 새 실행이 시작됨
        const failed: Entry[] = [];
        let authFail = false;
        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                failed.push(targets[i]);
                if (isAuthExpiryError(r.reason)) authFail = true;
                console.error('[leagueBootstrap] query failed', targets[i].key, r.reason);
            }
        });
        pendingRef.current = failed;
        if (failed.length === 0) { setState({ status: 'ready', failKind: null }); return; }
        if (attempt < BOOTSTRAP_RETRY_MAX) {
            await new Promise(res => setTimeout(res, BOOTSTRAP_RETRY_DELAY_MS));
            if (runIdRef.current !== runId) return;
            return runPending(runId, attempt + 1);
        }
        setState({ status: 'failed', failKind: authFail ? 'auth' : 'network' });
    }, [queryClient]);

    useEffect(() => {
        if (!enabled || !league || !room) { setState({ status: 'idle', failKind: null }); return; }
        const runId = ++runIdRef.current;
        const entries = buildEntries({ enabled, league, room, leagueTeams, myTeam });
        // 캐시에 데이터가 있는 쿼리는 대기 대상에서 제외
        const missing = entries.filter(e => queryClient.getQueryState(e.key)?.data === undefined);
        pendingRef.current = missing;
        if (missing.length === 0) { setState({ status: 'ready', failKind: null }); return; }
        setState({ status: 'loading', failKind: null });
        void runPending(runId, 1);
        return () => { runIdRef.current++; };
    // leagueTeams/myTeam 객체 자체가 아니라 키에 영향 주는 값만 의존 — 트레이드 등으로 roster가 바뀌면 재평가
    // (그때는 대부분 캐시 미스 쿼리가 1~3개뿐이라 게이트가 잠깐 뜨거나 안 뜸).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, leagueId, roomId, rosterKey, myTeamId, queryClient, runPending]);

    const retry = useCallback(() => {
        if (state.status !== 'failed') return;
        const runId = ++runIdRef.current;
        setState({ status: 'loading', failKind: null });
        void runPending(runId, 1);
    }, [state.status, runPending]);

    return { ...state, retry };
}

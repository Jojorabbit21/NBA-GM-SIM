
import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { parseLeagueEventPayload, type LeagueEventDetail } from '../services/multi/leagueEventPayload';

// 멀티플레이어 "리그 소식"(League Headlines) — 대량득점차/연승/개인 활약/유저간
// 트레이드처럼 "주목할 만한" 사건만 league_events에 이미 걸러서 insert돼 있으므로
// (server/src/simRunner.ts, respond_trade_offer RPC), 여기서는 최근 N개를 그대로
// 가져오기만 하면 된다 — ZenGM의 processEvents() 같은 읽기 시점 재필터링 불필요.

export type LeagueEventType = 'game_result' | 'player_feat' | 'player_streak' | 'win_streak' | 'trade';

export interface LeagueEvent {
    id: string;
    type: LeagueEventType;
    teamIds: string[];
    playerIds: string[];
    score: number;
    headline: string;
    createdAt: string;
    /** game_result 이벤트만 채워짐 — 경기 상세 화면으로 링크할 때 사용. */
    gameId: string | null;
    /** [2026-09-01] 인게임(시뮬레이션) 날짜 — games.game_date 스냅샷, wall-clock createdAt과
     * 다름. 날짜 범위 필터 UI에 표시(YYYY-MM-DD). 이 컬럼 추가 이전 이벤트는 없음(전량
     * 백필됨) — null은 이론상만 존재. */
    simDate: string | null;
    /** [2026-09-01] 구조화 payload 파싱 결과. 옛 이벤트(v 없음)는 kind:'legacy'. */
    detail: LeagueEventDetail;
    /** 조회 시점에 계산 — team_ids에 내 팀이 포함돼 있으면 true(강조 표시용). */
    involvesMyTeam: boolean;
}

const DEFAULT_LIMIT = 8;
const SELECT_COLUMNS = 'id, type, team_ids, player_ids, score, payload, created_at, game_id, sim_date';

function mapRow(row: any, myTeamSlug: string | null): LeagueEvent {
    return {
        id: row.id,
        type: row.type,
        teamIds: row.team_ids ?? [],
        playerIds: row.player_ids ?? [],
        score: row.score ?? 0,
        headline: row.payload?.headline ?? '',
        createdAt: row.created_at,
        gameId: row.game_id ?? null,
        simDate: row.sim_date ?? null,
        detail: parseLeagueEventPayload(row.type, row.payload),
        involvesMyTeam: !!myTeamSlug && (row.team_ids ?? []).includes(myTeamSlug),
    };
}

export function useLeagueHeadlines(roomId: string | undefined, myTeamSlug: string | null, limit: number = DEFAULT_LIMIT) {
    return useQuery({
        queryKey: ['leagueHeadlines', roomId, limit],
        enabled: !!roomId,
        queryFn: async (): Promise<LeagueEvent[]> => {
            const { data, error } = await supabase
                .from('league_events')
                .select(SELECT_COLUMNS)
                .eq('room_id', roomId!)
                .order('created_at', { ascending: false })
                .limit(limit);
            if (error) throw error;

            return (data ?? []).map((row: any) => mapRow(row, myTeamSlug));
        },
    });
}

// ── 뉴스피드 그리드 전용 ─────────────────────────────────────────────────────
// [2026-09-01] "경기 결과" 섹션 삭제(사용자 요청) — 상단 GameDateStrip이 이미 모든 경기
// 결과를 가로 스코어보드로 보여줘서 중복이라는 지적. 일반 경기 결과(game_result)는 더
// 이상 조회하지 않고, 대량득점차 승리처럼 "특이케이스"만 STORY_TYPES와 함께 하나의 피드로
// 합쳐서 보여준다 — game_result는 margin≥20이면 score에 +5가 붙어 10→15가 되므로
// (leagueEvents.ts 참고), score>10(=마진 보너스가 붙은 것만)을 "특이케이스" 기준으로 삼는다.
// PostgREST .or()로 "STORY_TYPES 중 하나 OR (game_result면서 score>10)"을 한 쿼리로 표현.
const STORIES_PAGE_SIZE = 30;
const STORY_TYPES: LeagueEventType[] = ['player_feat', 'player_streak', 'win_streak', 'trade'];
const GAME_RESULT_MIN_SCORE = 15;
// [2026-09-01] 헤더 필터 "빅 뉴스만" 기준 — game_result 대량득점차(margin≥20)/트레이드/
// 트리플더블/고연승과 같은 급의 중요도. leagueEvents.ts의 score 산정 범위(10~30)에서 상위권.
const BIG_NEWS_MIN_SCORE = 20;

export type NewsSortOrder = 'latest' | 'oldest';

export interface LeagueNewsFeedFilters {
    /** 빈 배열/undefined = 전체 팀. team_ids와 하나라도 겹치는 이벤트만(다중 선택 — 리더보드
     * 팀 필터와 동일하게 OR 조건). 쿼리 전에 정렬해 queryKey를 선택 순서와 무관하게 안정시킴. */
    teamSlugs?: string[];
    /** [2026-09-01] 빈 배열/undefined = 전체 타입. 지정하면 그 타입들로만 좁힘(AND 조건 —
     * 이미 기본 쿼리가 "특이케이스만" 걸러둔 상태 위에 추가로 좁히는 것이라, 예를 들어
     * game_result를 선택해도 대량득점차 등 특이케이스만 나오지 일반 경기 결과 전체가
     * 나오진 않음 — GameDateStrip과의 중복 방지 원칙 유지). */
    types?: LeagueEventType[];
    bigNewsOnly?: boolean;
    sortOrder?: NewsSortOrder;
    /** 인게임(시뮬레이션) 날짜 범위(YYYY-MM-DD, inclusive) — league_events.sim_date 기준.
     * created_at(실제 시각)이 아니라 리그가 압축 스케줄로 진행되는 인게임 날짜를 필터링. */
    simDateFrom?: string | null;
    simDateTo?: string | null;
}

export function useLeagueNewsFeed(roomId: string | undefined, myTeamSlug: string | null, filters: LeagueNewsFeedFilters = {}) {
    const { teamSlugs = [], types = [], bigNewsOnly = false, sortOrder = 'latest', simDateFrom = null, simDateTo = null } = filters;
    const ascending = sortOrder === 'oldest';
    const sortedTeamSlugs = [...teamSlugs].sort();
    const sortedTypes = [...types].sort();

    const storiesQuery = useInfiniteQuery({
        queryKey: ['leagueNewsStories', roomId, sortedTeamSlugs, sortedTypes, bigNewsOnly, sortOrder, simDateFrom, simDateTo],
        enabled: !!roomId,
        initialPageParam: 0,
        queryFn: async ({ pageParam }): Promise<LeagueEvent[]> => {
            let query = supabase
                .from('league_events')
                .select(SELECT_COLUMNS)
                .eq('room_id', roomId!)
                .or(`type.in.(${STORY_TYPES.join(',')}),and(type.eq.game_result,score.gte.${GAME_RESULT_MIN_SCORE})`);
            if (sortedTeamSlugs.length > 0) query = query.overlaps('team_ids', sortedTeamSlugs);
            if (sortedTypes.length > 0) query = query.in('type', sortedTypes);
            if (bigNewsOnly) query = query.gte('score', BIG_NEWS_MIN_SCORE);
            if (simDateFrom) query = query.gte('sim_date', simDateFrom);
            if (simDateTo) query = query.lte('sim_date', simDateTo);
            const { data, error } = await query
                .order('created_at', { ascending })
                .range(pageParam, pageParam + STORIES_PAGE_SIZE - 1);
            if (error) throw error;
            return (data ?? []).map((row: any) => mapRow(row, myTeamSlug));
        },
        getNextPageParam: (lastPage, allPages) =>
            lastPage.length < STORIES_PAGE_SIZE ? undefined : allPages.length * STORIES_PAGE_SIZE,
    });

    useLeagueEventsRealtime(roomId);

    return {
        stories: storiesQuery.data?.pages.flat() ?? [],
        isLoading: storiesQuery.isLoading,
        hasMore: !!storiesQuery.hasNextPage,
        fetchNextPage: storiesQuery.fetchNextPage,
        isFetchingNextPage: storiesQuery.isFetchingNextPage,
    };
}

// ── Realtime ─────────────────────────────────────────────────────────────
// 경기 한 판이 끝나면 league_events에 ~10행이 버스트로 insert되므로, 300~500ms 디바운스
// 후 관련 쿼리를 한 번만 무효화한다. 패턴 출처: hooks/useMultiGameData.ts의 games 구독
// (동일하게 버스트 UPDATE/DELETE/INSERT를 디바운스 후 전체 재조회로 수렴시킴).
function useLeagueEventsRealtime(roomId: string | undefined) {
    const queryClient = useQueryClient();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!roomId) return;

        const invalidate = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['leagueNewsStories', roomId] });
                queryClient.invalidateQueries({ queryKey: ['leagueHeadlines', roomId] });
            }, 400);
        };

        const channel = supabase
            .channel(`league-events-${roomId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'league_events', filter: `room_id=eq.${roomId}` },
                invalidate,
            )
            .subscribe();

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            supabase.removeChannel(channel);
        };
    }, [roomId, queryClient]);
}

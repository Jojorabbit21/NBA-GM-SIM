
import { useMemo, useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// 홈 로스터 위젯 / 로스터 화면 / 리더보드 화면 / 선수상세 화면이 각자 따로 meta_players+
// game_pbp를 긁어오던 걸 하나로 통합 — 같은 queryKey를 쓰는 useQuery라면 어느 화면에서
// 먼저 로드하든 나머지 화면은 캐시를 그대로 재사용해 로더 없이 즉시 뜬다.
// 화면별로 필요한 파생 데이터 모양이 달라서(로스터: Team[]+게임로그, 리더보드: Team[],
// 홈 위젯: 내 팀 선수만) select 옵션으로 각자 다르게 가공하되 원본 fetch는 공유한다.
//
// [2026-09-07] game_pbp(room 전체 박스스코어, 게임당 home_box/away_box JSONB — 시즌이
// 길어질수록 수 MB)를 매번 통째로 받아오는 게 팀 화면 최초 진입의 최대 병목으로 실측됐다
// (7초+). 선수별 시즌 집계는 get_player_season_stats_full RPC(usePlayerSeasonStatsFull)로
// 서버에서 미리 집계해 받도록 옮기고, 이 훅은 필요한 화면(경기 기록/일정 탭처럼 경기 단위
// 원본이 실제로 필요한 곳)만 `includePbp`로 선택적으로 가져오도록 내부를 3개 쿼리(선수
// 신원+시즌집계용 원본은 그대로, game_pbp만 분리)로 쪼갰다. meta_players는 room과 무관한
// 공유 테이블이라 별도 쿼리로 빼도 기존처럼 화면 간 캐시 공유가 그대로 유지된다.
// 기존 호출부(옵션 없이 호출)는 동작·큐key 전부 그대로라 이번 변경의 영향을 받지 않는다.

export interface LeagueRawStatsData {
    playersRaw: any[];
    pbpRows: any[];
    /** 이 리그(room) 안에서 이미 끝난 과거 시즌들의 최종 스탯 스냅샷 —
     *  meta_players.career_history(전체 리그 공유·실제 NBA 커리어)와 별개로 room_id 단위로
     *  격리 저장된다(여러 리그가 동시에 돌아도 서로 안 섞임). 시즌 롤오버 기능이 아직 없어
     *  현재는 항상 빈 배열이지만, buildLeagueTeams()가 이미 이 필드를 merge하도록 준비돼 있다. */
    leagueSeasonRows: { player_id: string; season: string; stat_line: Record<string, any> }[];
    /** 서버(simRunner.ts)가 경기 시뮬 후 기록하는 부상/출장정지 이력 + 현재 상태 —
     *  room_player_state 테이블(room_id, player_id 단위). buildLeagueTeams()가
     *  injury_history를 player.injuryHistory로 merge. health/return_date/season_number는
     *  "지금 활성 부상인지" 판정용(MultiRosterView.tsx의 로스터 배지 등 호출부가 직접 판정 —
     *  이 훅은 원본 그대로 전달만 한다). */
    playerInjuryRows: {
        player_id: string;
        injury_history: Record<string, any>[];
        health: string | null;
        return_date: string | null;
        season_number: number | null;
    }[];
}

// [2026-09-07] tendencies/career_history는 뺐다 — 실측 결과 리그 로스터 전체(250명+)의
// 이 두 무거운 JSONB를 매번 같이 받는 게 meta_players fetch의 상당 시간을 차지했는데,
// 정작 이 훅의 호출부(로스터/리더보드/전술/홈 위젯/프런트오피스) 중 실제로 쓰는 곳이
// 하나도 없었다(전부 base_attributes만 사용). 유일하게 필요했던 선수 프로필 화면
// (MultiPlayerDetailView.tsx의 스카우팅 리포트)은 usePlayerCareerHistory/usePlayerTendencies로
// 지금 보고 있는 선수 한 명만 targeted 조회하도록 이미 옮겨져 있음(career_history는
// FA 케이스에서 이미 이 패턴이었고, 이번에 로스터 선수 케이스+tendencies까지 확장).
const RAW_PLAYER_COLS = 'id, name, position, base_attributes';
const RAW_PBP_COLS = 'game_id, home_box, away_box, home_team_id, away_team_id, home_score, away_score, game_start_time';
const RAW_LEAGUE_SEASON_COLS = 'player_id, season, stat_line';
const RAW_PLAYER_INJURY_COLS = 'player_id, injury_history, health, return_date, season_number';

// game_pbp만 단독으로 필요한 곳(경기 기록/일정 탭 등)에서 직접 쓸 수 있도록 공개 export —
// useLeagueRawStats 내부의 pbp 쿼리와 완전히 동일한 queryKey/queryFn을 써서, 한쪽에서
// 이미 로드했으면(예: 리더보드 화면 방문) 다른 쪽은 캐시를 그대로 재사용한다.
export function useRoomGamePbp(roomId: string | undefined | null, enabled: boolean = true) {
    return useQuery({
        queryKey: ['leagueRawPbp', roomId],
        enabled: !!roomId && enabled,
        placeholderData: keepPreviousData,
        queryFn: async (): Promise<any[]> => {
            const { data, error } = await supabase.from('game_pbp').select(RAW_PBP_COLS).eq('room_id', roomId!);
            if (error) throw error;
            return data ?? [];
        },
    });
}

export interface UseLeagueRawStatsOptions {
    /** false면 game_pbp(room 전체 박스스코어) fetch를 건너뛰고 pbpRows를 빈 배열로 반환한다.
     *  팀 화면 개요 탭처럼 선수 시즌 스탯이 필요 없는 화면(usePlayerSeasonStatsFull로 대체)에서
     *  이 무거운 fetch를 피하기 위함. 기본값 true(기존 동작과 100% 동일). */
    includePbp?: boolean;
    /** 추가 활성화 조건(예: 특정 탭이 열려 있을 때만) — allRosterIds/roomId 조건과 AND. */
    enabled?: boolean;
}

export function useLeagueRawStats<T = LeagueRawStatsData>(
    roomId: string | undefined,
    allRosterIds: string[],
    select?: (data: LeagueRawStatsData) => T,
    options?: UseLeagueRawStatsOptions,
) {
    const includePbp   = options?.includePbp ?? true;
    const extraEnabled = options?.enabled ?? true;
    const idsKey = allRosterIds.join(',');

    // meta_players는 room과 무관(전체 리그가 공유하는 테이블)이라 roomId 없이 선수 id
    // 집합만으로 캐시를 공유한다 — 홈 위젯/로스터/리더보드/선수상세가 같은 allRosterIds를
    // 쓰는 한(대개 그렇다) game_pbp 포함 여부와 무관하게 항상 재사용된다.
    const playersEnabled      = allRosterIds.length > 0 && extraEnabled;
    const seasonInjuryEnabled = allRosterIds.length > 0 && !!roomId && extraEnabled;
    const pbpEnabled          = !!roomId && allRosterIds.length > 0 && extraEnabled && includePbp;

    const playersQuery = useQuery({
        queryKey: ['leagueRawPlayers', idsKey],
        enabled: playersEnabled,
        placeholderData: keepPreviousData,
        queryFn: async (): Promise<any[]> => {
            const { data, error } = await supabase.from('meta_players').select(RAW_PLAYER_COLS).in('id', allRosterIds);
            if (error) throw error;
            return data ?? [];
        },
    });

    const seasonInjuryQuery = useQuery({
        queryKey: ['leagueRawSeasonInjury', roomId, idsKey],
        enabled: seasonInjuryEnabled,
        placeholderData: keepPreviousData,
        queryFn: async () => {
            const [seasonRes, injuryRes] = await Promise.all([
                supabase.from('league_player_seasons').select(RAW_LEAGUE_SEASON_COLS).eq('room_id', roomId!),
                supabase.from('room_player_state').select(RAW_PLAYER_INJURY_COLS).eq('room_id', roomId!).in('player_id', allRosterIds),
            ]);
            return {
                leagueSeasonRows: seasonRes.data ?? [],
                playerInjuryRows: injuryRes.data ?? [],
            };
        },
    });

    const pbpQuery = useRoomGamePbp(roomId, allRosterIds.length > 0 && extraEnabled && includePbp);

    const raw = useMemo<LeagueRawStatsData>(() => ({
        playersRaw:       playersQuery.data ?? [],
        pbpRows:          includePbp ? (pbpQuery.data ?? []) : [],
        leagueSeasonRows: seasonInjuryQuery.data?.leagueSeasonRows ?? [],
        playerInjuryRows: seasonInjuryQuery.data?.playerInjuryRows ?? [],
    }), [playersQuery.data, pbpQuery.data, seasonInjuryQuery.data, includePbp]);

    // select는 원본 raw가 실제로 바뀔 때만 재계산(react-query의 select 옵션과 동일한
    // 메모이제이션 의도) — 호출부는 select 함수를 useCallback으로 안정된 참조로 넘겨야 함.
    const data = useMemo(() => (select ? select(raw) : (raw as unknown as T)), [select, raw]);

    // [2026-09-11 Fix] React Query는 enabled:false인 쿼리를 "아직 실행 안 됨"으로 취급해
    // isPending을 영원히 true로 유지한다 — allRosterIds가 애초에 비어있는 경우(드래프트
    // 완료 전이라 어느 팀에도 로스터가 없을 때 등)엔 세 쿼리 다 비활성 상태로 멈춰서 이
    // 훅을 쓰는 화면(선수상세 등)이 무한 로딩 스피너에 갇히는 버그가 있었다. 각 쿼리는
    // 자신의 enabled 조건이 켜져 있을 때만 isPending을 집계에 반영한다.
    const isPending = (playersEnabled && playersQuery.isPending)
        || (seasonInjuryEnabled && seasonInjuryQuery.isPending)
        || (pbpEnabled && pbpQuery.isPending);
    const isFetching = (playersEnabled && playersQuery.isFetching)
        || (seasonInjuryEnabled && seasonInjuryQuery.isFetching)
        || (pbpEnabled && pbpQuery.isFetching);

    const refetch = useCallback(async () => {
        await Promise.all([
            playersQuery.refetch(),
            seasonInjuryQuery.refetch(),
            includePbp ? pbpQuery.refetch() : Promise.resolve(),
        ]);
    }, [playersQuery.refetch, seasonInjuryQuery.refetch, pbpQuery.refetch, includePbp]);

    return { data, isPending, isFetching, refetch };
}

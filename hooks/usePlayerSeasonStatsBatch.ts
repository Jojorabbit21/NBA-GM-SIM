
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PlayerStats } from '../types';
import {
    playerSeasonStatsLeagueQuery,
    pickPlayerSeasonStats,
    type PlayerSeasonStatsLeague,
} from './usePlayerSeasonStatsLeague';

// 뉴스피드/일정 MVP/프런트오피스처럼 화면에 보이는 선수 몇 명의 기본 시즌 스탯(경기수·출전시간·득점/리바운드/어시스트/스틸/블락/
// 턴오버·FG/3P/FT)만 필요한 곳용. 원래는 get_player_season_stats_batch RPC로 요청한 선수만 서버에서 집계했다.
//
// [2026-10-20] 이 훅은 이제 자체 RPC를 호출하지 않는다. get_player_season_stats_full/league/batch 3종이 같은 game_pbp 전
// 경기 스캔을 각자 반복해 임시 파일을 약 5GB/100분 쓰고 있었다(docs/history/dev-log.md). usePlayerSeasonStatsLeague의 방 단위
// 쿼리를 isPlayoff=null(정규+플레이오프 합산, 올스타 제외 — 예전 batch RPC와 같은 의미)로 공유하고, 요청한 선수·예전 Batch가
// 내려주던 항목만 골라 쓴다. get_player_season_stats_batch RPC는 DB에 그대로 남아 있다(롤백용, 현재 호출 없음).

// [2026-09-02] Map → plain Record로 변경(버그 수정) — index.tsx의 PersistQueryClientProvider가
// react-query 캐시를 localStorage에 JSON.stringify로 영속화한다. Map은 JSON 직렬화 시
// "{}"이 되어(Map 고유 프로퍼티가 전혀 보존 안 됨) 새로고침 후 캐시가 복원되면 이 쿼리의
// data가 진짜 Map이 아니라 빈 plain object가 되고, staleTime: Infinity라 재조회도 안 돼서
// 영구히 깨진 상태로 남는다 — 소비처(mergeStatsIntoPlayerCardMap 등)가 .get()/.size/
// for..of(Map 전용)를 호출하면서 크래시. plain Record는 JSON 직렬화에 안전하므로 근본 해결.
export type PlayerSeasonStatsBatch = Record<string, Partial<PlayerStats>>;

/** 예전 get_player_season_stats_batch가 내려주던 항목 그대로. */
const BATCH_FIELDS = [
    'g', 'mp', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga', 'p3m', 'p3a', 'ftm', 'fta',
] as const satisfies readonly (keyof PlayerStats)[];

export function usePlayerSeasonStatsBatch(roomId: string | undefined, playerIds: string[]) {
    // 배열 순서가 바뀌어도 같은 select 결과를 쓰도록 정렬 — 같은 선수 집합이면 캐시 재사용.
    const sortedIds = [...new Set(playerIds)].sort();
    const idsKey = sortedIds.join(',');

    // 키에 선수 목록이 없어(방 단위) 선수 목록이 바뀌어도 isPending이 되돌아가지 않는다(배지·스탯 깜빡임 방지).
    // 방(room)이 바뀌면 키가 달라져 이전 리그 값은 자연히 쓰이지 않는다.
    const select = useCallback(
        (all: PlayerSeasonStatsLeague): PlayerSeasonStatsBatch => pickPlayerSeasonStats(all, sortedIds, BATCH_FIELDS),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [idsKey],
    );

    return useQuery({
        ...playerSeasonStatsLeagueQuery(roomId, null),
        enabled: !!roomId && sortedIds.length > 0,
        select,
    });
}

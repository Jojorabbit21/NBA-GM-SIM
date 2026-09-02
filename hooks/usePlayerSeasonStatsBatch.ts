
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { PlayerStats } from '../types';

// get_player_season_stats_batch RPC(migrations/add_player_season_stats_batch_rpc.sql) —
// game_pbp(room 전체 30팀 박스스코어, player_id 컬럼 없이 home_box/away_box JSONB 배열만
// 있음)를 서버에서 스캔·집계하되, 응답은 요청한 player_id들의 결과만 돌려준다. 뉴스피드처럼
// 화면에 보이는 선수 몇 명(20~40명)만 필요한 곳에서, room 전체 박스스코어를 통째로 내려받는
// useLeagueRawStats 대신 쓰기 위한 가벼운 대안.
interface StatsBatchRow {
    player_id: string;
    g: number; mp: number; pts: number; reb: number; ast: number;
    stl: number; blk: number; tov: number; fgm: number; fga: number;
    p3m: number; p3a: number; ftm: number; fta: number;
}

// [2026-09-02] Map → plain Record로 변경(버그 수정) — index.tsx의 PersistQueryClientProvider가
// react-query 캐시를 localStorage에 JSON.stringify로 영속화한다. Map은 JSON 직렬화 시
// "{}"이 되어(Map 고유 프로퍼티가 전혀 보존 안 됨) 새로고침 후 캐시가 복원되면 이 쿼리의
// data가 진짜 Map이 아니라 빈 plain object가 되고, staleTime: Infinity라 재조회도 안 돼서
// 영구히 깨진 상태로 남는다 — 소비처(mergeStatsIntoPlayerCardMap 등)가 .get()/.size/
// for..of(Map 전용)를 호출하면서 크래시. plain Record는 JSON 직렬화에 안전하므로 근본 해결.
export type PlayerSeasonStatsBatch = Record<string, Partial<PlayerStats>>;

export function usePlayerSeasonStatsBatch(roomId: string | undefined, playerIds: string[]) {
    // 배열 순서가 바뀌어도 동일 queryKey를 쓰도록 정렬 — 같은 선수 집합이면 캐시 재사용.
    const sortedIds = [...new Set(playerIds)].sort();

    return useQuery({
        queryKey: ['playerSeasonStatsBatch', roomId, sortedIds.join(',')],
        enabled: !!roomId && sortedIds.length > 0,
        queryFn: async (): Promise<PlayerSeasonStatsBatch> => {
            const { data, error } = await supabase.rpc('get_player_season_stats_batch', {
                p_room_id: roomId,
                p_player_ids: sortedIds,
            });
            if (error) throw error;

            const m: PlayerSeasonStatsBatch = {};
            // numeric 컬럼은 정밀도 보존을 위해 supabase-js가 문자열로 내려주므로 Number() 변환 필요.
            for (const row of (data ?? []) as StatsBatchRow[]) {
                m[row.player_id] = {
                    g: row.g,
                    mp: Number(row.mp), pts: Number(row.pts), reb: Number(row.reb), ast: Number(row.ast),
                    stl: Number(row.stl), blk: Number(row.blk), tov: Number(row.tov),
                    fgm: Number(row.fgm), fga: Number(row.fga),
                    p3m: Number(row.p3m), p3a: Number(row.p3a),
                    ftm: Number(row.ftm), fta: Number(row.fta),
                };
            }
            return m;
        },
    });
}

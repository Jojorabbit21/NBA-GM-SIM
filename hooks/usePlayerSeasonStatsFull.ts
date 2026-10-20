
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PlayerStats } from '../types/player';
import {
    playerSeasonStatsLeagueQuery,
    pickPlayerSeasonStats,
    type PlayerSeasonStatsLeague,
} from './usePlayerSeasonStatsLeague';

// 팀(로스터) 화면/뉴스 피드 선수 탭/올스타 화면의 선수 시즌 스탯(존 슛차트·수비존·gs/offReb/defReb/pf/plusMinus/contested* 포함).
// MultiRosterView.tsx가 예전엔 room 전체 game_pbp(수 MB)를 받아 클라이언트에서 직접 집계해 최초 진입에 7초+ 걸렸고
// (2026-09-07), 그걸 get_player_season_stats_full RPC로 옮겼었다.
//
// [2026-10-20] 이 훅은 이제 자체 RPC를 호출하지 않는다. get_player_season_stats_full/league/batch 3종이 같은 game_pbp 전
// 경기 스캔을 각자 반복해 임시 파일을 약 5GB/100분 쓰고 있었다(DB 컴퓨트 압박 조사, docs/history/dev-log.md). 그래서
// usePlayerSeasonStatsLeague의 방 단위 쿼리(p_player_ids=null)를 isPlayoff=null(정규+플레이오프 합산, 올스타 제외 — 예전
// full RPC와 같은 의미)로 공유하고, 요청한 선수·예전 Full이 내려주던 항목만 골라 쓴다. get_player_season_stats_full RPC는
// DB에 그대로 남아 있다(롤백용, 현재 호출 없음).

export type PlayerSeasonStatsFull = Record<string, Partial<PlayerStats>>;

/** 예전 get_player_season_stats_full이 내려주던 항목 그대로 — League에만 있던 항목이 섞이면 다른 곳의 값을 덮어쓸 수 있다. */
const FULL_FIELDS = [
    'g', 'gs', 'mp', 'pts', 'reb', 'offReb', 'defReb', 'ast', 'stl', 'blk', 'tov', 'pf',
    'fgm', 'fga', 'p3m', 'p3a', 'ftm', 'fta', 'rimM', 'rimA', 'midM', 'midA', 'plusMinus',
    'contestedAttempted', 'contestedMade',
    'defRAAttempted', 'defRAMade', 'defITPAttempted', 'defITPMade', 'defMIDAttempted', 'defMIDMade',
    'defCNRAttempted', 'defCNRMade', 'defWINGAttempted', 'defWINGMade', 'defATBAttempted', 'defATBMade',
    'zone_rim_m', 'zone_rim_a', 'zone_paint_m', 'zone_paint_a',
    'zone_mid_l_m', 'zone_mid_l_a', 'zone_mid_c_m', 'zone_mid_c_a', 'zone_mid_r_m', 'zone_mid_r_a',
    'zone_c3_l_m', 'zone_c3_l_a', 'zone_c3_r_m', 'zone_c3_r_a',
    'zone_atb3_l_m', 'zone_atb3_l_a', 'zone_atb3_c_m', 'zone_atb3_c_a', 'zone_atb3_r_m', 'zone_atb3_r_a',
] as const satisfies readonly (keyof PlayerStats)[];

export function usePlayerSeasonStatsFull(roomId: string | undefined | null, playerIds: string[]) {
    // 배열 순서가 바뀌어도 같은 select 결과를 쓰도록 정렬.
    const sortedIds = [...new Set(playerIds)].sort();
    const idsKey = sortedIds.join(',');

    // 키에 선수 목록이 없어(방 단위) 로스터가 바뀌어도 isPending이 되돌아가지 않는다 — 예전 keepPreviousData 우회가 필요 없다.
    const select = useCallback(
        (all: PlayerSeasonStatsLeague): PlayerSeasonStatsFull => pickPlayerSeasonStats(all, sortedIds, FULL_FIELDS),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [idsKey],
    );

    return useQuery({
        ...playerSeasonStatsLeagueQuery(roomId, null),
        enabled: !!roomId && sortedIds.length > 0,
        select,
    });
}

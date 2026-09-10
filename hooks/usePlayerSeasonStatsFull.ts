
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { PlayerStats } from '../types/player';

// get_player_season_stats_full RPC(migrations/add_player_season_stats_full_rpc.sql) —
// MultiRosterView.tsx가 예전엔 room 전체 game_pbp(수 MB, 게임당 home_box/away_box JSONB)를
// 통째로 받아 클라이언트(buildStatsMap)에서 존 슛차트/수비존까지 전부 직접 집계했다 —
// 이게 팀 화면 최초 진입 시 최대 병목(실측 7초+)이었다. usePlayerSeasonStatsBatch(뉴스피드용,
// 기본 스탯만)와 같은 패턴이되 buildStatsMap이 만들던 필드 전체(존 슛차트 20개, 수비존 12개,
// gs/offReb/defReb/pf/plusMinus/contested* 포함)를 서버에서 집계해 선수당 한 줄만 받는다.
interface StatsFullRow {
    player_id: string;
    g: number; gs: string | number; mp: string | number;
    pts: string | number; reb: string | number; off_reb: string | number; def_reb: string | number;
    ast: string | number; stl: string | number; blk: string | number; tov: string | number; pf: string | number;
    fgm: string | number; fga: string | number; p3m: string | number; p3a: string | number;
    ftm: string | number; fta: string | number;
    rim_m: string | number; rim_a: string | number; mid_m: string | number; mid_a: string | number;
    plus_minus: string | number;
    contested_attempted: string | number; contested_made: string | number;
    def_ra_attempted: string | number; def_ra_made: string | number;
    def_itp_attempted: string | number; def_itp_made: string | number;
    def_mid_attempted: string | number; def_mid_made: string | number;
    def_cnr_attempted: string | number; def_cnr_made: string | number;
    def_wing_attempted: string | number; def_wing_made: string | number;
    def_atb_attempted: string | number; def_atb_made: string | number;
    zone_rim_m: string | number; zone_rim_a: string | number;
    zone_paint_m: string | number; zone_paint_a: string | number;
    zone_mid_l_m: string | number; zone_mid_l_a: string | number;
    zone_mid_c_m: string | number; zone_mid_c_a: string | number;
    zone_mid_r_m: string | number; zone_mid_r_a: string | number;
    zone_c3_l_m: string | number; zone_c3_l_a: string | number;
    zone_c3_r_m: string | number; zone_c3_r_a: string | number;
    zone_atb3_l_m: string | number; zone_atb3_l_a: string | number;
    zone_atb3_c_m: string | number; zone_atb3_c_a: string | number;
    zone_atb3_r_m: string | number; zone_atb3_r_a: string | number;
}

export type PlayerSeasonStatsFull = Record<string, Partial<PlayerStats>>;

export function usePlayerSeasonStatsFull(roomId: string | undefined | null, playerIds: string[]) {
    // 배열 순서가 바뀌어도 동일 queryKey를 쓰도록 정렬(usePlayerSeasonStatsBatch와 동일 패턴).
    const sortedIds = [...new Set(playerIds)].sort();

    return useQuery({
        queryKey: ['playerSeasonStatsFull', roomId, sortedIds.join(',')],
        enabled: !!roomId && sortedIds.length > 0,
        queryFn: async (): Promise<PlayerSeasonStatsFull> => {
            const { data, error } = await supabase.rpc('get_player_season_stats_full', {
                p_room_id: roomId,
                p_player_ids: sortedIds,
            });
            if (error) throw error;

            const m: PlayerSeasonStatsFull = {};
            // numeric 컬럼은 정밀도 보존을 위해 supabase-js가 문자열로 내려주므로 Number() 변환 필요.
            for (const row of (data ?? []) as StatsFullRow[]) {
                m[row.player_id] = {
                    g: row.g, gs: Number(row.gs), mp: Number(row.mp),
                    pts: Number(row.pts), reb: Number(row.reb),
                    offReb: Number(row.off_reb), defReb: Number(row.def_reb),
                    ast: Number(row.ast), stl: Number(row.stl), blk: Number(row.blk), tov: Number(row.tov),
                    pf: Number(row.pf),
                    fgm: Number(row.fgm), fga: Number(row.fga),
                    p3m: Number(row.p3m), p3a: Number(row.p3a),
                    ftm: Number(row.ftm), fta: Number(row.fta),
                    rimM: Number(row.rim_m), rimA: Number(row.rim_a),
                    midM: Number(row.mid_m), midA: Number(row.mid_a),
                    plusMinus: Number(row.plus_minus),
                    contestedAttempted: Number(row.contested_attempted),
                    contestedMade: Number(row.contested_made),
                    defRAAttempted: Number(row.def_ra_attempted), defRAMade: Number(row.def_ra_made),
                    defITPAttempted: Number(row.def_itp_attempted), defITPMade: Number(row.def_itp_made),
                    defMIDAttempted: Number(row.def_mid_attempted), defMIDMade: Number(row.def_mid_made),
                    defCNRAttempted: Number(row.def_cnr_attempted), defCNRMade: Number(row.def_cnr_made),
                    defWINGAttempted: Number(row.def_wing_attempted), defWINGMade: Number(row.def_wing_made),
                    defATBAttempted: Number(row.def_atb_attempted), defATBMade: Number(row.def_atb_made),
                    zone_rim_m: Number(row.zone_rim_m), zone_rim_a: Number(row.zone_rim_a),
                    zone_paint_m: Number(row.zone_paint_m), zone_paint_a: Number(row.zone_paint_a),
                    zone_mid_l_m: Number(row.zone_mid_l_m), zone_mid_l_a: Number(row.zone_mid_l_a),
                    zone_mid_c_m: Number(row.zone_mid_c_m), zone_mid_c_a: Number(row.zone_mid_c_a),
                    zone_mid_r_m: Number(row.zone_mid_r_m), zone_mid_r_a: Number(row.zone_mid_r_a),
                    zone_c3_l_m: Number(row.zone_c3_l_m), zone_c3_l_a: Number(row.zone_c3_l_a),
                    zone_c3_r_m: Number(row.zone_c3_r_m), zone_c3_r_a: Number(row.zone_c3_r_a),
                    zone_atb3_l_m: Number(row.zone_atb3_l_m), zone_atb3_l_a: Number(row.zone_atb3_l_a),
                    zone_atb3_c_m: Number(row.zone_atb3_c_m), zone_atb3_c_a: Number(row.zone_atb3_c_a),
                    zone_atb3_r_m: Number(row.zone_atb3_r_m), zone_atb3_r_a: Number(row.zone_atb3_r_a),
                } as Partial<PlayerStats>;
            }
            return m;
        },
    });
}

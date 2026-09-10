
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { PlayerStats } from '../types/player';

// get_player_season_stats_league RPC(migrations/add_player_season_stats_league_rpc.sql) —
// services/multi/buildLeagueTeams.ts(홈/리더보드/트레이드/선수상세/전술 5개 화면이 공유)가
// 예전엔 room 전체 game_pbp 원본을 통째로 받아 클라이언트에서 선수별 시즌 스탯을 직접
// 집계했다 — 팀 화면(MultiRosterView.tsx)에서 이미 고친 것과 동일한 병목(2026-09-07,
// 홈 화면 실측 8.2초). usePlayerSeasonStatsFull.ts와 같은 패턴이되, buildLeagueTeams가
// 필요로 하는 필드가 더 많아(tovForced/techFouls/flagrantFouls + 구버전 3존 수비지표) 별도
// RPC/훅으로 분리했다.
interface StatsLeagueRow {
    player_id: string;
    g: number; gs: string | number; mp: string | number;
    pts: string | number; reb: string | number; off_reb: string | number; def_reb: string | number;
    ast: string | number; stl: string | number; blk: string | number;
    tov: string | number; tov_forced: string | number;
    pf: string | number; tech_fouls: string | number; flagrant_fouls: string | number;
    fgm: string | number; fga: string | number; p3m: string | number; p3a: string | number;
    ftm: string | number; fta: string | number;
    rim_m: string | number; rim_a: string | number; mid_m: string | number; mid_a: string | number;
    plus_minus: string | number;
    contested_attempted: string | number; contested_made: string | number;
    def_rim_attempted: string | number; def_rim_made: string | number;
    def_mid_attempted: string | number; def_mid_made: string | number;
    def_three_attempted: string | number; def_three_made: string | number;
    def_ra_attempted: string | number; def_ra_made: string | number;
    def_itp_attempted: string | number; def_itp_made: string | number;
    def_mid6_attempted: string | number; def_mid6_made: string | number;
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

export type PlayerSeasonStatsLeague = Record<string, Partial<PlayerStats>>;

export function usePlayerSeasonStatsLeague(roomId: string | undefined | null, playerIds: string[]) {
    const sortedIds = [...new Set(playerIds)].sort();

    return useQuery({
        queryKey: ['playerSeasonStatsLeague', roomId, sortedIds.join(',')],
        enabled: !!roomId && sortedIds.length > 0,
        queryFn: async (): Promise<PlayerSeasonStatsLeague> => {
            const { data, error } = await supabase.rpc('get_player_season_stats_league', {
                p_room_id: roomId,
                p_player_ids: sortedIds,
            });
            if (error) throw error;

            const m: PlayerSeasonStatsLeague = {};
            for (const row of (data ?? []) as StatsLeagueRow[]) {
                m[row.player_id] = {
                    g: row.g, gs: Number(row.gs), mp: Number(row.mp),
                    pts: Number(row.pts), reb: Number(row.reb),
                    offReb: Number(row.off_reb), defReb: Number(row.def_reb),
                    ast: Number(row.ast), stl: Number(row.stl), blk: Number(row.blk),
                    tov: Number(row.tov), tovForced: Number(row.tov_forced),
                    pf: Number(row.pf), techFouls: Number(row.tech_fouls), flagrantFouls: Number(row.flagrant_fouls),
                    fgm: Number(row.fgm), fga: Number(row.fga),
                    p3m: Number(row.p3m), p3a: Number(row.p3a),
                    ftm: Number(row.ftm), fta: Number(row.fta),
                    rimM: Number(row.rim_m), rimA: Number(row.rim_a),
                    midM: Number(row.mid_m), midA: Number(row.mid_a),
                    plusMinus: Number(row.plus_minus),
                    contestedAttempted: Number(row.contested_attempted),
                    contestedMade: Number(row.contested_made),
                    defRimAttempted: Number(row.def_rim_attempted), defRimMade: Number(row.def_rim_made),
                    defMidAttempted: Number(row.def_mid_attempted), defMidMade: Number(row.def_mid_made),
                    defThreeAttempted: Number(row.def_three_attempted), defThreeMade: Number(row.def_three_made),
                    defRAAttempted: Number(row.def_ra_attempted), defRAMade: Number(row.def_ra_made),
                    defITPAttempted: Number(row.def_itp_attempted), defITPMade: Number(row.def_itp_made),
                    defMIDAttempted: Number(row.def_mid6_attempted), defMIDMade: Number(row.def_mid6_made),
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

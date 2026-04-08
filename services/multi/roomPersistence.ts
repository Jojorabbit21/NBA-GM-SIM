
import { supabase } from '../supabaseClient';
import type { GameTactics, DepthChart, SavedPlayerState, ReplaySnapshot } from '../../types';
import type { SimSettings } from '../../types/simSettings';
import type { SavedTeamFinances } from '../../types/finance';
import type { LeaguePickAssets } from '../../types/draftAssets';
import type { LeagueTradeBlocks, LeagueTradeOffers } from '../../types/trade';
import type { LeagueGMProfiles } from '../../types/gm';
import type { OffseasonPhase } from '../../types/app';
import type { LeagueFAPool } from '../../types/generatedPlayer';
import type { LeagueFAMarket } from '../../types/fa';
import type { LeagueTrainingConfigs } from '../../types/training';
import type { CoachFAPool } from '../../types/coaching';

// ─── 방(Room) 수준 상태 저장 ──────────────────────────────────────────────────
// 싱글의 saveCheckpoint 패턴을 따름. 방은 반드시 먼저 존재해야 한다 (update only).

export interface RoomSavePayload {
    simDate?:              string;
    offseasonPhase?:       OffseasonPhase;
    season?:               string;
    seasonNumber?:         number;
    rosterState?:          Record<string, SavedPlayerState | number> | null;
    draftState?:           any | null;
    tendencySeed?:         string | null;
    replaySnapshot?:       ReplaySnapshot | null;
    simSettings?:          SimSettings | null;
    coachingStaff?:        Record<string, any> | null;
    teamFinances?:         SavedTeamFinances | null;
    leaguePickAssets?:     LeaguePickAssets | null;
    leagueCapHistory?:     Record<number, number> | null;
    leagueTradeBlocks?:    LeagueTradeBlocks | null;
    leagueTradeOffers?:    LeagueTradeOffers | null;
    leagueGMProfiles?:     LeagueGMProfiles | null;
    leagueFAPool?:         LeagueFAPool | null;
    leagueFAMarket?:       LeagueFAMarket | null;
    leagueTrainingConfigs?: LeagueTrainingConfigs | null;
    coachFAPool?:          CoachFAPool | null;
    retiredPlayerIds?:     string[] | null;
    lotteryResult?:        any | null;
    schedule?:             any[] | null;
    status?:               'active' | 'finished';
}

export const saveRoom = async (
    roomId: string,
    fields: RoomSavePayload
): Promise<{ error: string | null }> => {
    if (!roomId) return { error: 'roomId required' };

    const payload: Record<string, unknown> = {
        id: roomId,
        updated_at: new Date().toISOString(),
    };

    if (fields.simDate             !== undefined) payload.sim_date               = fields.simDate;
    if (fields.offseasonPhase      !== undefined) payload.offseason_phase         = fields.offseasonPhase;
    if (fields.season              !== undefined) payload.season                  = fields.season;
    if (fields.seasonNumber        !== undefined) payload.season_number           = fields.seasonNumber;
    if (fields.rosterState         !== undefined) payload.roster_state            = fields.rosterState;
    if (fields.draftState          !== undefined) payload.draft_state             = fields.draftState;
    if (fields.tendencySeed        !== undefined) payload.tendency_seed           = fields.tendencySeed;
    if (fields.replaySnapshot      !== undefined) payload.replay_snapshot         = fields.replaySnapshot;
    if (fields.simSettings         !== undefined) payload.sim_settings            = fields.simSettings;
    if (fields.coachingStaff       !== undefined) payload.coaching_staff          = fields.coachingStaff;
    if (fields.teamFinances        !== undefined) payload.team_finances           = fields.teamFinances;
    if (fields.leaguePickAssets    !== undefined) payload.league_pick_assets      = fields.leaguePickAssets;
    if (fields.leagueCapHistory    !== undefined) payload.league_cap_history      = fields.leagueCapHistory;
    if (fields.leagueTradeBlocks   !== undefined) payload.league_trade_blocks     = fields.leagueTradeBlocks;
    if (fields.leagueTradeOffers   !== undefined) payload.league_trade_offers     = fields.leagueTradeOffers;
    if (fields.leagueGMProfiles    !== undefined) payload.league_gm_profiles      = fields.leagueGMProfiles;
    if (fields.leagueFAPool        !== undefined) payload.league_fa_pool          = fields.leagueFAPool;
    if (fields.leagueFAMarket      !== undefined) payload.league_fa_market        = fields.leagueFAMarket;
    if (fields.leagueTrainingConfigs !== undefined) payload.league_training_configs = fields.leagueTrainingConfigs;
    if (fields.coachFAPool         !== undefined) payload.coach_fa_pool           = fields.coachFAPool;
    if (fields.retiredPlayerIds    !== undefined) payload.retired_player_ids      = fields.retiredPlayerIds;
    if (fields.lotteryResult       !== undefined) payload.lottery_result          = fields.lotteryResult;
    if (fields.schedule            !== undefined) payload.schedule                = fields.schedule;
    if (fields.status              !== undefined) payload.status                  = fields.status;

    const { error } = await supabase
        .from('rooms')
        .update(payload)
        .eq('id', roomId);

    return { error: error?.message ?? null };
};

// ─── 방 상태 로드 ─────────────────────────────────────────────────────────────

export const loadRoom = async (roomId: string) => {
    const { data, error } = await supabase
        .from('rooms')
        .select(`
            id, league_id, name, max_players, status,
            season, season_number, sim_date, offseason_phase,
            roster_state, draft_state, tendency_seed, replay_snapshot,
            sim_settings, coaching_staff, team_finances,
            league_pick_assets, league_cap_history, league_trade_blocks,
            league_trade_offers, league_gm_profiles, league_fa_pool,
            league_fa_market, league_training_configs, coach_fa_pool,
            retired_player_ids, lottery_result, schedule,
            schema_version, created_at, updated_at
        `)
        .eq('id', roomId)
        .maybeSingle();

    if (error) {
        console.error('[loadRoom] error:', error.message);
        return null;
    }
    return data;
};

// ─── 멤버 전술/뎁스차트 저장 ──────────────────────────────────────────────────

export const saveMemberTactics = async (
    roomId: string,
    userId: string,
    tactics: GameTactics | null,
    depthChart?: DepthChart | null
): Promise<{ error: string | null }> => {
    const payload: Record<string, unknown> = {};
    if (tactics    !== undefined) payload.tactics     = tactics;
    if (depthChart !== undefined) payload.depth_chart = depthChart;

    const { error } = await supabase
        .from('room_members')
        .update(payload)
        .eq('room_id', roomId)
        .eq('user_id', userId);

    return { error: error?.message ?? null };
};

// ─── 멤버 팀 배정 ─────────────────────────────────────────────────────────────

export const assignMemberTeam = async (
    roomId: string,
    userId: string,
    teamId: string
): Promise<{ error: string | null }> => {
    const { error } = await supabase
        .from('room_members')
        .update({ team_id: teamId })
        .eq('room_id', roomId)
        .eq('user_id', userId);

    return { error: error?.message ?? null };
};

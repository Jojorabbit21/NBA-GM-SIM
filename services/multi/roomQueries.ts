
import { supabase } from '../supabaseClient';
import type { OffseasonPhase } from '../../types/app';

// ─── 리그 그룹 ────────────────────────────────────────────────────────────────

export interface LeagueGroupRow {
    id: string;
    name: string;
    admin_user_id: string;
    status: 'recruiting' | 'in_season' | 'between_seasons' | 'finished';
    current_season_number: number;
    default_options: Record<string, unknown>;
    created_at: string;
}

export const listLeagueGroups = async (): Promise<LeagueGroupRow[]> => {
    const { data, error } = await supabase
        .from('league_groups')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) { console.error('[listLeagueGroups]', error.message); return []; }
    return data ?? [];
};

export const loadLeagueGroup = async (groupId: string): Promise<LeagueGroupRow | null> => {
    const { data, error } = await supabase
        .from('league_groups')
        .select('*')
        .eq('id', groupId)
        .maybeSingle();

    if (error) { console.error('[loadLeagueGroup]', error.message); return null; }
    return data;
};

// ─── 리그 ─────────────────────────────────────────────────────────────────────

export interface LeagueRow {
    id: string;
    type: 'main_league' | 'tournament';
    group_id: string | null;
    tier: 'pro' | 'dleague' | 'uleague' | null;
    name: string;
    admin_user_id: string;
    status: 'recruiting' | 'drafting' | 'in_progress' | 'finished';
    max_teams: number;
    season_number: number;
    cap_enabled: boolean;
    finance_enabled: boolean;
    trade_enabled: boolean;
    fa_enabled: boolean;
    rookie_draft_enabled: boolean;
    coaching_enabled: boolean;
    training_enabled: boolean;
    start_draft_enabled: boolean;
    draft_pool: string;
    draft_format: string;
    draft_pool_strategy: string;
    draft_pick_duration_sec: number;
    rookie_pool_inclusion: boolean;
    draft_scheduled_at: string | null;
    tournament_format: string | null;
    match_format: string | null;
    bracket_data: unknown | null;
    season_start_date: string;
    real_time_pace: string;
    created_at: string;
}

export const listOpenLeagues = async (): Promise<LeagueRow[]> => {
    const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .in('status', ['recruiting', 'drafting'])
        .order('created_at', { ascending: false });

    if (error) { console.error('[listOpenLeagues]', error.message); return []; }
    return data ?? [];
};

export const listLeaguesByGroup = async (groupId: string): Promise<LeagueRow[]> => {
    const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('group_id', groupId)
        .order('season_number', { ascending: false });

    if (error) { console.error('[listLeaguesByGroup]', error.message); return []; }
    return data ?? [];
};

export const loadLeague = async (leagueId: string): Promise<LeagueRow | null> => {
    const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', leagueId)
        .maybeSingle();

    if (error) { console.error('[loadLeague]', error.message); return null; }
    return data;
};

// ─── 방 + 멤버 ───────────────────────────────────────────────────────────────

export interface RoomRow {
    id: string;
    league_id: string;
    name: string | null;
    max_players: number;
    status: 'active' | 'finished';
    season: string;
    season_number: number;
    sim_date: string;
    offseason_phase: OffseasonPhase;
    schema_version: number;
    created_at: string;
    updated_at: string;
}

export interface RoomMemberRow {
    room_id: string;
    user_id: string;
    team_id: string | null;
    tactics: unknown | null;
    depth_chart: unknown | null;
    is_ai: boolean;
    ai_gm_personality: string | null;
    ai_gm_sliders: unknown | null;
    joined_at: string;
}

export const loadRoomByLeague = async (leagueId: string): Promise<RoomRow | null> => {
    const { data, error } = await supabase
        .from('rooms')
        .select('id, league_id, name, max_players, status, season, season_number, sim_date, offseason_phase, schema_version, created_at, updated_at')
        .eq('league_id', leagueId)
        .eq('status', 'active')
        .maybeSingle();

    if (error) { console.error('[loadRoomByLeague]', error.message); return null; }
    return data;
};

export const listRoomMembers = async (roomId: string): Promise<RoomMemberRow[]> => {
    const { data, error } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', roomId);

    if (error) { console.error('[listRoomMembers]', error.message); return []; }
    return data ?? [];
};

export const loadRoomMember = async (
    roomId: string,
    userId: string
): Promise<RoomMemberRow | null> => {
    const { data, error } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) { console.error('[loadRoomMember]', error.message); return null; }
    return data;
};

// 유저가 현재 참가 중인 활성 방 목록
export const listUserActiveRooms = async (userId: string): Promise<RoomRow[]> => {
    // 1단계: 유저가 참가한 room_id 목록 조회
    const { data: memberships, error: memberErr } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', userId);

    if (memberErr || !memberships?.length) return [];

    // 2단계: 활성 상태인 방만 필터
    const roomIds = memberships.map(m => m.room_id);
    const { data, error } = await supabase
        .from('rooms')
        .select('id, league_id, name, max_players, status, season, season_number, sim_date, offseason_phase, schema_version, created_at, updated_at')
        .in('id', roomIds)
        .eq('status', 'active');

    if (error) { console.error('[listUserActiveRooms]', error.message); return []; }
    return data ?? [];
};

// ─── 승강 / 이력 ──────────────────────────────────────────────────────────────

export interface PromotionRow {
    id: string;
    group_id: string;
    from_season: number;
    to_season: number;
    user_id: string;
    from_tier: 'pro' | 'dleague' | 'uleague';
    to_tier:   'pro' | 'dleague' | 'uleague';
    final_rank: number;
    movement: 'promoted' | 'relegated' | 'stayed';
    created_at: string;
}

export const listPromotions = async (
    groupId: string,
    toSeason: number
): Promise<PromotionRow[]> => {
    const { data, error } = await supabase
        .from('league_promotions')
        .select('*')
        .eq('group_id', groupId)
        .eq('to_season', toSeason);

    if (error) { console.error('[listPromotions]', error.message); return []; }
    return data ?? [];
};

export const listUserLeagueHistory = async (
    groupId: string,
    userId: string
) => {
    const { data, error } = await supabase
        .from('league_user_history')
        .select('*')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .order('season_number', { ascending: true });

    if (error) { console.error('[listUserLeagueHistory]', error.message); return []; }
    return data ?? [];
};

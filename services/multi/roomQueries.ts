
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
    tier: 'd1' | 'd2' | 'd3' | null;
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
    draft_ovr_min: number;
    draft_ovr_max: number;
    draft_pick_duration_sec: number;
    draft_total_rounds: number;
    rookie_pool_inclusion: boolean;
    draft_scheduled_at: string | null;
    lottery_scheduled_at: string | null;
    tournament_format: string | null;
    match_format: string | null;
    finals_match_format: string | null;
    bracket_data: unknown | null;
    season_start_date: string;
    season_end_date: string | null;
    tournament_start_at: string | null;
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

// ─── 리그 목록 (인원 수 + 참가 여부 포함) ─────────────────────────────────────

export interface LeagueListEntry {
    league:      LeagueRow;
    roomId:      string | null;
    memberCount: number;   // 실제 참가 인원 (is_ai=false)
    maxPlayers:  number;
    isJoined:    boolean;
}

export const listLeaguesWithStats = async (
    userId: string | null
): Promise<LeagueListEntry[]> => {
    // 1. 오픈 리그 목록
    const { data: leagues, error } = await supabase
        .from('leagues')
        .select('*')
        .in('status', ['recruiting', 'drafting', 'in_progress'])
        .order('created_at', { ascending: false });

    if (error || !leagues?.length) return [];

    const leagueIds = leagues.map(l => l.id);

    // 2. 방 목록 + 유저 참가 여부 병렬 조회
    const [roomsRes, membershipRes] = await Promise.all([
        supabase
            .from('rooms')
            .select('id, league_id, max_players')
            .in('league_id', leagueIds)
            .eq('status', 'active'),
        userId
            ? supabase
                  .from('room_members')
                  .select('room_id')
                  .eq('user_id', userId)
                  .eq('is_ai', false)
            : Promise.resolve({ data: [] as { room_id: string }[], error: null }),
    ]);

    const rooms            = roomsRes.data ?? [];
    const joinedRoomIds    = new Set((membershipRes.data ?? []).map(m => m.room_id));
    const roomByLeague     = Object.fromEntries(rooms.map(r => [r.league_id, r]));
    const roomIds          = rooms.map(r => r.id);

    // 3. 방별 인원 수 (AI 제외)
    let memberCounts: Record<string, number> = {};
    if (roomIds.length > 0) {
        const { data: members } = await supabase
            .from('room_members')
            .select('room_id')
            .in('room_id', roomIds)
            .eq('is_ai', false);

        (members ?? []).forEach(m => {
            memberCounts[m.room_id] = (memberCounts[m.room_id] ?? 0) + 1;
        });
    }

    return leagues.map(league => {
        const room = roomByLeague[league.id];
        return {
            league,
            roomId:      room?.id      ?? null,
            memberCount: room ? (memberCounts[room.id] ?? 0) : 0,
            maxPlayers:  room?.max_players ?? league.max_teams,
            isJoined:    room ? joinedRoomIds.has(room.id) : false,
        };
    });
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
    team_name: string | null;
    team_abbr: string | null;
    team_color_primary: string | null;
    team_color_secondary: string | null;
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

// ─── league_teams ─────────────────────────────────────────────────────────────

export interface LeagueTeamRow {
    id: string;
    room_id: string;
    team_slug: string;
    team_name: string;
    team_abbr: string;
    color_primary: string;
    color_secondary: string;
    conference: string | null;
    user_id: string | null;
    is_ai: boolean;
    draft_order: number | null;
    roster: string[];           // player_id[]
    created_at: string;
}

export const listLeagueTeams = async (roomId: string): Promise<LeagueTeamRow[]> => {
    const { data, error } = await supabase
        .from('league_teams')
        .select('*')
        .eq('room_id', roomId)
        .order('team_slug');

    if (error) { console.error('[listLeagueTeams]', error.message); return []; }
    return data ?? [];
};

// ─── 승강 / 이력 ──────────────────────────────────────────────────────────────

export interface PromotionRow {
    id: string;
    group_id: string;
    from_season: number;
    to_season: number;
    user_id: string;
    from_tier: 'd1' | 'd2' | 'd3';
    to_tier:   'd1' | 'd2' | 'd3';
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

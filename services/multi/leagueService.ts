
import { supabase } from '../supabaseClient';
import type { LeagueGroupRow, LeagueRow } from './roomQueries';

// ─── 리그 그룹 생성 (메인리그 운영자) ────────────────────────────────────────

export interface CreateLeagueGroupParams {
    name: string;
    adminUserId: string;
    defaultOptions?: Record<string, unknown>;
}

export const createLeagueGroup = async (
    params: CreateLeagueGroupParams
): Promise<{ data: LeagueGroupRow | null; error: string | null }> => {
    const { data, error } = await supabase
        .from('league_groups')
        .insert({
            name:            params.name,
            admin_user_id:   params.adminUserId,
            default_options: params.defaultOptions ?? {},
        })
        .select()
        .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
};

// ─── 리그(시즌 인스턴스) 생성 ────────────────────────────────────────────────

export interface CreateLeagueParams {
    type: 'main_league' | 'tournament';
    name: string;
    adminUserId: string;
    // 메인리그 필드
    groupId?:       string;
    tier?:          'pro' | 'dleague' | 'uleague';
    seasonNumber?:  number;
    maxTeams?:      number;
    // 토너먼트 필드
    tournamentFormat?: 'single_elim' | 'double_elim' | 'round_robin';
    matchFormat?:      'best_of_1' | 'best_of_3' | 'best_of_7';
    // 공통 옵션 (default_options 상속 후 override)
    options?: Partial<{
        capEnabled:           boolean;
        financeEnabled:       boolean;
        tradeEnabled:         boolean;
        faEnabled:            boolean;
        rookieDraftEnabled:   boolean;
        coachingEnabled:      boolean;
        trainingEnabled:      boolean;
        startDraftEnabled:    boolean;
        draftPool:            string;
        draftFormat:          string;
        draftPoolStrategy:    string;
        draftPickDurationSec: number;
        rookiePoolInclusion:  boolean;
        seasonStartDate:      string;
        realTimePace:         string;
    }>;
}

export const createLeague = async (
    params: CreateLeagueParams
): Promise<{ data: LeagueRow | null; error: string | null }> => {
    const opts = params.options ?? {};
    const payload: Record<string, unknown> = {
        type:          params.type,
        name:          params.name,
        admin_user_id: params.adminUserId,
        max_teams:     params.maxTeams ?? 30,
        season_number: params.seasonNumber ?? 1,
    };

    // 메인리그 전용
    if (params.type === 'main_league') {
        payload.group_id = params.groupId;
        payload.tier     = params.tier;
    }

    // 토너먼트 전용
    if (params.type === 'tournament') {
        payload.tournament_format = params.tournamentFormat;
        payload.match_format      = params.matchFormat ?? 'best_of_1';
    }

    // 옵션 오버라이드
    if (opts.capEnabled           !== undefined) payload.cap_enabled             = opts.capEnabled;
    if (opts.financeEnabled       !== undefined) payload.finance_enabled         = opts.financeEnabled;
    if (opts.tradeEnabled         !== undefined) payload.trade_enabled           = opts.tradeEnabled;
    if (opts.faEnabled            !== undefined) payload.fa_enabled              = opts.faEnabled;
    if (opts.rookieDraftEnabled   !== undefined) payload.rookie_draft_enabled    = opts.rookieDraftEnabled;
    if (opts.coachingEnabled      !== undefined) payload.coaching_enabled        = opts.coachingEnabled;
    if (opts.trainingEnabled      !== undefined) payload.training_enabled        = opts.trainingEnabled;
    if (opts.startDraftEnabled    !== undefined) payload.start_draft_enabled     = opts.startDraftEnabled;
    if (opts.draftPool            !== undefined) payload.draft_pool              = opts.draftPool;
    if (opts.draftFormat          !== undefined) payload.draft_format            = opts.draftFormat;
    if (opts.draftPoolStrategy    !== undefined) payload.draft_pool_strategy     = opts.draftPoolStrategy;
    if (opts.draftPickDurationSec !== undefined) payload.draft_pick_duration_sec = opts.draftPickDurationSec;
    if (opts.rookiePoolInclusion  !== undefined) payload.rookie_pool_inclusion   = opts.rookiePoolInclusion;
    if (opts.seasonStartDate      !== undefined) payload.season_start_date       = opts.seasonStartDate;
    if (opts.realTimePace         !== undefined) payload.real_time_pace          = opts.realTimePace;

    const { data, error } = await supabase
        .from('leagues')
        .insert(payload)
        .select()
        .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
};

// ─── 방(Room) 생성 ────────────────────────────────────────────────────────────

export interface CreateRoomParams {
    leagueId:    string;
    maxPlayers:  number;
    name?:       string;
    season?:     string;
    seasonNumber?: number;
    simDate?:    string;
}

export interface RoomCreateResult {
    id: string;
    league_id: string;
    max_players: number;
    status: 'active' | 'finished';
    created_at: string;
}

export const createRoom = async (
    params: CreateRoomParams
): Promise<{ data: RoomCreateResult | null; error: string | null }> => {
    const { data, error } = await supabase
        .from('rooms')
        .insert({
            league_id:     params.leagueId,
            max_players:   params.maxPlayers,
            name:          params.name ?? null,
            season:        params.season        ?? '2025-2026',
            season_number: params.seasonNumber  ?? 1,
            sim_date:      params.simDate        ?? '2025-10-20',
        })
        .select('id, league_id, max_players, status, created_at')
        .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
};

// ─── 리그 참가 (유저가 방에 입장) ────────────────────────────────────────────

export interface JoinLeagueResult {
    roomId: string;
    error: string | null;
}

export const joinLeague = async (
    leagueId: string,
    userId:   string
): Promise<JoinLeagueResult> => {
    // 1. 리그에 연결된 활성 방 조회
    const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('id, max_players')
        .eq('league_id', leagueId)
        .eq('status', 'active')
        .maybeSingle();

    if (roomErr || !room) {
        return { roomId: '', error: roomErr?.message ?? 'room not found' };
    }

    // 2. 멤버 upsert — 이미 참가 중이면 무시, 정원 초과 시 DB 트리거가 에러 반환
    const { error: upsertErr } = await supabase
        .from('room_members')
        .upsert(
            { room_id: room.id, user_id: userId },
            { onConflict: 'room_id,user_id', ignoreDuplicates: true }
        );

    if (upsertErr) return { roomId: '', error: upsertErr.message };
    return { roomId: room.id, error: null };
};

// ─── 팀 명칭 설정 ────────────────────────────────────────────────────────────

export interface SetMemberTeamParams {
    roomId:         string;
    userId:         string;
    name:           string;   // 팀 풀네임 (1~24자)
    abbr:           string;   // 팀 약어 (2~4자, 영문/숫자)
    colorPrimary:   string;   // #RRGGBB — 로고 배경
    colorSecondary: string;   // #RRGGBB — 로고 보더라인
}

export const setMemberTeam = async (
    p: SetMemberTeamParams
): Promise<{ error: string | null }> => {
    const abbr = p.abbr.trim().toUpperCase();
    const slug  = abbr.toLowerCase();
    const name  = p.name.trim();
    const hexRe = /^#[0-9a-fA-F]{6}$/;

    if (!/^[A-Z0-9]{2,4}$/.test(abbr))
        return { error: '약어는 2~4자 영문/숫자여야 합니다' };
    if (!hexRe.test(p.colorPrimary))
        return { error: 'Primary 색상은 #RRGGBB 형식이어야 합니다' };
    if (!hexRe.test(p.colorSecondary))
        return { error: 'Secondary 색상은 #RRGGBB 형식이어야 합니다' };
    if (name.length < 1 || name.length > 24)
        return { error: '팀명은 1~24자여야 합니다' };

    const { error } = await supabase
        .from('room_members')
        .update({
            team_id:              slug,
            team_name:            name,
            team_abbr:            abbr,
            team_color_primary:   p.colorPrimary,
            team_color_secondary: p.colorSecondary,
        })
        .eq('room_id', p.roomId)
        .eq('user_id', p.userId);

    if (error) {
        if ((error as any).code === '23505')
            return { error: `약어 "${abbr}"는 이미 같은 방에서 사용 중입니다` };
        return { error: error.message };
    }
    return { error: null };
};

// ─── 리그 상태 갱신 ───────────────────────────────────────────────────────────

export const updateLeagueStatus = async (
    leagueId: string,
    status: LeagueRow['status']
): Promise<{ error: string | null }> => {
    const { error } = await supabase
        .from('leagues')
        .update({ status })
        .eq('id', leagueId);

    return { error: error?.message ?? null };
};

export const updateLeagueGroupStatus = async (
    groupId: string,
    status: LeagueGroupRow['status'],
    currentSeasonNumber?: number
): Promise<{ error: string | null }> => {
    const payload: Record<string, unknown> = { status };
    if (currentSeasonNumber !== undefined) payload.current_season_number = currentSeasonNumber;

    const { error } = await supabase
        .from('league_groups')
        .update(payload)
        .eq('id', groupId);

    return { error: error?.message ?? null };
};

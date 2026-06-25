
import { supabase } from '../supabaseClient';
import type { LeagueGroupRow, LeagueRow, LeagueTeamRow } from './roomQueries';
import { TEAM_DATA, TEAM_COLORS } from '../../data/teamData';
import { VIRTUAL_TEAMS } from '../../data/virtualTeams';

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
    tier?:          'd1' | 'd2' | 'd3';
    seasonNumber?:  number;
    maxTeams?:      number;
    // 토너먼트 필드
    tournamentFormat?:       'single_elim' | 'double_elim' | 'round_robin';
    matchFormat?:            'best_of_1' | 'best_of_3' | 'best_of_5' | 'best_of_7';
    finalsMatchFormat?:      'best_of_1' | 'best_of_3' | 'best_of_5' | 'best_of_7';
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
        draftOvrMin:          number;
        draftOvrMax:          number;
        draftPickDurationSec: number;
        draftTotalRounds:     number;
        rookiePoolInclusion:  boolean;
        seasonStartDate:      string;
        seasonEndDate:        string;
        tournamentStartAt:    string | null;
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
        payload.tournament_format       = params.tournamentFormat;
        payload.match_format            = params.matchFormat ?? 'best_of_1';
        payload.finals_match_format     = params.finalsMatchFormat ?? null;
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
    if (opts.draftOvrMin          !== undefined) payload.draft_ovr_min           = opts.draftOvrMin;
    if (opts.draftOvrMax          !== undefined) payload.draft_ovr_max           = opts.draftOvrMax;
    if (opts.draftPickDurationSec !== undefined) payload.draft_pick_duration_sec = opts.draftPickDurationSec;
    if (opts.draftTotalRounds     !== undefined) payload.draft_total_rounds      = opts.draftTotalRounds;
    if (opts.rookiePoolInclusion  !== undefined) payload.rookie_pool_inclusion   = opts.rookiePoolInclusion;
    if (opts.seasonStartDate      !== undefined) payload.season_start_date       = opts.seasonStartDate;
    if (opts.seasonEndDate        !== undefined) payload.season_end_date         = opts.seasonEndDate;
    if (opts.tournamentStartAt    !== undefined) payload.tournament_start_at     = opts.tournamentStartAt;
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
    name:           string;   // 팀 풀네임 (1~16자)
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
    if (name.length < 1 || name.length > 16)
        return { error: '팀명은 1~16자여야 합니다' };

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

// ─── 세션 설정 업데이트 (어드민) ──────────────────────────────────────────────

export interface UpdateLeagueSettingsParams {
    leagueId:            string;
    roomId?:             string;
    maxTeams?:           number;
    lotteryScheduledAt?: string | null;
    draftScheduledAt?:   string | null;
    draftPickDurationSec?: number;
    draftTotalRounds?:   number;
    draftPool?:          string;
    draftPoolStrategy?:  string;
    draftOvrMin?:        number;
    draftOvrMax?:        number;
    seasonStartDate?:    string;
    seasonEndDate?:      string | null;
    tournamentStartAt?:  string | null;
    matchFormat?:        string | null;
    finalsMatchFormat?:  string | null;
}

export const updateLeagueSettings = async (
    p: UpdateLeagueSettingsParams
): Promise<{ error: string | null }> => {
    const payload: Record<string, unknown> = {};
    if (p.maxTeams             !== undefined) payload.max_teams               = p.maxTeams;
    if (p.lotteryScheduledAt   !== undefined) payload.lottery_scheduled_at    = p.lotteryScheduledAt;
    if (p.draftScheduledAt     !== undefined) payload.draft_scheduled_at      = p.draftScheduledAt;
    if (p.draftPickDurationSec !== undefined) payload.draft_pick_duration_sec = p.draftPickDurationSec;
    if (p.draftTotalRounds     !== undefined) payload.draft_total_rounds      = p.draftTotalRounds;
    if (p.draftPool            !== undefined) payload.draft_pool              = p.draftPool;
    if (p.draftPoolStrategy    !== undefined) payload.draft_pool_strategy     = p.draftPoolStrategy;
    if (p.draftOvrMin          !== undefined) payload.draft_ovr_min           = p.draftOvrMin;
    if (p.draftOvrMax          !== undefined) payload.draft_ovr_max           = p.draftOvrMax;
    if (p.seasonStartDate      !== undefined) payload.season_start_date       = p.seasonStartDate;
    if (p.seasonEndDate        !== undefined) payload.season_end_date         = p.seasonEndDate;
    if (p.tournamentStartAt    !== undefined) payload.tournament_start_at     = p.tournamentStartAt;
    if (p.matchFormat          !== undefined) payload.match_format            = p.matchFormat;
    if (p.finalsMatchFormat    !== undefined) payload.finals_match_format     = p.finalsMatchFormat;

    const { error } = await supabase.from('leagues').update(payload).eq('id', p.leagueId);
    if (error) return { error: error.message };

    if (p.roomId && p.maxTeams !== undefined) {
        const { error: roomErr } = await supabase
            .from('rooms')
            .update({ max_players: p.maxTeams })
            .eq('id', p.roomId);
        if (roomErr) return { error: roomErr.message };

        // league_teams 슬롯 수 동기화
        const resizeErr = await resizeLeagueTeams(p.roomId, p.maxTeams);
        if (resizeErr) return { error: resizeErr };
    }

    return { error: null };
};

async function resizeLeagueTeams(roomId: string, newCount: number): Promise<string | null> {
    const { data: current, error: fetchErr } = await supabase
        .from('league_teams')
        .select('id, team_slug, user_id')
        .eq('room_id', roomId);
    if (fetchErr) return fetchErr.message;

    const currentCount = (current ?? []).length;
    if (newCount === currentCount) return null;

    if (newCount > currentCount) {
        // 부족한 만큼 새 팀 추가
        const existingSlugs = new Set((current ?? []).map((t: any) => t.team_slug));
        const allTeams = Object.values(TEAM_DATA);
        const available = shuffleArray(allTeams.filter(t => !existingSlugs.has(t.id)));
        const needed = newCount - currentCount;

        const rows: any[] = available.slice(0, needed).map(t => ({
            room_id:         roomId,
            team_slug:       t.id,
            team_name:       `${t.city} ${t.name}`,
            team_abbr:       t.id.toUpperCase().slice(0, 3),
            color_primary:   t.colors.primary,
            color_secondary: t.colors.secondary,
            conference:      t.conference,
        }));

        // 30팀 초과 시 VIRTUAL_TEAMS으로 나머지 채움
        if (rows.length < needed) {
            const usedSlugs = new Set([
                ...existingSlugs,
                ...rows.map((r: any) => r.team_slug),
            ]);
            const availableVirtual = VIRTUAL_TEAMS.filter(t => !usedSlugs.has(t.team_slug));
            for (const t of availableVirtual) {
                if (rows.length >= needed) break;
                rows.push({ room_id: roomId, team_slug: t.team_slug, team_name: t.team_name, team_abbr: t.team_abbr, color_primary: t.color_primary, color_secondary: t.color_secondary, conference: t.conference });
            }
        }

        if (rows.length === 0) return null;
        const { error } = await supabase.from('league_teams').insert(rows);
        return error?.message ?? null;
    }

    // 줄이는 경우: 미선점 팀부터 제거
    const unclaimed = (current ?? []).filter((t: any) => !t.user_id);
    const removeCount = currentCount - newCount;
    if (removeCount > unclaimed.length) {
        return `참가 중인 팀(${currentCount - unclaimed.length}개)보다 적은 수로 줄일 수 없습니다.`;
    }
    const toRemove = unclaimed.slice(0, removeCount).map((t: any) => t.id);
    const { error } = await supabase.from('league_teams').delete().in('id', toRemove);
    return error?.message ?? null;
}

// ─── league_teams 초기화 ──────────────────────────────────────────────────────
// 세션 생성 후 TEAM_DATA 기반으로 N개 팀을 league_teams에 삽입

function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export const initializeLeagueTeams = async (
    roomId:   string,
    maxTeams: number
): Promise<{ error: string | null }> => {
    const allTeams = Object.values(TEAM_DATA);
    const shuffled = shuffleArray(allTeams);
    const realSlice = shuffled.slice(0, Math.min(maxTeams, allTeams.length));

    const teamsJson: any[] = realSlice.map(t => ({
        team_slug:       t.id,
        team_name:       `${t.city} ${t.name}`,
        team_abbr:       t.id.toUpperCase().slice(0, 3),
        color_primary:   t.colors.primary,
        color_secondary: t.colors.secondary,
        conference:      t.conference,
    }));

    // 30팀 초과 시 VIRTUAL_TEAMS으로 나머지 채움
    if (maxTeams > allTeams.length) {
        const usedSlugs = new Set(teamsJson.map((t: any) => t.team_slug));
        const availableVirtual = VIRTUAL_TEAMS.filter(t => !usedSlugs.has(t.team_slug));
        for (const t of availableVirtual) {
            if (teamsJson.length >= maxTeams) break;
            teamsJson.push({ team_slug: t.team_slug, team_name: t.team_name, team_abbr: t.team_abbr, color_primary: t.color_primary, color_secondary: t.color_secondary, conference: t.conference });
        }
    }

    const { error } = await supabase.rpc('initialize_league_teams', {
        p_room_id: roomId,
        p_teams:   teamsJson,
    });
    return { error: error?.message ?? null };
};

// ─── 팀 선점 / 반환 ───────────────────────────────────────────────────────────

export const claimTeam = async (
    roomId:  string,
    teamId:  string,   // league_teams.id (UUID)
    userId:  string
): Promise<{ data: LeagueTeamRow | null; error: string | null }> => {
    const { data, error } = await supabase.rpc('claim_team', {
        p_room_id:  roomId,
        p_team_id:  teamId,
        p_user_id:  userId,
    });
    if (error) {
        const msg = error.message ?? '';
        if (msg.includes('team_already_claimed'))   return { data: null, error: '이미 다른 유저가 선점한 팀입니다.' };
        if (msg.includes('draft_already_ordered'))  return { data: null, error: '드래프트 추첨 후에는 팀을 변경할 수 없습니다.' };
        return { data: null, error: msg };
    }
    return { data: data as LeagueTeamRow, error: null };
};

export const releaseTeam = async (
    roomId: string,
    userId: string
): Promise<{ error: string | null }> => {
    const { error } = await supabase.rpc('release_team', {
        p_room_id: roomId,
        p_user_id: userId,
    });
    return { error: error?.message ?? null };
};

export const updateTeamProfile = async (
    teamId:         string,
    userId:         string,
    teamName:       string,
    teamAbbr:       string,
    colorPrimary:   string,
    colorSecondary: string
): Promise<{ data: LeagueTeamRow | null; error: string | null }> => {
    const { data, error } = await supabase.rpc('update_team_profile', {
        p_team_id:         teamId,
        p_user_id:         userId,
        p_team_name:       teamName,
        p_team_abbr:       teamAbbr,
        p_color_primary:   colorPrimary,
        p_color_secondary: colorSecondary,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as LeagueTeamRow, error: null };
};

// ─── 드래프트 추첨 (어드민 수동) ──────────────────────────────────────────────

export const runDraftLottery = async (
    roomId:  string,
    userId:  string
): Promise<{ data: LeagueTeamRow[] | null; error: string | null }> => {
    const { data, error } = await supabase.rpc('run_draft_lottery', {
        p_room_id:  roomId,
        p_admin_id: userId,
    });
    if (error) {
        const msg = error.message ?? '';
        if (msg.includes('lottery_already_done')) return { data: null, error: '이미 추첨이 완료되었습니다.' };
        return { data: null, error: msg };
    }
    return { data: data as LeagueTeamRow[], error: null };
};

// ─── 탈퇴 (room_members + 팀 반환) ────────────────────────────────────────────

export const leaveLeague = async (
    roomId: string,
    userId: string,
    leagueStatus?: string,
): Promise<{ error: string | null }> => {
    if (leagueStatus && leagueStatus !== 'recruiting') {
        return { error: '세션이 시작된 후에는 탈퇴할 수 없습니다.' };
    }
    // 팀 반환
    await releaseTeam(roomId, userId);
    // room_members 삭제
    const { error } = await supabase
        .from('room_members')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', userId);
    return { error: error?.message ?? null };
};

// ─── 리그 삭제 (어드민 전용) ──────────────────────────────────────────────────
// leagues 삭제 → rooms / room_members / league_teams 등 CASCADE 자동 정리

export const deleteLeague = async (
    leagueId: string,
    userId: string
): Promise<{ error: string | null }> => {
    // 어드민 본인인지 서버에서 재검증 (RLS가 admin_user_id 체크)
    const { error } = await supabase
        .from('leagues')
        .delete()
        .eq('id', leagueId)
        .eq('admin_user_id', userId);

    if (error) return { error: error.message };
    return { error: null };
};

// ─── 드래프트 즉시 시작 (어드민, Fly.io POST /start-draft) ───────────────────
// start-draft EF를 완전 대체. Fly.io Bun 서버로 요청 → 방 로드 + 타이머 시작.

const FLY_SERVER = (import.meta as any).env?.VITE_DRAFT_WS_URL
    ? (import.meta as any).env.VITE_DRAFT_WS_URL.replace(/^ws/, 'http').replace(/\/ws$/, '')
    : 'https://basketballgm-app-server.fly.dev';

export const startDraft = async (
    leagueId: string,
    accessToken?: string
): Promise<{ error: string | null }> => {
    const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
    try {
        const res = await fetch(`${FLY_SERVER}/start-draft`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ leagueId }),
        });
        const data = await res.json().catch(() => ({})) as any;
        if (!res.ok) {
            return { error: data?.error ?? `HTTP ${res.status}` };
        }
        return { error: null };
    } catch (e: any) {
        return { error: e?.message ?? '드래프트 시작 실패' };
    }
};

// ─── 토너먼트 브라켓 데이터 저장 ─────────────────────────────────────────────

export const saveBracketData = async (
    leagueId: string,
    bracket: { series: unknown[]; schedule?: unknown[] },
): Promise<{ error: string | null }> => {
    const { error } = await supabase
        .from('leagues')
        .update({ bracket_data: bracket })
        .eq('id', leagueId);
    return { error: error?.message ?? null };
};

// ─── 토너먼트 세션 초기화 ──────────────────────────────────────────────────────

export interface ResetTournamentResult {
    error:          string | null;
    archiveEdition: number | null; // 저장된 아카이브 edition (없으면 null)
}

export const resetTournament = async (
    leagueId: string,
    roomId:   string,
): Promise<ResetTournamentResult> => {
    // 아카이브 존재 여부 확인
    const { data: archiveRow } = await supabase
        .from('tournament_archives')
        .select('edition')
        .eq('league_id', leagueId)
        .order('edition', { ascending: false })
        .limit(1)
        .maybeSingle();

    const archiveEdition = archiveRow?.edition ?? null;

    // leagues 초기화
    const { error: leagueErr } = await supabase
        .from('leagues')
        .update({ status: 'recruiting', bracket_data: null })
        .eq('id', leagueId);
    if (leagueErr) return { error: leagueErr.message, archiveEdition };

    // rooms 초기화
    const { error: roomErr } = await supabase
        .from('rooms')
        .update({ schedule: [], roster_state: {} })
        .eq('id', roomId);
    if (roomErr) return { error: roomErr.message, archiveEdition };

    // league_teams 로스터 & 드래프트 오더 초기화
    const { error: teamsErr } = await supabase
        .from('league_teams')
        .update({ roster: [], draft_order: null })
        .eq('room_id', roomId);
    if (teamsErr) return { error: teamsErr.message, archiveEdition };

    return { error: null, archiveEdition };
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

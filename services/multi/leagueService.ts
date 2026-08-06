
import { supabase } from '../supabaseClient';
import type { LeagueGroupRow, LeagueRow, LeagueTeamRow } from './roomQueries';
import { TEAM_DATA, TEAM_COLORS } from '../../data/teamData';
import { VIRTUAL_TEAMS } from '../../data/virtualTeams';
import type { SimSettings } from '../../types/simSettings';
import { HEX_COLOR_RE } from '../../utils/colorContrast';

// URL에 노출되는 리그 UUID를 대체하는 짧은 코드 — 헷갈리는 문자(0/O, 1/I/l) 제외 32종, 8자리.
// [2026-08-01] leagues.id(UUID)는 여전히 진짜 PK로 유지, short_code는 라우팅 전용 별칭.
// [2026-08-05] 팀 코트 색상 기본값 — 기존 MultiFullCourtChart.tsx가 하드코딩하던 나무색 코트와
// 동일 값(components/multi/CourtPreview.tsx의 fallback과도 일치). 새 팀 생성 시 이 값으로 시작해
// "팀 설정"에서 사용자가 원하는 대로 바꿀 수 있다.
export const DEFAULT_COURT_COLORS = { background: '#DDC8AD', paint: '#C3AC91', line: '#4A3728' };

// league_teams row 삽입 4곳(신규 생성/팀 수 증가 × 실제팀/가상팀)이 전부 동일하게 반복하던
// court_* 3필드 — 여기 한 번만 만들어 스프레드로 재사용.
const COURT_DEFAULT_FIELDS = {
    court_background: DEFAULT_COURT_COLORS.background,
    court_paint:      DEFAULT_COURT_COLORS.paint,
    court_line:       DEFAULT_COURT_COLORS.line,
};

const SHORT_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export function generateShortCode(length = 8): string {
    let code = '';
    for (let i = 0; i < length; i++) {
        code += SHORT_CODE_ALPHABET[Math.floor(Math.random() * SHORT_CODE_ALPHABET.length)];
    }
    return code;
}

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
        draftAutoPickAfterMisses: number;
        rookiePoolInclusion:  boolean;
        seasonStartDate:      string;
        seasonEndDate:        string;
        tournamentStartAt:    string | null;
        draftScheduledAt:     string | null;
        lotteryScheduledAt:   string | null;
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
        // games_per_real_day 컬럼 기본값(5)은 메인리그(하루 5경기) 기준이라 토너먼트에는 맞지 않음 —
        // 명시적으로 기본 30분 간격(1440/48)으로 확정한다. 세션 설정에서 나중에 바꿀 수 있음.
        payload.games_per_real_day      = 48;
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
    if (opts.draftAutoPickAfterMisses !== undefined) payload.draft_auto_pick_after_misses = opts.draftAutoPickAfterMisses;
    if (opts.rookiePoolInclusion  !== undefined) payload.rookie_pool_inclusion   = opts.rookiePoolInclusion;
    if (opts.seasonStartDate      !== undefined) payload.season_start_date       = opts.seasonStartDate;
    if (opts.seasonEndDate        !== undefined) payload.season_end_date         = opts.seasonEndDate;
    if (opts.tournamentStartAt    !== undefined) payload.tournament_start_at     = opts.tournamentStartAt;
    if (opts.draftScheduledAt     !== undefined) payload.draft_scheduled_at      = opts.draftScheduledAt;
    if (opts.lotteryScheduledAt   !== undefined) payload.lottery_scheduled_at    = opts.lotteryScheduledAt;
    if (opts.realTimePace         !== undefined) payload.real_time_pace          = opts.realTimePace;

    // short_code 충돌(32^8 조합이라 사실상 발생 안 하지만) 대비 최대 3회 재시도.
    for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase
            .from('leagues')
            .insert({ ...payload, short_code: generateShortCode() })
            .select()
            .single();

        if (!error) return { data, error: null };
        // unique_violation(23505)이면서 short_code 충돌인 경우만 재시도, 그 외 에러는 즉시 반환
        if ((error as { code?: string }).code !== '23505') return { data: null, error: error.message };
    }
    return { data: null, error: '리그 코드 생성에 실패했습니다. 다시 시도해주세요.' };
};

// ─── 방(Room) 생성 ────────────────────────────────────────────────────────────

export interface CreateRoomParams {
    leagueId:    string;
    maxPlayers:  number;
    name?:       string;
    season?:     string;
    seasonNumber?: number;
    simDate?:    string;
    /** 생성 시점 엔진 설정(정규화 등) — rooms.sim_settings에 초기값으로 저장 */
    simSettings?: SimSettings;
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
            ...(params.simSettings ? { sim_settings: params.simSettings } : {}),
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
    colorText:      string;   // #RRGGBB — 배지 글자색
}

export const setMemberTeam = async (
    p: SetMemberTeamParams
): Promise<{ error: string | null }> => {
    const abbr = p.abbr.trim().toUpperCase();
    const slug  = abbr.toLowerCase();
    const name  = p.name.trim();

    if (!/^[A-Z0-9]{2,4}$/.test(abbr))
        return { error: '약어는 2~4자 영문/숫자여야 합니다' };
    if (!HEX_COLOR_RE.test(p.colorPrimary))
        return { error: 'Primary 색상은 #RRGGBB 형식이어야 합니다' };
    if (!HEX_COLOR_RE.test(p.colorSecondary))
        return { error: 'Secondary 색상은 #RRGGBB 형식이어야 합니다' };
    if (!HEX_COLOR_RE.test(p.colorText))
        return { error: '텍스트 색상은 #RRGGBB 형식이어야 합니다' };
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
            team_color_text:      p.colorText,
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
    name?:               string;
    maxTeams?:           number;
    lotteryScheduledAt?: string | null;
    draftScheduledAt?:   string | null;
    draftPickDurationSec?: number;
    draftTotalRounds?:   number;
    draftAutoPickAfterMisses?: number;
    draftPool?:          string;
    draftPoolStrategy?:  string;
    draftOvrMin?:        number;
    draftOvrMax?:        number;
    seasonStartDate?:    string;
    seasonEndDate?:      string | null;
    tournamentStartAt?:  string | null;
    matchFormat?:        string | null;
    finalsMatchFormat?:  string | null;
    gamesPerRealDay?:    number;
    /** 관리자 전용 엔진 설정(부상/가비지타임 등) — rooms.sim_settings에 저장 */
    simSettings?:        SimSettings;
}

export const updateLeagueSettings = async (
    p: UpdateLeagueSettingsParams
): Promise<{ error: string | null }> => {
    const payload: Record<string, unknown> = {};
    if (p.name                 !== undefined) payload.name                    = p.name;
    if (p.maxTeams             !== undefined) payload.max_teams               = p.maxTeams;
    if (p.lotteryScheduledAt   !== undefined) payload.lottery_scheduled_at    = p.lotteryScheduledAt;
    if (p.draftScheduledAt     !== undefined) payload.draft_scheduled_at      = p.draftScheduledAt;
    if (p.draftPickDurationSec !== undefined) payload.draft_pick_duration_sec = p.draftPickDurationSec;
    if (p.draftTotalRounds     !== undefined) payload.draft_total_rounds      = p.draftTotalRounds;
    if (p.draftAutoPickAfterMisses !== undefined) payload.draft_auto_pick_after_misses = p.draftAutoPickAfterMisses;
    if (p.draftPool            !== undefined) payload.draft_pool              = p.draftPool;
    if (p.draftPoolStrategy    !== undefined) payload.draft_pool_strategy     = p.draftPoolStrategy;
    if (p.draftOvrMin          !== undefined) payload.draft_ovr_min           = p.draftOvrMin;
    if (p.draftOvrMax          !== undefined) payload.draft_ovr_max           = p.draftOvrMax;
    if (p.seasonStartDate      !== undefined) payload.season_start_date       = p.seasonStartDate;
    if (p.seasonEndDate        !== undefined) payload.season_end_date         = p.seasonEndDate;
    if (p.tournamentStartAt    !== undefined) payload.tournament_start_at     = p.tournamentStartAt;
    if (p.matchFormat          !== undefined) payload.match_format            = p.matchFormat;
    if (p.finalsMatchFormat    !== undefined) payload.finals_match_format     = p.finalsMatchFormat;
    if (p.gamesPerRealDay      !== undefined) payload.games_per_real_day      = p.gamesPerRealDay;

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

    if (p.roomId && p.simSettings !== undefined) {
        const { error: simErr } = await supabase
            .from('rooms')
            .update({ sim_settings: p.simSettings })
            .eq('id', p.roomId);
        if (simErr) return { error: simErr.message };
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
            color_tertiary:  t.colors.tertiary ?? t.colors.secondary,
            color_text:      t.colors.text,
            ...COURT_DEFAULT_FIELDS,
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
                rows.push({
                    room_id: roomId, team_slug: t.team_slug, team_name: t.team_name, team_abbr: t.team_abbr,
                    color_primary: t.color_primary, color_secondary: t.color_secondary,
                    color_tertiary: t.color_tertiary, color_text: t.color_text,
                    ...COURT_DEFAULT_FIELDS,
                    conference: t.conference,
                });
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
        color_tertiary:  t.colors.tertiary ?? t.colors.secondary,
        color_text:      t.colors.text,
        ...COURT_DEFAULT_FIELDS,
        conference:      t.conference,
    }));

    // 30팀 초과 시 VIRTUAL_TEAMS으로 나머지 채움
    if (maxTeams > allTeams.length) {
        const usedSlugs = new Set(teamsJson.map((t: any) => t.team_slug));
        const availableVirtual = VIRTUAL_TEAMS.filter(t => !usedSlugs.has(t.team_slug));
        for (const t of availableVirtual) {
            if (teamsJson.length >= maxTeams) break;
            teamsJson.push({
                team_slug: t.team_slug, team_name: t.team_name, team_abbr: t.team_abbr,
                color_primary: t.color_primary, color_secondary: t.color_secondary,
                color_tertiary: t.color_tertiary, color_text: t.color_text,
                ...COURT_DEFAULT_FIELDS,
                conference: t.conference,
            });
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

    // 클레임 성공 직후 내 닉네임을 league_teams에 복사 — profiles는 본인 row만 SELECT 가능한 RLS라
    // 다른 유저가 팀 목록에서 GM 이름을 보려면 league_teams에 미리 복사해둬야 한다.
    let result = data as LeagueTeamRow;
    const { data: profile } = await supabase.from('profiles').select('nickname').eq('id', userId).maybeSingle();
    if (profile?.nickname) {
        const { data: updated } = await supabase
            .from('league_teams')
            .update({ nickname: profile.nickname })
            .eq('id', teamId)
            .select()
            .maybeSingle();
        if (updated) result = updated as LeagueTeamRow;
    }

    return { data: result, error: null };
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

// ─── 어드민 트레이드 (팀↔팀 선수 스왑) ────────────────────────────────────────

export interface ExecuteAdminTradeParams {
    roomId:       string;
    adminUserId:  string;
    teamAId:      string;   // league_teams.id
    teamBId:      string;
    playersAtoB:  string[]; // A에서 나가 B로 가는 playerId
    playersBtoA:  string[]; // B에서 나가 A로 가는 playerId
}

export const executeAdminTrade = async (
    p: ExecuteAdminTradeParams
): Promise<{ error: string | null }> => {
    const { error } = await supabase.rpc('execute_admin_trade', {
        p_room_id:        p.roomId,
        p_admin_user_id:  p.adminUserId,
        p_team_a_id:      p.teamAId,
        p_team_b_id:      p.teamBId,
        p_players_a_to_b: p.playersAtoB,
        p_players_b_to_a: p.playersBtoA,
    });
    if (error) {
        const msg = error.message ?? '';
        if (msg.includes('not_admin'))            return { error: '어드민만 트레이드를 실행할 수 있습니다.' };
        if (msg.includes('player_not_on_team_a'))  return { error: '선택한 선수가 더 이상 A팀 로스터에 없습니다. 새로고침 후 다시 시도하세요.' };
        if (msg.includes('player_not_on_team_b'))  return { error: '선택한 선수가 더 이상 B팀 로스터에 없습니다. 새로고침 후 다시 시도하세요.' };
        if (msg.includes('same_team'))             return { error: '같은 팀끼리는 트레이드할 수 없습니다.' };
        return { error: msg };
    }
    return { error: null };
};

export const updateTeamProfile = async (
    teamId:         string,
    userId:         string,
    teamName:       string,
    teamAbbr:       string,
    colorPrimary:   string,
    colorSecondary: string,
    colorTertiary:  string,
    colorText:      string,
    courtBackground: string,
    courtPaint:      string,
    courtLine:       string,
): Promise<{ data: LeagueTeamRow | null; error: string | null }> => {
    const { data, error } = await supabase.rpc('update_team_profile', {
        p_team_id:          teamId,
        p_user_id:          userId,
        p_team_name:        teamName,
        p_team_abbr:        teamAbbr,
        p_color_primary:    colorPrimary,
        p_color_secondary:  colorSecondary,
        p_color_tertiary:   colorTertiary,
        p_color_text:       colorText,
        p_court_background: courtBackground,
        p_court_paint:      courtPaint,
        p_court_line:       courtLine,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as LeagueTeamRow, error: null };
};

// ─── 탈퇴 (release_team RPC가 팀 반환 + room_members 삭제를 원자적으로 처리) ────

export const leaveLeague = async (
    roomId: string,
    userId: string,
    leagueStatus?: string,
): Promise<{ error: string | null }> => {
    if (leagueStatus && leagueStatus !== 'recruiting') {
        return { error: '세션이 시작된 후에는 탈퇴할 수 없습니다.' };
    }
    return releaseTeam(roomId, userId);
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

// ─── 드래프트 로터리 추첨 (어드민, Fly.io POST /run-lottery) ─────────────────
// 예전엔 Supabase RPC를 클라이언트가 직접 호출해서 Bun 서버가 로터리 완료 시점을 몰랐고,
// 그래서 서버의 30초 폴링 스케줄러가 뒤늦게 발견할 때까지 방 준비(prepareDraftRoom)가
// 지연됐다 — 추첨 직후 방 준비까지 한 요청 안에서 처리하도록 Bun 서버 경유로 변경.

export const runDraftLottery = async (
    roomId:   string,
    leagueId: string,
    accessToken?: string
): Promise<{ data: LeagueTeamRow[] | null; error: string | null }> => {
    const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
    try {
        const res = await fetch(`${FLY_SERVER}/run-lottery`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ roomId, leagueId }),
        });
        const data = await res.json().catch(() => ({})) as any;
        if (!res.ok) {
            return { data: null, error: data?.error ?? `HTTP ${res.status}` };
        }
        return { data: data.leagueTeams as LeagueTeamRow[], error: null };
    } catch (e: any) {
        return { data: null, error: e?.message ?? '드래프트 추첨 실패' };
    }
};

// ─── 경기 수동 시뮬레이션 오버라이드 (어드민, Fly.io POST /sim-override) ─────
// admin-sim-override EF(+ simulate-game EF)를 완전 대체.

export const simGameOverride = async (
    roomId: string,
    gameId: string,
    accessToken?: string
): Promise<{ ok: boolean; homeScore?: number; awayScore?: number; simDurationMs?: number; skipped?: boolean; error?: string }> => {
    const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
    try {
        const res = await fetch(`${FLY_SERVER}/sim-override`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ roomId, gameId }),
        });
        const data = await res.json().catch(() => ({})) as any;
        return { ok: res.ok, ...data };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? '시뮬레이션 요청 실패' };
    }
};

// ─── 개별 경기 일정(scheduledAt) 변경 (어드민) ────────────────────────────────
// [migration 2026-08-06] rooms.schedule JSONB 배열 read-modify-write 대신 games 테이블
// 단건 조회+가드 UPDATE. 이미 플레이된 경기는 결과가 확정돼 있으므로 변경하지 않는다.

export const updateGameScheduledAt = async (
    roomId: string,
    gameId: string,
    scheduledAtIso: string,
): Promise<{ error: string | null }> => {
    const { data: target, error: fetchErr } = await supabase
        .from('games')
        .select('played')
        .eq('room_id', roomId).eq('game_id', gameId)
        .maybeSingle();
    if (fetchErr) return { error: fetchErr.message };
    if (!target) return { error: '해당 경기를 찾을 수 없습니다.' };
    if (target.played) return { error: '이미 종료된 경기는 일정을 변경할 수 없습니다.' };

    // TOCTOU(위 조회~아래 UPDATE 사이 시뮬레이션 완료) 방지를 위해 UPDATE에도 played=false를 건다.
    const { error } = await supabase
        .from('games')
        .update({ scheduled_at: scheduledAtIso })
        .eq('room_id', roomId).eq('game_id', gameId).eq('played', false);

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

    // [migration 2026-08-06] games 삭제 — game_id가 결정론적(T_R1_M0_G1 등)이라 지우지
    // 않으면 재드래프트 시 (room_id, game_id) PK 충돌로 finalize가 실패한다.
    // game_short_codes도 함께 정리(기존엔 안 지워서 재드래프트 시 UNIQUE 충돌로
    // 숏코드 insert가 조용히 실패하던 버그가 있었음 — 이번에 같이 고침).
    const { error: gamesErr } = await supabase.from('games').delete().eq('room_id', roomId);
    if (gamesErr) return { error: gamesErr.message, archiveEdition };
    await supabase.from('game_short_codes').delete().eq('room_id', roomId);

    // rooms 초기화 — schedule은 이제 games 테이블이 SSOT이지만, 컬럼 정리(별도 후속) 전까지
    // 롤백 안전망으로 빈 배열을 유지해 둔다.
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

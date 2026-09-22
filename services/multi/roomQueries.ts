
import { supabase } from '../supabaseClient';
import type { OffseasonPhase } from '../../types/app';
import type { SimSettings } from '../../types/simSettings';
import type { PersonalDraftFormat } from './personalDraftFormat';
import type { SavedTeamFinances } from '../../types/finance';

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
    /** URL 라우팅 전용 짧은 코드 — 2026-08-01 이후 생성된 리그만 값이 있음(기존 리그는 null, 소급 미적용). */
    short_code: string | null;
    type: 'main_league' | 'tournament';
    group_id: string | null;
    tier: 'd1' | 'd2' | 'd3' | null;
    name: string;
    admin_user_id: string;
    status: 'recruiting' | 'drafting' | 'in_progress' | 'finished';
    max_teams: number;
    season_number: number;
    cap_enabled: boolean;
    /** [2026-09-15] 이 리그가 샐러리캡+CBA 규정(버드권한/RFA-QO/협상 화면 등)을 실제로 쓰는지 —
     *  cap_enabled(숫자 임계값 집행)와는 별개 축, 둘 다 독립적으로 켜고 끌 수 있다. */
    cba_rules_enabled: boolean;
    /** [2026-08-26] 어드민 세부 설정 — cap_enabled는 전체 마스터 스위치, 아래는 각각 개별 on/off + 금액(달러). */
    salary_cap_amount: number;
    luxury_tax_enabled: boolean;
    luxury_tax_amount: number;
    apron1_enabled: boolean;
    apron1_amount: number;
    apron2_enabled: boolean;
    apron2_amount: number;
    salary_floor_enabled: boolean;
    salary_floor_amount: number;
    /** [2026-09-16] 연간 캡 증가율(%, 예: 5 = 5%). NULL이면 미설정 — 설정 화면의 10년 전망 테이블 비노출용, 실제 시즌 갱신에는 미반영. */
    cap_growth_rate: number | null;
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
    draft_year_min: number;
    draft_year_max: number;
    /** [2026-09-16] custom_overrides(선수 피크시즌 스탯 오버라이드) 적용 여부 — 기본 false.
     *  utils/leagueOverrides.ts의 shouldUseCustomOverrides() 참조. */
    use_custom_overrides: boolean;
    draft_pick_duration_sec: number;
    draft_total_rounds: number;
    draft_auto_pick_after_misses: number;
    rookie_pool_inclusion: boolean;
    draft_scheduled_at: string | null;
    lottery_scheduled_at: string | null;
    tournament_format: string | null;
    match_format: string | null;
    finals_match_format: string | null;
    /** 컨퍼런스별 플레이오프 진출 팀 수(리그 전체 총원이 아님) — 기본 8. */
    playoff_team_count: number | null;
    /** NBA 방식 플레이인 토너먼트(7~10위) 활성화 여부 — 기본 true. */
    play_in_enabled: boolean | null;
    bracket_data: unknown | null;
    season_start_date: string;
    season_end_date: string | null;
    tournament_start_at: string | null;
    /** [2026-09-18] 개인 팩 드래프트 참가/드래프트 마감 시각(null=마감 없음). 지나면
     *  claim_team RPC가 신규 참가·팀 변경을 거부하고, 서버 스케줄러가 그때까지 드래프트를
     *  끝내지 못한 참가자를 자동 강퇴한다(server/src/personalDraftDeadline.ts). */
    draft_deadline_at: string | null;
    real_time_pace: string;
    sim_real_start_at: string | null;
    games_per_real_day: number;
    /** [2026-09-18] 메인리그 정규시즌 압축 설정 — 총 진행기간(주) + 일일 시뮬 시간대(KST 자정
     *  기준 분). 리그 생성 시(CreateLeagueModal) 채워지고, 세션 설정 "일정" 탭에서 수정 가능.
     *  finalize.ts가 최초 스케줄 압축에, ScheduleSettingsTab이 남은 경기 재배치에 사용한다. */
    duration_weeks: number | null;
    daily_window_start_min: number | null;
    daily_window_end_min: number | null;
    /** [2026-09-18] 고정 길이 가상 하루 타임라인 설정 — 하루 길이(분, 20~40), 실제 시작/종료일(KST),
     *  플레이오프 시리즈 경기 간격(가상 일, 1=매일/2=격일). 이 구조 이전 리그는 전부 null(간격은 1).
     *  duration_weeks/daily_window_end_min은 이제 이 값들에서 파생되는 호환용 값. */
    day_length_min: number | null;
    real_start_date: string | null;
    real_end_date: string | null;
    playoff_game_interval_days: number;
    /** [2026-09-18 2단계] 리플레이(결과 공개 지연) 길이(분, 5/8/10/12, 기본 10). 클라이언트 판정
     *  (multiGameReveal), 서버 라이브 엔드포인트, DB game_pbp RLS·시즌 스탯 함수가 모두 이 값을 쓴다. */
    replay_minutes: number;
    /** [2026-09-15] 올스타 서브 이벤트 4종의 실제(압축) 발동 시각 — scheduler.ts가 now()와 직접
     *  비교해 트리거. 남은 경기 재배치가 브레이크 경계를 다시 지나면 함께 갱신된다. */
    allstar_schedule: { announceAt?: string; risingStarsAt?: string; contestsAt?: string; mainGameAt?: string } | null;
    /** 시즌 개막 연도(가상 캘린더 기준) — getAllStarKeyDates()의 인자. finalize.ts가 리그
     *  생성 시 채운다(CreateLeagueModal.tsx 참조). */
    virtual_season_year: number | null;
    /** [2026-09-16] 트레이드 데드라인(가상 시즌 캘린더 날짜). 기본값은 virtual_season_year+1년
     *  2월 둘째 주 목요일(utils/tradeDeadline.ts) — 어드민은 그 날짜로부터 최대 한 달 전까지만
     *  앞당길 수 있고 뒤로는 늘릴 수 없다. null이면 데드라인 없음(무제한). */
    trade_deadline_date: string | null;
    /** [2026-09-16] 트레이드 데드라인 강제 여부 마스터 스위치. false면 trade_deadline_date
     *  값이 있어도 무시(무제한) — cap_enabled/luxury_tax_enabled와 동일한 on/off + 값 패턴. */
    trade_deadline_enabled: boolean;
    /** [2026-09-16] 팀당 최대 로스터 인원(15~20, 기본 15) — FA 계약 시 sign_free_agent()/
     *  sign_free_agent_negotiated() RPC가 이 값을 기준으로 슬롯 초과 여부를 검증한다. */
    max_roster_size: number;
    /** [2026-09-16] Two-Way 계약 전환 데드라인(가상 시즌 캘린더 날짜). null이면 데드라인 없음. */
    two_way_deadline_date: string | null;
    /** [2026-09-16] 팀당 Two-Way 계약 슬롯 수(1~5, 기본 3) — max_roster_size(정규 계약)와 별개. */
    two_way_slots: number;
    /** [2026-09-22] 드래프트 계약 생성 규칙. 'standard'(기본) = 실제 계약 유지 + 풀을 "룸 시즌 유효 계약
     *  보유자 + 당해 드래프트 클래스 신인"으로 제한, 신인만 루키 스케일 생성 / 'alternative' = 드래프트된
     *  전원에게 라운드 스케일 1년 계약 재생성(레전드 포함 판타지 리그용). services/contracts/draftSalaryScale.ts. */
    contract_mode: 'standard' | 'alternative';
    /** [2026-09-22] 라운드별 cap% 표(jsonb, null=기본 프리셋). 모양은 DraftSalaryScale — 읽을 때 반드시
     *  normalizeDraftSalaryScale()을 거칠 것. 드래프트 시작 후엔 변경 불가(이미 적용됨). */
    draft_salary_scale: { r1FirstPct: number; r1LastPct: number; roundsPct: number[] } | null;
    /** [2026-09-18] Two-Way 계약 사용 여부(기본 true). 꺼지면 슬롯 표시/설정이 사라지고 협상 화면에서 투웨이를 고를 수
     *  없으며 sign_free_agent_negotiated()가 two_way 계약을 거부한다. CBA 규정이 꺼진 리그는 이 값과 무관하게 투웨이 경로 없음
     *  — 판정은 항상 utils/leagueOverrides.ts의 isTwoWayContractEnabled()를 거칠 것. */
    two_way_enabled: boolean;
    /** [2026-09-18] 토너먼트 전용 개인 팩 드래프트 포맷(docs/plan/tournament-personal-pack-draft-plan.md).
     *  null이면 기존 공유풀 턴제 드래프트(DraftRoom.ts + submit_draft_pick_v2)를 그대로 사용. */
    personal_draft_format: PersonalDraftFormat | null;
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
    /** rooms.season — 시즌 표시명(예: "2025-2026"). 방이 없으면 null. */
    season:      string | null;
}

export const listLeaguesWithStats = async (
    userId: string | null
): Promise<LeagueListEntry[]> => {
    // 1. 오픈 리그 목록
    const { data: leagues, error } = await supabase
        .from('leagues')
        .select('*')
        .in('status', ['recruiting', 'drafting', 'in_progress', 'finished'])
        .order('created_at', { ascending: false });

    if (error || !leagues?.length) return [];

    const leagueIds = leagues.map(l => l.id);

    // 2. 방 목록 + 유저 참가 여부 병렬 조회
    const [roomsRes, membershipRes] = await Promise.all([
        supabase
            .from('rooms')
            .select('id, league_id, max_players, season')
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
            season:      room?.season ?? null,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// [2026-08-01] URL에는 신규 리그부터 short_code(8자리), 기존(소급 미적용) 리그는 여전히
// UUID가 노출된다 — 둘 다 받아서 형태로 조회 컬럼을 자동 판별.
export const loadLeague = async (leagueIdOrCode: string): Promise<LeagueRow | null> => {
    const column = UUID_RE.test(leagueIdOrCode) ? 'id' : 'short_code';
    const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .eq(column, leagueIdOrCode)
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
    sim_settings: SimSettings | null;
    /** [2026-09-21] release_player() RPC가 cap_enabled 리그의 waive 데드캡을 여기 기록한다
     *  (team_finances[team_slug].deadMoney[]). 싱글플레이어 SavedTeamFinances와 동일 형태 —
     *  migrations/add_release_player_waive_dead_money.sql 참고. */
    team_finances: SavedTeamFinances | null;
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
    team_color_text: string | null;
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
        .select('id, league_id, name, max_players, status, season, season_number, sim_date, offseason_phase, sim_settings, team_finances, schema_version, created_at, updated_at')
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
        .select('id, league_id, name, max_players, status, season, season_number, sim_date, offseason_phase, sim_settings, team_finances, schema_version, created_at, updated_at')
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
    color_tertiary: string;
    color_text: string;
    court_background: string;
    court_paint: string;
    court_line: string;
    conference: string | null;
    user_id: string | null;
    nickname: string | null;    // profiles.nickname의 비정규화된 복사본 (팀 클레임/닉네임 변경 시 동기화)
    is_ai: boolean;
    draft_order: number | null;
    roster: string[];           // player_id[]
    /** [2026-08-26] 트레이드 블록과 별개 — 팀 단위로 "원하는 대가"를 표현하는 위시리스트. */
    trade_request_note: string | null;
    trade_request_positions: string[];
    trade_request_player_ids: string[];
    trade_request_archetypes: string[];
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

// ─── draft_picks (완료된 드래프트 결과 조회 — 세션 설정 화면 "드래프트" 탭용) ──────

export interface DraftPickRow {
    id: number;
    room_id: string;
    league_id: string | null;
    pick_index: number;
    round: number;
    slot: number;
    team_id: string;
    team_name: string | null;
    user_id: string | null;
    is_ai: boolean;
    gm_email: string | null;
    player_id: string;
    player_name: string;
    position: string;
    ovr: number;
    picked_at: string;
}

export const listDraftPicks = async (roomId: string): Promise<DraftPickRow[]> => {
    const { data, error } = await supabase
        .from('draft_picks')
        .select('*')
        .eq('room_id', roomId)
        .order('pick_index');

    if (error) { console.error('[listDraftPicks]', error.message); return []; }
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

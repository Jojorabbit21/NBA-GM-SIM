/**
 * ⚠️ meta_players.base_attributes 직접 WRITE 경로.
 * admin 수동 편집 전용 — 게임 플레이 런타임 코드에서 호출 금지.
 * 런타임 성장/퇴화는 services/game/playerDevelopment 경로를 사용할 것.
 */

import { supabase } from '../supabaseClient';

export interface MetaPlayerRow {
    id: string;
    name: string;
    position: string;
    base_team_id: string | null;   // 시뮬레이터 팀 배정 기준 (top-level 컬럼)
    base_attributes: Record<string, any>;
    tendencies: Record<string, any> | null; // PlayerTendencies JSONB 컬럼
    include_alltime: boolean;
    in_multi_pool: boolean;
    draft_year: number | null;     // numeric 컬럼 — 2026이면 드래프트 클래스 선수
}

export async function searchPlayers(query: string): Promise<MetaPlayerRow[]> {
    let q = supabase
        .from('meta_players')
        .select('id, name, position, base_team_id, base_attributes, tendencies, include_alltime, in_multi_pool, draft_year')
        .order('name');
    if (query.trim()) {
        q = q.ilike('name', `%${query.trim()}%`);
    }
    const { data, error } = await q.limit(1000);
    if (error) throw error;
    return data ?? [];
}

/** [2026-09-21] 카드 관리 탭 고급 검색 — 능력치 범위 조건(base_attributes 키, min/max는 선택). */
export interface AttrRangeFilter {
    key: string;
    min: number | null;
    max: number | null;
}

export interface PlayerSearchFilters {
    query?: string;
    /** meta_players.base_team_id. '__none__'이면 소속 없음. 빈 값이면 전체 */
    team?: string | null;
    position?: string | null;
    /** 커리어 연도 범위 — career_history 시즌(앞 4자리)이 하나라도 걸리면 매치 */
    careerFrom?: number | null;
    careerTo?: number | null;
    /** [2026-09-21] 커리어 기록 내 소속팀 코드(career_history[].team, 예 'LAL'). 연도 범위와 함께 주면 같은 시즌 행이 둘 다 만족 */
    careerTeam?: string | null;
    attrs?: AttrRangeFilter[];
    limit?: number;
}

export interface CareerTeamCode { code: string; players: number }

/** career_history에 등장하는 팀 코드 목록(3글자 대문자, 합산 행 제외) — 필터 드롭다운용. */
export async function fetchCareerTeamCodes(): Promise<CareerTeamCode[]> {
    const { data, error } = await supabase.rpc('admin_career_team_codes');
    if (error) throw error;
    return (data ?? []) as CareerTeamCode[];
}

/**
 * 이름 + 팀 + 포지션 + 커리어 연도 + 능력치 필터를 DB(RPC admin_search_meta_players)에서 한 번에 거른다 —
 * career_history/base_attributes 조건을 클라이언트에서 걸면 전 선수를 내려받아야 해서 서버에서 처리.
 */
export async function searchPlayersAdvanced(filters: PlayerSearchFilters): Promise<MetaPlayerRow[]> {
    const attrs = (filters.attrs ?? [])
        .filter(f => f.key && (f.min != null || f.max != null))
        .map(f => ({ key: f.key, min: f.min, max: f.max }));
    const { data, error } = await supabase.rpc('admin_search_meta_players', {
        p_query: filters.query?.trim() || null,
        p_team: filters.team || null,
        p_position: filters.position || null,
        p_career_from: filters.careerFrom ?? null,
        p_career_to: filters.careerTo ?? null,
        p_attr_filters: attrs,
        p_limit: filters.limit ?? 300,
        p_career_team: filters.careerTeam || null,
    });
    if (error) throw error;
    return (data ?? []) as MetaPlayerRow[];
}

export async function fetchPlayerById(id: string): Promise<MetaPlayerRow | null> {
    const { data, error } = await supabase
        .from('meta_players')
        .select('id, name, position, base_team_id, base_attributes, tendencies, include_alltime, in_multi_pool, draft_year')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

export async function updateBaseAttributes(
    id: string,
    baseAttrs: Record<string, any>
): Promise<void> {
    const { error } = await supabase
        .from('meta_players')
        .update({ base_attributes: baseAttrs })
        .eq('id', id);
    if (error) throw error;
}

export async function updatePosition(
    id: string,
    position: string
): Promise<void> {
    const { error } = await supabase
        .from('meta_players')
        .update({ position })
        .eq('id', id);
    if (error) throw error;
}

export async function updatePlayerName(
    id: string,
    name: string
): Promise<void> {
    const { error } = await supabase
        .from('meta_players')
        .update({ name })
        .eq('id', id);
    if (error) throw error;
}

export async function updatePlayerTendencies(
    id: string,
    tendencies: Record<string, any> | null
): Promise<void> {
    const { error } = await supabase
        .from('meta_players')
        .update({ tendencies })
        .eq('id', id);
    if (error) throw error;
}

export async function updateIncludeAlltime(
    id: string,
    value: boolean
): Promise<void> {
    const { error } = await supabase
        .from('meta_players')
        .update({ include_alltime: value })
        .eq('id', id);
    if (error) throw error;
}

export async function updateDraftYear(
    id: string,
    draft_year: number | null
): Promise<void> {
    const { error } = await supabase
        .from('meta_players')
        .update({ draft_year })
        .eq('id', id);
    if (error) throw error;
}

export async function updateInMultiPool(
    id: string,
    value: boolean
): Promise<void> {
    const { error } = await supabase
        .from('meta_players')
        .update({ in_multi_pool: value })
        .eq('id', id);
    if (error) throw error;
}

export async function bulkUpdateIncludeAlltime(ids: string[], value: boolean): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase
        .from('meta_players')
        .update({ include_alltime: value })
        .in('id', ids);
    if (error) throw error;
}

export async function bulkUpdateInMultiPool(ids: string[], value: boolean): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase
        .from('meta_players')
        .update({ in_multi_pool: value })
        .in('id', ids);
    if (error) throw error;
}

export interface EditLogEntry {
    id: number;
    player_name: string;
    edited_at: string;
    changes: Record<string, { before: any; after: any }>;
}

export async function insertEditLog(
    playerId: string,
    playerName: string,
    changes: Record<string, { before: any; after: any }>
): Promise<EditLogEntry | null> {
    const { data, error } = await supabase
        .from('player_edit_log')
        .insert({ player_id: playerId, player_name: playerName, changes })
        .select('id, player_name, edited_at, changes')
        .single();
    if (error) { console.error('edit log insert failed:', error); return null; }
    return data;
}

export async function fetchEditLog(playerId: string): Promise<EditLogEntry[]> {
    const { data, error } = await supabase
        .from('player_edit_log')
        .select('id, player_name, edited_at, changes')
        .eq('player_id', playerId)
        .order('edited_at', { ascending: false })
        .limit(30);
    if (error) throw error;
    return data ?? [];
}

export async function insertPlayer(opts: {
    name: string;
    position: string;
    base_team_id?: string | null;
    base_attributes: Record<string, any>;
}): Promise<MetaPlayerRow> {
    const { data, error } = await supabase
        .from('meta_players')
        .insert({
            name: opts.name,
            position: opts.position,
            base_team_id: opts.base_team_id ?? null,
            base_attributes: opts.base_attributes,
            include_alltime: false,
            in_multi_pool: true,
        })
        .select('id, name, position, base_team_id, base_attributes, tendencies, include_alltime, in_multi_pool, draft_year')
        .single();
    if (error) throw error;
    return data;
}

export async function deletePlayer(id: string): Promise<void> {
    const { error } = await supabase
        .from('meta_players')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

/** career_history가 실제로 행이 있는(비어있지 않은) 선수 ID 집합 반환 */
export async function fetchCareerPresentIds(): Promise<Set<string>> {
    const { data, error } = await supabase
        .from('meta_players')
        .select('id, career_history')
        .not('career_history', 'is', null);
    if (error) throw error;
    return new Set(
        (data ?? [])
            .filter((r: any) => Array.isArray(r.career_history) && r.career_history.length > 0)
            .map((r: any) => String(r.id))
    );
}

export async function fetchCareerHistory(id: string): Promise<any[] | null> {
    const { data, error } = await supabase
        .from('meta_players')
        .select('career_history')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data?.career_history ?? null;
}

export async function updateCareerHistory(id: string, history: any[]): Promise<void> {
    const { error } = await supabase
        .from('meta_players')
        .update({ career_history: history })
        .eq('id', id);
    if (error) throw error;
}

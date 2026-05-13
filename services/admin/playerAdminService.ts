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

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
    include_alltime: boolean;
    in_multi_pool: boolean;
    draft_year: number | null;     // numeric 컬럼 — 2026이면 드래프트 클래스 선수
}

export async function searchPlayers(query: string): Promise<MetaPlayerRow[]> {
    let q = supabase
        .from('meta_players')
        .select('id, name, position, base_team_id, base_attributes, include_alltime, in_multi_pool, draft_year')
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
        .select('id, name, position, base_team_id, base_attributes, include_alltime, in_multi_pool, draft_year')
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

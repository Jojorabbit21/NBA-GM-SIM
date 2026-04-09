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
    base_attributes: Record<string, any>;
}

export async function searchPlayers(query: string): Promise<MetaPlayerRow[]> {
    let q = supabase
        .from('meta_players')
        .select('id, name, position, base_attributes')
        .order('name');
    if (query.trim()) {
        q = q.ilike('name', `%${query.trim()}%`);
    }
    // 최대 500명 (모든 선수 커버)
    const { data, error } = await q.limit(500);
    if (error) throw error;
    return data ?? [];
}

export async function fetchPlayerById(id: string): Promise<MetaPlayerRow | null> {
    const { data, error } = await supabase
        .from('meta_players')
        .select('id, name, position, base_attributes')
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

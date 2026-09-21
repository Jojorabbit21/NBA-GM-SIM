// cardEditionAdminService.ts — 시즌 카드 에디션(meta_card_editions) 관리. 어드민이 만든 에디션만
// 카드 편집기에서 선택할 수 있다(자유 입력 없음). 읽기는 공개, 쓰기는 RLS로 어드민만.
import { supabase } from '../supabaseClient';

export interface CardEditionRow {
    id: string;
    name: string;
    sort_order: number;
    /** [2026-09-20] 카드 정중앙 팀 로고 표시 */
    show_center_logo: boolean;
    /** 우상단 40px 팀 로고 표시 */
    show_corner_logo: boolean;
    created_at: string;
}

const COLS = 'id, name, sort_order, show_center_logo, show_corner_logo, created_at';

export async function listEditions(): Promise<CardEditionRow[]> {
    const { data, error } = await supabase
        .from('meta_card_editions')
        .select(COLS)
        .order('sort_order')
        .order('name');
    if (error) throw error;
    return data ?? [];
}

export async function createEdition(name: string, sortOrder = 0): Promise<CardEditionRow> {
    const { data, error } = await supabase
        .from('meta_card_editions')
        .insert({ name: name.trim(), sort_order: sortOrder })
        .select(COLS)
        .single();
    if (error) throw error;
    return data;
}

export async function updateEdition(id: string, patch: { name?: string; sort_order?: number; show_center_logo?: boolean; show_corner_logo?: boolean }): Promise<void> {
    const { error } = await supabase
        .from('meta_card_editions')
        .update({ ...patch, ...(patch.name != null ? { name: patch.name.trim() } : {}) })
        .eq('id', id);
    if (error) throw error;
}

/** 이 에디션을 쓰는 카드가 있으면 FK(RESTRICT)로 실패 — 호출부가 메시지로 안내. */
export async function deleteEdition(id: string): Promise<void> {
    const { error } = await supabase.from('meta_card_editions').delete().eq('id', id);
    if (error) throw error;
}

/** 에디션별 사용 카드 수(삭제 가능 여부 표시용). */
export async function countCardsByEdition(): Promise<Record<string, number>> {
    const { data, error } = await supabase
        .from('meta_player_cards')
        .select('edition_id')
        .not('edition_id', 'is', null);
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[String(r.edition_id)] = (counts[String(r.edition_id)] ?? 0) + 1;
    return counts;
}

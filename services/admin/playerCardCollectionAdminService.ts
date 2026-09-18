// playerCardCollectionAdminService.ts — 카드 컬렉션(meta_player_card_collections) CRUD +
// 멤버십(meta_player_card_collection_members) 관리. 카드 1장이 여러 컬렉션에 동시에 속할 수
// 있는 M:N 관계 — meta_player_cards/meta_players는 여기서 읽기만 한다(절대 쓰지 않음).
import { supabase } from '../supabaseClient';
import type { PlayerCardRow } from './playerCardAdminService';

export interface CardCollectionRow {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
}

const CARD_COLS = 'id, source_player_id, season, name, position, height, weight, base_team_id, base_attributes, tendencies, manual_ovr, created_at, updated_at';

export async function listCollections(): Promise<(CardCollectionRow & { memberCount: number })[]> {
    const { data: collections, error } = await supabase
        .from('meta_player_card_collections')
        .select('id, name, description, created_at, updated_at')
        .order('name');
    if (error) throw error;
    if (!collections?.length) return [];

    const { data: memberRows, error: memErr } = await supabase
        .from('meta_player_card_collection_members')
        .select('collection_id')
        .in('collection_id', collections.map(c => c.id));
    if (memErr) throw memErr;

    const counts = new Map<string, number>();
    for (const row of memberRows ?? []) {
        counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1);
    }
    return collections.map(c => ({ ...c, memberCount: counts.get(c.id) ?? 0 }));
}

export async function createCollection(name: string, description?: string | null): Promise<CardCollectionRow> {
    const { data, error } = await supabase
        .from('meta_player_card_collections')
        .insert({ name: name.trim(), description: description?.trim() || null })
        .select('id, name, description, created_at, updated_at')
        .single();
    if (error) throw error;
    return data;
}

export async function updateCollection(id: string, patch: { name?: string; description?: string | null }): Promise<void> {
    const { error } = await supabase
        .from('meta_player_card_collections')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw error;
}

export async function deleteCollection(id: string): Promise<void> {
    const { error } = await supabase.from('meta_player_card_collections').delete().eq('id', id);
    if (error) throw error;
}

/** 컬렉션에 속한 카드 전체(카드 상세 정보 포함) — 시즌 카드 관리 탭의 "컬렉션에 넣은 카드" 목록용. */
export async function listCollectionMembers(collectionId: string): Promise<PlayerCardRow[]> {
    const { data, error } = await supabase
        .from('meta_player_card_collection_members')
        .select(`card_id, meta_player_cards!inner(${CARD_COLS})`)
        .eq('collection_id', collectionId);
    if (error) throw error;
    return (data ?? []).map((row: any) => row.meta_player_cards as PlayerCardRow);
}

/** 특정 카드가 지금 속한 컬렉션 id 목록 — 카드 편집기의 "컬렉션" 체크박스 초기 상태용. */
export async function listCollectionsForCard(cardId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('meta_player_card_collection_members')
        .select('collection_id')
        .eq('card_id', cardId);
    if (error) throw error;
    return (data ?? []).map(r => r.collection_id);
}

export async function addCardToCollection(collectionId: string, cardId: string): Promise<void> {
    const { error } = await supabase
        .from('meta_player_card_collection_members')
        .insert({ collection_id: collectionId, card_id: cardId });
    if (error) throw error;
}

export async function removeCardFromCollection(collectionId: string, cardId: string): Promise<void> {
    const { error } = await supabase
        .from('meta_player_card_collection_members')
        .delete()
        .eq('collection_id', collectionId)
        .eq('card_id', cardId);
    if (error) throw error;
}

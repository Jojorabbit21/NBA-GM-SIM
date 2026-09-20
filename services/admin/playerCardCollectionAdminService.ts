// playerCardCollectionAdminService.ts — 카드 컬렉션(meta_player_card_collections) CRUD +
// 멤버십(meta_player_card_collection_members) 관리. 카드 1장이 여러 컬렉션에 동시에 속할 수
// 있는 M:N 관계 — meta_player_cards/meta_players는 여기서 읽기만 한다(절대 쓰지 않음).
import { supabase } from '../supabaseClient';
import type { PlayerCardRow } from './playerCardAdminService';
import type { CardBackgroundSettings } from '../../utils/cardBackground';

export interface CardCollectionRow extends CardBackgroundSettings {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
}

const CARD_COLS = 'id, source_player_id, season, name, position, height, weight, base_team_id, base_attributes, tendencies, manual_ovr, bg_image_url, edition_id, created_at, updated_at';
const COLLECTION_COLS = 'id, name, description, bg_type, bg_color, bg_gradient_from, bg_gradient_to, bg_gradient_angle, bg_image_url, bottom_gradient_enabled, bottom_gradient_opacity, card_radius, created_at, updated_at';
const BG_BUCKET = 'card-backgrounds';

export async function listCollections(): Promise<(CardCollectionRow & { memberCount: number })[]> {
    const { data: collections, error } = await supabase
        .from('meta_player_card_collections')
        .select(COLLECTION_COLS)
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
        .select(COLLECTION_COLS)
        .single();
    if (error) throw error;
    return data;
}

export type UpdateCollectionPatch = Partial<CardBackgroundSettings> & { name?: string; description?: string | null };

export async function updateCollection(id: string, patch: UpdateCollectionPatch): Promise<void> {
    const { error } = await supabase
        .from('meta_player_card_collections')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw error;
}

/**
 * 컬렉션 배경 이미지 업로드(WebP 권장, 5MB 이하) → 공개 URL 반환. 저장은 호출부가
 * updateCollection({ bg_type:'image', bg_image_url })로 따로 한다. 경로에 타임스탬프를 넣어
 * 같은 컬렉션에 다시 올려도 CDN 캐시가 옛 이미지를 물고 있지 않게 한다.
 */
export async function uploadCollectionBackground(
    collectionId: string,
    blob: Blob,
    ext: string,
    contentType: string,
): Promise<string> {
    const path = `${collectionId}/${Date.now()}.${ext.replace(/^\./, '').toLowerCase()}`;
    const { error } = await supabase.storage
        .from(BG_BUCKET)
        .upload(path, blob, { contentType, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(BG_BUCKET).getPublicUrl(path);
    return data.publicUrl;
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

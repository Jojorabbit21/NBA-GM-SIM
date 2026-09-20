// cardPool.ts — 개인 팩 드래프트가 소비하는 "시즌 카드" 풀 조회 (안 A 배선, 2026-09-20).
// meta_player_cards(+ 컬렉션 멤버십)를 한 번에 읽어 카드별 OVR을 클라이언트에서 계산한다.
// OVR은 카드 편집기(pages/PlayerCardEditorPage.tsx computeOvrPreview)와 같은 규칙:
// manual_ovr 이 있으면 그 값, 없으면 base_attributes 기반 calculateOvr. 카드는 자체 능력치를
// 갖는 독립 row라 meta_players.custom_overrides(피크 시즌)는 적용하지 않는다.
import { supabase } from '../supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../dataMapper';
import { calculateOvr } from '../../utils/ovrUtils';

export interface CardPoolEntry {
    id: string;
    /** 실제 선수(meta_players.id) — 같은 선수의 다른 시즌 카드 중복 방지 기준 */
    sourcePlayerId: string;
    season: string;
    name: string;
    position: string;
    ovr: number;
    /** 이 카드가 속한 컬렉션 id 목록(없으면 빈 배열) */
    collectionIds: string[];
}

const CARD_COLS = 'id, source_player_id, season, name, position, base_attributes, tendencies, manual_ovr';
const PAGE = 1000;

/** 카드 1장의 유효 OVR — manual_ovr 우선, 없으면 능력치 계산. 계산 실패 시 0. */
export function computeCardOvr(card: { id: string; name: string; position: string; base_attributes: any; tendencies: any; manual_ovr: number | null }): number {
    if (card.manual_ovr != null) return card.manual_ovr;
    try {
        const p = mapRawPlayerToRuntimePlayer({
            id: card.id, name: card.name, position: card.position,
            base_attributes: card.base_attributes, tendencies: card.tendencies,
        }, false, true);
        return calculateOvr(p, card.position);
    } catch {
        return 0;
    }
}

/** 전체 카드 + 멤버십 조회. 카드가 수천 장이 돼도 PostgREST 기본 1000행 제한에 걸리지 않게 페이지네이션. */
export async function fetchCardPool(): Promise<CardPoolEntry[]> {
    const cards: any[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from('meta_player_cards')
            .select(CARD_COLS)
            .order('id')
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`카드 풀 조회 실패: ${error.message}`);
        cards.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
    }

    const members: { card_id: string; collection_id: string }[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from('meta_player_card_collection_members')
            .select('card_id, collection_id')
            .order('card_id')
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`카드 컬렉션 조회 실패: ${error.message}`);
        members.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
    }
    const collectionsByCard = new Map<string, string[]>();
    for (const m of members) {
        const list = collectionsByCard.get(String(m.card_id)) ?? [];
        list.push(String(m.collection_id));
        collectionsByCard.set(String(m.card_id), list);
    }

    return cards.map(c => ({
        id: String(c.id),
        sourcePlayerId: String(c.source_player_id),
        season: String(c.season),
        name: String(c.name),
        position: String(c.position),
        ovr: computeCardOvr(c),
        collectionIds: collectionsByCard.get(String(c.id)) ?? [],
    }));
}

// instancePlayers.ts — 룸 스코프 선수 인스턴스(room_player_instances) 해석기 (클라이언트).
// docs/plan/tournament-personal-pack-draft-plan.md "표시(이름/카드 UI)".
//
// 개인 팩 드래프트 토너먼트에선 league_teams.roster / game_pbp 박스스코어의 playerId가
// meta_players.id가 아니라 room_player_instances.instance_id다. 화면은 이 id로 선수를 찾으므로
// meta_players를 바로 `.in('id', ids)`로 조회하면 빈 결과가 난다. 이 함수는 두 종류 id를 섞어
// 받아도 동작한다: 인스턴스면 source를 조회한 뒤 row의 id를 instance_id로 덮어써 돌려주고
// (server/src/simRunner.ts·finalize.ts의 isInstanceRoom 분기와 같은 규칙), 아니면 그대로 조회한다.
// 인스턴스 행이 하나도 없는 룸(공유풀 드래프트)에선 쿼리 한 번이 추가될 뿐 결과는 기존과 동일.
//
// [2026-09-20 안 A 배선] 인스턴스의 source_player_id는 meta_player_cards.id다. 카드는 meta_players와
// 같은 shape의 독립 row이므로 카드 테이블에서 고정 컬럼으로 읽고, 호출부가 요청한 meta_players 컬럼 중
// 카드에 없는 것(draft_year 등)은 base_attributes에서 보충하거나 null로 둔다. manual_ovr을 row에
// 실어 보내면 dataMapper가 카드 고정 OVR로 쓴다. 옛 포맷(meta_players id)으로 남은 인스턴스는
// 카드 조회에 실패하면 meta_players로 한 번 더 찾는다(하위호환).
import { supabase } from '../supabaseClient';

export interface ResolvedRawPlayer {
    id: string;
    /** 인스턴스였으면 원본(카드 또는 meta_players) id, 아니면 id와 동일. */
    source_player_id: string;
    [col: string]: unknown;
}

const CHUNK = 300;
const CARD_COLS = 'id, source_player_id, season, name, position, height, weight, base_team_id, base_attributes, tendencies, manual_ovr, bg_image_url, edition_id';

async function selectMetaPlayers(cols: string, ids: string[]): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await supabase.from('meta_players').select(cols).in('id', ids.slice(i, i + CHUNK));
        if (error) throw error;
        out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    }
    return out;
}

/** 카드 row를 meta_players row처럼 보이게 — 호출부의 select 컬럼(draft_year 등)을 base_attributes에서 보충. */
function cardToMetaShape(card: Record<string, any>): Record<string, unknown> {
    const attrs = typeof card.base_attributes === 'string' ? JSON.parse(card.base_attributes) : (card.base_attributes ?? {});
    return {
        ...card,
        draft_year: attrs.draft_year ?? null,
        // 카드에는 없는 컬럼들 — 호출부가 읽으면 undefined 대신 null/빈값
        career_history: null,
        contract: null,
        custom_overrides: null,
        // 카드 식별 — 인스턴스 해석 결과에서 "이건 시즌 카드"임을 알 수 있게
        card_id: String(card.id),
        card_season: card.season,
        real_player_id: String(card.source_player_id),
    };
}

async function selectCards(ids: string[]): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await supabase.from('meta_player_cards').select(CARD_COLS).in('id', ids.slice(i, i + CHUNK));
        if (error) throw error;
        out.push(...((data ?? []) as any[]).map(cardToMetaShape));
    }
    return out;
}

/**
 * @param roomId  null이면 인스턴스 해석을 건너뛰고 meta_players만 조회한다.
 * @param ids     roster / 박스스코어 playerId — 인스턴스 id와 meta id가 섞여 있어도 됨.
 * @param cols    meta_players select 컬럼 목록(반드시 `id`를 포함). 카드는 고정 컬럼으로 읽는다.
 */
export async function fetchMetaPlayersByRosterIds(
    roomId: string | null | undefined,
    ids: string[],
    cols: string,
): Promise<ResolvedRawPlayer[]> {
    const uniq = Array.from(new Set(ids.map(String)));
    if (uniq.length === 0) return [];

    let instances: { instance_id: string; source_player_id: string }[] = [];
    if (roomId) {
        for (let i = 0; i < uniq.length; i += CHUNK) {
            const { data, error } = await supabase
                .from('room_player_instances')
                .select('instance_id, source_player_id')
                .eq('room_id', roomId)
                .in('instance_id', uniq.slice(i, i + CHUNK));
            if (error) throw error;
            instances.push(...((data ?? []) as { instance_id: string; source_player_id: string }[]));
        }
    }

    if (instances.length === 0) {
        const rows = await selectMetaPlayers(cols, uniq);
        return rows.map(r => ({ ...r, id: String(r.id), source_player_id: String(r.id) }));
    }

    const sourceByInstance = new Map(instances.map(i => [String(i.instance_id), String(i.source_player_id)]));
    const plainIds = uniq.filter(id => !sourceByInstance.has(id));
    const sourceIds = Array.from(new Set(sourceByInstance.values()));

    // 인스턴스의 source는 카드 → 못 찾은 것만 meta_players(옛 포맷 하위호환). 인스턴스가 아닌 id는 meta_players.
    const cardRows = await selectCards(sourceIds);
    const rawById = new Map<string, Record<string, unknown>>(cardRows.map(r => [String(r.id), r]));
    const missingSource = sourceIds.filter(id => !rawById.has(id));
    const metaIds = Array.from(new Set([...plainIds, ...missingSource]));
    if (metaIds.length > 0) {
        for (const r of await selectMetaPlayers(cols, metaIds)) rawById.set(String(r.id), r);
    }

    const out: ResolvedRawPlayer[] = [];
    for (const id of uniq) {
        const sourceId = sourceByInstance.get(id) ?? id;
        const raw = rawById.get(sourceId);
        if (!raw) continue;
        out.push({ ...raw, id, source_player_id: sourceId });
    }
    return out;
}

const PAGE = 1000;

/** PostgREST 기본 행 제한(1000)을 넘는 테이블도 빠짐없이 읽는다. order는 페이지 경계가 안 흔들리게 고정 키로. */
export async function selectAllPages(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await build(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as Record<string, unknown>[];
        out.push(...rows);
        if (rows.length < PAGE) break;
    }
    return out;
}

/**
 * [2026-10-25] 방(room)의 선수 전체를 한 번에 — useLeagueRawStats가 "로스터 id 목록"을 캐시 키에 넣어 FA 서명·트레이드마다
 * 전원이 선수 정보를 처음부터 다시 받던 것(2026-10-25 NBA Active FA 시기 시간당 8만 건)을 없애려는 방식.
 * meta_players는 로스터가 바뀌어도 내용이 안 바뀌므로 전체(약 850명, 1.3MB)를 방 단위로 한 번 받고, 호출부가 필요한 id만 고른다
 * (pickRawPlayersByIds). 요청한 id 하나하나에 대해 fetchMetaPlayersByRosterIds와 같은 모양의 행을 돌려준다:
 *  - meta_players 행: { ...raw, id, source_player_id: id }
 *  - 이 룸의 인스턴스(개인 팩 드래프트): { ...원본(카드 또는 meta_players), id: instance_id, source_player_id: 원본 id }
 * 인스턴스 룸에서도 로스터에 섞여 들어올 수 있는 meta_players id를 위해 meta_players 전체도 함께 돌려준다.
 */
export async function fetchAllRoomPlayers(
    roomId: string | null | undefined,
    cols: string,
): Promise<ResolvedRawPlayer[]> {
    const metaRows = await selectAllPages((from, to) =>
        supabase.from('meta_players').select(cols).order('id').range(from, to));
    const out: ResolvedRawPlayer[] = metaRows.map(r => ({ ...r, id: String(r.id), source_player_id: String(r.id) }));
    if (!roomId) return out;

    const instances = (await selectAllPages((from, to) =>
        supabase.from('room_player_instances').select('instance_id, source_player_id').eq('room_id', roomId).order('instance_id').range(from, to)
    )) as { instance_id: string; source_player_id: string }[];
    if (instances.length === 0) return out;

    const sourceIds = Array.from(new Set(instances.map(i => String(i.source_player_id))));
    const rawById = new Map<string, Record<string, unknown>>((await selectCards(sourceIds)).map(r => [String(r.id), r]));
    // 카드에 없는 source는 meta_players로(옛 포맷 하위호환) — 이미 전체를 받아 둔 metaRows에서 찾는다.
    const metaById = new Map<string, Record<string, unknown>>(metaRows.map(r => [String(r.id), r]));
    for (const inst of instances) {
        const sourceId = String(inst.source_player_id);
        const raw = rawById.get(sourceId) ?? metaById.get(sourceId);
        if (!raw) continue;
        out.push({ ...raw, id: String(inst.instance_id), source_player_id: sourceId });
    }
    return out;
}

/** fetchAllRoomPlayers 결과에서 요청한 id만, 요청한 순서·중복 제거로 고른다 — fetchMetaPlayersByRosterIds(ids)와 같은 결과. */
export function pickRawPlayersByIds<T extends { id: string }>(all: T[], ids: string[]): T[] {
    const byId = new Map<string, T>();
    for (const p of all) byId.set(String(p.id), p);
    const out: T[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
        const p = byId.get(key);
        if (p) out.push(p);
    }
    return out;
}

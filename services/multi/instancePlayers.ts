// instancePlayers.ts — 룸 스코프 선수 인스턴스(room_player_instances) 해석기 (클라이언트).
// docs/plan/tournament-personal-pack-draft-plan.md "표시(이름/카드 UI)".
//
// 개인 팩 드래프트 토너먼트에선 league_teams.roster / game_pbp 박스스코어의 playerId가
// meta_players.id가 아니라 room_player_instances.instance_id다. 화면은 이 id로 선수를 찾으므로
// meta_players를 바로 `.in('id', ids)`로 조회하면 빈 결과가 난다. 이 함수는 두 종류 id를 섞어
// 받아도 동작한다: 인스턴스면 source 선수를 조회한 뒤 row의 id를 instance_id로 덮어써 돌려주고
// (server/src/simRunner.ts·finalize.ts의 isInstanceRoom 분기와 같은 규칙), 아니면 그대로 조회한다.
// 인스턴스 행이 하나도 없는 룸(공유풀 드래프트)에선 쿼리 한 번이 추가될 뿐 결과는 기존과 동일.
import { supabase } from '../supabaseClient';

export interface ResolvedRawPlayer {
    id: string;
    /** 인스턴스였으면 원본 meta_players.id, 아니면 id와 동일. */
    source_player_id: string;
    [col: string]: unknown;
}

const CHUNK = 300;

async function selectMetaPlayers(cols: string, ids: string[]): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await supabase.from('meta_players').select(cols).in('id', ids.slice(i, i + CHUNK));
        if (error) throw error;
        out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    }
    return out;
}

/**
 * @param roomId  null이면 인스턴스 해석을 건너뛰고 meta_players만 조회한다.
 * @param ids     roster / 박스스코어 playerId — 인스턴스 id와 meta id가 섞여 있어도 됨.
 * @param cols    meta_players select 컬럼 목록(반드시 `id`를 포함).
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
    const metaIds = Array.from(new Set([...plainIds, ...sourceByInstance.values()]));
    const rows = await selectMetaPlayers(cols, metaIds);
    const rawById = new Map(rows.map(r => [String(r.id), r]));

    const out: ResolvedRawPlayer[] = [];
    for (const id of uniq) {
        const sourceId = sourceByInstance.get(id) ?? id;
        const raw = rawById.get(sourceId);
        if (!raw) continue;
        out.push({ ...raw, id, source_player_id: sourceId });
    }
    return out;
}

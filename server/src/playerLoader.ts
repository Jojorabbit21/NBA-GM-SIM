/**
 * playerLoader.ts — 방(room) 선수 id → 런타임 Player 하이드레이션 (서버 공용)
 *
 * simRunner §2의 로딩 로직을 그대로 옮긴 것 — 체력 회복(fatigueRecovery.ts)처럼 경기 밖에서
 * 선수 능력치(stamina/durability 등)가 필요한 경로가 같은 해석을 쓰도록 한다.
 *   - 일반 방: league_teams.roster = meta_players.id
 *   - 개인 팩 드래프트 방(leagues.personal_draft_format != null): roster = room_player_instances.instance_id
 *     → source_player_id(meta_player_cards.id, 옛 포맷은 meta_players.id)로 resolve 후 id를 instance_id로 덮어씀
 *   - custom_overrides 적용 여부는 shouldUseCustomOverrides(leagues.use_custom_overrides)
 */
import { supabase } from './supabaseAdmin.ts';
import { mapRawPlayerToRuntimePlayer } from './shared/dataMapper.ts';
import { shouldUseCustomOverrides } from './shared/leagueOverrides.ts';

const RAW_COLUMNS = 'id, name, position, base_attributes, tendencies';
const CHUNK = 100;   // .in() 필터가 URL에 실리므로 id 수백 개를 한 번에 보내지 않는다

export interface PlayerLoaderLeague {
    use_custom_overrides?: boolean | null;
    personal_draft_format?: string | null;
}

async function selectIn(table: string, columns: string, column: string, ids: string[], extra?: (q: any) => any): Promise<any[]> {
    const out: any[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
        let q = supabase.from(table).select(columns).in(column, ids.slice(i, i + CHUNK));
        if (extra) q = extra(q);
        const { data, error } = await q;
        if (error) throw new Error(`[playerLoader] ${table}: ${error.message}`);
        out.push(...(data ?? []));
    }
    return out;
}

/** playerIds(방 기준 선수 id) → Map<선수 id, 런타임 Player>. 찾지 못한 id는 결과에서 빠진다. */
export async function loadRoomPlayers(
    roomId: string,
    playerIds: string[],
    league: PlayerLoaderLeague | null | undefined,
): Promise<Map<string, any>> {
    const ids = [...new Set(playerIds)];
    const playerMap = new Map<string, any>();
    if (ids.length === 0) return playerMap;

    const useCustomOverrides = shouldUseCustomOverrides(league);
    const isInstanceRoom = league?.personal_draft_format != null;

    if (isInstanceRoom) {
        const instances = await selectIn('room_player_instances', 'instance_id, source_player_id', 'instance_id', ids,
            q => q.eq('room_id', roomId));
        const sourceIds = [...new Set(instances.map((i: any) => i.source_player_id))] as string[];
        const cardRows = await selectIn('meta_player_cards', `${RAW_COLUMNS}, manual_ovr`, 'id', sourceIds);
        const rawById = new Map<string, any>(cardRows.map((r: any) => [r.id, r]));
        const missing = sourceIds.filter(id => !rawById.has(id));
        if (missing.length > 0) {
            for (const r of await selectIn('meta_players', RAW_COLUMNS, 'id', missing)) rawById.set(r.id, r);
        }
        for (const { instance_id, source_player_id } of instances as any[]) {
            const raw = rawById.get(source_player_id);
            if (!raw) continue;
            const player = mapRawPlayerToRuntimePlayer(raw, useCustomOverrides);
            playerMap.set(instance_id, { ...player, id: instance_id });
        }
    } else {
        for (const raw of await selectIn('meta_players', RAW_COLUMNS, 'id', ids)) {
            playerMap.set(String(raw.id), mapRawPlayerToRuntimePlayer(raw, useCustomOverrides));
        }
    }
    return playerMap;
}

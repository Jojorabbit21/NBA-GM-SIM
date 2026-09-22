/**
 * 드래프트 종료(finalizeDraft) 시 계약 생성 — draft_picks(round/slot)를 읽어 room_player_state.contract에 기록.
 * meta_players는 건드리지 않는다. 규칙/프리셋은 services/contracts/draftSalaryScale.ts(클라이언트와 공유).
 *
 *  - contract_mode 'alternative': 드래프트된 전원에게 라운드 스케일 1년 계약(실제 계약 무시).
 *  - contract_mode 'standard'  : 룸 시즌을 포함하는 유효 계약이 있으면 그대로 두고, 없는 픽(=풀 필터상
 *                                당해 클래스 신인)만 생성 — 1라운드 실제 NBA 픽(base_attributes.draft_pick)이
 *                                있으면 4년 루키 스케일, 아니면 YOS 0 미니멈 1년.
 *  - 미드래프트 선수는 아무것도 만들지 않는다(FA 협상 엔진 담당).
 *  - 이미 room_player_state.contract가 있는 (room, player)는 alternative에서만 덮어쓴다(재실행 안전).
 */
import {
    type DraftSalaryScale, normalizeDraftSalaryScale, resolveDraftSalaryPct, buildDraftScaleContract,
} from './contracts/draftSalaryScale.ts';
import { calcRookieScaleYears } from './contracts/rookieScaleTable.ts';
import { minSalaryForYos } from './utils/minSalaryTable.ts';

type SupabaseLike = { from: (table: string) => any };

export interface DraftContractLeague {
    contract_mode?: 'standard' | 'alternative' | null;
    draft_salary_scale?: unknown;
    salary_cap_amount?: number | null;
    draft_year_max?: number | null;
    virtual_season_year?: number | null;
}

function coversSeason(contract: any, seasonStart: number): boolean {
    const ys = contract?.yearSeasons;
    return Array.isArray(ys) && ys.length > 0 && Number(ys[0]) <= seasonStart && Number(ys[ys.length - 1]) >= seasonStart;
}

export async function generateDraftContracts(
    supabase: SupabaseLike,
    roomId: string,
    league: DraftContractLeague,
    teamCount: number,
): Promise<{ mode: string; generated: number; kept: number; skipped: number }> {
    const mode: 'standard' | 'alternative' = league.contract_mode === 'alternative' ? 'alternative' : 'standard';
    const cap = Number(league.salary_cap_amount ?? 0);
    if (!(cap > 0)) { console.warn('[draftContracts] salary_cap_amount 없음 — 생성 건너뜀'); return { mode, generated: 0, kept: 0, skipped: 0 }; }

    const { data: room } = await supabase.from('rooms').select('season').eq('id', roomId).single();
    const seasonStart = room?.season ? parseInt(String(room.season).split('-')[0], 10)
        : Number(league.virtual_season_year ?? new Date().getFullYear());
    const rookieClassYear = Number(league.draft_year_max ?? seasonStart);
    const scale: DraftSalaryScale = normalizeDraftSalaryScale(league.draft_salary_scale);

    const { data: picks } = await supabase.from('draft_picks').select('round, slot, player_id').eq('room_id', roomId);
    if (!picks?.length) { console.warn(`[draftContracts] draft_picks 없음 room=${roomId}`); return { mode, generated: 0, kept: 0, skipped: 0 }; }
    const playerIds: string[] = [...new Set((picks as any[]).map(p => String(p.player_id)))];

    // 실제 계약(room 오버라이드 → meta 원본) — standard 모드 판정용
    const metaById = new Map<string, any>();
    for (let i = 0; i < playerIds.length; i += 200) {
        const { data } = await supabase.from('meta_players').select('id, draft_year, base_attributes').in('id', playerIds.slice(i, i + 200));
        for (const r of data ?? []) metaById.set(String(r.id), r);
    }
    const { data: rps } = await supabase.from('room_player_state').select('player_id, contract').eq('room_id', roomId).in('player_id', playerIds);
    const rpsContract = new Map<string, any>((rps ?? []).map((r: any) => [String(r.player_id), r.contract]));

    const upserts: { room_id: string; player_id: string; contract: any }[] = [];
    let kept = 0, skipped = 0;
    for (const pk of picks as any[]) {
        const pid = String(pk.player_id);
        const meta = metaById.get(pid);
        if (!meta) { skipped++; continue; }   // 삭제된 선수 등 고아 픽
        const existing = rpsContract.get(pid) ?? meta.base_attributes?.contract ?? null;

        if (mode === 'alternative') {
            const pct = resolveDraftSalaryPct(scale, Number(pk.round), Number(pk.slot), teamCount);
            upserts.push({ room_id: roomId, player_id: pid, contract: buildDraftScaleContract(cap, pct, seasonStart) });
            continue;
        }
        // standard
        if (coversSeason(existing, seasonStart)) { kept++; continue; }
        const isRookie = meta.draft_year != null && Number(meta.draft_year) >= rookieClassYear;
        const nbaPick = Number(meta.base_attributes?.draft_pick);
        if (isRookie && Number.isFinite(nbaPick) && nbaPick >= 1 && nbaPick <= 30) {
            const years = calcRookieScaleYears(nbaPick, cap);
            upserts.push({ room_id: roomId, player_id: pid, contract: {
                type: 'rookie_scale', years, yearSeasons: years.map((_, i) => seasonStart + i), currentYear: 0,
                options: [{ type: 'team', year: 2 }, { type: 'team', year: 3 }], signingType: 'rookie_scale_exception',
            } });
        } else {
            // 2라운드/미드래프트 신인 또는 (풀 필터를 우회해 들어온) 무계약자 — YOS 0 미니멈 1년
            upserts.push({ room_id: roomId, player_id: pid, contract: {
                type: 'free_agent', years: [minSalaryForYos(0, cap)], yearSeasons: [seasonStart], currentYear: 0,
                contractDetail: 'general', signingType: 'minimum_exception',
            } });
        }
    }

    for (let i = 0; i < upserts.length; i += 200) {
        const { error } = await supabase.from('room_player_state').upsert(upserts.slice(i, i + 200), { onConflict: 'room_id,player_id' });
        if (error) console.error(`[draftContracts] upsert 실패 (${i}~): ${error.message}`);
    }
    console.log(`[draftContracts] room=${roomId} mode=${mode} generated=${upserts.length} kept=${kept} skipped=${skipped}`);
    return { mode, generated: upserts.length, kept, skipped };
}

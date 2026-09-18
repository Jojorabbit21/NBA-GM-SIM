// personalDraftStart.ts — 토너먼트 개인 팩 드래프트 리그의 "시작 트리거" (Phase 7).
// docs/plan/tournament-personal-pack-draft-plan.md
//
// 공유풀 드래프트는 DraftRoom 완료 → finalize.ts:finalizeDraft()가 status를 drafting→in_progress로
// 뒤집고 브라켓/일정을 만든다. 개인 팩 드래프트엔 드래프트 룸이 없으므로 여기서 대신:
//   1) leagues.status를 recruiting→in_progress로 원자적으로 클레임(중복 실행 방지)
//   2) 미참가 league_teams에 AI 멤버(room_members)를 채운다 — startDraft.ts buildDraftSetup의
//      AI 채우기와 같은 규칙(가짜 UUID 00000000-0000-0000-0000-000000000NNN, is_ai=true).
//      league_teams.user_id는 auth.users FK라 건드리지 않고 is_ai만 표시(2026-07-26 수정 이력 동일).
//   3) personal_draft_force_complete_room RPC로 모든 팀의 남은 라운드를 자동 지명으로 채운다
//      (아직 시작 안 한 팀은 1라운드부터 전부 자동, 진행 중인 팀은 남은 라운드만).
//   4) finalize.ts:forceInitSchedule()로 전술 초기화 + 브라켓/games 생성(기존 함수 재사용).
//   실패하면 status를 recruiting으로 되돌려 다음 틱에 재시도되게 한다.
import { supabase } from './supabaseAdmin';
import { forceInitSchedule } from './finalize';
import { seededShuffle } from './shared/multiDraftEngine';

const AI_USER_ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

async function fillAiMembers(roomId: string, seed: string): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
    const { data: members } = await supabase
        .from('room_members')
        .select('user_id, team_id, is_ai')
        .eq('room_id', roomId);
    const claimedSlugs = new Set((members ?? []).map((m: any) => m.team_id).filter(Boolean));

    const { data: teams } = await supabase
        .from('league_teams')
        .select('id, team_slug, team_name, team_abbr, color_primary, color_secondary, color_text')
        .eq('room_id', roomId);
    const unclaimed = seededShuffle((teams ?? []).filter((t: any) => !claimedSlugs.has(t.team_slug)), seed + '_ai');
    if (unclaimed.length === 0) return { ok: true, added: 0 };

    // 이미 존재하는 AI 번호와 겹치지 않게 다음 번호부터.
    const usedAiNums = new Set(
        (members ?? [])
            .map((m: any) => String(m.user_id ?? ''))
            .filter(id => id.startsWith('00000000-0000-0000-0000-'))
            .map(id => Number(id.slice(-12)))
            .filter(n => Number.isFinite(n)),
    );
    let next = 1;
    const rows: any[] = [];
    for (const lt of unclaimed as any[]) {
        while (usedAiNums.has(next)) next++;
        rows.push({
            room_id: roomId,
            user_id: AI_USER_ID(next),
            team_id: lt.team_slug,
            team_name: lt.team_name,
            team_abbr: lt.team_abbr,
            team_color_primary: lt.color_primary,
            team_color_secondary: lt.color_secondary,
            team_color_text: lt.color_text,
            is_ai: true,
            ai_gm_personality: 'balanced',
        });
        usedAiNums.add(next);
    }
    const { error: upErr } = await supabase.from('room_members').upsert(rows, { onConflict: 'room_id,user_id' });
    if (upErr) return { ok: false, error: `AI fill: ${upErr.message}` };

    for (const lt of unclaimed as any[]) {
        const { error } = await supabase.from('league_teams').update({ is_ai: true }).eq('id', lt.id);
        if (error) console.error(`[personalDraftStart] league_teams is_ai sync FAILED team=${lt.id}: ${error.message}`);
    }
    return { ok: true, added: rows.length };
}

export async function startPersonalDraftTournament(
    leagueId: string,
    roomId: string,
): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
    // 1) 원자적 클레임 — 다른 프로세스/틱이 먼저 잡았으면 조용히 빠진다.
    const { data: claimed } = await supabase
        .from('leagues')
        .update({ status: 'in_progress' })
        .eq('id', leagueId)
        .eq('status', 'recruiting')
        .not('personal_draft_format', 'is', null)
        .select('id');
    if (!claimed?.length) return { ok: true, skipped: true };

    const revert = async (reason: string) => {
        console.error(`[personalDraftStart] league=${leagueId} room=${roomId} failed: ${reason} — reverting to recruiting`);
        await supabase.from('leagues').update({ status: 'recruiting' }).eq('id', leagueId).eq('status', 'in_progress');
    };

    try {
        const { data: room } = await supabase.from('rooms').select('id, tendency_seed').eq('id', roomId).single();
        if (!room) { await revert('room not found'); return { ok: false, error: 'room not found' }; }

        // 2) AI 멤버 채우기
        const fill = await fillAiMembers(roomId, room.tendency_seed ?? roomId);
        if (fill.ok === false) { await revert(fill.error); return { ok: false, error: fill.error }; }

        // 3) 모든 팀의 남은 라운드 자동 지명
        const { data: forced, error: forceErr } = await supabase.rpc('personal_draft_force_complete_room', { p_room_id: roomId });
        if (forceErr) { await revert(`force_complete: ${forceErr.message}`); return { ok: false, error: forceErr.message }; }

        // 4) 전술 초기화 + 브라켓/일정 생성
        const init = await forceInitSchedule(roomId);
        if (!init.ok) { await revert(`forceInitSchedule: ${init.error}`); return { ok: false, error: init.error ?? 'forceInitSchedule failed' }; }

        console.log(`[personalDraftStart] league=${leagueId} room=${roomId} started — aiMembers=${fill.added} forced=${JSON.stringify(forced)}`);
        return { ok: true };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await revert(msg);
        return { ok: false, error: msg };
    }
}

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
import { kickIncompleteDrafters } from './personalDraftDeadline';

// [2026-09-20] 준비 단계 분리 — 마감(draft_deadline_at)이 없으면 시작 5분 전에 준비를 돌린다.
// migrations/add_personal_draft_prepared_at.sql 의 claim_team 차단 기준(interval '5 minutes')과 같은 값.
export const PREP_LEAD_MIN = 5;

/** 준비(AI 채우기 + 자동 드래프트 + 일정 생성)를 시작할 시각 — 마감이 있으면 마감, 없으면 시작 5분 전. */
export function effectivePrepAt(league: { draft_deadline_at: string | null; tournament_start_at: string | null }): Date | null {
    if (league.draft_deadline_at) return new Date(league.draft_deadline_at);
    if (league.tournament_start_at) return new Date(new Date(league.tournament_start_at).getTime() - PREP_LEAD_MIN * 60_000);
    return null;
}

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

/**
 * 준비 작업 본체(멱등): 미완료 사람 강퇴 → AI 멤버 채우기 → 전 팀 자동 드래프트 → 전술 초기화 + 브라켓/일정.
 * tournament_start_at이 아직 미래면 forceInitSchedule이 첫 경기를 정확히 그 시각(slot 0)에 잡는다.
 */
async function runPreparation(leagueId: string, roomId: string): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
    const { data: room } = await supabase.from('rooms').select('id, tendency_seed').eq('id', roomId).single();
    if (!room) return { ok: false, error: 'room not found' };

    // 0) 드래프트를 끝내지 못한 사람 참가자는 마감 규칙대로 강퇴 → 그 자리는 아래에서 AI가 채운다
    await kickIncompleteDrafters(roomId);

    // 1) AI 멤버 채우기
    const fill = await fillAiMembers(roomId, room.tendency_seed ?? roomId);
    if (fill.ok === false) return { ok: false, error: fill.error };

    // 2) 모든 팀의 남은 라운드 자동 지명
    const { data: forced, error: forceErr } = await supabase.rpc('personal_draft_force_complete_room', { p_room_id: roomId });
    if (forceErr) return { ok: false, error: `force_complete: ${forceErr.message}` };

    // 3) 전술 초기화 + 브라켓/일정 생성 (이미 finalized면 내부에서 skip)
    const init = await forceInitSchedule(roomId);
    if (!init.ok) return { ok: false, error: `forceInitSchedule: ${init.error ?? 'failed'}` };

    return { ok: true, summary: `aiMembers=${fill.added} forced=${JSON.stringify(forced)}` };
}

/**
 * [2026-09-20] 준비 단계 — 유효 준비 시각(마감 또는 시작 5분 전)에 스케줄러가 호출.
 * personal_draft_prepared_at 을 원자적으로 클레임해 중복 실행을 막고, 실패하면 되돌려 다음 틱에 재시도.
 */
export async function preparePersonalDraftTournament(
    leagueId: string,
    roomId: string,
): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
    const { data: claimed } = await supabase
        .from('leagues')
        .update({ personal_draft_prepared_at: new Date().toISOString() })
        .eq('id', leagueId)
        .eq('status', 'recruiting')
        .is('personal_draft_prepared_at', null)
        .not('personal_draft_format', 'is', null)
        .select('id');
    if (!claimed?.length) return { ok: true, skipped: true };

    const revert = async (reason: string) => {
        console.error(`[personalDraftPrep] league=${leagueId} room=${roomId} failed: ${reason} — will retry next tick`);
        await supabase.from('leagues').update({ personal_draft_prepared_at: null }).eq('id', leagueId);
    };

    try {
        const res = await runPreparation(leagueId, roomId);
        if (res.ok === false) { await revert(res.error); return { ok: false, error: res.error }; }
        console.log(`[personalDraftPrep] league=${leagueId} room=${roomId} prepared — ${res.summary}`);
        return { ok: true };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await revert(msg);
        return { ok: false, error: msg };
    }
}

/**
 * 시작 트리거(tournament_start_at 도달). 준비가 끝나 있으면 상태 전환만 하고, 어떤 이유로 준비가
 * 안 됐으면(마감·준비 시각이 시작과 같거나 지난 뒤 생성된 리그 등) 여기서 준비까지 돌린다(폴백).
 */
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
        .select('id, personal_draft_prepared_at');
    if (!claimed?.length) return { ok: true, skipped: true };

    const revert = async (reason: string) => {
        console.error(`[personalDraftStart] league=${leagueId} room=${roomId} failed: ${reason} — reverting to recruiting`);
        await supabase.from('leagues').update({ status: 'recruiting' }).eq('id', leagueId).eq('status', 'in_progress');
    };

    try {
        if ((claimed[0] as any).personal_draft_prepared_at) {
            console.log(`[personalDraftStart] league=${leagueId} room=${roomId} started (prepared earlier)`);
            return { ok: true };
        }
        // 폴백: 준비가 안 된 채 시작 시각에 도달 — 지금 준비까지 수행(첫 경기는 forceInitSchedule 규칙대로 지금 기준)
        const res = await runPreparation(leagueId, roomId);
        if (res.ok === false) { await revert(res.error); return { ok: false, error: res.error }; }
        await supabase.from('leagues').update({ personal_draft_prepared_at: new Date().toISOString() }).eq('id', leagueId);
        console.log(`[personalDraftStart] league=${leagueId} room=${roomId} started (prepared at start) — ${res.summary}`);
        return { ok: true };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await revert(msg);
        return { ok: false, error: msg };
    }
}

/**
 * postDraftResultNews.ts — 공용 풀 드래프트가 끝나면(finalize.ts:finalizeDraft의 drafting→in_progress claim 직후,
 * 리그당 한 번만 실행) 결과를 league_events에 "드래프트 결과" 서신으로 게시한다.
 * 서신에는 1라운드 지명 전체(보통 팀 수만큼)를 싣고, 전체 라운드는 클라이언트의 "드래프트 결과" 화면
 * (/season/draft-result, draft_picks 직접 조회)에서 본다 — 페이로드를 가볍게 유지하기 위함.
 *
 * 클라이언트 미러: services/multi/leagueEventPayload.ts의 DraftResultDetail/
 * parseLeagueEventPayload 'draft_result' case. 필드명을 바꿀 땐 반드시 양쪽 다 같이 고칠 것
 * (client/server 미러 쌍 — dev-log.md 기록 대상).
 */
import { supabase } from './supabaseAdmin';

export interface DraftResultPickPayload {
    pick: number;      // 전체 지명 순번(1부터)
    round: number;
    slot: number;      // 라운드 내 순번(1부터)
    teamSlug: string;
    teamName: string;
    playerId: string;
    playerName: string;
    position: string;
    ovr: number;
}

export interface DraftResultPayloadData {
    rounds: number;       // 총 라운드 수
    totalPicks: number;   // 전체 지명 수
    picks: DraftResultPickPayload[]; // 1라운드 지명(pick 오름차순)
}

/** draft_picks 행 + 팀 행 → 서신 페이로드. 순수 함수(DB 접근 없음) — 검증/테스트용으로 분리. 1라운드 지명이 없으면 null. */
export function buildDraftResultPayload(pickRows: any[], teamRows: any[]): ({ v: 1; headline: string } & DraftResultPayloadData) | null {
    if (!pickRows.length) return null;
    const teamNameBySlug = new Map<string, string>((teamRows ?? []).map((t: any) => [String(t.team_slug), String(t.team_name)]));
    const toPayload = (r: any): DraftResultPickPayload => ({
        pick: Number(r.pick_index) + 1,
        round: Number(r.round),
        slot: Number(r.slot),
        teamSlug: String(r.team_id),
        teamName: teamNameBySlug.get(String(r.team_id)) ?? String(r.team_name ?? r.team_id),
        playerId: String(r.player_id),
        playerName: String(r.player_name),
        position: String(r.position ?? ''),
        ovr: Number(r.ovr ?? 0),
    });

    const rounds = Math.max(...pickRows.map((r: any) => Number(r.round)));
    const picks = pickRows.filter((r: any) => Number(r.round) === 1).map(toPayload);
    if (!picks.length) return null;
    const first = picks[0];
    return {
        v: 1,
        headline: `드래프트 결과 — 전체 1순위 ${first.playerName}(${first.teamName})`,
        rounds,
        totalPicks: pickRows.length,
        picks,
    };
}

export async function postDraftResult(roomId: string, leagueId: string): Promise<void> {
    // 중복 방지 — finalize의 claim이 한 번만 통과시키지만, 수동 재실행/복구에 대비
    const { data: existing } = await supabase.from('league_events')
        .select('id').eq('room_id', roomId).eq('type', 'draft_result').limit(1);
    if (existing?.length) return;

    const [{ data: pickRows, error: pickErr }, { data: teamRows }, { data: leagueRow }] = await Promise.all([
        supabase.from('draft_picks')
            .select('pick_index, round, slot, team_id, team_name, player_id, player_name, position, ovr')
            .eq('room_id', roomId).order('pick_index', { ascending: true }),
        supabase.from('league_teams').select('team_slug, team_name').eq('room_id', roomId),
        supabase.from('leagues').select('season_number').eq('id', leagueId).maybeSingle(),
    ]);
    if (pickErr) { console.error(`[draftResult] room=${roomId} draft_picks 조회 실패:`, pickErr.message); return; }
    if (!pickRows?.length) return;

    const payload = buildDraftResultPayload(pickRows, teamRows ?? []);
    if (!payload) return;
    const first = payload.picks[0];
    const picks = payload.picks;
    // 드래프트 시점엔 시즌 캘린더(가상 날짜)가 아직 없으므로 로터리 서신과 같이 실제 게시 날짜를 sim_date로 기록
    const todayDate = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.from('league_events').insert({
        room_id: roomId,
        league_id: leagueId,
        season_number: leagueRow?.season_number ?? null,
        game_id: null,
        sim_date: todayDate,
        type: 'draft_result',
        team_ids: [...new Set(picks.map(p => p.teamSlug))],
        player_ids: picks.map(p => p.playerId),
        score: 20,
        payload,
    });
    if (error) {
        console.error(`[draftResult] room=${roomId} league_events insert 실패:`, error.message);
    } else {
        console.log(`[draftResult] room=${roomId} 드래프트 결과 서신 게시 완료 (1순위: ${first.playerName})`);
    }
}

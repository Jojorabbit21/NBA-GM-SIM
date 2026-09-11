
/**
 * postDraftLotteryNews.ts — 드래프트 순서 로터리 추첨이 끝나면(run_draft_lottery RPC 성공
 * 직후) 결과를 league_events에 뉴스로 게시한다. 호출부는 startDraft.ts의 handleRunLottery
 * (어드민 수동 실행)와 scheduler.ts의 runLotteries(자동 실행) 두 곳뿐 — 두 곳 모두 RPC가
 * 반환한 전체 league_teams 행(jsonb, draft_order 오름차순)을 그대로 넘겨준다.
 *
 * 클라이언트 미러: services/multi/leagueEventPayload.ts의 DraftLotteryResultDetail/
 * parseLeagueEventPayload 'draft_lottery_result' case. 필드명을 바꿀 땐 반드시 양쪽 다
 * 같이 고칠 것(dev-log.md 기록 대상).
 */
import { supabase } from './supabaseAdmin';

export interface DraftLotteryPickPayload {
    rank: number;
    teamSlug: string;
    teamName: string;
}

export interface DraftLotteryResultPayloadData {
    picks: DraftLotteryPickPayload[]; // draft_order 오름차순(1순위부터)
}

export async function postDraftLotteryResult(
    roomId: string,
    leagueId: string,
    seasonNumber: number | null,
    lotteryTeams: any[] | null | undefined,
): Promise<void> {
    if (!lotteryTeams?.length) return;

    const picks: DraftLotteryPickPayload[] = lotteryTeams
        .filter((t: any) => t.draft_order != null)
        .sort((a: any, b: any) => a.draft_order - b.draft_order)
        .map((t: any) => ({ rank: t.draft_order, teamSlug: t.team_slug, teamName: t.team_name }));
    if (!picks.length) return;

    const firstPickTeamName = picks[0].teamName;
    // 로터리 시점엔 아직 시즌 캘린더(가상 날짜)가 존재하지 않으므로(드래프트조차 시작 전),
    // 다른 뉴스들처럼 가상 날짜가 아니라 실제 게시 날짜를 sim_date로 기록한다.
    const todayDate = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.from('league_events').insert({
        room_id: roomId,
        league_id: leagueId,
        season_number: seasonNumber,
        game_id: null,
        sim_date: todayDate,
        type: 'draft_lottery_result',
        team_ids: picks.map(p => p.teamSlug),
        player_ids: [],
        score: 20,
        payload: { v: 1, headline: `드래프트 순서 추첨 결과 — 1순위 ${firstPickTeamName}`, picks } satisfies { v: 1; headline: string } & DraftLotteryResultPayloadData,
    });
    if (error) {
        console.error(`[draftLottery] room=${roomId} league_events insert 실패:`, error.message);
    } else {
        console.log(`[draftLottery] room=${roomId} 로터리 결과 게시 완료 (1순위: ${firstPickTeamName})`);
    }
}

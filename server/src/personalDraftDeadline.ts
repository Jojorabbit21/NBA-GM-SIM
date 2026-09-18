// personalDraftDeadline.ts — 개인 팩 드래프트 참가/드래프트 마감(leagues.draft_deadline_at) 스윕.
// docs/plan/tournament-personal-pack-draft-plan.md 후속. 사용자 요청: "토너먼트 세션을 만들 때
// 드래프트 기한을 설정할 수 있도록 만들어줘. 그 드래프트 기한을 넘기면 새 참가자가 더 이상
// 참가할 수 없고, 아직 드래프트 하지 않은 참가자는 자동으로 강퇴되어야해"
//
// - "새 참가자 차단"은 claim_team RPC(migrations/add_personal_draft_deadline.sql)가 서버에서
//   직접 거부한다 — 여기서는 아무 일도 하지 않는다.
// - "아직 드래프트 안 끝낸 참가자 강퇴"만 이 파일이 담당: personal_draft_progress.status가
//   'completed'가 아닌(또는 행 자체가 없는) 팀의 소유자를 release_team RPC로 내보낸다.
//   release_team은 어드민 수동 강퇴(LeagueLobbyPanel.handleKick)가 이미 쓰는 것과 동일한 함수라
//   room_members 삭제 + league_teams.user_id NULL + 보류중 트레이드 취소까지 같은 규칙으로 처리된다.
// - 강퇴 후에도 personal_draft_progress/room_player_instances는 그대로 남는다 — 토너먼트 시작
//   시점의 personal_draft_force_complete_room()이 어차피 미완료 진행 행을 이어서 자동 지명으로
//   채우므로(이미 구현됨), 강퇴로 인해 빈 팀이 된 자리는 그때 자연스럽게 AI 팀으로 넘어간다.
// - 마감 이후엔 claim_team이 신규 참가를 막으므로, 한 번 강퇴된 자리는 다시 채워지지 않는다 —
//   이 스윕은 매 틱 반복 호출해도 안전(멱등): 이미 강퇴된 팀은 user_id가 NULL이라 다음 틱에
//   대상에서 자연히 빠진다.
import { supabase } from './supabaseAdmin';

export async function sweepPersonalDraftDeadlines(now: string): Promise<void> {
    const { data: leagues } = await supabase
        .from('leagues')
        .select('id')
        .eq('status', 'recruiting')
        .eq('type', 'tournament')
        .not('personal_draft_format', 'is', null)
        .not('draft_deadline_at', 'is', null)
        .lte('draft_deadline_at', now);

    for (const league of leagues ?? []) {
        const { data: room } = await supabase
            .from('rooms')
            .select('id')
            .eq('league_id', league.id)
            .eq('status', 'active')
            .maybeSingle();
        if (!room) continue;

        await kickIncompleteDrafters(room.id).catch(err =>
            console.error(`[personalDraftDeadline] room=${room.id} error:`, err instanceof Error ? err.message : err));
    }
}

async function kickIncompleteDrafters(roomId: string): Promise<void> {
    const { data: teams } = await supabase
        .from('league_teams')
        .select('id, user_id')
        .eq('room_id', roomId)
        .not('user_id', 'is', null);
    if (!teams?.length) return;

    const teamIds = teams.map((t: any) => t.id as string);
    const { data: progressRows } = await supabase
        .from('personal_draft_progress')
        .select('team_id, status')
        .eq('room_id', roomId)
        .in('team_id', teamIds);
    const completedTeamIds = new Set(
        (progressRows ?? []).filter((p: any) => p.status === 'completed').map((p: any) => p.team_id as string),
    );

    const toKick = (teams as { id: string; user_id: string }[]).filter(t => !completedTeamIds.has(t.id));
    if (toKick.length === 0) return;

    for (const t of toKick) {
        const { error } = await supabase.rpc('release_team', { p_room_id: roomId, p_user_id: t.user_id });
        if (error) console.error(`[personalDraftDeadline] release_team failed team=${t.id} user=${t.user_id}: ${error.message}`);
    }
    console.log(`[personalDraftDeadline] room=${roomId} kicked ${toKick.length} incomplete drafter(s)`);
}

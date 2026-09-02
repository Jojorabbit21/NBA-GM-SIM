
/**
 * postPowerRankingNews.ts — 매월 초(가상 시즌 날짜 기준) 파워랭킹을 재계산해 league_events에
 * 뉴스로 게시한다. scheduler.ts의 advanceSimDates()가 방(room)의 sim_date 월(YYYY-MM)이
 * 바뀌는 걸 감지하면 이 함수를 호출한다.
 *
 * 서버 전용 — 클라이언트 미러 없음(DB 조회+insert 오케스트레이션이라 클라에 대응물이 없음).
 * 계산 로직 자체(calculatePreseasonPowerRankings)는 server/src/shared/multi/powerRanking.ts
 * (services/multi/powerRanking.ts의 미러)를 그대로 사용.
 */
import { supabase } from './supabaseAdmin';
import { mapRawPlayerToRuntimePlayer } from './shared/dataMapper.ts';
import { calculatePreseasonPowerRankings, type TeamPowerRanking } from './shared/multi/powerRanking.ts';
import type { Team, Player } from './shared/types.ts';

interface PowerRankingEntryPayload {
    teamSlug: string;
    teamName: string;
    rank: number;
    powerScore: number;
    /** UI "재능" 컬럼 — TeamPowerRanking.talentScore 그대로. */
    talentScore: number;
    /** UI "공격" 컬럼 — TeamPowerRanking.offenseScore 그대로. */
    offenseScore: number;
    /** UI "수비" 컬럼 — TeamPowerRanking.defenseScore 그대로. */
    defenseScore: number;
}

export interface PowerRankingPayloadData {
    month: string; // 'YYYY-MM' — 이 랭킹이 반영하는 가상 시즌 월
    full: PowerRankingEntryPayload[]; // 전체 팀, rank 오름차순
    riser?: PowerRankingEntryPayload & { fromRank: number };
    faller?: PowerRankingEntryPayload & { fromRank: number };
}

function monthLabel(month: string): string {
    const [y, m] = month.split('-');
    return `${y}년 ${Number(m)}월`;
}

export async function recomputeAndPostPowerRankings(
    roomId: string,
    leagueId: string,
    seasonNumber: number | null,
    month: string,
): Promise<void> {
    const { data: leagueTeams, error: teamsErr } = await supabase
        .from('league_teams')
        .select('team_slug, team_name, roster')
        .eq('room_id', roomId);
    if (teamsErr || !leagueTeams?.length) {
        console.error(`[powerRanking] room=${roomId} league_teams 조회 실패:`, teamsErr?.message);
        return;
    }

    const allPlayerIds = Array.from(new Set(leagueTeams.flatMap((t: any) => t.roster ?? [])));
    if (allPlayerIds.length === 0) return;

    const { data: rawPlayers, error: playersErr } = await supabase
        .from('meta_players')
        .select('id, name, position, base_attributes')
        .in('id', allPlayerIds);
    if (playersErr) {
        console.error(`[powerRanking] room=${roomId} meta_players 조회 실패:`, playersErr.message);
        return;
    }

    const playerMap = new Map<string, Player>(
        (rawPlayers ?? []).map((r: any) => [String(r.id), mapRawPlayerToRuntimePlayer(r, false)]),
    );

    const teams: Team[] = leagueTeams.map((lt: any) => ({
        id: lt.team_slug,
        name: lt.team_name,
        city: '', logo: '', conference: 'East', division: '',
        wins: 0, losses: 0, budget: 0, salaryCap: 0, luxuryTaxLine: 0,
        roster: (lt.roster ?? [])
            .map((id: string) => playerMap.get(id))
            .filter(Boolean) as Player[],
    }));

    const rankings: TeamPowerRanking[] = calculatePreseasonPowerRankings(teams);
    const nameBySlug = new Map(leagueTeams.map((t: any) => [t.team_slug, t.team_name]));

    const round1 = (v: number) => Math.round(v * 10) / 10;
    const full: PowerRankingEntryPayload[] = rankings.map(r => ({
        teamSlug: r.teamId,
        teamName: String(nameBySlug.get(r.teamId) ?? r.teamId),
        rank: r.rank,
        powerScore: round1(r.powerScore),
        talentScore: round1(r.talentScore),
        offenseScore: round1(r.offenseScore),
        defenseScore: round1(r.defenseScore),
    }));

    // 지난달 스냅샷과 비교해 최대 상승/하락 팀 산출 — 처음 게시되는 방(과거 기록 없음)이면 생략.
    const { data: prevEvent } = await supabase
        .from('league_events')
        .select('payload')
        .eq('room_id', roomId).eq('type', 'power_ranking')
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle();

    let riser: PowerRankingPayloadData['riser'];
    let faller: PowerRankingPayloadData['faller'];
    const prevFull: PowerRankingEntryPayload[] | undefined = (prevEvent as any)?.payload?.full;
    if (prevFull?.length) {
        const prevRankBySlug = new Map(prevFull.map(p => [p.teamSlug, p.rank]));
        let bestDelta = 0;
        let worstDelta = 0;
        for (const entry of full) {
            const fromRank = prevRankBySlug.get(entry.teamSlug);
            if (fromRank == null) continue;
            const delta = fromRank - entry.rank; // 양수 = 순위 상승
            if (delta > bestDelta) { bestDelta = delta; riser = { ...entry, fromRank }; }
            if (delta < worstDelta) { worstDelta = delta; faller = { ...entry, fromRank }; }
        }
    }

    const payload: PowerRankingPayloadData = { month, full, riser, faller };
    const topTeamName = full[0]?.teamName ?? '';

    const { error: insertErr } = await supabase.from('league_events').insert({
        room_id: roomId,
        league_id: leagueId,
        season_number: seasonNumber,
        game_id: null,
        sim_date: `${month}-01`,
        type: 'power_ranking',
        team_ids: full.map(t => t.teamSlug),
        player_ids: [],
        score: 15,
        payload: { v: 1, headline: `${monthLabel(month)} 파워랭킹 — 1위 ${topTeamName}`, ...payload },
    });
    if (insertErr) {
        console.error(`[powerRanking] room=${roomId} league_events insert 실패:`, insertErr.message);
    } else {
        console.log(`[powerRanking] room=${roomId} ${month} 파워랭킹 게시 완료 (1위: ${topTeamName})`);
    }
}

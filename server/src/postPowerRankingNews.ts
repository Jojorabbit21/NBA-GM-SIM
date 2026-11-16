
/**
 * postPowerRankingNews.ts — 매월 초(가상 시즌 캘린더 기준) 파워랭킹을 재계산해 league_events에
 * 뉴스로 게시한다. scheduler.ts의 advanceSimDates()가 "다음 미실행 경기의 games.game_date 월"이
 * 마지막 게시 월(league_events power_ranking payload.month)보다 앞서는 걸 감지하면 이 함수를 호출한다.
 * (rooms.sim_date는 실제 KST 방송일이라 월 판정에 쓰지 않는다.)
 *
 * 서버 전용 — 클라이언트 미러 없음(DB 조회+insert 오케스트레이션이라 클라에 대응물이 없음).
 * 계산 로직 자체(calculatePreseasonPowerRankings)는 server/src/shared/multi/powerRanking.ts
 * (services/multi/powerRanking.ts의 미러)를 그대로 사용.
 */
import { supabase } from './supabaseAdmin';
import { mapRawPlayerToRuntimePlayer } from './shared/dataMapper.ts';
import { shouldUseCustomOverrides } from './shared/leagueOverrides.ts';
import { calculatePreseasonPowerRankings, type TeamPowerRanking, type PowerCategoryKey } from './shared/multi/powerRanking.ts';
import type { Team, Player } from './shared/types.ts';

/**
 * 집계 방식 번호 — 공식이 바뀌어 지난달 순위와 직접 비교할 수 없게 될 때마다 올린다.
 * 직전 게시물의 번호가 다르면 그 달은 최대 상승/하락 팀을 내지 않는다(방식 차이가 순위 변동으로 보이는 것 방지).
 *   1(필드 없음) = 재능 50% + 11개 모듈 조화평균 35% + 포지션 밸런스 15%
 *   2 [2026-11-16] = 공격 4부문 + 수비 4부문 리그 내 순위의 평균(재능·포지션 밸런스 폐지)
 */
const POWER_RANKING_METHOD = 2;

interface PowerRankingEntryPayload {
    teamSlug: string;
    teamName: string;
    rank: number;
    powerScore: number;
    /** 공격 4부문 백분위 평균 — 기사 본문의 공수 성향 판정용(표에는 안 나온다). */
    offenseScore: number;
    /** 수비 4부문 백분위 평균 — 위와 같음. */
    defenseScore: number;
    /** 표의 부문별 리그 내 순위(1 = 최고) — TeamPowerRanking.categoryRanks 그대로. */
    categoryRanks: Record<PowerCategoryKey, number>;
}

export interface PowerRankingPayloadData {
    month: string; // 'YYYY-MM' — 이 랭킹이 반영하는 가상 시즌 월
    method: number; // POWER_RANKING_METHOD
    /** 직전 게시물과 집계 방식이 달라 전월 대비 변동을 내지 않은 달에만 true. */
    methodChanged?: boolean;
    /** 같은 달을 다시 보낸 게시물에만 true — 제목(목록 headline·레터 h1)에 "[재발송]"이 붙는다. */
    resend?: boolean;
    full: PowerRankingEntryPayload[]; // 전체 팀, rank 오름차순
    riser?: PowerRankingEntryPayload & { fromRank: number };
    faller?: PowerRankingEntryPayload & { fromRank: number };
}

function monthLabel(month: string): string {
    const [y, m] = month.split('-');
    return `${y}년 ${Number(m)}월`;
}

export interface PowerRankingPostOptions {
    /** 이미 게시된 달을 다시 보낼 때 true — 수동 재발송 전용(scripts/resendPowerRanking.ts, scripts/는 gitignore라 로컬 파일). */
    resend?: boolean;
}

/** 게시물 내용(제목 + 페이로드)만 만든다 — DB에 쓰지 않는다. 계산할 수 없으면 null. */
export async function buildPowerRankingPost(
    roomId: string,
    leagueId: string,
    month: string,
    opts: PowerRankingPostOptions = {},
): Promise<{ headline: string; payload: PowerRankingPayloadData } | null> {
    const { data: leagueTeams, error: teamsErr } = await supabase
        .from('league_teams')
        .select('team_slug, team_name, roster')
        .eq('room_id', roomId);
    if (teamsErr || !leagueTeams?.length) {
        console.error(`[powerRanking] room=${roomId} league_teams 조회 실패:`, teamsErr?.message);
        return null;
    }

    const allPlayerIds = Array.from(new Set(leagueTeams.flatMap((t: any) => t.roster ?? [])));
    if (allPlayerIds.length === 0) return null;

    const { data: rawPlayers, error: playersErr } = await supabase
        .from('meta_players')
        .select('id, name, position, base_attributes, ovr_base, ovr_custom')
        .in('id', allPlayerIds);
    if (playersErr) {
        console.error(`[powerRanking] room=${roomId} meta_players 조회 실패:`, playersErr.message);
        return null;
    }

    // [2026-11-15] 리그의 use_custom_overrides를 따른다(화면에 보이는 OVR·경기 로스터와 같은 기준). 이전엔 항상 base.
    const { data: leagueRow } = await supabase.from('leagues').select('use_custom_overrides').eq('id', leagueId).maybeSingle();
    const useCustomOverrides = shouldUseCustomOverrides(leagueRow);
    const playerMap = new Map<string, Player>(
        (rawPlayers ?? []).map((r: any) => [String(r.id), mapRawPlayerToRuntimePlayer(r, useCustomOverrides)]),
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
        offenseScore: round1(r.offenseScore),
        defenseScore: round1(r.defenseScore),
        categoryRanks: r.categoryRanks,
    }));

    // 지난달 스냅샷과 비교해 최대 상승/하락 팀 산출 — 처음 게시되는 방(과거 기록 없음)이면 생략.
    // 직전 게시물의 집계 방식이 다르면(methodChanged) 순위 차이가 방식 차이라 역시 생략한다.
    // 비교 대상은 "이번 달보다 앞선 달"의 가장 최근 게시물 — 재발송은 같은 달 원본이 최신 게시물이라,
    // 최신 1건만 보면 지난달이 아니라 같은 달 원본과 비교하게 된다.
    const { data: prevEvents } = await supabase
        .from('league_events')
        .select('payload')
        .eq('room_id', roomId).eq('type', 'power_ranking')
        .order('created_at', { ascending: false })
        .limit(12);

    let riser: PowerRankingPayloadData['riser'];
    let faller: PowerRankingPayloadData['faller'];
    const prevPayload = (prevEvents ?? [])
        .map((e: any) => e.payload)
        .find((pl: any) => typeof pl?.month === 'string' && pl.month < month);
    const prevFull: PowerRankingEntryPayload[] | undefined = prevPayload?.full;
    const methodChanged = !!prevFull?.length && (prevPayload?.method ?? 1) !== POWER_RANKING_METHOD;
    if (prevFull?.length && !methodChanged) {
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

    const payload: PowerRankingPayloadData = {
        month, method: POWER_RANKING_METHOD,
        ...(methodChanged ? { methodChanged: true } : {}),
        ...(opts.resend ? { resend: true } : {}),
        full, riser, faller,
    };
    const topTeamName = full[0]?.teamName ?? '';
    const headline = `${opts.resend ? '[재발송] ' : ''}${monthLabel(month)} 파워랭킹 — 1위 ${topTeamName}`;
    return { headline, payload };
}

export async function recomputeAndPostPowerRankings(
    roomId: string,
    leagueId: string,
    seasonNumber: number | null,
    month: string,
    opts: PowerRankingPostOptions = {},
): Promise<void> {
    const post = await buildPowerRankingPost(roomId, leagueId, month, opts);
    if (!post) return;
    const { headline, payload } = post;

    const { error: insertErr } = await supabase.from('league_events').insert({
        room_id: roomId,
        league_id: leagueId,
        season_number: seasonNumber,
        game_id: null,
        sim_date: `${month}-01`,
        type: 'power_ranking',
        team_ids: payload.full.map(t => t.teamSlug),
        player_ids: [],
        score: 15,
        payload: { v: 1, headline, ...payload },
    });
    if (insertErr) {
        console.error(`[powerRanking] room=${roomId} league_events insert 실패:`, insertErr.message);
    } else {
        console.log(`[powerRanking] room=${roomId} ${month} 파워랭킹 게시 완료 (${headline})`);
    }
}

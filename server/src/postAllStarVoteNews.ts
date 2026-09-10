/**
 * postAllStarVoteNews.ts — 올스타 팬 투표 기간 중 가상 캘린더 날짜 기준 하루 1회 득표를
 * 계산해 league_allstar_votes에 저장하고, 중간 발표일(getAllStarKeyDates의
 * allStarVoteInterimDates 3회)이면 league_events에도 allstar_vote_update 뉴스로 게시한다.
 * 투표 시작일(allStarVoteStart)에는 표 없는 안내문(allstar_vote_start)을 별도로 게시하고,
 * 투표 마감일(allStarVoteEnd)에는 runAllStarSelection()으로 최종 명단(스타터/리저브)까지
 * 계산해 같은 행의 roster 컬럼에 함께 저장하고 allstar_vote_result 뉴스로 게시한다. 같은
 * 마감일에 runRisingStarsSelection()으로 라이징스타 챌린지 명단(투표 없음)도 같이 계산해
 * roster.risingStars에 저장하고, allstar_vote_result와는 별도의 allstar_rising_stars 뉴스로도
 * 게시한다(2026-09-08 — 사용자 요청으로 결과 서신 안 섹션에서 독립 서신으로 승격).
 *
 * [2026-09-08 추가] computeAndPostThreePointContestNews() — 3점 챌린지 참가 명단(투표 없음,
 * runThreePointContestSelection())을 올스타전 기간 시작일(allStarStart, 사용자 확인)에
 * allstar_three_point_contest 뉴스로 게시한다. 투표 마감일보다 뒤 시점이라 위 함수들과
 * 트리거 창이 겹치지 않으므로 별도 진입점으로 분리했다(scheduler.ts의
 * runThreePointContestNews()가 호출).
 *
 * 호출부: scheduler.ts의 runAllStarVoteUpdates() — in_progress 상태 main_league 전체를 매
 * tick(30초)마다 훑어서, current_virtual_date(room_id)가 투표 기간(allStarVoteStart~End) 안에
 * 들어온 리그만 이 함수를 호출한다.
 *
 * ⚠️ 가상 날짜는 rooms.sim_date(실제 KST 방송 예정일, text)가 아니라 current_virtual_date()
 * RPC 결과를 써야 한다 — 두 값은 완전히 다른 축이다(migrations/add_league_allstar_votes.sql,
 * docs/history/dev-log.md 2026-09-08 항목 참조). 이 함수는 virtualDate를 인자로 받기만 하고
 * 직접 계산하지 않는다 — 호출부(scheduler.ts)가 이미 RPC로 구한 값을 그대로 넘겨준다.
 *
 * 계산 로직 자체(runAllStarVote/getAllStarKeyDates)는 server/src/shared/multi/allStarSelection.ts
 * (utils/allStarSelection.ts의 미러)를 그대로 사용. 시드는 postSeasonAwards.ts와 동일한
 * 컨벤션(`${roomId}_${season}_allstar`)으로 룸/시즌에 고정 — 같은 날 여러 번 계산해도 항상
 * 같은 결과가 나온다(멱등성의 전제 조건이기도 함 — 값 자체가 결정론적이라야
 * UNIQUE(room_id,season_number,sim_date) upsert가 "같은 날 재계산 = 같은 값 덮어쓰기"로 안전함).
 *
 * 서버 전용 — 클라이언트 미러 없음(DB 조회+insert 오케스트레이션이라 클라에 대응물이 없음),
 * postSeasonAwards.ts/postPowerRankingNews.ts와 동일한 구조.
 */
import { supabase } from './supabaseAdmin';
import { mapRawPlayerToRuntimePlayer } from './shared/dataMapper.ts';
import {
    getAllStarKeyDates, runAllStarVote, runAllStarSelection, runRisingStarsSelection, runThreePointContestSelection,
    runDunkContestSelection,
    type AllStarVoteEntry, type ConferenceVoteLeaderboard, type AllStarPlayer, type RisingStarPlayer,
    type ThreePointContestParticipant, type DunkContestParticipant,
} from './shared/multi/allStarSelection.ts';
import type { Team, Player, PlayerStats } from './shared/types.ts';

function zeroStats(): PlayerStats {
    return {
        g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0,
        tov: 0, tovForced: 0, pf: 0, techFouls: 0, flagrantFouls: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0,
        ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, plusMinus: 0,
        contestedAttempted: 0, contestedMade: 0,
    };
}

// 중간 집계 카드/페이지에 노출할 그룹당 최대 인원 — dev-log.md 2026-09-08 "중간집계는
// 백코트/프론트코트 나눠서 후보를 좀 많이(25명까지) 보여주자" 요청을 정식 반영.
const DISPLAY_LIMIT = 25;

function trimEntries(entries: AllStarVoteEntry[]): { playerId: string; playerName: string; teamSlug: string; posGroup: 'G' | 'FC'; votes: number; pct: number }[] {
    return entries.slice(0, DISPLAY_LIMIT).map(e => ({
        playerId: e.playerId, playerName: e.playerName, teamSlug: e.teamId,
        posGroup: e.posGroup, votes: e.votes, pct: e.pct,
    }));
}

function conferencePayload(c: ConferenceVoteLeaderboard) {
    return { guards: trimEntries(c.guards), frontcourt: trimEntries(c.frontcourt) };
}

// [2026-09-08] votes/pct는 스타터·리저브 구분 없이 항상 "올스타 팬 투표" 득표수/득표율을
// 보여준다(사용자 확인 — 리저브도 코치 투표 포인트가 아니라 팬 투표 성적을 보여달라는
// 요청이었음). AllStarPlayer.votes는 리저브의 경우 코치 투표 포인트라 그대로 못 쓰고, 항상
// result(최종 투표 리더보드, computeAndStoreAllStarVotes에서 이미 계산된 값)에서
// playerId로 찾은 voteInfo를 우선 사용 — 후보 풀(buildCandidates)이 스타터/리저브 선정과
// 완전히 동일해서 조회는 항상 성공한다(재계산이 아니라 조회일 뿐).
function rosterPlayerPayload(p: AllStarPlayer, voteInfo?: { votes: number; pct: number }) {
    return {
        playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamId,
        posGroup: p.posGroup, position: p.position, ovr: p.ovr,
        votes: voteInfo?.votes ?? p.votes, pct: voteInfo?.pct,
    };
}

// 라이징스타는 투표가 없는 성적 기반 선발이라 votes/pct가 없다 — rosterPlayerPayload와
// 달리 팬 투표 리더보드 조회가 아예 필요 없음(runRisingStarsSelection() 결과를 그대로 매핑).
// isCaptain은 팀명(teamAName/teamBName) 산출에 쓰인 주장 여부를 그대로 실어 클라이언트에서도
// (예: 목록에 주장 배지) 재사용할 수 있게 한다.
function risingStarPlayerPayload(p: RisingStarPlayer) {
    return {
        playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamId,
        posGroup: p.posGroup, position: p.position, ovr: p.ovr, isCaptain: p.isCaptain,
    };
}

function daysBetween(a: string, b: string): number {
    return (new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86_400_000;
}

// [2026-09-08] computeAndStoreAllStarVotes()의 팀 구성 로직(room/league_teams/meta_players/
// games/시즌스탯 조회 → Team[] 조립)을 3점 챌린지 등 "같은 룸의 Team[]이 필요한 다른 올스타
// 부대 이벤트"에서도 재사용하기 위해 추출. 반환값이 null이면 호출부가 그대로 조용히 반환하면
// 됨(에러는 이 함수 내부에서 이미 로깅함).
async function buildTeamsForRoom(
    roomId: string, leagueId: string,
): Promise<{ teams: Team[]; season: string; seasonNumber: number; leagueName: string } | null> {
    const { data: room } = await supabase
        .from('rooms').select('id, season, season_number').eq('id', roomId).maybeSingle();
    if (!room) {
        console.error(`[allstarVote] room=${roomId} 조회 실패`);
        return null;
    }

    const { data: leagueTeams, error: teamsErr } = await supabase
        .from('league_teams').select('team_slug, team_name, conference, roster').eq('room_id', roomId);
    if (teamsErr || !leagueTeams?.length) {
        console.error(`[allstarVote] room=${roomId} league_teams 조회 실패:`, teamsErr?.message);
        return null;
    }

    const { data: league } = await supabase.from('leagues').select('name').eq('id', leagueId).maybeSingle();

    const allPlayerIds = Array.from(new Set(leagueTeams.flatMap((t: any) => t.roster ?? [])));
    if (allPlayerIds.length === 0) return null;

    const [playersRes, gamesRes, statsRes] = await Promise.all([
        // draft_year — 라이징스타 선발(runRisingStarsSelection, YOS≤1 필터)에 필요. 처음엔
        // 빠져 있어서 mapRawPlayerToRuntimePlayer가 draftYear를 항상 undefined로 매핑 →
        // 후보가 전부 걸러지는 버그였다(2026-09-08, dataMapper.ts의 popularity 누락과 동일 유형).
        supabase.from('meta_players').select('id, name, position, draft_year, base_attributes').in('id', allPlayerIds),
        supabase.from('games')
            .select('home_team_id, away_team_id, home_score, away_score')
            .eq('league_id', leagueId).eq('is_playoff', false).eq('played', true),
        supabase.rpc('get_league_season_awards_stats', { p_room_id: roomId }),
    ]);
    if (playersRes.error || gamesRes.error || statsRes.error) {
        console.error(
            `[allstarVote] room=${roomId} 데이터 조회 실패:`,
            playersRes.error?.message, gamesRes.error?.message, statsRes.error?.message,
        );
        return null;
    }

    const playerMap = new Map<string, Player>(
        (playersRes.data ?? []).map((r: any) => [String(r.id), mapRawPlayerToRuntimePlayer(r, false)]),
    );
    const statsByPlayer = new Map<string, any>(
        (statsRes.data ?? []).map((r: any) => [String(r.player_id), r]),
    );

    // 팀별 정규시즌 승패 — postSeasonAwards.ts와 동일 원리(games 테이블 직접 집계).
    const record = new Map<string, { wins: number; losses: number }>();
    const bump = (slug: string, win: boolean) => {
        const r = record.get(slug) ?? { wins: 0, losses: 0 };
        if (win) r.wins++; else r.losses++;
        record.set(slug, r);
    };
    for (const g of gamesRes.data ?? []) {
        const homeWin = (g.home_score ?? 0) > (g.away_score ?? 0);
        bump(g.home_team_id, homeWin);
        bump(g.away_team_id, !homeWin);
    }

    const teams: Team[] = leagueTeams.map((lt: any) => {
        const rec = record.get(lt.team_slug) ?? { wins: 0, losses: 0 };
        const roster: Player[] = (lt.roster ?? [])
            .map((id: string) => {
                const base = playerMap.get(id);
                if (!base) return undefined;
                const s = statsByPlayer.get(id);
                const stats: PlayerStats = s ? {
                    ...zeroStats(),
                    g: s.g, gs: Number(s.gs ?? 0), mp: Number(s.mp), pts: Number(s.pts), reb: Number(s.reb),
                    offReb: Number(s.off_reb), defReb: Number(s.def_reb), ast: Number(s.ast),
                    stl: Number(s.stl), blk: Number(s.blk), tov: Number(s.tov), pf: Number(s.pf ?? 0),
                    tovForced: Number(s.tov_forced ?? 0),
                    fgm: Number(s.fgm), fga: Number(s.fga), p3m: Number(s.p3m), p3a: Number(s.p3a),
                    ftm: Number(s.ftm), fta: Number(s.fta),
                    contestedAttempted: Number(s.contested_attempted ?? 0), contestedMade: Number(s.contested_made ?? 0),
                } : zeroStats();
                return { ...base, stats } as Player;
            })
            .filter((p): p is Player => !!p);
        return {
            id: lt.team_slug, name: lt.team_name, city: '', logo: '',
            // ⚠️ postSeasonAwards.ts/postPowerRankingNews.ts는 어워드 스코어링에 불필요해
            // conference를 'East'로 하드코딩하지만, runAllStarVote()는 팀을 East/West로
            // 나눠 각 컨퍼런스 안에서만 득표를 겨루게 하므로 실제 값이 반드시 필요하다.
            conference: (lt.conference === 'West' ? 'West' : 'East') as 'East' | 'West',
            division: '',
            wins: rec.wins, losses: rec.losses, budget: 0, salaryCap: 0, luxuryTaxLine: 0,
            roster,
        };
    });

    return {
        teams,
        season: (room as any).season ?? '2025-26',
        seasonNumber: (room as any).season_number ?? 1,
        leagueName: (league as any)?.name ?? '리그',
    };
}

/**
 * virtualDate가 이미 투표 기간(allStarVoteStart~allStarVoteEnd) 안이라는 건 호출부가
 * 보장한다 — 이 함수는 그 전제 위에서 득표를 계산해 저장하기만 한다.
 */
export async function computeAndStoreAllStarVotes(
    roomId: string, leagueId: string, virtualSeasonYear: number, virtualDate: string,
): Promise<void> {
    const built = await buildTeamsForRoom(roomId, leagueId);
    if (!built) return;
    const { teams, season, seasonNumber, leagueName } = built;
    const seed = `${roomId}_${season}_allstar`;

    const keyDates = getAllStarKeyDates(virtualSeasonYear);
    const windowLen = daysBetween(keyDates.allStarVoteStart, keyDates.allStarVoteEnd);
    const elapsed = daysBetween(keyDates.allStarVoteStart, virtualDate);
    const voteProgress = windowLen > 0 ? elapsed / windowLen : 1;

    const result = runAllStarVote(teams, seed, voteProgress);
    if (result.east.guards.length === 0 && result.west.guards.length === 0) {
        console.log(`[allstarVote] room=${roomId} — 후보(41경기 이상)가 없어 집계 생략`);
        return;
    }

    const payload = {
        v: 1,
        roundLabel: `${virtualDate} 집계`,
        voteProgress,
        east: conferencePayload(result.east),
        west: conferencePayload(result.west),
    };

    // 투표 마감일에만 최종 명단(스타터/리저브)을 함께 계산해 저장 — runAllStarSelection()이
    // 내부에서 이 seed로 runAllStarVote(teams, seed, 1.0)를 다시 호출하므로, 위 payload의
    // 최종 집계(voteProgress===1인 날)와 스타터 구성이 항상 일치한다.
    const isFinalDay = virtualDate === keyDates.allStarVoteEnd;
    // [2026-09-09] "올스타 선정 시 선수 히스토리 수상 내역에 기록 + 프로필 헤더에 배지"
    // 요청 — rosterPayload를 만드는 IIFE 안에서만 쓰던 selection을 바깥 스코프에도
    // 담아둬(클로저), 아래에서 league_player_awards insert에 재사용한다(재계산 아님).
    let allStarSelectionForAwards: ReturnType<typeof runAllStarSelection> | null = null;
    const rosterPayload = isFinalDay ? (() => {
        const selection = runAllStarSelection(teams, seed);
        allStarSelectionForAwards = selection;
        // 라이징스타 — 투표 없이 본올스타 선발과 "같이 발표"해달라는 요청(2026-09-08)이라
        // 같은 rosterPayload(=league_events.payload이자 league_allstar_votes.roster)에 합친다.
        // 컨퍼런스 구분이 없으므로 east/west와 별개 최상위 필드로 둔다.
        const risingStars = runRisingStarsSelection(teams, virtualSeasonYear, seed);
        // voteProgress===1인 날이라 result(위에서 이미 계산됨)가 곧 최종 팬 득표 리더보드 —
        // 스타터/리저브 전원의 득표수·득표율을 여기서 playerId로 찾아 쓴다(재계산 아님, 조회만).
        const voteInfoByPlayerId = new Map<string, { votes: number; pct: number }>(
            [...result.east.guards, ...result.east.frontcourt, ...result.west.guards, ...result.west.frontcourt]
                .map(e => [e.playerId, { votes: e.votes, pct: e.pct }]),
        );
        return {
            east: {
                starters: selection.east.starters.map(p => rosterPlayerPayload(p, voteInfoByPlayerId.get(p.playerId))),
                reserves: selection.east.reserves.map(p => rosterPlayerPayload(p, voteInfoByPlayerId.get(p.playerId))),
            },
            west: {
                starters: selection.west.starters.map(p => rosterPlayerPayload(p, voteInfoByPlayerId.get(p.playerId))),
                reserves: selection.west.reserves.map(p => rosterPlayerPayload(p, voteInfoByPlayerId.get(p.playerId))),
            },
            risingStars: {
                teamA: risingStars.teamA.map(risingStarPlayerPayload),
                teamB: risingStars.teamB.map(risingStarPlayerPayload),
                teamAName: risingStars.teamAName, teamBName: risingStars.teamBName,
            },
        };
    })() : null;

    const { error: upsertErr } = await supabase
        .from('league_allstar_votes')
        .upsert(
            {
                room_id: roomId, league_id: leagueId, season_number: seasonNumber,
                sim_date: virtualDate, vote_progress: voteProgress, payload, roster: rosterPayload,
            },
            { onConflict: 'room_id,season_number,sim_date', ignoreDuplicates: false },
        );
    if (upsertErr) {
        console.error(`[allstarVote] room=${roomId} league_allstar_votes upsert 실패:`, upsertErr.message);
        return;
    }

    // [2026-09-09] 올스타 로스터가 확정된 날(isFinalDay)에만 실행 — 스타터/리저브 전원을
    // league_player_awards에 award_type='ALL_STAR'로 영구 기록한다(postSeasonAwards.ts의
    // MVP/DPOY 저장과 동일 패턴). 프로필 헤더 배지·수상 내역 위젯이 이 테이블을 읽는다
    // (hooks/usePlayerAllStarAwards.ts). rank는 스타터/리저브 구분 없이 0(올-NBA/올-디펜시브와
    // 동일하게 "순위 개념 없음").
    if (allStarSelectionForAwards) {
        const s = allStarSelectionForAwards as ReturnType<typeof runAllStarSelection>;
        const allStars: AllStarPlayer[] = [
            ...s.east.starters, ...s.east.reserves,
            ...s.west.starters, ...s.west.reserves,
        ];
        const awardRows = allStars.map(p => ({
            room_id: roomId, league_id: leagueId, season_number: seasonNumber,
            player_id: p.playerId, team_slug: p.teamId, award_type: 'ALL_STAR', rank: 0, season,
        }));
        const { error: awardsErr } = await supabase
            .from('league_player_awards')
            .upsert(awardRows, { onConflict: 'room_id,season_number,player_id,award_type,rank', ignoreDuplicates: true });
        if (awardsErr) console.error(`[allstarVote] room=${roomId} league_player_awards(ALL_STAR) insert 실패:`, awardsErr.message);
    }

    await maybePostInterimNews(roomId, leagueId, virtualDate, keyDates.allStarVoteInterimDates, payload);
    await maybePostVoteStartNews(roomId, leagueId, virtualDate, keyDates, leagueName, season);
    if (rosterPayload) {
        await maybePostVoteResultNews(roomId, leagueId, virtualDate, rosterPayload, season, keyDates);
        // [2026-09-08] 처음엔 allstar_vote_result 서신 안 섹션으로만 끼워 넣었는데, 사용자
        // 요청으로 뉴스 피드에 별도 아이템으로도 발송한다 — 같은 날 같은 rosterPayload.risingStars를
        // 재사용(재계산 아님).
        await maybePostRisingStarsNews(roomId, leagueId, virtualDate, rosterPayload.risingStars, season, keyDates);
    }
}

async function maybePostVoteStartNews(
    roomId: string, leagueId: string, virtualDate: string,
    keyDates: { allStarVoteStart: string; allStarVoteEnd: string; allStarStart: string; allStarEnd: string; allStarMainGameDate: string },
    leagueName: string, seasonLabel: string,
): Promise<void> {
    if (virtualDate !== keyDates.allStarVoteStart) return;

    // 멱등성 — maybePostInterimNews와 동일 패턴(같은 날 같은 타입 존재 여부 count 조회).
    const { count: alreadyPosted } = await supabase
        .from('league_events')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId).eq('type', 'allstar_vote_start').eq('sim_date', virtualDate);
    if ((alreadyPosted ?? 0) > 0) return;

    const { error } = await supabase.from('league_events').insert({
        room_id: roomId, league_id: leagueId, type: 'allstar_vote_start',
        sim_date: virtualDate,
        payload: {
            v: 1, headline: '올스타 팬 투표가 시작됐습니다',
            leagueName, seasonLabel,
            voteStart: keyDates.allStarVoteStart, voteEnd: keyDates.allStarVoteEnd,
            allStarStart: keyDates.allStarStart, allStarEnd: keyDates.allStarEnd,
            mainGameDate: keyDates.allStarMainGameDate,
        },
    });
    if (error) console.error(`[allstarVote] room=${roomId} allstar_vote_start insert 실패:`, error.message);
    else console.log(`[allstarVote] room=${roomId} — 투표 시작 뉴스 게시`);
}

async function maybePostInterimNews(
    roomId: string, leagueId: string, virtualDate: string, interimDates: string[],
    payload: Record<string, unknown>,
): Promise<void> {
    const roundIdx = interimDates.indexOf(virtualDate);
    if (roundIdx === -1) return;

    // 멱등성 — 같은 날 같은 타입 이벤트가 이미 있으면 스킵 (runScheduledSeasonAwards의
    // count 조회 패턴과 동일).
    const { count: alreadyPosted } = await supabase
        .from('league_events')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId).eq('type', 'allstar_vote_update').eq('sim_date', virtualDate);
    if ((alreadyPosted ?? 0) > 0) return;

    const roundLabel = `${roundIdx + 1}차 중간 집계`;
    const { error } = await supabase.from('league_events').insert({
        room_id: roomId, league_id: leagueId, type: 'allstar_vote_update',
        sim_date: virtualDate,
        payload: { ...payload, roundLabel, headline: `올스타 팬 투표 ${roundLabel} 발표` },
    });
    if (error) console.error(`[allstarVote] room=${roomId} league_events insert 실패:`, error.message);
    else console.log(`[allstarVote] room=${roomId} — ${roundLabel} 뉴스 게시`);
}

type RosterConferencePayload = { starters: ReturnType<typeof rosterPlayerPayload>[]; reserves: ReturnType<typeof rosterPlayerPayload>[] };
type RisingStarsPayload = {
    teamA: ReturnType<typeof risingStarPlayerPayload>[]; teamB: ReturnType<typeof risingStarPlayerPayload>[];
    teamAName: string; teamBName: string;
};

// 투표 마감일 최종 명단 발표 서신 — 코트 배치도 없이 리스트만 보여주는 allstar_vote_result.
// east/west/risingStars는 이미 계산해둔 rosterPayload(league_allstar_votes.roster와 동일 데이터)를
// 그대로 재사용 — 다시 계산하지 않는다.
// [2026-09-08 추가] allStarStart/allStarEnd(올스타전 개최 기간) — 서신 본문에 경기 일정 문구를
// 넣기 위해 추가(라이징스타 서신 maybePostRisingStarsNews()와 동일 패턴).
async function maybePostVoteResultNews(
    roomId: string, leagueId: string, virtualDate: string,
    rosterPayload: { east: RosterConferencePayload; west: RosterConferencePayload; risingStars: RisingStarsPayload },
    seasonLabel: string,
    keyDates: { allStarStart: string; allStarEnd: string; allStarMainGameDate: string },
): Promise<void> {
    // 멱등성 — 다른 게시 함수들과 동일한 count 조회 패턴.
    const { count: alreadyPosted } = await supabase
        .from('league_events')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId).eq('type', 'allstar_vote_result').eq('sim_date', virtualDate);
    if ((alreadyPosted ?? 0) > 0) return;

    const { error } = await supabase.from('league_events').insert({
        room_id: roomId, league_id: leagueId, type: 'allstar_vote_result',
        sim_date: virtualDate,
        payload: {
            v: 1, headline: `${seasonLabel}시즌 올스타 명단이 확정됐습니다`,
            seasonLabel, east: rosterPayload.east, west: rosterPayload.west, risingStars: rosterPayload.risingStars,
            allStarStart: keyDates.allStarStart, allStarEnd: keyDates.allStarEnd,
            mainGameDate: keyDates.allStarMainGameDate,
        },
    });
    if (error) console.error(`[allstarVote] room=${roomId} allstar_vote_result insert 실패:`, error.message);
    else console.log(`[allstarVote] room=${roomId} — 올스타 명단 확정 뉴스 게시`);
}

// [2026-09-08] 라이징스타 챌린지 명단 전용 서신 — 사용자 요청으로 allstar_vote_result와
// 별도의 뉴스 피드 아이템으로도 발송한다(같은 투표 마감일에 같이 게시, 데이터는 재계산 없이
// 그대로 재사용). 투표가 없는 성적 기준 선발이라 votes/pct 컬럼이 없다.
// [2026-09-08 추가] allStarStart/allStarEnd(올스타전 개최 기간) — 서신 본문에 "라이징스타
// 챌린지 경기 일정" 문구를 넣기 위해 추가. 실제로는 코치/단장 투표가 아니라 성적 기준
// 자동 선발이지만(runRisingStarsSelection() 참고), 뉴스 서신은 다른 올스타 서신들과 톤을
// 맞추기 위해 "리그 관계자 투표"라는 연출용 문구를 쓴다(사용자 명시적 요청) — 실제 선발
// 메커니즘과는 무관한 순수 플레이버 텍스트.
async function maybePostRisingStarsNews(
    roomId: string, leagueId: string, virtualDate: string,
    risingStars: RisingStarsPayload, seasonLabel: string,
    keyDates: { allStarStart: string; allStarEnd: string; allStarRisingStarsDate: string },
): Promise<void> {
    // 멱등성 — 다른 게시 함수들과 동일한 count 조회 패턴.
    const { count: alreadyPosted } = await supabase
        .from('league_events')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId).eq('type', 'allstar_rising_stars').eq('sim_date', virtualDate);
    if ((alreadyPosted ?? 0) > 0) return;

    const { error } = await supabase.from('league_events').insert({
        room_id: roomId, league_id: leagueId, type: 'allstar_rising_stars',
        sim_date: virtualDate,
        payload: {
            v: 1,
            headline: `${seasonLabel}시즌 라이징스타 챌린지 명단이 확정됐습니다`,
            seasonLabel, teamA: risingStars.teamA, teamB: risingStars.teamB,
            teamAName: risingStars.teamAName, teamBName: risingStars.teamBName,
            allStarStart: keyDates.allStarStart, allStarEnd: keyDates.allStarEnd,
            gameDate: keyDates.allStarRisingStarsDate,
        },
    });
    if (error) console.error(`[allstarVote] room=${roomId} allstar_rising_stars insert 실패:`, error.message);
    else console.log(`[allstarVote] room=${roomId} — 라이징스타 챌린지 명단 뉴스 게시`);
}

// ══════════════════════════════════════════════════════════════════════════
// 3점 챌린지 참가 명단 — 투표/집계와 무관한 독립 이벤트
// ══════════════════════════════════════════════════════════════════════════
// [2026-09-08] 투표 기간(allStarVoteStart~allStarVoteEnd)과 무관하게 올스타전 기간 시작일
// (allStarStart, 사용자 확인 — "올스타 기간 시작일이면 괜찮을듯")에 발표한다. 투표 마감일보다
// 뒤라 computeAndStoreAllStarVotes()의 스케줄러 트리거 창(allStarVoteStart~allStarVoteEnd) 밖에
// 있으므로 그 함수에 얹지 않고 별도 진입점으로 분리 — computeAndStoreAllStarVotes()의
// voteProgress/league_allstar_votes upsert 로직을 건드리지 않기 위한 안전한 분리(그 함수를
// 투표 마감일 이후에도 계속 돌리면 voteProgress>1인 새 스냅샷이 최신 행이 되면서 이미 저장된
// 최종 roster를 가려버리는 회귀가 생길 수 있음). 팀 구성은 buildTeamsForRoom()으로 공유.
// 호출부: scheduler.ts의 runThreePointContestNews() — keyDates.allStarThreePointContestDate를
// contestDate로 그대로 넘겨받는다(이 함수 자신은 virtualSeasonYear를 안 받으므로 직접 계산
// 안 함). contestDate는 서신 본문에 "실제 대회는 언제 열리는지" 문구를 넣기 위해 payload에
// 그대로 실어 보낸다(2026-09-08 — 사용자 요청, "3점 챌린지 서신 본문에 실행 일자도 추가").
export async function computeAndPostThreePointContestNews(
    roomId: string, leagueId: string, virtualDate: string, contestDate: string,
): Promise<void> {
    // 멱등성 — 다른 게시 함수들과 동일한 count 조회 패턴.
    const { count: alreadyPosted } = await supabase
        .from('league_events')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId).eq('type', 'allstar_three_point_contest').eq('sim_date', virtualDate);
    if ((alreadyPosted ?? 0) > 0) return;

    const built = await buildTeamsForRoom(roomId, leagueId);
    if (!built) return;
    const { teams, season } = built;
    const seed = `${roomId}_${season}_threept`;

    const participants = runThreePointContestSelection(teams, seed);
    if (participants.length === 0) {
        console.log(`[allstarVote] room=${roomId} — 3점 챌린지 후보(41경기 이상)가 없어 발표 생략`);
        return;
    }

    const { error } = await supabase.from('league_events').insert({
        room_id: roomId, league_id: leagueId, type: 'allstar_three_point_contest',
        sim_date: virtualDate,
        payload: {
            v: 1,
            headline: `${season}시즌 3점 챌린지 참가자 명단이 확정됐습니다`,
            seasonLabel: season,
            participants: participants.map(threePointParticipantPayload),
            contestDate,
        },
    });
    if (error) console.error(`[allstarVote] room=${roomId} allstar_three_point_contest insert 실패:`, error.message);
    else console.log(`[allstarVote] room=${roomId} — 3점 챌린지 참가자 명단 뉴스 게시`);
}

function threePointParticipantPayload(p: ThreePointContestParticipant) {
    return {
        playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamId,
        position: p.position, ovr: p.ovr, threePointRating: p.threePointRating,
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 덩크 컨테스트 참가 명단 — 투표/집계와 무관한 독립 이벤트
// ══════════════════════════════════════════════════════════════════════════
// [2026-09-08] "덩크 콘테스트 참가자 명단 선정도 서신 보내줘" — 3점 챌린지
// (computeAndPostThreePointContestNews)와 완전히 동일한 구조. 참가 명단 발표일도 3점
// 챌린지와 동일하게 allStarStart로 맞춤(3점 챌린지 때 사용자가 "올스타 기간 시작일이면
// 괜찮을듯"이라고 확정했던 기준을 그대로 재사용).
// [2026-09-09 추가] contestDate(allStarDunkContestDate — 3점 챌린지와 같은 "토요일 나이트"
// 라 allStarThreePointContestDate와 동일한 allStarStart+2일) — 서신 본문에 "실제 대회는
// 언제 열리는지" 문구를 넣기 위해 추가(3점 챌린지 때와 동일 요청 패턴, "덩크 컨테스트
// 서신에도 덩크 컨테스트 일자를 알려주는 문구를 추가해줘").
// 팀 구성은 buildTeamsForRoom()으로 공유. 호출부: scheduler.ts의 runDunkContestNews().
export async function computeAndPostDunkContestNews(
    roomId: string, leagueId: string, virtualDate: string, contestDate: string,
): Promise<void> {
    // 멱등성 — 다른 게시 함수들과 동일한 count 조회 패턴.
    const { count: alreadyPosted } = await supabase
        .from('league_events')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId).eq('type', 'allstar_dunk_contest').eq('sim_date', virtualDate);
    if ((alreadyPosted ?? 0) > 0) return;

    const built = await buildTeamsForRoom(roomId, leagueId);
    if (!built) return;
    const { teams, season } = built;
    const seed = `${roomId}_${season}_dunk`;

    const participants = runDunkContestSelection(teams, seed);
    if (participants.length === 0) {
        console.log(`[allstarVote] room=${roomId} — 덩크 컨테스트 후보(41경기 이상)가 없어 발표 생략`);
        return;
    }

    const { error } = await supabase.from('league_events').insert({
        room_id: roomId, league_id: leagueId, type: 'allstar_dunk_contest',
        sim_date: virtualDate,
        payload: {
            v: 1,
            headline: `${season}시즌 덩크 컨테스트 참가자 명단이 확정됐습니다`,
            seasonLabel: season,
            participants: participants.map(dunkParticipantPayload),
            contestDate,
        },
    });
    if (error) console.error(`[allstarVote] room=${roomId} allstar_dunk_contest insert 실패:`, error.message);
    else console.log(`[allstarVote] room=${roomId} — 덩크 컨테스트 참가자 명단 뉴스 게시`);
}

function dunkParticipantPayload(p: DunkContestParticipant) {
    return {
        playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamId,
        position: p.position, ovr: p.ovr, dunkRating: p.dunkRating,
    };
}

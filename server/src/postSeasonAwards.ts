/**
 * postSeasonAwards.ts — 정규시즌 종료 1일 후 MVP/DPOY/올-오펜시브/올-디펜시브를 선정해
 * league_player_awards에 영구 저장하고 league_events에 뉴스 4건(mvp_award/dpoy_award/
 * all_nba_team/all_def_team)으로 게시한다.
 *
 * 호출부: scheduler.ts의 runScheduledSeasonAwards() — leagues.regular_season_ended_at
 * (checkSeasonCompletions()가 정규시즌 완료 감지 시 1회 스탬프) + 1일이 지난 리그를 찾아
 * 호출한다.
 *
 * 계산 로직 자체(runAwardVoting)는 server/src/shared/multi/awardVoting.ts(utils/awardVoting.ts의
 * 미러)를 그대로 사용. 시드는 MultiPlayerDetailView.tsx가 클라이언트에서 즉석 재계산할 때
 * 쓰는 것과 완전히 동일한 문자열(`${roomId}_${season}_awards`)을 써서, 이 파이프라인이
 * 서버에 영구 저장하는 결과와 그 화면이 보여주는 결과가 항상 일치하도록 맞춘다.
 *
 * 서버 전용 — 클라이언트 미러 없음(DB 조회+insert 오케스트레이션이라 클라에 대응물이 없음),
 * postPowerRankingNews.ts와 동일한 구조.
 */
import { supabase } from './supabaseAdmin';
import { mapRawPlayerToRuntimePlayer } from './shared/dataMapper.ts';
import { runAwardVoting, type AwardRankEntry, type AllTeamEntry } from './shared/multi/awardVoting.ts';
import type { Team, Player, PlayerStats, PlayerAwardType } from './shared/types.ts';

function zeroStats(): PlayerStats {
    return {
        g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0,
        tov: 0, pf: 0, techFouls: 0, flagrantFouls: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0,
        ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, plusMinus: 0,
        contestedAttempted: 0, contestedMade: 0,
    };
}

/** MVP/DPOY 랭킹 엔트리 → league_player_awards insert row(들). rank는 1-based(순위표 인덱스+1). */
function rankingToRows(
    ranking: AwardRankEntry[], type: PlayerAwardType,
    roomId: string, leagueId: string, seasonNumber: number,
) {
    return ranking.map((r, idx) => ({
        room_id: roomId, league_id: leagueId, season_number: seasonNumber,
        player_id: r.playerId, team_slug: r.teamId, award_type: type, rank: idx + 1,
    }));
}

/** 올-오펜시브/올-디펜시브 티어 엔트리 → league_player_awards insert row(들). 순위 개념 없음(rank=0). */
function allTeamToRows(
    tiers: AllTeamEntry[], typeByTier: Record<number, PlayerAwardType>,
    roomId: string, leagueId: string, seasonNumber: number,
) {
    const rows: any[] = [];
    for (const tier of tiers) {
        const type = typeByTier[tier.tier];
        if (!type) continue;
        for (const p of tier.players) {
            rows.push({
                room_id: roomId, league_id: leagueId, season_number: seasonNumber,
                player_id: p.playerId, team_slug: p.teamId, award_type: type, rank: 0,
            });
        }
    }
    return rows;
}

export async function computeAndPostSeasonAwards(roomId: string, leagueId: string): Promise<void> {
    const { data: room } = await supabase
        .from('rooms').select('id, season, season_number, sim_date').eq('id', roomId).maybeSingle();
    if (!room) {
        console.error(`[seasonAwards] room=${roomId} 조회 실패`);
        return;
    }

    const { data: leagueTeams, error: teamsErr } = await supabase
        .from('league_teams').select('team_slug, team_name, roster').eq('room_id', roomId);
    if (teamsErr || !leagueTeams?.length) {
        console.error(`[seasonAwards] room=${roomId} league_teams 조회 실패:`, teamsErr?.message);
        return;
    }

    const allPlayerIds = Array.from(new Set(leagueTeams.flatMap((t: any) => t.roster ?? [])));
    if (allPlayerIds.length === 0) return;

    const [playersRes, gamesRes, statsRes] = await Promise.all([
        supabase.from('meta_players').select('id, name, position, base_attributes').in('id', allPlayerIds),
        supabase.from('games')
            .select('home_team_id, away_team_id, home_score, away_score')
            .eq('league_id', leagueId).eq('is_playoff', false).eq('played', true),
        supabase.rpc('get_league_season_awards_stats', { p_room_id: roomId }),
    ]);
    if (playersRes.error || gamesRes.error || statsRes.error) {
        console.error(
            `[seasonAwards] room=${roomId} 데이터 조회 실패:`,
            playersRes.error?.message, gamesRes.error?.message, statsRes.error?.message,
        );
        return;
    }

    const playerMap = new Map<string, Player>(
        (playersRes.data ?? []).map((r: any) => [String(r.id), mapRawPlayerToRuntimePlayer(r, false)]),
    );
    const statsByPlayer = new Map<string, any>(
        (statsRes.data ?? []).map((r: any) => [String(r.player_id), r]),
    );

    // 팀별 정규시즌 승패 — computeStandingsByConference(playoffSeeder.ts)와 동일 원리(games 테이블
    // 직접 집계), 컨퍼런스 분리는 어워드 스코어링에 불필요해 생략.
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
                    g: s.g, gs: Number(s.gs), mp: Number(s.mp), pts: Number(s.pts), reb: Number(s.reb),
                    offReb: Number(s.off_reb), defReb: Number(s.def_reb), ast: Number(s.ast),
                    stl: Number(s.stl), blk: Number(s.blk), tov: Number(s.tov), pf: Number(s.pf),
                    fgm: Number(s.fgm), fga: Number(s.fga), p3m: Number(s.p3m), p3a: Number(s.p3a),
                    ftm: Number(s.ftm), fta: Number(s.fta),
                    contestedAttempted: Number(s.contested_attempted), contestedMade: Number(s.contested_made),
                } : zeroStats();
                return { ...base, stats } as Player;
            })
            .filter((p): p is Player => !!p);
        return {
            id: lt.team_slug, name: lt.team_name, city: '', logo: '',
            conference: 'East', division: '',
            wins: rec.wins, losses: rec.losses, budget: 0, salaryCap: 0, luxuryTaxLine: 0,
            roster,
        };
    });

    const season = (room as any).season ?? '2025-26';
    const seed = `${roomId}_${season}_awards`;
    const content = runAwardVoting(teams, seed);

    if (content.mvpRanking.length === 0) {
        console.log(`[seasonAwards] room=${roomId} — 자격(41경기 이상) 후보가 없어 어워드 생략`);
        return;
    }

    const seasonNumber = (room as any).season_number ?? 1;

    const awardRows = [
        ...rankingToRows(content.mvpRanking, 'MVP', roomId, leagueId, seasonNumber),
        ...rankingToRows(content.dpoyRanking, 'DPOY', roomId, leagueId, seasonNumber),
        ...allTeamToRows(content.allNbaTeams, { 1: 'ALL_NBA_1', 2: 'ALL_NBA_2', 3: 'ALL_NBA_3' }, roomId, leagueId, seasonNumber),
        ...allTeamToRows(content.allDefTeams, { 1: 'ALL_DEF_1', 2: 'ALL_DEF_2' }, roomId, leagueId, seasonNumber),
    ];

    const { error: awardsInsertErr } = await supabase
        .from('league_player_awards')
        .upsert(awardRows, { onConflict: 'room_id,season_number,player_id,award_type,rank', ignoreDuplicates: true });
    if (awardsInsertErr) {
        console.error(`[seasonAwards] room=${roomId} league_player_awards insert 실패:`, awardsInsertErr.message);
        return;
    }

    const simDate = (room as any).sim_date ?? null;

    // MVP 순위별 득표수(1~5위) — components/inbox/AwardsReportViewer.tsx의 mvpVoteBreakdown과
    // 동일한 집계(싱글플레이어는 SeasonAwardsContent.ballots를 클라에서 즉석 집계하지만, 여기선
    // ballots 자체를 league_events에 저장하지 않으므로 발표 시점에 미리 계산해 payload에 박아둔다).
    const mvpVoteBreakdown = new Map<string, number[]>();
    for (const b of content.ballots) {
        for (let i = 0; i < b.mvp.length && i < 5; i++) {
            const pid = b.mvp[i];
            if (!mvpVoteBreakdown.has(pid)) mvpVoteBreakdown.set(pid, [0, 0, 0, 0, 0]);
            mvpVoteBreakdown.get(pid)![i]++;
        }
    }
    // DPOY 순위별 득표수(1~3위) — 위 mvpVoteBreakdown과 동일 원리, topN=3만 다름.
    const dpoyVoteBreakdown = new Map<string, number[]>();
    for (const b of content.ballots) {
        for (let i = 0; i < b.dpoy.length && i < 3; i++) {
            const pid = b.dpoy[i];
            if (!dpoyVoteBreakdown.has(pid)) dpoyVoteBreakdown.set(pid, [0, 0, 0]);
            dpoyVoteBreakdown.get(pid)![i]++;
        }
    }

    type EventInsert = {
        type: string; team_ids: string[]; player_ids: string[]; score: number; payload: Record<string, unknown>;
    };
    const events: EventInsert[] = [];

    const mvp = content.mvpRanking[0];
    if (mvp) {
        events.push({
            type: 'mvp_award',
            team_ids: [...new Set(content.mvpRanking.map(r => r.teamId))],
            player_ids: content.mvpRanking.map(r => r.playerId),
            score: 30,
            payload: {
                v: 1,
                headline: `${season} 정규시즌 올해의 선수`,
                season,
                ranking: content.mvpRanking.map(r => ({
                    playerId: r.playerId, playerName: r.playerName, teamSlug: r.teamId, position: r.position,
                    points: r.points, firstPlaceVotes: r.firstPlaceVotes,
                    rankVotes: mvpVoteBreakdown.get(r.playerId) ?? [0, 0, 0, 0, 0],
                    ppg: r.statLine.ppg, rpg: r.statLine.rpg, apg: r.statLine.apg,
                    spg: r.statLine.spg, bpg: r.statLine.bpg,
                    fgPct: r.statLine.fgPct, p3Pct: r.statLine.p3Pct, ftPct: r.statLine.ftPct,
                })),
            },
        });
    }

    const dpoy = content.dpoyRanking[0];
    if (dpoy) {
        events.push({
            type: 'dpoy_award',
            team_ids: [...new Set(content.dpoyRanking.map(r => r.teamId))],
            player_ids: content.dpoyRanking.map(r => r.playerId),
            score: 25,
            payload: {
                v: 1,
                headline: `${season} 정규시즌 올해의 수비수`,
                season,
                ranking: content.dpoyRanking.map(r => ({
                    playerId: r.playerId, playerName: r.playerName, teamSlug: r.teamId, position: r.position,
                    points: r.points, firstPlaceVotes: r.firstPlaceVotes,
                    rankVotes: dpoyVoteBreakdown.get(r.playerId) ?? [0, 0, 0],
                    spg: r.statLine.spg, bpg: r.statLine.bpg, drebpg: r.statLine.drebpg,
                    orebpg: r.statLine.orebpg, dfgPct: r.statLine.dfgPct,
                })),
            },
        });
    }

    if (content.allNbaTeams.length > 0) {
        events.push({
            type: 'all_nba_team',
            team_ids: [...new Set(content.allNbaTeams.flatMap(t => t.players.map(p => p.teamId)))],
            player_ids: content.allNbaTeams.flatMap(t => t.players.map(p => p.playerId)),
            score: 20,
            payload: {
                v: 1,
                headline: `${season} 올-오펜시브 팀 발표`,
                season,
                tiers: content.allNbaTeams.map(t => ({
                    tier: t.tier,
                    players: t.players.map(p => ({
                        playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamId, pos: p.pos,
                        ppg: p.statLine.ppg, rpg: p.statLine.rpg, apg: p.statLine.apg,
                        g: p.statLine.gamesPlayed, gs: p.statLine.gamesStarted, mpg: p.statLine.mpg,
                        spg: p.statLine.spg, bpg: p.statLine.bpg, tovpg: p.statLine.tovpg,
                        fgPct: p.statLine.fgPct, p3Pct: p.statLine.p3Pct, ftPct: p.statLine.ftPct,
                    })),
                })),
            },
        });
    }

    if (content.allDefTeams.length > 0) {
        events.push({
            type: 'all_def_team',
            team_ids: [...new Set(content.allDefTeams.flatMap(t => t.players.map(p => p.teamId)))],
            player_ids: content.allDefTeams.flatMap(t => t.players.map(p => p.playerId)),
            score: 20,
            payload: {
                v: 1,
                headline: `${season} 올-디펜시브 팀 발표`,
                season,
                tiers: content.allDefTeams.map(t => ({
                    tier: t.tier,
                    players: t.players.map(p => ({
                        playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamId, pos: p.pos,
                        spg: p.statLine.spg, bpg: p.statLine.bpg,
                        g: p.statLine.gamesPlayed, gs: p.statLine.gamesStarted, mpg: p.statLine.mpg,
                        orebpg: p.statLine.orebpg, drebpg: p.statLine.drebpg, dfgPct: p.statLine.dfgPct,
                        pfpg: p.statLine.pfpg, tovpg: p.statLine.tovpg,
                    })),
                })),
            },
        });
    }

    const { error: eventsInsertErr } = await supabase.from('league_events').insert(
        events.map(e => ({
            room_id: roomId, league_id: leagueId, season_number: seasonNumber,
            game_id: null, sim_date: simDate,
            type: e.type, team_ids: e.team_ids, player_ids: e.player_ids, score: e.score, payload: e.payload,
        })),
    );
    if (eventsInsertErr) {
        console.error(`[seasonAwards] room=${roomId} league_events insert 실패:`, eventsInsertErr.message);
        return;
    }

    console.log(`[seasonAwards] room=${roomId} 시즌 어워드 게시 완료 (MVP: ${mvp?.playerName ?? '-'})`);
}

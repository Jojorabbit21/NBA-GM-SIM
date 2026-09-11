/**
 * leagueSeasonArchiver.ts — main_league 시즌 종료 시 유저별 기록을 league_user_history에 남긴다.
 *
 * [2026-09-10] 신설. league_user_history 테이블 자체는 승강제 구현 당시부터 존재했지만
 * 시즌 종료 시 값을 채우는 아카이버가 없어 항상 0행이었다(MultiplayerHistory.tsx의
 * "리그" 섹션이 늘 0으로 표시되던 이유). tournamentArchiver.ts의 archiveTournament()는
 * main_league 플레이오프 브라켓도 동일 경로로 처리하므로, 그 호출부에서 이 함수를 함께
 * 호출해 정규시즌/플레이오프 승패와 최종 순위를 기록한다.
 *
 * 순위(final_rank) 산정:
 *   - 플레이오프 진출 팀 → tournamentArchiver의 computePlacements() 결과(champion=1, ...)
 *   - 미진출 팀 → 정규시즌 성적(승-패, 동률 시 득실차)으로 이어서 순위 부여
 *     (playoffSeeder.ts의 computeStandingsByConference()를 그대로 재사용 — 시딩 때 쓰는
 *      순위 기준과 이력 화면의 순위 기준을 일치시킨다)
 */
import { createClient } from '@supabase/supabase-js';
import { computeStandingsByConference } from './playoffSeeder.ts';

type SupabaseClient = ReturnType<typeof createClient>;

interface TeamInput {
    team_slug: string;
    team_name: string;
    user_id:   string | null;
}

interface PlacementInfo {
    placement:  number;
    finalRound: number;
}

export interface ArchiveLeagueSeasonParams {
    leagueId:     string;
    roomId:       string;
    groupId:      string;
    tier:         string;
    seasonNumber: number;
    leagueName:   string;
    completedAt:  string;
    teams:        TeamInput[];
    /** tournamentArchiver.computePlacements()의 결과 — 플레이오프 진출 팀만 키를 가짐 */
    placements:   Map<string, PlacementInfo>;
    championSlug: string | null;
    runnerUpSlug: string | null;
}

/** main_league 시즌 1회분을 league_user_history에 기록한다. AI 팀(user_id=null)은 제외.
 *  (group_id, user_id, season_number) 유니크 제약을 이용해 재시도 시 중복 삽입되지 않게 한다. */
export async function archiveLeagueSeason(
    supabase: SupabaseClient,
    params:   ArchiveLeagueSeasonParams,
): Promise<{ error: string | null }> {
    const {
        leagueId, roomId, groupId, tier, seasonNumber, leagueName, completedAt,
        teams, placements, championSlug, runnerUpSlug,
    } = params;

    // 1. 플레이오프 승패 — games 테이블에서 is_playoff=true인 완료 경기만 집계
    const { data: playoffGames, error: pgErr } = await supabase
        .from('games')
        .select('home_team_id, away_team_id, home_score, away_score')
        .eq('league_id', leagueId)
        .eq('is_playoff', true)
        .eq('played', true);
    if (pgErr) return { error: pgErr.message };

    const playoffWins   = new Map<string, number>();
    const playoffLosses = new Map<string, number>();
    for (const g of playoffGames ?? []) {
        const homeWon = (g.home_score ?? 0) > (g.away_score ?? 0);
        const home = g.home_team_id as string, away = g.away_team_id as string;
        playoffWins.set(home,   (playoffWins.get(home)   ?? 0) + (homeWon ? 1 : 0));
        playoffLosses.set(home, (playoffLosses.get(home) ?? 0) + (homeWon ? 0 : 1));
        playoffWins.set(away,   (playoffWins.get(away)   ?? 0) + (homeWon ? 0 : 1));
        playoffLosses.set(away, (playoffLosses.get(away) ?? 0) + (homeWon ? 1 : 0));
    }

    // 2. 정규시즌 승패 — 플레이오프 시딩과 동일한 함수 재사용
    const standings = await computeStandingsByConference(leagueId, roomId);
    const regSeason = new Map<string, { wins: number; losses: number; pointDiff: number }>();
    for (const row of [...standings.East, ...standings.West]) {
        regSeason.set(row.team_slug, { wins: row.wins, losses: row.losses, pointDiff: row.pointDiff });
    }

    // 3. 미진출 팀 순위 — 정규시즌 성적(승-패 내림차순, 동률 시 득실차)으로 플레이오프 진출팀 수 다음부터 이어서 매김
    const nonPlayoffSlugs = teams
        .map(t => t.team_slug)
        .filter(slug => !placements.has(slug));
    const rankedNonPlayoff = [...nonPlayoffSlugs].sort((a, b) => {
        const ra = regSeason.get(a) ?? { wins: 0, losses: 0, pointDiff: 0 };
        const rb = regSeason.get(b) ?? { wins: 0, losses: 0, pointDiff: 0 };
        return (rb.wins - rb.losses) - (ra.wins - ra.losses) || rb.pointDiff - ra.pointDiff;
    });
    const nonPlayoffRank = new Map<string, number>();
    rankedNonPlayoff.forEach((slug, i) => nonPlayoffRank.set(slug, placements.size + i + 1));

    // 4. 유저 팀만 골라 행 생성 (AI 제외)
    const rows = teams
        .filter(t => !!t.user_id)
        .map(t => {
            const p        = placements.get(t.team_slug);
            const reg       = regSeason.get(t.team_slug) ?? { wins: 0, losses: 0, pointDiff: 0 };
            const finalRank = p?.placement ?? nonPlayoffRank.get(t.team_slug) ?? teams.length;

            const playoffResult =
                t.team_slug === championSlug ? 'champion' :
                t.team_slug === runnerUpSlug  ? 'runner_up' :
                p                              ? 'eliminated' :
                                                 'missed_playoffs';

            return {
                group_id:       groupId,
                user_id:        t.user_id as string,
                season_number:  seasonNumber,
                tier,
                team_id:        t.team_slug,
                wins:           reg.wins,
                losses:         reg.losses,
                final_rank:     finalRank,
                playoff_result: playoffResult,
                roster_snapshot: [], // TODO: 로스터 스냅샷은 아직 미구현 — 필요 시 team_slug로 별도 조회해 채울 것
                league_id:       leagueId,
                league_name:     leagueName,
                team_count:      teams.length,
                playoff_wins:    playoffWins.get(t.team_slug)   ?? 0,
                playoff_losses:  playoffLosses.get(t.team_slug) ?? 0,
                completed_at:    completedAt,
            };
        });

    if (rows.length === 0) return { error: null };

    // (group_id, user_id, season_number) 유니크 제약 → archiveTournament 재시도로 두 번 불려도 중복 삽입 안 됨
    const { error: upsertErr } = await supabase
        .from('league_user_history')
        .upsert(rows, { onConflict: 'group_id,user_id,season_number', ignoreDuplicates: true });
    if (upsertErr) return { error: upsertErr.message };

    console.log(`[archiveLeagueSeason] league=${leagueId} season=${seasonNumber} rows=${rows.length}`);
    return { error: null };
}

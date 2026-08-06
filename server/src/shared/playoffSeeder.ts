/**
 * playoffSeeder.ts — 메인리그 정규시즌 종료 시 상위 N팀으로 플레이오프 브라켓을 생성한다.
 *
 * 스탠딩 계산 → 표준 브라켓 시드 순서로 재배열 → 기존 토너먼트 엔진
 * (initializeTournamentBracket, seedMode='ranked')에 그대로 위임한다. 이후 진행(경기
 * 시뮬레이션/시리즈 전진/완료 판정/아카이브)은 series_id가 채워진 games 행에 대해 기존
 * simRunner.ts/scheduler.ts가 league.type을 전혀 안 가리고 처리하므로 무수정으로 그대로
 * 작동한다(games 테이블 마이그레이션 때 확인됨).
 *
 * 현재 playoff_team_count 기본값(8)처럼 2의 거듭제곱일 때만 시드가 정확하다 —
 * initSingleElim()의 부전승(bye) 배치가 원래 순서 뒤쪽에 단순히 채워 넣는 방식이라
 * 2의 거듭제곱이 아닌 인원수는 시드가 정확한 상위 배정이 아닐 수 있다(기존 토너먼트
 * 엔진의 기존 한계 — 이번 범위에서 별도로 고치지 않음).
 */
import { supabase } from '../supabaseAdmin';
import { initializeTournamentBracket, type LeagueTeamRow } from './tournamentInitializer';
import { insertGames, insertGameShortCodes } from '../finalize';
import { kstMidnightPlusDays } from './kst';

interface StandingRow {
    team_slug: string;
    wins: number;
    losses: number;
    pointDiff: number;
}

async function computeStandings(leagueId: string): Promise<StandingRow[]> {
    const { data: games } = await supabase
        .from('games')
        .select('home_team_id, away_team_id, home_score, away_score')
        .eq('league_id', leagueId).eq('is_playoff', false).eq('played', true);

    const table = new Map<string, StandingRow>();
    const row = (slug: string): StandingRow => {
        let r = table.get(slug);
        if (!r) { r = { team_slug: slug, wins: 0, losses: 0, pointDiff: 0 }; table.set(slug, r); }
        return r;
    };
    for (const g of games ?? []) {
        const home = row(g.home_team_id);
        const away = row(g.away_team_id);
        const diff = (g.home_score ?? 0) - (g.away_score ?? 0);
        home.pointDiff += diff;
        away.pointDiff -= diff;
        if (diff > 0) { home.wins++; away.losses++; }
        else          { away.wins++; home.losses++; }
    }
    // 승률(승-패) 내림차순, 동률 시 득실차 — 승/패 수가 다를 수 있으므로 승률로 비교.
    return [...table.values()].sort((a, b) =>
        (b.wins - b.losses) - (a.wins - a.losses) || b.pointDiff - a.pointDiff,
    );
}

/** 표준 브라켓 시드 순서(1-indexed, size는 2의 거듭제곱). 8강 예시: [1,8,4,5,2,7,3,6]. */
function bracketSeedOrder(size: number): number[] {
    let order = [1];
    while (order.length < size) {
        const total = order.length * 2 + 1;
        const next: number[] = [];
        for (const s of order) next.push(s, total - s);
        order = next;
    }
    return order;
}

interface PlayoffLeagueRow {
    id: string;
    match_format: string | null;
    finals_match_format: string | null;
    games_per_real_day: number | null;
    playoff_team_count: number | null;
}

export async function startPlayoffs(league: PlayoffLeagueRow, roomId: string): Promise<void> {
    const standings = await computeStandings(league.id);
    const n = league.playoff_team_count ?? 8;
    const qualified = standings.slice(0, n);
    if (qualified.length < 2) {
        console.warn(`[playoffSeeder] league=${league.id} — qualified teams(${qualified.length}) < 2, skip`);
        return;
    }

    const { data: teamRows } = await supabase.from('league_teams').select('*').eq('room_id', roomId);
    const bySlug = new Map((teamRows ?? []).map((t: any) => [t.team_slug, t]));

    const order = bracketSeedOrder(qualified.length);
    const seededTeams = order
        .map(seed => qualified[seed - 1])
        .filter(Boolean)
        .map(s => bySlug.get(s.team_slug))
        .filter(Boolean) as LeagueTeamRow[];

    if (seededTeams.length < 2) {
        console.warn(`[playoffSeeder] league=${league.id} — resolved team rows < 2, skip`);
        return;
    }

    // 정규시즌 마지막 경기 다음날부터 시작.
    const playoffStart    = kstMidnightPlusDays(new Date().toISOString(), 1);
    const playoffStartIso = playoffStart.toISOString();
    const gamesPerRealDay = league.games_per_real_day ?? 48;
    const intervalMinutes = 1440 / gamesPerRealDay;

    const result = initializeTournamentBracket(
        seededTeams,
        'single_elim',
        league.match_format ?? 'best_of_7',
        league.finals_match_format ?? league.match_format ?? 'best_of_7',
        `${league.id}-playoffs`,
        playoffStartIso.slice(0, 10),
        intervalMinutes,
        playoffStartIso,
        'ranked',
    );

    const { error: gamesErr } = await insertGames(roomId, league.id, result.schedule as any);
    if (gamesErr) {
        console.error(`[playoffSeeder] insertGames failed(${league.id}): ${gamesErr}`);
        return;
    }
    await insertGameShortCodes(roomId, result.schedule.map(g => ({ id: g.id }))).catch(err =>
        console.error(`[playoffSeeder] insertGameShortCodes 실패(${roomId}):`, err),
    );

    await supabase.from('leagues').update({ bracket_data: { series: result.series } }).eq('id', league.id);

    console.log(`[playoffSeeder] league=${league.id} — playoffs started with ${seededTeams.length} teams (${result.schedule.length} games)`);
}

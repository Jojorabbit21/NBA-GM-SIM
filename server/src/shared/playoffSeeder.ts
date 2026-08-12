/**
 * playoffSeeder.ts — 메인리그 정규시즌 종료 시 컨퍼런스별 상위 N팀으로 플레이오프 브라켓을 생성한다.
 *
 * [2026-08-10] 컨퍼런스별 분리 지원: playoff_team_count는 이제 "컨퍼런스별" 진출 팀 수를
 * 의미한다(과거엔 리그 전체 top-N이었음). 동부/서부를 각각 표준 브라켓 시드로 정렬한 뒤
 * 동부 팀들을 앞쪽 N슬롯, 서부 팀들을 뒤쪽 N슬롯에 배치해서 initializeTournamentBracket에
 * 그대로 넘긴다 — 단일 전체 브라켓 엔진(tournamentInitializer.ts, 무수정)의 매치인덱스/2 트리
 * 구조가 2N팀일 때 앞 N슬롯/뒤 N슬롯을 각각 독립된 서브트리로 만들어 결승 라운드에서만
 * 만나게 되므로("동부 vs 서부" 컨퍼런스 파이널 구조), 엔진 자체는 전혀 수정하지 않고도
 * 컨퍼런스 브라켓을 재현할 수 있다. 단 2N이 2의 거듭제곱이 아니면(예: N=6이면 2N=12) 기존
 * 엔진의 부전승 배치가 배열 맨 뒤부터 채워지는 방식이라 컨퍼런스 경계를 넘어 부전승이
 * 배정될 수 있다(기존에도 문서화되어 있던 비-2^n 인원수의 시드 부정확 한계와 동일선상).
 *
 * 플레이인이 활성화된 리그(league.play_in_enabled)는 이 파일을 직접 쓰지 않고
 * playInSeeder.ts의 startPlayIn()이 먼저 실행되며, 플레이인이 모두 끝난 뒤
 * buildAndStoreConferenceBracket()을 재사용해 본선 브라켓을 생성한다 — 분기는
 * scheduler.ts의 startPostseason()이 담당한다.
 *
 * 이후 진행(경기 시뮬레이션/시리즈 전진/완료 판정/아카이브)은 series_id가 채워진 games 행에
 * 대해 기존 simRunner.ts/scheduler.ts가 league.type을 전혀 안 가리고 처리하므로 무수정으로
 * 그대로 작동한다(games 테이블 마이그레이션 때 확인됨).
 */
import { supabase } from '../supabaseAdmin';
import { initializeTournamentBracket, type LeagueTeamRow } from './tournamentInitializer';
import { insertGames, insertGameShortCodes } from '../finalize';
import { kstMidnightPlusDays } from './kst';

export interface StandingRow {
    team_slug: string;
    conference: string | null;
    wins: number;
    losses: number;
    pointDiff: number;
}

/** 컨퍼런스별로 나뉜 정규시즌 스탠딩(승률 내림차순, 동률 시 득실차). is_playoff=false 경기만 집계. */
export async function computeStandingsByConference(
    leagueId: string, roomId: string,
): Promise<{ East: StandingRow[]; West: StandingRow[] }> {
    const { data: games } = await supabase
        .from('games')
        .select('home_team_id, away_team_id, home_score, away_score')
        .eq('league_id', leagueId).eq('is_playoff', false).eq('played', true);

    const { data: teamRows } = await supabase
        .from('league_teams').select('team_slug, conference').eq('room_id', roomId);
    const confBySlug = new Map((teamRows ?? []).map((t: any) => [t.team_slug as string, t.conference as string | null]));

    const table = new Map<string, StandingRow>();
    const row = (slug: string): StandingRow => {
        let r = table.get(slug);
        if (!r) {
            r = { team_slug: slug, conference: confBySlug.get(slug) ?? null, wins: 0, losses: 0, pointDiff: 0 };
            table.set(slug, r);
        }
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
    // 정규시즌 경기가 아직 하나도 없는(0승0패) 팀도 순위표엔 포함되도록 전체 팀을 미리 시드.
    for (const slug of confBySlug.keys()) row(slug);

    const sorter = (a: StandingRow, b: StandingRow) =>
        (b.wins - b.losses) - (a.wins - a.losses) || b.pointDiff - a.pointDiff;
    const all = [...table.values()];
    return {
        East: all.filter(r => r.conference === 'East').sort(sorter),
        West: all.filter(r => r.conference === 'West').sort(sorter),
    };
}

/** 표준 브라켓 시드 순서(1-indexed, size는 2의 거듭제곱). 8강 예시: [1,8,4,5,2,7,3,6]. */
export function bracketSeedOrder(size: number): number[] {
    let order = [1];
    while (order.length < size) {
        const total = order.length * 2 + 1;
        const next: number[] = [];
        for (const s of order) next.push(s, total - s);
        order = next;
    }
    return order;
}

export interface PostseasonLeagueRow {
    id: string;
    match_format: string | null;
    finals_match_format: string | null;
    games_per_real_day: number | null;
    playoff_team_count: number | null;
}

/**
 * qualified 팀(컨퍼런스당 N팀, 이미 순위순 정렬됨) 두 그룹을 East+West로 합쳐 브라켓을 생성해
 * leagues.bracket_data에 저장한다. startPlayoffs(플레이인 없음)와 playInSeeder.ts(플레이인
 * 종료 후)가 공유하는 핵심 로직.
 *
 * priorSeries — 호출자가 들고 있는 현재 bracket_data.series 배열(레퍼런스). 플레이인을 거쳐온
 * 경우 이미 완료된 플레이인 시리즈(round:0)가 들어있는 그 배열을 그대로 넘기면, 여기서 새로
 * 생성한 본선 시리즈를 그 배열에 직접 push하고 단일 update로 저장한다 — 별도 재조회
 * read-modify-write를 하지 않으므로, 호출자가 이 함수 호출 직후 같은 배열 레퍼런스로 다시
 * bracket_data를 저장하더라도(simRunner.ts의 handleTournamentAdvance처럼) 방금 여기서 쓴
 * 내용을 덮어쓰는 게 아니라 정확히 같은 최신 상태를 한 번 더 쓰는 것이 되어 안전하다.
 */
export async function buildAndStoreConferenceBracket(
    league: PostseasonLeagueRow, roomId: string,
    eastQualified: StandingRow[], westQualified: StandingRow[],
    priorSeries: unknown[] = [],
): Promise<void> {
    if (eastQualified.length < 1 && westQualified.length < 1) {
        console.warn(`[playoffSeeder] league=${league.id} — 진출팀 없음(E=${eastQualified.length}, W=${westQualified.length}), skip`);
        return;
    }

    const { data: teamRows } = await supabase.from('league_teams').select('*').eq('room_id', roomId);
    const bySlug = new Map((teamRows ?? []).map((t: any) => [t.team_slug, t]));

    const seedGroup = (group: StandingRow[]): LeagueTeamRow[] => {
        const order = bracketSeedOrder(group.length);
        return order
            .map(seed => group[seed - 1])
            .filter(Boolean)
            .map(s => bySlug.get(s.team_slug))
            .filter(Boolean) as LeagueTeamRow[];
    };

    const seededTeams = [...seedGroup(eastQualified), ...seedGroup(westQualified)];
    if (seededTeams.length < 2) {
        console.warn(`[playoffSeeder] league=${league.id} — resolved team rows < 2, skip`);
        return;
    }

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

    // priorSeries(호출자의 배열 레퍼런스)에 새 본선 시리즈를 직접 push — 재조회 없이 호출자가
    // 들고 있던 최신 상태(플레이인 결과 등) 그대로에 이어 붙인다. 자세한 이유는 위 함수 설명 참조.
    priorSeries.push(...result.series);
    await supabase.from('leagues')
        .update({ bracket_data: { series: priorSeries } })
        .eq('id', league.id);

    console.log(`[playoffSeeder] league=${league.id} — playoffs started (E=${eastQualified.length} W=${westQualified.length}, ${seededTeams.length} teams, ${result.schedule.length} games)`);
}

/** 플레이인 없이 정규시즌 종료 즉시 컨퍼런스별 top-N으로 브라켓 생성. */
export async function startPlayoffs(league: PostseasonLeagueRow, roomId: string): Promise<void> {
    const { East, West } = await computeStandingsByConference(league.id, roomId);
    const n = Math.max(2, league.playoff_team_count ?? 8);
    await buildAndStoreConferenceBracket(league, roomId, East.slice(0, n), West.slice(0, n));
}

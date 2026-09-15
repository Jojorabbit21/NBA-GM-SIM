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

/** 플레이인 결과 대기 중인 시드(7/8위) 자리에 채워 넣는 더미 팀 로우 — team_slug만 'TBD'로
 * 의미를 갖고 나머지 필드는 사용되지 않는다(이 슬롯은 게임이 생성되지 않으므로 실제 팀
 * 정보가 필요 없음). tournamentInitializer.ts의 isPendingTeam()이 이 표식으로 감지한다. */
function makePendingTeamRow(roomId: string): LeagueTeamRow {
    return {
        id: 'pending', room_id: roomId, team_slug: 'TBD', team_name: 'TBD', team_abbr: 'TBD',
        color_primary: '#64748b', color_secondary: '#64748b', color_tertiary: '#64748b', color_text: '#ffffff',
        court_background: '#1e293b', court_paint: '#1e293b', court_line: '#334155',
        conference: null, user_id: null, is_ai: true, draft_order: null, roster: [], created_at: new Date().toISOString(),
    };
}

export interface PostseasonLeagueRow {
    id: string;
    match_format: string | null;
    finals_match_format: string | null;
    games_per_real_day: number | null;
    playoff_team_count: number | null;
    /** [2026-09-15 Fix] 포스트시즌 game_date를 가상 캘린더로 앵커링하기 위해 필요 —
     *  finalize.ts가 정규시즌 regularSeasonEnd(`${virtualSeasonYear+1}-04-13`)를 계산할 때 쓰는
     *  것과 동일한 값. 호출부(scheduler.ts checkSeasonCompletions, simRunner.ts
     *  handleTournamentAdvance)가 select에 포함시켜야 한다. */
    virtual_season_year: number | null;
}

/**
 * [2026-09-15 Fix] 포스트시즌 전체(플레이인~파이널)의 game_date를 앵커링하는 가상 캘린더
 * 기준일(day 0) — 정규시즌 가상 캘린더 종료일(finalize.ts의 regularSeasonEnd,
 * `${virtualSeasonYear+1}-04-13`) 바로 다음날로 고정한다.
 *
 * 이전 버그: playoffSeeder.ts/playInSeeder.ts가 game_date 계산에 `new Date()`(실제
 * wall-clock "오늘")를 그대로 썼다 — 플레이인/디사이더/본선이 실제로 언제 시뮬레이션
 * 완료되든 상관없이 항상 이 가상 날짜를 기준으로 계산해야, 화면에 노출되는 날짜가
 * "오늘"이 아니라 시즌 캘린더 상 올바른 날짜(4월 중순)로 보인다. 실제 방송 시각
 * (scheduledAt/simRealStartAt)은 이 함수와 무관하게 계속 `new Date()` 기반으로 남는다 —
 * "언제 실제로 시뮬레이션되는가"와 "화면에 어떤 날짜로 보이는가"는 서로 다른 축이다.
 */
export function postseasonVirtualAnchor(virtualSeasonYear: number | null | undefined): string {
    const y = virtualSeasonYear ?? (new Date().getFullYear() - 1);
    return `${y + 1}-04-14`;
}

/** 'YYYY-MM-DD' 문자열에 일수를 더한 새 'YYYY-MM-DD' — tournamentInitializer.ts의
 * offsetDate()와 동일 로직(로컬 타임존 기준 계산, DST 이슈 없음). */
export function addDaysStr(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * qualified 팀(컨퍼런스당 N팀, 이미 순위순 정렬됨) 두 그룹을 East+West로 합쳐 브라켓을 생성해
 * leagues.bracket_data에 저장한다. startPlayoffs(플레이인 없음)와 playInSeeder.ts(플레이인
 * 종료 후)가 공유하는 핵심 로직.
 *
 * priorSeries — 호출자가 들고 있는 현재 bracket_data.series 배열(레퍼런스). 플레이인을 거쳐온
 * 경우 이미 완료된 플레이인 시리즈(round:0)가 들어있는 그 배열을 그대로 넘기면, 여기서 새로
 * 생성한 본선 시리즈를 그 배열에 직접 push한다.
 *
 * [2026-09-15 Fix] persist=false로 호출하면(handlePlayInAdvance()의 "하위호환" 레거시 경로 —
 * simRunner.ts의 handleTournamentAdvance() 재시도 루프 안에서 중첩 호출됨) 이 함수는
 * leagues.update()를 직접 하지 않고 series 배열만 mutate한 뒤 tournament_start_at/
 * sim_real_start_at 값을 반환한다 — 그 write는 반드시 바깥쪽 루프가 읽은 bracket_version
 * 조건에 맞춰 한 번에 나가야 낙관적 동시성 제어(CAS)가 깨지지 않는다. persist=true(기본값,
 * startPlayoffs/startPlayIn처럼 handleTournamentAdvance 바깥에서 최초 호출되는 경우)면 기존과
 * 동일하게 이 함수가 직접 저장한다.
 */
export async function buildAndStoreConferenceBracket(
    league: PostseasonLeagueRow, roomId: string,
    eastQualified: StandingRow[], westQualified: StandingRow[],
    priorSeries: unknown[] = [],
    // 플레이인과 동시에(정규시즌 종료 직후) 본선 1라운드 프레임을 먼저 만드는 경우, 플레이인
    // 경기(항상 "+1일" 앵커의 슬롯 0~1)와 시간이 겹치지 않도록 하루 더 늦게 시작시킨다.
    // 플레이인 없이 곧장 본선을 만드는 startPlayoffs()는 기본값(1일 뒤)을 그대로 쓴다.
    daysOffset: number = 1,
    persist: boolean = true,
): Promise<{ tournamentStartAt: string; simRealStartAt: string } | null> {
    if (eastQualified.length < 1 && westQualified.length < 1) {
        console.warn(`[playoffSeeder] league=${league.id} — 진출팀 없음(E=${eastQualified.length}, W=${westQualified.length}), skip`);
        return null;
    }

    const { data: teamRows } = await supabase.from('league_teams').select('*').eq('room_id', roomId);
    const bySlug = new Map((teamRows ?? []).map((t: any) => [t.team_slug, t]));

    // team_slug === 'TBD'는 플레이인 결과를 기다리는 시드(7/8위) 자리 — 아직 실제 팀이 없으므로
    // bySlug 조회 대신 더미 로우로 채워 넣는다(makePendingTeamRow, tournamentInitializer.ts가 감지).
    const seedGroup = (group: StandingRow[]): LeagueTeamRow[] => {
        const order = bracketSeedOrder(group.length);
        return order
            .map(seed => group[seed - 1])
            .filter(Boolean)
            .map(s => s.team_slug === 'TBD' ? makePendingTeamRow(roomId) : bySlug.get(s.team_slug))
            .filter(Boolean) as LeagueTeamRow[];
    };

    const seededTeams = [...seedGroup(eastQualified), ...seedGroup(westQualified)];
    if (seededTeams.length < 2) {
        console.warn(`[playoffSeeder] league=${league.id} — resolved team rows < 2, skip`);
        return null;
    }

    // [2026-09-15 Fix] game_date(가상 캘린더)와 scheduledAt(실제 방송 시각)을 서로 다른
    // 소스에서 계산한다 — playoffStartIso는 "실제로 언제 방송되는가"에만 쓰고, game_date는
    // postseasonVirtualAnchor() 기반 가상 날짜를 쓴다. daysOffset(플레이인 유무에 따른
    // 1일/2일 차이)은 두 축 모두에 동일하게 반영해 상대적 순서(플레이인 → 디사이더/본선)는
    // 유지한다.
    const playoffStart     = kstMidnightPlusDays(new Date().toISOString(), daysOffset);
    const playoffStartIso  = playoffStart.toISOString();
    const virtualStartDate = addDaysStr(postseasonVirtualAnchor(league.virtual_season_year), daysOffset - 1);
    const gamesPerRealDay  = league.games_per_real_day ?? 48;
    const intervalMinutes  = 1440 / gamesPerRealDay;

    const result = initializeTournamentBracket(
        seededTeams,
        'single_elim',
        league.match_format ?? 'best_of_7',
        league.finals_match_format ?? league.match_format ?? 'best_of_7',
        `${league.id}-playoffs`,
        virtualStartDate,
        intervalMinutes,
        playoffStartIso,
        'ranked',
    );

    const { error: gamesErr } = await insertGames(roomId, league.id, result.schedule as any);
    if (gamesErr) {
        console.error(`[playoffSeeder] insertGames failed(${league.id}): ${gamesErr}`);
        return null;
    }
    await insertGameShortCodes(roomId, result.schedule.map(g => ({ id: g.id }))).catch(err =>
        console.error(`[playoffSeeder] insertGameShortCodes 실패(${roomId}):`, err),
    );

    // priorSeries(호출자의 배열 레퍼런스)에 새 본선 시리즈를 직접 push — 재조회 없이 호출자가
    // 들고 있던 최신 상태(플레이인 결과 등) 그대로에 이어 붙인다. 자세한 이유는 위 함수 설명 참조.
    priorSeries.push(...result.series);
    // [2026-09-15 Fix] tournament_start_at/sim_real_start_at을 함께 저장해야 2라운드 이후
    // 신규 경기(simRunner.ts의 handleTournamentAdvance → advanceTournamentState)도 여기서 쓴
    // 것과 동일한 앵커를 재사용한다. 이 값이 없으면 handleTournamentAdvance가
    // leagues.season_start_date(정규시즌 "시작일", 10월)로 잘못 폴백해 2라운드부터 game_date가
    // 다시 엉뚱한 날짜로 튄다 — tournament_start_at은 원래 개별 토너먼트(type='tournament')
    // 전용 컬럼이었지만 main_league 플레이오프에서도 이름 그대로 "이 포스트시즌의 시작 앵커"로
    // 재사용해도 안전하다(handleTournamentAdvance가 league.type을 가리지 않고 무조건 읽음).
    const tournamentStartAt = `${virtualStartDate}T00:00:00.000Z`;
    if (persist) {
        await supabase.from('leagues')
            .update({
                bracket_data: { series: priorSeries },
                tournament_start_at: tournamentStartAt,
                sim_real_start_at: playoffStartIso,
            })
            .eq('id', league.id);
    }

    console.log(`[playoffSeeder] league=${league.id} — playoffs started (E=${eastQualified.length} W=${westQualified.length}, ${seededTeams.length} teams, ${result.schedule.length} games)`);
    return { tournamentStartAt, simRealStartAt: playoffStartIso };
}

/** 플레이인 없이 정규시즌 종료 즉시 컨퍼런스별 top-N으로 브라켓 생성. */
export async function startPlayoffs(league: PostseasonLeagueRow, roomId: string): Promise<void> {
    const { East, West } = await computeStandingsByConference(league.id, roomId);
    const n = Math.max(2, league.playoff_team_count ?? 8);
    await buildAndStoreConferenceBracket(league, roomId, East.slice(0, n), West.slice(0, n));
}

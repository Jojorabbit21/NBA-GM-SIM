/**
 * playInSeeder.ts — 컨퍼런스별 플레이인 토너먼트(NBA 방식, 7~10위).
 *
 * league.play_in_enabled인 리그는 정규시즌 종료 시 이 파일의 startPlayIn()이 먼저 실행된다
 * (scheduler.ts의 startPostseason()이 분기). 컨퍼런스별 상위 (N-2)팀은 플레이인 없이 자동
 * 진출 확정 — 여기서는 아무 것도 만들지 않고, 나중에 finalizePostPlayInBracket 단계에서
 * 스탠딩을 다시 읽어 계산한다(정규시즌 스탠딩은 is_playoff=false 경기만 집계하므로 플레이인
 * 경기 진행과 무관하게 항상 그대로다). 순위 (N-2+1)~(N-2+4)위 4팀이 컨퍼런스당 3개
 * 미니시리즈를 치른다:
 *
 *   PI_{CONF}_7v8  : (N-2+1)위 vs (N-2+2)위, 단판 — 승자가 7시드로 즉시 확정, 패자는 디사이더로.
 *   PI_{CONF}_9v10 : (N-2+3)위 vs (N-2+4)위, 단판 — 패자는 완전 탈락, 승자는 디사이더로.
 *   PI_{CONF}_8th  : 7v8 패자 vs 9v10 승자, 단판(디사이더) — 승자가 8시드로 확정.
 *
 * 이 미니시리즈들은 leagues.bracket_data.series에 round:0으로 저장된다. 표준 브라켓 전진
 * 로직(tournamentBracket.ts의 advanceTournamentState)은 라운드 루프가 1부터 시작해 round:0을
 * 절대 건드리지 않으므로 항상 안전하게 무시된다 — 그래서 미니시리즈 결과에 따른 다음 단계
 * 진행은 이 파일의 handlePlayInAdvance()가 simRunner.ts 훅을 통해 별도로 담당한다.
 *
 * 6개 미니시리즈(컨퍼런스당 3개)가 모두 끝나면 handlePlayInAdvance가 자동클린치(N-2) +
 * 플레이인 결과(seed7/seed8)를 합쳐 playoffSeeder.ts의 buildAndStoreConferenceBracket()으로
 * 본선 브라켓을 생성한다.
 */
import { supabase } from '../supabaseAdmin';
import { generateAllSeriesGames, type PlayoffSeries, type TournamentGame } from './tournamentBracket';
import { insertGames, insertGameShortCodes } from '../finalize';
import { kstMidnightPlusDays } from './kst';
import {
    computeStandingsByConference, buildAndStoreConferenceBracket,
    type StandingRow, type PostseasonLeagueRow,
} from './playoffSeeder';

function playInSeriesId(conf: 'East' | 'West', tag: '7v8' | '9v10' | '8th'): string {
    return `PI_${conf.toUpperCase()}_${tag}`;
}

/** 정규시즌 종료 직후 호출 — 컨퍼런스당 4팀(자동클린치 다음 순위)의 플레이인 미니시리즈를 생성. */
export async function startPlayIn(league: PostseasonLeagueRow, roomId: string): Promise<void> {
    const { East, West } = await computeStandingsByConference(league.id, roomId);
    const n = Math.max(2, league.playoff_team_count ?? 8);
    const autoClinch = Math.max(0, n - 2);

    const playInStart     = kstMidnightPlusDays(new Date().toISOString(), 1);
    const playInStartIso  = playInStart.toISOString();
    const gamesPerRealDay = league.games_per_real_day ?? 48;
    const intervalMinutes = 1440 / gamesPerRealDay;

    const series: PlayoffSeries[] = [];
    const schedule: TournamentGame[] = [];
    let anyConfHasField = false;

    for (const [conf, standings] of [['East', East], ['West', West]] as const) {
        const field = standings.slice(autoClinch, autoClinch + 4);
        if (field.length < 4) {
            // 팀이 부족한 소규모 커스텀 리그 — 이 컨퍼런스는 플레이인 없이 자동 진출로 대체된다
            // (handlePlayInAdvance가 이 컨퍼런스엔 round:0 시리즈가 없다는 걸 보고 자동 스킵).
            console.warn(`[playInSeeder] league=${league.id} conf=${conf} — 플레이인 대상 팀 부족(${field.length}/4), 스킵`);
            continue;
        }
        anyConfHasField = true;
        const [s7, s8, s9, s10] = field;

        series.push({
            id: playInSeriesId(conf, '7v8'), round: 0, conference: conf,
            higherSeedId: s7.team_slug, lowerSeedId: s8.team_slug,
            higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 1,
        });
        series.push({
            id: playInSeriesId(conf, '9v10'), round: 0, conference: conf,
            higherSeedId: s9.team_slug, lowerSeedId: s10.team_slug,
            higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 1,
        });
        series.push({
            id: playInSeriesId(conf, '8th'), round: 0, conference: conf,
            higherSeedId: 'TBD', lowerSeedId: 'TBD',
            higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 1,
        });

        // 7v8/9v10은 슬롯 0(당일 동시 진행) — 8th 디사이더는 참가팀이 아직 TBD라 여기서
        // 게임을 만들지 않고, handlePlayInAdvance가 양쪽 슬롯이 채워지는 시점에 슬롯 1로 생성한다.
        schedule.push(...generateAllSeriesGames(
            playInSeriesId(conf, '7v8'), s7.team_slug, s8.team_slug, 1,
            playInStartIso.slice(0, 10), 0, intervalMinutes, playInStartIso,
        ));
        schedule.push(...generateAllSeriesGames(
            playInSeriesId(conf, '9v10'), s9.team_slug, s10.team_slug, 1,
            playInStartIso.slice(0, 10), 0, intervalMinutes, playInStartIso,
        ));
    }

    if (!anyConfHasField) {
        console.warn(`[playInSeeder] league=${league.id} — 양쪽 컨퍼런스 모두 플레이인 불가, 본선 브라켓으로 직행`);
        await buildAndStoreConferenceBracket(league, roomId, East.slice(0, n), West.slice(0, n));
        return;
    }

    const { error: gamesErr } = await insertGames(roomId, league.id, schedule as any);
    if (gamesErr) {
        console.error(`[playInSeeder] insertGames failed(${league.id}): ${gamesErr}`);
        return;
    }
    await insertGameShortCodes(roomId, schedule.map(g => ({ id: g.id }))).catch(err =>
        console.error(`[playInSeeder] insertGameShortCodes 실패(${roomId}):`, err),
    );

    await supabase.from('leagues').update({ bracket_data: { series } }).eq('id', league.id);
    console.log(`[playInSeeder] league=${league.id} — play-in started (${schedule.length} games)`);
}

/**
 * simRunner.ts의 handleTournamentAdvance가 round:0 시리즈 완료를 감지했을 때 호출된다.
 * series 배열을 직접 mutate한다 — 호출부가 그 직후 bracket_data를 저장하므로 여기서는
 * "8th 디사이더 게임 생성"처럼 games 테이블에 별도로 반영해야 하는 부수효과만 처리한다.
 */
export async function handlePlayInAdvance(
    league: PostseasonLeagueRow, roomId: string, series: PlayoffSeries[], finishedSeriesId: string,
): Promise<void> {
    const finished = series.find(s => s.id === finishedSeriesId);
    if (!finished || !finished.winnerId || finished.conference === 'BPL') return;
    const conf = finished.conference;
    const loserId = finished.winnerId === finished.higherSeedId ? finished.lowerSeedId : finished.higherSeedId;

    const decider = series.find(s => s.id === playInSeriesId(conf, '8th'));
    if (decider && !decider.finished) {
        if (finishedSeriesId === playInSeriesId(conf, '7v8') && decider.higherSeedId === 'TBD') {
            decider.higherSeedId = loserId;
        } else if (finishedSeriesId === playInSeriesId(conf, '9v10') && decider.lowerSeedId === 'TBD') {
            decider.lowerSeedId = finished.winnerId;
        }

        if (decider.higherSeedId !== 'TBD' && decider.lowerSeedId !== 'TBD') {
            const deciderStart    = kstMidnightPlusDays(new Date().toISOString(), 1);
            const gamesPerRealDay = league.games_per_real_day ?? 48;
            const intervalMinutes = 1440 / gamesPerRealDay;
            const games = generateAllSeriesGames(
                decider.id, decider.higherSeedId, decider.lowerSeedId, 1,
                deciderStart.toISOString().slice(0, 10), 1, intervalMinutes, deciderStart.toISOString(),
            );
            const { error } = await insertGames(roomId, league.id, games as any);
            if (error) console.error(`[playInSeeder] decider insertGames 실패(${league.id}): ${error}`);
            await insertGameShortCodes(roomId, games.map(g => ({ id: g.id }))).catch(err =>
                console.error(`[playInSeeder] decider insertGameShortCodes 실패(${roomId}):`, err),
            );
        }
    }

    // 존재하는 round:0 시리즈(플레이인 대상 팀이 부족했던 컨퍼런스는 애초에 시리즈 자체가 없음)가
    // 모두 끝났으면 본선 브라켓 생성으로 넘어간다.
    const allPlayInFinished = series.filter(s => s.round === 0).every(s => s.finished);
    if (!allPlayInFinished) return;

    const { East, West } = await computeStandingsByConference(league.id, roomId);
    const n = Math.max(2, league.playoff_team_count ?? 8);
    const autoClinch = Math.max(0, n - 2);

    const resolveQualified = (c: 'East' | 'West', standings: StandingRow[]): StandingRow[] => {
        const auto = standings.slice(0, autoClinch);
        const bySlug = new Map(standings.map(s => [s.team_slug, s]));
        const seed7Id = series.find(s => s.id === playInSeriesId(c, '7v8'))?.winnerId;
        const seed8Id = series.find(s => s.id === playInSeriesId(c, '8th'))?.winnerId;
        const extra = [seed7Id, seed8Id]
            .map(id => (id ? bySlug.get(id) : undefined))
            .filter(Boolean) as StandingRow[];
        // 플레이인이 없었던 컨퍼런스(팀 부족)는 extra가 비어 있으므로 auto(top n)만 그대로 사용됨.
        return extra.length > 0 ? [...auto, ...extra] : standings.slice(0, n);
    };

    // series(호출자 simRunner.ts의 배열 레퍼런스)를 그대로 넘긴다 — buildAndStoreConferenceBracket이
    // 여기에 새 본선 시리즈를 push하므로, 이 함수 반환 이후 simRunner.ts가 같은 배열로 한 번 더
    // bracket_data를 저장해도 방금 여기서 쓴 것과 동일한 최신 상태를 재기록할 뿐이라 안전하다.
    await buildAndStoreConferenceBracket(
        league, roomId,
        resolveQualified('East', East),
        resolveQualified('West', West),
        series,
    );
}

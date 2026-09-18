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
import { generateAllSeriesGames, type PlayoffSeries, type TournamentGame } from './tournamentBracket';
import { insertGames, insertGameShortCodes } from '../finalize';
import { kstMidnightPlusDays } from './kst';
import { supabase } from '../supabaseAdmin';
import {
    computeStandingsByConference, buildAndStoreConferenceBracket, buildBracketConfirmedEvent, seasonLabelFor,
    postseasonVirtualAnchor, addDaysStr, postseasonIntervalDays,
    type StandingRow, type PostseasonLeagueRow,
} from './playoffSeeder';
import { loadLeagueTimeline, fillPostseasonRealTimes } from './timelineStore';
import { insertLeagueEvent, type PendingLeagueEvent } from './multi/playoffNews';

function playInSeriesId(conf: 'East' | 'West', tag: '7v8' | '9v10' | '8th'): string {
    return `PI_${conf.toUpperCase()}_${tag}`;
}

/** 아직 플레이인으로 결정되지 않은 시드(7/8위) 자리 표식 — playoffSeeder.ts가 이 슬롯을
 * 더미 팀으로 채워 본선 1라운드 시리즈는 만들되 게임은 생성하지 않는다. */
const pendingSeedRow = (): StandingRow => ({ team_slug: 'TBD', conference: null, wins: 0, losses: 0, pointDiff: 0 });

/** 정규시즌 종료 직후 호출 — 컨퍼런스당 4팀(자동클린치 다음 순위)의 플레이인 미니시리즈를 생성.
 * 동시에 본선 1라운드 이상 프레임도 즉시 만든다(buildAndStoreConferenceBracket) — 3vs6, 4vs5처럼
 * 플레이인과 무관하게 이미 확정된 매치업은 게임까지 바로 생성되고, 7/8위가 걸린 매치업은 TBD로
 * 노출만 되다가 handlePlayInAdvance()/resolveRoundOneFromPlayIn()이 플레이인 결과가 나오는 대로
 * 채워 넣는다. */
export async function startPlayIn(league: PostseasonLeagueRow, roomId: string): Promise<void> {
    const { East, West } = await computeStandingsByConference(league.id, roomId);
    const n = Math.max(2, league.playoff_team_count ?? 8);
    const autoClinch = Math.max(0, n - 2);

    const { data: teamRows } = await supabase.from('league_teams').select('team_slug, team_name').eq('room_id', roomId);
    const teamNameBySlug = new Map((teamRows ?? []).map((t: any) => [t.team_slug as string, t.team_name as string]));
    const matchups: any[] = [];

    // [2026-09-15 Fix] game_date(가상 캘린더)는 postseasonVirtualAnchor() 기반으로 계산 —
    // playInStartIso(실제 방송 시각/scheduledAt)와는 별개 축. 플레이인은 포스트시즌 day 0.
    // [2026-09-18] 타임라인 리그는 scheduled_at을 league_virtual_days 표에서 계산(슬롯 방식은 구 리그 전용).
    const timeline         = await loadLeagueTimeline(league.id);
    const usesTimeline     = timeline.length > 0;
    const g                = postseasonIntervalDays(league);
    const playInStart      = kstMidnightPlusDays(new Date().toISOString(), 1);
    const playInStartIso   = playInStart.toISOString();
    const virtualStartDate = postseasonVirtualAnchor(league.virtual_season_year);
    const gamesPerRealDay  = league.games_per_real_day ?? 48;
    const intervalMinutes  = usesTimeline ? 1440 * g : 1440 / gamesPerRealDay;

    const series: PlayoffSeries[] = [];
    const schedule: TournamentGame[] = [];
    let eastQualified: StandingRow[] = East.slice(0, n);
    let westQualified: StandingRow[] = West.slice(0, n);

    for (const [conf, standings] of [['East', East], ['West', West]] as const) {
        const field = standings.slice(autoClinch, autoClinch + 4);
        if (field.length < 4) {
            // 팀이 부족한 소규모 커스텀 리그 — 이 컨퍼런스는 플레이인 없이 자동 진출로 대체된다
            // (eastQualified/westQualified가 기본값인 top-n 그대로 유지됨).
            console.warn(`[playInSeeder] league=${league.id} conf=${conf} — 플레이인 대상 팀 부족(${field.length}/4), 스킵`);
            continue;
        }
        const [s7, s8, s9, s10] = field;
        const name = (slug: string) => teamNameBySlug.get(slug) ?? slug;
        matchups.push(
            { conference: conf, tag: '7v8', higherSeedSlug: s7.team_slug, higherSeedName: name(s7.team_slug), higherSeedRank: autoClinch + 1, lowerSeedSlug: s8.team_slug, lowerSeedName: name(s8.team_slug), lowerSeedRank: autoClinch + 2 },
            { conference: conf, tag: '9v10', higherSeedSlug: s9.team_slug, higherSeedName: name(s9.team_slug), higherSeedRank: autoClinch + 3, lowerSeedSlug: s10.team_slug, lowerSeedName: name(s10.team_slug), lowerSeedRank: autoClinch + 4 },
        );

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
            virtualStartDate, 0, intervalMinutes, usesTimeline ? null : playInStartIso,
        ));
        schedule.push(...generateAllSeriesGames(
            playInSeriesId(conf, '9v10'), s9.team_slug, s10.team_slug, 1,
            virtualStartDate, 0, intervalMinutes, usesTimeline ? null : playInStartIso,
        ));

        // 7/8위는 플레이인 결과로 나중에 확정 — 본선 1라운드 프레임엔 일단 TBD로 채워 넣는다.
        const qualified = [...standings.slice(0, autoClinch), pendingSeedRow(), pendingSeedRow()];
        if (conf === 'East') eastQualified = qualified; else westQualified = qualified;
    }

    if (schedule.length > 0) {
        const timedSchedule = usesTimeline ? fillPostseasonRealTimes(schedule as any[], timeline, league) : schedule;
        const { error: gamesErr } = await insertGames(roomId, league.id, timedSchedule as any);
        if (gamesErr) {
            console.error(`[playInSeeder] insertGames failed(${league.id}): ${gamesErr}`);
            return;
        }
        await insertGameShortCodes(roomId, schedule.map(g => ({ id: g.id }))).catch(err =>
            console.error(`[playInSeeder] insertGameShortCodes 실패(${roomId}):`, err),
        );
    }

    // [2026-09-15] "플레이인 대진 발표" 서신 — 실제 미니시리즈가 생성됐을 때만(소규모 리그라
    // 플레이인 자체가 스킵됐으면 matchups가 비어있으므로 발행하지 않는다). 이 함수는 리그당
    // 정확히 한 번만 실행되고(scheduler.ts가 bracket_data IS NULL 조건으로 중복 방지) CAS
    // 재시도 대상이 아니므로 바로 발행해도 안전하다.
    if (matchups.length > 0) {
        const seasonLabel = seasonLabelFor(league.virtual_season_year);
        await insertLeagueEvent({
            roomId, leagueId: league.id, type: 'play_in_bracket', simDate: virtualStartDate,
            teamIds: matchups.flatMap(m => [m.higherSeedSlug, m.lowerSeedSlug]),
            payload: { headline: `${seasonLabel}시즌 플레이인 토너먼트 대진 발표`, seasonLabel, matchups },
        });
    }

    // 본선 1라운드 가상 날짜 오프셋 — 플레이인이 있으면 디사이더(g) 다음인 2g, 없으면 0.
    // 구 리그(타임라인 없음)는 예전 값(+1일)을 유지한다.
    const round1DayOffset = schedule.length > 0 ? (usesTimeline ? 2 * g : 1) : 0;
    await buildAndStoreConferenceBracket(league, roomId, eastQualified, westQualified, series, round1DayOffset);
    console.log(`[playInSeeder] league=${league.id} — play-in started (${schedule.length} play-in games, timeline=${usesTimeline}, g=${g})`);
}

export interface HandlePlayInAdvanceResult {
    tournamentStartAt?: string;
    simRealStartAt?: string;
    pendingEvents: PendingLeagueEvent[];
}

/**
 * simRunner.ts의 handleTournamentAdvance가 round:0 시리즈 완료를 감지했을 때 호출된다.
 * series 배열을 직접 mutate한다 — 호출부가 그 직후 bracket_data를 저장하므로 여기서는
 * "8th 디사이더 게임 생성"처럼 games 테이블에 별도로 반영해야 하는 부수효과만 처리한다.
 *
 * [2026-09-15 Fix] tournamentStartAt/simRealStartAt은 [하위호환] 레거시 경로에서
 * buildAndStoreConferenceBracket을 persist=false로 호출했을 때만 채워짐 —
 * handleTournamentAdvance의 낙관적 동시성 제어(bracket_version CAS) 최종 write에 병합돼야 한다.
 *
 * [2026-09-15] pendingEvents는 "플레이인 결과"/"플레이오프 대진 확정" 서신 — 호출부
 * (simRunner.ts의 tryAdvanceTournamentOnce)가 bracket_version CAS write 성공 직후에만
 * 실제로 발행해야 재시도 시 중복 발행을 막을 수 있다(playoffNews.ts 헤더 주석 참고).
 *
 * homeTeamId/awayTeamId/homeScore/awayScore — 방금 끝난 플레이인 게임의 실제 스코어(플레이인은
 * 항상 단판이라 이 경기 자체가 곧 시리즈 결과). "플레이인 결과" 서신에 승/패 스코어를 그대로
 * 실어주기 위해 tryAdvanceTournamentOnce로부터 전달받는다.
 */
export async function handlePlayInAdvance(
    league: PostseasonLeagueRow, roomId: string, series: PlayoffSeries[], finishedSeriesId: string,
    homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number,
): Promise<HandlePlayInAdvanceResult> {
    const finished = series.find(s => s.id === finishedSeriesId);
    if (!finished || !finished.winnerId || finished.conference === 'BPL') return { pendingEvents: [] };
    const conf = finished.conference;
    const loserId = finished.winnerId === finished.higherSeedId ? finished.lowerSeedId : finished.higherSeedId;

    const tag: '7v8' | '9v10' | '8th' =
        finishedSeriesId === playInSeriesId(conf, '7v8') ? '7v8' :
        finishedSeriesId === playInSeriesId(conf, '9v10') ? '9v10' : '8th';
    const seedClinched: 7 | 8 | undefined = tag === '7v8' ? 7 : tag === '8th' ? 8 : undefined;
    const winnerScore = finished.winnerId === homeTeamId ? homeScore : awayScore;
    const loserScore  = finished.winnerId === homeTeamId ? awayScore : homeScore;
    const { data: teamRows } = await supabase.from('league_teams')
        .select('team_slug, team_name').eq('room_id', roomId).in('team_slug', [finished.winnerId, loserId]);
    const nameOf = (slug: string) => teamRows?.find((t: any) => t.team_slug === slug)?.team_name ?? slug;
    // 플레이인은 항상 단판이라 이 시리즈의 game_date는 게임 종류(7v8/9v10=포스트시즌 day 0,
    // 8th 디사이더=day 1)만으로 이미 결정돼 있다(startPlayIn()/handlePlayInAdvance의 디사이더
    // 생성 로직과 동일 규칙) — 별도 조회 없이 그대로 계산.
    const confLabel = conf === 'East' ? '동부' : '서부';
    const tagLabel = tag === '7v8' ? '7-8위전' : tag === '9v10' ? '9-10위전' : '8시드 결정전';
    const winnerName = nameOf(finished.winnerId);
    const timeline     = await loadLeagueTimeline(league.id);
    const usesTimeline = timeline.length > 0;
    const g            = postseasonIntervalDays(league);
    const playInVirtualDate = tag === '8th'
        ? addDaysStr(postseasonVirtualAnchor(league.virtual_season_year), usesTimeline ? g : 1)
        : postseasonVirtualAnchor(league.virtual_season_year);
    const pendingEvents: PendingLeagueEvent[] = [{
        type: 'play_in_result', simDate: playInVirtualDate,
        teamIds: [finished.winnerId, loserId],
        payload: {
            headline: `${winnerName}, ${confLabel} ${tagLabel} 승리`,
            conference: conf, tag,
            winnerSlug: finished.winnerId, winnerName,
            loserSlug: loserId, loserName: nameOf(loserId),
            winnerScore, loserScore, seedClinched,
        },
    }];

    const decider = series.find(s => s.id === playInSeriesId(conf, '8th'));
    if (decider && !decider.finished) {
        if (finishedSeriesId === playInSeriesId(conf, '7v8') && decider.higherSeedId === 'TBD') {
            decider.higherSeedId = loserId;
        } else if (finishedSeriesId === playInSeriesId(conf, '9v10') && decider.lowerSeedId === 'TBD') {
            decider.lowerSeedId = finished.winnerId;
        }

        if (decider.higherSeedId !== 'TBD' && decider.lowerSeedId !== 'TBD') {
            // [2026-09-15 Fix] 디사이더는 플레이인 다음날(포스트시즌 day 1) — 실제로 이 함수가
            // 언제(며칠 뒤든) 호출되든 game_date는 항상 이 가상 날짜로 고정한다. 실제 방송
            // 시각(scheduledAt)만 호출 시점의 real "now"+1일을 그대로 사용.
            // [2026-09-18] 타임라인 리그: 디사이더 = 앵커 + g(가상 날짜), 슬롯 0에 두고 scheduled_at은 표에서.
            // 구 리그: 예전 그대로(앵커+1, 슬롯 1, 30분 간격, real now+1일 앵커).
            const deciderVirtualDate = addDaysStr(postseasonVirtualAnchor(league.virtual_season_year), usesTimeline ? g : 1);
            const deciderStart    = kstMidnightPlusDays(new Date().toISOString(), 1);
            const gamesPerRealDay = league.games_per_real_day ?? 48;
            const intervalMinutes = usesTimeline ? 1440 * g : 1440 / gamesPerRealDay;
            const rawGames = generateAllSeriesGames(
                decider.id, decider.higherSeedId, decider.lowerSeedId, 1,
                deciderVirtualDate, usesTimeline ? 0 : 1, intervalMinutes, usesTimeline ? null : deciderStart.toISOString(),
            );
            const games = usesTimeline ? fillPostseasonRealTimes(rawGames as any[], timeline, league) : rawGames;
            const { error } = await insertGames(roomId, league.id, games as any);
            if (error) console.error(`[playInSeeder] decider insertGames 실패(${league.id}): ${error}`);
            await insertGameShortCodes(roomId, games.map(g => ({ id: g.id }))).catch(err =>
                console.error(`[playInSeeder] decider insertGameShortCodes 실패(${roomId}):`, err),
            );
        }
    }

    // startPlayIn()이 본선 1라운드 프레임을 이미 만들어 둔 리그(이 수정 이후 시작된 플레이인)는
    // 7v8/8th 승자가 확정되는 즉시 해당 TBD 슬롯만 채우고 끝낸다 — 반대편 컨퍼런스나 나머지
    // 플레이인 미니시리즈가 끝나길 기다리지 않는다(컨퍼런스/시드별 독립 처리).
    const hasRoundOneFrame = series.some(s => s.round >= 1);
    if (hasRoundOneFrame) {
        if (finishedSeriesId === playInSeriesId(conf, '7v8') || finishedSeriesId === playInSeriesId(conf, '8th')) {
            const bracketEvent = await resolveRoundOneFromPlayIn(league, roomId, series, conf, finishedSeriesId, finished.winnerId);
            if (bracketEvent) pendingEvents.push(bracketEvent);
        }
        return { pendingEvents };
    }

    // [하위호환] 이 수정 이전에 이미 시작된 리그 — startPlayIn()이 본선 1라운드 프레임을 만들어
    // 두지 않았으므로, 예전 방식대로 플레이인이 전부 끝난 뒤에야 본선 브라켓 전체를 한 번에
    // 생성한다. 새로 시작하는 리그는 위 hasRoundOneFrame 분기에서 이미 return되어 여기 오지 않는다.
    const allPlayInFinished = series.filter(s => s.round === 0).every(s => s.finished);
    if (!allPlayInFinished) return { pendingEvents };

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
    // 여기에 새 본선 시리즈를 push한다. persist=false — 이 write는 leagues.bracket_version CAS를
    // 태워야 하므로 여기서 직접 저장하지 않고, 계산된 앵커만 반환해 handleTournamentAdvance의
    // 최종 조건부 write에 병합시킨다(위 함수 설명 참조).
    const bracketResult = await buildAndStoreConferenceBracket(
        league, roomId,
        resolveQualified('East', East),
        resolveQualified('West', West),
        series,
        usesTimeline ? 2 * g : 0,
        false,
    );
    if (!bracketResult) return { pendingEvents };
    return {
        tournamentStartAt: bracketResult.tournamentStartAt,
        simRealStartAt: bracketResult.simRealStartAt,
        pendingEvents: [...pendingEvents, ...bracketResult.pendingEvents],
    };
}

/**
 * 7v8 미니시리즈 승자(=7시드)나 8th 디사이더 승자(=8시드)가 확정되는 시점에, startPlayIn()이
 * 미리 만들어 둔 본선 1라운드의 TBD 슬롯을 채우고 그 시리즈의 게임을 생성한다. 파트너 시드는
 * bracketSeedOrder의 표준 시딩 규칙(1번↔n번, 2번↔n-1번)상 항상 2시드(7v8 승자용)/1시드
 * (8th 디사이더 승자용)로 고정된다.
 *
 * [2026-09-15] 이 슬롯을 채운 뒤 본선 1라운드 전체(양쪽 컨퍼런스)에 더 이상 TBD가 없으면
 * "플레이오프 대진 확정" 서신을 반환한다 — 컨퍼런스/시드별로 독립 처리되는 구조라, 어느
 * resolveRoundOneFromPlayIn() 호출이 "마지막 TBD"를 채우는지는 실행 순서에 달려있어 매번
 * 여기서 다시 확인해야 한다.
 */
async function resolveRoundOneFromPlayIn(
    league: PostseasonLeagueRow, roomId: string, series: PlayoffSeries[],
    conf: 'East' | 'West', finishedSeriesId: string, winnerId: string,
): Promise<PendingLeagueEvent | null> {
    const { East, West } = await computeStandingsByConference(league.id, roomId);
    const standings = conf === 'East' ? East : West;
    const partnerSlug = finishedSeriesId === playInSeriesId(conf, '7v8')
        ? standings[1]?.team_slug   // 7v8 승자 = 7시드 → 파트너는 2시드
        : standings[0]?.team_slug;  // 8th 디사이더 승자 = 8시드 → 파트너는 1시드
    if (!partnerSlug) return null;

    const target = series.find(s => s.round === 1 && s.higherSeedId === partnerSlug && s.lowerSeedId === 'TBD');
    if (!target) return null; // 이미 채워졌거나(중복 이벤트) 매치 자체가 없는 소규모 리그

    target.lowerSeedId = winnerId;

    // [2026-09-15 Fix] 본선 1라운드 가상 날짜 — startPlayIn()이 buildAndStoreConferenceBracket에 넘긴
    // round1DayOffset(타임라인 리그 2g / 구 리그 1)과 동일해야 같은 라운드의 다른 매치업들과
    // game_date가 어긋나지 않는다.
    const timeline     = await loadLeagueTimeline(league.id);
    const usesTimeline = timeline.length > 0;
    const g            = postseasonIntervalDays(league);
    const round1VirtualDate = addDaysStr(postseasonVirtualAnchor(league.virtual_season_year), usesTimeline ? 2 * g : 1);
    const startAnchor     = kstMidnightPlusDays(new Date().toISOString(), 1);
    const gamesPerRealDay = league.games_per_real_day ?? 48;
    const intervalMinutes = usesTimeline ? 1440 * g : 1440 / gamesPerRealDay;
    const rawGames = generateAllSeriesGames(
        target.id, target.higherSeedId, target.lowerSeedId, target.targetWins,
        round1VirtualDate, 0, intervalMinutes, usesTimeline ? null : startAnchor.toISOString(),
    );
    const games = usesTimeline ? fillPostseasonRealTimes(rawGames as any[], timeline, league) : rawGames;
    const { error } = await insertGames(roomId, league.id, games as any);
    if (error) console.error(`[playInSeeder] round1 insertGames 실패(${league.id}): ${error}`);
    await insertGameShortCodes(roomId, games.map(g => ({ id: g.id }))).catch(err =>
        console.error(`[playInSeeder] round1 insertGameShortCodes 실패(${roomId}):`, err),
    );

    const stillPending = series.some(s => s.round === 1 && (s.higherSeedId === 'TBD' || s.lowerSeedId === 'TBD'));
    if (stillPending) return null;

    const n = Math.max(2, league.playoff_team_count ?? 8);
    const autoClinch = Math.max(0, n - 2);
    const resolveQualified = (c: 'East' | 'West', st: StandingRow[]): StandingRow[] => {
        const auto = st.slice(0, autoClinch);
        const bySlug = new Map(st.map(s => [s.team_slug, s]));
        const seed7Id = series.find(s => s.id === playInSeriesId(c, '7v8'))?.winnerId;
        const seed8Id = series.find(s => s.id === playInSeriesId(c, '8th'))?.winnerId;
        const extra = [seed7Id, seed8Id].map(id => (id ? bySlug.get(id) : undefined)).filter(Boolean) as StandingRow[];
        return extra.length > 0 ? [...auto, ...extra] : st.slice(0, n);
    };
    const { data: teamRows } = await supabase.from('league_teams').select('team_slug, team_name').eq('room_id', roomId);
    const bySlugName = new Map((teamRows ?? []).map((t: any) => [t.team_slug, t]));
    return buildBracketConfirmedEvent(league.virtual_season_year, round1VirtualDate, resolveQualified('East', East), resolveQualified('West', West), bySlugName);
}

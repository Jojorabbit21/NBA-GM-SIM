/**
 * playoffNews.ts — 플레이오프 서신 7종 공용 헬퍼(발행 + 파이널 MVP 산정).
 *
 * 클라이언트 미러: services/multi/leagueEventPayload.ts의 PlayInBracketDetail 등 7개 인터페이스.
 * payload 필드명을 바꿀 땐 반드시 양쪽 다 같이 고칠 것(client/server 미러 쌍 — dev-log.md 기록 대상).
 *
 * 호출부: server/src/shared/playInSeeder.ts(플레이인 대진/결과), server/src/shared/playoffSeeder.ts
 * (본선 대진 확정), server/src/simRunner.ts(경기 결과/시리즈 결과/우승팀/파이널 MVP — 전부
 * tryAdvanceTournamentOnce()의 bracket_version 조건부 write가 "성공"한 뒤에만 호출해야
 * CAS 재시도 시 중복 발행되지 않는다).
 */
import { supabase } from '../../supabaseAdmin';

export interface InsertLeagueEventParams {
    roomId: string;
    leagueId: string;
    type: string;
    /** [2026-09-15 버그 수정] 뉴스피드 리스트 행/폴백 카드가 표시하는 제목은
     *  `payload.headline`에서 온다(hooks/useLeagueHeadlines.ts의 `row.payload?.headline ?? ''`).
     *  다른 모든 기존 이벤트 타입(allstar_*, draft_lottery_result 등)은 전부 이 필드를
     *  채우는데, 플레이오프 서신 7종을 처음 만들 때 이걸 빠뜨려서 뉴스피드에 제목 없이
     *  올라가는 사고가 났다 — payload 타입에 `headline`을 필수로 못 박아 컴파일 타임에
     *  강제한다(다시는 빠뜨리지 않도록). */
    simDate?: string | null;
    teamIds?: string[];
    playerIds?: string[];
    /** game_result처럼 "이 이벤트가 특정 경기 하나에서 나왔다" — 채우면 뉴스카드에서 그
     *  경기(중계/박스스코어)로 바로 이동하는 버튼을 붙일 수 있다(playoff_game_result 전용). */
    gameId?: string | null;
    payload: { headline: string } & Record<string, any>;
}

export async function insertLeagueEvent(params: InsertLeagueEventParams): Promise<void> {
    const { error } = await supabase.from('league_events').insert({
        room_id: params.roomId,
        league_id: params.leagueId,
        type: params.type,
        sim_date: params.simDate ?? null,
        team_ids: params.teamIds ?? [],
        player_ids: params.playerIds ?? [],
        game_id: params.gameId ?? null,
        payload: { v: 1, ...params.payload },
    });
    if (error) console.error(`[playoffNews] league_events insert 실패(type=${params.type}):`, error.message);
}

/**
 * [중요] 플레이인/본선 대진 관련 함수(playInSeeder.ts의 handlePlayInAdvance 등)는
 * simRunner.ts의 tryAdvanceTournamentOnce() 안에서 leagues.bracket_version 낙관적
 * 동시성 제어(CAS)의 일부로 호출된다 — 그 CAS write가 실패하면(경합) 전체 함수가 처음부터
 * 재시도되므로, 이 시점에 바로 insertLeagueEvent()를 호출하면 재시도마다 서신이 중복
 * 발행된다. 그래서 이런 함수들은 "무슨 서신을 보내야 하는지"만 PendingLeagueEvent로 모아서
 * 반환하고, 실제 insertLeagueEvent() 호출은 CAS write가 성공한 직후(tryAdvanceTournamentOnce
 * 맨 끝)에만 한다 — 그 지점에 도달했다는 것 자체가 "이번 시도가 최종적으로 성공했다"는
 * 뜻이라 중복이 생기지 않는다.
 */
export type PendingLeagueEvent = Omit<InsertLeagueEventParams, 'roomId' | 'leagueId'>;

export async function flushPendingLeagueEvents(
    roomId: string, leagueId: string, events: PendingLeagueEvent[],
): Promise<void> {
    for (const e of events) {
        await insertLeagueEvent({ roomId, leagueId, ...e });
    }
}

/** 라운드 라벨 — 멀티리그 브라켓 엔진(tournamentBracket.ts)은 2라운드 이상부터 conference를
 * 트래킹하지 않아(항상 'BPL') "동부/서부 N라운드" 같은 접두어를 붙일 방법이 없다. 그래서
 * 컨퍼런스 구분 없이 라운드 수만으로 라벨을 정한다 — MultiScheduleView.tsx의
 * computeRoundLabelMap()과 동일한 규칙(마지막 라운드=파이널, 그 전=준결승, 나머지는 N라운드). */
export function roundLabel(round: number, totalRounds: number): string {
    if (round === totalRounds) return '파이널';
    if (round === totalRounds - 1 && totalRounds > 2) return '준결승';
    return `${round}라운드`;
}

export interface FinalsMvpResult {
    playerId: string; playerName: string;
    gp: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number;
}

/**
 * 파이널 MVP 산정 — 싱글플레이어 services/reportGenerator.ts의 selectFinalsMvp()와 동일한
 * 공식(PPG×2.5+RPG×1.2+APG×1.8+SPG+BPG×0.8-TOV×0.8+TS%×15+±/game×0.5)을 서버에서 재구현.
 * 우승팀 선수만 대상으로, 그 시리즈(seriesId)에 속한 경기들의 box score를 game_pbp에서
 * 직접 집계한다(플레이오프 결과 재계산 아님 — 이미 시뮬레이션된 경기의 기록만 합산).
 */
export async function computeFinalsMvp(
    roomId: string, seriesId: string, winnerTeamSlug: string,
): Promise<FinalsMvpResult | null> {
    const { data: games } = await supabase
        .from('games')
        .select('game_id, home_team_id, away_team_id')
        .eq('room_id', roomId).eq('series_id', seriesId).eq('played', true);
    if (!games?.length) return null;

    const { data: pbpRows } = await supabase
        .from('game_pbp')
        .select('game_id, home_box, away_box')
        .eq('room_id', roomId).in('game_id', games.map(g => g.game_id));
    if (!pbpRows?.length) return null;

    const gameById = new Map(games.map(g => [g.game_id, g]));
    const agg = new Map<string, {
        playerName: string; gp: number; pts: number; reb: number; ast: number;
        stl: number; blk: number; tov: number; fga: number; fta: number; plusMinus: number;
    }>();

    for (const row of pbpRows) {
        const g = gameById.get(row.game_id);
        if (!g) continue;
        const isHomeWinner = g.home_team_id === winnerTeamSlug;
        const isAwayWinner = g.away_team_id === winnerTeamSlug;
        if (!isHomeWinner && !isAwayWinner) continue;
        const box: any[] = isHomeWinner ? (row.home_box ?? []) : (row.away_box ?? []);

        for (const p of box) {
            if (!p?.playerId) continue;
            const cur = agg.get(p.playerId) ?? {
                playerName: p.playerName ?? '', gp: 0, pts: 0, reb: 0, ast: 0,
                stl: 0, blk: 0, tov: 0, fga: 0, fta: 0, plusMinus: 0,
            };
            cur.gp += 1;
            cur.pts += p.pts ?? 0; cur.reb += p.reb ?? 0; cur.ast += p.ast ?? 0;
            cur.stl += p.stl ?? 0; cur.blk += p.blk ?? 0; cur.tov += p.tov ?? 0;
            cur.fga += p.fga ?? 0; cur.fta += p.fta ?? 0; cur.plusMinus += p.plusMinus ?? 0;
            agg.set(p.playerId, cur);
        }
    }
    if (agg.size === 0) return null;

    let best: { playerId: string; score: number } | null = null;
    for (const [playerId, s] of agg) {
        const gp = s.gp || 1;
        const ppg = s.pts / gp, rpg = s.reb / gp, apg = s.ast / gp;
        const spg = s.stl / gp, bpg = s.blk / gp, tovpg = s.tov / gp;
        const tsa = 2 * (s.fga + 0.44 * s.fta);
        const tsPct = tsa > 0 ? s.pts / tsa : 0;
        const pmPerGame = s.plusMinus / gp;
        const score = ppg * 2.5 + rpg * 1.2 + apg * 1.8 + spg + bpg * 0.8 - tovpg * 0.8 + tsPct * 15 + pmPerGame * 0.5;
        if (!best || score > best.score) best = { playerId, score };
    }
    if (!best) return null;

    const winner = agg.get(best.playerId)!;
    const gp = winner.gp || 1;
    return {
        playerId: best.playerId, playerName: winner.playerName,
        gp: winner.gp, ppg: winner.pts / gp, rpg: winner.reb / gp, apg: winner.ast / gp,
        spg: winner.stl / gp, bpg: winner.blk / gp,
    };
}

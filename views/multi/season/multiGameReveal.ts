
/**
 * multiGameReveal — 멀티플레이어 경기 표시 상태(scheduled/live/final) 판정.
 *
 * 모든 뷰(스케줄/순위표/리더보드/홈/브라켓/PBP)는 이 모듈의 함수만으로
 * "지금 이 경기의 결과를 보여줄지"를 결정한다. 입력은 `game.scheduledAt`과
 * 서버 보정 시각(useServerClock) 뿐이므로, 누가 언제 접속해도 동일한 시점에
 * 동일한 상태가 나온다 (DB의 played/game_pbp row 존재 여부와 무관).
 *
 * - scheduled : now < scheduledAt            → 결과/PBP 비노출
 * - live      : scheduledAt <= now < +10분    → PBP 리플레이 진행, 최종 점수 비노출
 * - final     : now >= scheduledAt + 10분     → 모든 곳에 최종 결과 노출
 */
import type { Game, PlayoffSeries } from '../../../types';

// 중계 길이 = 결과 공개 지연 (불가분 단일 파라미터). 48분 경기를 10분으로 압축 재생하며,
// 중계가 끝나는 시점(정시+10분)에 비로소 최종 결과가 공개된다.
export const REPLAY_DURATION_MS = 10 * 60 * 1000;

export type GameDisplayState = 'scheduled' | 'live' | 'final';

type ScheduledLike = Pick<Game, 'scheduledAt' | 'game_seq' | 'played'>;

/**
 * game_seq + league 시간 압축 파라미터 → 현실 scheduledAt ISO 문자열 역산.
 * scheduledAt이 이미 있으면 그대로 반환한다.
 * MultiScheduleView에서 allGames를 normalize할 때 사용.
 */
export function resolveRealAt(
    game: Pick<Game, 'scheduledAt' | 'game_seq'>,
    simRealStartAt?: string | null,
    gamesPerRealDay?: number | null,
): string | undefined {
    if (game.scheduledAt) return game.scheduledAt;
    if (game.game_seq != null && simRealStartAt) {
        const raw = new Date(simRealStartAt).getTime()
            + (game.game_seq / (gamesPerRealDay ?? 5)) * 86_400_000;
        // 10분 단위로 반올림하면 경기 간격(intervalMinutes)이 10의 배수가 아닐 때(예: 15분)
        // 슬롯마다 독립적으로 스냅되며 20분/10분이 번갈아 나오는 간격 불균일 버그가 생긴다 —
        // 분 단위로만 반올림해 부동소수점 오차만 제거한다.
        return new Date(Math.round(raw / 60_000) * 60_000).toISOString();
    }
    return undefined;
}

export function getGameDisplayState(game: ScheduledLike, serverNowMs: number): GameDisplayState {
    if (!game.scheduledAt) {
        // game_seq 방식 경기가 normalize 없이 직접 호출된 경우 played로 판정
        return game.played ? 'final' : 'scheduled';
    }
    const start = new Date(game.scheduledAt).getTime();
    if (serverNowMs < start) return 'scheduled';
    if (serverNowMs < start + REPLAY_DURATION_MS) return 'live';
    return 'final';
}

/** 최종 결과가 공개된 상태인가 (집계/합산 포함 가능 여부). */
export const isFinal = (game: ScheduledLike, serverNowMs: number): boolean =>
    getGameDisplayState(game, serverNowMs) === 'final';

/** 경기가 시작되었는가 (live 또는 final — PBP 보기 진입 가능 여부). */
export const isStarted = (game: ScheduledLike, serverNowMs: number): boolean =>
    getGameDisplayState(game, serverNowMs) !== 'scheduled';

function seriesMatchIndex(seriesId: string): number {
    const m = seriesId.split('_M')[1];
    return m !== undefined ? parseInt(m, 10) : 0;
}

type SeriesGameLike = ScheduledLike & {
    seriesId?: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore?: number | null;
    awayScore?: number | null;
};

/**
 * 토너먼트 시리즈를 라운드 1부터 순서대로 재계산해, 아직 "공개"(피더 시리즈의 결정 경기가
 * isFinal 게이팅을 통과)되지 않은 라운드의 higherSeedId/lowerSeedId를 강제로 'TBD'로 되돌린다.
 *
 * 서버는 결정 경기를 시뮬레이션한 즉시(리플레이 10분 대기 전) league.bracket_data.series에
 * 다음 라운드 진출팀을 채워 넣는다. 이 원본 데이터를 그대로 노출하면 "내 시리즈 리플레이를
 * 보기도 전에 다음 라운드 상대가 이미 정해져 있는" 스포일러가 된다. 브라켓 화면/일정 화면 등
 * 여러 뷰가 이 함수 하나로 동일하게 게이팅해야 한 곳만 고쳐도 전부 일관되게 반영된다.
 */
export function computeRevealedSeries(
    series: PlayoffSeries[],
    schedule: SeriesGameLike[],
    serverNowMs: number,
): Map<string, PlayoffSeries> {
    const winsMap: Record<string, Record<string, number>> = {};
    for (const g of schedule) {
        if (!g.seriesId || !g.played || g.homeScore == null || g.awayScore == null) continue;
        if (!isFinal(g, serverNowMs)) continue;
        const winnerId = g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
        if (!winsMap[g.seriesId]) winsMap[g.seriesId] = {};
        winsMap[g.seriesId][winnerId] = (winsMap[g.seriesId][winnerId] ?? 0) + 1;
    }

    const maxRound = series.reduce((mx, s) => Math.max(mx, s.round), 1);
    const gatedById = new Map<string, PlayoffSeries>();

    for (let round = 1; round <= maxRound; round++) {
        const roundSeries = series
            .filter(s => s.round === round)
            .sort((a, b) => seriesMatchIndex(a.id) - seriesMatchIndex(b.id));

        for (const s of roundSeries) {
            // BYE 시리즈는 애초에 경기가 없어 생성 시점에 즉시 확정되므로 그대로 통과.
            if (s.lowerSeedId === 'BYE') { gatedById.set(s.id, s); continue; }

            let higherSeedId = s.higherSeedId;
            let lowerSeedId  = s.lowerSeedId;

            if (round > 1) {
                const mIdx = seriesMatchIndex(s.id);
                const feederHigher = gatedById.get(`T_R${round - 1}_M${2 * mIdx}`);
                const feederLower  = gatedById.get(`T_R${round - 1}_M${2 * mIdx + 1}`);
                higherSeedId = feederHigher?.finished && feederHigher.winnerId ? feederHigher.winnerId : 'TBD';
                lowerSeedId  = feederLower?.finished  && feederLower.winnerId  ? feederLower.winnerId  : 'TBD';
            }

            const higherSeedWins = winsMap[s.id]?.[higherSeedId] ?? 0;
            const lowerSeedWins  = winsMap[s.id]?.[lowerSeedId]  ?? 0;
            const finished = higherSeedId !== 'TBD' && lowerSeedId !== 'TBD'
                && (higherSeedWins >= s.targetWins || lowerSeedWins >= s.targetWins);
            const winnerId = finished
                ? (higherSeedWins >= s.targetWins ? higherSeedId : lowerSeedId)
                : undefined;

            gatedById.set(s.id, { ...s, higherSeedId, lowerSeedId, higherSeedWins, lowerSeedWins, finished, winnerId });
        }
    }

    return gatedById;
}

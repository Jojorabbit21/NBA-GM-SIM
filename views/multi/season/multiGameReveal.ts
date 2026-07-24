
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
import type { Game } from '../../../types';

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

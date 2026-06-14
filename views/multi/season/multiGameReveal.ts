
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

// scheduledAt만 있으면 충분 — 호출부에서 game_pbp row 등 다른 출처의 값을
// 매번 `as Game`으로 캐스팅하지 않도록 필요한 필드만 받는다.
type ScheduledLike = Pick<Game, 'scheduledAt'>;

export function getGameDisplayState(game: ScheduledLike, serverNowMs: number): GameDisplayState {
    if (!game.scheduledAt) return 'final'; // 레거시(scheduledAt 없는 구 스케줄) → 항상 노출
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

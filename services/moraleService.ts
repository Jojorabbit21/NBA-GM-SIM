
import type { Player, PlayerMorale, MoraleEvent, MoraleEventType } from '../types/player';
import type { PlayerBoxScore } from '../types/engine';
import { getOVRThreshold } from '../utils/ovrUtils';

// ─────────────────────────────────────────────────────────────
// Player Morale (기분/사기) System
// score 50 = 중립 / 0~100 범위
// PBP 엔진: ((score - 50) / 50) * 0.018 → bonusHitRate 보정 (±1.8%p)
// ─────────────────────────────────────────────────────────────

const MAX_RECENT_EVENTS = 10;
const STAR_IGNORED_MP_THRESHOLD = 20; // 스타인데 20분 미만 출전 시 STAR_IGNORED

/** 0~100 클램프 */
function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

/**
 * 천장/바닥 감쇠:
 * score가 극단에 가까울수록 추가 변화 느리게
 * delta *= (1 - |score - 50| / 120)
 */
function applyDampening(score: number, delta: number): number {
    const factor = 1 - Math.abs(score - 50) / 120;
    return delta * Math.max(factor, 0);
}

/**
 * 경기 후 기분 업데이트
 * 호출: updatePopularityFromGame() 직후
 *
 * @param players  홈 또는 어웨이 팀 로스터
 * @param boxScores 해당 팀 박스스코어
 * @param teamWon  팀이 이겼는지 여부
 * @param date     경기 날짜 문자열 (YYYY-MM-DD)
 */
export function updateMoraleFromGame(
    players: Player[],
    boxScores: PlayerBoxScore[],
    teamWon: boolean,
    date: string,
): void {
    const boxMap = new Map(boxScores.map(b => [b.playerId, b]));

    for (const player of players) {
        const box = boxMap.get(player.id);
        if (!box) continue;

        // 초기값이 없으면 기본 생성
        if (!player.morale) {
            player.morale = generateInitialMorale();
        }

        const { pts, reb, ast, fga, fgm, mp } = box;

        // 벤치에서 한 번도 뛰지 않은 선수는 건너뜀
        if (mp < 1) continue;

        const events: MoraleEvent[] = [];

        // ── 팀 승패 ──
        events.push({
            type: teamWon ? 'TEAM_WIN' : 'TEAM_LOSS',
            delta: teamWon ? 0.4 : -0.3,
            date,
        });

        // ── 출전 시간 ──
        if (mp >= 32) {
            events.push({ type: 'MINUTES_HIGH', delta: 0.3, date });
        } else if (mp < 15) {
            events.push({ type: 'MINUTES_LOW', delta: -0.5, date });
        }

        // ── 개인 퍼포먼스 ──
        const fgPct = fga >= 5 ? fgm / fga : 0.5;
        const isGreat = pts >= 25 || (pts >= 15 && (reb >= 8 || ast >= 8));
        const isBad   = pts < 6 && fga >= 5 && fgPct < 0.30;

        if (isGreat) events.push({ type: 'GREAT_GAME', delta: 0.3, date });
        if (isBad)   events.push({ type: 'BAD_GAME',   delta: -0.2, date });

        // ── 스타 무시 페널티 ──
        const isStarIgnored = player.ovr >= getOVRThreshold('STAR') && mp < STAR_IGNORED_MP_THRESHOLD;
        if (isStarIgnored) events.push({ type: 'STAR_IGNORED', delta: -0.3, date });

        // ── delta 합산 및 감쇠 적용 ──
        let totalDelta = events.reduce((s, e) => s + e.delta, 0);
        totalDelta = applyDampening(player.morale.score, totalDelta);

        player.morale.score = clamp(player.morale.score + totalDelta, 0, 100);

        // 최근 이벤트 슬라이딩 윈도우 (10개 유지)
        player.morale.recentEvents = [
            ...events,
            ...player.morale.recentEvents,
        ].slice(0, MAX_RECENT_EVENTS);
    }
}

/**
 * 초기 기분값 생성 (50 ± 소량 지터)
 */
export function generateInitialMorale(): PlayerMorale {
    const jitter = Math.floor(Math.random() * 11) - 5; // -5~+5
    return {
        score: clamp(50 + jitter, 30, 70),
        recentEvents: [],
    };
}

/**
 * 오프시즌 기분 자연 수렴 (중립 50 방향으로 회귀)
 * 호출: decayPopularityOffseason() 직후 (playerAging.ts)
 */
export function decayMoraleOffseason(player: Player): void {
    if (!player.morale) return;

    const score = player.morale.score;
    const gap   = score - 50; // 중립에서 얼마나 벗어났는지

    // 중립 방향으로 gap의 20% 회귀 (최소 1포인트)
    const decay = Math.sign(gap) * Math.max(1, Math.abs(gap) * 0.2);
    player.morale.score = clamp(score - decay, 0, 100);
    // 오프시즌 후 이벤트 초기화
    player.morale.recentEvents = [];
}

// ─────────────────────────────────────────────────────────────
// 기분 라벨 (PlayerDetailView UI 표시용)
// ─────────────────────────────────────────────────────────────

export function getMoraleLabel(score: number): string {
    if (score >= 90) return '최고조';
    if (score >= 80) return '매우 좋음';
    if (score >= 70) return '좋음';
    if (score >= 60) return '괜찮음';
    if (score >= 50) return '보통';
    if (score >= 40) return '약간 침울';
    if (score >= 30) return '불만';
    if (score >= 20) return '매우 불만';
    if (score >= 10) return '사기 저하';
    return '위기';
}

export function getMoraleEventLabel(type: MoraleEventType): string {
    switch (type) {
        case 'TEAM_WIN':      return '팀 승리';
        case 'TEAM_LOSS':     return '팀 패배';
        case 'MINUTES_HIGH':  return '많은 출전 시간';
        case 'MINUTES_LOW':   return '적은 출전 시간';
        case 'GREAT_GAME':    return '좋은 경기';
        case 'BAD_GAME':      return '나쁜 경기';
        case 'STAR_IGNORED':  return '스타인데 벤치';
    }
}

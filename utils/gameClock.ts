
import type { PbpLog } from '../types/engine';
import { periodStartSec, periodLengthSec, countOvertimePeriods } from '../services/game/engine/pbp/periodRules';

export { countOvertimePeriods };

// PBP 로그(쿼터 + 남은 시간) → 경기 경과초. MultiGamePbpView.tsx(포제션 타임라인/PBP 시크바)와
// RotationChart.tsx(스틴트 +/- 계산)가 동일 정의를 각자 복붙하던 것을 통합.
// [2026-10-26] 연장(5분) 반영 — 엔진 periodRules.elapsedGameSec와 같은 축(정규시간은 기존 값과 동일).
// 옛 경기의 "5쿼터 0:00" 버저비터 로그(연장전 도입 전)는 3180초로 계산된다(이전 식은 3600초) — 둘 다 48분 밖.

export function parseTimeRemaining(t: string): number {
    const [m, s] = t.split(':').map(n => parseInt(n, 10) || 0);
    return m * 60 + s;
}

/** [2026-10-26] 샷 이벤트(quarter + 남은 초) → 경기 경과초 — toGameSeconds와 같은 축. */
export function shotGameSeconds(quarter: number, gameClockSec: number): number {
    return periodStartSec(quarter) + periodLengthSec(quarter) - gameClockSec;
}

export function toGameSeconds(log: Pick<PbpLog, 'quarter' | 'timeRemaining'>): number {
    return periodStartSec(log.quarter) + periodLengthSec(log.quarter) - parseTimeRemaining(log.timeRemaining);
}

/** [2026-10-26] 경기 전체 길이(초) — 정규 2880 + 연장 1회당 300. */
export function gameLengthSeconds(logs: Pick<PbpLog, 'teamId' | 'text'>[]): number {
    const ot = countOvertimePeriods(logs);
    return ot > 0 ? periodStartSec(4 + ot) + periodLengthSec(4 + ot) : periodStartSec(4) + periodLengthSec(4);
}

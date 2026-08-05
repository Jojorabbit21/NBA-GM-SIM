
import type { PbpLog } from '../types/engine';

// "쿼터(연장 포함) = 12분 고정"으로 단순화한 표시용 시간 변환 — MultiGamePbpView.tsx(포제션
// 타임라인/PBP 시크바)와 RotationChart.tsx(스틴트 +/- 계산)가 동일 정의를 각자 복붙하던 것을
// 통합. 실제 엔진 시간(연장 5분 등 가변 쿼터 길이)과는 다른 "표시 전용" 근사치임에 주의.

export function parseTimeRemaining(t: string): number {
    const [m, s] = t.split(':').map(n => parseInt(n, 10) || 0);
    return m * 60 + s;
}

export function toGameSeconds(log: Pick<PbpLog, 'quarter' | 'timeRemaining'>): number {
    return (log.quarter - 1) * 720 + (720 - parseTimeRemaining(log.timeRemaining));
}

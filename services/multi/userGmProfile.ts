/**
 * userGmProfile.ts — 멀티플레이어 "사람 단장" 호버 카드용 라벨 계산 (클라이언트 전용, 순수 함수).
 * 설계: docs/plan/multi-ai-gm-profile-plan.md 9장. AI 프런트(aiGmProfile.ts)와 달리 저장된 성향이 없으므로
 * 실제 행동에서 라벨을 뽑는다 — 성사된 트레이드 횟수(트레이드 방식), 현재 로스터 모양(로스터 성향).
 * 외부 import는 타입뿐이라 서버 미러가 필요 없다(서버는 이 라벨을 쓰지 않음).
 */
import type { RosterStyleLabel } from './aiGmProfile';

// ── 트레이드 방식: 성사된 트레이드 횟수 ─────────────────────────────────────────

export type TradeActivityLabel = 'idle' | 'cautious' | 'neutral' | 'active';

export const TRADE_ACTIVITY_LABEL_KO: Record<TradeActivityLabel, string> = {
    idle: '관망',
    cautious: '신중',
    neutral: '중립',
    active: '활발',
};

/** 구간 상한(포함): 0~2건 관망 / 3~5 신중 / 6~9 중립 / 10 이상 활발 (사용자 확정 2026-10-20) */
export const TRADE_ACTIVITY_MAX = { idle: 2, cautious: 5, neutral: 9 } as const;

export function classifyTradeActivity(tradeCount: number): TradeActivityLabel {
    if (tradeCount <= TRADE_ACTIVITY_MAX.idle) return 'idle';
    if (tradeCount <= TRADE_ACTIVITY_MAX.cautious) return 'cautious';
    if (tradeCount <= TRADE_ACTIVITY_MAX.neutral) return 'neutral';
    return 'active';
}

interface AcceptedOfferLike {
    id: string;
    from_team_id: string;
    to_team_id: string;
    status: string;
    resolved_as_admin?: boolean | null;
}

/** teamId(league_teams.id)가 당사자인 성사 트레이드 수. 관리자가 직접 처리한 건은 단장의 결정이 아니라 제외. */
export function countAcceptedTrades(offers: AcceptedOfferLike[], teamId: string): number {
    const ids = new Set<string>();
    for (const o of offers) {
        if (o.status !== 'accepted' || o.resolved_as_admin) continue;
        if (o.from_team_id === teamId || o.to_team_id === teamId) ids.add(o.id);
    }
    return ids.size;
}

// ── 로스터 성향: 현재 로스터의 스타 편중도(리그 상대 순위) ─────────────────────────

/** 상위 2명 평균 OVR − 3~8번째 평균 OVR. 3명 미만이면 null. */
export function starGapOf(ovrs: number[]): number | null {
    if (ovrs.length < 3) return null;
    const sorted = [...ovrs].sort((a, b) => b - a);
    const top = (sorted[0] + sorted[1]) / 2;
    const rest = sorted.slice(2, 8);
    return top - rest.reduce((s, v) => s + v, 0) / rest.length;
}

/**
 * 팀별 로스터 성향 라벨. 리그 안에서의 상대 평가 — 격차 상위 1/3 스타 중심, 하위 1/3 뎁스 중심, 나머지 균형.
 * 팀이 3개 미만이거나 격차가 전부 같으면 전부 균형(구분할 근거가 없음).
 */
export function computeRosterStyles(teams: { slug: string; ovrs: number[] }[]): Map<string, RosterStyleLabel> {
    const gaps = teams.map(t => ({ slug: t.slug, gap: starGapOf(t.ovrs) }));
    const valid = gaps.filter((g): g is { slug: string; gap: number } => g.gap != null);
    const result = new Map<string, RosterStyleLabel>(gaps.map(g => [g.slug, 'balanced']));
    if (valid.length < 3) return result;

    const sorted = valid.map(g => g.gap).sort((a, b) => a - b);
    const n = sorted.length;
    const lo = sorted[Math.ceil(n / 3) - 1];
    const hi = sorted[Math.floor((2 * n) / 3)];
    if (hi - lo < 1e-9) return result;

    for (const g of valid) {
        if (g.gap >= hi) result.set(g.slug, 'star');
        else if (g.gap <= lo) result.set(g.slug, 'depth');
    }
    return result;
}

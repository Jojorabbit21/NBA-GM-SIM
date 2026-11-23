import type { Player, GameTactics, DepthChart } from '../../types';

export type QuickSide = 'away' | 'home';
export const QUICK_SIDES: QuickSide[] = ['away', 'home'];
export const QUICK_SIDE_LABEL: Record<QuickSide, string> = { away: '원정', home: '홈' };

export const DEPTH_POSITIONS: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
export const DEPTH_LABELS = ['주전', '벤치', '써드'];
/** 슬롯 수 = 포지션 5 × 뎁스 3 = 로스터 최대 인원 */
export const DEPTH_SLOT_COUNT = 15;

export const emptyDepthChart = (): DepthChart => ({
    PG: [null, null, null], SG: [null, null, null], SF: [null, null, null], PF: [null, null, null], C: [null, null, null],
});

/**
 * 한 진영의 설정.
 * - candidates: 이 진영 뎁스 차트 드롭다운에 나오는 선수(팀 실제 로스터 + 선수 풀에서 추가한 선수). 슬롯에서 빼도 후보로 남는다.
 * - depthChart: 15슬롯 — 여기 들어간 선수가 경기 로스터이고, 2단계 뎁스 차트로 그대로 이어진다.
 * - tactics: 2단계 진입 시 만들어진다. tacticsDepthKey가 지금 뎁스 차트와 다르면(1단계에서 바뀜) 주전·로테이션을 다시 계산.
 */
export interface QuickSideState {
    teamId: string | null;
    candidates: Player[];
    depthChart: DepthChart;
    /** 사용자가 슬롯을 직접 바꿨는지 — 팀 변경 시 덮어쓰기 확인용 */
    customized: boolean;
    tactics: GameTactics | null;
    tacticsDepthKey: string | null;
}

export const emptySide = (): QuickSideState => ({
    teamId: null, candidates: [], depthChart: emptyDepthChart(), customized: false, tactics: null, tacticsDepthKey: null,
});

export const depthKey = (dc: DepthChart) => DEPTH_POSITIONS.map(p => dc[p].map(id => id ?? '').join(',')).join('|');

export const slottedIds = (dc: DepthChart): string[] => {
    const out: string[] = [];
    for (let d = 0; d < 3; d++) for (const p of DEPTH_POSITIONS) { const id = dc[p][d]; if (id) out.push(id); }
    return out;
};

/** 뎁스 차트 슬롯에 들어간 선수(주전 → 벤치 → 써드 순) */
export const slottedPlayers = (s: QuickSideState): Player[] => {
    const byId = new Map(s.candidates.map(p => [p.id, p]));
    return slottedIds(s.depthChart).map(id => byId.get(id)).filter((p): p is Player => !!p);
};

/** 선수를 빈 슬롯에 넣는다 — 본인 포지션의 주전 → 벤치 → 써드 순, 없으면 아무 빈 슬롯. 자리가 없으면 null */
export function placeInDepth(dc: DepthChart, player: Player): DepthChart | null {
    const positions = player.position.split('/').map(s => s.trim()) as (keyof DepthChart)[];
    const next: DepthChart = { PG: [...dc.PG], SG: [...dc.SG], SF: [...dc.SF], PF: [...dc.PF], C: [...dc.C] } as DepthChart;
    for (let d = 0; d < 3; d++) for (const p of positions) {
        if (next[p] && !next[p][d]) { next[p][d] = player.id; return next; }
    }
    for (let d = 0; d < 3; d++) for (const p of DEPTH_POSITIONS) {
        if (!next[p][d]) { next[p][d] = player.id; return next; }
    }
    return null;
}

export function removeFromDepth(dc: DepthChart, playerId: string): DepthChart {
    const next = emptyDepthChart();
    for (const p of DEPTH_POSITIONS) next[p] = dc[p].map(id => (id === playerId ? null : id)) as DepthChart[typeof p];
    return next;
}

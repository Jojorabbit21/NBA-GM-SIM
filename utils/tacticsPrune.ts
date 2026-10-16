// tacticsPrune.ts — 전술/뎁스차트에서 "현재 로스터에 없는 선수 ID"를 제거. [2026-10-16]
// 트레이드/방출 시 서버(SQL strip_players_from_tactics)가 나간 선수 ID만 지우는데, 접속 중이던
// 클라이언트의 메모리 상태엔 그 ID가 남아 있다가 저장 시 통째로 덮어써져 되돌아오는 걸 막는다.
// SQL 헬퍼(migrations/strip_players_from_tactics_instead_of_reset.sql)와 같은 규칙:
//   starters → '' / rotationMap·minutesLimits·playerTactics → 키 삭제 / stopperId → 삭제 /
//   depthChart → 해당 슬롯 null (순번 인덱스 보존). sliders 등 선수 ID와 무관한 필드는 그대로.
import type { DepthChart, GameTactics } from '../types';

const DEPTH_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

function pruneDepthChart(d: DepthChart, keep: Set<string>): DepthChart {
    const next = { ...d } as DepthChart;
    for (const pos of DEPTH_POSITIONS) {
        const col = d[pos];
        if (Array.isArray(col)) next[pos] = col.map(id => (id && !keep.has(id) ? null : id));
    }
    return next;
}

function pruneKeys<T>(rec: Record<string, T> | undefined, keep: Set<string>): Record<string, T> | undefined {
    if (!rec) return rec;
    return Object.fromEntries(Object.entries(rec).filter(([id]) => keep.has(id)));
}

export function pruneTacticsToRoster(
    tactics: GameTactics | null,
    depthChart: DepthChart | null,
    rosterIds: string[],
): { tactics: GameTactics | null; depthChart: DepthChart | null } {
    // 로스터가 비어있으면(로딩 중 등) 전부 지워버리지 않도록 그대로 반환
    if (rosterIds.length === 0) return { tactics, depthChart };
    const keep = new Set(rosterIds);

    let nextTactics = tactics;
    if (tactics) {
        nextTactics = { ...tactics };
        if (tactics.starters) {
            nextTactics.starters = Object.fromEntries(
                Object.entries(tactics.starters).map(([pos, id]) => [pos, id && !keep.has(id) ? '' : id]),
            ) as GameTactics['starters'];
        }
        if (tactics.rotationMap)   nextTactics.rotationMap   = pruneKeys(tactics.rotationMap, keep)!;
        if (tactics.minutesLimits) nextTactics.minutesLimits = pruneKeys(tactics.minutesLimits, keep)!;
        if (tactics.playerTactics) nextTactics.playerTactics = pruneKeys(tactics.playerTactics, keep);
        if (tactics.stopperId && !keep.has(tactics.stopperId)) delete nextTactics.stopperId;
        if (tactics.depthChart)    nextTactics.depthChart    = pruneDepthChart(tactics.depthChart, keep);
    }

    return { tactics: nextTactics, depthChart: depthChart ? pruneDepthChart(depthChart, keep) : depthChart };
}

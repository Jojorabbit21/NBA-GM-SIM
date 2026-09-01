
// 종료된 경기의 PTS/REB/AST 리더를 localStorage에 영구 캐싱.
// game_pbp row는 시뮬레이션 완료 시 1회 upsert된 뒤 갱신되지 않으므로(관리자 수동
// 재시뮬레이션 제외), 한 번 조회한 리더는 다시 조회할 필요가 없다.
// 설계 배경: docs/plan/schedule-leaders-cache-plan.md

import type { PlayerBoxScore } from '../../types/engine';

export interface StatLeader { name: string; value: number; position?: string }
export interface QuarterScores { home: number[]; away: number[] }
export interface MvpStatLine { label: string; value: number }
export interface GameMvp { playerId: string; name: string; position?: string; stats: MvpStatLine[] }
export interface GameLeaders {
    pts?: StatLeader; reb?: StatLeader; ast?: StatLeader; quarterScores?: QuarterScores;
    mvp?: GameMvp;
    /** 양 팀 각각의 최우수선수 — MultiScheduleView.tsx 리스트 뷰 "최우수선수" 컬럼(팀당 1명)용. */
    mvpHome?: GameMvp; mvpAway?: GameMvp;
}

// PlayerBoxScore[] (home_box/away_box) → 경기 전체(양 팀 통틀어) PTS/REB/AST 리더 1명씩 +
// 전체 MVP 1명 + 팀별 MVP 각 1명. MultiScheduleView.tsx/MultiSeasonPage.tsx가 공유(로직
// 중복 방지 — 타입도 이 파일에 있으니 같이 두는 게 자연스러움).
export function computeGameLeaders(homeBox: PlayerBoxScore[] | null, awayBox: PlayerBoxScore[] | null): GameLeaders {
    const all = [...(homeBox ?? []), ...(awayBox ?? [])];
    const topBy = (fn: (p: PlayerBoxScore) => number) =>
        all.reduce<PlayerBoxScore | null>((best, p) => (!best || fn(p) > fn(best) ? p : best), null);
    const ptsP = topBy(p => p.pts);
    const rebP = topBy(p => p.reb);
    const astP = topBy(p => p.ast);
    return {
        pts: ptsP ? { name: ptsP.playerName, value: ptsP.pts, position: ptsP.position } : undefined,
        reb: rebP ? { name: rebP.playerName, value: rebP.reb, position: rebP.position } : undefined,
        ast: astP ? { name: astP.playerName, value: astP.ast, position: astP.position } : undefined,
        mvp: bestFromBox(all),
        mvpHome: bestFromBox(homeBox),
        mvpAway: bestFromBox(awayBox),
    };
}

// NBA 공식 PIE(Player Impact Estimate) 분자 — "이 경기에서 발생한 전체 생산량 중 이 선수가
// 차지하는 비중"의 분자에 해당하는 raw 값. 실제 PIE는 이 값을 경기 전체 선수 합계로
// 나눠 정규화하지만, 여기서는 "누가 최댓값인지"만 필요하므로 나누기 전 raw 값 비교로 충분
// (분모는 모든 선수에게 동일해 대소 관계에 영향 없음).
function pieRaw(p: PlayerBoxScore): number {
    return p.pts + p.fgm + p.ftm - p.fga - p.fta + p.defReb + p.offReb / 2 + p.ast + p.stl + p.blk / 2 - p.pf - p.tov;
}

// "대표 스탯" 후보 — PTS/REB/AST/STL/BLK 중 이 선수가 실제로 두드러진 카테고리만 골라
// 보여준다. 임계값 미만이면 다른 스탯이 부족해도 억지로 채우지 않는다("1블록도 표시되면
// 신뢰도가 떨어진다"는 요구사항 — 항상 3~5개를 채우는 게 목표가 아니라, 두드러진 것만
// 최대 5개까지 노출).
const MVP_STAT_CANDIDATES: { key: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'; label: string; threshold: number }[] = [
    { key: 'pts', label: 'PTS', threshold: 10 },
    { key: 'reb', label: 'REB', threshold: 5 },
    { key: 'ast', label: 'AST', threshold: 5 },
    { key: 'stl', label: 'STL', threshold: 2 },
    { key: 'blk', label: 'BLK', threshold: 2 },
];

// box(선수 목록) → PIE 최댓값 선수 1명 + 그 선수의 두드러진 대표 스탯(최대 5개, 임계값
// 미만은 제외). computeGameMvp(전체 통합)/computeGameLeaders(팀별)가 공유하는 내부 헬퍼.
function bestFromBox(box: PlayerBoxScore[] | null): GameMvp | undefined {
    if (!box || box.length === 0) return undefined;

    let best = box[0];
    let bestScore = pieRaw(best);
    for (let i = 1; i < box.length; i++) {
        const score = pieRaw(box[i]);
        if (score > bestScore) { best = box[i]; bestScore = score; }
    }

    const stats = MVP_STAT_CANDIDATES
        .map(c => ({ label: c.label, value: best[c.key], threshold: c.threshold }))
        .filter(s => s.value >= s.threshold)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map(({ label, value }) => ({ label, value }));

    return { playerId: best.playerId, name: best.playerName, position: best.position, stats };
}

// PlayerBoxScore[] (home_box/away_box) → PIE 최댓값 선수 1명(양 팀 통틀어) —
// TeamScheduleCalendar.tsx "최우수선수" 컬럼용.
export function computeGameMvp(homeBox: PlayerBoxScore[] | null, awayBox: PlayerBoxScore[] | null): GameMvp | undefined {
    return bestFromBox([...(homeBox ?? []), ...(awayBox ?? [])]);
}

const keyFor = (roomId: string) => `nbagm:gameLeaders:${roomId}`;

export function loadGameLeadersCache(roomId: string): Record<string, GameLeaders> {
    try {
        const raw = localStorage.getItem(keyFor(roomId));
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {}; // 손상된 캐시는 빈 값으로 폴백 — 다음 조회에서 자연 복구
    }
}

export function mergeGameLeadersCache(
    roomId: string,
    updates: Record<string, GameLeaders>,
): Record<string, GameLeaders> {
    const merged = { ...loadGameLeadersCache(roomId), ...updates };
    try { localStorage.setItem(keyFor(roomId), JSON.stringify(merged)); } catch { /* 용량 초과 등 무시 */ }
    return merged;
}

// 토너먼트 리셋 시 호출 — 게임 ID가 T_R{round}_M{matchIndex} 형태로 위치 기반이라
// 리셋 후 같은 room.id로 새 토너먼트를 시작하면 예전과 동일한 game_id가 재사용된다.
export function clearGameLeadersCache(roomId: string): void {
    try { localStorage.removeItem(keyFor(roomId)); } catch { /* ignore */ }
}

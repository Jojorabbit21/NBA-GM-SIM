/**
 * tacticRepair.ts — AI 팀 전술/뎁스차트/로테이션 맵 사전 점검 + 최소 보정 (서버 전용)
 *
 * 경기 직전(simRunner)에 호출한다. 저장된 값을 통째로 재생성하지 않고, 깨진 부분만 메운다:
 *   1) 로스터에 없는 선수 ID 제거 (뎁스차트 → null, starters → '', rotationMap → 키 삭제)
 *   2) 분(0~47)당 출전 예정 인원이 5명 미만인 구간을 채움
 *      우선순위: 그 분에 빠져 있는 주전의 같은 포지션 백업(뎁스 1번 → 2번) → 그 외 건강한 선수
 *               (예정 분이 적은 순, 동률이면 OVR 높은 순)
 *   3) 맵 길이가 48이 아닌 항목은 48로 맞춤
 * 정상인 팀은 입력을 그대로 돌려준다(changed=false). 슬라이더/프리셋/playerTactics는 건드리지 않는다.
 *
 * 5명 초과(과다 편성)는 엔진이 OVR 순으로 5명을 자르는 의도된 동작이라 보정하지 않는다.
 */
import type { GameTactics, DepthChart } from '../../types/tactics.ts';
import type { Player } from '../../types.ts';
import { calculateOvr } from '../../utils/ovrUtils.ts';

const POSITIONS: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export interface TacticRepairResult {
    tactics: GameTactics;
    depthChart: DepthChart | null;
    changed: boolean;
    notes: string[];
}

export function repairAiTactics(
    roster: Player[],
    tacticsIn: GameTactics,
    depthChartIn: DepthChart | null,
): TacticRepairResult {
    const notes: string[] = [];
    const rosterIds = new Set(roster.map(p => String(p.id)));

    // 입력은 변경하지 않는다 — 깊은 복사본에서 작업
    const tactics: GameTactics = JSON.parse(JSON.stringify(tacticsIn));
    const depthChart: DepthChart | null = depthChartIn ? JSON.parse(JSON.stringify(depthChartIn)) : null;
    const rotationMap: Record<string, boolean[]> = tactics.rotationMap ?? {};
    tactics.rotationMap = rotationMap;

    // 1) 로스터 밖 선수 제거
    for (const id of Object.keys(rotationMap)) {
        if (!rosterIds.has(id)) { delete rotationMap[id]; notes.push(`map-ghost:${id}`); }
    }
    for (const dc of [depthChart, tactics.depthChart]) {
        if (!dc) continue;
        for (const pos of POSITIONS) {
            const slots = dc[pos];
            if (!Array.isArray(slots)) continue;
            slots.forEach((id, i) => {
                if (id && !rosterIds.has(id)) { slots[i] = null as any; notes.push(`depth-ghost:${id}`); }
            });
        }
    }
    if (tactics.starters) {
        for (const pos of POSITIONS) {
            const id = tactics.starters[pos];
            if (id && !rosterIds.has(id)) { tactics.starters[pos] = ''; notes.push(`starter-ghost:${id}`); }
        }
    }

    // 3) 맵 길이 정규화
    for (const [id, arr] of Object.entries(rotationMap)) {
        if (!Array.isArray(arr) || arr.length !== 48) {
            const fixed = Array(48).fill(false) as boolean[];
            if (Array.isArray(arr)) for (let i = 0; i < Math.min(48, arr.length); i++) fixed[i] = !!arr[i];
            rotationMap[id] = fixed;
            notes.push(`map-len:${id}`);
        }
    }

    // 2) 분당 5명 미만 구간 채움
    const effectiveDepth = depthChart ?? tactics.depthChart ?? null;
    const healthy = roster.filter(p => p.health !== 'Injured');
    const ovrOf = new Map<string, number>(healthy.map(p => [String(p.id), calculateOvr(p)]));
    const scheduledAt = (id: string, m: number) => !!rotationMap[id]?.[m];
    const totalMinutes = (id: string) => (rotationMap[id] ?? []).filter(Boolean).length;

    for (let m = 0; m < 48; m++) {
        const onIds = roster.filter(p => scheduledAt(String(p.id), m)).map(p => String(p.id));
        let need = 5 - onIds.length;
        if (need <= 0) continue;

        const pick = (id: string | null | undefined): boolean => {
            if (need <= 0 || !id || !rosterIds.has(id) || !ovrOf.has(id) || scheduledAt(id, m)) return false;
            if (!rotationMap[id]) rotationMap[id] = Array(48).fill(false);
            rotationMap[id][m] = true;
            need--;
            notes.push(`fill:${m}:${id}`);
            return true;
        };

        // (a) 이 분에 빠져 있는 주전의 같은 포지션 백업
        if (effectiveDepth) {
            for (const pos of POSITIONS) {
                const chart = effectiveDepth[pos] ?? [];
                const starter = chart[0];
                if (starter && scheduledAt(starter, m)) continue;
                for (let d = 1; d < chart.length && need > 0; d++) {
                    if (pick(chart[d])) break;
                }
            }
        }

        // (b) 그래도 모자라면 예정 분이 적은(=덜 쓴) 건강한 선수, 동률이면 OVR 높은 순
        if (need > 0) {
            const rest = healthy
                .map(p => String(p.id))
                .filter(id => !scheduledAt(id, m))
                .sort((a, b) => totalMinutes(a) - totalMinutes(b) || (ovrOf.get(b) ?? 0) - (ovrOf.get(a) ?? 0));
            for (const id of rest) { if (need <= 0) break; pick(id); }
        }
    }

    const changed = notes.length > 0;
    return { tactics: changed ? tactics : tacticsIn, depthChart: changed ? depthChart : depthChartIn, changed, notes };
}

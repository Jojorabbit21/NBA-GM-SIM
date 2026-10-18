// tacticPresetData.ts — 멀티 전술 프리셋 스냅샷 생성/적용 순수 함수. [2026-10-18]
// 뎁스 프리셋 = depthChart + starters + rotationMap + minutesLimits (뎁스차트·로테이션 탭이 편집하는 필드 전부)
// 팀 프리셋   = sliders (팀 전술 탭이 편집하는 필드 전부)
// 적용 시엔 현재 로스터에 없는 선수 ID를 pruneTacticsToRoster로 지운다 — 프리셋 저장 후 트레이드/방출된 선수.
import type { DepthChart, GameTactics } from '../types';
import type { DepthPresetData, TeamPresetData } from '../services/multi/tacticPresets';
import { DEFAULT_SLIDERS } from '../services/game/config/tacticPresets';
import { pruneTacticsToRoster } from './tacticsPrune';

export function buildDepthPresetData(tactics: GameTactics, depthChart: DepthChart | null): DepthPresetData {
    return {
        depthChart,
        starters: tactics.starters,
        rotationMap: tactics.rotationMap ?? {},
        minutesLimits: tactics.minutesLimits ?? {},
    };
}

export function buildTeamPresetData(tactics: GameTactics): TeamPresetData {
    return { sliders: { ...DEFAULT_SLIDERS, ...tactics.sliders } };
}

function presetPlayerIds(d: DepthPresetData): Set<string> {
    const ids = new Set<string>();
    for (const id of Object.values(d.starters ?? {})) if (id) ids.add(id);
    for (const id of Object.keys(d.rotationMap ?? {})) ids.add(id);
    for (const col of Object.values(d.depthChart ?? {})) {
        if (Array.isArray(col)) for (const id of col) if (id) ids.add(id);
    }
    return ids;
}

/** removedCount = 프리셋에 있었지만 현재 로스터에 없어 빠진 선수 수 */
export function applyDepthPreset(
    tactics: GameTactics, data: DepthPresetData, rosterIds: string[],
): { tactics: GameTactics; depthChart: DepthChart | null; removedCount: number } {
    const merged: GameTactics = {
        ...tactics,
        starters: { PG: '', SG: '', SF: '', PF: '', C: '', ...data.starters },
        rotationMap: data.rotationMap ?? {},
        minutesLimits: data.minutesLimits ?? {},
    };
    const pruned = pruneTacticsToRoster(merged, data.depthChart ?? null, rosterIds);
    const keep = new Set(rosterIds);
    const removedCount = rosterIds.length === 0
        ? 0
        : [...presetPlayerIds(data)].filter(id => !keep.has(id)).length;
    return { tactics: pruned.tactics ?? merged, depthChart: pruned.depthChart, removedCount };
}

export function applyTeamPreset(tactics: GameTactics, data: TeamPresetData): GameTactics {
    return { ...tactics, sliders: { ...DEFAULT_SLIDERS, ...data.sliders } };
}

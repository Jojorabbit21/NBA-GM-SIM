// tacticPresetData.ts — 멀티 전술 프리셋 스냅샷 생성/적용 순수 함수. [2026-10-18]
// 뎁스 프리셋 = depthChart + starters + rotationMap + minutesLimits (뎁스차트·로테이션 탭이 편집하는 필드 전부)
// 팀 프리셋   = sliders + altSliders/clutchSliders/sliderSchedule (팀 전술 탭이 편집하는 필드 전부, 2026-10-23 시간별 세트 추가)
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

/** 비교·저장용 정규형. 2번 전술이 없으면 1번 값으로 채운다(2026-10-23 프리셋 백필과 같은 규칙) —
 *  그래야 2번을 아직 안 만든 화면 값과 백필된 프리셋이 "같음"으로 판정된다(되돌리기 버튼·전환 confirm). */
export function buildTeamPresetData(tactics: GameTactics): TeamPresetData {
    const sliders = { ...DEFAULT_SLIDERS, ...tactics.sliders };
    const data: TeamPresetData = { sliders, altSliders: { ...sliders, ...tactics.altSliders } };
    // 없는 필드는 키 자체를 빼야 jsonEqual이 옛 값과 일치한다
    if (tactics.clutchSliders)  data.clutchSliders  = { ...DEFAULT_SLIDERS, ...tactics.clutchSliders };
    if (tactics.clutchSliders && tactics.clutchEnabled === false) data.clutchEnabled = false;
    if (tactics.sliderSchedule) data.sliderSchedule = tactics.sliderSchedule;
    const names = cleanSetNames(tactics.tacticSetNames);
    if (names) data.tacticSetNames = names;
    return data;
}

function cleanSetNames(n: GameTactics['tacticSetNames']): GameTactics['tacticSetNames'] {
    if (!n) return undefined;
    const out: NonNullable<GameTactics['tacticSetNames']> = {};
    if (typeof n.main === 'string' && n.main) out.main = n.main;
    if (typeof n.alt === 'string' && n.alt) out.alt = n.alt;
    return out.main || out.alt ? out : undefined;
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

/** 프리셋 = 팀 전술 전체 — 프리셋에 없는 클러치/타임라인/이름은 지운다(되돌리기도 이 함수 — 1·2번·타임라인·클러치·이름을 한 번에 복원). */
export function applyTeamPreset(tactics: GameTactics, data: TeamPresetData): GameTactics {
    const { altSliders: _a, clutchSliders: _c, clutchEnabled: _ce, sliderSchedule: _s, tacticSetNames: _n, ...rest } = tactics;
    const sliders = { ...DEFAULT_SLIDERS, ...data.sliders };
    // 2번이 없는 프리셋(백필 전 저장분)은 1번 값으로 채움
    const next: GameTactics = { ...rest, sliders, altSliders: { ...sliders, ...data.altSliders } };
    if (data.clutchSliders)  next.clutchSliders  = { ...DEFAULT_SLIDERS, ...data.clutchSliders };
    if (data.clutchSliders && data.clutchEnabled === false) next.clutchEnabled = false;
    if (data.sliderSchedule) next.sliderSchedule = data.sliderSchedule;
    const names = cleanSetNames(data.tacticSetNames);
    if (names) next.tacticSetNames = names;
    return next;
}

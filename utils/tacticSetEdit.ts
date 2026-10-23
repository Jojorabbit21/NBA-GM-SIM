// tacticSetEdit.ts — 팀 전술 화면에서 1번/2번/클러치 세트를 편집하는 순수 함수. [2026-10-23]
// 엔진 쪽 규칙(세트 선택·타임라인 문자열)은 services/game/engine/pbp/tacticSchedule.ts.
import type { GameTactics, TacticalSliders } from '../types';
import type { TacticSetId } from '../services/game/engine/pbp/tacticSchedule';
import { DEFAULT_SLIDERS } from '../services/game/config/tacticPresets';
import { normalizePresetName } from '../services/multi/tacticPresets';

export const DEFAULT_TACTIC_SET_LABELS: Record<TacticSetId, string> = {
    main: '1번 전술',
    alt: '2번 전술',
    clutch: '클러치 전술',
};

/** 표시 이름 — 1번/2번은 사용자 지정 이름(없으면 기본), 클러치는 고정. */
export function getSetLabel(tactics: GameTactics | null | undefined, set: TacticSetId): string {
    if (set === 'clutch') return DEFAULT_TACTIC_SET_LABELS.clutch;
    // 문자열만 이름으로 인정 — 조작된 값(객체 등)이 들어와도 렌더링이 깨지지 않게(DB도 tactic_set_names_valid로 차단)
    const name = tactics?.tacticSetNames?.[set];
    return typeof name === 'string' && name ? name : DEFAULT_TACTIC_SET_LABELS[set];
}

/** 이름 저장 — 프리셋 이름과 같은 정리 규칙(12자). 빈 값/기본 이름과 같으면 지정 해제. */
export function withSetName(tactics: GameTactics, set: 'main' | 'alt', raw: string): GameTactics {
    const name = normalizePresetName(raw);
    const names: NonNullable<GameTactics['tacticSetNames']> = {};
    for (const k of ['main', 'alt'] as const) {
        const v = tactics.tacticSetNames?.[k];
        if (typeof v === 'string' && v) names[k] = v;
    }
    if (!name || name === DEFAULT_TACTIC_SET_LABELS[set]) delete names[set];
    else names[set] = name;
    const { tacticSetNames: _prev, ...rest } = tactics;
    return names.main || names.alt ? { ...rest, tacticSetNames: names } : rest;
}

/** 화면에 보여줄 세트 슬라이더 — 아직 없는 2번/클러치는 1번 값을 그대로 보여준다. */
export function getSetSliders(tactics: GameTactics, set: TacticSetId): TacticalSliders {
    const main = { ...DEFAULT_SLIDERS, ...tactics.sliders };
    if (set === 'alt' && tactics.altSliders) return { ...DEFAULT_SLIDERS, ...tactics.altSliders };
    if (set === 'clutch' && tactics.clutchSliders) return { ...DEFAULT_SLIDERS, ...tactics.clutchSliders };
    return main;
}

/** 세트 슬라이더 저장. 2번은 처음 편집할 때 생긴다. 클러치는 체크박스로 켠 뒤에만 호출할 것. */
export function withSetSliders(tactics: GameTactics, set: TacticSetId, sliders: TacticalSliders): GameTactics {
    if (set === 'alt') return { ...tactics, altSliders: sliders };
    if (set === 'clutch') return { ...tactics, clutchSliders: sliders };
    return { ...tactics, sliders };
}

/** 클러치 사용 여부 — 값이 있고 체크 해제(clutchEnabled=false)가 아닐 때. 엔진 initializer와 같은 판정. */
export function isClutchOn(tactics: GameTactics | null | undefined): boolean {
    return !!tactics?.clutchSliders && tactics.clutchEnabled !== false;
}

/** 클러치 체크박스 — 켜면 저장된 값으로 재사용(처음이면 1번 값으로 생성), 끄면 값은 보존하고 사용만 끔. */
export function withClutchEnabled(tactics: GameTactics, on: boolean): GameTactics {
    const { clutchEnabled: _prev, ...rest } = tactics;
    if (!on) return tactics.clutchSliders ? { ...rest, clutchEnabled: false } : rest;
    return rest.clutchSliders ? rest : { ...rest, clutchSliders: getSetSliders(tactics, 'main') };
}

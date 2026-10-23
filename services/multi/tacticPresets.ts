// tacticPresets.ts — 멀티 리그 개인 전술 프리셋(뎁스차트·로테이션 3슬롯 / 팀 전술 3슬롯). [2026-10-18]
// 테이블: room_member_tactic_presets (migrations/add_room_member_tactic_presets.sql), RLS로 본인 행만.
// 프리셋은 "편집기에 불러오는 스냅샷"일 뿐 — 시뮬 서버는 이 테이블을 읽지 않고, 불러온 뒤
// 기존 저장 버튼(saveMemberTactics)을 눌러야 room_members.tactics/depth_chart에 반영된다.
import { supabase } from '../supabaseClient';
import type { DepthChart, GameTactics, TacticalSliders } from '../../types';

export type TacticPresetKind = 'depth' | 'team';

export const TACTIC_PRESET_SLOTS = [1, 2, 3] as const;
export type TacticPresetSlot = typeof TACTIC_PRESET_SLOTS[number];
export const TACTIC_PRESET_NAME_MAX = 12;

// DB check(room_member_tactic_presets_name_check)와 같은 규칙 — 여기서 먼저 정리해 정상 입력이 DB 에러로 튕기지 않게 한다.
// 유니코드 공백(NBSP·전각·U+2000~200A) → 일반 공백, 제어문자·제로폭·방향 제어(U+202A~202E 등)·BOM 제거,
// 줄바꿈(CR/LF/NEL/U+2028/2029)은 붙여넣기 대비 공백으로 바꾼 뒤 정리(이름에 줄바꿈 불허),
// 연속 공백 1칸, 앞뒤 trim, 최대 12 code point(DB char_length 기준 — UTF-16 길이 아님).
const PRESET_NAME_SPACES = /[\r\n\x85\u00A0\u2000-\u200A\u2028\u2029\u3000]/g;
// eslint-disable-next-line no-control-regex
const PRESET_NAME_FORBIDDEN = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g;

export function normalizePresetName(raw: string): string {
    const cleaned = raw.replace(PRESET_NAME_SPACES, ' ').replace(PRESET_NAME_FORBIDDEN, '').replace(/ {2,}/g, ' ').trim();
    return Array.from(cleaned).slice(0, TACTIC_PRESET_NAME_MAX).join('').trim();
}

export interface DepthPresetData {
    depthChart: DepthChart | null;
    starters: GameTactics['starters'];
    rotationMap: GameTactics['rotationMap'];
    minutesLimits: GameTactics['minutesLimits'];
}

export interface TeamPresetData {
    sliders: TacticalSliders;
    // [2026-10-23] 시간별 전술 세트 — 옛 프리셋엔 없음(불러오면 1번 전술 단독)
    altSliders?: TacticalSliders;
    clutchSliders?: TacticalSliders;
    sliderSchedule?: string;
    clutchEnabled?: boolean;
    tacticSetNames?: { main?: string; alt?: string };
}

export type TacticPresetData = DepthPresetData | TeamPresetData;

export interface MultiTacticPreset {
    kind: TacticPresetKind;
    slot: TacticPresetSlot;
    name: string;
    data: TacticPresetData;
    updatedAt: string;
}

export async function fetchTacticPresets(roomId: string, userId: string): Promise<MultiTacticPreset[]> {
    const { data, error } = await supabase
        .from('room_member_tactic_presets')
        .select('kind, slot, name, data, updated_at')
        .eq('room_id', roomId)
        .eq('user_id', userId);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
        kind: r.kind, slot: r.slot, name: r.name, data: r.data, updatedAt: r.updated_at,
    }));
}

export async function upsertTacticPreset(
    roomId: string, userId: string, kind: TacticPresetKind, slot: TacticPresetSlot, name: string, data: TacticPresetData,
): Promise<{ error: string | null }> {
    const safeName = normalizePresetName(name);
    if (!safeName) return { error: 'invalid preset name' };
    const { error } = await supabase
        .from('room_member_tactic_presets')
        .upsert(
            { room_id: roomId, user_id: userId, kind, slot, name: safeName, data, updated_at: new Date().toISOString() },
            { onConflict: 'room_id,user_id,kind,slot' },
        );
    return { error: error?.message ?? null };
}

export async function renameTacticPreset(
    roomId: string, userId: string, kind: TacticPresetKind, slot: TacticPresetSlot, name: string,
): Promise<{ error: string | null }> {
    const safeName = normalizePresetName(name);
    if (!safeName) return { error: 'invalid preset name' };
    const { error } = await supabase
        .from('room_member_tactic_presets')
        .update({ name: safeName, updated_at: new Date().toISOString() })
        .eq('room_id', roomId).eq('user_id', userId).eq('kind', kind).eq('slot', slot);
    return { error: error?.message ?? null };
}

export async function deleteTacticPreset(
    roomId: string, userId: string, kind: TacticPresetKind, slot: TacticPresetSlot,
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('room_member_tactic_presets')
        .delete()
        .eq('room_id', roomId).eq('user_id', userId).eq('kind', kind).eq('slot', slot);
    return { error: error?.message ?? null };
}

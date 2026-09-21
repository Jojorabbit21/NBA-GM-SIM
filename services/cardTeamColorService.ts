// cardTeamColorService.ts — 카드 전용 팀별 컬러(meta_card_team_colors) 읽기/쓰기.
// 읽기는 모든 사용자(드래프트 카드가 봄), 쓰기는 RLS로 고정 어드민만 통과한다.
// 행이 없는 팀은 호출부가 TEAM_COLORS(data/teamData.ts)로 폴백한다 — utils/cardBackground.ts 참고.
import { supabase } from './supabaseClient';
import type { CardTeamColor } from '../utils/cardBackground';

const COLS = 'team_id, gradient_from, gradient_to, gradient_angle, bg_image_url, bg_image_opacity, updated_at';
const BG_BUCKET = 'card-backgrounds';

export interface CardTeamColorRow extends CardTeamColor {
    team_id: string;
    updated_at: string;
}

/** 전 팀 오버라이드를 team_id → 컬러 맵으로. 행이 없는 팀은 맵에 없다. */
export async function fetchCardTeamColors(): Promise<Record<string, CardTeamColor>> {
    const { data, error } = await supabase
        .from('meta_card_team_colors')
        .select(COLS);
    if (error) throw error;
    const map: Record<string, CardTeamColor> = {};
    for (const row of (data ?? []) as CardTeamColorRow[]) {
        map[row.team_id] = {
            gradient_from: row.gradient_from,
            gradient_to: row.gradient_to,
            gradient_angle: row.gradient_angle,
            bg_image_url: row.bg_image_url ?? null,
            bg_image_opacity: row.bg_image_opacity ?? 100,
        };
    }
    return map;
}

/**
 * [2026-09-21] 팀 배경 이미지 업로드(WebP 권장, 5MB 이하) → 공개 URL. 저장은 upsertCardTeamColor로 따로.
 * 경로 teams/{teamId}/{timestamp}.{ext} — 컬렉션(cards/, {collectionId}/)과 같은 버킷의 별도 접두어.
 */
export async function uploadTeamBackground(teamId: string, blob: Blob, ext: string, contentType: string): Promise<string> {
    const path = `teams/${teamId}/${Date.now()}.${ext.replace(/^\./, '').toLowerCase()}`;
    const { error } = await supabase.storage.from(BG_BUCKET).upload(path, blob, { contentType, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(BG_BUCKET).getPublicUrl(path);
    return data.publicUrl;
}

/** 한 팀의 오버라이드 저장(없으면 생성, 있으면 덮어씀). */
export async function upsertCardTeamColor(teamId: string, color: CardTeamColor): Promise<void> {
    const { error } = await supabase
        .from('meta_card_team_colors')
        .upsert({
            team_id: teamId,
            gradient_from: color.gradient_from,
            gradient_to: color.gradient_to,
            gradient_angle: color.gradient_angle,
            bg_image_url: color.bg_image_url ?? null,
            bg_image_opacity: color.bg_image_opacity ?? 100,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'team_id' });
    if (error) throw error;
}

/** 오버라이드 삭제 → 그 팀은 다시 TEAM_COLORS 기본값으로 돌아간다. */
export async function deleteCardTeamColor(teamId: string): Promise<void> {
    const { error } = await supabase
        .from('meta_card_team_colors')
        .delete()
        .eq('team_id', teamId);
    if (error) throw error;
}

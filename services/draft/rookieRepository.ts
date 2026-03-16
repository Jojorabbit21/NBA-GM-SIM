/**
 * 생성 신인 선수 CRUD
 *
 * user_generated_players 테이블과의 상호작용을 담당한다.
 * 드래프트 클래스 생성, 드래프트 결과 반영, FA 조회 등.
 */

import { supabase } from '../supabaseClient';
import { GeneratedPlayerRow, GeneratedPlayerStatus } from '../../types/generatedPlayer';

// ── 조회 ──

/** 특정 유저의 모든 생성 선수 로드 */
export async function fetchUserGeneratedPlayers(userId: string): Promise<GeneratedPlayerRow[]> {
    const { data, error } = await supabase
        .from('user_generated_players')
        .select('*')
        .eq('user_id', userId);

    if (error) {
        console.error('❌ [rookieRepo] Failed to fetch generated players:', error);
        return [];
    }

    return (data ?? []).map(mapRow);
}

/** 특정 시즌의 드래프트 클래스 조회 */
export async function fetchDraftClass(userId: string, seasonNumber: number): Promise<GeneratedPlayerRow[]> {
    const { data, error } = await supabase
        .from('user_generated_players')
        .select('*')
        .eq('user_id', userId)
        .eq('season_number', seasonNumber);

    if (error) {
        console.error('❌ [rookieRepo] Failed to fetch draft class:', error);
        return [];
    }

    return (data ?? []).map(mapRow);
}

/** FA 상태인 생성 선수만 조회 */
export async function fetchGeneratedFreeAgents(userId: string): Promise<GeneratedPlayerRow[]> {
    const { data, error } = await supabase
        .from('user_generated_players')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'fa');

    if (error) {
        console.error('❌ [rookieRepo] Failed to fetch generated FAs:', error);
        return [];
    }

    return (data ?? []).map(mapRow);
}

// ── 저장 ──

/** 드래프트 클래스 일괄 삽입 (rookieGenerator 결과) */
export async function insertDraftClass(players: GeneratedPlayerRow[]): Promise<boolean> {
    if (players.length === 0) return true;

    const rows = players.map(p => ({
        id: p.id,
        user_id: p.user_id,
        season_number: p.season_number,
        draft_pick: p.draft_pick,
        draft_team_id: p.draft_team_id,
        status: p.status,
        base_attributes: p.base_attributes,
        age_at_draft: p.age_at_draft,
    }));

    const { error } = await supabase
        .from('user_generated_players')
        .insert(rows);

    if (error) {
        console.error('❌ [rookieRepo] Failed to insert draft class:', error);
        return false;
    }

    console.log(`✅ [rookieRepo] Inserted ${players.length} generated players.`);
    return true;
}

// ── 상태 업데이트 ──

/** 드래프트 결과 반영 (status, draft_pick, draft_team_id) */
export async function markAsDrafted(
    playerId: string,
    draftPick: number,
    teamId: string
): Promise<boolean> {
    const { error } = await supabase
        .from('user_generated_players')
        .update({
            status: 'drafted' as GeneratedPlayerStatus,
            draft_pick: draftPick,
            draft_team_id: teamId,
            updated_at: new Date().toISOString(),
        })
        .eq('id', playerId);

    if (error) {
        console.error('❌ [rookieRepo] Failed to mark as drafted:', error);
        return false;
    }
    return true;
}

/** 선수 상태 변경 (fa, retired 등) */
export async function updatePlayerStatus(
    playerId: string,
    status: GeneratedPlayerStatus
): Promise<boolean> {
    const { error } = await supabase
        .from('user_generated_players')
        .update({
            status,
            updated_at: new Date().toISOString(),
        })
        .eq('id', playerId);

    if (error) {
        console.error('❌ [rookieRepo] Failed to update status:', error);
        return false;
    }
    return true;
}

/** base_attributes 부분 업데이트 (age, contract 등 오프시즌 변경) */
export async function updateBaseAttributes(
    playerId: string,
    updates: Record<string, any>
): Promise<boolean> {
    // 기존 base_attributes를 읽고 머지
    const { data, error: readError } = await supabase
        .from('user_generated_players')
        .select('base_attributes')
        .eq('id', playerId)
        .single();

    if (readError || !data) {
        console.error('❌ [rookieRepo] Failed to read base_attributes:', readError);
        return false;
    }

    const merged = { ...data.base_attributes, ...updates };

    const { error } = await supabase
        .from('user_generated_players')
        .update({
            base_attributes: merged,
            updated_at: new Date().toISOString(),
        })
        .eq('id', playerId);

    if (error) {
        console.error('❌ [rookieRepo] Failed to update base_attributes:', error);
        return false;
    }
    return true;
}

// ── 헬퍼 ──

function mapRow(row: any): GeneratedPlayerRow {
    return {
        id: row.id,
        user_id: row.user_id,
        season_number: row.season_number,
        draft_pick: row.draft_pick ?? null,
        draft_team_id: row.draft_team_id ?? null,
        status: row.status,
        base_attributes: row.base_attributes,
        age_at_draft: row.age_at_draft,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

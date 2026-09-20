// playerCardAdminService.ts — 개인 팩 드래프트 "시즌 카드" 어드민 CRUD.
// docs/plan/tournament-personal-pack-draft-plan.md 후속(카드 바리에이션). meta_player_cards는
// meta_players와 완전히 분리된 테이블 — meta_players는 절대 쓰지 않는다(읽기만).
// 카드 1장 = 이 테이블의 row 1개(meta_players와 동일 shape의 독립 데이터, delta 아님) —
// mapRawPlayerToRuntimePlayer 등 기존 raw-row 하이드레이션 코드를 그대로 재사용할 수 있게.
import { supabase } from '../supabaseClient';

export interface PlayerCardRow {
    id: string;
    source_player_id: string;
    season: string;
    name: string;
    position: string;
    height: number | null;
    weight: number | null;
    base_team_id: string | null;
    base_attributes: Record<string, any>;
    tendencies: Record<string, any> | null;
    /** [2026-09-18] 카드 전용 OVR 고정값. null이면 지금처럼 base_attributes 기반 동적 계산(calculateOvr).
     *  meta_players/일반 선수 OVR 파이프라인과는 완전히 분리 — 이 카드에만 적용됨. */
    manual_ovr: number | null;
    /** [2026-09-20] 카드별 커스텀 배경 이미지. null이면 소속 컬렉션 배경 → 팀 그라디언트 폴백
     *  (utils/cardBackground.ts buildCardBackground). */
    bg_image_url: string | null;
    /** [2026-09-20] 에디션(meta_card_editions.id) — 필수. 같은 선수·시즌은 에디션별 1장(에디션 수만큼 무제한). */
    edition_id: string;
    created_at: string;
    updated_at: string;
}

const CARD_COLS = 'id, source_player_id, season, name, position, height, weight, base_team_id, base_attributes, tendencies, manual_ovr, bg_image_url, edition_id, created_at, updated_at';
const BG_BUCKET = 'card-backgrounds';
const CARD_BG_PREFIX = 'cards';

/** 특정 실제 선수(meta_players.id)의 카드 전체 — 시즌 오름차순 정렬은 문자열이라 완벽하지 않을 수 있음(참고용). */
export async function listCardsForPlayer(sourcePlayerId: string): Promise<PlayerCardRow[]> {
    const { data, error } = await supabase
        .from('meta_player_cards')
        .select(CARD_COLS)
        .eq('source_player_id', sourcePlayerId)
        .order('season');
    if (error) throw error;
    return data ?? [];
}

/** 이름으로 카드 검색(선수 이름 기준, 대소문자 무시) — 전역 카드 목록 탭용. */
export async function searchCards(query: string): Promise<PlayerCardRow[]> {
    let q = supabase.from('meta_player_cards').select(CARD_COLS).order('name').order('season');
    if (query.trim()) q = q.ilike('name', `%${query.trim()}%`);
    const { data, error } = await q.limit(500);
    if (error) throw error;
    return data ?? [];
}

export async function fetchCardById(id: string): Promise<PlayerCardRow | null> {
    const { data, error } = await supabase.from('meta_player_cards').select(CARD_COLS).eq('id', id).single();
    if (error) throw error;
    return data;
}

/**
 * meta_players에서 원본 선수 데이터를 읽어 새 카드 row로 "복사"한다 — base_attributes를
 * 포함해 전체를 깊은 복사(딥카피)하고 season 라벨만 붙인다. 실제 그 시즌의 레이팅이 DB에
 * 따로 있는 게 아니므로(career_history는 실제 박스스코어 통계일 뿐 36개 능력치가 아님),
 * 현재 레이팅을 "출발점 템플릿"으로 복사해 온 뒤 어드민이 그 시즌에 맞게 손으로 조정하는
 * 워크플로우를 전제로 한다 — updateCard()로 이어서 편집.
 */
export async function createCardFromCopy(sourcePlayerId: string, season: string, editionId: string): Promise<PlayerCardRow> {
    if (!editionId) throw new Error('에디션을 선택해주세요.');
    const { data: source, error: srcErr } = await supabase
        .from('meta_players')
        .select('id, name, position, height, weight, base_team_id, base_attributes, tendencies')
        .eq('id', sourcePlayerId)
        .single();
    if (srcErr) throw srcErr;
    if (!source) throw new Error('원본 선수를 찾을 수 없습니다.');

    const { data, error } = await supabase
        .from('meta_player_cards')
        .insert({
            source_player_id: sourcePlayerId,
            season: season.trim(),
            edition_id: editionId,
            name: source.name,
            position: source.position,
            height: source.height,
            weight: source.weight,
            base_team_id: source.base_team_id,
            base_attributes: JSON.parse(JSON.stringify(source.base_attributes ?? {})),
            tendencies: source.tendencies ? JSON.parse(JSON.stringify(source.tendencies)) : null,
        })
        .select(CARD_COLS)
        .single();
    if (error) throw error;
    return data;
}

export interface UpdateCardPatch {
    season?: string;
    name?: string;
    position?: string;
    height?: number | null;
    weight?: number | null;
    base_team_id?: string | null;
    base_attributes?: Record<string, any>;
    tendencies?: Record<string, any> | null;
    manual_ovr?: number | null;
    bg_image_url?: string | null;
    edition_id?: string;
}

export async function updateCard(id: string, patch: UpdateCardPatch): Promise<void> {
    const { error } = await supabase
        .from('meta_player_cards')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw error;
}

/**
 * 카드 배경 이미지 업로드(WebP 권장, 5MB 이하) → 공개 URL 반환. 저장은 호출부가
 * updateCard({ bg_image_url })로 따로 한다. 컬렉션 배경과 같은 버킷을 쓰되 경로를
 * cards/{cardId}/{timestamp}.{ext}로 나눠 삭제 시 카드 단위로 정리할 수 있게 한다.
 */
export async function uploadCardBackground(
    cardId: string,
    blob: Blob,
    ext: string,
    contentType: string,
): Promise<string> {
    const path = `${CARD_BG_PREFIX}/${cardId}/${Date.now()}.${ext.replace(/^\./, '').toLowerCase()}`;
    const { error } = await supabase.storage
        .from(BG_BUCKET)
        .upload(path, blob, { contentType, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(BG_BUCKET).getPublicUrl(path);
    return data.publicUrl;
}

/** 카드 폴더(cards/{cardId}/)의 배경 이미지 전부 삭제. 실패해도 카드 삭제는 막지 않는다(고아 파일만 남음). */
export async function removeCardBackgroundFiles(cardId: string): Promise<void> {
    const folder = `${CARD_BG_PREFIX}/${cardId}`;
    const { data: files, error } = await supabase.storage.from(BG_BUCKET).list(folder);
    if (error || !files?.length) return;
    await supabase.storage.from(BG_BUCKET).remove(files.map(f => `${folder}/${f.name}`));
}

export async function deleteCard(id: string): Promise<void> {
    const { error } = await supabase.from('meta_player_cards').delete().eq('id', id);
    if (error) throw error;
    // 카드 행이 지워진 뒤 스토리지 이미지 정리 — 실패는 무시(행 삭제가 우선)
    try { await removeCardBackgroundFiles(id); } catch { /* noop */ }
}

/** 선수의 career_history에서 시즌 라벨 목록만 뽑아온다(최근 시즌 먼저) — 시즌 선택 드롭다운용. */
export async function fetchAvailableSeasons(sourcePlayerId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('meta_players')
        .select('career_history')
        .eq('id', sourcePlayerId)
        .single();
    if (error) throw error;
    const rows = Array.isArray(data?.career_history) ? data!.career_history : [];
    const seasons = rows
        .map((r: any) => (typeof r?.season === 'string' ? r.season : null))
        .filter((s: string | null): s is string => !!s);
    // 중복 제거 + 최신 시즌 먼저(문자열 내림차순 — '2003-04' > '2000-01' 형식과 잘 맞음)
    return Array.from(new Set(seasons)).sort((a, b) => b.localeCompare(a));
}

/** 특정 시즌의 실제 박스스코어 라인(참고용, 레이팅 아님) — 카드 편집 중 옆에 보여주는 용도. */
export async function fetchSeasonStatLine(sourcePlayerId: string, season: string): Promise<Record<string, any> | null> {
    const { data, error } = await supabase
        .from('meta_players')
        .select('career_history')
        .eq('id', sourcePlayerId)
        .single();
    if (error) throw error;
    const rows = Array.isArray(data?.career_history) ? data!.career_history : [];
    return rows.find((r: any) => r?.season === season) ?? null;
}

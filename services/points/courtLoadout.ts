/**
 * courtLoadout — 인벤토리 장착 정보 → 코트 모습 (2026-11-18)
 *
 * 장착은 계정 단위(user_court_loadout, 칸 = shop_items.item_type). 그 계정이 맡은 모든 팀의 코트에 적용된다.
 * 코트 모습은 팀 행(league_teams.court_*)이 아니라 여기서만 정한다. 장착이 없는 칸은 기본값,
 * 주인이 없는 팀(AI)은 전부 기본값 = 하드 메이플 우드, 다른 색 없음(사용자 지시).
 * DDL·RPC: migrations/add_court_loadout.sql
 */
import { supabase } from '../supabaseClient';
import { actionFailure } from '../notifications/actionErrorCatalog';
import type { CourtLoadoutRow, CourtSlot, CourtStyle, ShopItemRow } from '../../types/points';
import type { CourtFloorData, CourtPaletteData, CourtRimData, CourtTextureData } from './pointsService';

/** 하드 메이플 스트립 바닥(1880×1000 WebP). 파일을 바꾸면 이름의 버전을 올린다(vercel.json 에서 1년 캐시). */
export const MAPLE_FLOOR_IMAGE = '/images/court/maple-strip-v1.webp';

/** 기본 코트 — 하드 메이플 우드, 페인트존·3점 안쪽 칠 없음. background 는 이미지가 뜨기 전 바탕색(메이플 평균색). */
export const DEFAULT_COURT_STYLE: CourtStyle = {
    background: '#DDBA95',
    floorImage: MAPLE_FLOOR_IMAGE,
    line: '#3E2C1C',
};

/** 장착 칸 순서와 표기 — 인벤토리 화면 섹션 순서 */
export const COURT_SLOTS: CourtSlot[] = ['court_floor', 'court_palette', 'court_texture', 'court_rim'];
export const SLOT_DEFAULT_LABEL: Record<CourtSlot, string> = {
    court_floor:   '기본 (하드 메이플)',
    court_palette: '팔레트 없음',
    court_texture: '질감 없음',
    court_rim:     '기본 림',
};

/** 낡은 우레탄 자국 겹 — 코트가 아주 어두우면 어두운 자국이 안 보여서 밝은(콘크리트색) 자국을 쓴다 */
const WEAR_DARK = '/images/court/urethane-wear-dark-v1.webp';
const WEAR_LIGHT = '/images/court/urethane-wear-light-v1.webp';
const luminance = (hex: string): number => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return 1;
    const c = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255).map(v => (v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)));
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
};

const SLOT_ORDER: Record<string, number> = { court_floor: 0, court_palette: 1, court_texture: 2, court_rim: 3 };

/**
 * 장착한 아이템들(칸별 하나) → 코트 모습. 모르는 종류·깨진 데이터는 건너뛰고 기본값을 둔다.
 * 규칙(2026-11-18): 플로어가 바닥(이미지 또는 단색)과 기본 라인을 정한다. 팔레트는 바닥이 이미지(나무·콘크리트, 기본 메이플 포함)면
 * 페인트존과 라인만 칠하고, 바닥이 단색(우레탄)이면 바닥·3점 안쪽·페인트존·라인을 모두 칠한다. 질감·림은 그 위에 얹는다.
 */
export function resolveCourtStyle(equipped: Pick<ShopItemRow, 'item_type' | 'data'>[]): CourtStyle {
    const style: CourtStyle = { ...DEFAULT_COURT_STYLE };
    let wear = false;
    const sorted = [...equipped].sort((a, b) => (SLOT_ORDER[a.item_type] ?? 9) - (SLOT_ORDER[b.item_type] ?? 9));
    for (const it of sorted) {
        if (it.item_type === 'court_floor') {
            const d = it.data as unknown as CourtFloorData;
            if (!d?.background || !d.line) continue;
            style.floorImage = d.image ?? null;
            style.background = d.background;
            style.three = d.three;
            style.paint = d.paint;
            style.line = d.line;
            wear = !!d.wear;
        } else if (it.item_type === 'court_palette') {
            const d = it.data as unknown as CourtPaletteData;
            if (!d?.background || !d.line) continue;
            if (!style.floorImage) {
                style.background = d.background;
                style.three = d.three;
            }
            style.paint = d.paint;
            style.line = d.line;
        } else if (it.item_type === 'court_texture') {
            const d = it.data as unknown as CourtTextureData;
            if (d?.texture) style.texture = d.texture;
        } else if (it.item_type === 'court_rim') {
            const d = it.data as unknown as CourtRimData;
            if (d?.rim) { style.rim = d.rim; style.backboard = d.backboard; }
        }
    }
    if (wear) {
        const dark = (luminance(style.background) + luminance(style.paint ?? style.background)) / 2 < .06;
        style.wearImage = dark ? WEAR_LIGHT : WEAR_DARK;
    }
    return style;
}

/** 상점·인벤토리 미리보기 — 아이템 하나만 기본 코트 위에 얹은 모습 */
export const previewCourtStyle = (item: Pick<ShopItemRow, 'item_type' | 'data'>): CourtStyle => resolveCourtStyle([item]);

export interface LoadoutEntry extends CourtLoadoutRow {
    item: Pick<ShopItemRow, 'id' | 'item_type' | 'name' | 'data'> | null;
}

/** 한 계정의 장착 정보. 비활성(판매 종료) 상품은 shop_items RLS 때문에 item 이 null → 기본값으로 그린다. */
export async function fetchCourtLoadout(userId: string): Promise<LoadoutEntry[]> {
    const { data, error } = await supabase
        .from('user_court_loadout')
        .select('user_id, slot, item_id, updated_at, item:shop_items(id, item_type, name, data)')
        .eq('user_id', userId);
    if (error) throw error;
    return (data ?? []) as unknown as LoadoutEntry[];
}

export const loadoutStyle = (entries: LoadoutEntry[] | undefined | null): CourtStyle =>
    resolveCourtStyle((entries ?? []).flatMap(e => (e.item ? [e.item] : [])));

function equipErrorMessage(error: { message?: string }): string {
    const msg = error.message ?? '';
    if (msg.includes('not_owned'))     return '보유하지 않은 아이템입니다.';
    if (msg.includes('slot_mismatch')) return '이 칸에 장착할 수 없는 아이템입니다.';
    if (msg.includes('item_not_found')) return '없는 아이템입니다.';
    return actionFailure(error, '장착');
}

/** itemId null = 그 칸 해제(기본값으로) */
export async function equipCourtItem(userId: string, slot: CourtSlot, itemId: string | null): Promise<{ error: string | null }> {
    const { error } = await supabase.rpc('equip_court_item', { p_user_id: userId, p_slot: slot, p_item_id: itemId });
    return { error: error ? equipErrorMessage(error) : null };
}

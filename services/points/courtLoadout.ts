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
import type { CourtLoadoutRow, CourtPaintRow, CourtSlot, CourtStyle, PaintZone, ShopItemRow } from '../../types/points';
import type { CourtFloorData, CourtPaintData, CourtPaletteData, CourtRimData, CourtTextureData } from './pointsService';

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
const WEAR_DARK = '/images/court/urethane-wear-dark-v2.webp';
const WEAR_LIGHT = '/images/court/urethane-wear-light-v2.webp';
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

// ── 페인트 (2026-11-18) ──
// 색별 소모품(court_paint)을 구역마다 정해진 개수만큼 써서 칠한다. 칠은 플로어마다 따로 남는다(user_court_paint).
// 필요 개수는 서버 RPC paint_court_zone 과 같은 값 — 바꾸면 migrations/add_court_paint.sql 의 함수도 같이.
export const DEFAULT_FLOOR_ID = 'default';
export const PAINT_ZONES: { key: PaintZone; label: string; cost: number }[] = [
    { key: 'outside', label: '3점 라인 바깥', cost: 10 },
    { key: 'inside',  label: '3점 라인 안쪽', cost: 6 },
    { key: 'paint',   label: '페인트존',      cost: 3 },
    { key: 'line',    label: '라인',          cost: 2 },
];

/** 지금 장착한 플로어의 id(없으면 기본 코트) — 칠을 찾는 열쇠 */
export const equippedFloorId = (entries: LoadoutEntry[] | undefined | null): string =>
    (entries ?? []).find(e => e.slot === 'court_floor')?.item_id ?? DEFAULT_FLOOR_ID;

export const paintColor = (item: { data: Record<string, unknown> } | null | undefined): string | null => {
    const c = (item?.data as unknown as CourtPaintData | undefined)?.color;
    return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null;
};

/** 플로어가 정한 모습 위에 그 플로어의 칠을 얹는다. 3점 안쪽만 칠하고 페인트존 색이 없으면 페인트존은 비운다(바닥이 보임) */
export function applyCourtPaint(style: CourtStyle, paints: CourtPaintRow[] | undefined | null, floorId: string): CourtStyle {
    const mine = (paints ?? []).filter(p => p.floor_id === floorId);
    if (mine.length === 0) return style;
    const next: CourtStyle = { ...style };
    for (const p of mine) {
        const color = paintColor(p.item);
        if (!color) continue;
        if (p.zone === 'outside') next.outside = color;
        else if (p.zone === 'inside') next.three = color;
        else if (p.zone === 'paint') next.paint = color;
        else if (p.zone === 'line') next.line = color;
    }
    const insidePainted = mine.some(p => p.zone === 'inside' && paintColor(p.item));
    if (insidePainted && !next.paint) next.threeCutout = true;
    return next;
}

export async function fetchCourtPaint(userId: string): Promise<CourtPaintRow[]> {
    const { data, error } = await supabase
        .from('user_court_paint')
        .select('user_id, floor_id, zone, item_id, item:shop_items(id, name, data)')
        .eq('user_id', userId);
    if (error) throw error;
    return (data ?? []) as unknown as CourtPaintRow[];
}

function paintErrorMessage(error: { message?: string }, what: string): string {
    const msg = error.message ?? '';
    if (msg.includes('insufficient_paint')) return '페인트가 모자랍니다.';
    if (msg.includes('floor_not_owned'))    return '보유하지 않은 플로어입니다.';
    if (msg.includes('not_paint'))          return '페인트가 아닌 아이템입니다.';
    return actionFailure(error, what);
}

/** 구역을 칠한다 — 그 색 페인트를 구역의 필요 개수만큼 소모 */
export async function paintCourtZone(userId: string, floorId: string, zone: PaintZone, itemId: string): Promise<{ error: string | null }> {
    const { error } = await supabase.rpc('paint_court_zone', { p_user_id: userId, p_floor_id: floorId, p_zone: zone, p_item_id: itemId });
    return { error: error ? paintErrorMessage(error, '칠하기') : null };
}

/** 구역의 칠을 지운다 — 페인트는 돌아오지 않는다 */
export async function clearCourtZone(userId: string, floorId: string, zone: PaintZone): Promise<{ error: string | null }> {
    const { error } = await supabase.rpc('clear_court_zone', { p_user_id: userId, p_floor_id: floorId, p_zone: zone });
    return { error: error ? paintErrorMessage(error, '칠 지우기') : null };
}

/** 장착 정보(+ 그 플로어의 칠) → 코트 모습 */
export const loadoutStyle = (entries: LoadoutEntry[] | undefined | null, paints?: CourtPaintRow[] | null): CourtStyle =>
    applyCourtPaint(resolveCourtStyle((entries ?? []).flatMap(e => (e.item ? [e.item] : []))), paints, equippedFloorId(entries));

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

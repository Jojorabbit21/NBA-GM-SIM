import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Check, Loader2 } from 'lucide-react';
import { useGame } from '../hooks/useGameContext';
import { COURT_LOADOUT_KEY, useCourtLoadout, useOwnedItems, useShopItems } from '../hooks/usePoints';
import { ITEM_TYPE_LABEL, RARITY_BADGE_CLASS, RARITY_LABEL, RARITY_ORDER } from '../services/points/pointsService';
import { COURT_SLOTS, DEFAULT_COURT_STYLE, SLOT_DEFAULT_LABEL, equipCourtItem, previewCourtStyle } from '../services/points/courtLoadout';
import { CourtPreview } from '../components/multi/CourtPreview';
import { InlineNotice } from '../components/common/InlineNotice';
import { Button } from '../components/common/Button';
import type { CourtSlot, CourtStyle, ShopItemRow } from '../types/points';

// 인벤토리 — /inventory (2026-11-18). 홈 계정 영역의 "상점" 옆에서 들어온다.
// 보유 아이템을 칸별로 보여주고 장착한다. 장착은 계정 단위라 내가 맡은 모든 팀의 코트에 적용된다.
// 칸마다 맨 앞은 기본값(장착 해제) 카드. 장착 정보: user_court_loadout / equip_court_item (migrations/add_court_loadout.sql)
const BACKGROUND_IMAGE = '/images/background/background.webp';

const CourtCard: React.FC<{
    style: CourtStyle;
    name: string;
    item?: ShopItemRow;
    equipped: boolean;
    busy: boolean;
    disabled: boolean;
    onEquip: () => void;
}> = ({ style, name, item, equipped, busy, disabled, onEquip }) => (
    <div className={`bg-slate-900/60 border rounded-xl overflow-hidden flex flex-col ${equipped ? 'border-emerald-500/60' : 'border-slate-800'}`}>
        <svg viewBox="0 0 940 500" className="w-full h-auto block" role="img" aria-label={name}>
            <CourtPreview {...style} />
        </svg>
        <div className="p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold text-white truncate">{name}</span>
                {item && (
                    <span className={`ml-auto shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded border ${RARITY_BADGE_CLASS[item.rarity]}`}>
                        {RARITY_LABEL[item.rarity]}
                    </span>
                )}
            </div>
            {equipped ? (
                <div className="h-8 flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
                    <Check size={14} /> 장착 중
                </div>
            ) : (
                <Button size="md" variant="secondary" fullWidth onClick={onEquip} isLoading={busy} disabled={disabled}>장착</Button>
            )}
        </div>
    </div>
);

const InventoryPage: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { session } = useGame();
    const userId = session?.user?.id ?? null;

    const { data: items, isLoading: itemsLoading, error: itemsError } = useShopItems(!!userId);
    const { data: owned, isLoading: ownedLoading } = useOwnedItems(userId);
    const { data: loadout, style: myCourt, isLoading: loadoutLoading } = useCourtLoadout(userId);

    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    // 칸별 보유 아이템(카탈로그에 있는 것만 — 판매 종료 상품은 카탈로그 RLS 로 보이지 않는다)
    const ownedBySlot = useMemo(() => {
        const ids = new Set((owned ?? []).map(o => o.item_id));
        const by = new Map<string, ShopItemRow[]>();
        for (const it of items ?? []) {
            if (!ids.has(it.id)) continue;
            if (!by.has(it.item_type)) by.set(it.item_type, []);
            by.get(it.item_type)!.push(it);
        }
        for (const list of by.values()) {
            list.sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.sort - b.sort);
        }
        return by;
    }, [items, owned]);

    // 판매 상품이 하나도 없는 칸은 숨긴다(2026-11-18 상점을 플로어만 남김 — 팔레트·질감·림 칸은 상품이 생기면 다시 보인다)
    const slots = useMemo(() => COURT_SLOTS.filter(slot => (items ?? []).some(it => it.item_type === slot)), [items]);

    const equippedBySlot = useMemo(() => new Map((loadout ?? []).map(e => [e.slot, e.item_id])), [loadout]);

    const equip = async (slot: CourtSlot, itemId: string | null) => {
        if (!userId) return;
        const key = `${slot}:${itemId ?? 'default'}`;
        setBusyKey(key); setErr(null);
        const { error } = await equipCourtItem(userId, slot, itemId);
        setBusyKey(null);
        if (error) { setErr(error); return; }
        qc.invalidateQueries({ queryKey: COURT_LOADOUT_KEY(userId) });
    };

    const loading = itemsLoading || ownedLoading || loadoutLoading;

    return (
        <div className="min-h-screen relative overflow-x-hidden bg-slate-950 pretendard">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black" />
            <div className="absolute inset-0 bg-cover bg-center scale-110 blur-sm" style={{ backgroundImage: `url(${BACKGROUND_IMAGE})` }} />
            <div className="absolute inset-0 bg-black/55" />

            <div className="relative z-10 max-w-5xl mx-auto px-4 pt-[6vh] pb-10">
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-300">
                    {/* 헤더: ← 홈 · 인벤토리 */}
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors">
                            <ChevronLeft size={16} />
                            <span className="ko-normal">홈</span>
                        </button>
                        <h1 className="text-lg font-black text-white ko-tight">인벤토리</h1>
                    </div>

                    {!userId && <InlineNotice tone="info">로그인하면 인벤토리를 볼 수 있습니다.</InlineNotice>}
                    {err && <InlineNotice tone="danger" onDismiss={() => setErr(null)}>{err}</InlineNotice>}
                    {userId && itemsError && <InlineNotice tone="danger">아이템 목록을 불러오지 못했습니다.</InlineNotice>}

                    {/* 내 코트 — 지금 장착한 모습 */}
                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-white ko-tight">내 코트</h2>
                        <div className="rounded-xl overflow-hidden border border-slate-800 max-w-2xl">
                            <svg viewBox="0 0 940 500" className="w-full h-auto block" role="img" aria-label="장착한 코트">
                                <CourtPreview {...myCourt} />
                            </svg>
                        </div>
                    </section>

                    {userId && (loading ? (
                        <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-600" /></div>
                    ) : slots.map(slot => {
                        const list = ownedBySlot.get(slot) ?? [];
                        const current = equippedBySlot.get(slot) ?? null;
                        const anyBusy = busyKey !== null;
                        return (
                            <section key={slot} className="space-y-3">
                                <h2 className="text-base font-bold text-white ko-tight">{ITEM_TYPE_LABEL[slot] ?? slot}</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <CourtCard
                                        style={DEFAULT_COURT_STYLE}
                                        name={SLOT_DEFAULT_LABEL[slot]}
                                        equipped={current === null}
                                        busy={busyKey === `${slot}:default`}
                                        disabled={anyBusy}
                                        onEquip={() => equip(slot, null)}
                                    />
                                    {list.map(item => (
                                        <CourtCard
                                            key={item.id}
                                            style={previewCourtStyle(item)}
                                            name={item.name}
                                            item={item}
                                            equipped={current === item.id}
                                            busy={busyKey === `${slot}:${item.id}`}
                                            disabled={anyBusy}
                                            onEquip={() => equip(slot, item.id)}
                                        />
                                    ))}
                                </div>
                            </section>
                        );
                    }))}
                </div>
            </div>
        </div>
    );
};

export default InventoryPage;

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Check, Loader2 } from 'lucide-react';
import { useGame } from '../hooks/useGameContext';
import { OWNED_ITEMS_KEY, POINTS_LEDGER_KEY, POINTS_WALLET_KEY, useOwnedItems, useShopItems, useWallet } from '../hooks/usePoints';
import {
    ITEM_TYPE_LABEL, POINTS_ICON_URL, RARITY_BADGE_CLASS, RARITY_LABEL, RARITY_ORDER, formatPoints, purchaseItem,
    type CourtPaletteData, type CourtRimData, type CourtTextureData,
} from '../services/points/pointsService';
import { CourtPreview } from '../components/multi/CourtPreview';
import { FALLBACK_COURT_COLORS } from '../services/multi/courtDefaults';
import { InlineNotice } from '../components/common/InlineNotice';
import { Button } from '../components/common/Button';
import type { ShopItemRow } from '../types/points';

// 상점 — /shop. 코스메틱은 계정 귀속이라 리그 밖(홈)에서 들어온다(StartMenu 계정 영역 "상점" 버튼).
// 1차 범위는 코트 디자인(팔레트·질감·림 세트)만. 장착은 리그 안 팀 설정(코트 탭)에서 — 여기서는 구매·보유 표시만.
// 2026-11-09 현재 구매는 PURCHASES_ENABLED=false 로 잠금(카탈로그만 공개).
// 계획: docs/plan/points-system-plan.md "상점"
const BACKGROUND_IMAGE = '/images/background/background.webp';

// [2026-11-09] 구매 잠금 — 컨텐츠(아바타 등)를 더 채운 뒤 열기로 함. false 면 모든 구매 버튼 비활성 + 안내 한 줄.
// 카탈로그 조회·보유 표시는 그대로. 해제는 이 값만 true 로.
const PURCHASES_ENABLED = false;

const ITEM_TYPE_ORDER = ['court_palette', 'court_texture', 'court_rim'];

function previewProps(item: ShopItemRow) {
    if (item.item_type === 'court_palette') {
        const d = item.data as unknown as CourtPaletteData;
        return { background: d.background, three: d.three, paint: d.paint, line: d.line };
    }
    if (item.item_type === 'court_texture') {
        const d = item.data as unknown as CourtTextureData;
        return { ...FALLBACK_COURT_COLORS, texture: d.texture };
    }
    if (item.item_type === 'court_rim') {
        const d = item.data as unknown as CourtRimData;
        return { ...FALLBACK_COURT_COLORS, rim: d.rim, backboard: d.backboard };
    }
    return { ...FALLBACK_COURT_COLORS };
}

const ShopPage: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { session } = useGame();
    const userId = session?.user?.id ?? null;

    const { data: wallet } = useWallet(userId);
    const { data: items, isLoading: itemsLoading, error: itemsError } = useShopItems();
    const { data: owned } = useOwnedItems(userId);
    const ownedIds = useMemo(() => new Set((owned ?? []).map(o => o.item_id)), [owned]);

    const [pendingId, setPendingId] = useState<string | null>(null);   // 확인 단계인 상품
    const [buyingId, setBuyingId] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [okMsg, setOkMsg] = useState<string | null>(null);

    const groups = useMemo(() => {
        const by = new Map<string, ShopItemRow[]>();
        for (const it of items ?? []) {
            if (!by.has(it.item_type)) by.set(it.item_type, []);
            by.get(it.item_type)!.push(it);
        }
        for (const list of by.values()) {
            list.sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.sort - b.sort || a.price - b.price);
        }
        return [...by.entries()].sort((a, b) => ITEM_TYPE_ORDER.indexOf(a[0]) - ITEM_TYPE_ORDER.indexOf(b[0]));
    }, [items]);

    const confirmBuy = async (item: ShopItemRow) => {
        if (!userId) return;
        setBuyingId(item.id); setErr(null); setOkMsg(null);
        const { data, error } = await purchaseItem(userId, item.id);
        setBuyingId(null); setPendingId(null);
        if (error) { setErr(error); return; }
        setOkMsg(`${item.name} 구매 완료. 잔액 ${formatPoints(data!.balance)}`);
        qc.invalidateQueries({ queryKey: POINTS_WALLET_KEY(userId) });
        qc.invalidateQueries({ queryKey: OWNED_ITEMS_KEY(userId) });
        qc.invalidateQueries({ queryKey: POINTS_LEDGER_KEY(userId, 5) });
    };

    return (
        <div className="min-h-screen relative overflow-x-hidden bg-slate-950 pretendard">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black" />
            <div className="absolute inset-0 bg-cover bg-center scale-110 blur-sm" style={{ backgroundImage: `url(${BACKGROUND_IMAGE})` }} />
            <div className="absolute inset-0 bg-black/55" />

            <div className="relative z-10 max-w-5xl mx-auto px-4 pt-[6vh] pb-10">
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-300">
                    {/* 헤더: ← 홈 · 상점 · 잔액 */}
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors">
                            <ChevronLeft size={16} />
                            <span className="ko-normal">홈</span>
                        </button>
                        <h1 className="text-lg font-black text-white ko-tight">상점</h1>
                        <div className="ml-auto flex items-center gap-2">
                            <img src={POINTS_ICON_URL} alt="" width={18} height={18} />
                            <span className="text-sm font-bold text-white tabular-nums">{wallet ? formatPoints(wallet.balance) : '—'}</span>
                        </div>
                    </div>

                    {!PURCHASES_ENABLED ? (
                        <InlineNotice tone="info">상품 구매는 준비 중입니다.</InlineNotice>
                    ) : !userId && (
                        <InlineNotice tone="info">로그인하면 구매할 수 있습니다.</InlineNotice>
                    )}
                    {err && <InlineNotice tone="danger" onDismiss={() => setErr(null)}>{err}</InlineNotice>}
                    {okMsg && <InlineNotice tone="success" autoHideMs={4000}>{okMsg}</InlineNotice>}
                    {itemsError && <InlineNotice tone="danger">상품 목록을 불러오지 못했습니다.</InlineNotice>}

                    {itemsLoading ? (
                        <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-600" /></div>
                    ) : groups.length === 0 ? (
                        <p className="py-10 text-center text-sm text-slate-500">판매 중인 상품이 없습니다.</p>
                    ) : groups.map(([type, list]) => (
                        <section key={type} className="space-y-3">
                            <h2 className="text-base font-bold text-white ko-tight">{ITEM_TYPE_LABEL[type] ?? type}</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {list.map(item => {
                                    const isOwned = ownedIds.has(item.id);
                                    const isPending = pendingId === item.id;
                                    const isBuying = buyingId === item.id;
                                    const canAfford = (wallet?.balance ?? 0) >= item.price;
                                    return (
                                        <div key={item.id} className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                                            <svg viewBox="0 0 940 500" className="w-full h-auto block" role="img" aria-label={item.name}>
                                                <CourtPreview {...previewProps(item)} />
                                            </svg>
                                            <div className="p-3 flex flex-col gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-sm font-bold text-white truncate">{item.name}</span>
                                                    <span className={`ml-auto shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded border ${RARITY_BADGE_CLASS[item.rarity]}`}>
                                                        {RARITY_LABEL[item.rarity]}
                                                    </span>
                                                </div>
                                                {isOwned ? (
                                                    <div className="h-8 flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
                                                        <Check size={14} /> 보유 중
                                                    </div>
                                                ) : isPending ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs text-slate-400 flex-1 ko-normal">{formatPoints(item.price)}로 구매할까요?</span>
                                                        <Button size="sm" variant="primary" onClick={() => confirmBuy(item)} isLoading={isBuying}>확인</Button>
                                                        <Button size="sm" variant="secondary" onClick={() => setPendingId(null)} disabled={isBuying}>취소</Button>
                                                    </div>
                                                ) : (
                                                    <Button
                                                        size="md" variant={PURCHASES_ENABLED && canAfford ? 'primary' : 'secondary'} fullWidth
                                                        disabled={!PURCHASES_ENABLED || !userId || !canAfford}
                                                        onClick={() => { setPendingId(item.id); setErr(null); setOkMsg(null); }}
                                                    >
                                                        <img src={POINTS_ICON_URL} alt="" width={14} height={14} />
                                                        <span className="tabular-nums">{item.price.toLocaleString('ko-KR')} BP</span>
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ShopPage;

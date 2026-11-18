import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useGame } from '../hooks/useGameContext';
import { OWNED_ITEMS_KEY, POINTS_LEDGER_KEY, POINTS_WALLET_KEY, useOwnedItems, useShopItems, useWallet } from '../hooks/usePoints';
import {
    FLOOR_MATERIAL_LABEL, FLOOR_MATERIAL_ORDER, ITEM_TYPE_LABEL, POINTS_ICON_URL, formatPoints, purchaseItem, type CourtFloorData,
} from '../services/points/pointsService';
import { paintColor, previewCourtStyle } from '../services/points/courtLoadout';
import { CourtPreview } from '../components/multi/CourtPreview';
import { InlineNotice } from '../components/common/InlineNotice';
import { BackChevron, HOVER_ACCENT_BTN } from '../components/home/homeIcons';
import type { FloorMaterial, ShopItemRow } from '../types/points';

// 상점 — /shop. 코스메틱은 계정 귀속이라 리그 밖(홈 오른쪽 위 SHOP 버튼, 프로필의 SHOP 버튼)에서 들어온다.
// [2026-11-18] 홈 리디자인 목업 A-3(인게임 셸 구성): 왼쪽 사이드바 = 카테고리(상위 그룹 "플로어" + 하위 나무·우레탄·콘크리트, 둘 다 선택 가능)와 보유 BP,
// 오른쪽 = 재질별로 묶은 상품 카드. 폰은 사이드바 대신 위쪽 필터 줄.
// 카드: 코트 미리보기 / 이름 + 가격(글자) / 구매(보조 버튼, 올리면 인디고). BP 가 모자라면 가격을 흐리게 하고 구매 비활성, 보유한 상품은 초록 "보유 중" 상자.
// 장착은 프로필(/profile)의 인벤토리에서. 계획: docs/plan/points-system-plan.md "상점"

// 구매 스위치 — false 면 모든 구매 버튼 비활성 + 안내 한 줄. [2026-11-09] 컨텐츠를 채울 때까지 잠갔다가 [2026-11-18] 플로어 8종으로 열었다.
const PURCHASES_ENABLED = true;

type Filter = 'all' | FloorMaterial | 'paint';
const MAX_BUY_QTY = 99;

const ShopPage: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { session } = useGame();
    const userId = session?.user?.id ?? null;

    const { data: wallet } = useWallet(userId);
    const { data: items, isLoading: itemsLoading, error: itemsError } = useShopItems(!!userId);
    const { data: owned } = useOwnedItems(userId);
    const ownedIds = useMemo(() => new Set((owned ?? []).map(o => o.item_id)), [owned]);

    const [filter, setFilter] = useState<Filter>('all');
    const [pendingId, setPendingId] = useState<string | null>(null);   // 확인 단계인 상품
    const [qtyById, setQtyById] = useState<Record<string, number>>({});  // 쌓이는 상품(페인트)의 구매 수량
    const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({}); // 수량 칸에 입력 중인 글자(포커스를 떼면 지운다)
    const [buyingId, setBuyingId] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [okMsg, setOkMsg] = useState<string | null>(null);

    // 카테고리: 플로어(재질별 묶음) · 페인트(색별 소모품, 한 묶음)
    const paints = useMemo(() => (items ?? []).filter(it => it.item_type === 'court_paint').sort((a, b) => a.sort - b.sort), [items]);
    const ownedQty = useMemo(() => new Map((owned ?? []).map(o => [o.item_id, o.quantity])), [owned]);
    const floors = useMemo(() => (items ?? []).filter(it => it.item_type === 'court_floor').sort((a, b) => a.sort - b.sort), [items]);
    const materialOf = (it: ShopItemRow) => (it.data as unknown as CourtFloorData)?.material;
    const countOf = (m: Filter) => (m === 'paint' ? paints.length : floors.filter(it => m === 'all' || materialOf(it) === m).length);
    const paintLabel = ITEM_TYPE_LABEL.court_paint;
    const groups: { key: string; label: string; list: ShopItemRow[] }[] = filter === 'paint'
        ? (paints.length > 0 ? [{ key: 'paint', label: paintLabel, list: paints }] : [])
        : FLOOR_MATERIAL_ORDER
            .filter(m => filter === 'all' || filter === m)
            .map(m => ({ key: m, label: FLOOR_MATERIAL_LABEL[m], list: floors.filter(it => materialOf(it) === m) }))
            .filter(g => g.list.length > 0);
    const floorLabel = ITEM_TYPE_LABEL.court_floor;
    const title = filter === 'paint' ? paintLabel : filter === 'all' ? floorLabel : `${floorLabel} · ${FLOOR_MATERIAL_LABEL[filter]}`;
    const balance = wallet?.balance ?? 0;

    const confirmBuy = async (item: ShopItemRow) => {
        if (!userId) return;
        setBuyingId(item.id); setErr(null); setOkMsg(null);
        const qty = item.stackable ? (qtyById[item.id] ?? 1) : 1;
        const { data, error } = await purchaseItem(userId, item.id, qty);
        setBuyingId(null); setPendingId(null);
        if (error) { setErr(error); return; }
        setOkMsg(`${item.name}${qty > 1 ? ` ${qty}개` : ''} 구매 완료. 잔액 ${formatPoints(data!.balance)}`);
        qc.invalidateQueries({ queryKey: POINTS_WALLET_KEY(userId) });
        qc.invalidateQueries({ queryKey: OWNED_ITEMS_KEY(userId) });
        qc.invalidateQueries({ queryKey: POINTS_LEDGER_KEY(userId, 5) });
    };

    const navBtn = (key: Filter, label: string, isParent: boolean) => (
        <button
            key={key} type="button" onClick={() => setFilter(key)} aria-current={filter === key ? 'true' : undefined}
            className={`w-full px-3 flex items-center justify-between rounded-lg transition-colors ${isParent ? 'h-11 text-[15px] font-bold' : 'h-10 text-sm font-semibold'} ${
                filter === key ? 'text-[#00D492] bg-[#00D492]/10' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
        >
            <span>{label}</span>
            <span className="text-[13px] text-slate-400 tabular-nums">{countOf(key)}</span>
        </button>
    );

    const coin = (dim: boolean) => <img src={POINTS_ICON_URL} alt="" width={14} height={14} className={dim ? 'opacity-40' : ''} />;

    const card = (item: ShopItemRow) => {
        const qty = item.stackable ? (qtyById[item.id] ?? 1) : 1;
        const total = item.price * qty;
        const isOwned = !item.stackable && ownedIds.has(item.id);
        const short = !isOwned && total > balance;
        const setQty = (n: number) => {
            setQtyById(prev => ({ ...prev, [item.id]: Math.max(1, Math.min(MAX_BUY_QTY, n)) }));
            setQtyDraft(prev => { const { [item.id]: _drop, ...rest } = prev; return rest; });
            setPendingId(null);
        };
        const stepBtn = 'w-10 h-10 md:w-9 md:h-9 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-base font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 transition-colors';
        const isPending = pendingId === item.id;
        const isBuying = buyingId === item.id;
        const slot = 'h-11 md:h-10 rounded-lg text-sm font-bold flex items-center justify-center';
        return (
            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                {item.item_type === 'court_paint' ? (
                    <div role="img" aria-label={item.name} className="w-full h-24 border-b border-slate-800" style={{ background: paintColor(item) ?? '#334155' }} />
                ) : (
                    <svg viewBox="0 0 940 500" className="w-full h-auto block" role="img" aria-label={item.name}>
                        <CourtPreview {...previewCourtStyle(item)} />
                    </svg>
                )}
                <div className="p-3.5 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[15px] font-bold min-w-0 truncate">{item.name}</span>
                        <span className={`flex items-center gap-1.5 text-sm font-bold whitespace-nowrap tabular-nums ${short ? 'text-slate-500' : 'text-white'}`}>
                            {coin(short)}{formatPoints(total)}
                        </span>
                    </div>
                    {item.stackable && (
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5">
                                <button type="button" aria-label="수량 줄이기" disabled={qty <= 1} onClick={() => setQty(qty - 1)} className={stepBtn}>−</button>
                                <input
                                    aria-label="구매 수량" inputMode="numeric" maxLength={2}
                                    value={qtyDraft[item.id] ?? String(qty)}
                                    onFocus={e => e.currentTarget.select()}
                                    onChange={e => {
                                        // 지우는 중에는 빈 칸을 그대로 두고(수량은 1로 계산), 포커스를 떼면 숫자로 채운다
                                        const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                                        setQtyDraft(prev => ({ ...prev, [item.id]: digits }));
                                        setQtyById(prev => ({ ...prev, [item.id]: Math.max(1, Math.min(MAX_BUY_QTY, parseInt(digits, 10) || 1)) }));
                                        setPendingId(null);
                                    }}
                                    onBlur={() => setQtyDraft(prev => { const { [item.id]: _drop, ...rest } = prev; return rest; })}
                                    className="w-12 h-10 md:h-9 bg-slate-950 border border-slate-700 rounded-lg text-center text-sm font-bold text-white tabular-nums focus:outline-none focus:border-indigo-500"
                                />
                                <button type="button" aria-label="수량 늘리기" disabled={qty >= MAX_BUY_QTY} onClick={() => setQty(qty + 1)} className={stepBtn}>+</button>
                            </div>
                            <span className="text-[13px] text-slate-400 tabular-nums">보유 {ownedQty.get(item.id) ?? 0}</span>
                        </div>
                    )}
                    {isOwned ? (
                        <span className={`${slot} bg-[#00D492]/10 border border-[#00D492]/30 text-[#00D492]`}>보유 중</span>
                    ) : isPending ? (
                        <div className="flex gap-2">
                            <button onClick={() => confirmBuy(item)} disabled={isBuying} className={`${slot} flex-1 bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60`}>
                                {isBuying ? <Loader2 size={14} className="animate-spin" /> : '구매 확인'}
                            </button>
                            <button onClick={() => setPendingId(null)} disabled={isBuying} className={`${slot} px-4 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white`}>취소</button>
                        </div>
                    ) : (!PURCHASES_ENABLED || !userId || short) ? (
                        <button disabled className={`${slot} bg-slate-950 border border-slate-800 text-slate-500 cursor-not-allowed`}>구매</button>
                    ) : (
                        <button onClick={() => { setPendingId(item.id); setErr(null); setOkMsg(null); }} className={`${slot} ${HOVER_ACCENT_BTN}`}>구매</button>
                    )}
                </div>
            </div>
        );
    };

    const backTitle = (
        <button onClick={() => navigate('/')} aria-label="홈으로 돌아가기" className="h-11 px-3 md:px-0 flex items-center gap-3 text-slate-200 hover:text-white transition-colors">
            <BackChevron />
            <span className="text-xl font-bold leading-none tracking-[0.04em]">SHOP</span>
        </button>
    );

    return (
        <div className="min-h-dvh bg-slate-950 pretendard text-white flex flex-col md:flex-row">

            {/* ── 데스크톱·태블릿: 왼쪽 사이드바 ── */}
            <aside className="hidden md:flex w-[264px] shrink-0 bg-slate-900 border-r border-slate-700 flex-col md:sticky md:top-0 md:h-dvh">
                <div className="h-[72px] shrink-0 px-5 flex items-center border-b border-slate-800">{backTitle}</div>
                <nav aria-label="상점 카테고리" className="flex-1 min-h-0 overflow-y-auto px-3 py-4 flex flex-col gap-1">
                    {navBtn('all', floorLabel, true)}
                    <div className="ml-5 pl-2 border-l border-slate-700 flex flex-col gap-1">
                        {FLOOR_MATERIAL_ORDER.map(m => navBtn(m, FLOOR_MATERIAL_LABEL[m], false))}
                    </div>
                    {navBtn('paint', paintLabel, true)}
                </nav>
                <div className="shrink-0 p-4 border-t border-slate-800">
                    <div className="h-12 px-3.5 flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg">
                        <span className="flex items-center gap-2 text-[13px] text-slate-400">{coin(false)}보유 BP</span>
                        <span className="text-base font-bold tabular-nums">{wallet ? wallet.balance.toLocaleString('ko-KR') : '—'}</span>
                    </div>
                </div>
            </aside>

            {/* ── 폰: 상단 바 + 필터 줄 ── */}
            <div className="md:hidden sticky top-0 z-10 bg-slate-900">
                <header className="h-14 pl-1 pr-4 flex items-center justify-between border-b border-slate-800">
                    {backTitle}
                    <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums">{coin(false)}{wallet ? formatPoints(wallet.balance) : '—'}</span>
                </header>
                <div className="px-4 flex gap-5 border-b border-slate-800">
                    {([['all', floorLabel], ['paint', paintLabel]] as [Filter, string][]).map(([k, label]) => {
                        const on = (k === 'paint') === (filter === 'paint');
                        return (
                            <button key={k} type="button" onClick={() => setFilter(k)} className={`h-11 flex items-center text-sm font-bold border-b-2 ${on ? 'text-[#00D492] border-[#00D492]' : 'text-slate-400 border-transparent'}`}>
                                {label}
                            </button>
                        );
                    })}
                </div>
                <div className={`px-4 py-3 gap-2 overflow-x-auto border-b border-slate-800 bg-slate-950 ${filter === 'paint' ? 'hidden' : 'flex'}`}>
                    {(['all', ...FLOOR_MATERIAL_ORDER] as ('all' | FloorMaterial)[]).map(m => (
                        <button
                            key={m} type="button" onClick={() => setFilter(m)}
                            className={`shrink-0 h-9 px-3.5 rounded-full border text-sm font-bold whitespace-nowrap tabular-nums ${
                                filter === m ? 'bg-[#00D492]/10 border-[#00D492]/40 text-[#00D492]' : 'border-slate-700 text-slate-300'
                            }`}
                        >
                            {m === 'all' ? '전체' : FLOOR_MATERIAL_LABEL[m]} {countOf(m)}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── 본문 ── */}
            <main className="flex-1 min-w-0 flex flex-col">
                <header className="hidden md:flex h-[72px] shrink-0 px-10 items-center bg-slate-900 border-b border-slate-800">
                    <h1 className="text-xl font-bold">{title}</h1>
                </header>

                <div className="px-4 md:px-10 pt-4 md:pt-7 pb-12 flex flex-col gap-6 md:gap-9">
                    {!userId ? (
                        <InlineNotice tone="info">로그인하면 상품을 볼 수 있습니다.</InlineNotice>
                    ) : !PURCHASES_ENABLED && (
                        <InlineNotice tone="info">상품 구매는 준비 중입니다.</InlineNotice>
                    )}
                    {err && <InlineNotice tone="danger" onDismiss={() => setErr(null)}>{err}</InlineNotice>}
                    {okMsg && <InlineNotice tone="success" autoHideMs={4000}>{okMsg}</InlineNotice>}
                    {userId && itemsError && <InlineNotice tone="danger">상품 목록을 불러오지 못했습니다.</InlineNotice>}

                    {userId && (itemsLoading ? (
                        <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-600" /></div>
                    ) : groups.length === 0 ? (
                        <p className="py-10 text-center text-sm text-slate-400">판매 중인 상품이 없습니다.</p>
                    ) : groups.map(g => (
                        <section key={g.key} className="flex flex-col gap-3 md:gap-3.5">
                            <h2 className="text-base font-bold">{g.label}</h2>
                            <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 md:gap-4">
                                {g.list.map(card)}
                            </div>
                        </section>
                    )))}
                </div>
            </main>
        </div>
    );
};

export default ShopPage;

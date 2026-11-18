import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useGame } from '../hooks/useGameContext';
import { useAuth } from '../hooks/useAuth';
import { MY_PROFILE_KEY, useMyProfile } from '../hooks/useMyProfile';
import { COURT_LOADOUT_KEY, COURT_PAINT_KEY, OWNED_ITEMS_KEY, useCourtLoadout, useOwnedItems, useRecentLedger, useShopItems, useWallet } from '../hooks/usePoints';
import { supabase } from '../services/supabaseClient';
import { POINTS_ICON_URL, pointSourceLabel, type CourtFloorData } from '../services/points/pointsService';
import { DEFAULT_FLOOR_ID, MAPLE_FLOOR_IMAGE, PAINT_ZONES, SLOT_DEFAULT_LABEL, clearCourtZone, equipCourtItem, paintColor, paintCourtZone } from '../services/points/courtLoadout';
import { actionFailure } from '../services/notifications/actionErrorCatalog';
import { AVATAR_COLORS, AVATAR_LOGOS, DEFAULT_AVATAR_COLOR, MAX_AVATAR_TEXT, avatarBgClass, avatarInitial, avatarLogoUrl } from '../utils/avatarColors';
import { TEAM_DATA } from '../data/teamData';
import { CourtPreview } from '../components/multi/CourtPreview';
import { InlineNotice } from '../components/common/InlineNotice';
import { isImeComposing } from '../utils/ime';
import { BackChevron, CheckIcon, CloseX, HOVER_ACCENT_BTN, PaintRollerIcon, PencilIcon } from '../components/home/homeIcons';
import type { CourtSlot, PaintZone, ShopItemRow } from '../types/points';

// 프로필 — /profile (2026-11-18, 홈 리디자인 목업 A-2). 홈 오른쪽 위 프로필 상자에서 들어온다.
// 한 상자 안에서 왼쪽은 "나"(아바타·이름·BP·로그아웃, 항상 보임), 오른쪽은 탭 세 개(코트 · 인벤토리 / 온라인 리그 전적 / BP 내역).
// 폰에서는 왼쪽 영역이 위쪽 블록이 되고, 표는 가로 스크롤 표 그대로(mobile-design-system §1-2).
// 예전 /inventory(pages/InventoryPage.tsx)와 홈의 통산 전적·BP 내역은 여기로 합쳤다.
const BACKGROUND_IMAGE = '/images/background/background.webp';

const MAX_NAME_LENGTH = 8;

type Tab = 'court' | 'record' | 'bp';
const TABS: { key: Tab; label: string }[] = [
    { key: 'court',  label: '코트 · 인벤토리' },
    { key: 'record', label: '온라인 리그 전적' },
    { key: 'bp',     label: 'BP 내역' },
];

// ── 온라인 리그 전적 ───────────────────────────────────────────────────────────
interface HistoryRow {
    league_id: string | null; league_name: string | null; season_number: number | null; team_id: string | null;
    wins: number | null; losses: number | null; playoff_wins: number | null; playoff_losses: number | null;
    final_rank: number | null; playoff_result: string | null; completed_at: string | null;
}
interface RecordRow {
    key: string; league: string; season: string; team: string;
    w: number; l: number; rank: string; pw: number; pl: number; result: string; resultCls: string;
}
const PLAYOFF_RESULT: Record<string, { label: string; cls: string }> = {
    champion:        { label: '우승',            cls: 'text-green-400' },
    runner_up:       { label: '준우승',          cls: 'text-white' },
    eliminated:      { label: '플레이오프 탈락', cls: 'text-white' },
    missed_playoffs: { label: '-',               cls: 'text-slate-400' },
};
const pct = (w: number, l: number) => (w + l === 0 ? '-' : (w / (w + l)).toFixed(3).replace(/^0/, ''));
/** 전적 색 — 승률 6할 이상 초록, 4할 5푼 미만 빨강 */
const recordCls = (w: number, l: number) => {
    if (w + l === 0) return 'text-slate-400';
    const r = w / (w + l);
    return r >= 0.6 ? 'text-green-400' : r < 0.45 ? 'text-red-400' : 'text-white';
};
const seasonLabel = (startYear: number) => `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

async function fetchRecords(userId: string): Promise<RecordRow[]> {
    const { data, error } = await supabase.from('league_user_history')
        .select('league_id, league_name, season_number, team_id, wins, losses, playoff_wins, playoff_losses, final_rank, playoff_result, completed_at')
        .eq('user_id', userId).order('completed_at', { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as HistoryRow[];
    // 시즌 표기(2025-26)는 리그의 현재 가상 시즌 연도에서 시즌 번호 차이만큼 거슬러 계산. 리그를 못 읽으면 "시즌 N"
    const leagueIds = [...new Set(rows.map(r => r.league_id).filter((id): id is string => !!id))];
    const yearOf = new Map<string, { year: number; season: number }>();
    if (leagueIds.length > 0) {
        const { data: leagues } = await supabase.from('leagues').select('id, virtual_season_year, season_number').in('id', leagueIds);
        for (const lg of leagues ?? []) {
            if (typeof lg.virtual_season_year === 'number') yearOf.set(lg.id as string, { year: lg.virtual_season_year, season: (lg.season_number as number | null) ?? 1 });
        }
    }
    return rows.map((r, i) => {
        const sn = r.season_number ?? 1;
        const y = r.league_id ? yearOf.get(r.league_id) : undefined;
        const team = r.team_id ? TEAM_DATA[r.team_id] : undefined;
        const res = PLAYOFF_RESULT[r.playoff_result ?? ''] ?? { label: '-', cls: 'text-slate-400' };
        return {
            key: `${r.league_id ?? 'x'}-${sn}-${i}`,
            league: r.league_name || '리그',
            season: y ? seasonLabel(y.year - (y.season - sn)) : `시즌 ${sn}`,
            team: team ? `${team.city} ${team.name}` : (r.team_id ?? '-').toUpperCase(),
            w: r.wins ?? 0, l: r.losses ?? 0,
            rank: r.final_rank ? `${r.final_rank}위` : '-',
            pw: r.playoff_wins ?? 0, pl: r.playoff_losses ?? 0,
            result: res.label, resultCls: res.cls,
        };
    });
}

// 표 공통 스타일 — 클래식한 촘촘한 표(둥근 상자 없음, 가로줄만, 왼쪽 정렬)
const TH = 'px-3.5 py-2 font-bold whitespace-nowrap first:pl-0 last:pr-0';
const TD = 'px-3.5 py-2.5 whitespace-nowrap first:pl-0 last:pr-0';

const ledgerDate = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };

/** 인벤토리 텍스처 칩 — 코트 전체가 아니라 작은 정사각형에 바닥 텍스처만 */
const FloorChip: React.FC<{ image?: string | null; color: string }> = ({ image, color }) => (
    <span className="relative w-11 h-11 shrink-0 rounded-md overflow-hidden" style={{ background: color }}>
        {image && <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover scale-[2.4]" />}
    </span>
);

/** 아바타 편집 팝업 — 글자(비우면 이름 첫 글자) 또는 가상 팀 로고를 고르고, 배경색은 둘 다 공통으로 고른다 */
const AvatarModal: React.FC<{
    nickname: string; email: string; current: string; currentText: string; currentLogo: string | null; busy: boolean;
    onClose: () => void; onSave: (key: string, text: string, logo: string | null) => void;
}> = ({ nickname, email, current, currentText, currentLogo, busy, onClose, onSave }) => {
    const [mode, setMode] = useState<'text' | 'logo'>(currentLogo ? 'logo' : 'text');
    const [picked, setPicked] = useState(current);
    const [text, setText] = useState(currentText);
    const [logo, setLogo] = useState<string | null>(currentLogo);
    const shown = avatarInitial(nickname, email, text);
    const logoUrl = mode === 'logo' ? avatarLogoUrl(logo) : null;
    const canSave = !busy && (mode === 'logo' ? !!logoUrl : Array.from(text.trim()).length <= MAX_AVATAR_TEXT);
    const save = () => { if (canSave) onSave(picked, text.trim(), mode === 'logo' ? logo : null); };
    return createPortal(
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-label="아바타" onClick={e => e.stopPropagation()} className="w-full max-w-sm max-h-full p-6 flex flex-col items-center gap-5 bg-slate-900 border border-slate-700 rounded-2xl text-white">
                <div className="w-full flex items-center justify-between">
                    <h3 className="text-base font-bold">아바타</h3>
                    <button onClick={onClose} aria-label="닫기" className="w-9 h-9 -mr-2 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"><CloseX size={14} /></button>
                </div>
                {logoUrl ? (
                    <span className={`shrink-0 w-24 h-24 rounded-full flex items-center justify-center ${avatarBgClass(picked)}`}>
                        <img src={logoUrl} alt="" draggable={false} className="w-[76%] h-[76%] object-contain" />
                    </span>
                ) : (
                    <span className={`shrink-0 w-24 h-24 rounded-full flex items-center justify-center font-bold ${shown.length > 1 ? 'text-[32px]' : 'text-[40px]'} ${avatarBgClass(picked)}`}>
                        {mode === 'text' && shown}
                    </span>
                )}
                <div role="tablist" className="w-full flex gap-6 border-b border-slate-800">
                    {([['text', '글자'], ['logo', '로고']] as const).map(([k, label]) => (
                        <button
                            key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                            className={`h-10 text-sm font-bold border-b-2 transition-colors ${mode === k ? 'text-[#00D492] border-[#00D492]' : 'text-slate-400 border-transparent hover:text-white'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {mode === 'text' ? (
                        <input
                            aria-label="아바타 글자" value={text} maxLength={MAX_AVATAR_TEXT} placeholder={avatarInitial(nickname, email)}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !isImeComposing(e)) save(); }}
                            className="w-24 h-10 px-2.5 bg-slate-950 border border-slate-700 rounded-lg text-center text-lg font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                        />
                ) : (
                    <div role="group" aria-label="아바타 로고" className="w-full min-h-0 overflow-y-auto grid grid-cols-6 gap-2">
                        {AVATAR_LOGOS.map(k => (
                            <button
                                key={k} type="button" aria-label={k} aria-pressed={k === logo} onClick={() => setLogo(k)}
                                className={`aspect-square p-1.5 rounded-lg border-2 bg-slate-950 transition-colors ${k === logo ? 'border-white' : 'border-transparent hover:border-slate-600'}`}
                            >
                                <img src={avatarLogoUrl(k)!} alt="" loading="lazy" draggable={false} className="w-full h-full object-contain" />
                            </button>
                        ))}
                    </div>
                )}
                <div role="group" aria-label="아바타 색" className="grid grid-cols-5 gap-3">
                    {AVATAR_COLORS.map(c => (
                        <button
                            key={c.key} type="button" aria-label={c.label} aria-pressed={c.key === picked} onClick={() => setPicked(c.key)}
                            className={`w-9 h-9 rounded-full border-2 ${c.bg} ${c.key === picked ? 'border-white ring-2 ring-inset ring-slate-900' : 'border-transparent'}`}
                        />
                    ))}
                </div>
                <div className="w-full flex gap-2">
                    <button onClick={onClose} className={`${HOVER_ACCENT_BTN} flex-1 h-10 rounded-lg text-sm font-bold`}>취소</button>
                    <button onClick={save} disabled={!canSave} className="flex-1 h-10 rounded-lg bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">저장</button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

const ProfilePage: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { session, authLoading } = useGame();
    const { handleLogout } = useAuth();
    const userId = session?.user?.id ?? null;
    const email = session?.user?.email ?? '';

    const [tab, setTab] = useState<Tab>('court');
    const [nameDraft, setNameDraft] = useState<string | null>(null); // null = 보기, 문자열 = 이름 수정 중
    const [avatarOpen, setAvatarOpen] = useState(false);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const { data: profile } = useMyProfile(userId);
    const { data: wallet } = useWallet(userId);
    const { data: items } = useShopItems(!!userId);
    const { data: owned } = useOwnedItems(userId);
    const { data: loadout, style: myCourt, paints: courtPaints } = useCourtLoadout(userId);
    const [paintId, setPaintId] = useState<string | null>(null);        // 고른 페인트
    const [pendingZone, setPendingZone] = useState<PaintZone | null>(null); // 확인 단계인 구역
    const { data: ledger, isLoading: ledgerLoading } = useRecentLedger(userId, 50, tab === 'bp');
    const { data: records, isLoading: recordsLoading } = useQuery({
        queryKey: ['profileRecords', userId], enabled: !!userId && tab === 'record', staleTime: 5 * 60_000,
        queryFn: () => fetchRecords(userId!),
    });

    // 로그인하지 않았으면 홈으로
    useEffect(() => { if (!authLoading && !session) navigate('/', { replace: true }); }, [authLoading, session, navigate]);

    const nickname = profile?.nickname ?? '';
    const colorKey = profile?.avatar_color || DEFAULT_AVATAR_COLOR;
    const avatarText = profile?.avatar_text ?? '';
    const avatarShown = avatarInitial(nickname, email, avatarText);
    const avatarLogo = profile?.avatar_logo ?? null;
    const avatarLogoSrc = avatarLogoUrl(avatarLogo);

    // 닉네임 저장과 같은 RPC(set_my_nickname, 본인 행만 갱신) 하나로 이름·아바타 색을 모두 바꾼다
    const saveProfile = async (nextName: string, nextColor: string, what: string): Promise<boolean> => {
        if (!userId || busyKey) return false;
        setBusyKey('profile'); setErr(null);
        const { error } = await supabase.rpc('set_my_nickname', { p_nickname: nextName, p_email: email, p_avatar_color: nextColor });
        setBusyKey(null);
        if (error) {
            const msg = error.message ?? '';
            setErr(msg.includes('invalid_nickname') ? `이름은 1~${MAX_NAME_LENGTH}자여야 합니다.` : actionFailure(error, what));
            return false;
        }
        qc.invalidateQueries({ queryKey: MY_PROFILE_KEY(userId) });
        return true;
    };

    // 아바타 글자·색·로고 — set_my_avatar(본인 행만). 글자를 비우면 이름 첫 글자, 로고가 null이면 글자 아바타
    const saveAvatar = async (key: string, text: string, logo: string | null): Promise<boolean> => {
        if (!userId || busyKey) return false;
        setBusyKey('avatar'); setErr(null);
        const { error } = await supabase.rpc('set_my_avatar', { p_color: key, p_text: text || null, p_logo: logo });
        setBusyKey(null);
        if (error) {
            const msg = error.message ?? '';
            setErr(msg.includes('invalid_avatar_text') || msg.includes('profiles_avatar_text_len') ? `아바타 글자는 ${MAX_AVATAR_TEXT}자까지 넣을 수 있습니다.` : actionFailure(error, '아바타 변경'));
            return false;
        }
        qc.invalidateQueries({ queryKey: MY_PROFILE_KEY(userId) });
        return true;
    };

    const saveName = async () => {
        const next = (nameDraft ?? '').trim();
        if (!next || next.length > MAX_NAME_LENGTH) return;
        if (next === nickname) { setNameDraft(null); return; }
        if (await saveProfile(next, colorKey, '이름 변경')) setNameDraft(null);
    };

    // 보유한 플로어(판매 중인 카탈로그에 있는 것만)
    const floors = useMemo(() => {
        const ids = new Set((owned ?? []).map(o => o.item_id));
        return (items ?? []).filter(it => it.item_type === 'court_floor' && ids.has(it.id)).sort((a, b) => a.sort - b.sort);
    }, [items, owned]);
    const equippedFloor = (loadout ?? []).find(e => e.slot === 'court_floor')?.item_id ?? null;
    const equippedName = floors.find(f => f.id === equippedFloor)?.name ?? '하드 메이플';

    const equip = async (slot: CourtSlot, itemId: string | null) => {
        if (!userId || busyKey) return;
        setBusyKey(`equip:${itemId ?? 'default'}`); setErr(null);
        const { error } = await equipCourtItem(userId, slot, itemId);
        setBusyKey(null);
        if (error) { setErr(error); return; }
        qc.invalidateQueries({ queryKey: COURT_LOADOUT_KEY(userId) });
    };

    // 보유한 페인트(색별 소모품)와 지금 장착한 플로어에 칠해진 구역
    const ownedPaints = useMemo(() => {
        const qty = new Map((owned ?? []).map(o => [o.item_id, o.quantity]));
        return (items ?? [])
            .filter(it => it.item_type === 'court_paint' && (qty.get(it.id) ?? 0) > 0)
            .sort((a, b) => a.sort - b.sort)
            .map(it => ({ id: it.id, name: it.name, color: paintColor(it) ?? '#334155', qty: qty.get(it.id) ?? 0 }));
    }, [items, owned]);
    const floorKey = equippedFloor ?? DEFAULT_FLOOR_ID;
    const paintedZones = useMemo(() => new Map((courtPaints ?? []).filter(p => p.floor_id === floorKey).map(p => [p.zone, p])), [courtPaints, floorKey]);
    const pickedPaint = ownedPaints.find(p => p.id === paintId) ?? null;

    const paintZone = async (zone: PaintZone) => {
        if (!userId || busyKey || !pickedPaint) return;
        setBusyKey(`paint:${zone}`); setErr(null);
        const { error } = await paintCourtZone(userId, floorKey, zone, pickedPaint.id);
        setBusyKey(null); setPendingZone(null);
        if (error) { setErr(error); return; }
        qc.invalidateQueries({ queryKey: COURT_PAINT_KEY(userId) });
        qc.invalidateQueries({ queryKey: OWNED_ITEMS_KEY(userId) });
    };
    const clearZone = async (zone: PaintZone) => {
        if (!userId || busyKey) return;
        setBusyKey(`clear:${zone}`); setErr(null);
        const { error } = await clearCourtZone(userId, floorKey, zone);
        setBusyKey(null);
        if (error) { setErr(error); return; }
        qc.invalidateQueries({ queryKey: COURT_PAINT_KEY(userId) });
    };

    const totals = useMemo(() => {
        const t = { w: 0, l: 0, pw: 0, pl: 0, titles: 0 };
        for (const r of records ?? []) { t.w += r.w; t.l += r.l; t.pw += r.pw; t.pl += r.pl; if (r.result === '우승') t.titles += 1; }
        return t;
    }, [records]);

    const inventoryRow = (key: string, name: string, image: string | null | undefined, color: string, isEquipped: boolean, onEquip: () => void) => (
        <div key={key} className={`min-h-[60px] p-2 flex items-center gap-3 bg-slate-950 border rounded-xl ${isEquipped ? 'border-[#00D492]' : 'border-slate-800'}`}>
            <FloorChip image={image} color={color} />
            <span className="flex-1 min-w-0 text-sm font-bold truncate">{name}</span>
            {isEquipped ? (
                <span className="pr-2 text-sm font-bold text-[#00D492]">장착 중</span>
            ) : (
                <button onClick={onEquip} disabled={busyKey !== null} className={`${HOVER_ACCENT_BTN} h-11 md:h-9 px-4 rounded-lg text-sm font-bold disabled:opacity-50 disabled:pointer-events-none`}>
                    {busyKey === `equip:${key}` ? <Loader2 size={14} className="animate-spin" /> : '장착'}
                </button>
            )}
        </div>
    );

    return (
        <div className="min-h-dvh relative bg-slate-950 pretendard text-white">
            <div className="fixed inset-0 bg-cover bg-center opacity-20 pointer-events-none" style={{ backgroundImage: `url(${BACKGROUND_IMAGE})` }} />
            <div className="fixed inset-0 bg-slate-950/70 pointer-events-none" />

            <div className="relative max-w-[1320px] mx-auto md:px-10 md:pt-8 md:pb-14 flex flex-col md:gap-7">
                <header className="h-14 md:h-11 px-1 md:px-0 flex items-center bg-slate-900 md:bg-transparent border-b border-slate-800 md:border-0">
                    <button onClick={() => navigate('/')} aria-label="홈으로 돌아가기" className="h-11 px-3 md:px-0 flex items-center gap-3 text-slate-200 hover:text-white transition-colors">
                        <BackChevron />
                        <h1 className="text-xl font-bold leading-none tracking-[0.04em]">PROFILE</h1>
                    </button>
                </header>

                <div className="flex flex-col md:flex-row md:items-stretch md:bg-slate-900/95 md:border md:border-slate-800 md:rounded-2xl md:overflow-hidden">

                    {/* ── 왼쪽: 내 정보 ── */}
                    <aside aria-label="내 정보" className="md:w-[340px] md:shrink-0 p-4 md:p-7 flex flex-col gap-4 md:gap-7 bg-slate-900 md:bg-transparent border-b md:border-b-0 md:border-r border-slate-800">
                        <div className="flex md:flex-col items-center gap-4 md:gap-5">
                            <span className="relative shrink-0">
                                <span className={`w-16 h-16 md:w-32 md:h-32 rounded-full flex items-center justify-center font-bold ${avatarShown.length > 1 ? 'text-[22px] md:text-[42px]' : 'text-[28px] md:text-[52px]'} ${avatarBgClass(colorKey)}`}>
                                    {avatarLogoSrc ? <img src={avatarLogoSrc} alt="" draggable={false} className="w-[76%] h-[76%] object-contain" /> : avatarShown}
                                </span>
                                <button onClick={() => setAvatarOpen(true)} aria-label="아바타 편집" className={`${HOVER_ACCENT_BTN} absolute -top-1 -right-1 md:top-0 md:right-0 w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full`}>
                                    <PencilIcon size={12} />
                                </button>
                            </span>
                            <div className="flex-1 md:flex-none md:w-full min-w-0 flex flex-col gap-0.5">
                                <span className="hidden md:block text-xs font-bold text-slate-400">이름</span>
                                {nameDraft === null ? (
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-xl md:text-[26px] font-bold leading-tight truncate">{nickname || 'GM'}</span>
                                        <button onClick={() => { setNameDraft(nickname); setErr(null); }} aria-label="이름 변경" className={`${HOVER_ACCENT_BTN} shrink-0 w-8 h-8 flex items-center justify-center rounded-lg`}>
                                            <PencilIcon />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <input
                                                autoFocus aria-label="이름" value={nameDraft} maxLength={MAX_NAME_LENGTH}
                                                onChange={e => setNameDraft(e.target.value.slice(0, MAX_NAME_LENGTH))}
                                                onKeyDown={e => {
                                                    if (isImeComposing(e)) return;
                                                    if (e.key === 'Enter') void saveName();
                                                    if (e.key === 'Escape') setNameDraft(null);
                                                }}
                                                className="flex-1 min-w-0 h-10 px-2.5 bg-slate-950 border border-slate-700 rounded-lg text-lg md:text-xl font-bold text-white focus:outline-none focus:border-indigo-500"
                                            />
                                            <button onClick={() => { void saveName(); }} disabled={!nameDraft.trim() || busyKey !== null} aria-label="저장" className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors">
                                                <CheckIcon />
                                            </button>
                                            <button onClick={() => setNameDraft(null)} aria-label="취소" className={`${HOVER_ACCENT_BTN} shrink-0 w-10 h-10 flex items-center justify-center rounded-lg`}>
                                                <CloseX size={12} />
                                            </button>
                                        </div>
                                        <span className="text-xs text-slate-400">최대 {MAX_NAME_LENGTH}자</span>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="md:pt-6 md:border-t border-slate-800 flex flex-col gap-2">
                            <span className="hidden md:block text-xs font-bold text-slate-400">보유 BP</span>
                            <div className="h-14 md:h-auto pl-4 pr-2 md:p-0 flex items-center justify-between gap-3 bg-slate-950 md:bg-transparent border md:border-0 border-slate-800 rounded-xl">
                                <span className="flex items-center gap-2.5 text-xl md:text-[26px] font-bold leading-tight tabular-nums">
                                    <img src={POINTS_ICON_URL} alt="" width={22} height={22} />
                                    {wallet ? wallet.balance.toLocaleString('ko-KR') : '—'}
                                </span>
                                <button onClick={() => setTab('bp')} className={`${HOVER_ACCENT_BTN} h-11 md:h-10 px-3.5 rounded-lg text-sm font-bold`}>내역</button>
                            </div>
                        </div>

                        <button onClick={() => { void handleLogout(() => navigate('/')); }} className="hidden md:block h-11 mt-auto rounded-lg bg-red-600 text-sm font-bold text-white hover:bg-red-500 transition-colors">
                            로그아웃
                        </button>
                    </aside>

                    {/* ── 오른쪽: 탭 ── */}
                    <section className="flex-1 min-w-0">
                        <div role="tablist" className="px-4 md:px-7 flex gap-5 md:gap-8 border-b border-slate-800 overflow-x-auto">
                            {TABS.map(t => (
                                <button
                                    key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setErr(null); }}
                                    className={`h-11 md:h-[52px] text-sm md:text-[15px] font-bold whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? 'text-[#00D492] border-[#00D492]' : 'text-slate-400 border-transparent hover:text-white'}`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {err && <div className="px-4 md:px-7 pt-4"><InlineNotice tone="danger" onDismiss={() => setErr(null)}>{err}</InlineNotice></div>}

                        {tab === 'court' && (
                            <div className="p-4 md:p-7 flex flex-col gap-6 md:gap-7">
                                <div className="flex flex-col gap-2 md:gap-3">
                                    <div className="flex items-baseline justify-between gap-4">
                                        <h2 className="text-base md:text-lg font-bold">내 코트</h2>
                                        <span className="text-xs md:text-[13px] text-slate-400">플로어 · {equippedName}</span>
                                    </div>
                                    <div className="w-full max-w-[760px] rounded-xl overflow-hidden border border-slate-800">
                                        <svg viewBox="0 0 940 500" className="w-full h-auto block" role="img" aria-label="내 코트">
                                            <CourtPreview {...myCourt} />
                                        </svg>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 md:gap-3">
                                    <h2 className="text-base md:text-lg font-bold">페인트</h2>
                                    {ownedPaints.length === 0 ? (
                                        <p className="py-3 text-sm text-slate-400">보유한 페인트가 없습니다.</p>
                                    ) : (
                                        <div role="group" aria-label="페인트 선택" className="flex flex-wrap gap-2">
                                            {ownedPaints.map(p => (
                                                <button
                                                    key={p.id} type="button" aria-pressed={p.id === paintId} onClick={() => { setPaintId(p.id === paintId ? null : p.id); setPendingZone(null); }}
                                                    className={`h-11 md:h-10 pl-2 pr-3 flex items-center gap-2 bg-slate-950 border rounded-lg text-sm font-bold transition-colors ${p.id === paintId ? 'border-white text-white' : 'border-slate-800 text-slate-300 hover:border-slate-600'}`}
                                                >
                                                    <PaintRollerIcon color={p.color} size={26} />
                                                    {p.name}
                                                    <span className="text-slate-400 tabular-nums">{p.qty}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                        {PAINT_ZONES.map(z => {
                                            const cur = paintedZones.get(z.key) ?? null;
                                            const curColor = paintColor(cur?.item);
                                            const canPaint = !!pickedPaint && pickedPaint.qty >= z.cost && pickedPaint.id !== cur?.item_id;
                                            const btn = 'h-11 md:h-9 px-3 rounded-lg text-sm font-bold disabled:opacity-40 disabled:pointer-events-none';
                                            return (
                                                <div key={z.key} className="p-2.5 flex flex-col gap-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="w-8 h-8 shrink-0 rounded-md border border-slate-700" style={curColor ? { background: curColor } : undefined} />
                                                        <span className="flex-1 min-w-0 text-sm font-bold truncate">{z.label}</span>
                                                        <span className="text-[13px] text-slate-400 tabular-nums">{z.cost}개</span>
                                                    </div>
                                                    {pendingZone === z.key && pickedPaint ? (
                                                        <div className="flex gap-2">
                                                            <button onClick={() => { void paintZone(z.key); }} disabled={busyKey !== null} className={`${btn} flex-1 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-500`}>
                                                                {busyKey === `paint:${z.key}` ? <Loader2 size={14} className="animate-spin" /> : `${z.cost}개 사용`}
                                                            </button>
                                                            <button onClick={() => setPendingZone(null)} disabled={busyKey !== null} className={`${btn} bg-slate-800 border border-slate-700 text-slate-300 hover:text-white`}>취소</button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex gap-2">
                                                            <button onClick={() => setPendingZone(z.key)} disabled={!canPaint || busyKey !== null} className={`${btn} flex-1 ${HOVER_ACCENT_BTN}`}>칠하기</button>
                                                            {cur && (
                                                                <button onClick={() => { void clearZone(z.key); }} disabled={busyKey !== null} className={`${btn} bg-slate-800 border border-slate-700 text-slate-300 hover:text-white`}>
                                                                    {busyKey === `clear:${z.key}` ? <Loader2 size={14} className="animate-spin" /> : '지우기'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 md:gap-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <h2 className="text-base md:text-lg font-bold">인벤토리 <span className="text-slate-400 tabular-nums">{floors.length}</span></h2>
                                        <button onClick={() => navigate('/shop')} className={`${HOVER_ACCENT_BTN} h-11 md:h-10 px-4 rounded-lg text-sm font-bold tracking-[0.06em]`}>SHOP</button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
                                        {inventoryRow('default', SLOT_DEFAULT_LABEL.court_floor, MAPLE_FLOOR_IMAGE, '#DDBA95', equippedFloor === null, () => equip('court_floor', null))}
                                        {floors.map((it: ShopItemRow) => {
                                            const d = it.data as unknown as CourtFloorData;
                                            return inventoryRow(it.id, it.name, d?.image, d?.background ?? '#334155', equippedFloor === it.id, () => equip('court_floor', it.id));
                                        })}
                                    </div>
                                </div>

                                <button onClick={() => { void handleLogout(() => navigate('/')); }} className="md:hidden h-11 rounded-lg bg-red-600 text-sm font-bold text-white active:bg-red-500">
                                    로그아웃
                                </button>
                            </div>
                        )}

                        {tab === 'record' && (
                            <div className="px-4 md:px-7 pt-2 md:pt-5 pb-7 overflow-x-auto">
                                {recordsLoading ? (
                                    <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-600" /></div>
                                ) : (records ?? []).length === 0 ? (
                                    <p className="py-10 text-center text-sm text-slate-400">완료한 온라인 리그 시즌이 없습니다.</p>
                                ) : (
                                    <table className="w-full min-w-[720px] text-sm tabular-nums border-collapse">
                                        <thead>
                                            <tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                                                <th className={TH}>리그</th><th className={TH}>시즌</th><th className={TH}>팀</th><th className={TH}>정규시즌</th>
                                                <th className={TH}>순위</th><th className={TH}>플레이오프</th><th className={TH}>결과</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(records ?? []).map(r => (
                                                <tr key={r.key} className="border-t border-slate-800">
                                                    <td className={TD}>{r.league}</td>
                                                    <td className={TD}>{r.season}</td>
                                                    <td className={TD}>{r.team}</td>
                                                    <td className={`${TD} ${recordCls(r.w, r.l)}`}>{r.w}-{r.l}, {pct(r.w, r.l)}</td>
                                                    <td className={TD}>{r.rank}</td>
                                                    <td className={`${TD} ${recordCls(r.pw, r.pl)}`}>{r.pw + r.pl === 0 ? '-' : `${r.pw}-${r.pl}, ${pct(r.pw, r.pl)}`}</td>
                                                    <td className={`${TD} ${r.resultCls}`}>{r.result}</td>
                                                </tr>
                                            ))}
                                            <tr className="border-t-2 border-slate-700 font-bold">
                                                <td className={TD} colSpan={3}>통산</td>
                                                <td className={TD}>{totals.w}-{totals.l}, {pct(totals.w, totals.l)}</td>
                                                <td className={TD} />
                                                <td className={TD}>{totals.pw + totals.pl === 0 ? '-' : `${totals.pw}-${totals.pl}, ${pct(totals.pw, totals.pl)}`}</td>
                                                <td className={TD}>우승 {totals.titles}회</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}

                        {tab === 'bp' && (
                            <div className="px-4 md:px-7 pt-2 md:pt-5 pb-7 overflow-x-auto">
                                {ledgerLoading ? (
                                    <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-600" /></div>
                                ) : (ledger ?? []).length === 0 ? (
                                    <p className="py-10 text-center text-sm text-slate-400">BP 내역이 없습니다.</p>
                                ) : (
                                    <table className="w-full min-w-[440px] text-sm tabular-nums border-collapse">
                                        <thead>
                                            <tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                                                <th className={TH}>날짜</th><th className={TH}>내용</th><th className={TH}>변동</th><th className={TH}>잔액</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(ledger ?? []).map(row => {
                                                const qty = typeof row.meta?.quantity === 'number' && row.meta.quantity > 1 ? ` ${row.meta.quantity}개` : '';
                                                const itemName = typeof row.meta?.item_name === 'string' ? `${row.meta.item_name}${qty}` : null;
                                                return (
                                                    <tr key={row.id} className="border-t border-slate-800">
                                                        <td className={TD}>{ledgerDate(row.created_at)}</td>
                                                        <td className={TD}>{pointSourceLabel(row.source)}{itemName ? ` · ${itemName}` : ''}</td>
                                                        <td className={`${TD} ${row.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>{row.delta >= 0 ? `+${row.delta.toLocaleString('ko-KR')}` : `−${Math.abs(row.delta).toLocaleString('ko-KR')}`}</td>
                                                        <td className={TD}>{row.balance_after.toLocaleString('ko-KR')}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </div>

            {avatarOpen && (
                <AvatarModal
                    nickname={nickname} email={email} current={colorKey} currentText={avatarText} currentLogo={avatarLogoSrc ? avatarLogo : null} busy={busyKey !== null}
                    onClose={() => setAvatarOpen(false)}
                    onSave={async (key, text, logo) => { if ((key === colorKey && text === avatarText && logo === (avatarLogoSrc ? avatarLogo : null)) || await saveAvatar(key, text, logo)) setAvatarOpen(false); }}
                />
            )}
        </div>
    );
};

export default ProfilePage;

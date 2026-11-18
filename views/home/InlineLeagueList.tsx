
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { BackChevron, CloseX, HOVER_ACCENT_BTN } from '../../components/home/homeIcons';
import { supabase } from '../../services/supabaseClient';
import { listLeaguesWithStats } from '../../services/multi/roomQueries';
import type { LeagueListEntry } from '../../services/multi/roomQueries';
import CreateLeagueModal from '../../components/multi/CreateLeagueModal';
import { TeamSelectModal } from '../../components/multi/TeamSelectModal';
import { STATUS_LABEL } from '../multi/league/leagueConstants';
import { useGame } from '../../hooks/useGameContext';
import { isLeagueSpectatable } from '../../utils/spectatorAccess';

type Tab = 'tournament' | 'main_league';

interface InlineLeagueListProps {
    session: Session | null;
    /** 비로그인 상태에서 참가/입장을 시도했을 때 호출 — after는 로그인 성공 후 이어서 실행할 동작 */
    onRequireLogin: (opts?: { reason?: string; after?: () => void }) => void;
    /** [2026-11-18] panel = 데스크톱 홈의 오른쪽 패널(표), sheet = 폰 전체 화면 시트(행 목록) */
    variant?: 'panel' | 'sheet';
    /** 패널·시트 닫기 */
    onClose?: () => void;
}

// 홈 화면 우측 패널에 바로 내장하는 리그 목록 — 기존 /multi(LeagueListView) 전체 페이지로 이동하지
// 않고 여기서 바로 조회·참가할 수 있게 한다. 비로그인 조회 허용 여부는 LeagueListView와 동일하게
// listLeaguesWithStats(userId)의 RLS 정책을 그대로 따른다.
export const InlineLeagueList: React.FC<InlineLeagueListProps> = ({ session, onRequireLogin, variant = 'panel', onClose }) => {
    const navigate = useNavigate();
    const { isAdmin } = useGame();
    const userId = session?.user?.id ?? null;

    const [entries,      setEntries]      = useState<LeagueListEntry[]>([]);
    const [isLoading,    setIsLoading]    = useState(true);
    const [activeTab,    setActiveTab]    = useState<Tab>('main_league');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [joinTarget,   setJoinTarget]   = useState<LeagueListEntry | null>(null);
    const [actionErr,    setActionErr]    = useState<string | null>(null);
    // roomId → 가상 시즌 캘린더 날짜(current_virtual_date RPC 결과). rooms.sim_date(실제 KST
    // 방송 예정일)를 직접 읽지 않고 반드시 이 RPC를 거친다 — 서버 스케줄러/트레이드 로직과
    // 동일한 "인게임 날짜" 정의를 써야 화면마다 날짜가 어긋나지 않는다.
    const [virtualDates, setVirtualDates] = useState<Record<string, string | null>>({});

    // 로그인/로그아웃으로 userId가 바뀔 때마다 목록을 다시 불러오긴 하지만(isJoined·RLS 가시
    // 범위가 유저에 따라 달라지므로 필요함), 최초 로딩 이후엔 스피너로 테이블을 통째로 가리지
    // 않는다 — 그러면 로그인할 때마다 테이블이 깜빡이며 사라졌다 다시 그려지는 것처럼 보였다.
    // 이전 데이터를 그대로 보여준 채 백그라운드에서 조용히 교체한다.
    const hasLoadedOnceRef = useRef(false);
    const load = useCallback(() => {
        if (!hasLoadedOnceRef.current) setIsLoading(true);
        listLeaguesWithStats(userId)
            .then(list => {
                setEntries(list);
                hasLoadedOnceRef.current = true;
            })
            .finally(() => setIsLoading(false));
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const roomIds = Array.from(new Set(entries.map(e => e.roomId).filter((id): id is string => !!id)));
        if (roomIds.length === 0) { setVirtualDates({}); return; }
        let cancelled = false;
        Promise.all(roomIds.map(async (roomId) => {
            const { data } = await supabase.rpc('current_virtual_date', { p_room_id: roomId });
            return [roomId, (data as string | null) ?? null] as const;
        })).then(pairs => {
            if (!cancelled) setVirtualDates(Object.fromEntries(pairs));
        });
        return () => { cancelled = true; };
    }, [entries]);

    const filtered = entries.filter(e => e.league.type === activeTab);
    // [2026-11-09] 진행 중(모집/드래프트/시즌) 세션과 종료된 세션을 한 표 안에서 그룹으로 나눠 보여준다.
    // 종료 리그는 둘러보기용으로만 남으므로 아래쪽에 모아 둔다.
    const ongoing = filtered.filter(e => e.league.status !== 'finished');
    const ended   = filtered.filter(e => e.league.status === 'finished');

    const enterLeague = (leagueId: string, shortCode: string | null) => {
        navigate(`/multi/leagues/${shortCode ?? leagueId}/season`);
    };

    // "참가" 클릭 → 팝업(TeamSelectModal)을 열어 그 안에서 팀 선택까지 마치고 "입장하기"를
    // 누르면 시즌 화면으로 이동한다(예전엔 참가 즉시 로비로 이동해 팀 목록 테이블에서
    // 다시 골라야 했음).
    const openJoinModal = (entry: LeagueListEntry) => {
        if (!userId) {
            onRequireLogin({ reason: '리그 참가에는 로그인이 필요합니다.', after: () => openJoinModal(entry) });
            return;
        }
        setActionErr(null);
        setJoinTarget(entry);
    };

    const isSheet = variant === 'sheet';
    const statusClass = (status: string) =>
        status === 'recruiting' ? 'text-amber-400' : status === 'finished' ? 'text-slate-400' : status === 'drafting' ? 'text-amber-400' : 'text-slate-300';

    // 한 세션의 동작 버튼 — 입장 / 둘러보기 / 참가. 입장은 주황 CTA, 나머지는 보조 버튼이고 올리면 인디고(구매 버튼과 같은 규칙)
    const renderAction = (entry: LeagueListEntry) => {
        const { league, isJoined } = entry;
        const canSpectate = !isJoined && isLeagueSpectatable(league);
        const shape = `inline-flex items-center justify-center rounded-lg font-bold whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none ${isSheet ? 'h-11 min-w-[64px] px-3.5 text-sm' : 'h-9 px-4 text-[13px]'}`;
        const cls = `${HOVER_ACCENT_BTN} ${shape}`;
        // 입장(참여 중인 세션)만 예전 홈의 주황 CTA — 가장 자주 누르는 주 동작
        if (isJoined) return <button onClick={() => enterLeague(league.id, league.short_code)} className={`${shape} bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white transition-all active:scale-[0.98]`}>입장</button>;
        if (canSpectate) {
            return (
                <button
                    onClick={() => {
                        if (!userId) { onRequireLogin({ reason: '리그 둘러보기에는 로그인이 필요합니다.', after: () => enterLeague(league.id, league.short_code) }); return; }
                        enterLeague(league.id, league.short_code);
                    }}
                    className={cls}
                >
                    둘러보기
                </button>
            );
        }
        return <button onClick={() => openJoinModal(entry)} disabled={league.status !== 'recruiting'} className={cls}>참가</button>;
    };
    // 이름 — 들어갈 수 있는 세션(참여 중·둘러보기 가능·어드민)은 이름을 눌러도 입장한다(어드민은 참가하지 않은 리그도 이 경로로 들어간다)
    const renderName = (entry: LeagueListEntry) => {
        const { league, isJoined } = entry;
        const canEnter = isJoined || isLeagueSpectatable(league) || !!isAdmin;
        if (!canEnter) return <span className="font-bold truncate block">{league.name}</span>;
        return (
            <button
                onClick={() => {
                    if (!userId) { onRequireLogin({ reason: '리그 입장에는 로그인이 필요합니다.', after: () => enterLeague(league.id, league.short_code) }); return; }
                    enterLeague(league.id, league.short_code);
                }}
                className="font-bold truncate block max-w-full text-left hover:text-[#00D492] transition-colors"
            >
                {league.name}
            </button>
        );
    };
    const statusText = (entry: LeagueListEntry) => entry.isJoined && entry.league.status !== 'finished' ? '참여 중' : (STATUS_LABEL[entry.league.status] ?? entry.league.status);
    const statusCls = (entry: LeagueListEntry) => entry.isJoined && entry.league.status !== 'finished' ? 'text-[#00D492]' : statusClass(entry.league.status);
    // 방을 읽지 못한 리그(비로그인·미참가)는 공개 요약 값(entry.virtualDate·memberCount)을 쓴다
    const memberText = (entry: LeagueListEntry) => entry.hasStats ? `${entry.memberCount} / ${entry.maxPlayers}` : '—';
    const dateText = (entry: LeagueListEntry) => (entry.roomId ? (virtualDates[entry.roomId] ?? null) : entry.virtualDate) ?? '—';
    const groups = ([
        { key: 'ongoing', label: '진행 중', rows: ongoing },
        { key: 'ended',   label: '종료',    rows: ended },
    ]).filter(g => g.rows.length > 0);

    const newLeagueBtn = session && isAdmin && (
        <button onClick={() => setIsCreateOpen(true)} className={`${HOVER_ACCENT_BTN} rounded-lg font-bold ${isSheet ? 'h-11 px-3.5 text-sm' : 'h-10 px-4 text-[13px]'}`}>새 리그</button>
    );
    const tabs = (
        <div className={`shrink-0 flex border-b border-slate-800 ${isSheet ? 'px-4 gap-5' : 'mt-3 px-6 gap-7'}`}>
            {([
                { key: 'main_league' as Tab, label: '온라인 리그' },
                { key: 'tournament' as Tab,  label: '온라인 토너먼트' },
            ]).map(({ key, label }) => (
                <button
                    key={key}
                    onClick={() => { setActiveTab(key); setActionErr(null); }}
                    className={`h-11 font-bold border-b-2 transition-colors ko-normal ${isSheet ? 'text-sm' : 'text-[15px]'} ${
                        activeTab === key ? 'border-[#00D492] text-[#00D492]' : 'border-transparent text-slate-400 hover:text-white'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
    const empty = isLoading ? (
        <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-600" /></div>
    ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400 ko-normal">
            {activeTab === 'tournament' ? '참가 가능한 온라인 토너먼트가 없습니다.' : '참가 가능한 온라인 리그가 없습니다.'}
        </p>
    ) : null;

    return (
        <div className={`w-full h-full flex flex-col pretendard text-white ${isSheet ? 'bg-slate-950' : 'bg-slate-900/95 border border-slate-800 rounded-2xl overflow-hidden'}`}>

            {/* 헤더 */}
            {isSheet ? (
                <div className="shrink-0 h-14 pl-1 pr-4 flex items-center justify-between bg-slate-900 border-b border-slate-800">
                    <button onClick={onClose} aria-label="홈으로 돌아가기" className="h-11 px-3 flex items-center gap-3 text-white">
                        <BackChevron />
                        <span className="text-xl font-bold leading-none">ONLINE LEAGUES</span>
                    </button>
                    {newLeagueBtn}
                </div>
            ) : (
                <div className="shrink-0 pt-5 px-6 flex items-center justify-between gap-4">
                    <h2 className="font-display text-[32px] leading-none tracking-[0.03em]">Online Leagues</h2>
                    <div className="flex items-center gap-2">
                        {newLeagueBtn}
                        {onClose && (
                            <button onClick={onClose} aria-label="닫기" className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"><CloseX /></button>
                        )}
                    </div>
                </div>
            )}

            {tabs}

            {actionErr && (
                <p className="mx-4 mt-3 text-xs text-red-400 ko-normal bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">{actionErr}</p>
            )}

            {/* 목록 — 패널은 표, 폰 시트는 행(개체 목록은 폰에서 행으로: mobile-design-system §1-2) */}
            <div className="flex-1 min-h-0 overflow-auto">
                {empty ?? (isSheet ? (
                    groups.map(group => (
                        <React.Fragment key={group.key}>
                            <div className="h-9 px-4 flex items-center text-sm font-bold text-slate-400 bg-slate-900/70 ko-normal">
                                {group.label}&nbsp;<span className="tabular-nums">{group.rows.length}</span>
                            </div>
                            {group.rows.map(entry => (
                                <div key={entry.league.id} className="min-h-[64px] px-4 py-2 flex items-center justify-between gap-3 border-b border-slate-800">
                                    <span className="flex flex-col gap-0.5 min-w-0">
                                        <span className="text-sm">{renderName(entry)}</span>
                                        <span className="text-xs text-slate-400 tabular-nums truncate">
                                            <span className={`font-bold ${statusCls(entry)}`}>{statusText(entry)}</span> · {dateText(entry)} · {memberText(entry)}
                                        </span>
                                    </span>
                                    <span className="shrink-0">{renderAction(entry)}</span>
                                </div>
                            ))}
                        </React.Fragment>
                    ))
                ) : (
                    <table className="w-full text-sm min-w-[600px]">
                        <thead>
                            <tr className="text-left text-xs text-slate-400">
                                <th className="pl-6 pr-4 pt-3 pb-2.5 font-bold">세션</th>
                                <th className="px-4 pt-3 pb-2.5 font-bold">상태</th>
                                <th className="px-4 pt-3 pb-2.5 font-bold">가상 날짜</th>
                                <th className="px-4 pt-3 pb-2.5 font-bold">참가</th>
                                <th className="pl-4 pr-6 pt-3 pb-2.5"><span className="sr-only">동작</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map(group => (
                                <React.Fragment key={group.key}>
                                    <tr className="bg-slate-950/60">
                                        <td colSpan={5} className="pl-6 pr-4 pt-2.5 pb-2 text-[13px] font-bold text-slate-400 ko-normal whitespace-nowrap">
                                            {group.label} <span className="tabular-nums text-slate-500">{group.rows.length}</span>
                                        </td>
                                    </tr>
                                    {group.rows.map(entry => (
                                        <tr key={entry.league.id} className="border-t border-slate-800">
                                            <td className="pl-6 pr-4 py-3.5 max-w-[220px]">{renderName(entry)}</td>
                                            <td className={`px-4 py-3.5 font-bold whitespace-nowrap ${statusCls(entry)}`}>{statusText(entry)}</td>
                                            <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap tabular-nums">{dateText(entry)}</td>
                                            <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap tabular-nums">{memberText(entry)}</td>
                                            <td className="pl-4 pr-6 py-2 text-right">{renderAction(entry)}</td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                ))}
            </div>

            {isCreateOpen && userId && isAdmin && (
                <CreateLeagueModal
                    userId={userId}
                    isAdmin={isAdmin}
                    onClose={() => setIsCreateOpen(false)}
                    // [2026-09-10] "어드민이 리그를 만들어도 바로 입장되지 않도록" 요청 —
                    // 생성 직후 자동으로 /season 이동하던 걸 없애고 목록만 새로고침한다.
                    // 관리자도 다른 유저와 동일하게 "참가" 팝업(TeamSelectModal)에서 팀을
                    // 골라야 입장할 수 있다.
                    onCreated={() => {
                        setIsCreateOpen(false);
                        load();
                    }}
                />
            )}

            {joinTarget && userId && joinTarget.roomId && (
                <TeamSelectModal
                    league={joinTarget.league}
                    roomId={joinTarget.roomId}
                    userId={userId}
                    onClose={() => { setJoinTarget(null); load(); }}
                    onEntered={() => { setJoinTarget(null); enterLeague(joinTarget.league.id, joinTarget.league.short_code); }}
                />
            )}
        </div>
    );
};

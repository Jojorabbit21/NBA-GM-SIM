
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Loader2, LogIn, Plus } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { listLeaguesWithStats } from '../../services/multi/roomQueries';
import type { LeagueListEntry } from '../../services/multi/roomQueries';
import CreateLeagueModal from '../../components/multi/CreateLeagueModal';
import { TeamSelectModal } from '../../components/multi/TeamSelectModal';
import { STATUS_LABEL } from '../multi/league/leagueConstants';

type Tab = 'tournament' | 'main_league';

interface InlineLeagueListProps {
    session: Session | null;
    /** 비로그인 상태에서 참가/입장을 시도했을 때 호출 — after는 로그인 성공 후 이어서 실행할 동작 */
    onRequireLogin: (opts?: { reason?: string; after?: () => void }) => void;
}

const TH: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <th className={`px-3 py-2 text-left text-sm font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap ${className}`}>
        {children}
    </th>
);

// 홈 화면 우측 패널에 바로 내장하는 리그 목록 — 기존 /multi(LeagueListView) 전체 페이지로 이동하지
// 않고 여기서 바로 조회·참가할 수 있게 한다. 비로그인 조회 허용 여부는 LeagueListView와 동일하게
// listLeaguesWithStats(userId)의 RLS 정책을 그대로 따른다.
export const InlineLeagueList: React.FC<InlineLeagueListProps> = ({ session, onRequireLogin }) => {
    const navigate = useNavigate();
    const userId = session?.user?.id ?? null;

    const [entries,      setEntries]      = useState<LeagueListEntry[]>([]);
    const [isLoading,    setIsLoading]    = useState(true);
    const [activeTab,    setActiveTab]    = useState<Tab>('tournament');
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

    return (
        <div className="w-full h-full bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col animate-in fade-in zoom-in-95 duration-300 pretendard">

            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-white ko-tight">멀티플레이 리그</h2>
                {session && (
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-transparent border border-white/15 hover:bg-white/5 hover:border-white/30 rounded-lg text-xs font-bold text-white transition-colors"
                    >
                        <Plus size={12} />
                        <span className="ko-normal">새 리그</span>
                    </button>
                )}
            </div>

            {/* 탭 */}
            <div className="flex gap-1 border-b border-slate-700/50 mb-3">
                {([
                    { key: 'tournament' as Tab,  label: '온라인 토너먼트' },
                    { key: 'main_league' as Tab, label: '온라인 리그' },
                ]).map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => { setActiveTab(key); setActionErr(null); }}
                        className={`flex items-center gap-1.5 px-3 py-2 text-base font-bold transition-colors border-b-2 -mb-px ${
                            activeTab === key
                                ? 'border-orange-500 text-white'
                                : 'border-transparent text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        <span className="ko-normal">{label}</span>
                    </button>
                ))}
            </div>

            {actionErr && (
                <p className="text-xs text-red-400 ko-normal bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2 mb-3">
                    {actionErr}
                </p>
            )}

            {/* 목록 — 테이블 형식. 부모(패널)가 푸터까지 늘어난 고정 높이를 주므로 내부는 그 안에서만 스크롤 */}
            <div className="flex-1 min-h-0 overflow-auto">
                {isLoading ? (
                    <div className="py-10 flex justify-center">
                        <Loader2 size={18} className="animate-spin text-slate-600" />
                    </div>
                ) : filtered.length === 0 ? (
                    <p className="py-10 text-center text-xs text-slate-500 ko-normal">
                        {activeTab === 'tournament' ? '참가 가능한 온라인 토너먼트가 없습니다.' : '참가 가능한 온라인 리그가 없습니다.'}
                    </p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900/60 sticky top-0">
                            <tr>
                                <TH className="pl-4">이름</TH>
                                <TH>상태</TH>
                                <TH>현재 날짜</TH>
                                <TH>참여인원</TH>
                                <TH className="pr-4 text-right">입장</TH>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {filtered.map((entry) => {
                                const { league, roomId, memberCount, maxPlayers, isJoined } = entry;
                                const memberDisplay = (!userId && roomId === null) ? '—' : `${memberCount}/${maxPlayers}`;
                                const virtualDate = roomId ? (virtualDates[roomId] ?? null) : null;

                                return (
                                    <tr key={league.id} className="bg-slate-900/30 hover:bg-slate-900/60 transition-colors">
                                        <td className="pl-4 pr-2 py-2.5 max-w-[140px]">
                                            <button
                                                onClick={() => {
                                                    if (!userId) { onRequireLogin({ reason: '리그 입장에는 로그인이 필요합니다.', after: () => enterLeague(league.id, league.short_code) }); return; }
                                                    enterLeague(league.id, league.short_code);
                                                }}
                                                className="font-bold text-white hover:text-orange-300 transition-colors text-left truncate block w-full"
                                            >
                                                {league.name}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            <span className={`text-xs font-bold ${
                                                league.status === 'recruiting'
                                                    ? 'text-emerald-400'
                                                    : league.status === 'drafting'
                                                    ? 'text-amber-400'
                                                    : league.status === 'finished'
                                                    ? 'text-slate-500'
                                                    : 'text-slate-400'
                                            }`}>
                                                {STATUS_LABEL[league.status] ?? league.status}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-slate-300 whitespace-nowrap tabular-nums">{virtualDate ?? '—'}</td>
                                        <td className="px-3 py-2.5 text-xs text-slate-300 whitespace-nowrap tabular-nums">{memberDisplay}</td>
                                        <td className="pl-2 pr-4 py-2.5 text-right">
                                            {isJoined ? (
                                                <button
                                                    onClick={() => enterLeague(league.id, league.short_code)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-lg text-xs font-bold text-white transition-all active:scale-[0.98]"
                                                >
                                                    <LogIn size={11} />
                                                    들어가기
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => openJoinModal(entry)}
                                                    disabled={league.status !== 'recruiting'}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-all active:scale-[0.98]"
                                                >
                                                    <Plus size={11} />
                                                    참가
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {isCreateOpen && userId && (
                <CreateLeagueModal
                    userId={userId}
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

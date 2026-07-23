
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Loader2, LogIn, LogOut, Trophy, Users, AlertTriangle } from 'lucide-react';
import { listLeaguesWithStats } from '../../../services/multi/roomQueries';
import type { LeagueListEntry } from '../../../services/multi/roomQueries';
import { deleteLeague, joinLeague, leaveLeague } from '../../../services/multi/leagueService';
import { useGame } from '../../../hooks/useGameContext';
import CreateLeagueModal from '../../../components/multi/CreateLeagueModal';
import {
    TIER_LABEL,
    STATUS_LABEL,
    TOURNAMENT_FORMAT_LABEL,
    MATCH_FORMAT_LABEL,
} from './leagueConstants';

type Tab = 'tournament' | 'main_league';

// ── 열 헤더 ──────────────────────────────────────────────────────────────────

const TH: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <th className={`px-3 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap ${className}`}>
        {children}
    </th>
);

// ── LeagueListView ────────────────────────────────────────────────────────────

const LeagueListView: React.FC = () => {
    const navigate = useNavigate();
    const { session } = useGame();
    const userId = session?.user?.id ?? null;

    const [entries,      setEntries]      = useState<LeagueListEntry[]>([]);
    const [isLoading,    setIsLoading]    = useState(true);
    const [activeTab,    setActiveTab]    = useState<Tab>('tournament');
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // 행별 액션 상태
    const [joiningId,    setJoiningId]    = useState<string | null>(null); // leagueId
    const [leavingId,    setLeavingId]    = useState<string | null>(null); // leagueId
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deletingId,   setDeletingId]   = useState<string | null>(null);
    const [actionErr,    setActionErr]    = useState<string | null>(null);

    const load = useCallback(() => {
        setIsLoading(true);
        listLeaguesWithStats(userId)
            .then(setEntries)
            .finally(() => setIsLoading(false));
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    const filtered = entries.filter(e => e.league.type === activeTab);

    // ── 참가 ───────────────────────────────────────────────────────────────────
    const handleJoin = async (leagueId: string) => {
        if (!userId) return;
        setJoiningId(leagueId);
        setActionErr(null);
        const { error } = await joinLeague(leagueId, userId);
        setJoiningId(null);
        if (error) { setActionErr(error); return; }
        // 참가 후 로비로 이동
        navigate(`/multi/leagues/${leagueId}/lobby`);
    };

    // ── 탈퇴 ───────────────────────────────────────────────────────────────────
    const handleLeave = async (leagueId: string, roomId: string) => {
        if (!userId) return;
        setLeavingId(leagueId);
        setActionErr(null);
        const { error } = await leaveLeague(roomId, userId);
        setLeavingId(null);
        if (error) { setActionErr(error); return; }
        load();
    };

    // ── 삭제 ───────────────────────────────────────────────────────────────────
    const handleDeleteConfirm = async () => {
        if (!userId || !deleteTarget) return;
        const { id } = deleteTarget;
        setDeletingId(id);
        setActionErr(null);
        const { error } = await deleteLeague(id, userId);
        setDeletingId(null);
        if (error) { setActionErr(error); setDeleteTarget(null); return; }
        setDeleteTarget(null);
        setEntries(prev => prev.filter(e => e.league.id !== id));
    };

    // ── 탭 카운트 ──────────────────────────────────────────────────────────────
    const tabCount = (tab: Tab) => entries.filter(e => e.league.type === tab).length;

    // ── 삭제 확인 모달 ──────────────────────────────────────────────────────────
    const DeleteConfirmModal: React.FC = () => {
        if (!deleteTarget) return null;
        const isDeleting = !!deletingId;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xs mx-4 p-6 space-y-5">
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center">
                            <AlertTriangle size={16} className="text-red-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white ko-tight">리그 삭제</h3>
                            <p className="text-xs text-slate-400 ko-normal mt-0.5">이 작업은 되돌릴 수 없습니다</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-300 ko-normal">
                        <span className="font-bold text-white">"{deleteTarget.name}"</span>을(를) 삭제하시겠습니까?
                        <br />
                        <span className="text-xs text-slate-500 mt-1 block">방, 멤버 등 모든 데이터가 함께 삭제됩니다.</span>
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setDeleteTarget(null)}
                            disabled={isDeleting}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isDeleting
                                ? <span className="flex items-center justify-center gap-1.5"><Loader2 size={13} className="animate-spin" />삭제 중…</span>
                                : '삭제'
                            }
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">

            {/* 헤더 */}
            <div className="flex items-end justify-between">
                <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">멀티플레이</p>
                    <h1 className="text-2xl font-black text-white ko-tight">리그 목록</h1>
                </div>

                {/* 리그 생성 버튼 */}
                {session && (
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-bold text-white transition-colors"
                    >
                        <Plus size={14} />
                        <span className="ko-normal">새 리그</span>
                    </button>
                )}
            </div>

            {/* 에러 */}
            {actionErr && (
                <p className="text-xs text-red-400 ko-normal bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-2">
                    {actionErr}
                </p>
            )}

            {/* 탭 */}
            <div className="flex gap-1 border-b border-slate-800">
                {([
                    { key: 'tournament' as Tab,  label: '토너먼트', Icon: Trophy },
                    { key: 'main_league' as Tab, label: '메인리그', Icon: Users  },
                ]).map(({ key, label, Icon }) => (
                    <button
                        key={key}
                        onClick={() => { setActiveTab(key); setActionErr(null); }}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px ${
                            activeTab === key
                                ? 'border-indigo-500 text-white'
                                : 'border-transparent text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        <Icon size={13} />
                        <span className="ko-normal">{label}</span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                            activeTab === key ? 'bg-indigo-500/30 text-indigo-300' : 'bg-slate-800 text-slate-500'
                        }`}>
                            {tabCount(key)}
                        </span>
                    </button>
                ))}
            </div>

            {/* 테이블 */}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-sm">
                    <thead className="bg-slate-900/80">
                        <tr>
                            <TH className="pl-4">리그 이름</TH>
                            <TH>유형</TH>
                            {activeTab === 'tournament' && <TH>대진방식</TH>}
                            {activeTab === 'tournament' && <TH>경기 포맷</TH>}
                            <TH>상태</TH>
                            <TH className="text-center">인원</TH>
                            <TH className="pr-4 text-right" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {isLoading ? (
                            <tr>
                                <td colSpan={activeTab === 'tournament' ? 7 : 5} className="px-4 py-10 text-center">
                                    <Loader2 size={18} className="animate-spin text-slate-600 mx-auto" />
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={activeTab === 'tournament' ? 7 : 5}
                                    className="px-4 py-10 text-center text-xs text-slate-500 ko-normal">
                                    {activeTab === 'tournament' ? '참가 가능한 토너먼트가 없습니다.' : '참가 가능한 메인리그가 없습니다.'}
                                </td>
                            </tr>
                        ) : (
                            filtered.map(({ league, roomId, memberCount, maxPlayers, isJoined }) => {
                                const isAdmin    = league.admin_user_id === userId;
                                const isJoining  = joiningId === league.id;
                                const isLeaving  = leavingId === league.id;

                                return (
                                    <tr key={league.id} className="bg-slate-900/40 hover:bg-slate-800/60 transition-colors">

                                        {/* 리그 이름 */}
                                        <td className="pl-4 pr-2 py-3 whitespace-nowrap max-w-[180px] truncate">
                                            <button
                                                onClick={() => navigate(`/multi/leagues/${league.id}/lobby`)}
                                                className="font-bold text-white hover:text-indigo-300 transition-colors text-left truncate"
                                            >
                                                {league.name}
                                            </button>
                                        </td>

                                        {/* 유형 (tier / tournament_format) */}
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            {league.type === 'main_league' && league.tier ? (
                                                <span className="text-[11px] font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full">
                                                    {TIER_LABEL[league.tier] ?? league.tier}
                                                </span>
                                            ) : (
                                                <span className="text-[11px] text-slate-400">—</span>
                                            )}
                                        </td>

                                        {/* 대진방식 (토너먼트만) */}
                                        {activeTab === 'tournament' && (
                                            <td className="px-3 py-3 text-xs text-slate-300 whitespace-nowrap">
                                                {league.tournament_format
                                                    ? (TOURNAMENT_FORMAT_LABEL[league.tournament_format] ?? league.tournament_format)
                                                    : <span className="text-slate-600">—</span>
                                                }
                                            </td>
                                        )}

                                        {/* 경기 포맷 (토너먼트만) */}
                                        {activeTab === 'tournament' && (
                                            <td className="px-3 py-3 text-xs text-slate-300 whitespace-nowrap">
                                                {league.match_format ? (
                                                    <>
                                                        {MATCH_FORMAT_LABEL[league.match_format] ?? league.match_format}
                                                        {league.finals_match_format && league.finals_match_format !== league.match_format && (
                                                            <span className="text-slate-500 ml-1">
                                                                / 결승 {MATCH_FORMAT_LABEL[league.finals_match_format] ?? league.finals_match_format}
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-slate-600">—</span>
                                                )}
                                            </td>
                                        )}

                                        {/* 상태 */}
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                                league.status === 'recruiting'
                                                    ? 'text-emerald-400 bg-emerald-500/15'
                                                    : league.status === 'drafting'
                                                    ? 'text-amber-400 bg-amber-500/15'
                                                    : league.status === 'finished'
                                                    ? 'text-slate-500 bg-slate-800/70'
                                                    : 'text-slate-400 bg-slate-700/50'
                                            }`}>
                                                {STATUS_LABEL[league.status] ?? league.status}
                                            </span>
                                        </td>

                                        {/* 인원 */}
                                        <td className="px-3 py-3 text-center whitespace-nowrap">
                                            <span className="text-sm font-bold text-white">{memberCount}</span>
                                            <span className="text-xs text-slate-500">/{maxPlayers}</span>
                                        </td>

                                        {/* 액션 버튼 */}
                                        <td className="pl-2 pr-4 py-3">
                                            <div className="flex items-center justify-end gap-2">

                                                {/* 참가 / 들어가기 */}
                                                {isJoined ? (
                                                    <button
                                                        onClick={() => navigate(
                                                            (league.status === 'in_progress' || league.status === 'finished')
                                                                ? `/multi/leagues/${league.id}/season`
                                                                : `/multi/leagues/${league.id}/lobby`
                                                        )}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold text-white transition-colors"
                                                    >
                                                        <LogIn size={11} />
                                                        들어가기
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleJoin(league.id)}
                                                        disabled={!!isJoining || league.status !== 'recruiting'}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors"
                                                    >
                                                        {isJoining
                                                            ? <Loader2 size={11} className="animate-spin" />
                                                            : <Plus size={11} />
                                                        }
                                                        참가
                                                    </button>
                                                )}

                                                {/* 탈퇴 (참가 중인 경우만) */}
                                                {isJoined && roomId && (
                                                    <button
                                                        onClick={() => handleLeave(league.id, roomId)}
                                                        disabled={!!isLeaving}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-red-900/40 hover:text-red-400 text-slate-400 disabled:opacity-40 rounded-lg text-xs font-bold transition-colors"
                                                    >
                                                        {isLeaving
                                                            ? <Loader2 size={11} className="animate-spin" />
                                                            : <LogOut size={11} />
                                                        }
                                                        탈퇴
                                                    </button>
                                                )}

                                                {/* 삭제 (어드민만) */}
                                                {isAdmin && (
                                                    <button
                                                        onClick={() => { setActionErr(null); setDeleteTarget({ id: league.id, name: league.name }); }}
                                                        className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                        title="리그 삭제"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* 리그 생성 모달 */}
            {isCreateOpen && userId && (
                <CreateLeagueModal
                    userId={userId}
                    onClose={() => setIsCreateOpen(false)}
                    onCreated={(leagueId) => {
                        setIsCreateOpen(false);
                        navigate(`/multi/leagues/${leagueId}/lobby`);
                    }}
                />
            )}

            {/* 삭제 확인 모달 */}
            <DeleteConfirmModal />
        </div>
    );
};

export default LeagueListView;

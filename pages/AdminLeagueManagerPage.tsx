import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { listLeaguesWithStats } from '../services/multi/roomQueries';
import type { LeagueListEntry } from '../services/multi/roomQueries';
import { deleteLeague } from '../services/multi/leagueService';
import CreateLeagueModal from '../components/multi/CreateLeagueModal';
import { STATUS_LABEL } from '../views/multi/league/leagueConstants';

type EditorContext = { userId?: string };
type Tab = 'all' | 'tournament' | 'main_league';

const TH: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <th className={`px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap ${className}`}>
        {children}
    </th>
);

const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Admin 편집기의 "리그 관리" 탭 — /admin/editor/league. 세션 설정(LeagueSettingsView)의
// 리그 삭제는 그 리그 안에 들어가야만 보였는데, 여러 리그/토너먼트를 한 곳에서 만들고
// 지울 수 있어야 한다는 요청으로 신설. 개설은 기존 CreateLeagueModal(InlineLeagueList와
// 동일 컴포넌트)을 그대로 재사용하고, 삭제는 LeagueSettingsView와 동일한
// deleteLeague()(leagues 삭제 → rooms/room_members/league_teams 등 CASCADE)를 그대로 쓴다.
const AdminLeagueManagerPage: React.FC = () => {
    const { userId } = useOutletContext<EditorContext>();

    const [entries,      setEntries]      = useState<LeagueListEntry[]>([]);
    const [isLoading,    setIsLoading]    = useState(true);
    const [activeTab,    setActiveTab]    = useState<Tab>('all');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [deleting,     setDeleting]     = useState(false);
    const [deleteErr,    setDeleteErr]    = useState<string | null>(null);

    const load = useCallback(() => {
        setIsLoading(true);
        // listLeaguesWithStats(null): 유저 참가 여부(isJoined)는 이 페이지에서 쓰지 않으므로
        // 특정 유저 기준으로 좁힐 필요 없이 전체 리그를 그대로 가져온다.
        listLeaguesWithStats(null)
            .then(setEntries)
            .finally(() => setIsLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = activeTab === 'all' ? entries : entries.filter(e => e.league.type === activeTab);

    const handleDelete = async (leagueId: string) => {
        if (!userId) return;
        setDeleting(true);
        setDeleteErr(null);
        const { error } = await deleteLeague(leagueId, userId);
        setDeleting(false);
        if (error) { setDeleteErr(error); return; }
        setDeleteTarget(null);
        load();
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex gap-1 border-b border-slate-800">
                    {([
                        { key: 'all' as Tab,         label: '전체' },
                        { key: 'tournament' as Tab,  label: '토너먼트' },
                        { key: 'main_league' as Tab, label: '리그' },
                    ]).map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 -mb-px ${
                                activeTab === key
                                    ? 'border-indigo-500 text-white'
                                    : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {userId && (
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold text-white transition-colors"
                    >
                        <Plus size={14} />
                        새 리그/토너먼트
                    </button>
                )}
            </div>

            {deleteErr && (
                <p className="text-xs text-red-400 ko-normal bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                    {deleteErr}
                </p>
            )}

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                {isLoading ? (
                    <div className="py-10 flex justify-center">
                        <Loader2 size={18} className="animate-spin text-slate-600" />
                    </div>
                ) : filtered.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">표시할 리그/토너먼트가 없습니다.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900">
                            <tr>
                                <TH className="pl-4">이름</TH>
                                <TH>유형</TH>
                                <TH>상태</TH>
                                <TH>시즌</TH>
                                <TH>참여인원</TH>
                                <TH>생성일</TH>
                                <TH className="pr-4 text-right">관리</TH>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {filtered.map(({ league, memberCount, maxPlayers, season }) => (
                                <tr key={league.id} className="hover:bg-slate-800/40 transition-colors">
                                    <td className="pl-4 pr-2 py-2.5 font-bold text-white max-w-[220px] truncate">{league.name}</td>
                                    <td className="px-3 py-2.5 text-slate-400">
                                        {league.type === 'tournament' ? '토너먼트' : '리그'}
                                    </td>
                                    <td className="px-3 py-2.5">
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
                                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{season ?? '—'}</td>
                                    <td className="px-3 py-2.5 text-slate-400 tabular-nums whitespace-nowrap">{memberCount}/{maxPlayers}</td>
                                    <td className="px-3 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">{fmtDate(league.created_at)}</td>
                                    <td className="pl-2 pr-4 py-2.5 text-right">
                                        {deleteTarget === league.id ? (
                                            <div className="flex items-center justify-end gap-1.5">
                                                <span className="text-xs text-slate-400 mr-1">삭제할까요?</span>
                                                <button
                                                    onClick={() => handleDelete(league.id)}
                                                    disabled={deleting}
                                                    className="px-2.5 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-xs font-bold text-white transition-colors"
                                                >
                                                    {deleting ? <Loader2 size={12} className="animate-spin" /> : '확인'}
                                                </button>
                                                <button
                                                    onClick={() => { setDeleteTarget(null); setDeleteErr(null); }}
                                                    disabled={deleting}
                                                    className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-xs text-slate-300 transition-colors"
                                                >
                                                    취소
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => { setDeleteTarget(league.id); setDeleteErr(null); }}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-red-600 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition-colors"
                                            >
                                                <Trash2 size={12} />
                                                삭제
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {isCreateOpen && userId && (
                <CreateLeagueModal
                    userId={userId}
                    onClose={() => setIsCreateOpen(false)}
                    onCreated={() => {
                        setIsCreateOpen(false);
                        load();
                    }}
                />
            )}
        </div>
    );
};

export default AdminLeagueManagerPage;

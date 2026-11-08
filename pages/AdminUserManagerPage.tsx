import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Trash2 } from 'lucide-react';
import { adminListUsers, adminDeleteUser, type AdminUserRow } from '../services/admin/userAdminService';
import { adminFetchAllWallets, adminGrantPointsAll } from '../services/admin/pointsAdminService';
import { PointsGrantForm } from '../components/admin/PointsGrantForm';
import type { WalletRow } from '../types/points';

const TH: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <th className={`px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap ${className}`}>
        {children}
    </th>
);

const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Admin 편집기의 "사용자 관리" 탭 — /admin/editor/users. profiles 테이블 전체를 Fly.io
// 서버(서비스 롤)를 거쳐 조회한다(RLS가 본인 행만 허용해서 클라이언트 직접 조회 불가).
// 행 클릭 시 AdminUserDetailPage(/admin/editor/users/:userId)로 이동해 상세 수정.
const AdminUserManagerPage: React.FC = () => {
    const navigate = useNavigate();
    const [users,       setUsers]       = useState<AdminUserRow[]>([]);
    const [isLoading,   setIsLoading]   = useState(true);
    const [loadErr,     setLoadErr]     = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [deleting,    setDeleting]    = useState(false);
    const [deleteErr,   setDeleteErr]   = useState<string | null>(null);
    // [2026-11-08] 포인트 열 — user_wallets 는 전역 어드민에게 SELECT 가 열려 있어 직접 읽는다. 행 없음 = 0 P
    const [wallets,     setWallets]     = useState<Record<string, WalletRow>>({});

    const load = useCallback(() => {
        setIsLoading(true);
        Promise.all([adminListUsers(), adminFetchAllWallets().catch(() => ({} as Record<string, WalletRow>))])
            .then(([{ data, error }, w]) => {
                setUsers(data);
                setLoadErr(error);
                setWallets(w);
                setIsLoading(false);
            });
    }, []);

    const handleGrantAll = async (amount: number, note: string) => {
        const { error } = await adminGrantPointsAll(amount, note);
        if (error) return error;
        load();
        return null;
    };

    useEffect(() => { load(); }, [load]);

    const handleDelete = async (userId: string) => {
        setDeleting(true);
        setDeleteErr(null);
        const { error } = await adminDeleteUser(userId);
        setDeleting(false);
        if (error) { setDeleteErr(error); return; }
        setDeleteTarget(null);
        load();
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-400">총 {users.length}명</p>
                {/* 전체 지급/회수 — 전원 대상. 회수는 각자 잔액까지만(잔액 0 은 건너뜀) */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500 whitespace-nowrap">전체 BP</span>
                    <PointsGrantForm
                        onSubmit={handleGrantAll}
                        confirmText={{ grant: `전원에게 {n} BP 지급할까요?`, revoke: `전원에게서 {n} BP 회수할까요?` }}
                        successText={a => a > 0 ? `전원에게 ${a.toLocaleString('ko-KR')} BP 지급했습니다.` : `전원에게서 최대 ${(-a).toLocaleString('ko-KR')} BP 회수했습니다.`}
                    />
                </div>
            </div>

            {(loadErr || deleteErr) && (
                <p className="text-xs text-red-400 ko-normal bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                    {loadErr ?? deleteErr}
                </p>
            )}

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                {isLoading ? (
                    <div className="py-10 flex justify-center">
                        <Loader2 size={18} className="animate-spin text-slate-600" />
                    </div>
                ) : users.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">사용자가 없습니다.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900">
                            <tr>
                                <TH className="pl-4">닉네임</TH>
                                <TH>이메일</TH>
                                <TH>이름</TH>
                                <TH>국적</TH>
                                <TH>생년</TH>
                                <TH className="text-right">BP</TH>
                                <TH>가입일</TH>
                                <TH className="pr-4 text-right">관리</TH>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {users.map(u => {
                                const isProtectedAdmin = u.is_admin;
                                const fullName = [u.last_name, u.first_name].filter(Boolean).join(' ');
                                return (
                                    <tr
                                        key={u.id}
                                        onClick={() => navigate(`/admin/editor/users/${u.id}`, { state: { user: u } })}
                                        className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                                    >
                                        <td className="pl-4 pr-2 py-2.5 font-bold text-white max-w-[160px] truncate">
                                            {u.nickname || '—'}
                                            {isProtectedAdmin && <span className="ml-1.5 text-[10px] font-bold text-indigo-400">ADMIN</span>}
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-400 max-w-[220px] truncate">{u.email ?? '—'}</td>
                                        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fullName || '—'}</td>
                                        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{u.nationality ?? '—'}</td>
                                        <td className="px-3 py-2.5 text-slate-400 tabular-nums whitespace-nowrap">{u.birth_year ?? '—'}</td>
                                        <td className="px-3 py-2.5 text-white font-bold tabular-nums whitespace-nowrap text-right">{(wallets[u.id]?.balance ?? 0).toLocaleString('ko-KR')} BP</td>
                                        <td className="px-3 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">{fmtDate(u.created_at)}</td>
                                        <td className="pl-2 pr-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                                            {isProtectedAdmin ? (
                                                <span className="text-xs text-slate-600">삭제 불가</span>
                                            ) : deleteTarget === u.id ? (
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <span className="text-xs text-slate-400 mr-1">삭제할까요?</span>
                                                    <button
                                                        onClick={() => handleDelete(u.id)}
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
                                                    onClick={() => { setDeleteTarget(u.id); setDeleteErr(null); }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-red-600 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition-colors"
                                                >
                                                    <Trash2 size={12} />
                                                    삭제
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
        </div>
    );
};

export default AdminUserManagerPage;

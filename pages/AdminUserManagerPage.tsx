import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Trash2 } from 'lucide-react';
import { adminListUsers, adminDeleteUser, type AdminUserRow } from '../services/admin/userAdminService';

const ADMIN_USER_ID = 'd2f6a469-9182-4dac-a098-278e6e758c79';

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

    const load = useCallback(() => {
        setIsLoading(true);
        adminListUsers().then(({ data, error }) => {
            setUsers(data);
            setLoadErr(error);
            setIsLoading(false);
        });
    }, []);

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
            <p className="text-sm text-slate-400">총 {users.length}명</p>

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
                                <TH>가입일</TH>
                                <TH className="pr-4 text-right">관리</TH>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {users.map(u => {
                                const isSelf = u.id === ADMIN_USER_ID;
                                const fullName = [u.last_name, u.first_name].filter(Boolean).join(' ');
                                return (
                                    <tr
                                        key={u.id}
                                        onClick={() => navigate(`/admin/editor/users/${u.id}`, { state: { user: u } })}
                                        className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                                    >
                                        <td className="pl-4 pr-2 py-2.5 font-bold text-white max-w-[160px] truncate">
                                            {u.nickname || '—'}
                                            {isSelf && <span className="ml-1.5 text-[10px] font-bold text-indigo-400">ADMIN</span>}
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-400 max-w-[220px] truncate">{u.email ?? '—'}</td>
                                        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fullName || '—'}</td>
                                        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{u.nationality ?? '—'}</td>
                                        <td className="px-3 py-2.5 text-slate-400 tabular-nums whitespace-nowrap">{u.birth_year ?? '—'}</td>
                                        <td className="px-3 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">{fmtDate(u.created_at)}</td>
                                        <td className="pl-2 pr-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                                            {isSelf ? (
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

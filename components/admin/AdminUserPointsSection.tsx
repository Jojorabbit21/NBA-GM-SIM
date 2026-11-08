import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { InlineNotice } from '../common/InlineNotice';
import { PointsGrantForm } from './PointsGrantForm';
import { adminFetchLedger, adminFetchWallet, adminGrantPoints } from '../../services/admin/pointsAdminService';
import { formatPoints, pointSourceLabel } from '../../services/points/pointsService';
import type { LedgerRow, WalletRow } from '../../types/points';

interface Props { userId: string; }

const TH: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <th className={`px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap ${className}`}>
        {children}
    </th>
);

const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// 사용자 상세(/admin/editor/users/:userId)의 "포인트" 섹션 — 잔액·누적, 지급/회수 입력, 원장 전체(최신 100건).
// 메모는 원장 meta.note. 지급/회수 뒤 지갑·원장을 다시 읽는다.
export const AdminUserPointsSection: React.FC<Props> = ({ userId }) => {
    const [wallet, setWallet] = useState<WalletRow | null>(null);
    const [ledger, setLedger] = useState<LedgerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([adminFetchWallet(userId), adminFetchLedger(userId)])
            .then(([w, l]) => { setWallet(w); setLedger(l); setErr(null); })
            .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'BP 내역을 불러오지 못했습니다.'))
            .finally(() => setLoading(false));
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    const submit = async (amount: number, note: string) => {
        const { error } = await adminGrantPoints(userId, amount, note);
        if (!error) load();
        return error;
    };

    return (
        <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-bold text-white ko-tight">BP</h2>
                <div className="flex items-center gap-4 text-xs">
                    <span className="text-slate-400 ko-normal">잔액 <span className="ml-1 text-sm font-bold text-white tabular-nums">{wallet ? formatPoints(wallet.balance) : '—'}</span></span>
                    <span className="text-slate-400 ko-normal">누적 획득 <span className="ml-1 text-sm font-bold text-white tabular-nums">{wallet ? formatPoints(wallet.lifetime_earned) : '—'}</span></span>
                </div>
            </div>

            <PointsGrantForm
                onSubmit={submit}
                successText={a => a > 0 ? `${a.toLocaleString('ko-KR')} BP 지급했습니다.` : `${(-a).toLocaleString('ko-KR')} BP 회수했습니다.`}
            />

            {err && <InlineNotice tone="danger" size="sm">{err}</InlineNotice>}

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                {loading ? (
                    <div className="py-6 flex justify-center"><Loader2 size={16} className="animate-spin text-slate-600" /></div>
                ) : ledger.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500">내역이 없습니다.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900">
                            <tr>
                                <TH className="pl-4">일시</TH>
                                <TH>출처</TH>
                                <TH>메모</TH>
                                <TH className="text-right">변동</TH>
                                <TH className="pr-4 text-right">잔액</TH>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {ledger.map(row => {
                                const note = typeof row.meta?.note === 'string' ? row.meta.note : '';
                                return (
                                    <tr key={row.id}>
                                        <td className="pl-4 pr-2 py-2 text-xs text-slate-500 tabular-nums whitespace-nowrap">{fmtDateTime(row.created_at)}</td>
                                        <td className="px-3 py-2 text-xs text-slate-300 whitespace-nowrap">
                                            {pointSourceLabel(row.source)}
                                            {row.ref_type === 'admin_all' && <span className="ml-1 text-[10px] text-slate-500">전체</span>}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-slate-400 max-w-[260px] truncate" title={note}>{note || '—'}</td>
                                        <td className={`px-3 py-2 text-xs font-bold tabular-nums text-right whitespace-nowrap ${row.delta > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                            {row.delta > 0 ? '+' : ''}{row.delta.toLocaleString('ko-KR')}
                                        </td>
                                        <td className="pl-2 pr-4 py-2 text-xs text-white tabular-nums text-right whitespace-nowrap">{row.balance_after.toLocaleString('ko-KR')}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </section>
    );
};

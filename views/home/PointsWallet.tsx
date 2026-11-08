
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useRecentLedger, useWallet } from '../../hooks/usePoints';
import { POINTS_ICON_URL, formatPoints, pointSourceLabel } from '../../services/points/pointsService';

interface PointsWalletProps {
    userId: string;
}

const RECENT_COUNT = 5;

const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 로비 계정 영역 하단의 포인트(재화) 행 — 기본은 잔액 한 줄, 누르면 누적 획득과 최근 내역 5건이 펼쳐진다.
// 행 스타일은 MultiplayerHistory의 StatRow/참가 이력과 같다. 지갑이 없는 유저(지급 전)는 0 BP.
// 계획: docs/plan/points-system-plan.md
export const PointsWallet: React.FC<PointsWalletProps> = ({ userId }) => {
    const [open, setOpen] = useState(false);
    const { data: wallet } = useWallet(userId);
    const { data: ledger } = useRecentLedger(userId, RECENT_COUNT, open);

    return (
        <div className="pt-3">
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-2 text-left"
            >
                <img src={POINTS_ICON_URL} alt="" width={16} height={16} className="shrink-0" />
                <span className="text-xs text-slate-400 ko-normal flex-1">BP</span>
                <span className="text-sm font-bold text-white tabular-nums">
                    {wallet ? formatPoints(wallet.balance) : '—'}
                </span>
                <ChevronDown
                    size={14}
                    className={`text-slate-500 transition-transform ${open ? '' : '-rotate-90'}`}
                />
            </button>

            {open && (
                <div className="mt-2 divide-y divide-slate-700/50">
                    <div className="flex items-center justify-between gap-2 py-1.5">
                        <span className="text-xs text-slate-400 ko-normal">누적 획득</span>
                        <span className="text-sm font-bold text-white tabular-nums">
                            {wallet ? formatPoints(wallet.lifetime_earned) : '—'}
                        </span>
                    </div>
                    {ledger && ledger.length === 0 && (
                        <div className="py-1.5">
                            <span className="text-xs text-slate-500 ko-normal">내역 없음</span>
                        </div>
                    )}
                    {ledger?.map(row => (
                        <div key={row.id} className="flex items-center justify-between gap-2 py-1.5">
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{pointSourceLabel(row.source)}</p>
                                <p className="text-[11px] text-slate-500 tabular-nums">{formatDate(row.created_at)}</p>
                            </div>
                            <span className={`text-xs font-bold tabular-nums shrink-0 ${row.delta > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                {row.delta > 0 ? '+' : ''}{row.delta.toLocaleString('ko-KR')}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

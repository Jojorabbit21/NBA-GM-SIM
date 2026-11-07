// PhoneDraftRoster.tsx — 드래프트 룸 폰 "내 로스터" 탭. [2026-11-08]
// docs/ui/mobile-design-system.md §9-0-4 "내 로스터": 서브헤더 40(AUTO 토글 32 | 포지션 수 · 총 N) + 선발(PG~C)·벤치 섹션 36 + 행 44(POS 32 · OVR 24 · 이름 · 연봉),
// 팀 토탈 44 하단 고정(alternative 계약 모드만). 선발/벤치 배정은 MyRoster.tsx와 같은 규칙(픽 순서대로 포지션 첫 선수가 선발).
import React, { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Player } from '../../../types';
import { OvrBadge } from '../../common/OvrBadge';
import { Button } from '../../common/Button';
import { formatMoney } from '../../../utils/formatMoney';

const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

interface PhoneDraftRosterProps {
    players: Player[];
    salaries?: Record<string, number>;
    myAutoPick?: boolean;
    onToggleAutoPick?: (next: boolean) => void;
    autoPickDisabled?: boolean;
    onOpenPlayer: (p: Player) => void;
}

export const PhoneDraftRoster: React.FC<PhoneDraftRosterProps> = ({ players, salaries, myAutoPick = false, onToggleAutoPick, autoPickDisabled = false, onOpenPlayer }) => {
    const { starters, reserves, posCounts, totalSalary } = useMemo(() => {
        const starters: (Player | null)[] = POSITION_ORDER.map(() => null);
        const reserves: Player[] = [];
        const counts: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
        for (const p of players) {
            if (p.position in counts) counts[p.position] += 1;
            const slot = POSITION_ORDER.indexOf(p.position as typeof POSITION_ORDER[number]);
            if (slot >= 0 && !starters[slot]) starters[slot] = p; else reserves.push(p);
        }
        const totalSalary = salaries ? players.reduce((s, p) => s + (salaries[p.id] ?? 0), 0) : null;
        return { starters, reserves, posCounts: counts, totalSalary };
    }, [players, salaries]);

    const row = (key: string, pos: string, p: Player | null) => (
        <div key={key} className="h-11 px-4 flex items-center gap-2 border-b border-slate-700/50">
            <span className={`w-8 shrink-0 text-sm font-bold ${p ? 'text-slate-400' : 'text-slate-700'}`}>{pos}</span>
            {p ? (
                <>
                    <OvrBadge value={p.ovr} size="sm" />
                    <button type="button" onClick={() => onOpenPlayer(p)} className="flex-1 min-w-0 text-left text-sm font-semibold text-slate-200 truncate">{p.name}</button>
                    {salaries?.[p.id] != null && <span className="shrink-0 text-sm text-slate-400 tabular-nums">{formatMoney(salaries[p.id])}</span>}
                </>
            ) : (
                <span className="text-sm italic text-slate-700">비어있음</span>
            )}
        </div>
    );
    const section = (title: string) => (
        <div className="h-9 px-4 flex items-center border-b border-slate-800/50 bg-slate-800/15 text-sm font-extrabold text-slate-400">{title}</div>
    );
    const benchSlots = Math.max(reserves.length, 5);

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 h-10 px-4 flex items-center justify-between gap-2 border-b border-slate-800/50 bg-slate-800/30">
                {onToggleAutoPick ? (
                    <Button
                        variant={myAutoPick ? 'success' : 'secondary'}
                        size="md"
                        shape="md"
                        onClick={() => onToggleAutoPick(!myAutoPick)}
                        disabled={autoPickDisabled}
                        icon={<RefreshCw size={11} />}
                        className="!text-xs"
                        aria-pressed={myAutoPick}
                    >
                        <span className="ko-normal">AUTO</span>
                    </Button>
                ) : <span />}
                <span className="flex items-center gap-1.5">
                    {POSITION_ORDER.map(pos => (
                        <span key={pos} className="flex items-center gap-0.5">
                            <span className="text-xs font-bold text-slate-400">{pos}</span>
                            <span className="text-xs text-white">{posCounts[pos]}</span>
                        </span>
                    ))}
                    <span className="text-slate-600 text-xs">·</span>
                    <span className="text-xs text-slate-500">총 <span className="text-white">{players.length}</span></span>
                </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
                {section('선발')}
                {POSITION_ORDER.map((pos, i) => row(`s-${pos}`, pos, starters[i]))}
                {section('벤치')}
                {Array.from({ length: benchSlots }, (_, i) => row(`r-${i}`, reserves[i]?.position ?? '—', reserves[i] ?? null))}
            </div>
            {totalSalary != null && (
                <div className="shrink-0 h-11 px-4 flex items-center justify-between border-t border-slate-800/50 bg-slate-900">
                    <span className="text-sm font-extrabold text-slate-400">팀 토탈</span>
                    <span className="text-sm font-bold text-white tabular-nums">{formatMoney(totalSalary)}</span>
                </div>
            )}
        </div>
    );
};

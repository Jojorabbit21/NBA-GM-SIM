// PhoneDraftHistory.tsx — 드래프트 룸 폰 "기록" 탭. [2026-11-08]
// docs/ui/mobile-design-system.md §9-0-4 "기록": 서브헤더 40("N픽 완료" | 라운드 SheetSelect 28) + 행 44(#픽 40 · POS 32 · 약어 40 · 이름 · 연봉).
// 최신 픽 amber-500/10(내 픽이면 emerald/10), 내 픽 이름 emerald-300 — PickHistory.tsx 색 규칙 그대로.
import React, { useMemo, useState } from 'react';
import type { BoardPick } from '../DraftBoard';
import type { RoomTeamMetaMap } from '../../../types/multiDraft';
import { resolveTeamDisplay } from '../teamMetaLookup';
import { SheetSelect } from '../../mobile/ActionSheet';
import { formatMoney } from '../../../utils/formatMoney';

interface PhoneDraftHistoryProps {
    picks: BoardPick[];
    totalRounds: number;
    userTeamId: string;
    teamMeta?: RoomTeamMetaMap;
    onOpenPlayer: (playerId: string) => void;
}

export const PhoneDraftHistory: React.FC<PhoneDraftHistoryProps> = ({ picks, totalRounds, userTeamId, teamMeta, onOpenPlayer }) => {
    const [roundFilter, setRoundFilter] = useState<string>('all');
    const items = useMemo(() => [{ value: 'all', label: '전체' }, ...Array.from({ length: totalRounds }, (_, i) => ({ value: String(i + 1), label: `R${i + 1}` }))], [totalRounds]);
    const ordered = useMemo(() => {
        const list = roundFilter === 'all' ? picks : picks.filter(p => p.round === Number(roundFilter));
        return [...list].reverse();   // 최신 픽이 위
    }, [picks, roundFilter]);

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 h-10 px-4 flex items-center justify-between gap-2 border-b border-slate-800/50 bg-slate-800/30">
                <span className="text-xs text-slate-500">{picks.length}픽 완료</span>
                <SheetSelect title="라운드" items={items} value={roundFilter} onChange={setRoundFilter} />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
                {ordered.length === 0 && <div className="px-4 py-6 text-sm text-slate-500 text-center ko-normal">드래프트 기록 없음</div>}
                {ordered.map((pick, idx) => {
                    const overall = (roundFilter === 'all' ? picks.length - idx : picks.indexOf(pick) + 1);
                    const isLatest = idx === 0 && roundFilter === 'all';
                    const isUserPick = pick.teamId === userTeamId;
                    const bg = isLatest && isUserPick ? 'bg-emerald-500/10' : isLatest ? 'bg-amber-500/10' : isUserPick ? 'bg-emerald-500/10' : '';
                    return (
                        <button
                            key={`${pick.teamId}-${pick.round}-${pick.playerId}`}
                            type="button"
                            onClick={() => onOpenPlayer(pick.playerId)}
                            className={`w-full h-11 px-4 flex items-center text-left border-b border-slate-700/50 active:bg-white/5 ${bg}`}
                        >
                            <span className="w-10 shrink-0 text-sm font-bold text-slate-500 tabular-nums">#{overall}</span>
                            <span className="w-8 shrink-0 text-sm font-bold text-slate-400">{pick.position}</span>
                            <span className="w-10 shrink-0 text-sm font-semibold text-slate-400">{resolveTeamDisplay(pick.teamId, teamMeta).abbr}</span>
                            <span className={`flex-1 min-w-0 text-sm font-semibold truncate ${isUserPick ? 'text-emerald-300' : 'text-slate-200'}`}>{pick.playerName}</span>
                            {pick.salary != null && <span className="pl-2 shrink-0 text-sm text-slate-400 tabular-nums">{formatMoney(pick.salary)}</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

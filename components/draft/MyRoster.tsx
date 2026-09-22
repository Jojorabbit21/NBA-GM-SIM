
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Player } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { formatMoney } from '../../utils/formatMoney';

interface MyRosterProps {
    players: Player[];
    existingRoster?: Player[];  // 루키 드래프트용: 기존 로스터 선수 표시
    /** [2026-09-11] "오토픽 전환 버튼을 내 로스터 텍스트 우측으로" 요청 — MultiDraftView.tsx
     * 상단에 별도 바로 있던 걸 여기로 이전. 둘 다 넘겨줄 때만 버튼 렌더링(멀티 드래프트
     * 전용, 싱글/루키 드래프트뷰는 기존처럼 아예 렌더링 안 함). */
    myAutoPick?: boolean;
    onToggleAutoPick?: (next: boolean) => void;
    /** [2026-09-22] playerId → 생성 연봉(달러). 멀티 alternative 계약 모드에서만 전달, 행 우측에 표시. */
    salaries?: Record<string, number>;
}

const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const RESERVES = 10;

const MyRosterComponent: React.FC<MyRosterProps> = ({ players, existingRoster, myAutoPick, onToggleAutoPick, salaries }) => {
    const salaryOf = (id: string) => {
        const v = salaries?.[id];
        return v != null ? <span className="ml-auto pl-2 shrink-0 text-sm text-slate-400">{formatMoney(v)}</span> : null;
    };
    // [2026-09-22] 팀 토탈 — salaries가 전달된 경우(alternative 모드)에만 최하단 행으로 표시. 현재 로스터에 있는 선수 합계.
    const totalSalary = salaries
        ? players.reduce((sum, p) => sum + (salaries[p.id] ?? 0), 0)
        : null;
    // 루키 드래프트 모드: 기존 로스터 + 새 드래프트 픽 합산
    const allPlayers = existingRoster ? [...existingRoster, ...players] : players;
    const newPickIds = existingRoster ? new Set(players.map(p => p.id)) : null;

    const grouped: Record<string, Player[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
    allPlayers.forEach(p => {
        if (grouped[p.position]) grouped[p.position].push(p);
        else grouped['SF'].push(p);
    });

    const starters: (Player | null)[] = [];
    const used = new Set<string>();
    POSITION_ORDER.forEach(pos => {
        if (grouped[pos].length > 0) {
            starters.push(grouped[pos][0]);
            used.add(grouped[pos][0].id);
        } else {
            starters.push(null);
        }
    });

    const reserves: (Player | null)[] = allPlayers.filter(p => !used.has(p.id));
    while (reserves.length < RESERVES) reserves.push(null);

    const posCounts: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    allPlayers.forEach(p => {
        if (posCounts[p.position] !== undefined) posCounts[p.position]++;
        else posCounts['SF']++;
    });

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-3 h-10 border-b border-slate-800/50 shrink-0 flex items-center justify-between bg-slate-800/30">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-black uppercase text-indigo-400 shrink-0">내 로스터</span>
                    {onToggleAutoPick && (
                        <button
                            onClick={() => onToggleAutoPick(!myAutoPick)}
                            title={myAutoPick ? '오토픽 켜짐 (클릭해서 끄기)' : '오토픽 켜기'}
                            className={`flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-md transition-colors shrink-0 ${
                                myAutoPick
                                    ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                            }`}
                        >
                            <RefreshCw size={11} />
                            <span className="ko-normal">AUTO</span>
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    {POSITION_ORDER.map(pos => (
                        <span key={pos} className="flex items-center gap-0.5">
                            <span className="text-xs font-bold text-slate-400">{pos}</span>
                            <span className="text-xs text-white">{posCounts[pos]}</span>
                        </span>
                    ))}
                    <span className="text-slate-600 text-xs">·</span>
                    <span className="text-xs text-slate-500">총 <span className="text-white">{allPlayers.length}</span></span>
                </div>
            </div>

            {/* Scroll Area */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {/* Starters */}
                <div className="shrink-0 px-3 h-10 flex items-center border-b border-slate-800/50 bg-slate-800/15">
                    <span className="text-sm font-black uppercase text-slate-400">선발</span>
                </div>
                {POSITION_ORDER.map((pos, i) => {
                    const player = starters[i];
                    const isNewPick = player && newPickIds?.has(player.id);
                    return (
                        <div
                            key={`starter-${pos}`}
                            className={`h-8 min-h-8 max-h-8 px-2.5 border-b border-slate-700/50 flex items-center gap-1.5 ${isNewPick ? 'bg-emerald-500/10' : ''}`}
                        >
                            <span className="text-sm font-bold w-8 shrink-0 text-slate-400">
                                {pos}
                            </span>
                            {player ? (
                                <>
                                    <OvrBadge value={player.ovr} size="sm" textClassName="text-sm" />
                                    <span className={`text-sm font-semibold truncate ${isNewPick ? 'text-emerald-300' : newPickIds ? 'text-slate-500' : 'text-slate-200'}`}>{player.name}</span>
                                    {salaryOf(player.id)}
                                </>
                            ) : (
                                <span className="text-sm text-slate-700 italic">비어있음</span>
                            )}
                        </div>
                    );
                })}

                {/* Reserves */}
                <div className="shrink-0 px-3 h-10 flex items-center border-b border-slate-800/50 bg-slate-800/15">
                    <span className="text-sm font-black uppercase text-slate-400">벤치</span>
                </div>
                {reserves.map((player, i) => {
                    const isNewPick = player && newPickIds?.has(player.id);
                    return (
                        <div
                            key={`res-${i}`}
                            className={`h-8 min-h-8 max-h-8 px-2.5 border-b border-slate-700/50 flex items-center gap-1.5 ${isNewPick ? 'bg-emerald-500/10' : ''}`}
                        >
                            {player ? (
                                <>
                                    <span className="text-sm font-bold w-8 shrink-0 text-slate-400">
                                        {player.position}
                                    </span>
                                    <OvrBadge value={player.ovr} size="sm" textClassName="text-sm" />
                                    <span className={`text-sm font-semibold truncate ${isNewPick ? 'text-emerald-300' : newPickIds ? 'text-slate-500' : 'text-slate-200'}`}>{player.name}</span>
                                    {salaryOf(player.id)}
                                </>
                            ) : (
                                <>
                                    <span className="text-sm font-bold w-8 shrink-0 text-slate-700">—</span>
                                    <span className="text-sm text-slate-700 italic">비어있음</span>
                                </>
                            )}
                        </div>
                    );
                })}

                {/* 팀 토탈 샐러리 — alternative 계약 모드 전용, 스크롤해도 보이도록 하단 고정 */}
                {totalSalary != null && (
                    <div className="sticky bottom-0 shrink-0 px-3 h-10 flex items-center justify-between border-t border-slate-800/50 bg-slate-900">
                        <span className="text-sm font-black uppercase text-slate-400">팀 토탈</span>
                        <span className="text-sm font-bold text-white">{formatMoney(totalSalary)}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export const MyRoster = React.memo(MyRosterComponent);


import React, { useRef, useEffect, useMemo } from 'react';
import { TEAM_DATA } from '../../data/teamData';
import { TeamLogo } from '../common/TeamLogo';
import type { ResolvedPick } from '../../types/draftAssets';
import type { BoardPick } from './DraftBoard';

interface RookieDraftBoardProps {
    resolvedPicks: ResolvedPick[];  // 60개
    totalRounds: number;
    picks: BoardPick[];
    currentPickIndex: number;
    userTeamId: string;
    positionColors: Record<string, string>;
}

export const RookieDraftBoard: React.FC<RookieDraftBoardProps> = ({
    resolvedPicks,
    totalRounds,
    picks,
    currentPickIndex,
    userTeamId,
    positionColors,
}) => {
    const currentCellRef = useRef<HTMLTableCellElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (currentCellRef.current && scrollContainerRef.current) {
            const cell = currentCellRef.current;
            const container = scrollContainerRef.current;
            const cellRect = cell.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            if (cellRect.left < containerRect.left + 80 || cellRect.right > containerRect.right) {
                container.scrollLeft += cellRect.left - containerRect.left - 100;
            }
            if (cellRect.top < containerRect.top + 40 || cellRect.bottom > containerRect.bottom) {
                container.scrollTop += cellRect.top - containerRect.top - 60;
            }
        }
    }, [currentPickIndex]);

    // BoardPick을 pickNumber로 빠르게 조회
    const boardPickMap = useMemo(() => {
        const map = new Map<number, BoardPick>();
        for (const p of picks) {
            if (p.pickNumber != null) {
                map.set(p.pickNumber, p);
            }
        }
        return map;
    }, [picks]);

    // 라운드별 resolvedPicks 분리
    const picksByRound = useMemo(() => {
        const rounds: ResolvedPick[][] = [];
        const perRound = resolvedPicks.length > 0 ? Math.ceil(resolvedPicks.length / totalRounds) : 30;
        for (let r = 0; r < totalRounds; r++) {
            rounds.push(resolvedPicks.slice(r * perRound, (r + 1) * perRound));
        }
        return rounds;
    }, [resolvedPicks, totalRounds]);

    const currentPickNumber = currentPickIndex + 1;
    const currentTeamId = resolvedPicks[currentPickIndex]?.currentTeamId || '';
    const currentTeamColor = TEAM_DATA[currentTeamId]?.colors.primary || '#6366f1';

    return (
        <div
            ref={scrollContainerRef}
            className="h-full overflow-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' } as React.CSSProperties}
        >
            <table className="w-max min-w-full" style={{ borderCollapse: 'separate', borderSpacing: '2px', margin: '-2px' }}>
                {picksByRound.map((roundPicks, roundIdx) => {
                    const round = roundIdx + 1;
                    const isEvenRound = roundIdx % 2 === 0;
                    const currentRound = resolvedPicks[currentPickIndex]?.round ?? 1;
                    const isPast = round < currentRound;
                    const isCurrentRound = round === currentRound;

                    return (
                        <React.Fragment key={round}>
                            {/* 라운드 간 구분 간격 */}
                            {roundIdx > 0 && (
                                <tbody>
                                    <tr><td colSpan={roundPicks.length + 1} className="h-3 bg-slate-950" /></tr>
                                </tbody>
                            )}
                            {/* 라운드별 독립 헤더 */}
                            <thead className={`${roundIdx === 0 ? 'sticky top-0' : ''} z-20 bg-slate-950`}>
                                <tr>
                                    {/* 빈 라벨 셀 (sticky left) */}
                                    <th
                                        className="sticky left-0 z-30 bg-slate-950 min-w-[90px] px-2 py-2"
                                        style={{ boxShadow: '1px 0 0 0 rgb(2,6,23), 0 1px 0 0 rgb(2,6,23)' }}
                                    />

                                    {/* 슬롯별 헤더 셀 — 최종 권리 팀 컬러 */}
                                    {roundPicks.map(rp => {
                                        const teamData = TEAM_DATA[rp.currentTeamId];
                                        const teamColor = teamData?.colors.primary || '#6366f1';
                                        const teamTextColor = teamData?.colors.text || '#FFFFFF';
                                        const isUserSlot = rp.currentTeamId === userTeamId;
                                        return (
                                            <th
                                                key={rp.pickNumber}
                                                className="w-[120px] min-w-[120px] max-w-[120px] px-1 py-1.5 text-center font-bold uppercase"
                                                style={{
                                                    backgroundColor: teamColor,
                                                    color: teamTextColor,
                                                    boxShadow: isUserSlot
                                                        ? `inset 0 0 0 2px rgba(245,158,11,0.7), 1px 0 0 0 rgb(2,6,23), -1px 0 0 0 rgb(2,6,23)`
                                                        : '1px 0 0 0 rgb(2,6,23), -1px 0 0 0 rgb(2,6,23)',
                                                }}
                                            >
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <span className="text-[10px] opacity-70">#{rp.pickNumber}</span>
                                                    <div className="flex items-center gap-1.5">
                                                        <TeamLogo teamId={rp.currentTeamId} size="custom" className="w-5 h-5" />
                                                        <span className="text-xs font-black tracking-wide">
                                                            {rp.currentTeamId.toUpperCase()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>

                            {/* 라운드별 셀 행 */}
                            <tbody>
                                <tr className="h-[76px]">
                                    {/* 라운드 라벨 (sticky left) */}
                                    <td
                                        className={`sticky left-0 px-2 py-1 z-10 text-center ${
                                            isCurrentRound ? 'bg-indigo-950' : 'bg-slate-950'
                                        }`}
                                        style={{ boxShadow: '0 1px 0 0 rgb(2,6,23), 0 -1px 0 0 rgb(2,6,23)' }}
                                    >
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className={`text-[11px] font-black whitespace-nowrap ${
                                                isCurrentRound ? 'text-indigo-300' : isPast ? 'text-slate-600' : 'text-slate-500'
                                            }`}>
                                                R{round}
                                            </span>
                                            <span className={`text-[10px] ${
                                                isCurrentRound ? 'text-indigo-400/70' : 'text-slate-600'
                                            }`}>
                                                {isEvenRound ? '→' : '←'}
                                            </span>
                                        </div>
                                    </td>

                                    {/* 슬롯별 셀 */}
                                    {roundPicks.map(rp => {
                                        const bp = boardPickMap.get(rp.pickNumber);
                                        const isCurrent = rp.pickNumber === currentPickNumber && !bp;
                                        const isUserSlot = rp.currentTeamId === userTeamId;
                                        const posColor = bp ? (positionColors[bp.position] || '#64748b') : undefined;

                                        return (
                                            <td
                                                key={rp.pickNumber}
                                                ref={isCurrent ? currentCellRef : undefined}
                                                className="relative p-0 text-center"
                                            >
                                                <div
                                                    className="absolute inset-[3px] rounded-md"
                                                    style={{
                                                        ...(bp
                                                            ? { backgroundColor: isUserSlot ? `color-mix(in srgb, ${posColor}20, rgba(245,158,11,0.10))` : `${posColor}20` }
                                                            : isCurrent
                                                                ? { backgroundColor: 'rgba(16,185,129,0.10)', boxShadow: 'inset 0 0 0 2px rgba(16,185,129,0.6)' }
                                                                : isUserSlot
                                                                    ? { backgroundColor: 'rgba(245,158,11,0.08)' }
                                                                    : {}
                                                        ),
                                                    }}
                                                >
                                                    {bp ? (
                                                        <div className="h-full flex flex-col items-center justify-center gap-0.5 px-1.5">
                                                            <span
                                                                className="text-xs font-bold uppercase opacity-60"
                                                                style={{ color: posColor }}
                                                            >
                                                                {bp.position}
                                                            </span>
                                                            <span
                                                                className="text-[12px] font-bold text-center leading-tight break-words line-clamp-2"
                                                                style={{ color: posColor }}
                                                            >
                                                                {bp.playerName}
                                                            </span>
                                                        </div>
                                                    ) : isCurrent ? (
                                                        <div className="h-full flex items-center justify-center animate-pulse">
                                                            <span className="text-[11px] font-bold text-emerald-400">
                                                                선택 중...
                                                            </span>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            </tbody>
                        </React.Fragment>
                    );
                })}
            </table>
        </div>
    );
};

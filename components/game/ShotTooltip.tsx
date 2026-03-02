
import React from 'react';
import { ShotEvent } from '../../types';
import { TooltipState, calcShotDistance } from '../../hooks/useShotChartTooltip';

interface ShotTooltipProps {
    tooltip: TooltipState;
    containerWidth: number;
    containerHeight: number;
}

function formatGameClock(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Single shot detail row (primary) */
function PrimaryShotInfo({ shot }: { shot: ShotEvent }) {
    const dist = calcShotDistance(shot.x, shot.y);
    const isMake = shot.isMake;

    return (
        <div className="space-y-0.5">
            {/* Row 1: Quarter + Time | Result */}
            <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-slate-400 font-mono">
                    Q{shot.quarter} {formatGameClock(shot.gameClock)}
                </span>
                {isMake ? (
                    <span className="text-[10px] font-black text-emerald-400">
                        +{shot.points || 2}
                    </span>
                ) : (
                    <span className="text-[10px] font-black text-red-400">
                        {shot.isBlock ? 'BLOCK' : 'MISS'}
                    </span>
                )}
            </div>

            {/* Row 2: Player + ShotType + Distance */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate max-w-[120px]">
                    {shot.playerName || 'Unknown'}
                </span>
                {shot.shotType && (
                    <span className="text-[10px] text-slate-400">{shot.shotType}</span>
                )}
                <span className="text-[10px] text-slate-500 font-mono">{dist}ft</span>
            </div>

            {/* Row 3: Assist or Blocker */}
            {isMake && shot.assistPlayerName && (
                <div className="text-[10px] text-indigo-400 font-medium">
                    AST {shot.assistPlayerName}
                </div>
            )}
            {!isMake && shot.isBlock && shot.defenderName && (
                <div className="text-[10px] text-red-400 font-medium">
                    BLK {shot.defenderName}
                </div>
            )}
        </div>
    );
}

/** Compact cluster shot row */
function ClusterShotRow({ shot }: { shot: ShotEvent }) {
    const dist = calcShotDistance(shot.x, shot.y);
    return (
        <div className="flex items-center gap-1.5 text-[10px]">
            <span className={shot.isMake ? 'text-emerald-400' : 'text-slate-500'}>
                {shot.isMake ? '●' : '✕'}
            </span>
            <span className="text-slate-300 font-medium truncate max-w-[100px]">
                {shot.playerName || 'Unknown'}
            </span>
            {shot.shotType && (
                <span className="text-slate-500">{shot.shotType}</span>
            )}
            <span className="text-slate-600 font-mono">{dist}ft</span>
            {!shot.isMake && shot.isBlock && (
                <span className="text-red-400/70 font-bold">BLK</span>
            )}
        </div>
    );
}

export const ShotTooltip: React.FC<ShotTooltipProps> = ({
    tooltip,
    containerWidth,
    containerHeight,
}) => {
    const { primaryShot, clusterShots, mouseX, mouseY } = tooltip;
    const hasCluster = clusterShots.length > 0;

    // Position tooltip near cursor, clamped to container
    const tooltipW = 220;
    const tooltipH = hasCluster ? 140 : 80;
    const offsetX = 12;
    const offsetY = 12;

    let left = mouseX + offsetX;
    let top = mouseY + offsetY;

    // Flip to left if near right edge
    if (left + tooltipW > containerWidth - 8) {
        left = mouseX - tooltipW - offsetX;
    }
    // Flip up if near bottom edge
    if (top + tooltipH > containerHeight - 8) {
        top = mouseY - tooltipH - offsetY;
    }
    // Clamp minimums
    if (left < 4) left = 4;
    if (top < 4) top = 4;

    return (
        <div
            className="absolute z-50 pointer-events-none"
            style={{ left, top }}
        >
            <div className="bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl backdrop-blur-sm px-3 py-2 min-w-[180px] max-w-[240px]">
                <PrimaryShotInfo shot={primaryShot} />

                {hasCluster && (
                    <>
                        <div className="border-t border-slate-700/50 my-1.5" />
                        <div className="space-y-0.5 max-h-[80px] overflow-y-auto custom-scrollbar">
                            {clusterShots.slice(0, 5).map(shot => (
                                <ClusterShotRow key={shot.id} shot={shot} />
                            ))}
                            {clusterShots.length > 5 && (
                                <span className="text-[9px] text-slate-600">
                                    +{clusterShots.length - 5} more
                                </span>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

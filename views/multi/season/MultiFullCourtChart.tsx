
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Filter } from 'lucide-react';
import type { ShotEvent } from '../../../types';
import { useShotChartTooltip } from '../../../hooks/useShotChartTooltip';
import { ShotTooltip } from '../../../components/game/ShotTooltip';

interface MultiFullCourtChartProps {
    homeTeamId: string;
    homeColor:  string;
    homeAbbr:   string;
    awayTeamId: string;
    awayColor:  string;
    awayAbbr:   string;
    shotEvents: ShotEvent[];
}

interface PlayerOption { id: string; name: string }

const BasketLines = () => (
    <g fill="none" stroke="#4a3728" strokeWidth="2" strokeMiterlimit="10">
        <path d="M0,30h140s150,55,150,220-150,220,-150,220H0" />
        <polyline points="0,170 190,170 190,330 0,330" />
        <line x1="190" y1="310" y2="310" />
        <line y1="190" x2="190" y2="190" />
        <path d="M190,190c33.14,0,60,26.86,60,60s-26.86,60-60,60" />
        <path d="M190,310c-1.6,0-3.18-.06-4.75-.19" />
        <path d="M177.77,308.75c-27.27-5.65-47.77-29.81-47.77-58.75s22.39-55.27,51.49-59.4" strokeDasharray="9.58 7.56" />
        <path d="M185.25,190.19c1.57-.12,3.15-.19,4.75-.19" />
        <line x1="280" y1="480" x2="280" y2="500" />
        <line x1="280" x2="280" y2="20" />
        <path d="M40,290h12.5c22.09,0,40-17.91,40-40s-17.91-40-40-40h-12.5" />
        <line x1="145" y1="310" x2="145" y2="318" />
        <line x1="115" y1="310" x2="115" y2="318" />
        <line x1="85"  y1="310" x2="85"  y2="318" />
        <line x1="70"  y1="310" x2="70"  y2="318" />
        <line x1="145" y1="182" x2="145" y2="190" />
        <line x1="115" y1="182" x2="115" y2="190" />
        <line x1="85"  y1="182" x2="85"  y2="190" />
        <line x1="70"  y1="182" x2="70"  y2="190" />
        <line x1="40"  y1="222" x2="40"  y2="278" stroke="#333" strokeWidth="2" />
        <circle cx="48" cy="250" r="7.5" stroke="#e65100" />
    </g>
);

const PlayerFilterList: React.FC<{
    label: string;
    players: PlayerOption[];
    excludedIds: Set<string>;
    onToggle: (id: string) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
}> = ({ label, players, excludedIds, onToggle, onSelectAll, onDeselectAll }) => {
    const allChecked  = players.length > 0 && players.every(p => !excludedIds.has(p.id));
    const noneChecked = players.every(p => excludedIds.has(p.id));
    const headerRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (headerRef.current) headerRef.current.indeterminate = !allChecked && !noneChecked;
    }, [allChecked, noneChecked]);

    return (
    <div className="flex-1 min-w-0">
        <label className="flex items-center gap-1.5 px-1 pb-1.5 mb-1 border-b border-slate-800 cursor-pointer select-none">
            <input
                ref={headerRef}
                type="checkbox"
                checked={allChecked}
                disabled={players.length === 0}
                onChange={() => (allChecked ? onDeselectAll() : onSelectAll())}
                className="w-3 h-3 accent-indigo-500 shrink-0 disabled:opacity-40"
            />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</span>
        </label>
        <div className="flex flex-col gap-0.5">
            {players.length === 0 && (
                <span className="px-1 py-1 text-[11px] text-slate-600 ko-normal">슛 기록 없음</span>
            )}
            {players.map(p => (
                <label
                    key={p.id}
                    className="flex items-center gap-1.5 px-1 py-1 rounded hover:bg-slate-800/60 cursor-pointer select-none"
                >
                    <input
                        type="checkbox"
                        checked={!excludedIds.has(p.id)}
                        onChange={() => onToggle(p.id)}
                        className="w-3 h-3 accent-indigo-500 shrink-0"
                    />
                    <span className={`text-[11px] truncate ${excludedIds.has(p.id) ? 'text-slate-600' : 'text-slate-200'}`}>
                        {p.name}
                    </span>
                </label>
            ))}
        </div>
    </div>
    );
};

export const MultiFullCourtChart: React.FC<MultiFullCourtChartProps> = ({
    homeTeamId, homeColor, homeAbbr,
    awayTeamId, awayColor, awayAbbr,
    shotEvents,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ w: 940, h: 500 });

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── 선수 필터 ────────────────────────────────────────────────────────────
    const [filterOpen, setFilterOpen] = useState(false);
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
    const filterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const { homePlayers, awayPlayers } = useMemo(() => {
        const map = new Map<string, { id: string; name: string; teamId: string }>();
        for (const s of shotEvents) {
            if (!map.has(s.playerId)) {
                map.set(s.playerId, { id: s.playerId, name: s.playerName || s.playerId, teamId: s.teamId });
            }
        }
        const all = Array.from(map.values());
        return {
            homePlayers: all.filter(p => p.teamId === homeTeamId).sort((a, b) => a.name.localeCompare(b.name)),
            awayPlayers: all.filter(p => p.teamId === awayTeamId).sort((a, b) => a.name.localeCompare(b.name)),
        };
    }, [shotEvents, homeTeamId, awayTeamId]);

    const toggleExcluded = (id: string) => {
        setExcludedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // 팀별 전체 선택/해제 — 다른 팀의 excluded 상태는 건드리지 않는다.
    const selectAllTeam = (players: PlayerOption[]) => {
        setExcludedIds(prev => {
            const next = new Set(prev);
            for (const p of players) next.delete(p.id);
            return next;
        });
    };
    const deselectAllTeam = (players: PlayerOption[]) => {
        setExcludedIds(prev => {
            const next = new Set(prev);
            for (const p of players) next.add(p.id);
            return next;
        });
    };

    const filteredShotEvents = useMemo(
        () => excludedIds.size === 0 ? shotEvents : shotEvents.filter(s => !excludedIds.has(s.playerId)),
        [shotEvents, excludedIds],
    );

    const activeFilterCount = excludedIds.size;

    const { tooltip, highlightShotIds, svgRef, handleMouseMove, handleMouseLeave } =
        useShotChartTooltip(filteredShotEvents, 10);

    return (
        <div className="w-full">
            {/* Legend */}
            <div className="relative flex items-center gap-4 px-3 h-9 bg-slate-800 border-b border-x border-slate-700">
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: awayColor }} />
                    <span className="text-xs font-bold text-slate-300">{awayAbbr} 원정</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: homeColor }} />
                    <span className="text-xs font-bold text-slate-300">{homeAbbr} 홈</span>
                </div>
                <div className="flex-1" />

                <div ref={filterRef} className="relative">
                    <button
                        onClick={() => setFilterOpen(v => !v)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
                    >
                        <Filter size={11} />
                        필터
                        {activeFilterCount > 0 && (
                            <span className="text-[9px] font-mono">-{activeFilterCount}</span>
                        )}
                    </button>

                    {filterOpen && (
                        <div className="absolute top-full right-0 mt-1.5 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 p-2.5 flex gap-3 animate-in fade-in zoom-in-95 duration-150">
                            <PlayerFilterList
                                label={awayAbbr}
                                players={awayPlayers}
                                excludedIds={excludedIds}
                                onToggle={toggleExcluded}
                                onSelectAll={() => selectAllTeam(awayPlayers)}
                                onDeselectAll={() => deselectAllTeam(awayPlayers)}
                            />
                            <PlayerFilterList
                                label={homeAbbr}
                                players={homePlayers}
                                excludedIds={excludedIds}
                                onToggle={toggleExcluded}
                                onSelectAll={() => selectAllTeam(homePlayers)}
                                onDeselectAll={() => deselectAllTeam(homePlayers)}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Court — aspect ratio 940:500, fills width */}
            <div
                ref={containerRef}
                className="relative w-full"
                style={{ aspectRatio: '940/500' }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                <svg ref={svgRef} viewBox="0 0 940 500" className="w-full h-full">
                    {/* Background */}
                    <rect width="940" height="500" fill="rgb(221,200,173)" />

                    {/* Paint backgrounds */}
                    <rect y="170" width="190" height="160" fill="rgb(195,172,145)" />
                    <rect x="750" y="170" width="190" height="160" fill="rgb(195,172,145)" />

                    {/* Left basket */}
                    <BasketLines />

                    {/* Right basket (X-mirror) */}
                    <g transform="translate(940,0) scale(-1,1)">
                        <BasketLines />
                    </g>

                    {/* Center court */}
                    <g fill="none" stroke="#4a3728" strokeWidth="2">
                        <line x1="470" y1="0" x2="470" y2="500" />
                        <circle cx="470" cy="250" r="60" />
                        <circle cx="470" cy="250" r="20" />
                    </g>

                    {/* Shots — raw coords (no normalization), ×10 to SVG units */}
                    {filteredShotEvents.map((shot, i) => {
                        const isHl  = highlightShotIds.has(shot.id);
                        const color = shot.teamId === homeTeamId ? homeColor : awayColor;
                        const cx    = shot.x * 10;
                        const cy    = shot.y * 10;
                        return (
                            <g key={`${shot.id}-${i}`}>
                                {shot.isMake ? (
                                    <circle
                                        cx={cx} cy={cy}
                                        r={isHl ? 8.5 : 6.5}
                                        fill={color}
                                        stroke={isHl ? '#fff' : 'white'}
                                        strokeWidth={isHl ? 2 : 1}
                                        opacity={isHl ? 1 : 0.9}
                                        className="transition-all duration-150"
                                    />
                                ) : (
                                    <g
                                        transform={`translate(${cx},${cy})`}
                                        opacity={isHl ? 1 : 0.5}
                                        className="transition-all duration-150"
                                    >
                                        <line x1="-5" y1="-5" x2="5" y2="5"
                                            stroke={isHl ? '#fff' : color}
                                            strokeWidth={isHl ? 3 : 2.5} />
                                        <line x1="-5" y1="5" x2="5" y2="-5"
                                            stroke={isHl ? '#fff' : color}
                                            strokeWidth={isHl ? 3 : 2.5} />
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {tooltip && (
                    <ShotTooltip
                        tooltip={tooltip}
                        containerWidth={containerSize.w}
                        containerHeight={containerSize.h}
                    />
                )}
            </div>
        </div>
    );
};

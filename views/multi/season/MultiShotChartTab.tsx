
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { ShotEvent } from '../../../types';
import { COURT_WIDTH, COURT_HEIGHT } from '../../../utils/courtCoordinates';
import { useShotChartTooltip } from '../../../hooks/useShotChartTooltip';
import { ShotTooltip } from '../../../components/game/ShotTooltip';
import { Check } from 'lucide-react';

export interface MultiTeamInfo {
    id:             string;
    name:           string;
    abbr:           string;
    primaryColor:   string;
    secondaryColor: string;
}

interface MultiShotChartTabProps {
    homeTeam:    MultiTeamInfo;
    awayTeam:    MultiTeamInfo;
    shotEvents:  ShotEvent[];
}

interface DerivedPlayer {
    id:   string;
    name: string;
}

export const MultiShotChartTab: React.FC<MultiShotChartTabProps> = ({
    homeTeam,
    awayTeam,
    shotEvents,
}) => {
    const [selectedTeamId,    setSelectedTeamId]    = useState<string>(homeTeam.id);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());

    const activeTeam  = selectedTeamId === homeTeam.id ? homeTeam : awayTeam;
    const teamColor   = activeTeam.primaryColor  || '#6366f1';

    // Derive player list from shot events (avoids needing full roster objects)
    const activePlayers = useMemo<DerivedPlayer[]>(() => {
        const map = new Map<string, string>();
        for (const s of shotEvents) {
            if (s.teamId === selectedTeamId && !map.has(s.playerId)) {
                map.set(s.playerId, s.playerName ?? s.playerId);
            }
        }
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [shotEvents, selectedTeamId]);

    useEffect(() => {
        setSelectedPlayerIds(new Set(activePlayers.map(p => p.id)));
    }, [selectedTeamId, activePlayers.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const togglePlayer = (playerId: string) => {
        const next = new Set(selectedPlayerIds);
        if (next.has(playerId)) next.delete(playerId); else next.add(playerId);
        setSelectedPlayerIds(next);
    };

    const toggleAll = () => {
        setSelectedPlayerIds(
            selectedPlayerIds.size === activePlayers.length
                ? new Set()
                : new Set(activePlayers.map(p => p.id)),
        );
    };

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const displayShots = useMemo(() => {
        return (shotEvents ?? [])
            .filter(s => s.teamId === selectedTeamId && selectedPlayerIds.has(s.playerId))
            .map(shot => {
                let x = shot.x, y = shot.y;
                if (x > COURT_WIDTH / 2) { x = COURT_WIDTH - x; y = COURT_HEIGHT - y; }
                const points = shot.points ?? (shot.isMake ? (shot.zone === '3PT' ? 3 : 2) : 0);
                return { ...shot, x, y, points: points as 0 | 2 | 3 };
            });
    }, [shotEvents, selectedTeamId, selectedPlayerIds]);

    const { tooltip, highlightShotIds, svgRef, handleMouseMove, handleMouseLeave } =
        useShotChartTooltip(displayShots, 10);

    const stats = useMemo(() => {
        const calc = (fn: (s: ShotEvent) => boolean) => {
            const sub   = displayShots.filter(fn);
            const total = sub.length;
            const made  = sub.filter(s => s.isMake).length;
            return { m: made, a: total, pct: total > 0 ? Math.round((made / total) * 100) : 0 };
        };
        return {
            fg:  calc(() => true),
            ra:  calc(s => s.zone === 'Rim'),
            itp: calc(s => s.zone === 'Paint'),
            mid: calc(s => s.zone === 'Mid'),
            p3:  calc(s => s.zone === '3PT'),
        };
    }, [displayShots]);

    const StatBox = ({ label, stat }: { label: string; stat: { m: number; a: number; pct: number } }) => (
        <div className="flex flex-col items-center min-w-[60px]">
            <span className="text-[10px] font-bold text-slate-500 mb-0.5">{label}</span>
            <span className="text-base font-semibold text-white font-mono leading-none">{stat.pct}%</span>
            <span className="text-[10px] text-slate-400 font-medium">{stat.m}/{stat.a}</span>
        </div>
    );

    return (
        <div className="w-full h-full flex flex-col overflow-hidden bg-slate-950">

            {/* Header: 팀 토글 + 존 스탯 */}
            <div className="shrink-0 px-4 py-3 bg-slate-900 border-b border-slate-800">
                <div className="flex flex-col xl:flex-row justify-between items-center gap-3">
                    {/* 팀 토글 */}
                    <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800 shadow-sm">
                        {[homeTeam, awayTeam].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setSelectedTeamId(t.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${selectedTeamId === t.id ? 'text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                style={selectedTeamId === t.id ? { backgroundColor: t.primaryColor } : {}}
                            >
                                <div
                                    className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black shrink-0"
                                    style={{ backgroundColor: t.primaryColor, color: t.secondaryColor }}
                                >
                                    {t.abbr.slice(0, 2)}
                                </div>
                                <span>{t.name}</span>
                            </button>
                        ))}
                    </div>

                    {/* 존 스탯 */}
                    <div className="flex gap-4 overflow-x-auto justify-center no-scrollbar">
                        <StatBox label="FG%"  stat={stats.fg}  />
                        <div className="w-px h-8 bg-slate-800 self-center" />
                        <StatBox label="RA%"  stat={stats.ra}  />
                        <div className="w-px h-8 bg-slate-800 self-center" />
                        <StatBox label="ITP%" stat={stats.itp} />
                        <div className="w-px h-8 bg-slate-800 self-center" />
                        <StatBox label="MID%" stat={stats.mid} />
                        <div className="w-px h-8 bg-slate-800 self-center" />
                        <StatBox label="3P%"  stat={stats.p3}  />
                    </div>
                </div>
            </div>

            {/* Body: 코트 + 선수 필터 */}
            <div className="flex flex-1 min-h-0">

                {/* 코트 (좌측) */}
                <div className="flex-1 flex items-center justify-center relative p-4 border-r border-slate-800">
                    <div
                        ref={containerRef}
                        className="relative w-full max-h-full max-w-[600px]"
                        style={{ aspectRatio: '470/500' }}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                    >
                        <svg ref={svgRef} viewBox="0 0 470 500" className="w-full h-full drop-shadow-xl">
                            <rect width="470" height="500" fill="#020617" stroke="#334155" strokeWidth="2" />
                            <rect y="170" width="190" height="160" fill="#0f172a" />

                            <g fill="none" stroke="#334155" strokeWidth="2" strokeMiterlimit="10">
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
                                <line x1="40"  y1="222" x2="40"  y2="278" stroke="white" />
                                <circle cx="48" cy="250" r="7.5" stroke="white" />
                            </g>

                            {displayShots.map(shot => {
                                const isHl = highlightShotIds.has(shot.id);
                                return (
                                    <g key={shot.id}>
                                        {shot.isMake ? (
                                            <circle
                                                cx={shot.x * 10} cy={shot.y * 10}
                                                r={isHl ? 9 : 6.5} fill={teamColor}
                                                stroke={isHl ? '#fff' : 'white'}
                                                strokeWidth={isHl ? 2.5 : 1}
                                            />
                                        ) : (
                                            <g transform={`translate(${shot.x * 10}, ${shot.y * 10})`} opacity={isHl ? 1 : 0.8}>
                                                <line x1={isHl ? -7 : -5} y1={isHl ? -7 : -5} x2={isHl ? 7 : 5} y2={isHl ? 7 : 5}
                                                    stroke={isHl ? '#fff' : '#cbd5e1'} strokeWidth={isHl ? 3 : 2.5} />
                                                <line x1={isHl ? -7 : -5} y1={isHl ? 7 : 5} x2={isHl ? 7 : 5} y2={isHl ? -7 : -5}
                                                    stroke={isHl ? '#fff' : '#cbd5e1'} strokeWidth={isHl ? 3 : 2.5} />
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

                    {/* 범례 */}
                    <div className="absolute bottom-4 right-4 flex gap-4 text-[10px] font-bold bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 backdrop-blur-sm">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full border border-white" style={{ backgroundColor: teamColor }} />
                            <span className="text-white">MADE</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-300">
                                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                            </svg>
                            <span className="text-slate-400">MISS</span>
                        </div>
                    </div>
                </div>

                {/* 선수 필터 (우측) */}
                <div className="w-[200px] shrink-0 flex flex-col bg-slate-900/20 overflow-hidden">
                    <div className="p-3 border-b border-slate-800 flex justify-between items-center shrink-0">
                        <span className="text-xs font-black text-slate-400">선수 필터</span>
                        <button
                            onClick={toggleAll}
                            className="text-[10px] font-bold text-indigo-400 hover:text-white transition-colors"
                        >
                            {selectedPlayerIds.size === activePlayers.length ? '해제' : '전체'}
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                        {activePlayers.map(player => {
                            const isSelected   = selectedPlayerIds.has(player.id);
                            const playerShots  = (shotEvents ?? []).filter(s => s.teamId === selectedTeamId && s.playerId === player.id);
                            const made         = playerShots.filter(s => s.isMake).length;
                            const total        = playerShots.length;
                            if (total === 0) return null;
                            return (
                                <button
                                    key={player.id}
                                    onClick={() => togglePlayer(player.id)}
                                    className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-500' : 'bg-transparent border-slate-600'}`}>
                                            {isSelected && <Check size={10} className="text-white" />}
                                        </div>
                                        <span className={`text-xs font-bold truncate transition-colors ${isSelected ? 'text-white' : 'text-slate-600'}`}>{player.name}</span>
                                    </div>
                                    <span className={`text-[10px] font-mono shrink-0 ml-1 transition-colors ${isSelected ? 'text-slate-400' : 'text-slate-600'}`}>{made}/{total}</span>
                                </button>
                            );
                        })}
                        {activePlayers.length === 0 && (
                            <p className="text-xs text-slate-600 text-center py-6 ko-normal">샷 데이터 없음</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

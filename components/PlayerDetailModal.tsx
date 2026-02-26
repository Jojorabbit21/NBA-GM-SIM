
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Player, Team } from '../types';
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { TEAM_DATA } from '../data/teamData';
import { OvrBadge } from './common/OvrBadge';

interface PlayerDetailModalProps {
    player: Player;
    teamName?: string;
    teamId?: string;
    allTeams?: Team[];
    onClose: () => void;
}

// Attribute Groups (matches RosterGrid)
const ATTR_GROUPS = [
    { id: 'INS', label: 'INSIDE', keys: ['ins', 'closeShot', 'layup', 'dunk', 'postPlay', 'drawFoul', 'hands'] },
    { id: 'OUT', label: 'OUTSIDE', keys: ['out', 'midRange', 'threeCorner', 'ft', 'shotIq', 'offConsist'] },
    { id: 'PLM', label: 'PLAYMAKING', keys: ['plm', 'passAcc', 'handling', 'spdBall', 'passVision', 'passIq'] },
    { id: 'DEF', label: 'DEFENSE', keys: ['def', 'intDef', 'perDef', 'steal', 'blk', 'helpDefIq', 'passPerc', 'defConsist'] },
    { id: 'REB', label: 'REBOUND', keys: ['reb', 'offReb', 'defReb'] },
    { id: 'ATH', label: 'ATHLETIC', keys: ['ath', 'speed', 'agility', 'strength', 'vertical', 'stamina', 'hustle', 'durability'] }
];

const ATTR_W = 50;

// Stats columns (matches RosterGrid)
const STATS_COLS = [
    { key: 'g', label: 'G' }, { key: 'gs', label: 'GS' }, { key: 'mp', label: 'MIN' },
    { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' },
    { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' },
    { key: 'pf', label: 'PF' }, { key: 'fg%', label: 'FG%' }, { key: '3p%', label: '3P%' },
    { key: 'ft%', label: 'FT%' }, { key: 'ts%', label: 'TS%' }, { key: 'pm', label: '+/-' }
];

// Zone Config (matches RosterGrid)
const ZONE_CONFIG = [
    { id: 'rim', label: 'RIM', keyM: 'zone_rim_m', keyA: 'zone_rim_a' },
    { id: 'paint', label: 'PAINT', keyM: 'zone_paint_m', keyA: 'zone_paint_a' },
    { id: 'midL', label: 'MID-L', keyM: 'zone_mid_l_m', keyA: 'zone_mid_l_a' },
    { id: 'midC', label: 'MID-C', keyM: 'zone_mid_c_m', keyA: 'zone_mid_c_a' },
    { id: 'midR', label: 'MID-R', keyM: 'zone_mid_r_m', keyA: 'zone_mid_r_a' },
    { id: 'c3L', label: '3PT-LC', keyM: 'zone_c3_l_m', keyA: 'zone_c3_l_a' },
    { id: 'atb3L', label: '3PT-LW', keyM: 'zone_atb3_l_m', keyA: 'zone_atb3_l_a' },
    { id: 'atb3C', label: '3PT-T', keyM: 'zone_atb3_c_m', keyA: 'zone_atb3_c_a' },
    { id: 'atb3R', label: '3PT-RW', keyM: 'zone_atb3_r_m', keyA: 'zone_atb3_r_a' },
    { id: 'c3R', label: '3PT-RC', keyM: 'zone_c3_r_m', keyA: 'zone_c3_r_a' },
];

const getAttrColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({ player, teamName, teamId, onClose }) => {
    const teamColor = teamId ? (TEAM_DATA[teamId]?.colors.primary || '#6366f1') : '#6366f1';
    const calculatedOvr = calculatePlayerOvr(player);

    // ESC key close
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Prevent body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    // Stats computation
    const s = player.stats;
    const g = s.g || 1;

    const getStatVal = (key: string): string => {
        if (key === 'g') return String(s.g);
        if (key === 'gs') return String(s.gs);
        if (key === 'mp') return (s.mp / g).toFixed(1);
        if (['pts', 'reb', 'ast', 'stl', 'blk', 'tov'].includes(key)) return ((s as any)[key] / g).toFixed(1);
        if (key === 'pf') return ((s.pf || 0) / g).toFixed(1);
        if (key === 'pm') return (s.plusMinus / g).toFixed(1);
        if (key === 'fg%') return s.fga > 0 ? (s.fgm / s.fga * 100).toFixed(1) + '%' : '0%';
        if (key === '3p%') return s.p3a > 0 ? (s.p3m / s.p3a * 100).toFixed(1) + '%' : '0%';
        if (key === 'ft%') return s.fta > 0 ? (s.ftm / s.fta * 100).toFixed(1) + '%' : '0%';
        if (key === 'ts%') {
            const tsa = s.fga + 0.44 * s.fta;
            return tsa > 0 ? (s.pts / (2 * tsa) * 100).toFixed(1) + '%' : '0%';
        }
        return '0';
    };

    return createPortal(
        <div className="fixed inset-0 z-[500] bg-slate-950 flex flex-col animate-in fade-in duration-200">
            {/* Team Color Accent */}
            <div className="absolute top-0 left-0 right-0 h-1 z-20" style={{ backgroundColor: teamColor }} />
            <div className="absolute top-0 right-0 w-64 h-64 blur-[80px] rounded-full opacity-10 pointer-events-none" style={{ backgroundColor: teamColor }} />

            {/* Header */}
            <div className="shrink-0 px-8 py-5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-6">
                    <OvrBadge value={calculatedOvr} size="xl" />
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tight leading-none oswald">{player.name}</h2>
                        <div className="flex items-center gap-4 mt-2 text-sm font-bold text-slate-400">
                            {teamId && (
                                <div className="flex items-center gap-2">
                                    <img src={getTeamLogoUrl(teamId)} className="w-5 h-5 object-contain opacity-80" alt="" />
                                    <span>{teamName || 'Free Agent'}</span>
                                </div>
                            )}
                            <div className="w-1 h-1 bg-slate-600 rounded-full" />
                            <span>{player.position}</span>
                            <div className="w-1 h-1 bg-slate-600 rounded-full" />
                            <span>{player.height}cm / {player.weight}kg</span>
                            <div className="w-1 h-1 bg-slate-600 rounded-full" />
                            <span>{player.age}세</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-slate-900/50">

                {/* 1. Attributes Table */}
                <div className="mb-6">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">능력치</h3>
                    <div className="overflow-x-auto custom-scrollbar bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
                        <table className="text-left border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
                            <colgroup>
                                {ATTR_GROUPS.flatMap(gr => gr.keys.map((_, i) => <col key={`${gr.id}-${i}`} style={{ width: ATTR_W }} />))}
                            </colgroup>
                            <thead className="bg-slate-950">
                                {/* Group Header Row */}
                                <tr className="h-8">
                                    {ATTR_GROUPS.map(gr => (
                                        <th key={gr.id} colSpan={gr.keys.length} className="bg-slate-950 border-b border-r border-slate-800 px-2 align-middle">
                                            <div className="flex items-center justify-center">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{gr.label}</span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                                {/* Column Label Row */}
                                <tr className="h-8 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                                    {ATTR_GROUPS.flatMap(gr => gr.keys.map((k, ki) => {
                                        const label = ki === 0 ? 'AVG' : (k === 'threeCorner' ? '3PT' : k.slice(0, 3).toUpperCase());
                                        return (
                                            <th key={k} className="py-2 px-1 text-center border-b border-r border-slate-800/50 whitespace-nowrap bg-slate-950">
                                                {label}
                                            </th>
                                        );
                                    }))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="h-10">
                                    {ATTR_GROUPS.flatMap(gr => gr.keys.map(k => {
                                        const val = (player as any)[k] || 0;
                                        return (
                                            <td key={k} className="py-2 px-1 text-center border-b border-r border-slate-800/30 whitespace-nowrap">
                                                <span className={`font-mono font-black text-xs tabular-nums ${getAttrColor(val)}`}>
                                                    {val}
                                                </span>
                                            </td>
                                        );
                                    }))}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 2. Season Stats Table */}
                <div className="mb-6">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">시즌 스탯 (경기당 평균)</h3>
                    <div className="overflow-x-auto custom-scrollbar bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
                        <table className="text-left border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
                            <colgroup>
                                {STATS_COLS.map(c => <col key={c.key} style={{ width: c.key.includes('%') ? 65 : 55 }} />)}
                            </colgroup>
                            <thead className="bg-slate-950">
                                <tr className="h-10 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                                    {STATS_COLS.map(c => (
                                        <th key={c.key} className="py-2 px-2 text-center border-b border-r border-slate-800/50 whitespace-nowrap bg-slate-950">
                                            {c.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="h-10">
                                    {STATS_COLS.map(c => {
                                        if (s.mp === 0 && c.key !== 'g' && c.key !== 'gs') {
                                            return (
                                                <td key={c.key} className="py-2 px-2 text-center border-b border-r border-slate-800/30">
                                                    <span className="font-mono font-medium text-xs text-slate-600">-</span>
                                                </td>
                                            );
                                        }
                                        const val = getStatVal(c.key);
                                        let textColor = 'text-slate-300';
                                        if (c.key === 'pm') {
                                            const numVal = parseFloat(val);
                                            if (numVal > 0) textColor = 'text-emerald-400';
                                            else if (numVal < 0) textColor = 'text-red-400';
                                            else textColor = 'text-slate-500';
                                        }
                                        return (
                                            <td key={c.key} className="py-2 px-2 text-center border-b border-r border-slate-800/30">
                                                <span className={`font-mono font-medium text-xs tabular-nums ${textColor}`}>
                                                    {c.key === 'pm' && parseFloat(val) > 0 ? '+' : ''}{val}
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 3. Zone Shooting Table */}
                <div className="mb-6">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">10구역 야투 효율</h3>
                    <div className="overflow-x-auto custom-scrollbar bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
                        <table className="text-left border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
                            <colgroup>
                                {ZONE_CONFIG.map(z => (
                                    <React.Fragment key={z.id}>
                                        <col style={{ width: 65 }} />
                                        <col style={{ width: 50 }} />
                                    </React.Fragment>
                                ))}
                            </colgroup>
                            <thead className="bg-slate-950">
                                {/* Zone name header */}
                                <tr className="h-8">
                                    {ZONE_CONFIG.map(z => (
                                        <th key={z.id} colSpan={2} className="bg-slate-950 border-b border-r border-slate-800 px-1 align-middle">
                                            <div className="flex items-center justify-center">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{z.label}</span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                                {/* M/A and % sub-headers */}
                                <tr className="h-8 text-[10px] font-black uppercase tracking-widest">
                                    {ZONE_CONFIG.map(z => (
                                        <React.Fragment key={z.id}>
                                            <th className="py-2 px-1 text-center border-b border-r border-slate-800/50 text-slate-500 bg-slate-950">M/A</th>
                                            <th className="py-2 px-1 text-center border-b border-r border-slate-800/50 text-slate-300 bg-slate-950">%</th>
                                        </React.Fragment>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="h-10">
                                    {ZONE_CONFIG.map(z => {
                                        const m = (s as any)[z.keyM] || 0;
                                        const a = (s as any)[z.keyA] || 0;
                                        const pct = a > 0 ? ((m / a) * 100).toFixed(0) + '%' : '-';
                                        return (
                                            <React.Fragment key={z.id}>
                                                <td className="py-2 px-1 text-center border-b border-r border-slate-800/30">
                                                    <span className="font-mono font-semibold text-xs text-slate-300 tabular-nums">{m}/{a}</span>
                                                </td>
                                                <td className="py-2 px-1 text-center border-b border-r border-slate-800/30">
                                                    <span className={`font-mono font-semibold text-xs tabular-nums ${a > 0 ? (m / a >= 0.4 ? 'text-emerald-400' : 'text-slate-300') : 'text-slate-600'}`}>
                                                        {pct}
                                                    </span>
                                                </td>
                                            </React.Fragment>
                                        );
                                    })}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
};

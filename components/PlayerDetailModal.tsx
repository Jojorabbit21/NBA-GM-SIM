
import React, { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Player, Team } from '../types';
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { TEAM_DATA } from '../data/teamData';
import { OvrBadge } from './common/OvrBadge';
import {
    ZONE_PATHS, COURT_LINES, ZONE_AVG,
    ZONE_CONFIG as CHART_ZONES,
    getZoneStyle, getZonePillColors
} from '../utils/courtZones';
import { ATTR_GROUPS } from '../data/attributeConfig';
import { generateHiddenTendencies, generateSaveTendencies } from '../utils/hiddenTendencies';

interface PlayerDetailModalProps {
    player: Player;
    teamName?: string;
    teamId?: string;
    allTeams?: Team[];
    tendencySeed?: string;
    onClose: () => void;
}
const ATTR_W = 50;

// ── Trait Badge Color Map (Tailwind dynamic class workaround) ──
const TRAIT_COLORS: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    sky: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    slate: 'bg-slate-700/50 text-slate-400 border-slate-600/30',
};

// ── Stats Sections Config ──
const TRAD_COLS = [
    { key: 'g', label: 'GP' }, { key: 'gs', label: 'GS' }, { key: 'mp', label: 'MIN' },
    { key: 'pts', label: 'PTS' }, { key: 'oreb', label: 'OREB' }, { key: 'dreb', label: 'DREB' },
    { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' }, { key: 'stl', label: 'STL' },
    { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' }, { key: 'pf', label: 'PF' },
    { key: 'pm', label: '+/-' }
];

const SHOOTING_COLS = [
    { key: 'fgm', label: 'FGM' }, { key: 'fga', label: 'FGA' }, { key: 'fg%', label: 'FG%' },
    { key: '3pm', label: '3PM' }, { key: '3pa', label: '3PA' }, { key: '3p%', label: '3P%' },
    { key: 'ftm', label: 'FTM' }, { key: 'fta', label: 'FTA' }, { key: 'ft%', label: 'FT%' },
];

const ADVANCED_COLS = [
    { key: 'ts%', label: 'TS%' }, { key: 'efg%', label: 'eFG%' },
    { key: 'tov%', label: 'TOV%' }, { key: '3par', label: '3PAr' }, { key: 'ftr', label: 'FTr' },
];

// ── Zone Table Config ──
const ZONE_TABLE = [
    { key: 'rim', label: 'RIM', keyM: 'zone_rim_m', keyA: 'zone_rim_a' },
    { key: 'paint', label: 'PAINT', keyM: 'zone_paint_m', keyA: 'zone_paint_a' },
    { key: 'midL', label: 'MID-L', keyM: 'zone_mid_l_m', keyA: 'zone_mid_l_a' },
    { key: 'midC', label: 'MID-C', keyM: 'zone_mid_c_m', keyA: 'zone_mid_c_a' },
    { key: 'midR', label: 'MID-R', keyM: 'zone_mid_r_m', keyA: 'zone_mid_r_a' },
    { key: 'c3L', label: 'C3-L', keyM: 'zone_c3_l_m', keyA: 'zone_c3_l_a' },
    { key: 'atb3L', label: 'ATB-L', keyM: 'zone_atb3_l_m', keyA: 'zone_atb3_l_a' },
    { key: 'atb3C', label: 'ATB-C', keyM: 'zone_atb3_c_m', keyA: 'zone_atb3_c_a' },
    { key: 'atb3R', label: 'ATB-R', keyM: 'zone_atb3_r_m', keyA: 'zone_atb3_r_a' },
    { key: 'c3R', label: 'C3-R', keyM: 'zone_c3_r_m', keyA: 'zone_c3_r_a' },
];

// ── Zone stat key mapping (for shot chart SVG) ──
const ZONE_STAT_KEYS: Record<string, { keyM: string; keyA: string }> = {};
ZONE_TABLE.forEach(z => { ZONE_STAT_KEYS[z.key] = { keyM: z.keyM, keyA: z.keyA }; });

const getAttrColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({ player, teamName, teamId, tendencySeed, onClose }) => {
    const teamColor = teamId ? (TEAM_DATA[teamId]?.colors.primary || '#6366f1') : '#6366f1';
    const calculatedOvr = calculatePlayerOvr(player);

    // ── Personality & Playstyle Traits ──
    const traits = useMemo(() => {
        const list: { label: string; color: string }[] = [];

        // 1. 선호 지역 (zones from meta_players)
        if (player.tendencies?.zones) {
            const z = player.tendencies.zones;
            const paint = z.ra + z.itp;
            const mid = z.mid;
            const three = z.cnr + z.p45 + z.atb;
            const max = Math.max(paint, mid, three);
            if (max === three) list.push({ label: '3점 라인 바깥 선호', color: 'indigo' });
            else if (max === mid) list.push({ label: '미드레인지 선호', color: 'indigo' });
            else list.push({ label: '페인트존 선호', color: 'indigo' });
        }

        // 2. 좌우 편향 (lateralBias from hash-based hidden tendencies)
        const hidden = generateHiddenTendencies(player);
        if (hidden.lateralBias <= -0.3) list.push({ label: '왼쪽 선호', color: 'slate' });
        else if (hidden.lateralBias >= 0.3) list.push({ label: '오른쪽 선호', color: 'slate' });
        else list.push({ label: '균형', color: 'slate' });

        // 3~6. 세이브 텐던시 (seed-dependent, threshold ±0.4)
        if (tendencySeed) {
            const st = generateSaveTendencies(tendencySeed, player.id);
            if (st.clutchGene >= 0.4) list.push({ label: '강심장', color: 'emerald' });
            else if (st.clutchGene <= -0.4) list.push({ label: '새가슴', color: 'red' });

            if (st.composure >= 0.4) list.push({ label: '침착함', color: 'emerald' });
            else if (st.composure <= -0.4) list.push({ label: '부담감을 느낌', color: 'amber' });

            if (st.temperament >= 0.4) list.push({ label: '다혈질', color: 'amber' });
            else if (st.temperament <= -0.4) list.push({ label: '냉정함', color: 'sky' });

            if (st.ego >= 0.4) list.push({ label: '자존심이 강함', color: 'amber' });
            else if (st.ego <= -0.4) list.push({ label: '모두와 잘 어울림', color: 'emerald' });
        }

        return list;
    }, [player, tendencySeed]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    const s = player.stats;
    const g = s.g || 1;
    const noData = s.mp === 0;

    // ── Stat value resolver ──
    const getStatVal = (key: string): { display: string; color: string } => {
        const dash = { display: '-', color: 'text-slate-600' };
        if (noData && key !== 'g' && key !== 'gs') return dash;

        let val: string;
        let color = 'text-slate-300';

        switch (key) {
            case 'g': val = String(s.g); break;
            case 'gs': val = String(s.gs); break;
            case 'mp': val = (s.mp / g).toFixed(1); break;
            case 'oreb': val = ((s.offReb || 0) / g).toFixed(1); break;
            case 'dreb': val = ((s.defReb || 0) / g).toFixed(1); break;
            case 'pf': val = ((s.pf || 0) / g).toFixed(1); break;
            case 'pm': {
                const v = s.plusMinus / g;
                val = (v > 0 ? '+' : '') + v.toFixed(1);
                color = v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-500';
                break;
            }
            case 'fgm': val = (s.fgm / g).toFixed(1); break;
            case 'fga': val = (s.fga / g).toFixed(1); break;
            case '3pm': val = (s.p3m / g).toFixed(1); break;
            case '3pa': val = (s.p3a / g).toFixed(1); break;
            case 'ftm': val = (s.ftm / g).toFixed(1); break;
            case 'fta': val = (s.fta / g).toFixed(1); break;
            case 'fg%': val = s.fga > 0 ? (s.fgm / s.fga * 100).toFixed(1) + '%' : '-'; break;
            case '3p%': val = s.p3a > 0 ? (s.p3m / s.p3a * 100).toFixed(1) + '%' : '-'; break;
            case 'ft%': val = s.fta > 0 ? (s.ftm / s.fta * 100).toFixed(1) + '%' : '-'; break;
            case 'ts%': {
                const tsa = s.fga + 0.44 * s.fta;
                val = tsa > 0 ? (s.pts / (2 * tsa) * 100).toFixed(1) + '%' : '-';
                break;
            }
            case 'efg%': {
                val = s.fga > 0 ? ((s.fgm + 0.5 * s.p3m) / s.fga * 100).toFixed(1) + '%' : '-';
                break;
            }
            case 'tov%': {
                const den = s.fga + 0.44 * s.fta + s.tov;
                val = den > 0 ? (s.tov / den * 100).toFixed(1) + '%' : '-';
                break;
            }
            case '3par': val = s.fga > 0 ? (s.p3a / s.fga).toFixed(3) : '-'; break;
            case 'ftr': val = s.fga > 0 ? (s.fta / s.fga).toFixed(3) : '-'; break;
            default:
                if (['pts', 'reb', 'ast', 'stl', 'blk', 'tov'].includes(key)) {
                    val = ((s as any)[key] / g).toFixed(1);
                } else {
                    val = '0';
                }
        }
        return { display: val, color };
    };

    // ── Shot chart zone data ──
    const chartZones = useMemo(() =>
        CHART_ZONES.map(z => {
            const sk = ZONE_STAT_KEYS[z.key];
            const m = sk ? ((s as any)[sk.keyM] || 0) : 0;
            const a = sk ? ((s as any)[sk.keyA] || 0) : 0;
            return { ...z, m, a, avg: ZONE_AVG[z.avgKey] };
        }),
    [s]);

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
                <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
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
                                <tr className="h-8">
                                    {ATTR_GROUPS.map(gr => (
                                        <th key={gr.id} colSpan={gr.keys.length} className="bg-slate-950 border-b border-r border-slate-800 px-2 align-middle">
                                            <div className="flex items-center justify-center">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{gr.label}</span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
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
                                                <span className={`font-mono font-black text-xs tabular-nums ${getAttrColor(val)}`}>{val}</span>
                                            </td>
                                        );
                                    }))}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 2. Personality & Playstyle Traits */}
                {traits.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">성격 & 플레이스타일</h3>
                        <div className="flex flex-wrap gap-2">
                            {traits.map((t, i) => (
                                <span key={i} className={`px-3 py-1 rounded-full text-xs font-bold border ${TRAIT_COLORS[t.color] || TRAIT_COLORS.slate}`}>
                                    {t.label}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 3. Stats + Shot Chart — Side by Side */}
                <div className="flex gap-6 items-start">

                    {/* Left: Combined Stats Card */}
                    <div className="flex-1 min-w-0 flex flex-col gap-0 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">

                        {/* Traditional + Shooting + Advanced — 한 줄 테이블 */}
                        <div className="overflow-x-auto custom-scrollbar border-b border-slate-800">
                            <table style={{ tableLayout: 'fixed' }} className="border-separate border-spacing-0">
                                <colgroup>
                                    {TRAD_COLS.map(c => <col key={c.key} style={{ width: 55 }} />)}
                                    {SHOOTING_COLS.map(c => <col key={c.key} style={{ width: 58 }} />)}
                                    {ADVANCED_COLS.map(c => <col key={c.key} style={{ width: 62 }} />)}
                                </colgroup>
                                <thead className="bg-slate-950">
                                    {/* Group Header Row */}
                                    <tr className="h-7">
                                        <th colSpan={TRAD_COLS.length} className="bg-slate-950 border-b border-r border-slate-800 px-2 align-middle">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Traditional</span>
                                        </th>
                                        <th colSpan={SHOOTING_COLS.length} className="bg-slate-950 border-b border-r border-slate-800 px-2 align-middle">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Shooting</span>
                                        </th>
                                        <th colSpan={ADVANCED_COLS.length} className="bg-slate-950 border-b border-slate-800 px-2 align-middle">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Advanced</span>
                                        </th>
                                    </tr>
                                    {/* Column Label Row */}
                                    <tr className="h-7">
                                        {[...TRAD_COLS, ...SHOOTING_COLS, ...ADVANCED_COLS].map(c => (
                                            <th key={c.key} className="py-1 px-1 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-r border-slate-800/50 bg-slate-950 whitespace-nowrap last:border-r-0">
                                                {c.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="h-9">
                                        {[...TRAD_COLS, ...SHOOTING_COLS, ...ADVANCED_COLS].map(c => {
                                            const { display, color } = getStatVal(c.key);
                                            return (
                                                <td key={c.key} className="py-1.5 px-1 text-center border-b border-r border-slate-800/30 last:border-r-0">
                                                    <span className={`font-mono font-medium text-xs tabular-nums ${color}`}>{display}</span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Zone Efficiency — M / A / % per zone */}
                        <div className="overflow-x-auto custom-scrollbar">
                            <table style={{ tableLayout: 'fixed' }} className="border-separate border-spacing-0">
                                <colgroup>
                                    {ZONE_TABLE.flatMap(z => [
                                        <col key={`${z.key}-m`} style={{ width: 45 }} />,
                                        <col key={`${z.key}-a`} style={{ width: 45 }} />,
                                        <col key={`${z.key}-p`} style={{ width: 50 }} />,
                                    ])}
                                </colgroup>
                                <thead className="bg-slate-950">
                                    {/* Zone Group Header */}
                                    <tr className="h-7">
                                        {ZONE_TABLE.map(z => (
                                            <th key={z.key} colSpan={3} className="bg-slate-950 border-b border-r border-slate-800 px-1 align-middle last:border-r-0">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{z.label}</span>
                                            </th>
                                        ))}
                                    </tr>
                                    {/* M / A / % Sub-headers */}
                                    <tr className="h-7">
                                        {ZONE_TABLE.flatMap(z => [
                                            <th key={`${z.key}-m`} className="py-1 px-0.5 text-center text-[10px] font-black text-slate-500 border-b border-r border-slate-800/50 bg-slate-950 whitespace-nowrap">M</th>,
                                            <th key={`${z.key}-a`} className="py-1 px-0.5 text-center text-[10px] font-black text-slate-500 border-b border-r border-slate-800/50 bg-slate-950 whitespace-nowrap">A</th>,
                                            <th key={`${z.key}-p`} className="py-1 px-0.5 text-center text-[10px] font-black text-slate-300 border-b border-r border-slate-800/50 bg-slate-950 whitespace-nowrap last:border-r-0">%</th>,
                                        ])}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="h-9">
                                        {ZONE_TABLE.flatMap(z => {
                                            const m = (s as any)[z.keyM] || 0;
                                            const a = (s as any)[z.keyA] || 0;
                                            const pct = a > 0 ? ((m / a) * 100).toFixed(0) + '%' : '-';
                                            const pctColor = a > 0 ? (m / a >= 0.4 ? 'text-emerald-400' : 'text-slate-300') : 'text-slate-600';
                                            return [
                                                <td key={`${z.key}-m`} className="py-1.5 px-0.5 text-center border-b border-r border-slate-800/30">
                                                    <span className="font-mono font-medium text-xs text-slate-300 tabular-nums">{m}</span>
                                                </td>,
                                                <td key={`${z.key}-a`} className="py-1.5 px-0.5 text-center border-b border-r border-slate-800/30">
                                                    <span className="font-mono font-medium text-xs text-slate-500 tabular-nums">{a}</span>
                                                </td>,
                                                <td key={`${z.key}-p`} className="py-1.5 px-0.5 text-center border-b border-r border-slate-800/30 last:border-r-0">
                                                    <span className={`font-mono font-semibold text-xs tabular-nums ${pctColor}`}>{pct}</span>
                                                </td>,
                                            ];
                                        })}
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                    </div>

                    {/* Right: Shot Chart */}
                    <div className="w-[380px] shrink-0 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                        <div className="px-3 py-1.5 bg-slate-950/80 border-b border-slate-800/50 flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Shot Chart</span>
                            <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                                <span>LOW</span>
                                <div className="flex gap-0.5">
                                    <div className="w-3 h-2.5 rounded-sm bg-emerald-500/10" />
                                    <div className="w-3 h-2.5 rounded-sm bg-emerald-500/25" />
                                    <div className="w-3 h-2.5 rounded-sm bg-emerald-500/50" />
                                </div>
                                <span>HIGH</span>
                            </div>
                        </div>
                        <div className="p-3">
                            <div className="relative w-full aspect-[435/403] bg-slate-950 rounded-lg overflow-hidden">
                                <svg viewBox="0 0 435 403" className="w-full h-full">
                                    <rect x="0" y="0" width="435" height="403" fill="#020617" />

                                    {/* Heatmap Zones */}
                                    <g>
                                        {chartZones.map((z, i) => {
                                            const style = getZoneStyle(z.m, z.a, z.avg);
                                            return (
                                                <path key={i} d={ZONE_PATHS[z.pathKey]} fill={style.fill} fillOpacity={style.opacity} stroke="none" className="transition-all duration-300" />
                                            );
                                        })}
                                    </g>

                                    {/* Court Lines */}
                                    <g fill="none" stroke="#0f172a" strokeWidth="0.5" strokeOpacity="1" pointerEvents="none">
                                        {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                                    </g>

                                    {/* Data Pills */}
                                    <g pointerEvents="none">
                                        {chartZones.map((z, i) => {
                                            const pct = z.a > 0 ? (z.m / z.a * 100).toFixed(0) : '0';
                                            const style = getZoneStyle(z.m, z.a, z.avg);
                                            const { pillFill, textFill, borderStroke } = getZonePillColors(style.delta, z.a > 0);
                                            const w = 52, h = z.a > 0 ? 36 : 30;
                                            return (
                                                <g key={i} transform={`translate(${z.cx}, ${z.cy})`}>
                                                    <rect x={-w/2} y={-h/2} width={w} height={h} rx={6} fill={pillFill} stroke={borderStroke} strokeWidth={1} fillOpacity={0.95} />
                                                    <text textAnchor="middle" y={z.a > 0 ? -6 : -2} fill={textFill} fontSize="12px" fontWeight="800" style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}>
                                                        {pct}%
                                                    </text>
                                                    {z.a > 0 && (
                                                        <text textAnchor="middle" y={10} fill="#ffffff" fontSize="9px" fontWeight="600">
                                                            {z.m}/{z.a}
                                                        </text>
                                                    )}
                                                </g>
                                            );
                                        })}
                                    </g>
                                </svg>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>,
        document.body
    );
};

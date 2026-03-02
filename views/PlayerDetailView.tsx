
import React, { useMemo, useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Player, PlayerStats, Team } from '../types';
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { TEAM_DATA } from '../data/teamData';
import { OvrBadge } from '../components/common/OvrBadge';
import {
    ZONE_PATHS, COURT_LINES, ZONE_AVG,
    ZONE_CONFIG as CHART_ZONES,
    getZoneStyle, getZonePillColors
} from '../utils/courtZones';
import { ATTR_GROUPS } from '../data/attributeConfig';
import { generateScoutReport } from '../utils/scoutReport';
import { usePlayerGameLog } from '../services/queries';

interface PlayerDetailViewProps {
    player: Player;
    teamName?: string;
    teamId?: string;
    allTeams?: Team[];
    tendencySeed?: string;
    onBack: () => void;
}

type TabId = 'attributes' | 'season' | 'shooting' | 'gameLog' | 'playoffs';

const ATTR_W = 50;

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

// ── Game Log Columns ──
const GAME_LOG_COLS = [
    { key: 'date', label: 'DATE', width: 58 },
    { key: 'opp', label: 'OPP', width: 55 },
    { key: 'result', label: 'RESULT', width: 80 },
    { key: 'min', label: 'MIN', width: 45 },
    { key: 'pts', label: 'PTS', width: 45 },
    { key: 'reb', label: 'REB', width: 45 },
    { key: 'ast', label: 'AST', width: 45 },
    { key: 'stl', label: 'STL', width: 40 },
    { key: 'blk', label: 'BLK', width: 40 },
    { key: 'fg', label: 'FG%', width: 50 },
    { key: '3p', label: '3P%', width: 50 },
    { key: 'pm', label: '+/-', width: 48 },
];

const getAttrColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

const formatSalary = (salary: number): string => {
    if (salary >= 1_000_000) return `$${(salary / 1_000_000).toFixed(1)}M`;
    if (salary >= 1_000) return `$${(salary / 1_000).toFixed(0)}k`;
    return `$${salary}`;
};

const getConditionColor = (val: number): string => {
    if (val >= 80) return 'text-emerald-400 bg-emerald-950/50';
    if (val >= 50) return 'text-amber-400 bg-amber-950/50';
    return 'text-red-400 bg-red-950/50';
};

// ── Hidden Archetypes ──
function getHiddenArchetypes(p: Player): string[] {
    const list: string[] = [];
    const threeVal = Math.round((p.threeCorner + p.three45 + p.threeTop) / 3);

    if (p.intangibles >= 90 && p.shotIq >= 85) list.push('Curtain Call');
    if (p.intangibles >= 85 && p.offConsist >= 88) list.push('Ice in Veins');
    if (p.intangibles >= 85 && p.strength >= 85 && p.ins >= 85) list.push('High Roller');
    if (p.midRange >= 97) list.push('Mr. Fundamental');
    if (threeVal >= 90 && p.shotIq >= 85) list.push('Rangemaster');
    if (p.ins >= 90 && (p.strength >= 88 || p.vertical >= 88)) list.push('Tyrant');
    if (p.closeShot >= 96 && p.agility >= 85 && p.height <= 195) list.push('Levitator');
    if (p.speed >= 95 && p.agility >= 93) list.push('Afterburner');
    if ((p.position === 'PG' || p.position === 'SG') && p.vertical >= 95 && p.closeShot >= 93) list.push('Ascendant');
    if (p.shotIq >= 88 && p.offConsist >= 88) list.push('Deadeye');
    if (p.steal >= 85 && p.agility >= 92) list.push('The Pickpocket');
    if (p.helpDefIq >= 85 && p.passPerc >= 80 && p.steal >= 75) list.push('The Hawk');
    if (p.height >= 216 && p.blk >= 80) list.push('The Alien');
    else if (p.vertical >= 95 && p.blk >= 75) list.push('Skywalker');
    else if (p.helpDefIq >= 92 && p.blk >= 80) list.push('Defensive Anchor');
    if (p.drawFoul >= 95 && p.shotIq >= 88) list.push('Manipulator');
    if (p.offReb >= 95 || p.defReb >= 95) list.push('Harvester');
    if (p.height <= 200 && p.offReb >= 90 && p.vertical >= 90) list.push('Raider');
    if (p.passIq >= 92 && p.passVision >= 90 && p.passAcc >= 90) list.push('Clairvoyant');
    if (p.passIq >= 88 && p.passAcc >= 95) list.push('Overseer');
    if (p.passAcc >= 93 && p.passIq >= 88) list.push('Needle');

    return list;
}

// ── Stat value resolver ──
function resolveStatVal(st: PlayerStats, key: string): { display: string; color: string } {
    const dash = { display: '-', color: 'text-slate-600' };
    const gp = st.g || 1;
    const noData = st.mp === 0;
    if (noData && key !== 'g' && key !== 'gs') return dash;

    let val: string;
    let color = 'text-slate-300';

    switch (key) {
        case 'g': val = String(st.g); break;
        case 'gs': val = String(st.gs); break;
        case 'mp': val = (st.mp / gp).toFixed(1); break;
        case 'oreb': val = ((st.offReb || 0) / gp).toFixed(1); break;
        case 'dreb': val = ((st.defReb || 0) / gp).toFixed(1); break;
        case 'pf': val = ((st.pf || 0) / gp).toFixed(1); break;
        case 'pm': {
            const v = st.plusMinus / gp;
            val = (v > 0 ? '+' : '') + v.toFixed(1);
            color = v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-500';
            break;
        }
        case 'fgm': val = (st.fgm / gp).toFixed(1); break;
        case 'fga': val = (st.fga / gp).toFixed(1); break;
        case '3pm': val = (st.p3m / gp).toFixed(1); break;
        case '3pa': val = (st.p3a / gp).toFixed(1); break;
        case 'ftm': val = (st.ftm / gp).toFixed(1); break;
        case 'fta': val = (st.fta / gp).toFixed(1); break;
        case 'fg%': val = st.fga > 0 ? (st.fgm / st.fga * 100).toFixed(1) + '%' : '-'; break;
        case '3p%': val = st.p3a > 0 ? (st.p3m / st.p3a * 100).toFixed(1) + '%' : '-'; break;
        case 'ft%': val = st.fta > 0 ? (st.ftm / st.fta * 100).toFixed(1) + '%' : '-'; break;
        case 'ts%': {
            const tsa = st.fga + 0.44 * st.fta;
            val = tsa > 0 ? (st.pts / (2 * tsa) * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'efg%': {
            val = st.fga > 0 ? ((st.fgm + 0.5 * st.p3m) / st.fga * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'tov%': {
            const den = st.fga + 0.44 * st.fta + st.tov;
            val = den > 0 ? (st.tov / den * 100).toFixed(1) + '%' : '-';
            break;
        }
        case '3par': val = st.fga > 0 ? (st.p3a / st.fga).toFixed(3) : '-'; break;
        case 'ftr': val = st.fga > 0 ? (st.fta / st.fga).toFixed(3) : '-'; break;
        default:
            if (['pts', 'reb', 'ast', 'stl', 'blk', 'tov'].includes(key)) {
                val = ((st as any)[key] / gp).toFixed(1);
            } else {
                val = '0';
            }
    }
    return { display: val, color };
}

// ── Reusable: Stats Table ──
const StatsTable: React.FC<{ stats: PlayerStats }> = ({ stats }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto custom-scrollbar">
            <table style={{ tableLayout: 'fixed' }} className="border-separate border-spacing-0">
                <colgroup>
                    {TRAD_COLS.map(c => <col key={c.key} style={{ width: 55 }} />)}
                    {SHOOTING_COLS.map(c => <col key={c.key} style={{ width: 58 }} />)}
                    {ADVANCED_COLS.map(c => <col key={c.key} style={{ width: 62 }} />)}
                </colgroup>
                <thead className="bg-slate-950">
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
                            const { display, color } = resolveStatVal(stats, c.key);
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
    </div>
);

export const PlayerDetailView: React.FC<PlayerDetailViewProps> = ({ player, teamName, teamId, tendencySeed, onBack }) => {
    const teamColor = teamId ? (TEAM_DATA[teamId]?.colors.primary || '#6366f1') : '#6366f1';
    const calculatedOvr = calculatePlayerOvr(player);

    const [activeTab, setActiveTab] = useState<TabId>('attributes');

    const scoutReport = useMemo(() => generateScoutReport(player, tendencySeed), [player, tendencySeed]);
    const { data: gameLog, isLoading: gameLogLoading } = usePlayerGameLog(player.id, teamId);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onBack]);

    const s = player.stats;

    const chartZones = useMemo(() =>
        CHART_ZONES.map(z => {
            const sk = ZONE_STAT_KEYS[z.key];
            const m = sk ? ((s as any)[sk.keyM] || 0) : 0;
            const a = sk ? ((s as any)[sk.keyA] || 0) : 0;
            return { ...z, m, a, avg: ZONE_AVG[z.avgKey] };
        }),
    [s]);

    const hasPlayoffs = (player.playoffStats?.g ?? 0) > 0;

    const tabs: { id: TabId; label: string; disabled?: boolean }[] = [
        { id: 'attributes', label: '능력치' },
        { id: 'season', label: '시즌 기록' },
        { id: 'shooting', label: '슈팅 기록' },
        { id: 'gameLog', label: '최근 경기' },
        { id: 'playoffs', label: '플레이오프', disabled: !hasPlayoffs },
    ];

    const archetypes = useMemo(() => getHiddenArchetypes(player), [player]);

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">

            {/* ═══ HEADER ═══ */}
            <div className="flex-shrink-0 bg-slate-900 border-b border-slate-800 relative overflow-hidden">
                {/* Team Color Accent Bar */}
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: teamColor }} />
                <div className="absolute top-0 left-0 w-48 h-48 blur-[60px] rounded-full opacity-10 pointer-events-none" style={{ backgroundColor: teamColor }} />

                {/* Back button row */}
                <div className="px-6 pt-3 pb-2 relative z-10">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        <ArrowLeft size={16} />
                        <span className="text-xs font-bold uppercase tracking-widest">뒤로</span>
                    </button>
                </div>

                {/* Player info */}
                <div className="px-6 pb-4 relative z-10">
                    <div className="flex items-center gap-5">
                        <OvrBadge value={calculatedOvr} size="xl" />
                        <div className="flex-1 min-w-0">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight oswald leading-tight">{player.name}</h2>
                            <div className="flex items-center gap-2 mt-1 text-sm font-bold text-slate-400">
                                {teamId && (
                                    <>
                                        <img src={getTeamLogoUrl(teamId)} className="w-4 h-4 object-contain opacity-80" alt="" />
                                        <span>{teamName || 'Free Agent'}</span>
                                        <span className="text-slate-600">·</span>
                                    </>
                                )}
                                <span>{player.position}</span>
                                <span className="text-slate-600">·</span>
                                <span className="text-slate-500 text-xs">{player.height}cm / {player.weight}kg · {player.age}세</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                {player.salary > 0 && (
                                    <span className="text-sm font-bold text-slate-300">
                                        {formatSalary(player.salary)}
                                        {player.contractYears > 0 && <span className="text-slate-500 ml-1">· {player.contractYears}yr</span>}
                                    </span>
                                )}
                                {player.condition != null && (
                                    <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${getConditionColor(player.condition)}`}>
                                        {player.condition}
                                    </span>
                                )}
                                {player.health && player.health !== 'Healthy' && (
                                    <span className="text-xs font-black text-red-400 bg-red-950/50 px-2 py-0.5 rounded-lg">
                                        {player.injuryType || player.health}
                                        {player.returnDate && <span className="text-red-500/70 ml-1">({player.returnDate})</span>}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Archetypes + Scout Report */}
                    {(archetypes.length > 0 || scoutReport.length > 0) && (
                        <div className="mt-3 pt-3 border-t border-slate-800/50">
                            {archetypes.length > 0 && (
                                <p className="text-xs font-bold text-indigo-400 mb-1">
                                    {archetypes.join(' / ')}
                                </p>
                            )}
                            {scoutReport.length > 0 && (
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    {scoutReport}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Tab Bar */}
                <div className="px-6 flex gap-1 border-t border-slate-800/50">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => !tab.disabled && setActiveTab(tab.id)}
                            disabled={tab.disabled}
                            className={`
                                px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-all relative
                                ${activeTab === tab.id
                                    ? 'text-indigo-400'
                                    : tab.disabled
                                        ? 'text-slate-700 cursor-not-allowed'
                                        : 'text-slate-500 hover:text-slate-300'}
                            `}
                        >
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-500 rounded-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ═══ TAB CONTENT BODY ═══ */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">

                {/* ═══ TAB: 능력치 ═══ */}
                {activeTab === 'attributes' && (
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
                )}

                {/* ═══ TAB: 시즌 기록 ═══ */}
                {activeTab === 'season' && (
                    <StatsTable stats={s} />
                )}

                {/* ═══ TAB: 슈팅 기록 ═══ */}
                {activeTab === 'shooting' && (
                    <div className="flex gap-6 items-start">

                        {/* Left: Zone Efficiency Table */}
                        <div className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
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
                                        <tr className="h-7">
                                            {ZONE_TABLE.map(z => (
                                                <th key={z.key} colSpan={3} className="bg-slate-950 border-b border-r border-slate-800 px-1 align-middle last:border-r-0">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{z.label}</span>
                                                </th>
                                            ))}
                                        </tr>
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
                                        <g>
                                            {chartZones.map((z, i) => {
                                                const style = getZoneStyle(z.m, z.a, z.avg);
                                                return (
                                                    <path key={i} d={ZONE_PATHS[z.pathKey]} fill={style.fill} fillOpacity={style.opacity} stroke="none" className="transition-all duration-300" />
                                                );
                                            })}
                                        </g>
                                        <g fill="none" stroke="#0f172a" strokeWidth="0.5" strokeOpacity="1" pointerEvents="none">
                                            {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                                        </g>
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
                )}

                {/* ═══ TAB: 최근 경기 ═══ */}
                {activeTab === 'gameLog' && (
                    <div>
                        {gameLogLoading && teamId && (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 size={20} className="text-slate-500 animate-spin" />
                            </div>
                        )}
                        {!gameLogLoading && (!gameLog || gameLog.length === 0) && (
                            <div className="flex items-center justify-center py-16">
                                <span className="text-sm text-slate-600">경기 기록이 없습니다</span>
                            </div>
                        )}
                        {gameLog && gameLog.length > 0 && (
                            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table style={{ tableLayout: 'fixed' }} className="border-separate border-spacing-0">
                                        <colgroup>
                                            {GAME_LOG_COLS.map(c => <col key={c.key} style={{ width: c.width }} />)}
                                        </colgroup>
                                        <thead className="bg-slate-950">
                                            <tr className="h-7">
                                                {GAME_LOG_COLS.map(c => (
                                                    <th key={c.key} className="py-1 px-1 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-r border-slate-800/50 bg-slate-950 whitespace-nowrap last:border-r-0">
                                                        {c.label}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {gameLog.map((g: any, i: number) => {
                                                const dateStr = g.date ? `${parseInt(g.date.split('-')[1])}/${parseInt(g.date.split('-')[2])}` : '-';
                                                const oppLabel = g.isHome ? g.opponentId?.toUpperCase() : `@${g.opponentId?.toUpperCase()}`;
                                                const won = g.teamScore > g.opponentScore;
                                                const resultStr = `${won ? 'W' : 'L'} ${g.teamScore}-${g.opponentScore}`;
                                                const fgPct = g.fga > 0 ? (g.fgm / g.fga).toFixed(3) : '-';
                                                const p3Pct = g.p3a > 0 ? (g.p3m / g.p3a).toFixed(3) : '-';
                                                const pmVal = g.plusMinus || 0;
                                                const pmStr = (pmVal > 0 ? '+' : '') + pmVal;

                                                const cells: { val: string; color?: string }[] = [
                                                    { val: dateStr },
                                                    { val: oppLabel },
                                                    { val: resultStr, color: won ? 'text-emerald-400' : 'text-red-400' },
                                                    { val: String(Math.round(g.mp || 0)) },
                                                    { val: String(g.pts || 0) },
                                                    { val: String(g.reb || 0) },
                                                    { val: String(g.ast || 0) },
                                                    { val: String(g.stl || 0) },
                                                    { val: String(g.blk || 0) },
                                                    { val: fgPct },
                                                    { val: p3Pct },
                                                    { val: pmStr, color: pmVal > 0 ? 'text-emerald-400' : pmVal < 0 ? 'text-red-400' : undefined },
                                                ];

                                                return (
                                                    <tr key={i} className="h-8 hover:bg-slate-800/30 transition-colors">
                                                        {cells.map((cell, ci) => (
                                                            <td key={ci} className="py-1 px-1 text-center border-b border-r border-slate-800/30 last:border-r-0">
                                                                <span className={`font-mono text-xs tabular-nums ${cell.color || 'text-slate-300'}`}>
                                                                    {cell.val}
                                                                </span>
                                                            </td>
                                                        ))}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ TAB: 플레이오프 ═══ */}
                {activeTab === 'playoffs' && hasPlayoffs && (
                    <StatsTable stats={player.playoffStats!} />
                )}

            </div>
        </div>
    );
};

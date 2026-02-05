
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Users, Activity, Wallet, ClipboardList, ArrowUp, ArrowDown, CalendarClock, Table2, Target, Swords } from 'lucide-react';
import { Team, Player, TacticStatRecord, OffenseTactic, DefenseTactic } from '../types';
import { getOvrBadgeStyle } from '../components/SharedComponents';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { calculatePlayerOvr } from '../utils/constants';
import { OFFENSE_TACTIC_INFO, DEFENSE_TACTIC_INFO } from '../utils/tacticUtils';

// New Sub-Components
import { RosterHeader } from '../components/roster/RosterHeader';
import { SalaryCapDashboard } from '../components/roster/SalaryCapDashboard';

interface RosterViewProps {
  allTeams: Team[];
  myTeamId: string;
  initialTeamId?: string | null;
}

// Flattened columns for the single unified table
const ALL_ROSTER_COLUMNS: { key: keyof Player | string, label: string, tooltip: string }[] = [
    // Shooting & Scoring
    { key: 'ins', label: 'INS', tooltip: '인사이드 스코어링' },
    { key: 'closeShot', label: 'CLS', tooltip: '근거리 슛' },
    { key: 'layup', label: 'LAY', tooltip: '레이업' },
    { key: 'dunk', label: 'DNK', tooltip: '덩크' },
    { key: 'postPlay', label: 'PST', tooltip: '포스트 플레이' },
    { key: 'drawFoul', label: 'DRF', tooltip: '자유투 유도' },
    
    { key: 'out', label: 'OUT', tooltip: '외곽 스코어링' },
    { key: 'midRange', label: 'MID', tooltip: '중거리 슛' },
    { key: 'threeCorner', label: '3PT', tooltip: '3점 슛' },
    { key: 'ft', label: 'FT', tooltip: '자유투' },
    { key: 'shotIq', label: 'SIQ', tooltip: '슛 셀렉션' },
    { key: 'offConsist', label: 'OCN', tooltip: '공격 기복' },
    
    // Playmaking
    { key: 'plm', label: 'PLM', tooltip: '플레이메이킹' },
    { key: 'handling', label: 'HDL', tooltip: '볼 핸들링' },
    { key: 'hands', label: 'HND', tooltip: '핸즈' },
    { key: 'passAcc', label: 'PAS', tooltip: '패스 정확도' },
    { key: 'passVision', label: 'VIS', tooltip: '패스 시야' },
    { key: 'passIq', label: 'PIQ', tooltip: '패스 IQ' },

    // Athleticism
    { key: 'ath', label: 'ATH', tooltip: '운동능력' },
    { key: 'speed', label: 'SPD', tooltip: '스피드' },
    { key: 'agility', label: 'AGI', tooltip: '민첩성' },
    { key: 'strength', label: 'STR', tooltip: '힘' },
    { key: 'vertical', label: 'JMP', tooltip: '점프력' },
    { key: 'stamina', label: 'STA', tooltip: '지구력' },
    { key: 'durability', label: 'DUR', tooltip: '내구도' },
    { key: 'hustle', label: 'HUS', tooltip: '허슬' },

    // Defense & Rebound
    { key: 'def', label: 'DEF', tooltip: '수비력' },
    { key: 'perDef', label: 'PER', tooltip: '퍼리미터 수비' },
    { key: 'intDef', label: 'INT', tooltip: '인사이드 수비' },
    { key: 'steal', label: 'STL', tooltip: '스틸' },
    { key: 'blk', label: 'BLK', tooltip: '블록' },
    { key: 'helpDefIq', label: 'HLP', tooltip: '헬프 수비' },
    { key: 'passPerc', label: 'PRC', tooltip: '패스 차단' },
    { key: 'defConsist', label: 'DCN', tooltip: '수비 기복' },
    
    { key: 'reb', label: 'REB', tooltip: '리바운드' },
    { key: 'offReb', label: 'ORB', tooltip: '공격 리바운드' },
    { key: 'defReb', label: 'DRB', tooltip: '수비 리바운드' },
];

// Unified Width for Stats: 55px
const UNIFIED_STAT_WIDTH = "55px";

const TRADITIONAL_STATS_COLUMNS = [
  { key: 'g', label: 'GP' }, { key: 'gs', label: 'GS' }, { key: 'mp', label: 'MIN' }, 
  { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'offReb', label: 'ORB' }, { key: 'defReb', label: 'DRB' }, 
  { key: 'ast', label: 'AST' }, { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' }, { key: 'pf', label: 'PF' },
  { key: 'fgm', label: 'FGM' }, { key: 'fga', label: 'FGA' }, { key: 'fg%', label: 'FG%' },
  { key: 'p3m', label: '3PM' }, { key: 'p3a', label: '3PA' }, { key: '3p%', label: '3P%' },
  { key: 'ftm', label: 'FTM' }, { key: 'fta', label: 'FTA' }, { key: 'ft%', label: 'FT%' },
  { key: 'ts%', label: 'TS%' },
];

const SHOOTING_ZONES = [
    { id: 'zone_rim', label: 'RIM' },
    { id: 'zone_paint', label: 'PAINT' },
    { id: 'zone_mid_l', label: 'MID-L' },
    { id: 'zone_mid_c', label: 'MID-C' },
    { id: 'zone_mid_r', label: 'MID-R' },
    { id: 'zone_c3_l', label: 'C3-L' },
    { id: 'zone_c3_r', label: 'C3-R' },
    { id: 'zone_atb3_l', label: '3P-L' },
    { id: 'zone_atb3_c', label: '3P-C' },
    { id: 'zone_atb3_r', label: '3P-R' },
];

const STRATEGY_COLUMNS = [
    { key: 'games', label: 'GP', width: "60px" },
    { key: 'record', label: 'W-L', width: "80px" },
    { key: 'winPct', label: 'WIN%', width: "80px" },
    { key: 'pts', label: 'PTS', width: "70px" },
    { key: 'pa', label: 'PA', width: "70px" },
    { key: 'fg', label: 'FG%', width: "70px" },
    { key: '3p', label: '3P%', width: "70px" },
    { key: 'rim', label: 'RIM%', width: "70px" },
];

const SALARY_COLUMNS = [
  { key: 'ovr', label: 'OVR' }, { key: 'age', label: 'AGE' }, { key: 'salary', label: '연봉 ($M)' }, { key: 'contractYears', label: '잔여계약' }, { key: 'totalValue', label: '총 계약규모' },
];

type SortConfig = { key: string; direction: 'asc' | 'desc'; };

// Helper for Attribute Color Coding (Same as Dashboard RosterTable)
const getAttrColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

const AttrCell: React.FC<{ value: number; className?: string }> = ({ value, className }) => (
    <td className={`py-2 px-1 text-center text-xs font-black font-mono ${getAttrColor(value)} ${className || ''}`}>
        {value}
    </td>
);

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || myTeamId);
  const [tab, setTab] = useState<'roster' | 'stats' | 'salary'>('roster');
  const [statMode, setStatMode] = useState<'traditional' | 'shooting' | 'strategy'>('traditional');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ovr', direction: 'desc' });
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);

  useEffect(() => { if (initialTeamId) setSelectedTeamId(initialTeamId); }, [initialTeamId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedTeam = allTeams.find(t => t.id === selectedTeamId);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  };

  const getSortValue = (p: Player, key: string): number | string => {
    if (key === 'name') return p.name;
    if (key === 'salary') return p.salary;
    if (key === 'contractYears') return p.contractYears;
    if (key === 'totalValue') return p.salary * p.contractYears;
    
    // [Fix] OVR must be calculated dynamically for sort to be correct
    if (key === 'ovr') return calculatePlayerOvr(p);
    
    if (key === 'potential') return p.potential;
    if (key === 'age') return p.age;
    if (key === 'position') {
        const posOrder = { 'PG': 1, 'SG': 2, 'SF': 3, 'PF': 4, 'C': 5 };
        return posOrder[p.position as keyof typeof posOrder] || 0;
    }
    if (tab === 'roster') return (p[key as keyof Player] as number) || 0;
    if (tab === 'salary') return (p[key as keyof Player] as number) || 0;

    const s = p.stats;
    const g = s.g || 1;
    if (key === 'g') return s.g;
    if (key === 'gs') return s.gs;
    if (key === 'mp') return s.mp / g;
    if (key === 'fg%') return s.fga > 0 ? s.fgm / s.fga : 0;
    if (key === '3p%') return s.p3a > 0 ? s.p3m / s.p3a : 0;
    if (key === 'ft%') return s.fta > 0 ? s.ftm / s.fta : 0;
    if (key === 'ts%') {
        const tsa = s.fga + 0.44 * s.fta;
        return tsa > 0 ? s.pts / (2 * tsa) : 0;
    }
    // Handle specific stats keys
    if (key === 'fgm') return s.fgm / g;
    if (key === 'fga') return s.fga / g;
    if (key === 'p3m') return s.p3m / g;
    if (key === 'p3a') return s.p3a / g;
    if (key === 'ftm') return s.ftm / g;
    if (key === 'fta') return s.fta / g;
    
    // Handle Zone Stats for sorting
    if (key.includes('_m') || key.includes('_a') || key.includes('_pct')) {
        // e.g. zone_rim_m, zone_rim_a, zone_rim_pct
        const zoneKey = key.replace('_pct', '');
        const isPct = key.endsWith('_pct');
        
        // Find makes and attempts keys
        const mKey = isPct ? zoneKey + '_m' : (key.endsWith('_m') ? key : key.replace('_a', '_m'));
        const aKey = isPct ? zoneKey + '_a' : (key.endsWith('_a') ? key : key.replace('_m', '_a'));
        
        const m = (s as any)[mKey] || 0;
        const a = (s as any)[aKey] || 0;
        
        if (isPct) return a > 0 ? m / a : 0;
        return (s as any)[key] / g;
    }

    if (key in s) return (s[key as keyof typeof s] as number) / g;
    return 0;
  };
  
  const sortedRoster = useMemo(() => {
    if (!selectedTeam) return [];
    return [...selectedTeam.roster].sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortConfig.direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [selectedTeam, sortConfig, tab, statMode]);

  const filteredTeamsList = useMemo(() => {
    return allTeams
        .filter(t => (t.city + t.name).toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => a.city.localeCompare(b.city));
  }, [allTeams, searchTerm]);

  const teamStats = useMemo(() => {
    if (!selectedTeam || selectedTeam.roster.length === 0) return null;
    const roster = selectedTeam.roster;
    const count = roster.length;
    const totalSalary = roster.reduce((sum, p) => sum + p.salary, 0);
    const totalAge = roster.reduce((sum, p) => sum + p.age, 0);
    
    // [Fix] Calculate Team Average OVR dynamically
    const totalOvr = roster.reduce((sum, p) => sum + calculatePlayerOvr(p), 0);
    
    const getAvg = (key: keyof Player) => Math.round(roster.reduce((sum, p) => sum + (p[key] as number), 0) / count);
    
    return { salary: totalSalary, age: (totalAge / count).toFixed(1), ovr: Math.round(totalOvr / count), getAvg };
  }, [selectedTeam]);

  const statsTotals = useMemo(() => {
    if (!selectedTeam) return null;
    const teamGames = Math.max(1, (selectedTeam.wins || 0) + (selectedTeam.losses || 0));
    const t = selectedTeam.roster.reduce((acc, p) => {
        const s = p.stats;
        const res: any = {
            mp: acc.mp + s.mp,
            pts: acc.pts + s.pts,
            reb: acc.reb + s.reb,
            offReb: acc.offReb + s.offReb,
            defReb: acc.defReb + s.defReb,
            ast: acc.ast + s.ast,
            stl: acc.stl + s.stl,
            blk: acc.blk + s.blk,
            tov: acc.tov + s.tov,
            pf: acc.pf + (s.pf || 0),
            fgm: acc.fgm + s.fgm,
            fga: acc.fga + s.fga,
            p3m: acc.p3m + s.p3m,
            p3a: acc.p3a + s.p3a,
            ftm: acc.ftm + s.ftm,
            fta: acc.fta + s.fta,
        };

        // Aggregate Zone Stats
        SHOOTING_ZONES.forEach(z => {
            const mKey = `${z.id}_m`;
            const aKey = `${z.id}_a`;
            res[mKey] = (acc[mKey] || 0) + ((s as any)[mKey] || 0);
            res[aKey] = (acc[aKey] || 0) + ((s as any)[aKey] || 0);
        });

        return res;
    }, { mp:0, pts:0, reb:0, offReb:0, defReb:0, ast:0, stl:0, blk:0, tov:0, pf:0, fgm:0, fga:0, p3m:0, p3a:0, ftm:0, fta:0 });
    return { ...t, teamGames };
  }, [selectedTeam]);

  // Transform TacticHistory into Array for Table
  const strategyData = useMemo(() => {
    if (!selectedTeam?.tacticHistory) return [];
    
    const history = selectedTeam.tacticHistory;
    const records: { type: string, name: string, stats: TacticStatRecord }[] = [];
    
    // Offense
    Object.entries(history.offense).forEach(([key, stats]) => {
        records.push({ 
            type: 'OFF', 
            name: OFFENSE_TACTIC_INFO[key as OffenseTactic]?.label || key, 
            stats: stats as TacticStatRecord
        });
    });

    // Defense
    Object.entries(history.defense).forEach(([key, stats]) => {
        records.push({ 
            type: 'DEF', 
            name: key === 'AceStopper' ? '에이스 스토퍼' : (DEFENSE_TACTIC_INFO[key as DefenseTactic]?.label || key), 
            stats: stats as TacticStatRecord
        });
    });

    return records.sort((a, b) => b.stats.games - a.stats.games);
  }, [selectedTeam]);

  const SortHeader: React.FC<{ label: string, sortKey: string, align?: 'left' | 'center' | 'right', width?: string, className?: string, tooltip?: string, rowSpan?: number }> = ({ label, sortKey, align = 'center', width, className, tooltip, rowSpan }) => (
    <th 
        rowSpan={rowSpan}
        className={`px-1 py-3 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-white/5 transition-colors group select-none relative ${className}`} 
        style={{ width, textAlign: align }} 
        onClick={() => handleSort(sortKey)}
    >
        <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
            <div className="relative group/text">
                <span>{label}</span>
                {tooltip && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[200px] bg-slate-900 border border-slate-700 p-2.5 rounded-lg shadow-xl z-50 hidden group-hover/text:block pointer-events-none">
                        <span className="text-[10px] text-slate-300 font-bold whitespace-pre-wrap leading-tight text-center block">{tooltip}</span>
                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-t border-l border-slate-700 rotate-45"></div>
                    </div>
                )}
            </div>
            <div className={`text-indigo-400 transition-opacity ${sortConfig.key === sortKey ? 'opacity-100' : 'opacity-20'}`}>
                {sortConfig.key === sortKey && sortConfig.direction === 'asc' ? <ArrowUp size={10} strokeWidth={3} /> : <ArrowDown size={10} strokeWidth={3} />}
            </div>
        </div>
    </th>
  );

  if (!selectedTeam) return null;

  return (
    <div className="space-y-6 flex flex-col animate-in fade-in duration-500 pb-10">
      {viewPlayer && <PlayerDetailModal player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} teamName={selectedTeam.name} teamId={selectedTeam.id} onClose={() => setViewPlayer(null)} />}
      
      <RosterHeader 
        selectedTeam={selectedTeam} myTeamId={myTeamId} isDropdownOpen={isDropdownOpen} setIsDropdownOpen={setIsDropdownOpen}
        searchTerm={searchTerm} setSearchTerm={setSearchTerm} filteredTeamsList={filteredTeamsList}
        onSelectTeam={setSelectedTeamId} dropdownRef={dropdownRef}
      />

      {/* [Refactor] Removed Outer Container (bg-slate-900/95, border, p-8) */}
      <div className="flex flex-col gap-6">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-800 pb-6 flex-shrink-0">
             <div className="flex bg-slate-950 rounded-xl p-1.5 border border-slate-800 overflow-x-auto max-w-full">
                 <button onClick={() => setTab('roster')} className={`px-6 md:px-8 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 flex-shrink-0 ${tab === 'roster' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                    <Users size={16} /> 능력치
                 </button>
                 <button onClick={() => setTab('stats')} className={`px-6 md:px-8 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 flex-shrink-0 ${tab === 'stats' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                    <Activity size={16} /> 기록
                 </button>
                 <button onClick={() => setTab('salary')} className={`px-6 md:px-8 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 flex-shrink-0 ${tab === 'salary' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                    <Wallet size={16} /> 샐러리
                 </button>
             </div>

             {/* Stat Mode Toggle */}
             {tab === 'stats' && (
                 <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
                    <button 
                        onClick={() => setStatMode('traditional')}
                        className={`px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${statMode === 'traditional' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Table2 size={12} /> 기본
                    </button>
                    <button 
                        onClick={() => setStatMode('shooting')}
                        className={`px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${statMode === 'shooting' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Target size={12} /> 슈팅
                    </button>
                    <button 
                        onClick={() => setStatMode('strategy')}
                        className={`px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${statMode === 'strategy' ? 'bg-fuchsia-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Swords size={12} /> 전술
                    </button>
                 </div>
             )}
         </div>

         {tab === 'salary' && teamStats && <SalaryCapDashboard currentTotalSalary={teamStats.salary} />}

         <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse table-auto">
               {/* Separate Logic for Shooting Tab Header (2 Rows) vs Standard (1 Row) */}
               <thead className="sticky top-0 z-20">
                  {tab === 'stats' && statMode === 'shooting' ? (
                      <>
                        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                             {/* Fixed Columns rowSpan=2 */}
                             <th rowSpan={2} className="py-3 px-6 text-left sticky left-0 bg-slate-950/95 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.5)] border-b border-white/10 w-[180px]">PLAYER NAME</th>
                             <SortHeader rowSpan={2} label="POS" sortKey="position" width="50px" className="border-b border-white/10 bg-slate-950/95" />
                             <SortHeader rowSpan={2} label="AGE" sortKey="age" width="40px" className="border-b border-white/10 bg-slate-950/95" />
                             <SortHeader rowSpan={2} label="OVR" sortKey="ovr" width="50px" className="border-r border-b border-white/10 pr-2 bg-slate-950/95" />

                             {/* Group Headers colSpan=3 */}
                             {SHOOTING_ZONES.map(z => (
                                 <th key={z.id} colSpan={3} className="py-2 text-center border-b border-r border-white/10 text-slate-300 bg-slate-950/95">{z.label}</th>
                             ))}
                        </tr>
                        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                            {/* Sub Headers M/A/% */}
                             {SHOOTING_ZONES.map(z => (
                                <React.Fragment key={z.id + '_sub'}>
                                    <SortHeader label="M" sortKey={`${z.id}_m`} width="45px" align="right" className="bg-slate-950/95 border-b border-white/10" />
                                    <SortHeader label="A" sortKey={`${z.id}_a`} width="45px" align="right" className="bg-slate-950/95 border-b border-white/10" />
                                    <SortHeader label="%" sortKey={`${z.id}_pct`} width="45px" align="right" className="bg-slate-950/95 border-r border-b border-white/10 pr-2" />
                                </React.Fragment>
                             ))}
                        </tr>
                      </>
                  ) : (
                      // STANDARD HEADER (1 Row)
                      <tr className="border-y border-white/10 text-slate-500 bg-slate-950/90 backdrop-blur-sm">
                         {/* Name Column - Sticky Left */}
                         <th className="py-3 px-6 text-[10px] font-black uppercase tracking-widest sticky left-0 bg-slate-950/95 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)] w-[180px]">
                            {statMode === 'strategy' && tab === 'stats' ? 'TACTIC NAME' : 'PLAYER NAME'}
                         </th>
                         
                         {/* Basic Info Cols (Available in Roster & Stats (Trad/Shooting) tabs) */}
                         {(tab === 'roster' || (tab === 'stats' && statMode !== 'strategy')) && (
                           <>
                             <SortHeader label="POS" sortKey="position" width="50px" />
                             <SortHeader label="AGE" sortKey="age" width="40px" />
                             <SortHeader label="OVR" sortKey="ovr" width="50px" className="border-r border-white/10 pr-2" />
                           </>
                         )}
                         
                         {/* Strategy Type Column */}
                         {statMode === 'strategy' && tab === 'stats' && (
                             <th className="py-3 px-2 text-[10px] font-black uppercase tracking-widest text-center border-r border-white/10 w-[60px]">TYPE</th>
                         )}
                         
                         {tab === 'roster' ? (
                            ALL_ROSTER_COLUMNS.map(col => {
                                const isMajor = ['INS', 'OUT', 'PLM', 'ATH', 'DEF', 'REB'].includes(col.label);
                                const isSeparator = ['DRF', 'DCN'].includes(col.label);
                                return (
                                <SortHeader 
                                    key={String(col.key)} 
                                    label={col.label} 
                                    sortKey={col.key as string} 
                                    width="45px" 
                                    tooltip={col.tooltip} 
                                    className={`
                                        ${isMajor ? 'bg-white/5' : ''}
                                        ${isSeparator ? 'border-r border-white/10' : ''}
                                    `}
                                />
                                );
                            })
                         ) : tab === 'stats' ? (
                            statMode === 'traditional' ? (
                                TRADITIONAL_STATS_COLUMNS.map(col => <SortHeader key={col.key} label={col.label} sortKey={col.key} width={UNIFIED_STAT_WIDTH} align="right" className="pr-3" />)
                            ) : (
                                // Strategy Stats Header
                                STRATEGY_COLUMNS.map(col => (
                                    <SortHeader key={col.key} label={col.label} sortKey={`strategy_${col.key}`} width={col.width} align="right" className="pr-4" />
                                ))
                            )
                         ) : (
                            SALARY_COLUMNS.map(col => <SortHeader key={col.key} label={col.label} sortKey={col.key} width="120px" align="right" className="pr-3" />)
                         )}
                      </tr>
                  )}
               </thead>
               <tbody className="divide-y divide-white/5">
                  {/* STRATEGY MODE BODY */}
                  {statMode === 'strategy' && tab === 'stats' ? (
                      strategyData.length === 0 ? (
                          <tr><td colSpan={10} className="py-12 text-center text-slate-500 font-bold text-xs">기록된 전술 데이터가 없습니다.</td></tr>
                      ) : (
                          strategyData.map((record, idx) => {
                              const s = record.stats;
                              const winPct = s.games > 0 ? (s.wins / s.games * 100).toFixed(1) : '0.0';
                              const avgPts = s.games > 0 ? (s.ptsFor / s.games).toFixed(1) : '0.0';
                              const avgPa = s.games > 0 ? (s.ptsAgainst / s.games).toFixed(1) : '0.0';
                              const fgPct = s.fga > 0 ? ((s.fgm / s.fga) * 100).toFixed(1) + '%' : '0.0%';
                              const p3Pct = s.p3a > 0 ? ((s.p3m / s.p3a) * 100).toFixed(1) + '%' : '0.0%';
                              const rimPct = s.rimA > 0 ? ((s.rimM / s.rimA) * 100).toFixed(1) + '%' : '0.0%';

                              return (
                                <tr key={idx} className="hover:bg-white/5 transition-all group">
                                    <td className="py-3 px-6 sticky left-0 bg-slate-950 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                                        <span className="text-xs font-bold text-slate-300">{record.name}</span>
                                    </td>
                                    <td className="py-3 px-2 text-center border-r border-white/10">
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${record.type === 'OFF' ? 'bg-indigo-900/50 text-indigo-400' : 'bg-red-900/50 text-red-400'}`}>
                                            {record.type}
                                        </span>
                                    </td>
                                    <td className="py-2 px-1 text-right pr-4 font-black font-mono text-slate-400 text-xs">{s.games}</td>
                                    <td className="py-2 px-1 text-right pr-4 font-black font-mono text-slate-400 text-xs">{s.wins}-{s.games - s.wins}</td>
                                    <td className={`py-2 px-1 text-right pr-4 font-black font-mono text-xs ${Number(winPct) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{winPct}%</td>
                                    <td className="py-2 px-1 text-right pr-4 font-black font-mono text-white text-xs">{avgPts}</td>
                                    <td className="py-2 px-1 text-right pr-4 font-black font-mono text-slate-400 text-xs">{avgPa}</td>
                                    <td className="py-2 px-1 text-right pr-4 font-black font-mono text-slate-400 text-xs">{fgPct}</td>
                                    <td className="py-2 px-1 text-right pr-4 font-black font-mono text-slate-400 text-xs">{p3Pct}</td>
                                    <td className="py-2 px-1 text-right pr-4 font-black font-mono text-slate-400 text-xs">{rimPct}</td>
                                </tr>
                              );
                          })
                      )
                  ) : (
                      // PLAYER LIST BODY
                      sortedRoster.map(p => {
                          // [Fix] Calculate real-time OVR for display
                          const displayOvr = calculatePlayerOvr(p);
                          
                          return (
                          <tr key={p.id} className="hover:bg-white/5 transition-all group">
                              <td className="py-2.5 px-6 sticky left-0 bg-slate-950/95 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)] cursor-pointer" onClick={() => setViewPlayer(p)}>
                                  <div className="flex items-center gap-3">
                                      <div className="flex flex-col min-w-0">
                                          <div className="flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                                              <span className="text-xs font-bold text-slate-300 truncate max-w-[140px] group-hover:text-indigo-400 group-hover:underline">{p.name}</span>
                                              {p.health !== 'Healthy' && (
                                                  <span 
                                                    className={`px-1 py-0.5 rounded-[3px] text-[8px] font-black uppercase cursor-help ${p.health === 'Injured' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}
                                                    title={`복귀 예정: ${p.returnDate || '미정'} (${p.injuryType || '부상'})`}
                                                  >
                                                    {p.health === 'Injured' ? 'OUT' : 'DTD'}
                                                  </span>
                                              )}
                                          </div>
                                      </div>
                                  </div>
                              </td>
                              
                              {/* Shared Info Columns with Dark Background */}
                              {(tab === 'roster' || tab === 'stats') && (
                                <>
                                    <td className="px-1 py-2 text-center text-xs font-bold text-slate-400 bg-slate-950/80">{p.position}</td>
                                    <td className="px-1 py-2 text-center text-xs font-bold text-slate-400 bg-slate-950/80">{p.age}</td>
                                    <td className="px-1 py-2 text-center border-r border-white/10 pr-2 bg-slate-950/80">
                                        <div className={getOvrBadgeStyle(displayOvr) + " !w-7 !h-7 !text-xs !mx-auto"}>{displayOvr}</div>
                                    </td>
                                </>
                              )}

                              {tab === 'roster' ? (
                                  ALL_ROSTER_COLUMNS.map(col => {
                                      const isMajor = ['INS', 'OUT', 'PLM', 'ATH', 'DEF', 'REB'].includes(col.label);
                                      const isSeparator = ['DRF', 'DCN'].includes(col.label);
                                      
                                      return (
                                      <AttrCell 
                                        key={String(col.key)} 
                                        value={p[col.key as keyof Player] as number} 
                                        className={`
                                            ${isMajor ? 'bg-white/5' : ''}
                                            ${isSeparator ? 'border-r border-white/10' : ''}
                                        `}
                                      />
                                      );
                                  })
                              ) : tab === 'stats' ? (
                                  statMode === 'traditional' ? (
                                      TRADITIONAL_STATS_COLUMNS.map(col => {
                                          const s = p.stats;
                                          const g = s.g || 1;
                                          let valStr = (s[col.key as keyof typeof s] as number / g).toFixed(1);
                                          
                                          if (col.key === 'g' || col.key === 'gs') valStr = String(s[col.key as keyof typeof s]);
                                          else if (col.key === 'fgm' || col.key === 'fga' || col.key === 'p3m' || col.key === 'p3a' || col.key === 'ftm' || col.key === 'fta') {
                                              valStr = (s[col.key as keyof typeof s] as number / g).toFixed(1);
                                          }
                                          else if (col.key.includes('%')) {
                                              let n = 0, d = 0;
                                              if (col.key === 'fg%') { n = s.fgm; d = s.fga; }
                                              else if (col.key === '3p%') { n = s.p3m; d = s.p3a; }
                                              else if (col.key === 'ft%') { n = s.ftm; d = s.fta; }
                                              else if (col.key === 'ts%') { n = s.pts; d = 2 * (s.fga + 0.44 * s.fta); }
                                              valStr = d > 0 ? ((n / d) * 100).toFixed(1) + '%' : '0.0%';
                                          } else if (col.key === 'pf') {
                                              valStr = ((s.pf || 0) / g).toFixed(1);
                                          }
                                          // [Visual Update] Font Monospace & Black
                                          return <td key={col.key} className="px-1 py-2 align-middle text-right pr-3 font-black font-mono text-slate-400 text-xs tabular-nums">{valStr}</td>;
                                      })
                                  ) : (
                                      // Shooting Stats Body
                                      SHOOTING_ZONES.map(zone => {
                                          const s = p.stats as any;
                                          const m = s[`${zone.id}_m`] || 0;
                                          const a = s[`${zone.id}_a`] || 0;
                                          const pct = a > 0 ? ((m / a) * 100).toFixed(1) + '%' : '-';
                                          
                                          return (
                                              <React.Fragment key={zone.id}>
                                                  {/* [Visual Update] Font Monospace & Black */}
                                                  <td className="px-1 py-2 align-middle text-right pr-3 font-black font-mono text-slate-300 text-xs tabular-nums bg-white/5">{m}</td>
                                                  <td className="px-1 py-2 align-middle text-right pr-3 font-black font-mono text-slate-500 text-xs tabular-nums bg-white/5">{a}</td>
                                                  <td className={`px-1 py-2 align-middle text-right pr-4 border-r border-white/10 font-black font-mono text-xs tabular-nums bg-white/5 ${a > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>{pct}</td>
                                              </React.Fragment>
                                          );
                                      })
                                  )
                              ) : (
                                  SALARY_COLUMNS.map(col => {
                                      let valStr = String(p[col.key as keyof Player] || '');
                                      if (col.key === 'ovr') return <td key={col.key} className="px-1 py-2 align-middle text-right pr-3"><div className="flex justify-end"><div className={getOvrBadgeStyle(displayOvr) + " !w-7 !h-7 !text-xs !mx-0"}>{displayOvr}</div></div></td>;
                                      if (col.key === 'salary') valStr = `$${p.salary.toFixed(1)}M`;
                                      else if (col.key === 'contractYears') valStr = `${p.contractYears}년`;
                                      else if (col.key === 'totalValue') valStr = `$${(p.salary * p.contractYears).toFixed(1)}M`;
                                      return <td key={col.key} className="px-1 py-2 align-middle text-right pr-3 font-bold text-slate-400 text-xs tabular-nums">{valStr}</td>;
                                  })
                              )}
                          </tr>
                      );
                      })
                  )}
               </tbody>
               {/* Footer for Roster Tab */}
               {teamStats && tab === 'roster' && (
                   <tfoot className="bg-slate-900 border-t border-slate-800 z-10 sticky bottom-0 shadow-[0_-2px_10px_rgba(0,0,0,0.5)]">
                       <tr>
                           <td className="py-3 px-6 text-[10px] font-black text-indigo-400 uppercase tracking-widest sticky left-0 bg-slate-900 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">TEAM AVERAGE</td>
                           <td className="px-1 py-3 text-center text-xs font-bold text-slate-600">-</td>
                           <td className="px-1 py-3 text-center text-xs font-bold text-slate-400">{teamStats.age}</td>
                           <td className="px-1 py-3 text-center border-r border-white/10 pr-2"><div className={getOvrBadgeStyle(teamStats.ovr) + " !w-7 !h-7 !text-xs !mx-auto"}>{teamStats.ovr}</div></td>
                           {ALL_ROSTER_COLUMNS.map(col => {
                               const isMajor = ['INS', 'OUT', 'PLM', 'ATH', 'DEF', 'REB'].includes(col.label);
                               const isSeparator = ['DRF', 'DCN'].includes(col.label);
                               return (
                               <AttrCell 
                                 key={String(col.key)} 
                                 value={teamStats.getAvg(col.key as keyof Player)} 
                                 className={`
                                    ${isMajor ? 'bg-white/5' : ''}
                                    ${isSeparator ? 'border-r border-white/10' : ''}
                                 `}
                               />
                               );
                           })}
                       </tr>
                   </tfoot>
               )}
               {/* Footer for Stats Tab */}
               {statsTotals && tab === 'stats' && statMode !== 'strategy' && (
                    <tfoot className="bg-slate-900 border-t border-slate-800 z-10 sticky bottom-0 shadow-[0_-2px_10px_rgba(0,0,0,0.5)]">
                        <tr>
                            <td className="py-3 px-6 text-[10px] font-black text-indigo-400 uppercase tracking-widest sticky left-0 bg-slate-900 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">TEAM TOTAL</td>
                            <td className="px-1 py-3 text-center text-xs font-bold text-slate-600 bg-slate-900">-</td>
                            <td className="px-1 py-3 text-center text-xs font-bold text-slate-400 bg-slate-900">-</td>
                            <td className="px-1 py-3 text-center border-r border-white/10 pr-2 bg-slate-900"><div className={getOvrBadgeStyle(teamStats!.ovr) + " !w-7 !h-7 !text-xs !mx-auto"}>{teamStats!.ovr}</div></td>
                            
                            {statMode === 'traditional' ? (
                                TRADITIONAL_STATS_COLUMNS.map(col => {
                                    let valStr = '-';
                                    const g = statsTotals.teamGames;
                                    
                                    if (col.key === 'g' || col.key === 'gs' || col.key === 'mp') {
                                        valStr = '-';
                                    }
                                    else if (col.key === 'fgm' || col.key === 'fga' || col.key === 'p3m' || col.key === 'p3a' || col.key === 'ftm' || col.key === 'fta') {
                                        const keyMap: any = {
                                            'fgm': 'fgm', 'fga': 'fga', 'p3m': 'p3m', 'p3a': 'p3a', 'ftm': 'ftm', 'fta': 'fta'
                                        };
                                        valStr = (statsTotals[keyMap[col.key] as keyof typeof statsTotals] / g).toFixed(1);
                                    }
                                    else if (col.key.includes('%')) {
                                        let n = 0, d = 0;
                                        if (col.key === 'fg%') { n = statsTotals.fgm; d = statsTotals.fga; }
                                        else if (col.key === '3p%') { n = statsTotals.p3m; d = statsTotals.p3a; }
                                        else if (col.key === 'ft%') { n = statsTotals.ftm; d = statsTotals.fta; }
                                        else if (col.key === 'ts%') { n = statsTotals.pts; d = 2 * (statsTotals.fga + 0.44 * statsTotals.fta); }
                                        valStr = d > 0 ? ((n / d) * 100).toFixed(1) + '%' : '0.0%';
                                    } else {
                                        const keyMap: any = {
                                            'pts': 'pts', 'reb': 'reb', 'offReb': 'offReb', 'defReb': 'defReb',
                                            'ast': 'ast', 'stl': 'stl', 'blk': 'blk', 'tov': 'tov', 'pf': 'pf'
                                        };
                                        const statKey = keyMap[col.key];
                                        if (statKey) {
                                            valStr = (statsTotals[statKey as keyof typeof statsTotals] / g).toFixed(1);
                                        }
                                    }
                                    
                                    // [Visual Update] Font Monospace & Black
                                    return <td key={col.key} className="px-1 py-3 align-middle text-right pr-3 font-black font-mono text-white text-xs tabular-nums">{valStr}</td>
                                })
                            ) : (
                                 // Shooting Stats Footer
                                  SHOOTING_ZONES.map(zone => {
                                      const s = statsTotals as any;
                                      const m = s[`${zone.id}_m`] || 0;
                                      const a = s[`${zone.id}_a`] || 0;
                                      const pct = a > 0 ? ((m / a) * 100).toFixed(1) + '%' : '-';
                                      
                                      return (
                                          <React.Fragment key={zone.id}>
                                              {/* [Visual Update] Font Monospace & Black */}
                                              <td className="px-1 py-3 align-middle text-right pr-3 font-black font-mono text-slate-300 text-xs tabular-nums bg-white/5">{m}</td>
                                              <td className="px-1 py-3 align-middle text-right pr-3 font-black font-mono text-slate-500 text-xs tabular-nums bg-white/5">{a}</td>
                                              <td className={`px-1 py-3 align-middle text-right pr-4 border-r border-white/10 font-black font-mono text-xs tabular-nums bg-white/5 ${a > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>{pct}</td>
                                          </React.Fragment>
                                      );
                                  })
                            )}
                        </tr>
                    </tfoot>
               )}
            </table>
         </div>
      </div>
    </div>
  );
};
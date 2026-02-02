
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Users, Activity, Wallet, ClipboardList, ArrowUp, ArrowDown, CalendarClock } from 'lucide-react';
import { Team, Player } from '../types';
import { getOvrBadgeStyle, getRankStyle, PlayerDetailModal } from '../components/SharedComponents';
import { calculatePlayerOvr } from '../utils/constants';

// New Sub-Components
import { RosterHeader } from '../components/roster/RosterHeader';
import { SalaryCapDashboard } from '../components/roster/SalaryCapDashboard';
import { TacticsHistory } from '../components/roster/TacticsHistory';

interface RosterViewProps {
  allTeams: Team[];
  myTeamId: string;
  initialTeamId?: string | null;
}

const ROSTER_CATEGORIES = {
  'Shooting': '슈팅/득점',
  'Athleticism': '신체능력',
  'Playmaking': '핸들링/패스',
  'DefReb': '수비/리바운드'
};

const ROSTER_COLUMNS: Record<string, { key: keyof Player | string, label: string }[]> = {
  'Shooting': [
    { key: 'ins', label: 'INS' }, { key: 'closeShot', label: 'CLS' }, { key: 'layup', label: 'LAY' }, { key: 'dunk', label: 'DNK' }, { key: 'drawFoul', label: 'DRF' },
    { key: 'out', label: 'OUT' }, { key: 'midRange', label: 'MID' }, { key: 'threeCorner', label: '3PT' }, { key: 'ft', label: 'FT' }, { key: 'shotIq', label: 'SIQ' }, { key: 'offConsist', label: 'OCN' },
  ],
  'Athleticism': [
    { key: 'ath', label: 'ATH' }, { key: 'speed', label: 'SPD' }, { key: 'agility', label: 'AGI' }, { key: 'strength', label: 'STR' }, { key: 'vertical', label: 'JMP' }, { key: 'stamina', label: 'STA' }, { key: 'durability', label: 'DUR' },
  ],
  'Playmaking': [
    { key: 'plm', label: 'PLM' }, { key: 'handling', label: 'HDL' }, { key: 'hands', label: 'HND' }, { key: 'passAcc', label: 'PAS' }, { key: 'passVision', label: 'VIS' }, { key: 'passIq', label: 'IQ' },
  ],
  'DefReb': [
    { key: 'def', label: 'DEF' }, { key: 'perDef', label: 'PER' }, { key: 'intDef', label: 'INT' }, { key: 'steal', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'hustle', label: 'HUS' }, { key: 'passPerc', label: 'PRC' }, { key: 'defConsist', label: 'DCN' }, { key: 'reb', label: 'REB' }, { key: 'offReb', label: 'ORB' }, { key: 'defReb', label: 'DRB' },
  ]
};

const STATS_COLUMNS = [
  { key: 'g', label: 'GP' }, { key: 'gs', label: 'GS' }, { key: 'mp', label: 'MIN' }, { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'offReb', label: 'ORB' }, { key: 'defReb', label: 'DRB' }, { key: 'ast', label: 'AST' }, { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' }, { key: 'pf', label: 'PF' }, { key: 'fg%', label: 'FG%' }, { key: '3p%', label: '3P%' }, { key: 'ft%', label: 'FT%' }, { key: 'ts%', label: 'TS%' },
];

const SALARY_COLUMNS = [
  { key: 'ovr', label: 'OVR' }, { key: 'age', label: 'AGE' }, { key: 'salary', label: '연봉 ($M)' }, { key: 'contractYears', label: '잔여계약' }, { key: 'totalValue', label: '총 계약규모' },
];

const ATTRIBUTE_TOOLTIPS: Record<string, string> = {
  'INS': '인사이드 스코어링', 'CLS': '근거리 슛', 'LAY': '레이업', 'DNK': '덩크', 'DRF': '자유투 유도', 'OUT': '외곽 스코어링', 'MID': '중거리 슛', '3PT': '3점 슛', 'FT': '자유투', 'SIQ': '슛 셀렉션', 'OCN': '공격 기복', 'ATH': '운동능력', 'SPD': '스피드', 'AGI': '민첩성', 'STR': '힘', 'JMP': '점프력', 'STA': '지구력', 'DUR': '내구도', 'PLM': '플레이메이킹', 'HDL': '볼 핸들링', 'HND': '핸즈', 'PAS': '패스 정확도', 'VIS': '패스 시야', 'IQ': '농구 지능', 'DEF': '수비력', 'PER': '퍼리미터 수비', 'INT': '인사이드 수비', 'STL': '스틸', 'BLK': '블록', 'PRC': '패스 차단', 'DCN': '수비 기복', 'REB': '리바운드', 'ORB': '공격 리바운드', 'DRB': '수비 리바운드', 'HUS': '허슬'
};

type SortConfig = { key: string; direction: 'asc' | 'desc'; };

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || myTeamId);
  const [tab, setTab] = useState<'roster' | 'stats' | 'salary' | 'tactics'>('roster');
  const [rosterCategory, setRosterCategory] = useState<string>('Shooting');
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
  }, [selectedTeam, sortConfig, tab]);

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
        return {
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
    }, { mp:0, pts:0, reb:0, offReb:0, defReb:0, ast:0, stl:0, blk:0, tov:0, pf:0, fgm:0, fga:0, p3m:0, p3a:0, ftm:0, fta:0 });
    return { ...t, teamGames };
  }, [selectedTeam]);

  const SortHeader: React.FC<{ label: string, sortKey: string, align?: 'left' | 'center' | 'right', width?: string, className?: string, tooltip?: string }> = ({ label, sortKey, align = 'center', width, className, tooltip }) => (
    <th className={`px-1 py-4 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-white/5 transition-colors group select-none relative ${className}`} style={{ width, textAlign: align }} onClick={() => handleSort(sortKey)}>
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

      {/* [Optimization] bg-slate-900/60 -> bg-slate-900/95, Removed backdrop-blur-sm */}
      <div className="flex flex-col gap-6 bg-slate-900/95 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-800 pb-6 flex-shrink-0">
             <div className="flex bg-slate-950 rounded-xl p-1.5 border border-slate-800 overflow-x-auto max-w-full">
                 <button onClick={() => setTab('roster')} className={`px-6 md:px-8 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 flex-shrink-0 ${tab === 'roster' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                    <Users size={16} /> 능력치
                 </button>
                 <button onClick={() => setTab('stats')} className={`px-6 md:px-8 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 flex-shrink-0 ${tab === 'stats' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                    <Activity size={16} /> 시즌 스탯
                 </button>
                 <button onClick={() => setTab('salary')} className={`px-6 md:px-8 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 flex-shrink-0 ${tab === 'salary' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                    <Wallet size={16} /> 샐러리
                 </button>
                 <button onClick={() => setTab('tactics')} className={`px-6 md:px-8 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 flex-shrink-0 ${tab === 'tactics' ? 'bg-fuchsia-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                    <ClipboardList size={16} /> 전술 기록
                 </button>
             </div>
             {tab === 'roster' && (
                 <div className="flex flex-wrap gap-2">
                    {Object.keys(ROSTER_CATEGORIES).map(cat => (
                        <button key={cat} onClick={() => setRosterCategory(cat)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all border ${rosterCategory === cat ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/50' : 'bg-transparent text-slate-500 border-slate-800 hover:border-slate-600'}`}>{ROSTER_CATEGORIES[cat as keyof typeof ROSTER_CATEGORIES]}</button>
                    ))}
                 </div>
             )}
         </div>

         {tab === 'salary' && teamStats && <SalaryCapDashboard currentTotalSalary={teamStats.salary} />}

         {tab === 'tactics' ? <TacticsHistory team={selectedTeam} /> : (
             <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse table-auto">
                   <thead className="sticky top-0 bg-slate-900/95 z-20">
                      <tr className="border-b border-slate-800 text-slate-500">
                         <SortHeader label="Player Info" sortKey="name" align="left" width="200px" className="pl-8 px-6" />
                         {tab === 'roster' && (
                           <><SortHeader label="POS" sortKey="position" width="60px" /><SortHeader label="AGE" sortKey="age" width="50px" /><SortHeader label="Salary" sortKey="salary" width="80px" /><SortHeader label="OVR" sortKey="ovr" width="60px" className="border-r-2 border-slate-700/60 pl-2" /></>
                         )}
                         {tab === 'roster' ? (
                            ROSTER_COLUMNS[rosterCategory].map(col => (
                                <SortHeader key={String(col.key)} label={col.label} sortKey={col.key as string} width="50px" tooltip={ATTRIBUTE_TOOLTIPS[col.label]} className={col.label === 'OUT' || col.label === 'REB' ? "border-l-2 border-slate-700/60 pl-2" : ""} />
                            ))
                         ) : tab === 'stats' ? (
                            STATS_COLUMNS.map(col => <SortHeader key={col.key} label={col.label} sortKey={col.key} width="50px" align="right" className="pr-3" />)
                         ) : (
                            SALARY_COLUMNS.map(col => <SortHeader key={col.key} label={col.label} sortKey={col.key} width="120px" align="right" className="pr-3" />)
                         )}
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800/40">
                      {sortedRoster.map(p => {
                          // [Fix] Calculate real-time OVR for display
                          const displayOvr = calculatePlayerOvr(p);
                          
                          return (
                          <tr key={p.id} className="hover:bg-slate-800/30 transition-all group">
                              <td className="pl-8 px-6 py-3 cursor-pointer" onClick={() => setViewPlayer(p)}>
                                  <div className="flex items-center gap-3">
                                      <div className="flex flex-col min-w-0">
                                          <div className="flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                                              <span className="text-base font-black text-white truncate max-w-[160px] group-hover:text-indigo-400 group-hover:underline">{p.name}</span>
                                              {p.health !== 'Healthy' && (
                                                  <span 
                                                    className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black text-white uppercase cursor-help ${p.health === 'Injured' ? 'bg-red-600' : 'bg-amber-600'}`}
                                                    title={`복귀 예정: ${p.returnDate || '미정'} (${p.injuryType || '부상'})`}
                                                  >
                                                    {p.health === 'Injured' ? 'OUT' : 'DTD'}
                                                  </span>
                                              )}
                                          </div>
                                      </div>
                                  </div>
                              </td>
                              {tab === 'roster' && (
                                <><td className="px-2 py-3 text-center"><span className="text-sm font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800 uppercase">{p.position}</span></td>
                                <td className="px-2 py-3 text-center text-sm font-bold text-white">{p.age}</td>
                                <td className="px-2 py-3 text-center text-sm font-bold text-white">${p.salary.toFixed(1)}M</td>
                                <td className="px-1 py-3 text-center border-r-2 border-slate-700/60 pl-2"><div className={getOvrBadgeStyle(displayOvr) + " !w-9 !h-9 !text-lg !mx-auto"}>{displayOvr}</div></td></>
                              )}
                              {tab === 'roster' ? (
                                  ROSTER_COLUMNS[rosterCategory].map(col => (
                                      <td key={String(col.key)} className={`px-0 py-2 align-middle text-center ${col.label === 'OUT' || col.label === 'REB' ? 'border-l-2 border-slate-700/60' : ''}`}><div className={getRankStyle(p[col.key as keyof Player] as number) + " !mx-auto"}>{p[col.key as keyof Player] as number}</div></td>
                                  ))
                              ) : tab === 'stats' ? (
                                  STATS_COLUMNS.map(col => {
                                      const s = p.stats;
                                      const g = s.g || 1;
                                      let valStr = (s[col.key as keyof typeof s] as number / g).toFixed(1);
                                      if (col.key === 'g' || col.key === 'gs') valStr = String(s[col.key as keyof typeof s]);
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
                                      return <td key={col.key} className="px-1 py-2 align-middle text-right pr-3 font-medium text-slate-300 text-sm tabular-nums">{valStr}</td>;
                                  })
                              ) : (
                                  SALARY_COLUMNS.map(col => {
                                      let valStr = String(p[col.key as keyof Player] || '');
                                      if (col.key === 'ovr') return <td key={col.key} className="px-1 py-2 align-middle text-right pr-3"><div className="flex justify-end"><div className={getOvrBadgeStyle(displayOvr) + " !w-8 !h-8 !text-sm !mx-0"}>{displayOvr}</div></div></td>;
                                      if (col.key === 'salary') valStr = `$${p.salary.toFixed(1)}M`;
                                      else if (col.key === 'contractYears') valStr = `${p.contractYears}년`;
                                      else if (col.key === 'totalValue') valStr = `$${(p.salary * p.contractYears).toFixed(1)}M`;
                                      return <td key={col.key} className="px-1 py-2 align-middle text-right pr-3 font-bold text-slate-300 text-sm tabular-nums">{valStr}</td>;
                                  })
                              )}
                          </tr>
                      );
                      })}
                   </tbody>
                   {/* Footer for Roster Tab */}
                   {teamStats && tab === 'roster' && (
                       <tfoot className="bg-slate-800/40 border-t-2 border-slate-700/50">
                           <tr>
                               <td className="pl-8 px-6 py-4 text-xs font-black text-indigo-400 uppercase">TEAM TOTAL</td>
                               <td className="px-2 py-4 text-center text-xs font-bold text-slate-500">-</td>
                               <td className="px-2 py-4 text-center text-sm font-bold text-white">{teamStats.age}</td>
                               <td className="px-2 py-4 text-center text-sm font-bold text-white">${teamStats.salary.toFixed(1)}M</td>
                               <td className="px-1 py-4 text-center border-r-2 border-slate-700/60 pl-2"><div className={getOvrBadgeStyle(teamStats.ovr) + " !w-9 !h-9 !text-lg !mx-auto"}>{teamStats.ovr}</div></td>
                               {ROSTER_COLUMNS[rosterCategory].map(col => (
                                   <td key={String(col.key)} className={`px-0 py-2 align-middle text-center ${col.label === 'OUT' || col.label === 'REB' ? 'border-l-2 border-slate-700/40' : ''}`}><div className={getRankStyle(teamStats.getAvg(col.key as keyof Player)) + " !mx-auto"}>{teamStats.getAvg(col.key as keyof Player)}</div></td>
                               ))}
                           </tr>
                       </tfoot>
                   )}
                   {/* Footer for Stats Tab */}
                   {statsTotals && tab === 'stats' && (
                        <tfoot className="bg-slate-800/40 border-t-2 border-slate-700/50">
                            <tr>
                                <td className="pl-8 px-6 py-4 text-xs font-black text-indigo-400 uppercase">TEAM</td>
                                {STATS_COLUMNS.map(col => {
                                    let valStr = '-';
                                    const g = statsTotals.teamGames;
                                    
                                    if (col.key === 'g' || col.key === 'gs' || col.key === 'mp') {
                                        valStr = '-';
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
                                    
                                    return <td key={col.key} className="px-1 py-4 align-middle text-right pr-3 font-bold text-white text-sm tabular-nums">{valStr}</td>
                                })}
                            </tr>
                        </tfoot>
                   )}
                </table>
             </div>
         )}
      </div>
    </div>
  );
};

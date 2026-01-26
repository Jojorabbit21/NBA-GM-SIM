
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Users, Activity, ChevronDown, Search, CheckCircle2, CalendarClock, ArrowUp, ArrowDown, Wallet, AlertCircle, Info, ClipboardList, Target, Shield, Lock
} from 'lucide-react';
import { Team, Player, TacticStatRecord, OffenseTactic, DefenseTactic } from '../types';
import { getOvrBadgeStyle, getRankStyle, PlayerDetailModal } from '../components/SharedComponents';

interface RosterViewProps {
  allTeams: Team[];
  myTeamId: string;
  initialTeamId?: string | null;
}

const TAX_LEVEL = 170;
const FIRST_APRON = 178;
const SECOND_APRON = 189;
const SALARY_CAP = 140;

const getCapStatus = (cap: number) => {
  if (cap >= SECOND_APRON) return { label: '2차 에이프런 초과', msg: '강력한 영입 제한 및 지명권 패널티가 적용되는 단계입니다.', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/50' };
  if (cap >= FIRST_APRON) return { label: '1차 에이프런 초과', msg: '미드레벨 예외 조항 사용 제한 등 팀 운영 유동성이 제약됩니다.', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/50' };
  if (cap >= TAX_LEVEL) return { label: '사치세 납부 구간', msg: '샐러리 캡을 초과하여 구단 운영비 외 추가 세금이 부과됩니다.', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/50' };
  if (cap >= SALARY_CAP) return { label: '샐러리 캡 초과', msg: '사치세 라인 미만이지만, FA 영입 시 예외 조항 위주로 운영해야 합니다.', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/50' };
  return { label: '캡 스페이스 여유', msg: '공격적인 FA 영입 및 트레이드 흡수가 가능한 건강한 상태입니다.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-400/50' };
};

const getVisualPercentage = (cap: number) => {
  if (cap < SALARY_CAP) return (cap / SALARY_CAP) * 20;
  if (cap < TAX_LEVEL) return 20 + ((cap - SALARY_CAP) / (TAX_LEVEL - SALARY_CAP)) * 30;
  if (cap < FIRST_APRON) return 50 + ((cap - TAX_LEVEL) / (FIRST_APRON - TAX_LEVEL)) * 20;
  if (cap < SECOND_APRON) return 70 + ((cap - FIRST_APRON) / (SECOND_APRON - FIRST_APRON)) * 20;
  return 90 + Math.min(10, ((cap - SECOND_APRON) / 30) * 10);
};

const ROSTER_CATEGORIES = {
  'Shooting': '슈팅/득점',
  'Athleticism': '신체능력',
  'Playmaking': '핸들링/패스',
  'DefReb': '수비/리바운드'
};

const ROSTER_COLUMNS: Record<string, { key: keyof Player | string, label: string }[]> = {
  'Shooting': [
    { key: 'ins', label: 'INS' },
    { key: 'closeShot', label: 'CLS' },
    { key: 'layup', label: 'LAY' },
    { key: 'dunk', label: 'DNK' },
    { key: 'drawFoul', label: 'DRF' },
    { key: 'out', label: 'OUT' },
    { key: 'midRange', label: 'MID' },
    { key: 'threeCorner', label: '3PT' },
    { key: 'ft', label: 'FT' },
    { key: 'shotIq', label: 'SIQ' },
    { key: 'offConsist', label: 'OCN' },
  ],
  'Athleticism': [
    { key: 'ath', label: 'ATH' },
    { key: 'speed', label: 'SPD' },
    { key: 'agility', label: 'AGI' },
    { key: 'strength', label: 'STR' },
    { key: 'vertical', label: 'JMP' },
    { key: 'stamina', label: 'STA' },
    { key: 'durability', label: 'DUR' },
  ],
  'Playmaking': [
    { key: 'plm', label: 'PLM' },
    { key: 'handling', label: 'HDL' },
    { key: 'hands', label: 'HND' },
    { key: 'passAcc', label: 'PAS' },
    { key: 'passVision', label: 'VIS' },
    { key: 'passIq', label: 'IQ' },
  ],
  'DefReb': [
    { key: 'def', label: 'DEF' },
    { key: 'perDef', label: 'PER' },
    { key: 'intDef', label: 'INT' },
    { key: 'steal', label: 'STL' },
    { key: 'blk', label: 'BLK' },
    { key: 'hustle', label: 'HUS' },
    { key: 'passPerc', label: 'PRC' },
    { key: 'defConsist', label: 'DCN' },
    { key: 'reb', label: 'REB' },
    { key: 'offReb', label: 'ORB' },
    { key: 'defReb', label: 'DRB' },
  ]
};

const STATS_COLUMNS = [
  { key: 'g', label: 'GP' },
  { key: 'gs', label: 'GS' },
  { key: 'mp', label: 'MIN' },
  { key: 'pts', label: 'PTS' },
  { key: 'reb', label: 'REB' },
  { key: 'offReb', label: 'ORB' },
  { key: 'defReb', label: 'DRB' },
  { key: 'ast', label: 'AST' },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'tov', label: 'TOV' },
  { key: 'fgm', label: 'FGM' },
  { key: 'fga', label: 'FGA' },
  { key: 'fg%', label: 'FG%' },
  { key: 'p3m', label: '3PM' },
  { key: 'p3a', label: '3PA' },
  { key: '3p%', label: '3P%' },
  { key: 'ftm', label: 'FTM' },
  { key: 'fta', label: 'FTA' },
  { key: 'ft%', label: 'FT%' },
  { key: 'ts%', label: 'TS%' },
];

const SALARY_COLUMNS = [
  { key: 'ovr', label: 'OVR' },
  { key: 'age', label: 'AGE' },
  { key: 'salary', label: '연봉 ($M)' },
  { key: 'contractYears', label: '잔여계약' },
  { key: 'totalValue', label: '총 계약규모' },
];

const OFFENSE_TACTIC_INFO: Record<OffenseTactic, { label: string, desc: string }> = {
  'Balance': { label: '밸런스 오펜스', desc: '모든 공격 루트의 조화' },
  'PaceAndSpace': { label: '페이스 & 스페이스', desc: '공간 창출 및 캐치앤슛' },
  'PerimeterFocus': { label: '퍼리미터 포커스', desc: '픽앤롤 및 외곽 아이솔레이션' },
  'PostFocus': { label: '포스트 포커스', desc: '빅맨의 골밑 장악' },
  'Grind': { label: '그라인드', desc: '저득점 강제 및 에이스 집중' },
  'SevenSeconds': { label: '세븐 세컨즈', desc: '7초 이내 빠른 공격' }
};

const DEFENSE_TACTIC_INFO: Record<DefenseTactic, { label: string, desc: string }> = {
  'ManToManPerimeter': { label: '맨투맨', desc: '대인 방어 및 외곽 억제' },
  'ZoneDefense': { label: '지역 방어', desc: '지역 방어 및 골밑 보호' },
  'AceStopper': { label: '에이스 스토퍼', desc: '상대 주득점원 집중 견제' }
};

const ATTRIBUTE_TOOLTIPS: Record<string, string> = {
  'INS': '인사이드 스코어링 (골밑/포스트)',
  'CLS': '근거리 슛 (Close Shot)',
  'LAY': '레이업 (Layup)',
  'DNK': '덩크 (Dunk)',
  'DRF': '자유투 유도 (Draw Foul)',
  'OUT': '외곽 스코어링 (3점/중거리)',
  'MID': '중거리 슛 (Mid-Range)',
  '3PT': '3점 슛 (3-Point)',
  'FT': '자유투 (Free Throw)',
  'SIQ': '슛 셀렉션 (Shot IQ)',
  'OCN': '공격 기복 (Off Consistency)',
  'ATH': '운동능력 (Athleticism)',
  'SPD': '스피드 (Speed)',
  'AGI': '민첩성 (Agility)',
  'STR': '힘 (Strength)',
  'JMP': '점프력 (Vertical)',
  'STA': '체력 (Stamina)',
  'DUR': '내구성과 부상 저항 (Durability)',
  'PLM': '플레이메이킹 (핸들링/패스)',
  'HDL': '볼 핸들링 (Handling)',
  'HND': '볼 키핑/핸즈 (Hands)',
  'PAS': '패스 정확도 (Pass Accuracy)',
  'VIS': '패스 시야 (Vision)',
  'IQ': '농구 지능 (Pass IQ)',
  'DEF': '수비력 (Defense)',
  'PER': '퍼리미터 수비 (Perimeter Def)',
  'INT': '인사이드 수비 (Interior Def)',
  'STL': '스틸 (Steal)',
  'BLK': '블록 (Block)',
  'PRC': '패스 차단 (Pass Perception)',
  'DCN': '수비 기복 (Def Consistency)',
  'REB': '리바운드 (Rebounding)',
  'ORB': '공격 리바운드 (Off Reb)',
  'DRB': '수비 리바운드 (Def Reb)',
  'HUS': '허슬 (Hustle) - 루즈볼/박스아웃 참여도'
};

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
};

// Fixed TacticTable type errors by explicitly casting entries and stats
const TacticTable: React.FC<{ data: Record<string, TacticStatRecord>, labels: any, baseline?: TacticStatRecord }> = ({ data, labels, baseline }) => {
    const sorted = (Object.entries(data) as [string, TacticStatRecord][]).sort((a, b) => b[1].games - a[1].games);
    
    if (sorted.length === 0) return <div className="text-center text-slate-500 py-8 font-bold text-sm">아직 기록된 데이터가 없습니다.</div>;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950/30">
                        <th className="py-3 px-4 w-40 sticky left-0 bg-slate-950 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">Tactic Name</th>
                        <th className="py-3 px-2 text-right w-12">GP</th>
                        <th className="py-3 px-2 text-center w-16">W-L</th>
                        <th className="py-3 px-2 text-right w-16">Win%</th>
                        <th className="py-3 px-2 text-right w-16">PTS</th>
                        <th className="py-3 px-2 text-right w-16">PA</th>
                        <th className="py-3 px-2 text-right w-20">FGM/A</th>
                        <th className="py-3 px-2 text-right w-16">FG%</th>
                        <th className="py-3 px-2 text-right w-20">3PM/A</th>
                        <th className="py-3 px-2 text-right w-16">3P%</th>
                        <th className="py-3 px-2 text-right w-20">RIM M/A</th>
                        <th className="py-3 px-2 text-right w-16">RIM%</th>
                        <th className="py-3 px-2 text-right w-20">MID M/A</th>
                        <th className="py-3 px-2 text-right w-16">MID%</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                    {sorted.map(([key, stats]) => {
                        const s = stats as TacticStatRecord;
                        const winPct = (s.wins / s.games * 100).toFixed(1);
                        const avgPts = (s.ptsFor / s.games).toFixed(1);
                        const avgPa = (s.ptsAgainst / s.games).toFixed(1);
                        const label = labels[key]?.label || key;
                        
                        // Fix for NaN: Default undefined values to 0
                        const fgm = s.fgm || 0;
                        const fga = s.fga || 0;
                        const p3m = s.p3m || 0;
                        const p3a = s.p3a || 0;
                        const rimM = s.rimM || 0;
                        const rimA = s.rimA || 0;
                        const midM = s.midM || 0;
                        const midA = s.midA || 0;

                        const fgPct = fga > 0 ? ((fgm / fga) * 100).toFixed(1) + '%' : '0.0%';
                        const p3Pct = p3a > 0 ? ((p3m / p3a) * 100).toFixed(1) + '%' : '0.0%';
                        const rimPct = rimA > 0 ? ((rimM / rimA) * 100).toFixed(1) + '%' : '0.0%';
                        const midPct = midA > 0 ? ((midM / midA) * 100).toFixed(1) + '%' : '0.0%';

                        return (
                            <tr key={key} className="hover:bg-white/5 transition-colors">
                                <td className="py-3 px-4 font-bold text-slate-300 text-xs sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">{label}</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-slate-400">{s.games}</td>
                                <td className="py-3 px-2 text-center font-mono text-sm text-slate-300">{s.wins}-{s.games - s.wins}</td>
                                <td className={`py-3 px-2 text-right font-mono text-sm font-bold ${Number(winPct) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{winPct}%</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-white">{avgPts}</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-slate-400">{avgPa}</td>
                                <td className="py-3 px-2 text-right font-mono text-xs text-slate-500">{(fgm/s.games).toFixed(1)}/{(fga/s.games).toFixed(1)}</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-slate-300">{fgPct}</td>
                                <td className="py-3 px-2 text-right font-mono text-xs text-slate-500">{(p3m/s.games).toFixed(1)}/{(p3a/s.games).toFixed(1)}</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-slate-300">{p3Pct}</td>
                                <td className="py-3 px-2 text-right font-mono text-xs text-slate-500">{(rimM/s.games).toFixed(1)}/{(rimA/s.games).toFixed(1)}</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-slate-300">{rimPct}</td>
                                <td className="py-3 px-2 text-right font-mono text-xs text-slate-500">{(midM/s.games).toFixed(1)}/{(midA/s.games).toFixed(1)}</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-slate-300">{midPct}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// Fixed AceStopperTable type errors by explicitly typing the stats and baseline parameters
const AceStopperTable = ({ stats, baseline }: { stats: TacticStatRecord, baseline?: TacticStatRecord }) => {
    // Basic Calculations
    const gp = stats.games;
    const acePts = (stats.ptsAgainst / gp).toFixed(1); // ptsAgainst holds Ace Points for this tactic
    const aceTov = stats.tov ? (stats.tov / gp).toFixed(1) : '0.0';
    const fgPctVal = stats.fga > 0 ? (stats.fgm / stats.fga) : 0;
    const p3PctVal = stats.p3a > 0 ? (stats.p3m / stats.p3a) : 0;
    
    // Efficiency (FG% Reduction) Calculation
    // Baseline is usually ManToManPerimeter (Opponent Team Stats)
    // Comparing Ace FG% vs Opponent Team Avg FG%
    const baselineFgPct = baseline && baseline.fga > 0 ? (baseline.fgm / baseline.fga) : 0.475; 
    const diff = fgPctVal - baselineFgPct;
    const diffStr = (Math.abs(diff) * 100).toFixed(1) + '%';
    const isGood = diff < 0;

    return (
        <div className="overflow-x-auto mt-2">
            <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950/30">
                        <th className="py-3 px-4 w-40 sticky left-0 bg-slate-950 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">Tactic Name</th>
                        <th className="py-3 px-2 text-right w-12">GP</th>
                        <th className="py-3 px-2 text-right w-24">Ace PTS</th>
                        <th className="py-3 px-2 text-right w-24">Ace TOV</th>
                        <th className="py-3 px-2 text-right w-24">Ace FG%</th>
                        <th className="py-3 px-2 text-right w-24">Ace 3P%</th>
                        <th className="py-3 px-4 text-right w-24">Efficiency</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                    <tr className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4 font-bold text-fuchsia-400 text-xs sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">Ace Stopper</td>
                        <td className="py-3 px-2 text-right font-mono text-sm text-slate-400">{gp}</td>
                        <td className="py-3 px-2 text-right font-mono text-sm text-white">{acePts}</td>
                        <td className="py-3 px-2 text-right font-mono text-sm text-slate-300">{aceTov}</td>
                        <td className="py-3 px-2 text-right font-mono text-sm text-slate-300">{(fgPctVal * 100).toFixed(1)}%</td>
                        <td className="py-3 px-2 text-right font-mono text-sm text-slate-300">{(p3PctVal * 100).toFixed(1)}%</td>
                        <td className={`py-3 px-4 text-right font-mono text-sm font-bold ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isGood ? '-' : '+'}{diffStr}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || myTeamId);
  const [tab, setTab] = useState<'roster' | 'stats' | 'salary' | 'tactics'>('roster');
  const [rosterCategory, setRosterCategory] = useState<string>('Shooting');
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ovr', direction: 'desc' });

  // Player Detail Modal State
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (initialTeamId) {
        setSelectedTeamId(initialTeamId);
    }
  }, [initialTeamId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedTeam = allTeams.find(t => t.id === selectedTeamId);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getSortValue = (p: Player, key: string): number | string => {
    if (key === 'name') return p.name;
    if (key === 'salary') return p.salary;
    if (key === 'contractYears') return p.contractYears;
    if (key === 'totalValue') return p.salary * p.contractYears;
    if (key === 'ovr') return p.ovr;
    if (key === 'potential') return p.potential;
    if (key === 'age') return p.age;
    if (key === 'height') return p.height;
    if (key === 'weight') return p.weight;
    if (key === 'position') {
        const posOrder = { 'PG': 1, 'SG': 2, 'SF': 3, 'PF': 4, 'C': 5 };
        return posOrder[p.position] || 0;
    }

    if (tab === 'roster') {
        return (p[key as keyof Player] as number) || 0;
    } 
    
    if (tab === 'salary') {
        if (key === 'salary') return p.salary;
        if (key === 'contractYears') return p.contractYears;
        if (key === 'totalValue') return p.salary * p.contractYears;
        return (p[key as keyof Player] as number) || 0;
    }

    // Stats Tab sorting logic
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
    
    // Per Game Stats
    if (key in s) {
        return (s[key as keyof typeof s] as number) / g;
    }

    return 0;
  };
  
  const sortedRoster = useMemo(() => {
    if (!selectedTeam) return [];
    const roster = [...selectedTeam.roster];
    
    return roster.sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
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
    
    // Sums
    const totalSalary = roster.reduce((sum, p) => sum + p.salary, 0);
    const totalAge = roster.reduce((sum, p) => sum + p.age, 0);
    const totalOvr = roster.reduce((sum, p) => sum + p.ovr, 0);
    const totalPot = roster.reduce((sum, p) => sum + p.potential, 0);

    // Averages helper
    const getAvg = (key: keyof Player) => Math.round(roster.reduce((sum, p) => sum + (p[key] as number), 0) / count);
    
    // Stats Sums
    const totalStats = roster.reduce((acc, p) => {
        const s = p.stats;
        return {
            pts: acc.pts + s.pts,
            reb: acc.reb + s.reb,
            ast: acc.ast + s.ast,
            stl: acc.stl + s.stl,
            blk: acc.blk + s.blk,
            tov: acc.tov + s.tov,
            g: acc.g + s.g,
            fgm: acc.fgm + s.fgm,
            fga: acc.fga + s.fga,
            p3m: acc.p3m + s.p3m,
            p3a: acc.p3a + s.p3a,
            ftm: acc.ftm + s.ftm,
            fta: acc.fta + s.fta,
        };
    }, { pts:0, reb:0, ast:0, stl:0, blk:0, tov:0, g:0, fgm:0, fga:0, p3m:0, p3a:0, ftm:0, fta:0 });

    const safeCount = roster.filter(p=>p.stats.g > 0).length || 1;
    const avgStats = roster.reduce((acc, p) => {
        const g = p.stats.g || 1;
        return {
            pts: acc.pts + (p.stats.pts/g),
            reb: acc.reb + (p.stats.reb/g),
            offReb: acc.offReb + (p.stats.offReb/g),
            defReb: acc.defReb + (p.stats.defReb/g),
            ast: acc.ast + (p.stats.ast/g),
            stl: acc.stl + (p.stats.stl/g),
            blk: acc.blk + (p.stats.blk/g),
            tov: acc.tov + (p.stats.tov/g),
            fgm: acc.fgm + (p.stats.fgm/g),
            fga: acc.fga + (p.stats.fga/g),
            p3m: acc.p3m + (p.stats.p3m/g),
            p3a: acc.p3a + (p.stats.p3a/g),
            ftm: acc.ftm + (p.stats.ftm/g),
            fta: acc.fta + (p.stats.fta/g),
        };
    }, { pts:0, reb:0, offReb:0, defReb:0, ast:0, stl:0, blk:0, tov:0, fgm:0, fga:0, p3m:0, p3a:0, ftm:0, fta:0 });

    const totalTSA = totalStats.fga + 0.44 * totalStats.fta;

    return {
        salary: totalSalary,
        age: (totalAge / count).toFixed(1),
        ovr: Math.round(totalOvr / count),
        pot: Math.round(totalPot / count),
        getAvg,
        stats: {
            pts: (avgStats.pts / safeCount).toFixed(1),
            reb: (avgStats.reb / safeCount).toFixed(1),
            offReb: (avgStats.offReb / safeCount).toFixed(1),
            defReb: (avgStats.defReb / safeCount).toFixed(1),
            ast: (avgStats.ast / safeCount).toFixed(1),
            stl: (avgStats.stl / safeCount).toFixed(1),
            blk: (avgStats.blk / safeCount).toFixed(1),
            tov: (avgStats.tov / safeCount).toFixed(1),
            fgm: (avgStats.fgm / safeCount).toFixed(1),
            fga: (avgStats.fga / safeCount).toFixed(1),
            p3m: (avgStats.p3m / safeCount).toFixed(1),
            p3a: (avgStats.p3a / safeCount).toFixed(1),
            ftm: (avgStats.ftm / safeCount).toFixed(1),
            fta: (avgStats.fta / safeCount).toFixed(1),
            fgPct: totalStats.fga > 0 ? ((totalStats.fgm / totalStats.fga) * 100).toFixed(1) + '%' : '0.0%',
            p3Pct: totalStats.p3a > 0 ? ((totalStats.p3m / totalStats.p3a) * 100).toFixed(1) + '%' : '0.0%',
            ftPct: totalStats.fta > 0 ? ((totalStats.ftm / totalStats.fta) * 100).toFixed(1) + '%' : '0.0%',
            tsPct: totalTSA > 0 ? ((totalStats.pts / (2 * totalTSA)) * 100).toFixed(1) + '%' : '0.0%',
        }
    };
  }, [selectedTeam]);

  const SortHeader: React.FC<{ 
    label: string, 
    sortKey: string, 
    align?: 'left' | 'center' | 'right', 
    width?: string, 
    className?: string,
    tooltip?: string 
  }> = ({ label, sortKey, align = 'center', width, className, tooltip }) => (
    <th 
        className={`px-1 py-4 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-white/5 transition-colors group select-none relative ${className}`} 
        style={{ width, textAlign: align }}
        onClick={() => handleSort(sortKey)}
    >
        <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
            <div className="relative group/text">
                <span>{label}</span>
                {tooltip && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[200px] bg-slate-900 border border-slate-700 p-2.5 rounded-lg shadow-xl z-50 hidden group-hover/text:block pointer-events-none">
                        <span className="text-[10px] text-slate-300 font-bold whitespace-pre-wrap leading-tight text-center block">{tooltip}</span>
                        {/* Arrow pointing up */}
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

  const currentTotalSalary = teamStats?.salary || 0;
  const capStatus = getCapStatus(currentTotalSalary);
  const visualPercentage = getVisualPercentage(currentTotalSalary);

  // Prepare defense stats by separating AceStopper
  const defenseStats = selectedTeam.tacticHistory?.defense || {};
  const generalDefenseStats = Object.fromEntries(
      Object.entries(defenseStats).filter(([key]) => key !== 'AceStopper')
  );
  const aceStopperStats = defenseStats['AceStopper'];

  return (
    <div className="space-y-6 flex flex-col animate-in fade-in duration-500">
      {viewPlayer && selectedTeam && <PlayerDetailModal player={viewPlayer} teamName={selectedTeam.name} teamId={selectedTeam.id} onClose={() => setViewPlayer(null)} />}
      
      {/* Header with Team Selector */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-slate-800 pb-6 flex-shrink-0 relative z-30">
        <div>
           <div className="flex items-center gap-3">
             <h2 className="text-5xl font-black ko-tight text-slate-100 uppercase">팀 로스터</h2>
           </div>
        </div>
        
        <div className="flex items-center gap-3 relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-72 h-14 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl px-5 flex items-center justify-between transition-all shadow-lg group"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <img src={selectedTeam.logo} className="w-8 h-8 object-contain" alt={selectedTeam.name} />
                    <span className="font-bold text-white text-lg uppercase truncate leading-none mt-0.5">{selectedTeam.city} {selectedTeam.name}</span>
                </div>
                <ChevronDown size={20} className={`text-slate-500 transition-transform group-hover:text-white flex-shrink-0 ml-2 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50">
                    <div className="p-3 border-b border-slate-800 bg-slate-950/50">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input 
                                autoFocus
                                type="text" 
                                placeholder="팀 검색..." 
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-xs font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {filteredTeamsList.map(t => (
                            <button
                                key={t.id}
                                onClick={() => { setSelectedTeamId(t.id); setIsDropdownOpen(false); setSearchTerm(''); }}
                                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-800 transition-all group ${selectedTeamId === t.id ? 'bg-indigo-900/20' : ''}`}
                            >
                                <img src={t.logo} className="w-6 h-6 object-contain opacity-70 group-hover:opacity-100 transition-opacity" alt="" />
                                <span className={`text-sm font-bold uppercase truncate ${selectedTeamId === t.id ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}>{t.city} {t.name}</span>
                                {t.id === myTeamId && (
                                    <span className="ml-2 px-1.5 py-0.5 bg-red-600 text-[9px] font-black text-white rounded uppercase tracking-tighter shadow-sm">MY TEAM</span>
                                )}
                                {selectedTeamId === t.id && <CheckCircle2 size={16} className="ml-auto text-indigo-500 flex-shrink-0" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col gap-6 bg-slate-900/60 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl backdrop-blur-sm">
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
                        <button 
                            key={cat} 
                            onClick={() => setRosterCategory(cat)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all border ${rosterCategory === cat ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/50' : 'bg-transparent text-slate-500 border-slate-800 hover:border-slate-600'}`}
                        >
                            {ROSTER_CATEGORIES[cat as keyof typeof ROSTER_CATEGORIES]}
                        </button>
                    ))}
                 </div>
             )}
         </div>

         {/* Salary Level Scale (Visible only in Salary tab) */}
         {tab === 'salary' && teamStats && (
            <div className="px-4 py-8 space-y-8 bg-slate-950/40 rounded-3xl border border-slate-800 animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-6 flex-1">
                        <div className={`p-4 rounded-2xl border ${capStatus.bg} ${capStatus.border} shadow-lg`}>
                            <AlertCircle className={capStatus.color} size={32} />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-baseline gap-3">
                                <span className={`text-2xl font-black uppercase tracking-tight ${capStatus.color}`}>{capStatus.label}</span>
                                <span className="text-sm font-bold text-slate-500">총 연봉: ${currentTotalSalary.toFixed(1)}M</span>
                            </div>
                            <p className="text-sm font-medium text-slate-400 max-w-2xl">{capStatus.msg}</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="px-6 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-center min-w-[120px]">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">CAP SPACE</div>
                            <div className={`text-xl font-black oswald ${currentTotalSalary < SALARY_CAP ? 'text-emerald-400' : 'text-slate-600'}`}>
                                {currentTotalSalary < SALARY_CAP ? `$${(SALARY_CAP - currentTotalSalary).toFixed(1)}M` : '-'}
                            </div>
                        </div>
                        <div className="px-6 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-center min-w-[120px]">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">TAX GAP</div>
                            <div className={`text-xl font-black oswald ${currentTotalSalary < TAX_LEVEL ? 'text-blue-400' : 'text-red-500'}`}>
                                {currentTotalSalary < TAX_LEVEL ? `$${(TAX_LEVEL - currentTotalSalary).toFixed(1)}M` : `+$${(currentTotalSalary - TAX_LEVEL).toFixed(1)}M`}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-3 px-2">
                    <div className="relative h-5 w-full bg-slate-900 rounded-full border border-slate-800 overflow-hidden shadow-inner">
                        {/* Scale Background */}
                        <div className="absolute inset-0 flex h-full">
                            <div className="flex-[20] bg-emerald-500/5 border-r border-slate-800/50"></div>
                            <div className="flex-[30] bg-blue-500/5 border-r border-slate-800/50"></div>
                            <div className="flex-[20] bg-amber-500/5 border-r border-slate-800/50"></div>
                            <div className="flex-[20] bg-orange-500/5 border-r border-slate-800/50"></div>
                            <div className="flex-[10] bg-red-500/5"></div>
                        </div>
                        
                        {/* Progress Bar */}
                        <div 
                            className={`h-full transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(0,0,0,0.5)] relative z-10 ${capStatus.color.replace('text', 'bg')}`} 
                            style={{ width: `${visualPercentage}%` }} 
                        />

                        {/* Current Marker */}
                        <div 
                            className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_white] z-20"
                            style={{ left: `${visualPercentage}%`, transform: 'translateX(-50%)' }}
                        >
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45"></div>
                        </div>
                    </div>

                    <div className="flex text-[10px] font-black text-slate-500 uppercase tracking-widest relative h-8">
                        <div className="absolute" style={{ left: '0%' }}>$0</div>
                        <div className="absolute text-center group" style={{ left: '20%', transform: 'translateX(-50%)' }}>
                            <div className="text-slate-400 border-x border-slate-800 px-2">CAP: $140M</div>
                        </div>
                        <div className="absolute text-center" style={{ left: '50%', transform: 'translateX(-50%)' }}>
                            <div className="text-amber-500 border-x border-slate-800 px-2">TAX: $170M</div>
                        </div>
                        <div className="absolute text-center" style={{ left: '70%', transform: 'translateX(-50%)' }}>
                            <div className="text-orange-500 border-x border-slate-800 px-2">APR1: $178M</div>
                        </div>
                        <div className="absolute text-center" style={{ left: '90%', transform: 'translateX(-50%)' }}>
                            <div className="text-red-500 border-x border-slate-800 px-2">APR2: $189M</div>
                        </div>
                    </div>
                </div>
            </div>
         )}

         {/* Tactics Tab */}
         {tab === 'tactics' ? (
             <div className="flex flex-col gap-10 min-h-[400px]">
                 {selectedTeam.tacticHistory ? (
                     <>
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 px-2">
                                <Target size={20} className="text-orange-400" />
                                <h4 className="text-sm font-black uppercase text-slate-300 tracking-widest">Offensive Tactics Efficiency</h4>
                            </div>
                            <TacticTable data={selectedTeam.tacticHistory.offense} labels={OFFENSE_TACTIC_INFO} />
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 px-2">
                                <Shield size={20} className="text-blue-400" />
                                <h4 className="text-sm font-black uppercase text-slate-300 tracking-widest">Defensive Tactics Efficiency</h4>
                            </div>
                            <TacticTable data={generalDefenseStats} labels={DEFENSE_TACTIC_INFO} />
                            
                            {/* Ace Stopper Table attached below */}
                            {aceStopperStats && (
                                <AceStopperTable 
                                    stats={aceStopperStats} 
                                    baseline={generalDefenseStats['ManToManPerimeter']} 
                                />
                            )}
                        </div>
                     </>
                 ) : (
                     <div className="flex flex-col items-center justify-center h-full py-20 text-slate-500">
                         <ClipboardList size={48} className="mb-4 opacity-20" />
                         <p className="text-lg font-black uppercase tracking-widest">No Tactical Data</p>
                         <p className="text-xs font-bold mt-2">아직 기록된 전술 데이터가 없습니다.</p>
                     </div>
                 )}
             </div>
         ) : (
             <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse table-auto">
                   <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm z-20">
                      <tr className="border-b border-slate-800 text-slate-500">
                         <SortHeader label="Player Info" sortKey="name" align="left" width="200px" className="pl-8 px-6" />
                         {tab === 'roster' && (
                           <>
                             <SortHeader label="POS" sortKey="position" width="60px" />
                             <SortHeader label="AGE" sortKey="age" width="50px" />
                             <SortHeader label="Salary" sortKey="salary" width="80px" />
                             <SortHeader label="OVR" sortKey="ovr" width="60px" className="border-r-2 border-slate-700/60 pl-2" />
                           </>
                         )}
                         {tab === 'roster' ? (
                            ROSTER_COLUMNS[rosterCategory].map(col => (
                                <SortHeader 
                                    key={col.key} 
                                    label={col.label} 
                                    sortKey={col.key as string} 
                                    width="50px" 
                                    tooltip={ATTRIBUTE_TOOLTIPS[col.label]} 
                                    className={col.label === 'OUT' || col.label === 'REB' ? "border-l-2 border-slate-700/60 pl-2" : ""}
                                />
                            ))
                         ) : tab === 'stats' ? (
                            STATS_COLUMNS.map(col => (
                                <SortHeader key={col.key} label={col.label} sortKey={col.key} width="50px" align="right" className="pr-3" />
                            ))
                         ) : (
                            SALARY_COLUMNS.map(col => (
                                <SortHeader key={col.key} label={col.label} sortKey={col.key} width="120px" align="right" className="pr-3" />
                            ))
                         )}
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800/40">
                      {sortedRoster.map(p => (
                          <tr key={p.id} className="hover:bg-slate-800/30 transition-all group">
                              <td className="pl-8 px-6 py-3 cursor-pointer" onClick={() => setViewPlayer(p)}>
                                  <div className="flex items-center gap-3">
                                      <div className="flex flex-col min-w-0">
                                          <div className="flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                                              <span className="text-base font-black text-white truncate max-w-[160px] group-hover:text-indigo-400 decoration-indigo-500/50 underline-offset-4 group-hover:underline">{p.name}</span>
                                              {p.health === 'Injured' && (
                                                  <div className="group/tooltip relative">
                                                      <span className="px-1.5 py-0.5 bg-red-600 text-[9px] font-black text-white rounded uppercase cursor-help shadow-sm">OUT</span>
                                                      {p.returnDate && (
                                                          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-max bg-slate-900 border border-slate-700 p-2 rounded-lg shadow-xl text-[10px] text-slate-300 z-50 hidden group-hover/tooltip:flex items-center gap-2 pointer-events-none">
                                                              <CalendarClock size={12} className="text-red-400" />
                                                              <span>Return: <span className="text-white font-bold">{p.returnDate}</span></span>
                                                          </div>
                                                      )}
                                                  </div>
                                              )}
                                              {p.health === 'Day-to-Day' && (
                                                  <span className="px-1.5 py-0.5 bg-amber-600 text-[9px] font-black text-white rounded uppercase shadow-sm">DTD</span>
                                              )}
                                          </div>
                                      </div>
                                  </div>
                              </td>
                              {tab === 'roster' && (
                                <>
                                  <td className="px-2 py-3 text-center">
                                      <span className="text-sm font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800 uppercase tracking-tight">{p.position}</span>
                                  </td>
                                  <td className="px-2 py-3 text-center text-sm font-bold text-white">{p.age}</td>
                                  <td className="px-2 py-3 text-center text-sm font-bold text-white">${p.salary.toFixed(1)}M</td>
                                  <td className="px-1 py-3 text-center border-r-2 border-slate-700/60 pl-2">
                                    <div className={getOvrBadgeStyle(p.ovr) + " !w-9 !h-9 !text-lg !mx-auto cursor-help"} title="Overall Rating">{p.ovr}</div>
                                  </td>
                                </>
                              )}
                              {tab === 'roster' ? (
                                  ROSTER_COLUMNS[rosterCategory].map(col => {
                                      const val = p[col.key as keyof Player] as number;
                                      return (
                                          <td key={col.key} className={`px-0 py-2 align-middle text-center ${col.label === 'OUT' || col.label === 'REB' ? 'border-l-2 border-slate-700/60' : ''}`}>
                                              <div className={getRankStyle(val) + " !mx-auto"}>{val}</div>
                                          </td>
                                      );
                                  })
                              ) : tab === 'stats' ? (
                                  STATS_COLUMNS.map(col => {
                                      const k = col.key;
                                      const stats = p.stats;
                                      let valStr = '0.0';
                                      if (k === 'g' || k === 'gs') valStr = String(stats[k as keyof typeof stats]);
                                      else if (k === 'fg%' || k === '3p%' || k === 'ft%') {
                                          let n = 0, d = 0;
                                          if (k === 'fg%') { n = stats.fgm; d = stats.fga; }
                                          else if (k === '3p%') { n = stats.p3m; d = stats.p3a; }
                                          else if (k === 'ft%') { n = stats.ftm; d = stats.fta; }
                                          valStr = d > 0 ? ((n / d) * 100).toFixed(1) + '%' : '0.0%';
                                      } else if (k === 'ts%') {
                                          const tsa = stats.fga + 0.44 * stats.fta;
                                          valStr = tsa > 0 ? ((stats.pts / (2 * tsa)) * 100).toFixed(1) + '%' : '0.0%';
                                      } else {
                                          // Per Game stats
                                          const games = stats.g || 1;
                                          const total = stats[k as keyof typeof stats] as number;
                                          valStr = (total / games).toFixed(1);
                                      }
                                      return (
                                          <td key={k} className="px-1 py-2 align-middle text-right pr-3">
                                              <div className="h-9 flex items-center justify-end font-medium text-slate-300 text-sm tabular-nums">
                                                  {valStr}
                                              </div>
                                          </td>
                                      );
                                  })
                              ) : (
                                  SALARY_COLUMNS.map(col => {
                                      let valStr = '';
                                      if (col.key === 'ovr') {
                                          return (
                                              <td key={col.key} className="px-1 py-2 align-middle text-right pr-3">
                                                  <div className="flex items-center justify-end h-9">
                                                      <div className={getOvrBadgeStyle(p.ovr) + " !w-8 !h-8 !text-sm !mx-0"}>{p.ovr}</div>
                                                  </div>
                                              </td>
                                          );
                                      }
                                      if (col.key === 'age') valStr = String(p.age);
                                      else if (col.key === 'salary') valStr = `$${p.salary.toFixed(1)}M`;
                                      else if (col.key === 'contractYears') valStr = `${p.contractYears}년`;
                                      else if (col.key === 'totalValue') valStr = `$${(p.salary * p.contractYears).toFixed(1)}M`;

                                      return (
                                          <td key={col.key} className="px-1 py-2 align-middle text-right pr-3">
                                              <div className="h-9 flex items-center justify-end font-bold text-slate-300 text-sm tabular-nums">
                                                  {valStr}
                                              </div>
                                          </td>
                                      );
                                  })
                              )}
                          </tr>
                      ))}
                   </tbody>
                   {teamStats && (
                       <tfoot className="bg-slate-800/40 border-t-2 border-slate-700/50">
                           <tr>
                               <td className="pl-8 px-6 py-4 text-xs font-black text-indigo-400 uppercase tracking-widest">TEAM TOTAL</td>
                               {tab === 'roster' && (
                                 <>
                                   <td className="px-2 py-4 text-center text-xs font-bold text-slate-500">-</td>
                                   <td className="px-2 py-4 text-center text-sm font-bold text-white">{teamStats.age}</td>
                                   <td className="px-2 py-4 text-center font-mono font-black text-white text-sm">${teamStats.salary.toFixed(1)}M</td>
                                   <td className="px-1 py-4 text-center border-r-2 border-slate-700/60 pl-2">
                                       <div className={getOvrBadgeStyle(teamStats.ovr) + " !w-9 !h-9 !text-lg !mx-auto"}>{teamStats.ovr}</div>
                                   </td>
                                 </>
                               )}
                               {tab === 'roster' ? (
                                   ROSTER_COLUMNS[rosterCategory].map(col => {
                                       const avgVal = teamStats.getAvg(col.key as keyof Player);
                                       return (
                                           <td key={col.key} className={`px-0 py-2 align-middle text-center ${col.label === 'OUT' || col.label === 'REB' ? 'border-l-2 border-slate-700/40' : ''}`}>
                                               <div className={getRankStyle(avgVal) + " !mx-auto"}>{avgVal}</div>
                                           </td>
                                       )
                                   })
                               ) : tab === 'stats' ? (
                                   STATS_COLUMNS.map(col => {
                                       let val = '-';
                                       if (col.key === 'pts') val = teamStats.stats.pts;
                                       else if (col.key === 'reb') val = teamStats.stats.reb;
                                       else if (col.key === 'offReb') val = teamStats.stats.offReb;
                                       else if (col.key === 'defReb') val = teamStats.stats.defReb;
                                       else if (col.key === 'ast') val = teamStats.stats.ast;
                                       else if (col.key === 'stl') val = teamStats.stats.stl;
                                       else if (col.key === 'blk') val = teamStats.stats.blk;
                                       else if (col.key === 'tov') val = teamStats.stats.tov;
                                       else if (col.key === 'fgm') val = teamStats.stats.fgm;
                                       else if (col.key === 'fga') val = teamStats.stats.fga;
                                       else if (col.key === 'fg%') val = teamStats.stats.fgPct;
                                       else if (col.key === 'p3m') val = teamStats.stats.p3m;
                                       else if (col.key === 'p3a') val = teamStats.stats.p3a;
                                       else if (col.key === '3p%') val = teamStats.stats.p3Pct;
                                       else if (col.key === 'ftm') val = teamStats.stats.ftm;
                                       else if (col.key === 'fta') val = teamStats.stats.fta;
                                       else if (col.key === 'ft%') val = teamStats.stats.ftPct;
                                       else if (col.key === 'ts%') val = teamStats.stats.tsPct;
                                       return (
                                           <td key={col.key} className="px-1 py-2 align-middle text-right pr-3">
                                               <div className="h-9 flex items-center justify-end font-medium text-slate-300 text-sm">
                                                   {val}
                                               </div>
                                           </td>
                                       );
                                   })
                               ) : (
                                    SALARY_COLUMNS.map(col => {
                                        let val = '-';
                                        if (col.key === 'salary') val = `$${teamStats.salary.toFixed(1)}M`;
                                        return (
                                            <td key={col.key} className="px-1 py-2 align-middle text-right pr-3">
                                                <div className="h-9 flex items-center justify-end font-black text-indigo-400 text-sm">
                                                    {val}
                                                </div>
                                            </td>
                                        );
                                    })
                               )}
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

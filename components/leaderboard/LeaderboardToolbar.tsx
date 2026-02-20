
import React, { useState, useEffect, useRef } from 'react';
import { Filter, Calendar, X, Plus, ChevronDown, Table as TableIcon, Crosshair, Search, Check } from 'lucide-react';
import { Dropdown } from '../common/Dropdown';
import { TRADITIONAL_STAT_OPTIONS, SHOOTING_STAT_OPTIONS, ADVANCED_STAT_OPTIONS, OPPONENT_STAT_OPTIONS, FilterItem, ViewMode, StatCategory, Operator } from '../../data/leaderboardConfig';
import { Team } from '../../types';
import { TeamLogo } from '../common/TeamLogo';

interface LeaderboardToolbarProps {
    mode: ViewMode;
    setMode: (m: ViewMode) => void;
    statCategory: StatCategory;
    setStatCategory: (c: StatCategory) => void;
    activeFilters: FilterItem[];
    addFilter: (item: FilterItem) => void;
    removeFilter: (id: string) => void;
    clearFilters: () => void;
    showHeatmap: boolean;
    setShowHeatmap: (v: boolean) => void;
    teams: Team[];
    selectedTeams: string[];
    setSelectedTeams: (ids: string[]) => void;
    selectedPositions: string[];
    setSelectedPositions: (pos: string[]) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
}

export const LeaderboardToolbar: React.FC<LeaderboardToolbarProps> = ({
    mode, setMode, statCategory, setStatCategory,
    activeFilters, addFilter, removeFilter, clearFilters,
    showHeatmap, setShowHeatmap,
    teams, selectedTeams, setSelectedTeams,
    selectedPositions, setSelectedPositions,
    searchQuery, setSearchQuery
}) => {
    // Determine available options based on category
    let options = TRADITIONAL_STAT_OPTIONS;
    if (statCategory === 'Shooting') options = SHOOTING_STAT_OPTIONS;
    else if (statCategory === 'Advanced') options = ADVANCED_STAT_OPTIONS;
    else if (statCategory === 'Opponent') options = OPPONENT_STAT_OPTIONS;

    const defaultOption = options[0]?.value || '';

    // Local state for filter inputs
    const [filterCat, setFilterCat] = useState(defaultOption);
    const [filterOp, setFilterOp] = useState<Operator>('>=');
    const [filterVal, setFilterVal] = useState('');
    
    // Dropdown states
    const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
    const [isPosDropdownOpen, setIsPosDropdownOpen] = useState(false);

    // Refs & positions for fixed-positioned dropdowns (overflow-x-auto 컨테이너 클리핑 우회)
    const teamBtnRef = useRef<HTMLButtonElement>(null);
    const posBtnRef = useRef<HTMLButtonElement>(null);
    const [teamDropdownPos, setTeamDropdownPos] = useState({ top: 0, right: 0 });
    const [posDropdownPos, setPosDropdownPos] = useState({ top: 0, right: 0 });

    const handleTeamDropdownToggle = () => {
        if (!isTeamDropdownOpen && teamBtnRef.current) {
            const rect = teamBtnRef.current.getBoundingClientRect();
            setTeamDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        }
        setIsTeamDropdownOpen(v => !v);
    };

    const handlePosDropdownToggle = () => {
        if (!isPosDropdownOpen && posBtnRef.current) {
            const rect = posBtnRef.current.getBoundingClientRect();
            setPosDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        }
        setIsPosDropdownOpen(v => !v);
    };

    // Reset filter cat when options change
    useEffect(() => {
        setFilterCat(defaultOption);
    }, [statCategory, defaultOption]);

    const handleAddStatFilter = () => {
        if (!filterVal) return;
        const catLabel = options.find(o => o.value === filterCat)?.label || filterCat;
        addFilter({
            id: Date.now().toString(),
            type: 'stat',
            category: filterCat,
            operator: filterOp,
            value: parseFloat(filterVal),
            label: `${catLabel} ${filterOp} ${filterVal}`
        });
        setFilterVal('');
    };

    const toggleTeam = (teamId: string) => {
        if (selectedTeams.includes(teamId)) {
            setSelectedTeams(selectedTeams.filter(id => id !== teamId));
        } else {
            setSelectedTeams([...selectedTeams, teamId]);
        }
    };

    const togglePosition = (pos: string) => {
        if (selectedPositions.includes(pos)) {
            setSelectedPositions(selectedPositions.filter(p => p !== pos));
        } else {
            setSelectedPositions([...selectedPositions, pos]);
        }
    };

    const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

    // Category Items
    const categoryItems = [
        { id: 'Traditional', label: 'Traditional', onClick: () => setStatCategory('Traditional'), active: statCategory === 'Traditional' },
        { id: 'Shooting', label: 'Shooting', onClick: () => setStatCategory('Shooting'), active: statCategory === 'Shooting' },
        { id: 'Advanced', label: 'Advanced', onClick: () => setStatCategory('Advanced'), active: statCategory === 'Advanced' },
    ];

    if (mode === 'Teams') {
        categoryItems.push({ id: 'Opponent', label: 'Opponent', onClick: () => setStatCategory('Opponent'), active: statCategory === 'Opponent' });
    }

    return (
        <div className="flex flex-col border-b border-slate-800 bg-slate-900">
            <div className="px-6 py-4 flex flex-col xl:flex-row items-center gap-6">
                
                {/* Left Group: Breadcrumb Style Selectors */}
                <div className="flex items-center gap-2">
                    <Dropdown 
                        trigger={
                           <button className="flex items-center gap-1 text-base font-black text-white uppercase tracking-tight hover:text-indigo-400 transition-colors group">
                               <span>{mode}</span>
                               <ChevronDown size={14} className="text-slate-600 group-hover:text-indigo-400 mt-0.5" />
                           </button>
                        }
                        items={[
                            { id: 'Players', label: 'Players', onClick: () => { setMode('Players'); if(statCategory === 'Opponent') setStatCategory('Traditional'); }, active: mode === 'Players' },
                            { id: 'Teams', label: 'Teams', onClick: () => setMode('Teams'), active: mode === 'Teams' }
                        ]}
                        width="w-32"
                        align="left"
                    />

                    <span className="text-slate-700 text-base font-light">/</span>

                    <Dropdown 
                        trigger={
                           <button className="flex items-center gap-1 text-base font-black text-slate-400 uppercase tracking-tight hover:text-white transition-colors group">
                               <span>{statCategory}</span>
                               <ChevronDown size={14} className="text-slate-600 group-hover:text-white mt-0.5" />
                           </button>
                        }
                        items={categoryItems}
                        width="w-48"
                        align="left"
                    />
                </div>

                {/* Right Group: Filters & Toggles */}
                <div className="flex flex-col md:flex-row items-center gap-3 flex-1 overflow-x-auto w-full xl:w-auto xl:justify-end">
                    
                    {/* Search Input */}
                    <div className="relative h-[36px] bg-slate-950 rounded-lg border border-slate-800 shadow-sm shrink-0 w-48">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                            <Search size={14} />
                        </div>
                        <input 
                            type="text" 
                            placeholder="Search Name..." 
                            className="h-full w-full bg-transparent pl-9 pr-3 text-xs font-bold text-white outline-none placeholder:text-slate-600"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* Team Filter Dropdown */}
                    <div className="relative">
                        <button
                            ref={teamBtnRef}
                            className={`flex items-center gap-2 h-[36px] px-3 bg-slate-950 rounded-lg border shadow-sm text-xs font-bold transition-colors ${selectedTeams.length > 0 ? 'border-indigo-500/50 text-indigo-400' : 'border-slate-800 text-slate-400 hover:text-white'}`}
                            onClick={handleTeamDropdownToggle}
                        >
                            <span>Teams</span>
                            {selectedTeams.length > 0 && (
                                <span className="bg-indigo-600 text-white text-[9px] px-1.5 py-0.5 rounded-full">{selectedTeams.length}</span>
                            )}
                            <ChevronDown size={12} />
                        </button>

                        {isTeamDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-[100]" onClick={() => setIsTeamDropdownOpen(false)} />
                                <div
                                    className="fixed w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-[101] animate-in fade-in zoom-in-95 duration-150"
                                    style={{ top: teamDropdownPos.top, right: teamDropdownPos.right }}
                                >
                                    <div className="p-2 max-h-80 overflow-y-auto custom-scrollbar space-y-1">
                                        {teams.map(team => (
                                            <div
                                                key={team.id}
                                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                                                onClick={() => toggleTeam(team.id)}
                                            >
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedTeams.includes(team.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
                                                    {selectedTeams.includes(team.id) && <Check size={10} className="text-white" />}
                                                </div>
                                                <TeamLogo teamId={team.id} size="sm" />
                                                <span className={`text-xs font-bold ${selectedTeams.includes(team.id) ? 'text-white' : 'text-slate-400'}`}>{team.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Position Filter Dropdown (Only for Players mode) */}
                    {mode === 'Players' && (
                        <div className="relative">
                            <button
                                ref={posBtnRef}
                                className={`flex items-center gap-2 h-[36px] px-3 bg-slate-950 rounded-lg border shadow-sm text-xs font-bold transition-colors ${selectedPositions.length > 0 ? 'border-indigo-500/50 text-indigo-400' : 'border-slate-800 text-slate-400 hover:text-white'}`}
                                onClick={handlePosDropdownToggle}
                            >
                                <span>Positions</span>
                                {selectedPositions.length > 0 && (
                                    <span className="bg-indigo-600 text-white text-[9px] px-1.5 py-0.5 rounded-full">{selectedPositions.length}</span>
                                )}
                                <ChevronDown size={12} />
                            </button>

                            {isPosDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-[100]" onClick={() => setIsPosDropdownOpen(false)} />
                                    <div
                                        className="fixed w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-[101] animate-in fade-in zoom-in-95 duration-150"
                                        style={{ top: posDropdownPos.top, right: posDropdownPos.right }}
                                    >
                                        <div className="p-2 space-y-1">
                                            {POSITIONS.map(pos => (
                                                <div
                                                    key={pos}
                                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                                                    onClick={() => togglePosition(pos)}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedPositions.includes(pos) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
                                                        {selectedPositions.includes(pos) && <Check size={10} className="text-white" />}
                                                    </div>
                                                    <span className={`text-xs font-bold ${selectedPositions.includes(pos) ? 'text-white' : 'text-slate-400'}`}>{pos}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Heatmap Toggle (Container Style) */}
                    <div 
                        className="flex items-center justify-between gap-3 h-[36px] bg-slate-950 rounded-lg border border-slate-800 shadow-sm px-3 cursor-pointer group select-none hover:border-slate-700 transition-colors shrink-0" 
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        title="스탯 분포 색상 표시"
                    >
                        <div className={`text-xs font-bold transition-colors ${showHeatmap ? 'text-indigo-400' : 'text-slate-500'}`}>
                            Color Scale
                        </div>
                        <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${showHeatmap ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${showHeatmap ? 'right-0.5' : 'left-0.5'}`} />
                        </div>
                    </div>

                    {/* Stat Filter */}
                    <div className="flex items-center h-[36px] bg-slate-950 rounded-lg border border-slate-800 shadow-sm shrink-0">
                        <div className="px-3 flex items-center justify-center border-r border-slate-800 h-full text-slate-500">
                            <Filter size={14} />
                        </div>
                        <div className="relative h-full border-r border-slate-800">
                            <select 
                                className="h-full bg-transparent pl-3 pr-7 text-xs font-bold text-white outline-none cursor-pointer appearance-none hover:bg-slate-900 transition-colors w-32"
                                value={filterCat}
                                onChange={(e) => setFilterCat(e.target.value)}
                            >
                                {options.map(opt => <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-300">{opt.label}</option>)}
                            </select>
                            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                        </div>
                        <div className="relative h-full border-r border-slate-800">
                            <select 
                                className="h-full bg-transparent px-2 text-xs font-bold text-indigo-400 outline-none cursor-pointer appearance-none text-center hover:bg-slate-900 transition-colors w-12"
                                value={filterOp}
                                onChange={(e) => setFilterOp(e.target.value as Operator)}
                            >
                                {['>=', '<=', '>', '<', '='].map(op => <option key={op} value={op} className="bg-slate-900 text-slate-300">{op}</option>)}
                            </select>
                        </div>
                        <input 
                            type="number" 
                            placeholder="Value" 
                            className="h-full bg-transparent px-3 w-16 text-xs font-bold text-white outline-none placeholder:text-slate-700 [&::-webkit-inner-spin-button]:appearance-none"
                            value={filterVal}
                            onChange={(e) => setFilterVal(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddStatFilter()}
                        />
                        <button onClick={handleAddStatFilter} className="h-full px-3 flex items-center justify-center border-l border-slate-800 text-slate-500 hover:text-white hover:bg-indigo-600/20 transition-all rounded-r-lg">
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Active Filter Chips */}
            {activeFilters.length > 0 && (
                <>
                    <div className="h-px bg-slate-800/60 mx-6 mb-3"></div>
                    <div className="px-6 pb-3 flex flex-wrap gap-2 animate-in slide-in-from-top-2">
                        {activeFilters.map(filter => (
                            <div key={filter.id} className="flex items-center gap-2 px-3 py-1 bg-indigo-900/30 border border-indigo-500/30 rounded-full text-xs font-bold text-indigo-300">
                                <span>{filter.label}</span>
                                <button onClick={() => removeFilter(filter.id)} className="hover:text-white transition-colors"><X size={12} /></button>
                            </div>
                        ))}
                        <button onClick={clearFilters} className="text-xs font-bold text-slate-500 hover:text-red-400 underline decoration-slate-700 underline-offset-2 transition-colors ml-2">모두 제거</button>
                    </div>
                </>
            )}
        </div>
    );
};


import React, { useState } from 'react';
import { Filter, Calendar, X, Plus, ChevronDown, Table as TableIcon, Crosshair } from 'lucide-react';
import { Dropdown } from '../common/Dropdown';
import { STAT_OPTIONS, FilterItem, ViewMode, StatCategory, Operator } from '../../data/leaderboardConfig';

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
}

export const LeaderboardToolbar: React.FC<LeaderboardToolbarProps> = ({
    mode, setMode, statCategory, setStatCategory,
    activeFilters, addFilter, removeFilter, clearFilters,
    showHeatmap, setShowHeatmap
}) => {
    // Local state for filter inputs
    const [filterCat, setFilterCat] = useState('pts');
    const [filterOp, setFilterOp] = useState<Operator>('>=');
    const [filterVal, setFilterVal] = useState('');
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');

    const handleAddStatFilter = () => {
        if (!filterVal) return;
        const catLabel = STAT_OPTIONS.find(o => o.value === filterCat)?.label || filterCat;
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

    const handleAddDateFilter = () => {
        if (!dateStart || !dateEnd) return;
        addFilter({
            id: Date.now().toString(),
            type: 'date',
            value: JSON.stringify({ start: dateStart, end: dateEnd }),
            label: `${dateStart} ~ ${dateEnd}`
        });
        setDateStart('');
        setDateEnd('');
    };

    return (
        <div className="flex flex-col border-b border-slate-800 bg-slate-900">
            <div className="px-6 py-4 flex flex-col xl:flex-row items-center gap-6">
                
                {/* Left Group: View Modes */}
                <div className="flex items-center gap-3">
                    <Dropdown 
                        trigger={
                           <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl hover:border-indigo-500/50 transition-all shadow-sm group min-w-[140px] justify-between">
                               <div className="flex items-center gap-2">
                                   <TableIcon size={16} className="text-indigo-400" />
                                   <span className="text-xs font-bold text-white uppercase tracking-wider">{mode === 'Players' ? 'VIEW: Players' : 'VIEW: Teams'}</span>
                               </div>
                               <ChevronDown size={14} className="text-slate-500 group-hover:text-white" />
                           </button>
                        }
                        items={[
                            { id: 'Players', label: 'Players', onClick: () => setMode('Players'), active: mode === 'Players' },
                            { id: 'Teams', label: 'Teams', onClick: () => setMode('Teams'), active: mode === 'Teams' }
                        ]}
                        width="w-40"
                        align="left"
                    />

                    <Dropdown 
                        trigger={
                           <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl hover:border-indigo-500/50 transition-all shadow-sm group min-w-[160px] justify-between">
                               <div className="flex items-center gap-2">
                                   <Crosshair size={16} className={statCategory === 'Shooting' ? "text-orange-400" : "text-slate-400"} />
                                   <span className="text-xs font-bold text-white uppercase tracking-wider">{statCategory} Stats</span>
                               </div>
                               <ChevronDown size={14} className="text-slate-500 group-hover:text-white" />
                           </button>
                        }
                        items={[
                            { id: 'Traditional', label: 'Traditional (General)', onClick: () => setStatCategory('Traditional'), active: statCategory === 'Traditional' },
                            { id: 'Shooting', label: 'Shooting (Zones)', onClick: () => setStatCategory('Shooting'), active: statCategory === 'Shooting' }
                        ]}
                        width="w-48"
                        align="left"
                    />
                </div>

                {/* Filter Inputs */}
                <div className="flex flex-col md:flex-row items-center gap-4 flex-1 overflow-x-auto w-full xl:w-auto xl:justify-end">
                    
                    {/* Stat Filter */}
                    <div className="flex items-center h-[42px] bg-slate-950 rounded-xl border border-slate-700/50 shadow-sm shrink-0">
                        <div className="px-3 flex items-center justify-center border-r border-slate-700/50 h-full text-slate-500">
                            <Filter size={16} />
                        </div>
                        <div className="relative h-full border-r border-slate-700/50">
                            <select 
                                className="h-full bg-transparent pl-3 pr-7 text-sm font-medium text-white outline-none cursor-pointer appearance-none hover:bg-slate-800/30 transition-colors w-28"
                                value={filterCat}
                                onChange={(e) => setFilterCat(e.target.value)}
                            >
                                {STAT_OPTIONS.map(opt => <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-300">{opt.label}</option>)}
                            </select>
                            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        </div>
                        <div className="relative h-full border-r border-slate-700/50">
                            <select 
                                className="h-full bg-transparent px-2 text-sm font-medium text-indigo-400 outline-none cursor-pointer appearance-none text-center hover:bg-slate-800/30 transition-colors w-14"
                                value={filterOp}
                                onChange={(e) => setFilterOp(e.target.value as Operator)}
                            >
                                {['>=', '<=', '>', '<', '='].map(op => <option key={op} value={op} className="bg-slate-900 text-slate-300">{op}</option>)}
                            </select>
                        </div>
                        <input 
                            type="number" 
                            placeholder="Value" 
                            className="h-full bg-transparent px-3 w-20 text-sm font-medium text-white outline-none placeholder:text-slate-600 [&::-webkit-inner-spin-button]:appearance-none"
                            value={filterVal}
                            onChange={(e) => setFilterVal(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddStatFilter()}
                        />
                        <button onClick={handleAddStatFilter} className="h-full px-3 flex items-center justify-center border-l border-slate-700/50 text-slate-400 hover:text-white hover:bg-indigo-600/20 transition-all rounded-r-xl">
                            <Plus size={16} />
                        </button>
                    </div>

                    {/* Date Filter */}
                    <div className="flex items-center h-[42px] bg-slate-950 rounded-xl border border-slate-700/50 shadow-sm shrink-0">
                        <div className="px-3 flex items-center justify-center border-r border-slate-700/50 h-full text-slate-500">
                            <Calendar size={16} />
                        </div>
                        <div className="flex items-center h-full">
                            <input 
                                type="date" 
                                className="h-full bg-transparent px-3 text-sm font-medium text-white outline-none w-32 [&::-webkit-calendar-picker-indicator]:hidden"
                                value={dateStart}
                                onChange={(e) => setDateStart(e.target.value)}
                            />
                            <span className="text-slate-600 text-sm px-1">~</span>
                            <input 
                                type="date" 
                                className="h-full bg-transparent px-3 text-sm font-medium text-white outline-none w-32 [&::-webkit-calendar-picker-indicator]:hidden"
                                value={dateEnd}
                                onChange={(e) => setDateEnd(e.target.value)}
                            />
                        </div>
                        <button onClick={handleAddDateFilter} className="h-full px-3 flex items-center justify-center border-l border-slate-700/50 text-slate-400 hover:text-white hover:bg-indigo-600/20 transition-all rounded-r-xl">
                            <Plus size={16} />
                        </button>
                    </div>

                    {/* Heatmap Toggle */}
                    <div 
                        className="flex items-center gap-3 cursor-pointer group select-none shrink-0 ml-2" 
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        title="스탯 분포 색상 표시"
                    >
                          <div className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${showHeatmap ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                              <div className={`absolute top-1 bottom-1 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${showHeatmap ? 'left-6' : 'left-1'}`} />
                          </div>
                          <div className={`text-sm font-medium transition-colors ${showHeatmap ? 'text-indigo-400' : 'text-slate-500'}`}>
                              <span className="hidden md:inline">색상 스케일</span>
                          </div>
                    </div>
                </div>
            </div>

            {/* Active Filter Chips */}
            {activeFilters.length > 0 && (
                <div className="px-6 pb-3 flex flex-wrap gap-2 animate-in slide-in-from-top-2">
                    {activeFilters.map(filter => (
                        <div key={filter.id} className="flex items-center gap-2 px-3 py-1 bg-indigo-900/30 border border-indigo-500/30 rounded-full text-xs font-bold text-indigo-300">
                            <span>{filter.label}</span>
                            <button onClick={() => removeFilter(filter.id)} className="hover:text-white transition-colors"><X size={12} /></button>
                        </div>
                    ))}
                    <button onClick={clearFilters} className="text-sm font-bold text-slate-500 hover:text-red-400 underline decoration-slate-700 underline-offset-2 transition-colors ml-2">모두 삭제</button>
                </div>
            )}
        </div>
    );
};

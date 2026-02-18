
import React, { useState, useEffect } from 'react';
import { Filter, Calendar, X, Plus, ChevronDown, Table as TableIcon, Crosshair } from 'lucide-react';
import { Dropdown } from '../common/Dropdown';
import { TRADITIONAL_STAT_OPTIONS, SHOOTING_STAT_OPTIONS, FilterItem, ViewMode, StatCategory, Operator } from '../../data/leaderboardConfig';

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
    // Determine available options based on category
    const options = statCategory === 'Traditional' ? TRADITIONAL_STAT_OPTIONS : SHOOTING_STAT_OPTIONS;
    const defaultOption = options[0].value;

    // Local state for filter inputs
    const [filterCat, setFilterCat] = useState(defaultOption);
    const [filterOp, setFilterOp] = useState<Operator>('>=');
    const [filterVal, setFilterVal] = useState('');
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');

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
                            { id: 'Players', label: 'Players', onClick: () => setMode('Players'), active: mode === 'Players' },
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
                        items={[
                            { id: 'Traditional', label: 'Traditional (General)', onClick: () => setStatCategory('Traditional'), active: statCategory === 'Traditional' },
                            { id: 'Shooting', label: 'Shooting (Zones)', onClick: () => setStatCategory('Shooting'), active: statCategory === 'Shooting' }
                        ]}
                        width="w-48"
                        align="left"
                    />
                </div>

                {/* Right Group: Filters & Toggles */}
                <div className="flex flex-col md:flex-row items-center gap-3 flex-1 overflow-x-auto w-full xl:w-auto xl:justify-end">
                    
                    {/* Heatmap Toggle (Container Style) */}
                    <div 
                        className="flex items-center justify-between gap-3 h-[36px] bg-slate-950 rounded-lg border border-slate-800 shadow-sm px-3 cursor-pointer group select-none hover:border-slate-700 transition-colors shrink-0" 
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        title="스탯 분포 색상 표시"
                    >
                        <div className={`text-xs font-bold transition-colors ${showHeatmap ? 'text-indigo-400' : 'text-slate-500'}`}>
                            색상 스케일
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

                    {/* Date Filter (Disabled removed logic here, but UI kept if revived later or just remove entirely if not used) */}
                    {/* For now, removing date filter from UI as per previous instructions to disable it, but if it needs to be there visibly but non-functional, uncomment below.
                        Currently removing it to match previous step's cleanup. */}
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

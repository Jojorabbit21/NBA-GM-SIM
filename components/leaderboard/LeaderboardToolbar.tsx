
import React, { useState, useEffect, useRef } from 'react';
import { Filter, Calendar, X, Plus, ChevronDown, Table as TableIcon, Crosshair, Search, Check, RefreshCw } from 'lucide-react';
import { Dropdown } from '../common/Dropdown';
import { TRADITIONAL_STAT_OPTIONS, SHOOTING_STAT_OPTIONS, ADVANCED_STAT_OPTIONS, DEFENSE_STAT_OPTIONS, OPPONENT_STAT_OPTIONS, ATTRIBUTES_STAT_OPTIONS, TEAM_DEFENSE_STAT_OPTIONS, TEAM_ATTRIBUTES_STAT_OPTIONS, FilterItem, ViewMode, StatCategory, Operator } from '../../data/leaderboardConfig';
import { Team } from '../../types';
import { SeasonType } from '../../hooks/useLeaderboardData';
import { TeamBadge } from '../common/TeamBadge';

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
    seasonType: SeasonType;
    setSeasonType: (t: SeasonType) => void;
    hideSeasonType?: boolean;
    /** 캐시된(stale할 수 있는) 데이터를 수동으로 다시 불러오는 버튼 — 제공된 경우에만 렌더링(멀티플레이어 리더보드 전용, 싱글플레이어는 미전달). */
    onRefresh?: () => void;
    refreshing?: boolean;
}

export const LeaderboardToolbar: React.FC<LeaderboardToolbarProps> = ({
    mode, setMode, statCategory, setStatCategory,
    activeFilters, addFilter, removeFilter, clearFilters,
    showHeatmap, setShowHeatmap,
    teams, selectedTeams, setSelectedTeams,
    selectedPositions, setSelectedPositions,
    searchQuery, setSearchQuery,
    seasonType, setSeasonType, hideSeasonType = false,
    onRefresh, refreshing = false,
}) => {
    // Determine available options based on category
    let options = TRADITIONAL_STAT_OPTIONS;
    if (statCategory === 'Shooting') options = SHOOTING_STAT_OPTIONS;
    else if (statCategory === 'Advanced') options = ADVANCED_STAT_OPTIONS;
    else if (statCategory === 'Defense') options = mode === 'Teams' ? TEAM_DEFENSE_STAT_OPTIONS : DEFENSE_STAT_OPTIONS;
    else if (statCategory === 'Opponent') options = OPPONENT_STAT_OPTIONS;
    else if (statCategory === 'Attributes') options = mode === 'Teams' ? TEAM_ATTRIBUTES_STAT_OPTIONS : ATTRIBUTES_STAT_OPTIONS;

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

    const MODE_LABELS: Record<ViewMode, string> = { Players: '선수', Teams: '팀' };
    const CATEGORY_LABELS: Record<StatCategory, string> = { Traditional: '기본', Shooting: '슈팅', Advanced: '어드밴스드', Defense: '수비', Attributes: '능력치', Opponent: '상대팀' };

    // Category Items — 라벨을 text-sm으로 감싸서 공용 Dropdown.tsx(text-xs)의 기본 크기를
    // 오버라이드(자식 요소 자체 클래스가 상속값을 이기므로 다른 Dropdown 사용처엔 영향 없음).
    const categoryItems = [
        { id: 'Traditional', label: <span className="text-sm">기본</span>, onClick: () => setStatCategory('Traditional'), active: statCategory === 'Traditional' },
        { id: 'Shooting', label: <span className="text-sm">슈팅</span>, onClick: () => setStatCategory('Shooting'), active: statCategory === 'Shooting' },
        { id: 'Advanced', label: <span className="text-sm">어드밴스드</span>, onClick: () => setStatCategory('Advanced'), active: statCategory === 'Advanced' },
    ];

    categoryItems.push({ id: 'Defense', label: <span className="text-sm">수비</span>, onClick: () => setStatCategory('Defense'), active: statCategory === 'Defense' });
    categoryItems.push({ id: 'Attributes', label: <span className="text-sm">능력치</span>, onClick: () => setStatCategory('Attributes'), active: statCategory === 'Attributes' });
    if (mode === 'Teams') {
        categoryItems.push({ id: 'Opponent', label: <span className="text-sm">상대팀</span>, onClick: () => setStatCategory('Opponent'), active: statCategory === 'Opponent' });
    }

    return (
        <div className="flex flex-col border-b border-slate-800 bg-slate-900">
            <div className="px-6 py-4 flex flex-col xl:flex-row items-center gap-6">
                
                {/* Left Group: Breadcrumb Style Selectors + Search */}
                <div className="flex items-center gap-3">
                    <Dropdown
                        trigger={
                           <button className="flex items-center gap-1 text-lg font-black text-white uppercase tracking-tight hover:text-indigo-400 transition-colors group">
                               <span>{MODE_LABELS[mode]}</span>
                               <ChevronDown size={14} className="text-slate-600 group-hover:text-indigo-400 mt-0.5" />
                           </button>
                        }
                        items={[
                            { id: 'Players', label: <span className="text-sm">선수</span>, onClick: () => { setMode('Players'); if(statCategory === 'Opponent') setStatCategory('Traditional'); }, active: mode === 'Players' },
                            { id: 'Teams', label: <span className="text-sm">팀</span>, onClick: () => setMode('Teams'), active: mode === 'Teams' }
                        ]}
                        width="w-32"
                        align="left"
                    />

                    <span className="text-slate-700 text-lg font-light">/</span>

                    <Dropdown
                        trigger={
                           <button className="flex items-center gap-1 text-lg font-black text-slate-400 uppercase tracking-tight hover:text-white transition-colors group">
                               <span>{CATEGORY_LABELS[statCategory]}</span>
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
                    <div className="relative h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm shrink-0 w-48">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                            <Search size={14} />
                        </div>
                        <input
                            type="text"
                            placeholder="이름으로 검색"
                            className="h-full w-full bg-transparent pl-9 pr-3 text-sm font-bold text-white outline-none placeholder:text-slate-600"
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
                            className={`flex items-center gap-2 h-[36px] px-3 bg-slate-950 rounded-lg border shadow-sm text-sm font-bold transition-colors ${selectedTeams.length > 0 ? 'border-indigo-500/50 text-indigo-400' : 'border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white'}`}
                            onClick={handleTeamDropdownToggle}
                        >
                            <span>팀</span>
                            {selectedTeams.length > 0 && (
                                <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full">{selectedTeams.length}</span>
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
                                        <div
                                            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                                            onClick={() => {
                                                if (selectedTeams.length === teams.length) {
                                                    setSelectedTeams([]);
                                                } else {
                                                    setSelectedTeams(teams.map(t => t.id));
                                                }
                                            }}
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedTeams.length === teams.length ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
                                                {selectedTeams.length === teams.length && <Check size={10} className="text-white" />}
                                            </div>
                                            <span className={`text-sm font-bold ${selectedTeams.length === teams.length ? 'text-white' : 'text-slate-400'}`}>모두 선택</span>
                                        </div>
                                        <div className="h-px bg-slate-800 mx-2 my-1" />
                                        {[...teams].sort((a, b) => a.id.localeCompare(b.id)).map(team => (
                                            <div
                                                key={team.id}
                                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                                                onClick={() => toggleTeam(team.id)}
                                            >
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedTeams.includes(team.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
                                                    {selectedTeams.includes(team.id) && <Check size={10} className="text-white" />}
                                                </div>
                                                <TeamBadge
                                                    teamId={team.id}
                                                    abbr={team.abbr}
                                                    colorPrimary={team.colorPrimary}
                                                    colorSecondary={team.colorSecondary}
                                                    size="sm"
                                                />
                                                <span className={`text-sm font-bold ${selectedTeams.includes(team.id) ? 'text-white' : 'text-slate-400'}`}>{team.name}</span>
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
                                className={`flex items-center gap-2 h-[36px] px-3 bg-slate-950 rounded-lg border shadow-sm text-sm font-bold transition-colors ${selectedPositions.length > 0 ? 'border-indigo-500/50 text-indigo-400' : 'border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white'}`}
                                onClick={handlePosDropdownToggle}
                            >
                                <span>포지션</span>
                                {selectedPositions.length > 0 && (
                                    <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full">{selectedPositions.length}</span>
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
                                            <div
                                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                                                onClick={() => {
                                                    if (selectedPositions.length === POSITIONS.length) {
                                                        setSelectedPositions([]);
                                                    } else {
                                                        setSelectedPositions([...POSITIONS]);
                                                    }
                                                }}
                                            >
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedPositions.length === POSITIONS.length ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
                                                    {selectedPositions.length === POSITIONS.length && <Check size={10} className="text-white" />}
                                                </div>
                                                <span className={`text-sm font-bold ${selectedPositions.length === POSITIONS.length ? 'text-white' : 'text-slate-400'}`}>모두 선택</span>
                                            </div>
                                            <div className="h-px bg-slate-800 mx-2 my-1" />
                                            {POSITIONS.map(pos => (
                                                <div
                                                    key={pos}
                                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                                                    onClick={() => togglePosition(pos)}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedPositions.includes(pos) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
                                                        {selectedPositions.includes(pos) && <Check size={10} className="text-white" />}
                                                    </div>
                                                    <span className={`text-sm font-bold ${selectedPositions.includes(pos) ? 'text-white' : 'text-slate-400'}`}>{pos}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Stat Filter */}
                    <div className="flex items-center h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm shrink-0">
                        <div className="px-3 flex items-center justify-center border-r border-slate-800 h-full text-slate-500">
                            <Filter size={14} />
                        </div>
                        <div className="border-r border-slate-800">
                            <Dropdown
                                trigger={
                                    <button className="h-[36px] px-3 flex items-center gap-1.5 text-sm font-bold text-white transition-colors whitespace-nowrap">
                                        <span className="max-w-[96px] truncate">{options.find(o => o.value === filterCat)?.label ?? filterCat}</span>
                                        <ChevronDown size={12} className="text-slate-600 shrink-0" />
                                    </button>
                                }
                                items={options.map(opt => ({
                                    id: opt.value,
                                    label: <span className="text-sm">{opt.label}</span>,
                                    onClick: () => setFilterCat(opt.value),
                                    active: filterCat === opt.value,
                                }))}
                                width="w-48"
                                align="left"
                            />
                        </div>
                        <div className="border-r border-slate-800">
                            <Dropdown
                                trigger={
                                    <button className="h-[36px] px-3 flex items-center text-sm font-bold text-indigo-400 transition-colors whitespace-nowrap">
                                        {filterOp}
                                    </button>
                                }
                                items={['>=', '<=', '>', '<', '='].map(op => ({
                                    id: op,
                                    label: <span className="text-sm">{op}</span>,
                                    onClick: () => setFilterOp(op as Operator),
                                    active: filterOp === op,
                                }))}
                                width="w-16"
                                align="left"
                            />
                        </div>
                        <input
                            type="number"
                            placeholder="값"
                            className="h-full bg-transparent px-3 w-16 text-sm font-bold text-white outline-none placeholder:text-slate-700 [&::-webkit-inner-spin-button]:appearance-none"
                            value={filterVal}
                            onChange={(e) => setFilterVal(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddStatFilter()}
                        />
                        <button onClick={handleAddStatFilter} className="h-full px-3 flex items-center justify-center border-l border-slate-800 text-slate-500 hover:text-white hover:bg-indigo-600/20 transition-all rounded-r-lg">
                            <Plus size={14} />
                        </button>
                    </div>

                    {/* Heatmap Toggle (Container Style) */}
                    <div
                        className="flex items-center justify-between gap-3 h-[36px] bg-slate-950 rounded-lg border border-slate-800 shadow-sm px-3 cursor-pointer group select-none hover:border-slate-700 transition-colors shrink-0"
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        title="스탯 분포 색상 표시"
                    >
                        <div className={`text-sm font-bold transition-colors ${showHeatmap ? 'text-indigo-400' : 'text-slate-500'}`}>
                            색상 스케일
                        </div>
                        <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${showHeatmap ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${showHeatmap ? 'right-0.5' : 'left-0.5'}`} />
                        </div>
                    </div>

                    {/* Season Type Toggle — 토너먼트 리그에서는 숨김 */}
                    {!hideSeasonType && (
                    <div
                        className="flex items-center gap-3 h-[36px] bg-slate-950 rounded-lg border border-slate-800 shadow-sm px-3 cursor-pointer group select-none hover:border-slate-700 transition-colors shrink-0"
                        onClick={() => setSeasonType(seasonType === 'regular' ? 'playoff' : 'regular')}
                        title="정규시즌 / 플레이오프 전환"
                    >
                        <div className={`text-sm font-bold transition-colors ${seasonType === 'regular' ? 'text-indigo-400' : 'text-slate-500'}`}>
                            정규시즌
                        </div>
                        <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${seasonType === 'playoff' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${seasonType === 'playoff' ? 'right-0.5' : 'left-0.5'}`} />
                        </div>
                        <div className={`text-sm font-bold transition-colors ${seasonType === 'playoff' ? 'text-indigo-400' : 'text-slate-500'}`}>
                            플레이오프
                        </div>
                    </div>
                    )}

                    {/* Manual Refresh — staleTime 동안 캐시된 데이터를 보여주다가, 최신 경기 결과를
                        바로 반영하고 싶을 때 수동으로 강제 갱신 */}
                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            disabled={refreshing}
                            className="flex items-center justify-center h-[36px] w-[36px] bg-slate-950 rounded-lg border border-slate-800 shadow-sm text-slate-400 hover:text-white hover:border-slate-700 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="최신 데이터로 새로고침"
                        >
                            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        </button>
                    )}
                </div>
            </div>

            {/* Active Filter Chips */}
            {activeFilters.length > 0 && (
                <>
                    <div className="h-px bg-slate-800/60 mx-6 mb-3"></div>
                    <div className="px-6 pb-3 flex flex-wrap gap-2 animate-in slide-in-from-top-2">
                        {activeFilters.map(filter => (
                            <div key={filter.id} className="flex items-center gap-2 px-3 py-1 bg-indigo-900/30 border border-indigo-500/30 rounded-full text-sm font-bold text-indigo-300">
                                <span>{filter.label}</span>
                                <button onClick={() => removeFilter(filter.id)} className="hover:text-white transition-colors"><X size={12} /></button>
                            </div>
                        ))}
                        <button onClick={clearFilters} className="text-sm font-bold text-slate-500 hover:text-red-400 underline decoration-slate-700 underline-offset-2 transition-colors ml-2">모두 제거</button>
                    </div>
                </>
            )}
        </div>
    );
};


import React from 'react';
import { Calendar, X, ChevronDown, Table as TableIcon, Crosshair, Search, RefreshCw } from 'lucide-react';
import { Dropdown } from '../common/Dropdown';
import { TRADITIONAL_STAT_OPTIONS, SHOOTING_STAT_OPTIONS, ADVANCED_STAT_OPTIONS, DEFENSE_STAT_OPTIONS, OPPONENT_STAT_OPTIONS, ATTRIBUTES_STAT_OPTIONS, TEAM_DEFENSE_STAT_OPTIONS, TEAM_ATTRIBUTES_STAT_OPTIONS, FilterItem, ViewMode, StatCategory } from '../../data/leaderboardConfig';
import { Team } from '../../types';
import { SeasonType } from '../../hooks/useLeaderboardData';
import { TeamMark } from '../common/TeamMark';
import { IconButton } from '../common/IconButton';
import { CheckboxFilterDropdown } from '../common/filters/CheckboxFilterDropdown';
import { StatFilterBar, FilterChips, type StatFilterDraft } from '../common/filters/StatFilterBar';

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

    const handleAddStatFilter = (draft: StatFilterDraft) => {
        addFilter({ id: Date.now().toString(), type: 'stat', ...draft });
    };

    // 팀 옵션 — 배지 + 팀명, id 오름차순
    const teamOptions = [...teams].sort((a, b) => a.id.localeCompare(b.id)).map(team => ({
        value: team.id,
        label: team.name,
        icon: <TeamMark variant="logo" teamId={team.id} size="sm" />,
    }));

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
                           <button className="flex items-center gap-1 text-lg font-black text-white tracking-tight hover:text-indigo-400 transition-colors group">
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
                           <button className="flex items-center gap-1 text-lg font-black text-slate-400 tracking-tight hover:text-white transition-colors group">
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
                            <IconButton label="검색어 지우기" size="xs" tone="ghost" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                                <X size={12} />
                            </IconButton>
                        )}
                    </div>

                    <CheckboxFilterDropdown label="팀" options={teamOptions} selected={selectedTeams} onChange={setSelectedTeams} width="w-64" />

                    {mode === 'Players' && (
                        <CheckboxFilterDropdown label="포지션" options={POSITIONS} selected={selectedPositions} onChange={setSelectedPositions} />
                    )}

                    <StatFilterBar options={options} onAdd={handleAddStatFilter} />

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

            <FilterChips chips={activeFilters} onRemove={removeFilter} onClear={clearFilters} inset="px-6" />
        </div>
    );
};

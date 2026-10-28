
import React, { useState, useRef, useEffect } from 'react';
import { Team, Player, Game } from '../types';
import { BarChart2 } from 'lucide-react';
import { useLeaderboardData, SeasonType } from '../hooks/useLeaderboardData';
import { LeaderboardToolbar } from '../components/leaderboard/LeaderboardToolbar';
import { LeaderboardTable } from '../components/leaderboard/LeaderboardTable';
import { Pagination } from '../components/common/Pagination';
import { ViewMode, StatCategory, FilterItem } from '../data/leaderboardConfig';
import type { TeamAdvancedStatsMap } from '../hooks/useTeamSeasonAdvancedStats';
import { useIsPhone } from '../hooks/useViewportClass';
import { PhoneLeaderboard } from '../components/leaderboard/PhoneLeaderboard';

export interface LeaderboardFilterState {
  mode: ViewMode;
  statCategory: StatCategory;
  sortConfig: { key: string; direction: 'asc' | 'desc' };
  activeFilters: FilterItem[];
  selectedTeams: string[];
  selectedPositions: string[];
  searchQuery: string;
  seasonType: SeasonType;
  showHeatmap: boolean;
  currentPage: number;
  itemsPerPage: number;
}

interface LeaderboardViewProps {
  teams: Team[];
  schedule?: Game[];
  tendencySeed?: string;
  onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
  onTeamClick?: (teamId: string) => void;
  savedState?: LeaderboardFilterState | null;
  onStateChange?: (state: LeaderboardFilterState) => void;
  hideSeasonType?: boolean;
  /** 캐시된 데이터를 수동으로 다시 불러오는 버튼 — 제공된 경우에만 렌더링(멀티플레이어 전용). */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** 선수 이름 hover 시 능력치+스탯 팝업 표시 — 멀티플레이어 전용 기능이라 지정된 경우에만 켜짐. */
  enableHoverCard?: boolean;
  /** 0경기 선수도 표시(경기가 하나도 진행되지 않은 멀티리그 리더보드용). 기본 false(기존 동작 유지). */
  includeZeroGamePlayers?: boolean;
  /** 멀티 전용 — 팀 어드밴스드 스탯 RPC 결과(시즌 구분별). useLeaderboardData의 teamAdvanced 참고. */
  teamAdvancedRegular?: TeamAdvancedStatsMap;
  teamAdvancedPlayoff?: TeamAdvancedStatsMap;
  /** [2026-10-28] 폰 H4 헤더의 뒤로 — 호출부(멀티)가 라우터 back을 넘긴다 */
  onBack?: () => void;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ teams, schedule = [], tendencySeed, onViewPlayer, onTeamClick, savedState, onStateChange, hideSeasonType = false, onRefresh, refreshing = false, enableHoverCard = false, includeZeroGamePlayers = false, teamAdvancedRegular, teamAdvancedPlayoff, onBack }) => {
  const [mode, setMode] = useState<ViewMode>(savedState?.mode ?? 'Players');
  const [statCategory, setStatCategory] = useState<StatCategory>(savedState?.statCategory ?? 'Traditional');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>(savedState?.sortConfig ?? { key: 'pts', direction: 'desc' });
  const [itemsPerPage, setItemsPerPage] = useState(savedState?.itemsPerPage ?? 50);

  // Reset sort key when category changes to Attributes
  const handleStatCategoryChange = (cat: StatCategory) => {
      setStatCategory(cat);
      setCurrentPage(1);
      if (cat === 'Attributes') {
          setSortConfig({ key: 'ovr', direction: 'desc' });
      }
  };
  const [currentPage, setCurrentPage] = useState(savedState?.currentPage ?? 1);
  const [showHeatmap, setShowHeatmap] = useState(savedState?.showHeatmap ?? true);
  const [activeFilters, setActiveFilters] = useState<FilterItem[]>(savedState?.activeFilters ?? []);

  // New Filter States
  const [selectedTeams, setSelectedTeams] = useState<string[]>(savedState?.selectedTeams ?? []);
  const [selectedPositions, setSelectedPositions] = useState<string[]>(savedState?.selectedPositions ?? []);
  const [searchQuery, setSearchQuery] = useState(savedState?.searchQuery ?? '');
  const [seasonType, setSeasonType] = useState<SeasonType>(savedState?.seasonType ?? 'regular');
  const pageBeforeSearchRef = useRef<number | null>(null);

  // Sync filter state to parent ref for persistence across navigations
  useEffect(() => {
      onStateChange?.({ mode, statCategory, sortConfig, activeFilters, selectedTeams, selectedPositions, searchQuery, seasonType, showHeatmap, currentPage, itemsPerPage });
  }, [mode, statCategory, sortConfig, activeFilters, selectedTeams, selectedPositions, searchQuery, seasonType, showHeatmap, currentPage, itemsPerPage]);

  // --- Filter Handlers ---
  const addFilter = (item: FilterItem) => {
      // If date filter, remove existing one
      let newFilters = [...activeFilters];
      if (item.type === 'date') {
          newFilters = newFilters.filter(f => f.type !== 'date');
      }
      setActiveFilters([...newFilters, item]);
  };

  const removeFilter = (id: string) => {
      setActiveFilters(activeFilters.filter(f => f.id !== id));
  };

  // --- Data Hook ---
  const { sortedData, statRanges } = useLeaderboardData(
      teams,
      schedule,
      activeFilters,
      sortConfig,
      mode,
      selectedTeams,
      selectedPositions,
      searchQuery,
      statCategory,
      seasonType,
      includeZeroGamePlayers,
      seasonType === 'playoff' ? teamAdvancedPlayoff : teamAdvancedRegular,
  );

  // --- Pagination ---
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const currentData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleItemsPerPageChange = (val: number) => {
      setItemsPerPage(val);
      setCurrentPage(1);
  };
  const handlePageChange = (page: number) => {
      setCurrentPage(page);
      window.scrollTo(0, 0);
  };

  // --- Sorting Handler ---
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
        direction = 'asc';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  // --- View Handler ---
  const handleRowClick = (item: any) => {
      if (mode === 'Players') {
          const p = item as Player & { teamName: string, teamId: string };
          // 리더보드 훅이 stats를 덮어쓰므로 원본 Player 객체를 찾아서 전달
          const originalPlayer = teams.flatMap(t => t.roster).find(r => r.id === p.id);
          onViewPlayer(originalPlayer || p, p.teamId, p.teamName);
      } else if (mode === 'Teams' && onTeamClick) {
          const t = item as Team;
          onTeamClick(t.id);
      }
  };

  const handleModeChange = (newMode: ViewMode) => {
      setMode(newMode);
      setCurrentPage(1);
      // Reset sort to sensible default
      setSortConfig({ key: newMode === 'Players' ? 'pts' : 'wins', direction: 'desc' });
      // Reset filters that don't apply
      if (newMode === 'Teams') {
          setSelectedPositions([]);
          if (statCategory === 'Attributes') setStatCategory('Traditional');
      }
  };

  const isPhone = useIsPhone();
  const clearAll = () => {
      setActiveFilters([]);
      setSelectedTeams([]);
      setSelectedPositions([]);
      setSearchQuery('');
  };
  if (isPhone) {
      // [2026-10-28] 폰(<768, docs/ui/mobile-design-system.md §9-1-12) — 상태·훅은 위 그대로, 셸만 PhoneLeaderboard. 표는 LeaderboardTable 폰 분기.
      return (
          <PhoneLeaderboard
              mode={mode} setMode={handleModeChange}
              statCategory={statCategory} setStatCategory={handleStatCategoryChange}
              teams={teams}
              selectedTeams={selectedTeams} setSelectedTeams={setSelectedTeams}
              selectedPositions={selectedPositions} setSelectedPositions={setSelectedPositions}
              searchQuery={searchQuery} setSearchQuery={(q: string) => { setSearchQuery(q); setCurrentPage(1); }}
              seasonType={seasonType} setSeasonType={setSeasonType} hideSeasonType={hideSeasonType}
              showHeatmap={showHeatmap} setShowHeatmap={setShowHeatmap}
              activeFilters={activeFilters} addFilter={addFilter} removeFilter={removeFilter} clearFilters={clearAll}
              onRefresh={onRefresh} refreshing={refreshing}
              itemsPerPage={itemsPerPage} onItemsPerPageChange={handleItemsPerPageChange}
              onBack={onBack}
              table={(
                  <LeaderboardTable
                      data={currentData} mode={mode} statCategory={statCategory} sortConfig={sortConfig} onSort={handleSort}
                      onRowClick={handleRowClick} statRanges={statRanges} showHeatmap={showHeatmap}
                      currentPage={currentPage} itemsPerPage={itemsPerPage} enableHoverCard={false}
                  />
              )}
              pagination={<Pagination compact page={currentPage} pageSize={itemsPerPage} totalItems={sortedData.length} onPageChange={handlePageChange} />}
          />
      );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 ko-normal overflow-hidden">
      {/* Toolbar (sticky top) */}
      <div className="flex-shrink-0">
          <LeaderboardToolbar
              mode={mode}
              setMode={handleModeChange}
              statCategory={statCategory}
              setStatCategory={handleStatCategoryChange}
              activeFilters={activeFilters}
              addFilter={addFilter}
              removeFilter={removeFilter}
              clearFilters={() => {
                  setActiveFilters([]);
                  setSelectedTeams([]);
                  setSelectedPositions([]);
                  setSearchQuery('');
              }}
              showHeatmap={showHeatmap}
              setShowHeatmap={setShowHeatmap}
              teams={teams}
              selectedTeams={selectedTeams}
              setSelectedTeams={setSelectedTeams}
              selectedPositions={selectedPositions}
              setSelectedPositions={setSelectedPositions}
              seasonType={seasonType}
              setSeasonType={setSeasonType}
              hideSeasonType={hideSeasonType}
              onRefresh={onRefresh}
              refreshing={refreshing}
              searchQuery={searchQuery}
              setSearchQuery={(q: string) => {
                  if (q && !searchQuery) {
                      pageBeforeSearchRef.current = currentPage;
                  }
                  setSearchQuery(q);
                  if (!q && pageBeforeSearchRef.current) {
                      setCurrentPage(pageBeforeSearchRef.current);
                      pageBeforeSearchRef.current = null;
                  } else if (q) {
                      setCurrentPage(1);
                  }
              }}
          />
      </div>

      {/* Table Area (fills remaining space) */}
      <div className="flex-1 min-h-0 overflow-hidden">
          <LeaderboardTable
              data={currentData}
              mode={mode}
              statCategory={statCategory}
              sortConfig={sortConfig}
              onSort={handleSort}
              onRowClick={handleRowClick}
              statRanges={statRanges}
              showHeatmap={showHeatmap}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              enableHoverCard={enableHoverCard}
          />
      </div>

      <Pagination
          page={currentPage}
          pageSize={itemsPerPage}
          totalItems={sortedData.length}
          onPageChange={handlePageChange}
          onPageSizeChange={handleItemsPerPageChange}
      />
    </div>
  );
};

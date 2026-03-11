
import React, { useState, useRef, useEffect } from 'react';
import { Team, Player, Game } from '../types';
import { BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLeaderboardData, SeasonType } from '../hooks/useLeaderboardData';
import { LeaderboardToolbar } from '../components/leaderboard/LeaderboardToolbar';
import { LeaderboardTable } from '../components/leaderboard/LeaderboardTable';
import { ViewMode, StatCategory, FilterItem } from '../data/leaderboardConfig';

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
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ teams, schedule = [], tendencySeed, onViewPlayer, onTeamClick, savedState, onStateChange }) => {
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
      seasonType
  );

  // --- Pagination ---
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const currentData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleItemsPerPageChange = (val: number) => {
      setItemsPerPage(val);
      setCurrentPage(1);
  };

  const getPageNumbers = (): (number | '...')[] => {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
      const left = Math.max(2, currentPage - 2);
      const right = Math.min(totalPages - 1, currentPage + 2);
      const pages: (number | '...')[] = [1];
      if (left > 2) pages.push('...');
      for (let i = left; i <= right; i++) pages.push(i);
      if (right < totalPages - 1) pages.push('...');
      pages.push(totalPages);
      return pages;
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
          />
      </div>

      {/* Pagination Footer */}
      <div className="relative flex items-center px-6 py-3 bg-slate-950 border-t border-slate-800 flex-shrink-0 z-50">
              {/* Left: Showing info */}
              <div className="text-xs font-bold text-slate-500 w-48">
                  Showing {sortedData.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length}
              </div>

              {/* Center: Page buttons */}
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
                  <button
                      onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0); }}
                      disabled={currentPage === 1}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                      <ChevronLeft size={14} />
                  </button>

                  {getPageNumbers().map((page, idx) =>
                      page === '...'
                          ? <span key={`ellipsis-${idx}`} className="w-7 text-center text-xs text-slate-600 font-bold select-none">··</span>
                          : <button
                              key={page}
                              onClick={() => { setCurrentPage(page); window.scrollTo(0, 0); }}
                              className={`w-7 h-7 text-xs font-bold rounded-lg transition-all ${
                                  currentPage === page
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                              }`}
                          >
                              {page}
                          </button>
                  )}

                  <button
                      onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo(0, 0); }}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                      <ChevronRight size={14} />
                  </button>
              </div>

              {/* Right: Items per page */}
              <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Rows</span>
                  <select
                      value={itemsPerPage}
                      onChange={e => handleItemsPerPageChange(Number(e.target.value))}
                      className="bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                      {[25, 50, 75, 100].map(n => (
                          <option key={n} value={n}>{n}</option>
                      ))}
                  </select>
              </div>
          </div>
    </div>
  );
};

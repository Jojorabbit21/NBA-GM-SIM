
import React, { useState } from 'react';
import { Team, Player, Game } from '../types';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { calculatePlayerOvr } from '../utils/constants';
import { useLeaderboardData } from '../hooks/useLeaderboardData';
import { LeaderboardToolbar } from '../components/leaderboard/LeaderboardToolbar';
import { LeaderboardTable } from '../components/leaderboard/LeaderboardTable';
import { ViewMode, StatCategory, FilterItem } from '../data/leaderboardConfig';

interface LeaderboardViewProps {
  teams: Team[];
  schedule?: Game[];
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ teams, schedule = [] }) => {
  const [mode, setMode] = useState<ViewMode>('Players');
  const [statCategory, setStatCategory] = useState<StatCategory>('Traditional');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'pts', direction: 'desc' });
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Reset sort key when category changes to Attributes
  const handleStatCategoryChange = (cat: StatCategory) => {
      setStatCategory(cat);
      setCurrentPage(1);
      if (cat === 'Attributes') {
          setSortConfig({ key: 'ovr', direction: 'desc' });
      }
  };
  const [currentPage, setCurrentPage] = useState(1);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [activeFilters, setActiveFilters] = useState<FilterItem[]>([]);
  
  // New Filter States
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

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
      searchQuery
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
          // Re-calculate OVR to ensure freshness if needed, though usually passed in item
          setViewPlayer(p);
      }
      // For Teams, maybe navigate to roster? (Future implementation)
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
      {viewPlayer && (
        <PlayerDetailModal
            player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}}
            teamName={(viewPlayer as any).teamName}
            teamId={(viewPlayer as any).teamId}
            onClose={() => setViewPlayer(null)}
            allTeams={teams}
        />
      )}

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
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
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
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
                              onClick={() => setCurrentPage(page)}
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
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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

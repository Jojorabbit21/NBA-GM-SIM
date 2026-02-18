
import React, { useState } from 'react';
import { Team, Player, Game } from '../types';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { calculatePlayerOvr } from '../utils/constants';
import { PageHeader } from '../components/common/PageHeader';
import { useLeaderboardData } from '../hooks/useLeaderboardData';
import { LeaderboardToolbar } from '../components/leaderboard/LeaderboardToolbar';
import { LeaderboardTable } from '../components/leaderboard/LeaderboardTable';
import { ViewMode, StatCategory, FilterItem } from '../data/leaderboardConfig';

interface LeaderboardViewProps {
  teams: Team[];
  schedule?: Game[];
}

const ITEMS_PER_PAGE = 50;

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ teams, schedule = [] }) => {
  const [mode, setMode] = useState<ViewMode>('Players');
  const [statCategory, setStatCategory] = useState<StatCategory>('Traditional');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'pts', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [activeFilters, setActiveFilters] = useState<FilterItem[]>([]);

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
      mode
  );

  // --- Pagination ---
  const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE);
  const currentData = sortedData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

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
  };

  return (
    <div className="flex flex-col animate-in fade-in duration-500 ko-normal gap-6 pb-20">
      {viewPlayer && (
        <PlayerDetailModal 
            player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} 
            teamName={(viewPlayer as any).teamName} 
            teamId={(viewPlayer as any).teamId} 
            onClose={() => setViewPlayer(null)} 
            allTeams={teams} 
        />
      )}
      
      <PageHeader 
        title="리그 리더보드" 
        description={mode === 'Players' ? "2025-26 시즌 선수별 주요 스탯 랭킹" : "2025-26 시즌 팀별 평균 기록"}
        icon={<BarChart2 size={24} />}
      />

      {/* Main Content Wrapper (Card Style) */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
          
          <LeaderboardToolbar 
              mode={mode}
              setMode={handleModeChange}
              statCategory={statCategory}
              setStatCategory={setStatCategory}
              activeFilters={activeFilters}
              addFilter={addFilter}
              removeFilter={removeFilter}
              clearFilters={() => setActiveFilters([])}
              showHeatmap={showHeatmap}
              setShowHeatmap={setShowHeatmap}
          />

          {/* Table Area (Auto Height) */}
          <div className="w-full">
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
                  itemsPerPage={ITEMS_PER_PAGE}
              />
          </div>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-t border-slate-800 shadow-[0_-4px_10px_rgba(0,0,0,0.2)] flex-shrink-0 z-50">
              <div className="text-xs font-bold text-slate-500">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, sortedData.length)} of {sortedData.length}
              </div>
              
              <div className="flex gap-2">
                  <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                      <ChevronLeft size={16} />
                  </button>
                  
                  <div className="flex items-center gap-1 px-2">
                      <span className="text-sm font-black text-white">{currentPage}</span>
                      <span className="text-xs font-bold text-slate-600">/</span>
                      <span className="text-xs font-bold text-slate-500">{totalPages}</span>
                  </div>

                  <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                      <ChevronRight size={16} />
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
};

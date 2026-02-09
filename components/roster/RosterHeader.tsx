
import React from 'react';
import { Search, ChevronDown, CheckCircle2 } from 'lucide-react';
import { Team } from '../../types';
import { TeamLogo } from '../common/TeamLogo';

interface RosterHeaderProps {
  selectedTeam: Team;
  myTeamId: string;
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredTeamsList: Team[];
  onSelectTeam: (id: string) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

export const RosterHeader: React.FC<RosterHeaderProps> = ({
  selectedTeam,
  myTeamId,
  isDropdownOpen,
  setIsDropdownOpen,
  searchTerm,
  setSearchTerm,
  filteredTeamsList,
  onSelectTeam,
  dropdownRef
}) => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-slate-800 pb-6 flex-shrink-0 relative z-30">
      <div>
        <h2 className="text-5xl font-black ko-tight text-slate-100 uppercase">팀 로스터</h2>
      </div>
      
      <div className="flex items-center gap-3 relative" ref={dropdownRef}>
        <button 
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-72 h-14 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl px-5 flex items-center justify-between transition-all shadow-lg group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <TeamLogo teamId={selectedTeam.id} size="md" />
            <span className="font-bold text-white text-lg uppercase truncate mt-0.5">{selectedTeam.city} {selectedTeam.name}</span>
          </div>
          <ChevronDown size={20} className={`text-slate-500 transition-transform group-hover:text-white ${isDropdownOpen ? 'rotate-180' : ''}`} />
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 transition-all"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {filteredTeamsList.map(t => (
                <button
                  key={t.id}
                  onClick={() => { onSelectTeam(t.id); setIsDropdownOpen(false); setSearchTerm(''); }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-800 transition-all group ${selectedTeam.id === t.id ? 'bg-indigo-900/20' : ''}`}
                >
                  <TeamLogo teamId={t.id} size="sm" className="opacity-70 group-hover:opacity-100" />
                  <span className={`text-sm font-bold uppercase truncate ${selectedTeam.id === t.id ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}>{t.city} {t.name}</span>
                  {t.id === myTeamId && (
                    <span className="ml-2 px-1.5 py-0.5 bg-red-600 text-[9px] font-black text-white rounded uppercase">MY TEAM</span>
                  )}
                  {selectedTeam.id === t.id && <CheckCircle2 size={16} className="ml-auto text-indigo-500" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

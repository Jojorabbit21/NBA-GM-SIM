
import React from 'react';
import { Team, PlayoffSeries } from '../../types';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_COLORS } from '../../data/teamData';

interface GridSeriesBoxProps {
    series?: PlayoffSeries;
    teams: Team[];
    myTeamId: string;
    seedMap: Record<string, number>;
    isProjected?: boolean;
    label?: string;
    onClick?: () => void;
    selected?: boolean;
}

const CELL_BORDER = "border border-slate-600";

export const GridSeriesBox: React.FC<GridSeriesBoxProps> = ({ series, teams, myTeamId, seedMap, isProjected, label, onClick, selected }) => {
    const higher = teams.find(t => t.id === series?.higherSeedId);
    const lower = teams.find(t => t.id === series?.lowerSeedId);
    
    const hWins = series?.higherSeedWins || 0;
    const lWins = series?.lowerSeedWins || 0;
    const finished = series?.finished;
    const winnerId = series?.winnerId;

    const TeamRow = ({ team, wins, opponentWins, isBottom }: { team?: Team, wins: number, opponentWins: number, isBottom?: boolean }) => {
        const isWinner = finished && winnerId === team?.id;
        const isEliminated = finished && winnerId !== team?.id;
        const seed = team ? seedMap[team.id] : '-';
        
        const teamColor = team ? TEAM_COLORS[team.id]?.primary : undefined;
        const scoreColor = (isWinner || (series && wins > opponentWins)) ? 'text-emerald-400' : 'text-white';

        return (
            <div
              className={`
                flex items-center h-9 px-2 md:px-3 gap-2 md:gap-3
                ${!isBottom ? 'border-b border-slate-800/50' : ''}
                hover:bg-white/5 transition-colors
                ${isEliminated ? 'opacity-40' : ''}
              `}
              style={teamColor ? { backgroundColor: teamColor } : { backgroundColor: 'rgb(2,6,23)' }}
            >
                <span className="w-3 md:w-4 text-center font-mono text-[9px] md:text-[10px] text-white">{seed}</span>

                {team && (
                    <TeamLogo
                      teamId={team.id}
                      size="custom"
                      className={`w-4 h-4 md:w-5 md:h-5 object-contain flex-shrink-0 ${isEliminated ? 'grayscale' : ''}`}
                    />
                )}

                <span className={`
                    text-[10px] md:text-xs flex-1 truncate min-w-0 text-white
                    ${isWinner ? 'font-bold' : ''}
                `}>
                    {team?.name || 'TBD'}
                </span>

                <span className={`text-[10px] md:text-xs font-mono font-black ${scoreColor}`}>
                    {wins}
                </span>
            </div>
        );
    };

    return (
      <div
        className={`flex flex-col w-full ${CELL_BORDER} relative group bg-slate-900 ${onClick ? 'cursor-pointer' : ''} ${selected ? 'ring-1 ring-indigo-500 bg-slate-800/80' : ''}`}
        onClick={onClick}
      >
          <div className="flex items-center justify-center px-2 md:px-3 py-1.5 bg-slate-800 border-b border-slate-800/50 min-h-[22px]">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter truncate">{label || '-'}</span>
          </div>
          <TeamRow team={higher} wins={hWins} opponentWins={lWins} />
          <TeamRow team={lower} wins={lWins} opponentWins={hWins} isBottom />
      </div>
    );
};

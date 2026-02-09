
import React from 'react';
import { Team, PlayoffSeries } from '../../types';
import { TeamLogo } from '../common/TeamLogo';

interface GridSeriesBoxProps {
    series?: PlayoffSeries;
    teams: Team[];
    myTeamId: string;
    seedMap: Record<string, number>;
    isProjected?: boolean;
    label?: string;
}

const CELL_BORDER = "border-b border-r border-slate-800";

export const GridSeriesBox: React.FC<GridSeriesBoxProps> = ({ series, teams, myTeamId, seedMap, isProjected, label }) => {
    const higher = teams.find(t => t.id === series?.higherSeedId);
    const lower = teams.find(t => t.id === series?.lowerSeedId);
    
    const hWins = series?.higherSeedWins || 0;
    const lWins = series?.lowerSeedWins || 0;
    const finished = series?.finished;
    const winnerId = series?.winnerId;

    let statusText = label || '-';
    const higherCode = higher?.id.toUpperCase() || 'TBD';
    const lowerCode = lower?.id.toUpperCase() || 'TBD';

    if (finished) {
        if (winnerId === higher?.id) statusText = `WIN: ${higherCode}`;
        else statusText = `WIN: ${lowerCode}`;
    } else if (series) {
        if (hWins === 0 && lWins === 0) statusText = 'VS';
        else if (hWins === lWins) statusText = `TIED ${hWins}-${lWins}`;
        else if (hWins > lWins) statusText = `${higherCode} +${hWins-lWins}`;
        else statusText = `${lowerCode} +${lWins-hWins}`;
    }

    const TeamRow = ({ team, wins, opponentWins, isBottom }: { team?: Team, wins: number, opponentWins: number, isBottom?: boolean }) => {
        const isUser = team?.id === myTeamId;
        const isWinner = finished && winnerId === team?.id;
        const isEliminated = finished && winnerId !== team?.id;
        const seed = team ? seedMap[team.id] : '-';
        
        const rowBg = isUser ? 'bg-emerald-900/30' : 'bg-slate-950';
        const scoreColor = (isWinner || (series && wins > opponentWins)) ? 'text-emerald-400' : 'text-slate-600';

        return (
            <div className={`
              flex items-center h-9 px-2 md:px-3 gap-2 md:gap-3 
              ${rowBg} 
              ${!isBottom ? 'border-b border-slate-800/50' : ''}
              hover:bg-white/5 transition-colors
            `}>
                <span className={`w-3 md:w-4 text-center font-mono text-[9px] md:text-[10px] ${isUser ? 'text-emerald-400' : 'text-slate-600'}`}>{seed}</span>
                
                {team && (
                    <TeamLogo 
                      teamId={team.id} 
                      size="custom" 
                      className={`w-4 h-4 md:w-5 md:h-5 object-contain flex-shrink-0 ${isEliminated ? 'opacity-40 grayscale' : ''}`}
                    />
                )}
                
                <span className={`
                    text-[10px] md:text-xs flex-1 truncate min-w-0 
                    ${isWinner ? 'text-white font-bold' : 'text-slate-400'}
                    ${isEliminated ? 'line-through decoration-slate-600 opacity-50' : ''}
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
      <div className={`flex flex-col w-full ${CELL_BORDER} relative group bg-slate-900`}>
          <div className={`absolute left-0 top-0 bottom-0 w-0.5 md:w-1 ${series?.conference === 'East' ? 'bg-blue-600/50' : series?.conference === 'West' ? 'bg-red-600/50' : 'bg-transparent'}`}></div>
          <div className="flex justify-between items-center px-2 md:px-3 py-1.5 bg-slate-900/50 border-b border-slate-800/50 min-h-[22px]">
              {statusText === label ? (
                  <span className="w-full text-center text-[8px] md:text-[9px] font-bold text-slate-500 uppercase tracking-tighter truncate">{label}</span>
              ) : (
                  <>
                      <span className="text-[8px] md:text-[9px] font-bold text-slate-600 uppercase tracking-tighter truncate max-w-[60%]">{label}</span>
                      <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-tighter truncate ${finished ? 'text-emerald-500' : 'text-slate-500'}`}>{statusText}</span>
                  </>
              )}
          </div>
          <TeamRow team={higher} wins={hWins} opponentWins={lWins} />
          <TeamRow team={lower} wins={lWins} opponentWins={hWins} isBottom />
      </div>
    );
};


import React from 'react';
import { Game } from '../types';
import { getTeamLogoUrl } from '../utils/constants';

interface LiveScoreTickerProps {
  games: Game[];
}

export const LiveScoreTicker: React.FC<LiveScoreTickerProps> = ({ games }) => {
  if (games.length === 0) return null;

  // 무한 루프를 위해 목록 복제
  const tickerItems = [...games, ...games, ...games];

  return (
    <div className="flex whitespace-nowrap animate-marquee items-center gap-24 pl-10 h-full">
      {tickerItems.map((g, idx) => (
        <div key={`${g.id}-${idx}`} className="flex items-center gap-2 h-full">
          <img 
            src={getTeamLogoUrl(g.awayTeamId)} 
            className="w-5 h-5 object-contain drop-shadow-sm" 
            alt={g.awayTeamId} 
          />
          <span className="text-xl font-medium text-white pretendard tracking-tighter tabular-nums mx-1">
            {g.awayScore}-{g.homeScore}
          </span>
          <img 
            src={getTeamLogoUrl(g.homeTeamId)} 
            className="w-5 h-5 object-contain drop-shadow-sm" 
            alt={g.homeTeamId} 
          />
        </div>
      ))}
    </div>
  );
};

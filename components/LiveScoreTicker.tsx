
import React from 'react';
import { Game } from '../types';
import { resolveTeamId } from '../utils/constants';

interface LiveScoreTickerProps {
  games: Game[];
}

export const LiveScoreTicker: React.FC<LiveScoreTickerProps> = ({ games }) => {
  // 무한 루프 효과를 위해 데이터 복제
  const tickerItems = games.length > 0 ? [...games, ...games, ...games] : [];

  return (
    <div className="flex items-center h-full w-full bg-slate-900 overflow-hidden relative">
      {/* ESPN Fixed Logo Panel */}
      <div className="flex-shrink-0 h-full bg-red-600 px-4 flex items-center gap-3 border-r border-red-700 z-30 shadow-[5px_0_15px_rgba(0,0,0,0.5)]">
        <img 
            src="https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg" 
            className="h-3.5 invert brightness-200" 
            style={{ filter: 'brightness(0) invert(1)' }}
            alt="ESPN" 
        />
        <div className="w-[1px] h-3 bg-white/30"></div>
        <span className="text-[10px] font-black text-red-100 uppercase tracking-widest mt-0.5 whitespace-nowrap">Today's Results</span>
      </div>

      {/* Marquee Content */}
      <div className="flex-1 overflow-hidden h-full relative flex items-center">
        {tickerItems.length > 0 ? (
            <div className="flex whitespace-nowrap animate-marquee items-center h-full">
              {tickerItems.map((g, idx) => {
                const homeId = resolveTeamId(g.homeTeamId).toUpperCase();
                const awayId = resolveTeamId(g.awayTeamId).toUpperCase();
                
                const hScore = g.homeScore ?? 0;
                const aScore = g.awayScore ?? 0;
                
                const awayWon = aScore > hScore;
                const homeWon = hScore > aScore;

                return (
                    <div key={`${g.id}-${idx}`} className="flex items-center px-2 h-full border-r border-white/5 last:border-r-0 group">
                        {/* Integrated Dark Score Container - Reduced px-5 to px-2.5 */}
                        <div className="flex items-center px-1.5 py-1.5 gap-1 shadow-xl transition-colors pretendard font-bold">
                            
                            {/* Away Team ABBR & Score */}
                            <span className={`text-sm tracking-tighter ${awayWon ? 'text-white' : 'text-slate-500'}`}>
                                {awayId}
                            </span>
                            <span className={`text-sm tabular-nums ml-1 ${awayWon ? 'text-white' : 'text-slate-500'}`}>
                                {aScore}
                            </span>

                            {/* Separator */}
                            <span className="text-slate-600 px-1">-</span>

                            {/* Home Team Score & ABBR */}
                            <span className={`text-sm tabular-nums mr-1 ${homeWon ? 'text-white' : 'text-slate-500'}`}>
                                {hScore}
                            </span>
                            <span className={`text-sm tracking-tighter ${homeWon ? 'text-white' : 'text-slate-500'}`}>
                                {homeId}
                            </span>

                        </div>
                    </div>
                );
              })}
            </div>
        ) : (
            <div className="px-8 flex items-center h-full gap-4">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(79,70,229,0.5)]"></div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] italic ko-tight">
                    대기 중... 시뮬레이션을 시작하여 오늘의 경기 결과를 확인하세요.
                </span>
            </div>
        )}
      </div>
    </div>
  );
};

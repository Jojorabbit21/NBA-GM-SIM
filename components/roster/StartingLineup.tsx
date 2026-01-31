
import React, { useState } from 'react';
import { Player, Team, GameTactics } from '../../types';
import { User } from 'lucide-react';
import { supabaseUrl } from '../../services/supabaseClient';

interface StartingLineupProps {
  team: Team;
  tactics: GameTactics;
  roster: Player[];
}

const PlayerCard: React.FC<{ player: Player | undefined, positionLabel: string }> = ({ player, positionLabel }) => {
  const [imageError, setImageError] = useState(false);

  // 1. 플레이어가 할당되지 않은 경우 (빈 슬롯)
  if (!player) {
    return (
      <div className="w-28 h-40 md:w-32 md:h-48 flex-shrink-0 bg-slate-900/30 border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center gap-2 group hover:border-slate-500 transition-colors cursor-pointer">
        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{positionLabel}</span>
        <User size={32} className="text-slate-700" />
        <span className="text-xs font-bold text-slate-600 uppercase">EMPTY</span>
      </div>
    );
  }

  // 2. 이미지가 로드되지 않았을 때 (요청사항: 어두운 점선, 아바타, 이름)
  if (imageError) {
      return (
        <div className="w-28 h-40 md:w-32 md:h-48 flex-shrink-0 bg-slate-900/30 border-2 border-dashed border-slate-600 rounded-xl flex flex-col items-center justify-center gap-3 group hover:border-slate-400 transition-colors cursor-pointer relative overflow-hidden">
           {/* Position Label */}
           <div className="absolute top-2 left-0 w-full text-center">
              <span className="text-[10px] font-black text-indigo-500/80 uppercase tracking-widest">{positionLabel}</span>
           </div>

           {/* Avatar Icon */}
           <div className="p-3 bg-slate-800/50 rounded-full border border-slate-700/50">
               <User size={36} className="text-slate-400" />
           </div>

           {/* Player Name */}
           <div className="px-2 text-center w-full">
              <div className="text-xs font-black text-slate-300 uppercase tracking-tight leading-tight break-keep">
                  {player.name}
              </div>
              <div className="text-[9px] font-bold text-slate-500 mt-0.5">OVR {player.ovr}</div>
           </div>
        </div>
      );
  }

  // 3. 이미지가 존재하는 경우 (Supabase Storage CDN)
  const cardImageUrl = `${supabaseUrl}/storage/v1/object/public/player-cards/${player.id}.webp`;

  return (
    <div className="relative w-28 h-40 md:w-32 md:h-48 flex-shrink-0 rounded-xl overflow-hidden shadow-xl transition-transform hover:scale-105 hover:z-10 group bg-slate-900 cursor-pointer border border-slate-800">
       
       {/* Position Label Badge */}
       <div className="absolute top-2 left-2 z-20 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/10">
          <span className="text-[9px] font-black text-white uppercase tracking-widest">{positionLabel}</span>
       </div>

       {/* OVR Badge */}
       <div className="absolute top-2 right-2 z-20 bg-indigo-600/90 backdrop-blur-sm px-1.5 py-0.5 rounded border border-indigo-400/30 shadow-lg">
          <span className="text-[9px] font-black text-white">{player.ovr}</span>
       </div>

       {/* Image Loader */}
       <img 
          src={cardImageUrl}
          alt={player.name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImageError(true)} // 이미지 로드 실패 시 Fallback UI로 전환
       />
       
       {/* Shine Effect */}
       <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30"></div>
       
       {/* Name Overlay (Bottom) */}
       <div className="absolute bottom-0 w-full bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-6 pb-2 px-2 z-20">
          <p className="text-xs font-black text-white text-center uppercase tracking-tight truncate leading-none text-shadow-sm">
             {player.name}
          </p>
       </div>
    </div>
  );
};

export const StartingLineup: React.FC<StartingLineupProps> = ({ team, tactics, roster }) => {
  const { starters } = tactics;
  // Fixed Order: PG -> SG -> SF -> PF -> C
  const positions: { key: keyof typeof starters; label: string }[] = [
    { key: 'PG', label: 'PG' },
    { key: 'SG', label: 'SG' },
    { key: 'SF', label: 'SF' },
    { key: 'PF', label: 'PF' },
    { key: 'C', label: 'C' },
  ];

  return (
    <div className="w-full overflow-x-auto custom-scrollbar pb-2 px-4 md:px-0">
      <div className="flex items-center justify-between md:justify-center gap-3 min-w-max mx-auto">
        {positions.map((pos) => {
          const playerId = starters[pos.key];
          const player = roster.find(p => p.id === playerId);
          
          return (
            <PlayerCard 
                key={pos.key} 
                player={player} 
                positionLabel={pos.label} 
            />
          );
        })}
      </div>
    </div>
  );
};

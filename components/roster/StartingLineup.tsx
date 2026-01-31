
import React, { useState } from 'react';
import { Player, Team, GameTactics } from '../../types';
import { User } from 'lucide-react';
import { supabaseUrl } from '../../services/supabaseClient';
import { getOvrBadgeStyle } from '../SharedComponents';

interface StartingLineupProps {
  team: Team;
  tactics: GameTactics;
  roster: Player[];
}

const PlayerCard: React.FC<{ player: Player | undefined, positionLabel: string }> = ({ player, positionLabel }) => {
  const [imageError, setImageError] = useState(false);

  // Shared container class for aspect ratio and basic styling
  const containerClass = "relative w-full aspect-[2/3] rounded-xl overflow-hidden border border-slate-800 bg-slate-900";

  // 1. 플레이어가 할당되지 않은 경우 (빈 슬롯)
  if (!player) {
    return (
      <div className={`${containerClass} bg-slate-900/30 border-dashed border-slate-700 flex flex-col items-center justify-center gap-2 cursor-default`}>
        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{positionLabel}</span>
        <User size={32} className="text-slate-700" />
        <span className="text-xs font-bold text-slate-600 uppercase">EMPTY</span>
      </div>
    );
  }

  // 2. 이미지가 로드되지 않았을 때 (요청사항: 어두운 점선, 아바타, 이름)
  // Consistently use Global OVR Badge style even in error state for uniformity
  if (imageError) {
      return (
        <div className={`${containerClass} bg-slate-900/30 border-dashed border-slate-600`}>
           {/* OVR Badge (Top-Left) */}
           <div className={`absolute top-2 left-2 z-20 ${getOvrBadgeStyle(player.ovr)} !w-7 !h-7 !text-xs`}>
             {player.ovr}
           </div>

           {/* Position Label (Top-Right) */}
           <div className="absolute top-2 right-2 z-20 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/10">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{positionLabel}</span>
           </div>

           {/* Center Content */}
           <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
               <div className="p-3 bg-slate-800/50 rounded-full border border-slate-700/50">
                   <User size={36} className="text-slate-400" />
               </div>
               <div className="px-2 text-center w-full">
                  <div className="text-xs font-black text-slate-300 uppercase tracking-tight leading-tight break-keep">
                      {player.name}
                  </div>
               </div>
           </div>
        </div>
      );
  }

  // 3. 이미지가 존재하는 경우 (Supabase Storage CDN)
  const cardImageUrl = `${supabaseUrl}/storage/v1/object/public/player-cards/${player.id}.webp`;

  return (
    <div className={`${containerClass} shadow-xl`}>
       
       {/* OVR Badge (Top-Left) - Global Style */}
       <div className={`absolute top-2 left-2 z-20 ${getOvrBadgeStyle(player.ovr)}`}>
          {player.ovr}
       </div>

       {/* Position Label Badge (Top-Right) */}
       <div className="absolute top-2 right-2 z-20 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/10">
          <span className="text-[9px] font-black text-white uppercase tracking-widest">{positionLabel}</span>
       </div>

       {/* Image Loader */}
       <img 
          src={cardImageUrl}
          alt={player.name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImageError(true)} // 이미지 로드 실패 시 Fallback UI로 전환
       />
       
       {/* Shine/Gradient Effect */}
       <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-50 pointer-events-none z-10"></div>
       
       {/* NOTE: Name removed when image exists per request */}
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
    <div className="w-full grid grid-cols-5 gap-2 md:gap-4">
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
  );
};

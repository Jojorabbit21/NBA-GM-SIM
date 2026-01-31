
import React from 'react';
import { Player, Team, GameTactics } from '../../types';
import { getOvrBadgeStyle } from '../SharedComponents';
import { User } from 'lucide-react';

interface StartingLineupProps {
  team: Team;
  tactics: GameTactics;
  roster: Player[];
}

const PlayerCard: React.FC<{ player: Player | undefined, positionLabel: string, teamLogo: string }> = ({ player, positionLabel, teamLogo }) => {
  // Empty Slot Card
  if (!player) {
    return (
      <div className="w-28 h-40 md:w-32 md:h-48 flex-shrink-0 bg-slate-900/50 border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center gap-2 group hover:border-slate-500 transition-colors cursor-pointer">
        <User size={32} className="text-slate-600 group-hover:text-slate-400" />
        <span className="text-xs font-bold text-slate-600 uppercase">{positionLabel}</span>
      </div>
    );
  }

  // Determine border color based on OVR (Gem tier style)
  let borderColor = "border-slate-600";
  let bgGradient = "from-slate-800 to-slate-950";
  let gemEffect = "";

  if (player.ovr >= 95) { // Pink Diamond / Opal
    borderColor = "border-fuchsia-400";
    bgGradient = "from-fuchsia-900/80 to-slate-950";
    gemEffect = "shadow-[0_0_15px_rgba(232,121,249,0.3)]";
  } else if (player.ovr >= 90) { // Diamond
    borderColor = "border-cyan-400";
    bgGradient = "from-cyan-900/80 to-slate-950";
    gemEffect = "shadow-[0_0_15px_rgba(34,211,238,0.3)]";
  } else if (player.ovr >= 85) { // Amethyst
    borderColor = "border-purple-500";
    bgGradient = "from-purple-900/80 to-slate-950";
  } else if (player.ovr >= 80) { // Ruby
    borderColor = "border-red-500";
    bgGradient = "from-red-900/80 to-slate-950";
  } else if (player.ovr >= 75) { // Sapphire
    borderColor = "border-blue-500";
    bgGradient = "from-blue-900/80 to-slate-950";
  } else { // Gold/Silver
    borderColor = "border-amber-400";
    bgGradient = "from-amber-900/80 to-slate-950";
  }

  return (
    <div className={`relative w-28 h-40 md:w-36 md:h-52 flex-shrink-0 rounded-xl border-2 ${borderColor} bg-gradient-to-b ${bgGradient} overflow-hidden flex flex-col shadow-xl transition-transform hover:scale-105 hover:z-10 ${gemEffect} group`}>
      
      {/* Background Watermark */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none grayscale group-hover:grayscale-0 transition-all duration-500">
         <img src={teamLogo} className="w-[120%] h-[120%] object-contain transform -rotate-12" alt="" />
      </div>

      {/* Card Header (OVR & Pos) */}
      <div className="absolute top-2 left-2 z-20 flex flex-col items-center">
         <div className={`${getOvrBadgeStyle(player.ovr)} !w-8 !h-8 !text-sm !shadow-md border border-white/20`}>
            {player.ovr}
         </div>
      </div>

      {/* Player Image / Silhouette */}
      <div className="absolute inset-0 z-10 flex items-end justify-center">
          {/* Placeholder for Player Image - using a generic silhouette approach or actual image if available */}
          {/* If you have player images, use: <img src={player.img} ... /> */}
          <div className="w-full h-[85%] bg-gradient-to-t from-black/80 via-transparent to-transparent absolute bottom-0"></div>
          <User size={100} className="text-white/10 mb-8 transform scale-110" /> 
      </div>

      {/* Card Footer (Name & Info) */}
      <div className="absolute bottom-0 w-full z-30 p-2 bg-gradient-to-t from-black via-black/80 to-transparent pt-6">
         <div className="flex justify-between items-end">
            <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">{positionLabel}</span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{player.position}</span>
            </div>
         </div>
         <div className="mt-1 border-t border-white/20 pt-1">
            <div className="text-sm font-black text-white uppercase tracking-tight truncate text-shadow-sm oswald leading-none">
                {player.name.split(' ').pop()} {/* Last Name emphasized */}
            </div>
            <div className="text-[9px] font-bold text-slate-300 uppercase tracking-wider truncate">
                {player.name.split(' ').slice(0, -1).join(' ')}
            </div>
         </div>
      </div>

      {/* Shine Effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-40"></div>
    </div>
  );
};

export const StartingLineup: React.FC<StartingLineupProps> = ({ team, tactics, roster }) => {
  const { starters } = tactics;
  const positions: { key: keyof typeof starters; label: string }[] = [
    { key: 'PG', label: 'Point Guard' },
    { key: 'SG', label: 'Shooting Guard' },
    { key: 'SF', label: 'Small Forward' },
    { key: 'PF', label: 'Power Forward' },
    { key: 'C', label: 'Center' },
  ];

  return (
    <div className="w-full overflow-x-auto custom-scrollbar pb-6 px-4 md:px-0">
      <div className="flex items-center justify-between md:justify-center gap-4 min-w-max mx-auto">
        {positions.map((pos) => {
          const playerId = starters[pos.key];
          const player = roster.find(p => p.id === playerId);
          
          return (
            <PlayerCard 
                key={pos.key} 
                player={player} 
                positionLabel={pos.key} 
                teamLogo={team.logo}
            />
          );
        })}
      </div>
    </div>
  );
};

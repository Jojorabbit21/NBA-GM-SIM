
import React from 'react';
import { Player, Team, GameTactics } from '../../types';
import { User } from 'lucide-react';

interface StartingLineupProps {
  team: Team;
  tactics: GameTactics;
  roster: Player[];
}

const PlayerCard: React.FC<{ player: Player | undefined, positionLabel: string }> = React.memo(({ player, positionLabel }) => {
  const containerClass = "relative w-full aspect-[2/3] rounded-xl overflow-hidden";

  // 1. 플레이어가 할당되지 않은 경우 (빈 슬롯)
  if (!player) {
    return (
      <div className={`${containerClass} bg-slate-900/30 border border-dashed border-slate-700 flex flex-col items-center justify-center gap-2 cursor-default`}>
        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{positionLabel}</span>
        <User size={32} className="text-slate-700" />
        <span className="text-xs font-bold text-slate-600 uppercase">EMPTY</span>
      </div>
    );
  }

  // 2. 제네릭 아바타 + 선수 이름 표시
  return (
    <div className={`${containerClass} bg-slate-900/30 border border-dashed border-slate-600`}>
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
});

export const StartingLineup: React.FC<StartingLineupProps> = React.memo(({ team, tactics, roster }) => {
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
});

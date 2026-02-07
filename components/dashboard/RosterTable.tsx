
import React from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { DepthChartEditor } from './DepthChartEditor';
import { StartingLineup } from '../roster/StartingLineup';
import { RotationMatrix } from './RotationMatrix';
import { GanttChartSquare } from 'lucide-react';

interface RosterTableProps {
  mode: 'mine' | 'opponent';
  team: Team;
  opponent?: Team;
  healthySorted: Player[];
  injuredSorted: Player[];
  oppHealthySorted: Player[];
  tactics: GameTactics;
  onUpdateTactics: (t: GameTactics) => void;
  onViewPlayer: (p: Player) => void;
  depthChart?: DepthChart | null; 
  onUpdateDepthChart?: (dc: DepthChart) => void;
}

export const RosterTable: React.FC<RosterTableProps> = ({ 
  mode, team, healthySorted, tactics, onUpdateTactics, onViewPlayer,
  depthChart, onUpdateDepthChart
}) => {
    
    if (mode === 'opponent') {
        return (
            <div className="p-8 text-slate-500 text-center uppercase oswald tracking-widest py-32">
                상대 전력 데이터는 기록 탭에서 확인 가능합니다.
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950/20 overflow-hidden">
            
            {/* Module 1: Starting Lineup & Depth Chart */}
            <div className="flex-shrink-0 flex flex-col bg-slate-900/40 border-b border-slate-800">
                
                {/* Visual Starting Lineup */}
                <div className="p-6 border-b border-white/5">
                    <StartingLineup team={team} tactics={tactics} roster={team.roster} />
                </div>

                {/* Depth Chart Editor */}
                <div className="flex-col flex">
                    <div className="px-6 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-2">
                        <GanttChartSquare size={16} className="text-indigo-400"/>
                        <span className="text-xs font-black text-slate-300 uppercase tracking-widest oswald">뎁스 차트 (Depth Chart)</span>
                    </div>
                    <DepthChartEditor 
                        team={team} 
                        tactics={tactics} 
                        depthChart={depthChart || null} 
                        onUpdateDepthChart={onUpdateDepthChart || (() => {})} 
                        onUpdateTactics={onUpdateTactics}
                    />
                </div>
            </div>

            {/* Module 2: Rotation Chart */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <RotationMatrix 
                    team={team}
                    tactics={tactics}
                    depthChart={depthChart || null}
                    healthySorted={healthySorted}
                    onUpdateTactics={onUpdateTactics}
                    onViewPlayer={onViewPlayer}
                />
            </div>

        </div>
    );
};


import React from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { DepthChartEditor } from './DepthChartEditor';
import { StartingLineup } from '../roster/StartingLineup';
import { RotationMatrix } from './RotationMatrix';
import { GanttChartSquare } from 'lucide-react';

interface RotationManagerProps {
    team: Team;
    tactics: GameTactics;
    depthChart: DepthChart | null;
    healthySorted: Player[];
    onUpdateTactics: (t: GameTactics) => void;
    onViewPlayer: (p: Player) => void;
    onUpdateDepthChart?: (dc: DepthChart) => void;
}

export const RotationManager: React.FC<RotationManagerProps> = ({
    team,
    tactics,
    depthChart,
    healthySorted,
    onUpdateTactics,
    onViewPlayer,
    onUpdateDepthChart
}) => {
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
                    <div className="px-6 py-4 bg-slate-800 border-b border-slate-700 flex items-center gap-3">
                        <GanttChartSquare size={20} className="text-indigo-400"/>
                        <span className="text-base font-black text-white uppercase tracking-widest oswald">뎁스 차트</span>
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

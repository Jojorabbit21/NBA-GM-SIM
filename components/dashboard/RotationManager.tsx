
import React from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { DepthChartEditor } from './DepthChartEditor';
import { StartingLineup } from '../roster/StartingLineup';
import { RotationGanttChart } from './RotationGanttChart';

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
            <div className="flex-shrink-0 flex flex-col bg-slate-900/40 border-b border-slate-800">
                <div className="flex-col flex">
                    <DepthChartEditor 
                        team={team} 
                        tactics={tactics} 
                        depthChart={depthChart || null} 
                        onUpdateDepthChart={onUpdateDepthChart || (() => {})} 
                        onUpdateTactics={onUpdateTactics}
                    />
                </div>
            </div>

        </div>
    );
};

// If you want to recover player cards above depth chart
/*
                <div className="p-6 border-b border-white/5">
                    <StartingLineup team={team} tactics={tactics} roster={team.roster} />
                </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                <RotationGanttChart
                    team={team}
                    tactics={tactics}
                    depthChart={depthChart || null}
                    healthySorted={healthySorted}
                    onUpdateTactics={onUpdateTactics}
                    onViewPlayer={onViewPlayer}
                />
            </div>
*/
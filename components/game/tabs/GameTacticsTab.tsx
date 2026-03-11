
import React from 'react';
import { Team, TacticalSnapshot, PlayerBoxScore } from '../../../types';
import { LeagueCoachingData } from '../../../types/coaching';
import { TacticsAnalysis } from '../TacticsAnalysis';

interface GameTacticsTabProps {
    homeTeam: Team;
    awayTeam: Team;
    homeTactics?: TacticalSnapshot;
    awayTactics?: TacticalSnapshot;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    coachingData?: LeagueCoachingData | null;
}

export const GameTacticsTab: React.FC<GameTacticsTabProps> = (props) => {
    return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <TacticsAnalysis {...props} />
        </div>
    );
};

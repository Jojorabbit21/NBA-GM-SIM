
import React from 'react';
import { TacticalSliders, Player } from '../../../types';
import { RadarChart } from './charts/RadarChart';
import { TeamZoneChart } from './charts/TeamZoneChart';
import { PlayTypePPP } from './charts/PlayTypePPP';
import { RatingTrend } from './charts/RatingTrend';
import { RiskGauge } from './charts/RiskGauge';

interface TacticsDataPanelProps {
    section: 'offense' | 'defense';
    sliders: TacticalSliders;
    roster: Player[];
    gameRatings?: { date: string; ortg: number; drtg: number }[];
}

export const TacticsDataPanel: React.FC<TacticsDataPanelProps> = ({ section, sliders, roster, gameRatings }) => {

    if (section === 'offense') {
        return (
            <div className="flex flex-col gap-6">
                {/* Row 1: Radar + Zone Heatmap side by side */}
                <div className="grid grid-cols-2 gap-4">
                    <RadarChart roster={roster} />
                    <TeamZoneChart roster={roster} />
                </div>

                {/* Row 2: Play Type PPP */}
                <PlayTypePPP sliders={sliders} roster={roster} />
            </div>
        );
    }

    // Defense section
    return (
        <div className="flex flex-col gap-6">
            {/* Row 1: ORTG/DRTG Rating */}
            <RatingTrend roster={roster} gameRatings={gameRatings} />

            {/* Row 2: Risk Gauge */}
            <RiskGauge sliders={sliders} roster={roster} />
        </div>
    );
};

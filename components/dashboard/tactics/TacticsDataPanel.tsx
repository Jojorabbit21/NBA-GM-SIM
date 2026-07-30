
import React, { useState } from 'react';
import { TacticalSliders, Player } from '../../../types';
import { DefensiveStats } from '../../../utils/defensiveStats';
import { RadarChart } from './charts/RadarChart';
import { TeamZoneChart } from './charts/TeamZoneChart';
import { PlayTypePPP } from './charts/PlayTypePPP';

interface TacticsDataPanelProps {
    sliders: TacticalSliders;
    roster: Player[];
    defensiveStats?: DefensiveStats;
}

export const TacticsDataPanel: React.FC<TacticsDataPanelProps> = ({ sliders, roster, defensiveStats }) => {
    const [showOpponentZone, setShowOpponentZone] = useState(false);
    const hasOpponentData = defensiveStats && defensiveStats.gamesPlayed > 0 && Object.keys(defensiveStats.oppZoneStats).length > 0;

    return (
        <div className="flex flex-col gap-5">
            {/* Section 1: Radar + Zone Heatmap — vertically centered */}
            <div className="flex flex-col gap-2 pb-5 border-b border-slate-800">
                <div className="flex gap-4">
                    <h5 className="flex-1 text-sm font-black text-slate-300 uppercase tracking-widest">로스터 레이더</h5>
                    <div className="flex-1 flex items-center justify-between">
                        <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">슈팅 존 히트맵</h5>
                        {hasOpponentData && (
                            <button
                                onClick={() => setShowOpponentZone(v => !v)}
                                className="flex items-center gap-1.5 group"
                            >
                                <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${!showOpponentZone ? 'text-emerald-400' : 'text-slate-500'}`}>우리 팀</span>
                                <div className="relative w-8 h-[18px] rounded-full bg-slate-700 transition-colors">
                                    <div className={`absolute top-[3px] w-3 h-3 rounded-full transition-all duration-200 ${showOpponentZone ? 'left-[17px] bg-emerald-400' : 'left-[3px] bg-emerald-400'}`} />
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${showOpponentZone ? 'text-emerald-400' : 'text-slate-500'}`}>상대</span>
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <RadarChart roster={roster} hideTitle />
                    </div>
                    <div className="flex-1">
                        <TeamZoneChart
                            roster={roster}
                            zoneOverride={showOpponentZone && hasOpponentData ? defensiveStats!.oppZoneStats : undefined}
                            fullWidth hideTitle
                        />
                    </div>
                </div>
            </div>

            {/* Section 2: Play Type Analysis */}
            <div className="pb-5">
                <PlayTypePPP sliders={sliders} />
            </div>
        </div>
    );
};

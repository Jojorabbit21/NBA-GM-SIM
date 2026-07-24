
import React from 'react';
import { Team, PlayerBoxScore, RotationData } from '../../../types';
import { RotationChart } from '../RotationChart';

interface GameRotationTabProps {
    homeTeam: Team;
    awayTeam: Team;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    rotationData?: RotationData;
    /** 제공되면 원형 로고 대신 사각형 색상 배지 렌더링(멀티플레이어 전용 스타일) */
    homeBadge?: { color: string; abbr: string };
    awayBadge?: { color: string; abbr: string };
}

export const GameRotationTab: React.FC<GameRotationTabProps> = ({
    homeTeam, awayTeam, homeBox, awayBox, rotationData, homeBadge, awayBadge
}) => {
    return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            {rotationData ? (
                <RotationChart
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    homeBox={homeBox}
                    awayBox={awayBox}
                    rotationData={rotationData}
                    homeBadge={homeBadge}
                    awayBadge={awayBadge}
                />
            ) : (
                <div className="text-center text-slate-500 py-20 font-bold bg-slate-900/30 rounded-3xl border border-slate-800">
                    로테이션 데이터가 없습니다.
                </div>
            )}
        </div>
    );
};

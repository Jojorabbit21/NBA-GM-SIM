
import React from 'react';
import { Team, PlayerBoxScore, RotationData, PbpLog, ShotEvent } from '../../../types';
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
    /** 제공되면 로테이션 막대를 팀 컬러 대신 스틴트별 +/-(Positive/Even/Negative)로 색칠 */
    pbpLogs?: PbpLog[];
    /** true면 두 팀 카드를 상하 대신 좌우로 분할 배치(멀티플레이어 전용, 기본값 false=기존 상하 배치 유지) */
    splitLayout?: boolean;
    /** 제공되면 로테이션 막대 위에 핫/콜드 스트릭(🔥/❄️) 마커를 표시 */
    shotEvents?: ShotEvent[];
}

export const GameRotationTab: React.FC<GameRotationTabProps> = ({
    homeTeam, awayTeam, homeBox, awayBox, rotationData, homeBadge, awayBadge, pbpLogs, splitLayout, shotEvents
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
                    pbpLogs={pbpLogs}
                    splitLayout={splitLayout}
                    shotEvents={shotEvents}
                />
            ) : (
                <div className="text-center text-slate-500 py-20 font-bold bg-slate-900/30 rounded-3xl border border-slate-800">
                    로테이션 데이터가 없습니다.
                </div>
            )}
        </div>
    );
};

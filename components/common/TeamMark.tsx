
import React from 'react';
import { TeamLogo } from './TeamLogo';

interface TeamMarkProps {
    teamId: string;
    teamName?: string;
    className: string;
    /** 제공되면 원형 TeamLogo 대신 이 색상/약어로 사각형 배지를 렌더링(멀티플레이어 전용 스타일) */
    badge?: { color: string; abbr: string };
}

/**
 * 팀 로고/배지 표시. badge가 없으면 기존 TeamLogo(원형, 싱글플레이어)를 그대로 쓰고,
 * badge가 주어지면 사각형 색상 배지(멀티플레이어 스타일)로 대체한다.
 * GameShotChartTab/GamePbpTab/RotationChart에서 공통으로 사용.
 */
export const TeamMark: React.FC<TeamMarkProps> = ({ teamId, teamName, className, badge }) => {
    if (badge) {
        return (
            <div
                className={`${className} rounded flex items-center justify-center text-[8px] font-black shrink-0`}
                style={{ backgroundColor: badge.color, color: '#fff' }}
            >
                {badge.abbr.slice(0, 3)}
            </div>
        );
    }
    return <TeamLogo teamId={teamId} teamName={teamName} size="custom" className={className} />;
};

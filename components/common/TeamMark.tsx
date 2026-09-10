
import React from 'react';
import { TeamLogo } from './TeamLogo';
import { getRealTeamLogoUrl, getTeamLogoUrl } from '../../utils/constants';

interface TeamMarkProps {
    teamId: string;
    teamName?: string;
    className: string;
    /** 제공되면 원형 TeamLogo 대신 이 팀의 실제 로고(public/logos/real/)를 렌더링(멀티플레이어 전용) */
    badge?: { color: string; abbr: string };
}

/**
 * 팀 로고/배지 표시. badge가 없으면 기존 TeamLogo(원형, 싱글플레이어)를 그대로 쓰고,
 * badge가 주어지면(멀티플레이어) public/logos/real/ 실제 로고 이미지로 대체한다 — 다른
 * 멀티플레이어 화면들(뉴스피드/리그 순위/시즌 일정 등)과 동일한 폴백 체인(신규 로고 실패
 * → 구버전 → 플레이스홀더). [2026-09-07] 원래는 사각형 색상 배지(약어 텍스트)였으나
 * 로고 이미지로 교체(사용자 요청).
 * GameShotChartTab/BoxScoreTable/AdvancedBoxScoreTable/DefenseBoxScoreTable/
 * RotationChart/GameOnOffTab에서 공통으로 사용.
 */
export const TeamMark: React.FC<TeamMarkProps> = ({ teamId, teamName, className, badge }) => {
    if (badge) {
        return (
            <img
                src={getRealTeamLogoUrl(teamId)}
                alt={badge.abbr}
                className={`${className} object-contain shrink-0`}
                onError={(e) => {
                    const img = e.currentTarget;
                    if (img.dataset.fallback !== 'old') {
                        img.dataset.fallback = 'old';
                        img.src = getTeamLogoUrl(teamId);
                    } else {
                        img.src = 'https://placehold.co/100x100?text=BPL';
                    }
                }}
            />
        );
    }
    return <TeamLogo teamId={teamId} teamName={teamName} size="custom" className={className} />;
};

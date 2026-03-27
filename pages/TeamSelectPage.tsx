import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TeamSelectView } from '../views/TeamSelectView';
import { useGame } from '../hooks/useGameContext';
import { TEAM_DATA } from '../data/teamData';

const TeamSelectPage: React.FC = () => {
    const { gameData, rosterMode, draftPoolType, refreshUnreadCount } = useGame();
    const navigate = useNavigate();
    const [isSelecting, setIsSelecting] = useState(false);

    const handleSelectTeam = useCallback(async (teamId: string) => {
        setIsSelecting(true);
        try {
            if (rosterMode === 'custom') {
                // 커스텀 모드: 드래프트 순서 셔플 → 드래프트 로터리로 이동
                const teamIds = Object.keys(TEAM_DATA);
                for (let i = teamIds.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
                }
                await gameData.saveDraftOrder(teamIds, draftPoolType || 'alltime', teamId);
                gameData.setMyTeamId(teamId);
                navigate('/draft-lottery', { replace: true });
                return true;
            }

            // 기본 모드: handleSelectTeam 완료 후 온보딩 이동 (myTeamId 세팅 보장)
            const success = await gameData.handleSelectTeam(teamId);
            if (!success) {
                navigate('/', { replace: true });
                return false;
            }
            await refreshUnreadCount();
            navigate('/gm-creation', { replace: true });
            return success;
        } finally {
            setIsSelecting(false);
        }
    }, [gameData, rosterMode, draftPoolType, navigate, refreshUnreadCount]);

    return (
        <TeamSelectView
            teams={gameData.teams}
            isInitializing={gameData.isBaseDataLoading || isSelecting}
            onSelectTeam={handleSelectTeam}
            seasonShort={gameData.seasonConfig?.seasonShort ?? '2025-26'}
        />
    );
};

export default TeamSelectPage;

import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { PlayerDetailView } from '../views/PlayerDetailView';
import { useGame } from '../hooks/useGameContext';
import { calculatePlayerOvr } from '../utils/constants';

const PlayerDetailPage: React.FC = () => {
    const { playerId } = useParams<{ playerId: string }>();
    const { state } = useLocation();
    const { gameData, viewPlayerData, setViewPlayerData } = useGame();
    const navigate = useNavigate();

    const seasonShort: string = gameData.seasonConfig?.seasonShort ?? '2025-26';

    // location.state 우선, 없으면 context fallback
    const data = state as { player: any; teamId?: string; teamName?: string } | null
        ?? (viewPlayerData?.player?.id === playerId ? viewPlayerData : null);

    if (!data?.player) {
        // 플레이어 데이터 없이 직접 URL 접근 시 모든 팀에서 탐색
        const found = gameData.teams.flatMap(t => t.roster.map(p => ({ player: p, teamId: t.id, teamName: t.name }))).find(x => x.player.id === playerId);
        if (!found) { navigate(-1); return null; }
        const { player, teamId, teamName } = found;
        return (
            <PlayerDetailView
                player={{ ...player, ovr: calculatePlayerOvr(player) }}
                teamName={teamName}
                teamId={teamId}
                allTeams={gameData.teams}
                tendencySeed={gameData.tendencySeed || undefined}
                seasonShort={seasonShort}
                onBack={() => {
                    setViewPlayerData(null);
                    navigate(-1);
                }}
            />
        );
    }

    return (
        <PlayerDetailView
            player={{ ...data.player, ovr: calculatePlayerOvr(data.player) }}
            teamName={data.teamName}
            teamId={data.teamId}
            allTeams={gameData.teams}
            tendencySeed={gameData.tendencySeed || undefined}
            seasonShort={seasonShort}
            onBack={() => {
                setViewPlayerData(null);
                navigate(-1);
            }}
        />
    );
};

export default PlayerDetailPage;

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
    const myTeamId = gameData.myTeamId ?? undefined;

    // location.state 우선, 없으면 context fallback
    const data = state as { player: any; teamId?: string; teamName?: string } | null
        ?? (viewPlayerData?.player?.id === playerId ? viewPlayerData : null);

    if (!data?.player) {
        // 플레이어 데이터 없이 직접 URL 접근 시 모든 팀에서 탐색
        const found = gameData.teams.flatMap(t => t.roster.map(p => ({ player: p, teamId: t.id, teamName: t.name }))).find(x => x.player.id === playerId);
        if (!found) { navigate(-1); return null; }
        const { player, teamId, teamName } = found;
        const isMyTeam = myTeamId && teamId === myTeamId;
        return (
            <PlayerDetailView
                player={{ ...player, ovr: calculatePlayerOvr(player) }}
                teamName={teamName}
                teamId={teamId}
                allTeams={gameData.teams}
                tendencySeed={gameData.tendencySeed || undefined}
                seasonShort={seasonShort}
                myTeamId={myTeamId}
                onBack={() => { setViewPlayerData(null); navigate(-1); }}
                onExtension={isMyTeam ? () => navigate('/front-office?tab=contracts', { state: { autoNegotiateId: player.id, negotiateType: 'extension' } }) : undefined}
                onRelease={isMyTeam ? () => navigate('/front-office?tab=contracts', { state: { autoNegotiateId: player.id, negotiateType: 'release' } }) : undefined}
            />
        );
    }

    // teamId가 state에 없으면 현재 로스터에서 찾아서 보정 (FAView 등 teamId 미전달 경로 대응)
    const resolvedTeamEntry = !data.teamId
        ? gameData.teams.flatMap(t => t.roster.map(p => ({ player: p, teamId: t.id, teamName: t.name }))).find(x => x.player.id === playerId)
        : null;
    const resolvedTeamId = data.teamId ?? resolvedTeamEntry?.teamId;
    const resolvedTeamName = data.teamName ?? resolvedTeamEntry?.teamName;
    const isFA = !resolvedTeamId;
    const isMyTeam = myTeamId && resolvedTeamId === myTeamId;

    return (
        <PlayerDetailView
            player={{ ...data.player, ovr: calculatePlayerOvr(data.player) }}
            teamName={resolvedTeamName}
            teamId={resolvedTeamId}
            allTeams={gameData.teams}
            tendencySeed={gameData.tendencySeed || undefined}
            seasonShort={seasonShort}
            myTeamId={myTeamId}
            onBack={() => { setViewPlayerData(null); navigate(-1); }}
            onNegotiate={isFA ? () => navigate('/fa-market', { state: { autoNegotiateId: data.player.id } }) : undefined}
            onExtension={isMyTeam ? () => navigate('/front-office?tab=contracts', { state: { autoNegotiateId: data.player.id, negotiateType: 'extension' } }) : undefined}
            onRelease={isMyTeam ? () => navigate('/front-office?tab=contracts', { state: { autoNegotiateId: data.player.id, negotiateType: 'release' } }) : undefined}
        />
    );
};

export default PlayerDetailPage;

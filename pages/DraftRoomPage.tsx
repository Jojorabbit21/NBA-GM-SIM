import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FantasyDraftView } from '../views/FantasyDraftView';
import { RookieDraftView } from '../views/RookieDraftView';
import { useGame } from '../hooks/useGameContext';

const DraftRoomPage: React.FC = () => {
    const { gameData, draftPoolType } = useGame();
    const navigate = useNavigate();
    const [draftOrder, setDraftOrder] = useState<string[] | null>(null);

    const myTeam = gameData.teams.find(t => t.id === gameData.myTeamId);
    if (!myTeam) return null;

    // 오프시즌 루키 드래프트 (prospects 존재 = 루키 드래프트 모드)
    if ((gameData.prospects?.length ?? 0) > 0) {
        const draftTeamOrder = gameData.lotteryResult?.finalOrder || gameData.teams.map(t => t.id);
        return (
            <div className="fixed inset-0 z-[9999] bg-slate-950">
                <RookieDraftView
                    teams={gameData.teams}
                    myTeamId={gameData.myTeamId!}
                    draftOrder={draftTeamOrder}
                    resolvedDraftOrder={gameData.resolvedDraftOrder || null}
                    draftClass={gameData.prospects}
                    onComplete={(picks) => {
                        gameData.handleRookieDraftComplete(picks);
                        navigate('/', { replace: true });
                    }}
                />
            </div>
        );
    }

    // 판타지 드래프트 (게임 시작 시 커스텀 모드)
    return (
        <div className="fixed inset-0 z-[9999] bg-slate-950">
            <FantasyDraftView
                teams={gameData.teams}
                myTeamId={gameData.myTeamId!}
                draftPoolType={draftPoolType || gameData.draftPicks?.poolType || 'alltime'}
                freeAgents={gameData.freeAgents}
                draftTeamOrder={draftOrder || gameData.draftPicks?.order}
                onBack={() => navigate('/', { replace: true })}
                onComplete={(picks) => {
                    gameData.handleDraftComplete(picks);
                    navigate('/', { replace: true });
                }}
            />
        </div>
    );
};

export default DraftRoomPage;

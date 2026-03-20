import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { GameResultView } from '../views/GameResultView';
import { useGame } from '../hooks/useGameContext';
import { fetchFullGameResult } from '../services/queries';
import { Loader2 } from 'lucide-react';

const GameResultPage: React.FC = () => {
    const { gameId } = useParams<{ gameId: string }>();
    const { state } = useLocation();
    const { session, gameData, sim } = useGame();
    const navigate = useNavigate();

    const [result, setResult] = useState<any>(
        (state as { result?: any } | null)?.result ?? sim.lastGameResult ?? null
    );
    const [isLoading, setIsLoading] = useState(!result);

    // DB fallback: location.state에 결과가 없으면 gameId로 fetch
    useEffect(() => {
        if (result) return;
        if (!gameId || !session?.user?.id) {
            navigate('/', { replace: true });
            return;
        }
        setIsLoading(true);
        fetchFullGameResult(gameId, session.user.id).then(raw => {
            if (!raw) { navigate('/', { replace: true }); return; }
            setResult({
                ...raw,
                pbpLogs: raw.pbp_logs || [],
                pbpShotEvents: raw.shot_events || [],
            });
            setIsLoading(false);
        });
    }, [gameId, session?.user?.id]);

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 size={40} className="text-indigo-500 animate-spin" />
            </div>
        );
    }

    if (!result) return null;

    return (
        <GameResultView
            result={result}
            myTeamId={gameData.myTeamId!}
            teams={gameData.teams}
            coachingData={gameData.coachingData}
            onFinish={() => {
                const resultDate = new Date(result.date);
                const currentDate = new Date(gameData.currentSimDate);

                if (resultDate < currentDate) {
                    sim.clearLastGameResult();
                    navigate(-1);
                } else {
                    const d = new Date(gameData.currentSimDate);
                    d.setDate(d.getDate() + 1);
                    const nextDate = d.toISOString().split('T')[0];
                    gameData.setCurrentSimDate(nextDate);
                    sim.clearLastGameResult();
                    sim.setIsSimulating(false);
                    navigate('/', { replace: true });
                    gameData.forceSave({ currentSimDate: nextDate, withSnapshot: true });
                }
            }}
        />
    );
};

export default GameResultPage;

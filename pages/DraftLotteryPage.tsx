import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DraftLotteryView } from '../views/DraftLotteryView';
import { useGame } from '../hooks/useGameContext';
import { sendMessage } from '../services/messageService';
import { TEAM_DATA } from '../data/teamData';
import type { LotteryResultContent, LotteryResultEntry } from '../types/message';
import type { Team } from '../types';

const DraftLotteryPage: React.FC = () => {
    const { session, gameData, refreshUnreadCount } = useGame();
    const navigate = useNavigate();

    const seasonShort: string = gameData.seasonConfig?.seasonShort ?? '2025-26';

    return (
        <DraftLotteryView
            myTeamId={gameData.myTeamId!}
            savedOrder={gameData.lotteryResult?.finalOrder || gameData.draftPicks?.order || null}
            lotteryMetadata={gameData.lotteryResult || null}
            resolvedDraftOrder={gameData.resolvedDraftOrder || null}
            seasonShort={seasonShort}
            onComplete={(order) => {
                // 오프시즌 로터리 (판타지 드래프트가 아닌 경우) → 대시보드로 복귀
                if (!gameData.draftPicks?.order) {
                    if (gameData.lotteryResult) {
                        const updatedResult = { ...gameData.lotteryResult, viewed: true };
                        gameData.setLotteryResult(updatedResult);
                        gameData.forceSave({ lotteryResult: updatedResult });

                        // 로터리 결과 인박스 발송
                        if (session?.user?.id && gameData.myTeamId) {
                            const lr = gameData.lotteryResult;
                            const resolved = gameData.resolvedDraftOrder;
                            const lotteryTeamMap = new Map<string, any>(lr.lotteryTeams.map((lt: any) => [lt.teamId, lt]));
                            const movementMap = new Map<string, any>(lr.pickMovements.map((pm: any) => [pm.teamId, pm]));
                            const resolvedPickMap = resolved?.picks
                                ? new Map<number, any>(resolved.picks.map((p: any) => [p.pickNumber, p]))
                                : null;
                            const myPick = lr.finalOrder.indexOf(gameData.myTeamId) + 1;
                            const entries: LotteryResultEntry[] = lr.finalOrder.map((teamId: string, i: number) => {
                                const pick = i + 1;
                                const team = gameData.teams.find((t: Team) => t.id === teamId);
                                const td = TEAM_DATA[teamId];
                                const lt = lotteryTeamMap.get(teamId);
                                const mv = movementMap.get(teamId);
                                const resolvedPick = resolvedPickMap?.get(pick);
                                const currentOwner = resolvedPick && resolvedPick.currentTeamId !== teamId ? resolvedPick.currentTeamId : undefined;
                                const currentOwnerTd = currentOwner ? TEAM_DATA[currentOwner] : undefined;
                                return {
                                    pick,
                                    teamId,
                                    teamName: td ? `${td.city} ${td.name}` : teamId,
                                    wins: team?.wins ?? 0,
                                    losses: team?.losses ?? 0,
                                    odds: lt ? lt.odds : 0,
                                    movement: mv ? (mv.preLotteryPosition - mv.finalPosition) : 0,
                                    isLotteryTeam: !!lt,
                                    currentTeamId: currentOwner,
                                    currentTeamName: currentOwnerTd ? `${currentOwnerTd.city} ${currentOwnerTd.name}` : currentOwner,
                                    pickNote: resolvedPick?.note,
                                };
                            });
                            const lotteryContent: LotteryResultContent = { myTeamPick: myPick, entries };
                            const title = gameData.seasonConfig?.seasonLabel
                                ? `[리그 소식] ${gameData.seasonConfig.seasonLabel} 드래프트 로터리 추첨 결과`
                                : '[리그 소식] 드래프트 로터리 추첨 결과';
                            sendMessage(session.user.id, gameData.myTeamId, gameData.currentSimDate, 'LOTTERY_RESULT', title, lotteryContent)
                                .then(() => refreshUnreadCount())
                                .catch(e => console.warn('⚠️ Lottery result message failed:', e));
                        }
                    }
                    navigate('/dashboard', { replace: true });
                } else {
                    navigate('/draft/', { replace: true });
                }
            }}
        />
    );
};

export default DraftLotteryPage;

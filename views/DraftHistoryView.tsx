
import React, { useMemo } from 'react';
import { DraftBoard, BoardPick } from '../components/draft/DraftBoard';
import { POSITION_COLORS } from './FantasyDraftView';
import { TEAM_DATA } from '../data/teamData';

interface DraftHistoryViewProps {
    myTeamId: string;
    draftPicks: { teams: Record<string, string[]>; picks: BoardPick[] } | null;
}

function generateSnakeDraftOrder(teamIds: string[], rounds: number): string[] {
    const order: string[] = [];
    for (let r = 0; r < rounds; r++) {
        const ids = r % 2 === 0 ? [...teamIds] : [...teamIds].reverse();
        order.push(...ids);
    }
    return order;
}

export const DraftHistoryView: React.FC<DraftHistoryViewProps> = ({ myTeamId, draftPicks }) => {
    const teamIds = useMemo(() => Object.keys(TEAM_DATA), []);

    const totalRounds = useMemo(() => {
        if (!draftPicks?.picks.length) return 0;
        return Math.max(...draftPicks.picks.map(p => p.round));
    }, [draftPicks]);

    const draftOrder = useMemo(
        () => generateSnakeDraftOrder(teamIds, totalRounds),
        [teamIds, totalRounds]
    );

    if (!draftPicks?.picks.length) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-3">
                    <p className="text-slate-500 text-sm font-bold ko-tight">드래프트 기록이 없습니다</p>
                    <p className="text-slate-600 text-xs ko-normal">커스텀 로스터 모드에서 드래프트를 진행하면 기록이 저장됩니다</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <DraftBoard
                teamIds={teamIds}
                totalRounds={totalRounds}
                picks={draftPicks.picks}
                currentPickIndex={draftOrder.length}
                draftOrder={draftOrder}
                userTeamId={myTeamId}
                positionColors={POSITION_COLORS}
            />
        </div>
    );
};

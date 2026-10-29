import React, { useMemo } from 'react';
import { TeamGameLog } from '../../roster/TeamGameLog';
import { Spinner } from '../../common/Spinner';
import type { TrainingLogRow } from '../../../services/multi/trainingService';
import type { Game, Team } from '../../../types';

// 트레이닝 기록 탭 [2026-10-29] — 팀 탭 경기 기록 표(TeamGameLog)를 그대로 쓴다.

interface TrainingLogPanelProps {
    myTeam: Team;
    allTeams: Team[];
    rows: TrainingLogRow[];
    loading: boolean;
    onOpenResult: (id: string) => void;
}

export const TrainingLogPanel: React.FC<TrainingLogPanelProps> = ({ myTeam, allTeams, rows, loading, onOpenResult }) => {
    // 우리 팀 = 홈("vs")으로 두고 Game 형태로 바꿔 TeamGameLog에 넘긴다(my_stats = 팀 박스 합계)
    const schedule = useMemo(() => rows.map(r => ({
        id: r.id,
        date: r.virtual_date,
        homeTeamId: myTeam.id,
        awayTeamId: r.opponent_team_id,
        played: true,
        isPlayoff: r.is_playoff,
        homeScore: r.my_score,
        awayScore: r.opp_score,
        homeStats: r.my_stats,
    })) as unknown as Game[], [rows, myTeam.id]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="px-6 py-3 min-h-14 bg-slate-800 border-b border-slate-600 flex items-center shrink-0">
                <span className="text-base font-black text-white">트레이닝 기록</span>
            </div>
            <div className="flex-1 min-h-0">
                {loading ? <Spinner variant="section" /> : (
                    <TeamGameLog
                        team={myTeam}
                        schedule={schedule}
                        allTeams={allTeams}
                        onViewGameResult={() => {}}
                        onScoreClick={onOpenResult}
                        emptyTitle="트레이닝 기록이 없습니다."
                        flat
                    />
                )}
            </div>
        </div>
    );
};

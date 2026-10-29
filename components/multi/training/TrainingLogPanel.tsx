import React, { useMemo } from 'react';
import { TeamGameLog } from '../../roster/TeamGameLog';
import { Spinner } from '../../common/Spinner';
import { TRAINING_OFFENSE_PRESETS, TRAINING_DEFENSE_PRESETS } from '../../../services/multi/trainingPresets';
import type { TrainingLogRow } from '../../../services/multi/trainingService';
import type { Game, Team } from '../../../types';

// 트레이닝 기록 탭 [2026-10-29] — 팀 탭 경기 기록 표(TeamGameLog)를 그대로 쓴다. 상대 이름 옆에 상대 전술 프리셋.

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

    const presetLabelById = useMemo(() => {
        const off = new Map<string, string>(TRAINING_OFFENSE_PRESETS.map(p => [p.id, p.label]));
        const def = new Map<string, string>(TRAINING_DEFENSE_PRESETS.map(p => [p.id, p.label]));
        return Object.fromEntries(rows.map(r => [r.id, `${off.get(r.offense_preset) ?? r.offense_preset} / ${def.get(r.defense_preset) ?? r.defense_preset}`]));
    }, [rows]);

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
                        oppSubLabelByGameId={presetLabelById}
                    />
                )}
            </div>
        </div>
    );
};


import React from 'react';
import { Loader2 } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { resolveRealAt } from './multiGameReveal';
import { PostseasonBracket } from './PostseasonBracket';

// 사이드바의 "플레이오프" 메뉴(league.bracket_data가 존재하는 main_league에서만 노출)에
// 매핑된 전용 화면. "리그 순위"(MultiStandingsView)에는 정규시즌 순위만 남기고, 플레이오프
// 브라켓은 이 화면으로 완전히 분리했다.
const MultiPlayoffsView: React.FC = () => {
    const { league, isLoading: leagueLoading } = useLeagueContext();
    const { isLoading: gameLoading, schedule, myTeamId } = useSeasonContext();

    const isLoading = leagueLoading || gameLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    // schedule은 서버가 game_seq(압축 인덱스)로만 채워 저장 — scheduledAt이 없으면
    // multiGameReveal의 isStarted/isFinal이 played 값에만 의존해 경기가 항상 'scheduled'로
    // 묶여버린다. MultiStandingsView/MultiScheduleView와 동일하게 정규화한다.
    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    const normalizedSchedule = schedule.map(g => ({
        ...g,
        scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt,
    }));

    return (
        <PostseasonBracket
            bracketData={league?.bracket_data ?? null}
            schedule={normalizedSchedule}
            myTeamId={myTeamId}
        />
    );
};

export default MultiPlayoffsView;

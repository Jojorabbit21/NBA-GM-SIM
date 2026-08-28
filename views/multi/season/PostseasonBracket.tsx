
import React from 'react';
import { Network } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import TournamentBracketView from './TournamentBracketView';

// tournament 타입 리그(단일 브라켓)와 main_league의 플레이오프 브라켓(MultiPlayoffsView)이
// 공유하는 브라켓 렌더러. MultiStandingsView.tsx에 있던 로컬 컴포넌트를 분리한 것 —
// "리그 순위" 메뉴와 "플레이오프" 메뉴를 별도 화면으로 나누면서 둘 다 재사용한다.
export const PostseasonBracket: React.FC<{
    bracketData: unknown | null;
    schedule: ReturnType<typeof useMultiGameData>['schedule'];
    myTeamId: string | null;
}> = ({ bracketData, schedule, myTeamId }) => {
    const { leagueTeams } = useLeagueContext();
    const bracket = bracketData as { series: ReturnType<typeof useMultiGameData>['playoffSeries'] } | null;
    // round:0은 컨퍼런스별 플레이인 미니시리즈(playInSeeder.ts) — 표준 브라켓 그리드 레이아웃
    // 계산(TournamentBracketView의 matchIndex/열 배치)은 round>=1의 T_R{round}_M{idx} 트리
    // 구조만 가정하므로, 여기서 걸러내고 본선 브라켓만 넘긴다. 플레이인 경기 자체는 일정
    // 화면(스케줄)에는 일반 경기와 동일하게 그대로 노출된다.
    const series = (bracket?.series ?? []).filter(s => s.round >= 1);

    if (!series.length) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-slate-200 pretendard">
                <Network size={40} className="text-slate-600" />
                <div className="text-center">
                    <h2 className="text-lg font-black text-slate-300 ko-tight">플레이오프 브라켓</h2>
                    <p className="text-sm text-slate-500 ko-normal mt-1">브라켓 데이터가 아직 없습니다.</p>
                </div>
            </div>
        );
    }

    return (
        <TournamentBracketView
            series={series}
            schedule={schedule}
            leagueTeams={leagueTeams}
            myTeamId={myTeamId}
        />
    );
};

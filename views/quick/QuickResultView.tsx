import React from 'react';
import { RotateCcw, Home } from 'lucide-react';
import type { SimulationResult } from '../../types';
import type { Team } from '../../types';
import { GameResultView } from '../GameResultView';

interface QuickResultViewProps {
    result: SimulationResult;
    homeTeam: Team;
    awayTeam: Team;
    onReplay: () => void;
    onHome: () => void;
}

export const QuickResultView: React.FC<QuickResultViewProps> = ({
    result, homeTeam, awayTeam, onReplay, onHome,
}) => {
    const resultProps = {
        home: homeTeam,
        away: awayTeam,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        homeBox: result.homeBox,
        awayBox: result.awayBox,
        recap: [],
        otherGames: [],
        homeTactics: result.homeTactics,
        awayTactics: result.awayTactics,
        myTeamId: homeTeam.id,
        pbpLogs: result.pbpLogs,
        rotationData: result.rotationData,
        pbpShotEvents: result.pbpShotEvents,
        injuries: result.injuries,
    };

    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col z-50">
            {/* 상단 액션 바 */}
            <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
                <button
                    onClick={onHome}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold"
                >
                    <Home size={14} /> 로비로
                </button>
                <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">QUICK PLAY — 결과</span>
                <button
                    onClick={onReplay}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg transition-colors"
                >
                    <RotateCcw size={13} /> 다시 설정
                </button>
            </div>

            {/* GameResultView (flex-1로 나머지 채움) */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <GameResultView
                    result={resultProps}
                    myTeamId={homeTeam.id}
                    teams={[homeTeam, awayTeam]}
                    coachingData={null}
                    onFinish={onHome}
                    finishLabel="홈으로 이동"
                    onReplay={onReplay}
                />
            </div>
        </div>
    );
};

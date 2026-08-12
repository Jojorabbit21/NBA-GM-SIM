
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Team, Game } from '../../types';
import { fetchFullGameResult } from '../../services/queries';
import { getReadableTextColor } from '../../utils/colorContrast';

interface TeamScheduleCalendarProps {
    team: Team;
    schedule: Game[];
    allTeams: Team[];
    onViewGameResult?: (result: any) => void;
    onScoreClick?: (gameId: string) => void;
    userId?: string;
    /** 시뮬레이션 상의 현재 날짜(YYYY-MM-DD) — "오늘" 강조/초기 진입 월 계산 기준.
     *  미전달 시 실제 브라우저 날짜로 폴백(방어적 기본값일 뿐, 정상 경로에서는 항상 전달돼야 함). */
    currentSimDate?: string;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const TeamScheduleCalendar: React.FC<TeamScheduleCalendarProps> = ({ team, schedule, allTeams, onViewGameResult, onScoreClick, userId, currentSimDate }) => {
    const teamGames = useMemo(
        () => schedule.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id),
        [schedule, team.id],
    );

    const gamesByDate = useMemo(() => {
        const map = new Map<string, Game>();
        for (const g of teamGames) map.set(g.date.slice(0, 10), g);
        return map;
    }, [teamGames]);

    const todayStr = currentSimDate ?? new Date().toISOString().slice(0, 10);

    // 초기 진입 월: 다음 예정 경기가 있으면 그 달, 없으면 가장 최근 경기가 있었던 달, 그마저 없으면 이번 달
    const initialYM = useMemo((): [number, number] => {
        const upcoming = [...teamGames].filter(g => !g.played && g.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))[0];
        const target = upcoming ?? [...teamGames].sort((a, b) => b.date.localeCompare(a.date))[0];
        const d = target ? new Date(target.date.slice(0, 10) + 'T00:00:00') : new Date(todayStr + 'T00:00:00');
        return [d.getFullYear(), d.getMonth()];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamGames]);

    const [viewYM, setViewYM] = useState<[number, number]>(initialYM);
    const [fetchingGameId, setFetchingGameId] = useState<string | null>(null);
    const [vy, vm] = viewYM;

    const cells = useMemo(() => {
        const firstWeekday = new Date(vy, vm, 1).getDay();
        const daysInMonth = new Date(vy, vm + 1, 0).getDate();
        const list: (number | null)[] = [
            ...Array.from({ length: firstWeekday }, () => null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];
        while (list.length % 7 !== 0) list.push(null);
        return list;
    }, [vy, vm]);

    const handleGameClick = async (game: Game) => {
        // onScoreClick(게임 상세/중계 화면)이 있으면 경기 진행 상태와 무관하게 그리로 보낸다 —
        // 멀티플레이어는 MultiGamePbpView가 scheduled/live/final을 전부 한 화면에서 처리.
        if (onScoreClick) { onScoreClick(game.id); return; }
        // onScoreClick이 없는 경로(예: 싱글플레이)는 완료된 경기의 박스스코어 조회만 지원 —
        // 예정 경기를 미리 볼 수 있는 화면이 싱글플레이엔 없음.
        if (!game.played) return;
        if (!onViewGameResult || !userId || fetchingGameId) return;
        setFetchingGameId(game.id);
        try {
            const raw = await fetchFullGameResult(game.id, userId);
            if (!raw) return;
            const homeTeam = allTeams.find(t => t.id === (raw as any).home_team_id);
            const awayTeam = allTeams.find(t => t.id === (raw as any).away_team_id);
            if (!homeTeam || !awayTeam) return;
            onViewGameResult({
                gameId: game.id,
                home: homeTeam, away: awayTeam,
                homeScore: (raw as any).home_score, awayScore: (raw as any).away_score,
                homeBox: (raw as any).box_score?.home || [], awayBox: (raw as any).box_score?.away || [],
                homeTactics: (raw as any).tactics?.home, awayTactics: (raw as any).tactics?.away,
                pbpLogs: (raw as any).pbp_logs || [], pbpShotEvents: (raw as any).shot_events || [],
                rotationData: (raw as any).rotation_data,
                quarterScoresData: (raw as any).quarter_scores,
                otherGames: [], date: (raw as any).date, recap: [],
            });
        } finally {
            setFetchingGameId(null);
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="px-12 py-3 border-b border-slate-800 bg-slate-900 shrink-0">
              <div className="max-w-4xl mx-auto flex items-center justify-between">
                <button
                    onClick={() => setViewYM(vm === 0 ? [vy - 1, 11] : [vy, vm - 1])}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                    <ChevronLeft size={16} />
                </button>
                <span className="text-base font-bold text-white tabular-nums">{vy}년 {vm + 1}월</span>
                <button
                    onClick={() => setViewYM(vm === 11 ? [vy + 1, 0] : [vy, vm + 1])}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                    <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-hide px-12 pb-4">
              <div className="max-w-4xl mx-auto bg-slate-900 p-4">
                <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                    {WEEKDAYS.map(d => (
                        <div key={d} className="text-base font-bold text-slate-500 text-center py-1">{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                    {cells.map((day, i) => {
                        if (day === null) return <div key={i} className="aspect-square" />;
                        const dateKey = `${vy}-${String(vm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const game = gamesByDate.get(dateKey);
                        const isFetching = game ? fetchingGameId === game.id : false;

                        const isToday = dateKey === todayStr;

                        if (!game) {
                            return (
                                <div
                                    key={i}
                                    className={`aspect-square rounded-lg border border-slate-800/60 bg-slate-800/60 p-1.5 flex flex-col ${
                                        isToday ? 'ring-2 ring-yellow-400 ring-inset' : ''
                                    }`}
                                >
                                    <span className="text-base font-semibold text-slate-600 tabular-nums">{day}</span>
                                </div>
                            );
                        }

                        const isHome = game.homeTeamId === team.id;
                        const oppId = isHome ? game.awayTeamId : game.homeTeamId;
                        const oppTeam = allTeams.find(t => t.id === oppId);
                        const myScore = isHome ? game.homeScore : game.awayScore;
                        const oppScore = isHome ? game.awayScore : game.homeScore;

                        // 클릭 가능 조건: onScoreClick(경기 상세/중계 화면)이 있으면 예정 경기도 클릭
                        // 가능 — 없으면(싱글플레이) 완료된 경기의 박스스코어 조회만 가능.
                        const isClickable = !!onScoreClick || game.played;
                        const cellBg = oppTeam?.colorPrimary ?? undefined;
                        const cellText = getReadableTextColor(cellBg);

                        return (
                            <button
                                key={i}
                                onClick={() => handleGameClick(game)}
                                disabled={!isClickable || isFetching}
                                style={cellBg ? { backgroundColor: cellBg, color: cellText } : undefined}
                                className={`aspect-square rounded-lg border p-1.5 flex flex-col items-stretch overflow-hidden transition-all ${
                                    cellBg ? 'border-black/20' : 'border-slate-800 bg-slate-900/60'
                                } ${isClickable ? 'cursor-pointer hover:brightness-110' : 'cursor-default'} ${
                                    isToday ? 'ring-2 ring-yellow-400 ring-inset' : ''
                                }`}
                            >
                                <span className="text-base font-semibold tabular-nums text-left" style={{ color: cellText, opacity: cellBg ? 0.75 : 1 }}>{day}</span>
                                <div className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0">
                                    <span className="text-2xl font-black leading-none truncate max-w-full" style={{ color: cellText }}>
                                        {isHome ? 'vs' : '@'} {oppTeam?.abbr ?? oppId}
                                    </span>
                                    {game.played ? (
                                        <span className="text-xl font-black leading-none tabular-nums" style={{ color: cellText }}>
                                            {myScore}-{oppScore}
                                        </span>
                                    ) : (
                                        <span className="text-xl font-black leading-none tabular-nums" style={{ color: cellText }}>
                                            {game.time ?? '예정'}
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
              </div>
            </div>
        </div>
    );
};

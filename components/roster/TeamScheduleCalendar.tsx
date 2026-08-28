
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Team, Game, Player } from '../../types';
import { fetchFullGameResult } from '../../services/queries';
import { getReadableTextColor } from '../../utils/colorContrast';
import type { GameMvp } from '../../services/multi/gameLeadersCache';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';

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
    /** 좌측 리스트의 "최우수선수" 이름 클릭 → 선수 프로필로 이동. */
    onPlayerClick?: (player: Player, teamId?: string, teamName?: string) => void;
    /** 좌측 리스트의 "상대" 팀명 클릭 → 그 팀 화면으로 이동. */
    onTeamClick?: (teamId: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const TeamScheduleCalendar: React.FC<TeamScheduleCalendarProps> = ({ team, schedule, allTeams, onViewGameResult, onScoreClick, userId, currentSimDate, onPlayerClick, onTeamClick }) => {
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

    // 좌측 리스트는 현재 달력이 보여주는 달(viewYM)과 동일한 범위 — 날짜순 오름차순.
    const monthGames = useMemo(() => {
        const prefix = `${vy}-${String(vm + 1).padStart(2, '0')}`;
        return teamGames
            .filter(g => g.date.slice(0, 7) === prefix)
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [teamGames, vy, vm]);

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="px-6 py-3 border-b border-slate-800 bg-slate-900 shrink-0">
              <div className="flex items-center justify-center gap-4">
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

            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* 좌측: 날짜별 경기 리스트 — 우측 달력과 달리 컬러 카드가 아닌 단순 테이블 형식.
                  TeamGameLog.tsx의 날짜/구분/상대/결과/스코어 컬럼 스타일을 그대로 재사용. */}
              <div className="w-1/2 min-w-0 overflow-y-auto custom-scrollbar border-r border-slate-800">
                {monthGames.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-12">이 달엔 예정된 경기가 없습니다.</p>
                ) : (
                    <Table className="!rounded-none !border-x-0 !border-t-0" tableStyle={{ tableLayout: 'fixed', minWidth: '100%' }}>
                        <colgroup>
                            <col style={{ width: 64 }} />
                            <col style={{ width: 200 }} />
                            <col style={{ width: 56 }} />
                            <col style={{ width: 80 }} />
                            <col />
                        </colgroup>
                        <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                            <tr className="h-10 text-slate-500 text-sm font-black uppercase">
                                <TableHeaderCell className="border-r border-slate-800 bg-slate-950 text-center">날짜</TableHeaderCell>
                                <TableHeaderCell className="pl-4 border-r border-slate-800 bg-slate-950" align="left">상대</TableHeaderCell>
                                <TableHeaderCell className="border-r border-slate-800 bg-slate-950 text-center">결과</TableHeaderCell>
                                <TableHeaderCell className="border-r border-slate-800 bg-slate-950 text-center">스코어</TableHeaderCell>
                                <TableHeaderCell className="pl-4 bg-slate-950" align="left">최우수선수</TableHeaderCell>
                            </tr>
                        </TableHead>
                        <TableBody>
                            {monthGames.map(game => {
                                const dateKey = game.date.slice(0, 10);
                                const isHome = game.homeTeamId === team.id;
                                const oppId = isHome ? game.awayTeamId : game.homeTeamId;
                                const oppTeam = allTeams.find(t => t.id === oppId);
                                const myScore = isHome ? game.homeScore : game.awayScore;
                                const oppScore = isHome ? game.awayScore : game.homeScore;
                                const isFetching = fetchingGameId === game.id;
                                const isClickable = !!onScoreClick || game.played;
                                const isToday = dateKey === todayStr;
                                const isWin = game.played && myScore != null && oppScore != null && myScore > oppScore;

                                const mvp = (game as any).leaders?.mvp as GameMvp | undefined;
                                // MVP는 우리 팀/상대 팀 어느 쪽 선수든 될 수 있어 양 팀 로스터에서 찾는다.
                                const mvpTeam = mvp && team.roster.some(p => p.id === mvp.playerId) ? team : oppTeam;
                                const mvpPlayer = mvp ? mvpTeam?.roster.find(p => p.id === mvp.playerId) : undefined;

                                return (
                                    <TableRow key={game.id} className={`h-10 ${isToday ? 'bg-yellow-400/10' : ''}`}>
                                        <TableCell className="border-r border-slate-800/30 text-center align-middle text-sm">
                                            <span className="font-medium text-slate-400 tabular-nums">{dateKey.slice(5).replace('-', '/')}</span>
                                        </TableCell>
                                        <TableCell className="border-r border-slate-800/30 pl-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-slate-400 shrink-0">{isHome ? 'vs' : '@'}</span>
                                                <span
                                                    className={`text-sm font-semibold text-slate-300 uppercase truncate ${onTeamClick ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                                    onClick={onTeamClick ? () => onTeamClick(oppId) : undefined}
                                                >
                                                    {oppTeam?.name ?? oppId}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="border-r border-slate-800/30 text-center align-middle text-sm">
                                            {game.played ? (
                                                <span className={`font-medium ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>{isWin ? 'W' : 'L'}</span>
                                            ) : (
                                                <span className="text-slate-600">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="border-r border-slate-800/30 text-center align-middle text-sm">
                                            {isFetching ? (
                                                <Loader2 size={14} className="animate-spin text-indigo-400 mx-auto" />
                                            ) : game.played ? (
                                                <span
                                                    className={`font-medium tabular-nums ${isClickable ? 'cursor-pointer hover:underline' : ''} ${isWin ? 'text-emerald-300' : 'text-red-300'}`}
                                                    onClick={isClickable ? () => handleGameClick(game) : undefined}
                                                >
                                                    {myScore}-{oppScore}
                                                </span>
                                            ) : (
                                                <span
                                                    className={`font-medium tabular-nums text-slate-400 ${isClickable ? 'cursor-pointer hover:underline' : ''}`}
                                                    onClick={isClickable ? () => handleGameClick(game) : undefined}
                                                >
                                                    {game.time ?? '예정'}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell align="left" className="pl-4 align-middle text-sm">
                                            {game.played && mvp ? (
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span
                                                        className={`text-slate-200 shrink-0 ${mvpPlayer && onPlayerClick ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                                        onClick={mvpPlayer && onPlayerClick ? () => onPlayerClick(mvpPlayer, mvpTeam?.id, mvpTeam?.name) : undefined}
                                                    >
                                                        {mvp.name}
                                                    </span>
                                                    {mvp.stats.length > 0 && (
                                                        <span className="text-white truncate">
                                                            {mvp.stats.map(s => `${s.value} ${s.label}`).join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-600">-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
              </div>

              {/* 우측: 기존 월간 달력 */}
              <div className="w-1/2 min-w-0 overflow-y-auto custom-scrollbar-hide px-6 py-4">
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

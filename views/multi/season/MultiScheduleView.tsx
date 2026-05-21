
import React, { useMemo } from 'react';
import { Loader2, Tv } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import { useGame } from '../../../hooks/useGameContext';
import type { Game } from '../../../types';

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function fmtDayLabel(dateKey: string): string {
    const dt = new Date(dateKey + 'T00:00:00');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${days[dt.getDay()]})`;
}

function fmtDateShort(d: string): string {
    const dt = new Date(d.slice(0, 10) + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

// scheduledAt is stored as UTC ISO; convert to KST (+9h) for display
function fmtTime(g: Game): string {
    if (g.scheduledAt) {
        const utcMs = new Date(g.scheduledAt).getTime();
        const kstMs = utcMs + 9 * 60 * 60 * 1000;
        const kst   = new Date(kstMs);
        const h = kst.getUTCHours().toString().padStart(2, '0');
        const m = kst.getUTCMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }
    if (g.time) return g.time;
    return '—';
}

// ── 서브 컴포넌트 ──────────────────────────────────────────────────────────────

interface TeamCellProps {
    name: string;
    abbr: string;
    colorPrimary: string;
    colorSecondary: string;
    isMyTeam: boolean;
}

const TeamCell: React.FC<TeamCellProps> = ({ name, abbr, colorPrimary, colorSecondary, isMyTeam }) => (
    <div className="flex items-center gap-1.5 min-w-0">
        <div
            className="w-5 h-5 rounded text-[9px] font-black flex items-center justify-center shrink-0"
            style={{ backgroundColor: colorPrimary, color: colorSecondary }}
        >
            {abbr.slice(0, 2)}
        </div>
        <span className={`font-medium truncate text-xs ko-normal ${isMyTeam ? 'text-yellow-400 font-bold' : 'text-slate-300'}`}>
            {name}
        </span>
    </div>
);

// ── 메인 뷰 ───────────────────────────────────────────────────────────────────

const MultiScheduleView: React.FC = () => {
    const { leagueId }                                    = useParams<{ leagueId: string }>();
    const navigate                                         = useNavigate();
    const { room, leagueTeams, isLoading: leagueLoading } = useLeagueContext();
    const { session } = useGame();
    const { isLoading: gameLoading, schedule, myTeamId, currentSimDate } = useMultiGameData(session, room?.id ?? null);

    const isLoading = leagueLoading || gameLoading;

    const teamMap = useMemo(() => {
        const m: Record<string, typeof leagueTeams[number]> = {};
        for (const t of leagueTeams) m[t.team_slug] = t;
        return m;
    }, [leagueTeams]);

    const allGames = useMemo(() =>
        [...schedule].sort((a, b) => a.date.localeCompare(b.date)),
    [schedule]);

    // 일별 그룹
    const groupedByDay = useMemo(() => {
        const groups: { dateKey: string; label: string; games: Game[] }[] = [];
        for (const g of allGames) {
            const dateKey = g.date.slice(0, 10);
            const last = groups[groups.length - 1];
            if (last && last.dateKey === dateKey) {
                last.games.push(g);
            } else {
                groups.push({ dateKey, label: fmtDayLabel(dateKey), games: [g] });
            }
        }
        return groups;
    }, [allGames]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    const totalPlayed = allGames.filter(g => g.played).length;

    return (
        <div className="p-6 text-slate-200 pretendard">
            <div className="mb-6">
                <h1 className="text-xl font-black text-white ko-tight">시즌 일정</h1>
                <p className="text-sm text-slate-500 ko-normal mt-1">
                    전체 {allGames.length}경기 &nbsp;·&nbsp; 완료 {totalPlayed} &nbsp;·&nbsp; 잔여 {allGames.length - totalPlayed}
                </p>
            </div>

            <div className="flex flex-col gap-3">
                {groupedByDay.map(({ dateKey, label, games }) => {
                    const isToday = dateKey === currentSimDate;
                    return (
                        <div key={dateKey} className={`bg-slate-900 border rounded-lg overflow-hidden ${isToday ? 'border-indigo-700/60' : 'border-slate-800'}`}>

                            {/* 날짜 헤더 */}
                            <div className={`px-4 py-2 border-b flex items-center gap-2 ${isToday ? 'bg-indigo-900/30 border-indigo-800/60' : 'bg-slate-800/60 border-slate-700'}`}>
                                <span className={`text-xs font-bold ko-normal ${isToday ? 'text-indigo-300' : 'text-slate-300'}`}>{label}</span>
                                {isToday && <span className="text-[10px] font-bold text-indigo-400 bg-indigo-900/50 px-1.5 py-0.5 rounded ko-normal">오늘</span>}
                                <span className="text-[10px] text-slate-500 ko-normal ml-1">{games.length}경기</span>
                            </div>

                            {/* 컬럼 헤더 — 첫 날짜 그룹에만 표시 */}
                            <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 px-4 py-1.5 border-b border-slate-800/80 bg-slate-800/20">
                                <span className="text-[10px] font-bold text-slate-600 ko-normal">원정팀 vs 홈팀</span>
                                <span className="text-[10px] font-bold text-slate-600 ko-normal w-10 text-center">날짜</span>
                                <span className="text-[10px] font-bold text-slate-600 ko-normal w-12 text-center">시간</span>
                                <span className="text-[10px] font-bold text-slate-600 ko-normal w-10 text-center">상태</span>
                                <span className="text-[10px] font-bold text-slate-600 ko-normal w-16 text-center">스코어</span>
                                <span className="text-[10px] font-bold text-slate-600 ko-normal w-10 text-center">보기</span>
                            </div>

                            {/* 경기 행 */}
                            <div className="divide-y divide-slate-800/60">
                                {games.map(g => {
                                    const home    = teamMap[g.homeTeamId];
                                    const away    = teamMap[g.awayTeamId];
                                    const homeWon = g.played && g.homeScore != null && g.awayScore != null && g.homeScore > g.awayScore;

                                    const statusLabel = g.played ? '완료' : isToday ? '오늘' : '예정';
                                    const statusClass = g.played
                                        ? 'text-slate-500'
                                        : isToday ? 'text-indigo-400 font-semibold' : 'text-slate-600';

                                    return (
                                        <div
                                            key={g.id}
                                            className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 items-center px-4 py-2.5"
                                        >
                                            {/* 매치업: 원정팀 vs 홈팀 */}
                                            <div className="flex items-center gap-2 min-w-0">
                                                {away ? (
                                                    <TeamCell
                                                        name={away.team_name}
                                                        abbr={away.team_abbr}
                                                        colorPrimary={away.color_primary ?? '#334155'}
                                                        colorSecondary={away.color_secondary ?? '#fff'}
                                                        isMyTeam={g.awayTeamId === myTeamId}
                                                    />
                                                ) : (
                                                    <span className="text-xs text-slate-500">{g.awayTeamId}</span>
                                                )}
                                                <span className="text-[10px] text-slate-600 shrink-0 font-bold">vs</span>
                                                {home ? (
                                                    <TeamCell
                                                        name={home.team_name}
                                                        abbr={home.team_abbr}
                                                        colorPrimary={home.color_primary ?? '#334155'}
                                                        colorSecondary={home.color_secondary ?? '#fff'}
                                                        isMyTeam={g.homeTeamId === myTeamId}
                                                    />
                                                ) : (
                                                    <span className="text-xs text-slate-500">{g.homeTeamId}</span>
                                                )}
                                            </div>

                                            {/* 날짜 */}
                                            <span className="w-10 text-center font-mono text-[11px] text-slate-400">
                                                {fmtDateShort(g.date)}
                                            </span>

                                            {/* 시간 (KST) */}
                                            <span className="w-12 text-center font-mono text-[11px] text-slate-500">
                                                {fmtTime(g)}
                                            </span>

                                            {/* 상태 */}
                                            <span className={`w-10 text-center text-[11px] ko-normal ${statusClass}`}>
                                                {statusLabel}
                                            </span>

                                            {/* 스코어 (원정-홈 순) */}
                                            <div className="w-16 flex items-center justify-center gap-0.5 font-mono tabular-nums text-xs">
                                                {g.played && g.homeScore != null && g.awayScore != null ? (
                                                    <>
                                                        <span className={!homeWon ? 'text-white font-bold' : 'text-slate-500'}>{g.awayScore}</span>
                                                        <span className="text-slate-600 mx-0.5">-</span>
                                                        <span className={homeWon ? 'text-white font-bold' : 'text-slate-500'}>{g.homeScore}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-slate-700">—</span>
                                                )}
                                            </div>

                                            {/* 보기 버튼 */}
                                            <div className="w-10 flex justify-center">
                                                {g.played && (
                                                    <button
                                                        onClick={() => navigate(`/multi/leagues/${leagueId}/season/game/${g.id}`)}
                                                        className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors ko-normal"
                                                    >
                                                        <Tv size={11} />
                                                        보기
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MultiScheduleView;

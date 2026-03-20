
import React, { useEffect, useMemo, useState } from 'react';
import {
    LayoutDashboard, Mail, ArrowLeftRight, Users, Trophy,
    Briefcase, Heart, ChevronRight, TrendingUp,
} from 'lucide-react';
import { Team, Game, Player } from '../types';
import { OffseasonPhase } from '../types/app';
import { MessageListItem } from '../types/message';
import { computeStandingsStats } from '../utils/standingsStats';
import { calculatePlayerOvr } from '../utils/constants';
import { TEAM_DATA } from '../data/teamData';
import { fetchMessageList } from '../services/messageService';
import { TeamLogo } from '../components/common/TeamLogo';
import { getTeamTheme } from '../utils/teamTheme';

interface HomeViewProps {
    team: Team;
    teams: Team[];
    schedule: Game[];
    currentSimDate: string;
    unreadCount: number;
    offseasonPhase?: OffseasonPhase | null;
    seasonShort?: string;
    userId?: string;
    onNavigate: (view: string) => void;
    onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
    team,
    teams,
    schedule,
    currentSimDate,
    unreadCount,
    offseasonPhase,
    seasonShort,
    userId,
    onNavigate,
}) => {
    const [recentMessages, setRecentMessages] = useState<MessageListItem[]>([]);

    // 인박스 미리보기 fetch
    useEffect(() => {
        if (!userId || !team?.id) return;
        fetchMessageList(userId, team.id, 0, 3).then(setRecentMessages).catch(() => {});
    }, [userId, team?.id]);

    const teamData = TEAM_DATA[team.id];
    const teamColors = teamData?.colors ?? null;
    const theme = getTeamTheme(team.id, teamColors);

    // 순위 통계
    const standingsMap = useMemo(() => computeStandingsStats(teams, schedule), [teams, schedule]);
    const myStats = standingsMap[team.id];

    // 컨퍼런스별 순위 계산
    const { eastTop5, westTop5, myConferenceRank } = useMemo(() => {
        const east = teams
            .filter(t => (TEAM_DATA[t.id]?.conference ?? t.conference) === 'East')
            .sort((a, b) => {
                const ar = standingsMap[a.id]; const br = standingsMap[b.id];
                if (!ar || !br) return 0;
                return br.pct - ar.pct || br.wins - ar.wins;
            });
        const west = teams
            .filter(t => (TEAM_DATA[t.id]?.conference ?? t.conference) === 'West')
            .sort((a, b) => {
                const ar = standingsMap[a.id]; const br = standingsMap[b.id];
                if (!ar || !br) return 0;
                return br.pct - ar.pct || br.wins - ar.wins;
            });
        const myConf = (TEAM_DATA[team.id]?.conference ?? team.conference) === 'East' ? east : west;
        const rank = myConf.findIndex(t => t.id === team.id) + 1;
        return { eastTop5: east.slice(0, 5), westTop5: west.slice(0, 5), myConferenceRank: rank };
    }, [teams, standingsMap, team.id, team.conference]);

    // 최근 5경기
    const recentGames = useMemo(() => {
        return schedule
            .filter(g => (g.homeTeamId === team.id || g.awayTeamId === team.id) && g.played)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
    }, [schedule, team.id]);

    // 로스터 평균 OVR
    const avgOvr = useMemo(() => {
        if (!team.roster?.length) return 0;
        return Math.round(team.roster.reduce((s, p) => s + calculatePlayerOvr(p), 0) / team.roster.length);
    }, [team.roster]);

    // 리그 OVR 순위
    const ovrRank = useMemo(() => {
        const sorted = [...teams].sort((a, b) => {
            const ao = a.roster?.length ? Math.round(a.roster.reduce((s, p) => s + calculatePlayerOvr(p), 0) / a.roster.length) : 0;
            const bo = b.roster?.length ? Math.round(b.roster.reduce((s, p) => s + calculatePlayerOvr(p), 0) / b.roster.length) : 0;
            return bo - ao;
        });
        return sorted.findIndex(t => t.id === team.id) + 1;
    }, [teams, team.id]);

    // 부상자
    const injuredPlayers = useMemo(() =>
        team.roster?.filter(p => p.health === 'Injured') ?? [], [team.roster]);

    // L10
    const l10 = myStats?.l10 ?? { w: 0, l: 0 };
    const last10Games = useMemo(() => {
        return schedule
            .filter(g => (g.homeTeamId === team.id || g.awayTeamId === team.id) && g.played)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10)
            .reverse();
    }, [schedule, team.id]);

    // 날짜 포맷
    const formatDate = (d: string) => {
        const dt = new Date(d);
        return `${dt.getMonth() + 1}/${dt.getDate()}`;
    };

    // 경기 결과 계산
    const getGameResult = (g: Game) => {
        const isHome = g.homeTeamId === team.id;
        const myScore = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
        const oppScore = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
        const won = myScore > oppScore;
        const oppId = isHome ? g.awayTeamId : g.homeTeamId;
        const opp = teams.find(t => t.id === oppId);
        return { won, myScore, oppScore, opp, isHome };
    };

    // 순위 행 렌더
    const renderStandingRow = (t: Team, rank: number) => {
        const stats = standingsMap[t.id];
        const isMe = t.id === team.id;
        return (
            <div
                key={t.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all ${
                    isMe
                        ? 'bg-white/10 ring-1 ring-white/20'
                        : 'hover:bg-white/5'
                }`}
            >
                <span className={`w-4 text-center font-mono font-bold ${isMe ? 'text-white' : 'text-slate-500'}`}>{rank}</span>
                <TeamLogo teamId={t.id} size="xs" />
                <span className={`flex-1 font-bold truncate ${isMe ? 'text-white' : 'text-slate-300'}`}>
                    {TEAM_DATA[t.id]?.city ?? t.city}
                </span>
                <span className="font-mono text-slate-400 tabular-nums">
                    {stats ? `${stats.wins}-${stats.losses}` : `${t.wins}-${t.losses}`}
                </span>
            </div>
        );
    };

    if (!team) return null;

    const primaryColor = teamColors?.primary ?? '#4f46e5';

    return (
        <div className="h-full flex flex-col overflow-hidden text-slate-200 animate-in fade-in duration-500">

            {/* ── 헤더 배너 ── */}
            <div
                className="flex-shrink-0 flex items-center gap-5 px-8 py-5 border-b border-white/5"
                style={{ background: `linear-gradient(to right, ${primaryColor}25, transparent)` }}
            >
                <TeamLogo teamId={team.id} size="lg" />
                <div className="flex-1 min-w-0">
                    <div className="oswald font-black text-3xl uppercase tracking-wider text-white leading-tight">
                        {team.city} {team.name}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-400 font-bold">
                        <span>{team.wins}W - {team.losses}L</span>
                        <span className="text-slate-600">·</span>
                        <span>{(TEAM_DATA[team.id]?.conference ?? team.conference) === 'East' ? '동부' : '서부'} {myConferenceRank}위</span>
                        {myStats?.streak && myStats.streak !== '-' && (
                            <>
                                <span className="text-slate-600">·</span>
                                <span className={myStats.streak.startsWith('W') ? 'text-emerald-400' : 'text-red-400'}>
                                    {myStats.streak.startsWith('W') ? `${myStats.streak.slice(1)}연승` : `${myStats.streak.slice(1)}연패`}
                                </span>
                            </>
                        )}
                    </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                    <div className="font-bold text-slate-400">{currentSimDate}</div>
                    {seasonShort && <div className="mt-0.5">{seasonShort} 시즌</div>}
                    {offseasonPhase === 'FA_OPEN' && (
                        <div className="mt-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full text-xs font-bold">
                            FA 마켓 개방 중
                        </div>
                    )}
                </div>
            </div>

            {/* ── 메인 콘텐츠 ── */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <div className="flex gap-5 p-6 h-full items-start">

                    {/* ── 왼쪽 컬럼 ── */}
                    <div className="w-64 flex-shrink-0 flex flex-col gap-4">

                        {/* 팀 현황 카드 */}
                        <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800">
                            <div className="flex items-center gap-2 mb-4">
                                <TrendingUp size={14} className="text-indigo-400" />
                                <span className="text-xs font-black uppercase tracking-widest text-slate-400 oswald">팀 현황</span>
                            </div>

                            {/* OVR */}
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs text-slate-500">평균 OVR</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-black font-mono text-white">{avgOvr}</span>
                                    <span className="text-xs text-slate-500">리그 {ovrRank}위</span>
                                </div>
                            </div>

                            {/* L10 미니 칩 */}
                            <div className="mb-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs text-slate-500">최근 10경기</span>
                                    <span className="text-xs font-bold text-slate-300">{l10.w}승 {l10.l}패</span>
                                </div>
                                <div className="flex gap-1">
                                    {last10Games.map((g, i) => {
                                        const isHome = g.homeTeamId === team.id;
                                        const myScore = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
                                        const oppScore = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
                                        const won = myScore > oppScore;
                                        return (
                                            <div
                                                key={i}
                                                className={`flex-1 h-3 rounded-sm ${won ? 'bg-emerald-500' : 'bg-red-500/60'}`}
                                                title={won ? 'W' : 'L'}
                                            />
                                        );
                                    })}
                                    {Array.from({ length: Math.max(0, 10 - last10Games.length) }).map((_, i) => (
                                        <div key={`empty-${i}`} className="flex-1 h-3 rounded-sm bg-slate-700/40" />
                                    ))}
                                </div>
                            </div>

                            {/* 홈/원정 */}
                            {myStats && (
                                <div className="flex gap-3 text-xs">
                                    <div className="flex-1 text-center bg-slate-800 rounded-xl py-2">
                                        <div className="text-slate-500 mb-0.5">홈</div>
                                        <div className="font-bold text-white">{myStats.home.w}-{myStats.home.l}</div>
                                    </div>
                                    <div className="flex-1 text-center bg-slate-800 rounded-xl py-2">
                                        <div className="text-slate-500 mb-0.5">원정</div>
                                        <div className="font-bold text-white">{myStats.away.w}-{myStats.away.l}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 부상 리포트 카드 */}
                        <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800">
                            <div className="flex items-center gap-2 mb-4">
                                <Heart size={14} className="text-red-400" />
                                <span className="text-xs font-black uppercase tracking-widest text-slate-400 oswald">부상 리포트</span>
                            </div>

                            {injuredPlayers.length === 0 ? (
                                <div className="text-xs text-emerald-400 font-bold text-center py-2">
                                    전원 건강 상태 양호
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {injuredPlayers.slice(0, 3).map(p => (
                                        <div key={p.id} className="flex items-center justify-between text-xs">
                                            <div>
                                                <span className="font-bold text-white">{p.name}</span>
                                                <span className="text-slate-500 ml-1">{p.position}</span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-red-400 font-bold">{(p as any).injuryType ?? 'Injured'}</div>
                                                {(p as any).returnDate && (
                                                    <div className="text-slate-500">{(p as any).returnDate} 복귀</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {injuredPlayers.length > 3 && (
                                        <div className="text-xs text-slate-500 text-center">+{injuredPlayers.length - 3}명 더</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 빠른 액션 */}
                        <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800">
                            <div className="text-xs font-black uppercase tracking-widest text-slate-400 oswald mb-4">빠른 액션</div>
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { label: '라커룸', view: 'Dashboard', icon: <LayoutDashboard size={18} /> },
                                    { label: '프론트 오피스', view: 'FrontOffice', icon: <Briefcase size={18} /> },
                                    { label: '받은 메세지', view: 'Inbox', icon: <Mail size={18} />, badge: unreadCount },
                                    { label: '트레이드', view: 'Transactions', icon: <ArrowLeftRight size={18} /> },
                                    { label: 'FA 시장', view: 'FAMarket', icon: <Users size={18} /> },
                                    { label: '리그 순위', view: 'Standings', icon: <Trophy size={18} /> },
                                ] as { label: string; view: string; icon: React.ReactNode; badge?: number }[]).map(({ label, view, icon, badge }) => (
                                    <button
                                        key={view}
                                        onClick={() => onNavigate(view)}
                                        className="relative bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all rounded-2xl p-3 flex flex-col items-center gap-1.5"
                                    >
                                        <span className="text-slate-300">{icon}</span>
                                        <span className="text-xs font-bold text-slate-300 text-center leading-tight">{label}</span>
                                        {badge != null && badge > 0 && (
                                            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                                {badge > 99 ? '99+' : badge}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── 오른쪽 컬럼 ── */}
                    <div className="flex-1 min-w-0 flex flex-col gap-4">

                        {/* 최근 5경기 결과 */}
                        <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-black uppercase tracking-widest text-slate-400 oswald">최근 경기 결과</span>
                                <button
                                    onClick={() => onNavigate('Schedule')}
                                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                                >
                                    리그 일정 <ChevronRight size={12} />
                                </button>
                            </div>

                            {recentGames.length === 0 ? (
                                <div className="text-xs text-slate-500 text-center py-4">아직 치른 경기가 없습니다</div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {recentGames.map(g => {
                                        const { won, myScore, oppScore, opp, isHome } = getGameResult(g);
                                        return (
                                            <div key={g.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors">
                                                <span className="text-xs text-slate-500 font-mono w-10">{formatDate(g.date)}</span>
                                                <span className="text-xs text-slate-600">{isHome ? 'vs' : '@'}</span>
                                                <TeamLogo teamId={opp?.id ?? ''} size="xs" />
                                                <span className="flex-1 text-xs text-slate-300 font-bold truncate">
                                                    {opp ? (TEAM_DATA[opp.id]?.city ?? opp.city) : '???'}
                                                </span>
                                                <span className="text-xs font-mono text-slate-300 tabular-nums">
                                                    {myScore} - {oppScore}
                                                </span>
                                                <span className={`text-xs font-black w-5 text-center ${won ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {won ? 'W' : 'L'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 리그 순위 스냅샷 */}
                        <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-black uppercase tracking-widest text-slate-400 oswald">리그 순위</span>
                                <button
                                    onClick={() => onNavigate('Standings')}
                                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                                >
                                    전체 순위 <ChevronRight size={12} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* 동부 */}
                                <div>
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 oswald">동부</div>
                                    <div className="flex flex-col gap-0.5">
                                        {eastTop5.map((t, i) => (
                                            <React.Fragment key={t.id}>
                                                {renderStandingRow(t, i + 1)}
                                                {i === 4 && (
                                                    <div className="border-t border-dashed border-yellow-500/30 my-1" />
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                                {/* 서부 */}
                                <div>
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 oswald">서부</div>
                                    <div className="flex flex-col gap-0.5">
                                        {westTop5.map((t, i) => (
                                            <React.Fragment key={t.id}>
                                                {renderStandingRow(t, i + 1)}
                                                {i === 4 && (
                                                    <div className="border-t border-dashed border-yellow-500/30 my-1" />
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 인박스 미리보기 */}
                        {userId && (
                            <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black uppercase tracking-widest text-slate-400 oswald">메시지함</span>
                                        {unreadCount > 0 && (
                                            <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                                {unreadCount > 99 ? '99+' : unreadCount}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => onNavigate('Inbox')}
                                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                                    >
                                        전체 보기 <ChevronRight size={12} />
                                    </button>
                                </div>

                                {recentMessages.length === 0 ? (
                                    <div className="text-xs text-slate-500 text-center py-3">새 메시지가 없습니다</div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {recentMessages.map(msg => (
                                            <div
                                                key={msg.id}
                                                onClick={() => onNavigate('Inbox')}
                                                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
                                            >
                                                {!msg.is_read && (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                                                )}
                                                {msg.is_read && <div className="w-1.5 flex-shrink-0" />}
                                                <span className={`flex-1 text-xs truncate ${msg.is_read ? 'text-slate-500' : 'text-white font-bold'}`}>
                                                    {msg.title}
                                                </span>
                                                <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">
                                                    {formatDate(msg.created_at)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

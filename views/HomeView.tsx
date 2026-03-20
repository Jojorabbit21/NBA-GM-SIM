
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Team, Game, Player } from '../types';
import { OffseasonPhase } from '../types/app';
import { MessageListItem } from '../types/message';
import { computeStandingsStats } from '../utils/standingsStats';
import { calculatePlayerOvr } from '../utils/constants';
import { TEAM_DATA } from '../data/teamData';
import { fetchMessageList } from '../services/messageService';
import { TeamLogo } from '../components/common/TeamLogo';

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

const SectionHeader: React.FC<{
    title: string;
    primaryColor: string;
    action?: { label: string; onClick: () => void };
}> = ({ title, primaryColor, action }) => (
    <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ backgroundColor: primaryColor }}>
        <span className="text-sm font-bold text-white">{title}</span>
        {action && (
            <button
                onClick={action.onClick}
                className="flex items-center gap-0.5 text-xs text-white/70 hover:text-white transition-colors"
            >
                {action.label} <ChevronRight size={12} />
            </button>
        )}
    </div>
);

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
    onViewPlayer,
}) => {
    const [recentMessages, setRecentMessages] = useState<MessageListItem[]>([]);

    useEffect(() => {
        if (!userId || !team?.id) return;
        fetchMessageList(userId, team.id, 0, 10).then(setRecentMessages).catch(() => {});
    }, [userId, team?.id]);

    const teamData = TEAM_DATA[team.id];
    const primaryColor = teamData?.colors?.primary ?? '#4f46e5';
    const myConference = teamData?.conference ?? team.conference;
    const teamFullName = teamData ? `${teamData.city} ${teamData.name}` : team.name;

    // 순위 통계
    const standingsMap = useMemo(() => computeStandingsStats(teams, schedule), [teams, schedule]);
    const myStats = standingsMap[team.id];
    const l10 = myStats?.l10 ?? { w: 0, l: 0 };

    // 컨퍼런스 순위 전체 (15팀)
    const conferenceTeams = useMemo(() => {
        return teams
            .filter(t => (TEAM_DATA[t.id]?.conference ?? t.conference) === myConference)
            .sort((a, b) => {
                const ar = standingsMap[a.id];
                const br = standingsMap[b.id];
                if (!ar || !br) return 0;
                return br.pct - ar.pct || br.wins - ar.wins;
            });
    }, [teams, standingsMap, myConference]);

    const myConferenceRank = conferenceTeams.findIndex(t => t.id === team.id) + 1;

    // 다음 경기
    const nextGame = useMemo(() => {
        return schedule
            .filter(g => (g.homeTeamId === team.id || g.awayTeamId === team.id) && !g.played)
            .sort((a, b) => a.date.localeCompare(b.date))[0];
    }, [schedule, team.id]);

    const nextOpponent = useMemo(() => {
        if (!nextGame) return undefined;
        const oppId = nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId;
        return teams.find(t => t.id === oppId);
    }, [nextGame, teams, team.id]);

    // 최근 10경기
    const last10Games = useMemo(() => {
        return schedule
            .filter(g => (g.homeTeamId === team.id || g.awayTeamId === team.id) && g.played)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);
    }, [schedule, team.id]);

    // 로스터 상위 8명 (OVR 기준)
    const topRoster = useMemo(() => {
        return [...(team.roster ?? [])]
            .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a))
            .slice(0, 8);
    }, [team.roster]);

    // 부상자
    const injuredPlayers = useMemo(() =>
        team.roster?.filter(p => p.health === 'Injured') ?? [], [team.roster]);

    // OVR
    const avgOvr = useMemo(() => {
        if (!team.roster?.length) return 0;
        return Math.round(team.roster.reduce((s, p) => s + calculatePlayerOvr(p), 0) / team.roster.length);
    }, [team.roster]);

    const ovrRank = useMemo(() => {
        const sorted = [...teams].sort((a, b) => {
            const ao = a.roster?.length ? Math.round(a.roster.reduce((s, p) => s + calculatePlayerOvr(p), 0) / a.roster.length) : 0;
            const bo = b.roster?.length ? Math.round(b.roster.reduce((s, p) => s + calculatePlayerOvr(p), 0) / b.roster.length) : 0;
            return bo - ao;
        });
        return sorted.findIndex(t => t.id === team.id) + 1;
    }, [teams, team.id]);

    // 총 페이롤
    const totalPayroll = useMemo(() => {
        return team.roster?.reduce((sum, p) => {
            const salary = (p as any).contract?.salary ?? (p as any).salary ?? 0;
            return sum + salary;
        }, 0) ?? 0;
    }, [team.roster]);

    // 유틸
    const formatDate = (d: string) => {
        const dt = new Date(d + 'T00:00:00');
        return `${dt.getMonth() + 1}/${dt.getDate()}`;
    };

    const formatDateKo = (d: string) => {
        const dt = new Date(d + 'T00:00:00');
        return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일`;
    };

    const getGameResult = (g: Game) => {
        const isHome = g.homeTeamId === team.id;
        const myScore = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
        const oppScore = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
        return {
            won: myScore > oppScore,
            myScore,
            oppScore,
            opp: teams.find(t => t.id === (isHome ? g.awayTeamId : g.homeTeamId)),
            isHome,
        };
    };

    const isNextGameHome = nextGame?.homeTeamId === team.id;
    const nextOppData = nextOpponent ? TEAM_DATA[nextOpponent.id] : null;

    if (!team) return null;

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="flex gap-4 p-4 items-start">

                {/* ── 좌 컬럼 ── */}
                <div className="w-[280px] shrink-0 flex flex-col gap-4">

                    {/* 다음 경기 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader title="다음 경기" primaryColor={primaryColor} />
                        <div className="p-4">
                            {nextGame && nextOpponent ? (
                                <div className="flex items-center gap-4">
                                    <TeamLogo teamId={nextOpponent.id} size="custom" className="w-12 h-12 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-white font-bold text-sm leading-5">
                                            {isNextGameHome ? 'vs' : '@'} {nextOppData ? `${nextOppData.city} ${nextOppData.name}` : nextOpponent.name}
                                        </div>
                                        <div className="text-slate-400 text-xs mt-1">{formatDateKo(nextGame.date)}</div>
                                        <div className="text-slate-500 text-xs mt-0.5">{isNextGameHome ? '홈 경기' : '원정 경기'}</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-slate-500 text-xs text-center py-2">남은 경기 없음</div>
                            )}
                        </div>
                    </div>

                    {/* 최근 10경기 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader
                            title="최근 10경기 성적"
                            primaryColor={primaryColor}
                            action={{ label: '리그 일정', onClick: () => onNavigate('Schedule') }}
                        />
                        <div className="p-4">
                            {/* W/L dot */}
                            <div className="flex gap-1 mb-2">
                                {[...last10Games].reverse().map((g, i) => {
                                    const isHome = g.homeTeamId === team.id;
                                    const my = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
                                    const opp = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
                                    return (
                                        <div key={i} className={`flex-1 h-2 rounded-full ${my > opp ? 'bg-emerald-500' : 'bg-red-500/70'}`} />
                                    );
                                })}
                                {Array.from({ length: Math.max(0, 10 - last10Games.length) }).map((_, i) => (
                                    <div key={`e-${i}`} className="flex-1 h-2 rounded-full bg-slate-700/40" />
                                ))}
                            </div>
                            <div className="text-xs text-slate-400 font-bold mb-3">{l10.w}승 {l10.l}패</div>

                            {last10Games.length === 0 ? (
                                <div className="text-slate-500 text-xs text-center py-1">아직 경기 결과 없음</div>
                            ) : (
                                <div className="flex flex-col">
                                    {last10Games.map(g => {
                                        const { won, myScore, oppScore, opp, isHome } = getGameResult(g);
                                        return (
                                            <div key={g.id} className="flex items-center gap-2 py-1.5 border-b border-slate-800/50 last:border-0 text-xs">
                                                <span className="text-slate-500 font-mono w-8 shrink-0">{formatDate(g.date)}</span>
                                                <TeamLogo teamId={opp?.id ?? ''} size="xs" />
                                                <span className="flex-1 text-slate-300 truncate">
                                                    {isHome ? 'vs' : '@'} {opp ? (TEAM_DATA[opp.id]?.name ?? opp.name) : '???'}
                                                </span>
                                                <span className="font-mono text-slate-400 tabular-nums">{myScore}-{oppScore}</span>
                                                <span className={`font-black w-4 text-center ${won ? 'text-emerald-400' : 'text-red-400'}`}>{won ? 'W' : 'L'}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 현재 순위 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader
                            title={`현재 순위 (${myConference === 'East' ? '동부' : '서부'})`}
                            primaryColor={primaryColor}
                            action={{ label: '전체', onClick: () => onNavigate('Standings') }}
                        />
                        <div className="py-1">
                            {conferenceTeams.map((t, i) => {
                                const stats = standingsMap[t.id];
                                const isMe = t.id === team.id;
                                return (
                                    <div
                                        key={t.id}
                                        className={`flex items-center gap-2 px-4 py-1.5 text-xs ${isMe ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                    >
                                        <span className={`w-4 font-mono font-bold shrink-0 text-center ${isMe ? 'text-white' : 'text-slate-500'}`}>{i + 1}</span>
                                        <TeamLogo teamId={t.id} size="xs" />
                                        <span className={`flex-1 font-bold truncate ${isMe ? 'text-white' : 'text-slate-300'}`}>
                                            {TEAM_DATA[t.id]?.name ?? t.name}
                                        </span>
                                        <span className="font-mono text-slate-400 tabular-nums">
                                            {stats ? `${stats.wins}-${stats.losses}` : `${t.wins}-${t.losses}`}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── 중앙 컬럼 ── */}
                <div className="flex-1 min-w-0 flex flex-col gap-4">

                    {/* 메일함 */}
                    {userId && (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <SectionHeader
                                title={`메일함${unreadCount > 0 ? ` (${unreadCount}개 미읽음)` : ''}`}
                                primaryColor={primaryColor}
                                action={{ label: '전체 보기', onClick: () => onNavigate('Inbox') }}
                            />
                            {recentMessages.length === 0 ? (
                                <div className="px-4 py-4 text-xs text-slate-500 text-center">새 메시지가 없습니다</div>
                            ) : (
                                <div>
                                    {recentMessages.map(msg => (
                                        <div
                                            key={msg.id}
                                            onClick={() => onNavigate('Inbox')}
                                            className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/50 last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
                                        >
                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${msg.is_read ? 'bg-transparent' : 'bg-indigo-400'}`} />
                                            <span className="text-slate-500 font-mono text-xs shrink-0 w-12">{formatDate(msg.created_at)}</span>
                                            <span className={`flex-1 text-sm truncate ${msg.is_read ? 'text-slate-500' : 'text-white font-bold'}`}>
                                                {msg.title}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 로스터 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader
                            title="로스터"
                            primaryColor={primaryColor}
                            action={{ label: '전체 보기', onClick: () => onNavigate('Dashboard') }}
                        />
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-800">
                                    <th className="text-left px-4 py-2 text-slate-500 font-bold">포지션</th>
                                    <th className="text-left px-4 py-2 text-slate-500 font-bold">이름</th>
                                    <th className="text-right px-4 py-2 text-slate-500 font-bold">OVR</th>
                                    <th className="text-right px-4 py-2 text-slate-500 font-bold">나이</th>
                                    <th className="text-right px-4 py-2 text-slate-500 font-bold">연봉</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topRoster.map(p => {
                                    const ovr = calculatePlayerOvr(p);
                                    const salary = (p as any).contract?.salary ?? (p as any).salary ?? 0;
                                    const salaryStr = salary > 0 ? `$${(salary / 1_000_000).toFixed(1)}M` : '–';
                                    return (
                                        <tr
                                            key={p.id}
                                            className="border-b border-slate-800/50 last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
                                            onClick={() => onViewPlayer(p, team.id, teamFullName)}
                                        >
                                            <td className="px-4 py-2 text-slate-400 font-bold">{p.position}</td>
                                            <td className="px-4 py-2 text-white font-semibold">{p.name}</td>
                                            <td className="px-4 py-2 text-right font-mono font-bold text-white">{ovr}</td>
                                            <td className="px-4 py-2 text-right font-mono text-slate-400">{(p as any).age ?? '–'}</td>
                                            <td className="px-4 py-2 text-right font-mono text-slate-400">{salaryStr}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── 우 컬럼 ── */}
                <div className="w-[260px] shrink-0 flex flex-col gap-4">

                    {/* 팀 스탯 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader title="팀 스탯" primaryColor={primaryColor} />
                        <div className="divide-y divide-slate-800/50">
                            {([
                                { label: '시즌 기록', value: `${team.wins}W - ${team.losses}L` },
                                { label: '승률', value: myStats ? `${(myStats.pct * 100).toFixed(1)}%` : '–' },
                                { label: `${myConference === 'East' ? '동부' : '서부'} 컨퍼런스 순위`, value: `${myConferenceRank}위` },
                                { label: '최근 10경기', value: `${l10.w}승 ${l10.l}패` },
                                { label: '홈 기록', value: myStats ? `${myStats.home.w}-${myStats.home.l}` : '–' },
                                { label: '원정 기록', value: myStats ? `${myStats.away.w}-${myStats.away.l}` : '–' },
                                { label: '평균 OVR', value: String(avgOvr) },
                                { label: 'OVR 리그 순위', value: `${ovrRank}위` },
                            ] as { label: string; value: string }[]).map(({ label, value }) => (
                                <div key={label} className="flex items-center justify-between px-4 py-2 text-xs">
                                    <span className="text-slate-400">{label}</span>
                                    <span className="text-white font-bold">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 부상자 명단 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader title="부상자 명단" primaryColor={primaryColor} />
                        {injuredPlayers.length === 0 ? (
                            <div className="px-4 py-3 text-xs text-emerald-400 font-bold text-center">전원 건강 상태 양호</div>
                        ) : (
                            <div className="divide-y divide-slate-800/50">
                                {injuredPlayers.map(p => (
                                    <div key={p.id} className="flex items-center justify-between px-4 py-2 text-xs">
                                        <div>
                                            <span className="text-slate-400 font-bold mr-1.5">{p.position}</span>
                                            <span className="text-white font-semibold">{p.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-red-400 font-bold">{(p as any).injuryType ?? 'Injured'}</div>
                                            {(p as any).returnDate && (
                                                <div className="text-slate-500">{(p as any).returnDate}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 재정 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader
                            title="재정"
                            primaryColor={primaryColor}
                            action={{ label: '프론트 오피스', onClick: () => onNavigate('FrontOffice') }}
                        />
                        <div className="divide-y divide-slate-800/50">
                            {([
                                {
                                    label: '총 페이롤',
                                    value: totalPayroll > 0 ? `$${(totalPayroll / 1_000_000).toFixed(1)}M` : '–',
                                },
                                { label: '로스터 인원', value: `${team.roster?.length ?? 0}명` },
                                {
                                    label: 'FA 시장',
                                    value: offseasonPhase === 'FA_OPEN' ? '개방 중' : '비시즌',
                                },
                            ] as { label: string; value: string }[]).map(({ label, value }) => (
                                <div key={label} className="flex items-center justify-between px-4 py-2 text-xs">
                                    <span className="text-slate-400">{label}</span>
                                    <span className={`font-bold ${label === 'FA 시장' && offseasonPhase === 'FA_OPEN' ? 'text-amber-400' : 'text-white'}`}>
                                        {value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

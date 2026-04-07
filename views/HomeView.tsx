
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { Team, Game, Player } from '../types';
import { DepthChart } from '../types/tactics';
import { OffseasonPhase } from '../types/app';
import { MessageListItem } from '../types/message';
import { SavedTeamFinances } from '../types/finance';
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
    teamFinances?: SavedTeamFinances | null;
    depthChart?: DepthChart | null;
    onNavigate: (view: string, messageId?: string) => void;
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
    teamFinances,
    depthChart,
    onNavigate,
    onViewPlayer,
}) => {
    const [recentMessages, setRecentMessages] = useState<MessageListItem[]>([]);
    const [inboxPage, setInboxPage] = useState(0);
    const INBOX_PAGE_SIZE = 5;

    useEffect(() => {
        if (!userId || !team?.id) return;
        fetchMessageList(userId, team.id, 0, 100)
            .then(msgs => setRecentMessages(msgs))
            .catch(() => {});
        setInboxPage(0);
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

    // 뎁스차트에 등록된 선수 (포지션 순서 유지, 중복 제거)
    const topRoster = useMemo(() => {
        const roster = team.roster ?? [];
        if (!depthChart) {
            return [...roster]
                .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a))
                .slice(0, 10);
        }
        const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        const seen = new Set<string>();
        const orderedIds: string[] = [];
        for (const pos of positions) {
            for (const id of depthChart[pos]) {
                if (id && !seen.has(id)) {
                    seen.add(id);
                    orderedIds.push(id);
                }
            }
        }
        const rosterMap = new Map(roster.map(p => [p.id, p]));
        return orderedIds.map(id => rosterMap.get(id)).filter(Boolean) as Player[];
    }, [team.roster, depthChart]);

    // 부상자
    const injuredPlayers = useMemo(() =>
        team.roster?.filter(p => p.health === 'Injured') ?? [], [team.roster]);

    // 팀 스탯 집계 (로스터 합산)
    const getTeamStatAggregates = (t: Team) => {
        const roster = t.roster ?? [];
        const g = Math.max(...roster.map(p => p.stats?.g ?? 0), 1);
        const pts  = roster.reduce((s, p) => s + (p.stats?.pts ?? 0), 0) / g;
        const reb  = roster.reduce((s, p) => s + (p.stats?.reb ?? 0), 0) / g;
        const ast  = roster.reduce((s, p) => s + (p.stats?.ast ?? 0), 0) / g;
        const stl  = roster.reduce((s, p) => s + (p.stats?.stl ?? 0), 0) / g;
        const blk  = roster.reduce((s, p) => s + (p.stats?.blk ?? 0), 0) / g;
        const fgm  = roster.reduce((s, p) => s + (p.stats?.fgm ?? 0), 0);
        const fga  = roster.reduce((s, p) => s + (p.stats?.fga ?? 0), 0);
        const p3m  = roster.reduce((s, p) => s + (p.stats?.p3m ?? 0), 0);
        const p3a  = roster.reduce((s, p) => s + (p.stats?.p3a ?? 0), 0);
        return { pts, reb, ast, stl, blk, fgPct: fga > 0 ? fgm / fga : 0, p3Pct: p3a > 0 ? p3m / p3a : 0 };
    };

    // 리그 순위 계산
    const leagueStatRanks = useMemo(() => {
        type StatKey = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'fgPct' | 'p3Pct';
        const allStats = teams.map(t => ({ id: t.id, ...getTeamStatAggregates(t) }));
        const rank = (key: StatKey) => {
            const sorted = [...allStats].sort((a, b) => b[key] - a[key]);
            return sorted.findIndex(s => s.id === team.id) + 1;
        };
        const my = allStats.find(s => s.id === team.id)!;
        return { my, pts: rank('pts'), reb: rank('reb'), ast: rank('ast'), stl: rank('stl'), blk: rank('blk'), fgPct: rank('fgPct'), p3Pct: rank('p3Pct') };
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
        const datePart = d.slice(0, 10);
        const dt = new Date(datePart + 'T00:00:00');
        return `${dt.getMonth() + 1}/${dt.getDate()}`;
    };

    const formatDateKo = (d: string) => {
        const datePart = d.slice(0, 10);
        const dt = new Date(datePart + 'T00:00:00');
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
                    <div className="bg-surface-card border border-border-dim rounded-lg overflow-hidden">
                        <SectionHeader title="다음 경기" primaryColor={primaryColor} />
                        <div className="p-4">
                            {nextGame && nextOpponent ? (
                                <div className="flex items-center gap-4">
                                    <TeamLogo teamId={nextOpponent.id} size="custom" className="w-12 h-12 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-text-primary font-bold text-sm leading-5">
                                            {isNextGameHome ? 'vs' : '@'} {nextOppData ? `${nextOppData.city} ${nextOppData.name}` : nextOpponent.name}
                                        </div>
                                        <div className="text-text-muted text-xs mt-1">{formatDateKo(nextGame.date)}</div>
                                        <div className="text-text-disabled text-xs mt-0.5">{isNextGameHome ? '홈 경기' : '원정 경기'}</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-text-disabled text-xs text-center py-2">남은 경기 없음</div>
                            )}
                        </div>
                    </div>

                    {/* 최근 10경기 */}
                    <div className="bg-surface-card border border-border-dim rounded-lg overflow-hidden">
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
                                        <div key={i} className={`flex-1 h-2 rounded-full ${my > opp ? 'bg-status-success-default' : 'bg-status-danger-default/70'}`} />
                                    );
                                })}
                                {Array.from({ length: Math.max(0, 10 - last10Games.length) }).map((_, i) => (
                                    <div key={`e-${i}`} className="flex-1 h-2 rounded-full bg-zinc-700/40" />
                                ))}
                            </div>
                            <div className="text-xs text-text-muted font-bold mb-3">{l10.w}승 {l10.l}패</div>

                            {last10Games.length === 0 ? (
                                <div className="text-text-disabled text-xs text-center py-1">아직 경기 결과 없음</div>
                            ) : (
                                <div className="flex flex-col">
                                    {last10Games.map(g => {
                                        const { won, myScore, oppScore, opp, isHome } = getGameResult(g);
                                        return (
                                            <div key={g.id} className="flex items-center gap-2 py-1.5 border-b border-border-dim last:border-0 text-xs">
                                                <span className="text-text-disabled font-mono w-8 shrink-0">{formatDate(g.date)}</span>
                                                <TeamLogo teamId={opp?.id ?? ''} size="xs" />
                                                <span className="flex-1 text-text-secondary truncate">
                                                    {isHome ? 'vs' : '@'} {opp ? (TEAM_DATA[opp.id]?.name ?? opp.name) : '???'}
                                                </span>
                                                <span className="font-mono text-text-muted tabular-nums">{myScore}-{oppScore}</span>
                                                <span className={`font-black w-4 text-center ${won ? 'text-status-success-text' : 'text-status-danger-text'}`}>{won ? 'W' : 'L'}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 현재 순위 */}
                    <div className="bg-surface-card border border-border-dim rounded-lg overflow-hidden">
                        <SectionHeader
                            title={`현재 순위 (${myConference === 'East' ? '동부' : '서부'})`}
                            primaryColor={primaryColor}
                            action={{ label: '전체', onClick: () => onNavigate('Standings') }}
                        />
                        <div className="py-1">
                            {(() => {
                                const myIdx = conferenceTeams.findIndex(t => t.id === team.id);
                                const start = Math.max(0, myIdx - 2);
                                const end = Math.min(conferenceTeams.length, myIdx + 3);
                                return conferenceTeams.slice(start, end).map((t, _, arr) => {
                                    const i = conferenceTeams.indexOf(t);
                                    const stats = standingsMap[t.id];
                                    const isMe = t.id === team.id;
                                    return (
                                        <div
                                            key={t.id}
                                            className={`flex items-center gap-2 px-4 py-1.5 text-xs ${isMe ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                        >
                                            <span className={`w-4 font-mono font-bold shrink-0 text-center ${isMe ? 'text-text-primary' : 'text-text-disabled'}`}>{i + 1}</span>
                                            <TeamLogo teamId={t.id} size="xs" />
                                            <span className={`flex-1 font-bold truncate ${isMe ? 'text-text-primary' : 'text-text-secondary'}`}>
                                                {TEAM_DATA[t.id]?.name ?? t.name}
                                            </span>
                                            <span className="font-mono text-text-muted tabular-nums">
                                                {stats ? `${stats.wins}-${stats.losses}` : `${t.wins}-${t.losses}`}
                                            </span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>

                {/* ── 중앙 컬럼 ── */}
                <div className="flex-1 min-w-0 flex flex-col gap-4">

                    {/* 메일함 */}
                    {userId && (
                        <div className="bg-surface-card border border-border-dim rounded-lg overflow-hidden">
                            <SectionHeader
                                title={`메일함${unreadCount > 0 ? ` (${unreadCount}개 미읽음)` : ''}`}
                                primaryColor={primaryColor}
                                action={{ label: '전체 보기', onClick: () => onNavigate('Inbox') }}
                            />
                            {recentMessages.length === 0 ? (
                                <div className="px-4 py-4 text-xs text-text-disabled text-center">새 메시지가 없습니다</div>
                            ) : (() => {
                                const totalPages = Math.ceil(recentMessages.length / INBOX_PAGE_SIZE);
                                const pageMessages = recentMessages.slice(inboxPage * INBOX_PAGE_SIZE, (inboxPage + 1) * INBOX_PAGE_SIZE);
                                return (
                                    <>
                                        <div>
                                            {pageMessages.map(msg => (
                                                <div
                                                    key={msg.id}
                                                    onClick={() => onNavigate('Inbox', msg.id)}
                                                    className="flex items-center gap-3 px-4 py-2.5 border-b border-border-dim last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
                                                >
                                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${msg.is_read ? 'bg-transparent' : 'bg-cta-border'}`} />
                                                    <span className="text-text-disabled font-mono text-xs shrink-0 w-12">{formatDate(msg.created_at)}</span>
                                                    <span className={`flex-1 text-sm truncate ${msg.is_read ? 'text-text-disabled' : 'text-text-primary font-bold'}`}>
                                                        {msg.title}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        {totalPages > 1 && (
                                            <div className="flex items-center justify-between px-4 py-2 border-t border-border-dim">
                                                <button
                                                    onClick={() => setInboxPage(p => Math.max(0, p - 1))}
                                                    disabled={inboxPage === 0}
                                                    className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    <ChevronLeft size={13} /> 이전
                                                </button>
                                                <span className="text-xs text-text-disabled">
                                                    {inboxPage + 1} / {totalPages}
                                                </span>
                                                <button
                                                    onClick={() => setInboxPage(p => Math.min(totalPages - 1, p + 1))}
                                                    disabled={inboxPage >= totalPages - 1}
                                                    className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    다음 <ChevronRight size={13} />
                                                </button>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {/* 로스터 */}
                    <div className="bg-surface-card border border-border-dim rounded-lg overflow-hidden">
                        <SectionHeader
                            title="로스터"
                            primaryColor={primaryColor}
                            action={{ label: '전체 보기', onClick: () => onNavigate('Dashboard') }}
                        />
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-border-dim">
                                    <th className="text-left px-4 py-2 text-text-muted font-semibold">포지션</th>
                                    <th className="text-left px-4 py-2 text-text-muted font-semibold">이름</th>
                                    <th className="text-right px-2 py-2 text-text-muted font-semibold">나이</th>
                                    <th className="text-right px-2 py-2 text-text-muted font-semibold">OVR</th>
                                    <th className="text-right px-2 py-2 text-text-muted font-semibold">PTS</th>
                                    <th className="text-right px-2 py-2 text-text-muted font-semibold">REB</th>
                                    <th className="text-right px-2 py-2 text-text-muted font-semibold">AST</th>
                                    <th className="text-right px-2 py-2 text-text-muted font-semibold">STL</th>
                                    <th className="text-right px-2 py-2 text-text-muted font-semibold">BLK</th>
                                    <th className="text-right px-2 py-2 text-text-muted font-semibold">FG%</th>
                                    <th className="text-right px-2 py-2 text-text-muted font-semibold">3P%</th>
                                    <th className="text-right px-4 py-2 text-text-muted font-semibold">연봉</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topRoster.map(p => {
                                    const ovr = calculatePlayerOvr(p);
                                    const salary = (p as any).contract?.salary ?? (p as any).salary ?? 0;
                                    const salaryStr = salary > 0 ? `$${(salary / 1_000_000).toFixed(1)}M` : '–';
                                    const g = p.stats?.g ?? 0;
                                    const pts = g > 0 ? (p.stats.pts / g).toFixed(1) : '–';
                                    const reb = g > 0 ? (p.stats.reb / g).toFixed(1) : '–';
                                    const ast = g > 0 ? (p.stats.ast / g).toFixed(1) : '–';
                                    const stl = g > 0 ? (p.stats.stl / g).toFixed(1) : '–';
                                    const blk = g > 0 ? (p.stats.blk / g).toFixed(1) : '–';
                                    const fgPct = p.stats?.fga > 0 ? `${(p.stats.fgm / p.stats.fga * 100).toFixed(1)}` : '–';
                                    const p3Pct = p.stats?.p3a > 0 ? `${(p.stats.p3m / p.stats.p3a * 100).toFixed(1)}` : '–';
                                    return (
                                        <tr
                                            key={p.id}
                                            className="border-b border-border-dim last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
                                            onClick={() => onViewPlayer(p, team.id, teamFullName)}
                                        >
                                            <td className="px-4 py-2 text-text-muted font-bold">{p.position}</td>
                                            <td className="px-4 py-2 text-text-primary font-semibold whitespace-nowrap">{p.name}</td>
                                            <td className="px-2 py-2 text-right font-mono text-text-muted">{(p as any).age ?? '–'}</td>
                                            <td className="px-2 py-2 text-right font-mono font-bold text-text-primary">{ovr}</td>
                                            <td className="px-2 py-2 text-right font-mono text-text-secondary">{pts}</td>
                                            <td className="px-2 py-2 text-right font-mono text-text-secondary">{reb}</td>
                                            <td className="px-2 py-2 text-right font-mono text-text-secondary">{ast}</td>
                                            <td className="px-2 py-2 text-right font-mono text-text-muted">{stl}</td>
                                            <td className="px-2 py-2 text-right font-mono text-text-muted">{blk}</td>
                                            <td className="px-2 py-2 text-right font-mono text-text-muted">{fgPct}</td>
                                            <td className="px-2 py-2 text-right font-mono text-text-muted">{p3Pct}</td>
                                            <td className="px-4 py-2 text-right font-mono text-text-muted">{salaryStr}</td>
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
                    <div className="bg-surface-card border border-border-dim rounded-lg overflow-hidden">
                        <SectionHeader title="팀 스탯" primaryColor={primaryColor} />
                        <div className="divide-y divide-border-dim">
                            {([
                                { label: '시즌 기록', value: `${team.wins}W - ${team.losses}L` },
                                { label: '승률', value: myStats ? `${(myStats.pct * 100).toFixed(1)}%` : '–' },
                                { label: `${myConference === 'East' ? '동부' : '서부'} 컨퍼런스 순위`, value: `${myConferenceRank}위` },
                                { label: '최근 10경기', value: `${l10.w}승 ${l10.l}패` },
                                { label: '홈 기록', value: myStats ? `${myStats.home.w}-${myStats.home.l}` : '–' },
                                { label: '원정 기록', value: myStats ? `${myStats.away.w}-${myStats.away.l}` : '–' },
                            ] as { label: string; value: string }[]).map(({ label, value }) => (
                                <div key={label} className="flex items-center justify-between px-4 py-2 text-xs">
                                    <span className="text-text-muted">{label}</span>
                                    <span className="text-text-primary font-bold">{value}</span>
                                </div>
                            ))}
                            {/* 리그 순위 스탯 */}
                            {leagueStatRanks && ([
                                { label: 'PTS', val: leagueStatRanks.my.pts.toFixed(1), rank: leagueStatRanks.pts },
                                { label: 'REB', val: leagueStatRanks.my.reb.toFixed(1), rank: leagueStatRanks.reb },
                                { label: 'AST', val: leagueStatRanks.my.ast.toFixed(1), rank: leagueStatRanks.ast },
                                { label: 'STL', val: leagueStatRanks.my.stl.toFixed(1), rank: leagueStatRanks.stl },
                                { label: 'BLK', val: leagueStatRanks.my.blk.toFixed(1), rank: leagueStatRanks.blk },
                                { label: 'FG%', val: `${(leagueStatRanks.my.fgPct * 100).toFixed(1)}%`, rank: leagueStatRanks.fgPct },
                                { label: '3P%', val: `${(leagueStatRanks.my.p3Pct * 100).toFixed(1)}%`, rank: leagueStatRanks.p3Pct },
                            ]).map(({ label, val, rank }) => (
                                <div key={label} className="flex items-center justify-between px-4 py-2 text-xs">
                                    <span className="text-text-muted">{label}</span>
                                    <span className="text-text-primary font-bold">
                                        {val}
                                        <span className="ml-1.5 text-text-disabled font-normal">({rank}위)</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 부상자 명단 */}
                    <div className="bg-surface-card border border-border-dim rounded-lg overflow-hidden">
                        <SectionHeader title="부상자 명단" primaryColor={primaryColor} />
                        {injuredPlayers.length === 0 ? (
                            <div className="px-4 py-3 text-xs text-status-success-text font-bold text-center">전원 건강 상태 양호</div>
                        ) : (
                            <div className="divide-y divide-border-dim">
                                {injuredPlayers.map(p => (
                                    <div key={p.id} className="flex items-center justify-between px-4 py-2 text-xs">
                                        <div>
                                            <span className="text-text-muted font-bold mr-1.5">{p.position}</span>
                                            <span className="text-text-primary font-semibold">{p.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-status-danger-text font-bold">{(p as any).injuryType ?? 'Injured'}</div>
                                            {(p as any).returnDate && (
                                                <div className="text-text-disabled">{(p as any).returnDate}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 재정 */}
                    <div className="bg-surface-card border border-border-dim rounded-lg overflow-hidden">
                        <SectionHeader
                            title="재정"
                            primaryColor={primaryColor}
                            action={{ label: '프론트 오피스', onClick: () => onNavigate('FrontOffice') }}
                        />
                        <div className="divide-y divide-border-dim">
                            {(() => {
                                const fin = teamFinances?.[team.id];
                                const gate = fin?.revenue?.gate ?? 0;
                                const merch = fin?.revenue?.merchandise ?? 0;
                                return ([
                                    {
                                        label: '총 페이롤',
                                        value: totalPayroll > 0 ? `$${(totalPayroll / 1_000_000).toFixed(1)}M` : '–',
                                        highlight: false,
                                    },
                                    { label: '로스터 인원', value: `${team.roster?.length ?? 0}명`, highlight: false },
                                    {
                                        label: 'FA 시장',
                                        value: offseasonPhase === 'FA_OPEN' ? '개방 중' : '비시즌',
                                        highlight: offseasonPhase === 'FA_OPEN',
                                    },
                                    {
                                        label: '티켓 수익',
                                        value: gate > 0 ? `$${(gate / 1_000_000).toFixed(1)}M` : '–',
                                        highlight: false,
                                    },
                                    {
                                        label: 'MD 판매 수익',
                                        value: merch > 0 ? `$${(merch / 1_000_000).toFixed(1)}M` : '–',
                                        highlight: false,
                                    },
                                ] as { label: string; value: string; highlight: boolean }[]).map(({ label, value, highlight }) => (
                                    <div key={label} className="flex items-center justify-between px-4 py-2 text-xs">
                                        <span className="text-text-muted">{label}</span>
                                        <span className={`font-bold ${highlight ? 'text-status-warning-text' : 'text-text-primary'}`}>
                                            {value}
                                        </span>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};


import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Timer, Trophy, Tv } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../views/multi/league/LeagueLayout';
import { useGame } from '../hooks/useGameContext';
import { useMultiGameData } from '../hooks/useMultiGameData';
import { useMultiSearchData } from '../hooks/useMultiSearchData';
import { resolveRealAt, isFinal, getGameDisplayState } from '../views/multi/season/multiGameReveal';
import { TeamLogo } from './common/TeamLogo';
import { MultiHeaderNavMenu } from './dashboard/MultiHeaderNavMenu';
import type { Player } from '../types';

function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function ordinal(n: number): string {
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return `${n}th`;
}

export const MultiHeader: React.FC = () => {
    const { league, room, leagueTeams, members } = useLeagueContext();
    const { session } = useGame();
    const { schedule } = useMultiGameData(session, room?.id ?? null);
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const base = `/multi/leagues/${leagueId}/season`;

    const myTeamId = useMemo(
        () => members.find(m => m.user_id === session?.user?.id)?.team_id ?? null,
        [members, session],
    );
    const myTeam = leagueTeams.find(t => t.team_slug === myTeamId);

    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;

    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    // W/L + 순위
    const { wins, losses, rank } = useMemo(() => {
        const wlMap: Record<string, { w: number; l: number }> = {};
        for (const g of schedule) {
            if (!g.played || g.homeScore == null || g.awayScore == null || g.isPlayoff) continue;
            if (!wlMap[g.homeTeamId]) wlMap[g.homeTeamId] = { w: 0, l: 0 };
            if (!wlMap[g.awayTeamId]) wlMap[g.awayTeamId] = { w: 0, l: 0 };
            const homeWon = g.homeScore > g.awayScore;
            wlMap[g.homeTeamId][homeWon ? 'w' : 'l']++;
            wlMap[g.awayTeamId][homeWon ? 'l' : 'w']++;
        }
        if (!myTeamId) return { wins: 0, losses: 0, rank: 0 };

        const myWL = wlMap[myTeamId] ?? { w: 0, l: 0 };
        const pct  = (t: { w: number; l: number }) =>
            t.w + t.l === 0 ? 0 : t.w / (t.w + t.l);

        const sorted = leagueTeams
            .map(t => ({ id: t.team_slug, ...(wlMap[t.team_slug] ?? { w: 0, l: 0 }) }))
            .sort((a, b) => pct(b) - pct(a) || b.w - a.w);

        return { wins: myWL.w, losses: myWL.l, rank: sorted.findIndex(t => t.id === myTeamId) + 1 };
    }, [schedule, myTeamId, leagueTeams]);

    // 내 팀 다음 경기
    const nextGame = useMemo(() => {
        if (!myTeamId || !simStart) return null;
        return [...schedule]
            .filter(g => !g.played && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId))
            .map(g => ({ ...g, resolvedAt: resolveRealAt(g, simStart, gprd) }))
            .filter(g => g.resolvedAt != null)
            .sort((a, b) => new Date(a.resolvedAt!).getTime() - new Date(b.resolvedAt!).getTime())[0] ?? null;
    }, [schedule, myTeamId, simStart, gprd]);

    const opponentId  = nextGame
        ? (nextGame.homeTeamId === myTeamId ? nextGame.awayTeamId : nextGame.homeTeamId)
        : null;
    const opponentTeam = leagueTeams.find(t => t.team_slug === opponentId);
    const isAway       = nextGame?.awayTeamId === myTeamId;

    // 카운트다운 색상 (남은 시간 기준)
    const countdownColor = useMemo(() => {
        if (!nextGame?.resolvedAt) return 'text-indigo-400';
        const diff = new Date(nextGame.resolvedAt).getTime() - nowMs;
        if (diff <= 0) return 'text-indigo-400';
        const totalSec = Math.floor(diff / 1000);
        if (totalSec > 3600) return 'text-indigo-400';   // 1시간 초과: 기본
        if (totalSec > 1800) return 'text-amber-400';    // 30분~1시간: 주의
        return 'text-red-400';                           // 30분 미만: 긴박
    }, [nextGame, nowMs]);

    // 카운트다운 문자열
    const countdown = useMemo(() => {
        if (!nextGame?.resolvedAt) return null;
        const diff = new Date(nextGame.resolvedAt).getTime() - nowMs;
        if (diff <= 0) return '경기 시작';
        const totalSec = Math.floor(diff / 1000);
        const d  = Math.floor(totalSec / 86400);
        const h  = Math.floor((totalSec % 86400) / 3600);
        const m  = Math.floor((totalSec % 3600) / 60);
        const s  = totalSec % 60;
        if (d > 0) return `${d}일 ${h}시간`;
        if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, [nextGame, nowMs]);

    // 내 팀의 현재 진행중(LIVE)인 경기 — played=true지만 리플레이 10분 공개창 안에 있는 경기.
    // nextGame은 !played만 찾으므로 이미 시뮬레이션된 LIVE 경기는 잡히지 않아 별도로 찾는다.
    const myLiveGame = useMemo(() => {
        if (!myTeamId) return null;
        return schedule.find(g => {
            if (!g.played || (g.homeTeamId !== myTeamId && g.awayTeamId !== myTeamId)) return false;
            const resolvedAt = resolveRealAt(g, simStart, gprd);
            return getGameDisplayState({ ...g, scheduledAt: resolvedAt }, nowMs) === 'live';
        }) ?? null;
    }, [schedule, myTeamId, simStart, gprd, nowMs]);

    const liveOpponentId   = myLiveGame
        ? (myLiveGame.homeTeamId === myTeamId ? myLiveGame.awayTeamId : myLiveGame.homeTeamId)
        : null;
    const liveOpponentTeam = leagueTeams.find(t => t.team_slug === liveOpponentId);
    const isLiveAway       = myLiveGame?.awayTeamId === myTeamId;

    const handleWatchLiveGame = useCallback(() => {
        if (!myLiveGame) return;
        navigate(`${base}/game/${myLiveGame.id}`);
    }, [navigate, base, myLiveGame]);

    // 시리즈 정보 (토너먼트 경기일 때)
    const seriesInfo = useMemo(() => {
        if (!nextGame?.isPlayoff || !nextGame.seriesId) return null;

        const allSeries: any[] = (league?.bracket_data as any)?.series ?? [];
        const s = allSeries.find((x: any) => x.id === nextGame.seriesId);
        if (!s) return null;

        const totalRounds = allSeries.reduce((max: number, x: any) => Math.max(max, x.round ?? 1), 1);
        const r = s.round ?? 1;
        const roundLabel = r === totalRounds ? '결승'
            : r === totalRounds - 1 && totalRounds > 2 ? '준결승'
            : `${r}라운드`;

        // schedule 기반 실시간 승수 계산 — 리플레이(10분) 공개 전 경기는 집계에서 제외.
        // 서버는 시뮬레이션 직후 bracket_data.series를 즉시 갱신하므로, played 여부만으로
        // 세면 아직 관전 화면에서는 진행중인 경기의 결과가 새어나간다.
        let myWins = 0, oppWins = 0;
        for (const g of schedule) {
            if (g.seriesId !== nextGame.seriesId || !g.played || g.homeScore == null || g.awayScore == null) continue;
            const resolvedAt = resolveRealAt(g, simStart, gprd);
            if (!isFinal({ ...g, scheduledAt: resolvedAt }, nowMs)) continue;
            const homeWon = g.homeScore > g.awayScore;
            const myHome  = g.homeTeamId === myTeamId;
            if ((myHome && homeWon) || (!myHome && !homeWon)) myWins++;
            else oppWins++;
        }
        return { roundLabel, myWins, oppWins, targetWins: s.targetWins ?? 1 };
    }, [nextGame, league, schedule, myTeamId, simStart, gprd, nowMs]);

    // 토너먼트 종료 여부 + 우승팀 (다음 경기가 없을 때 대체 표시용)
    // league.status==='finished'는 서버가 마지막 경기 시뮬 직후 즉시 세팅하므로, 그 경기의
    // 10분 리플레이가 끝나 isFinal이 되기 전까지는 우승자를 노출하지 않는다.
    const tournamentChampionId = useMemo(() => {
        if (league?.type !== 'tournament' || league?.status !== 'finished') return null;
        const allSeries: any[] = (league?.bracket_data as any)?.series ?? [];
        if (!allSeries.length) return null;
        const finalRound = Math.max(...allSeries.map((s: any) => s.round ?? 1));
        const final = allSeries.find((s: any) => s.round === finalRound && s.winnerId);
        if (!final) return null;

        let higherWins = 0, lowerWins = 0;
        for (const g of schedule) {
            if (g.seriesId !== final.id || !g.played || g.homeScore == null || g.awayScore == null) continue;
            const resolvedAt = resolveRealAt(g, simStart, gprd);
            if (!isFinal({ ...g, scheduledAt: resolvedAt }, nowMs)) continue;
            const homeWon = g.homeScore > g.awayScore;
            const winnerId = homeWon ? g.homeTeamId : g.awayTeamId;
            if (winnerId === final.higherSeedId) higherWins++; else lowerWins++;
        }
        const targetWins = final.targetWins ?? 1;
        if (higherWins >= targetWins) return final.higherSeedId;
        if (lowerWins >= targetWins) return final.lowerSeedId;
        return null;
    }, [league, schedule, simStart, gprd, nowMs]);
    const isMyTeamChampion = !!(tournamentChampionId && myTeamId && tournamentChampionId === myTeamId);

    const handleViewPlayer = useCallback((player: Player, teamSlug: string | null) => {
        navigate(`${base}/roster`, { state: { viewPlayer: player, viewTeamId: teamSlug } });
    }, [navigate, base]);

    const handleViewTeam = useCallback((teamSlug: string) => {
        navigate(`${base}/roster`, { state: { viewTeamId: teamSlug } });
    }, [navigate, base]);

    const primaryColor = myTeam?.color_primary ?? '#4338ca';
    const secondary    = myTeam?.color_secondary;
    const borderColor  = hexToRgba(secondary ?? primaryColor, 0.4);
    const gradient     = `linear-gradient(97.5deg, transparent 58%, ${hexToRgba(primaryColor, 0.25)} 89%)`;

    return (
        <div
            className="w-full sticky top-0 z-[100] flex items-center h-[80px] relative shrink-0"
            style={{ backgroundImage: gradient, borderBottom: `2px solid ${borderColor}` }}
        >
            <div className="absolute inset-0 backdrop-blur-[20px] bg-[rgba(0,0,0,0.1)] pointer-events-none" />

            {/* 왼쪽: 내 팀 정보 (싱글 DashboardHeader와 동일 구조) */}
            <div className="flex items-center gap-4 pl-8 flex-1 min-w-0 relative z-10">
                {myTeamId && (
                    <div
                        className="w-16 h-10 shrink-0 rounded flex items-center justify-center text-lg font-black"
                        style={{ backgroundColor: primaryColor, color: secondary ?? '#fff' }}
                    >
                        {myTeam?.team_abbr?.slice(0, 3) ?? myTeamId.toUpperCase()}
                    </div>
                )}
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xl font-semibold text-white leading-7 truncate">
                        {myTeam?.team_name ?? '내 팀'}
                    </span>
                    <div className="text-sm leading-5 truncate">
                        <span className="text-status-success-default font-medium">{wins}W-{losses}L</span>
                        {rank > 0 && <span className="text-text-muted"> {ordinal(rank)} in </span>}
                        <span className="text-text-muted">{league?.name ?? '—'}</span>
                    </div>
                </div>
            </div>

            {/* 중앙: 네비게이션 탭 + 검색창 */}
            <div className="absolute left-1/2 -translate-x-1/2 z-10">
                <MultiHeaderNavMenu
                    teamPrimaryColor={primaryColor}
                    leagueTeams={leagueTeams}
                    poolPlayers={poolPlayers}
                    rosterMap={rosterMap}
                    onViewPlayer={handleViewPlayer}
                    onViewTeam={handleViewTeam}
                />
            </div>

            {/* 오른쪽: 다음 경기 */}
            <div className="flex items-center pr-8 shrink-0 relative z-10">
                {myLiveGame ? (
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-1.5 leading-none">
                            <div className="flex items-center gap-1.5 text-xs text-red-400 font-bold">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                                </span>
                                <span>경기 진행중</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-base text-zinc-400 font-medium">
                                    {isLiveAway ? '@' : 'vs'}
                                </span>
                                {liveOpponentId && (
                                    <TeamLogo
                                        teamId={liveOpponentId}
                                        teamName={liveOpponentTeam?.team_name}
                                        size="custom"
                                        className="w-8 h-8"
                                    />
                                )}
                                <span className="text-xl font-semibold text-white">
                                    {liveOpponentTeam?.team_name ?? liveOpponentId ?? '—'}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={handleWatchLiveGame}
                            className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-95 shrink-0"
                        >
                            <Tv size={14} />
                            보기
                        </button>
                    </div>
                ) : nextGame && countdown ? (
                    <div className="flex flex-col items-end gap-1.5 leading-none">
                        {/* 상단: 다음 경기 · 스테이지 · 스코어 */}
                        <div className="flex items-center gap-1.5 text-xs text-white">
                            <span>다음 경기</span>
                            <span>·</span>
                            {seriesInfo ? (
                                <>
                                    <span>{seriesInfo.roundLabel}</span>
                                    {seriesInfo.targetWins > 1 && (
                                        <>
                                            <span>·</span>
                                            <span className="font-medium">
                                                {seriesInfo.myWins}-{seriesInfo.oppWins}
                                            </span>
                                        </>
                                    )}
                                </>
                            ) : (
                                <span>정규시즌</span>
                            )}
                        </div>

                        {/* 하단: vs/@ 로고 팀이름 | 타이머 */}
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-base text-zinc-400 font-medium">
                                    {isAway ? '@' : 'vs'}
                                </span>
                                {opponentId && (
                                    <TeamLogo
                                        teamId={opponentId}
                                        teamName={opponentTeam?.team_name}
                                        size="custom"
                                        className="w-8 h-8"
                                    />
                                )}
                                <span className="text-xl font-semibold text-white">
                                    {opponentTeam?.team_name ?? opponentId ?? '—'}
                                </span>
                            </div>
                            <div className="w-px h-7 bg-white/10 shrink-0" />
                            <div className={`flex items-center gap-1.5 ${countdownColor}`}>
                                <Timer size={14} />
                                <span className="text-base font-mono font-semibold tabular-nums">
                                    {countdown}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : tournamentChampionId ? (
                    <div className="flex items-center gap-2">
                        <Trophy size={16} className={isMyTeamChampion ? 'text-amber-400' : 'text-zinc-500'} />
                        <span className={`text-sm font-semibold ${isMyTeamChampion ? 'text-amber-400' : 'text-zinc-400'}`}>
                            {isMyTeamChampion ? '우승! 토너먼트 종료' : '토너먼트 종료'}
                        </span>
                    </div>
                ) : (
                    <span className="text-sm text-zinc-600">예정된 경기 없음</span>
                )}
            </div>
        </div>
    );
};

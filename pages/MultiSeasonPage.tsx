
import React, { useMemo, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ChevronRight } from 'lucide-react';
import { useLeagueContext } from '../views/multi/league/LeagueLayout';
import { useMultiGameData } from '../hooks/useMultiGameData';
import { useGame } from '../hooks/useGameContext';
import { supabase } from '../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import { OvrBadge } from '../components/common/OvrBadge';
import { useServerClock, getServerNow } from '../utils/serverClock';
import { computeWL } from '../views/multi/season/multiSeasonUtils';
import { isFinal, resolveRealAt } from '../views/multi/season/multiGameReveal';
import type { LeagueTeamRow } from '../services/multi/roomQueries';
import type { PlayerBoxScore } from '../types/engine';
import type { SavedPlayerState } from '../types/player';

// ─── 로스터 위젯 타입 ─────────────────────────────────────────────────────────

interface RosterWidgetPlayer {
    id: string;
    name: string;
    position: string;
    ovr: number;
    condition: number;
    health: 'Healthy' | 'Injured' | 'Day-to-Day';
    injuryType?: string;
    gamesPlayed: number;
    avgMp: number;
    avgPts: number;
    avgReb: number;
    avgAst: number;
    avgStl: number;
    avgBlk: number;
    avgTov: number;
    totalFgm: number;
    totalFga: number;
    totalP3m: number;
    totalP3a: number;
    totalFtm: number;
    totalFta: number;
    fgPct: number | null;
    p3Pct: number | null;
    tsPct: number | null;
}

// ─── 날짜 포맷 ────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
    const dt = new Date(d.slice(0, 10) + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

function fmtDateKo(d: string) {
    const dt = new Date(d.slice(0, 10) + 'T00:00:00');
    return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일`;
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{
    title: string;
    color: string;
    action?: { label: string; onClick: () => void };
}> = ({ title, color, action }) => (
    <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ backgroundColor: color }}>
        <span className="text-sm font-bold text-white ko-tight">{title}</span>
        {action && (
            <button
                onClick={action.onClick}
                className="flex items-center gap-0.5 text-xs text-white/70 hover:text-white transition-colors ko-normal"
            >
                {action.label} <ChevronRight size={12} />
            </button>
        )}
    </div>
);

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

const MultiSeasonPage: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const navigate     = useNavigate();
    const { league, room, leagueTeams, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const { session }  = useGame();

    const { isLoading: gameLoading, schedule, myTeamId } = useMultiGameData(session, room?.id ?? null);
    const serverNow = useServerClock();

    const isLoading = leagueLoading || gameLoading;

    const myTeam = leagueTeams.find(t => t.team_slug === myTeamId) ?? null;
    const primaryColor = myTeam?.color_primary ?? '#4f46e5';

    const [rosterPlayers, setRosterPlayers] = useState<RosterWidgetPlayer[]>([]);
    const rosterKey = myTeam?.roster?.join(',') ?? '';

    useEffect(() => {
        if (!myTeam?.roster?.length || !room?.id || !myTeamId) return;
        let cancelled = false;

        const fetchRosterData = async () => {
            const [playersRes, pbpRes, roomRes] = await Promise.all([
                supabase
                    .from('meta_players')
                    .select('id, name, position, base_attributes, tendencies')
                    .in('id', myTeam.roster),
                supabase
                    .from('game_pbp')
                    .select('home_box, away_box, home_team_id, game_start_time')
                    .eq('room_id', room.id)
                    .or(`home_team_id.eq.${myTeamId},away_team_id.eq.${myTeamId}`),
                supabase
                    .from('rooms')
                    .select('roster_state')
                    .eq('id', room.id)
                    .single(),
            ]);

            if (cancelled) return;

            const playerMap = new Map<string, ReturnType<typeof mapRawPlayerToRuntimePlayer>>();
            for (const raw of playersRes.data ?? []) {
                playerMap.set(String(raw.id), mapRawPlayerToRuntimePlayer(raw, useCustomOverrides, true));
            }

            // 정시+10분 경과 — final 상태인 경기만 집계 (live 구간 박스는 비공개)
            const statsMap = new Map<string, { pts: number; reb: number; ast: number; stl: number; blk: number; tov: number; fgm: number; fga: number; p3m: number; p3a: number; ftm: number; fta: number; mp: number; gp: number }>();
            const now = getServerNow();
            for (const game of pbpRes.data ?? []) {
                if (!isFinal({ scheduledAt: game.game_start_time }, now)) continue;
                const box = (game.home_team_id === myTeamId ? game.home_box : game.away_box) as PlayerBoxScore[] | null;
                for (const entry of box ?? []) {
                    if (entry.mp <= 0) continue;
                    const prev = statsMap.get(entry.playerId) ?? { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, mp: 0, gp: 0 };
                    statsMap.set(entry.playerId, {
                        pts: prev.pts + entry.pts,
                        reb: prev.reb + entry.reb,
                        ast: prev.ast + entry.ast,
                        stl: prev.stl + entry.stl,
                        blk: prev.blk + entry.blk,
                        tov: prev.tov + entry.tov,
                        fgm: prev.fgm + entry.fgm,
                        fga: prev.fga + entry.fga,
                        p3m: prev.p3m + entry.p3m,
                        p3a: prev.p3a + entry.p3a,
                        ftm: prev.ftm + entry.ftm,
                        fta: prev.fta + entry.fta,
                        mp:  prev.mp  + entry.mp,
                        gp:  prev.gp  + 1,
                    });
                }
            }

            const rosterState = ((roomRes.data as any)?.roster_state ?? {}) as Record<string, SavedPlayerState | number>;

            const players: RosterWidgetPlayer[] = myTeam.roster.map(id => {
                const p = playerMap.get(id);
                const stats = statsMap.get(id);
                const state = rosterState[id];
                const condition = typeof state === 'object' ? (state.condition ?? 100) : 100;
                const health = typeof state === 'object' ? (state.health ?? 'Healthy') : 'Healthy';
                const injuryType = typeof state === 'object' ? state.injuryType : undefined;
                const gp = stats?.gp ?? 0;
                return {
                    id,
                    name: p?.name ?? id,
                    position: p?.position ?? '-',
                    ovr: p?.ovr ?? 0,
                    condition,
                    health,
                    injuryType,
                    gamesPlayed: gp,
                    avgMp:  stats ? stats.mp  / gp : 0,
                    avgPts: stats ? stats.pts / gp : 0,
                    avgReb: stats ? stats.reb / gp : 0,
                    avgAst: stats ? stats.ast / gp : 0,
                    avgStl: stats ? stats.stl / gp : 0,
                    avgBlk: stats ? stats.blk / gp : 0,
                    avgTov: stats ? stats.tov / gp : 0,
                    totalFgm: stats?.fgm ?? 0,
                    totalFga: stats?.fga ?? 0,
                    totalP3m: stats?.p3m ?? 0,
                    totalP3a: stats?.p3a ?? 0,
                    totalFtm: stats?.ftm ?? 0,
                    totalFta: stats?.fta ?? 0,
                    fgPct:  stats && stats.fga > 0 ? stats.fgm / stats.fga * 100 : null,
                    p3Pct:  stats && stats.p3a > 0 ? stats.p3m / stats.p3a * 100 : null,
                    tsPct:  stats && (stats.fga + 0.44 * stats.fta) > 0
                        ? stats.pts / (2 * (stats.fga + 0.44 * stats.fta)) * 100
                        : null,
                };
            }).sort((a, b) => b.ovr - a.ovr);

            setRosterPlayers(players);
        };

        fetchRosterData();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rosterKey, room?.id, myTeamId, useCustomOverrides]);

    // schedule은 서버가 game_seq(압축 인덱스)로만 채워 저장 — scheduledAt이 없으면 multiGameReveal의
    // isFinal이 played 값에만 의존해 방금 시뮬된 경기의 결과가 정시+10분 전에도 그대로 노출된다
    // (리그 순위/최근 전적 스포일러 버그). MultiScheduleView/MultiStandingsView와 동일하게 정규화한다.
    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    const normalizedSchedule = useMemo(
        () => schedule.map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt })),
        [schedule, simStart, gprd],
    );

    const teamSlugs = useMemo(() => leagueTeams.map(t => t.team_slug), [leagueTeams]);
    const wlMap     = useMemo(() => computeWL(normalizedSchedule, teamSlugs, serverNow), [normalizedSchedule, teamSlugs, serverNow]);

    // 내 팀 다음 경기
    const nextGame = useMemo(() =>
        schedule
            .filter(g => !g.played && myTeamId && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId))
            .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
    [schedule, myTeamId]);

    const nextOpp = useMemo(() => {
        if (!nextGame || !myTeamId) return null;
        const oppSlug = nextGame.homeTeamId === myTeamId ? nextGame.awayTeamId : nextGame.homeTeamId;
        return leagueTeams.find(t => t.team_slug === oppSlug) ?? null;
    }, [nextGame, myTeamId, leagueTeams]);

    // 최근 10경기 (정시+10분 경과 — final 상태인 경기만)
    const recent10 = useMemo(() =>
        normalizedSchedule
            .filter(g => g.played && isFinal(g, serverNow) && myTeamId && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId))
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 10),
    [normalizedSchedule, myTeamId, serverNow]);

    // 순위 (W/L 기준 정렬)
    const standings = useMemo(() =>
        [...leagueTeams].sort((a, b) => {
            const aw = wlMap[a.team_slug]?.wins ?? 0;
            const bw = wlMap[b.team_slug]?.wins ?? 0;
            const al = wlMap[a.team_slug]?.losses ?? 0;
            const bl = wlMap[b.team_slug]?.losses ?? 0;
            const aTotal = aw + al;
            const bTotal = bw + bl;
            const aPct = aTotal > 0 ? aw / aTotal : 0;
            const bPct = bTotal > 0 ? bw / bTotal : 0;
            return bPct - aPct || bw - aw;
        }),
    [leagueTeams, wlMap]);

    const goTo = (sub: string) => navigate(`/multi/leagues/${leagueId}/season/${sub}`);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-950">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    if (!league || !myTeam) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-950">
                <p className="text-slate-400 text-sm ko-normal">리그 정보를 불러올 수 없습니다.</p>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-slate-950 text-slate-200 pretendard">

            {/* ── 3컬럼 본문 ── */}
            <div className="flex gap-4 p-4 items-start">

                {/* ── 좌 컬럼 ── */}
                <div className="w-[260px] shrink-0 flex flex-col gap-4">

                    {/* 다음 경기 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader title="다음 경기" color={primaryColor} />
                        <div className="p-4">
                            {nextGame && nextOpp ? (
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded flex items-center justify-center text-sm font-black shrink-0"
                                        style={{ backgroundColor: nextOpp.color_primary ?? '#334155', color: nextOpp.color_secondary ?? '#fff' }}
                                    >
                                        {nextOpp.team_abbr}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-bold text-sm leading-5 truncate ko-tight">
                                            {nextGame.homeTeamId === myTeamId ? 'vs' : '@'} {nextOpp.team_name}
                                        </p>
                                        <p className="text-slate-400 text-xs mt-0.5 ko-normal">{fmtDateKo(nextGame.date)}</p>
                                        <p className="text-slate-500 text-xs ko-normal">
                                            {nextGame.homeTeamId === myTeamId ? '홈 경기' : '원정 경기'}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-slate-500 text-xs text-center py-2 ko-normal">남은 경기 없음</p>
                            )}
                        </div>
                    </div>

                    {/* 최근 10경기 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader title="최근 성적" color={primaryColor} />
                        <div className="p-4">
                            <div className="flex gap-1 mb-2">
                                {[...recent10].reverse().map((g, i) => {
                                    const isHome = g.homeTeamId === myTeamId;
                                    const my  = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
                                    const opp = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
                                    return (
                                        <div
                                            key={i}
                                            className={`flex-1 h-2 rounded-full ${my > opp ? 'bg-green-500' : 'bg-red-500/70'}`}
                                        />
                                    );
                                })}
                                {Array.from({ length: Math.max(0, 10 - recent10.length) }).map((_, i) => (
                                    <div key={`e-${i}`} className="flex-1 h-2 rounded-full bg-slate-700/50" />
                                ))}
                            </div>
                            {recent10.length === 0 ? (
                                <p className="text-slate-500 text-xs text-center py-1 ko-normal">아직 경기 결과 없음</p>
                            ) : (
                                <div className="flex flex-col mt-2">
                                    {recent10.map(g => {
                                        const isHome = g.homeTeamId === myTeamId;
                                        const myScore  = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
                                        const oppScore = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
                                        const won = myScore > oppScore;
                                        const oppSlug = isHome ? g.awayTeamId : g.homeTeamId;
                                        const oppTeam = leagueTeams.find(t => t.team_slug === oppSlug);
                                        return (
                                            <div key={g.id} className="flex items-center gap-2 py-1.5 border-b border-slate-800 last:border-0 text-xs">
                                                <span className="text-slate-500 font-mono w-8 shrink-0">{fmtDate(g.date)}</span>
                                                <span className="flex-1 text-slate-300 truncate ko-normal">
                                                    {isHome ? 'vs' : '@'} {oppTeam?.team_abbr ?? oppSlug}
                                                </span>
                                                <span className="font-mono text-slate-400 tabular-nums">{myScore}-{oppScore}</span>
                                                <span className={`font-black w-4 text-center ${won ? 'text-green-400' : 'text-red-400'}`}>{won ? 'W' : 'L'}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 리그 순위 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader title="리그 순위" color={primaryColor} action={{ label: "전체 보기", onClick: () => goTo('standings') }} />
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-800">
                                    <th className="text-left px-3 py-2 text-slate-500 font-semibold w-6">#</th>
                                    <th className="text-left px-2 py-2 text-slate-500 font-semibold">팀</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold">W</th>
                                    <th className="text-right px-3 py-2 text-slate-500 font-semibold">L</th>
                                </tr>
                            </thead>
                            <tbody>
                                {standings.map((t, i) => {
                                    const wl  = wlMap[t.team_slug] ?? { wins: 0, losses: 0 };
                                    const isMe = t.team_slug === myTeamId;
                                    return (
                                        <tr key={t.id} className={`border-b border-slate-800 last:border-0 ${isMe ? 'bg-slate-800' : 'hover:bg-slate-800/40'}`}>
                                            <td className={`px-3 py-1.5 font-mono font-bold ${isMe ? 'text-white' : 'text-slate-500'}`}>{i + 1}</td>
                                            <td className="px-2 py-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`font-bold truncate ko-tight ${isMe ? 'text-white' : 'text-slate-300'}`}>{t.team_abbr}</span>
                                                    {t.is_ai && <span className="text-slate-600 text-[10px]">AI</span>}
                                                </div>
                                            </td>
                                            <td className="px-2 py-1.5 text-right font-mono text-slate-300">{wl.wins}</td>
                                            <td className="px-3 py-1.5 text-right font-mono text-slate-300">{wl.losses}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                </div>

                {/* ── 중앙 컬럼 — 로스터 위젯 ── */}
                <div className="flex-1 min-w-0">
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader
                            title="내 로스터"
                            color={primaryColor}
                            action={{ label: "전체 보기", onClick: () => goTo('roster') }}
                        />
                        <div className="overflow-x-auto">
                        <table className="w-full table-auto text-xs">
                            <thead>
                                <tr className="border-b border-slate-800">
                                    <th className="text-left px-3 py-2 text-slate-500 font-semibold">이름</th>
                                    <th className="text-center px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">POS</th>
                                    <th className="text-center px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">OVR</th>
                                    <th className="text-center px-3 py-2 text-slate-500 font-semibold whitespace-nowrap min-w-[56px]">체력</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">GP</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">MPG</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">PTS</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">REB</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">AST</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">STL</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">BLK</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">TOV</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">FGM</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">FGA</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">FG%</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">3PM</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">3PA</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">3P%</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">FTM</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">FTA</th>
                                    <th className="text-right px-2 py-2 text-slate-500 font-semibold whitespace-nowrap">TS%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rosterPlayers.length > 0 ? rosterPlayers.map(p => {
                                    const condColor = p.condition >= 80 ? 'bg-green-400' : p.condition >= 50 ? 'bg-yellow-400' : 'bg-red-400';
                                    const isInjured = p.health === 'Injured';
                                    const isDtd     = p.health === 'Day-to-Day';
                                    const hasStats  = p.gamesPlayed > 0;
                                    const stat = (v: number) => hasStats ? v.toFixed(1) : <span className="text-slate-700">—</span>;
                                    const pct  = (v: number | null) => v !== null ? v.toFixed(1) : <span className="text-slate-700">—</span>;
                                    return (
                                        <tr key={p.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/40">
                                            <td className="px-3 py-1.5 text-left min-w-[100px]">
                                                <div className="flex items-center gap-1.5">
                                                    {isInjured && <span className="text-red-400 shrink-0 text-[10px]">●</span>}
                                                    {isDtd     && <span className="text-yellow-400 shrink-0 text-[10px]">●</span>}
                                                    <span className={`ko-tight ${isInjured ? 'text-red-300' : isDtd ? 'text-yellow-300' : 'text-slate-300'}`}>{p.name}</span>
                                                </div>
                                                {isInjured && p.injuryType && (
                                                    <p className="text-[10px] text-red-400/70 ko-normal pl-3">{p.injuryType}</p>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 text-center text-slate-500 font-mono whitespace-nowrap">{p.position}</td>
                                            <td className="px-2 py-1.5 text-center whitespace-nowrap"><OvrBadge value={p.ovr} size="sm" className="mx-auto" /></td>
                                            <td className="px-3 py-1.5 text-center">
                                                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full ${condColor}`} style={{ width: `${p.condition}%` }} />
                                                </div>
                                            </td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{hasStats ? p.gamesPlayed : <span className="text-slate-700">—</span>}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{stat(p.avgMp)}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">{stat(p.avgPts)}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">{stat(p.avgReb)}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">{stat(p.avgAst)}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{stat(p.avgStl)}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{stat(p.avgBlk)}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{stat(p.avgTov)}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{hasStats ? p.totalFgm : <span className="text-slate-700">—</span>}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{hasStats ? p.totalFga : <span className="text-slate-700">—</span>}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{pct(p.fgPct)}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{hasStats ? p.totalP3m : <span className="text-slate-700">—</span>}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{hasStats ? p.totalP3a : <span className="text-slate-700">—</span>}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{pct(p.p3Pct)}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{hasStats ? p.totalFtm : <span className="text-slate-700">—</span>}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{hasStats ? p.totalFta : <span className="text-slate-700">—</span>}</td>
                                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">{pct(p.tsPct)}</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={21} className="px-4 py-6 text-center text-slate-600 ko-normal">
                                            <Loader2 size={14} className="animate-spin inline-block mr-1" />
                                            불러오는 중…
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        </div>
                    </div>
                </div>

                {/* ── 우 컬럼 ── */}
                <div className="w-[220px] shrink-0 flex flex-col gap-4">

                    {/* 메뉴 그리드 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader title="메뉴" color={primaryColor} />
                        <div className="p-2 grid grid-cols-2 gap-1.5">
                            {NAV_ITEMS.map(item => (
                                <button
                                    key={item.key}
                                    onClick={() => item.enabled ? goTo(item.key) : undefined}
                                    disabled={!item.enabled}
                                    className={`
                                        flex flex-col items-center justify-center gap-1 p-3 rounded-lg text-xs font-bold transition-colors
                                        ${item.enabled
                                            ? 'bg-slate-800 hover:bg-slate-700 text-white cursor-pointer'
                                            : 'bg-slate-800/40 text-slate-600 cursor-not-allowed'
                                        }
                                    `}
                                >
                                    <span className="ko-normal">{item.label}</span>
                                    {!item.enabled && <span className="text-[9px] text-slate-700 ko-normal">준비 중</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 팀 정보 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader title="내 팀 정보" color={primaryColor} />
                        <div className="p-4 space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-400 ko-normal">로스터</span>
                                <span className="text-white font-bold">{myTeam.roster.length}명</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 ko-normal">총 경기</span>
                                <span className="text-white font-bold">{schedule.filter(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId).length}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 ko-normal">남은 경기</span>
                                <span className="text-white font-bold">
                                    {/* !g.played만 보면 리플레이 공개(10분) 전에 시뮬 완료된 경기가 먼저 빠져
                                        "이미 결과가 나왔다"는 사실이 새어나간다 — isFinal로 게이팅한다. */}
                                    {normalizedSchedule.filter(g => !isFinal(g, serverNow) && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)).length}
                                </span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

// ─── 네비게이션 항목 ──────────────────────────────────────────────────────────

const NAV_ITEMS: { label: string; key: string; enabled: boolean }[] = [
    { label: '로스터',       key: 'roster',       enabled: true },
    { label: '일정',         key: 'schedule',     enabled: true },
    { label: '순위표',       key: 'standings',    enabled: true },
    { label: '전술',         key: 'tactics',      enabled: true },
    { label: '프론트 오피스', key: 'front-office', enabled: true },
    { label: 'FA 시장',      key: 'fa',           enabled: false },
];

export default MultiSeasonPage;

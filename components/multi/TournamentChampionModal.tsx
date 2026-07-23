
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Trophy, X, Loader2 } from 'lucide-react';
import { useLeagueContext } from '../../views/multi/league/LeagueLayout';
import { useGame } from '../../hooks/useGameContext';
import { useMultiGameData } from '../../hooks/useMultiGameData';
import { useServerClock } from '../../utils/serverClock';
import { resolveRealAt, isFinal } from '../../views/multi/season/multiGameReveal';
import { TeamLogo } from '../common/TeamLogo';
import { supabase } from '../../services/supabaseClient';
import type { PlayerBoxScore } from '../../types/engine';

interface BracketSeries {
    id: string;
    round: number;
    winnerId?: string;
    higherSeedId: string;
    lowerSeedId: string;
    higherSeedWins: number;
    lowerSeedWins: number;
    targetWins: number;
}

// TODO(테스트용): 지금은 확인 후에도 계속 다시 뜨도록 "한 번 봤으면 다시 안 뜸" 저장을 꺼둔 상태.
// 테스트 끝나면 이 상수를 true로 되돌리면 됨.
const PERSIST_DISMISSAL = false;

const CONFETTI_COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#facc15'];

interface ConfettiPiece {
    id: number;
    left: number;      // vw %
    delay: number;      // s
    duration: number;   // s
    color: string;
    size: number;       // px
    drift: number;      // px, 좌우 흔들림
    rotateStart: number;
}

function useConfettiPieces(count: number): ConfettiPiece[] {
    return useMemo(() => Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.6 + Math.random() * 1.8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 7,
        drift: (Math.random() - 0.5) * 160,
        rotateStart: Math.random() * 360,
    })), [count]);
}

const Confetti: React.FC = () => {
    const pieces = useConfettiPieces(90);

    return (
        <div className="fixed inset-0 z-[101] overflow-hidden pointer-events-none">
            <style>{`
                @keyframes confetti-fall {
                    0%   { transform: translate(0, -10vh) rotate(0deg); opacity: 1; }
                    100% { transform: translate(var(--drift), 110vh) rotate(600deg); opacity: 0.9; }
                }
            `}</style>
            {pieces.map(p => (
                <span
                    key={p.id}
                    style={{
                        position: 'absolute',
                        left: `${p.left}%`,
                        top: 0,
                        width: p.size,
                        height: p.size * 1.6,
                        backgroundColor: p.color,
                        borderRadius: 1,
                        // @ts-ignore custom property
                        '--drift': `${p.drift}px`,
                        animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
                        transform: `rotate(${p.rotateStart}deg)`,
                    } as React.CSSProperties}
                />
            ))}
        </div>
    );
};

// ── 팀 전적 + 로스터 스탯 집계 ─────────────────────────────────────────────────

interface GamePbpRow {
    home_team_id: string;
    away_team_id: string;
    home_score: number;
    away_score: number;
    home_box: PlayerBoxScore[] | null;
    away_box: PlayerBoxScore[] | null;
}

interface AggregatedPlayer {
    playerId: string;
    playerName: string;
    position?: string;
    g: number; mp: number; pts: number; reb: number; ast: number;
    stl: number; blk: number; tov: number; pf: number;
    fgm: number; fga: number; p3m: number; p3a: number; ftm: number; fta: number;
}

function emptyAgg(playerId: string, playerName: string, position?: string): AggregatedPlayer {
    return { playerId, playerName, position, g: 0, mp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 };
}

function useTournamentSummary(roomId: string | undefined, championTeamSlug: string | undefined) {
    const [loading, setLoading] = useState(true);
    const [record, setRecord] = useState({ wins: 0, losses: 0 });
    const [roster, setRoster] = useState<AggregatedPlayer[]>([]);

    useEffect(() => {
        if (!roomId || !championTeamSlug) { setLoading(false); return; }
        let cancelled = false;
        setLoading(true);

        (async () => {
            const { data } = await supabase
                .from('game_pbp')
                .select('home_team_id, away_team_id, home_score, away_score, home_box, away_box')
                .eq('room_id', roomId);
            if (cancelled) return;

            const rows = (data ?? []) as GamePbpRow[];
            let wins = 0, losses = 0;
            const playerMap = new Map<string, AggregatedPlayer>();

            for (const row of rows) {
                const isHome = row.home_team_id === championTeamSlug;
                const isAway = row.away_team_id === championTeamSlug;
                if (!isHome && !isAway) continue;

                const won = isHome ? row.home_score > row.away_score : row.away_score > row.home_score;
                if (won) wins++; else losses++;

                const box = (isHome ? row.home_box : row.away_box) ?? [];
                for (const bs of box) {
                    if (!bs.playerId || bs.mp <= 0) continue;
                    const prev = playerMap.get(bs.playerId) ?? emptyAgg(bs.playerId, bs.playerName, bs.position);
                    playerMap.set(bs.playerId, {
                        ...prev,
                        g:   prev.g + 1,
                        mp:  prev.mp + bs.mp,
                        pts: prev.pts + bs.pts,
                        reb: prev.reb + bs.reb,
                        ast: prev.ast + bs.ast,
                        stl: prev.stl + bs.stl,
                        blk: prev.blk + bs.blk,
                        tov: prev.tov + bs.tov,
                        pf:  prev.pf + (bs.pf ?? 0),
                        fgm: prev.fgm + bs.fgm,
                        fga: prev.fga + bs.fga,
                        p3m: prev.p3m + bs.p3m,
                        p3a: prev.p3a + bs.p3a,
                        ftm: prev.ftm + bs.ftm,
                        fta: prev.fta + bs.fta,
                    });
                }
            }

            const rosterList = [...playerMap.values()].sort((a, b) => b.pts - a.pts);
            setRecord({ wins, losses });
            setRoster(rosterList);
            setLoading(false);
        })();

        return () => { cancelled = true; };
    }, [roomId, championTeamSlug]);

    return { loading, record, roster };
}

function fmtAvg(total: number, games: number): string {
    return games > 0 ? (total / games).toFixed(1) : '0.0';
}

function fmtPct(m: number, a: number): string {
    return a > 0 ? `${((m / a) * 100).toFixed(1)}%` : '—';
}

function fmtTS(pts: number, fga: number, fta: number): string {
    const denom = 2 * (fga + 0.44 * fta);
    return denom > 0 ? `${((pts / denom) * 100).toFixed(1)}%` : '—';
}

/**
 * 멀티플레이어 토너먼트가 종료되면(league.status === 'finished') 우승팀 축하 팝업을 띄운다.
 * 홈/브라켓(순위표) 페이지에 들어왔을 때만 노출 — 다른 탭(로스터/전술/리더보드 등)에서는 뜨지 않음.
 * 우승팀의 GM(league_teams.user_id)인 유저에게만 보인다 — 다른 참가자/AI팀 GM에게는 뜨지 않음.
 * league는 useCurrentLeague의 realtime 구독으로 상태 전환이 즉시 반영된다.
 */
export const TournamentChampionModal: React.FC = () => {
    const { league, leagueTeams, room } = useLeagueContext();
    const { session } = useGame();
    const { schedule } = useMultiGameData(session, room?.id ?? null);
    const serverNow = useServerClock();
    const userId = session?.user?.id ?? null;
    const location = useLocation();
    const [dismissed, setDismissed] = useState(false);

    const base = league ? `/multi/leagues/${league.id}/season` : null;
    const isEligiblePage = !!base && (location.pathname === base || location.pathname.startsWith(`${base}/standings`));

    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;

    const champion = useMemo(() => {
        if (!league || league.type !== 'tournament' || league.status !== 'finished') return null;
        const bracket = league.bracket_data as { series?: BracketSeries[] } | null;
        const series = bracket?.series ?? [];
        if (!series.length) return null;
        const finalRound = Math.max(...series.map(s => s.round));
        const final = series.find(s => s.round === finalRound && s.winnerId);
        if (!final?.winnerId) return null;

        // league.status==='finished'와 series.winnerId는 서버가 결승 마지막 경기를 시뮬레이션한
        // 직후 즉시 세팅된다 — 그 경기의 10분 리플레이가 아직 진행 중이어도 이미 확정된 값이다.
        // schedule에서 "공개된"(isFinal) 경기만으로 직접 승수를 다시 세어, 실제로 targetWins에
        // 도달한 경우에만 우승자를 노출한다(그렇지 않으면 결승 마지막 경기 결과가 스포일러된다).
        let higherWins = 0, lowerWins = 0;
        for (const g of schedule) {
            if (g.seriesId !== final.id || !g.played || g.homeScore == null || g.awayScore == null) continue;
            const resolvedAt = resolveRealAt(g, simStart, gprd);
            if (!isFinal({ ...g, scheduledAt: resolvedAt }, serverNow)) continue;
            const homeWon = g.homeScore > g.awayScore;
            const winnerId = homeWon ? g.homeTeamId : g.awayTeamId;
            if (winnerId === final.higherSeedId) higherWins++; else lowerWins++;
        }
        const targetWins = final.targetWins ?? 1;
        const revealedWinnerId =
            higherWins >= targetWins ? final.higherSeedId :
            lowerWins  >= targetWins ? final.lowerSeedId  : null;
        if (!revealedWinnerId) return null;

        const team = leagueTeams.find(t => t.team_slug === revealedWinnerId);
        if (!team) return null;
        return { team, series: final };
    }, [league, leagueTeams, schedule, simStart, gprd, serverNow]);

    // 실제 우승팀의 GM(user_id)에게만 노출 — 다른 유저/관전자에게는 뜨지 않음
    const isChampionOwner = !!(champion && userId && champion.team.user_id === userId);

    const { loading: statsLoading, record, roster } = useTournamentSummary(
        isChampionOwner ? room?.id : undefined,
        isChampionOwner ? champion?.team.team_slug : undefined,
    );

    const storageKey = league ? `tournament_champion_seen_${league.id}` : null;

    useEffect(() => {
        if (!champion || !isEligiblePage) { setDismissed(true); return; }
        if (PERSIST_DISMISSAL && storageKey && localStorage.getItem(storageKey) === '1') {
            setDismissed(true);
            return;
        }
        setDismissed(false);
    }, [champion, isEligiblePage, storageKey, location.pathname]);

    if (!champion || dismissed || !isEligiblePage || !isChampionOwner) return null;

    const handleClose = () => {
        if (PERSIST_DISMISSAL && storageKey) localStorage.setItem(storageKey, '1');
        setDismissed(true);
    };

    return (
        <>
            <Confetti />
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                <div className="relative bg-slate-900 border border-amber-500/40 rounded-3xl max-w-2xl w-full max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
                    <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none" />
                    <button
                        onClick={handleClose}
                        className="absolute top-4 right-4 z-20 text-slate-500 hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>

                    {/* 헤더: 트로피 + 팀 + 전적 */}
                    <div className="relative z-10 flex flex-col items-center gap-3 px-8 pt-9 pb-5 shrink-0">
                        <Trophy size={44} className="text-amber-400" />
                        <div className="text-center">
                            <p className="text-xs font-bold text-amber-400 ko-normal tracking-wide">토너먼트 우승</p>
                            <h2 className="text-2xl font-black text-white ko-tight mt-1">{champion.team.team_name}</h2>
                        </div>
                        <TeamLogo teamId={champion.team.team_slug} teamName={champion.team.team_name} size="xl" />
                        <div className="flex items-center gap-3">
                            <p className="text-sm text-slate-400 ko-normal">축하합니다! 🎉</p>
                            {!statsLoading && (
                                <span className="text-sm font-bold text-white font-mono tabular-nums">
                                    토너먼트 전적 {record.wins}승 {record.losses}패
                                </span>
                            )}
                        </div>
                    </div>

                    {/* 로스터 스탯 */}
                    <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar border-t border-slate-800 px-4 pb-4">
                        {statsLoading ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 size={20} className="animate-spin text-indigo-400" />
                            </div>
                        ) : roster.length === 0 ? (
                            <p className="text-center text-sm text-slate-500 ko-normal py-10">스탯 데이터가 없습니다.</p>
                        ) : (
                            <table className="w-full text-xs mt-3">
                                <thead>
                                    <tr className="text-slate-500 uppercase text-[10px]">
                                        <th className="text-left py-1.5 font-bold">선수</th>
                                        <th className="text-center py-1.5 font-bold w-10">G</th>
                                        <th className="text-center py-1.5 font-bold w-12">MP</th>
                                        <th className="text-center py-1.5 font-bold w-12">PTS</th>
                                        <th className="text-center py-1.5 font-bold w-12">REB</th>
                                        <th className="text-center py-1.5 font-bold w-12">AST</th>
                                        <th className="text-center py-1.5 font-bold w-12">STL</th>
                                        <th className="text-center py-1.5 font-bold w-12">BLK</th>
                                        <th className="text-center py-1.5 font-bold w-14">FG%</th>
                                        <th className="text-center py-1.5 font-bold w-14">3P%</th>
                                        <th className="text-center py-1.5 font-bold w-14">TS%</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60">
                                    {roster.map(p => (
                                        <tr key={p.playerId} className="text-slate-300">
                                            <td className="py-1.5 font-bold text-white whitespace-nowrap">
                                                {p.playerName}
                                                {p.position && <span className="text-slate-500 font-normal ml-1">{p.position}</span>}
                                            </td>
                                            <td className="text-center font-mono tabular-nums">{p.g}</td>
                                            <td className="text-center font-mono tabular-nums">{fmtAvg(p.mp, p.g)}</td>
                                            <td className="text-center font-mono tabular-nums text-white font-bold">{fmtAvg(p.pts, p.g)}</td>
                                            <td className="text-center font-mono tabular-nums">{fmtAvg(p.reb, p.g)}</td>
                                            <td className="text-center font-mono tabular-nums">{fmtAvg(p.ast, p.g)}</td>
                                            <td className="text-center font-mono tabular-nums">{fmtAvg(p.stl, p.g)}</td>
                                            <td className="text-center font-mono tabular-nums">{fmtAvg(p.blk, p.g)}</td>
                                            <td className="text-center font-mono tabular-nums">{fmtPct(p.fgm, p.fga)}</td>
                                            <td className="text-center font-mono tabular-nums">{fmtPct(p.p3m, p.p3a)}</td>
                                            <td className="text-center font-mono tabular-nums">{fmtTS(p.pts, p.fga, p.fta)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <div className="relative z-10 flex justify-center px-8 py-4 border-t border-slate-800 shrink-0">
                        <button
                            onClick={handleClose}
                            className="px-6 py-2 bg-amber-600 hover:bg-amber-500 rounded-xl text-sm font-bold text-white transition-colors"
                        >
                            확인
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

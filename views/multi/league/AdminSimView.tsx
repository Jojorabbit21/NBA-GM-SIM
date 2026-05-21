
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, FastForward, Clock, CheckCircle2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useLeagueContext } from './LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { supabase } from '../../../services/supabaseClient';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface ScheduleGame {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    date: string;
    scheduledAt?: string;
    played: boolean;
    homeScore?: number;
    awayScore?: number;
    seriesId?: string;
    isPlayoff?: boolean;
}

interface LogEntry {
    type: 'info' | 'success' | 'error' | 'header';
    text: string;
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function fmtKst(iso: string | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yy}-${mm}-${dd} ${hh}:${mi}`;
}

function nowIso() { return new Date().toISOString(); }

// ── AdminSimView ──────────────────────────────────────────────────────────────

const AdminSimView: React.FC = () => {
    const navigate             = useNavigate();
    const { leagueId }         = useParams<{ leagueId: string }>();
    const { session }          = useGame();
    const { league, room, isLoading: ctxLoading } = useLeagueContext();

    const userId   = session?.user?.id ?? null;
    const isAdmin  = !!(league && userId && league.admin_user_id === userId);

    // ── 스케줄 로드 ───────────────────────────────────────────────────────────
    const [schedule,     setSchedule]     = useState<ScheduleGame[]>([]);
    const [schedLoading, setSchedLoading] = useState(true);

    const loadSchedule = useCallback(async () => {
        if (!room?.id) return;
        setSchedLoading(true);
        const { data } = await supabase
            .from('rooms')
            .select('schedule')
            .eq('id', room.id)
            .single();
        setSchedule((data?.schedule as ScheduleGame[] | null) ?? []);
        setSchedLoading(false);
    }, [room?.id]);

    useEffect(() => { loadSchedule(); }, [loadSchedule]);

    // 비어드민 접근 차단
    useEffect(() => {
        if (!ctxLoading && league && !isAdmin) {
            navigate(`/multi/leagues/${leagueId}/lobby`, { replace: true });
        }
    }, [ctxLoading, league, isAdmin, leagueId, navigate]);

    // ── 시뮬레이션 상태 ───────────────────────────────────────────────────────
    const [running,   setRunning]   = useState(false);
    const [logs,      setLogs]      = useState<LogEntry[]>([]);
    const logEndRef   = useRef<HTMLDivElement>(null);
    const cancelRef   = useRef(false);

    const addLog = useCallback((entry: LogEntry) => {
        setLogs(prev => [...prev, entry]);
    }, []);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    // ── 단일 경기 시뮬 ───────────────────────────────────────────────────────
    const simOneGame = useCallback(async (game: ScheduleGame): Promise<boolean> => {
        if (!room?.id || !leagueId || !session) return false;

        const { data, error } = await supabase.functions.invoke('admin-sim-override', {
            body: { action: 'sim-game', roomId: room.id, leagueId, gameId: game.id },
        });

        if (error || !data?.ok) {
            addLog({ type: 'error', text: `  ✗ ${game.id} — ${data?.error ?? error?.message ?? '알 수 없는 오류'}` });
            return false;
        }

        const hs = data.homeScore ?? '?';
        const as = data.awayScore ?? '?';
        const ms = data.simDurationMs != null ? ` (${data.simDurationMs}ms)` : '';
        addLog({ type: 'success', text: `  ✓ ${game.homeTeamId.toUpperCase()} ${hs} - ${as} ${game.awayTeamId.toUpperCase()}${ms}` });
        return true;
    }, [room?.id, leagueId, session, addLog]);

    // ── 배치 시뮬 (내부) ──────────────────────────────────────────────────────
    const runBatch = useCallback(async (games: ScheduleGame[], label: string) => {
        if (running) return;
        cancelRef.current = false;
        setRunning(true);
        setLogs([]);

        addLog({ type: 'header', text: `$ ${label} (${games.length}경기)` });

        let ok = 0; let fail = 0;
        const t0 = Date.now();

        for (const game of games) {
            if (cancelRef.current) {
                addLog({ type: 'info', text: '  [취소됨]' });
                break;
            }
            const succeeded = await simOneGame(game);
            if (succeeded) ok++; else fail++;
        }

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        addLog({ type: 'info', text: `완료 — 성공 ${ok} / 실패 ${fail} / ${elapsed}초` });
        addLog({ type: 'info', text: '$' });

        setRunning(false);
        await loadSchedule(); // 스케줄 새로고침
    }, [running, simOneGame, addLog, loadSchedule]);

    // ── 액션 버튼 핸들러 ──────────────────────────────────────────────────────
    const handleSimUpToNow = () => {
        const now = nowIso();
        const targets = schedule.filter(g => !g.played && g.scheduledAt && g.scheduledAt <= now);
        if (!targets.length) {
            setLogs([{ type: 'info', text: '지금까지 예정된 미완료 경기가 없습니다.' }]);
            return;
        }
        runBatch(targets, `sim-up-to-now`);
    };

    const handleSimAll = () => {
        const targets = schedule.filter(g => !g.played);
        if (!targets.length) {
            setLogs([{ type: 'info', text: '남은 미완료 경기가 없습니다.' }]);
            return;
        }
        runBatch(targets, `sim-all`);
    };

    const handleSimSingle = (game: ScheduleGame) => {
        runBatch([game], `sim-game ${game.id}`);
    };

    // ── 통계 ──────────────────────────────────────────────────────────────────
    const totalGames   = schedule.length;
    const playedGames  = schedule.filter(g => g.played).length;
    const upToNowCount = schedule.filter(
        g => !g.played && g.scheduledAt && g.scheduledAt <= nowIso()
    ).length;
    const remainingCount = totalGames - playedGames;

    // ── 날짜별 그룹 ───────────────────────────────────────────────────────────
    const grouped = schedule.reduce<Record<string, ScheduleGame[]>>((acc, g) => {
        const key = g.date ?? 'unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(g);
        return acc;
    }, {});
    const sortedDates = Object.keys(grouped).sort();

    // ── 렌더 ──────────────────────────────────────────────────────────────────
    if (ctxLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={24} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">

            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate(`/multi/leagues/${leagueId}/settings`)}
                    className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={14} />
                    <span className="ko-normal">설정으로 돌아가기</span>
                </button>
                <button
                    onClick={loadSchedule}
                    disabled={schedLoading || running}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors disabled:opacity-40"
                >
                    <RefreshCw size={12} className={schedLoading ? 'animate-spin' : ''} />
                    새로고침
                </button>
            </div>

            <div>
                <h1 className="text-xl font-black text-white ko-tight">{league?.name ?? '—'}</h1>
                <p className="text-xs text-slate-500 ko-normal mt-0.5">수동 시뮬레이션 — 어드민 전용</p>
            </div>

            {/* 통계 + 액션 */}
            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                        { label: '전체 경기', value: totalGames },
                        { label: '완료', value: playedGames },
                        { label: '남은 경기', value: remainingCount },
                    ].map(({ label, value }) => (
                        <div key={label} className="bg-slate-900/60 rounded-xl py-3">
                            <div className="text-lg font-black text-white">{value}</div>
                            <div className="text-[11px] text-slate-500 ko-normal mt-0.5">{label}</div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                    <button
                        onClick={handleSimUpToNow}
                        disabled={running || upToNowCount === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-bold text-white transition-colors"
                    >
                        {running ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
                        <span className="ko-normal">현재까지 시뮬 ({upToNowCount}경기)</span>
                    </button>
                    <button
                        onClick={handleSimAll}
                        disabled={running || remainingCount === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-bold text-white transition-colors"
                    >
                        {running ? <Loader2 size={13} className="animate-spin" /> : <FastForward size={13} />}
                        <span className="ko-normal">전체 시뮬 ({remainingCount}경기)</span>
                    </button>
                    {running && (
                        <button
                            onClick={() => { cancelRef.current = true; }}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500/40 rounded-xl text-sm font-bold text-red-400 hover:bg-red-600/30 transition-colors"
                        >
                            중단
                        </button>
                    )}
                </div>
            </section>

            {/* 로그 패널 */}
            {logs.length > 0 && (
                <section className="bg-black border border-slate-700/40 rounded-2xl overflow-hidden">
                    <div className="px-4 py-2 border-b border-slate-800 flex items-center gap-2">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/60" />
                            <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                            <div className="w-3 h-3 rounded-full bg-green-500/60" />
                        </div>
                        <span className="text-[11px] text-slate-600 font-mono">simulation log</span>
                    </div>
                    <pre className="font-mono text-xs p-4 max-h-64 overflow-y-auto leading-5">
                        {logs.map((log, i) => (
                            <div
                                key={i}
                                className={
                                    log.type === 'header'  ? 'text-indigo-400 font-bold' :
                                    log.type === 'success' ? 'text-emerald-400' :
                                    log.type === 'error'   ? 'text-red-400' :
                                    'text-slate-500'
                                }
                            >
                                {log.text}
                            </div>
                        ))}
                        {running && (
                            <div className="text-slate-600 animate-pulse">▋</div>
                        )}
                        <div ref={logEndRef} />
                    </pre>
                </section>
            )}

            {/* 일정 목록 */}
            <section className="space-y-4">
                {schedLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={20} className="animate-spin text-indigo-400" />
                    </div>
                ) : totalGames === 0 ? (
                    <div className="flex items-center justify-center py-16 text-slate-600 text-sm ko-normal">
                        <AlertCircle size={14} className="mr-2" />
                        스케줄이 없습니다.
                    </div>
                ) : (
                    sortedDates.map(date => (
                        <div key={date} className="bg-slate-800/40 border border-slate-700/40 rounded-2xl overflow-hidden">
                            <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400 font-mono">{date}</span>
                                <span className="text-[11px] text-slate-600">
                                    {grouped[date].filter(g => g.played).length} / {grouped[date].length} 완료
                                </span>
                            </div>
                            <div className="divide-y divide-slate-800">
                                {grouped[date].map(game => (
                                    <GameRow
                                        key={game.id}
                                        game={game}
                                        onSim={() => handleSimSingle(game)}
                                        disabled={running}
                                    />
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </section>
        </div>
    );
};

// ── GameRow ───────────────────────────────────────────────────────────────────

interface GameRowProps {
    game: ScheduleGame;
    onSim: () => void;
    disabled: boolean;
}

const GameRow: React.FC<GameRowProps> = ({ game, onSim, disabled }) => {
    const isPast = game.scheduledAt ? game.scheduledAt <= nowIso() : false;

    return (
        <div className={`flex items-center gap-4 px-4 py-3 ${game.played ? 'opacity-60' : ''}`}>
            {/* 상태 아이콘 */}
            <div className="w-5 shrink-0">
                {game.played
                    ? <CheckCircle2 size={14} className="text-emerald-500" />
                    : isPast
                    ? <Clock size={14} className="text-amber-400" />
                    : <Clock size={14} className="text-slate-700" />
                }
            </div>

            {/* 경기 정보 */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-white font-mono uppercase">{game.homeTeamId}</span>
                    {game.played
                        ? <span className="text-slate-400 font-mono text-xs">{game.homeScore} - {game.awayScore}</span>
                        : <span className="text-slate-700 text-xs">vs</span>
                    }
                    <span className="font-bold text-white font-mono uppercase">{game.awayTeamId}</span>
                    {game.seriesId && (
                        <span className="text-[10px] text-slate-600 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
                            {game.seriesId}
                        </span>
                    )}
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                    {fmtKst(game.scheduledAt)}
                    {!game.scheduledAt && <span className="text-slate-700"> (시간 미정)</span>}
                </div>
            </div>

            {/* 시뮬 버튼 */}
            {!game.played && (
                <button
                    onClick={onSim}
                    disabled={disabled}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/40 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-indigo-400 transition-colors shrink-0"
                >
                    <Play size={10} />
                    시뮬
                </button>
            )}
        </div>
    );
};

export default AdminSimView;

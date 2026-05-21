
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Save, Loader2, AlertCircle, CalendarDays,
    Clock, Users, Shield, Trash2, RotateCcw, Trophy, PlayCircle,
} from 'lucide-react';
import { useLeagueContext } from './LeagueLayout';
import { updateLeagueSettings, leaveLeague, runDraftLottery, resetTournament } from '../../../services/multi/leagueService';
import { useGame } from '../../../hooks/useGameContext';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { DraftPoolSettings, type PoolType, type DraftFormat } from '../../../components/multi/DraftPoolSettings';

function fmtConference(conf: string | null): string {
    if (!conf) return '—';
    if (conf === 'East') return '동부';
    if (conf === 'West') return '서부';
    return conf;
}

// ISO datetime → datetime-local input 값
function toInputValue(iso: string | null): string {
    if (!iso) return '';
    // "2025-04-25T20:00:00+09:00" → "2025-04-25T20:00"
    return iso.slice(0, 16);
}
// datetime-local → ISO (UTC)
function toIso(local: string): string | null {
    if (!local) return null;
    return new Date(local).toISOString();
}


// ── LeagueSettingsView ────────────────────────────────────────────────────────

const LeagueSettingsView: React.FC = () => {
    const navigate              = useNavigate();
    const { leagueId }          = useParams<{ leagueId: string }>();
    const { session }           = useGame();
    const { league, room, members, leagueTeams, isLoading, error, reload } = useLeagueContext();

    const userId      = session?.user?.id ?? null;
    const isAdmin     = !!(league && userId && league.admin_user_id === userId);
    const isInProgress = league?.status === 'in_progress';

    // ── form state ────────────────────────────────────────────────────────────
    const [lotteryAt,         setLotteryAt]         = useState('');
    const [draftAt,           setDraftAt]           = useState('');
    const [tournamentStartAt, setTournamentStartAt] = useState('');
    const [pickSec,      setPickSec]      = useState(30);
    const [totalRounds,  setTotalRounds]  = useState(10);
    const [maxTeams,     setMaxTeams]     = useState(8);
    const [draftPools,        setDraftPools]        = useState<PoolType[]>(['standard']);
    const [draftOvrMin,       setDraftOvrMin]       = useState(0);
    const [draftOvrMax,       setDraftOvrMax]       = useState(99);
    const [draftFormat,       setDraftFormat]       = useState<DraftFormat>('snake');
    const [durationWeeks,    setDurationWeeks]    = useState(2);
    const [matchFormat,      setMatchFormat]      = useState('best_of_1');
    const [finalsMatchFormat, setFinalsMatchFormat] = useState('best_of_1');
    const [saving,      setSaving]      = useState(false);
    const [saveOk,      setSaveOk]      = useState(false);
    const [saveErr,     setSaveErr]     = useState<string | null>(null);

    // ── lottery state ─────────────────────────────────────────────────────────
    const [lotteryRunning, setLotteryRunning] = useState(false);
    const [lotteryErr,     setLotteryErr]     = useState<string | null>(null);
    const lotteryDone = leagueTeams.some(t => t.draft_order !== null);

    // ── kick state ────────────────────────────────────────────────────────────
    const [kickingId, setKickingId] = useState<string | null>(null);

    // ── reset state ───────────────────────────────────────────────────────────
    const [resetConfirm,  setResetConfirm]  = useState(false);
    const [resetting,     setResetting]     = useState(false);
    const [resetErr,      setResetErr]      = useState<string | null>(null);

    // 같은 league.id면 재초기화 하지 않음 — Realtime reload() 시 폼 덮어쓰기 방지
    const initializedLeagueIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!league) return;
        if (initializedLeagueIdRef.current === league.id) return;
        initializedLeagueIdRef.current = league.id;
        setLotteryAt(toInputValue(league.lottery_scheduled_at));
        setDraftAt(toInputValue(league.draft_scheduled_at));
        setTournamentStartAt(toInputValue((league as any).tournament_start_at));
        setPickSec(league.draft_pick_duration_sec ?? 30);
        setTotalRounds(league.draft_total_rounds ?? 10);
        setMaxTeams(league.max_teams ?? 8);
        const rawPool = league.draft_pool ?? 'standard';
        const validTypes: PoolType[] = ['standard', 'alltime', 'rookies'];
        const parsed = rawPool.split(',').map((s: string) => s.trim()).filter((s: string) => validTypes.includes(s as PoolType)) as PoolType[];
        setDraftPools(parsed.length > 0 ? parsed : ['standard']);
        setDraftOvrMin(league.draft_ovr_min ?? 0);
        setDraftOvrMax(league.draft_ovr_max ?? 99);
        setDraftFormat((league.draft_pool_strategy ?? 'snake') as DraftFormat);
        if (league.season_start_date && league.season_end_date) {
            const days = Math.round(
                (new Date(league.season_end_date).getTime() - new Date(league.season_start_date).getTime()) / 86_400_000,
            );
            setDurationWeeks(Math.min(4, Math.max(1, Math.round(days / 7))));
        }
        setMatchFormat(league.match_format ?? 'best_of_1');
        setFinalsMatchFormat(league.finals_match_format ?? league.match_format ?? 'best_of_1');
    }, [league]);

    // 비어드민 접근 차단
    useEffect(() => {
        if (!isLoading && league && !isAdmin) {
            const dest = isInProgress
                ? `/multi/leagues/${leagueId}/season`
                : `/multi/leagues/${leagueId}/lobby`;
            navigate(dest, { replace: true });
        }
    }, [isLoading, league, isAdmin, isInProgress, leagueId, navigate]);

    // Reference start = today (actual start is set at draft completion)
    const refToday = new Date().toISOString().slice(0, 10);
    const computedSeasonEnd = (() => {
        const d = new Date(refToday);
        d.setDate(d.getDate() + durationWeeks * 7);
        return d.toISOString().slice(0, 10);
    })();

    const REGULAR_DAYS = [5, 10, 16, 20];
    const GAME_DAYS_PER_DAY = [17, 9, 6, 5];
    const regularDays = REGULAR_DAYS[durationWeeks - 1];
    const gameDaysPerDay = GAME_DAYS_PER_DAY[durationWeeks - 1];
    const lastSlotKst = `${10 + Math.floor((gameDaysPerDay - 1) * 30 / 60)}:${String(((gameDaysPerDay - 1) * 30) % 60).padStart(2, '0')}`;

    const handleSave = async () => {
        if (!leagueId) return;
        setSaving(true);
        setSaveOk(false);
        setSaveErr(null);
        const { error: err } = await updateLeagueSettings({
            leagueId,
            roomId:              room?.id,
            maxTeams,
            lotteryScheduledAt:  toIso(lotteryAt),
            draftScheduledAt:    toIso(draftAt),
            tournamentStartAt:   toIso(tournamentStartAt),
            draftPickDurationSec: pickSec,
            draftTotalRounds:    totalRounds,
            draftPool:         draftPools.join(','),
            draftPoolStrategy:    draftFormat,
            draftOvrMin,
            draftOvrMax,
            seasonStartDate:     refToday,
            seasonEndDate:       computedSeasonEnd,
            matchFormat,
            finalsMatchFormat:   finalsMatchFormat !== matchFormat ? finalsMatchFormat : null,
        });
        setSaving(false);
        if (err) { setSaveErr(err); return; }
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 2000);
        reload();
    };

    const handleRunLottery = async () => {
        if (!room || !userId) return;
        setLotteryRunning(true);
        setLotteryErr(null);
        const { error: err } = await runDraftLottery(room.id, userId);
        setLotteryRunning(false);
        if (err) { setLotteryErr(err); return; }
        reload();
    };

    const handleReset = async () => {
        if (!leagueId || !room) return;
        setResetting(true);
        setResetErr(null);
        const { error: err, archiveEdition } = await resetTournament(leagueId, room.id);
        setResetting(false);
        if (err) { setResetErr(err); return; }
        setResetConfirm(false);
        // 아카이브 edition 정보 로그 (디버깅)
        console.log('[resetTournament] archive edition:', archiveEdition);
        reload();
        navigate(`/multi/leagues/${leagueId}/lobby`);
    };

    const handleKick = async (kickUserId: string) => {
        if (!room) return;
        setKickingId(kickUserId);
        await leaveLeague(room.id, kickUserId);
        setKickingId(null);
        reload();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={24} className="animate-spin text-indigo-400" />
            </div>
        );
    }
    if (error || !league) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-3">
                <AlertCircle size={24} className="text-red-400" />
                <p className="text-slate-400 text-sm ko-normal">{error ?? '리그를 찾을 수 없습니다.'}</p>
            </div>
        );
    }

    const humanMembers = members.filter(m => !m.is_ai);

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

            {/* 뒤로가기 */}
            <button
                onClick={() => navigate(
                    isInProgress
                        ? `/multi/leagues/${leagueId}/season`
                        : `/multi/leagues/${leagueId}/lobby`,
                )}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                <span className="ko-normal">{isInProgress ? '시즌으로 돌아가기' : '로비로 돌아가기'}</span>
            </button>

            <div>
                <h1 className="text-xl font-black text-white ko-tight">{league.name}</h1>
                <p className="text-xs text-slate-500 ko-normal mt-0.5">세션 설정 — 어드민 전용</p>
            </div>

            {/* ── 세션 진행 중 안내 ────────────────────────────────────────────── */}
            {isInProgress && (
                <section className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-5 py-4">
                    <p className="text-xs text-indigo-300 ko-normal leading-relaxed">
                        세션이 진행 중입니다. 팀 강퇴만 가능하며, 드래프트 및 일정 설정은 변경할 수 없습니다.
                    </p>
                </section>
            )}

            {/* ── 어드민 시뮬레이션 (진행 중 세션 전용) ──────────────────────── */}
            {isInProgress && (
                <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-3">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <PlayCircle size={14} className="text-emerald-400" />
                        경기 시뮬레이션
                    </h2>
                    <p className="text-xs text-slate-400 ko-normal leading-relaxed">
                        경기 일정을 확인하고 개별 경기 또는 전체를 수동으로 시뮬레이션합니다.
                    </p>
                    <button
                        onClick={() => navigate(`/multi/leagues/${leagueId}/admin/sim`)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 rounded-xl text-sm font-bold text-white transition-colors"
                    >
                        <PlayCircle size={13} />
                        시뮬레이션 관리
                    </button>
                </section>
            )}

            {/* ── 토너먼트 종료 & 초기화 ──────────────────────────────────────── */}
            {league.status === 'finished' && (
                <section className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Trophy size={14} className="text-emerald-400" />
                        <h2 className="text-sm font-bold text-emerald-300 ko-tight">토너먼트 종료</h2>
                        <span className="text-xs text-emerald-500/70 ko-normal ml-auto">기록 자동 저장 완료</span>
                    </div>

                    <p className="text-xs text-slate-400 ko-normal leading-relaxed">
                        토너먼트가 종료되었습니다. 모든 경기 기록과 선수 박스스코어가 히스토리에 저장되었습니다.
                        세션을 초기화하면 드래프트부터 다시 시작할 수 있습니다.
                    </p>

                    {!resetConfirm ? (
                        <button
                            onClick={() => setResetConfirm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold text-white transition-colors"
                        >
                            <RotateCcw size={13} />
                            기록 저장 &amp; 초기화
                        </button>
                    ) : (
                        <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
                            <p className="text-sm font-bold text-white ko-tight">정말 초기화하시겠습니까?</p>
                            <p className="text-xs text-slate-400 ko-normal">
                                모든 로스터, 드래프트 오더, 경기 일정이 초기화됩니다.
                                히스토리 기록은 유지됩니다.
                            </p>
                            {resetErr && (
                                <p className="text-xs text-red-400 ko-normal">{resetErr}</p>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={handleReset}
                                    disabled={resetting}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-colors"
                                >
                                    {resetting
                                        ? <><Loader2 size={13} className="animate-spin" />초기화 중…</>
                                        : <><RotateCcw size={13} />초기화 실행</>
                                    }
                                </button>
                                <button
                                    onClick={() => { setResetConfirm(false); setResetErr(null); }}
                                    disabled={resetting}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl text-sm text-slate-300 transition-colors"
                                >
                                    취소
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* ── 시즌 기간 ────────────────────────────────────────────────────── */}
            {!isInProgress && league.type === 'main_league' && (
                <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-5">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <CalendarDays size={14} className="text-indigo-400" />
                        시즌 기간
                    </h2>

                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">리그 기간</label>
                        <select
                            value={durationWeeks}
                            onChange={e => setDurationWeeks(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        >
                            {[1, 2, 3, 4].map(w => (
                                <option key={w} value={w}>{w}주</option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-600 ko-normal mt-1">
                            시즌은 드래프트 완료 시점부터 자동으로 시작됩니다.
                        </p>
                    </div>

                    <div className="bg-slate-900/60 rounded-xl p-4 space-y-1.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 ko-normal">정규시즌</span>
                            <span className="text-slate-300 font-mono">{regularDays}일 · {gameDaysPerDay}경기/일</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 ko-normal">플레이오프</span>
                            <span className="text-slate-300 font-mono">{durationWeeks * 7 - regularDays}일</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 ko-normal">일일 시뮬 시간대</span>
                            <span className="text-slate-300 font-mono">10:00 ~ {lastSlotKst} KST</span>
                        </div>
                    </div>
                </section>
            )}

            {/* ── 참가팀 수 ───────────────────────────────────────────────────── */}
            {!isInProgress && <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users size={14} className="text-indigo-400" />
                    참가팀 수
                </h2>
                <div className="flex gap-2 flex-wrap">
                    {(league.type === 'tournament' ? [4, 8, 16, 32, 64] : [10, 20, 30]).map(n => {
                        const tooSmall = n < humanMembers.length;
                        return (
                            <button
                                key={n}
                                onClick={() => !tooSmall && setMaxTeams(n)}
                                disabled={tooSmall}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    maxTeams === n
                                        ? 'bg-indigo-600 text-white'
                                        : tooSmall
                                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                {n}팀
                            </button>
                        );
                    })}
                </div>
                {humanMembers.length > 0 && (
                    <p className="text-xs text-slate-500 ko-normal">
                        현재 참가 인원 {humanMembers.length}명 이상으로만 설정 가능
                    </p>
                )}
            </section>}

            {/* ── 스케줄 설정 ─────────────────────────────────────────────────── */}
            {!isInProgress && <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <CalendarDays size={14} className="text-indigo-400" />
                    스케줄
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">드래프트 추첨 일시</label>
                        <input
                            type="datetime-local"
                            value={lotteryAt}
                            onChange={e => setLotteryAt(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">드래프트 시작 일시</label>
                        <input
                            type="datetime-local"
                            value={draftAt}
                            onChange={e => setDraftAt(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* 토너먼트 시작 일시 */}
                {league.type === 'tournament' && (
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">토너먼트 시작 일시</label>
                        <input
                            type="datetime-local"
                            value={tournamentStartAt}
                            onChange={e => setTournamentStartAt(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                        <p className="text-xs text-slate-600 ko-normal mt-1">
                            첫 경기 시작 시각. 이후 경기는 2시간 간격으로 자동 배정됩니다.
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">드래프트 라운드 <span className="text-slate-600">10–15</span></label>
                        <input
                            type="number"
                            min={10}
                            max={15}
                            value={totalRounds}
                            onChange={e => setTotalRounds(Math.min(15, Math.max(10, Number(e.target.value))))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1 flex items-center gap-1">
                            <Clock size={11} />픽 제한 시간(초) <span className="text-slate-600">15–60</span>
                        </label>
                        <input
                            type="number"
                            min={15}
                            max={60}
                            value={pickSec}
                            onChange={e => setPickSec(Math.min(60, Math.max(15, Number(e.target.value))))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>

                <DraftPoolSettings
                    poolTypes={draftPools}
                    onPoolTypesChange={setDraftPools}
                    ovrMin={draftOvrMin}
                    onOvrMinChange={setDraftOvrMin}
                    ovrMax={draftOvrMax}
                    onOvrMaxChange={setDraftOvrMax}
                    draftFormat={draftFormat}
                    onDraftFormatChange={setDraftFormat}
                />

                {/* 경기 포맷 — 토너먼트만 */}
                {league.type === 'tournament' && (
                    <div className="space-y-3 pt-3 border-t border-slate-700/40">
                        <div>
                            <label className="text-xs text-slate-400 ko-normal block mb-1.5">경기 포맷 (일반전)</label>
                            <div className="flex gap-2 flex-wrap">
                                {(['best_of_1', 'best_of_3', 'best_of_5', 'best_of_7'] as const).map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setMatchFormat(f)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                            matchFormat === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        {f === 'best_of_1' ? '단판' : f === 'best_of_3' ? 'Bo3' : f === 'best_of_5' ? 'Bo5' : 'Bo7'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {league.tournament_format === 'single_elim' && (
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1.5">경기 포맷 (결승)</label>
                                <div className="flex gap-2 flex-wrap">
                                    {(['best_of_1', 'best_of_3', 'best_of_5', 'best_of_7'] as const).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setFinalsMatchFormat(f)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                                finalsMatchFormat === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            {f === 'best_of_1' ? '단판' : f === 'best_of_3' ? 'Bo3' : f === 'best_of_5' ? 'Bo5' : 'Bo7'}
                                        </button>
                                    ))}
                                </div>
                                {finalsMatchFormat === matchFormat && (
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">일반전과 동일 포맷</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {saveErr && <p className="text-xs text-red-400 ko-normal">{saveErr}</p>}

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-colors"
                >
                    {saving
                        ? <><Loader2 size={13} className="animate-spin" />저장 중…</>
                        : saveOk
                        ? '저장됨 ✓'
                        : <><Save size={13} />저장</>
                    }
                </button>
            </section>}

            {/* ── 드래프트 추첨 (수동) ─────────────────────────────────────────── */}
            {!isInProgress && <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Shield size={14} className="text-amber-400" />
                    드래프트 오더 추첨
                </h2>

                {lotteryDone ? (
                    <div className="space-y-2">
                        <p className="text-xs text-emerald-400 ko-normal">추첨 완료. 드래프트 오더가 확정되었습니다.</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[...leagueTeams]
                                .filter(t => t.draft_order !== null)
                                .sort((a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0))
                                .map(t => (
                                    <div key={t.id} className="flex items-center gap-2 bg-slate-900/60 rounded-lg px-3 py-2">
                                        <span className="text-xs font-bold text-amber-400 w-5 shrink-0">#{t.draft_order}</span>
                                        <div
                                            className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black shrink-0"
                                            style={{ backgroundColor: t.color_primary, color: '#fff' }}
                                        >
                                            {t.team_abbr.slice(0, 2)}
                                        </div>
                                        <span className="text-xs text-slate-300 truncate">{t.team_name}</span>
                                        {!t.is_ai && t.user_id && (
                                            <span className="text-[9px] font-bold text-indigo-400 shrink-0">GM</span>
                                        )}
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs text-slate-400 ko-normal">
                            추첨을 실행하면 드래프트 오더가 무작위로 확정됩니다.
                            이후 팀 선점 변경이 불가능합니다.
                        </p>
                        {lotteryErr && <p className="text-xs text-red-400 ko-normal">{lotteryErr}</p>}
                        <button
                            onClick={handleRunLottery}
                            disabled={lotteryRunning || league.status !== 'recruiting'}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-colors"
                        >
                            {lotteryRunning
                                ? <><Loader2 size={13} className="animate-spin" />추첨 중…</>
                                : '드래프트 오더 추첨 실행'
                            }
                        </button>
                        {league.status !== 'recruiting' && (
                            <p className="text-xs text-slate-500 ko-normal">recruiting 상태에서만 추첨 가능합니다.</p>
                        )}
                    </div>
                )}
            </section>}

            {/* ── 팀 & 참가자 ─────────────────────────────────────────────────── */}
            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users size={14} className="text-slate-400" />
                    팀 목록
                    <span className="text-xs font-normal text-slate-500 ml-1">
                        {leagueTeams.length}팀 · 인간 GM {humanMembers.length}명
                    </span>
                </h2>

                <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900/80">
                            <tr>
                                <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">팀</th>
                                {league.type !== 'tournament' && <th className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">컨퍼런스</th>}
                                <th className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">GM</th>
                                <th className="px-3 py-2.5 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">드래프트 오더</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {leagueTeams.map(t => {
                                const isHuman = !t.is_ai && t.user_id !== null;
                                const isMe    = t.user_id === userId;
                                return (
                                    <tr key={t.id} className="bg-slate-900/40">
                                        {/* 팀 */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <div
                                                    className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-black shrink-0"
                                                    style={{ backgroundColor: t.color_primary, color: '#fff' }}
                                                >
                                                    {t.team_abbr}
                                                </div>
                                                <span className="font-bold text-white whitespace-nowrap">{t.team_name}</span>
                                            </div>
                                        </td>

                                        {/* 컨퍼런스 */}
                                        {league.type !== 'tournament' && (
                                            <td className="px-3 py-3 text-xs text-slate-400">
                                                {fmtConference(t.conference)}
                                            </td>
                                        )}

                                        {/* GM */}
                                        <td className="px-3 py-3">
                                            {isMe
                                                ? <span className="text-[11px] font-bold text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded">나</span>
                                                : isHuman
                                                ? <span className="text-xs text-slate-300 ko-normal">선점됨</span>
                                                : <span className="text-xs text-slate-600">AI</span>
                                            }
                                        </td>

                                        {/* 드래프트 오더 */}
                                        <td className="px-3 py-3 text-center">
                                            {t.draft_order !== null
                                                ? <span className="text-xs font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">#{t.draft_order}</span>
                                                : <span className="text-xs text-slate-700">—</span>
                                            }
                                        </td>

                                        {/* 강퇴 */}
                                        <td className="px-4 py-3 text-right">
                                            {isHuman && !isMe && room && (
                                                <button
                                                    onClick={() => handleKick(t.user_id!)}
                                                    disabled={kickingId === t.user_id}
                                                    className="flex items-center gap-1 px-2 py-1 bg-red-600/10 hover:bg-red-600/30 text-red-500 hover:text-red-400 rounded-lg text-xs transition-colors disabled:opacity-50 ml-auto"
                                                >
                                                    {kickingId === t.user_id
                                                        ? <Loader2 size={11} className="animate-spin" />
                                                        : <Trash2 size={11} />
                                                    }
                                                    강퇴
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default LeagueSettingsView;


import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Loader2, AlertCircle, Settings2, ChevronLeft,
    Clock, CalendarDays, Check, Users, Eye,
} from 'lucide-react';
import { useLeagueContext } from './LeagueLayout';
import { joinLeague, leaveLeague, claimTeam, updateTeamProfile, startDraft, runDraftLottery } from '../../../services/multi/leagueService';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { useGame } from '../../../hooks/useGameContext';
import { supabase } from '../../../services/supabaseClient';
import { TeamSetupModal } from '../../../components/multi/TeamSetupModal';
import { DraftPoolModal } from '../../../components/multi/DraftPoolModal';
import type { PoolType } from '../../../components/multi/DraftPoolSettings';
import { useLeagueDraft } from '../../../hooks/useLeagueDraft';

const VALID_POOL_TYPES: PoolType[] = ['standard', 'alltime', 'rookies'];

function fmtDate(iso: string | null): string {
    if (!iso) return '미정';
    return new Date(iso).toLocaleString('ko-KR', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function fmtSeconds(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtMatchFormat(f: string | null): string {
    switch (f) {
        case 'best_of_3': return 'Bo3';
        case 'best_of_5': return 'Bo5';
        case 'best_of_7': return 'Bo7';
        default:          return 'Bo1';
    }
}

function fmtConference(conf: string | null): string {
    if (!conf) return '—';
    if (conf === 'East') return '동부';
    if (conf === 'West') return '서부';
    return conf;
}

const TH: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <th className={`px-3 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap ${className}`}>
        {children}
    </th>
);

// ── LeagueLobbyView ───────────────────────────────────────────────────────────

const LeagueLobbyView: React.FC = () => {
    const navigate             = useNavigate();
    const { leagueId }         = useParams<{ leagueId: string }>();
    const { session }          = useGame();
    const { league, room, members, leagueTeams, isLoading, error, reload } = useLeagueContext();

    const userId      = session?.user?.id ?? null;
    const isMember    = members.some(m => m.user_id === userId);
    const isAdmin     = !!(league && userId && league.admin_user_id === userId);
    const myTeam      = leagueTeams.find(t => t.user_id === userId) ?? null;
    const isDrafting   = league?.status === 'drafting';
    const isRecruiting = league?.status === 'recruiting';
    const isInProgress = league?.status === 'in_progress';
    const isFinished    = league?.status === 'finished';
    const lotteryDone   = leagueTeams.length > 0 && leagueTeams.some(t => t.draft_order !== null);
    const canClaim      = isRecruiting;              // 모집 중이면 언제든 빈 팀 선점 가능
    const canChangePre  = isRecruiting && !lotteryDone; // 팀 변경은 로터리 전까지만

    const { draftState, timeRemaining, currentPickEntry, isMyTurn } = useLeagueDraft(
        isDrafting ? (room?.id ?? null) : null,
        session,
    );

    const [leaving,        setLeaving]        = useState(false);
    const [claiming,       setClaiming]       = useState<string | null>(null);
    const [startingDraft,  setStartingDraft]  = useState(false);
    const [runningLottery, setRunningLottery] = useState(false);
    const [editTarget,     setEditTarget]     = useState<LeagueTeamRow | null>(null);
    const [kickingId,      setKickingId]      = useState<string | null>(null);
    const [actionErr,      setActionErr]      = useState<string | null>(null);
    const [countdown,      setCountdown]      = useState<string | null>(null);
    const [showDraftPool,  setShowDraftPool]  = useState(false);

    const draftPoolTypes = (() => {
        const parsed = (league?.draft_pool ?? 'standard').split(',').map(s => s.trim())
            .filter(s => VALID_POOL_TYPES.includes(s as PoolType)) as PoolType[];
        return parsed.length > 0 ? parsed : (['standard'] as PoolType[]);
    })();

    // 멤버인 경우 시즌 진행 중이거나 이미 종료된 리그면 즉시 season 페이지로 이동
    // (종료된 리그도 브라켓/스케줄/박스스코어 등 데이터는 계속 조회 가능해야 하므로 로비에 머물지 않는다)
    useEffect(() => {
        if ((isInProgress || isFinished) && isMember && leagueId) {
            navigate(`/multi/leagues/${leagueId}/season`, { replace: true });
        }
    }, [isInProgress, isFinished, isMember, leagueId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Realtime 구독
    useEffect(() => {
        if (!room?.id || !leagueId) return;
        const ch = supabase
            .channel(`lobby-${room.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${room.id}` },  () => reload())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'league_teams', filter: `room_id=eq.${room.id}` },  () => reload())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leagues',  filter: `id=eq.${leagueId}` },     () => reload())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [room?.id, leagueId]); // eslint-disable-line react-hooks/exhaustive-deps

    // 드래프트 카운트다운 타이머
    useEffect(() => {
        const target = league?.draft_scheduled_at;
        if (!target) { setCountdown(null); return; }

        const tick = () => {
            const diff = new Date(target).getTime() - Date.now();
            if (diff <= 0) { setCountdown('곧 시작'); return; }
            const d  = Math.floor(diff / 86_400_000);
            const h  = Math.floor((diff % 86_400_000) / 3_600_000);
            const m  = Math.floor((diff % 3_600_000)  /    60_000);
            const s  = Math.floor((diff % 60_000)     /     1_000);
            const hh = String(h).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            const ss = String(s).padStart(2, '0');
            setCountdown(d > 0 ? `${d}일 ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`);
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [league?.draft_scheduled_at]);

    // 참가 + 팀 선점을 한 번에 처리
    const handleJoinAndClaim = useCallback(async (team: LeagueTeamRow) => {
        if (!league || !room || !userId) return;
        setClaiming(team.id); setActionErr(null);
        const { error: joinErr } = await joinLeague(league.id, userId);
        if (joinErr) { setActionErr(joinErr); setClaiming(null); return; }
        const { error: claimErr } = await claimTeam(room.id, team.id, userId);
        setClaiming(null);
        if (claimErr) { setActionErr(claimErr); return; }
        reload();
    }, [league, room, userId, reload]);

    const handleLeave = async () => {
        if (!room || !userId) return;
        setLeaving(true); setActionErr(null);
        const { error: err } = await leaveLeague(room.id, userId, league.status);
        setLeaving(false);
        if (err) { setActionErr(err); return; }
        reload();
    };

    const handleRunLottery = async () => {
        if (!room || !userId) return;
        setRunningLottery(true); setActionErr(null);
        const { error: err } = await runDraftLottery(room.id, userId);
        setRunningLottery(false);
        if (err) { setActionErr(err); return; }
        reload();
    };

    const handleStartDraft = async () => {
        if (!league || !leagueId) return;
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) { setActionErr('인증 정보를 가져올 수 없습니다.'); return; }
        setStartingDraft(true); setActionErr(null);
        const { error: err } = await startDraft(leagueId, token);
        setStartingDraft(false);
        if (err) { setActionErr(err); return; }
        // Realtime이 status 변경을 감지해서 자동 이동 (useEffect)
    };

    const handleKick = async (kickUserId: string) => {
        if (!room) return;
        setKickingId(kickUserId);
        setActionErr(null);
        const { error: err } = await leaveLeague(room.id, kickUserId);
        setKickingId(null);
        if (err) { setActionErr(err); }
        reload();
    };

    const handleClaim = useCallback(async (team: LeagueTeamRow) => {
        if (!room || !userId || !isMember) return;
        setClaiming(team.id); setActionErr(null);
        const { error: err } = await claimTeam(room.id, team.id, userId);
        setClaiming(null);
        if (err) { setActionErr(err); return; }
        reload();
    }, [room, userId, isMember, reload]);

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
                <p className="text-slate-400 text-sm ko-normal">{error ?? '리그를 불러올 수 없습니다.'}</p>
                <button onClick={() => navigate('/multi')} className="text-indigo-400 text-sm hover:underline">
                    리그 목록으로 돌아가기
                </button>
            </div>
        );
    }

    const humanCount = members.filter(m => !m.is_ai).length;
    const totalSlots = leagueTeams.length || league.max_teams;

    return (
        <>
            <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">

                {/* 뒤로가기 */}
                <button
                    onClick={() => navigate('/multi')}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-white transition-colors"
                >
                    <ChevronLeft size={14} />
                    <span className="ko-normal">리그 목록</span>
                </button>

                {/* ── 리그 정보 카드 ───────────────────────────────────────── */}
                <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl px-6 py-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-black text-white ko-tight">{league.name}</h1>
                                {countdown && (
                                    <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-lg ${
                                        countdown === '곧 시작'
                                            ? 'bg-emerald-500/20 text-emerald-400'
                                            : 'bg-slate-700/80 text-slate-300'
                                    }`}>
                                        {countdown !== '곧 시작' && (
                                            <span className="text-slate-500 font-normal mr-1">드래프트</span>
                                        )}
                                        {countdown}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <p className="text-sm text-slate-400 ko-normal">
                                    시즌 {league.season_number} · {totalSlots}팀
                                </p>
                                {league.type === 'tournament' && league.tournament_format && league.match_format && (
                                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-700 text-slate-300 tracking-wide">
                                        {league.tournament_format === 'single_elim' ? 'SE' : 'RR'}
                                        {' '}
                                        {fmtMatchFormat(league.match_format)}
                                        {league.finals_match_format && league.finals_match_format !== league.match_format && (
                                            <span className="text-slate-400">/{fmtMatchFormat(league.finals_match_format)}</span>
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* 우측 상단 버튼 */}
                        <div className="flex items-center gap-2 shrink-0">
                            {/* 드래프트 풀 보기 (전원, 드래프트 시작 전에만) */}
                            {isRecruiting && (
                                <button
                                    onClick={() => setShowDraftPool(true)}
                                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
                                >
                                    <Eye size={12} />
                                    드래프트 풀 보기
                                </button>
                            )}
                            {/* 설정 (어드민) */}
                            {isAdmin && (
                                <button
                                    onClick={() => navigate(`/multi/leagues/${leagueId}/settings`)}
                                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
                                >
                                    <Settings2 size={12} />
                                    설정
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 스케줄 + 참가자 수 */}
                    <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <CalendarDays size={11} className="shrink-0" />
                            <span className="ko-normal">추첨: <span className="text-white">{fmtDate(league.lottery_scheduled_at)}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <Clock size={11} className="shrink-0" />
                            <span className="ko-normal">드래프트: <span className="text-white">{fmtDate(league.draft_scheduled_at)}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <Users size={11} className="shrink-0" />
                            <span className="ko-normal">참가자: <span className="text-white font-bold">{humanCount} / {totalSlots}</span></span>
                        </div>
                    </div>


                    {/* 어드민 — 로터리 / 드래프트 즉시 시작 */}
                    {isAdmin && isRecruiting && (
                        <div className="pt-3 border-t border-slate-700/50 flex items-center gap-2">
                            {lotteryDone ? (
                                <button
                                    onClick={handleStartDraft}
                                    disabled={startingDraft}
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors"
                                >
                                    {startingDraft
                                        ? <><Loader2 size={13} className="animate-spin" />시작 중…</>
                                        : '드래프트 즉시 시작'
                                    }
                                </button>
                            ) : (
                                <button
                                    onClick={handleRunLottery}
                                    disabled={runningLottery}
                                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors"
                                >
                                    {runningLottery
                                        ? <><Loader2 size={13} className="animate-spin" />추첨 중…</>
                                        : '로터리 즉시 시작'
                                    }
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* 에러 */}
                {actionErr && (
                    <p className="text-xs text-red-400 ko-normal bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-2">
                        {actionErr}
                    </p>
                )}

                {/* ── 드래프트 진행 중 — 정보 + 입장 ─────────────────────────── */}
                {isDrafting && (
                    <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl px-6 py-5 space-y-4">

                        {/* 헤더 */}
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block shrink-0" />
                                <span className="text-sm font-black text-white ko-normal">드래프트 진행 중</span>
                            </div>
                            {draftState && (
                                <span className="text-xs text-slate-400 tabular-nums ko-normal shrink-0">
                                    {Math.floor(draftState.currentPickIndex / Math.max(draftState.teamCount, 1)) + 1}
                                    {' / '}{draftState.totalRounds} 라운드
                                    {'  ·  '}
                                    {draftState.currentPickIndex + 1} / {draftState.pickOrder.length} 픽
                                </span>
                            )}
                        </div>

                        {/* 현재 차례 + 타이머 */}
                        {draftState && currentPickEntry ? (() => {
                            const team = leagueTeams.find(t => t.team_slug === currentPickEntry.teamId);
                            const timerPct = draftState.pickDurationSec > 0
                                ? Math.min(100, Math.round((timeRemaining / draftState.pickDurationSec) * 100))
                                : 100;
                            return (
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm text-slate-400 ko-normal">
                                        현재 차례:{' '}
                                        <span className="font-bold text-white">
                                            {team?.team_name ?? currentPickEntry.teamId.toUpperCase()}
                                        </span>
                                        {isMyTurn && (
                                            <span className="ml-2 text-indigo-400 font-bold ko-normal">(내 차례)</span>
                                        )}
                                    </span>
                                    <span className={`text-xl font-black tabular-nums shrink-0 ${
                                        timerPct <= 15 ? 'text-red-400' : timerPct <= 40 ? 'text-amber-400' : 'text-white'
                                    }`}>
                                        {fmtSeconds(timeRemaining)}
                                    </span>
                                </div>
                            );
                        })() : !draftState && (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 size={16} className="animate-spin text-slate-500" />
                            </div>
                        )}

                        {/* 다음 픽 순서 */}
                        {draftState && (() => {
                            const next = draftState.pickOrder[draftState.currentPickIndex + 1];
                            if (!next) return null;
                            const t  = leagueTeams.find(lt => lt.team_slug === next.teamId);
                            const me = next.userId === userId;
                            return (
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ko-normal shrink-0">
                                        다음 픽
                                    </span>
                                    <span className={`text-xs font-bold whitespace-nowrap px-2 py-1 rounded-lg ${
                                        me ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-300' : 'bg-slate-900/60 text-slate-400'
                                    }`}>
                                        {t?.team_name ?? t?.team_abbr ?? next.teamId.toUpperCase()}
                                    </span>
                                </div>
                            );
                        })()}

                        {/* 입장 버튼 */}
                        <button
                            onClick={() => navigate(`/multi/leagues/${leagueId}/draft`)}
                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
                        >
                            드래프트 룸 입장
                        </button>
                    </div>
                )}

                {/* 비참가자 — 진행 중 안내 */}
                {!isMember && isInProgress && (
                    <div className="rounded-xl border border-slate-600/40 bg-slate-800/40 px-4 py-3">
                        <p className="text-sm text-slate-400 ko-normal">이 세션은 현재 진행 중입니다. 참가할 수 없습니다.</p>
                    </div>
                )}

                {/* 내 팀 상태 알림 — 팀 선점 완료 시만 표시 */}
                {isMember && isRecruiting && myTeam && (
                    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                                style={{ backgroundColor: myTeam.color_primary, color: '#fff' }}
                            >
                                {myTeam.team_abbr}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-white">{myTeam.team_name}</p>
                                <p className="text-xs text-slate-400 ko-normal">팀 선점 완료 · 드래프트 대기 중</p>
                            </div>
                            <Check size={14} className="ml-auto text-indigo-400 shrink-0" />
                        </div>
                    </div>
                )}

                {/* ── 팀 목록 테이블 ───────────────────────────────────────── */}
                {leagueTeams.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-900/80">
                                <tr>
                                    <TH className="pl-4 w-10">순위</TH>
                                    <TH>팀</TH>
                                    {league.type !== 'tournament' && <TH>컨퍼런스</TH>}
                                    <TH>GM</TH>
                                    <TH className="pr-4" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {[...leagueTeams]
                                    .sort((a, b) => {
                                        if (a.draft_order === null && b.draft_order === null) return 0;
                                        if (a.draft_order === null) return 1;
                                        if (b.draft_order === null) return -1;
                                        return a.draft_order - b.draft_order;
                                    })
                                    .map(team => {
                                    const isMyTeam   = team.user_id === userId;
                                    const isHuman    = !team.is_ai && team.user_id !== null;
                                    const isEmpty    = team.user_id === null;
                                    const isClaiming = claiming === team.id;
                                    // 선택 가능: 빈 팀 + 추첨 전 + 참가 중
                                    const canSelect  = isEmpty && canClaim && isMember;
                                    // 변경 가능: 내 팀이 있고 다른 빈 팀 선택 시
                                    const canChange  = isMyTeam && canChangePre;

                                    return (
                                        <tr
                                            key={team.id}
                                            className={`transition-colors ${
                                                isMyTeam ? 'bg-indigo-500/5' : 'bg-slate-900/40'
                                            }`}
                                        >
                                            {/* 드래프트 오더 */}
                                            <td className="pl-4 pr-3 py-3 text-sm font-bold text-slate-300 w-10">
                                                {team.draft_order !== null ? `#${team.draft_order}` : <span className="text-slate-700">—</span>}
                                            </td>

                                            {/* 팀 */}
                                            <td className="pr-3 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    {isClaiming ? (
                                                        <div className="w-7 h-7 flex items-center justify-center shrink-0">
                                                            <Loader2 size={14} className="animate-spin text-indigo-400" />
                                                        </div>
                                                    ) : (
                                                        <div
                                                            className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-black shrink-0"
                                                            style={{ backgroundColor: team.color_primary, color: '#fff' }}
                                                        >
                                                            {team.team_abbr}
                                                        </div>
                                                    )}
                                                    <span className="font-bold text-white whitespace-nowrap">{team.team_name}</span>
                                                </div>
                                            </td>

                                            {/* 컨퍼런스 */}
                                            {league.type !== 'tournament' && (
                                                <td className="px-3 py-3 text-sm font-bold text-white whitespace-nowrap">
                                                    {fmtConference(team.conference)}
                                                </td>
                                            )}

                                            {/* GM */}
                                            <td className="px-3 py-3 text-sm font-bold">
                                                {isMyTeam
                                                    ? <span className="text-indigo-400">{team.nickname ?? '—'}</span>
                                                    : isHuman
                                                    ? <span className="text-white">{team.nickname ?? '—'}</span>
                                                    : <span className="text-slate-500">없음</span>
                                                }
                                            </td>

                                            {/* 액션: 참가 / 선택 / 변경 / 편집 */}
                                            <td className="pl-2 pr-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* 참가 (비회원 + 빈 팀) */}
                                                    {isEmpty && isRecruiting && !isMember && (
                                                        <button
                                                            onClick={() => handleJoinAndClaim(team)}
                                                            disabled={!!claiming}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            {claiming === team.id
                                                                ? <Loader2 size={11} className="animate-spin" />
                                                                : '참가'
                                                            }
                                                        </button>
                                                    )}
                                                    {/* 편집 + 탈퇴 (내 팀, 추첨 전) */}
                                                    {canChange && (
                                                        <>
                                                            <button
                                                                onClick={() => setEditTarget(team)}
                                                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                                                            >
                                                                편집
                                                            </button>
                                                            <button
                                                                onClick={handleLeave}
                                                                disabled={leaving}
                                                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                            >
                                                                탈퇴
                                                            </button>
                                                        </>
                                                    )}
                                                    {/* 선택 (회원 + 빈 팀 + 추첨 전) */}
                                                    {canSelect && (
                                                        <button
                                                            onClick={() => handleClaim(team)}
                                                            disabled={!!claiming}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white"
                                                        >
                                                            {myTeam ? '변경' : '선택'}
                                                        </button>
                                                    )}
                                                    {/* 강퇴 (어드민 + 다른 인간 멤버) */}
                                                    {isAdmin && !isMyTeam && isHuman && (
                                                        <button
                                                            onClick={() => handleKick(team.user_id!)}
                                                            disabled={kickingId === team.user_id}
                                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-500/10 hover:bg-red-500/25 text-red-500 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            {kickingId === team.user_id
                                                                ? <Loader2 size={11} className="animate-spin" />
                                                                : null
                                                            }
                                                            강퇴
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 팀 프로필 편집 모달 */}
            {room && userId && editTarget && (
                <TeamSetupModal
                    open={!!editTarget}
                    roomId={room.id}
                    userId={userId}
                    existingTeamIds={leagueTeams
                        .filter(t => t.id !== editTarget.id)
                        .map(t => t.team_slug)}
                    initial={{
                        name:           editTarget.team_name,
                        abbr:           editTarget.team_abbr,
                        colorPrimary:   editTarget.color_primary,
                        colorSecondary: editTarget.color_secondary,
                    }}
                    onClose={() => setEditTarget(null)}
                    onSaved={reload}
                    saveOverride={async (values) => {
                        const { error } = await updateTeamProfile(
                            editTarget.id, userId,
                            values.name, values.abbr, values.colorPrimary, values.colorSecondary,
                        );
                        return { error };
                    }}
                />
            )}

            {/* 드래프트 풀 미리보기 */}
            {showDraftPool && league && (
                <DraftPoolModal
                    poolTypes={draftPoolTypes}
                    ovrMin={league.draft_ovr_min ?? 0}
                    ovrMax={league.draft_ovr_max ?? 99}
                    onClose={() => setShowDraftPool(false)}
                />
            )}
        </>
    );
};

export default LeagueLobbyView;

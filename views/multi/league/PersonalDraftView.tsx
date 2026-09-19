// PersonalDraftView.tsx — 토너먼트 개인 팩 드래프트 화면 (승인된 시안 v49 기준).
// 라우트: /multi/leagues/:leagueId/personal-draft — leagues.personal_draft_format이 있는 리그 전용.
// 헤더 [뒤로 + 토너먼트 이름 | {N}라운드 mm:ss | 지명하기] / 바디 [라운드 구성 17% | 카드 그리드 | 내 로스터 17%].
// 진행 상태·타이머·자동 지명은 전부 hooks/usePersonalDraft.ts(→ 서버 RPC)가 소유한다.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useGame } from '../../../hooks/useGameContext';
import { useLeagueContext } from './LeagueLayout';
import { usePersonalDraft } from '../../../hooks/usePersonalDraft';
import { shouldUseCustomOverrides } from '../../../utils/leagueOverrides';
import { computeRosterSize } from '../../../services/multi/personalDraftFormat';
import { PersonalDraftCard } from '../../../components/draft/PersonalDraftCard';
import { useCardTeamColors } from '../../../hooks/useCardTeamColors';
import { OvrBadge } from '../../../components/common/OvrBadge';

function formatClock(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const PersonalDraftView: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const navigate     = useNavigate();
    const { session }  = useGame();
    const { league, room, leagueTeams, isLoading: ctxLoading } = useLeagueContext();
    // [2026-09-20] 카드 전용 팀별 컬러 오버라이드(어드민 카드 컬렉션 탭에서 설정) — 카드 배경에 반영
    const cardTeamColors = useCardTeamColors();
    const userId = session?.user?.id ?? null;
    const myTeam = useMemo(() => leagueTeams.find(t => t.user_id === userId) ?? null, [leagueTeams, userId]);
    const format = league?.personal_draft_format ?? null;
    const useCustomOverrides = shouldUseCustomOverrides(league);

    const {
        packState, poolPlayers, roster,
        isLoading, isSubmitting, error,
        timeRemaining, lastAutoPicked,
        submitPick,
    } = usePersonalDraft({
        roomId: room?.id ?? null,
        teamId: myTeam?.id ?? null,
        format,
        useCustomOverrides,
    });

    const [selectedId, setSelectedId] = useState<string | null>(null);
    // 팩이 바뀌면(라운드 진행/자동 지명) 선택 해제
    useEffect(() => { setSelectedId(null); }, [packState?.packStartedAt, packState?.currentRound]);

    const totalRoster  = useMemo(() => (format ? computeRosterSize(format.rounds) : 0), [format]);
    const currentRound = packState?.currentRound ?? 1;
    const isCompleted  = packState?.status === 'completed';
    const rosterCount  = roster.length;
    // 같은 라운드에서 이미 뽑은 카드는 다시 고를 수 없게(라운드당 picks>1인 포맷 대비)
    const pickedThisRound = useMemo(() => {
        const set = new Set<string>();
        for (const r of roster) if (r.draftedRound === currentRound) set.add(r.sourcePlayerId);
        return set;
    }, [roster, currentRound]);

    const handleSelect = useCallback((id: string) => {
        setSelectedId(prev => (prev === id ? null : id));
    }, []);

    const handlePick = useCallback(async () => {
        if (!selectedId || isSubmitting || isCompleted) return;
        const ok = await submitPick(selectedId);
        if (ok) setSelectedId(null);
    }, [selectedId, isSubmitting, isCompleted, submitPick]);

    const goBack = useCallback(() => navigate(`/multi/leagues/${leagueId}/season`), [navigate, leagueId]);

    // ── 가드 ────────────────────────────────────────────────────────────────
    if (ctxLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-950">
                <Loader2 size={24} className="animate-spin text-indigo-400" />
            </div>
        );
    }
    if (!league || !room || !format) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-3 bg-slate-950">
                <p className="text-sm text-slate-400">이 세션은 팩 드래프트 방식이 아닙니다.</p>
                <button onClick={goBack} className="text-indigo-400 text-sm hover:underline">로비로 돌아가기</button>
            </div>
        );
    }
    if (!myTeam) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-3 bg-slate-950">
                <p className="text-sm text-slate-400">먼저 로비에서 팀을 선택해주세요.</p>
                <button onClick={goBack} className="text-indigo-400 text-sm hover:underline">로비로 돌아가기</button>
            </div>
        );
    }

    const canPick = !!selectedId && !isSubmitting && !isCompleted && !!packState;
    const timerUrgent = timeRemaining != null && timeRemaining <= 30;
    const pickBtnClass = canPick
        ? 'px-4 py-1.5 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-lg text-sm font-medium text-white transition-all active:scale-[0.98] shrink-0'
        : 'px-4 py-1.5 rounded-lg text-sm font-medium transition-all bg-slate-800 text-slate-600 cursor-not-allowed shrink-0';

    return (
        <div className="pretendard flex flex-col h-screen bg-slate-950 text-slate-200">
            {/* ── 헤더 ── */}
            <div className="shrink-0 relative z-30 bg-slate-900 border-b border-slate-700">
                <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center px-5 py-2.5 gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                        <button
                            type="button"
                            aria-label="뒤로가기"
                            onClick={goBack}
                            className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <ChevronLeft size={18} strokeWidth={2.25} />
                        </button>
                        <div className="text-sm font-bold text-white/80 truncate">{league.name}</div>
                    </div>
                    <div className="text-center">
                        <div className="font-medium text-2xl leading-none text-white tabular-nums">
                            {isCompleted ? (
                                '드래프트 완료'
                            ) : (
                                <>
                                    {currentRound}라운드
                                    {timeRemaining != null && (
                                        <>
                                            {' '}
                                            <span className={timerUrgent ? 'text-amber-400' : 'text-white'}>{formatClock(timeRemaining)}</span>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                    <div className="justify-self-end flex items-center">
                        {isCompleted ? (
                            <button
                                type="button"
                                onClick={goBack}
                                className="px-4 py-1.5 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-lg text-sm font-medium text-white transition-all active:scale-[0.98] shrink-0"
                            >
                                로비로 이동
                            </button>
                        ) : (
                            <button type="button" onClick={handlePick} disabled={!canPick} className={pickBtnClass}>
                                {isSubmitting ? '지명 중…' : '지명하기'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── 바디: 3단 ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-950">
                {/* 좌측: 라운드 구성 */}
                <div className="w-[17%] flex flex-col border-r border-slate-800">
                    <div className="px-3 h-10 border-b border-slate-800/50 shrink-0 flex items-center justify-between bg-slate-800/30">
                        <span className="text-sm font-medium uppercase text-indigo-400">라운드 구성</span>
                        <span className="text-xs font-semibold text-slate-400">총 {totalRoster}명</span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        {format.rounds.map(r => {
                            const done = isCompleted || r.round < currentRound;
                            const cur  = !isCompleted && r.round === currentRound;
                            const narrowsByYear = r.draftYearMin != null || r.draftYearMax != null;
                            const yearClause = narrowsByYear
                                ? `, ${r.draftYearMin ?? league.draft_year_min}~${r.draftYearMax ?? league.draft_year_max}년 지명`
                                : '';
                            return (
                                <div
                                    key={r.round}
                                    className={`px-3 py-2 border-b border-slate-800/20 text-xs leading-snug ${
                                        cur ? 'round-current text-white' : done ? 'bg-emerald-500/10 text-slate-400' : 'text-slate-400'
                                    }`}
                                >
                                    <span className={`font-medium ${cur ? 'text-emerald-300' : done ? 'text-emerald-400/80' : 'text-slate-300'}`}>
                                        {r.round}라운드
                                    </span>
                                    <span className="mx-1">:</span>
                                    OVR <span className={`tabular-nums ${cur ? 'font-semibold' : ''}`}>{r.ovrMin}~{r.ovrMax}</span>{yearClause} 내에서{' '}
                                    <span className={cur ? 'font-semibold' : ''}>{r.picks}장</span>의 카드를 뽑습니다.
                                    {done && <span className="text-emerald-500/80"> ✓</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 중앙: 카드 그리드 */}
                <div className="flex-1 flex flex-col min-w-0">
                    {(error || lastAutoPicked > 0) && (
                        <div className="shrink-0 px-6 pt-3 flex flex-col gap-1.5">
                            {lastAutoPicked > 0 && (
                                <div className="px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                                    제한시간이 지나 {lastAutoPicked}장이 자동 지명되었습니다.
                                </div>
                            )}
                            {error && (
                                <div className="px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                                    {error}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-hide px-6 py-6">
                        {isLoading ? (
                            <div className="h-full flex items-center justify-center">
                                <Loader2 size={24} className="animate-spin text-indigo-400" />
                            </div>
                        ) : isCompleted ? (
                            <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                                <p className="text-lg font-bold text-white">로스터 구성이 끝났습니다.</p>
                                <p className="text-sm text-slate-400">{rosterCount}명의 선수가 팀에 합류했습니다. 토너먼트 시작을 기다려주세요.</p>
                            </div>
                        ) : (
                            <div className="grid gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                                {poolPlayers.map(p => (
                                    <PersonalDraftCard
                                        key={p.id}
                                        player={p}
                                        season={room.season}
                                        selected={selectedId === p.id}
                                        disabled={isSubmitting || pickedThisRound.has(p.id)}
                                        onSelect={handleSelect}
                                        teamColors={cardTeamColors}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 우측: 내 로스터 */}
                <div className="w-[17%] flex flex-col border-l border-slate-800">
                    <div className="px-3 h-10 border-b border-slate-800/50 shrink-0 flex items-center justify-between bg-slate-800/30">
                        <span className="text-sm font-medium uppercase text-indigo-400">내 로스터</span>
                        <span className="text-xs font-semibold text-slate-400">
                            <span className="text-slate-200">{rosterCount}</span> / {totalRoster}
                        </span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        {format.rounds.map(r => {
                            const filled = roster.filter(e => e.draftedRound === r.round);
                            const rows: React.ReactNode[] = [];
                            filled.forEach(e => {
                                rows.push(
                                    <div key={e.instanceId} className="h-10 min-h-10 max-h-10 px-2.5 border-b border-slate-700/50 flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-500 w-14 shrink-0">{r.round}라운드</span>
                                        {e.player ? (
                                            <>
                                                <OvrRowBadge value={e.player.ovr} />
                                                <span className="text-sm font-medium truncate flex-1 min-w-0 text-white">{e.player.name}</span>
                                                <span className="text-sm text-slate-500 w-7 text-center shrink-0">{e.player.position}</span>
                                            </>
                                        ) : (
                                            <span className="text-sm text-slate-500 flex-1">불러오는 중…</span>
                                        )}
                                    </div>,
                                );
                            });
                            const remaining = Math.max(0, r.picks - filled.length);
                            const isCur = !isCompleted && r.round === currentRound;
                            for (let i = 0; i < remaining; i++) {
                                rows.push(
                                    <div
                                        key={`${r.round}-empty-${i}`}
                                        className={`h-10 px-2.5 border-b border-slate-800/20 flex items-center gap-2 text-sm ${isCur ? 'text-emerald-300' : 'text-slate-600'}`}
                                    >
                                        <span className="text-sm font-medium w-14 shrink-0">{r.round}라운드</span>
                                        <span className="w-7 h-7 rounded border border-dashed border-slate-700/60 shrink-0" />
                                        <span className="flex-1">{isCur ? '이번 라운드 선택 중' : '대기'}</span>
                                    </div>,
                                );
                            }
                            return rows;
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

/** 로스터 행용 28px OVR 배지 — OvrBadge sm(24px)과 md(32px) 사이 크기라 w/h만 덮어쓴다. */
const OvrRowBadge: React.FC<{ value: number }> = ({ value }) => (
    <OvrBadge value={value} size="sm" className="!w-7 !h-7 !rounded" textClassName="text-xs" />
);

export default PersonalDraftView;

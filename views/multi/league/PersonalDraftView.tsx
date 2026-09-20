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
import {
    computeRosterSize, normalizeCollectionWeights, resolvePositionTargets, positionGroupOf, positionTargetsReachable,
    POSITION_GROUP_LABEL, type PositionGroup,
} from '../../../services/multi/personalDraftFormat';
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
        packState, poolPlayers, roster, collectionsById,
        isLoading, isSubmitting, error,
        timeRemaining, lastAutoPicked,
        submitPicks,
    } = usePersonalDraft({
        roomId: room?.id ?? null,
        teamId: myTeam?.id ?? null,
        format,
        useCustomOverrides,
    });

    // [2026-09-20] 동시 지명 — 이번 라운드 픽 수(picksRemaining)만큼 고른 뒤 한 번에 제출
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    // 팩이 바뀌면(라운드 진행/자동 지명) 선택 해제
    useEffect(() => { setSelectedIds([]); }, [packState?.packStartedAt, packState?.currentRound]);
    const picksNeeded = packState?.status === 'in_progress' ? Math.max(1, packState.picksRemaining) : 0;

    const totalRoster  = useMemo(() => (format ? computeRosterSize(format.rounds) : 0), [format]);
    // [2026-09-20] 등장 컬렉션 비율 — 라운드 구성 상단에 "컬렉션 xx%" 로 안내
    const collectionMix = useMemo(() => normalizeCollectionWeights(format?.collectionWeights), [format]);
    const currentRound = packState?.currentRound ?? 1;
    const isCompleted  = packState?.status === 'completed';
    const rosterCount  = roster.length;
    // 같은 실제 선수의 카드는 한 팀이 두 장 가질 수 없다 — 선택된 카드/이미 로스터에 있는 카드와 같은 선수는 잠근다
    const lockedRealPlayers = useMemo(() => {
        const set = new Set<string>();
        for (const r of roster) if (r.player) set.add(r.player.realPlayerId);
        for (const id of selectedIds) {
            const p = poolPlayers.find(x => x.cardId === id);
            if (p) set.add(p.realPlayerId);
        }
        return set;
    }, [roster, selectedIds, poolPlayers]);

    // [2026-09-20] 포지션 분배 — 목표/현재 수(중립 표시)와 "이 카드를 더 골라도 목표 달성이 가능한가"(DB 검증과 동일 규칙)
    const positionTargets = useMemo(() => resolvePositionTargets(format), [format]);
    const draftedGroups = useMemo(() => roster.map(r => r.player ? positionGroupOf(r.player.position) : null).filter((g): g is PositionGroup => !!g), [roster]);
    const groupCounts = useMemo(() => {
        const c: Record<PositionGroup, number> = { G: 0, F: 0, C: 0 };
        for (const g of draftedGroups) c[g]++;
        return c;
    }, [draftedGroups]);
    const selectedGroups = useMemo(
        () => selectedIds.map(id => poolPlayers.find(p => p.cardId === id)).filter(Boolean).map(p => positionGroupOf(p!.position)),
        [selectedIds, poolPlayers],
    );
    const wouldBreakTargets = useCallback((p: { position: string }) =>
        !positionTargetsReachable(positionTargets, totalRoster, draftedGroups, [...selectedGroups, positionGroupOf(p.position)]),
        [positionTargets, totalRoster, draftedGroups, selectedGroups]);

    const handleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id);
            if (prev.length >= picksNeeded) return prev;
            const p = poolPlayers.find(x => x.cardId === id);
            if (p && wouldBreakTargets(p)) return prev;
            return [...prev, id];
        });
    }, [picksNeeded, poolPlayers, wouldBreakTargets]);

    const handlePick = useCallback(async () => {
        if (selectedIds.length !== picksNeeded || picksNeeded === 0 || isSubmitting || isCompleted) return;
        const ok = await submitPicks(selectedIds);
        if (ok) setSelectedIds([]);
    }, [selectedIds, picksNeeded, isSubmitting, isCompleted, submitPicks]);

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

    const canPick = picksNeeded > 0 && selectedIds.length === picksNeeded && !isSubmitting && !isCompleted && !!packState;
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
                                {isSubmitting ? '지명 중…' : picksNeeded > 1 ? `지명하기 (${selectedIds.length}/${picksNeeded})` : '지명하기'}
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
                        {collectionMix.length > 0 && (
                            <div className="px-3 py-2 border-b border-slate-800/40 text-xs leading-snug text-slate-400">
                                <span className="font-medium text-slate-300">카드 컬렉션</span>
                                <span className="mx-1">:</span>
                                {collectionMix.map((w, i) => (
                                    <span key={w.id}>
                                        {i > 0 && <span className="text-slate-600"> · </span>}
                                        {collectionsById.get(w.id)?.name ?? '?'} <span className="tabular-nums text-slate-500">{Math.round(w.pct)}%</span>
                                    </span>
                                ))}
                            </div>
                        )}
                        {format.rounds.map(r => {
                            const done = isCompleted || r.round < currentRound;
                            const cur  = !isCompleted && r.round === currentRound;
                            // [2026-09-20] 가중치 모드면 상단 안내로 대신하고, 아니면 라운드 컬렉션(비어 있으면 전체 카드)
                            const colNames = collectionMix.length > 0 ? [] : (r.collectionIds ?? []).map(id => collectionsById.get(id)?.name).filter(Boolean) as string[];
                            const yearClause = colNames.length > 0 ? `, ${colNames.join(' · ')}` : '';
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
                                        selected={selectedIds.includes(p.cardId)}
                                        disabled={isSubmitting || (
                                            !selectedIds.includes(p.cardId) && (
                                                selectedIds.length >= picksNeeded ||          // 이번 라운드 픽 수만큼 이미 골랐음
                                                lockedRealPlayers.has(p.realPlayerId) ||       // 같은 실제 선수 카드가 선택/로스터에 있음
                                                wouldBreakTargets(p)                           // 이 카드를 고르면 포지션 목표를 채울 수 없음
                                            )
                                        )}
                                        disabledReason={
                                            lockedRealPlayers.has(p.realPlayerId) ? '같은 선수의 카드를 이미 보유했거나 선택 중입니다'
                                            : wouldBreakTargets(p) ? `${POSITION_GROUP_LABEL[positionGroupOf(p.position)]}를 더 뽑으면 포지션 목표(가드 ${positionTargets.G} · 포워드 ${positionTargets.F} · 센터 ${positionTargets.C})를 채울 수 없습니다`
                                            : undefined
                                        }
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
                        <div className="px-2.5 py-1.5 border-b border-slate-800/40 flex items-center gap-3 text-xs text-slate-400 tabular-nums">
                            {(['G', 'F', 'C'] as PositionGroup[]).map(g => (
                                <span key={g}>{POSITION_GROUP_LABEL[g]} <span className="text-slate-200">{groupCounts[g]}</span>/{positionTargets[g]}</span>
                            ))}
                        </div>
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
                                                <span className="text-sm font-medium truncate flex-1 min-w-0 text-white">{e.player.name} <span className="text-slate-500 font-normal tabular-nums">{e.player.season}{e.player.edition ? ` · ${e.player.edition}` : ''}</span></span>
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

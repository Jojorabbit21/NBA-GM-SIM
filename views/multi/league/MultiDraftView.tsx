
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, GripHorizontal, ChevronLeft } from 'lucide-react';
import { supabase } from '../../../services/supabaseClient';
import { useGame } from '../../../hooks/useGameContext';
import { useLeagueContext } from './LeagueLayout';
import { useLeagueDraft } from '../../../hooks/useLeagueDraft';
import { useDraftPresence } from '../../../hooks/useDraftPresence';
import type { DraftPoolPlayer, RoomTeamMetaMap } from '../../../types/multiDraft';
import type { Player } from '../../../types';
import { ATTR_GROUPS, ATTR_AVG_KEYS } from '../../../data/attributeConfig';

import { DraftHeader } from '../../../components/draft/DraftHeader';
import { DraftBoard } from '../../../components/draft/DraftBoard';
import type { BoardPick } from '../../../components/draft/DraftBoard';
import { PickHistory } from '../../../components/draft/PickHistory';
import { PlayerPool } from '../../../components/draft/PlayerPool';
import { MyRoster } from '../../../components/draft/MyRoster';
import { DraftAdminPanel } from '../../../components/draft/DraftAdminPanel';

const POSITION_COLORS: Record<string, string> = {
    PG: '#22d3ee', SG: '#34d399', SF: '#fbbf24', PF: '#fb7185', C: '#a78bfa',
};

/** DraftPoolPlayer(meta_players row) → Player 어댑터.
 *  custom_overrides가 있으면 base_attributes에 머지 후 반환 (싱글 custom mode와 동일 메커니즘).
 */
function toPlayer(p: DraftPoolPlayer, applyCustomOverrides = false): Player {
    // DB는 런타임 키로 저장 (2026-04-21 마이그레이션 완료)
    const base: Record<string, any> = { ...(p.base_attributes as any) };

    // custom_overrides: alltime 풀이 포함된 세션에서만 적용
    if (applyCustomOverrides) {
        const overrides = base.custom_overrides;
        if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
            for (const [k, v] of Object.entries(overrides)) {
                if (typeof v !== 'number') continue;
                base[k] = v;
            }
        }
    }

    // 카테고리 평균(ins/out/plm/def/reb/ath)이 없으면 개별 능력치에서 계산
    for (const group of ATTR_GROUPS) {
        const avgKey = group.keys[0];
        if (!ATTR_AVG_KEYS.has(avgKey)) continue;
        if (base[avgKey] == null) {
            const subKeys = group.keys.slice(1);
            const vals = subKeys.map((k: string) => base[k] ?? 0).filter((v: number) => v > 0);
            if (vals.length > 0) {
                base[avgKey] = Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length);
            }
        }
    }

    return {
        ...base,
        id:       p.id,
        name:     p.name,
        position: p.position,
        ovr:      base.ovr    ?? 70,
        salary:   base.salary ?? p.salary ?? 0,
        age:      base.age    ?? 25,
        contract: base.contract ?? { salary: p.salary ?? 0, years: 1 },
        team:     base.team   ?? '',
    } as unknown as Player;
}

const MultiDraftView: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const navigate     = useNavigate();
    const { session }  = useGame();
    const { room, members, league, leagueTeams } = useLeagueContext();
    const userId       = session?.user?.id ?? null;
    const isAdmin            = !!(userId && league?.admin_user_id === userId);
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');

    const {
        draftState, poolPlayers, isLoading,
        isMyTurn, currentPickEntry, timeRemaining, myTeamId, myPicks,
        submitPick, isSubmitting, sendAdmin,
    } = useLeagueDraft(room?.id ?? null, session);

    const onlineUserIds = useDraftPresence(room?.id ?? null, userId);

    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
    const [pickError,        setPickError]        = useState<string | null>(null);

    // ── 낙관적 타이머 동결 (pause 클릭 즉시 표시, Realtime 확정 전까지 유지) ──
    const [frozenTime, setFrozenTime] = useState<number | null>(null);
    const handleOptimisticPause  = useCallback(() => setFrozenTime(timeRemaining), [timeRemaining]);
    const handleOptimisticRevert = useCallback(() => setFrozenTime(null), []);
    // Realtime으로 active 상태 수신 시 동결 해제 (resume 후 확정)
    useEffect(() => {
        if (draftState?.status === 'active') setFrozenTime(prev => prev !== null ? null : prev);
    }, [draftState?.status]);
    const displayTimeRemaining = frozenTime ?? timeRemaining;

    // ── 리사이즈 divider ─────────────────────────────────────────────────────
    const containerRef  = useRef<HTMLDivElement>(null);
    const [boardRatio, setBoardRatio] = useState(40);
    const isDragging    = useRef(false);
    const HEADER_HEIGHT = 72;

    const handleMouseDown = useCallback(() => {
        isDragging.current = true;
        document.body.style.cursor     = 'row-resize';
        document.body.style.userSelect = 'none';

        const onMove = (e: MouseEvent) => {
            if (!isDragging.current || !containerRef.current) return;
            const rect    = containerRef.current.getBoundingClientRect();
            const avail   = rect.height - HEADER_HEIGHT;
            const newRatio = ((e.clientY - rect.top - HEADER_HEIGHT) / avail) * 100;
            setBoardRatio(Math.min(70, Math.max(20, newRatio)));
        };
        const onUp = () => {
            isDragging.current = false;
            document.body.style.cursor     = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    }, []);

    // ── draftState → DraftBoard 용 파생 값 ──────────────────────────────────
    const teamCount = draftState?.teamCount ?? 1;

    const teamIds = useMemo((): string[] => {
        if (!draftState) return [];
        const seen = new Set<string>();
        return draftState.pickOrder
            .filter(e => { if (seen.has(e.teamId)) return false; seen.add(e.teamId); return true; })
            .map(e => e.teamId);
    }, [draftState?.pickOrder]);

    const draftOrder = useMemo(
        () => (draftState?.pickOrder ?? []).map(e => e.teamId),
        [draftState?.pickOrder],
    );

    // onlineUserIds → onlineTeamIds 변환 (league_teams의 user_id 필드 참조)
    const onlineTeamIds = useMemo((): Set<string> => {
        const set = new Set<string>();
        leagueTeams.forEach(t => {
            if (t.user_id && onlineUserIds.has(t.user_id)) {
                set.add(t.team_slug);
            }
        });
        return set;
    }, [leagueTeams, onlineUserIds]);

    // league_teams가 팀명/약어/색상의 단일 소스 — 로비와 동일한 데이터 사용
    const teamMeta = useMemo((): RoomTeamMetaMap => {
        const map: RoomTeamMetaMap = {};
        leagueTeams.forEach(t => {
            map[t.team_slug] = {
                teamId:         t.team_slug,
                name:           t.team_name,
                abbr:           t.team_abbr,
                colorPrimary:   t.color_primary,
                colorSecondary: t.color_secondary,
            };
        });
        return map;
    }, [leagueTeams]);

    const boardPicks = useMemo((): BoardPick[] =>
        (draftState?.picks ?? []).map(p => ({
            round:      p.round,
            teamId:     p.teamId,
            playerId:   p.playerId,
            playerName: p.playerName,
            ovr:        p.ovr,
            position:   p.position,
        })),
    [draftState?.picks]);

    // ── PlayerPool / MyRoster 용 어댑터 ──────────────────────────────────────
    const draftedSet = useMemo(
        () => new Set(draftState?.draftedIds ?? []),
        [draftState?.draftedIds],
    );

    const adaptedPlayers = useMemo(
        () => poolPlayers.filter(p => !draftedSet.has(p.id)).map(p => toPlayer(p, useCustomOverrides)),
        [poolPlayers, draftedSet],
    );

    const myRosterPlayers = useMemo((): Player[] => {
        const myPickSet = new Set(myPicks);
        return poolPlayers.filter(p => myPickSet.has(p.id)).map(p => toPlayer(p, useCustomOverrides));
    }, [poolPlayers, myPicks]);

    // ── DraftHeader 용 파생 값 ────────────────────────────────────────────────
    const currentRound      = draftState ? Math.floor(draftState.currentPickIndex / teamCount) + 1 : 1;
    const currentPickInRound = draftState ? (draftState.currentPickIndex % teamCount) + 1 : 1;

    const picksUntilUser = useMemo(() => {
        if (isMyTurn || !draftState) return 0;
        const idx = draftState.currentPickIndex;
        for (let i = idx + 1; i < draftState.pickOrder.length; i++) {
            if (draftState.pickOrder[i].userId === userId) return i - idx;
        }
        return -1;
    }, [draftState, isMyTurn, userId]);

    // PlayerPool은 React.memo로 감싸져 있어, 이 핸들러가 매 렌더마다 새로 생성되면
    // (인라인 화살표 함수) memo 비교가 무력화돼 리스트가 계속 다시 그려진다 — useCallback으로 고정.
    const handleSelectPlayer = useCallback((p: Player) => {
        setSelectedPlayerId(prev => prev === p.id ? null : p.id);
    }, []);

    // ── 픽 처리 ──────────────────────────────────────────────────────────────
    const handleDraft = useCallback(async (player: Player) => {
        if (!isMyTurn || isSubmitting) return;
        setPickError(null);
        const { error } = await submitPick(player.id);
        if (error) setPickError(error);
    }, [isMyTurn, isSubmitting, submitPick]);

    // ── 로딩 / 에러 가드 ─────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={24} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    if (!draftState) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-3">
                <p className="text-slate-400 text-sm ko-normal">드래프트가 아직 시작되지 않았습니다.</p>
                <button
                    onClick={() => navigate(`/multi/leagues/${leagueId}/lobby`)}
                    className="text-indigo-400 text-sm hover:underline ko-normal"
                >
                    로비로 돌아가기
                </button>
            </div>
        );
    }

    if (draftState.status === 'completed') {
        return (
            <DraftCompletedScreen
                leagueId={leagueId ?? ''}
                roomId={room?.id ?? ''}
                onNavigate={() => navigate(`/multi/leagues/${leagueId}/season`)}
            />
        );
    }

    return (
        <div ref={containerRef} className="pretendard flex flex-col h-screen bg-slate-950">

            {/* ── 로비 복귀 버튼 ── */}
            <div className="shrink-0 flex items-center px-3 h-8 bg-slate-900/80 border-b border-slate-800/60">
                <button
                    onClick={() => navigate(`/multi/leagues/${leagueId}/lobby`)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-200 transition-colors"
                >
                    <ChevronLeft size={13} />
                    <span className="ko-normal">로비</span>
                </button>
            </div>

            {/* ── 어드민 패널 (admin_user_id 일치 시만 표시) ── */}
            {isAdmin && leagueId && room?.id && (
                <DraftAdminPanel
                    draftState={draftState}
                    leagueId={leagueId}
                    roomId={room.id}
                    onOptimisticPause={handleOptimisticPause}
                    onOptimisticRevert={handleOptimisticRevert}
                    sendAdmin={sendAdmin}
                />
            )}

            {/* ── 헤더 ── */}
            <DraftHeader
                currentRound={currentRound}
                currentPickInRound={currentPickInRound}
                currentTeamId={currentPickEntry?.teamId ?? ''}
                isUserTurn={isMyTurn}
                picksUntilUser={picksUntilUser}
                timeRemaining={displayTimeRemaining}
                isPaused={draftState.status === 'paused'}
                showAdvance={false}
                nextPickNumber={draftState.currentPickIndex + 1}
                nextPickTeamId={currentPickEntry?.teamId}
                teamMeta={teamMeta}
            />

            {/* ── 드래프트 보드 (리사이즈 가능) ── */}
            <div style={{ flex: `0 0 ${boardRatio}%` }} className="min-h-0 overflow-hidden px-1.5 pt-1.5">
                <div className="h-full bg-slate-900/60 overflow-hidden">
                    <DraftBoard
                        teamIds={teamIds}
                        totalRounds={draftState.totalRounds}
                        picks={boardPicks}
                        currentPickIndex={draftState.currentPickIndex}
                        draftOrder={draftOrder}
                        userTeamId={myTeamId ?? ''}
                        positionColors={POSITION_COLORS}
                        teamMeta={teamMeta}
                        onlineTeamIds={onlineTeamIds}
                    />
                </div>
            </div>

            {/* ── 드래그 구분선 ── */}
            <div
                onMouseDown={handleMouseDown}
                className="h-1.5 bg-slate-800/80 hover:bg-indigo-600/50 cursor-row-resize flex items-center justify-center shrink-0 transition-colors"
            >
                <GripHorizontal size={14} className="text-slate-600" />
            </div>

            {/* ── 하단 3열 패널 ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden gap-1.5 bg-slate-950 p-1.5">

                {/* 픽 히스토리 */}
                <div className="w-[22%] bg-slate-900/60 rounded-xl overflow-hidden">
                    <PickHistory
                        picks={boardPicks}
                        totalRounds={draftState.totalRounds}
                        userTeamId={myTeamId ?? ''}
                        teamMeta={teamMeta}
                    />
                </div>

                {/* 선수 풀 */}
                <div className="flex-1 bg-slate-900/60 rounded-xl overflow-hidden flex flex-col">
                    {pickError && (
                        <p className="shrink-0 text-xs text-red-400 px-3 py-1 border-b border-slate-800">{pickError}</p>
                    )}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <PlayerPool
                            players={adaptedPlayers}
                            selectedPlayerId={selectedPlayerId}
                            onSelectPlayer={handleSelectPlayer}
                            isUserTurn={isMyTurn && !isSubmitting}
                            onDraft={handleDraft}
                            positionColors={POSITION_COLORS}
                        />
                    </div>
                </div>

                {/* 내 로스터 */}
                <div className="w-[22%] bg-slate-900/60 rounded-xl overflow-hidden">
                    <MyRoster players={myRosterPlayers} />
                </div>
            </div>
        </div>
    );
};

export default MultiDraftView;

// ─── 드래프트 완료 화면 ───────────────────────────────────────────────────────

interface DraftCompletedScreenProps {
    leagueId: string;
    roomId:   string;
    onNavigate: () => void;
}

const MAX_POLL_ATTEMPTS = 30; // 3초 × 30 = 90초

const DraftCompletedScreen: React.FC<DraftCompletedScreenProps> = ({ leagueId, onNavigate }) => {
    const [isReady,   setIsReady]   = useState(false);
    const [timedOut,  setTimedOut]  = useState(false);

    useEffect(() => {
        if (!leagueId) return;
        let cancelled = false;
        let attempts  = 0;
        let timerId:  ReturnType<typeof setTimeout>;

        const poll = async () => {
            if (cancelled) return;
            if (++attempts > MAX_POLL_ATTEMPTS) {
                setTimedOut(true);
                return;
            }
            const { data } = await supabase
                .from('leagues')
                .select('status')
                .eq('id', leagueId)
                .single();
            if (cancelled) return;
            if (data?.status === 'in_progress') {
                setIsReady(true);
            } else {
                timerId = setTimeout(poll, 3000);
            }
        };

        poll();
        return () => {
            cancelled = true;
            clearTimeout(timerId);
        };
    }, [leagueId]);

    if (timedOut) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-red-400 text-sm ko-normal">시즌 일정 생성 중 문제가 발생했습니다.</p>
                <button
                    onClick={() => window.location.reload()}
                    className="text-indigo-400 text-sm hover:underline ko-normal"
                >
                    새로고침
                </button>
            </div>
        );
    }

    if (!isReady) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-3">
                <Loader2 className="animate-spin text-indigo-400" size={28} />
                <p className="text-slate-400 text-sm ko-normal">시즌 일정을 생성하고 있습니다...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
            <h2 className="text-xl font-black text-white ko-tight">드래프트 완료!</h2>
            <p className="text-slate-400 text-sm ko-normal">시즌 일정이 준비됐습니다.</p>
            <button
                onClick={onNavigate}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors"
            >
                시즌 대시보드로
            </button>
        </div>
    );
};


import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, GripHorizontal } from 'lucide-react';
import { useGame } from '../../../hooks/useGameContext';
import { useCurrentLeague } from '../../../hooks/useCurrentLeague';
import { useLeagueDraft } from '../../../hooks/useLeagueDraft';
import type { DraftPoolPlayer } from '../../../types/multiDraft';
import type { Player } from '../../../types';

import { DraftHeader } from '../../../components/draft/DraftHeader';
import { DraftBoard } from '../../../components/draft/DraftBoard';
import type { BoardPick } from '../../../components/draft/DraftBoard';
import { PickHistory } from '../../../components/draft/PickHistory';
import { PlayerPool } from '../../../components/draft/PlayerPool';
import { MyRoster } from '../../../components/draft/MyRoster';

const POSITION_COLORS: Record<string, string> = {
    PG: '#22d3ee', SG: '#34d399', SF: '#fbbf24', PF: '#fb7185', C: '#a78bfa',
};

/** DraftPoolPlayer(meta_players row) → Player 어댑터.
 *  base_attributes를 spread하면 adaptPlayerToInput이 ins/out/ath 등을 찾아
 *  calculatePlayerOvr이 정상 작동한다.
 */
function toPlayer(p: DraftPoolPlayer): Player {
    return {
        ...(p.base_attributes ?? {}),
        id:       p.id,
        name:     p.name,
        position: p.position,
        ovr:      p.ovr,
        salary:   p.salary ?? 0,
        age:      p.age ?? (p.base_attributes as any)?.age ?? 25,
        contract: { salary: p.salary ?? 0, years: 1 },
        team:     '',
    } as unknown as Player;
}

const MultiDraftView: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const navigate     = useNavigate();
    const { session }  = useGame();
    const { room }     = useCurrentLeague();
    const userId       = session?.user?.id ?? null;

    const {
        draftState, poolPlayers, isLoading,
        isMyTurn, currentPickEntry, timeRemaining, myTeamId, myPicks,
        submitPick, isSubmitting,
    } = useLeagueDraft(room?.id ?? null, session);

    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
    const [pickError,        setPickError]        = useState<string | null>(null);

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
        () => poolPlayers.filter(p => !draftedSet.has(p.id)).map(toPlayer),
        [poolPlayers, draftedSet],
    );

    const myRosterPlayers = useMemo((): Player[] => {
        const myPickSet = new Set(myPicks);
        return poolPlayers.filter(p => myPickSet.has(p.id)).map(toPlayer);
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
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="text-4xl">🏀</div>
                <h2 className="text-xl font-black text-white ko-tight">드래프트 완료!</h2>
                <p className="text-slate-400 text-sm ko-normal">시즌이 곧 시작됩니다.</p>
                <button
                    onClick={() => navigate(`/multi/leagues/${leagueId}/season`)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors"
                >
                    시즌 대시보드로
                </button>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="pretendard flex flex-col h-screen bg-slate-950">

            {/* ── 헤더 ── */}
            <DraftHeader
                currentRound={currentRound}
                currentPickInRound={currentPickInRound}
                currentTeamId={currentPickEntry?.teamId ?? ''}
                isUserTurn={isMyTurn}
                picksUntilUser={picksUntilUser}
                timeRemaining={timeRemaining}
                showAdvance={false}
                nextPickNumber={draftState.currentPickIndex + 1}
                nextPickTeamId={currentPickEntry?.teamId}
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
                            onSelectPlayer={p => setSelectedPlayerId(prev => prev === p.id ? null : p.id)}
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

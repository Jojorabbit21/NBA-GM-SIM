
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Team, Player } from '../types';
import { calculatePlayerOvr } from '../utils/constants';
import { DraftHeader, PICK_TIME_LIMIT } from '../components/draft/DraftHeader';
import { DraftBoard, BoardPick } from '../components/draft/DraftBoard';
import { PickHistory } from '../components/draft/PickHistory';
import { PlayerPool } from '../components/draft/PlayerPool';
import { MyRoster } from '../components/draft/MyRoster';
import { POSITION_COLORS } from './FantasyDraftView';
import { CheckCircle } from 'lucide-react';
import type { ResolvedDraftOrder } from '../types/draftAssets';
import { generateSnakeDraftOrder } from '../utils/draftUtils';

const TOTAL_ROUNDS = 2;
const CPU_PICK_DELAY = 600;

interface RookieDraftViewProps {
    teams: Team[];
    myTeamId: string;
    draftOrder: string[];         // lotteryResult.finalOrder (30팀)
    resolvedDraftOrder?: ResolvedDraftOrder | null;  // 보호/스왑 반영된 60픽 오더
    draftClass: Player[];         // 생성된 60명 루키 (이미 Player[]로 변환됨)
    onComplete: (picks: BoardPick[]) => void;
}

export const RookieDraftView: React.FC<RookieDraftViewProps> = ({ teams, myTeamId, draftOrder: teamOrder, resolvedDraftOrder: resolved, draftClass, onComplete }) => {
    const allPlayers = useMemo(() => {
        return [...draftClass].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a) || a.id.localeCompare(b.id));
    }, [draftClass]);
    // resolvedDraftOrder가 있으면 60픽 currentTeamId 배열 사용, 없으면 snake order 생성
    const draftOrder = useMemo(() => {
        if (resolved?.picks && resolved.picks.length > 0) {
            return resolved.picks.map(p => p.currentTeamId);
        }
        return generateSnakeDraftOrder(teamOrder, TOTAL_ROUNDS);
    }, [resolved, teamOrder]);

    // ── Draft State ──
    const [picks, setPicks] = useState<BoardPick[]>([]);
    const [currentPickIndex, setCurrentPickIndex] = useState(0);
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

    // ── Timer State ──
    const [timeRemaining, setTimeRemaining] = useState(PICK_TIME_LIMIT);

    // Available players (not yet picked)
    const pickedIds = useMemo(() => new Set(picks.map(p => p.playerId)), [picks]);
    const availablePlayers = useMemo(() => allPlayers.filter(p => !pickedIds.has(p.id)), [allPlayers, pickedIds]);

    // Current pick info
    const isDraftComplete = currentPickIndex >= draftOrder.length;
    const currentTeamId = draftOrder[currentPickIndex] || teamOrder[0];
    const currentRound = Math.floor(currentPickIndex / teamOrder.length) + 1;
    const currentPickInRound = (currentPickIndex % teamOrder.length) + 1;
    const isUserTurn = !isDraftComplete && currentTeamId === myTeamId;

    // My drafted players (루키만)
    const myPicks = useMemo(() => {
        const myPickedIds = picks.filter(p => p.teamId === myTeamId).map(p => p.playerId);
        return allPlayers.filter(p => myPickedIds.includes(p.id));
    }, [picks, myTeamId, allPlayers]);

    // 기존 로스터 (MyRoster에 전달)
    const myExistingRoster = useMemo(() => {
        const myTeam = teams.find(t => t.id === myTeamId);
        return myTeam?.roster || [];
    }, [teams, myTeamId]);

    // How many picks until user's next turn
    const picksUntilUser = useMemo(() => {
        if (isUserTurn) return 0;
        for (let i = currentPickIndex + 1; i < draftOrder.length; i++) {
            if (draftOrder[i] === myTeamId) return i - currentPickIndex;
        }
        return -1;
    }, [currentPickIndex, draftOrder, myTeamId, isUserTurn]);

    // ── Warn before leaving during draft ──
    useEffect(() => {
        if (isDraftComplete) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDraftComplete]);

    // ── Timer: countdown, resets on each new pick ──
    useEffect(() => {
        setTimeRemaining(PICK_TIME_LIMIT);
        const interval = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev <= 1) { clearInterval(interval); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [currentPickIndex]);

    // ── CPU auto-pick: one pick at a time after short delay ──
    useEffect(() => {
        if (isUserTurn || currentPickIndex >= draftOrder.length) return;

        const timer = setTimeout(() => {
            setPicks(prevPicks => {
                const used = new Set(prevPicks.map(p => p.playerId));
                const pool = allPlayers.filter(p => !used.has(p.id));
                if (pool.length === 0) return prevPicks;

                const teamId = draftOrder[currentPickIndex];
                const player = pool[0]; // BPA
                return [...prevPicks, {
                    round: Math.floor(currentPickIndex / teamOrder.length) + 1,
                    teamId,
                    playerId: player.id,
                    playerName: player.name,
                    ovr: calculatePlayerOvr(player),
                    position: player.position,
                }];
            });
            setCurrentPickIndex(prev => prev + 1);
        }, CPU_PICK_DELAY);

        return () => clearTimeout(timer);
    }, [currentPickIndex, isUserTurn, draftOrder, allPlayers, teamOrder.length]);

    // ── User auto-pick on timeout ──
    useEffect(() => {
        if (timeRemaining !== 0 || !isUserTurn) return;
        if (availablePlayers.length > 0) {
            handleDraft(availablePlayers[0]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeRemaining, isUserTurn]);

    // ── Draft action (user pick) ──
    const handleDraft = useCallback((player: Player) => {
        if (!isUserTurn) return;
        const newPick: BoardPick = {
            round: currentRound,
            teamId: myTeamId,
            playerId: player.id,
            playerName: player.name,
            ovr: calculatePlayerOvr(player),
            position: player.position,
        };
        setPicks(prev => [...prev, newPick]);
        setCurrentPickIndex(prev => prev + 1);
        setSelectedPlayerId(null);
    }, [isUserTurn, currentRound, myTeamId]);

    // ── Skip to my turn: all CPU picks at once ──
    const handleSkipToMyTurn = useCallback(() => {
        const newPicks: BoardPick[] = [];
        const used = new Set(picks.map(p => p.playerId));
        let idx = currentPickIndex;
        const pool = allPlayers.filter(p => !used.has(p.id));
        let poolIdx = 0;

        while (idx < draftOrder.length && poolIdx < pool.length) {
            const tid = draftOrder[idx];
            if (tid === myTeamId) break;
            const player = pool[poolIdx++];
            used.add(player.id);
            newPicks.push({
                round: Math.floor(idx / teamOrder.length) + 1,
                teamId: tid,
                playerId: player.id,
                playerName: player.name,
                ovr: calculatePlayerOvr(player),
                position: player.position,
            });
            idx++;
        }

        if (newPicks.length > 0) {
            setPicks(prev => [...prev, ...newPicks]);
            setCurrentPickIndex(idx);
        }
    }, [picks, currentPickIndex, draftOrder, myTeamId, allPlayers, teamOrder.length]);

    const showSkip = !isUserTurn && currentPickIndex < draftOrder.length;

    return (
        <div className="pretendard flex flex-col h-full bg-slate-950 relative">
            {/* Header */}
            <DraftHeader
                currentRound={currentRound}
                currentPickInRound={currentPickInRound}
                currentTeamId={currentTeamId}
                isUserTurn={isUserTurn}
                picksUntilUser={picksUntilUser}
                timeRemaining={timeRemaining}
                onSkipToMyTurn={handleSkipToMyTurn}
                showSkip={showSkip}
            />

            {/* Draft Board — 2라운드이므로 shrink-0 고정 높이 (드래그 디바이더 불필요) */}
            <div className="shrink-0 overflow-hidden px-1.5 pt-1.5">
                <div className="bg-slate-900/60 overflow-hidden">
                    <DraftBoard
                        teamIds={teamOrder}
                        totalRounds={TOTAL_ROUNDS}
                        picks={picks}
                        currentPickIndex={currentPickIndex}
                        draftOrder={draftOrder}
                        userTeamId={myTeamId}
                        positionColors={POSITION_COLORS}
                    />
                </div>
            </div>

            {/* Bottom 3-column panel — flex-1로 나머지 공간 전체 차지 */}
            <div className="flex flex-1 min-h-0 overflow-hidden gap-1.5 bg-slate-950 p-1.5">
                {/* Left: Pick History */}
                <div className="w-[22%] bg-slate-900/60 rounded-xl overflow-hidden">
                    <PickHistory picks={picks} totalRounds={TOTAL_ROUNDS} userTeamId={myTeamId} />
                </div>

                {/* Center: Player Pool */}
                <div className="flex-1 bg-slate-900/60 rounded-xl overflow-hidden">
                    <PlayerPool
                        players={availablePlayers}
                        selectedPlayerId={selectedPlayerId}
                        onSelectPlayer={(p) => setSelectedPlayerId(p.id === selectedPlayerId ? null : p.id)}
                        isUserTurn={isUserTurn}
                        onDraft={handleDraft}
                        positionColors={POSITION_COLORS}
                    />
                </div>

                {/* Right: My Roster (기존 로스터 + 루키 드래프트 픽) */}
                <div className="w-[22%] bg-slate-900/60 rounded-xl overflow-hidden">
                    <MyRoster players={myPicks} existingRoster={myExistingRoster} />
                </div>
            </div>

            {/* Draft Complete Overlay */}
            {isDraftComplete && (
                <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center">
                    <div className="text-center space-y-6">
                        <CheckCircle size={64} className="text-emerald-500 mx-auto" />
                        <div className="space-y-2">
                            <h2 className="text-3xl font-black text-white pretendard tracking-widest">루키 드래프트 완료</h2>
                            <p className="text-sm text-slate-400 ko-normal">모든 팀의 루키 드래프트가 완료되었습니다</p>
                        </div>
                        <button
                            onClick={() => onComplete(picks)}
                            className="px-8 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-sm transition-all active:scale-95 shadow-lg shadow-emerald-900/30"
                        >
                            확인
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

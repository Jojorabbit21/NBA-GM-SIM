
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Team, Player } from '../types';
import { TEAM_DATA } from '../data/teamData';
import { calculatePlayerOvr } from '../utils/constants';
import { getTeamTheme, getButtonTheme } from '../utils/teamTheme';
import { DraftHeader } from '../components/draft/DraftHeader';
import { DraftBoard, BoardPick } from '../components/draft/DraftBoard';
import { PickHistory } from '../components/draft/PickHistory';
import { PlayerPool } from '../components/draft/PlayerPool';
import { MyRoster } from '../components/draft/MyRoster';
import { GripHorizontal } from 'lucide-react';

// ── Position Color System ──
export const POSITION_COLORS: Record<string, string> = {
    PG: '#22d3ee', SG: '#34d399', SF: '#fbbf24', PF: '#fb7185', C: '#a78bfa',
};

interface FantasyDraftViewProps {
    teams: Team[];
    myTeamId: string;
    onBack: () => void;
}

// ── Snake Draft Order Generator ──
function generateSnakeDraftOrder(teamIds: string[], rounds: number): string[] {
    const order: string[] = [];
    for (let r = 0; r < rounds; r++) {
        const ids = r % 2 === 0 ? [...teamIds] : [...teamIds].reverse();
        order.push(...ids);
    }
    return order;
}

// ── Collect all players from all teams as the "draft pool" ──
function collectAllPlayers(teams: Team[]): Player[] {
    const all: Player[] = [];
    teams.forEach(t => t.roster.forEach(p => all.push(p)));
    all.sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a) || a.id.localeCompare(b.id));
    return all;
}

export const FantasyDraftView: React.FC<FantasyDraftViewProps> = ({ teams, myTeamId, onBack }) => {
    const TOTAL_ROUNDS = 15;
    const teamIds = useMemo(() => Object.keys(TEAM_DATA), []);
    const draftOrder = useMemo(() => generateSnakeDraftOrder(teamIds, TOTAL_ROUNDS), [teamIds]);

    // ── Team Theme ──
    const myTeamColors = TEAM_DATA[myTeamId]?.colors || null;
    const teamTheme = useMemo(() => getTeamTheme(myTeamId, myTeamColors), [myTeamId, myTeamColors]);
    const buttonTheme = useMemo(() => getButtonTheme(myTeamId, myTeamColors), [myTeamId, myTeamColors]);
    const allPlayers = useMemo(() => collectAllPlayers(teams), [teams]);

    // ── Mock Draft State ──
    // Simulate a few CPU picks already made for demo purposes
    const [picks, setPicks] = useState<BoardPick[]>(() => {
        const initial: BoardPick[] = [];
        const used = new Set<string>();
        const pool = [...allPlayers];

        // Simulate first few picks (demo data)
        const demoPicks = Math.min(12, pool.length);
        for (let i = 0; i < demoPicks; i++) {
            const teamId = draftOrder[i];
            const player = pool.find(p => !used.has(p.id));
            if (!player) break;
            used.add(player.id);
            initial.push({
                round: Math.floor(i / teamIds.length) + 1,
                teamId,
                playerId: player.id,
                playerName: player.name,
                ovr: calculatePlayerOvr(player),
                position: player.position,
            });
        }
        return initial;
    });

    const [currentPickIndex, setCurrentPickIndex] = useState(picks.length);
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

    // Available players (not yet picked)
    const pickedIds = useMemo(() => new Set(picks.map(p => p.playerId)), [picks]);
    const availablePlayers = useMemo(() => allPlayers.filter(p => !pickedIds.has(p.id)), [allPlayers, pickedIds]);

    // Current pick info
    const currentTeamId = draftOrder[currentPickIndex] || teamIds[0];
    const currentRound = Math.floor(currentPickIndex / teamIds.length) + 1;
    const currentPickInRound = (currentPickIndex % teamIds.length) + 1;
    const isUserTurn = currentTeamId === myTeamId;

    // My drafted players
    const myPicks = useMemo(() => {
        const myPickedIds = picks.filter(p => p.teamId === myTeamId).map(p => p.playerId);
        return allPlayers.filter(p => myPickedIds.includes(p.id));
    }, [picks, myTeamId, allPlayers]);

    const latestMyPickId = useMemo(() => {
        const myP = picks.filter(p => p.teamId === myTeamId);
        return myP.length > 0 ? myP[myP.length - 1].playerId : undefined;
    }, [picks, myTeamId]);

    // How many picks until user's next turn
    const picksUntilUser = useMemo(() => {
        if (isUserTurn) return 0;
        for (let i = currentPickIndex + 1; i < draftOrder.length; i++) {
            if (draftOrder[i] === myTeamId) return i - currentPickIndex;
        }
        return -1; // no more picks remaining
    }, [currentPickIndex, draftOrder, myTeamId, isUserTurn]);

    // ── Draft action (demo: just adds to picks) ──
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

    // ── Fast Forward: simulate next N CPU picks ──
    const handleFastForward = useCallback(() => {
        const newPicks: BoardPick[] = [];
        const used = new Set(picks.map(p => p.playerId));
        let idx = currentPickIndex;
        const pool = allPlayers.filter(p => !used.has(p.id));
        let poolIdx = 0;

        // Pick until it's user's turn or 30 picks done
        while (idx < draftOrder.length && poolIdx < pool.length) {
            const tid = draftOrder[idx];
            if (tid === myTeamId) break; // Stop before user's turn
            const player = pool[poolIdx++];
            used.add(player.id);
            newPicks.push({
                round: Math.floor(idx / teamIds.length) + 1,
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
    }, [picks, currentPickIndex, draftOrder, myTeamId, allPlayers, teamIds.length]);

    const showFastForward = !isUserTurn && currentPickIndex < draftOrder.length;

    // ── Resizable divider ──
    const containerRef = useRef<HTMLDivElement>(null);
    const [boardRatio, setBoardRatio] = useState(45);
    const isDragging = useRef(false);
    const headerHeight = 40; // DraftHeader approx height

    const handleMouseDown = useCallback(() => {
        isDragging.current = true;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const availableH = rect.height - headerHeight;
            const newRatio = ((e.clientY - rect.top - headerHeight) / availableH) * 100;
            setBoardRatio(Math.min(70, Math.max(25, newRatio)));
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, []);

    return (
        <div ref={containerRef} className="flex flex-col h-full bg-slate-950">
            {/* Header */}
            <DraftHeader
                currentPickIndex={currentPickIndex}
                totalPicks={draftOrder.length}
                currentRound={currentRound}
                currentPickInRound={currentPickInRound}
                currentTeamId={currentTeamId}
                isUserTurn={isUserTurn}
                picksUntilUser={picksUntilUser}
                userTeamId={myTeamId}
                onFastForward={handleFastForward}
                showFastForward={showFastForward}
                onBack={onBack}
                teamTheme={teamTheme}
            />

            {/* Draft Board (resizable top section) */}
            <div style={{ flex: `0 0 ${boardRatio}%` }} className="min-h-0 overflow-hidden">
                <DraftBoard
                    teamIds={teamIds}
                    totalRounds={TOTAL_ROUNDS}
                    picks={picks}
                    currentPickIndex={currentPickIndex}
                    draftOrder={draftOrder}
                    userTeamId={myTeamId}
                    positionColors={POSITION_COLORS}
                />
            </div>

            {/* Drag Divider */}
            <div
                onMouseDown={handleMouseDown}
                className="h-1.5 bg-slate-800/80 hover:bg-indigo-600/50 cursor-row-resize flex items-center justify-center shrink-0 transition-colors"
            >
                <GripHorizontal size={14} className="text-slate-600" />
            </div>

            {/* Bottom 3-column panel */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Left: Pick History */}
                <div className="w-[25%] border-r border-slate-800">
                    <PickHistory picks={picks} totalRounds={TOTAL_ROUNDS} positionColors={POSITION_COLORS} userTeamId={myTeamId} />
                </div>

                {/* Center: Player Pool */}
                <div className="flex-1 border-r border-slate-800">
                    <PlayerPool
                        players={availablePlayers}
                        onSelectPlayer={(p) => setSelectedPlayerId(p.id)}
                        selectedPlayerId={selectedPlayerId}
                        isUserTurn={isUserTurn}
                        onDraft={handleDraft}
                        positionColors={POSITION_COLORS}
                        buttonTheme={buttonTheme}
                        teamColor={teamTheme.bg}
                    />
                </div>

                {/* Right: My Roster */}
                <div className="w-[25%]">
                    <MyRoster players={myPicks} latestPlayerId={latestMyPickId} positionColors={POSITION_COLORS} teamColor={teamTheme.bg} />
                </div>
            </div>
        </div>
    );
};

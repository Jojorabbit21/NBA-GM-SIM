
import React, { useState, useEffect } from 'react';
import { Team, Player, TradeOffer, Transaction, TradeAlertContent, GameTactics } from '../types';
import { generateTradeOffers, generateCounterOffers } from '../services/tradeEngine';
import { TRADE_DEADLINE, calculatePlayerOvr } from '../utils/constants';
import { logEvent } from '../services/analytics';
import { saveUserTransaction } from '../services/queries';
import { sendMessage } from '../services/messageService';

const MAX_DAILY_TRADES = 5;

export const useTradeSystem = (
    team: Team,
    teams: Team[],
    setTeams: React.Dispatch<React.SetStateAction<Team[]>>,
    currentSimDate: string,
    userId?: string,
    onAddTransaction?: (t: Transaction) => void,
    onForceSave?: (overrides?: any) => Promise<void>,
    onShowToast?: (msg: string) => void,
    refreshUnreadCount?: () => void,
    userTactics?: GameTactics,
    setUserTactics?: React.Dispatch<React.SetStateAction<GameTactics | null>>
) => {
    // Local State
    const [blockSelectedIds, setBlockSelectedIds] = useState<Set<string>>(new Set());
    const [blockOffers, setBlockOffers] = useState<TradeOffer[]>([]);
    const [blockIsProcessing, setBlockIsProcessing] = useState(false);
    const [blockSearchPerformed, setBlockSearchPerformed] = useState(false);
    const [targetPositions, setTargetPositions] = useState<string[]>([]);

    const [proposalTargetTeamId, setProposalTargetTeamId] = useState<string>('');
    const [proposalSelectedIds, setProposalSelectedIds] = useState<Set<string>>(new Set());
    const [proposalRequirements, setProposalRequirements] = useState<TradeOffer[]>([]);
    const [proposalIsProcessing, setProposalIsProcessing] = useState(false);
    const [proposalSearchPerformed, setProposalSearchPerformed] = useState(false);
    
    const [isExecutingTrade, setIsExecutingTrade] = useState(false);
    const [pendingTrade, setPendingTrade] = useState<{
        userAssets: Player[],
        targetAssets: Player[],
        targetTeam: Team
    } | null>(null);

    const [dailyTradeAttempts, setDailyTradeAttempts] = useState(0);

    // Trade Limit Logic
    useEffect(() => {
        if (!team) return;
        const key = `trade_ops_${team.id}_${currentSimDate}`;
        const saved = localStorage.getItem(key);
        setDailyTradeAttempts(saved ? parseInt(saved, 10) : 0);
    }, [currentSimDate, team]);

    const incrementTradeAttempts = () => {
        const newVal = dailyTradeAttempts + 1;
        setDailyTradeAttempts(newVal);
        localStorage.setItem(`trade_ops_${team.id}_${currentSimDate}`, newVal.toString());
    };

    const isTradeLimitReached = dailyTradeAttempts >= MAX_DAILY_TRADES;
    const isTradeDeadlinePassed = new Date(currentSimDate) > new Date(TRADE_DEADLINE);

    // Actions
    const toggleBlockPlayer = (id: string) => {
        const next = new Set(blockSelectedIds);
        if (next.has(id)) next.delete(id);
        else if (next.size < 5) next.add(id);
        else onShowToast?.("최대 5명까지만 선택 가능합니다.");
        setBlockSelectedIds(next); setBlockOffers([]); setBlockSearchPerformed(false);
    };

    const toggleTargetPosition = (pos: string) => {
        setTargetPositions(prev => {
            if (prev.includes(pos)) return prev.filter(p => p !== pos);
            return [...prev, pos];
        });
        setBlockOffers([]);
        setBlockSearchPerformed(false);
    };

    const handleSearchBlockOffers = async () => {
        if (blockSelectedIds.size === 0 || isTradeDeadlinePassed) return;
        if (isTradeLimitReached) {
            onShowToast?.(`금일 트레이드 업무 한도(${MAX_DAILY_TRADES}회)를 초과했습니다.`);
            return;
        }

        logEvent('Trade', 'Search Offers', `Assets: ${blockSelectedIds.size}, Targets: ${targetPositions.join(',')}`); 

        setBlockIsProcessing(true); setBlockSearchPerformed(true);
        incrementTradeAttempts();
        
        try {
            const targetPlayers = (team?.roster || []).filter(p => blockSelectedIds.has(p.id));
            const generatedOffers = await generateTradeOffers(targetPlayers, team, teams, targetPositions);
            setBlockOffers(generatedOffers);
        } catch (e) {
            console.error(e);
            onShowToast?.("오퍼 검색 중 오류가 발생했습니다.");
            setBlockOffers([]);
        } finally {
            setBlockIsProcessing(false);
        }
    };

    const toggleProposalPlayer = (id: string) => {
        const next = new Set(proposalSelectedIds);
        if (next.has(id)) next.delete(id);
        else if (next.size < 5) next.add(id);
        else onShowToast?.("최대 5명까지만 선택 가능합니다.");
        setProposalSelectedIds(next); setProposalRequirements([]); setProposalSearchPerformed(false);
    };

    const handleRequestRequirements = async () => {
        console.log('[Trade] handleRequestRequirements called', {
            selectedCount: proposalSelectedIds.size,
            targetTeamId: proposalTargetTeamId,
            isDeadlinePassed: isTradeDeadlinePassed,
            isTradeLimitReached,
            dailyTradeAttempts,
            currentSimDate,
        });
        if (proposalSelectedIds.size === 0 || !proposalTargetTeamId || isTradeDeadlinePassed) {
            console.log('[Trade] Early return - guard failed');
            return;
        }
        if (isTradeLimitReached) {
            onShowToast?.(`금일 트레이드 업무 한도(${MAX_DAILY_TRADES}회)를 초과했습니다.`);
            return;
        }

        logEvent('Trade', 'Request Proposal', `Target: ${proposalTargetTeamId}, Assets: ${proposalSelectedIds.size}`);

        setProposalIsProcessing(true); setProposalSearchPerformed(true);
        incrementTradeAttempts();
        
        try {
            const targetTeam = teams.find(t => t.id === proposalTargetTeamId);
            if (!targetTeam) {
                setProposalIsProcessing(false);
                return;
            }
            const requestedPlayers = targetTeam.roster.filter(p => proposalSelectedIds.has(p.id));
            console.log('[Trade] Calling generateCounterOffers', { requestedPlayers: requestedPlayers.map(p => p.name), targetTeam: targetTeam.name, myTeam: team.name });
            const generatedRequirements = await generateCounterOffers(requestedPlayers, targetTeam, team, teams);
            console.log('[Trade] Counter offers result:', generatedRequirements.length, 'offers');
            setProposalRequirements(generatedRequirements);
        } catch (e) {
            console.error(e);
            onShowToast?.("제안 분석 중 오류가 발생했습니다.");
        } finally {
            setProposalIsProcessing(false);
        }
    };

    const executeTrade = async () => {
        if (!pendingTrade || !team || isExecutingTrade) return;
        const { userAssets, targetAssets, targetTeam } = pendingTrade;
        
        setIsExecutingTrade(true);
        logEvent('Trade', 'Executed', `${team.name} <-> ${targetTeam.name} (${userAssets.length} for ${targetAssets.length})`);

        try {
            const newTransaction: Transaction = {
                // [FIX] Use Standard UUID for DB Compatibility
                id: crypto.randomUUID(), 
                date: currentSimDate,
                type: 'Trade',
                teamId: team.id,
                description: `${targetTeam.name}와의 트레이드 합의`,
                details: {
                    acquired: targetAssets.map(p => ({ id: p.id, name: p.name, ovr: calculatePlayerOvr(p), position: p.position })),
                    traded: userAssets.map(p => ({ id: p.id, name: p.name, ovr: calculatePlayerOvr(p), position: p.position })),
                    partnerTeamId: targetTeam.id,
                    partnerTeamName: targetTeam.name
                }
            };

            // Local State Update (Optimistic)
            if (onAddTransaction) onAddTransaction(newTransaction);

            // DB Save (User Transactions)
            if (userId) {
                await saveUserTransaction(userId, newTransaction);
                
                // [Notification] Send Message for User Trade
                const tradeContent: TradeAlertContent = {
                    summary: ``, 
                    trades: [{
                        team1Id: team.id,
                        team1Name: team.name,
                        team2Id: targetTeam.id,
                        team2Name: targetTeam.name,
                        team1Acquired: targetAssets.map(p => ({ id: p.id, name: p.name, ovr: calculatePlayerOvr(p) })),
                        team2Acquired: userAssets.map(p => ({ id: p.id, name: p.name, ovr: calculatePlayerOvr(p) }))
                    }]
                };
                
                await sendMessage(
                    userId,
                    team.id,
                    currentSimDate,
                    'TRADE_ALERT',
                    `[오피셜] ${targetTeam.name}와 트레이드 합의`,
                    tradeContent
                );

                if (refreshUnreadCount) refreshUnreadCount();
            } else {
                console.warn("⚠️ Trade executed without UserID (Guest Mode or Error) - Transaction not saved to DB.");
            }

            // Roster Update
            const nextTeams = teams.map(t => {
                if (t.id === team.id) {
                    const remaining = t.roster.filter(p => !userAssets.some(u => u.id === p.id));
                    const hydratedTargetAssets = targetAssets.map(tp => {
                        const sourceTeam = teams.find(pt => pt.id === targetTeam.id);
                        return sourceTeam?.roster.find(sp => sp.id === tp.id) || tp;
                    });
                    return { ...t, roster: [...remaining, ...hydratedTargetAssets] };
                }
                if (targetTeam && t.id === targetTeam.id) {
                    const remaining = t.roster.filter(p => !targetAssets.some(x => x.id === p.id));
                    const hydratedUserAssets = userAssets.map(up => {
                        const sourceTeam = teams.find(pt => pt.id === team.id);
                        return sourceTeam?.roster.find(sp => sp.id === up.id) || up;
                    });
                    return { ...t, roster: [...remaining, ...hydratedUserAssets] };
                }
                return t;
            });

            setTeams(nextTeams);

            // [Rotation Map] 트레이드된 선수의 로테이션을 받은 선수에게 이전
            let updatedTactics = userTactics;
            if (userTactics?.rotationMap) {
                const newRotationMap = { ...userTactics.rotationMap };
                const newStarters = { ...userTactics.starters };

                // 보낸 선수 중 로테이션맵에 등록된 선수들의 스케줄 수집
                const outSchedules: { id: string; position: string; schedule: boolean[] }[] = [];
                for (const outPlayer of userAssets) {
                    if (newRotationMap[outPlayer.id]) {
                        outSchedules.push({
                            id: outPlayer.id,
                            position: outPlayer.position,
                            schedule: [...newRotationMap[outPlayer.id]],
                        });
                        delete newRotationMap[outPlayer.id];
                    }
                }

                // 받은 선수를 포지션 매칭으로 보낸 선수의 스케줄에 배정
                const assignedIncoming = new Set<string>();
                for (const out of outSchedules) {
                    // 같은 포지션의 받은 선수 중 아직 배정되지 않은 선수 찾기
                    const match = targetAssets.find(
                        p => p.position === out.position && !assignedIncoming.has(p.id)
                    );
                    if (match) {
                        newRotationMap[match.id] = out.schedule;
                        assignedIncoming.add(match.id);
                    } else {
                        // 포지션 매칭 실패 → 아무 미배정 받은 선수에게 배정
                        const anyMatch = targetAssets.find(p => !assignedIncoming.has(p.id));
                        if (anyMatch) {
                            newRotationMap[anyMatch.id] = out.schedule;
                            assignedIncoming.add(anyMatch.id);
                        }
                        // 매칭할 선수 없으면 스케줄 삭제됨 (이미 delete 완료)
                    }

                    // starters에서 보낸 선수가 있으면 받은 선수로 교체
                    for (const pos of Object.keys(newStarters) as (keyof typeof newStarters)[]) {
                        if (newStarters[pos] === out.id) {
                            const replacement = match || targetAssets.find(p => !assignedIncoming.has(p.id));
                            if (replacement) {
                                newStarters[pos] = replacement.id;
                            }
                        }
                    }
                }

                updatedTactics = {
                    ...userTactics,
                    rotationMap: newRotationMap,
                    starters: newStarters,
                };
                if (setUserTactics) setUserTactics(updatedTactics);
            }

            // [Persistence] Save Checkpoint (Roster State + Updated Tactics)
            if (onForceSave) await onForceSave({ teams: nextTeams, userTactics: updatedTactics });

        } catch (e) {
            console.error("Trade Execution Failed:", e);
            onShowToast?.("트레이드 처리 중 오류가 발생했습니다.");
        } finally {
            setIsExecutingTrade(false);
            setPendingTrade(null);
            setBlockSelectedIds(new Set()); setBlockOffers([]); setBlockSearchPerformed(false);
            setProposalSelectedIds(new Set()); setProposalRequirements([]); setProposalSearchPerformed(false);
        }
    };

    return {
        blockSelectedIds, setBlockSelectedIds,
        blockOffers, setBlockOffers,
        blockIsProcessing,
        blockSearchPerformed,
        targetPositions, toggleTargetPosition,
        handleSearchBlockOffers,
        toggleBlockPlayer,
        
        proposalTargetTeamId, setProposalTargetTeamId,
        proposalSelectedIds, setProposalSelectedIds,
        proposalRequirements, setProposalRequirements,
        proposalIsProcessing,
        proposalSearchPerformed, setProposalSearchPerformed,
        toggleProposalPlayer,
        handleRequestRequirements,
        
        pendingTrade, setPendingTrade,
        isExecutingTrade, executeTrade,
        
        dailyTradeAttempts,
        isTradeLimitReached,
        isTradeDeadlinePassed,
        MAX_DAILY_TRADES
    };
};

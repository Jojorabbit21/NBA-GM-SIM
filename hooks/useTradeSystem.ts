
import { useState, useEffect } from 'react';
import { Team, Player, TradeOffer, Transaction, TradeAlertContent } from '../types';
import { generateTradeOffers, generateCounterOffers } from '../services/tradeEngine';
import { TRADE_DEADLINE } from '../utils/constants';
import { logEvent } from '../services/analytics';
import { saveUserTransaction } from '../services/queries';
import { supabase } from '../services/supabaseClient';
import { sendMessage } from '../services/messageService'; // Imported

const MAX_DAILY_TRADES = 5;

export const useTradeSystem = (
    team: Team, 
    teams: Team[], 
    setTeams: React.Dispatch<React.SetStateAction<Team[]>>,
    currentSimDate: string,
    onAddTransaction?: (t: Transaction) => void,
    onForceSave?: (overrides?: any) => Promise<void>,
    onShowToast?: (msg: string) => void
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
        if (proposalSelectedIds.size === 0 || !proposalTargetTeamId || isTradeDeadlinePassed) return;
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
            const generatedRequirements = await generateCounterOffers(requestedPlayers, targetTeam, team, teams);
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
                id: `tr_${Date.now()}`,
                date: currentSimDate,
                type: 'Trade',
                teamId: team.id,
                description: `${targetTeam.name}와의 트레이드 합의`,
                details: {
                    acquired: targetAssets.map(p => ({ id: p.id, name: p.name, ovr: p.ovr, position: p.position })),
                    traded: userAssets.map(p => ({ id: p.id, name: p.name, ovr: p.ovr, position: p.position })),
                    partnerTeamId: targetTeam.id,
                    partnerTeamName: targetTeam.name
                }
            };

            if (onAddTransaction) onAddTransaction(newTransaction);

            const { data: userData } = await (supabase.auth as any).getUser();
            if (userData?.user) {
                await saveUserTransaction(userData.user.id, newTransaction);
                
                // [Notification] Send Message for User Trade
                const tradeContent: TradeAlertContent = {
                    summary: ``, // Removed summary
                    trades: [{
                        team1Id: team.id,
                        team1Name: team.name,
                        team2Id: targetTeam.id,
                        team2Name: targetTeam.name,
                        team1Acquired: targetAssets.map(p => ({ id: p.id, name: p.name, ovr: p.ovr })),
                        team2Acquired: userAssets.map(p => ({ id: p.id, name: p.name, ovr: p.ovr }))
                    }]
                };
                
                await sendMessage(
                    userData.user.id,
                    team.id,
                    currentSimDate,
                    'TRADE_ALERT',
                    `[오피셜] ${targetTeam.name}와 트레이드 합의`,
                    tradeContent
                );
            }

            // State Update
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

            if (onForceSave) await onForceSave({ teams: nextTeams });

            onShowToast?.(`트레이드 성사! 총 ${targetAssets.length}명의 선수가 합류했습니다.`);
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

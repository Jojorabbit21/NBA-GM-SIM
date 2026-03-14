
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Team, Player, TradeOffer, Transaction, TradeAlertContent, GameTactics } from '../types';
import { LeaguePickAssets, DraftPickAsset } from '../types/draftAssets';
import {
    LeagueTradeBlocks,
    LeagueTradeOffers,
    TradeBlockEntry,
    PersistentTradeOffer,
    PersistentPickRef,
    TradePickRef,
} from '../types/trade';
import { generateTradeOffers, generateCounterOffers } from '../services/tradeEngine';
import { executeTrade as executeTradeViaExecutor, validateTradeOnly, TradeExecutionPayload } from '../services/tradeEngine/tradeExecutor';
import { TRADE_DEADLINE, calculatePlayerOvr } from '../utils/constants';
import { TRADE_CONFIG as C } from '../services/tradeEngine/tradeConfig';
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
    setUserTactics?: React.Dispatch<React.SetStateAction<GameTactics | null>>,
    // ── 새 영속 트레이드 파라미터 ──
    leagueTradeBlocks?: LeagueTradeBlocks,
    setLeagueTradeBlocks?: React.Dispatch<React.SetStateAction<LeagueTradeBlocks>>,
    leagueTradeOffers?: LeagueTradeOffers,
    setLeagueTradeOffers?: React.Dispatch<React.SetStateAction<LeagueTradeOffers>>,
    leaguePickAssets?: LeaguePickAssets,
    setLeaguePickAssets?: React.Dispatch<React.SetStateAction<LeaguePickAssets>>
) => {
    // ══════════════════════════════════════
    // Legacy Local State (기존 즉시 오퍼 시스템 — 하위호환)
    // ══════════════════════════════════════
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
        targetTeam: Team,
        // 새 시스템: 픽 + 오퍼 ID
        userPicks?: PersistentPickRef[],
        targetPicks?: PersistentPickRef[],
        offerId?: string, // 수락 시 원본 오퍼 ID
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

    // ══════════════════════════════════════
    // 영속 트레이드 블록 관리
    // ══════════════════════════════════════

    /** 유저 블록의 현재 엔트리 */
    const userBlockEntries = useMemo<TradeBlockEntry[]>(() => {
        if (!leagueTradeBlocks || !team) return [];
        return leagueTradeBlocks[team.id]?.entries || [];
    }, [leagueTradeBlocks, team]);

    /** 유저 블록에 선수 추가/제거 */
    const togglePersistentBlockPlayer = useCallback((playerId: string) => {
        if (!setLeagueTradeBlocks || !team) return;
        setLeagueTradeBlocks(prev => {
            const block = prev[team.id] || { teamId: team.id, entries: [] };
            const existing = block.entries.findIndex(e => e.type === 'player' && e.playerId === playerId);
            let newEntries: TradeBlockEntry[];
            if (existing >= 0) {
                newEntries = block.entries.filter((_, i) => i !== existing);
            } else {
                if (block.entries.length >= C.TRADE_BLOCK.MAX_USER_BLOCK_ENTRIES) {
                    onShowToast?.(`트레이드 블록은 최대 ${C.TRADE_BLOCK.MAX_USER_BLOCK_ENTRIES}개까지 등록 가능합니다.`);
                    return prev;
                }
                newEntries = [...block.entries, { type: 'player', playerId, addedDate: currentSimDate }];
            }
            return { ...prev, [team.id]: { ...block, entries: newEntries } };
        });
    }, [team, setLeagueTradeBlocks, currentSimDate, onShowToast]);

    /** 유저 블록에 픽 추가/제거 */
    const togglePersistentBlockPick = useCallback((pickRef: TradePickRef) => {
        if (!setLeagueTradeBlocks || !team) return;
        setLeagueTradeBlocks(prev => {
            const block = prev[team.id] || { teamId: team.id, entries: [] };
            const existing = block.entries.findIndex(e =>
                e.type === 'pick' && e.pick &&
                e.pick.season === pickRef.season &&
                e.pick.round === pickRef.round &&
                e.pick.originalTeamId === pickRef.originalTeamId
            );
            let newEntries: TradeBlockEntry[];
            if (existing >= 0) {
                newEntries = block.entries.filter((_, i) => i !== existing);
            } else {
                if (block.entries.length >= C.TRADE_BLOCK.MAX_USER_BLOCK_ENTRIES) {
                    onShowToast?.(`트레이드 블록은 최대 ${C.TRADE_BLOCK.MAX_USER_BLOCK_ENTRIES}개까지 등록 가능합니다.`);
                    return prev;
                }
                newEntries = [...block.entries, { type: 'pick', pick: pickRef, addedDate: currentSimDate }];
            }
            return { ...prev, [team.id]: { ...block, entries: newEntries } };
        });
    }, [team, setLeagueTradeBlocks, currentSimDate, onShowToast]);

    // ══════════════════════════════════════
    // 수신 오퍼 관리
    // ══════════════════════════════════════

    /** 유저에게 온 pending 오퍼 목록 */
    const incomingOffers = useMemo<PersistentTradeOffer[]>(() => {
        if (!leagueTradeOffers || !team) return [];
        return leagueTradeOffers.offers.filter(
            o => o.toTeamId === team.id && o.status === 'pending'
        );
    }, [leagueTradeOffers, team]);

    /** 유저가 보낸 오퍼 목록 */
    const outgoingOffers = useMemo<PersistentTradeOffer[]>(() => {
        if (!leagueTradeOffers || !team) return [];
        return leagueTradeOffers.offers.filter(
            o => o.fromTeamId === team.id
        );
    }, [leagueTradeOffers, team]);

    /** 수신 오퍼 수락 → executeTrade */
    const acceptIncomingOffer = useCallback((offer: PersistentTradeOffer) => {
        const fromTeam = teams.find(t => t.id === offer.fromTeamId);
        if (!fromTeam || !team) return;

        const userAssets = offer.requestedPlayers
            .map(ref => team.roster.find(p => p.id === ref.playerId))
            .filter(Boolean) as Player[];
        const targetAssets = offer.offeredPlayers
            .map(ref => fromTeam.roster.find(p => p.id === ref.playerId))
            .filter(Boolean) as Player[];

        setPendingTrade({
            userAssets,
            targetAssets,
            targetTeam: fromTeam,
            userPicks: offer.requestedPicks,
            targetPicks: offer.offeredPicks,
            offerId: offer.id,
        });
    }, [teams, team]);

    /** 수신 오퍼 거절 */
    const rejectIncomingOffer = useCallback((offerId: string) => {
        if (!setLeagueTradeOffers) return;
        setLeagueTradeOffers(prev => ({
            ...prev,
            offers: prev.offers.map(o =>
                o.id === offerId ? { ...o, status: 'rejected' as const } : o
            ),
        }));
        onShowToast?.('오퍼를 거절했습니다.');
    }, [setLeagueTradeOffers, onShowToast]);

    // ══════════════════════════════════════
    // 유저 → CPU 제안 생성
    // ══════════════════════════════════════

    /** 유저가 CPU 팀에 비동기 제안 전송 */
    const sendPersistentProposal = useCallback((
        targetTeamId: string,
        offeredPlayerIds: string[],
        offeredPicks: PersistentPickRef[],
        requestedPlayerIds: string[],
        requestedPicks: PersistentPickRef[]
    ) => {
        if (!setLeagueTradeOffers || !team || isTradeDeadlinePassed) return;

        const targetTeam = teams.find(t => t.id === targetTeamId);
        if (!targetTeam) return;

        // 사전 검증 (leaguePickAssets가 있을 때만)
        if (leaguePickAssets) {
            const payload: TradeExecutionPayload = {
                teamAId: team.id,
                teamBId: targetTeamId,
                teamASentPlayers: offeredPlayerIds,
                teamASentPicks: offeredPicks,
                teamBSentPlayers: requestedPlayerIds,
                teamBSentPicks: requestedPicks,
                date: currentSimDate,
                isUserTrade: true,
            };
            const errors = validateTradeOnly(payload, teams, leaguePickAssets);
            if (errors.length > 0) {
                onShowToast?.(errors.map(e => e.message).join('\n'));
                return;
            }
        }

        const offerId = `user-offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const expiresDate = addDays(currentSimDate, C.TRADE_BLOCK.OFFER_EXPIRY_DAYS);

        const offer: PersistentTradeOffer = {
            id: offerId,
            fromTeamId: team.id,
            toTeamId: targetTeamId,
            createdDate: currentSimDate,
            expiresDate,
            status: 'pending',
            offeredPlayers: offeredPlayerIds.map(id => {
                const p = team.roster.find(r => r.id === id);
                return { playerId: id, playerName: p?.name ?? '' };
            }),
            offeredPicks,
            requestedPlayers: requestedPlayerIds.map(id => {
                const p = targetTeam.roster.find(r => r.id === id);
                return { playerId: id, playerName: p?.name ?? '' };
            }),
            requestedPicks,
        };

        setLeagueTradeOffers(prev => ({
            ...prev,
            offers: [...prev.offers, offer],
        }));

        incrementTradeAttempts();
        onShowToast?.(`${targetTeam.name}에 트레이드 제안을 보냈습니다. 다음 시뮬 진행 시 응답을 받습니다.`);
    }, [team, teams, setLeagueTradeOffers, leaguePickAssets, currentSimDate, isTradeDeadlinePassed, onShowToast]);

    // ══════════════════════════════════════
    // Legacy Actions (기존 즉시 시스템 — 하위호환)
    // ══════════════════════════════════════

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

    // ══════════════════════════════════════
    // 트레이드 실행 (통합)
    // ══════════════════════════════════════

    const executeTrade = async () => {
        if (!pendingTrade || !team || isExecutingTrade) return;
        const { userAssets, targetAssets, targetTeam, userPicks, targetPicks, offerId } = pendingTrade;

        setIsExecutingTrade(true);
        logEvent('Trade', 'Executed', `${team.name} <-> ${targetTeam.name} (${userAssets.length} for ${targetAssets.length})`);

        try {
            // 새 시스템 (tradeExecutor 경유) — leaguePickAssets가 있을 때
            if (leaguePickAssets && setLeaguePickAssets) {
                const payload: TradeExecutionPayload = {
                    teamAId: team.id,
                    teamBId: targetTeam.id,
                    teamASentPlayers: userAssets.map(p => p.id),
                    teamASentPicks: userPicks || [],
                    teamBSentPlayers: targetAssets.map(p => p.id),
                    teamBSentPicks: targetPicks || [],
                    date: currentSimDate,
                    isUserTrade: true,
                };

                const result = executeTradeViaExecutor(payload, teams, leaguePickAssets, leagueTradeBlocks);
                if (!result.success) {
                    onShowToast?.(result.errors.map(e => e.message).join('\n'));
                    return;
                }

                // 픽 자산 업데이트
                if (result.updatedPickAssets) {
                    setLeaguePickAssets(result.updatedPickAssets);
                }

                // Transaction 기록
                if (result.transaction) {
                    if (onAddTransaction) onAddTransaction(result.transaction);
                    if (userId) {
                        await saveUserTransaction(userId, result.transaction);
                    }
                }

                // 오퍼 상태 업데이트 (수신 오퍼 수락 시)
                if (offerId && setLeagueTradeOffers) {
                    setLeagueTradeOffers(prev => ({
                        ...prev,
                        offers: prev.offers.map(o =>
                            o.id === offerId ? { ...o, status: 'accepted' as const } : o
                        ),
                    }));
                }

                // teams는 executeTrade가 이미 in-place로 수정했으므로 새 참조로 갱신
                setTeams([...teams]);

            } else {
                // 레거시 시스템 (직접 로스터 스왑)
                const newTransaction: Transaction = {
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

                if (onAddTransaction) onAddTransaction(newTransaction);

                if (userId) {
                    await saveUserTransaction(userId, newTransaction);
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
            }

            // 메시지 발송
            if (userId) {
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
                    userId, team.id, currentSimDate,
                    'TRADE_ALERT',
                    `[오피셜] ${targetTeam.name}와 트레이드 합의`,
                    tradeContent
                );

                if (refreshUnreadCount) refreshUnreadCount();
            }

            // [Rotation Map] 트레이드된 선수의 로테이션을 받은 선수에게 이전
            let updatedTactics = userTactics;
            if (userTactics?.rotationMap) {
                const newRotationMap = { ...userTactics.rotationMap };
                const newStarters = { ...userTactics.starters };

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

                const assignedIncoming = new Set<string>();
                for (const out of outSchedules) {
                    const match = targetAssets.find(
                        p => p.position === out.position && !assignedIncoming.has(p.id)
                    );
                    if (match) {
                        newRotationMap[match.id] = out.schedule;
                        assignedIncoming.add(match.id);
                    } else {
                        const anyMatch = targetAssets.find(p => !assignedIncoming.has(p.id));
                        if (anyMatch) {
                            newRotationMap[anyMatch.id] = out.schedule;
                            assignedIncoming.add(anyMatch.id);
                        }
                    }

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

            // [Persistence] Save Checkpoint
            if (onForceSave) await onForceSave({ teams, userTactics: updatedTactics });

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
        // Legacy (하위호환)
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
        MAX_DAILY_TRADES,

        // 영속 트레이드 블록
        userBlockEntries,
        togglePersistentBlockPlayer,
        togglePersistentBlockPick,

        // 수신/발신 오퍼
        incomingOffers,
        outgoingOffers,
        acceptIncomingOffer,
        rejectIncomingOffer,

        // 유저 → CPU 비동기 제안
        sendPersistentProposal,
    };
};

// Helper
function addDays(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

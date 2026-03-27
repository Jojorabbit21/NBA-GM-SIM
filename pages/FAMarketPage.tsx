import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FAView } from '../views/FAView';
import { useGame } from '../hooks/useGameContext';
import { sendMessage } from '../services/messageService';
import { releasePlayerToMarket } from '../services/fa/faMarketBuilder';
import { writeTransaction } from '../services/persistence';
import type { Team, Player, ReleaseType } from '../types';
import type { PlayerContract } from '../types/player';
import type { SigningType } from '../types/fa';
import type { DeadMoneyEntry } from '../types';
import type { FASigningContent, FAReleaseContent } from '../types/message';
import { hireCoach, fireCoach } from '../services/coachingStaff/coachHiringEngine';
import type { Coach, StaffRole } from '../types/coaching';

const FAMarketPage: React.FC = () => {
    const { session, gameData, setViewPlayerData } = useGame();
    const navigate = useNavigate();
    const { state } = useLocation();

    const myTeam = gameData.teams.find((t: Team) => t.id === gameData.myTeamId);
    if (!myTeam) return null;

    const seasonShort: string = gameData.seasonConfig?.seasonShort ?? '2025-26';

    const handleHireCoach = (role: StaffRole, coachId: string, finalSalary?: number) => {
        if (!gameData.coachFAPool || !gameData.coachingData) return;
        const teamStaff = gameData.coachingData[myTeam.id] ?? {
            headCoach: null, offenseCoordinator: null, defenseCoordinator: null,
            developmentCoach: null, trainingCoach: null,
        };
        const { staff: newStaff, pool: newPool } = hireCoach(teamStaff, gameData.coachFAPool, role, coachId, finalSalary);
        const newCoachingData = { ...gameData.coachingData, [myTeam.id]: newStaff };
        gameData.setCoachingData(newCoachingData);
        gameData.setCoachFAPool(newPool);
        gameData.forceSave({ coachingData: newCoachingData, coachFAPool: newPool });
    };

    const handleFireCoach = (role: StaffRole, buyoutAmount: number) => {
        if (!gameData.coachFAPool || !gameData.coachingData) return;
        const teamStaff = gameData.coachingData[myTeam.id];
        if (!teamStaff) return;
        const coach = (teamStaff as any)[role] as Coach | undefined;
        if (!coach) return;

        const { staff: newStaff, pool: newPool } = fireCoach(teamStaff, gameData.coachFAPool, role);
        const newCoachingData = { ...gameData.coachingData, [myTeam.id]: newStaff };

        // 위로금 → dead cap 처리
        const totalRemaining = coach.contractSalary * coach.contractYearsRemaining;
        const releaseType: 'waive' | 'buyout' = buyoutAmount >= totalRemaining ? 'waive' : 'buyout';
        const deadEntry: DeadMoneyEntry = {
            playerId: coach.id,
            playerName: coach.name,
            amount: buyoutAmount,
            season: gameData.currentSeason ?? '',
            releaseType,
        };
        const newTeams = gameData.teams.map((t: Team) =>
            t.id === myTeam.id
                ? { ...t, deadMoney: [...(t.deadMoney ?? []), deadEntry] }
                : t
        );

        gameData.setCoachingData(newCoachingData);
        gameData.setCoachFAPool(newPool);
        gameData.setTeams(newTeams);
        gameData.forceSave({ coachingData: newCoachingData, coachFAPool: newPool, teams: newTeams });
    };

    const currentSeasonYear = new Date(gameData.currentSimDate).getFullYear();

    return (
        <FAView
            leagueFAMarket={gameData.leagueFAMarket ?? null}
            faPlayerMap={gameData.faPlayerMap ?? {}}
            myTeam={myTeam}
            teams={gameData.teams}
            tendencySeed={gameData.tendencySeed || ''}
            currentSeasonYear={currentSeasonYear}
            currentSeason={seasonShort}
            currentDate={gameData.currentSimDate}
            initialNegotiateId={(state as any)?.autoNegotiateId}
            onOfferAccepted={(playerId, contract, signingType, updatedMarket) => {
                const faPlayer = gameData.faPlayerMap?.[playerId];
                if (!faPlayer) return;
                const salary = contract.years[contract.currentYear] ?? contract.years[0];
                const signedPlayer = { ...faPlayer, contract, salary, contractYears: contract.years.length, teamTenure: 0 };
                // Set-Off Rule: 웨이브된 선수를 영입 시 B팀 총 계약액만큼 원팀 waive 데드캡 차감
                const prevTeamId = gameData.leagueFAMarket?.entries.find(e => e.playerId === playerId)?.prevTeamId;
                const bTeamTotalContract = contract.years.reduce((s: number, v: number) => s + v, 0);
                // BAE 사용 기록: usedBAEyear를 현재 시즌 시작 연도로 업데이트
                const baeUsed = signingType === 'bae';
                const currentSeasonYear = parseInt((gameData.seasonConfig?.seasonShort ?? '2025-26').split('-')[0]);
                const newTeams = gameData.teams.map((t: Team) => {
                    if (t.id === gameData.myTeamId) return { ...t, roster: [...t.roster, signedPlayer], ...(baeUsed ? { usedBAEyear: currentSeasonYear } : {}) };
                    if (prevTeamId && t.id === prevTeamId) {
                        const newDeadMoney = (t.deadMoney ?? []).reduce((acc: DeadMoneyEntry[], d) => {
                            if (d.playerId === playerId && d.releaseType === 'waive') {
                                const remaining = d.amount - bTeamTotalContract;
                                if (remaining > 0) acc.push({ ...d, amount: remaining });
                                // remaining <= 0 이면 완전 소멸
                            } else {
                                acc.push(d);
                            }
                            return acc;
                        }, []);
                        return { ...t, deadMoney: newDeadMoney };
                    }
                    return t;
                });
                gameData.setTeams(newTeams);
                const marketWithPlayers = { ...updatedMarket, players: gameData.leagueFAMarket?.players };
                gameData.setLeagueFAMarket(marketWithPlayers);
                gameData.forceSave({ teams: newTeams, leagueFAMarket: marketWithPlayers });
                if (session?.user?.id && gameData.myTeamId) {
                    const content: FASigningContent = {
                        playerId, playerName: faPlayer.name, position: faPlayer.position,
                        ovr: faPlayer.ovr, salary, years: contract.years.length, signingType,
                    };
                    sendMessage(session.user.id, gameData.myTeamId, gameData.currentSimDate,
                        'FA_SIGNING', `[FA 서명] ${faPlayer.name} 영입 완료`, content);
                }
                const faTx = {
                    id: `fa_${playerId}_${Date.now()}`, date: gameData.currentSimDate,
                    type: 'FASigning' as const, teamId: gameData.myTeamId ?? '',
                    season: seasonShort,
                    description: `FA 서명: ${faPlayer.name} (${signingType})`,
                    details: { playerName: faPlayer.name, position: faPlayer.position, ovr: faPlayer.ovr, salary, years: contract.years.length, signingType },
                };
                gameData.setTransactions((prev: any) => [faTx, ...prev]);
                if (session?.user?.id) writeTransaction(session.user.id, faTx).catch(console.error);
            }}
            onOfferSheetSubmitted={(playerId, updatedMarket) => {
                const marketWithPlayers = { ...updatedMarket, players: gameData.leagueFAMarket?.players };
                gameData.setLeagueFAMarket(marketWithPlayers);
                gameData.forceSave({ leagueFAMarket: marketWithPlayers });
            }}
            onReleasePlayer={(playerId, releaseType, buyoutAmount) => {
                const player = myTeam?.roster.find((p: Player) => p.id === playerId);
                if (!player) return;
                const contract = player.contract;
                const totalRemaining = contract && contract.years.length > 0
                    ? contract.years.slice(contract.currentYear).reduce((s: number, v: number) => s + v, 0)
                    : (player.salary ?? 0);
                const remainingYears = contract ? contract.years.length - contract.currentYear : 1;
                let deadAmount: number;
                let stretchYearsTotal: number | undefined;
                if (releaseType === 'waive') {
                    deadAmount = totalRemaining;
                } else if (releaseType === 'stretch') {
                    stretchYearsTotal = Math.max(1, 2 * remainingYears - 1);
                    deadAmount = Math.round(totalRemaining / stretchYearsTotal);
                } else {
                    deadAmount = buyoutAmount ?? totalRemaining;
                }
                const newDeadEntry: DeadMoneyEntry = {
                    playerId: player.id, playerName: player.name, amount: deadAmount,
                    season: gameData.currentSeason ?? '', releaseType,
                    ...(stretchYearsTotal !== undefined && {
                        stretchYearsTotal, stretchYearsRemaining: stretchYearsTotal,
                    }),
                };
                const newTeams = gameData.teams.map((t: Team) =>
                    t.id === gameData.myTeamId
                        ? { ...t, roster: t.roster.filter((p: Player) => p.id !== playerId), deadMoney: [...(t.deadMoney ?? []), newDeadEntry] }
                        : t
                );
                gameData.setTeams(newTeams);
                const allPlayers = newTeams.flatMap((t: Team) => t.roster);
                const updatedMarket = releasePlayerToMarket(
                    gameData.leagueFAMarket ?? null, player, allPlayers, newTeams,
                    gameData.currentSimDate, gameData.tendencySeed ?? '',
                    currentSeasonYear, seasonShort, gameData.myTeamId ?? undefined,
                );
                gameData.setLeagueFAMarket(updatedMarket);
                const LABELS: Record<ReleaseType, string> = { waive: '웨이브', stretch: '스트레치 웨이브', buyout: '바이아웃' };
                if (session?.user?.id && gameData.myTeamId) {
                    const prevSalary = player.salary ?? player.contract?.years[player.contract?.currentYear ?? 0] ?? 0;
                    const content: FAReleaseContent = {
                        playerId, playerName: player.name, position: player.position,
                        ovr: player.ovr, prevSalary, releaseType, deadCapAmount: deadAmount,
                    };
                    sendMessage(session.user.id, gameData.myTeamId, gameData.currentSimDate,
                        'FA_RELEASE', `[${LABELS[releaseType]}] ${player.name} 방출`, content);
                }
                const relTx = {
                    id: `rel_${playerId}_${Date.now()}`, date: gameData.currentSimDate,
                    type: 'FARelease' as const, teamId: gameData.myTeamId ?? '',
                    season: seasonShort,
                    description: `방출(${LABELS[releaseType]}): ${player.name} — 데드캡 ${(deadAmount / 1_000_000).toFixed(1)}M`,
                    details: { playerName: player.name, position: player.position, ovr: player.ovr, releaseType, deadCapAmount: deadAmount },
                };
                gameData.setTransactions((prev: any) => [relTx, ...prev]);
                if (session?.user?.id) writeTransaction(session.user.id, relTx).catch(console.error);
                gameData.forceSave({ teams: newTeams, leagueFAMarket: updatedMarket });
            }}
            onViewPlayer={(player) => {
                setViewPlayerData({ player });
                navigate(`/player/${player.id}`, { state: { player } });
            }}
            coachFAPool={gameData.coachFAPool ?? null}
            onHireCoach={handleHireCoach}
            onFireCoach={handleFireCoach}
            userNickname={session?.user?.email?.split('@')[0]}
        />
    );
};

export default FAMarketPage;

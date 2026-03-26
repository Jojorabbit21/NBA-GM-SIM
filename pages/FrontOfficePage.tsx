import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FrontOfficeView } from '../views/FrontOfficeView';
import { useGame } from '../hooks/useGameContext';
import { sendMessage } from '../services/messageService';
import { releasePlayerToMarket } from '../services/fa/faMarketBuilder';
import { writeTransaction } from '../services/persistence';
import type { Team, Player, ReleaseType } from '../types';
import type { PlayerContract } from '../types/player';
import type { DeadMoneyEntry } from '../types';
import type { ExtensionSignedContent, FAReleaseContent } from '../types/message';

const FrontOfficePage: React.FC = () => {
    const { session, gameData, setViewPlayerData } = useGame();
    const navigate = useNavigate();
    const { state } = useLocation();

    const myTeam = gameData.teams.find(t => t.id === gameData.myTeamId);
    if (!myTeam) return null;

    const seasonShort: string = gameData.seasonConfig?.seasonShort ?? '2025-26';
    const currentSeasonYear = new Date(gameData.currentSimDate).getFullYear();

    return (
        <FrontOfficeView
            team={myTeam}
            teams={gameData.teams}
            currentSimDate={gameData.currentSimDate}
            myTeamId={gameData.myTeamId!}
            seasonShort={seasonShort}
            coachingData={gameData.coachingData}
            onCoachClick={(teamId, role) => {
                const coach = gameData.coachingData?.[teamId]?.headCoach;
                if (coach) navigate(`/coach/${coach.id}`, { state: { coach, teamId, initialRole: role } });
            }}
            onGMClick={(teamId) => {
                if (gameData.leagueGMProfiles?.[teamId]) navigate(`/gm/${teamId}`);
            }}
            onViewPlayer={(player: Player, teamId?: string, teamName?: string) => {
                setViewPlayerData({ player, teamId, teamName });
                navigate(`/player/${player.id}`, { state: { player, teamId, teamName } });
            }}
            leaguePickAssets={gameData.leaguePickAssets}
            leagueGMProfiles={gameData.leagueGMProfiles}
            userNickname={session?.user?.email?.split('@')[0]}
            coachFAPool={gameData.coachFAPool}
            leagueTrainingConfigs={gameData.leagueTrainingConfigs}
            onCoachMarketOpen={() => navigate('/coach-market')}
            onTrainingViewOpen={() => navigate('/training')}
            offseasonPhase={gameData.offseasonPhase}
            tendencySeed={gameData.tendencySeed || ''}
            initialNegotiateId={(state as any)?.autoNegotiateId}
            initialNegotiateType={(state as any)?.negotiateType}
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
            onExtensionOffer={(playerId, contract) => {
                const player = myTeam?.roster.find((p: Player) => p.id === playerId);
                if (!player) return;
                const newTeams = gameData.teams.map((t: Team) => {
                    if (t.id !== gameData.myTeamId) return t;
                    return { ...t, roster: t.roster.map((p: Player) =>
                        p.id !== playerId ? p : { ...p, contract, salary: contract.years[0], contractYears: contract.years.length }
                    )};
                });
                gameData.setTeams(newTeams);
                gameData.forceSave({ teams: newTeams });
                const extTx = {
                    id: `ext_${playerId}_${Date.now()}`, date: gameData.currentSimDate,
                    type: 'Extension' as const, teamId: gameData.myTeamId ?? '',
                    season: seasonShort,
                    description: `계약 익스텐션: ${player.name} ${contract.years.length}년 / ${(contract.years[0] / 1_000_000).toFixed(1)}M`,
                    details: { playerName: player.name, position: player.position, ovr: player.ovr, salary: contract.years[0], years: contract.years.length },
                };
                gameData.setTransactions((prev: any) => [extTx, ...prev]);
                if (session?.user?.id) {
                    const content: ExtensionSignedContent = {
                        playerId, playerName: player.name, position: player.position,
                        ovr: player.ovr, salary: contract.years[0], years: contract.years.length,
                    };
                    sendMessage(session.user.id, gameData.myTeamId!, gameData.currentSimDate,
                        'EXTENSION_SIGNED', `[계약 익스텐션] ${player.name}과 연장 계약 체결`, content);
                    writeTransaction(session.user.id, extTx).catch(console.error);
                }
            }}
            onTeamOptionDecide={(playerId, exercised) => {
                const player = myTeam?.roster.find((p: Player) => p.id === playerId);
                const newTeams = gameData.teams.map((t: Team) => {
                    if (t.id !== gameData.myTeamId) return t;
                    if (exercised) {
                        return { ...t, roster: t.roster.map((p: Player) =>
                            p.id === playerId && p.contract?.option
                                ? { ...p, contract: { ...p.contract, option: undefined } }
                                : p
                        )};
                    } else {
                        return { ...t, roster: t.roster.filter((p: Player) => p.id !== playerId) };
                    }
                });
                gameData.setTeams(newTeams);
                gameData.forceSave({ teams: newTeams, withSnapshot: true });
                if (player) {
                    const optTx = {
                        id: `opt_${playerId}_${Date.now()}`, date: gameData.currentSimDate,
                        type: 'TeamOption' as const, teamId: gameData.myTeamId ?? '',
                        season: seasonShort,
                        description: `팀 옵션 ${exercised ? '행사' : '거절'}: ${player.name}`,
                        details: { playerName: player.name, position: player.position, ovr: player.ovr, exercised },
                    };
                    gameData.setTransactions((prev: any) => [optTx, ...prev]);
                    if (session?.user?.id) writeTransaction(session.user.id, optTx).catch(console.error);
                }
            }}
        />
    );
};

export default FrontOfficePage;

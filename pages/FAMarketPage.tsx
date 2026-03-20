import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FAView } from '../views/FAView';
import { useGame } from '../hooks/useGameContext';
import { sendMessage } from '../services/messageService';
import { releasePlayerToMarket } from '../services/fa/faMarketBuilder';
import type { Team, Player, ReleaseType } from '../types';
import type { PlayerContract } from '../types/player';
import type { SigningType } from '../types/fa';
import type { DeadMoneyEntry } from '../types';
import type { FASigningContent, FAReleaseContent, ExtensionSignedContent } from '../types/message';

const FAMarketPage: React.FC = () => {
    const { session, gameData, setViewPlayerData } = useGame();
    const navigate = useNavigate();

    const myTeam = gameData.teams.find((t: Team) => t.id === gameData.myTeamId);
    if (!myTeam) return null;

    const seasonShort: string = gameData.seasonConfig?.seasonShort ?? '2025-26';
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
            onOfferAccepted={(playerId, contract, signingType, updatedMarket) => {
                const faPlayer = gameData.faPlayerMap?.[playerId];
                if (!faPlayer) return;
                const salary = contract.years[contract.currentYear] ?? contract.years[0];
                const signedPlayer = { ...faPlayer, contract, salary, contractYears: contract.years.length, teamTenure: 0 };
                const newTeams = gameData.teams.map((t: Team) =>
                    t.id === gameData.myTeamId
                        ? { ...t, roster: [...t.roster, signedPlayer] }
                        : t
                );
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
                gameData.setTransactions((prev: any) => [{
                    id: `fa_${playerId}_${Date.now()}`, date: gameData.currentSimDate,
                    type: 'fa_signing', teamId: gameData.myTeamId,
                    description: `FA 서명: ${faPlayer.name} (${signingType})`, details: null,
                }, ...prev]);
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
                if (session?.user?.id && gameData.myTeamId) {
                    const prevSalary = player.salary ?? player.contract?.years[player.contract?.currentYear ?? 0] ?? 0;
                    const LABELS: Record<ReleaseType, string> = { waive: '웨이브', stretch: '스트레치 웨이브', buyout: '바이아웃' };
                    const content: FAReleaseContent = {
                        playerId, playerName: player.name, position: player.position,
                        ovr: player.ovr, prevSalary, releaseType, deadCapAmount: deadAmount,
                    };
                    sendMessage(session.user.id, gameData.myTeamId, gameData.currentSimDate,
                        'FA_RELEASE', `[${LABELS[releaseType]}] ${player.name} 방출`, content);
                }
                gameData.setTransactions((prev: any) => [{
                    id: `rel_${playerId}_${Date.now()}`, date: gameData.currentSimDate,
                    type: 'fa_release', teamId: gameData.myTeamId,
                    description: `방출(${releaseType}): ${player.name} — 데드캡 ${(deadAmount / 1_000_000).toFixed(1)}M`, details: null,
                }, ...prev]);
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
                if (session?.user?.id && gameData.myTeamId) {
                    const content: ExtensionSignedContent = {
                        playerId, playerName: player.name, position: player.position,
                        ovr: player.ovr, salary: contract.years[0], years: contract.years.length,
                    };
                    sendMessage(session.user.id, gameData.myTeamId, gameData.currentSimDate,
                        'EXTENSION_SIGNED', `[계약 익스텐션] ${player.name}과 연장 계약 체결`, content);
                }
            }}
            onTeamOptionDecide={(playerId, exercised) => {
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
            }}
            onViewPlayer={(player) => {
                setViewPlayerData({ player });
                navigate(`/player/${player.id}`, { state: { player } });
            }}
        />
    );
};

export default FAMarketPage;

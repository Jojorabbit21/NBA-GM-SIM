/**
 * 시즌 전체 시뮬레이션 배치 서비스 (테스트 전용)
 * 엔진 밸런싱 검증을 위해 남은 정규시즌을 한 번에 시뮬레이션.
 */

import { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart, Player } from '../../types';
import { MessageType } from '../../types/message';
import { LeagueCoachingData } from '../../types/coaching';
import { SimSettings } from '../../types/simSettings';
import { LeaguePickAssets } from '../../types/draftAssets';
import { LeagueTradeBlocks, LeagueTradeOffers } from '../../types/trade';
import { LeagueGMProfiles } from '../../types/gm';
import { LeagueFAMarket } from '../../types/fa';
import { OffseasonPhase } from '../../types/app';
import { simulateCpuGames } from '../simulationService';
import { runUserSimulation, processInjuryRecovery, computeReturnDate } from './userGameService';
import { handleSeasonEventsSync } from './seasonService';
import { dispatchOffseasonEvent } from './offseasonEventHandler';
import { updateTeamStats, applyBoxToRoster, updateSeriesState, sumTeamBoxScore, extractQuarterScores } from '../../utils/simulationUtils';
import { applyRestDayRecovery } from '../game/engine/fatigueSystem';
import { processGameDevelopment, computeLeagueAverages } from '../playerDevelopment/playerAging';
import { updatePopularityFromGame } from '../playerPopularity';
import { updateMoraleFromGame } from '../moraleService';
import { buildScoutReportContent } from '../reportGenerator';
import { getBudgetManager } from '../financeEngine';
import { SeasonConfig, DEFAULT_SEASON_CONFIG } from '../../utils/seasonConfig';
import { openFAMarket, simulateCPUSigning } from '../fa/faMarketBuilder';
import { simulateCPUWaivers } from '../fa/cpuWaiverEngine';

export interface BatchMessagePayload {
    user_id: string;
    team_id: string;
    date: string;
    type: MessageType;
    title: string;
    content: any;
}

export interface BatchSeasonResult {
    finalTeams: Team[];
    finalSchedule: Game[];
    finalPlayoffSeries: PlayoffSeries[];
    finalDate: string;
    allGameResultsToSave: any[];
    allPlayoffResultsToSave: any[];
    allMessages: BatchMessagePayload[];
    transactions: Transaction[];
    userGameCount: number;
    userWins: number;
    // 오프시즌 처리 결과
    finalOffseasonPhase?: OffseasonPhase;
    finalLeagueFAMarket?: LeagueFAMarket | null;
    newSeasonNumber?: number;
    newSeasonConfig?: SeasonConfig;
}

/**
 * 남은 정규시즌 전체를 배치 시뮬레이션.
 * teams/schedule/playoffSeries는 호출자가 딥 클론해서 전달해야 함.
 */
export async function runBatchSeason(
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[],
    myTeamId: string,
    userTactics: GameTactics,
    depthChart: DepthChart | null,
    tendencySeed: string | undefined,
    userId: string | undefined,
    onProgress: (current: number, total: number, date: string) => void,
    cancelToken: { cancelled: boolean },
    simSettings?: SimSettings,
    coachingData?: LeagueCoachingData | null,
    seasonConfig?: SeasonConfig,
    stopDate?: string,
    leagueTradeBlocks?: LeagueTradeBlocks,
    leaguePickAssets?: LeaguePickAssets | null,
    leagueTradeOffers?: LeagueTradeOffers,
    leagueGMProfiles?: LeagueGMProfiles,
    // 오프시즌 처리용
    currentSimDate?: string,
    offseasonPhase?: OffseasonPhase,
    currentSeasonNumber?: number,
    leagueFAMarket?: LeagueFAMarket | null,
): Promise<BatchSeasonResult> {
    const seasonShort = seasonConfig?.seasonShort ?? DEFAULT_SEASON_CONFIG.seasonShort;
    const allGameResultsToSave: any[] = [];
    const allPlayoffResultsToSave: any[] = [];
    const allMessages: BatchMessagePayload[] = [];
    const allTransactions: Transaction[] = [];
    let userGameCount = 0;
    let userWins = 0;

    // 남은 게임데이 목록 생성 (정규시즌 + 플레이오프 포함)
    const unplayedDates = getUnplayedGameDates(schedule, myTeamId);

    // 플레이오프 진행 중인데 남은 경기가 없을 수 있음 (다음 라운드 게임이 아직 생성 안 된 경우)
    // → currentSimDate부터 시드하여 handleSeasonEventsSync가 다음 라운드 게임을 생성하도록 함
    if (unplayedDates.length === 0 && playoffSeries.length > 0) {
        const finalsAlreadyDone = playoffSeries.some(s => s.round === 4 && s.finished);
        if (!finalsAlreadyDone) {
            // 현재 날짜부터 시작해 handleSeasonEventsSync에서 새 게임 생성 유도
            const currentDate = schedule
                .filter(g => g.played)
                .sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
            const seedDate = currentDate || new Date().toISOString().split('T')[0];
            unplayedDates.push(seedDate);
        }
    }

    let total = unplayedDates.length;
    let current = 0;
    let lastDate = unplayedDates[unplayedDates.length - 1] ?? '';

    // 플레이오프 진행 중에는 동적으로 날짜 추가 (playoff 경기는 handleSeasonEventsSync에서 schedule에 push됨)
    let dateIndex = 0;

    // 월간 스카우트 보고서 트래킹
    let prevMonthKey = unplayedDates.length > 0
        ? new Date(unplayedDates[0]).getFullYear() * 100 + new Date(unplayedDates[0]).getMonth()
        : -1;

    while (dateIndex < unplayedDates.length) {
        const date = unplayedDates[dateIndex];
        dateIndex++;
        if (cancelToken.cancelled) {
            lastDate = date;
            break;
        }

        // stopDate 이후면 중단 (해당 날짜까지만 진행)
        if (stopDate && date > stopDate) {
            lastDate = unplayedDates[dateIndex - 2] ?? date;
            break;
        }

        // 월 경계 감지 → 스카우트 보고서 생성
        const currentMonthKey = new Date(date).getFullYear() * 100 + new Date(date).getMonth();
        if (currentMonthKey !== prevMonthKey && userId) {
            const myTeam = teams.find(t => t.id === myTeamId);
            if (myTeam) {
                const prevDate = new Date(date);
                prevDate.setDate(0); // 직전 달 마지막 날
                const periodEnd = prevDate.toISOString().split('T')[0];
                const periodStart = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;
                const monthLabel = `${prevDate.getFullYear()}년 ${prevDate.getMonth() + 1}월`;
                const scoutContent = buildScoutReportContent(myTeam.roster, myTeamId, myTeam.name, periodStart, periodEnd, monthLabel);
                if (scoutContent.hasAnyChanges) {
                    allMessages.push({
                        user_id: userId, team_id: myTeamId, date,
                        type: 'SCOUT_REPORT',
                        title: `[스카우트 보고서] ${monthLabel}`,
                        content: scoutContent,
                    });
                }
            }
            prevMonthKey = currentMonthKey;
        }

        // 부상 복귀 체크 (매일 경기 전에 실행)
        const recoveredPlayers = processInjuryRecovery(teams, date, myTeamId);
        if (recoveredPlayers.length > 0 && userId) {
            for (const rec of recoveredPlayers) {
                allMessages.push({
                    user_id: userId,
                    team_id: myTeamId,
                    date,
                    type: 'INJURY_REPORT',
                    title: `[복귀 보고] ${rec.playerName} — 훈련 복귀`,
                    content: {
                        playerId: rec.playerId,
                        playerName: rec.playerName,
                        injuryType: rec.injuryType,
                        severity: 'Minor' as const,
                        duration: '',
                        returnDate: date,
                        isRecovery: true,
                    },
                });
            }
        }

        // 유저 경기 찾기 (정규시즌 + 플레이오프 모두)
        const userGame = schedule.find(g =>
            !g.played && g.date === date &&
            (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
        );

        // 1. CPU 경기 처리 (in-place)
        const cpuPayloads = processCpuGamesInPlace(
            teams, schedule, playoffSeries, date, userGame?.id, userId,
            tendencySeed, simSettings?.growthRate ?? 1.0, simSettings?.declineRate ?? 1.0, simSettings, coachingData,
            seasonConfig?.seasonLabel
        );
        allGameResultsToSave.push(...cpuPayloads.regular);
        allPlayoffResultsToSave.push(...cpuPayloads.playoff);

        // 2. 유저 경기 또는 휴식
        if (userGame) {
            const result = runUserSimulation(
                userGame, teams, schedule, myTeamId, userTactics, date, depthChart, tendencySeed, simSettings, coachingData
            );

            // 결과 적용 (in-place, DB/메시지 생략)
            applyGameResultInPlace(result, userGame, teams, schedule, playoffSeries, date);

            // 선수 성장/퇴화 + 인기도 + 기분 업데이트 (homeT/awayT 1회만 탐색)
            const homeT = teams.find(t => t.id === userGame.homeTeamId);
            const awayT = teams.find(t => t.id === userGame.awayTeamId);
            if (homeT && awayT) {
                if (tendencySeed) {
                    const gr = simSettings?.growthRate ?? 1.0;
                    const dr = simSettings?.declineRate ?? 1.0;
                    const leagueAvg = computeLeagueAverages(teams);
                    processGameDevelopment(
                        homeT.roster, awayT.roster,
                        result.homeBox, result.awayBox,
                        tendencySeed, gr, dr, leagueAvg, date,
                    );
                }

                const userTop8 = new Set(
                    [...teams].sort((a, b) =>
                        (b.wins / Math.max(1, b.wins + b.losses)) - (a.wins / Math.max(1, a.wins + a.losses))
                    ).slice(0, 8).map(t => t.id)
                );
                const isPlayoffGame = !!userGame.isPlayoff;
                updatePopularityFromGame(homeT.roster, result.homeBox, isPlayoffGame, userTop8.has(awayT.id));
                updatePopularityFromGame(awayT.roster, result.awayBox, isPlayoffGame, userTop8.has(homeT.id));

                const homeWon = result.homeScore > result.awayScore;
                updateMoraleFromGame(homeT.roster, result.homeBox, homeWon, date);
                updateMoraleFromGame(awayT.roster, result.awayBox, !homeWon, date);
            }

            // DB 페이로드 누적 (PBP 로그 포함)
            const isPlayoffGame = !!userGame.isPlayoff;
            const userQS = result.pbpLogs?.length
                ? extractQuarterScores(result.pbpLogs, userGame.homeTeamId, result.homeScore, result.awayScore)
                : undefined;
            const payload: any = {
                user_id: userId || 'guest',
                game_id: userGame.id,
                date,
                home_team_id: userGame.homeTeamId,
                away_team_id: userGame.awayTeamId,
                home_score: result.homeScore,
                away_score: result.awayScore,
                box_score: { home: result.homeBox, away: result.awayBox },
                tactics: { home: result.homeTactics, away: result.awayTactics },
                pbp_logs: result.pbpLogs,
                shot_events: result.pbpShotEvents,
                rotation_data: result.rotationData,
                is_playoff: isPlayoffGame,
                ...(userQS && { quarter_scores: userQS }),
                ...(seasonConfig?.seasonLabel && { season: seasonConfig.seasonLabel }),
            };
            if (isPlayoffGame && userGame.seriesId) {
                allPlayoffResultsToSave.push({
                    ...payload,
                    series_id: userGame.seriesId,
                    round_number: 0,
                    game_number: 0,
                });
            } else {
                allGameResultsToSave.push(payload);
            }

            userGameCount++;
            const isHome = userGame.homeTeamId === myTeamId;
            if (isHome ? result.homeScore > result.awayScore : result.awayScore > result.homeScore) {
                userWins++;
            }

            // 메시지 페이로드 누적
            if (userId) {
                const homeTeam = teams.find(t => t.id === userGame.homeTeamId);
                const awayTeam = teams.find(t => t.id === userGame.awayTeamId);
                allMessages.push({
                    user_id: userId,
                    team_id: myTeamId,
                    date,
                    type: 'GAME_RECAP',
                    title: `[경기 결과] vs ${isHome ? (awayTeam?.name ?? '') : (homeTeam?.name ?? '')}`,
                    content: {
                        gameId: userGame.id,
                        homeTeamId: userGame.homeTeamId,
                        awayTeamId: userGame.awayTeamId,
                        homeScore: result.homeScore,
                        awayScore: result.awayScore,
                        userBoxScore: isHome ? result.homeBox : result.awayBox,
                    },
                });

                // 유저 팀 선수 출장정지 보고서 (싸움)
                if (result.suspensions && result.suspensions.length > 0) {
                    for (const susp of result.suspensions) {
                        // 내 팀 선수가 관련된 경우만 메시지
                        const isMyFighter = susp.teamId === myTeamId;
                        const isMyOpponent = susp.opponentTeamId === myTeamId;
                        if (isMyFighter || isMyOpponent) {
                            const myPlayerId = isMyFighter ? susp.playerId : susp.opponentPlayerId;
                            const myPlayerName = isMyFighter ? susp.playerName : susp.opponentPlayerName;
                            const mySusp = isMyFighter ? susp.suspensionGames : susp.opponentSuspensionGames;
                            const oppTeamId = isMyFighter ? susp.opponentTeamId : susp.teamId;
                            const oppName = isMyFighter ? susp.opponentPlayerName : susp.playerName;
                            const oppTeam = teams.find(t => t.id === oppTeamId);
                            const returnDate = computeReturnDate(date, `${mySusp * 2}일`);

                            allMessages.push({
                                user_id: userId,
                                team_id: myTeamId,
                                date,
                                type: 'SUSPENSION' as MessageType,
                                title: `[출장정지] ${myPlayerName} — ${mySusp}경기 출장정지`,
                                content: {
                                    playerId: myPlayerId,
                                    playerName: myPlayerName,
                                    teamId: myTeamId,
                                    opponentPlayerId: isMyFighter ? susp.opponentPlayerId : susp.playerId,
                                    opponentPlayerName: oppName,
                                    opponentTeamId: oppTeamId,
                                    opponentTeamName: oppTeam?.name || '',
                                    suspensionGames: mySusp,
                                    returnDate,
                                },
                            });
                        }
                    }
                }

                // 유저 팀 선수 부상 보고서
                if (result.injuries && result.injuries.length > 0) {
                    const myInjuries = result.injuries.filter(inj => inj.teamId === myTeamId);
                    for (const inj of myInjuries) {
                        const actualReturnDate = computeReturnDate(date, inj.durationDesc);
                        allMessages.push({
                            user_id: userId,
                            team_id: myTeamId,
                            date,
                            type: 'INJURY_REPORT',
                            title: `[부상 보고] ${inj.playerName} — ${inj.injuryType}`,
                            content: {
                                playerId: inj.playerId,
                                playerName: inj.playerName,
                                injuryType: inj.injuryType,
                                severity: inj.severity,
                                duration: inj.durationDesc,
                                returnDate: actualReturnDate,
                            },
                        });
                    }
                }
            }
        } else {
            // 비경기일: 체력 회복 + 훈련 중 부상 체크
            const injuriesOn = simSettings?.injuriesEnabled ?? false;
            const injFreq = injuriesOn ? (simSettings?.injuryFrequency ?? 1.0) : 0;
            const trainingInjuries = applyRestDayRecovery(teams, injFreq);

            // 훈련 부상 returnDate 변환 + 히스토리 기록 + 메시지 생성
            for (const ti of trainingInjuries) {
                // duration 문자열 → 실제 복귀 날짜
                const injured = teams.flatMap(t => t.roster).find(p => p.id === ti.playerId);
                if (injured) {
                    injured.returnDate = computeReturnDate(date, ti.duration);
                    // 부상 히스토리 기록
                    if (!injured.injuryHistory) injured.injuryHistory = [];
                    injured.injuryHistory.push({
                        injuryType: ti.injuryType,
                        severity: ti.severity,
                        duration: ti.duration,
                        date,
                        returnDate: injured.returnDate,
                        isTraining: true,
                    });
                }

                if (userId && ti.teamId === myTeamId) {
                    allMessages.push({
                        user_id: userId,
                        team_id: myTeamId,
                        date,
                        type: 'INJURY_REPORT',
                        title: `[부상 보고] ${ti.playerName} — ${ti.injuryType} (훈련 중)`,
                        content: {
                            playerId: ti.playerId,
                            playerName: ti.playerName,
                            injuryType: ti.injuryType,
                            severity: ti.severity,
                            duration: ti.duration,
                            returnDate: computeReturnDate(date, ti.duration),
                            isTrainingInjury: true,
                        },
                    });
                }
            }
        }

        // 2.5 CPU 경기 출장정지 → LEAGUE_NEWS (타팀 싸움 뉴스)
        if (userId && cpuPayloads.suspensions.length > 0) {
            for (const { susp } of cpuPayloads.suspensions) {
                const fighterTeam = teams.find(t => t.id === susp.teamId);
                const oppTeam = teams.find(t => t.id === susp.opponentTeamId);
                allMessages.push({
                    user_id: userId,
                    team_id: myTeamId,
                    date,
                    type: 'LEAGUE_NEWS' as MessageType,
                    title: `[리그 뉴스] ${susp.playerName}, ${susp.suspensionGames}경기 출장정지`,
                    content: {
                        fighterPlayerId: susp.playerId,
                        fighterPlayerName: susp.playerName,
                        fighterTeamId: susp.teamId,
                        fighterTeamName: fighterTeam?.name || '',
                        fighterSuspensionGames: susp.suspensionGames,
                        opponentPlayerId: susp.opponentPlayerId,
                        opponentPlayerName: susp.opponentPlayerName,
                        opponentTeamId: susp.opponentTeamId,
                        opponentTeamName: oppTeam?.name || '',
                        opponentSuspensionGames: susp.opponentSuspensionGames,
                    },
                });
            }
        }

        // 3. 시즌 이벤트 (동기)
        const events = handleSeasonEventsSync(teams, schedule, playoffSeries, date, myTeamId, tendencySeed, leagueTradeBlocks, leaguePickAssets ?? undefined, leagueTradeOffers, leagueGMProfiles, seasonConfig);
        if (events.newTransactions.length > 0) {
            allTransactions.push(...events.newTransactions);
        }
        if (events.awardContent && userId) {
            allMessages.push({
                user_id: userId,
                team_id: myTeamId,
                date,
                type: 'SEASON_AWARDS',
                title: `[공식] ${seasonShort} 정규시즌 어워드 투표 결과`,
                content: events.awardContent,
            });
        }
        if (events.championContent && userId) {
            allMessages.push({
                user_id: userId,
                team_id: myTeamId,
                date,
                type: 'REG_SEASON_CHAMPION',
                title: `[속보] ${seasonShort} 정규시즌 우승: ${events.championContent.championTeamName}`,
                content: events.championContent,
            });
        }

        // 4. 플레이오프 경기 동적 추가 감지
        // handleSeasonEventsSync가 schedule에 push한 새 플레이오프 경기의 날짜 + 사이 휴식일을 unplayedDates에 추가
        if (playoffSeries.length > 0) {
            // 파이널 종료 체크
            const finalsFinished = playoffSeries.some(s => s.round === 4 && s.finished);
            if (finalsFinished) {
                lastDate = date;
                break;
            }

            const existingDateSet = new Set(unplayedDates);
            const newPlayoffDates: string[] = [];
            for (const g of schedule) {
                if (!g.played && g.isPlayoff && !existingDateSet.has(g.date)) {
                    newPlayoffDates.push(g.date);
                }
            }
            if (newPlayoffDates.length > 0) {
                // 현재 날짜 다음날 ~ 새 플레이오프 경기 중 가장 먼 날짜까지 모든 날짜 추가 (휴식일 포함)
                const maxNewDate = newPlayoffDates.sort().pop()!;
                const nextDay = new Date(date);
                nextDay.setDate(nextDay.getDate() + 1);
                const endDay = new Date(maxNewDate);
                for (let d = new Date(nextDay); d <= endDay; d.setDate(d.getDate() + 1)) {
                    const ds = d.toISOString().split('T')[0];
                    if (!existingDateSet.has(ds)) {
                        unplayedDates.push(ds);
                        existingDateSet.add(ds);
                    }
                }
                unplayedDates.sort();
                total = unplayedDates.length;
            }
        }

        // 5. 진행 상황 보고 + UI yield
        current++;
        lastDate = date;
        onProgress(current, total, date);
        await new Promise<void>(r => setTimeout(r, 0));
    }

    // ── 오프시즌 날짜 루프 ──
    // 경기가 없는 오프시즌 구간에서 moratoriumStart / rosterDeadline / openingNight 이벤트 처리
    let finalOffseasonPhase: OffseasonPhase = offseasonPhase ?? null;
    let activeFAMarket: LeagueFAMarket | null = leagueFAMarket ?? null;
    let newSeasonNumber: number | undefined;
    let newSeasonConfig: SeasonConfig | undefined;

    if (offseasonPhase !== null && offseasonPhase !== undefined && stopDate && seasonConfig) {
        // 게임 루프에서 lastDate가 없으면 currentSimDate를 시작점으로 사용
        const loopStart = lastDate
            ? (() => { const d = new Date(lastDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })()
            : (currentSimDate ?? stopDate);

        const offseasonDates = generateDateRange(loopStart, stopDate);

        for (const date of offseasonDates) {
            if (cancelToken.cancelled) break;

            const event = await dispatchOffseasonEvent({
                currentDate: date,
                keyDates: seasonConfig.keyDates,
                offseasonPhase: finalOffseasonPhase,
                teams,
                schedule,
                playoffSeries,
                currentSeasonNumber: currentSeasonNumber ?? 1,
                tendencySeed: tendencySeed ?? '',
                userId,
                userTeamId: myTeamId,
                hasProspects: false,
                leaguePickAssets: leaguePickAssets ?? undefined,
            });

            lastDate = date;
            onProgress(current, total || 1, date);
            await new Promise<void>(r => setTimeout(r, 0));

            if (!event.fired) continue;

            const u = event.updates!;
            if (u.offseasonPhase !== undefined) finalOffseasonPhase = u.offseasonPhase;

            // draftLottery / rookieDraft: blocked → 여기서 중단 (useFullSeasonSim의 effectiveStopDate가 막아줘야 하지만 방어적 처리)
            if (event.blocked) break;

            // moratoriumStart: 에이징/계약만료 처리 + FA 시장 개설 + 조기 웨이버
            if (u.offseasonProcessed && u.expiredPlayerObjects) {
                const closeDate = seasonConfig.keyDates.openingNight ?? date;
                const seasonYear = new Date(date).getFullYear();
                const seasonLabel = seasonConfig.seasonShort;
                const allPlayers = teams.flatMap(t => t.roster);

                activeFAMarket = openFAMarket(
                    u.expiredPlayerObjects,
                    allPlayers,
                    teams,
                    date,
                    closeDate,
                    seasonYear,
                    seasonLabel,
                    tendencySeed ?? '',
                    u.prevTeamIdMap,
                    u.prevTenureMap,
                );
                activeFAMarket.players = u.expiredPlayerObjects;

                // 조기 CPU 웨이버 (Phase 1+3, skipVoluntary)
                if (leagueGMProfiles) {
                    const earlyResult = simulateCPUWaivers(
                        teams,
                        activeFAMarket,
                        myTeamId,
                        leagueGMProfiles,
                        tendencySeed ?? '',
                        seasonYear,
                        seasonLabel,
                        { skipVoluntary: true },
                    );
                    // simulateCPUWaivers는 새 배열을 반환 → teams 배열 in-place 교체
                    teams.splice(0, teams.length, ...earlyResult.teams);
                    activeFAMarket = earlyResult.market;
                }

                // 인박스 메시지: 은퇴 뉴스
                if (userId && u.offseasonProcessed.retiredPlayers.length > 0) {
                    allMessages.push({
                        user_id: userId,
                        team_id: myTeamId,
                        date,
                        type: 'RETIREMENT_NEWS',
                        title: `[리그 소식] 오프시즌 은퇴 선수 명단`,
                        content: {
                            players: u.offseasonProcessed.retiredPlayers.map(p => ({
                                playerId: p.playerId, playerName: p.playerName,
                                age: p.age, ovr: p.ovr, position: p.position, teamId: p.teamId,
                            })),
                        },
                    });
                }
            }

            // rosterDeadline: FA 시장 마감 → 전체 웨이버 + CPU 자동 서명
            if (u.faMarketClosed && activeFAMarket) {
                const seasonYear = new Date(date).getFullYear();
                const seasonLabel = seasonConfig.seasonShort;

                if (leagueGMProfiles) {
                    const waiverResult = simulateCPUWaivers(
                        teams,
                        activeFAMarket,
                        myTeamId,
                        leagueGMProfiles,
                        tendencySeed ?? '',
                        seasonYear,
                        seasonLabel,
                    );
                    teams.splice(0, teams.length, ...waiverResult.teams);
                    activeFAMarket = waiverResult.market;
                }

                const faPlayerMap: Record<string, Player> = Object.fromEntries(
                    (activeFAMarket.players ?? []).map(p => [p.id, p])
                );
                const cpuResult = simulateCPUSigning(
                    activeFAMarket,
                    teams,
                    faPlayerMap,
                    myTeamId,
                    tendencySeed ?? '',
                    seasonYear,
                );
                teams.splice(0, teams.length, ...cpuResult.teams);
                activeFAMarket = null;

                if (userId && cpuResult.signings.length > 0) {
                    allMessages.push({
                        user_id: userId,
                        team_id: myTeamId,
                        date,
                        type: 'FA_LEAGUE_NEWS',
                        title: '[리그 소식] FA 시장 마감 — 주요 계약 소식',
                        content: {
                            signings: cpuResult.signings.map(s => {
                                const player = faPlayerMap[s.playerId];
                                const team = cpuResult.teams.find(t => t.id === s.teamId);
                                return {
                                    teamId: s.teamId,
                                    teamName: team ? `${team.city} ${team.name}` : s.teamId,
                                    playerId: s.playerId,
                                    playerName: player?.name ?? s.playerId,
                                    position: player?.position ?? '',
                                    ovr: player?.ovr ?? 0,
                                    salary: s.salary,
                                    years: s.years,
                                };
                            }),
                        },
                    });
                }
            }

            // openingNight: 새 시즌 개막 → 일정 교체 후 루프 종료
            if (u.newSchedule && u.newSeasonNumber && u.newSeasonConfig) {
                schedule.splice(0, schedule.length, ...u.newSchedule);
                playoffSeries.splice(0, playoffSeries.length);
                newSeasonNumber = u.newSeasonNumber;
                newSeasonConfig = u.newSeasonConfig;
                finalOffseasonPhase = null;
                activeFAMarket = null;
                break;
            }
        }
    }

    // 최종 날짜를 하루 뒤로 (기존 파이프라인과 동일)
    let finalDate: string;
    if (lastDate) {
        const d = new Date(lastDate);
        d.setDate(d.getDate() + 1);
        finalDate = d.toISOString().split('T')[0];
    } else {
        // 처리할 경기가 없으면 stopDate(유저가 선택한 목표 날짜) 우선 사용
        if (stopDate) {
            finalDate = stopDate;
        } else {
            const lastPlayedDate = schedule.filter(g => g.played).sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
            if (lastPlayedDate) {
                const d = new Date(lastPlayedDate);
                d.setDate(d.getDate() + 1);
                finalDate = d.toISOString().split('T')[0];
            } else {
                finalDate = new Date().toISOString().split('T')[0];
            }
        }
    }

    return {
        finalTeams: teams,
        finalSchedule: schedule,
        finalPlayoffSeries: playoffSeries,
        finalDate,
        allGameResultsToSave,
        allPlayoffResultsToSave,
        allMessages,
        transactions: allTransactions,
        userGameCount,
        userWins,
        finalOffseasonPhase,
        finalLeagueFAMarket: activeFAMarket,
        newSeasonNumber,
        newSeasonConfig,
    };
}

/** 두 ISO 날짜 사이의 모든 날짜 배열 생성 (startDate 포함, endDate 포함) */
function generateDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const end = new Date(endDate + 'T00:00:00');
    for (let d = new Date(startDate + 'T00:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
}

// ── 헬퍼 함수들 ──

/** 남은 미플레이 날짜 목록 (정규시즌 + 플레이오프, 중복 제거, 정렬) */
function getUnplayedGameDates(schedule: Game[], myTeamId: string): string[] {
    const dateSet = new Set<string>();

    // 유저 팀의 남은 경기 (정규시즌 + 플레이오프 모두) 마지막 날짜 찾기
    const myUnplayed = schedule.filter(g =>
        !g.played &&
        (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
    );
    const lastMyGameDate = myUnplayed.length > 0
        ? myUnplayed.sort((a, b) => a.date.localeCompare(b.date))[myUnplayed.length - 1].date
        : '';

    if (!lastMyGameDate) return [];

    // ★ 정규시즌 마지막 날짜까지 확장: 유저 경기가 끝났어도 다른 팀의 정규시즌 경기가
    // 남아있으면 checkAndInitPlayoffs가 트리거되지 않으므로, 정규시즌 끝날짜까지 포함
    const lastRegularDate = schedule
        .filter(g => !g.played && !g.isPlayoff)
        .reduce((max, g) => g.date > max ? g.date : max, '');
    const endDate = lastRegularDate > lastMyGameDate ? lastRegularDate : lastMyGameDate;

    // 해당 날짜까지의 모든 미플레이 날짜 (정규시즌 + 플레이오프)
    for (const g of schedule) {
        if (!g.played && g.date <= endDate) {
            dateSet.add(g.date);
        }
    }

    // 휴식일도 포함 (유저 첫 미플레이 날짜 ~ 마지막 경기 날짜 사이)
    const sortedDates = Array.from(dateSet).sort();
    if (sortedDates.length === 0) return [];

    const allDates: string[] = [];
    const start = new Date(sortedDates[0]);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        allDates.push(d.toISOString().split('T')[0]);
    }

    return allDates;
}

/** CPU 경기를 in-place로 처리하고 DB 페이로드만 반환 */
function processCpuGamesInPlace(
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[],
    date: string,
    userGameId: string | undefined,
    userId: string | undefined,
    tendencySeed?: string,
    growthRate: number = 1.0,
    declineRate: number = 1.0,
    simSettings?: SimSettings,
    coachingData?: LeagueCoachingData | null,
    season?: string,
): { regular: any[]; playoff: any[]; suspensions: { susp: any; homeTeamId: string; awayTeamId: string }[] } {
    const results = simulateCpuGames(schedule, teams, date, userGameId, simSettings, coachingData);
    const regular: any[] = [];
    const playoff: any[] = [];
    const suspensions: { susp: any; homeTeamId: string; awayTeamId: string }[] = [];

    // top8 계산: 루프 밖에서 1회만 (경기마다 재정렬 방지)
    const top8Ids = new Set(
        [...teams].sort((a, b) =>
            (b.wins / Math.max(1, b.wins + b.losses)) - (a.wins / Math.max(1, a.wins + a.losses))
        ).slice(0, 8).map(t => t.id)
    );

    for (const res of results) {
        const home = teams.find(t => t.id === res.homeTeamId);
        const away = teams.find(t => t.id === res.awayTeamId);
        if (!home || !away) continue;

        const isPlayoff = !!res.isPlayoff;
        updateTeamStats(home, away, res.homeScore, res.awayScore, isPlayoff);
        if (res.boxScore?.home) applyBoxToRoster(home, res.boxScore.home, isPlayoff);
        if (res.boxScore?.away) applyBoxToRoster(away, res.boxScore.away, isPlayoff);

        // 홈 경기 수익 누적 (정규시즌만)
        if (!isPlayoff) {
            getBudgetManager().processHomeGame(home, away.id, date);
        }

        // 선수 성장/퇴화 (정규시즌만)
        if (tendencySeed && !isPlayoff && res.boxScore?.home && res.boxScore?.away) {
            const leagueAvg = computeLeagueAverages(teams);
            processGameDevelopment(
                home.roster, away.roster,
                res.boxScore.home, res.boxScore.away,
                tendencySeed, growthRate, declineRate, leagueAvg, date,
            );
        }

        // 선수 인기도 업데이트 (정규시즌 + 플레이오프)
        if (res.boxScore?.home && res.boxScore?.away) {
            updatePopularityFromGame(home.roster, res.boxScore.home, isPlayoff, top8Ids.has(away.id));
            updatePopularityFromGame(away.roster, res.boxScore.away, isPlayoff, top8Ids.has(home.id));

            // 선수 기분 업데이트
            const homeWon = res.homeScore > res.awayScore;
            updateMoraleFromGame(home.roster, res.boxScore.home, homeWon, date);
            updateMoraleFromGame(away.roster, res.boxScore.away, !homeWon, date);
        }

        // CPU 경기 로스터 업데이트 적용 (체력/부상)
        if (res.rosterUpdates) {
            [home, away].forEach(t => {
                t.roster.forEach((p: any) => {
                    const update = (res.rosterUpdates as any)[p.id];
                    if (update) {
                        if (update.condition !== undefined) p.condition = update.condition;
                        if (update.health) {
                            p.health = update.health;
                        }
                        if (update.injuryType) p.injuryType = update.injuryType;
                        if (update.returnDate) p.returnDate = computeReturnDate(date, update.returnDate);
                        // 부상 히스토리 기록
                        if (update.health === 'Injured' && update.injuryType && update.returnDate) {
                            if (!p.injuryHistory) p.injuryHistory = [];
                            p.injuryHistory.push({
                                injuryType: update.injuryType,
                                severity: 'Minor',
                                duration: update.returnDate,
                                date,
                                returnDate: computeReturnDate(date, update.returnDate),
                                isTraining: false,
                            });
                        }
                    }
                });
            });
        }

        // CPU 게임 출장정지 수집 (LEAGUE_NEWS용)
        if (res.suspensions && res.suspensions.length > 0) {
            for (const s of res.suspensions) {
                suspensions.push({ susp: s, homeTeamId: res.homeTeamId, awayTeamId: res.awayTeamId });
            }
        }

        const gameIdx = schedule.findIndex(g => g.id === res.gameId);
        if (gameIdx !== -1) {
            schedule[gameIdx].played = true;
            schedule[gameIdx].homeScore = res.homeScore;
            schedule[gameIdx].awayScore = res.awayScore;
            if (res.boxScore?.home) (schedule[gameIdx] as any).homeStats = sumTeamBoxScore(res.boxScore.home);
            if (res.boxScore?.away) (schedule[gameIdx] as any).awayStats = sumTeamBoxScore(res.boxScore.away);
        }

        const quarterScores = res.pbpLogs?.length
            ? extractQuarterScores(res.pbpLogs, res.homeTeamId, res.homeScore, res.awayScore)
            : undefined;

        const resultData = userId ? {
            user_id: userId,
            game_id: res.gameId,
            date,
            home_team_id: res.homeTeamId,
            away_team_id: res.awayTeamId,
            home_score: res.homeScore,
            away_score: res.awayScore,
            box_score: res.boxScore,
            tactics: res.tactics,
            rotation_data: res.rotationData,
            shot_events: res.pbpShotEvents,
            is_playoff: res.isPlayoff || false,
            ...(quarterScores && { quarter_scores: quarterScores }),
            ...(season && { season }),
        } : null;

        if (res.isPlayoff && res.seriesId) {
            updateSeriesState(playoffSeries, res.seriesId, res.homeTeamId, res.awayTeamId, res.homeScore, res.awayScore);
            if (resultData) {
                playoff.push({ ...resultData, series_id: res.seriesId, round_number: 0, game_number: 0 });
            }
        } else if (resultData) {
            regular.push(resultData);
        }
    }

    return { regular, playoff, suspensions };
}

/** applyUserGameResult의 순수 로직만 추출 (DB save, sendMessage, Gemini 제거) */
function applyGameResultInPlace(
    result: any,
    userGame: Game,
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[],
    date: string
): void {
    const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
    const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;

    const isPlayoff = !!userGame.isPlayoff;
    updateTeamStats(homeTeam, awayTeam, result.homeScore, result.awayScore, isPlayoff);
    applyBoxToRoster(homeTeam, result.homeBox, isPlayoff);
    applyBoxToRoster(awayTeam, result.awayBox, isPlayoff);

    // 홈 경기 수익 누적 (정규시즌만)
    if (!isPlayoff) {
        getBudgetManager().processHomeGame(homeTeam, awayTeam.id, date);
    }

    // 로스터 업데이트 (체력/부상)
    if (result.rosterUpdates) {
        [homeTeam, awayTeam].forEach(t => {
            t.roster.forEach((p: any) => {
                const update = result.rosterUpdates[p.id];
                if (update) {
                    if (update.condition !== undefined) p.condition = update.condition;
                    if (update.health) {
                        p.health = update.health;
                    }
                    if (update.injuryType) p.injuryType = update.injuryType;
                    if (update.returnDate) p.returnDate = computeReturnDate(date, update.returnDate);
                    // 부상 히스토리 기록
                    if (update.health === 'Injured' && update.injuryType && update.returnDate) {
                        if (!p.injuryHistory) p.injuryHistory = [];
                        const inj = result.injuries?.find((i: any) => i.playerId === p.id);
                        p.injuryHistory.push({
                            injuryType: update.injuryType,
                            severity: inj?.severity || 'Minor',
                            duration: update.returnDate,
                            date,
                            returnDate: computeReturnDate(date, update.returnDate),
                            isTraining: false,
                        });
                    }
                }
            });
        });
    }

    // 스케줄 업데이트
    const idx = schedule.findIndex(g => g.id === userGame.id);
    if (idx !== -1) {
        schedule[idx].played = true;
        schedule[idx].homeScore = result.homeScore;
        schedule[idx].awayScore = result.awayScore;
        (schedule[idx] as any).homeStats = sumTeamBoxScore(result.homeBox);
        (schedule[idx] as any).awayStats = sumTeamBoxScore(result.awayBox);
    }

    // 플레이오프
    if (userGame.isPlayoff && userGame.seriesId) {
        updateSeriesState(playoffSeries, userGame.seriesId, userGame.homeTeamId, userGame.awayTeamId, result.homeScore, result.awayScore);
    }
}

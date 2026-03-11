/**
 * 시즌 전체 시뮬레이션 배치 서비스 (테스트 전용)
 * 엔진 밸런싱 검증을 위해 남은 정규시즌을 한 번에 시뮬레이션.
 */

import { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart } from '../../types';
import { LeagueCoachingData } from '../../types/coaching';
import { SimSettings } from '../../types/simSettings';
import { simulateCpuGames } from '../simulationService';
import { runUserSimulation } from './userGameService';
import { handleSeasonEventsSync } from './seasonService';
import { updateTeamStats, applyBoxToRoster, updateSeriesState, sumTeamBoxScore } from '../../utils/simulationUtils';
import { applyRestDayRecovery } from '../game/engine/fatigueSystem';
import { processGameDevelopment, computeLeagueAverages } from '../playerDevelopment/playerAging';
import { buildScoutReportContent } from '../reportGenerator';

export interface BatchMessagePayload {
    user_id: string;
    team_id: string;
    date: string;
    type: string;
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
    coachingData?: LeagueCoachingData | null
): Promise<BatchSeasonResult> {
    const allGameResultsToSave: any[] = [];
    const allPlayoffResultsToSave: any[] = [];
    const allMessages: BatchMessagePayload[] = [];
    const allTransactions: Transaction[] = [];
    let userGameCount = 0;
    let userWins = 0;

    // 남은 게임데이 목록 생성 (정규시즌만)
    const unplayedDates = getUnplayedGameDates(schedule, myTeamId);
    const total = unplayedDates.length;
    let current = 0;
    let lastDate = unplayedDates[unplayedDates.length - 1] ?? '';

    // 월간 스카우트 보고서 트래킹
    let prevMonthKey = unplayedDates.length > 0
        ? new Date(unplayedDates[0]).getFullYear() * 100 + new Date(unplayedDates[0]).getMonth()
        : -1;

    for (const date of unplayedDates) {
        if (cancelToken.cancelled) {
            lastDate = date;
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

        // 유저 경기 찾기
        const userGame = schedule.find(g =>
            !g.played && g.date === date && !g.isPlayoff &&
            (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
        );

        // 1. CPU 경기 처리 (in-place)
        const cpuPayloads = processCpuGamesInPlace(
            teams, schedule, playoffSeries, date, userGame?.id, userId,
            tendencySeed, simSettings?.growthRate ?? 1.0, simSettings?.declineRate ?? 1.0, simSettings, coachingData
        );
        allGameResultsToSave.push(...cpuPayloads.regular);
        allPlayoffResultsToSave.push(...cpuPayloads.playoff);

        // 2. 유저 경기 또는 휴식
        if (userGame) {
            const result = runUserSimulation(
                userGame, teams, schedule, myTeamId, userTactics, date, depthChart, tendencySeed, simSettings, coachingData
            );

            // 결과 적용 (in-place, DB/메시지 생략)
            applyGameResultInPlace(result, userGame, teams, schedule, playoffSeries);

            // 선수 성장/퇴화
            if (tendencySeed) {
                const homeT = teams.find(t => t.id === userGame.homeTeamId);
                const awayT = teams.find(t => t.id === userGame.awayTeamId);
                if (homeT && awayT) {
                    const gr = simSettings?.growthRate ?? 1.0;
                    const dr = simSettings?.declineRate ?? 1.0;
                    const leagueAvg = computeLeagueAverages(teams);
                    processGameDevelopment(
                        homeT.roster, awayT.roster,
                        result.homeBox, result.awayBox,
                        tendencySeed, gr, dr, leagueAvg, date,
                    );
                }
            }

            // DB 페이로드 누적 (PBP 로그 포함)
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
                is_playoff: false,
            };
            allGameResultsToSave.push(payload);

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
            }
        } else {
            applyRestDayRecovery(teams);
        }

        // 3. 시즌 이벤트 (동기)
        const events = handleSeasonEventsSync(teams, schedule, playoffSeries, date, myTeamId, tendencySeed);
        if (events.newTransactions.length > 0) {
            allTransactions.push(...events.newTransactions);
        }
        if (events.awardContent && userId) {
            allMessages.push({
                user_id: userId,
                team_id: myTeamId,
                date,
                type: 'SEASON_AWARDS',
                title: '[공식] 2025-26 정규시즌 어워드 투표 결과',
                content: events.awardContent,
            });
        }
        if (events.championContent && userId) {
            allMessages.push({
                user_id: userId,
                team_id: myTeamId,
                date,
                type: 'REG_SEASON_CHAMPION',
                title: `[속보] 2025-26 정규시즌 우승: ${events.championContent.championTeamName}`,
                content: events.championContent,
            });
        }

        // 4. 진행 상황 보고 + UI yield
        current++;
        lastDate = date;
        onProgress(current, total, date);
        await new Promise<void>(r => setTimeout(r, 0));
    }

    // 최종 날짜를 하루 뒤로 (기존 파이프라인과 동일)
    const d = new Date(lastDate);
    d.setDate(d.getDate() + 1);
    const finalDate = d.toISOString().split('T')[0];

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
    };
}

// ── 헬퍼 함수들 ──

/** 남은 미플레이 날짜 목록 (정규시즌, 중복 제거, 정렬) */
function getUnplayedGameDates(schedule: Game[], myTeamId: string): string[] {
    const dateSet = new Set<string>();

    // 유저 팀의 남은 정규시즌 마지막 날짜 찾기
    const myUnplayed = schedule.filter(g =>
        !g.played && !g.isPlayoff &&
        (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
    );
    const lastMyGameDate = myUnplayed.length > 0
        ? myUnplayed.sort((a, b) => a.date.localeCompare(b.date))[myUnplayed.length - 1].date
        : '';

    if (!lastMyGameDate) return [];

    // 해당 날짜까지의 모든 미플레이 정규시즌 날짜
    for (const g of schedule) {
        if (!g.played && !g.isPlayoff && g.date <= lastMyGameDate) {
            dateSet.add(g.date);
        }
    }

    // 휴식일도 포함 (유저 첫 미플레이 날짜 ~ 마지막 경기 날짜 사이)
    const sortedDates = Array.from(dateSet).sort();
    if (sortedDates.length === 0) return [];

    const allDates: string[] = [];
    const start = new Date(sortedDates[0]);
    const end = new Date(lastMyGameDate);

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
    coachingData?: LeagueCoachingData | null
): { regular: any[]; playoff: any[] } {
    const results = simulateCpuGames(schedule, teams, date, userGameId, simSettings, coachingData);
    const regular: any[] = [];
    const playoff: any[] = [];

    for (const res of results) {
        const home = teams.find(t => t.id === res.homeTeamId);
        const away = teams.find(t => t.id === res.awayTeamId);
        if (!home || !away) continue;

        const isPlayoff = !!res.isPlayoff;
        updateTeamStats(home, away, res.homeScore, res.awayScore, isPlayoff);
        if (res.boxScore?.home) applyBoxToRoster(home, res.boxScore.home, isPlayoff);
        if (res.boxScore?.away) applyBoxToRoster(away, res.boxScore.away, isPlayoff);

        // 선수 성장/퇴화 (정규시즌만)
        if (tendencySeed && !isPlayoff && res.boxScore?.home && res.boxScore?.away) {
            const leagueAvg = computeLeagueAverages(teams);
            processGameDevelopment(
                home.roster, away.roster,
                res.boxScore.home, res.boxScore.away,
                tendencySeed, growthRate, declineRate, leagueAvg, date,
            );
        }

        const gameIdx = schedule.findIndex(g => g.id === res.gameId);
        if (gameIdx !== -1) {
            schedule[gameIdx].played = true;
            schedule[gameIdx].homeScore = res.homeScore;
            schedule[gameIdx].awayScore = res.awayScore;
            if (res.boxScore?.home) (schedule[gameIdx] as any).homeStats = sumTeamBoxScore(res.boxScore.home);
            if (res.boxScore?.away) (schedule[gameIdx] as any).awayStats = sumTeamBoxScore(res.boxScore.away);
        }

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

    return { regular, playoff };
}

/** applyUserGameResult의 순수 로직만 추출 (DB save, sendMessage, Gemini 제거) */
function applyGameResultInPlace(
    result: any,
    userGame: Game,
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[]
): void {
    const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
    const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;

    const isPlayoff = !!userGame.isPlayoff;
    updateTeamStats(homeTeam, awayTeam, result.homeScore, result.awayScore, isPlayoff);
    applyBoxToRoster(homeTeam, result.homeBox, isPlayoff);
    applyBoxToRoster(awayTeam, result.awayBox, isPlayoff);

    // 로스터 업데이트 (체력/부상)
    if (result.rosterUpdates) {
        [homeTeam, awayTeam].forEach(t => {
            t.roster.forEach((p: any) => {
                const update = result.rosterUpdates[p.id];
                if (update) {
                    if (update.condition !== undefined) p.condition = update.condition;
                    if (update.health) p.health = update.health;
                    if (update.injuryType) p.injuryType = update.injuryType;
                    if (update.returnDate) p.returnDate = update.returnDate;
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

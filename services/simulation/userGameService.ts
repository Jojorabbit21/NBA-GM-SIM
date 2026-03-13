
import { Team, Game, PlayoffSeries, GameTactics, DepthChart, SimulationResult } from '../../types';
import { LeagueCoachingData } from '../../types/coaching';
import { SimSettings } from '../../types/simSettings';
import { simulateGame } from '../gameEngine';
import { updateTeamStats, updateSeriesState, applyBoxToRoster, sumTeamBoxScore } from '../../utils/simulationUtils';
import { saveGameResults } from '../queries';
import { savePlayoffGameResult } from '../playoffService';
import { generateGameRecapNews } from '../geminiService';
import { sendMessage, bulkSendMessages } from '../messageService';
import { processGameDevelopment, computeLeagueAverages } from '../playerDevelopment/playerAging';
import { ROUND_NAMES, CONF_NAMES } from '../../utils/playoffLogic';

/** duration 문자열 → 일수 변환 */
function durationToDays(dur: string): number {
    switch (dur) {
        // 경증
        case '당일 복귀': return 2;
        case '3일': return 3;
        case '1주': return 7;
        // 중증
        case '2주': return 14;
        case '3주': return 21;
        case '1개월': return 30;
        // 시즌아웃
        case '시즌아웃': return 180;
        // 레거시 호환
        case 'Day-to-Day': return 2;
        case '3 Days': return 3;
        case '1 Week': return 7;
        case '2 Weeks': return 14;
        case '1 Month': return 30;
        default: return 7;
    }
}

/** currentDate + duration → 복귀 예정 날짜 (YYYY-MM-DD) */
export function computeReturnDate(currentDate: string, duration: string): string {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + durationToDays(duration));
    return d.toISOString().split('T')[0];
}

export const runUserSimulation = (
    userGame: Game,
    teams: Team[],
    schedule: Game[],
    myTeamId: string,
    userTactics: GameTactics,
    currentSimDate: string,
    depthChart?: DepthChart | null,
    tendencySeed?: string,
    simSettings?: SimSettings,
    coachingData?: LeagueCoachingData | null
): SimulationResult => {
    const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
    const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;
    const isHome = userGame.homeTeamId === myTeamId;

    // Back-to-Back Check
    const checkB2B = (teamId: string) => {
        const yesterday = new Date(currentSimDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];
        return schedule.some(g => g.played && g.date === yStr && (g.homeTeamId === teamId || g.awayTeamId === teamId));
    };

    const isHomeB2B = checkB2B(homeTeam.id);
    const isAwayB2B = checkB2B(awayTeam.id);

    const homeDepth = isHome ? depthChart : undefined;
    const awayDepth = !isHome ? depthChart : undefined;

    return simulateGame(
        homeTeam,
        awayTeam,
        myTeamId,
        userTactics,
        isHomeB2B,
        isAwayB2B,
        homeDepth,
        awayDepth,
        tendencySeed,
        simSettings,
        coachingData
    );
};

export const applyUserGameResult = async (
    result: SimulationResult,
    userGame: Game,
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[],
    currentSimDate: string,
    userId: string | undefined,
    myTeamId: string,
    userTactics: GameTactics,
    isGuestMode: boolean,
    refreshUnreadCount: () => void,
    tendencySeed?: string,
    simSettings?: SimSettings,
) => {
    const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
    const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;
    const isHome = userGame.homeTeamId === myTeamId;

    // 1. Update Stats (team wins/losses + player season stats)
    const isPlayoff = !!userGame.isPlayoff;
    updateTeamStats(homeTeam, awayTeam, result.homeScore, result.awayScore, isPlayoff);
    applyBoxToRoster(homeTeam, result.homeBox, isPlayoff);
    applyBoxToRoster(awayTeam, result.awayBox, isPlayoff);

    // 1.5. 선수 성장/퇴화 (정규시즌만)
    if (tendencySeed && !isPlayoff) {
        const growthRate = simSettings?.growthRate ?? 1.0;
        const declineRate = simSettings?.declineRate ?? 1.0;
        const leagueAvg = computeLeagueAverages(teams);
        processGameDevelopment(
            homeTeam.roster, awayTeam.roster,
            result.homeBox, result.awayBox,
            tendencySeed, growthRate, declineRate, leagueAvg, currentSimDate,
        );
    }

    // 2. Update Roster (Fatigue/Injury)
    if (result.rosterUpdates) {
        [homeTeam, awayTeam].forEach(t => {
            t.roster.forEach(p => {
                const update = result.rosterUpdates[p.id];
                if (update) {
                    if (update.condition !== undefined) p.condition = update.condition;
                    if (update.health) p.health = update.health;
                    if (update.injuryType) p.injuryType = update.injuryType;
                    // duration 문자열 → 실제 복귀 날짜로 변환
                    if (update.returnDate) p.returnDate = computeReturnDate(currentSimDate, update.returnDate);
                    // 부상 히스토리 기록
                    if (update.health === 'Injured' && update.injuryType && update.returnDate) {
                        if (!p.injuryHistory) p.injuryHistory = [];
                        const inj = result.injuries?.find((i: any) => i.playerId === p.id);
                        p.injuryHistory.push({
                            injuryType: update.injuryType,
                            severity: inj?.severity || 'Minor',
                            duration: update.returnDate,
                            date: currentSimDate,
                            returnDate: computeReturnDate(currentSimDate, update.returnDate),
                            isTraining: false,
                        });
                    }
                }
            });
        });
    }

    // 3. Update Schedule
    const uGameIdx = schedule.findIndex(g => g.id === userGame.id);
    if (uGameIdx !== -1) {
        schedule[uGameIdx].played = true;
        schedule[uGameIdx].homeScore = result.homeScore;
        schedule[uGameIdx].awayScore = result.awayScore;
        (schedule[uGameIdx] as any).homeStats = sumTeamBoxScore(result.homeBox);
        (schedule[uGameIdx] as any).awayStats = sumTeamBoxScore(result.awayBox);
    }

    // 4. Update Playoffs
    if (userGame.isPlayoff && userGame.seriesId) {
        updateSeriesState(playoffSeries, userGame.seriesId, userGame.homeTeamId, userGame.awayTeamId, result.homeScore, result.awayScore);
    }

    // 5. DB Save & Messages
    const resultPayload = {
        user_id: userId || 'guest',
        game_id: userGame.id,
        date: currentSimDate,
        home_team_id: homeTeam.id,
        away_team_id: awayTeam.id,
        home_score: result.homeScore,
        away_score: result.awayScore,
        box_score: { home: result.homeBox, away: result.awayBox },
        tactics: { home: result.homeTactics, away: result.awayTactics },
        pbp_logs: result.pbpLogs,
        shot_events: result.pbpShotEvents,
        is_playoff: userGame.isPlayoff || false,
        series_id: userGame.seriesId,
        rotation_data: result.rotationData
    };

    if (!isGuestMode) {
        if (userGame.isPlayoff) {
            await savePlayoffGameResult(resultPayload as any);
        } else {
            await saveGameResults([resultPayload]);
        }
    }

    if (userId) {
        const recapNews = await generateGameRecapNews({
            home: homeTeam, away: awayTeam,
            homeScore: result.homeScore, awayScore: result.awayScore,
            homeBox: result.homeBox, awayBox: result.awayBox,
            userTactics, myTeamId
        });

        // 플레이오프 시리즈 정보 조회
        let playoffInfo: any = undefined;
        if (userGame.isPlayoff && userGame.seriesId) {
            const series = playoffSeries.find(s => s.id === userGame.seriesId);
            if (series) {
                const higherTeam = teams.find(t => t.id === series.higherSeedId);
                const lowerTeam = teams.find(t => t.id === series.lowerSeedId);
                const confPrefix = series.round < 4 && series.conference !== 'BPL'
                    ? (CONF_NAMES[series.conference] || series.conference) + ' '
                    : '';
                playoffInfo = {
                    conference: CONF_NAMES[series.conference] || series.conference,
                    roundName: confPrefix + (ROUND_NAMES[series.round] || `${series.round}라운드`),
                    higherSeedId: series.higherSeedId,
                    lowerSeedId: series.lowerSeedId,
                    higherSeedName: higherTeam?.name || '',
                    lowerSeedName: lowerTeam?.name || '',
                    higherSeedWins: series.higherSeedWins,
                    lowerSeedWins: series.lowerSeedWins,
                };
            }
        }

        // 메시지 배치 수집 후 한번에 전송
        const messageBatch: { user_id: string; team_id: string; date: string; type: any; title: string; content: any }[] = [];

        messageBatch.push({
            user_id: userId,
            team_id: myTeamId,
            date: currentSimDate,
            type: 'GAME_RECAP',
            title: `[경기 결과] vs ${isHome ? awayTeam.name : homeTeam.name}`,
            content: {
                gameId: userGame.id,
                homeTeamId: homeTeam.id,
                awayTeamId: awayTeam.id,
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                userBoxScore: isHome ? result.homeBox : result.awayBox,
                recap: recapNews,
                playoffInfo,
            },
        });

        // 유저 팀 선수 부상 보고서 발송
        if (result.injuries && result.injuries.length > 0) {
            const myInjuries = result.injuries.filter(inj => inj.teamId === myTeamId);
            for (const inj of myInjuries) {
                const returnDateStr = computeReturnDate(currentSimDate, inj.durationDesc);
                messageBatch.push({
                    user_id: userId, team_id: myTeamId, date: currentSimDate, type: 'INJURY_REPORT',
                    title: `[부상 보고] ${inj.playerName} — ${inj.injuryType}`,
                    content: {
                        playerId: inj.playerId,
                        playerName: inj.playerName,
                        injuryType: inj.injuryType,
                        severity: inj.severity,
                        duration: inj.durationDesc,
                        returnDate: returnDateStr,
                        isRecovery: false,
                    },
                });
            }
        }

        // 유저 팀 선수 출장정지 보고서 (싸움)
        if (result.suspensions && result.suspensions.length > 0) {
            for (const susp of result.suspensions) {
                const isMyFighter = susp.teamId === myTeamId;
                const isMyOpponent = susp.opponentTeamId === myTeamId;
                if (isMyFighter || isMyOpponent) {
                    const myPlayerId = isMyFighter ? susp.playerId : susp.opponentPlayerId;
                    const myPlayerName = isMyFighter ? susp.playerName : susp.opponentPlayerName;
                    const mySusp = isMyFighter ? susp.suspensionGames : susp.opponentSuspensionGames;
                    const oppTeamId = isMyFighter ? susp.opponentTeamId : susp.teamId;
                    const oppName = isMyFighter ? susp.opponentPlayerName : susp.playerName;
                    const oppTeam = [homeTeam, awayTeam].find(t => t.id === oppTeamId);
                    const returnDate = computeReturnDate(currentSimDate, `${mySusp * 2}일`);

                    messageBatch.push({
                        user_id: userId, team_id: myTeamId, date: currentSimDate, type: 'SUSPENSION',
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

        await bulkSendMessages(messageBatch);

        refreshUnreadCount();
    }

    return {
        home: homeTeam,
        away: awayTeam
    };
};

/** 부상 복귀 체크: returnDate <= currentDate인 선수를 회복시키고, 복귀 보고서용 데이터를 반환 */
export function processInjuryRecovery(
    teams: Team[],
    currentDate: string,
    myTeamId: string,
): { playerId: string; playerName: string; injuryType: string }[] {
    const recovered: { playerId: string; playerName: string; injuryType: string }[] = [];
    for (const team of teams) {
        if (team.id !== myTeamId) {
            // CPU 팀도 회복은 시키되 메시지는 유저 팀만
            for (const p of team.roster) {
                if (p.health === 'Injured' && p.returnDate && p.returnDate <= currentDate) {
                    p.health = 'Healthy';
                    p.injuryType = undefined;
                    p.returnDate = undefined;
                }
            }
            continue;
        }
        for (const p of team.roster) {
            if (p.health === 'Injured' && p.returnDate && p.returnDate <= currentDate) {
                recovered.push({
                    playerId: p.id,
                    playerName: p.name,
                    injuryType: p.injuryType || 'Unknown',
                });
                p.health = 'Healthy';
                p.injuryType = undefined;
                p.returnDate = undefined;
            }
        }
    }
    return recovered;
}

/**
 * 수상 기록을 선수 객체에 직접 stamp하는 유틸리티.
 * 어워드 투표 결과를 Player.awards 배열에 기록한다.
 */

import { Team } from '../types';
import { PlayerAwardType, PlayerAwardEntry } from '../types/player';
import { SeasonAwardsContent } from './awardVoting';

/** 선수에 award push (없으면 초기화, 중복 방지) */
function pushAward(player: { awards?: PlayerAwardEntry[] }, type: PlayerAwardType, season: string, teamId: string) {
    if (!player.awards) player.awards = [];
    if (player.awards.some(a => a.type === type && a.season === season)) return;
    player.awards.push({ type, season, teamId });
}

/** 팀 로스터 전체에서 playerId → Player 맵 생성 */
function buildPlayerMap(teams: Team[]) {
    const map = new Map<string, { awards?: PlayerAwardEntry[] }>();
    for (const team of teams) {
        for (const player of team.roster) {
            map.set(player.id, player);
        }
    }
    return map;
}

/**
 * 정규시즌 어워드(MVP, DPOY, All-NBA, All-Def)를 선수에 stamp.
 */
export function stampSeasonAwards(teams: Team[], awardContent: SeasonAwardsContent, season: string): void {
    const map = buildPlayerMap(teams);

    // MVP
    if (awardContent.mvpRanking.length > 0) {
        const mvp = awardContent.mvpRanking[0];
        const p = map.get(mvp.playerId);
        if (p) pushAward(p, 'MVP', season, mvp.teamId);
    }

    // DPOY
    if (awardContent.dpoyRanking.length > 0) {
        const dpoy = awardContent.dpoyRanking[0];
        const p = map.get(dpoy.playerId);
        if (p) pushAward(p, 'DPOY', season, dpoy.teamId);
    }

    // All-NBA (tier 1/2/3)
    const allNbaTypeMap: Record<number, PlayerAwardType> = { 1: 'ALL_NBA_1', 2: 'ALL_NBA_2', 3: 'ALL_NBA_3' };
    for (const entry of awardContent.allNbaTeams) {
        const awardType = allNbaTypeMap[entry.tier];
        if (!awardType) continue;
        for (const ap of entry.players) {
            const p = map.get(ap.playerId);
            if (p) pushAward(p, awardType, season, ap.teamId);
        }
    }

    // All-Defensive (tier 1/2)
    const allDefTypeMap: Record<number, PlayerAwardType> = { 1: 'ALL_DEF_1', 2: 'ALL_DEF_2' };
    for (const entry of awardContent.allDefTeams) {
        const awardType = allDefTypeMap[entry.tier];
        if (!awardType) continue;
        for (const ap of entry.players) {
            const p = map.get(ap.playerId);
            if (p) pushAward(p, awardType, season, ap.teamId);
        }
    }
}

/**
 * 정규시즌 우승팀 전원에 stamp.
 */
export function stampRegSeasonChampion(teams: Team[], season: string, championTeamId: string): void {
    const champTeam = teams.find(t => t.id === championTeamId);
    if (champTeam) {
        for (const player of champTeam.roster) {
            pushAward(player, 'REG_SEASON_CHAMPION', season, championTeamId);
        }
    }
}

/**
 * 챔피언 + 파이널 MVP를 선수에 stamp.
 */
export function stampPlayoffAwards(
    teams: Team[],
    season: string,
    championTeamId: string,
    finalsMvpPlayerId?: string,
): void {
    const map = buildPlayerMap(teams);

    // Champion — 해당 팀 전원
    const champTeam = teams.find(t => t.id === championTeamId);
    if (champTeam) {
        for (const player of champTeam.roster) {
            pushAward(player, 'CHAMPION', season, championTeamId);
        }
    }

    // Finals MVP
    if (finalsMvpPlayerId) {
        const p = map.get(finalsMvpPlayerId);
        if (p) pushAward(p, 'FINALS_MVP', season, championTeamId);
    }
}


import { Team, Game, PlayoffSeries } from '../types';
import { createTiebreakerComparator } from './tiebreaker';

export const PLAYOFF_ROUNDS = {
    PLAY_IN: 0,
    ROUND_1: 1,
    SEMIS: 2,
    CONF_FINALS: 3,
    FINALS: 4
};

// Play-In Seed Configs
const SEED_MATCHUPS_PI = [
    { h: 7, l: 8, id: '7v8' },
    { h: 9, l: 10, id: '9v10' }
];

// Round 1 Fixed Matchups (1v8, 2v7, 3v6, 4v5)
// Matchup IDs are crucial for tree progression
const R1_MAPPINGS = [
    { id: 'M1', h: 1, l: 8, next: 'S1', slot: 'h' }, // Winner goes to Semis 1 (High Seed Slot)
    { id: 'M2', h: 4, l: 5, next: 'S1', slot: 'l' }, // Winner goes to Semis 1 (Low Seed Slot)
    { id: 'M3', h: 3, l: 6, next: 'S2', slot: 'h' }, // Winner goes to Semis 2
    { id: 'M4', h: 2, l: 7, next: 'S2', slot: 'l' }  // Winner goes to Semis 2
];

/**
 * Initializes the Post-Season.
 */
export function checkAndInitPlayoffs(teams: Team[], schedule: Game[], currentSeries: PlayoffSeries[], currentDate: string): PlayoffSeries[] {
    // 0. Integrity Check
    if (!teams || teams.length < 30 || !schedule || schedule.length === 0) return currentSeries;

    // 1. Check if Regular Season is done
    const regularSeasonGames = schedule.filter(g => !g.isPlayoff);
    const unplayedRegular = regularSeasonGames.filter(g => !g.played);

    if (unplayedRegular.length > 0 || currentSeries.length > 0) return currentSeries;

    console.log("🏆 Regular Season Complete. Initializing Post-Season...");

    // 2. Rank Teams (with tiebreakers: PCT → H2H → Conf Record → Diff)
    const comparator = createTiebreakerComparator(teams, schedule);
    const getRanked = (conf: 'East' | 'West') =>
        teams.filter(t => t.conference === conf).sort(comparator);

    const eastRanked = getRanked('East');
    const westRanked = getRanked('West');

    // 3. Generate Play-In Bracket (Round 0)
    const newSeries: PlayoffSeries[] = [];

    const createPlayIn = (conf: 'East' | 'West', rankedTeams: Team[]) => {
        newSeries.push({
            id: `${conf}_PI_7v8`,
            round: 0,
            conference: conf,
            higherSeedId: rankedTeams[6].id,
            lowerSeedId: rankedTeams[7].id,
            higherSeedWins: 0,
            lowerSeedWins: 0,
            finished: false,
            targetWins: 1
        });
        newSeries.push({
            id: `${conf}_PI_9v10`,
            round: 0,
            conference: conf,
            higherSeedId: rankedTeams[8].id,
            lowerSeedId: rankedTeams[9].id,
            higherSeedWins: 0,
            lowerSeedWins: 0,
            finished: false,
            targetWins: 1
        });
        newSeries.push({
            id: `${conf}_PI_8th_Decider`,
            round: 0,
            conference: conf,
            higherSeedId: 'TBD_7v8_LOSER', 
            lowerSeedId: 'TBD_9v10_WINNER',
            higherSeedWins: 0,
            lowerSeedWins: 0,
            finished: false,
            targetWins: 1
        });
    };

    createPlayIn('East', eastRanked);
    createPlayIn('West', westRanked);

    return newSeries;
}

/**
 * Evaluates game results and advances the bracket state.
 * Handles Play-In -> R1 -> Semis -> Conf Finals -> Finals progression.
 */
export function advancePlayoffState(seriesList: PlayoffSeries[], teams: Team[], schedule: Game[]): PlayoffSeries[] {
    let updated = [...seriesList];
    let changed = false;

    // --- Phase 1: Play-In Advancement ---
    ['East', 'West'].forEach(conf => {
        const pi7v8 = updated.find(s => s.id === `${conf}_PI_7v8`);
        const pi9v10 = updated.find(s => s.id === `${conf}_PI_9v10`);
        const piDecider = updated.find(s => s.id === `${conf}_PI_8th_Decider`);

        if (pi7v8?.finished && piDecider?.higherSeedId === 'TBD_7v8_LOSER') {
            const loserId = pi7v8.winnerId === pi7v8.higherSeedId ? pi7v8.lowerSeedId : pi7v8.higherSeedId;
            piDecider.higherSeedId = loserId;
            changed = true;
        }

        if (pi9v10?.finished && piDecider?.lowerSeedId === 'TBD_9v10_WINNER') {
            piDecider.lowerSeedId = pi9v10.winnerId!;
            changed = true;
        }
    });

    // --- Phase 2: Start Round 1 (If Play-In Done) ---
    const playInGames = updated.filter(s => s.round === 0);
    const round1Games = updated.filter(s => s.round === 1);
    
    if (playInGames.length > 0 && playInGames.every(s => s.finished) && round1Games.length === 0) {
        // Generate Round 1
        const getSeeded = (conf: 'East' | 'West') => {
            const comparator = createTiebreakerComparator(teams, schedule);
            const ranked = teams.filter(t => t.conference === conf).sort(comparator);
            
            const pi7v8 = updated.find(s => s.id === `${conf}_PI_7v8`);
            const piDecider = updated.find(s => s.id === `${conf}_PI_8th_Decider`);
            
            // Safety check: if play-in logic failed, fallback to rank
            const seed7 = teams.find(t => t.id === pi7v8?.winnerId) || ranked[6];
            const seed8 = teams.find(t => t.id === piDecider?.winnerId) || ranked[7];
            
            return [...ranked.slice(0, 6), seed7, seed8];
        };

        const eastSeeds = getSeeded('East');
        const westSeeds = getSeeded('West');

        const createR1 = (conf: 'East' | 'West', seeds: Team[]) => {
            R1_MAPPINGS.forEach((m) => {
                updated.push({
                    id: `${conf}_R1_${m.id}`,
                    round: 1,
                    conference: conf as any,
                    higherSeedId: seeds[m.h - 1].id,
                    lowerSeedId: seeds[m.l - 1].id,
                    higherSeedWins: 0,
                    lowerSeedWins: 0,
                    finished: false,
                    targetWins: 4
                });
            });
        };

        createR1('East', eastSeeds);
        createR1('West', westSeeds);
        changed = true;
    }

    // --- Phase 3: Recursive Tree Advancement (R1 -> Semis -> Conf -> Finals) ---
    // Helper to find or create next round series
    const ensureNextSeries = (id: string, round: number, conf: 'East'|'West'|'BPL', highId: string, lowId: string) => {
        let s = updated.find(x => x.id === id);
        if (!s) {
            s = {
                id, round: round as any, conference: conf,
                higherSeedId: highId || 'TBD', lowerSeedId: lowId || 'TBD',
                higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 4
            };
            updated.push(s);
            changed = true;
        }
        return s;
    };

    // 3a. Advance R1 to Semis
    ['East', 'West'].forEach(conf => {
        const r1s = updated.filter(s => s.round === 1 && s.conference === conf);
        if (r1s.length === 0) return;

        // Semis 1 (Winner of M1 vs Winner of M2)
        const m1 = r1s.find(s => s.id.includes('M1'));
        const m2 = r1s.find(s => s.id.includes('M2'));
        const s1 = ensureNextSeries(`${conf}_SEMIS_S1`, 2, conf as any, m1?.winnerId || 'TBD', m2?.winnerId || 'TBD');
        
        if (m1?.winnerId && s1.higherSeedId === 'TBD') { s1.higherSeedId = m1.winnerId; changed = true; }
        if (m2?.winnerId && s1.lowerSeedId === 'TBD') { s1.lowerSeedId = m2.winnerId; changed = true; }

        // Semis 2 (Winner of M3 vs Winner of M4)
        const m3 = r1s.find(s => s.id.includes('M3'));
        const m4 = r1s.find(s => s.id.includes('M4'));
        const s2 = ensureNextSeries(`${conf}_SEMIS_S2`, 2, conf as any, m3?.winnerId || 'TBD', m4?.winnerId || 'TBD');

        if (m3?.winnerId && s2.higherSeedId === 'TBD') { s2.higherSeedId = m3.winnerId; changed = true; }
        if (m4?.winnerId && s2.lowerSeedId === 'TBD') { s2.lowerSeedId = m4.winnerId; changed = true; }
    });

    // 3b. Advance Semis to Conf Finals
    ['East', 'West'].forEach(conf => {
        const semis = updated.filter(s => s.round === 2 && s.conference === conf);
        if (semis.length === 0) return;

        const s1 = semis.find(s => s.id.includes('S1'));
        const s2 = semis.find(s => s.id.includes('S2'));
        const cf = ensureNextSeries(`${conf}_FINALS`, 3, conf as any, s1?.winnerId || 'TBD', s2?.winnerId || 'TBD');

        if (s1?.winnerId && cf.higherSeedId === 'TBD') { cf.higherSeedId = s1.winnerId; changed = true; }
        if (s2?.winnerId && cf.lowerSeedId === 'TBD') { cf.lowerSeedId = s2.winnerId; changed = true; }
    });

    // 3c. Advance Conf Finals to BPL Finals
    const eastCF = updated.find(s => s.round === 3 && s.conference === 'East');
    const westCF = updated.find(s => s.round === 3 && s.conference === 'West');

    if (eastCF && westCF) {
        const finals = ensureNextSeries(`BPL_FINALS`, 4, 'BPL', eastCF?.winnerId || 'TBD', westCF?.winnerId || 'TBD');
        if (eastCF?.winnerId && finals.higherSeedId === 'TBD') { finals.higherSeedId = eastCF.winnerId; changed = true; }
        if (westCF?.winnerId && finals.lowerSeedId === 'TBD') { finals.lowerSeedId = westCF.winnerId; changed = true; }
    }

    return changed ? updated : seriesList;
}

/**
 * Generates schedule for active series.
 * - Play-In (round 0): 1경기 생성
 * - Best-of-7 (round 1+): 라운드 시작 시 1~4차전 일괄 생성, 5~7차전은 격일로 1경기씩
 */
export function generateNextPlayoffGames(schedule: Game[], seriesList: PlayoffSeries[], currentDate: string): { newGames: Game[], updatedSeries: PlayoffSeries[] } {
    const newGames: Game[] = [];
    const updatedSeries = [...seriesList];

    if (!seriesList || seriesList.length === 0) return { newGames, updatedSeries };

    const simDateObj = new Date(currentDate);

    updatedSeries.forEach(series => {
        if (series.finished || series.higherSeedId.includes('TBD') || series.lowerSeedId.includes('TBD')) return;

        // 이 시리즈의 기존 경기(played + unplayed) 수집
        const seriesGames = schedule
            .filter(g => g.seriesId === series.id)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const existingGameNums = new Set<number>();
        seriesGames.forEach(g => {
            const match = g.id.match(/_g(\d+)$/);
            if (match) existingGameNums.add(parseInt(match[1], 10));
        });

        // 생성할 경기 번호 결정
        let gameNumsToCreate: number[] = [];

        if (series.round === 0) {
            // Play-In: 1경기만
            if (!existingGameNums.has(1)) gameNumsToCreate = [1];
        } else {
            // Best-of-7
            if (existingGameNums.size === 0) {
                // 라운드 시작: 1~4차전 일괄 생성
                gameNumsToCreate = [1, 2, 3, 4];
            } else {
                // 5~7차전: 이전 경기 완료 후 1경기씩 추가
                const totalPlayed = series.higherSeedWins + series.lowerSeedWins;
                const nextGameNum = totalPlayed + 1;
                if (nextGameNum > 4 && nextGameNum <= 7 && !existingGameNums.has(nextGameNum)) {
                    gameNumsToCreate = [nextGameNum];
                }
            }
        }

        if (gameNumsToCreate.length === 0) return;

        // 날짜 앵커: 마지막 기존 경기 날짜 또는 currentDate
        let anchor = seriesGames.length > 0
            ? new Date(seriesGames[seriesGames.length - 1].date)
            : new Date(currentDate);

        for (const gameNum of gameNumsToCreate) {
            if (existingGameNums.has(gameNum)) continue;

            const nextDate = new Date(anchor);
            nextDate.setDate(nextDate.getDate() + 2);

            // 새 시리즈 첫 경기가 과거 날짜가 되지 않도록
            if (seriesGames.length === 0 && newGames.filter(g => g.seriesId === series.id).length === 0) {
                if (nextDate <= simDateObj) nextDate.setDate(simDateObj.getDate() + 1);
            }

            const isHigherHome = series.round === 0 ? true : [1, 2, 5, 7].includes(gameNum);
            const homeTeamId = isHigherHome ? series.higherSeedId : series.lowerSeedId;
            const awayTeamId = isHigherHome ? series.lowerSeedId : series.higherSeedId;

            newGames.push({
                id: `po_${series.id}_g${gameNum}`,
                homeTeamId,
                awayTeamId,
                date: nextDate.toISOString().split('T')[0],
                played: false,
                isPlayoff: true,
                seriesId: series.id
            });

            anchor = nextDate;
        }
    });

    return { newGames, updatedSeries };
}

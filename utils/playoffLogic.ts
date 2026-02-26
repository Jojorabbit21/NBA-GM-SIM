
import { Team, Game, PlayoffSeries } from '../types';

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

    // 2. Rank Teams
    const getRanked = (conf: 'East' | 'West') => 
        teams.filter(t => t.conference === conf)
             .sort((a, b) => (b.wins / (b.wins + b.losses || 1)) - (a.wins / (a.wins + a.losses || 1)));

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
export function advancePlayoffState(seriesList: PlayoffSeries[], teams: Team[]): PlayoffSeries[] {
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
            const ranked = teams.filter(t => t.conference === conf)
                .sort((a, b) => (b.wins / (b.wins + b.losses || 1)) - (a.wins / (a.wins + a.losses || 1)));
            
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

    if (eastCF || westCF) {
        const finals = ensureNextSeries(`BPL_FINALS`, 4, 'BPL', eastCF?.winnerId || 'TBD', westCF?.winnerId || 'TBD');
        if (eastCF?.winnerId && finals.higherSeedId === 'TBD') { finals.higherSeedId = eastCF.winnerId; changed = true; }
        if (westCF?.winnerId && finals.lowerSeedId === 'TBD') { finals.lowerSeedId = westCF.winnerId; changed = true; }
    }

    return changed ? updated : seriesList;
}

/**
 * Generates schedule for active series.
 */
export function generateNextPlayoffGames(schedule: Game[], seriesList: PlayoffSeries[], currentDate: string): { newGames: Game[], updatedSeries: PlayoffSeries[] } {
    const newGames: Game[] = [];
    const updatedSeries = [...seriesList];
    
    if (!seriesList || seriesList.length === 0) return { newGames, updatedSeries };

    // 1. Advance the bracket state first (check for round completions)
    // Note: We need 'teams' for R1 seeding, but assuming 'advancePlayoffState' handles logic with existing data if teams param is empty/optional in future. 
    // Ideally, pass teams. For now, rely on existing TBD resolution.
    // *Correction*: advancePlayoffState needs teams for R1 generation. 
    // In useSimulation, we pass the teams. Here we assume seriesList is somewhat up to date or we skip R1 gen if teams missing.
    
    // Iterate active series to schedule next game
    updatedSeries.forEach(series => {
        // Skip if finished or teams not ready
        if (series.finished || series.higherSeedId.includes('TBD') || series.lowerSeedId.includes('TBD')) return;

        // Check if active game exists for this series
        const activeGame = schedule.find(g => g.seriesId === series.id && !g.played);
        
        if (!activeGame) {
            const gameNum = series.higherSeedWins + series.lowerSeedWins + 1;
            
            // Format: 2-2-1-1-1 (Home court for Higher Seed: 1,2,5,7)
            const isHigherHome = [1, 2, 5, 7].includes(gameNum);
            
            // Play-In is always Home for Higher Seed
            const finalHome = series.round === 0 ? series.higherSeedId : (isHigherHome ? series.higherSeedId : series.lowerSeedId);
            const finalAway = series.round === 0 ? series.lowerSeedId : (isHigherHome ? series.lowerSeedId : series.higherSeedId);

            // Scheduling Logic
            // Play-In: Day 1 (7v8, 9v10), Day 3 (Decider)
            // Playoffs: Every 2 days
            let dateOffset = 2;
            if (series.round === 0 && series.id.includes('Decider')) dateOffset = 2; 
            
            const seriesGames = schedule.filter(g => g.seriesId === series.id).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const lastGameDate = seriesGames.length > 0 ? new Date(seriesGames[seriesGames.length - 1].date) : new Date(currentDate);
            
            const nextDate = new Date(lastGameDate);
            nextDate.setDate(nextDate.getDate() + dateOffset);
            
            // Sync with current simulation date (ensure we don't schedule in past)
            const simDateObj = new Date(currentDate);
            if (nextDate <= simDateObj) nextDate.setDate(simDateObj.getDate() + 1);

            const nextDateStr = nextDate.toISOString().split('T')[0];

            newGames.push({
                id: `po_${series.id}_g${gameNum}`,
                homeTeamId: finalHome,
                awayTeamId: finalAway,
                date: nextDateStr,
                played: false,
                isPlayoff: true,
                seriesId: series.id
            });
        }
    });

    return { newGames, updatedSeries };
}

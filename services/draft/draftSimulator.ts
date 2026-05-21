import { supabase } from '../supabaseClient';
import { mapPlayersToTeams, mapRawPlayerToRuntimePlayer } from '../dataMapper';
import { populateTeamData, TEAM_DATA } from '../../data/teamData';
import { generateDraftClass } from './rookieGenerator';
import { fetchPredefinedDraftClass } from '../queries';
import { generateLeagueGMProfiles } from '../tradeEngine/gmProfiler';
import { pickRookieForCPU } from './cpuDraftEngine';
import { calculatePlayerOvr } from '../../utils/constants';
import type { Team, Player } from '../../types';
import type { GMPersonalityType } from '../../types/gm';

export interface DraftSimOptions {
    seed: string;
    iterations: number;
    seasonNumber?: number;
    pickOrder?: string[]; // team IDs for round 1 pick order; default = alphabetical
}

export async function runDraftSimulations(
    options: DraftSimOptions,
    onLog: (line: string) => void,
): Promise<void> {
    const { seed, iterations, seasonNumber = 1, pickOrder } = options;

    onLog(`$ runDraftSimulation(seed=${seed}, iterations=${iterations})`);
    onLog('Loading data...');

    // 1. Fetch teams and players from Supabase
    const [teamsRes, playersRes] = await Promise.all([
        supabase.from('meta_teams').select('*'),
        supabase.from('meta_players').select('*').or('draft_year.is.null,draft_year.neq.2026,include_alltime.eq.true'),
    ]);

    if (teamsRes.data && teamsRes.data.length > 0) {
        populateTeamData(teamsRes.data);
    }

    let teams: Team[] = [];
    if (!playersRes.error && playersRes.data && playersRes.data.length > 0) {
        teams = mapPlayersToTeams(playersRes.data);
    } else {
        // Fallback: build empty-roster mock teams from TEAM_DATA
        teams = Object.values(TEAM_DATA).map(td => ({
            id: td.id,
            name: td.name,
            city: td.city,
            logo: '',
            conference: td.conference,
            division: td.division,
            wins: 0,
            losses: 0,
            budget: 0,
            salaryCap: 0,
            luxuryTaxLine: 0,
            roster: [],
        }));
    }

    if (teams.length === 0) {
        onLog('Error: no teams loaded.');
        return;
    }

    const teamIds = pickOrder ?? teams.map(t => t.id).sort();
    const teamMap = new Map(teams.map(t => [t.id, t]));

    // 2. GM profiles
    const gmProfiles = generateLeagueGMProfiles(teamIds, seed);

    onLog(`Loaded ${teams.length} teams. Generating draft class...`);

    // 3. Load 2026 predefined draft class from meta_players; fallback to generated class
    onLog('Loading 2026 draft class from DB...');
    const predefinedRows = await fetchPredefinedDraftClass('2026');
    const predefinedClass: Player[] = predefinedRows.length > 0
        ? predefinedRows.map((r: any) => mapRawPlayerToRuntimePlayer({ id: String(r.id), base_attributes: r.base_attributes }))
        : [];
    if (predefinedClass.length > 0) {
        onLog(`Loaded ${predefinedClass.length} players from meta_players (draft_year=2026)`);
    } else {
        onLog('No predefined class found — will use generated class per iteration');
    }

    for (let iter = 1; iter <= iterations; iter++) {
        const iterSeed = iterations > 1 ? `${seed}_iter${iter}` : seed;
        // Use predefined 2026 class if available; otherwise generate per-iteration
        const draftClass: Player[] = predefinedClass.length > 0
            ? predefinedClass
            : generateDraftClass('admin-sim', seasonNumber, iterSeed, 60).map(row => mapRawPlayerToRuntimePlayer(row));

        // Draft order: R1 (1-30) same order, R2 (31-60) same order again
        const fullOrder = [...teamIds, ...teamIds];

        onLog('');
        onLog(`=== Iteration #${iter} (seed=${iterSeed}) ${'='.repeat(40 - iterSeed.length)}`);
        onLog(pad('Pick', 5) + pad('Team', 16) + pad('Personality', 18) + pad('Player', 22) + pad('POS', 5) + pad('POT', 5) + pad('OVR', 5) + pad('Score', 7) + 'Reason');
        onLog('-'.repeat(85));

        const pickedIds = new Set<string>();
        const statsByPersonality: Record<string, number[]> = {};

        for (let idx = 0; idx < fullOrder.length; idx++) {
            const teamId = fullOrder[idx];
            const team = teamMap.get(teamId);
            if (!team) continue;

            const available = draftClass.filter(p => !pickedIds.has(p.id));
            if (available.length === 0) break;

            const round = (Math.floor(idx / teamIds.length) + 1) as 1 | 2;
            const gmProfile = gmProfiles[teamId];
            const decision = pickRookieForCPU(
                team,
                available,
                gmProfile,
                { pickNumber: idx + 1, round },
                iterSeed,
            );

            const { player, score, reason } = decision;
            pickedIds.add(player.id);

            const personality: GMPersonalityType = gmProfile?.personalityType ?? 'balanced';
            if (!statsByPersonality[personality]) statsByPersonality[personality] = [];
            statsByPersonality[personality].push(player.potential);

            const teamLabel = TEAM_DATA[teamId]?.name ?? teamId;
            onLog(
                pad(String(idx + 1), 5) +
                pad(teamLabel, 16) +
                pad(personality, 18) +
                pad(player.name, 22) +
                pad(player.position, 5) +
                pad(String(player.potential), 5) +
                pad(String(calculatePlayerOvr(player)), 5) +
                pad(score.toFixed(2), 7) +
                reason
            );
        }

        onLog('');
        onLog(`--- Stats (Iteration #${iter}) ${'─'.repeat(40)}`);
        onLog('성격별 평균 픽 POT:');
        for (const [personality, pots] of Object.entries(statsByPersonality)) {
            const avg = pots.reduce((a, b) => a + b, 0) / pots.length;
            onLog(`  ${personality.padEnd(18)} ${avg.toFixed(1)}`);
        }
    }

    onLog('');
    onLog('완료');
    onLog('$');
}

function pad(str: string, width: number): string {
    return str.length >= width ? str.slice(0, width) : str + ' '.repeat(width - str.length);
}

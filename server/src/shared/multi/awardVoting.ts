/**
 * awardVoting.ts — 서버 미러.
 * 원본: utils/awardVoting.ts. 스코어링 공식/가중치를 바꿀 땐 반드시 양쪽 다 같이 고칠 것
 * (client/server 미러 쌍 — dev-log.md 기록 대상).
 *
 * 원본과의 유일한 차이: calculatePlayerOvr(utils/constants.ts, 클라 전용) 대신 서버에
 * 이미 이식되어 있는 calculateOvr(ovrUtils.ts)를 사용. 스코어링 로직 자체는 100% 동일.
 */

import type { Team, Player } from '../types.ts';
import { calculateOvr } from '../utils/ovrUtils.ts';

// ── 타입 ──

export interface AwardStatLine {
    ppg: number; rpg: number; apg: number; spg: number; bpg: number;
    mpg: number; tsPct: number; gamesPlayed: number;
    fgPct: number; p3Pct: number; ftPct: number; orebpg: number; drebpg: number;
    dfgPct: number;
    gamesStarted: number;
    tovpg: number;
    pfpg: number;
}

export interface AwardCandidate {
    playerId: string;
    playerName: string;
    teamId: string;
    position: string;
    ovr: number;
    statLine: AwardStatLine;
    teamWins: number;
    teamLosses: number;
    _winPct: number;
    _tovpg: number;
    _drebpg: number;
    _defAttr: number;
    _intDef: number;
    _perDef: number;
    _stealAttr: number;
    _blkAttr: number;
    _helpDefIq: number;
    _defConsist: number;
}

export interface VoterBallot {
    voterId: number;
    mvp: string[];
    dpoy: string[];
}

export interface AwardRankEntry {
    playerId: string; playerName: string; teamId: string; position: string; ovr: number;
    points: number; firstPlaceVotes: number;
    statLine: AwardStatLine;
    teamWins: number; teamLosses: number;
}

export interface AllTeamPlayer {
    playerId: string; playerName: string; teamId: string; position: string; ovr: number;
    votes: number; pos: 'G' | 'F' | 'C';
    tierVotes: number[];
    totalPoints: number;
    statLine: AwardStatLine;
}

export interface AllTeamEntry {
    tier: number;
    players: AllTeamPlayer[];
}

export interface SeasonAwardsContent {
    mvpRanking: AwardRankEntry[];
    dpoyRanking: AwardRankEntry[];
    allNbaTeams: AllTeamEntry[];
    allDefTeams: AllTeamEntry[];
    ballots: VoterBallot[];
}

// ── 상수 ──

const VOTER_COUNT = 100;
const MIN_GAMES = 41;
const MVP_POINTS = [10, 7, 5, 3, 1];
const DPOY_POINTS = [5, 3, 1];

// ── 시드 기반 랜덤 ──

function seedHash(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return h;
}

function seededRandom(seed: string, voterId: number, category: string): number {
    const key = `${seed}_${voterId}_${category}`;
    let h = seedHash(key);
    h ^= h << 13; h ^= h >> 17; h ^= h << 5;
    return (((h < 0 ? ~h : h) % 10000) / 10000);
}

function voterNoise(seed: string, voterId: number, category: string): number {
    const r = seededRandom(seed, voterId, category);
    return (r - 0.5) * 0.4;
}

// ── 포지션 그룹 ──

type PosGroup = 'Guard' | 'Forward' | 'Center';

function positionGroup(position: string): PosGroup {
    const primary = position.split('/')[0].trim();
    if (primary === 'PG' || primary === 'SG') return 'Guard';
    if (primary === 'SF' || primary === 'PF') return 'Forward';
    return 'Center';
}

// ── 후보 빌드 ──

function buildCandidates(teams: Team[]): { candidates: AwardCandidate[]; playerMap: Map<string, Player> } {
    const candidates: AwardCandidate[] = [];
    const playerMap = new Map<string, Player>();

    for (const team of teams) {
        const winPct = (team.wins + team.losses) > 0 ? team.wins / (team.wins + team.losses) : 0;
        for (const p of team.roster) {
            if (p.stats.g < MIN_GAMES) continue;
            const g = p.stats.g;
            const fga = p.stats.fga;
            const fta = p.stats.fta;
            const tsa = fga + 0.44 * fta;

            candidates.push({
                playerId: p.id,
                playerName: p.name,
                teamId: team.id,
                position: p.position,
                ovr: calculateOvr(p),
                statLine: {
                    ppg: p.stats.pts / g,
                    rpg: p.stats.reb / g,
                    apg: p.stats.ast / g,
                    spg: p.stats.stl / g,
                    bpg: p.stats.blk / g,
                    mpg: p.stats.mp / g,
                    tsPct: tsa > 0 ? p.stats.pts / (2 * tsa) : 0,
                    gamesPlayed: g,
                    fgPct: fga > 0 ? p.stats.fgm / fga : 0,
                    p3Pct: p.stats.p3a > 0 ? p.stats.p3m / p.stats.p3a : 0,
                    ftPct: fta > 0 ? p.stats.ftm / fta : 0,
                    orebpg: p.stats.offReb / g,
                    drebpg: p.stats.defReb / g,
                    dfgPct: (p.stats.contestedAttempted ?? 0) > 0 ? (p.stats.contestedMade ?? 0) / p.stats.contestedAttempted : 0,
                    gamesStarted: p.stats.gs ?? 0,
                    tovpg: p.stats.tov / g,
                    pfpg: p.stats.pf / g,
                },
                teamWins: team.wins,
                teamLosses: team.losses,
                _winPct: winPct,
                _tovpg: p.stats.tov / g,
                _drebpg: p.stats.defReb / g,
                _defAttr: p.def,
                _intDef: p.intDef,
                _perDef: p.perDef,
                _stealAttr: p.steal,
                _blkAttr: (p as any).blk ?? 0,
                _helpDefIq: p.helpDefIq,
                _defConsist: p.defConsist,
            });
            playerMap.set(p.id, p);
        }
    }

    return { candidates, playerMap };
}

// ── 스코어링 공식 ──

function scoreMVP(c: AwardCandidate, noise: number): number {
    const base =
        c.statLine.ppg * 2.5 + c.statLine.rpg * 1.2 + c.statLine.apg * 1.8
        + c.statLine.spg * 1.0 + c.statLine.bpg * 0.8 - c._tovpg * 0.8
        + c.statLine.tsPct * 15
        + (c._winPct * c._winPct) * 60
        + Math.min(c.statLine.gamesPlayed / MIN_GAMES, 1) * 3;
    return base * (1 + noise);
}

function scoreDPOY(c: AwardCandidate, noise: number): number {
    const base =
        c.statLine.spg * 3.0 + c.statLine.bpg * 3.0 + c._drebpg * 0.4
        + c._defAttr * 0.15
        + c._intDef * 0.08 + c._perDef * 0.08
        + c._stealAttr * 0.05 + c._blkAttr * 0.05
        + c._helpDefIq * 0.04 + c._defConsist * 0.04
        + Math.min(c.statLine.gamesPlayed / MIN_GAMES, 1) * 2;
    return base * (1 + noise);
}

function scoreAllNBA(c: AwardCandidate, noise: number): number {
    const base =
        c.statLine.ppg * 2.0 + c.statLine.rpg * 1.0 + c.statLine.apg * 1.5
        + c.statLine.spg * 0.8 + c.statLine.bpg * 0.8 - c._tovpg * 0.5
        + c.statLine.tsPct * 12 + c._winPct * 10 + c.statLine.mpg * 0.3;
    return base * (1 + noise);
}

function scoreAllDef(c: AwardCandidate, noise: number): number {
    const base =
        c.statLine.spg * 4.0 + c.statLine.bpg * 3.5 + c._drebpg * 1.0
        + c._defAttr * 0.20
        + c._intDef * 0.10 + c._perDef * 0.10
        + c._helpDefIq * 0.05 + c._defConsist * 0.05
        + c.statLine.mpg * 0.2;
    return base * (1 + noise);
}

// ── 투표 시뮬레이션 ──

function simulateVoterBallot(
    voterId: number,
    candidates: AwardCandidate[],
    seed: string
): VoterBallot {
    const mvpNoise = voterNoise(seed, voterId, 'mvp');
    const mvpScored = candidates
        .map(c => ({ id: c.playerId, score: scoreMVP(c, mvpNoise + voterNoise(seed, voterId, `mvp_${c.playerId}`)) }))
        .sort((a, b) => b.score - a.score);
    const mvpPicks = mvpScored.slice(0, 5).map(s => s.id);

    const dpoyScored = candidates
        .map(c => ({ id: c.playerId, score: scoreDPOY(c, voterNoise(seed, voterId, `alldef_${c.playerId}`)) }))
        .sort((a, b) => b.score - a.score);
    const dpoyPicks = dpoyScored.slice(0, 3).map(s => s.id);

    return { voterId, mvp: mvpPicks, dpoy: dpoyPicks };
}

function simulateAllTeamBallot(
    voterId: number,
    candidates: AwardCandidate[],
    seed: string,
    scoreFn: (c: AwardCandidate, noise: number) => number,
    category: string,
    teamCount: number
): { guards: string[]; forwards: string[]; center: string }[] {
    const guards = candidates.filter(c => positionGroup(c.position) === 'Guard');
    const forwards = candidates.filter(c => positionGroup(c.position) === 'Forward');
    const centers = candidates.filter(c => positionGroup(c.position) === 'Center');

    const scoreAndSort = (group: AwardCandidate[]) =>
        group
            .map(c => ({ id: c.playerId, score: scoreFn(c, voterNoise(seed, voterId, `${category}_${c.playerId}`)) }))
            .sort((a, b) => b.score - a.score);

    const gSorted = scoreAndSort(guards);
    const fSorted = scoreAndSort(forwards);
    const cSorted = scoreAndSort(centers);

    const teams: { guards: string[]; forwards: string[]; center: string }[] = [];
    for (let t = 0; t < teamCount; t++) {
        teams.push({
            guards: gSorted.slice(t * 2, t * 2 + 2).map(s => s.id),
            forwards: fSorted.slice(t * 2, t * 2 + 2).map(s => s.id),
            center: cSorted[t]?.id || '',
        });
    }
    return teams;
}

// ── 집계 ──

function tallyPointVoting(
    ballots: VoterBallot[],
    candidateMap: Map<string, AwardCandidate>,
    field: 'mvp' | 'dpoy',
    pointTable: number[],
    topN: number
): AwardRankEntry[] {
    const pointMap = new Map<string, { points: number; firstPlace: number }>();

    for (const ballot of ballots) {
        const picks = ballot[field];
        for (let i = 0; i < picks.length && i < pointTable.length; i++) {
            const pid = picks[i];
            const entry = pointMap.get(pid) || { points: 0, firstPlace: 0 };
            entry.points += pointTable[i];
            if (i === 0) entry.firstPlace++;
            pointMap.set(pid, entry);
        }
    }

    const ranked = Array.from(pointMap.entries())
        .map(([pid, { points, firstPlace }]) => {
            const c = candidateMap.get(pid)!;
            return {
                playerId: c.playerId,
                playerName: c.playerName,
                teamId: c.teamId,
                position: c.position,
                ovr: c.ovr,
                points,
                firstPlaceVotes: firstPlace,
                statLine: { ...c.statLine },
                teamWins: c.teamWins,
                teamLosses: c.teamLosses,
            };
        })
        .sort((a, b) => b.points - a.points || b.firstPlaceVotes - a.firstPlaceVotes || b.statLine.ppg - a.statLine.ppg);

    return ranked.slice(0, topN);
}

function tallyAllTeams(
    ballots: { guards: string[]; forwards: string[]; center: string }[][],
    candidateMap: Map<string, AwardCandidate>,
    teamCount: number
): AllTeamEntry[] {
    const guardVotes = new Map<string, number[]>();
    const forwardVotes = new Map<string, number[]>();
    const centerVotes = new Map<string, number[]>();

    for (const ballot of ballots) {
        for (let tier = 0; tier < teamCount && tier < ballot.length; tier++) {
            const team = ballot[tier];
            for (const gid of team.guards) {
                if (!guardVotes.has(gid)) guardVotes.set(gid, Array(teamCount).fill(0));
                guardVotes.get(gid)![tier]++;
            }
            for (const fid of team.forwards) {
                if (!forwardVotes.has(fid)) forwardVotes.set(fid, Array(teamCount).fill(0));
                forwardVotes.get(fid)![tier]++;
            }
            if (team.center) {
                if (!centerVotes.has(team.center)) centerVotes.set(team.center, Array(teamCount).fill(0));
                centerVotes.get(team.center)![tier]++;
            }
        }
    }

    const tierWeights = teamCount === 3 ? [3, 2, 1] : [2, 1];
    const totalScore = (votes: number[]): number =>
        votes.reduce((sum, v, i) => sum + v * (tierWeights[i] || 1), 0);

    const sortByScore = (map: Map<string, number[]>) =>
        Array.from(map.entries())
            .map(([pid, votes]) => ({ pid, votes, score: totalScore(votes) }))
            .sort((a, b) => b.score - a.score || b.votes[0] - a.votes[0]);

    const gRanked = sortByScore(guardVotes);
    const fRanked = sortByScore(forwardVotes);
    const cRanked = sortByScore(centerVotes);

    const usedIds = new Set<string>();
    const result: AllTeamEntry[] = [];

    for (let tier = 0; tier < teamCount; tier++) {
        const players: AllTeamPlayer[] = [];

        let gCount = 0;
        for (const g of gRanked) {
            if (gCount >= 2) break;
            if (usedIds.has(g.pid)) continue;
            const c = candidateMap.get(g.pid);
            if (!c) continue;
            usedIds.add(g.pid);
            players.push({
                playerId: c.playerId, playerName: c.playerName, teamId: c.teamId,
                position: c.position, ovr: c.ovr,
                votes: g.votes[tier] || 0, pos: 'G',
                tierVotes: [...g.votes], totalPoints: g.score,
                statLine: { ...c.statLine },
            });
            gCount++;
        }

        let fCount = 0;
        for (const f of fRanked) {
            if (fCount >= 2) break;
            if (usedIds.has(f.pid)) continue;
            const c = candidateMap.get(f.pid);
            if (!c) continue;
            usedIds.add(f.pid);
            players.push({
                playerId: c.playerId, playerName: c.playerName, teamId: c.teamId,
                position: c.position, ovr: c.ovr,
                votes: f.votes[tier] || 0, pos: 'F',
                tierVotes: [...f.votes], totalPoints: f.score,
                statLine: { ...c.statLine },
            });
            fCount++;
        }

        for (const ct of cRanked) {
            if (usedIds.has(ct.pid)) continue;
            const c = candidateMap.get(ct.pid);
            if (!c) continue;
            usedIds.add(ct.pid);
            players.push({
                playerId: c.playerId, playerName: c.playerName, teamId: c.teamId,
                position: c.position, ovr: c.ovr,
                votes: ct.votes[tier] || 0, pos: 'C',
                tierVotes: [...ct.votes], totalPoints: ct.score,
                statLine: { ...c.statLine },
            });
            break;
        }

        result.push({ tier: tier + 1, players });
    }

    return result;
}

// ── 메인 엔트리 ──

export function runAwardVoting(teams: Team[], seed?: string): SeasonAwardsContent {
    const effectiveSeed = seed || String(Date.now());
    const { candidates } = buildCandidates(teams);

    if (candidates.length === 0) {
        return { mvpRanking: [], dpoyRanking: [], allNbaTeams: [], allDefTeams: [], ballots: [] };
    }

    const candidateMap = new Map<string, AwardCandidate>();
    for (const c of candidates) candidateMap.set(c.playerId, c);

    const ballots: VoterBallot[] = [];
    const allNbaBallots: { guards: string[]; forwards: string[]; center: string }[][] = [];
    const allDefBallots: { guards: string[]; forwards: string[]; center: string }[][] = [];

    for (let v = 0; v < VOTER_COUNT; v++) {
        const ballot = simulateVoterBallot(v, candidates, effectiveSeed);
        ballots.push(ballot);

        const nbaBallot = simulateAllTeamBallot(v, candidates, effectiveSeed, scoreAllNBA, 'allnba', 3);
        allNbaBallots.push(nbaBallot);

        const defBallot = simulateAllTeamBallot(v, candidates, effectiveSeed, scoreAllDef, 'alldef', 2);
        allDefBallots.push(defBallot);
    }

    const mvpRanking = tallyPointVoting(ballots, candidateMap, 'mvp', MVP_POINTS, 5);
    const dpoyRanking = tallyPointVoting(ballots, candidateMap, 'dpoy', DPOY_POINTS, 3);
    const allNbaTeams = tallyAllTeams(allNbaBallots, candidateMap, 3);
    const allDefTeams = tallyAllTeams(allDefBallots, candidateMap, 2);

    return { mvpRanking, dpoyRanking, allNbaTeams, allDefTeams, ballots };
}

/**
 * aiTeamSituation.ts — 서버 미러. 멀티플레이어 AI 단장의 시즌 상황 판정과 현재 기조 라벨 (G2).
 * 원본: services/multi/aiTeamSituation.ts. 공식/상수를 바꿀 땐 반드시 양쪽 다 같이 고칠 것
 * (client/server 미러 쌍 — dev-log.md 기록 대상). 외부 import가 없어 두 파일은 이 헤더만 다르다.
 *
 * playoffRaceUtils.computeRaceOdds(몬테카를로, Math.random)는 렌더마다 값이 흔들려 쓰지 않고,
 * 전력(파워랭킹 powerScore)과 실제 성적을 섞은 결정론적 예상 승률로 판정한다. 같은 입력 → 같은 출력.
 * 진출 라인 규칙만 getRaceZones와 동일하게 맞춘다. 설계: docs/plan/multi-ai-gm-profile-plan.md 3장
 */

export type TeamSituation = 'contender' | 'middle' | 'bubble' | 'out';

export type GmStance =
    | 'allIn' | 'contending' | 'pushing' | 'racing'
    | 'buying' | 'holding' | 'rebounding' | 'selling';

export const GM_STANCE_LABEL_KO: Record<GmStance, string> = {
    allIn: '우승 올인',
    contending: '우승 도전',
    pushing: '총력전',
    racing: '순위 경쟁',
    buying: '보강 모색',
    holding: '관망',
    rebounding: '반등 시도',
    selling: '정리 중',
};

export interface SituationTeamInput {
    slug: string;
    conference: string;
    wins: number;
    losses: number;
    /** 남은 정규시즌 경기 수 */
    remaining: number;
    /** 파워랭킹 powerScore (0~100 리그 백분위) */
    powerScore: number;
    /** 단장 승부욕 (0.1~0.9). 사람이 운영하는 팀 등 단장이 없으면 0.5 */
    competitiveness: number;
}

export interface SituationOptions {
    /** 컨퍼런스별 진출 팀 수 (leagues.playoff_team_count) */
    playoffTeamsPerConf: number;
    playInEnabled: boolean;
}

export interface TeamSituationResult {
    situation: TeamSituation;
    /** 예상 최종 승률 */
    projectedPct: number;
    /** 진출 라인 대비 예상 승수 차 (+면 라인 위) */
    gapGames: number;
    /** gapGames / 불확실성 */
    z: number;
    /** 리그 전체 예상 승률 순위 (1부터) */
    leagueRank: number;
}

/** 전력을 몇 경기 분량의 사전값으로 둘지 — 클수록 시즌 초반 성적에 덜 흔들린다 */
export const STRENGTH_PRIOR_GAMES = 20;
/** 전력(powerScore 0~100) → 기대 승률 0.30~0.70 */
export const STRENGTH_PCT_MIN = 0.30;
export const STRENGTH_PCT_RANGE = 0.40;
/** 전력 추정 자체의 승률 오차 (경기가 쌓일수록 줄어듦) */
export const STRENGTH_PCT_SD = 0.08;
export const CONTENDER_COUNT = 4;
export const SAFE_Z = 1.0;

const HIGH_COMPETITIVENESS = 0.65;
const LOW_COMPETITIVENESS = 0.35;

/** 탈락권으로 판단하는 z 경계 — 승부욕이 높을수록 늦게 포기 (0.25 → −0.8, 0.9 → −1.84) */
export function giveUpZ(competitiveness: number): number {
    return -(0.4 + 1.6 * competitiveness);
}

/** getRaceZones(playoffRaceUtils)와 동일한 진출 라인 순위 (플레이인 포함 마지막 진출권) */
export function entryLineRank(playoffTeamsPerConf: number, playInEnabled: boolean): number {
    return playInEnabled ? playoffTeamsPerConf + 2 : playoffTeamsPerConf;
}

interface Projection {
    team: SituationTeamInput;
    played: number;
    total: number;
    pct: number;
    sigma: number;
}

function project(team: SituationTeamInput): Projection {
    const played = Math.max(0, team.wins + team.losses);
    const remaining = Math.max(0, team.remaining);
    const total = played + remaining;
    const pStr = STRENGTH_PCT_MIN + STRENGTH_PCT_RANGE * Math.min(100, Math.max(0, team.powerScore)) / 100;
    const pFuture = (team.wins + STRENGTH_PRIOR_GAMES * pStr) / (played + STRENGTH_PRIOR_GAMES);
    const pct = total > 0 ? (team.wins + remaining * pFuture) / total : pStr;
    const luckSd = 0.5 * Math.sqrt(remaining);
    const strengthSd = remaining * STRENGTH_PCT_SD * STRENGTH_PRIOR_GAMES / (played + STRENGTH_PRIOR_GAMES);
    const sigma = Math.max(1, Math.sqrt(luckSd * luckSd + strengthSd * strengthSd));
    return { team, played, total, pct, sigma };
}

const byPctThenSlug = (a: Projection, b: Projection) => b.pct - a.pct || a.team.slug.localeCompare(b.team.slug);

export function computeTeamSituations(
    teams: SituationTeamInput[],
    opts: SituationOptions,
): Map<string, TeamSituationResult> {
    const projections = teams.map(project);
    const leagueOrder = [...projections].sort(byPctThenSlug);
    const leagueRankOf = new Map(leagueOrder.map((p, i) => [p.team.slug, i + 1]));
    const lastK = entryLineRank(opts.playoffTeamsPerConf, opts.playInEnabled);

    const byConf = new Map<string, Projection[]>();
    for (const p of projections) {
        const list = byConf.get(p.team.conference) ?? [];
        list.push(p);
        byConf.set(p.team.conference, list);
    }

    const result = new Map<string, TeamSituationResult>();
    for (const list of byConf.values()) {
        list.sort(byPctThenSlug);
        // Everyone qualifies when the conference is not larger than the entry line.
        const linePct = list.length > lastK
            ? (list[lastK - 1].pct + list[lastK].pct) / 2
            : -Infinity;

        for (const p of list) {
            const gapGames = Number.isFinite(linePct) ? (p.pct - linePct) * p.total : p.total;
            const z = gapGames / p.sigma;
            const leagueRank = leagueRankOf.get(p.team.slug) ?? projections.length;

            let situation: TeamSituation;
            if (z >= SAFE_Z) situation = leagueRank <= CONTENDER_COUNT ? 'contender' : 'middle';
            else if (z >= giveUpZ(p.team.competitiveness)) situation = 'bubble';
            else situation = 'out';

            result.set(p.team.slug, { situation, projectedPct: p.pct, gapGames, z, leagueRank });
        }
    }
    return result;
}

export function resolveGmStance(situation: TeamSituation, competitiveness: number): GmStance {
    const level = competitiveness >= HIGH_COMPETITIVENESS ? 'high'
        : competitiveness < LOW_COMPETITIVENESS ? 'low'
        : 'mid';
    switch (situation) {
        case 'contender': return level === 'high' ? 'allIn' : 'contending';
        case 'bubble':    return level === 'high' ? 'pushing' : level === 'mid' ? 'racing' : 'holding';
        case 'middle':    return level === 'high' ? 'buying' : 'holding';
        case 'out':       return level === 'high' ? 'rebounding' : level === 'mid' ? 'holding' : 'selling';
    }
}

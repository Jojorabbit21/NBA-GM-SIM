/**
 * nbaTiebreak.ts — NBA 정규시즌 동률 처리(플레이오프/플레이인 시딩) 순수 엔진.
 *
 * ⚠️ 서버 미러: `server/src/shared/nbaTiebreak.ts`와 내용이 반드시 같아야 한다(Docker는 server/src만 복사).
 * 이 파일을 고치면 미러도 같이 고칠 것. 외부 import 없음(순수 함수).
 *
 * 규정 출처: NBA.com 2025-26 Regular Season Standings 페이지의 L.2.a/L.2.b/L.2.c 및 NBA 공식
 * "Tiebreaker Procedures" PDF(2017) — 두 문서가 같은 순서를 가리킨다.
 *
 * 2팀 동률:   ① 맞대결 승률 ② 디비전 우승 ③ 디비전 승률(같은 디비전일 때만) ④ 컨퍼런스 승률
 *             ⑤ 컨퍼런스 내 "진출권 팀" 상대 승률 ⑥ 상대 컨퍼런스 "진출권 팀" 상대 승률 ⑦ 득실차
 * 3팀 이상:   ① 디비전 우승 ② 동률 팀끼리의 승률 ③ 디비전 승률(전원 같은 디비전일 때만) ④ 컨퍼런스 승률
 *             ⑤ 컨퍼런스 내 "진출권 팀" 상대 승률 ⑥ 득실차
 *             → 처음으로 차이가 생기는 기준을 적용. 일부만 갈리면 갈린 팀은 순위를 받고, 여전히 동률인 팀끼리
 *               기준을 "처음부터" 다시 적용(2팀이 남으면 2팀 기준).
 * 디비전 우승 동률은 다른 모든 동률보다 먼저 풀며, 그 결과는 디비전 우승 판정에만 쓴다.
 * 모든 기준이 같으면 추첨 — 여기서는 drawSeed 기반의 결정적 해시로 대신한다(서버/클라가 같은 결과).
 *
 * "진출권 팀"(eligible) — 공식 정의(NBA.com 2025-26 L.2.a ⑤⑥, L.2.b ⑤): "teams eligible for the postseason
 * ... (including teams that finished the Regular Season tied for one of the best 10 records in their conference)".
 * 즉 포스트시즌(플레이오프 + 플레이인) 진출 성적인 컨퍼런스 상위 10팀 + 10위와 승률이 같은 팀. NBA는 10으로 고정이지만
 * 이 리그는 진출 팀 수가 설정값이라 eligibleCount(= 플레이오프 팀 수 + 플레이인이면 2)로 일반화한다(기본 8+2=10).
 */

export interface TiebreakTeam {
    slug: string;
    conference: string | null;
    /** 디비전이 없는 팀(가상 팀 등)은 null — 디비전 관련 기준은 자동으로 건너뛴다 */
    division: string | null;
}

export interface TiebreakGame {
    homeSlug: string;
    awaySlug: string;
    homeScore: number;
    awayScore: number;
}

export interface Ledger {
    teams: Map<string, TiebreakTeam>;
    wins: Map<string, number>;
    losses: Map<string, number>;
    /** 정규시즌 득실차 합계(득점 − 실점) */
    pd: Map<string, number>;
    /** `${a}|${b}` → a가 b를 이긴 횟수 */
    beat: Map<string, number>;
}

export function createLedger(teams: TiebreakTeam[]): Ledger {
    const l: Ledger = { teams: new Map(), wins: new Map(), losses: new Map(), pd: new Map(), beat: new Map() };
    for (const t of teams) {
        l.teams.set(t.slug, t);
        l.wins.set(t.slug, 0);
        l.losses.set(t.slug, 0);
        l.pd.set(t.slug, 0);
    }
    return l;
}

/** 경기 한 건 반영. margin(승자 기준 점수차)을 모르면 0 — 득실차는 그대로 둔다. */
export function recordResult(l: Ledger, winner: string, loser: string, margin = 0): void {
    l.wins.set(winner, (l.wins.get(winner) ?? 0) + 1);
    l.losses.set(loser, (l.losses.get(loser) ?? 0) + 1);
    const k = `${winner}|${loser}`;
    l.beat.set(k, (l.beat.get(k) ?? 0) + 1);
    if (margin) {
        l.pd.set(winner, (l.pd.get(winner) ?? 0) + margin);
        l.pd.set(loser, (l.pd.get(loser) ?? 0) - margin);
    }
}

export function buildLedger(teams: TiebreakTeam[], games: TiebreakGame[]): Ledger {
    const l = createLedger(teams);
    for (const g of games) {
        if (!l.teams.has(g.homeSlug) || !l.teams.has(g.awaySlug)) continue;
        if (g.homeScore === g.awayScore) continue;
        const homeWon = g.homeScore > g.awayScore;
        recordResult(l, homeWon ? g.homeSlug : g.awaySlug, homeWon ? g.awaySlug : g.homeSlug, Math.abs(g.homeScore - g.awayScore));
    }
    return l;
}

/** 시뮬레이션용 복제 — teams는 공유, 나머지 맵은 복사 */
export function cloneLedger(l: Ledger): Ledger {
    return { teams: l.teams, wins: new Map(l.wins), losses: new Map(l.losses), pd: new Map(l.pd), beat: new Map(l.beat) };
}

// ── 기록 조회 ────────────────────────────────────────────────────────────────

const get = (m: Map<string, number>, k: string) => m.get(k) ?? 0;

interface WL { w: number; l: number }

function recordVs(l: Ledger, slug: string, others: Iterable<string>): WL {
    let w = 0, lo = 0;
    for (const o of others) {
        if (o === slug) continue;
        w += get(l.beat, `${slug}|${o}`);
        lo += get(l.beat, `${o}|${slug}`);
    }
    return { w, l: lo };
}

const pctOf = (r: WL): number => (r.w + r.l > 0 ? r.w / (r.w + r.l) : 0.5);
const fmtWL = (r: WL) => `${r.w}승 ${r.l}패`;
const fmtPdText = (v: number) => `득실차 ${v > 0 ? '+' : ''}${Math.round(v)}`;

function overallPct(l: Ledger, slug: string): number {
    const w = get(l.wins, slug), lo = get(l.losses, slug);
    return w + lo > 0 ? w / (w + lo) : 0;
}

// ── 컨텍스트(디비전 우승 · 진출권 팀) ──────────────────────────────────────────

export interface TiebreakContext {
    ledger: Ledger;
    divWinners: Set<string>;
    /** 컨퍼런스 → 진출권 팀 */
    eligible: Map<string, Set<string>>;
    drawSeed: string;
}

export type CriterionId = 'h2h' | 'divWinner' | 'divRecord' | 'confRecord' | 'eligibleOwn' | 'eligibleOther' | 'pointDiff' | 'draw';

export const CRITERION_LABEL: Record<CriterionId, string> = {
    h2h: '맞대결 승률',
    divWinner: '디비전 우승',
    divRecord: '디비전 승률',
    confRecord: '컨퍼런스 승률',
    eligibleOwn: '컨퍼런스 진출권 팀 상대 승률',
    eligibleOther: '상대 컨퍼런스 진출권 팀 상대 승률',
    pointDiff: '득실차',
    draw: '추첨',
};

interface Criterion {
    id: CriterionId;
    /** 이 동률 집합에 적용 가능한가 */
    applies(set: string[], ctx: TiebreakContext): boolean;
    /** 값(클수록 앞) + 화면 표기 */
    value(slug: string, set: string[], ctx: TiebreakContext): { v: number; text: string };
}

const teamOf = (ctx: TiebreakContext, slug: string) => ctx.ledger.teams.get(slug);
const sameDivision = (set: string[], ctx: TiebreakContext) => {
    const d = teamOf(ctx, set[0])?.division ?? null;
    return d !== null && set.every(s => teamOf(ctx, s)?.division === d);
};

const C_H2H: Criterion = {
    id: 'h2h',
    applies: () => true,
    value: (s, set, ctx) => { const r = recordVs(ctx.ledger, s, set); return { v: pctOf(r), text: `맞대결 ${fmtWL(r)}` }; },
};
const C_DIV_WINNER: Criterion = {
    id: 'divWinner',
    applies: () => true,
    value: (s, _set, ctx) => { const y = ctx.divWinners.has(s); return { v: y ? 1 : 0, text: y ? '디비전 우승' : '디비전 우승 아님' }; },
};
const C_DIV_RECORD: Criterion = {
    id: 'divRecord',
    applies: (set, ctx) => sameDivision(set, ctx),
    value: (s, _set, ctx) => {
        const d = teamOf(ctx, s)?.division;
        const mates = [...ctx.ledger.teams.values()].filter(t => t.division === d).map(t => t.slug);
        const r = recordVs(ctx.ledger, s, mates);
        return { v: pctOf(r), text: `디비전 ${fmtWL(r)}` };
    },
};
const C_CONF_RECORD: Criterion = {
    id: 'confRecord',
    applies: () => true,
    value: (s, _set, ctx) => {
        const c = teamOf(ctx, s)?.conference;
        const mates = [...ctx.ledger.teams.values()].filter(t => t.conference === c).map(t => t.slug);
        const r = recordVs(ctx.ledger, s, mates);
        return { v: pctOf(r), text: `컨퍼런스 ${fmtWL(r)}` };
    },
};
const C_ELIGIBLE_OWN: Criterion = {
    id: 'eligibleOwn',
    applies: () => true,
    value: (s, _set, ctx) => {
        const c = teamOf(ctx, s)?.conference ?? '';
        const r = recordVs(ctx.ledger, s, ctx.eligible.get(c) ?? []);
        return { v: pctOf(r), text: `진출권 팀 상대 ${fmtWL(r)}` };
    },
};
const C_ELIGIBLE_OTHER: Criterion = {
    id: 'eligibleOther',
    applies: () => true,
    value: (s, _set, ctx) => {
        const c = teamOf(ctx, s)?.conference ?? '';
        const others: string[] = [];
        for (const [conf, set] of ctx.eligible) if (conf !== c) others.push(...set);
        const r = recordVs(ctx.ledger, s, others);
        return { v: pctOf(r), text: `상대 컨퍼런스 진출권 팀 상대 ${fmtWL(r)}` };
    },
};
const C_POINT_DIFF: Criterion = {
    id: 'pointDiff',
    applies: () => true,
    value: (s, _set, ctx) => { const v = get(ctx.ledger.pd, s); return { v, text: fmtPdText(v) }; },
};

const TWO_TEAM: Criterion[] = [C_H2H, C_DIV_WINNER, C_DIV_RECORD, C_CONF_RECORD, C_ELIGIBLE_OWN, C_ELIGIBLE_OTHER, C_POINT_DIFF];
const MULTI_TEAM: Criterion[] = [C_DIV_WINNER, C_H2H, C_DIV_RECORD, C_CONF_RECORD, C_ELIGIBLE_OWN, C_POINT_DIFF];

/** 화면용 규정 목록 (2팀 / 3팀 이상) */
export const TIEBREAK_RULES_TWO = TWO_TEAM.map(c => c.id);
export const TIEBREAK_RULES_MULTI = MULTI_TEAM.map(c => c.id);

// ── 동률 해소 ────────────────────────────────────────────────────────────────

/** 동률 하나를 가른 기록 — 화면에서 "무엇으로 갈렸는지" 보여주는 용도 */
export interface TieStep {
    criterion: CriterionId;
    /** 이 기준 적용 시점의 동률 팀(적용 전 집합) */
    teams: string[];
    /** 팀별 표기 (예: "맞대결 3승 1패") */
    detail: Record<string, string>;
}

function hash(seed: string): number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/** 동률 팀 집합을 순서대로 정렬한다. 갈린 과정은 steps에 쌓는다. */
export function resolveTie(set: string[], ctx: TiebreakContext, steps: TieStep[] = []): string[] {
    if (set.length <= 1) return [...set];
    const criteria = set.length === 2 ? TWO_TEAM : MULTI_TEAM;
    for (const c of criteria) {
        if (!c.applies(set, ctx)) continue;
        const vals = new Map(set.map(s => [s, c.value(s, set, ctx)] as const));
        const distinct = [...new Set([...vals.values()].map(x => x.v))].sort((a, b) => b - a);
        if (distinct.length === 1) continue; // 차이 없음 → 다음 기준
        const detail: Record<string, string> = {};
        for (const s of set) detail[s] = vals.get(s)!.text;
        steps.push({ criterion: c.id, teams: [...set], detail });
        // 갈린 팀은 순위를 받고, 여전히 동률인 팀끼리는 기준을 처음부터 다시 적용
        const out: string[] = [];
        for (const v of distinct) out.push(...resolveTie(set.filter(s => vals.get(s)!.v === v), ctx, steps));
        return out;
    }
    const drawn = [...set].sort((a, b) => hash(`${ctx.drawSeed}|${a}`) - hash(`${ctx.drawSeed}|${b}`) || a.localeCompare(b));
    const detail: Record<string, string> = {};
    for (const s of set) detail[s] = '추첨';
    steps.push({ criterion: 'draw', teams: [...set], detail });
    return drawn;
}

/** 승률 내림차순으로 묶은 동률 그룹(같은 승률끼리). 그룹 안 순서는 입력 순서. */
function groupByPct(slugs: string[], l: Ledger): string[][] {
    const sorted = [...slugs].sort((a, b) => overallPct(l, b) - overallPct(l, a));
    const groups: string[][] = [];
    for (const s of sorted) {
        const last = groups[groups.length - 1];
        if (last && overallPct(l, last[0]) === overallPct(l, s)) last.push(s);
        else groups.push([s]);
    }
    return groups;
}

export function computeEligible(l: Ledger, conference: string, eligibleCount: number): Set<string> {
    const members = [...l.teams.values()].filter(t => t.conference === conference).map(t => t.slug);
    if (members.length === 0) return new Set();
    const sorted = [...members].sort((a, b) => overallPct(l, b) - overallPct(l, a));
    const cutoff = overallPct(l, sorted[Math.min(eligibleCount, sorted.length) - 1]);
    return new Set(members.filter(s => overallPct(l, s) >= cutoff));
}

export interface TiebreakOptions {
    /** 진출권 팀 수 — 플레이인이 있으면 플레이오프 팀 수 + 2, 없으면 플레이오프 팀 수 */
    eligibleCount: number;
    drawSeed?: string;
}

/** 현재 기록으로 컨텍스트(디비전 우승 · 진출권 팀)를 만든다 */
export function buildContext(l: Ledger, opts: TiebreakOptions): TiebreakContext {
    const drawSeed = opts.drawSeed ?? 'draw';
    const eligible = new Map<string, Set<string>>();
    const conferences = new Set<string>();
    for (const t of l.teams.values()) if (t.conference) conferences.add(t.conference);
    for (const c of conferences) eligible.set(c, computeEligible(l, c, opts.eligibleCount));

    // 디비전 우승 — 다른 동률보다 먼저, 이 결과는 디비전 우승 판정에만 쓴다(divWinners는 비어 있는 상태로 해소)
    const divWinners = new Set<string>();
    const divisions = new Map<string, string[]>();
    for (const t of l.teams.values()) if (t.division) divisions.set(t.division, [...(divisions.get(t.division) ?? []), t.slug]);
    const probe: TiebreakContext = { ledger: l, divWinners: new Set(), eligible, drawSeed };
    for (const members of divisions.values()) {
        const top = groupByPct(members, l)[0];
        const winner = top.length === 1 ? top[0] : resolveTie(top, probe)[0];
        divWinners.add(winner);
    }
    return { ledger: l, divWinners, eligible, drawSeed };
}

export interface ConferenceOrder {
    order: string[];
    /** 동률을 가른 과정(순서대로) */
    steps: TieStep[];
}

/** 임의의 팀 묶음(컨퍼런스·디비전 등) 순서 — 승률 → (동률이면) NBA 타이브레이커 */
export function rankGroup(l: Ledger, slugs: string[], ctx: TiebreakContext, steps: TieStep[] = []): string[] {
    const order: string[] = [];
    for (const g of groupByPct(slugs, l)) order.push(...(g.length === 1 ? g : resolveTie(g, ctx, steps)));
    return order;
}

/** 컨퍼런스 하나의 시드 순서 — 승률 → (동률이면) NBA 타이브레이커 */
export function rankConference(l: Ledger, conference: string, ctx: TiebreakContext): ConferenceOrder {
    const members = [...l.teams.values()].filter(t => t.conference === conference).map(t => t.slug);
    const steps: TieStep[] = [];
    const order = rankGroup(l, members, ctx, steps);
    return { order, steps };
}

/** 두 팀이 동률일 때 어느 쪽이 앞서는지(현재 기록 기준) — 결정 기준과 팀별 표기를 함께 돌려준다 */
export function compareTied(a: string, b: string, ctx: TiebreakContext): { winner: string; step: TieStep } {
    const steps: TieStep[] = [];
    const order = resolveTie([a, b], ctx, steps);
    return { winner: order[0], step: steps[0] };
}

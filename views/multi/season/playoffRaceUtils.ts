import type { Game } from '../../../types';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { isFinal } from './multiGameReveal';
import { addDaysToKey } from './multiScheduleUtils';
import { log5WinProb, type MultiStandingsRecord } from './multiSeasonUtils';
import { TEAM_DATA } from '../../../data/teamData';
import {
    buildLedger, buildContext, rankConference, compareTied, cloneLedger, recordResult,
    type Ledger, type CriterionId,
} from '../../../utils/nbaTiebreak';

// ── 순위 경쟁(Playoff Race) 계산 ────────────────────────────────────────────
// 정규시즌 종료 한 달 전부터 열리는 "순위 경쟁" 화면 전용 순수 로직.
//
// 타이브레이커는 NBA 공식 규정(utils/nbaTiebreak.ts — 서버 시딩 server/src/shared/nbaTiebreak.ts와 같은
// 파일의 미러)을 그대로 쓴다: 맞대결 → 디비전 우승 → 디비전/컨퍼런스 승률 → 진출권 팀 상대 승률 → 득실차 → 추첨.
// 시딩 규칙을 바꾸면 그 두 파일을 같이 고칠 것. (이전엔 승패 마진 → 득실차 두 가지뿐이었다.)
//
// 매직넘버/탈락넘버는 "동률은 위협으로 간주"하는 보수적 계산이다(= 확정/탈락은 동률 없이도
// 성립할 때만 선언). 경쟁팀끼리 맞붙으면 서로 최대 승수가 깎이는 효과는 반영하지 않는다.

export const PLAYOFF_RACE_WINDOW_DAYS = 30;

/** 화면용 규정 표 — 2팀 동률 / 3팀 이상 동률 (NBA.com 2025-26 L.2.a, L.2.b) */
export const TIEBREAK_RULE_TABLE: { two: string; multi: string }[] = [
    { two: '맞대결 승률',                               multi: '디비전 우승' },
    { two: '디비전 우승 (같은 디비전이 아니어도 적용)',   multi: '동률 팀끼리의 경기 승률' },
    { two: '디비전 승률 (같은 디비전일 때만)',            multi: '디비전 승률 (전원이 같은 디비전일 때만)' },
    { two: '컨퍼런스 승률',                              multi: '컨퍼런스 승률' },
    { two: '컨퍼런스 진출권 팀 상대 승률',                multi: '컨퍼런스 진출권 팀 상대 승률' },
    { two: '상대 컨퍼런스 진출권 팀 상대 승률',           multi: '득실차' },
    { two: '득실차',                                     multi: '-' },
];

/** 정규시즌 경기 결과로 만든 기록부(맞대결/디비전/컨퍼런스 전적 포함). 공개된(isFinal) 경기만 반영. */
export function buildRaceLedger(leagueTeams: LeagueTeamRow[], schedule: Game[], nowMs: number): Ledger {
    const teams = leagueTeams.map(t => ({
        slug: t.team_slug, conference: t.conference ?? null,
        division: TEAM_DATA[t.team_slug]?.division ?? null, // 가상 팀은 디비전 없음
    }));
    const games = schedule
        .filter(g => !g.isPlayoff && !g.isAllstar && g.played && g.homeScore != null && g.awayScore != null && isFinal(g, nowMs))
        .map(g => ({ homeSlug: g.homeTeamId, awaySlug: g.awayTeamId, homeScore: g.homeScore!, awayScore: g.awayScore! }));
    return buildLedger(teams, games);
}

/** 정규시즌 마지막 경기 날짜(플레이오프/올스타 제외). 일정이 비어 있으면 null. */
export function getRegularSeasonEndDate(schedule: Game[]): string | null {
    let max: string | null = null;
    for (const g of schedule) {
        if (g.isPlayoff || g.isAllstar) continue;
        const d = g.date.slice(0, 10);
        if (max === null || d > max) max = d;
    }
    return max;
}

/** 가상 오늘이 [정규시즌 종료일 − 30일, 종료일] 안이면 true. 종료 이후(포스트시즌 진입 전 공백 포함)도 열어둔다. */
export function isPlayoffRaceOpen(currentVirtualDate: string | null, regularSeasonEnd: string | null): boolean {
    if (!currentVirtualDate || !regularSeasonEnd) return false;
    return currentVirtualDate >= addDaysToKey(regularSeasonEnd, -PLAYOFF_RACE_WINDOW_DAYS);
}

export interface RaceZones {
    /** 플레이오프 직행 마지막 순위 (플레이인 off면 진출 마지막 순위와 동일) */
    autoK: number;
    /** 플레이인 포함 마지막 진출권 순위 */
    lastK: number;
}

export function getRaceZones(playoffTeamsPerConf: number, playInEnabled: boolean): RaceZones {
    return {
        autoK: playInEnabled ? Math.max(0, playoffTeamsPerConf - 2) : playoffTeamsPerConf,
        lastK: playInEnabled ? playoffTeamsPerConf + 2 : playoffTeamsPerConf,
    };
}

export type RaceStatus =
    | 'clinched_auto'   // 직행 확정
    | 'clinched_entry'  // 최소 플레이인(또는 진출) 확정
    | 'eliminated'
    | 'auto_zone'       // 현재 직행권 (미확정)
    | 'playin_zone'     // 현재 플레이인권 (미확정)
    | 'chasing';        // 현재 컷 밖, 아직 가능

export interface RaceRow {
    slug: string;
    rank: number;
    wins: number;
    losses: number;
    remaining: number;
    maxWins: number;
    margin: number;
    /** 시즌 누적 득실차 합계 (타이브레이커 ②) */
    pointDiff: number;
    /** 잔여 경기 상대들의 현재 승률 평균 */
    remainingSos: number;
    /** 직행 확정까지 필요한 (본인 승 + 경쟁팀 패) 합. ≤0이면 확정 */
    autoMagic: number;
    /** 진출(플레이인 off) 또는 플레이인 이상 확정까지 필요한 합. ≤0이면 확정 */
    entryMagic: number;
    /** 직행권에서 밀려나기까지 (본인 패 + 경쟁팀 승) 합. ≤0이면 직행 불가 */
    autoElim: number;
    /** 진출권에서 밀려나기까지 합. ≤0이면 탈락 */
    entryElim: number;
    status: RaceStatus;
    /** 컷 근처 경쟁팀과 남은 맞대결 */
    rivalGames: { slug: string; games: number }[];
    nextGames: { oppSlug: string; isHome: boolean; date: string }[];
}

export interface TieGroup {
    wins: number;
    losses: number;
    /** 타이브레이커를 적용한 실제 시드 순 */
    slugs: string[];
    boundary: 'auto' | 'entry';
    /** 순서를 가르는 데 쓰인 기준(적용 순서) */
    criteria: CriterionId[];
    /** 팀별 결정 근거 표기 (예: "맞대결 2승 1패") */
    details: Record<string, string>;
    /** 모든 기준이 같아 추첨으로 정해지는 경우 */
    drawn: boolean;
}

export interface ConferenceRace {
    rows: RaceRow[];
    ties: TieGroup[];
    totalRemaining: number;
}

/** k번째(1-indexed)로 큰 값. 원소가 k개 미만이면 null. */
function kthLargest(values: number[], k: number): number | null {
    if (k < 1 || values.length < k) return null;
    return [...values].sort((a, b) => b - a)[k - 1];
}

// ── 컨퍼런스 단위 판정(순위/매직넘버/탈락넘버/상태) ──────────────────────────
// "승/패/잔여/득실차" 입력만으로 돌 수 있게 분리 — computeConferenceRaces(실제 상태)와
// computeKeyGames(어떤 경기의 결과를 가정한 상태)가 같은 판정 로직을 공유한다.
// 가정 상태에서는 득실차를 고정값으로 두므로(경기 점수차를 모른다) 득실차까지 내려가는 동률만 근사다.

interface ConfInput {
    wins: Map<string, number>;
    losses: Map<string, number>;
    remaining: Map<string, number>;
    pd: Map<string, number>;
    /** 실제 상태: NBA 타이브레이커로 정한 시드 순서. 있으면 그대로 쓴다. */
    order?: string[];
    /** 가정 상태: 모든 경기가 끝났을 때만 호출해 시드 순서를 구한다(비싸서 지연 평가). */
    orderFn?: () => string[];
}

interface TeamEval {
    rank: number;
    autoMagic: number;
    entryMagic: number;
    autoElim: number;
    entryElim: number;
    status: RaceStatus;
}

function evalConference(slugs: string[], inp: ConfInput, zones: RaceZones): { order: string[]; byTeam: Map<string, TeamEval>; totalRemaining: number } {
    const { autoK, lastK } = zones;
    const get = (m: Map<string, number>, s: string) => m.get(s) ?? 0;
    const winsOf = (s: string) => get(inp.wins, s);
    const maxWinsOf = (s: string) => winsOf(s) + get(inp.remaining, s);
    const totalRemaining = slugs.reduce((sum, s) => sum + get(inp.remaining, s), 0);
    // 순서: 실제 상태는 NBA 타이브레이커 결과(inp.order). 가정 상태는 마지막 경기가 끝났을 때만 정확한 순서가 필요해
    // orderFn으로 구하고, 그 외엔 근사(승패 마진 → 득실차) — 확정/탈락 판정은 순서가 아니라 승수 비교(동률=위협)라 영향 없음.
    const order = inp.order
        ?? (totalRemaining === 0 && inp.orderFn ? inp.orderFn() : null)
        ?? [...slugs].sort((a, b) =>
            ((winsOf(b) - get(inp.losses, b)) - (winsOf(a) - get(inp.losses, a))) || get(inp.pd, b) - get(inp.pd, a));

    const byTeam = new Map<string, TeamEval>();
    order.forEach((slug, idx) => {
        const others = order.filter(s => s !== slug);
        const rank = idx + 1;
        const wins = winsOf(slug);
        const maxWins = maxWinsOf(slug);

        // 상위 K 확정: K번째로 높은 타팀 최대승수가 내 최종 승수보다 작아야 함.
        const magicTop = (K: number): number => {
            const kth = kthLargest(others.map(maxWinsOf), K);
            return kth === null ? 0 : kth - wins + 1;
        };
        // 상위 K 탈락: K번째로 높은 타팀 "현재" 승수가 내 최대승수를 넘으면 탈락.
        const elimTop = (K: number): number => {
            const kth = kthLargest(others.map(winsOf), K);
            return kth === null ? Number.POSITIVE_INFINITY : maxWins - kth + 1;
        };

        const autoMagic = autoK > 0 ? magicTop(autoK) : Number.POSITIVE_INFINITY;
        const entryMagic = magicTop(lastK);
        const autoElim = autoK > 0 ? elimTop(autoK) : 0;
        const entryElim = elimTop(lastK);

        let status: RaceStatus;
        if (totalRemaining === 0) {
            // 모든 경기 종료 — 순위가 곧 결과 (동률은 이미 득실차로 정렬됨)
            status = rank <= autoK ? 'clinched_auto' : rank <= lastK ? 'clinched_entry' : 'eliminated';
        } else if (entryElim <= 0) status = 'eliminated';
        else if (autoMagic <= 0) status = 'clinched_auto';
        else if (entryMagic <= 0) status = 'clinched_entry';
        else if (rank <= autoK) status = 'auto_zone';
        else if (rank <= lastK) status = 'playin_zone';
        else status = 'chasing';

        byTeam.set(slug, { rank, autoMagic, entryMagic, autoElim, entryElim, status });
    });
    return { order, byTeam, totalRemaining };
}

export function computeConferenceRaces(
    leagueTeams: LeagueTeamRow[],
    statsMap: Record<string, MultiStandingsRecord>,
    schedule: Game[],
    nowMs: number,
    playoffTeamsPerConf: number,
    playInEnabled: boolean,
): Record<'East' | 'West', ConferenceRace> {
    const { autoK, lastK } = getRaceZones(playoffTeamsPerConf, playInEnabled);

    const pending = schedule
        .filter(g => !g.isPlayoff && !g.isAllstar && !isFinal(g, nowMs))
        .sort((a, b) => a.date.localeCompare(b.date));
    const pendingByTeam = new Map<string, Game[]>();
    for (const t of leagueTeams) pendingByTeam.set(t.team_slug, []);
    for (const g of pending) {
        pendingByTeam.get(g.homeTeamId)?.push(g);
        pendingByTeam.get(g.awayTeamId)?.push(g);
    }

    // 공개된 경기 결과로 만든 기록부 + 타이브레이커 컨텍스트(디비전 우승/진출권 팀). 진출권 = 플레이인 포함 lastK.
    const ledger = buildRaceLedger(leagueTeams, schedule, nowMs);
    const ctx = buildContext(ledger, { eligibleCount: lastK, drawSeed: 'live' });
    const pointDiffOf = (slug: string): number => ledger.pd.get(slug) ?? 0;

    const buildInput = (slugs: string[], order: string[]): ConfInput => {
        const inp: ConfInput = { wins: new Map(), losses: new Map(), remaining: new Map(), pd: new Map(), order };
        for (const s of slugs) {
            inp.wins.set(s, ledger.wins.get(s) ?? 0);
            inp.losses.set(s, ledger.losses.get(s) ?? 0);
            inp.remaining.set(s, pendingByTeam.get(s)?.length ?? 0);
            inp.pd.set(s, pointDiffOf(s));
        }
        return inp;
    };

    const build = (conf: 'East' | 'West'): ConferenceRace => {
        const teams = leagueTeams.filter(t => t.conference === conf);
        const slugs0 = teams.map(t => t.team_slug);
        const ro = rankConference(ledger, conf, ctx);
        const ev = evalConference(slugs0, buildInput(slugs0, ro.order), { autoK, lastK });
        const slugs = ev.order;
        const totalRemaining = ev.totalRemaining;
        const remainingOf = (s: string) => pendingByTeam.get(s)?.length ?? 0;

        const rows: RaceRow[] = slugs.map((slug, idx) => {
            const rec = statsMap[slug];
            const e = ev.byTeam.get(slug)!;
            const { rank, autoMagic, entryMagic, autoElim, entryElim, status } = e;
            const wins = ledger.wins.get(slug) ?? 0;
            const losses = ledger.losses.get(slug) ?? 0;
            const remaining = remainingOf(slug);
            const maxWins = wins + remaining;

            const myPending = pendingByTeam.get(slug) ?? [];
            const nearby = new Set(slugs.filter((s, i) => s !== slug && Math.abs(i - idx) <= 3));
            const h2h = new Map<string, number>();
            for (const g of myPending) {
                const opp = g.homeTeamId === slug ? g.awayTeamId : g.homeTeamId;
                if (nearby.has(opp)) h2h.set(opp, (h2h.get(opp) ?? 0) + 1);
            }
            const remainingSos = myPending.length > 0
                ? myPending.reduce((sum, g) => sum + (statsMap[g.homeTeamId === slug ? g.awayTeamId : g.homeTeamId]?.pct ?? 0), 0) / myPending.length
                : 0;

            return {
                slug, rank, wins, losses, remaining, maxWins,
                margin: wins - losses,
                pointDiff: pointDiffOf(slug),
                remainingSos,
                autoMagic, entryMagic, autoElim, entryElim, status,
                rivalGames: [...h2h].map(([s, games]) => ({ slug: s, games })).sort((a, b) => b.games - a.games),
                nextGames: myPending.slice(0, 5).map(g => ({
                    oppSlug: g.homeTeamId === slug ? g.awayTeamId : g.homeTeamId,
                    isHome: g.homeTeamId === slug,
                    date: g.date.slice(0, 10),
                })),
            };
        });

        // 컷라인에 걸친 동률 그룹(승률이 같은 팀들) — NBA 타이브레이커가 무엇으로 갈랐는지 보여주기 위함
        const ties: TieGroup[] = [];
        const pctOfRow = (r: RaceRow) => (r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : 0);
        let i = 0;
        while (i < rows.length) {
            let j = i;
            while (j + 1 < rows.length && pctOfRow(rows[j + 1]) === pctOfRow(rows[i])) j++;
            if (j > i) {
                const crosses = (k: number) => k > 0 && i + 1 <= k && k < j + 1; // 순위 i+1..j+1 사이에 컷(k|k+1)이 걸침
                const boundary = crosses(autoK) && autoK !== lastK ? 'auto' : crosses(lastK) ? 'entry' : null;
                if (boundary) {
                    const group = rows.slice(i, j + 1);
                    const members = new Set(group.map(r => r.slug));
                    const used = ro.steps.filter(st => st.teams.every(t => members.has(t)));
                    const details: Record<string, string> = {};
                    for (const st of used) for (const t of st.teams) details[t] = st.detail[t];
                    ties.push({
                        wins: group[0].wins, losses: group[0].losses,
                        slugs: group.map(r => r.slug),
                        boundary,
                        criteria: [...new Set(used.map(st => st.criterion))],
                        details,
                        drawn: used.some(st => st.criterion === 'draw'),
                    });
                }
            }
            i = j + 1;
        }

        return { rows, ties, totalRemaining };
    };

    return { East: build('East'), West: build('West') };
}

// ── 중요한 경기 (플레이오프/플레이인 확정·탈락을 가르는 경기) ──────────────────────
// 남은 경기마다 "홈팀 승 / 원정팀 승" 두 가정으로 컨퍼런스 판정(evalConference)을 다시 돌려,
// 결과에 따라 어떤 팀의 상태가 아래 넷 중 하나로 "갈리는" 경기만 올린다. 단순히 순위가 바뀔 수 있는
// 경기(사실상 모든 경기)나 컷라인 팀끼리의 맞대결은 포함하지 않는다.
//  - 확정(clinch)    : 플레이오프 직행 확정 / 플레이인 진출 확정(플레이인 없으면 플레이오프 진출 확정)
//  - 탈락(elimination): 플레이오프 직행 탈락(플레이인행 확정) / 플레이인 진출 탈락(플레이인 없으면 플레이오프 탈락)
// 같은 (팀, 사건)은 가장 가까운 기회의 날짜만 표시한다(앞선 기회가 무산되면 다음 경기가 올라옴).
// 판정은 매직/탈락넘버와 같은 보수적 기준(동률=위협)이라 실제로는 이미 사실상 결정난 경기가 포함될 수 있다.

export type KeyGameKind = 'elimination' | 'clinch';

export interface KeyGame {
    id: string;
    date: string;
    homeSlug: string;
    awaySlug: string;
    kinds: KeyGameKind[];
    /** 두 팀이 같은 컨퍼런스일 때만: 두 팀이 동률이 되면 시드를 가져가는 팀(현재 기록에 NBA 타이브레이커 적용).
     *  holderSlug=null이면 추첨. 경기가 남아 있어 기록은 바뀔 수 있다. */
    tiebreak: { holderSlug: string | null; criterion: CriterionId; holderDetail: string; otherDetail: string } | null;
    /** 한 줄 설명들 (예: "보스턴 패배 시 플레이인 진출 탈락") */
    notes: string[];
}

type RaceEvent = 'eliminated' | 'clinched_auto' | 'clinched_entry' | 'auto_out';

export function computeKeyGames(
    conf: 'East' | 'West',
    leagueTeams: LeagueTeamRow[],
    statsMap: Record<string, MultiStandingsRecord>,
    schedule: Game[],
    nowMs: number,
    playoffTeamsPerConf: number,
    playInEnabled: boolean,
    nameOf: (slug: string) => string,
): KeyGame[] {
    const zones = getRaceZones(playoffTeamsPerConf, playInEnabled);
    const hasPlayInTier = playInEnabled && zones.autoK !== zones.lastK;
    const slugs = leagueTeams.filter(t => t.conference === conf).map(t => t.team_slug);
    const inConf = new Set(slugs);

    const pending = schedule
        .filter(g => !g.isPlayoff && !g.isAllstar && !isFinal(g, nowMs) && (inConf.has(g.homeTeamId) || inConf.has(g.awayTeamId)))
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

    // 기록부(맞대결 전적 포함) + 타이브레이커 컨텍스트 — 순서/타이브레이커 보유 팀 판정용
    const ledger = buildRaceLedger(leagueTeams, schedule, nowMs);
    const ctx = buildContext(ledger, { eligibleCount: zones.lastK, drawSeed: 'live' });
    const base: ConfInput = { wins: new Map(), losses: new Map(), remaining: new Map(), pd: new Map(), order: rankConference(ledger, conf, ctx).order };
    for (const s of slugs) {
        base.wins.set(s, ledger.wins.get(s) ?? 0);
        base.losses.set(s, ledger.losses.get(s) ?? 0);
        base.remaining.set(s, 0);
        base.pd.set(s, ledger.pd.get(s) ?? 0);
    }
    for (const g of schedule) {
        if (g.isPlayoff || g.isAllstar || isFinal(g, nowMs)) continue;
        for (const s of [g.homeTeamId, g.awayTeamId]) if (inConf.has(s)) base.remaining.set(s, (base.remaining.get(s) ?? 0) + 1);
    }
    const baseline = evalConference(slugs, base, zones);

    const eventLabel = (e: RaceEvent): string =>
        e === 'clinched_auto' ? (hasPlayInTier ? '플레이오프 직행 확정' : '플레이오프 진출 확정')
            : e === 'clinched_entry' ? '플레이인 진출 확정'
            : e === 'auto_out' ? '플레이오프 직행 탈락'
            : (hasPlayInTier ? '플레이인 진출 탈락' : '플레이오프 진출 탈락');

    // 한 팀의 "새로 생긴" 확정/탈락 이벤트 — 가정 상태(after)를 현재(before)와 비교
    const eventsOf = (before: TeamEval, after: TeamEval): RaceEvent[] => {
        const out: RaceEvent[] = [];
        if (after.status === 'eliminated') { if (before.status !== 'eliminated') out.push('eliminated'); }
        else if (after.status === 'clinched_auto') { if (before.status !== 'clinched_auto') out.push('clinched_auto'); }
        else if (after.status === 'clinched_entry') { if (before.status !== 'clinched_entry' && before.status !== 'clinched_auto') out.push('clinched_entry'); }
        // 플레이인 구간이 있을 때 직행권에서 밀려나는 것(플레이인행 확정)도 상태가 갈리는 사건이다
        if (hasPlayInTier && after.status !== 'eliminated' && after.autoElim <= 0 && before.autoElim > 0) out.push('auto_out');
        return out;
    };

    // 가정 상태 — 경기 하나의 결과만 반영 (참가 팀 중 이 컨퍼런스 소속만)
    const withResult = (g: Game, winner: string): ConfInput => {
        const inp: ConfInput = { wins: new Map(base.wins), losses: new Map(base.losses), remaining: new Map(base.remaining), pd: base.pd };
        // 이 경기가 마지막 경기라면 시드 순서가 곧 결과 — 이 경기 결과(맞대결 전적 포함)를 반영한 순서를 지연 평가한다
        const loserSlug = winner === g.homeTeamId ? g.awayTeamId : g.homeTeamId;
        inp.orderFn = () => {
            const l = cloneLedger(ledger);
            recordResult(l, winner, loserSlug);
            return rankConference(l, conf, buildContext(l, { eligibleCount: zones.lastK, drawSeed: 'live' })).order;
        };
        for (const s of [g.homeTeamId, g.awayTeamId]) {
            if (!inConf.has(s)) continue;
            inp.remaining.set(s, Math.max(0, (inp.remaining.get(s) ?? 0) - 1));
            if (s === winner) inp.wins.set(s, (inp.wins.get(s) ?? 0) + 1);
            else inp.losses.set(s, (inp.losses.get(s) ?? 0) + 1);
        }
        return inp;
    };

    // 1) 경기마다 "이 경기 결과로 새로 생기는" 확정/탈락 사건을 모은다.
    interface Hit { game: Game; team: string; event: RaceEvent; winner: string }
    const hits: Hit[] = [];
    for (const g of pending) {
        const evHome = evalConference(slugs, withResult(g, g.homeTeamId), zones);
        const evAway = evalConference(slugs, withResult(g, g.awayTeamId), zones);
        for (const t of slugs) {
            const before = baseline.byTeam.get(t)!;
            if (before.status === 'eliminated' || before.status === 'clinched_auto') continue; // 이미 끝난 팀
            const eHome = eventsOf(before, evHome.byTeam.get(t)!);
            const eAway = eventsOf(before, evAway.byTeam.get(t)!);
            for (const [winner, mine, other] of [[g.homeTeamId, eHome, eAway], [g.awayTeamId, eAway, eHome]] as const) {
                for (const e of mine) {
                    if (other.includes(e)) continue; // 이 경기 결과와 무관하게 일어나는 일
                    hits.push({ game: g, team: t, event: e, winner });
                }
            }
        }
    }

    // 2) (팀, 사건)마다 "가장 가까운 기회"가 있는 날짜의 경기만 남긴다. 한 승리로 확정되는 팀은 남은
    //    경기가 14개여도 14경기 전부가 "승리 시 확정"이 되는데, 그건 중요한 경기라 할 수 없다 — 앞선
    //    기회가 무산되면 다음 경기가 자연히 그 자리를 이어받는다(스포츠 중계의 "오늘 확정 가능" 방식).
    const earliest = new Map<string, string>();
    for (const h of hits) {
        const key = `${h.team}|${h.event}`;
        const d = h.game.date.slice(0, 10);
        if (!earliest.has(key) || d < earliest.get(key)!) earliest.set(key, d);
    }

    const byGame = new Map<string, KeyGame>();
    for (const h of hits) {
        const g = h.game;
        if (g.date.slice(0, 10) !== earliest.get(`${h.team}|${h.event}`)) continue;
        let kg = byGame.get(g.id);
        if (!kg) {
            let tiebreak: KeyGame['tiebreak'] = null;
            if (inConf.has(g.homeTeamId) && inConf.has(g.awayTeamId)) {
                const { winner, step } = compareTied(g.homeTeamId, g.awayTeamId, ctx);
                const loser = winner === g.homeTeamId ? g.awayTeamId : g.homeTeamId;
                tiebreak = step.criterion === 'draw'
                    ? { holderSlug: null, criterion: 'draw', holderDetail: '추첨', otherDetail: '추첨' }
                    : { holderSlug: winner, criterion: step.criterion, holderDetail: step.detail[winner], otherDetail: step.detail[loser] };
            }
            kg = { id: g.id, date: g.date.slice(0, 10), homeSlug: g.homeTeamId, awaySlug: g.awayTeamId, kinds: [], tiebreak, notes: [] };
            byGame.set(g.id, kg);
        }
        const kind: KeyGameKind = h.event === 'eliminated' || h.event === 'auto_out' ? 'elimination' : 'clinch';
        if (!kg.kinds.includes(kind)) kg.kinds.push(kind);
        const isPlayer = h.team === g.homeTeamId || h.team === g.awayTeamId;
        kg.notes.push(isPlayer
            ? `${nameOf(h.team)} ${h.team === h.winner ? '승리' : '패배'} 시 ${eventLabel(h.event)}`
            : `${nameOf(h.winner)} 승리 시 ${nameOf(h.team)} ${eventLabel(h.event)}`);
    }
    // pending이 날짜·id 순이라 삽입 순서가 곧 표시 순서
    return [...byGame.values()];
}

// ── 경우의 수 문장 ───────────────────────────────────────────────────────────

export function buildScenarioLines(row: RaceRow, zones: RaceZones, playInEnabled: boolean): string[] {
    const lines: string[] = [];
    const { remaining } = row;
    const hasPlayInTier = playInEnabled && zones.autoK !== zones.lastK;

    // 확정 조건 한 줄: 남은 경기 전승으로 닿는가(자력) / 경쟁팀 도움이 필요한가
    const magicLine = (label: string, m: number): string => {
        if (m <= 0) return `${label} 확정`;
        if (m <= remaining) return `${label}: 남은 ${remaining}경기 중 ${m}승이면 확정 (경쟁팀 결과 무관)`;
        return `${label}: 전승해도 부족 — 경쟁팀 패배가 ${m - remaining}회 이상 필요 (합산 매직넘버 ${m})`;
    };
    const elimLine = (label: string, e: number): string =>
        e <= 0 ? `${label} 불가 확정` : `${label}: 본인 패배 + 경쟁팀 승리가 합산 ${e}회 누적되면 탈락`;

    if (row.status === 'eliminated') {
        lines.push('플레이오프 진출 탈락 확정');
        return lines;
    }
    if (row.status === 'clinched_auto') {
        lines.push('플레이오프 직행 확정 — 남은 경기는 시드 순위 경쟁');
        return lines;
    }

    if (zones.autoK > 0) lines.push(magicLine(hasPlayInTier ? '직행' : '진출', row.autoMagic));
    if (hasPlayInTier && row.status !== 'clinched_entry') lines.push(magicLine('플레이인 이상', row.entryMagic));
    if (row.status === 'clinched_entry') lines.push('플레이인 이상 확정 — 직행 경쟁 중');

    if (hasPlayInTier) {
        if (row.autoElim <= 0) lines.push('직행은 불가 — 플레이인 이상 경쟁');
        else lines.push(elimLine('직행', row.autoElim));
    }
    if (row.status !== 'clinched_entry' || !hasPlayInTier) lines.push(elimLine(hasPlayInTier ? '플레이인 이상' : '진출', row.entryElim));
    return lines;
}

// ── 확률(몬테카를로) ─────────────────────────────────────────────────────────
// computePlayoffOddsMap(multiSeasonUtils.ts)과 같은 log5 방식이되, ① 직행/플레이인 참가/최종 진출을
// 따로 집계하고 ② 동률은 실제 NBA 타이브레이커(맞대결·디비전·컨퍼런스 전적 등)로 가른다 — 시뮬레이션 경기마다
// 전적을 기록부에 쌓는다. PO%가 순위표 화면의 값과 약간 다를 수 있는 이유(그쪽은 동률을 무작위 처리).

export const RACE_ODDS_ITERATIONS = 1000;

export interface RaceOdds {
    auto: number;
    /** 플레이인에 참가하게 될 확률 (직행도 탈락도 아닌 구간으로 끝남) */
    playIn: number;
    /** 최종 플레이오프 진출 확률 (직행 + 플레이인 통과) */
    qualify: number;
}

export function computeRaceOdds(
    leagueTeams: LeagueTeamRow[],
    statsMap: Record<string, MultiStandingsRecord>,
    schedule: Game[],
    nowMs: number,
    playoffTeamsPerConf: number,
    playInEnabled: boolean,
): Record<string, RaceOdds> {
    const { autoK, lastK } = getRaceZones(playoffTeamsPerConf, playInEnabled);
    const pendingGames = schedule.filter(g => !g.isPlayoff && !g.isAllstar && !isFinal(g, nowMs));

    const baseLedger = buildRaceLedger(leagueTeams, schedule, nowMs);
    const slugsByConf: Record<'East' | 'West', string[]> = {
        East: leagueTeams.filter(t => t.conference === 'East').map(t => t.team_slug),
        West: leagueTeams.filter(t => t.conference === 'West').map(t => t.team_slug),
    };

    const autoCnt: Record<string, number> = {};
    const playInCnt: Record<string, number> = {};
    const qualCnt: Record<string, number> = {};
    for (const t of leagueTeams) { autoCnt[t.team_slug] = 0; playInCnt[t.team_slug] = 0; qualCnt[t.team_slug] = 0; }

    const pctOf = (l: Ledger, s: string) => {
        const w = l.wins.get(s) ?? 0, lo = l.losses.get(s) ?? 0;
        return w / ((w + lo) || 1);
    };

    for (let iter = 0; iter < RACE_ODDS_ITERATIONS; iter++) {
        // 시뮬레이션 경기마다 맞대결/디비전/컨퍼런스 전적이 쌓이므로 최종 동률은 실제 NBA 타이브레이커로 가른다.
        // (득실차는 경기 점수를 만들지 않아 현재 값 고정 — 득실차까지 내려가는 동률만 근사, 추첨은 시행마다 무작위)
        const l = cloneLedger(baseLedger);
        for (const g of pendingGames) {
            if (!l.teams.has(g.homeTeamId) || !l.teams.has(g.awayTeamId)) continue;
            const homeWins = Math.random() < log5WinProb(pctOf(l, g.homeTeamId), pctOf(l, g.awayTeamId));
            recordResult(l, homeWins ? g.homeTeamId : g.awayTeamId, homeWins ? g.awayTeamId : g.homeTeamId);
        }
        const ctx = buildContext(l, { eligibleCount: lastK, drawSeed: `mc${iter}` });

        for (const conf of ['East', 'West'] as const) {
            if (slugsByConf[conf].length === 0) continue;
            const sorted = rankConference(l, conf, ctx).order;

            if (playInEnabled && sorted.length >= autoK + 4) {
                const auto = sorted.slice(0, autoK);
                const [s7, s8, s9, s10] = sorted.slice(autoK, autoK + 4);
                const win = (a: string, b: string) =>
                    Math.random() < log5WinProb(pctOf(l, a), pctOf(l, b)) ? { winner: a, loser: b } : { winner: b, loser: a };
                const r78 = win(s7, s8), r910 = win(s9, s10);
                const seed8 = win(r78.loser, r910.winner).winner;
                for (const t of auto) { autoCnt[t]++; qualCnt[t]++; }
                for (const t of [s7, s8, s9, s10]) playInCnt[t]++;
                qualCnt[r78.winner]++;
                qualCnt[seed8]++;
            } else {
                sorted.slice(0, playoffTeamsPerConf).forEach(t => { autoCnt[t]++; qualCnt[t]++; });
            }
        }
    }

    const out: Record<string, RaceOdds> = {};
    for (const t of leagueTeams) {
        out[t.team_slug] = {
            auto: autoCnt[t.team_slug] / RACE_ODDS_ITERATIONS,
            playIn: playInCnt[t.team_slug] / RACE_ODDS_ITERATIONS,
            qualify: qualCnt[t.team_slug] / RACE_ODDS_ITERATIONS,
        };
    }
    return out;
}

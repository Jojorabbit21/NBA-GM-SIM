
import type { Game } from '../../../types';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { isFinal } from './multiGameReveal';

// ── W/L 단순 집계 (홈 화면 전용) ─────────────────────────────────────────────
// serverNowMs: useServerClock() 값 — final 상태(scheduledAt + 10분 경과)인 경기만 집계.
// 이렇게 해야 사전계산되었지만 아직 정시가 안 된 경기의 결과가 W/L에 노출되지 않는다.

// isTournament: true면 플레이오프 경기(isPlayoff)도 집계에 포함(토너먼트 리그는 전 경기가
// isPlayoff=true라 이 필터를 걸면 항상 0승0패가 됨). main_league는 기본값(false)으로 정규시즌
// 전적만 집계 — 그렇지 않으면 정규시즌 종료 후 플레이오프 결과가 정규시즌 W/L에 섞여버린다.
export function computeWL(schedule: Game[], teamSlugs: string[], serverNowMs: number, isTournament: boolean = false) {
    const wl: Record<string, { wins: number; losses: number }> = {};
    for (const slug of teamSlugs) wl[slug] = { wins: 0, losses: 0 };
    for (const g of schedule) {
        if (!g.played || g.homeScore == null || g.awayScore == null) continue;
        if (!isFinal(g, serverNowMs)) continue;
        if (!isTournament && g.isPlayoff) continue;
        const homeWon = g.homeScore > g.awayScore;
        if (wl[g.homeTeamId]) homeWon ? wl[g.homeTeamId].wins++ : wl[g.homeTeamId].losses++;
        if (wl[g.awayTeamId]) homeWon ? wl[g.awayTeamId].losses++ : wl[g.awayTeamId].wins++;
    }
    return wl;
}

// ── 확장 스탠딩 통계 (순위표 전용) ───────────────────────────────────────────

export interface MultiStandingsRecord {
    slug: string;
    wins: number;
    losses: number;
    pct: number;
    home: { w: number; l: number };
    away: { w: number; l: number };
    div: { w: number; l: number };
    conf: { w: number; l: number };
    ppg: number;
    oppg: number;
    diff: number;
    streak: string;
    l10: { w: number; l: number };
}

/** 팀별 conference/division 소속 — DIV/CONF 전적 집계에만 쓰인다. division이 없는 팀(가상 팀 등)은 null. */
export interface MultiTeamMeta {
    conference: string | null;
    division: string | null;
}

// isTournament: computeWL과 동일 규칙 — main_league는 기본값(false)으로 플레이오프 경기를
// 순위표 집계(W/L/PCT/HOME/AWAY/DIV/CONF/PPG/OPPG/STRK/L10)에서 제외한다.
export function computeMultiStandingsStats(
    slugs: string[],
    schedule: Game[],
    serverNowMs: number,
    teamMeta: Record<string, MultiTeamMeta> = {},
    isTournament: boolean = false,
): Record<string, MultiStandingsRecord> {
    const result: Record<string, MultiStandingsRecord> = {};
    for (const slug of slugs) {
        result[slug] = {
            slug, wins: 0, losses: 0, pct: 0,
            home: { w: 0, l: 0 }, away: { w: 0, l: 0 },
            div: { w: 0, l: 0 }, conf: { w: 0, l: 0 },
            ppg: 0, oppg: 0, diff: 0, streak: '-', l10: { w: 0, l: 0 },
        };
    }

    const teamGames: Record<string, { date: string; won: boolean; pts: number; opp: number }[]> = {};
    for (const slug of slugs) teamGames[slug] = [];

    for (const g of schedule) {
        if (!g.played || g.homeScore == null || g.awayScore == null) continue;
        if (!isFinal(g, serverNowMs)) continue;
        if (!isTournament && g.isPlayoff) continue;
        const hs = g.homeScore;
        const as = g.awayScore;
        const homeWon = hs > as;

        const hr = result[g.homeTeamId];
        const ar = result[g.awayTeamId];
        if (!hr || !ar) continue;

        if (homeWon) { hr.wins++; ar.losses++; hr.home.w++; ar.away.l++; }
        else          { ar.wins++; hr.losses++; hr.home.l++; ar.away.w++; }

        const hMeta = teamMeta[g.homeTeamId];
        const aMeta = teamMeta[g.awayTeamId];
        if (hMeta?.division && hMeta.division === aMeta?.division) {
            if (homeWon) { hr.div.w++; ar.div.l++; } else { ar.div.w++; hr.div.l++; }
        }
        if (hMeta?.conference && hMeta.conference === aMeta?.conference) {
            if (homeWon) { hr.conf.w++; ar.conf.l++; } else { ar.conf.w++; hr.conf.l++; }
        }

        teamGames[g.homeTeamId]?.push({ date: g.date, won: homeWon, pts: hs, opp: as });
        teamGames[g.awayTeamId]?.push({ date: g.date, won: !homeWon, pts: as, opp: hs });
    }

    for (const slug of slugs) {
        const rec = result[slug];
        const games = teamGames[slug];
        const total = rec.wins + rec.losses;
        rec.pct = total > 0 ? rec.wins / total : 0;

        if (!games.length) continue;
        const totalPts = games.reduce((s, g) => s + g.pts, 0);
        const totalOpp = games.reduce((s, g) => s + g.opp, 0);
        rec.ppg  = totalPts / games.length;
        rec.oppg = totalOpp / games.length;
        rec.diff = rec.ppg - rec.oppg;

        games.sort((a, b) => b.date.localeCompare(a.date));
        const streakType = games[0].won ? 'W' : 'L';
        let streakCount = 1;
        for (let i = 1; i < games.length; i++) {
            if (games[i].won === games[0].won) streakCount++;
            else break;
        }
        rec.streak = `${streakType}${streakCount}`;

        const last10 = games.slice(0, 10);
        rec.l10 = { w: last10.filter(g => g.won).length, l: last10.filter(g => !g.won).length };
    }

    return result;
}

// ── PO%(플레이오프 진출 확률) — 몬테카를로 시뮬레이션 ────────────────────────
// 아직 결과가 공개되지 않은(!isFinal, 스포일러 방지 게이팅과 동일 기준) 경기들을
// log5 승률 공식으로 반복 시뮬레이션해서, 각 팀이 컨퍼런스 최종 진출권(플레이인
// 활성화 시 그 결과까지 반영한 최종 N팀)에 들어간 시행 비율을 확률로 쓴다.
// 이미 수학적으로 클린치/탈락이 확정된 팀은 어떤 시행에서도 결과가 갈리지 않으므로
// 자연히 정확히 100%/0%로 수렴한다. MultiStandingsView.tsx와 홈 화면(MultiSeasonPage.tsx)
// 양쪽에서 같은 PO% 값을 보여줘야 해서 여기(공유 유틸)로 옮김 — 화면마다 로컬 사본을 두는
// 소규모 프레젠테이셔널 로직과 달리, 이건 1000회 몬테카를로 시뮬레이션이라 중복 구현 시
// 두 화면의 결과가 미묘하게 어긋날 위험이 있다.

export const PLAYOFF_ODDS_ITERATIONS = 1000;

export function log5WinProb(pA: number, pB: number): number {
    if (pA <= 0 && pB <= 0) return 0.5;
    const denom = pA + pB - 2 * pA * pB;
    if (denom <= 0) return pA > pB ? 1 : pA < pB ? 0 : 0.5;
    return (pA - pA * pB) / denom;
}

export function computePlayoffOddsMap(
    leagueTeams: LeagueTeamRow[],
    statsMap: Record<string, MultiStandingsRecord>,
    schedule: Game[],
    nowMs: number,
    playoffTeamsPerConf: number,
    playInEnabled: boolean,
): Record<string, number> {
    const autoClinchCount = playInEnabled ? Math.max(0, playoffTeamsPerConf - 2) : playoffTeamsPerConf;

    const baseWL = new Map<string, { w: number; l: number }>();
    for (const t of leagueTeams) {
        const rec = statsMap[t.team_slug];
        baseWL.set(t.team_slug, { w: rec?.wins ?? 0, l: rec?.losses ?? 0 });
    }

    // 결과가 이미 나왔어도 아직 비공개(!isFinal)면 실제 스코어를 들여다보지 않고
    // 매 시행 log5 확률로 새로 결정한다 — 순위 화면의 다른 스탯들과 동일한 스포일러 기준.
    const pendingGames = schedule.filter(g => !g.isPlayoff && !isFinal(g, nowMs));

    const teamsByConf: Record<'East' | 'West', LeagueTeamRow[]> = {
        East: leagueTeams.filter(t => t.conference === 'East'),
        West: leagueTeams.filter(t => t.conference === 'West'),
    };

    const qualifiedCount: Record<string, number> = {};
    for (const t of leagueTeams) qualifiedCount[t.team_slug] = 0;

    const pickWinner = (
        wl: Map<string, { w: number; l: number }>, a: LeagueTeamRow, b: LeagueTeamRow,
    ): { winner: LeagueTeamRow; loser: LeagueTeamRow } => {
        const ra = wl.get(a.team_slug)!, rb = wl.get(b.team_slug)!;
        const pa = ra.w / ((ra.w + ra.l) || 1);
        const pb = rb.w / ((rb.w + rb.l) || 1);
        return Math.random() < log5WinProb(pa, pb) ? { winner: a, loser: b } : { winner: b, loser: a };
    };

    for (let iter = 0; iter < PLAYOFF_ODDS_ITERATIONS; iter++) {
        const wl = new Map<string, { w: number; l: number }>();
        for (const [slug, rec] of baseWL) wl.set(slug, { w: rec.w, l: rec.l });

        // 남은(비공개 포함) 정규시즌 경기를 전부 한 번씩 가상 시뮬레이션.
        for (const g of pendingGames) {
            const home = wl.get(g.homeTeamId);
            const away = wl.get(g.awayTeamId);
            if (!home || !away) continue;
            const pHome = home.w / ((home.w + home.l) || 1);
            const pAway = away.w / ((away.w + away.l) || 1);
            if (Math.random() < log5WinProb(pHome, pAway)) { home.w++; away.l++; }
            else { away.w++; home.l++; }
        }

        // 시뮬레이션된 최종 성적으로 컨퍼런스별 진출팀 확정(자동진출 + 플레이인).
        for (const conf of ['East', 'West'] as const) {
            const teams = teamsByConf[conf];
            if (teams.length === 0) continue;

            const sorted = [...teams].sort((a, b) => {
                const ra = wl.get(a.team_slug)!, rb = wl.get(b.team_slug)!;
                const pa = ra.w / ((ra.w + ra.l) || 1);
                const pb = rb.w / ((rb.w + rb.l) || 1);
                if (pb !== pa) return pb - pa;
                return Math.random() - 0.5; // 동률 타이브레이커는 근사(무작위)로 처리
            });

            let qualified: LeagueTeamRow[];
            if (playInEnabled && sorted.length >= autoClinchCount + 4) {
                const auto = sorted.slice(0, autoClinchCount);
                const [s7, s8, s9, s10] = sorted.slice(autoClinchCount, autoClinchCount + 4);
                const r78   = pickWinner(wl, s7, s8);
                const r910  = pickWinner(wl, s9, s10);
                const seed8 = pickWinner(wl, r78.loser, r910.winner).winner;
                qualified = [...auto, r78.winner, seed8];
            } else {
                qualified = sorted.slice(0, playoffTeamsPerConf);
            }

            for (const t of qualified) qualifiedCount[t.team_slug]++;
        }
    }

    const result: Record<string, number> = {};
    for (const t of leagueTeams) result[t.team_slug] = (qualifiedCount[t.team_slug] ?? 0) / PLAYOFF_ODDS_ITERATIONS;
    return result;
}

// ── 날짜 포맷 ─────────────────────────────────────────────────────────────────

export function fmtDate(d: string) {
    const dt = new Date(d.slice(0, 10) + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

export function fmtDateFull(d: string) {
    const dt = new Date(d.slice(0, 10) + 'T00:00:00');
    return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일`;
}

export function fmtMonthLabel(d: string) {
    const dt = new Date(d.slice(0, 10) + 'T00:00:00');
    return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월`;
}

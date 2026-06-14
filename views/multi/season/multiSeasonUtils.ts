
import type { Game } from '../../../types';
import { isFinal } from './multiGameReveal';

// ── W/L 단순 집계 (홈 화면 전용) ─────────────────────────────────────────────
// serverNowMs: useServerClock() 값 — final 상태(scheduledAt + 10분 경과)인 경기만 집계.
// 이렇게 해야 사전계산되었지만 아직 정시가 안 된 경기의 결과가 W/L에 노출되지 않는다.

export function computeWL(schedule: Game[], teamSlugs: string[], serverNowMs: number) {
    const wl: Record<string, { wins: number; losses: number }> = {};
    for (const slug of teamSlugs) wl[slug] = { wins: 0, losses: 0 };
    for (const g of schedule) {
        if (!g.played || g.homeScore == null || g.awayScore == null) continue;
        if (!isFinal(g, serverNowMs)) continue;
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
    ppg: number;
    oppg: number;
    diff: number;
    streak: string;
    l10: { w: number; l: number };
}

export function computeMultiStandingsStats(
    slugs: string[],
    schedule: Game[],
    serverNowMs: number,
): Record<string, MultiStandingsRecord> {
    const result: Record<string, MultiStandingsRecord> = {};
    for (const slug of slugs) {
        result[slug] = {
            slug, wins: 0, losses: 0, pct: 0,
            home: { w: 0, l: 0 }, away: { w: 0, l: 0 },
            ppg: 0, oppg: 0, diff: 0, streak: '-', l10: { w: 0, l: 0 },
        };
    }

    const teamGames: Record<string, { date: string; won: boolean; pts: number; opp: number }[]> = {};
    for (const slug of slugs) teamGames[slug] = [];

    for (const g of schedule) {
        if (!g.played || g.homeScore == null || g.awayScore == null) continue;
        if (!isFinal(g, serverNowMs)) continue;
        const hs = g.homeScore;
        const as = g.awayScore;
        const homeWon = hs > as;

        const hr = result[g.homeTeamId];
        const ar = result[g.awayTeamId];
        if (!hr || !ar) continue;

        if (homeWon) { hr.wins++; ar.losses++; hr.home.w++; ar.away.l++; }
        else          { ar.wins++; hr.losses++; hr.home.l++; ar.away.w++; }

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

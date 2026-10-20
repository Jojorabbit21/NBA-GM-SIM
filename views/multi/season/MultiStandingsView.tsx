
import React, { useState, useMemo, useRef } from 'react';
import { Spinner } from '../../../components/common/Spinner';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import { useSeasonContext } from './seasonContext';
import { computeMultiStandingsStats, computePlayoffOddsMap, fmtWinPct } from './multiSeasonUtils';
import type { MultiStandingsRecord, MultiTeamMeta } from './multiSeasonUtils';
import { isFinal, resolveRealAt } from './multiGameReveal';
import { useServerClockBucket } from '../../../utils/serverClock';
import { PostseasonBracket } from './PostseasonBracket';
import {
    Table, TableHead, TableBody, TableRow,
    TableHeaderCell, TableCell,
} from '../../../components/common/Table';
import { TEAM_DATA } from '../../../data/teamData';
import { DIVISION_KOREAN } from '../../../data/mappings';
import { CONFERENCE_COLORS } from '../../../utils/constants';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { TeamHover } from '../../../components/common/TeamHover';
import { SegmentedControl } from '../../../components/common/SegmentedControl';
import { useTableSort } from '../../../hooks/useTableSort';
import { buildRaceLedger } from './playoffRaceUtils';
import { buildContext, rankGroup } from '../../../utils/nbaTiebreak';
import type { Game } from '../../../types/game';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';

// ── 스탠딩 테이블 (main_league 전용) ─────────────────────────────────────────

type StandingsMode = 'League' | 'Conference' | 'Division';

const MODE_TABS: { id: StandingsMode; label: string }[] = [
    { id: 'League', label: '리그' },
    { id: 'Conference', label: '컨퍼런스' },
    { id: 'Division', label: '디비전' },
];

// 실제 30팀만 division을 갖는다 — 가상 팀(토너먼트 보충용)은 division이 없어 '기타'로 묶인다.
const DIVISION_ORDER = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest'];

const COLS = [
    { key: 'rank',   label: '#',    width: 44,  align: 'center' as const, sortable: false },
    { key: 'team',   label: 'TEAM', width: 200, align: 'left'   as const, sortable: false },
    { key: 'wins',   label: 'W',    width: 48,  align: 'center' as const, sortable: true  },
    { key: 'losses', label: 'L',    width: 48,  align: 'center' as const, sortable: true  },
    { key: 'pct',    label: 'PCT',  width: 60,  align: 'center' as const, sortable: true  },
    { key: 'gb',     label: 'GB',   width: 52,  align: 'center' as const, sortable: false },
    { key: 'home',   label: 'HOME', width: 64,  align: 'center' as const, sortable: true  },
    { key: 'away',   label: 'AWAY', width: 64,  align: 'center' as const, sortable: true  },
    { key: 'div',    label: 'DIV',  width: 64,  align: 'center' as const, sortable: true  },
    { key: 'conf',   label: 'CONF', width: 64,  align: 'center' as const, sortable: true  },
    { key: 'ppg',    label: 'PPG',  width: 58,  align: 'center' as const, sortable: true  },
    { key: 'oppg',   label: 'OPPG', width: 58,  align: 'center' as const, sortable: true  },
    { key: 'diff',   label: 'DIFF', width: 58,  align: 'center' as const, sortable: true  },
    { key: 'streak', label: 'STRK', width: 56,  align: 'center' as const, sortable: true  },
    { key: 'l10',    label: 'L10',  width: 56,  align: 'center' as const, sortable: true  },
    { key: 'sos',    label: 'SOS',  width: 58,  align: 'center' as const, sortable: true  },
    { key: 'po',     label: 'PO%',  width: 92,  align: 'center' as const, sortable: true  },
];

const fmtRecord = (r: { w: number; l: number }) => `${r.w}-${r.l}`;
const fmtPpg    = (v: number) => v > 0 ? v.toFixed(1) : '-';
const fmtDiff   = (v: number) => v === 0 ? '0.0' : (v > 0 ? '+' : '') + v.toFixed(1);
// 값이 기준보다 크면 emerald, 작으면 red, 같으면 neutral. inverse면 방향 반대(패/실점처럼 낮을수록 좋은 지표).
const trendColor = (value: number, base: number, opts?: { inverse?: boolean; neutral?: string }): string => {
    if (value === base) return opts?.neutral ?? 'text-slate-500';
    return (value > base) !== !!opts?.inverse ? 'text-emerald-400' : 'text-red-400';
};

// 컷라인(1px 가로선) — auto=자동진출 경계(emerald), last=마지막 진출권(플레이인 포함, amber).
const CutLineRow: React.FC<{ colSpan: number; tone: 'auto' | 'last' }> = ({ colSpan, tone }) => (
    <tr>
        <td colSpan={colSpan} className="p-0">
            <div className={`h-[1px] ${tone === 'auto' ? 'bg-emerald-500/40' : 'bg-amber-500/40'}`} />
        </td>
    </tr>
);

const fmtGB     = (v: number) => v <= 0 ? '컷 안쪽' : `${v.toFixed(1)}경기 차`;

function getSortValue(rec: MultiStandingsRecord, key: string, sos: number, po: number): number {
    switch (key) {
        case 'wins':   return rec.wins;
        case 'losses': return rec.losses;
        case 'pct':    return rec.pct;
        case 'home':   return rec.home.w / Math.max(1, rec.home.w + rec.home.l);
        case 'away':   return rec.away.w / Math.max(1, rec.away.w + rec.away.l);
        case 'div':    return rec.div.w / Math.max(1, rec.div.w + rec.div.l);
        case 'conf':   return rec.conf.w / Math.max(1, rec.conf.w + rec.conf.l);
        case 'ppg':    return rec.ppg;
        case 'oppg':   return rec.oppg;
        case 'diff':   return rec.diff;
        case 'streak': {
            const n = parseInt(rec.streak.slice(1)) || 0;
            return rec.streak.startsWith('W') ? n : -n;
        }
        case 'l10':    return rec.l10.w;
        case 'sos':    return sos;
        case 'po':     return po;
        default:       return 0;
    }
}

function getCellValue(rec: MultiStandingsRecord, key: string, gb: string, sos: number, po: number): string {
    switch (key) {
        case 'wins':   return String(rec.wins);
        case 'losses': return String(rec.losses);
        case 'pct':    return fmtWinPct(rec.pct);
        case 'gb':     return gb;
        case 'home':   return fmtRecord(rec.home);
        case 'away':   return fmtRecord(rec.away);
        case 'div':    return fmtRecord(rec.div);
        case 'conf':   return fmtRecord(rec.conf);
        case 'ppg':    return fmtPpg(rec.ppg);
        case 'oppg':   return fmtPpg(rec.oppg);
        case 'diff':   return fmtDiff(rec.diff);
        case 'streak': return rec.streak;
        case 'l10':    return fmtRecord(rec.l10);
        case 'sos':    return fmtWinPct(sos);
        case 'po':     return `${Math.round(po * 100)}%`;
        default:       return '';
    }
}

type LeagueTeam = ReturnType<typeof useLeagueContext>['leagueTeams'][number];

interface RankedTeamRow {
    team: LeagueTeam;
    rank: number;
    rec: MultiStandingsRecord;
    gb: string;
    groupLabel?: string;
    groupColor?: string;
}

// 디비전은 항상 특정 컨퍼런스에 소속 — 디비전 모드 그룹 헤더도 소속 컨퍼런스 컬러를 그대로 쓴다.
const DIVISION_CONFERENCE: Record<string, 'East' | 'West'> = {
    Atlantic: 'East', Central: 'East', Southeast: 'East',
    Northwest: 'West', Pacific: 'West', Southwest: 'West',
};

// ── 순위 변동(▲▼) ────────────────────────────────────────────────────────────
// 저장된 스냅샷 없이 일정(schedule)만으로 "직전 시뮬레이션 일자 마감 시점"의 순위를 재계산한다.
// 기준일 D = 공개된(isFinal) 정규시즌 경기 중 가장 늦은 가상 날짜(Game.date). 이전 순위 = D 이전 날짜 경기만 집계.
// 리그/컨퍼런스 순위만 대상(디비전은 계산하지 않음). 표시 정렬(열 클릭)과 무관하게 항상 PCT 기준 순위끼리 비교한다.
// 리그 전체(동·서 혼합) 순위: NBA 공식 순위표도 리그 전체 동률에 별도 규정 없이 시딩과 같은 목록(L.2.a/L.2.b)을
// 그대로 적용한다(디비전 우승 기준은 "같은 디비전이 아니어도 적용"). 엔진(rankGroup)이 그 목록 그대로라 전체를 넘긴다.
function rankLeagueByTiebreak(
    ledger: Parameters<typeof rankGroup>[0],
    ctx: Parameters<typeof rankGroup>[2],
    teams: { team_slug: string }[],
): string[] {
    return rankGroup(ledger, teams.map(t => t.team_slug), ctx);
}

interface RankSnapshot { league: Record<string, number>; conf: Record<string, number> }

function computeRankSnapshot(
    leagueTeams: LeagueTeamRow[],
    schedule: Game[],
    nowMs: number,
    playoffTeamsPerConf: number,
    playInEnabled: boolean,
): RankSnapshot {
    const slugs = leagueTeams.map(t => t.team_slug);
    const stats = computeMultiStandingsStats(slugs, schedule, nowMs);
    const ledger = buildRaceLedger(leagueTeams, schedule, nowMs);
    const ctx = buildContext(ledger, { eligibleCount: playInEnabled ? playoffTeamsPerConf + 2 : playoffTeamsPerConf, drawSeed: 'live' });
    const league: Record<string, number> = {};
    rankLeagueByTiebreak(ledger, ctx, leagueTeams).forEach((slug, i) => { league[slug] = i + 1; });
    const conf: Record<string, number> = {};
    for (const c of ['East', 'West']) {
        rankGroup(ledger, leagueTeams.filter(t => t.conference === c).map(t => t.team_slug), ctx)
            .forEach((slug, i) => { conf[slug] = i + 1; });
    }
    return { league, conf };
}

const isCountedGame = (g: Game, nowMs: number): boolean =>
    !g.isPlayoff && !g.isAllstar && g.played && g.homeScore != null && g.awayScore != null && isFinal(g, nowMs);

function computeRankDelta(
    leagueTeams: LeagueTeamRow[],
    schedule: Game[],
    nowMs: number,
    playoffTeamsPerConf: number,
    playInEnabled: boolean,
): RankSnapshot | null {
    // 정규시즌 종료(전 경기 공개) 후에는 변동값을 보여주지 않는다.
    const regular = schedule.filter(g => !g.isPlayoff && !g.isAllstar);
    if (regular.length > 0 && regular.every(g => isCountedGame(g, nowMs))) return null;
    let latest: string | null = null;
    for (const g of schedule) {
        if (!isCountedGame(g, nowMs)) continue;
        const d = g.date.slice(0, 10);
        if (latest === null || d > latest) latest = d;
    }
    if (latest === null) return null;
    const prevSchedule = schedule.filter(g => g.date.slice(0, 10) < latest!);
    if (!prevSchedule.some(g => isCountedGame(g, nowMs))) return null; // 첫 경기일 — 비교 대상 없음
    const cur = computeRankSnapshot(leagueTeams, schedule, nowMs, playoffTeamsPerConf, playInEnabled);
    const prev = computeRankSnapshot(leagueTeams, prevSchedule, nowMs, playoffTeamsPerConf, playInEnabled);
    const diff = (a: Record<string, number>, b: Record<string, number>) => {
        const out: Record<string, number> = {};
        for (const k of Object.keys(a)) out[k] = (b[k] ?? a[k]) - a[k]; // 양수 = 순위 상승
        return out;
    };
    return { league: diff(cur.league, prev.league), conf: diff(cur.conf, prev.conf) };
}

const RankDelta: React.FC<{ delta: number | undefined }> = ({ delta }) => {
    if (delta === undefined) return null;
    if (delta === 0) return <span className="text-sm text-slate-600">-</span>;
    const up = delta > 0;
    return (
        <span className={`text-sm font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
            {up ? '▲' : '▼'}{Math.abs(delta)}
        </span>
    );
};

// ── 플레이오프 클린치(진출확정/탈락) 계산 ────────────────────────────────────
// 싱글플레이어 StandingsView의 클린치 로직(하드코딩 6/10위)을 어드민이 설정한
// 컨퍼런스별 진출 팀 수 + 플레이인 활성화 여부로 일반화한 버전.
// 플레이인 활성화 시: 상위 (N-2)팀 자동진출 확정, (N-2+1)~(N+2)위(4팀)가 플레이인 대상.
// 플레이인 비활성화 시: 상위 N팀 자동진출 확정, 그 아래는 즉시 탈락권.

type ClinchStatus = 'clinched_playoff' | 'clinched_playin' | 'eliminated' | null;

function computeClinchStatus(
    leagueTeams: LeagueTeam[],
    statsMap: Record<string, MultiStandingsRecord>,
    schedule: ReturnType<typeof useMultiGameData>['schedule'],
    playoffTeamsPerConf: number,
    playInEnabled: boolean,
    /** 컨퍼런스 순서(NBA 타이브레이커 적용) — 동률 팀 중 누가 컷 안쪽인지를 시딩과 같게 본다 */
    orderOf: (slugs: string[]) => string[],
): Record<string, ClinchStatus> {
    const map: Record<string, ClinchStatus> = {};
    const autoClinchCount = playInEnabled ? Math.max(0, playoffTeamsPerConf - 2) : playoffTeamsPerConf;
    const lastQualifyingRank = playInEnabled ? playoffTeamsPerConf + 2 : playoffTeamsPerConf;

    // 팀별 정규시즌 전체 예정 경기 수(플레이오프 제외) — statsMap의 승+패(공개된 것만)와
    // 비교해 "남은 경기 수"를 구한다.
    const totalGamesBySlug = new Map<string, number>();
    for (const g of schedule) {
        if (g.isPlayoff) continue;
        totalGamesBySlug.set(g.homeTeamId, (totalGamesBySlug.get(g.homeTeamId) ?? 0) + 1);
        totalGamesBySlug.set(g.awayTeamId, (totalGamesBySlug.get(g.awayTeamId) ?? 0) + 1);
    }
    const getRemaining = (slug: string): number => {
        const rec = statsMap[slug];
        const total = totalGamesBySlug.get(slug) ?? 0;
        return Math.max(0, total - ((rec?.wins ?? 0) + (rec?.losses ?? 0)));
    };
    const maxPossibleWins = (slug: string): number => (statsMap[slug]?.wins ?? 0) + getRemaining(slug);

    for (const conf of ['East', 'West'] as const) {
        const confTeams = leagueTeams.filter(t => t.conference === conf);
        if (confTeams.length === 0) continue;

        const bySlug = new Map(confTeams.map(t => [t.team_slug, t]));
        const sorted = orderOf(confTeams.map(t => t.team_slug)).map(s => bySlug.get(s)!);

        const maxWinsFromAutoPlus1 = sorted.length > autoClinchCount
            ? Math.max(...sorted.slice(autoClinchCount).map(t => maxPossibleWins(t.team_slug)))
            : 0;
        const maxWinsFromLastPlus1 = sorted.length > lastQualifyingRank
            ? Math.max(...sorted.slice(lastQualifyingRank).map(t => maxPossibleWins(t.team_slug)))
            : 0;
        const rankLastTeam = sorted[lastQualifyingRank - 1];
        const rankLastWins = rankLastTeam ? (statsMap[rankLastTeam.team_slug]?.wins ?? 0) : 0;

        sorted.forEach((t, idx) => {
            const slug = t.team_slug;
            const rec = statsMap[slug];
            if (!rec) { map[slug] = null; return; }
            const remaining = getRemaining(slug);
            const teamMaxWins = rec.wins + remaining;

            // 탈락: 남은 경기를 전부 이겨도 마지막 진출권(플레이인 포함) 팀을 못 따라잡음
            if (rankLastTeam && teamMaxWins < rankLastWins) { map[slug] = 'eliminated'; return; }
            if (rankLastTeam && remaining === 0 && teamMaxWins === rankLastWins
                && getRemaining(rankLastTeam.team_slug) === 0 && idx >= lastQualifyingRank) {
                map[slug] = 'eliminated'; return;
            }

            // 자동 진출 확정(top autoClinchCount)
            if (autoClinchCount > 0 && rec.wins > maxWinsFromAutoPlus1) { map[slug] = 'clinched_playoff'; return; }
            if (autoClinchCount > 0 && remaining === 0 && rec.wins >= maxWinsFromAutoPlus1 && idx < autoClinchCount) {
                const hasThreat = sorted.slice(autoClinchCount).some(s =>
                    maxPossibleWins(s.team_slug) >= rec.wins && getRemaining(s.team_slug) > 0,
                );
                if (!hasThreat) { map[slug] = 'clinched_playoff'; return; }
            }

            // 최소 플레이인 진출 확정 (플레이인 비활성화면 autoClinchCount===lastQualifyingRank라
            // 위 자동진출 분기와 겹치므로 사실상 도달하지 않음)
            if (playInEnabled) {
                if (rec.wins > maxWinsFromLastPlus1) { map[slug] = 'clinched_playin'; return; }
                if (remaining === 0 && rec.wins >= maxWinsFromLastPlus1 && idx < lastQualifyingRank) {
                    const hasThreat = sorted.slice(lastQualifyingRank).some(s =>
                        maxPossibleWins(s.team_slug) >= rec.wins && getRemaining(s.team_slug) > 0,
                    );
                    if (!hasThreat) { map[slug] = 'clinched_playin'; return; }
                }
            }

            map[slug] = null;
        });
    }
    return map;
}

// ── SOS(Strength Of Schedule) — ESPN RPI 방식 ────────────────────────────────
// RPI = 0.25×자팀 승률 + 0.50×상대 평균 승률 + 0.25×상대의 상대 평균 승률.
// 상대 평균 승률(OWP)은 "상대가 자팀과 붙은 경기는 제외한" 승률을 쓴다(자기 자신과의
// 맞대결로 상대 승률이 왜곡되는 걸 막는 표준 관행) — 경기 수만큼 가중 평균이라 같은
// 상대와 여러 번 붙었으면(30팀 리그의 디비전 내 맞대결 등) 그만큼 더 반영된다.
// 상대의 상대 평균 승률(OOWP)은 이 제외 보정 없이 각 상대의 OWP를 그대로 평균낸다
// (NCAA RPI 관행과 동일).

function computeSosMap(
    leagueTeams: LeagueTeam[],
    statsMap: Record<string, MultiStandingsRecord>,
    schedule: ReturnType<typeof useMultiGameData>['schedule'],
    serverNowMs: number,
): Record<string, number> {
    const h2h = new Map<string, { w: number; l: number }>();
    const opponentsByTeam = new Map<string, string[]>();
    for (const t of leagueTeams) opponentsByTeam.set(t.team_slug, []);

    const addH2H = (a: string, b: string, aWon: boolean) => {
        const key = `${a}|${b}`;
        const rec = h2h.get(key) ?? { w: 0, l: 0 };
        if (aWon) rec.w++; else rec.l++;
        h2h.set(key, rec);
    };

    for (const g of schedule) {
        if (g.isPlayoff) continue;
        if (!g.played || g.homeScore == null || g.awayScore == null) continue;
        if (!isFinal(g, serverNowMs)) continue;
        const homeWon = g.homeScore > g.awayScore;
        addH2H(g.homeTeamId, g.awayTeamId, homeWon);
        addH2H(g.awayTeamId, g.homeTeamId, !homeWon);
        opponentsByTeam.get(g.homeTeamId)?.push(g.awayTeamId);
        opponentsByTeam.get(g.awayTeamId)?.push(g.homeTeamId);
    }

    const winPct = (slug: string): number => statsMap[slug]?.pct ?? 0;

    // opp 입장에서 excludeTeam과의 맞대결을 뺀 승률.
    const winPctExcluding = (opp: string, excludeTeam: string): number => {
        const rec = statsMap[opp];
        if (!rec) return 0;
        const h = h2h.get(`${opp}|${excludeTeam}`);
        const w = rec.wins - (h?.w ?? 0);
        const l = rec.losses - (h?.l ?? 0);
        return (w + l) > 0 ? w / (w + l) : 0;
    };

    const owpByTeam = new Map<string, number>();
    for (const t of leagueTeams) {
        const opponents = opponentsByTeam.get(t.team_slug) ?? [];
        const owp = opponents.length > 0
            ? opponents.reduce((sum, opp) => sum + winPctExcluding(opp, t.team_slug), 0) / opponents.length
            : 0;
        owpByTeam.set(t.team_slug, owp);
    }

    const sosMap: Record<string, number> = {};
    for (const t of leagueTeams) {
        const opponents = opponentsByTeam.get(t.team_slug) ?? [];
        const oowp = opponents.length > 0
            ? opponents.reduce((sum, opp) => sum + (owpByTeam.get(opp) ?? 0), 0) / opponents.length
            : 0;
        const owp = owpByTeam.get(t.team_slug) ?? 0;
        sosMap[t.team_slug] = 0.25 * winPct(t.team_slug) + 0.50 * owp + 0.25 * oowp;
    }
    return sosMap;
}

// ── PO%(플레이오프 진출 확률) — 몬테카를로 시뮬레이션 ────────────────────────
// 계산 로직(computePlayoffOddsMap/log5WinProb/PLAYOFF_ODDS_ITERATIONS)은
// multiSeasonUtils.ts로 이동 — 홈 화면(MultiSeasonPage.tsx)도 동일한 PO% 값을
// 보여줘야 해서 공유 유틸로 옮기고 여기서는 import해서 씀.

// ── PO% 툴팁용 근거 지표 ──────────────────────────────────────────────────────
// 몬테카를로 결과 자체는 SOS의 RPI 가중치 같은 "공식 구성요소"가 없는 블랙박스라,
// 대신 확률을 좌우하는 핵심 입력값들(컨퍼런스 순위, 잔여 경기, 잔여 일정 강도,
// 컷라인까지 격차)을 보여준다 — 특히 "잔여 일정 상대 평균 승률"이 순위는 낮아도
// 확률이 더 높게 나오는 역전 케이스의 가장 흔한 원인(쉬운 잔여 일정)이다.

interface OddsBreakdown {
    confRank: number;
    confSize: number;
    wins: number;
    losses: number;
    pct: number;
    gamesRemaining: number;
    remainingSos: number;
    gbAuto: number;
    gbLast: number;
    autoClinchCount: number;
    lastQualifyingRank: number;
}

function computeOddsBreakdownMap(
    leagueTeams: LeagueTeam[],
    statsMap: Record<string, MultiStandingsRecord>,
    schedule: ReturnType<typeof useMultiGameData>['schedule'],
    nowMs: number,
    playoffTeamsPerConf: number,
    playInEnabled: boolean,
): Record<string, OddsBreakdown> {
    const autoClinchCount = playInEnabled ? Math.max(0, playoffTeamsPerConf - 2) : playoffTeamsPerConf;
    const lastQualifyingRank = playInEnabled ? playoffTeamsPerConf + 2 : playoffTeamsPerConf;

    // 아직 비공개(!isFinal)인 남은 경기의 상대 목록 — 경기 수만큼 가중.
    const pendingOpponents = new Map<string, string[]>();
    for (const t of leagueTeams) pendingOpponents.set(t.team_slug, []);
    for (const g of schedule) {
        if (g.isPlayoff || isFinal(g, nowMs)) continue;
        pendingOpponents.get(g.homeTeamId)?.push(g.awayTeamId);
        pendingOpponents.get(g.awayTeamId)?.push(g.homeTeamId);
    }

    const result: Record<string, OddsBreakdown> = {};
    for (const conf of ['East', 'West'] as const) {
        const teams = leagueTeams.filter(t => t.conference === conf);
        const sorted = [...teams].sort((a, b) => {
            const ra = statsMap[a.team_slug], rb = statsMap[b.team_slug];
            if (!ra || !rb) return 0;
            if (rb.pct !== ra.pct) return rb.pct - ra.pct;
            return rb.wins - ra.wins;
        });
        const autoCutoffRec = statsMap[sorted[autoClinchCount - 1]?.team_slug];
        const lastCutoffRec = statsMap[sorted[lastQualifyingRank - 1]?.team_slug];

        sorted.forEach((t, idx) => {
            const rec = statsMap[t.team_slug];
            const opponents = pendingOpponents.get(t.team_slug) ?? [];
            const remainingSos = opponents.length > 0
                ? opponents.reduce((sum, opp) => sum + (statsMap[opp]?.pct ?? 0), 0) / opponents.length
                : 0;
            const gbAuto = (autoCutoffRec && rec)
                ? ((autoCutoffRec.wins - autoCutoffRec.losses) - (rec.wins - rec.losses)) / 2 : 0;
            const gbLast = (lastCutoffRec && rec)
                ? ((lastCutoffRec.wins - lastCutoffRec.losses) - (rec.wins - rec.losses)) / 2 : 0;

            result[t.team_slug] = {
                confRank: idx + 1,
                confSize: sorted.length,
                wins: rec?.wins ?? 0,
                losses: rec?.losses ?? 0,
                pct: rec?.pct ?? 0,
                gamesRemaining: opponents.length,
                remainingSos,
                gbAuto,
                gbLast,
                autoClinchCount,
                lastQualifyingRank,
            };
        });
    }
    return result;
}

// ── PO% 바 + hover 툴팁 ───────────────────────────────────────────────────────
// 테이블 컨테이너(components/common/Table.tsx)가 overflow-auto라서, 셀 안에 absolute로
// 팝업을 두면 스크롤 영역 경계에서 잘린다(우측 끝 컬럼일수록 심함). createPortal로
// document.body에 직접 렌더링하고 getBoundingClientRect() 기반 fixed 좌표를 써서
// 어떤 스크롤 컨테이너에도 갇히지 않게 한다 — components/common/Dropdown.tsx와 동일 패턴.
const PLAYOFF_TOOLTIP_WIDTH = 240;
// 툴팁 비활성화 스위치 — 사용자 요청으로 껐음(코드는 삭제하지 말 것). true로 되돌리면 즉시 재활성화.
const PLAYOFF_TOOLTIP_ENABLED = false;

const PlayoffOddsCell: React.FC<{ pct: number; breakdown?: OddsBreakdown }> = ({ pct, breakdown }) => {
    const [hovered, setHovered] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    const poColor    = pct >= 75 ? 'text-emerald-400' : pct >= 25 ? 'text-amber-400' : 'text-red-400';
    const poBarColor = pct >= 75 ? 'bg-emerald-400'   : pct >= 25 ? 'bg-amber-400'   : 'bg-red-400';

    const handleEnter = () => {
        if (!PLAYOFF_TOOLTIP_ENABLED) return;
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
            const left = Math.max(8, Math.min(
                rect.left + rect.width / 2 - PLAYOFF_TOOLTIP_WIDTH / 2,
                window.innerWidth - PLAYOFF_TOOLTIP_WIDTH - 8,
            ));
            setPos({ top: rect.top - 8, left });
        }
        setHovered(true);
    };

    return (
        <div
            ref={triggerRef}
            className="flex items-center gap-2"
            onMouseEnter={handleEnter}
            onMouseLeave={() => setHovered(false)}
        >
            <div className="flex-1 h-2.5 bg-slate-700 overflow-hidden">
                <div className={`h-full ${poBarColor}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-sm tabular-nums w-8 text-right shrink-0 ${poColor}`}>{pct}%</span>

            {PLAYOFF_TOOLTIP_ENABLED && hovered && pos && breakdown && createPortal(
                <div
                    className="fixed pointer-events-none -translate-y-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 shadow-xl z-tooltip text-left"
                    style={{ top: pos.top, left: pos.left, width: PLAYOFF_TOOLTIP_WIDTH }}
                >
                    <p className="text-xs font-bold text-white mb-1.5">플레이오프 진출 확률 {pct}%</p>
                    <div className="space-y-1 text-[11px] text-slate-400">
                        <div className="flex justify-between gap-3">
                            <span>컨퍼런스 순위</span>
                            <span className="text-slate-200 tabular-nums">{breakdown.confRank}위 / {breakdown.confSize}팀</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span>현재 전적</span>
                            <span className="text-slate-200 tabular-nums">{breakdown.wins}-{breakdown.losses} ({fmtWinPct(breakdown.pct)})</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span>잔여 경기</span>
                            <span className="text-slate-200 tabular-nums">{breakdown.gamesRemaining}경기</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span>잔여 일정 상대 승률</span>
                            <span className="text-slate-200 tabular-nums">{fmtWinPct(breakdown.remainingSos)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span>자동진출 컷</span>
                            <span className="text-slate-200 tabular-nums">{fmtGB(breakdown.gbAuto)}</span>
                        </div>
                        {breakdown.lastQualifyingRank !== breakdown.autoClinchCount && (
                            <div className="flex justify-between gap-3">
                                <span>마지막 진출권 컷</span>
                                <span className="text-slate-200 tabular-nums">{fmtGB(breakdown.gbLast)}</span>
                            </div>
                        )}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1.5 leading-relaxed">
                        순위가 낮아도 잔여 일정 상대 승률이 낮으면(쉬운 일정) 확률이 더 높게 나올 수 있습니다.
                    </p>
                </div>,
                document.body,
            )}
        </div>
    );
};

const LeagueStandingsTable: React.FC<{
    leagueTeams: ReturnType<typeof useLeagueContext>['leagueTeams'];
    schedule: ReturnType<typeof useMultiGameData>['schedule'];
    serverNowMs: number;
    playoffTeamsPerConf: number;
    playInEnabled: boolean;
}> = ({ leagueTeams, schedule, serverNowMs, playoffTeamsPerConf, playInEnabled }) => {
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const [mode, setMode] = useState<StandingsMode>('League');
    const { sortConfig, sortProps } = useTableSort({ key: 'pct', direction: 'desc' });

    const slugs = useMemo(() => leagueTeams.map(t => t.team_slug), [leagueTeams]);

    // 실제 30팀만 TEAM_DATA에 division이 있음 — 가상 팀은 conference만 채워진다.
    const teamMeta = useMemo(() => {
        const map: Record<string, MultiTeamMeta> = {};
        for (const t of leagueTeams) {
            map[t.team_slug] = {
                conference: t.conference,
                division: TEAM_DATA[t.team_slug]?.division ?? null,
            };
        }
        return map;
    }, [leagueTeams]);

    const statsMap = useMemo(
        () => computeMultiStandingsStats(slugs, schedule, serverNowMs, teamMeta),
        [slugs, schedule, serverNowMs, teamMeta],
    );

    // [2026-10-15] NBA 공식 타이브레이커(utils/nbaTiebreak.ts — 서버 시딩과 같은 엔진). 승률이 같은 팀의 순서를
    // 컨퍼런스·디비전 화면에서 실제 시딩과 일치시킨다. 진출권 팀 = 플레이인 포함 진출 팀 수.
    const tiebreak = useMemo(() => {
        const ledger = buildRaceLedger(leagueTeams, schedule, serverNowMs);
        const ctx = buildContext(ledger, { eligibleCount: playInEnabled ? playoffTeamsPerConf + 2 : playoffTeamsPerConf, drawSeed: 'live' });
        return {
            orderOf: (slugs: string[]) => rankGroup(ledger, slugs, ctx),
            leagueOrder: () => rankLeagueByTiebreak(ledger, ctx, leagueTeams),
        };
    }, [leagueTeams, schedule, serverNowMs, playoffTeamsPerConf, playInEnabled]);

    const clinchMap = useMemo(
        () => computeClinchStatus(leagueTeams, statsMap, schedule, playoffTeamsPerConf, playInEnabled, tiebreak.orderOf),
        [leagueTeams, statsMap, schedule, playoffTeamsPerConf, playInEnabled, tiebreak],
    );

    const rankDelta = useMemo(
        () => computeRankDelta(leagueTeams, schedule, serverNowMs, playoffTeamsPerConf, playInEnabled),
        [leagueTeams, schedule, serverNowMs, playoffTeamsPerConf, playInEnabled],
    );

    const sosMap = useMemo(
        () => computeSosMap(leagueTeams, statsMap, schedule, serverNowMs),
        [leagueTeams, statsMap, schedule, serverNowMs],
    );

    // W/L/PPG/OPPG/SOS 컬럼 색상 기준(DIFF와 동일한 방식 — 리그 평균 대비 위/아래로 색칠).
    const leagueAverages = useMemo(() => {
        const avg = (values: number[]) => values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        const winsValues  = leagueTeams.map(t => statsMap[t.team_slug]?.wins ?? 0);
        const lossValues  = leagueTeams.map(t => statsMap[t.team_slug]?.losses ?? 0);
        const ppgValues   = leagueTeams.map(t => statsMap[t.team_slug]?.ppg ?? 0).filter(v => v > 0);
        const oppgValues  = leagueTeams.map(t => statsMap[t.team_slug]?.oppg ?? 0).filter(v => v > 0);
        const sosValues   = leagueTeams.map(t => sosMap[t.team_slug] ?? 0);
        return {
            wins: avg(winsValues), losses: avg(lossValues),
            ppg: avg(ppgValues), oppg: avg(oppgValues), sos: avg(sosValues),
        };
    }, [leagueTeams, statsMap, sosMap]);

    // 1000회 몬테카를로 시뮬레이션 — 화면에 들어올 때(mount) 딱 한 번만 계산하고 그 값을
    // 그대로 고정해서 보여준다. useState의 lazy initializer는 최초 렌더 1회만 실행되고
    // 이후 리렌더(sortConfig/mode 변경, serverNowMs 매초 틱 등)에는 다시 불리지 않으므로,
    // 사용자가 화면을 보고 있는 동안 값이 흔들리거나 재계산이 반복되지 않는다. 최신 경기
    // 결과를 반영하려면 화면을 나갔다 다시 들어오면 된다(재마운트 시 다시 한 번 계산).
    const [playoffOddsMap] = useState(() =>
        computePlayoffOddsMap(leagueTeams, statsMap, schedule, serverNowMs, playoffTeamsPerConf, playInEnabled),
    );

    // PO% 툴팁에 쓰이는 근거 지표도 같은 마운트 시점 스냅샷으로 고정 — playoffOddsMap과
    // 항상 같은 시점의 데이터를 설명해야 하므로 별도로 재계산되지 않는다.
    const [oddsBreakdownMap] = useState(() =>
        computeOddsBreakdownMap(leagueTeams, statsMap, schedule, serverNowMs, playoffTeamsPerConf, playInEnabled),
    );

    const rankedRows = useMemo((): RankedTeamRow[] => {
        // 기본 정렬(PCT)일 때는 모든 화면에서 동률을 NBA 타이브레이커로 가른다. 리그 전체(동·서 혼합)는
        // rankLeagueByTiebreak(같은 컨퍼런스 팀끼리는 컨퍼런스 순위와 일치). 다른 열로 정렬하면 그 값 기준 그대로.
        const useTiebreak = sortConfig.key === 'pct';
        const sortTeams = (list: LeagueTeam[]): LeagueTeam[] => {
            if (useTiebreak) {
                const order = mode === 'League' ? tiebreak.leagueOrder() : tiebreak.orderOf(list.map(t => t.team_slug));
                const idx = new Map(order.map((s, i) => [s, i]));
                const ordered = [...list].sort((a, b) => idx.get(a.team_slug)! - idx.get(b.team_slug)!);
                return sortConfig.direction === 'desc' ? ordered : ordered.reverse();
            }
            return [...list].sort((a, b) => {
                const ra = statsMap[a.team_slug];
                const rb = statsMap[b.team_slug];
                if (!ra || !rb) return 0;
                const va = getSortValue(ra, sortConfig.key, sosMap[a.team_slug] ?? 0, playoffOddsMap[a.team_slug] ?? 0);
                const vb = getSortValue(rb, sortConfig.key, sosMap[b.team_slug] ?? 0, playoffOddsMap[b.team_slug] ?? 0);
                const diff = sortConfig.direction === 'desc' ? vb - va : va - vb;
                if (diff !== 0) return diff;
                // secondary: pct desc, then wins desc
                const pctDiff = rb.pct - ra.pct;
                if (pctDiff !== 0) return pctDiff;
                return rb.wins - ra.wins;
            });
        };

        const buildGroup = (list: LeagueTeam[], groupLabel?: string, groupColor?: string): RankedTeamRow[] => {
            const sorted = sortTeams(list);
            const leaderRec = statsMap[sorted[0]?.team_slug];
            return sorted.map((t, i) => {
                const rec = statsMap[t.team_slug];
                const gb = i === 0 || !leaderRec
                    ? '-'
                    : (((leaderRec.wins - leaderRec.losses) - (rec.wins - rec.losses)) / 2).toFixed(1);
                return { team: t, rank: i + 1, rec, gb, groupLabel: i === 0 ? groupLabel : undefined, groupColor: i === 0 ? groupColor : undefined };
            });
        };

        if (mode === 'League') {
            return buildGroup(leagueTeams);
        }
        if (mode === 'Conference') {
            return [
                ...buildGroup(leagueTeams.filter(t => t.conference === 'East'), '동부 컨퍼런스', CONFERENCE_COLORS.East),
                ...buildGroup(leagueTeams.filter(t => t.conference === 'West'), '서부 컨퍼런스', CONFERENCE_COLORS.West),
            ];
        }
        // Division
        const rows: RankedTeamRow[] = [];
        for (const div of DIVISION_ORDER) {
            const divTeams = leagueTeams.filter(t => teamMeta[t.team_slug]?.division === div);
            if (divTeams.length > 0) {
                rows.push(...buildGroup(divTeams, DIVISION_KOREAN[div] || div, CONFERENCE_COLORS[DIVISION_CONFERENCE[div]]));
            }
        }
        const others = leagueTeams.filter(t => !teamMeta[t.team_slug]?.division);
        if (others.length > 0) rows.push(...buildGroup(others, '기타'));
        return rows;
    }, [leagueTeams, statsMap, sosMap, playoffOddsMap, teamMeta, mode, sortConfig, tiebreak]);

    // 컨퍼런스 화면 전용 — 자동진출 컷(초록)과 마지막 진출권(플레이인 포함, 호박색) 컷라인.
    // 리그/디비전 화면은 정렬 기준이 컨퍼런스 순위가 아니라서 컷 위치가 의미가 없어 그리지 않는다.
    const cutoffLines = useMemo(() => {
        if (mode !== 'Conference') return { auto: new Set<string>(), last: new Set<string>() };
        const autoClinchCount = playInEnabled ? Math.max(0, playoffTeamsPerConf - 2) : playoffTeamsPerConf;
        const lastQualifyingRank = playInEnabled ? playoffTeamsPerConf + 2 : playoffTeamsPerConf;
        const auto = new Set<string>();
        const last = new Set<string>();
        let rank = 0;
        for (const row of rankedRows) {
            if (row.groupLabel) rank = 0;
            rank++;
            if (autoClinchCount > 0 && rank === autoClinchCount) auto.add(row.team.team_slug);
            if (playInEnabled && rank === lastQualifyingRank) last.add(row.team.team_slug);
        }
        return { auto, last };
    }, [rankedRows, mode, playoffTeamsPerConf, playInEnabled]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 shrink-0 bg-slate-900 border-b border-slate-800">
                <h1 className="text-lg font-black text-white ko-tight truncate">리그 순위</h1>
                <SegmentedControl<StandingsMode>
                    className="shrink-0"
                    value={mode}
                    onChange={setMode}
                    options={MODE_TABS.map(t => ({ value: t.id, label: t.label }))}
                />
            </div>

            <div className="flex-1 min-h-0">
                <Table variant="flush" fullHeight className="custom-scrollbar-hide">
                    <colgroup>
                        {COLS.map(c => <col key={c.key} style={{ width: c.width }} />)}
                    </colgroup>
                    {/* League: 상단 고정 헤더 하나. Conference/Division: 그룹별 서브헤더. */}
                    {mode === 'League' && (
                        <TableHead>
                            {COLS.map(c => (
                                <TableHeaderCell
                                    key={c.key}
                                    align={c.align}
                                    width={c.width}
                                    className={c.key === 'team' ? 'pl-4' : ''}
                                    {...(c.sortable ? sortProps(c.key) : {})}
                                >
                                    {c.label}
                                </TableHeaderCell>
                            ))}
                        </TableHead>
                    )}
                    <TableBody>
                        {rankedRows.map((row) => {
                            const { team: t, rank, rec, gb, groupLabel, groupColor } = row;
                            // 세로 구분선(border-r)이 slate-800 그대로면 컬러 배경 위에서 거의 안 보여서,
                            // 배경보다 알파를 높인(더 밝은/진한) 같은 컬러를 보더에 써서 대비를 준다.
                            const groupTint = groupColor
                                ? { backgroundColor: `${groupColor}66`, borderColor: `${groupColor}b3` }
                                : undefined;

                            return (
                                <React.Fragment key={`${mode}-${t.id}`}>
                                    {groupLabel && (
                                        <tr className="h-10 text-sm font-bold">
                                            <TableHeaderCell colSpan={2} align="left" style={groupTint} className={`bg-slate-950 pl-4 ${groupColor ? 'text-white' : 'text-indigo-400'}`}>{groupLabel}</TableHeaderCell>
                                            {COLS.slice(2).map(c => (
                                                <TableHeaderCell key={c.key} align="center" style={groupTint} className="bg-slate-950 text-white" {...(c.sortable ? sortProps(c.key) : {})}>{c.label}</TableHeaderCell>
                                            ))}
                                        </tr>
                                    )}

                                    <TableRow>
                                        {/* Rank */}
                                        <TableCell align="center" className="text-sm tabular-nums text-white">
                                            {rank}
                                        </TableCell>

                                        {/* Team — 이름 옆에 팀 로고(public/logos/teams/) 추가(사용자 요청).
                                            뉴스피드 스코어 헤드라인(newsFeedCards.tsx BoxScoreHeadline)과
                                            동일한 폴백(TeamLogo 공용, 리그 로고 1회 폴백).
                                            [2026-09-07 후속] 로고는 순수 장식용 — 클릭 영역은 팀 이름
                                            텍스트에만 한정(사용자 지적: 로고까지 클릭되게 만든 건 요청 밖). */}
                                        <TableCell align="left" className="pl-4">
                                            <span className="flex items-center gap-2 min-w-0">
                                                <TeamLogo teamId={t.team_slug} teamName={t.team_abbr} size="custom" className="w-6 h-6 shrink-0" shadow={false} />
                                                <TeamHover teamId={t.team_slug}>
                                                    <span
                                                        onClick={() => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${t.team_slug}`)}
                                                        className={`text-sm font-semibold truncate cursor-pointer hover:underline ${
                                                            clinchMap[t.team_slug] === 'clinched_playoff' ? 'text-emerald-400'
                                                                : clinchMap[t.team_slug] === 'eliminated' ? 'text-slate-600'
                                                                : 'text-slate-200'
                                                        }`}
                                                    >
                                                        {t.team_name}
                                                    </span>
                                                </TeamHover>
                                                {rankDelta && mode !== 'Division' && (
                                                    <span className="shrink-0">
                                                        <RankDelta delta={(mode === 'League' ? rankDelta.league : rankDelta.conf)[t.team_slug]} />
                                                    </span>
                                                )}
                                            </span>
                                        </TableCell>

                                        {/* Data columns */}
                                        {COLS.slice(2).map(c => {
                                            if (c.key === 'po') {
                                                const pct = Math.round((playoffOddsMap[t.team_slug] ?? 0) * 100);
                                                return (
                                                    <TableCell key={c.key} align="center" className="">
                                                        <PlayoffOddsCell pct={pct} breakdown={oddsBreakdownMap[t.team_slug]} />
                                                    </TableCell>
                                                );
                                            }

                                            const val = getCellValue(rec, c.key, gb, sosMap[t.team_slug] ?? 0, playoffOddsMap[t.team_slug] ?? 0);
                                            let colorClass = 'text-white';
                                            if (c.key === 'wins') colorClass = trendColor(rec.wins, leagueAverages.wins);
                                            else if (c.key === 'losses') colorClass = trendColor(rec.losses, leagueAverages.losses, { inverse: true }); // 패배는 적을수록 좋음
                                            else if (c.key === 'diff') colorClass = trendColor(rec.diff, 0);
                                            else if (c.key === 'streak') colorClass = trendColor(rec.streak.startsWith('W') ? 1 : rec.streak.startsWith('L') ? -1 : 0, 0);
                                            else if (c.key === 'l10') colorClass = trendColor(rec.l10.w, rec.l10.l, { neutral: 'text-slate-300' });
                                            else if (c.key === 'ppg') colorClass = trendColor(rec.ppg, leagueAverages.ppg);
                                            else if (c.key === 'oppg') colorClass = trendColor(rec.oppg, leagueAverages.oppg, { inverse: true }); // 실점은 낮을수록 좋음
                                            else if (c.key === 'sos') colorClass = trendColor(sosMap[t.team_slug] ?? 0, leagueAverages.sos);
                                            return (
                                                <TableCell
                                                    key={c.key}
                                                    align="center"
                                                    className={`text-sm tabular-nums ${colorClass}`}
                                                >
                                                    {val}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>

                                    {/* 자동진출 컷라인(플레이인 비활성화면 이 라인이 곧 진출/탈락 경계) */}
                                    {cutoffLines.auto.has(t.team_slug) && <CutLineRow colSpan={COLS.length} tone="auto" />}
                                    {/* 마지막 진출권(플레이인 포함) 컷라인 */}
                                    {cutoffLines.last.has(t.team_slug) && <CutLineRow colSpan={COLS.length} tone="last" />}
                                </React.Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

// ── 메인 뷰 ──────────────────────────────────────────────────────────────────
//
// "리그 순위" 메뉴는 main_league 여부와 무관하게 항상 정규시즌 순위표만 보여준다. 플레이오프
// 브라켓은 사이드바의 별도 "플레이오프" 메뉴(MultiPlayoffsView, bracket_data 존재 시에만
// 노출)로 완전히 분리했다 — 리그 순위 화면 안에서 브라켓으로 바뀌어버리면 포스트시즌 진행
// 중 정규시즌 최종 순위를 볼 방법이 없어지기 때문. tournament 타입 리그는 애초에 정규시즌이
// 없으므로(단일 브라켓 경쟁 방식) 이 메뉴가 곧 브라켓이다.

const MultiStandingsView: React.FC = () => {
    const { league, leagueTeams, isLoading: leagueLoading } = useLeagueContext();
    const {
        isLoading: gameLoading, schedule, myTeamId,
    } = useSeasonContext();
    // [2026-09-07] isFinal() 게이팅(경기 공개 10분 딜레이)에만 쓰여 초 단위 정밀도가
    // 필요 없다 — useServerClock() 그대로 쓰면 LeagueStandingsTable 전체(+그 아래
    // computeMultiStandingsStats/computeSosMap 같은 리그 전체 재계산)가 매초 돌았다
    // (홈/뉴스 화면과 동일한 문제, 사용자가 순위 화면에서도 재렌더 확인). 몬테카를로
    // 플레이오프 확률(playoffOddsMap/oddsBreakdownMap)은 이미 마운트 시 1회로 고정돼
    // 있어(아래 useState lazy initializer) 이 변경의 영향을 안 받음.
    const serverNow = useServerClockBucket();

    const isLoading = leagueLoading || gameLoading;

    if (isLoading) {
        return (
            <Spinner variant="page" />
        );
    }

    if (league?.type === 'tournament') {
        // schedule은 서버가 game_seq(압축 인덱스)로만 채워 저장 — scheduledAt이 없으면
        // multiGameReveal의 isStarted/isFinal이 played 값에만 의존해 경기가 항상
        // 'scheduled'로 묶여버린다. MultiScheduleView와 동일하게 여기서도 정규화한다.
        const simStart = league?.sim_real_start_at ?? null;
        const gprd     = league?.games_per_real_day ?? 5;
        const normalizedSchedule = schedule.map(g => ({
            ...g,
            scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt,
        }));

        return (
            <PostseasonBracket
                bracketData={league?.bracket_data ?? null}
                schedule={normalizedSchedule}
                myTeamId={myTeamId}
            />
        );
    }

    return (
        <LeagueStandingsTable
            leagueTeams={leagueTeams}
            schedule={schedule}
            serverNowMs={serverNow}
            playoffTeamsPerConf={league?.playoff_team_count ?? 8}
            playInEnabled={league?.play_in_enabled ?? true}
        />
    );
};

export default MultiStandingsView;

import type { Game } from '../../../types';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import type { TeamAdvancedStatsMap } from '../../../hooks/useTeamSeasonAdvancedStats';
import { TEAM_DATA } from '../../../data/teamData';
import { buildContext, rankGroup } from '../../../utils/nbaTiebreak';
import { buildRaceLedger } from './playoffRaceUtils';
import { computeMultiStandingsStats, type MultiTeamMeta } from './multiSeasonUtils';

// 팀 호버 카드(components/common/TeamHoverCard.tsx) 본문용 데이터 계산. 순수 함수 — 호버로 팝업이
// 열린 순간에만 호출되므로(MultiTeamHoverCard.tsx의 content 컴포넌트가 마운트될 때) 30팀 전체를
// 매 렌더 집계해도 상시 비용이 없다.

export interface TeamHoverRankRow {
    key: string;
    label: string;
    /** 이미 포맷된 경기당 값(예: "121.4", "49.3%") */
    value: string;
    /** 리그 순위(1이 최고). 실점처럼 낮을수록 좋은 지표는 이미 반전돼 있다. */
    rank: number;
}

export interface TeamHoverData {
    slug: string;
    name: string;
    conference: 'East' | 'West' | null;
    wins: number;
    losses: number;
    confRank: number | null;
    leagueRank: number;
    /** 유저 팀이면 닉네임, AI·미배정 팀이면 "없음" */
    gmLabel: string;
    totalTeams: number;
    /** 경기 기록이 없으면 null → 카드가 "기록 없음"을 표시 */
    ranks: TeamHoverRankRow[] | null;
}

interface BuildArgs {
    slug: string;
    leagueTeams: LeagueTeamRow[];
    schedule: Game[];
    serverNowMs: number;
    teamAdvanced: TeamAdvancedStatsMap | undefined;
    playoffTeamsPerConf: number;
    playInEnabled: boolean;
}

interface Metric {
    key: string;
    label: string;
    /** true면 큰 값이 1위 */
    higherIsBetter: boolean;
    value: (slug: string) => number | null;
    format: (v: number) => string;
}

const fmt1 = (v: number) => v.toFixed(1);
const fmtPct = (v: number) => (v * 100).toFixed(1) + '%';

/** 값 맵에서 slug의 순위(1-based)를 구한다. 값이 null인 팀은 순위 대상에서 제외. */
function rankOf(slug: string, slugs: string[], get: (s: string) => number | null, higherIsBetter: boolean): number | null {
    const mine = get(slug);
    if (mine == null) return null;
    const entries = slugs.flatMap(s => { const v = get(s); return v == null ? [] : [{ s, v }]; });
    entries.sort((a, b) => (higherIsBetter ? b.v - a.v : a.v - b.v) || a.s.localeCompare(b.s));
    const idx = entries.findIndex(e => e.s === slug);
    return idx >= 0 ? idx + 1 : null;
}

export function buildTeamHoverData(args: BuildArgs): TeamHoverData | null {
    const { slug, leagueTeams, schedule, serverNowMs, teamAdvanced, playoffTeamsPerConf, playInEnabled } = args;
    const row = leagueTeams.find(t => t.team_slug === slug);
    if (!row) return null;

    const slugs = leagueTeams.map(t => t.team_slug);
    const conference = row.conference === 'East' || row.conference === 'West' ? row.conference : null;

    // ── 전적/순위 — 순위표 화면과 같은 계산(같은 함수) ──────────────────────────
    const teamMeta: Record<string, MultiTeamMeta> = {};
    for (const t of leagueTeams) {
        teamMeta[t.team_slug] = { conference: t.conference, division: TEAM_DATA[t.team_slug]?.division ?? null };
    }
    const statsMap = computeMultiStandingsStats(slugs, schedule, serverNowMs, teamMeta);
    const rec = statsMap[slug];

    // 리그 순위: 순위표 "리그" 모드와 동일(승률 → 승수, 타이브레이커 없음)
    const leagueOrder = [...slugs].sort((a, b) =>
        (statsMap[b].pct - statsMap[a].pct) || (statsMap[b].wins - statsMap[a].wins));
    const leagueRank = leagueOrder.indexOf(slug) + 1;

    // 컨퍼런스 순위: 순위표 "컨퍼런스" 모드와 동일(NBA 타이브레이커)
    let confRank: number | null = null;
    if (conference) {
        const ledger = buildRaceLedger(leagueTeams, schedule, serverNowMs);
        const ctx = buildContext(ledger, { eligibleCount: playInEnabled ? playoffTeamsPerConf + 2 : playoffTeamsPerConf, drawSeed: 'live' });
        const confSlugs = leagueTeams.filter(t => t.conference === conference).map(t => t.team_slug);
        const idx = rankGroup(ledger, confSlugs, ctx).indexOf(slug);
        confRank = idx >= 0 ? idx + 1 : null;
    }

    const gmLabel = !row.is_ai && row.user_id && row.nickname ? row.nickname : '없음';

    // ── 분야별 순위 ───────────────────────────────────────────────────────────
    // 전부 get_team_season_advanced_stats RPC(팀 화면 헤더·리더보드와 같은 BBRef 공통 포제션 기준) 한 건에서
    // 나온 값이라 서로 같은 시점이다. 선수 시즌 스탯(현재 로스터 합산)은 쓰지 않는다.
    const adv = (s: string) => (teamAdvanced?.[s] && teamAdvanced[s].g > 0 ? teamAdvanced[s] : null);
    const metrics: Metric[] = [
        { key: 'pts', label: 'Pts/g', higherIsBetter: true, value: s => adv(s)?.ppg ?? null, format: fmt1 },
        { key: 'opp', label: 'OPts/g', higherIsBetter: false, value: s => adv(s)?.oppg ?? null, format: fmt1 },
        { key: 'ortg', label: 'ORTG', higherIsBetter: true, value: s => adv(s)?.offRtg ?? null, format: fmt1 },
        { key: 'drtg', label: 'DRTG', higherIsBetter: false, value: s => adv(s)?.defRtg ?? null, format: fmt1 },
        { key: 'pace', label: 'PACE', higherIsBetter: true, value: s => adv(s)?.pace ?? null, format: fmt1 },
        // 턴오버 비율은 낮을수록 좋다
        { key: 'tov', label: 'TOV%', higherIsBetter: false, value: s => adv(s)?.tovPct ?? null, format: fmtPct },
    ];

    const ranks: TeamHoverRankRow[] = [];
    for (const m of metrics) {
        const v = m.value(slug);
        const r = rankOf(slug, slugs, m.value, m.higherIsBetter);
        if (v == null || r == null) continue;
        ranks.push({ key: m.key, label: m.label, value: m.format(v), rank: r });
    }

    return {
        slug,
        name: row.team_name,
        conference,
        wins: rec.wins,
        losses: rec.losses,
        confRank,
        leagueRank,
        gmLabel,
        totalTeams: slugs.length,
        // 하나라도 빠지면(통계 미도착 등) 반쪽짜리 카드가 되므로 전부 있을 때만 표시
        ranks: ranks.length === metrics.length ? ranks : null,
    };
}

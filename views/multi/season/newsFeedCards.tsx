
import React from 'react';
import { Flame, Loader2, TrendingUp, Star, ArrowLeftRight, Tv, type LucideIcon } from 'lucide-react';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { getReadableTextColor } from '../../../utils/colorContrast';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import type { LeagueEvent, LeagueEventType } from '../../../hooks/useLeagueHeadlines';
import type { PlayerBoxScore } from '../../../types/engine';
import { formatRelativeTime } from '../../../utils/formatRelativeTime';
import { PlayerHoverCard, type PlayerCardEntry, type PlayerCardMap } from '../../../components/common/PlayerHoverCard';
import { buildNewsBlurb } from '../../../services/multi/newsBlurb';
import { useGameBoxScore } from '../../../hooks/useGameBoxScore';

// PlayerCardEntry/PlayerCardMap은 PlayerHoverCard.tsx에 정의(다른 화면들도 공유) — 여기서는
// 재수출만 해서 이 모듈을 이미 import하고 있는 곳(MultiNewsFeedView.tsx 등)의 기존 import
// 경로를 그대로 유지한다.
export type { PlayerCardEntry, PlayerCardMap };

// newsFeedCards.tsx — MultiNewsFeedView.tsx의 프레젠테이셔널 마크업 전용 형제 모듈
// [2026-09-01]. GameDateStrip.tsx가 MultiSeasonLayout에서 분리됐던 것과 동일한 이유:
// 화면 파일 자체가 너무 커지는 걸 막고, 로직/데이터(useLeagueHeadlines 등)는 훅에,
// 마크업은 화면별 로컬 모듈에 두는 이 프로젝트 관례를 따른다.
//
// 선수 헤드샷은 meta_players에 존재하지 않는다(컬럼/JSONB 어디에도 없음) — 카드의
// 시각적 앵커는 대형 스탯 숫자(BigStat) + 팀 로고/컬러(TeamMark)로만 구성한다.

export type CardTier = 'hero' | 'standard' | 'compact';

const BIG_STAT_SIZE: Record<CardTier, string> = {
    hero: 'text-6xl',
    standard: 'text-4xl',
    compact: 'text-3xl',
};

export function tierFromScore(score: number): CardTier {
    if (score >= 25) return 'hero';
    if (score >= 18) return 'standard';
    return 'compact';
}

// ── 공용 조각 ────────────────────────────────────────────────────────────────

export const TeamMark: React.FC<{ team: LeagueTeamRow | undefined; teamSlug: string; size?: 'sm' | 'md' }> = ({ team, teamSlug, size = 'sm' }) => {
    const bg = team?.color_primary ?? '#1e293b';
    const fg = team?.color_text ?? getReadableTextColor(bg);
    return (
        <div className="flex items-center gap-1.5 min-w-0">
            <TeamLogo teamId={teamSlug} size={size === 'sm' ? 'xs' : 'sm'} className="shrink-0" />
            <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded truncate"
                style={{ backgroundColor: bg, color: fg }}
            >
                {team?.team_abbr ?? teamSlug.slice(0, 3).toUpperCase()}
            </span>
        </div>
    );
};

export const BigStat: React.FC<{ value: number | string; label: string; tier: CardTier }> = ({ value, label, tier }) => (
    <div className="flex items-baseline gap-1.5">
        <span className={`${BIG_STAT_SIZE[tier]} font-black text-white tabular-nums leading-none`}>{value}</span>
        <span className="text-xs text-slate-500 ko-normal">{label}</span>
    </div>
);

// [2026-09-01] "스코어/버튼만 뜨는 게 아니라 실제 뉴스처럼 짤막한 글"이 있었으면 좋겠다는
// 요청 — services/multi/newsBlurb.ts가 구조화 payload로 조합한 문단들을 여기서 렌더링.
// null(레거시 이벤트, blurb 조합 재료 자체가 없음)이면 아무것도 안 그림.
// [2026-09-01 후속] "한 줄이 아니라 4~5줄짜리 기사처럼"이란 요청으로 buildNewsBlurb가
// 문단 배열(string[])을 반환하도록 바뀜 — 각 문단을 별도 줄로 렌더링.
const Blurb: React.FC<{ lines: string[] | null; className?: string }> = ({ lines, className = '' }) => {
    if (!lines || lines.length === 0) return null;
    return (
        <div className={`space-y-1 ${className}`}>
            {lines.map((line, idx) => (
                <p key={idx} className="text-xs text-slate-400 ko-normal leading-relaxed">{line}</p>
            ))}
        </div>
    );
};

// [2026-09-01] "박스스코어" 텍스트 자리에 "원정팀약어 스코어-스코어 홈팀약어"를 표기하고
// 팀약어/스코어 각각을 클릭 가능하게 해 달라는 요청 — 팀약어는 팀 화면
// (MultiStandingsView.tsx 등이 쓰는 것과 동일한 `?rteam=` 쿼리 파라미터 라우트)으로,
// 스코어는 ClickableFinalScore와 동일하게 경기 결과 화면으로 이동. game(=GameRef)이 없는
// 옛 이벤트는 기존처럼 "박스스코어" 텍스트로 폴백.
const BoxScoreHeadline: React.FC<{
    game: { homeSlug: string; awaySlug: string; homeScore: number; awayScore: number } | undefined;
    teamBySlug: Map<string, LeagueTeamRow>;
    onOpenTeam?: (teamSlug: string) => void;
    onOpenGame?: () => void;
}> = ({ game, teamBySlug, onOpenTeam, onOpenGame }) => {
    if (!game) return <h4 className="text-lg font-black text-white uppercase">박스스코어</h4>;
    const awayTeam = teamBySlug.get(game.awaySlug);
    const homeTeam = teamBySlug.get(game.homeSlug);
    const teamSpan = (slug: string, team: LeagueTeamRow | undefined) => (
        <span
            className={`text-lg font-black text-white uppercase ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
            onClick={onOpenTeam ? (e) => { e.stopPropagation(); onOpenTeam(slug); } : undefined}
        >
            {team?.team_abbr ?? slug}
        </span>
    );
    return (
        <h4 className="flex items-center gap-1.5">
            {teamSpan(game.awaySlug, awayTeam)}
            <span
                className={`text-lg font-black text-white ${onOpenGame ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                onClick={onOpenGame ? (e) => { e.stopPropagation(); onOpenGame(); } : undefined}
            >
                {game.awayScore}-{game.homeScore}
            </span>
            {teamSpan(game.homeSlug, homeTeam)}
        </h4>
    );
};

// [2026-09-01] "헤드라인 전체가 아니라 선수 이름에만 호버 효과가 적용돼야 한다"는 요청 —
// event.headline은 항상 player.name으로 시작하는 완성 문장(예: "루디 고베어, 더블더블
// (...) 달성")이라, 그 접두사만 잘라 PlayerHoverCard+클릭 스타일로 감싸고 나머지는 같은
// h1 폰트의 평문으로 이어붙인다. headline이 어떤 이유로든 player.name으로 시작하지 않으면
// (이론상만) 안전하게 전체를 이름 취급 폴백.
const HeadlineTitle: React.FC<{
    headline: string; playerName: string; entry: PlayerCardEntry | undefined;
    onPlayerClick?: () => void;
}> = ({ headline, playerName, entry, onPlayerClick }) => {
    const hasPrefix = headline.startsWith(playerName);
    const namePart = hasPrefix ? playerName : headline;
    const rest = hasPrefix ? headline.slice(playerName.length) : '';
    return (
        <h1 className="text-xl font-black text-white">
            <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                <span
                    className={onPlayerClick ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
                    onClick={onPlayerClick}
                >
                    {namePart}
                </span>
            </PlayerHoverCard>
            {rest}
        </h1>
    );
};

// [2026-09-01] "경기 결과" 레터에 박스스코어 위 쿼터별 득점 테이블 추가 요청 —
// game_pbp.quarter_scores(서버가 경기 종료 시 이미 계산해 저장, gameQueries.ts의
// loadGameBoxScore()가 그대로 select)를 그대로 표로 그린다. 연장전이 있으면 4개보다
// 길어질 수 있어 두 배열 중 더 긴 쪽 길이(최소 4)를 기준으로 컬럼을 생성.
const QuarterScoreTable: React.FC<{
    homeSlug: string; awaySlug: string; homeScore: number; awayScore: number;
    quarterScores: { home: number[]; away: number[] };
    teamBySlug: Map<string, LeagueTeamRow>;
    onOpenTeam?: (teamSlug: string) => void;
}> = ({ homeSlug, awaySlug, homeScore, awayScore, quarterScores, teamBySlug, onOpenTeam }) => {
    const homeTeam = teamBySlug.get(homeSlug);
    const awayTeam = teamBySlug.get(awaySlug);
    const periodCount = Math.max(quarterScores.home.length, quarterScores.away.length, 4);
    const periodLabel = (i: number) => (i < 4 ? `Q${i + 1}` : `OT${i - 3}`);

    const teamCell = (slug: string, team: LeagueTeamRow | undefined) => (
        <span
            className={`text-sm font-bold text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
            onClick={onOpenTeam ? () => onOpenTeam(slug) : undefined}
        >
            {team?.team_abbr ?? slug}
        </span>
    );

    return (
        // "쿼터별 득점" 라벨 삭제(사용자 요청) — 테이블 자체(Q1~Q4/최종 헤더)로 충분히
        // 자명해서 별도 제목 불필요. w-full 대신 콘텐츠 폭에 맞춰 자연스럽게 줄어들도록
        // (본문(max-w-5xl) 너비까지 늘어나지 않고 컴팩트하게 유지).
        <div className="space-y-1">
            <table className="text-left border-collapse">
                <thead>
                    <tr className="border-b border-slate-700">
                        <th className="py-1.5 px-2" />
                        {Array.from({ length: periodCount }, (_, i) => (
                            <th key={i} className="py-1.5 px-2 text-sm font-bold text-slate-500 text-center">{periodLabel(i)}</th>
                        ))}
                        <th className="py-1.5 px-2 text-sm font-bold text-slate-500 text-center">최종</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="border-b border-slate-800/60">
                        <td className="py-1 px-2">{teamCell(awaySlug, awayTeam)}</td>
                        {Array.from({ length: periodCount }, (_, i) => (
                            <td key={i} className="py-1 px-2 text-sm text-slate-300 text-center">{quarterScores.away[i] ?? '-'}</td>
                        ))}
                        <td className="py-1 px-2 text-sm font-bold text-white text-center">{awayScore}</td>
                    </tr>
                    <tr>
                        <td className="py-1 px-2">{teamCell(homeSlug, homeTeam)}</td>
                        {Array.from({ length: periodCount }, (_, i) => (
                            <td key={i} className="py-1 px-2 text-sm text-slate-300 text-center">{quarterScores.home[i] ?? '-'}</td>
                        ))}
                        <td className="py-1 px-2 text-sm font-bold text-white text-center">{homeScore}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

function sumBox(box: PlayerBoxScore[]) {
    return box.reduce((acc, p) => ({
        mp: acc.mp + p.mp, pts: acc.pts + p.pts, offReb: acc.offReb + p.offReb, defReb: acc.defReb + p.defReb,
        ast: acc.ast + p.ast, stl: acc.stl + p.stl, blk: acc.blk + p.blk, tov: acc.tov + p.tov, pf: acc.pf + (p.pf || 0),
        fgm: acc.fgm + p.fgm, fga: acc.fga + p.fga, p3m: acc.p3m + p.p3m, p3a: acc.p3a + p.p3a,
        ftm: acc.ftm + p.ftm, fta: acc.fta + p.fta,
    }), { mp: 0, pts: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });
}

// mp(분, 소수 — 예: 34.3)를 "mm:ss" 시계 형식으로 변환. 초 단위 정밀도는 liveEngine.ts가
// 최종 박스스코어를 소수점 1자리(0.1분=6초)로 반올림해 저장하는 시점에 일부 소실되지만
// (최대 ±3초 오차), 뉴스 카드 표시용으로는 충분. 값이 없으면 null → 호출 쪽에서 기존
// 정수 분 표시로 폴백.
function formatMinutesClock(mp: number | undefined | null): string | null {
    if (mp == null || !Number.isFinite(mp)) return null;
    const totalSeconds = Math.round(mp * 60);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function pct(made: number, attempted: number): string {
    return attempted > 0 ? `${((made / attempted) * 100).toFixed(1)}%` : '0';
}

function tsPct(pts: number, fga: number, fta: number): string {
    const denom = 2 * (fga + 0.44 * fta);
    return denom > 0 ? `${((pts / denom) * 100).toFixed(1)}%` : '0';
}

const BOX_HEADER_CELL = 'py-1.5 px-2 text-sm font-bold text-slate-500 uppercase';
const BOX_STAT_CELL = 'py-1 px-2 text-sm text-slate-300';
const BOX_TOTAL_CELL = 'py-1.5 px-2 text-sm font-bold text-white';

// [2026-09-01] 사용자가 "실제 서비스 박스스코어(components/game/BoxScoreTable.tsx)와
// 디자인이 다르다"고 지적 — 조사해보니 이 컴포넌트는 그쪽을 재사용한 게 아니라
// components/common/Table.tsx(카드형 UI 테이블 프리미티브: rounded-xl+shadow+sticky
// 헤더)로 새로 만든 독자 구현이었다. 뉴스 레터 안에 카드 안의 카드가 겹치는 게
// 어색하다는 사용자 판단으로, 공용 컴포넌트로 통일하는 대신 카드 UI 자체를 걷어내고
// 순수 HTML <table> 텍스트 테이블로 간소화(테두리 없는 얇은 구분선만, 배경/그림자 없음)
// — 신문 박스스코어 같은 톤. 정렬 인터랙션 없음(선발 우선 + 출전시간 내림차순 고정).
// [2026-09-01 후속] 로고/tracking-wide*/tabular-nums/font-mono 삭제(사용자 요청, "텍스트
// 테이블"에 더 어울리게), MIN을 mm:ss로, REB을 OREB/TREB(offReb+defReb 합산)로 분리,
// PF/FG%/3P%/FT%/TS% 컬럼 추가 — offReb/defReb/pf는 PlayerBoxScore에 이미 있던
// 필드라 서버 변경 불필요.
const TeamBoxTable: React.FC<{
    team: LeagueTeamRow | undefined; teamSlug: string; box: PlayerBoxScore[];
    playerCardMap: PlayerCardMap; onPlayerClick?: (playerId: string) => void; onOpenTeam?: (teamSlug: string) => void;
    /** 이 뉴스(개인 활약/연속기록)의 주인공 선수 — 해당 행만 옅은 노란색으로 하이라이트. */
    highlightPlayerId?: string;
}> = ({ team, teamSlug, box, playerCardMap, onPlayerClick, onOpenTeam, highlightPlayerId }) => {
    const rows = [...box].filter(p => p.mp > 0).sort((a, b) => (b.gs - a.gs) || (b.mp - a.mp));
    if (rows.length === 0) return null;
    const totals = sumBox(rows);
    // [2026-09-01] 헤더 배경에 팀 테마 컬러 적용 요청 — TeamMark와 동일한 방식
    // (color_primary를 배경으로, color_text 없으면 getReadableTextColor로 대비색 계산).
    // 인라인 style로 적용해 BOX_HEADER_CELL의 text-slate-500 클래스와 충돌 없이 항상 이김.
    const headerBg = team?.color_primary ?? '#1e293b';
    const headerFg = team?.color_text ?? getReadableTextColor(headerBg);

    return (
        <div className="space-y-2">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-700" style={{ backgroundColor: headerBg }}>
                            <th
                                className={`py-1.5 px-2 text-left text-sm font-black ${onOpenTeam ? 'cursor-pointer hover:underline' : ''}`}
                                style={{ color: headerFg }}
                                onClick={onOpenTeam ? () => onOpenTeam(teamSlug) : undefined}
                            >
                                {team?.team_name ?? teamSlug}
                            </th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>POS</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>MIN</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>PTS</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>OREB</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>TREB</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>AST</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>STL</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>BLK</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>TOV</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>PF</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>FG</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>FG%</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>3P</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>3P%</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>FT</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>FT%</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>TS%</th>
                            <th className={`${BOX_HEADER_CELL} text-center`} style={{ color: headerFg }}>+/-</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(p => {
                            const entry = playerCardMap.get(p.playerId);
                            const isHighlighted = p.playerId === highlightPlayerId;
                            return (
                                <tr
                                    key={p.playerId}
                                    onClick={onPlayerClick ? () => onPlayerClick(p.playerId) : undefined}
                                    className={`border-b border-slate-800/60 ${isHighlighted ? 'bg-amber-400/10' : ''} ${onPlayerClick ? 'cursor-pointer hover:bg-white/5' : ''}`}
                                >
                                    <td className="py-1 px-2 text-left">
                                        <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                                            <span className="text-sm font-bold text-slate-300">{p.playerName}</span>
                                        </PlayerHoverCard>
                                    </td>
                                    <td className={`${BOX_STAT_CELL} text-center text-slate-500`}>{p.position ?? '-'}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{formatMinutesClock(p.mp) ?? Math.round(p.mp)}</td>
                                    <td className={`${BOX_STAT_CELL} text-center font-bold text-white`}>{p.pts}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{p.offReb}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{p.offReb + p.defReb}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{p.ast}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{p.stl}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{p.blk}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{p.tov}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{p.pf}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{p.fgm}/{p.fga}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{pct(p.fgm, p.fga)}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{p.p3m}/{p.p3a}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{pct(p.p3m, p.p3a)}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{p.ftm}/{p.fta}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{pct(p.ftm, p.fta)}</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{tsPct(p.pts, p.fga, p.fta)}</td>
                                    <td className={`${BOX_STAT_CELL} text-center font-bold ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                        {p.plusMinus > 0 ? '+' : ''}{p.plusMinus}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {/* 합계 행에 페이지 배경(bg-slate-900)보다 살짝 밝은 색을 깔아 테이블의
                        마무리를 시각적으로 구분(사용자 요청 — "완결성 부여"). */}
                    <tfoot className="bg-slate-800/40">
                        <tr className="border-t border-slate-700">
                            <td className="py-1.5 px-2 text-sm font-black text-white uppercase">합계</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>-</td>
                            {/* 합계 MIN(항상 5인×48분=240:00 고정값이라 정보량 없음) — 사용자 요청으로 비움 */}
                            <td className={`${BOX_TOTAL_CELL} text-center`} />
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{totals.pts}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{totals.offReb}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{totals.offReb + totals.defReb}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{totals.ast}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{totals.stl}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{totals.blk}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{totals.tov}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{totals.pf}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{totals.fgm}/{totals.fga}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{pct(totals.fgm, totals.fga)}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{totals.p3m}/{totals.p3a}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{pct(totals.p3m, totals.p3a)}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{totals.ftm}/{totals.fta}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{pct(totals.ftm, totals.fta)}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center`}>{tsPct(totals.pts, totals.fga, totals.fta)}</td>
                            <td className={`${BOX_TOTAL_CELL} text-center text-slate-600`}>—</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

const CardShell: React.FC<{
    accentColor: string;
    myTeam: boolean;
    onClick?: () => void;
    children: React.ReactNode;
    className?: string;
}> = ({ accentColor, myTeam, onClick, children, className = '' }) => (
    <div
        onClick={onClick}
        className={`relative flex flex-col gap-2 pl-3 pr-3 py-3 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden ${
            myTeam ? 'ring-1 ring-emerald-500/40' : ''
        } ${onClick ? 'cursor-pointer hover:bg-slate-800/60 transition-colors' : ''} ${className}`}
    >
        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accentColor }} />
        {myTeam && (
            <span className="absolute top-2 right-2 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">내 팀</span>
        )}
        {children}
    </div>
);

// ── 타입별 카드 ──────────────────────────────────────────────────────────────

// [2026-09-01] "경기 결과"를 FeatCard/StreakCard/WinStreakCard와 동일한 레터 구조로
// 재설계(사용자 요청) — 헤더(제목+날짜) → 본문(기사) → 쿼터별 득점 테이블 → 박스스코어
// 테이블 순서. 전적/OVR을 보여주던 3단 가로 스코어보드 레이아웃은 이 레터 형식에 들어갈
// 자리가 없어(다른 letter 카드들도 전적/OVR을 안 보여줌) 통째로 걷어냈다 — 그 값을
// 계산해 내려주던 MultiNewsFeedView.tsx의 record/teamOvr 관련 코드도 같이 정리(더 이상
// 쓰는 곳이 없어져 완전한 죽은 코드가 됨).
// 박스스코어/쿼터별 득점은 event.gameId로 그 경기 하나만 즉석 조회(useGameBoxScore —
// FeatCard와 동일한 이유: 좌측 리스트+우측 디테일 레이아웃이라 선택된 카드 하나만
// 그려짐). quarter_scores는 game_pbp에 시뮬레이션 종료 시 이미 계산돼 저장돼 있어
// (server/src/liveGameView.ts의 computeQuarterScoresFromEvents) 클라이언트에서
// 재계산할 필요가 없다 — loadGameBoxScore()가 그대로 select해서 내려줌.
export const GameResultCard: React.FC<{
    event: LeagueEvent;
    teamBySlug: Map<string, LeagueTeamRow>;
    playerCardMap: PlayerCardMap;
    roomId: string | undefined;
    onOpenGame?: (gameId: string) => void;
    onOpenTeam?: (teamSlug: string) => void;
    onPlayerClick?: (playerId: string) => void;
}> = ({ event, teamBySlug, playerCardMap, roomId, onOpenGame, onOpenTeam, onPlayerClick }) => {
    if (event.detail.kind !== 'game_result') return null;
    const { homeSlug, awaySlug, homeScore, awayScore } = event.detail;
    const homeWon = homeScore > awayScore;
    const winnerSlug = homeWon ? homeSlug : awaySlug;
    const winnerName = teamBySlug.get(winnerSlug)?.team_name ?? winnerSlug;
    const blurb = buildNewsBlurb(event, teamBySlug);
    const { data: boxScore, isLoading: isBoxLoading } = useGameBoxScore(roomId, event.gameId);

    // event.headline은 항상 winnerName으로 시작하는 완성 문장이라(leagueEvents.ts의
    // detectGameResult) 그 접두사만 잘라 클릭 가능하게 만든다(HeadlineTitle과 동일한
    // 원리 — 다만 선수가 아니라 팀이라 PlayerHoverCard 없이 onOpenTeam만 연결).
    const hasPrefix = event.headline.startsWith(winnerName);
    const titleNamePart = hasPrefix ? winnerName : event.headline;
    const titleRest = hasPrefix ? event.headline.slice(winnerName.length) : '';

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            {event.involvesMyTeam && (
                <span className="absolute top-0 right-0 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">내 팀</span>
            )}
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">
                    <span
                        className={onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
                        onClick={onOpenTeam ? () => onOpenTeam(winnerSlug) : undefined}
                    >
                        {titleNamePart}
                    </span>
                    {titleRest}
                </h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>

            {blurb && (
                <div className="space-y-2">
                    {blurb.map((line, idx) => (
                        <p key={idx} className="text-sm text-slate-300 leading-relaxed">{line}</p>
                    ))}
                </div>
            )}

            {isBoxLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-indigo-400" />
                </div>
            ) : boxScore ? (
                <div className="space-y-4">
                    <BoxScoreHeadline
                        game={{ homeSlug, awaySlug, homeScore, awayScore }} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam}
                        onOpenGame={event.gameId && onOpenGame ? () => onOpenGame(event.gameId!) : undefined}
                    />
                    {boxScore.quarterScores && (
                        <QuarterScoreTable
                            homeSlug={boxScore.homeTeamId} awaySlug={boxScore.awayTeamId}
                            homeScore={boxScore.homeScore} awayScore={boxScore.awayScore}
                            quarterScores={boxScore.quarterScores} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam}
                        />
                    )}
                    <div className="space-y-4">
                        <h4 className="text-base font-black text-white uppercase">박스스코어</h4>
                        <TeamBoxTable team={teamBySlug.get(boxScore.awayTeamId)} teamSlug={boxScore.awayTeamId} box={boxScore.awayBox} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
                        <TeamBoxTable team={teamBySlug.get(boxScore.homeTeamId)} teamSlug={boxScore.homeTeamId} box={boxScore.homeBox} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
                    </div>
                </div>
            ) : event.gameId ? (
                <p className="text-xs text-slate-500 ko-normal py-4 text-center border border-dashed border-slate-800 rounded-lg">
                    박스스코어는 경기 종료 후 최대 10분 뒤 공개됩니다.
                </p>
            ) : null}
        </div>
    );
};

// [2026-09-01] "실제 뉴스기사처럼" 요청 — 카드형(CardShell, 배경/테두리 박스) 디자인을
// 완전히 해체하고 트레이드 제안서(MultiFrontOfficeView.tsx의 renderOfferLetter)/싱글플레이어
// 인박스 메시지(components/inbox/GameRecapViewer.tsx)와 같은 문서형 레터로 재설계.
// [뉴스글] → [최종 스코어(클릭 시 경기 페이지 이동)] → [양팀 박스스코어 테이블] 순서.
// 박스스코어는 league_events에 없는 데이터라 event.gameId로 그 경기 하나만 즉석 조회
// (useGameBoxScore — 뉴스피드가 좌측 리스트+우측 디테일 레이아웃이라 한 번에 카드 하나만
// 그려지므로 선택된 것만 불러오면 됨, 새로 페이지를 열 필요 없음).
export const FeatCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    roomId: string | undefined;
    onPlayerClick?: (playerId: string) => void; onOpenGame?: (gameId: string) => void; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, playerCardMap, roomId, onPlayerClick, onOpenGame, onOpenTeam }) => {
    if (event.detail.kind !== 'player_feat') return null;
    const { player, game } = event.detail;
    const entry = playerCardMap.get(player.id);
    const blurb = buildNewsBlurb(event, teamBySlug);
    const { data: boxScore, isLoading: isBoxLoading } = useGameBoxScore(roomId, event.gameId);

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            {event.involvesMyTeam && (
                <span className="absolute top-0 right-0 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">내 팀</span>
            )}
            <div className="space-y-2">
                {/* [2026-09-01] 상대시각/피처타입 배지 줄 삭제(사용자 요청) — 대신 실제 뉴스
                    헤드라인(event.headline, 예: "루디 고베어, 더블더블(25득점-15리바운드) 달성")을
                    선수명에 쓰던 폰트(h1, font-black text-xl text-white)로 그대로 표시.
                    [후속] 호버/클릭 효과는 헤드라인 전체가 아니라 선수 이름 부분에만
                    적용되도록 HeadlineTitle로 분리(사용자 요청). */}
                <HeadlineTitle
                    headline={event.headline} playerName={player.name} entry={entry}
                    onPlayerClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
                />
                {/* [2026-09-01] 타이틀 하단에 뉴스 발생 날짜(인게임/시뮬레이션 날짜) 표기 요청. */}
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>

            {blurb && (
                <div className="space-y-2">
                    {blurb.map((line, idx) => (
                        <p key={idx} className="text-sm text-slate-300 leading-relaxed">{line}</p>
                    ))}
                </div>
            )}

            {isBoxLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-indigo-400" />
                </div>
            ) : boxScore ? (
                <div className="space-y-4">
                    <BoxScoreHeadline
                        game={game} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam}
                        onOpenGame={event.gameId && onOpenGame ? () => onOpenGame(event.gameId!) : undefined}
                    />
                    <TeamBoxTable team={teamBySlug.get(boxScore.awayTeamId)} teamSlug={boxScore.awayTeamId} box={boxScore.awayBox} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} highlightPlayerId={player.id} />
                    <TeamBoxTable team={teamBySlug.get(boxScore.homeTeamId)} teamSlug={boxScore.homeTeamId} box={boxScore.homeBox} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} highlightPlayerId={player.id} />
                </div>
            ) : event.gameId ? (
                // [2026-09-01 버그 수정] game_pbp RLS(g_member_select와 달리 "+10분 지연" 조건이
                // 걸려 있음 — migrations 쪽 정책 "room members can read game_pbp":
                // game_start_time + 10분 <= now()) 때문에 방금 시뮬레이션된 경기는 박스스코어
                // 행 자체가 조회되지 않는다(존재는 하지만 RLS가 가려서 null로 옴). 이전엔 이
                // 경우를 "데이터 없음"과 구분 안 하고 조용히 아무것도 안 그려서 사용자가 버그로
                // 오인했다 — 이유를 명시.
                <p className="text-xs text-slate-500 ko-normal py-4 text-center border border-dashed border-slate-800 rounded-lg">
                    박스스코어는 경기 종료 후 최대 10분 뒤 공개됩니다.
                </p>
            ) : null}
        </div>
    );
};

// FeatCard와 완전히 동일한 문서형 레이아웃(같은 "단일 경기에 묶인 개인 기록" 계열이라 일관성
// 유지) — 상단 배지만 "N경기 연속"으로 다름.
export const StreakCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    roomId: string | undefined;
    onPlayerClick?: (playerId: string) => void; onOpenGame?: (gameId: string) => void; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, playerCardMap, roomId, onPlayerClick, onOpenGame, onOpenTeam }) => {
    if (event.detail.kind !== 'player_streak') return null;
    const { player, game } = event.detail;
    const entry = playerCardMap.get(player.id);
    const blurb = buildNewsBlurb(event, teamBySlug);
    const { data: boxScore, isLoading: isBoxLoading } = useGameBoxScore(roomId, event.gameId);

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            {event.involvesMyTeam && (
                <span className="absolute top-0 right-0 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">내 팀</span>
            )}
            <div className="space-y-2">
                {/* [2026-09-01] 상대시각/연속기록 배지 줄 삭제(사용자 요청) — 대신 실제 뉴스
                    헤드라인(event.headline, 예: "N경기 연속 20+득점")을 선수명에 쓰던 폰트로
                    표시. [후속] 호버/클릭 효과는 선수 이름 부분에만(HeadlineTitle). */}
                <HeadlineTitle
                    headline={event.headline} playerName={player.name} entry={entry}
                    onPlayerClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
                />
                {/* [2026-09-01] 타이틀 하단에 뉴스 발생 날짜(인게임/시뮬레이션 날짜) 표기 요청. */}
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>

            {blurb && (
                <div className="space-y-2">
                    {blurb.map((line, idx) => (
                        <p key={idx} className="text-sm text-slate-300 leading-relaxed">{line}</p>
                    ))}
                </div>
            )}

            {isBoxLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-indigo-400" />
                </div>
            ) : boxScore ? (
                <div className="space-y-4">
                    <BoxScoreHeadline
                        game={game} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam}
                        onOpenGame={event.gameId && onOpenGame ? () => onOpenGame(event.gameId!) : undefined}
                    />
                    <TeamBoxTable team={teamBySlug.get(boxScore.awayTeamId)} teamSlug={boxScore.awayTeamId} box={boxScore.awayBox} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} highlightPlayerId={player.id} />
                    <TeamBoxTable team={teamBySlug.get(boxScore.homeTeamId)} teamSlug={boxScore.homeTeamId} box={boxScore.homeBox} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} highlightPlayerId={player.id} />
                </div>
            ) : event.gameId ? (
                // [2026-09-01 버그 수정] game_pbp RLS(g_member_select와 달리 "+10분 지연" 조건이
                // 걸려 있음 — migrations 쪽 정책 "room members can read game_pbp":
                // game_start_time + 10분 <= now()) 때문에 방금 시뮬레이션된 경기는 박스스코어
                // 행 자체가 조회되지 않는다(존재는 하지만 RLS가 가려서 null로 옴). 이전엔 이
                // 경우를 "데이터 없음"과 구분 안 하고 조용히 아무것도 안 그려서 사용자가 버그로
                // 오인했다 — 이유를 명시.
                <p className="text-xs text-slate-500 ko-normal py-4 text-center border border-dashed border-slate-800 rounded-lg">
                    박스스코어는 경기 종료 후 최대 10분 뒤 공개됩니다.
                </p>
            ) : null}
        </div>
    );
};

// [2026-09-01] "팀 연승" 카드를 CardShell 기반 컴팩트 디자인에서 FeatCard/StreakCard와
// 동일한 레터 디자인으로 재설계 — 헤더(제목+날짜) → 본문(기사) → 연승 경기 리스트("날짜
// AAA 000-000 BBB | 최우수선수", 팀명/선수명 전부 클릭 가능) 순서. 경기 리스트는
// event.detail.games(서버가 연승 시점에 game_pbp를 조회해 채운 배열, 최신순)를 그대로
// 순회 — FeatCard의 박스스코어처럼 별도 즉석 조회가 필요 없음(이미 payload에 다 있음).
export const WinStreakCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => {
    if (event.detail.kind !== 'win_streak') return null;
    const { teamSlug, streak, games } = event.detail;
    const team = teamBySlug.get(teamSlug);
    const blurb = buildNewsBlurb(event, teamBySlug);

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            {event.involvesMyTeam && (
                <span className="absolute top-0 right-0 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">내 팀</span>
            )}
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">
                    <span
                        className={onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
                        onClick={onOpenTeam ? () => onOpenTeam(teamSlug) : undefined}
                    >
                        {team?.team_name ?? teamSlug}
                    </span>
                    {`, ${streak}연승 질주`}
                </h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>

            {blurb && (
                <div className="space-y-2">
                    {blurb.map((line, idx) => (
                        <p key={idx} className="text-sm text-slate-300 leading-relaxed">{line}</p>
                    ))}
                </div>
            )}

            {games.length > 0 && (
                <div className="space-y-1">
                    <h4 className="text-base font-black text-white uppercase">연승 경기 기록</h4>
                    <div className="divide-y divide-slate-800/60">
                        {games.map(g => {
                            const homeTeam = teamBySlug.get(g.homeSlug);
                            const awayTeam = teamBySlug.get(g.awaySlug);
                            const mvpEntry = g.mvp ? playerCardMap.get(g.mvp.playerId) : undefined;
                            return (
                                <div key={g.gameId} className="flex items-center gap-2 py-2 text-sm">
                                    <span className="text-slate-500 shrink-0">{g.gameDate}</span>
                                    <span
                                        className={`font-bold text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onOpenTeam ? () => onOpenTeam(g.awaySlug) : undefined}
                                    >
                                        {awayTeam?.team_abbr ?? g.awaySlug}
                                    </span>
                                    <span className="text-slate-300">{g.awayScore}-{g.homeScore}</span>
                                    <span
                                        className={`font-bold text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onOpenTeam ? () => onOpenTeam(g.homeSlug) : undefined}
                                    >
                                        {homeTeam?.team_abbr ?? g.homeSlug}
                                    </span>
                                    {g.mvp && (
                                        <>
                                            <span className="text-slate-600">|</span>
                                            <PlayerHoverCard player={mvpEntry?.player} teamAbbr={mvpEntry?.teamAbbr}>
                                                <span
                                                    className={onPlayerClick ? 'font-bold text-slate-300 cursor-pointer hover:text-indigo-400 hover:underline' : 'font-bold text-slate-300'}
                                                    onClick={onPlayerClick ? () => onPlayerClick(g.mvp!.playerId) : undefined}
                                                >
                                                    {g.mvp.name}
                                                </span>
                                            </PlayerHoverCard>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export const TradeCard: React.FC<{ event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap; onPlayerClick?: (playerId: string) => void; tier: CardTier }> = ({ event, teamBySlug, playerCardMap, onPlayerClick, tier }) => {
    if (event.detail.kind !== 'trade') return null;
    const { teamA, teamB, aOut, bOut } = event.detail;
    const a = teamBySlug.get(teamA.slug);
    const b = teamBySlug.get(teamB.slug);

    // 콤마로 이어붙이던 문자열 join 대신, 선수별로 개별 span을 만들어 각각에 hover 카드를 붙인다.
    // 콤마는 이름과 별도 span으로 분리 — hover 가능 영역에 콤마까지 포함되지 않도록
    // (MultiFrontOfficeView.tsx의 renderPlayerList와 동일한 패턴).
    const renderNames = (players: { id: string; name: string }[]) => {
        if (players.length === 0) return '—';
        return players.map((p, i) => {
            const entry = playerCardMap.get(p.id);
            return (
                <React.Fragment key={p.id}>
                    {i > 0 && <span className="text-slate-600">, </span>}
                    <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                        <span
                            className={onPlayerClick ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
                            onClick={onPlayerClick ? () => onPlayerClick(p.id) : undefined}
                        >
                            {p.name}
                        </span>
                    </PlayerHoverCard>
                </React.Fragment>
            );
        });
    };

    return (
        <CardShell accentColor={a?.color_primary ?? '#334155'} myTeam={event.involvesMyTeam} className={tier === 'hero' ? 'sm:col-span-2' : ''}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                    <TeamMark team={a} teamSlug={teamA.slug} />
                    <ArrowLeftRight size={12} className="text-slate-600 shrink-0" />
                    <TeamMark team={b} teamSlug={teamB.slug} />
                </div>
                <span className="text-[11px] text-slate-600 tabular-nums">{formatRelativeTime(event.createdAt)}</span>
            </div>
            <BigStat value={`${aOut.length}↔${bOut.length}`} label="트레이드 성사" tier={tier} />
            <p className="text-xs text-slate-500 ko-normal leading-snug truncate">
                {a?.team_abbr}: {renderNames(aOut)} · {b?.team_abbr}: {renderNames(bOut)}
            </p>
            <Blurb lines={buildNewsBlurb(event, teamBySlug)} className="border-t border-slate-800 pt-2" />
        </CardShell>
    );
};

// ── 폴백(옛 이벤트, payload.v 없음) ──────────────────────────────────────────
const HEADLINE_ICON: Record<LeagueEventType, LucideIcon> = {
    game_result: Tv,
    player_feat: Star,
    player_streak: Flame,
    win_streak: TrendingUp,
    trade: ArrowLeftRight,
};

export const LegacyCard: React.FC<{ event: LeagueEvent }> = ({ event }) => {
    const Icon = HEADLINE_ICON[event.type];
    return (
        <div
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
                event.involvesMyTeam ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900 border-slate-800'
            }`}
        >
            <Icon size={16} className="text-slate-500 mt-0.5 shrink-0" />
            <span className="flex-1 min-w-0 text-sm text-slate-200 ko-normal leading-snug">{event.headline}</span>
            <span className="text-xs text-slate-500 tabular-nums shrink-0 ko-normal">{formatRelativeTime(event.createdAt)}</span>
        </div>
    );
};

// 타입별 카드 dispatcher — MultiNewsFeedView.tsx가 스토리 그리드를 순회할 때 사용.
// [2026-09-01] "경기 결과" 섹션 삭제 후 game_result(대량득점차 등 특이케이스만, 쿼리에서
// 이미 필터링됨)도 이 피드에 섞여 들어온다 — GameResultCard는 항상 col-span-full이라
// 그리드 안에서도 자연스럽게 한 행 전체를 차지.
export const StoryCard: React.FC<{
    event: LeagueEvent;
    teamBySlug: Map<string, LeagueTeamRow>;
    playerCardMap: PlayerCardMap;
    /** FeatCard/StreakCard/GameResultCard가 그 경기의 박스스코어를 즉석 조회할 때 필요
     * (useGameBoxScore). */
    roomId: string | undefined;
    onOpenGame?: (gameId: string) => void;
    onPlayerClick?: (playerId: string) => void;
    onOpenTeam?: (teamSlug: string) => void;
    tier: CardTier;
}> = ({ event, teamBySlug, playerCardMap, roomId, onOpenGame, onPlayerClick, onOpenTeam, tier }) => {
    switch (event.detail.kind) {
        case 'game_result': return <GameResultCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} roomId={roomId} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />;
        case 'player_feat': return <FeatCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} roomId={roomId} onPlayerClick={onPlayerClick} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} />;
        case 'player_streak': return <StreakCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} roomId={roomId} onPlayerClick={onPlayerClick} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} />;
        case 'win_streak': return <WinStreakCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />;
        case 'trade': return <TradeCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} tier={tier} />;
        default: return <LegacyCard event={event} />;
    }
};

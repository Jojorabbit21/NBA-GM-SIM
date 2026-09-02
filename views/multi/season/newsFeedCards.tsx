
import React, { useMemo } from 'react';
import { Flame, Loader2, TrendingUp, TrendingDown, Star, ArrowLeftRight, Tv, BarChart3, Trophy, Shield, type LucideIcon } from 'lucide-react';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { TeamBadge } from '../../../components/common/TeamBadge';
import { getReadableTextColor } from '../../../utils/colorContrast';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import type { LeagueEvent, LeagueEventType } from '../../../hooks/useLeagueHeadlines';
import type { PlayerBoxScore } from '../../../types/engine';
import { formatRelativeTime } from '../../../utils/formatRelativeTime';
import { PlayerHoverCard, type PlayerCardEntry, type PlayerCardMap, mergeStatsIntoPlayerCardMap } from '../../../components/common/PlayerHoverCard';
import { buildNewsBlurb, buildNewsTitle } from '../../../services/multi/newsBlurb';
import { useGameBoxScore } from '../../../hooks/useGameBoxScore';
import { usePlayerSeasonStatsBatch } from '../../../hooks/usePlayerSeasonStatsBatch';
import type { GameBoxScoreData } from '../../../services/multi/gameQueries';
import { formatMoney } from '../../../utils/formatMoney';
import type { AllNbaTeamEntry, AllDefTeamEntry } from '../../../services/multi/leagueEventPayload';

// PlayerCardEntry/PlayerCardMap은 PlayerHoverCard.tsx에 정의(다른 화면들도 공유) — 여기서는
// 재수출만 해서 이 모듈을 이미 import하고 있는 곳(MultiNewsFeedView.tsx 등)의 기존 import
// 경로를 그대로 유지한다.
export type { PlayerCardEntry, PlayerCardMap };

/** 이벤트 하나에 등장하는 선수 id 전부 추출 — MultiNewsFeedView.tsx가 현재 화면에 로드된
 *  이벤트들만 모아 usePlayerSeasonStatsBatch에 넘길 대상 선수 목록을 만들 때 사용
 *  (리그 전체가 아니라 실제 보이는 선수 몇 명만 시즌 스탯을 조회하기 위함). */
export function extractEventPlayerIds(event: LeagueEvent): string[] {
    switch (event.detail.kind) {
        case 'game_result': {
            const ids: string[] = [];
            if (event.detail.mvpAway) ids.push(event.detail.mvpAway.playerId);
            if (event.detail.mvpHome) ids.push(event.detail.mvpHome.playerId);
            return ids;
        }
        case 'player_feat': return [event.detail.player.id];
        case 'player_streak': return [event.detail.player.id];
        case 'win_streak': return event.detail.games.filter(g => g.mvp).map(g => g.mvp!.playerId);
        case 'trade': return [...event.detail.aOut, ...event.detail.bOut].map(p => p.id);
        case 'power_ranking': return [];
        case 'mvp_award': return event.detail.ranking.map(r => r.playerId);
        case 'dpoy_award': return event.detail.ranking.map(r => r.playerId);
        case 'all_nba_team': return event.detail.tiers.flatMap(t => t.players.map(p => p.playerId));
        case 'all_def_team': return event.detail.tiers.flatMap(t => t.players.map(p => p.playerId));
        default: return [];
    }
}

/** MultiNewsFeedView.tsx가 selectedEvent 기준으로 넘겨주는 playerCardMap은 그 이벤트의
 *  "주인공"(MVP/개인기록 선수) 한두 명만 커버한다 — 박스스코어 테이블(TeamBoxTable)은 그
 *  경기에 뛴 선수 전원(수십 명)을 보여주므로, boxScore가 로드되면 그 전원의 playerId로
 *  한 번 더 시즌 스탯을 조회해 병합한 맵을 만든다. boxScore 로딩 전/이벤트에 박스스코어가
 *  없는 경우(win_streak/trade)엔 원본 playerCardMap을 그대로 반환. */
function useBoxScorePlayerCardMap(
    roomId: string | undefined,
    boxScore: GameBoxScoreData | null | undefined,
    playerCardMap: PlayerCardMap,
): PlayerCardMap {
    const boxPlayerIds = useMemo(
        () => boxScore ? [...boxScore.homeBox, ...boxScore.awayBox].map(p => p.playerId) : [],
        [boxScore],
    );
    const { data: boxStats } = usePlayerSeasonStatsBatch(roomId, boxPlayerIds);
    return useMemo(
        () => boxStats ? mergeStatsIntoPlayerCardMap(playerCardMap, boxStats) : playerCardMap,
        [playerCardMap, boxStats],
    );
}

// newsFeedCards.tsx — MultiNewsFeedView.tsx의 프레젠테이셔널 마크업 전용 형제 모듈
// [2026-09-01]. GameDateStrip.tsx가 MultiSeasonLayout에서 분리됐던 것과 동일한 이유:
// 화면 파일 자체가 너무 커지는 걸 막고, 로직/데이터(useLeagueHeadlines 등)는 훅에,
// 마크업은 화면별 로컬 모듈에 두는 이 프로젝트 관례를 따른다.
//
// [2026-09-01] 5개 타입(game_result/player_feat/player_streak/win_streak/trade) 전부
// 카드형 CardShell/BigStat/TeamMark(대형 스탯 숫자+팀 로고 컴팩트 카드) 디자인에서 레터
// 디자인(헤더+본문+표)으로 순차 재설계 완료 — CardTier/tierFromScore/BIG_STAT_SIZE/
// TeamMark/BigStat/CardShell은 더 이상 어떤 카드도 쓰지 않아 전부 삭제(죽은 코드).

// [2026-09-02] 가상 언론사 The Basketball Chronicle 로고(public/images/bc2.svg, 원래
// bc.svg에서 교체)를 모든 레터 카드 헤더 최상단(마스트헤드 격, h-4)과 본문 최하단
// (기사 종료 표식 격, 불투명도 없이 좌측 정렬, h-3)에 표시(사용자 요청 — 크기는
// h-8→h-[22.4px]→h-4(헤더), h-5→h-3(하단) 순으로 여러 차례 축소) — 6개 카드
// (GameResultCard/FeatCard/StreakCard/WinStreakCard/TradeCard/PowerRankingCard)
// 전부 동일하게 적용.
const BrandMark: React.FC<{ className?: string }> = ({ className = '' }) => (
    <img src="/images/bc2.svg" alt="The Basketball Chronicle" className={className} />
);

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
    // 박스스코어에 등장하는 선수 전원(수십 명) — 헤더로 넘어온 playerCardMap은 MVP 한두 명만
    // 커버해서, 박스스코어 테이블 안 나머지 선수들은 시즌 스탯 없이 표시되던 문제.
    const boxPlayerCardMap = useBoxScorePlayerCardMap(roomId, boxScore, playerCardMap);

    // [2026-09-01] "제목도 바리에이션" 요청 — DB에 고정 저장된 event.headline 대신
    // buildNewsTitle()이 event.id 기반으로 매번 같은(결정론적) varied 제목을 만들어준다.
    // 이 제목도 항상 winnerName으로 시작하도록 조립되므로(newsBlurb.ts 참고) 접두사만
    // 잘라 클릭 가능하게 만드는 원리는 그대로(HeadlineTitle과 동일 — 다만 선수가 아니라
    // 팀이라 PlayerHoverCard 없이 onOpenTeam만 연결). buildNewsTitle이 null이면(레거시
    // 등 이론상만) event.headline으로 폴백.
    const title = buildNewsTitle(event, teamBySlug) ?? event.headline;
    const hasPrefix = title.startsWith(winnerName);
    const titleNamePart = hasPrefix ? winnerName : title;
    const titleRest = hasPrefix ? title.slice(winnerName.length) : '';

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
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
                        <TeamBoxTable team={teamBySlug.get(boxScore.awayTeamId)} teamSlug={boxScore.awayTeamId} box={boxScore.awayBox} playerCardMap={boxPlayerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
                        <TeamBoxTable team={teamBySlug.get(boxScore.homeTeamId)} teamSlug={boxScore.homeTeamId} box={boxScore.homeBox} playerCardMap={boxPlayerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
                    </div>
                </div>
            ) : event.gameId ? (
                <p className="text-xs text-slate-500 ko-normal py-4 text-center border border-dashed border-slate-800 rounded-lg">
                    박스스코어는 경기 종료 후 최대 10분 뒤 공개됩니다.
                </p>
            ) : null}

            <BrandMark className="h-3 w-auto" />
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
    const blurb = buildNewsBlurb(event, teamBySlug);
    const { data: boxScore, isLoading: isBoxLoading } = useGameBoxScore(roomId, event.gameId);
    // 박스스코어에 등장하는 선수 전원(수십 명) — 헤더로 넘어온 playerCardMap은 이 선수 한
    // 명만 커버해서, 박스스코어 테이블 안 나머지 선수들은 시즌 스탯 없이 표시되던 문제.
    const boxPlayerCardMap = useBoxScorePlayerCardMap(roomId, boxScore, playerCardMap);
    const entry = boxPlayerCardMap.get(player.id);

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                {/* [2026-09-01] 상대시각/피처타입 배지 줄 삭제(사용자 요청) — 대신 실제 뉴스
                    헤드라인(예: "루디 고베어, 더블더블(25득점-15리바운드) 달성")을 선수명에
                    쓰던 폰트(h1, font-black text-xl text-white)로 그대로 표시.
                    [후속] 호버/클릭 효과는 헤드라인 전체가 아니라 선수 이름 부분에만
                    적용되도록 HeadlineTitle로 분리(사용자 요청).
                    [후속2] "제목도 바리에이션" 요청 — DB 고정 headline 대신
                    buildNewsTitle()의 event.id 기반 결정론적 varied 제목 사용(null이면
                    event.headline 폴백). */}
                <HeadlineTitle
                    headline={buildNewsTitle(event, teamBySlug) ?? event.headline} playerName={player.name} entry={entry}
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
                    <TeamBoxTable team={teamBySlug.get(boxScore.awayTeamId)} teamSlug={boxScore.awayTeamId} box={boxScore.awayBox} playerCardMap={boxPlayerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} highlightPlayerId={player.id} />
                    <TeamBoxTable team={teamBySlug.get(boxScore.homeTeamId)} teamSlug={boxScore.homeTeamId} box={boxScore.homeBox} playerCardMap={boxPlayerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} highlightPlayerId={player.id} />
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

            <BrandMark className="h-3 w-auto" />
        </div>
    );
};

// FeatCard와 완전히 동일한 문서형 레이아웃(같은 "단일 경기에 묶인 개인 기록" 계열이라 일관성
// 유지) — 상단 배지만 "N경기 연속"으로 다름.
// [2026-09-02] "연속 기록 서신에서는 박스스코어를 빼고, 대신 연속 기록 리스트 자체를
// PTS/REB/AST/STL/BLK/TOV/PF/FG%/3P%/FT% 컬럼을 갖춘 테이블로 보여달라" 요청 — 이 경기
// 하나의 전체 박스스코어(양팀 전원)는 이 선수 개인의 연속 기록과 무관한 정보라 제거하고,
// 대신 연속 기록을 구성하는 "이 선수의" 경기별 스탯 라인을 테이블로 표시한다. 스타일은
// TeamBoxTable(박스스코어)과 동일한 톤(BOX_HEADER_CELL/BOX_STAT_CELL, pct(), 테두리 없는
// 얇은 구분선)을 그대로 재사용 — "기존 서신에 쓰던 박스스코어와 동일한 스타일" 요청 반영.
// 이제 경기당 박스스코어를 즉석 조회할 필요가 없어져 useGameBoxScore/roomId는 함께
// 제거(entry는 playerCardMap에서 바로 조회 — player_streak 이벤트의 playerIds가 이미
// 이 선수 하나를 커버하므로 boxPlayerCardMap 없이도 충분, buildPlayerCardMap 참고).
// onOpenGame은 유지 — [2026-09-02 후속] 스코어 클릭 시 그 경기 결과 화면으로 이동 요청.
export const StreakCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onPlayerClick?: (playerId: string) => void; onOpenTeam?: (teamSlug: string) => void;
    onOpenGame?: (gameId: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onPlayerClick, onOpenTeam, onOpenGame }) => {
    if (event.detail.kind !== 'player_streak') return null;
    const { player, streaks } = event.detail;
    const blurb = buildNewsBlurb(event, teamBySlug);
    const entry = playerCardMap.get(player.id);

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                {/* [2026-09-01] 상대시각/연속기록 배지 줄 삭제(사용자 요청) — 대신 실제 뉴스
                    헤드라인(예: "N경기 연속 20+득점")을 선수명에 쓰던 폰트로 표시.
                    [후속] 호버/클릭 효과는 선수 이름 부분에만(HeadlineTitle).
                    [후속2] "제목도 바리에이션" 요청 — buildNewsTitle() 사용(null이면
                    event.headline 폴백). */}
                <HeadlineTitle
                    headline={buildNewsTitle(event, teamBySlug) ?? event.headline} playerName={player.name} entry={entry}
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

            {/* [2026-09-02] "연속기록 중인 모든 경기의 결과를 표시할 수 있나" 요청 — WinStreakCard의
                "연승 경기 기록" 리스트와 동일한 패턴. 동시에 여러 규칙(예: 20+득점 연속 + 10+리바운드
                연속)이 걸려 있으면 규칙별로 각각 테이블을 만든다(규칙마다 연속 길이/경기 구성이
                다를 수 있어서 — server/src/shared/leagueEvents.ts의 gamesForRule 참고). */}
            {streaks.filter(s => s.games.length > 0).map(s => (
                <div key={s.ruleKey} className="space-y-2">
                    <h4 className="text-base font-black text-white uppercase">{s.label} 연속 기록</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className={BOX_HEADER_CELL}>날짜</th>
                                    <th className={BOX_HEADER_CELL}>상대</th>
                                    <th className={`${BOX_HEADER_CELL} text-center`}>PTS</th>
                                    <th className={`${BOX_HEADER_CELL} text-center`}>REB</th>
                                    <th className={`${BOX_HEADER_CELL} text-center`}>AST</th>
                                    <th className={`${BOX_HEADER_CELL} text-center`}>STL</th>
                                    <th className={`${BOX_HEADER_CELL} text-center`}>BLK</th>
                                    <th className={`${BOX_HEADER_CELL} text-center`}>TOV</th>
                                    <th className={`${BOX_HEADER_CELL} text-center`}>PF</th>
                                    <th className={`${BOX_HEADER_CELL} text-center`}>FG%</th>
                                    <th className={`${BOX_HEADER_CELL} text-center`}>3P%</th>
                                    <th className={`${BOX_HEADER_CELL} text-center`}>FT%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {s.games.map(g => {
                                    const homeTeam = teamBySlug.get(g.homeSlug);
                                    const awayTeam = teamBySlug.get(g.awaySlug);
                                    return (
                                        <tr key={g.gameId} className="border-b border-slate-800/60">
                                            <td className={`${BOX_STAT_CELL} whitespace-nowrap`}>{g.gameDate}</td>
                                            <td className={`${BOX_STAT_CELL} whitespace-nowrap`}>
                                                <span
                                                    className={`font-bold text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                                    onClick={onOpenTeam ? () => onOpenTeam(g.awaySlug) : undefined}
                                                >
                                                    {awayTeam?.team_abbr ?? g.awaySlug}
                                                </span>
                                                {' '}
                                                <span
                                                    className={onOpenGame ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
                                                    onClick={onOpenGame ? () => onOpenGame(g.gameId) : undefined}
                                                >
                                                    {g.awayScore}-{g.homeScore}
                                                </span>
                                                {' '}
                                                <span
                                                    className={`font-bold text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                                    onClick={onOpenTeam ? () => onOpenTeam(g.homeSlug) : undefined}
                                                >
                                                    {homeTeam?.team_abbr ?? g.homeSlug}
                                                </span>
                                            </td>
                                            <td className={`${BOX_STAT_CELL} text-center font-bold text-white`}>{g.pts}</td>
                                            <td className={`${BOX_STAT_CELL} text-center`}>{g.reb}</td>
                                            <td className={`${BOX_STAT_CELL} text-center`}>{g.ast}</td>
                                            <td className={`${BOX_STAT_CELL} text-center`}>{g.stl}</td>
                                            <td className={`${BOX_STAT_CELL} text-center`}>{g.blk}</td>
                                            <td className={`${BOX_STAT_CELL} text-center`}>{g.tov}</td>
                                            <td className={`${BOX_STAT_CELL} text-center`}>{g.pf}</td>
                                            <td className={`${BOX_STAT_CELL} text-center`}>{pct(g.fgm, g.fga)}</td>
                                            <td className={`${BOX_STAT_CELL} text-center`}>{pct(g.p3m, g.p3a)}</td>
                                            <td className={`${BOX_STAT_CELL} text-center`}>{pct(g.ftm, g.fta)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}

            <BrandMark className="h-3 w-auto" />
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

    // [2026-09-01] "제목도 바리에이션" 요청 — 고정된 ", N연승 질주" 대신
    // buildNewsTitle()이 event.id 기반으로 매번 같은(결정론적) varied 제목을 만든다.
    // 이름 접두사는 항상 team?.team_name과 정확히 일치하도록 조립되므로(newsBlurb.ts)
    // 그 부분만 잘라 클릭 가능하게 유지. buildNewsTitle이 null이면(이론상만) 기존
    // 고정 문구로 폴백.
    const teamNameText = team?.team_name ?? teamSlug;
    const title = buildNewsTitle(event, teamBySlug) ?? `${teamNameText}, ${streak}연승 질주`;
    const titleRest = title.startsWith(teamNameText) ? title.slice(teamNameText.length) : `, ${streak}연승 질주`;

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">
                    <span
                        className={onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
                        onClick={onOpenTeam ? () => onOpenTeam(teamSlug) : undefined}
                    >
                        {teamNameText}
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

            <BrandMark className="h-3 w-auto" />
        </div>
    );
};

// [2026-09-01] 계약 정보(연봉/잔여연수) 표시하는 선수 목록 테이블 — "이 팀이 내준 선수"
// 기준으로 한 팀당 하나씩(TeamBoxTable과 동일하게 위아래로 스택).
// [2026-09-01 후속] "시즌 스탯도 조회해서 넣어달라" 요청 — 처음엔 poolPlayers가 stats를
// 항상 0으로만 채워서(방 전체 game_pbp 재집계가 필요해 카드 하나 열 때마다 쓰기엔
// 무겁다는 이유로) 계약 정보만으로 확정했었는데, 다른 세션이 그 사이 정확히 이 문제를
// 푸는 가벼운 경로(get_player_season_stats_batch RPC, MultiNewsFeedView.tsx가 이미
// extractEventPlayerIds+usePlayerSeasonStatsBatch+mergeStatsIntoPlayerCardMap으로
// 선택된 이벤트의 선수만 골라 playerCardMap에 병합)를 만들어 둔 걸 확인 — 이 컴포넌트는
// 새 조회를 직접 하지 않고, 이미 병합되어 내려오는 playerCardMap의 player.stats를
// 그대로 읽어 PTS/REB/AST 평균만 계산.
const TradePlayerTable: React.FC<{
    team: LeagueTeamRow | undefined; teamSlug: string; players: { id: string; name: string }[];
    playerCardMap: PlayerCardMap; onPlayerClick?: (playerId: string) => void; onOpenTeam?: (teamSlug: string) => void;
}> = ({ team, teamSlug, players, playerCardMap, onPlayerClick, onOpenTeam }) => {
    if (players.length === 0) return null;
    const headerBg = team?.color_primary ?? '#1e293b';
    const headerFg = team?.color_text ?? getReadableTextColor(headerBg);
    // 선수 카드 정보가 없는(방출/은퇴 등으로 poolPlayers에서 사라진) 선수는 0으로 취급 —
    // 합계 행이 조용히 실제보다 낮게 나올 수 있지만, 트레이드 시점엔 항상 로스터에 있던
    // 선수라 이론상만 발생.
    const totalSalary = players.reduce((sum, p) => sum + (playerCardMap.get(p.id)?.player?.salary ?? 0), 0);
    const avgStat = (total: number, g: number) => g > 0 ? (total / g).toFixed(1) : '-';

    return (
        <div className="space-y-2">
            <span
                className={`text-sm font-black text-slate-300 uppercase ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                onClick={onOpenTeam ? () => onOpenTeam(teamSlug) : undefined}
            >
                {team?.team_name ?? teamSlug}
                <span className="text-slate-500 normal-case"> 방출 선수</span>
            </span>
            {/* w-full+table-fixed — 두 팀 테이블(teamA/teamB)이 같은 부모(space-y-4) 안에서
                항상 같은 전체 너비를 갖고(사용자 요청), 각 열의 너비도 선수 이름 길이 등
                콘텐츠와 무관하게 항상 동일한 비율로 고정되도록(후속 요청 — table-fixed
                없이는 브라우저가 각 테이블을 콘텐츠 기준으로 따로 계산해 두 테이블의 열
                경계가 서로 어긋나 보임). 긴 이름은 truncate로 한 줄 유지. */}
            <table className="w-full table-fixed text-left border-collapse">
                <thead>
                    <tr className="border-b border-slate-700" style={{ backgroundColor: headerBg }}>
                        <th className="w-[32%] py-1.5 px-2 text-sm font-bold text-left" style={{ color: headerFg }}>선수</th>
                        <th className="w-[13%] py-1.5 px-2 text-sm font-bold text-center" style={{ color: headerFg }}>PTS</th>
                        <th className="w-[13%] py-1.5 px-2 text-sm font-bold text-center" style={{ color: headerFg }}>REB</th>
                        <th className="w-[13%] py-1.5 px-2 text-sm font-bold text-center" style={{ color: headerFg }}>AST</th>
                        <th className="w-[16%] py-1.5 px-2 text-sm font-bold text-center" style={{ color: headerFg }}>연봉</th>
                        <th className="w-[13%] py-1.5 px-2 text-sm font-bold text-center" style={{ color: headerFg }}>잔여연수</th>
                    </tr>
                </thead>
                <tbody>
                    {players.map(p => {
                        const entry = playerCardMap.get(p.id);
                        const salary = entry?.player?.salary;
                        const years = entry?.player?.contractYears;
                        const stats = entry?.player?.stats;
                        const g = stats?.g ?? 0;
                        return (
                            <tr
                                key={p.id}
                                onClick={onPlayerClick ? () => onPlayerClick(p.id) : undefined}
                                className={`border-b border-slate-800/60 ${onPlayerClick ? 'cursor-pointer hover:bg-white/5' : ''}`}
                            >
                                <td className="py-1 px-2 text-left truncate">
                                    <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                                        <span className="text-sm font-bold text-slate-300">{p.name}</span>
                                    </PlayerHoverCard>
                                </td>
                                <td className="py-1 px-2 text-sm text-slate-300 text-center">{avgStat(stats?.pts ?? 0, g)}</td>
                                <td className="py-1 px-2 text-sm text-slate-300 text-center">{avgStat(stats?.reb ?? 0, g)}</td>
                                <td className="py-1 px-2 text-sm text-slate-300 text-center">{avgStat(stats?.ast ?? 0, g)}</td>
                                <td className="py-1 px-2 text-sm text-slate-300 text-center">{salary != null ? formatMoney(salary) : '-'}</td>
                                <td className="py-1 px-2 text-sm text-slate-300 text-center">{years != null ? `${years}년` : '-'}</td>
                            </tr>
                        );
                    })}
                </tbody>
                {/* 합계 행에 페이지 배경보다 살짝 밝은 색을 깔아 테이블의 마무리를 시각적으로
                    구분(TeamBoxTable의 "완결성 부여" 요청과 동일 패턴 재사용). */}
                <tfoot className="bg-slate-800/40">
                    <tr className="border-t border-slate-700">
                        <td className="py-1.5 px-2 text-sm font-black text-white uppercase">합계</td>
                        <td className="py-1.5 px-2 text-sm text-center text-slate-600">—</td>
                        <td className="py-1.5 px-2 text-sm text-center text-slate-600">—</td>
                        <td className="py-1.5 px-2 text-sm text-center text-slate-600">—</td>
                        <td className="py-1.5 px-2 text-sm font-bold text-white text-center">{formatMoney(totalSalary)}</td>
                        <td className="py-1.5 px-2 text-sm text-center text-slate-600">—</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};

// [2026-09-01] "트레이드"도 다른 카드들과 동일한 레터 구조로 재설계(사용자 요청) — 헤더
// (양 팀명 각각 클릭 가능 + 날짜) → 본문(기사) → 팀별 방출 선수 테이블(이름+계약 정보,
// 위아래로 스택). 트레이드는 선수 한 명이 아니라 팀 두 곳이 "주체"라 HeadlineTitle
// (선수 이름 접두사 전용)을 그대로 못 쓰고, 팀명 두 개를 각각 별도 클릭 가능한 span으로
// 감싸 직접 조립(BoxScoreHeadline과 비슷한 원리).
export const TradeCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onPlayerClick?: (playerId: string) => void; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onPlayerClick, onOpenTeam }) => {
    if (event.detail.kind !== 'trade') return null;
    const { teamA, teamB, aOut, bOut } = event.detail;
    const a = teamBySlug.get(teamA.slug);
    const b = teamBySlug.get(teamB.slug);
    const blurb = buildNewsBlurb(event, teamBySlug);

    const teamSpan = (slug: string, team: LeagueTeamRow | undefined) => (
        <span
            className={onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
            onClick={onOpenTeam ? () => onOpenTeam(slug) : undefined}
        >
            {team?.team_name ?? slug}
        </span>
    );

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">
                    {teamSpan(teamA.slug, a)} ↔ {teamSpan(teamB.slug, b)} 트레이드 성사
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

            <div className="space-y-4">
                <TradePlayerTable team={a} teamSlug={teamA.slug} players={aOut} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
                <TradePlayerTable team={b} teamSlug={teamB.slug} players={bOut} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
            </div>

            <BrandMark className="h-3 w-auto" />
        </div>
    );
};

// [2026-09] 매월 초(가상 시즌 날짜 기준) 자동 게시되는 파워랭킹 뉴스 — 로스터 능력치
// 조합 기반(services/multi/powerRanking.ts) 랭킹 전체(1~30위, 스코어 포함) + 전월 대비
// 최대 상승/하락팀. 다른 카드(TradeCard/WinStreakCard)와 동일한 "레터" 구조(헤더+날짜+
// 구분선 → 본문 테이블)를 그대로 따름 — TradePlayerTable과 같은 표 형태로 통일.
export const PowerRankingCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, onOpenTeam }) => {
    if (event.detail.kind !== 'power_ranking') return null;
    const { month, full, riser, faller } = event.detail;
    const [y, m] = month.split('-');
    const blurb = buildNewsBlurb(event, teamBySlug);

    const teamSpan = (slug: string, name: string) => (
        <span
            className={onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
            onClick={onOpenTeam ? () => onOpenTeam(slug) : undefined}
        >
            {teamBySlug.get(slug)?.team_name ?? name}
        </span>
    );

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">
                    {Number(y)}년 {Number(m)}월 파워랭킹
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

            {(riser || faller) && (
                <div className="space-y-1.5">
                    {riser && (
                        <p className="flex items-center gap-2 text-sm text-emerald-400">
                            <TrendingUp size={14} />
                            {teamSpan(riser.teamSlug, riser.teamName)}
                            <span className="text-slate-400">{riser.fromRank}위 → {riser.rank}위 상승</span>
                        </p>
                    )}
                    {faller && (
                        <p className="flex items-center gap-2 text-sm text-rose-400">
                            <TrendingDown size={14} />
                            {teamSpan(faller.teamSlug, faller.teamName)}
                            <span className="text-slate-400">{faller.fromRank}위 → {faller.rank}위 하락</span>
                        </p>
                    )}
                </div>
            )}

            <table className="w-full table-fixed text-left border-collapse">
                <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/60">
                        <th className="w-[8%] py-1.5 px-2 text-sm font-bold text-slate-300 text-center">순위</th>
                        <th className="w-[44%] py-1.5 px-2 text-sm font-bold text-slate-300 text-left">팀</th>
                        <th className="w-[12%] py-1.5 px-2 text-sm font-bold text-slate-300 text-center">재능</th>
                        <th className="w-[12%] py-1.5 px-2 text-sm font-bold text-slate-300 text-center">공격</th>
                        <th className="w-[12%] py-1.5 px-2 text-sm font-bold text-slate-300 text-center">수비</th>
                        <th className="w-[12%] py-1.5 px-2 text-sm font-bold text-slate-300 text-center">파워스코어</th>
                    </tr>
                </thead>
                <tbody>
                    {full.map(entry => (
                        <tr key={entry.teamSlug} className="border-b border-slate-800/60">
                            <td className="py-1.5 px-2 text-sm font-black text-slate-400 text-center tabular-nums">{entry.rank}</td>
                            <td className="py-1.5 px-2">
                                <div className="flex items-center gap-2">
                                    <TeamBadge
                                        teamId={entry.teamSlug}
                                        teamName={entry.teamName}
                                        abbr={teamBySlug.get(entry.teamSlug)?.team_abbr}
                                        colorPrimary={teamBySlug.get(entry.teamSlug)?.color_primary}
                                        colorSecondary={teamBySlug.get(entry.teamSlug)?.color_secondary}
                                        colorText={teamBySlug.get(entry.teamSlug)?.color_text}
                                        size="xs"
                                    />
                                    <span className="text-sm font-semibold text-slate-100 truncate">{teamSpan(entry.teamSlug, entry.teamName)}</span>
                                </div>
                            </td>
                            <td className="py-1.5 px-2 text-sm text-slate-300 text-center tabular-nums">{entry.talentScore?.toFixed(1) ?? '-'}</td>
                            <td className="py-1.5 px-2 text-sm text-slate-300 text-center tabular-nums">{entry.offenseScore?.toFixed(1) ?? '-'}</td>
                            <td className="py-1.5 px-2 text-sm text-slate-300 text-center tabular-nums">{entry.defenseScore?.toFixed(1) ?? '-'}</td>
                            <td className="py-1.5 px-2 text-sm font-bold text-white text-center tabular-nums">{entry.powerScore.toFixed(1)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <BrandMark className="h-3 w-auto" />
        </div>
    );
};

// ── mvp_award / dpoy_award — 정규시즌 종료 1일 후 발표되는 개인상(server/src/postSeasonAwards.ts).
// PowerRankingCard와 동일한 레터 구조(헤더+날짜+구분선→표)를 따르되, 파워랭킹의 AI 기사체
// 문단(newsBlurb.ts)은 생략하고 트로피 히어로+순위표 중심으로 구성. 둘 다 팀 로고 없이 약어
// 텍스트만, 포지션은 별도 컬럼, 순위별(1~N위) 득표수 컬럼을 각각 갖는 전용 마크업.
const AWARD_RANK_TH = 'py-1.5 px-2 text-sm font-bold text-slate-300 text-center whitespace-nowrap';
const AWARD_RANK_TD = 'py-1.5 px-2 text-sm text-slate-300 text-center tabular-nums whitespace-nowrap';

function formatAwardPct(v: number): string {
    return v > 0 ? `${(v * 100).toFixed(1)}%` : '-';
}

// 승자 트로피 히어로 아래 표기할 시즌 스탯 한 줄 — MVP/DPOY 카드 공용(components/inbox/
// AwardsReportViewer.tsx의 히어로 섹션과 동일한 발상, 멀티 뉴스카드용으로 재구성).
const AwardHero: React.FC<{
    trophySrc: string; trophyAlt: string;
    winner: { playerId: string; playerName: string; teamSlug: string; position: string };
    statLine: React.ReactNode;
    teamBySlug: Map<string, LeagueTeamRow>;
    playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void;
    onPlayerClick?: (playerId: string) => void;
}> = ({ trophySrc, trophyAlt, winner, statLine, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => {
    const winnerEntry = playerCardMap.get(winner.playerId);
    const winnerTeam = teamBySlug.get(winner.teamSlug);
    return (
        <div className="flex flex-col items-center text-center gap-2 py-2">
            <img src={trophySrc} alt={trophyAlt} className="h-32 w-auto object-contain" />
            <div>
                <PlayerHoverCard player={winnerEntry?.player} teamAbbr={winnerEntry?.teamAbbr}>
                    <span
                        className={`text-lg font-black text-white ${onPlayerClick ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                        onClick={onPlayerClick ? () => onPlayerClick(winner.playerId) : undefined}
                    >
                        {winner.playerName}
                    </span>
                </PlayerHoverCard>
                <span className="ml-2 text-sm text-slate-500">{winner.position}</span>
            </div>
            <div
                className={`text-sm font-bold text-slate-400 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                onClick={onOpenTeam ? () => onOpenTeam(winner.teamSlug) : undefined}
            >
                {winnerTeam?.team_name ?? winner.teamSlug}
            </div>
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-slate-300">{statLine}</div>
        </div>
    );
};

export const MvpAwardCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => {
    if (event.detail.kind !== 'mvp_award') return null;
    const { season, ranking } = event.detail;
    const winner = ranking[0];

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{season} 정규시즌 올해의 선수</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>

            {winner && (
                <AwardHero
                    trophySrc="/images/mvp.webp" trophyAlt="MVP Trophy" winner={winner}
                    statLine={<>
                        <span><b className="text-white">{winner.ppg.toFixed(1)}</b> PPG</span>
                        <span><b className="text-white">{winner.rpg.toFixed(1)}</b> RPG</span>
                        <span><b className="text-white">{winner.apg.toFixed(1)}</b> APG</span>
                        <span><b className="text-white">{winner.spg.toFixed(1)}</b> SPG</span>
                        <span><b className="text-white">{winner.bpg.toFixed(1)}</b> BPG</span>
                        <span><b className="text-white">{formatAwardPct(winner.fgPct)}</b> FG%</span>
                        <span><b className="text-white">{formatAwardPct(winner.p3Pct)}</b> 3P%</span>
                        <span><b className="text-white">{formatAwardPct(winner.ftPct)}</b> FT%</span>
                    </>}
                    teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick}
                />
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-700 bg-slate-800/60">
                            <th className={AWARD_RANK_TH}>순위</th>
                            <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">선수</th>
                            <th className={AWARD_RANK_TH}>포지션</th>
                            <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">팀</th>
                            <th className={AWARD_RANK_TH}>PPG</th>
                            <th className={AWARD_RANK_TH}>RPG</th>
                            <th className={AWARD_RANK_TH}>APG</th>
                            <th className={AWARD_RANK_TH}>SPG</th>
                            <th className={AWARD_RANK_TH}>BPG</th>
                            <th className={AWARD_RANK_TH}>FG%</th>
                            <th className={AWARD_RANK_TH}>3P%</th>
                            <th className={AWARD_RANK_TH}>FT%</th>
                            <th className={AWARD_RANK_TH}>1위</th>
                            <th className={AWARD_RANK_TH}>2위</th>
                            <th className={AWARD_RANK_TH}>3위</th>
                            <th className={AWARD_RANK_TH}>4위</th>
                            <th className={AWARD_RANK_TH}>5위</th>
                            <th className={AWARD_RANK_TH}>득표</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ranking.map((r, idx) => {
                            const entry = playerCardMap.get(r.playerId);
                            const team = teamBySlug.get(r.teamSlug);
                            const votes = r.rankVotes;
                            return (
                                <tr key={r.playerId} className="border-b border-slate-800/60">
                                    <td className={`${AWARD_RANK_TD} font-black text-slate-400`}>{idx + 1}</td>
                                    <td className="py-1.5 px-2 whitespace-nowrap">
                                        <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                                            <span
                                                className={`text-sm font-bold text-slate-100 ${onPlayerClick ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                                onClick={onPlayerClick ? () => onPlayerClick(r.playerId) : undefined}
                                            >
                                                {r.playerName}
                                            </span>
                                        </PlayerHoverCard>
                                    </td>
                                    <td className={`${AWARD_RANK_TD} text-slate-500`}>{r.position}</td>
                                    <td className="py-1.5 px-2 whitespace-nowrap">
                                        <span
                                            className={`text-sm text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                            onClick={onOpenTeam ? () => onOpenTeam(r.teamSlug) : undefined}
                                        >
                                            {team?.team_abbr ?? r.teamSlug}
                                        </span>
                                    </td>
                                    <td className={AWARD_RANK_TD}>{r.ppg.toFixed(1)}</td>
                                    <td className={AWARD_RANK_TD}>{r.rpg.toFixed(1)}</td>
                                    <td className={AWARD_RANK_TD}>{r.apg.toFixed(1)}</td>
                                    <td className={AWARD_RANK_TD}>{r.spg.toFixed(1)}</td>
                                    <td className={AWARD_RANK_TD}>{r.bpg.toFixed(1)}</td>
                                    <td className={AWARD_RANK_TD}>{formatAwardPct(r.fgPct)}</td>
                                    <td className={AWARD_RANK_TD}>{formatAwardPct(r.p3Pct)}</td>
                                    <td className={AWARD_RANK_TD}>{formatAwardPct(r.ftPct)}</td>
                                    <td className={AWARD_RANK_TD}>{votes[0] ?? 0}</td>
                                    <td className={AWARD_RANK_TD}>{votes[1] ?? 0}</td>
                                    <td className={AWARD_RANK_TD}>{votes[2] ?? 0}</td>
                                    <td className={AWARD_RANK_TD}>{votes[3] ?? 0}</td>
                                    <td className={AWARD_RANK_TD}>{votes[4] ?? 0}</td>
                                    <td className={`${AWARD_RANK_TD} font-bold text-white`}>{r.points}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <BrandMark className="h-3 w-auto" />
        </div>
    );
};

export const DpoyAwardCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => {
    if (event.detail.kind !== 'dpoy_award') return null;
    const { season, ranking } = event.detail;
    const winner = ranking[0];

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{season} 정규시즌 올해의 수비수</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>

            {winner && (
                <AwardHero
                    trophySrc="/images/dpoy.webp" trophyAlt="DPOY Trophy" winner={winner}
                    statLine={<>
                        <span><b className="text-white">{winner.spg.toFixed(1)}</b> SPG</span>
                        <span><b className="text-white">{winner.bpg.toFixed(1)}</b> BPG</span>
                        <span><b className="text-white">{winner.tovfpg.toFixed(1)}</b> TOVF</span>
                        <span><b className="text-white">{winner.drebpg.toFixed(1)}</b> DREB</span>
                        <span><b className="text-white">{winner.orebpg.toFixed(1)}</b> OREB</span>
                        <span><b className="text-white">{formatAwardPct(winner.dfgPct)}</b> DFG%</span>
                    </>}
                    teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick}
                />
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-700 bg-slate-800/60">
                            <th className={AWARD_RANK_TH}>순위</th>
                            <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">선수</th>
                            <th className={AWARD_RANK_TH}>포지션</th>
                            <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">팀</th>
                            <th className={AWARD_RANK_TH}>SPG</th>
                            <th className={AWARD_RANK_TH}>BPG</th>
                            <th className={AWARD_RANK_TH}>TOVF</th>
                            <th className={AWARD_RANK_TH}>DREB</th>
                            <th className={AWARD_RANK_TH}>OREB</th>
                            <th className={AWARD_RANK_TH}>DFG%</th>
                            <th className={AWARD_RANK_TH}>1위</th>
                            <th className={AWARD_RANK_TH}>2위</th>
                            <th className={AWARD_RANK_TH}>3위</th>
                            <th className={AWARD_RANK_TH}>득표</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ranking.map((r, idx) => {
                            const entry = playerCardMap.get(r.playerId);
                            const team = teamBySlug.get(r.teamSlug);
                            const votes = r.rankVotes;
                            return (
                                <tr key={r.playerId} className="border-b border-slate-800/60">
                                    <td className={`${AWARD_RANK_TD} font-black text-slate-400`}>{idx + 1}</td>
                                    <td className="py-1.5 px-2 whitespace-nowrap">
                                        <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                                            <span
                                                className={`text-sm font-bold text-slate-100 ${onPlayerClick ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                                onClick={onPlayerClick ? () => onPlayerClick(r.playerId) : undefined}
                                            >
                                                {r.playerName}
                                            </span>
                                        </PlayerHoverCard>
                                    </td>
                                    <td className={`${AWARD_RANK_TD} text-slate-500`}>{r.position}</td>
                                    <td className="py-1.5 px-2 whitespace-nowrap">
                                        <span
                                            className={`text-sm text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                            onClick={onOpenTeam ? () => onOpenTeam(r.teamSlug) : undefined}
                                        >
                                            {team?.team_abbr ?? r.teamSlug}
                                        </span>
                                    </td>
                                    <td className={AWARD_RANK_TD}>{r.spg.toFixed(1)}</td>
                                    <td className={AWARD_RANK_TD}>{r.bpg.toFixed(1)}</td>
                                    <td className={AWARD_RANK_TD}>{r.tovfpg.toFixed(1)}</td>
                                    <td className={AWARD_RANK_TD}>{r.drebpg.toFixed(1)}</td>
                                    <td className={AWARD_RANK_TD}>{r.orebpg.toFixed(1)}</td>
                                    <td className={AWARD_RANK_TD}>{formatAwardPct(r.dfgPct)}</td>
                                    <td className={AWARD_RANK_TD}>{votes[0] ?? 0}</td>
                                    <td className={AWARD_RANK_TD}>{votes[1] ?? 0}</td>
                                    <td className={AWARD_RANK_TD}>{votes[2] ?? 0}</td>
                                    <td className={`${AWARD_RANK_TD} font-bold text-white`}>{r.points}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <BrandMark className="h-3 w-auto" />
        </div>
    );
};

// ── all_nba_team / all_def_team — 티어(1st~3rd/1st~2nd)별로 섹션을 나눠 표시.
// [2026-09-02] 카드 그리드 → 티어별 테이블(5행)로 재설계(사용자 요청) — MVP/DPOY 순위표와
// 동일하게 팀 로고 없이 약어 텍스트만, 포지션 별도 컬럼, 시즌 스탯 컬럼 포함. statCols는
// 올-오펜시브(PPG/RPG/APG)와 올-디펜시브(SPG/BPG)가 서로 달라 호출부에서 주입.
const AllTeamSection: React.FC<{
    tier: { tier: number; players: { playerId: string; playerName: string; teamSlug: string; pos: 'G' | 'F' | 'C' }[] };
    tierLabel: string;
    statCols: { label: string; get: (p: any) => string }[];
    teamBySlug: Map<string, LeagueTeamRow>;
    playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void;
    onPlayerClick?: (playerId: string) => void;
}> = ({ tier, tierLabel, statCols, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => (
    <div className="space-y-2">
        <h3 className="text-sm font-black text-slate-300 uppercase tracking-wide">{tierLabel}</h3>
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/60">
                        <th className={AWARD_RANK_TH}>포지션</th>
                        <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">선수</th>
                        <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">팀</th>
                        {statCols.map(c => <th key={c.label} className={AWARD_RANK_TH}>{c.label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {tier.players.map(p => {
                        const entry = playerCardMap.get(p.playerId);
                        const team = teamBySlug.get(p.teamSlug);
                        return (
                            <tr key={p.playerId} className="border-b border-slate-800/60">
                                <td className={`${AWARD_RANK_TD} text-slate-500`}>{p.pos}</td>
                                <td className="py-1.5 px-2 whitespace-nowrap">
                                    <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                                        <span
                                            className={`text-sm font-bold text-slate-100 ${onPlayerClick ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                            onClick={onPlayerClick ? () => onPlayerClick(p.playerId) : undefined}
                                        >
                                            {p.playerName}
                                        </span>
                                    </PlayerHoverCard>
                                </td>
                                <td className="py-1.5 px-2 whitespace-nowrap">
                                    <span
                                        className={`text-sm text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onOpenTeam ? () => onOpenTeam(p.teamSlug) : undefined}
                                    >
                                        {team?.team_abbr ?? p.teamSlug}
                                    </span>
                                </td>
                                {statCols.map(c => (
                                    <td key={c.label} className={AWARD_RANK_TD}>{c.get(p)}</td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
);

const ALL_TEAM_TIER_LABELS: Record<number, string> = { 1: '1st Team', 2: '2nd Team', 3: '3rd Team' };

export const AllNbaTeamCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => {
    if (event.detail.kind !== 'all_nba_team') return null;
    const { season, tiers } = event.detail;
    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{season} 올-오펜시브 팀</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>
            <div className="space-y-4">
                {tiers.map(t => (
                    <AllTeamSection
                        key={t.tier} tier={t} tierLabel={ALL_TEAM_TIER_LABELS[t.tier] ?? `${t.tier}팀`}
                        statCols={[
                            { label: 'G', get: (p: AllNbaTeamEntry) => String(p.g) },
                            { label: 'GS', get: (p: AllNbaTeamEntry) => String(p.gs) },
                            { label: 'MPG', get: (p: AllNbaTeamEntry) => p.mpg.toFixed(1) },
                            { label: 'PPG', get: (p: AllNbaTeamEntry) => p.ppg.toFixed(1) },
                            { label: 'RPG', get: (p: AllNbaTeamEntry) => p.rpg.toFixed(1) },
                            { label: 'APG', get: (p: AllNbaTeamEntry) => p.apg.toFixed(1) },
                            { label: 'SPG', get: (p: AllNbaTeamEntry) => p.spg.toFixed(1) },
                            { label: 'BPG', get: (p: AllNbaTeamEntry) => p.bpg.toFixed(1) },
                            { label: 'TOPG', get: (p: AllNbaTeamEntry) => p.tovpg.toFixed(1) },
                            { label: 'FG%', get: (p: AllNbaTeamEntry) => formatAwardPct(p.fgPct) },
                            { label: '3P%', get: (p: AllNbaTeamEntry) => formatAwardPct(p.p3Pct) },
                            { label: 'FT%', get: (p: AllNbaTeamEntry) => formatAwardPct(p.ftPct) },
                        ]}
                        teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick}
                    />
                ))}
            </div>
            <BrandMark className="h-3 w-auto" />
        </div>
    );
};

export const AllDefTeamCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => {
    if (event.detail.kind !== 'all_def_team') return null;
    const { season, tiers } = event.detail;
    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{season} 올-디펜시브 팀</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>
            <div className="space-y-4">
                {tiers.map(t => (
                    <AllTeamSection
                        key={t.tier} tier={t} tierLabel={ALL_TEAM_TIER_LABELS[t.tier] ?? `${t.tier}팀`}
                        statCols={[
                            { label: 'G', get: (p: AllDefTeamEntry) => String(p.g) },
                            { label: 'GS', get: (p: AllDefTeamEntry) => String(p.gs) },
                            { label: 'MPG', get: (p: AllDefTeamEntry) => p.mpg.toFixed(1) },
                            { label: 'SPG', get: (p: AllDefTeamEntry) => p.spg.toFixed(1) },
                            { label: 'BPG', get: (p: AllDefTeamEntry) => p.bpg.toFixed(1) },
                            { label: 'OREB', get: (p: AllDefTeamEntry) => p.orebpg.toFixed(1) },
                            { label: 'DREB', get: (p: AllDefTeamEntry) => p.drebpg.toFixed(1) },
                            { label: 'PF', get: (p: AllDefTeamEntry) => p.pfpg.toFixed(1) },
                            { label: 'TOV', get: (p: AllDefTeamEntry) => p.tovpg.toFixed(1) },
                            { label: 'DFG%', get: (p: AllDefTeamEntry) => formatAwardPct(p.dfgPct) },
                            { label: 'TOVF', get: (p: AllDefTeamEntry) => p.tovfpg.toFixed(1) },
                        ]}
                        teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick}
                    />
                ))}
            </div>
            <BrandMark className="h-3 w-auto" />
        </div>
    );
};

// ── 폴백(옛 이벤트, payload.v 없음) ──────────────────────────────────────────
const HEADLINE_ICON: Record<LeagueEventType, LucideIcon> = {
    game_result: Tv,
    player_feat: Star,
    player_streak: Flame,
    win_streak: TrendingUp,
    trade: ArrowLeftRight,
    power_ranking: BarChart3,
    mvp_award: Trophy,
    dpoy_award: Shield,
    all_nba_team: Star,
    all_def_team: Shield,
};

export const LegacyCard: React.FC<{ event: LeagueEvent }> = ({ event }) => {
    const Icon = HEADLINE_ICON[event.type];
    return (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg border bg-slate-900 border-slate-800">
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
}> = ({ event, teamBySlug, playerCardMap, roomId, onOpenGame, onPlayerClick, onOpenTeam }) => {
    switch (event.detail.kind) {
        case 'game_result': return <GameResultCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} roomId={roomId} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />;
        case 'player_feat': return <FeatCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} roomId={roomId} onPlayerClick={onPlayerClick} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} />;
        case 'player_streak': return <StreakCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} />;
        case 'win_streak': return <WinStreakCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />;
        case 'trade': return <TradeCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />;
        case 'power_ranking': return <PowerRankingCard event={event} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam} />;
        case 'mvp_award': return <MvpAwardCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />;
        case 'dpoy_award': return <DpoyAwardCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />;
        case 'all_nba_team': return <AllNbaTeamCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />;
        case 'all_def_team': return <AllDefTeamCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />;
        default: return <LegacyCard event={event} />;
    }
};

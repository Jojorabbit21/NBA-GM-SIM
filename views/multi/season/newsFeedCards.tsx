
import React, { useMemo, useState } from 'react';
import { Flame, Loader2, TrendingUp, TrendingDown, Star, ArrowLeftRight, ArrowRight, Tv, BarChart3, Trophy, Shield, HeartPulse, Swords, Vote, Sparkles, Target, Zap, Shuffle, type LucideIcon } from 'lucide-react';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { TeamBadge } from '../../../components/common/TeamBadge';
import { getReadableTextColor } from '../../../utils/colorContrast';
import { getRealTeamLogoUrl, getTeamLogoUrl, CONFERENCE_COLORS, RISING_STARS_COLORS } from '../../../utils/constants';
import { BasketLines as ShotChartBasketLines } from '../../../components/game/tabs/GameShotChartTab';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import type { LeagueEvent, LeagueEventType } from '../../../hooks/useLeagueHeadlines';
import type { PlayerBoxScore } from '../../../types/engine';
import type { PlayerStats } from '../../../types/player';
import { formatRelativeTime } from '../../../utils/formatRelativeTime';
import { PlayerHoverCard, type PlayerCardEntry, type PlayerCardMap, mergeStatsIntoPlayerCardMap } from '../../../components/common/PlayerHoverCard';
import { buildNewsBlurb, buildNewsTitle } from '../../../services/multi/newsBlurb';
import { useGameBoxScore } from '../../../hooks/useGameBoxScore';
import { usePlayerSeasonStatsBatch } from '../../../hooks/usePlayerSeasonStatsBatch';
import type { GameBoxScoreData } from '../../../services/multi/gameQueries';
import { formatMoney } from '../../../utils/formatMoney';
import type { AllNbaTeamEntry, AllDefTeamEntry, AllstarVoteEntry, AllstarRosterPlayer, RisingStarsRosterPlayer, ThreePointContestParticipantEntry, DunkContestParticipantEntry, ThreePointContestRoundEntry, DunkContestRoundEntry, DraftLotteryPick } from '../../../services/multi/leagueEventPayload';

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
        case 'injury': return [event.detail.player.id];
        case 'suspension': return [event.detail.fighter.id, event.detail.opponent.id];
        case 'allstar_vote_update': return [
            ...event.detail.east.guards, ...event.detail.east.frontcourt,
            ...event.detail.west.guards, ...event.detail.west.frontcourt,
        ].map(e => e.playerId);
        case 'allstar_vote_result': return [
            ...event.detail.east.starters, ...event.detail.east.reserves,
            ...event.detail.west.starters, ...event.detail.west.reserves,
            ...(event.detail.risingStars?.teamA ?? []), ...(event.detail.risingStars?.teamB ?? []),
        ].map(p => p.playerId);
        case 'allstar_rising_stars': return [...event.detail.teamA, ...event.detail.teamB].map(p => p.playerId);
        case 'allstar_three_point_contest': return event.detail.participants.map(p => p.playerId);
        case 'allstar_dunk_contest': return event.detail.participants.map(p => p.playerId);
        case 'allstar_game_result': return event.detail.mvp ? [event.detail.mvp.playerId] : [];
        case 'allstar_rising_stars_result': return event.detail.mvp ? [event.detail.mvp.playerId] : [];
        case 'allstar_three_point_contest_result': return event.detail.round1.map(e => e.playerId);
        case 'allstar_dunk_contest_result': return event.detail.round1.map(e => e.playerId);
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
// bc.svg에서 교체)를 모든 레터 카드 헤더 최상단(마스트헤드 격, h-4)에 표시(사용자 요청 —
// 크기는 h-8→h-[22.4px]→h-4 순으로 여러 차례 축소) — 모든 레터 카드에 동일하게 적용.
// [2026-09-03] 본문 최하단(기사 종료 표식 격, h-3)에도 같은 로고를 하나 더 찍었었는데
// 사용자 요청으로 전부 삭제 — 헤더 마스트헤드(h-4)만 남음.
const BrandMark: React.FC<{ className?: string }> = ({ className = '' }) => (
    <img src="/images/bc2.svg" alt="The Basketball Chronicle" className={className} />
);

// [2026-09-09] 올스타/라이징스타/3점 챌린지/덩크 컨테스트 서신 4종 본문 최상단에 이벤트별
// 로고를 표시(사용자 요청) — BrandMark(마스트헤드, 매체 로고)와는 별개로, 각 서신의 본문
// (헤더 구획 아래 첫 단락 앞)에 event-specific 로고를 크게 한 장 보여준다.
// public/logos/real/AS/*.svg(사용자 제공, 100x100 정사각형) 재사용.
const EventLetterLogo: React.FC<{ src: string; alt: string }> = ({ src, alt }) => (
    <img src={src} alt={alt} className="h-16 w-16" />
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
    // [2026-09-07] 팀약어 옆에 팀 로고를 붙여달라는 요청 — 컬러 배지(TeamBadge)가 아니라
    // public/logos/real/의 실제 팀 로고 이미지 사용. RosterView.tsx/PlayerDetailView.tsx
    // 헤더 로고와 동일한 폴백 체인(신규 로고 세트 실패 시 구버전 → 플레이스홀더).
    // colorPrimary 없는(이론상만) 팀은 TeamLogo로 폴백. [2026-09-07 후속] 순수 장식용 —
    // 클릭은 요청받은 적 없어 로고에 onClick/cursor-pointer를 붙이지 않는다(팀약어 텍스트만
    // 기존처럼 클릭 가능).
    const teamLogo = (slug: string, team: LeagueTeamRow | undefined) => (
        <span className="shrink-0">
            {team?.color_primary ? (
                <img
                    src={getRealTeamLogoUrl(slug)}
                    alt={team?.team_abbr ?? slug}
                    className="w-8 h-8 object-contain"
                    onError={(e) => {
                        const img = e.currentTarget;
                        if (img.dataset.fallback !== 'old') {
                            img.dataset.fallback = 'old';
                            img.src = getTeamLogoUrl(slug);
                        } else {
                            img.src = 'https://placehold.co/100x100?text=BPL';
                        }
                    }}
                />
            ) : (
                <TeamLogo teamId={slug} teamName={team?.team_name} size="sm" />
            )}
        </span>
    );
    return (
        <h4 className="flex items-center gap-1.5">
            {teamLogo(game.awaySlug, awayTeam)}
            {teamSpan(game.awaySlug, awayTeam)}
            <span
                className={`text-lg font-black text-white ${onOpenGame ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                onClick={onOpenGame ? (e) => { e.stopPropagation(); onOpenGame(); } : undefined}
            >
                {game.awayScore}-{game.homeScore}
            </span>
            {teamSpan(game.homeSlug, homeTeam)}
            {teamLogo(game.homeSlug, homeTeam)}
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
        </div>
    );
};

// [2026-09-03] "부상 발생 시 뉴스" 요청 — GRADE3 이상 부상만 발행(GRADE1/2는 서버가 애초에
// 이벤트를 안 만듦, detectInjuryEvent 참고). TradeCard와 동일한 구조(헤더+날짜+구분선 →
// 본문 2~3줄 → 표) — 다만 즉석 조회할 박스스코어가 없어(payload에 필요한 정보가 이미 다
// 있음) roomId/useGameBoxScore 의존 없이 훨씬 단순하다.

// [2026-09-03 후속] "테이블의 부상 정도 컬럼 삭제, 복귀 예정일은 0000년 00월 00일 포맷"
// 요청 — 등급 라벨(중등도/중상/중증(장기))은 이제 어디에서도 쓰이지 않아 INJURY_GRADE_LABEL과
// 함께 제거. 날짜는 다른 카드들의 YY/MM/DD 축약 표기와 달리 이 표만 풀 연도로 표시.
// [2026-09-03 후속2] SuspensionCard의 복귀 예정일 컬럼도 동일 포맷이 필요해 이름을
// formatFullDateCell로 일반화(동작은 그대로) — 두 카드가 함께 재사용.
function formatFullDateCell(returnDate: string | null): string {
    if (!returnDate) return '시즌 아웃';
    const [y, m, d] = returnDate.split('-');
    return `${y}년 ${m}월 ${d}일`;
}

export const InjuryCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onPlayerClick?: (playerId: string) => void; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onPlayerClick, onOpenTeam }) => {
    if (event.detail.kind !== 'injury') return null;
    const { player, teamSlug, injuryType, duration, returnDate } = event.detail;
    const team = teamBySlug.get(teamSlug);
    const blurb = buildNewsBlurb(event, teamBySlug);
    const entry = playerCardMap.get(player.id);

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <HeadlineTitle
                    headline={buildNewsTitle(event, teamBySlug) ?? event.headline} playerName={player.name} entry={entry}
                    onPlayerClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
                />
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

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-700">
                            <th className={BOX_HEADER_CELL}>선수</th>
                            <th className={`${BOX_HEADER_CELL} text-center`}>소속팀</th>
                            <th className={`${BOX_HEADER_CELL} text-center`}>부상명</th>
                            <th className={`${BOX_HEADER_CELL} text-center`}>예상 결장</th>
                            <th className={`${BOX_HEADER_CELL} text-center`}>복귀 예정일</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b border-slate-800/60">
                            <td className="py-1.5 px-2">
                                <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                                    <span
                                        className={`text-sm font-bold text-white ${onPlayerClick ? 'cursor-pointer hover:underline' : ''}`}
                                        onClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
                                    >
                                        {player.name}
                                    </span>
                                </PlayerHoverCard>
                            </td>
                            <td className={`${BOX_STAT_CELL} text-center`}>
                                <span
                                    className={onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
                                    onClick={onOpenTeam ? () => onOpenTeam(teamSlug) : undefined}
                                >
                                    {team?.team_name ?? teamSlug}
                                </span>
                            </td>
                            <td className={`${BOX_STAT_CELL} text-center`}>{injuryType}</td>
                            <td className={`${BOX_STAT_CELL} text-center`}>{duration}</td>
                            <td className={`${BOX_STAT_CELL} text-center`}>{formatFullDateCell(returnDate)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// [2026-09-03] "출장정지도 한 뉴스에 양쪽 다 담자" 요청 — 싸움은 항상 두 선수 모두에게
// 동시에 발생하므로(server/src/shared/leagueEvents.ts의 detectSuspensionEvent 참고)
// InjuryCard처럼 선수 1명당 카드 1건이 아니라, 카드 하나에 양쪽을 2행짜리 표로 함께
// 보여준다. 제목은 이름이 둘이라 HeadlineTitle(단일 이름 클릭 하이라이트 전용)을 쓰지
// 않고 평문 h1으로 두고, 대신 표 안의 선수명은 각각 PlayerHoverCard로 클릭 가능하다.
export const SuspensionCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onPlayerClick?: (playerId: string) => void; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onPlayerClick, onOpenTeam }) => {
    if (event.detail.kind !== 'suspension') return null;
    const {
        fighter, fighterTeamSlug, fighterSuspensionGames, fighterReturnDate,
        opponent, opponentTeamSlug, opponentSuspensionGames, opponentReturnDate,
    } = event.detail;
    const blurb = buildNewsBlurb(event, teamBySlug);
    const title = buildNewsTitle(event, teamBySlug) ?? event.headline;

    const rows = [
        { player: fighter, teamSlug: fighterTeamSlug, games: fighterSuspensionGames, returnDate: fighterReturnDate },
        { player: opponent, teamSlug: opponentTeamSlug, games: opponentSuspensionGames, returnDate: opponentReturnDate },
    ];

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{title}</h1>
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

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-700">
                            <th className={BOX_HEADER_CELL}>선수</th>
                            <th className={`${BOX_HEADER_CELL} text-center`}>소속팀</th>
                            <th className={`${BOX_HEADER_CELL} text-center`}>출장정지</th>
                            <th className={`${BOX_HEADER_CELL} text-center`}>복귀 예정일</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => {
                            const entry = playerCardMap.get(row.player.id);
                            const team = teamBySlug.get(row.teamSlug);
                            return (
                                <tr key={row.player.id} className="border-b border-slate-800/60">
                                    <td className="py-1.5 px-2">
                                        <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                                            <span
                                                className={`text-sm font-bold text-white ${onPlayerClick ? 'cursor-pointer hover:underline' : ''}`}
                                                onClick={onPlayerClick ? () => onPlayerClick(row.player.id) : undefined}
                                            >
                                                {row.player.name}
                                            </span>
                                        </PlayerHoverCard>
                                    </td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>
                                        <span
                                            className={onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
                                            onClick={onOpenTeam ? () => onOpenTeam(row.teamSlug) : undefined}
                                        >
                                            {team?.team_name ?? row.teamSlug}
                                        </span>
                                    </td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{row.games}경기</td>
                                    <td className={`${BOX_STAT_CELL} text-center`}>{formatFullDateCell(row.returnDate)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
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
        </div>
    );
};

// ── draft_lottery_result — 드래프트 순서 로터리 추첨 직후 게시되는 서신
// (server/src/postDraftLotteryNews.ts). PowerRankingCard와 동일한 레터 구조(헤더+날짜+
// 구분선→표)를 따르되, 순위 변동/기사체 문단 없이 픽 순서 표만 보여준다.
export const DraftLotteryResultCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, onOpenTeam }) => {
    if (event.detail.kind !== 'draft_lottery_result') return null;
    const { picks } = event.detail;
    const firstPick = picks[0] as DraftLotteryPick | undefined;

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">드래프트 순서 추첨 결과</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>

            {firstPick && (
                <p className="text-sm text-slate-300 leading-relaxed">
                    전체 1순위 지명권은{' '}
                    <span
                        className={onOpenTeam ? 'font-bold text-white cursor-pointer hover:text-indigo-400 hover:underline' : 'font-bold text-white'}
                        onClick={onOpenTeam ? () => onOpenTeam(firstPick.teamSlug) : undefined}
                    >
                        {teamBySlug.get(firstPick.teamSlug)?.team_name ?? firstPick.teamName}
                    </span>
                    {' '}팀에게 돌아갔습니다.
                </p>
            )}

            <table className="w-full table-fixed text-left border-collapse">
                <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/60">
                        <th className="w-[15%] py-1.5 px-2 text-sm font-bold text-slate-300 text-center">순위</th>
                        <th className="w-[85%] py-1.5 px-2 text-sm font-bold text-slate-300 text-left">팀</th>
                    </tr>
                </thead>
                <tbody>
                    {picks.map(pick => (
                        <tr key={pick.rank} className="border-b border-slate-800/60">
                            <td className="py-1.5 px-2 text-sm font-black text-slate-400 text-center tabular-nums">{pick.rank}</td>
                            <td className="py-1.5 px-2">
                                <div className="flex items-center gap-2">
                                    <TeamBadge
                                        teamId={pick.teamSlug}
                                        teamName={pick.teamName}
                                        abbr={teamBySlug.get(pick.teamSlug)?.team_abbr}
                                        colorPrimary={teamBySlug.get(pick.teamSlug)?.color_primary}
                                        colorSecondary={teamBySlug.get(pick.teamSlug)?.color_secondary}
                                        colorText={teamBySlug.get(pick.teamSlug)?.color_text}
                                        size="xs"
                                    />
                                    <span
                                        className={`text-sm font-semibold text-slate-100 truncate ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onOpenTeam ? () => onOpenTeam(pick.teamSlug) : undefined}
                                    >
                                        {teamBySlug.get(pick.teamSlug)?.team_name ?? pick.teamName}
                                    </span>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
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
        <h3 className="text-sm font-black text-slate-300 uppercase">{tierLabel}</h3>
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
        </div>
    );
};

// 투표 마감 후 확정된 명단(스타터/리저브) 표시용 — AllstarVoteSection과 달리 득표수/득표율이
// 없다(리저브는 코치 투표라 스케일 자체가 다르고, 최종 명단 화면에선 "누가 뽑혔는지"가
// 중요하지 득표수 자체는 부차적이라 생략). 팀 로고/PlayerHoverCard 패턴은 AllstarVoteSection과
// 동일하게 맞춰 두 표가 나란히 있어도 이질감이 없도록 함.
// AllstarRosterPlayer(votes/pct 필수)와 RisingStarsRosterPlayer(투표 없음, votes/pct 자체가
// 없음)를 같은 표 컴포넌트로 그리기 위한 최소 공통 타입 — showVotes=false로 쓰는 쪽(라이징
// 스타)은 votes/pct가 undefined라도 렌더 분기(showVotes && ...) 안에서만 접근하므로 안전.
type RosterTablePlayer = {
    playerId: string; playerName: string; teamSlug: string;
    posGroup: 'G' | 'FC'; position: string; ovr: number;
    votes?: number; pct?: number;
    /** [2026-09-08] 라이징스타 팀 주장 표시용 — 본올스타 선수(votes/pct 있는 쪽)엔 없는 개념. */
    isCaptain?: boolean;
};

export const AllstarRosterTable: React.FC<{
    label: string;
    players: RosterTablePlayer[];
    teamBySlug: Map<string, LeagueTeamRow>;
    playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void;
    onPlayerClick?: (playerId: string) => void;
    /** true면 선수 이름 왼쪽에 OVR 배지를 보여준다. 값 자체(AllstarRosterPlayer.ovr)는 이미
     *  서버가 계산해 payload에 넣어둔 것을 그대로 꺼내 쓸 뿐이라 추가 계산 비용은 없다 —
     *  페이지(MultiAllStarView.tsx)의 "최종 결과" 리저브 표는 공간 문제로 뺐던 걸 유지하기
     *  위해 기본값(false)으로 두고, 결과 서신(AllstarVoteResultCard)만 켠다. */
    showOvr?: boolean;
    /** true면 득표수/득표율 컬럼을 추가로 보여준다. [2026-09-08] 처음엔 스타터=팬 득표,
     *  리저브=코치 투표 포인트로 서로 다른 값을 넣었다가 스케일이 안 맞아 사용자가 "이상하다"고
     *  지적 — 확인해보니 리저브도 "올스타 팬 투표" 득표수/득표율을 보여달라는 뜻이었음(코치
     *  투표로 뽑혔더라도 참고용으로 팬 투표 성적을 보여주는 것). 그래서 votes/pct는 스타터·
     *  리저브 구분 없이 항상 최종 팬 투표 리더보드(runAllStarVote 결과)에서 playerId로 찾은
     *  값 — AllstarRosterPlayer.votes/pct 필드 자체가 이제 "팬 득표"로 통일돼 있음
     *  (server/src/postAllStarVoteNews.ts의 voteInfoByPlayerId 참고). */
    showVotes?: boolean;
    /** [2026-09-08] 라이징스타 확정 서신 요청("선수의 시즌 스탯을 추가해줘")으로 추가 —
     *  AllstarVoteSection의 showStats와 동일한 컬럼/계산 로직(G/MP/PTS/REB/AST/STL/BLK/TOV/FG%,
     *  playerCardMap에서 조회, 추가 API 호출 없음)을 이 표에도 그대로 이식. */
    showStats?: boolean;
    /** [2026-09-09] 라이징스타 확정 서신 요청("각 팀 좌측에 팀별 로고 추가") — label이
     *  "스타터"/"리저브"가 아니라 실제 팀명("팀 ○○○")인 라이징스타 표에서만 넘겨준다.
     *  전달되면 label 왼쪽에 작은 로고를 붙인다. */
    logoSrc?: string;
}> = ({ label, players, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, showOvr, showVotes, showStats, logoSrc }) => (
    <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-black text-slate-300 uppercase">
            {logoSrc && <img src={logoSrc} alt="" className="h-5 w-5" />}
            {label}
        </h3>
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/60">
                        <th className={AWARD_RANK_TH}>포지션</th>
                        {showOvr && <th className={AWARD_RANK_TH}>OVR</th>}
                        <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">선수</th>
                        <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">팀</th>
                        {showStats && (
                            <>
                                <th className={AWARD_RANK_TH}>G</th>
                                <th className={AWARD_RANK_TH}>MP</th>
                                <th className={AWARD_RANK_TH}>PTS</th>
                                <th className={AWARD_RANK_TH}>REB</th>
                                <th className={AWARD_RANK_TH}>AST</th>
                                <th className={AWARD_RANK_TH}>STL</th>
                                <th className={AWARD_RANK_TH}>BLK</th>
                                <th className={AWARD_RANK_TH}>TOV</th>
                                <th className={AWARD_RANK_TH}>FG%</th>
                            </>
                        )}
                        {showVotes && (
                            <>
                                <th className={AWARD_RANK_TH}>득표수</th>
                                <th className={AWARD_RANK_TH}>득표율</th>
                            </>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {players.map(p => {
                        const entry = playerCardMap.get(p.playerId);
                        const team = teamBySlug.get(p.teamSlug);
                        const stats = entry?.player?.stats;
                        const g = stats?.g ?? 0;
                        const perGame = (total: number | undefined) => (g > 0 ? ((total ?? 0) / g).toFixed(1) : '0.0');
                        const shootPct = (made: number | undefined, att: number | undefined) =>
                            (att ?? 0) > 0 ? formatAwardPct((made ?? 0) / (att as number)) : '-';
                        return (
                            <tr key={p.playerId} className="border-b border-slate-800/60">
                                <td className={`${AWARD_RANK_TD} text-slate-500`}>{p.posGroup}</td>
                                {showOvr && (
                                    <td className={AWARD_RANK_TD}>
                                        <div className="flex justify-center">
                                            <OvrBadge value={p.ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" />
                                        </div>
                                    </td>
                                )}
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
                                    <div className="flex items-center gap-1.5">
                                        {team?.color_primary ? (
                                            <img
                                                src={getRealTeamLogoUrl(p.teamSlug)}
                                                alt={team?.team_abbr ?? p.teamSlug}
                                                className="w-5 h-5 object-contain shrink-0"
                                                onError={(ev) => {
                                                    const img = ev.currentTarget;
                                                    if (img.dataset.fallback !== 'old') {
                                                        img.dataset.fallback = 'old';
                                                        img.src = getTeamLogoUrl(p.teamSlug);
                                                    } else {
                                                        img.src = 'https://placehold.co/100x100?text=BPL';
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <TeamLogo teamId={p.teamSlug} teamName={team?.team_name} size="xs" />
                                        )}
                                        <span
                                            className={`text-sm text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                            onClick={onOpenTeam ? () => onOpenTeam(p.teamSlug) : undefined}
                                        >
                                            {team?.team_abbr ?? p.teamSlug}
                                        </span>
                                    </div>
                                </td>
                                {showStats && (
                                    <>
                                        <td className={AWARD_RANK_TD}>{g}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.mp)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.pts)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.reb)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.ast)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.stl)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.blk)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.tov)}</td>
                                        <td className={AWARD_RANK_TD}>{shootPct(stats?.fgm, stats?.fga)}</td>
                                    </>
                                )}
                                {showVotes && (
                                    <>
                                        <td className={`${AWARD_RANK_TD} tabular-nums`}>{(p.votes ?? 0).toLocaleString()}</td>
                                        <td className={`${AWARD_RANK_TD} text-white`}>{p.pct != null ? formatAwardPct(p.pct) : '-'}</td>
                                    </>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
);

// showStats(선택) — 팀 컬럼 우측에 시즌 스탯(G/MP/PTS/REB/AST/STL/BLK/TOV/FG%)을 추가로
// 보여준다. AllstarVoteEntry 자체엔 스탯이 없어(서버가 저장하는 득표 스냅샷은 투표 결과만
// 담음) playerCardMap에서 그때그때 조회 — 이미 호버카드용으로 화면에 표시되는 선수 전원의
// 시즌 스탯을 usePlayerSeasonStatsBatch로 불러와 병합해두고 있어 추가 조회 비용이 없다.
// MP/PTS/REB/AST/STL/BLK/TOV는 basketball-reference 관례대로 경기당 평균(총합/G), G만
// 시즌 누적. GS/3P%/FT%는 넣었다가 공간이 부족하다는 요청으로 뺐고, GS는 애초에
// usePlayerSeasonStatsBatch가 쓰는 get_player_season_stats_batch RPC에 컬럼 자체가 없어
// 항상 0으로만 찍히는 문제도 있었음(선발 출장 데이터가 필요해지면 RPC부터 손봐야 함).
// 뉴스 카드(AllstarVoteUpdateCard)는 컴팩트한 폭을 유지해야 해서 기본값 false로 두고
// 페이지(MultiAllStarView.tsx)에서만 켠다.
// AllstarVoteEntry(본올스타 팬 투표, votes/pct 필수)와 RisingStarsRosterPlayer(투표 없음,
// votes/pct 자체가 없음)를 같은 표 컴포넌트로 그리기 위한 최소 공통 타입 —
// AllstarRosterTable의 RosterTablePlayer와 동일한 목적/패턴.
type VoteSectionEntry = {
    playerId: string; playerName: string; teamSlug: string;
    posGroup: 'G' | 'FC';
    votes?: number; pct?: number;
};

export const AllstarVoteSection: React.FC<{
    label: string;
    entries: VoteSectionEntry[];
    teamBySlug: Map<string, LeagueTeamRow>;
    playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void;
    onPlayerClick?: (playerId: string) => void;
    showStats?: boolean;
    /** true면 상단 <h3>{label}</h3> 제목을 생략 — 페이지(MultiAllStarView.tsx)의 백코트/
     *  프론트코트 셀렉터처럼 바깥에서 이미 선택 상태를 보여주는 UI가 있을 때 중복 제목을
     *  없애기 위해 씀. 뉴스 카드(AllstarVoteUpdateCard)는 기본값(false)대로 제목을 그대로 둠. */
    hideLabel?: boolean;
    /** true면 세로 스크롤 가능한 고정 높이 컨테이너로 감싸고 헤더를 sticky로 고정 — 뉴스
     *  서신처럼 한 카드 안에 여러 테이블(최대 25명×4개)을 한꺼번에 보여줘야 할 때 카드가
     *  한없이 길어지는 걸 막기 위함. 페이지(MultiAllStarView.tsx)는 셀렉터로 테이블 하나만
     *  보여주고 페이지 자체가 스크롤되므로 기본값(false) 그대로 씀. */
    scrollable?: boolean;
    /** [2026-09-08] 라이징스타(투표 없음)에서 득표수/득표율 컬럼을 빼기 위해 추가 — 기존
     *  호출부(본올스타 후보 명단/중간집계 서신)는 전부 득표 데이터를 보여줘야 하므로
     *  기본값 true. */
    showVotes?: boolean;
}> = ({ label, entries, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, showStats, hideLabel, scrollable, showVotes = true }) => (
    <div className="space-y-2">
        {!hideLabel && <h3 className="text-sm font-black text-slate-300 uppercase">{label}</h3>}
        <div className={`overflow-x-auto ${scrollable ? 'overflow-y-auto max-h-96' : ''}`}>
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className={`border-b border-slate-700 bg-slate-800/60 ${scrollable ? 'sticky top-0 z-10' : ''}`}>
                        <th className={AWARD_RANK_TH}>순위</th>
                        <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">선수</th>
                        <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">팀</th>
                        {showStats && (
                            <>
                                <th className={AWARD_RANK_TH}>G</th>
                                <th className={AWARD_RANK_TH}>MP</th>
                                <th className={AWARD_RANK_TH}>PTS</th>
                                <th className={AWARD_RANK_TH}>REB</th>
                                <th className={AWARD_RANK_TH}>AST</th>
                                <th className={AWARD_RANK_TH}>STL</th>
                                <th className={AWARD_RANK_TH}>BLK</th>
                                <th className={AWARD_RANK_TH}>TOV</th>
                                <th className={AWARD_RANK_TH}>FG%</th>
                            </>
                        )}
                        {showVotes && (
                            <>
                                <th className={AWARD_RANK_TH}>득표수</th>
                                <th className={AWARD_RANK_TH}>득표율</th>
                            </>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {entries.map((e, idx) => {
                        const entry = playerCardMap.get(e.playerId);
                        const team = teamBySlug.get(e.teamSlug);
                        const stats = entry?.player?.stats;
                        const g = stats?.g ?? 0;
                        const perGame = (total: number | undefined) => (g > 0 ? ((total ?? 0) / g).toFixed(1) : '0.0');
                        const shootPct = (made: number | undefined, att: number | undefined) =>
                            (att ?? 0) > 0 ? formatAwardPct((made ?? 0) / (att as number)) : '-';
                        return (
                            <tr key={e.playerId} className="border-b border-slate-800/60">
                                <td className={`${AWARD_RANK_TD} font-black text-slate-400`}>{idx + 1}</td>
                                <td className="py-1.5 px-2 whitespace-nowrap">
                                    <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                                        <span
                                            className={`text-sm font-bold text-slate-100 ${onPlayerClick ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                            onClick={onPlayerClick ? () => onPlayerClick(e.playerId) : undefined}
                                        >
                                            {e.playerName}
                                        </span>
                                    </PlayerHoverCard>
                                </td>
                                <td className="py-1.5 px-2 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                        {team?.color_primary ? (
                                            <img
                                                src={getRealTeamLogoUrl(e.teamSlug)}
                                                alt={team?.team_abbr ?? e.teamSlug}
                                                className="w-5 h-5 object-contain shrink-0"
                                                onError={(ev) => {
                                                    const img = ev.currentTarget;
                                                    if (img.dataset.fallback !== 'old') {
                                                        img.dataset.fallback = 'old';
                                                        img.src = getTeamLogoUrl(e.teamSlug);
                                                    } else {
                                                        img.src = 'https://placehold.co/100x100?text=BPL';
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <TeamLogo teamId={e.teamSlug} teamName={team?.team_name} size="xs" />
                                        )}
                                        <span
                                            className={`text-sm text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                            onClick={onOpenTeam ? () => onOpenTeam(e.teamSlug) : undefined}
                                        >
                                            {team?.team_abbr ?? e.teamSlug}
                                        </span>
                                    </div>
                                </td>
                                {showStats && (
                                    <>
                                        <td className={AWARD_RANK_TD}>{g}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.mp)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.pts)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.reb)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.ast)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.stl)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.blk)}</td>
                                        <td className={AWARD_RANK_TD}>{perGame(stats?.tov)}</td>
                                        <td className={AWARD_RANK_TD}>{shootPct(stats?.fgm, stats?.fga)}</td>
                                    </>
                                )}
                                {showVotes && (
                                    <>
                                        <td className={`${AWARD_RANK_TD} tabular-nums`}>{(e.votes ?? 0).toLocaleString()}</td>
                                        <td className={`${AWARD_RANK_TD} text-white`}>{e.pct != null ? formatAwardPct(e.pct) : '-'}</td>
                                    </>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
);

export const AllstarVoteUpdateCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
    /** 이 서신 하단의 "올스타 페이지로" 바로가기 링크 — voteProgress===1(투표 마감)이면
     *  "결과 보러가기", 그 전(시작/중간 집계)이면 "현황 보러가기" 문구로 갈림. */
    onOpenAllStar?: (view?: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, onOpenAllStar }) => {
    if (event.detail.kind !== 'allstar_vote_update') return null;
    const { roundLabel, voteProgress, east, west } = event.detail;
    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">올스타 팬 투표 {roundLabel}</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>
            <EventLetterLogo src="/logos/real/AS/AllStar.svg" alt="올스타" />
            <div className="space-y-4">
                <h2 className="text-base font-black text-indigo-400">동부 컨퍼런스</h2>
                <AllstarVoteSection label="백코트" entries={east.guards} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showStats scrollable />
                <AllstarVoteSection label="프론트코트" entries={east.frontcourt} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showStats scrollable />
            </div>
            <div className="space-y-4">
                <h2 className="text-base font-black text-indigo-400">서부 컨퍼런스</h2>
                <AllstarVoteSection label="백코트" entries={west.guards} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showStats scrollable />
                <AllstarVoteSection label="프론트코트" entries={west.frontcourt} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showStats scrollable />
            </div>
            {onOpenAllStar && (
                <button
                    type="button"
                    onClick={() => onOpenAllStar()}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                >
                    {voteProgress >= 1 ? '올스타 투표 결과 보러가기' : '올스타 투표 현황 보러가기'}
                    <ArrowRight size={14} />
                </button>
            )}
        </div>
    );
};

/** 투표 시작일(allstar_vote_start) 안내 서신 — 득표 리더보드(allstar_vote_update)와 달리
 * 표가 없는 순수 텍스트 3줄 + 하단 바로가기. 투표 시작이라 아직 결과가 없으므로 링크 문구는
 * 항상 "현황 보러가기"로 고정(중간 집계/결과 카드처럼 voteProgress로 갈릴 필요 없음). */
export const AllstarVoteStartCard: React.FC<{
    event: LeagueEvent;
    onOpenAllStar?: (view?: string) => void;
}> = ({ event, onOpenAllStar }) => {
    if (event.detail.kind !== 'allstar_vote_start') return null;
    const { leagueName, seasonLabel, voteStart, voteEnd, allStarStart, allStarEnd, mainGameDate } = event.detail;
    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">올스타 팬 투표가 시작됐습니다</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>
            <div className="space-y-2">
                <EventLetterLogo src="/logos/real/AS/AllStar.svg" alt="올스타" />
                <p className="text-sm text-slate-300 leading-relaxed">
                    오늘부터 {leagueName} {seasonLabel}시즌 올스타 투표가 시작됩니다.
                </p>
                <p className="text-sm text-slate-300 leading-relaxed">
                    {voteStart}부터 {voteEnd}까지 진행되며, 올스타 위켄드는 {allStarStart} ~ {allStarEnd}에 진행됩니다
                    {mainGameDate ? `(본경기는 ${mainGameDate})` : ''}.
                </p>
                <p className="text-sm text-slate-300 leading-relaxed">
                    올해는 어떤 선수가 올스타에 선정될까요?
                </p>
            </div>
            {onOpenAllStar && (
                <button
                    type="button"
                    onClick={() => onOpenAllStar()}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                >
                    올스타 투표 현황 보러가기
                    <ArrowRight size={14} />
                </button>
            )}
        </div>
    );
};

/** 투표 마감일 최종 명단 발표 서신 — 사용자 요청으로 코트 배치도(AllStarCourtDiagram)는
 * 넣지 않고, 컨퍼런스별 스타터/리저브를 전부 AllstarRosterTable(리스트형 표)로만 보여준다.
 * 페이지(MultiAllStarView.tsx)의 "최종 결과" 영역과 데이터는 완전히 동일 — league_events의
 * allstar_vote_result가 league_allstar_votes.roster와 같은 시점에 서버에서 같이 게시됨.
 * [2026-09-08 추가] 테이블 위 본문(2~3줄) — 라이징스타 서신(AllstarRisingStarsCard)과 달리
 * "팬 투표로 스타터, 코치단 투표로 리저브 선발"이라는 문구는 실제 선발 메커니즘 그대로다
 * (runAllStarSelection() 참고, 연출용 플레이버 텍스트가 아님). 경기 일정은
 * allStarStart/allStarEnd(올스타전 개최 기간) — 구버전 데이터엔 없을 수 있어 둘 다 있을
 * 때만 그 줄을 렌더링. */
export const AllstarVoteResultCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
    onOpenAllStar?: (view?: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, onOpenAllStar }) => {
    if (event.detail.kind !== 'allstar_vote_result') return null;
    // [2026-09-08] risingStars는 이 카드에서 더 이상 섹션으로 그리지 않는다 — 사용자 요청으로
    // AllstarRisingStarsCard(allstar_rising_stars)라는 별도 서신으로 승격했음(중복 표시 방지).
    // event.detail.risingStars 필드 자체는 여전히 존재(league_allstar_votes.roster 재사용 때문).
    const { seasonLabel, east, west, allStarStart, allStarEnd, mainGameDate } = event.detail;
    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{seasonLabel}시즌 올스타 명단이 확정됐습니다</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>
            <div className="space-y-2">
                <EventLetterLogo src="/logos/real/AS/AllStar.svg" alt="올스타" />
                <p className="text-sm text-slate-300 leading-relaxed">
                    수개월간 이어진 팬 투표를 통해 동/서부 컨퍼런스 스타터가 확정됐고, 코치단 투표로 리저브까지 최종 명단이 완성됐습니다.
                </p>
                {mainGameDate ? (
                    <p className="text-sm text-slate-300 leading-relaxed">
                        동부 vs 서부의 올스타전은 {mainGameDate}에 열릴 예정입니다.
                    </p>
                ) : allStarStart && allStarEnd && (
                    <p className="text-sm text-slate-300 leading-relaxed">
                        동부 vs 서부의 올스타전은 {allStarStart} ~ {allStarEnd} 기간 중 열릴 예정입니다.
                    </p>
                )}
                <p className="text-sm text-slate-300 leading-relaxed">
                    이번 시즌을 빛낸 최고의 스타들이 한자리에 모입니다.
                </p>
            </div>
            <div className="space-y-4">
                <h2 className="flex items-center gap-1.5 text-base font-black text-indigo-400">
                    <img src="/logos/real/AS/East.svg" alt="" className="h-6 w-6" />
                    동부 컨퍼런스
                </h2>
                <AllstarRosterTable label="스타터" players={east.starters} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showVotes showStats />
                <AllstarRosterTable label="리저브" players={east.reserves} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showVotes showStats />
            </div>
            <div className="space-y-4">
                <h2 className="flex items-center gap-1.5 text-base font-black text-indigo-400">
                    <img src="/logos/real/AS/West.svg" alt="" className="h-6 w-6" />
                    서부 컨퍼런스
                </h2>
                <AllstarRosterTable label="스타터" players={west.starters} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showVotes showStats />
                <AllstarRosterTable label="리저브" players={west.reserves} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showVotes showStats />
            </div>
            {onOpenAllStar && (
                <button
                    type="button"
                    onClick={() => onOpenAllStar()}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                >
                    올스타 투표 결과 보러가기
                    <ArrowRight size={14} />
                </button>
            )}
        </div>
    );
};

/** [2026-09-08] 라이징스타 챌린지 명단 전용 서신 — allstar_vote_result와 별개의 뉴스 피드
 * 아이템(사용자 요청, "라이징스타 명단도 서신으로 발송해줘"). 투표가 없는 성적 기준 선발이라
 * AllstarRosterTable을 showVotes 없이(showOvr만) 쓴다.
 * [2026-09-08 추가] 테이블 위 본문(2~3줄) — "리그 관계자들이 투표했다"는 문구는 실제 선발
 * 메커니즘(투표 없는 자동 선발, runRisingStarsSelection() 참고)과 무관한 연출용 플레이버
 * 텍스트(사용자 명시적 요청, 다른 올스타 서신들과 톤을 맞추기 위함). 경기 일정은
 * allStarStart/allStarEnd(올스타전 개최 기간)를 재사용 — 구버전 데이터엔 없을 수 있어
 * 둘 다 있을 때만 그 줄을 렌더링. */
export const AllstarRisingStarsCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
    onOpenAllStar?: (view?: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, onOpenAllStar }) => {
    if (event.detail.kind !== 'allstar_rising_stars') return null;
    const { seasonLabel, teamA, teamB, teamAName, teamBName, allStarStart, allStarEnd, gameDate } = event.detail;
    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{seasonLabel}시즌 라이징스타 챌린지 명단이 확정됐습니다</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>
            <div className="space-y-2">
                <EventLetterLogo src="/logos/real/AS/RisingStar.svg" alt="라이징스타" />
                <p className="text-sm text-slate-300 leading-relaxed">
                    리그 각 팀의 단장과 코칭스태프들이 투표한 결과, 이번 시즌 라이징스타 챌린지에 나설 유망주 명단이 확정됐습니다.
                </p>
                {gameDate ? (
                    <p className="text-sm text-slate-300 leading-relaxed">
                        팀 {teamAName}과(와) 팀 {teamBName}은 {gameDate}에 맞대결을 펼칠 예정입니다.
                    </p>
                ) : allStarStart && allStarEnd && (
                    <p className="text-sm text-slate-300 leading-relaxed">
                        팀 {teamAName}과(와) 팀 {teamBName}은 올스타 위켄드 기간({allStarStart} ~ {allStarEnd}) 중 맞대결을 펼칠 예정입니다.
                    </p>
                )}
                <p className="text-sm text-slate-300 leading-relaxed">
                    리그를 이끌어갈 다음 세대의 스타들이 어떤 활약을 보여줄지 지켜봐 주세요.
                </p>
            </div>
            <div className="space-y-4">
                <AllstarRosterTable label={`팀 ${teamAName}`} players={teamA} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showStats logoSrc="/logos/real/AS/RisingA.svg" />
                <AllstarRosterTable label={`팀 ${teamBName}`} players={teamB} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showStats logoSrc="/logos/real/AS/RisingB.svg" />
            </div>
            {onOpenAllStar && (
                <button
                    type="button"
                    onClick={() => onOpenAllStar('risingstars')}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                >
                    올스타 화면 라이징스타 탭에서 보러가기
                    <ArrowRight size={14} />
                </button>
            )}
        </div>
    );
};

// zone_c3_l/r(코너), zone_atb3_l/c/r(브레이크 위 — l/r=45도 윙, c=탑) — get_player_season_stats_full
// RPC(usePlayerSeasonStatsFull)가 내려주는 실제 시즌 슛차트 원자료. types/player.ts의
// ShotZones 인터페이스가 이미 이 3분류(cnr/p45/atb)를 "코너 3 / 45도 윙 3 / 브레이크 위(탑) 3"로
// 정의해두고 있어 그 관례를 그대로 따름 — PlayerStats에 인덱스 시그니처([key: string]: number)가
// 있어 선언 안 된 zone_* 필드도 타입 에러 없이 읽을 수 있다.
function threePointZonePct(stats: PlayerStats | undefined, made: string[], att: string[]): number {
    const s = (stats ?? {}) as Record<string, number>;
    const m = made.reduce((sum, k) => sum + (s[k] ?? 0), 0);
    const a = att.reduce((sum, k) => sum + (s[k] ?? 0), 0);
    return a > 0 ? m / a : 0;
}

// [2026-09-09] 참가자 표(thead+tbody)를 서신 카드에서 분리해 재사용 가능한 컴포넌트로
// 추출 — MultiAllStarView.tsx의 "3점 컨테스트" 탭에서도 완전히 동일한 표를 그려야 해서
// (사용자 요청, "올스타 화면에 탭 그룹을 추가해") 중복 JSX를 피하기 위함.
export const ThreePointContestTable: React.FC<{
    participants: ThreePointContestParticipantEntry[];
    teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
}> = ({ participants, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                    <th className={AWARD_RANK_TH}>순위</th>
                    <th className={AWARD_RANK_TH}>OVR</th>
                    <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">선수</th>
                    <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">팀</th>
                    <th className={AWARD_RANK_TH}>G</th>
                    <th className={AWARD_RANK_TH}>MP</th>
                    <th className={AWARD_RANK_TH}>PTS</th>
                    <th className={AWARD_RANK_TH}>3PM</th>
                    <th className={AWARD_RANK_TH}>3PA</th>
                    <th className={AWARD_RANK_TH}>3P%</th>
                    <th className={AWARD_RANK_TH}>CNR%</th>
                    <th className={AWARD_RANK_TH}>45%</th>
                    <th className={AWARD_RANK_TH}>ATB%</th>
                    <th className={AWARD_RANK_TH}>TS%</th>
                </tr>
            </thead>
            <tbody>
                {participants.map((p, idx) => {
                    const entry = playerCardMap.get(p.playerId);
                    const team = teamBySlug.get(p.teamSlug);
                    const stats = entry?.player?.stats;
                    const g = stats?.g ?? 0;
                    const perGame = (total: number | undefined) => (g > 0 ? ((total ?? 0) / g).toFixed(1) : '0.0');
                    const cnrPct = threePointZonePct(stats, ['zone_c3_l_m', 'zone_c3_r_m'], ['zone_c3_l_a', 'zone_c3_r_a']);
                    const p45Pct = threePointZonePct(stats, ['zone_atb3_l_m', 'zone_atb3_r_m'], ['zone_atb3_l_a', 'zone_atb3_r_a']);
                    const atbPct = threePointZonePct(stats, ['zone_atb3_c_m'], ['zone_atb3_c_a']);
                    const tsa = (stats?.fga ?? 0) + 0.44 * (stats?.fta ?? 0);
                    const tsPct = tsa > 0 ? (stats?.pts ?? 0) / (2 * tsa) : 0;
                    return (
                        <tr key={p.playerId} className="border-b border-slate-800/60">
                            <td className={`${AWARD_RANK_TD} font-black text-slate-400`}>{idx + 1}</td>
                            <td className={AWARD_RANK_TD}>
                                <div className="flex justify-center">
                                    <OvrBadge value={p.ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" />
                                </div>
                            </td>
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
                                <div className="flex items-center gap-1.5">
                                    {team?.color_primary ? (
                                        <img
                                            src={getRealTeamLogoUrl(p.teamSlug)}
                                            alt={team?.team_abbr ?? p.teamSlug}
                                            className="w-5 h-5 object-contain shrink-0"
                                            onError={(ev) => {
                                                const img = ev.currentTarget;
                                                if (img.dataset.fallback !== 'old') {
                                                    img.dataset.fallback = 'old';
                                                    img.src = getTeamLogoUrl(p.teamSlug);
                                                } else {
                                                    img.src = 'https://placehold.co/100x100?text=BPL';
                                                }
                                            }}
                                        />
                                    ) : (
                                        <TeamLogo teamId={p.teamSlug} teamName={team?.team_name} size="xs" />
                                    )}
                                    <span
                                        className={`text-sm text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onOpenTeam ? () => onOpenTeam(p.teamSlug) : undefined}
                                    >
                                        {team?.team_abbr ?? p.teamSlug}
                                    </span>
                                </div>
                            </td>
                            <td className={AWARD_RANK_TD}>{g}</td>
                            <td className={AWARD_RANK_TD}>{perGame(stats?.mp)}</td>
                            <td className={AWARD_RANK_TD}>{perGame(stats?.pts)}</td>
                            <td className={AWARD_RANK_TD}>{perGame(stats?.p3m)}</td>
                            <td className={AWARD_RANK_TD}>{perGame(stats?.p3a)}</td>
                            <td className={AWARD_RANK_TD}>{(stats?.p3a ?? 0) > 0 ? formatAwardPct((stats?.p3m ?? 0) / (stats!.p3a)) : '-'}</td>
                            <td className={AWARD_RANK_TD}>{formatAwardPct(cnrPct)}</td>
                            <td className={AWARD_RANK_TD}>{formatAwardPct(p45Pct)}</td>
                            <td className={AWARD_RANK_TD}>{formatAwardPct(atbPct)}</td>
                            <td className={AWARD_RANK_TD}>{formatAwardPct(tsPct)}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

/** [2026-09-08] 3점 챌린지 참가자 명단 전용 서신 — 투표 없이 3점슛 능력치 기반 가중 랜덤
 * 추첨으로 뽑힌 8명(utils/allStarSelection.ts의 runThreePointContestSelection() 참고)을
 * 컨퍼런스/팀 구분 없는 단일 순위표로 보여준다. 다른 올스타 서신들과 달리 투표 마감일이
 * 아니라 올스타전 기간 시작일(allStarStart)에 발송된다.
 * [2026-09-08 추가] OVR/3점 레이팅(선정용 원점수) 컬럼 대신 실제 시즌 3점슛 관련 스탯
 * (G/MP/PTS/3PM/3PA/3P%/CNR%/45%/ATB%/TS%)을 보여준다 — CNR%/45%/ATB%는 개인 코너/45도 윙/
 * 브레이크 위(탑) 3점 실제 슈팅 성공률(usePlayerSeasonStatsFull이 내려주는 zone_c3_l,
 * zone_c3_r, zone_atb3_l/c/r 원자료로 계산, 능력치 레이팅이 아님). MultiNewsFeedView.tsx가 이 존 슛차트를
 * 얻으려고 usePlayerSeasonStatsBatch → usePlayerSeasonStatsFull로 교체했다(다른 카드엔
 * 영향 없음 — full이 batch의 상위 집합). */
export const AllstarThreePointContestCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
    onOpenAllStar?: (view?: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, onOpenAllStar }) => {
    if (event.detail.kind !== 'allstar_three_point_contest') return null;
    const { seasonLabel, participants, contestDate } = event.detail;
    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{seasonLabel}시즌 3점 챌린지 참가자 명단이 확정됐습니다</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>
            <div className="space-y-2">
                <EventLetterLogo src="/logos/real/AS/ThreeContest.svg" alt="3점 컨테스트" />
                <p className="text-sm text-slate-300 leading-relaxed">
                    이번 시즌 최고의 슈터 8명이 3점 챌린지 참가 명단에 이름을 올렸습니다.
                </p>
                {contestDate && (
                    <p className="text-sm text-slate-300 leading-relaxed">
                        실제 대회는 {contestDate}에 열릴 예정입니다.
                    </p>
                )}
                <p className="text-sm text-slate-300 leading-relaxed">
                    예선에서 각 5랙(25구)을 쏘아 상위 3명이 결선에 진출하며, 결선에서 우승자를 가립니다.
                </p>
            </div>
            <div className="space-y-2">
                <h3 className="text-sm font-black text-slate-300 uppercase">참가자</h3>
                <ThreePointContestTable participants={participants} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />
            </div>
            {onOpenAllStar && (
                <button
                    type="button"
                    onClick={() => onOpenAllStar('threept')}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                >
                    올스타 화면 3점 컨테스트 탭에서 보러가기
                    <ArrowRight size={14} />
                </button>
            )}
        </div>
    );
};

// [2026-09-09] 결과 서신(AllstarThreePointContestResultCard)과 올스타 화면 3점 컨테스트
// 탭(MultiAllStarView.tsx) 양쪽이 공유하는 라운드 순위표 — 랙별 점수 5칸 + 합계.
// highlightPlayerId를 넘기면(우승자) 해당 행만 TeamBoxTable과 동일한 옅은 노란색으로 표시.
export const ThreePointContestResultTable: React.FC<{
    entries: ThreePointContestRoundEntry[];
    teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
    highlightPlayerId?: string;
}> = ({ entries, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, highlightPlayerId }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                    <th className={AWARD_RANK_TH}>순위</th>
                    <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">선수</th>
                    <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">팀</th>
                    <th className={AWARD_RANK_TH}>좌측 코너</th>
                    <th className={AWARD_RANK_TH}>좌측 45도</th>
                    <th className={AWARD_RANK_TH}>중앙</th>
                    <th className={AWARD_RANK_TH}>우측 45도</th>
                    <th className={AWARD_RANK_TH}>우측 코너</th>
                    <th className={AWARD_RANK_TH}>합계</th>
                </tr>
            </thead>
            <tbody>
                {entries.map((e, idx) => {
                    const entry = playerCardMap.get(e.playerId);
                    const team = teamBySlug.get(e.teamSlug);
                    const isHighlighted = e.playerId === highlightPlayerId;
                    return (
                        <tr key={e.playerId} className={`border-b border-slate-800/60 ${isHighlighted ? 'bg-amber-400/10' : ''}`}>
                            <td className={`${AWARD_RANK_TD} font-black text-slate-400`}>{idx + 1}</td>
                            <td className="py-1.5 px-2 whitespace-nowrap">
                                <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                                    <span
                                        className={`text-sm font-bold text-slate-100 ${onPlayerClick ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onPlayerClick ? () => onPlayerClick(e.playerId) : undefined}
                                    >
                                        {e.playerName}
                                    </span>
                                </PlayerHoverCard>
                            </td>
                            <td className="py-1.5 px-2 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                    {team?.color_primary ? (
                                        <img
                                            src={getRealTeamLogoUrl(e.teamSlug)}
                                            alt={team?.team_abbr ?? e.teamSlug}
                                            className="w-5 h-5 object-contain shrink-0"
                                            onError={(ev) => {
                                                const img = ev.currentTarget;
                                                if (img.dataset.fallback !== 'old') {
                                                    img.dataset.fallback = 'old';
                                                    img.src = getTeamLogoUrl(e.teamSlug);
                                                } else {
                                                    img.src = 'https://placehold.co/100x100?text=BPL';
                                                }
                                            }}
                                        />
                                    ) : (
                                        <TeamLogo teamId={e.teamSlug} teamName={team?.team_name} size="xs" />
                                    )}
                                    <span
                                        className={`text-sm text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onOpenTeam ? () => onOpenTeam(e.teamSlug) : undefined}
                                    >
                                        {team?.team_abbr ?? e.teamSlug}
                                    </span>
                                </div>
                            </td>
                            {e.rackScores.map((s, i) => <td key={i} className={AWARD_RANK_TD}>{s}</td>)}
                            <td className={`${AWARD_RANK_TD} font-black text-white`}>{e.total}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

// [2026-09-09] 3점 챌린지 샷차트 그래픽 — 좌측 선수 목록에서 선수를 고르면 코트 위 각 랙
// 위치에 5구의 농구공 아이콘(성공=초록/실패=빨간 외곽선, 5구 전부 동일 시각언어 —
// 머니볼도 구분하지 않음)과 존 이름·랙 합계가 박스로 묶여 표시된다.
// 코트는 새로 그리지 않고 "경기 결과 화면"의 "샷차트" 탭(MultiGamePbpView.tsx →
// GameShotChartTab.tsx)이 쓰는 것과 동일한 배경(#020617)/페인트존(#0f172a)/BasketLines를
// 그대로 재사용 — viewBox를 0 0 470 500(좌측 절반, 하프코트 라인 x=470이 오른쪽 경계)로 잘라
// 오른쪽 바스켓/페인트존은 렌더하지 않는다.
//
// 5랙 좌표(940x500 좌표계)는 BasketLines의 3점 아치 path(`M0,30h140s150,55,150,220...`)를
// 분석해 구한 실제 좌표. `h140`(0,30)→(140,30))은 곡선이 아니라 코너 3점 직선 구간 자체 —
// 즉 (140,30)은 "코너 위치"가 아니라 그 직선이 끝나고 아치가 시작되는 지점(45도 윙에 더
// 가까움)이었다. 실제 코너 슈팅 지점은 이 직선의 베이스라인쪽 끝(x≈0, y=30)에 훨씬
// 가깝다 — 사용자가 "아직도 위치가 안 맞는다, 코너 클러스터를 더 좌측으로"로 재지적해
// 베이스라인 쪽으로 한 번 더 당김(박스 폭 절반만큼만 여유를 두고 뷰포트 밖으로 잘리지
// 않는 한도까지). 45도 윙=(215,78)/(215,422)(첫 S 곡선 구간의 t=0.5, 아치 구간의 중간)은
// 그대로 유지, 탑=(290,250)(첫 S 구간의 끝점=정점)도 유지.
const RACK_POSITIONS: readonly [number, number][] = [
    [75, 38], [230, 110], [330, 250], [230, 390], [75, 462],
];
// 랙 순서(코너→45도 윙→탑→45도 윙→코너)에 대응하는 존 이름 — "랙1"/"랙2" 대신 실제 위치명을
// 쓴다(postThreePointContest.ts의 RACK_ZONES 순서와 동일).
const RACK_LABELS = ['좌측 코너', '좌측 45도', '중앙', '우측 45도', '우측 코너'] as const;

// 성공=초록 원, 실패=빨간 외곽선 원(사용자 확정 — 5구 전부 동일하게, 머니볼 구분 없음).
// 반지름 6.5→8로 확대(사용자 요청 — "원 사이즈도 더 키워").
const ThreePointBallIcon: React.FC<{ made: boolean; dx: number }> = ({ made, dx }) => (
    made ? (
        <circle cx={dx} cy={0} r={8} fill="#22c55e" stroke="#16a34a" strokeWidth={1.5} />
    ) : (
        <circle cx={dx} cy={0} r={8} fill="none" stroke="#ef4444" strokeWidth={2.5} />
    )
);

// 존 클러스터를 감싸는 박스 크기(사용자 요청 — "구역별 그래픽을 박스로 묶어줘"). 폭은
// "좌측 45도"처럼 긴 라벨 + 확대된 폰트가 우측 점수와 겹치지 않을 만큼 넉넉하게 잡음. 높이는
// 커진 볼 아이콘(r=8)과 text-base 폰트를 여유 있게 담도록 52→60으로 확대.
const CLUSTER_BOX_W = 140;
const CLUSTER_BOX_H = 60;

// 코트 위 랙 하나를 박스로 묶어 실제 랙 위치에 그린다 — 상단 행에 존 이름(좌)+합계(우, 사용자
// 요청으로 존 이름 옆으로 이동), 하단 행에 5구 아이콘. 라벨/합계 텍스트는 SVG가 viewBox로
// 축소 렌더되는 만큼(470유닛→최대 400px, 배율 약 0.85) 실제 화면에서 사이드바의 진짜
// text-sm(14px)만큼 커 보이도록 한 단계 위인 text-base(16px, 배율 적용 시 ≈13.6px 실측)를
// 사용(사용자 요청 — "클러스터 내 텍스트 사이즈 text-sm으로 키워").
const RackShotCluster: React.FC<{ x: number; y: number; label: string; score: number; shots: boolean[] }> = ({ x, y, label, score, shots }) => (
    <g transform={`translate(${x},${y})`}>
        <rect
            x={-CLUSTER_BOX_W / 2} y={-CLUSTER_BOX_H / 2}
            width={CLUSTER_BOX_W} height={CLUSTER_BOX_H}
            rx={8}
            fill="#0f172a" fillOpacity={0.85}
            stroke="#334155" strokeWidth={1}
        />
        <text x={-CLUSTER_BOX_W / 2 + 10} y="-12" textAnchor="start" className="fill-slate-300 text-base font-bold ko-normal">{label}</text>
        <text x={CLUSTER_BOX_W / 2 - 10} y="-12" textAnchor="end" className="fill-white text-base font-black tabular-nums">{score}점</text>
        {shots.map((made, ballIdx) => (
            <g key={ballIdx} transform={`translate(${(ballIdx - (shots.length - 1) / 2) * 19},16)`}>
                <ThreePointBallIcon made={made} dx={0} />
            </g>
        ))}
    </g>
);

/** [2026-09-09] 결과 서신/올스타 화면 3점 컨테스트 탭이 공유하는 샷차트 — round1/round2를
 * 둘 다 받아 내부에서 라운드(예선/결선) + 선수를 선택할 수 있게 한다. 데이터에
 * rackShots(개별 5구 성공/실패)가 없는 구버전 이벤트는 안내 문구로 대체(카드 자체는 깨지지
 * 않음). */
export const ThreePointContestShotChart: React.FC<{
    round1: ThreePointContestRoundEntry[];
    round2: ThreePointContestRoundEntry[];
    winnerId: string;
}> = ({ round1, round2, winnerId }) => {
    const [selectedRound, setSelectedRound] = useState<'round1' | 'round2'>('round2');
    const entries = selectedRound === 'round2' ? round2 : round1;
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

    const selected = entries.find(e => e.playerId === selectedPlayerId) ?? entries[0];

    return (
        <div className="flex gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="w-40 shrink-0 space-y-2">
                <div className="flex items-center gap-1 bg-slate-800 rounded-md p-1 w-fit">
                    {(['round2', 'round1'] as const).map(r => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => setSelectedRound(r)}
                            className={`px-3 py-1.5 rounded text-sm font-bold ko-normal transition-colors ${
                                selectedRound === r ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            {r === 'round2' ? '결선' : '예선'}
                        </button>
                    ))}
                </div>
                <div className="space-y-0.5">
                    {entries.map(e => {
                        const isWinner = e.playerId === winnerId;
                        const isSelected = selected?.playerId === e.playerId;
                        return (
                            <button
                                key={e.playerId}
                                type="button"
                                onClick={() => setSelectedPlayerId(e.playerId)}
                                className={`w-full flex items-center justify-between gap-1.5 px-2 py-1.5 rounded text-left transition-colors ${
                                    isWinner
                                        ? `bg-amber-400 text-slate-950 ${isSelected ? 'ring-2 ring-white' : ''}`
                                        : isSelected
                                            ? 'bg-indigo-500/20 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                }`}
                            >
                                <span className="text-sm font-bold truncate">{e.playerName}</span>
                                <span className="text-sm font-black tabular-nums shrink-0">{e.total}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="flex-1 min-w-0">
                {!selected ? null : !selected.rackShots ? (
                    <p className="text-sm text-slate-500 ko-normal py-8 text-center">
                        이 기록엔 랙별 샷 데이터가 없습니다.
                    </p>
                ) : (
                    <div className="relative w-full max-w-[400px] mx-auto" style={{ aspectRatio: '470/500' }}>
                        <svg viewBox="0 0 470 500" className="w-full h-full drop-shadow-xl">
                            <rect width="470" height="500" fill="#020617" />
                            <rect y="170" width="190" height="160" fill="#0f172a" />
                            <ShotChartBasketLines />
                            {RACK_POSITIONS.map(([x, y], rackIdx) => (
                                <RackShotCluster
                                    key={rackIdx}
                                    x={x} y={y}
                                    label={RACK_LABELS[rackIdx]}
                                    score={selected.rackScores[rackIdx]}
                                    shots={selected.rackShots![rackIdx] ?? []}
                                />
                            ))}
                            {/* 테두리는 맨 마지막에 그려서 위 배경/페인트존 사각형에 가려지지 않게 함 */}
                            <rect x="1" y="1" width="468" height="498" fill="none" stroke="#334155" strokeWidth="2" />
                        </svg>
                    </div>
                )}
            </div>
        </div>
    );
};

/** [2026-09-09] 3점 챌린지 "결과" 서신 — 참가자 발표(AllstarThreePointContestCard)와 달리
 * 실제 슈팅 시뮬레이션 완료 후 발송(server/src/postThreePointContest.ts). 본문에 우승자
 * 활약(합계 점수)을 문장으로 언급 + 예선/결선 순위표 2개, 우승자 행은
 * ThreePointContestResultTable의 highlightPlayerId로 하이라이트. */
export const AllstarThreePointContestResultCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
    onOpenAllStar?: (view?: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, onOpenAllStar }) => {
    if (event.detail.kind !== 'allstar_three_point_contest_result') return null;
    const { seasonLabel, round1, round2, winnerId } = event.detail;
    const winner = round2.find(e => e.playerId === winnerId) ?? round2[0];
    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{seasonLabel}시즌 3점 챌린지 결과가 발표됐습니다</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>
            <div className="space-y-2">
                <EventLetterLogo src="/logos/real/AS/ThreeContest.svg" alt="3점 컨테스트" />
                <p className="text-sm text-slate-300 leading-relaxed">
                    3점 챌린지가 막을 내렸습니다.
                </p>
                {winner && (
                    <p className="text-sm text-slate-300 leading-relaxed">
                        우승은 {winner.playerName}(결선 {winner.total}점)에게 돌아갔습니다.
                    </p>
                )}
            </div>
            <div className="space-y-6">
                <div className="space-y-2">
                    <h3 className="text-sm font-black text-slate-300 uppercase">샷차트</h3>
                    <ThreePointContestShotChart round1={round1} round2={round2} winnerId={winnerId} />
                </div>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <h3 className="text-sm font-black text-slate-300 uppercase">결선 (상위 3명)</h3>
                        <ThreePointContestResultTable entries={round2} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} highlightPlayerId={winnerId} />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-sm font-black text-slate-300 uppercase">예선 (8명)</h3>
                        <ThreePointContestResultTable entries={round1} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />
                    </div>
                </div>
            </div>
            {onOpenAllStar && (
                <button
                    type="button"
                    onClick={() => onOpenAllStar('threept')}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                >
                    올스타 화면 3점 컨테스트 탭에서 보러가기
                    <ArrowRight size={14} />
                </button>
            )}
        </div>
    );
};

/** [2026-09-09] 덩크 컨테스트 결과 순위표 — ThreePointContestResultTable과 동일한 구조지만
 * 컬럼이 랙 5개 대신 시도 2개(덩크1/덩크2)뿐이다. */
export const DunkContestResultTable: React.FC<{
    entries: DunkContestRoundEntry[];
    teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
    highlightPlayerId?: string;
}> = ({ entries, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, highlightPlayerId }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                    <th className={AWARD_RANK_TH}>순위</th>
                    <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">선수</th>
                    <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">팀</th>
                    <th className={AWARD_RANK_TH}>덩크 1</th>
                    <th className={AWARD_RANK_TH}>덩크 2</th>
                    <th className={AWARD_RANK_TH}>합계</th>
                </tr>
            </thead>
            <tbody>
                {entries.map((e, idx) => {
                    const entry = playerCardMap.get(e.playerId);
                    const team = teamBySlug.get(e.teamSlug);
                    const isHighlighted = e.playerId === highlightPlayerId;
                    return (
                        <tr key={e.playerId} className={`border-b border-slate-800/60 ${isHighlighted ? 'bg-amber-400/10' : ''}`}>
                            <td className={`${AWARD_RANK_TD} font-black text-slate-400`}>{idx + 1}</td>
                            <td className="py-1.5 px-2 whitespace-nowrap">
                                <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                                    <span
                                        className={`text-sm font-bold text-slate-100 ${onPlayerClick ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onPlayerClick ? () => onPlayerClick(e.playerId) : undefined}
                                    >
                                        {e.playerName}
                                    </span>
                                </PlayerHoverCard>
                            </td>
                            <td className="py-1.5 px-2 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                    {team?.color_primary ? (
                                        <img
                                            src={getRealTeamLogoUrl(e.teamSlug)}
                                            alt={team?.team_abbr ?? e.teamSlug}
                                            className="w-5 h-5 object-contain shrink-0"
                                            onError={(ev) => {
                                                const img = ev.currentTarget;
                                                if (img.dataset.fallback !== 'old') {
                                                    img.dataset.fallback = 'old';
                                                    img.src = getTeamLogoUrl(e.teamSlug);
                                                } else {
                                                    img.src = 'https://placehold.co/100x100?text=BPL';
                                                }
                                            }}
                                        />
                                    ) : (
                                        <TeamLogo teamId={e.teamSlug} teamName={team?.team_name} size="xs" />
                                    )}
                                    <span
                                        className={`text-sm text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onOpenTeam ? () => onOpenTeam(e.teamSlug) : undefined}
                                    >
                                        {team?.team_abbr ?? e.teamSlug}
                                    </span>
                                </div>
                            </td>
                            {e.dunks.map((d, i) => <td key={i} className={AWARD_RANK_TD}>{d.total}</td>)}
                            <td className={`${AWARD_RANK_TD} font-black text-white`}>{e.total}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

/** [2026-09-09] 덩크 컨테스트 "결과" 서신 — 참가자 발표(AllstarDunkContestCard)와 달리 실제
 * 채점 시뮬레이션 완료 후 발송(server/src/postDunkContest.ts). 덩크는 3점 챌린지의
 * 샷차트 같은 좌표 기반 그래픽이 없어(코트 위 특정 지점에서 쏘는 게 아니라 림 위에서
 * 이루어지는 동작이라 "위치" 개념이 없음) 예선/결승 순위표 2개만 보여준다(docs/simulation/
 * allstar-game-plan.md §6 "화면" 절 — "라운드별 순위표 정도"). */
export const AllstarDunkContestResultCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
    onOpenAllStar?: (view?: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, onOpenAllStar }) => {
    if (event.detail.kind !== 'allstar_dunk_contest_result') return null;
    const { seasonLabel, round1, round2, winnerId } = event.detail;
    const winner = round2.find(e => e.playerId === winnerId) ?? round2[0];
    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{seasonLabel}시즌 덩크 컨테스트 결과가 발표됐습니다</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>
            <div className="space-y-2">
                <EventLetterLogo src="/logos/real/AS/DunkContest.svg" alt="덩크 컨테스트" />
                <p className="text-sm text-slate-300 leading-relaxed">
                    덩크 컨테스트가 막을 내렸습니다.
                </p>
                {winner && (
                    <p className="text-sm text-slate-300 leading-relaxed">
                        우승은 {winner.playerName}(결승 {winner.total}점)에게 돌아갔습니다.
                    </p>
                )}
            </div>
            <div className="space-y-6">
                <div className="space-y-2">
                    <h3 className="text-sm font-black text-slate-300 uppercase">결승 (상위 2명)</h3>
                    <DunkContestResultTable entries={round2} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} highlightPlayerId={winnerId} />
                </div>
                <div className="space-y-2">
                    <h3 className="text-sm font-black text-slate-300 uppercase">예선 (4명)</h3>
                    <DunkContestResultTable entries={round1} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />
                </div>
            </div>
            {onOpenAllStar && (
                <button
                    type="button"
                    onClick={() => onOpenAllStar('dunk')}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                >
                    올스타 화면 덩크 컨테스트 탭에서 보러가기
                    <ArrowRight size={14} />
                </button>
            )}
        </div>
    );
};

// [2026-09-09] ThreePointContestTable과 동일한 이유로 표를 분리(MultiAllStarView.tsx의
// "덩크 컨테스트" 탭에서 재사용).
export const DunkContestTable: React.FC<{
    participants: DunkContestParticipantEntry[];
    teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
}> = ({ participants, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                    <th className={AWARD_RANK_TH}>순위</th>
                    <th className={AWARD_RANK_TH}>OVR</th>
                    <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">선수</th>
                    <th className="py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap">팀</th>
                    <th className={AWARD_RANK_TH}>덩크 점수</th>
                </tr>
            </thead>
            <tbody>
                {participants.map((p, idx) => {
                    const entry = playerCardMap.get(p.playerId);
                    const team = teamBySlug.get(p.teamSlug);
                    return (
                        <tr key={p.playerId} className="border-b border-slate-800/60">
                            <td className={`${AWARD_RANK_TD} font-black text-slate-400`}>{idx + 1}</td>
                            <td className={AWARD_RANK_TD}>
                                <div className="flex justify-center">
                                    <OvrBadge value={p.ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" />
                                </div>
                            </td>
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
                                <div className="flex items-center gap-1.5">
                                    {team?.color_primary ? (
                                        <img
                                            src={getRealTeamLogoUrl(p.teamSlug)}
                                            alt={team?.team_abbr ?? p.teamSlug}
                                            className="w-5 h-5 object-contain shrink-0"
                                            onError={(ev) => {
                                                const img = ev.currentTarget;
                                                if (img.dataset.fallback !== 'old') {
                                                    img.dataset.fallback = 'old';
                                                    img.src = getTeamLogoUrl(p.teamSlug);
                                                } else {
                                                    img.src = 'https://placehold.co/100x100?text=BPL';
                                                }
                                            }}
                                        />
                                    ) : (
                                        <TeamLogo teamId={p.teamSlug} teamName={team?.team_name} size="xs" />
                                    )}
                                    <span
                                        className={`text-sm text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onOpenTeam ? () => onOpenTeam(p.teamSlug) : undefined}
                                    >
                                        {team?.team_abbr ?? p.teamSlug}
                                    </span>
                                </div>
                            </td>
                            <td className={`${AWARD_RANK_TD} tabular-nums`}>{p.dunkRating}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

/** [2026-09-08] 덩크 컨테스트 참가자 명단 전용 서신 — 3점 챌린지 서신
 * (AllstarThreePointContestCard)과 동일한 구조지만, 3점처럼 실제 시즌 존 슛차트로 계산할
 * "실제 덩크 성공률" 같은 시즌 스탯이 없어(덩크는 game_pbp에 그런 세부 분류가 없음) OVR +
 * 덩크 점수(dunkRating, 선정용 원점수)만 보여준다 — AllstarRosterTable은 posGroup(G/FC)이
 * 필수라 덩크 컨테스트엔 안 맞아 재사용하지 않고 이 표를 새로 그린다. */
export const AllstarDunkContestCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
    onOpenAllStar?: (view?: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, onOpenAllStar }) => {
    if (event.detail.kind !== 'allstar_dunk_contest') return null;
    const { seasonLabel, participants, contestDate } = event.detail;
    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{seasonLabel}시즌 덩크 컨테스트 참가자 명단이 확정됐습니다</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>
            <div className="space-y-2">
                <EventLetterLogo src="/logos/real/AS/DunkContest.svg" alt="덩크 컨테스트" />
                <p className="text-sm text-slate-300 leading-relaxed">
                    이번 시즌 최고의 하이플라이어 4명이 덩크 컨테스트 참가 명단에 이름을 올렸습니다.
                </p>
                {contestDate && (
                    <p className="text-sm text-slate-300 leading-relaxed">
                        실제 대회는 {contestDate}에 열릴 예정입니다.
                    </p>
                )}
                <p className="text-sm text-slate-300 leading-relaxed">
                    예선에서 전원 2회씩 시도해 최고점을 합산하고, 상위 2명이 결승에서 다시 2회씩 시도해 우승자를 가립니다.
                </p>
            </div>
            <div className="space-y-2">
                <h3 className="text-sm font-black text-slate-300 uppercase">참가자</h3>
                <DunkContestTable participants={participants} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />
            </div>
            {onOpenAllStar && (
                <button
                    type="button"
                    onClick={() => onOpenAllStar('dunk')}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                >
                    올스타 화면 덩크 컨테스트 탭에서 보러가기
                    <ArrowRight size={14} />
                </button>
            )}
        </div>
    );
};

// 가상 팀(EAST-ALLSTAR 등)은 league_teams에 실제 행이 없어 QuarterScoreTable/TeamBoxTable이
// 기대하는 LeagueTeamRow를 만들 수 없다 — 두 컴포넌트가 실제로 읽는 필드(team_name/team_abbr/
// color_primary/color_text)만 payload가 이미 갖고 있는 값(homeTeamName 등 + 컨퍼런스/라이징
// 스타 테마색)으로 채우고 나머지는 두 컴포넌트가 안 쓰는 필드라 빈 값으로 둔다 — 이렇게 하면
// 두 컴포넌트를 전혀 수정하지 않고 그대로 재사용할 수 있다.
function buildAllStarTeamRow(teamSlug: string, teamName: string, colorPrimary: string): LeagueTeamRow {
    return {
        id: teamSlug, room_id: '', team_slug: teamSlug, team_name: teamName, team_abbr: teamName,
        color_primary: colorPrimary, color_secondary: colorPrimary, color_tertiary: colorPrimary,
        color_text: getReadableTextColor(colorPrimary),
        court_background: '', court_paint: '', court_line: '',
        conference: null, user_id: null, nickname: null, is_ai: true, draft_order: null,
        roster: [], trade_request_note: null, trade_request_positions: [], trade_request_player_ids: [],
        trade_request_archetypes: [], created_at: '',
    };
}

/** [2026-09-09] 올스타 본경기/라이징스타 챌린지 "결과" 서신 — 실제 경기 시뮬레이션 완료 후
 * 발송(server/src/postAllStarGame.ts). 경기결과/개인활약 레터(GameResultCard/FeatCard)와
 * 동일한 구성(헤더+본문 → 최종스코어 → 쿼터별 득점 → 양팀 박스스코어)으로 맞춘다(사용자
 * 요청) — MVP 행은 TeamBoxTable의 기존 highlightPlayerId 기능(옅은 노란색)을 그대로 재사용.
 * allstar_game_result/allstar_rising_stars_result 두 타입이 완전히 동일한 payload 구조
 * (AllstarGameResultDetail)를 공유해 카드도 하나로 합치고 kind로 텍스트/로고/색상/바로가기
 * 대상만 분기한다. 팀명/로고/박스스코어는 payload에 이미 서버가 구워둔 homeTeamName/
 * awayTeamName + getRealTeamLogoUrl(가상 팀 ID를 AS 로고로 매핑하도록 이미 확장돼 있음) +
 * useGameBoxScore(event.gameId)로 채운다 — onOpenTeam은 의도적으로 안 씀(가상 팀 ID로 로스터
 * 화면에 진입하면 빈 화면만 뜸). */
export const AllstarGameResultCard: React.FC<{
    event: LeagueEvent;
    playerCardMap: PlayerCardMap;
    roomId: string | undefined;
    onOpenGame?: (gameId: string) => void;
    onPlayerClick?: (playerId: string) => void;
    onOpenAllStar?: (view?: string) => void;
}> = ({ event, playerCardMap, roomId, onOpenGame, onPlayerClick, onOpenAllStar }) => {
    const { data: boxScore, isLoading: isBoxLoading } = useGameBoxScore(roomId, event.gameId);
    const boxPlayerCardMap = useBoxScorePlayerCardMap(roomId, boxScore, playerCardMap);
    if (event.detail.kind !== 'allstar_game_result' && event.detail.kind !== 'allstar_rising_stars_result') return null;
    const isMain = event.detail.kind === 'allstar_game_result';
    const { homeTeamId, awayTeamId, homeTeamName, awayTeamName, mvp } = event.detail;
    const logoSrc = isMain ? '/logos/real/AS/AllStar.svg' : '/logos/real/AS/RisingStar.svg';
    const logoAlt = isMain ? '올스타' : '라이징스타';
    const eventLabel = isMain ? '올스타전' : '라이징스타 챌린지';
    const homeColor = isMain ? CONFERENCE_COLORS.East : RISING_STARS_COLORS.A;
    const awayColor = isMain ? CONFERENCE_COLORS.West : RISING_STARS_COLORS.B;
    const homeTeamRow = buildAllStarTeamRow(homeTeamId, homeTeamName, homeColor);
    const awayTeamRow = buildAllStarTeamRow(awayTeamId, awayTeamName, awayColor);
    const mvpStatLine = mvp && mvp.stats.length > 0 ? mvp.stats.map(s => `${s.value} ${s.label}`).join(', ') : null;

    return (
        <div className="max-w-5xl space-y-6 ko-normal relative">
            <BrandMark className="h-4 w-auto" />
            <div className="space-y-2">
                <h1 className="text-xl font-black text-white">{event.detail.seasonLabel}시즌 {eventLabel}이 종료됐습니다</h1>
                <p className="text-sm text-slate-500">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
                <div className="border-t border-slate-700" />
            </div>
            <div className="space-y-2">
                <EventLetterLogo src={logoSrc} alt={logoAlt} />
                <p className="text-sm text-slate-300 leading-relaxed">
                    {awayTeamName}와(과) {homeTeamName}의 {eventLabel}이 막을 내렸습니다.
                </p>
                {mvp && (
                    <p className="text-sm text-slate-300 leading-relaxed">
                        MVP는 {mvp.name}
                        {mvpStatLine ? `(${mvpStatLine})` : ''}에게 돌아갔습니다.
                    </p>
                )}
            </div>

            {isBoxLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-indigo-400" />
                </div>
            ) : boxScore ? (
                <div className="space-y-4">
                    <BoxScoreHeadline
                        game={{ homeSlug: homeTeamId, awaySlug: awayTeamId, homeScore: boxScore.homeScore, awayScore: boxScore.awayScore }}
                        teamBySlug={new Map([[homeTeamId, homeTeamRow], [awayTeamId, awayTeamRow]])}
                        onOpenGame={event.gameId && onOpenGame ? () => onOpenGame(event.gameId!) : undefined}
                    />
                    {boxScore.quarterScores && (
                        <QuarterScoreTable
                            homeSlug={homeTeamId} awaySlug={awayTeamId}
                            homeScore={boxScore.homeScore} awayScore={boxScore.awayScore}
                            quarterScores={boxScore.quarterScores}
                            teamBySlug={new Map([[homeTeamId, homeTeamRow], [awayTeamId, awayTeamRow]])}
                        />
                    )}
                    <div className="space-y-4">
                        <h4 className="text-base font-black text-white uppercase">박스스코어</h4>
                        <TeamBoxTable team={awayTeamRow} teamSlug={awayTeamId} box={boxScore.awayBox} playerCardMap={boxPlayerCardMap} onPlayerClick={onPlayerClick} highlightPlayerId={mvp?.playerId} />
                        <TeamBoxTable team={homeTeamRow} teamSlug={homeTeamId} box={boxScore.homeBox} playerCardMap={boxPlayerCardMap} onPlayerClick={onPlayerClick} highlightPlayerId={mvp?.playerId} />
                    </div>
                </div>
            ) : event.gameId ? (
                <p className="text-xs text-slate-500 ko-normal py-4 text-center border border-dashed border-slate-800 rounded-lg">
                    박스스코어는 경기 종료 후 최대 10분 뒤 공개됩니다.
                </p>
            ) : null}

            {onOpenAllStar && (
                <button
                    type="button"
                    onClick={() => onOpenAllStar(isMain ? undefined : 'risingstars')}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                >
                    올스타 화면에서 보러가기
                    <ArrowRight size={14} />
                </button>
            )}
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
    injury: HeartPulse,
    suspension: Swords,
    allstar_vote_update: BarChart3,
    allstar_vote_start: Vote,
    allstar_vote_result: Trophy,
    allstar_rising_stars: Sparkles,
    allstar_three_point_contest: Target,
    allstar_dunk_contest: Zap,
    allstar_game_result: Trophy,
    allstar_rising_stars_result: Sparkles,
    allstar_three_point_contest_result: Target,
    allstar_dunk_contest_result: Zap,
    draft_lottery_result: Shuffle,
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
    onOpenAllStar?: (view?: string) => void;
}> = ({ event, teamBySlug, playerCardMap, roomId, onOpenGame, onPlayerClick, onOpenTeam, onOpenAllStar }) => {
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
        case 'injury': return <InjuryCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />;
        case 'suspension': return <SuspensionCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />;
        case 'allstar_vote_update': return <AllstarVoteUpdateCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} onOpenAllStar={onOpenAllStar} />;
        case 'allstar_vote_start': return <AllstarVoteStartCard event={event} onOpenAllStar={onOpenAllStar} />;
        case 'allstar_vote_result': return <AllstarVoteResultCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} onOpenAllStar={onOpenAllStar} />;
        case 'allstar_rising_stars': return <AllstarRisingStarsCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} onOpenAllStar={onOpenAllStar} />;
        case 'allstar_three_point_contest': return <AllstarThreePointContestCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} onOpenAllStar={onOpenAllStar} />;
        case 'allstar_dunk_contest': return <AllstarDunkContestCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} onOpenAllStar={onOpenAllStar} />;
        case 'allstar_game_result': return <AllstarGameResultCard event={event} playerCardMap={playerCardMap} roomId={roomId} onOpenGame={onOpenGame} onPlayerClick={onPlayerClick} onOpenAllStar={onOpenAllStar} />;
        case 'allstar_rising_stars_result': return <AllstarGameResultCard event={event} playerCardMap={playerCardMap} roomId={roomId} onOpenGame={onOpenGame} onPlayerClick={onPlayerClick} onOpenAllStar={onOpenAllStar} />;
        case 'allstar_three_point_contest_result': return <AllstarThreePointContestResultCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} onOpenAllStar={onOpenAllStar} />;
        case 'allstar_dunk_contest_result': return <AllstarDunkContestResultCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} onOpenAllStar={onOpenAllStar} />;
        case 'draft_lottery_result': return <DraftLotteryResultCard event={event} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam} />;
        default: return <LegacyCard event={event} />;
    }
};

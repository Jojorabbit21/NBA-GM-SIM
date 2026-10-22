
import React, { useMemo, useState } from 'react';
import { Spinner } from '../../../components/common/Spinner';
import { TeamHover } from '../../../components/common/TeamHover';
import { Flame, TrendingUp, TrendingDown, Star, ArrowLeftRight, Tv, BarChart3, Trophy, Shield, HeartPulse, Swords, Vote, Sparkles, Target, Zap, Shuffle, ListOrdered, type LucideIcon } from 'lucide-react';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { SegmentedControl } from '../../../components/common/SegmentedControl';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { TeamMark } from '../../../components/common/TeamMark';
import { getReadableTextColor } from '../../../utils/colorContrast';
import { getLeagueLogoUrl, CONFERENCE_COLORS, RISING_STARS_COLORS } from '../../../utils/constants';
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
import { EventLetterLogo, ClickableText, LetterShell, LetterSectionTitle, LetterLink, LetterHero, BoxScoreWaitNote, LetterPlayerCell, LetterTeamCell, LetterRankCell } from './newsFeedLetter';
import { Table, TableHead, TableBody, TableFoot, TableRow, TableHeaderCell, TableCell } from '../../../components/common/Table';
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
        case 'draft_result': return event.detail.picks.map(p => p.playerId);
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

// BrandMark / EventLetterLogo / LetterShell 등 레터 공용 골격은 ./newsFeedLetter.tsx로 이동 [2026-10-13].
// (마스트헤드 h-4, 이벤트 로고 64px 정사각 — 과거 변경 이력: BrandMark 크기 h-8→h-[22.4px]→h-4, 본문 하단 로고 삭제)

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
    if (!game) return <h4 className="text-lg font-black text-white">박스스코어</h4>;
    const awayTeam = teamBySlug.get(game.awaySlug);
    const homeTeam = teamBySlug.get(game.homeSlug);
    const teamSpan = (slug: string, team: LeagueTeamRow | undefined) => (
        <ClickableText className="text-lg font-black text-white" onClick={onOpenTeam ? () => onOpenTeam(slug) : undefined} teamHoverId={slug}>
            {team?.team_abbr ?? slug}
        </ClickableText>
    );
    // [2026-09-07] 팀약어 옆에 팀 로고를 붙여달라는 요청 — 컬러 배지(TeamBadge)가 아니라
    // public/logos/teams/의 실제 팀 로고 이미지 사용. TeamLogo 공용(리그 로고 1회 폴백).
    // [2026-09-07 후속] 순수 장식용 —
    // 클릭은 요청받은 적 없어 로고에 onClick/cursor-pointer를 붙이지 않는다(팀약어 텍스트만
    // 기존처럼 클릭 가능).
    const teamLogo = (slug: string, team: LeagueTeamRow | undefined) => (
        <span className="shrink-0">
            <TeamLogo teamId={slug} teamName={team?.team_abbr ?? slug} size="custom" className="w-8 h-8" shadow={false} />
        </span>
    );
    return (
        <h4 className="flex items-center gap-1.5">
            {teamLogo(game.awaySlug, awayTeam)}
            {teamSpan(game.awaySlug, awayTeam)}
            <ClickableText className="text-lg font-black text-white" onClick={onOpenGame}>
                {game.awayScore}-{game.homeScore}
            </ClickableText>
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
        <>
            <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                <ClickableText onClick={onPlayerClick}>{namePart}</ClickableText>
            </PlayerHoverCard>
            {rest}
        </>
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

    return (
        // "쿼터별 득점" 라벨 삭제(사용자 요청) — 테이블 자체(Q1~Q4/최종 헤더)로 충분히
        // 자명해서 별도 제목 불필요. w-full 대신 콘텐츠 폭에 맞춰 자연스럽게 줄어들도록
        // (본문(max-w-5xl) 너비까지 늘어나지 않고 컴팩트하게 유지).
        <div className="space-y-1">
            <Table variant="bare" density="compact" className="!w-fit text-sm text-slate-300">
                <TableHead>
                    <TableHeaderCell />
                    {Array.from({ length: periodCount }, (_, i) => (
                        <TableHeaderCell key={i}>{periodLabel(i)}</TableHeaderCell>
                    ))}
                    <TableHeaderCell>최종</TableHeaderCell>
                </TableHead>
                <TableBody>
                    <TableRow>
                        <LetterTeamCell slug={awaySlug} team={awayTeam} onOpenTeam={onOpenTeam} />
                        {Array.from({ length: periodCount }, (_, i) => (
                            <TableCell key={i} className="text-slate-200">{quarterScores.away[i] ?? '-'}</TableCell>
                        ))}
                        <TableCell className="font-bold text-white">{awayScore}</TableCell>
                    </TableRow>
                    <TableRow>
                        <LetterTeamCell slug={homeSlug} team={homeTeam} onOpenTeam={onOpenTeam} />
                        {Array.from({ length: periodCount }, (_, i) => (
                            <TableCell key={i} className="text-slate-200">{quarterScores.home[i] ?? '-'}</TableCell>
                        ))}
                        <TableCell className="font-bold text-white">{homeScore}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
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

// [2026-09-01] 사용자가 "실제 서비스 박스스코어(components/game/BoxScoreTable.tsx)와
// 디자인이 다르다"고 지적 — 조사해보니 이 컴포넌트는 그쪽을 재사용한 게 아니라
// components/common/Table.tsx(카드형 UI 테이블 프리미티브: rounded-xl+shadow+sticky
// 헤더)로 새로 만든 독자 구현이었다. 뉴스 레터 안에 카드 안의 카드가 겹치는 게
// 어색하다는 사용자 판단으로, 공용 컴포넌트로 통일하는 대신 카드 UI 자체를 걷어내고
// 순수 HTML <table> 텍스트 테이블로 간소화(테두리 없는 얇은 구분선만, 배경/그림자 없음)
// — 신문 박스스코어 같은 톤. 정렬 인터랙션 없음(선발 우선 + 출전시간 내림차순 고정).
// [2026-10-13] 그 "박스 없는 텍스트 표" 톤을 공용 Table의 `variant="bare" density="compact"`로
// 흡수해 다시 공용 컴포넌트로 돌아옴(docs/plan/ui-consolidation.md 6장 2번) — 모양은 유지,
// 구분선 색·셀 패딩·헤더 배경이 다른 표들과 한 곳(Table.tsx)에서 결정된다.
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
    // 인라인 style로 적용해 헤더 기본 글자색(text-slate-400)과 충돌 없이 항상 이김.
    const headerBg = team?.color_primary ?? '#1e293b';
    const headerFg = team?.color_text ?? getReadableTextColor(headerBg);

    return (
        <div className="space-y-2">
            <Table variant="bare" density="compact" className="text-sm text-slate-300">
                <TableHead noRow>
                    <tr className="h-8 text-sm font-bold" style={{ backgroundColor: headerBg }}>
                        <TableHeaderCell
                            align="left"
                            className="font-black"
                            style={{ color: headerFg }}
                            onClick={onOpenTeam ? () => onOpenTeam(teamSlug) : undefined}
                        >
                            <TeamHover teamId={onOpenTeam ? teamSlug : null}><span className={onOpenTeam ? 'cursor-pointer hover:underline' : ''}>{team?.team_name ?? teamSlug}</span></TeamHover>
                        </TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>POS</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>MIN</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>PTS</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>OREB</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>TREB</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>AST</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>STL</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>BLK</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>TOV</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>PF</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>FG</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>FG%</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>3P</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>3P%</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>FT</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>FT%</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>TS%</TableHeaderCell>
                        <TableHeaderCell style={{ color: headerFg }}>+/-</TableHeaderCell>
                    </tr>
                </TableHead>
                <TableBody>
                    {rows.map(p => {
                        const entry = playerCardMap.get(p.playerId);
                        const isHighlighted = p.playerId === highlightPlayerId;
                        return (
                            <TableRow
                                key={p.playerId}
                                onClick={onPlayerClick ? () => onPlayerClick(p.playerId) : undefined}
                                className={isHighlighted ? 'bg-amber-400/10' : ''}
                            >
                                <LetterPlayerCell name={p.playerName} entry={entry} muted />
                                <TableCell className="text-slate-500">{p.position ?? '-'}</TableCell>
                                <TableCell>{formatMinutesClock(p.mp) ?? Math.round(p.mp)}</TableCell>
                                <TableCell className="font-bold text-white">{p.pts}</TableCell>
                                <TableCell>{p.offReb}</TableCell>
                                <TableCell>{p.offReb + p.defReb}</TableCell>
                                <TableCell>{p.ast}</TableCell>
                                <TableCell>{p.stl}</TableCell>
                                <TableCell>{p.blk}</TableCell>
                                <TableCell>{p.tov}</TableCell>
                                <TableCell>{p.pf}</TableCell>
                                <TableCell>{p.fgm}/{p.fga}</TableCell>
                                <TableCell>{pct(p.fgm, p.fga)}</TableCell>
                                <TableCell>{p.p3m}/{p.p3a}</TableCell>
                                <TableCell>{pct(p.p3m, p.p3a)}</TableCell>
                                <TableCell>{p.ftm}/{p.fta}</TableCell>
                                <TableCell>{pct(p.ftm, p.fta)}</TableCell>
                                <TableCell>{tsPct(p.pts, p.fga, p.fta)}</TableCell>
                                <TableCell className={`font-bold ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                    {p.plusMinus > 0 ? '+' : ''}{p.plusMinus}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
                {/* 합계 행에 페이지 배경(bg-slate-900)보다 살짝 밝은 색을 깔아 테이블의
                    마무리를 시각적으로 구분(사용자 요청 — "완결성 부여"). TableFoot(bare)이 bg-slate-800/40 제공. */}
                <TableFoot>
                    <TableRow>
                        <TableCell align="left" className="font-bold text-white">합계</TableCell>
                        <TableCell className="font-bold text-white">-</TableCell>
                        {/* 합계 MIN(항상 5인×48분=240:00 고정값이라 정보량 없음) — 사용자 요청으로 비움 */}
                        <TableCell className="font-bold text-white" />
                        <TableCell className="font-bold text-white">{totals.pts}</TableCell>
                        <TableCell className="font-bold text-white">{totals.offReb}</TableCell>
                        <TableCell className="font-bold text-white">{totals.offReb + totals.defReb}</TableCell>
                        <TableCell className="font-bold text-white">{totals.ast}</TableCell>
                        <TableCell className="font-bold text-white">{totals.stl}</TableCell>
                        <TableCell className="font-bold text-white">{totals.blk}</TableCell>
                        <TableCell className="font-bold text-white">{totals.tov}</TableCell>
                        <TableCell className="font-bold text-white">{totals.pf}</TableCell>
                        <TableCell className="font-bold text-white">{totals.fgm}/{totals.fga}</TableCell>
                        <TableCell className="font-bold text-white">{pct(totals.fgm, totals.fga)}</TableCell>
                        <TableCell className="font-bold text-white">{totals.p3m}/{totals.p3a}</TableCell>
                        <TableCell className="font-bold text-white">{pct(totals.p3m, totals.p3a)}</TableCell>
                        <TableCell className="font-bold text-white">{totals.ftm}/{totals.fta}</TableCell>
                        <TableCell className="font-bold text-white">{pct(totals.ftm, totals.fta)}</TableCell>
                        <TableCell className="font-bold text-white">{tsPct(totals.pts, totals.fga, totals.fta)}</TableCell>
                        <TableCell className="font-bold text-slate-600">—</TableCell>
                    </TableRow>
                </TableFoot>
            </Table>
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
        <LetterShell
            title={<>
                <ClickableText onClick={onOpenTeam ? () => onOpenTeam(winnerSlug) : undefined} teamHoverId={winnerSlug}>
                    {titleNamePart}
                </ClickableText>
                {titleRest}
            </>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
            blurb={blurb}
        >
            {isBoxLoading ? (
                <Spinner variant="section" />
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
                        <LetterSectionTitle level="h4">박스스코어</LetterSectionTitle>
                        <TeamBoxTable team={teamBySlug.get(boxScore.awayTeamId)} teamSlug={boxScore.awayTeamId} box={boxScore.awayBox} playerCardMap={boxPlayerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
                        <TeamBoxTable team={teamBySlug.get(boxScore.homeTeamId)} teamSlug={boxScore.homeTeamId} box={boxScore.homeBox} playerCardMap={boxPlayerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
                    </div>
                </div>
            ) : event.gameId ? (
                <BoxScoreWaitNote />
            ) : null}
        </LetterShell>
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
        <LetterShell
            title={<HeadlineTitle
                headline={buildNewsTitle(event, teamBySlug) ?? event.headline} playerName={player.name} entry={entry}
                onPlayerClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
            />}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
            blurb={blurb}
        >
            {isBoxLoading ? (
                <Spinner variant="section" />
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
                <BoxScoreWaitNote />
            ) : null}
        </LetterShell>
    );
};

// FeatCard와 완전히 동일한 문서형 레이아웃(같은 "단일 경기에 묶인 개인 기록" 계열이라 일관성
// 유지) — 상단 배지만 "N경기 연속"으로 다름.
// [2026-09-02] "연속 기록 서신에서는 박스스코어를 빼고, 대신 연속 기록 리스트 자체를
// PTS/REB/AST/STL/BLK/TOV/PF/FG%/3P%/FT% 컬럼을 갖춘 테이블로 보여달라" 요청 — 이 경기
// 하나의 전체 박스스코어(양팀 전원)는 이 선수 개인의 연속 기록과 무관한 정보라 제거하고,
// 대신 연속 기록을 구성하는 "이 선수의" 경기별 스탯 라인을 테이블로 표시한다. 스타일은
// TeamBoxTable(박스스코어)과 동일한 톤(공용 Table bare/compact, pct(), 테두리 없는
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
        <LetterShell
            title={<HeadlineTitle
                headline={buildNewsTitle(event, teamBySlug) ?? event.headline} playerName={player.name} entry={entry}
                onPlayerClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
            />}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
            blurb={blurb}
        >
            {/* [2026-09-02] "연속기록 중인 모든 경기의 결과를 표시할 수 있나" 요청 — WinStreakCard의
                "연승 경기 기록" 리스트와 동일한 패턴. 동시에 여러 규칙(예: 20+득점 연속 + 10+리바운드
                연속)이 걸려 있으면 규칙별로 각각 테이블을 만든다(규칙마다 연속 길이/경기 구성이
                다를 수 있어서 — server/src/shared/leagueEvents.ts의 gamesForRule 참고). */}
            {streaks.filter(s => s.games.length > 0).map(s => (
                <div key={s.ruleKey} className="space-y-2">
                    <LetterSectionTitle level="h4">{s.label} 연속 기록</LetterSectionTitle>
                    <Table variant="bare" density="compact" className="text-sm text-slate-300">
                        <TableHead>
                            <TableHeaderCell align="left">날짜</TableHeaderCell>
                            <TableHeaderCell align="left">상대</TableHeaderCell>
                            <TableHeaderCell>PTS</TableHeaderCell>
                            <TableHeaderCell>REB</TableHeaderCell>
                            <TableHeaderCell>AST</TableHeaderCell>
                            <TableHeaderCell>STL</TableHeaderCell>
                            <TableHeaderCell>BLK</TableHeaderCell>
                            <TableHeaderCell>TOV</TableHeaderCell>
                            <TableHeaderCell>PF</TableHeaderCell>
                            <TableHeaderCell>FG%</TableHeaderCell>
                            <TableHeaderCell>3P%</TableHeaderCell>
                            <TableHeaderCell>FT%</TableHeaderCell>
                        </TableHead>
                        <TableBody>
                            {s.games.map(g => {
                                const homeTeam = teamBySlug.get(g.homeSlug);
                                const awayTeam = teamBySlug.get(g.awaySlug);
                                return (
                                    <TableRow key={g.gameId}>
                                        <TableCell align="left">{g.gameDate}</TableCell>
                                        <TableCell align="left">
                                            <TeamHover teamId={onOpenTeam ? g.awaySlug : null}><span
                                                className={`font-bold text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                                onClick={onOpenTeam ? () => onOpenTeam(g.awaySlug) : undefined}
                                            >
                                                {awayTeam?.team_abbr ?? g.awaySlug}
                                            </span></TeamHover>
                                            {' '}
                                            <span
                                                className={onOpenGame ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
                                                onClick={onOpenGame ? () => onOpenGame(g.gameId) : undefined}
                                            >
                                                {g.awayScore}-{g.homeScore}
                                            </span>
                                            {' '}
                                            <TeamHover teamId={onOpenTeam ? g.homeSlug : null}><span
                                                className={`font-bold text-slate-300 ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                                onClick={onOpenTeam ? () => onOpenTeam(g.homeSlug) : undefined}
                                            >
                                                {homeTeam?.team_abbr ?? g.homeSlug}
                                            </span></TeamHover>
                                        </TableCell>
                                        <TableCell className="font-bold text-white">{g.pts}</TableCell>
                                        <TableCell>{g.reb}</TableCell>
                                        <TableCell>{g.ast}</TableCell>
                                        <TableCell>{g.stl}</TableCell>
                                        <TableCell>{g.blk}</TableCell>
                                        <TableCell>{g.tov}</TableCell>
                                        <TableCell>{g.pf}</TableCell>
                                        <TableCell>{pct(g.fgm, g.fga)}</TableCell>
                                        <TableCell>{pct(g.p3m, g.p3a)}</TableCell>
                                        <TableCell>{pct(g.ftm, g.fta)}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            ))}
        </LetterShell>
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

    // [2026-09-01] "제목도 바리에이션" 요청 — 고정된", N연승 질주" 대신
    // buildNewsTitle()이 event.id 기반으로 매번 같은(결정론적) varied 제목을 만든다.
    // 이름 접두사는 항상 team?.team_name과 정확히 일치하도록 조립되므로(newsBlurb.ts)
    // 그 부분만 잘라 클릭 가능하게 유지. buildNewsTitle이 null이면(이론상만) 기존
    // 고정 문구로 폴백.
    const teamNameText = team?.team_name ?? teamSlug;
    const title = buildNewsTitle(event, teamBySlug) ?? `${teamNameText}, ${streak}연승 질주`;
    const titleRest = title.startsWith(teamNameText) ? title.slice(teamNameText.length) : `, ${streak}연승 질주`;

    return (
        <LetterShell
            title={<>
                <ClickableText onClick={onOpenTeam ? () => onOpenTeam(teamSlug) : undefined} teamHoverId={teamSlug}>
                    {teamNameText}
                </ClickableText>
                {titleRest}
            </>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
            blurb={blurb}
        >
            {games.length > 0 && (
                <div className="space-y-1">
                    <LetterSectionTitle level="h4">연승 경기 기록</LetterSectionTitle>
                    <div className="divide-y divide-slate-800/60">
                        {games.map(g => {
                            const homeTeam = teamBySlug.get(g.homeSlug);
                            const awayTeam = teamBySlug.get(g.awaySlug);
                            const mvpEntry = g.mvp ? playerCardMap.get(g.mvp.playerId) : undefined;
                            return (
                                <div key={g.gameId} className="flex items-center gap-2 py-2 text-sm">
                                    <span className="text-slate-500 shrink-0">{g.gameDate}</span>
                                    <ClickableText className="font-bold text-slate-300" onClick={onOpenTeam ? () => onOpenTeam(g.awaySlug) : undefined} teamHoverId={g.awaySlug}>
                                        {awayTeam?.team_abbr ?? g.awaySlug}
                                    </ClickableText>
                                    <span className="text-slate-300">{g.awayScore}-{g.homeScore}</span>
                                    <ClickableText className="font-bold text-slate-300" onClick={onOpenTeam ? () => onOpenTeam(g.homeSlug) : undefined} teamHoverId={g.homeSlug}>
                                        {homeTeam?.team_abbr ?? g.homeSlug}
                                    </ClickableText>
                                    {g.mvp && (
                                        <>
                                            <span className="text-slate-600">|</span>
                                            <PlayerHoverCard player={mvpEntry?.player} teamAbbr={mvpEntry?.teamAbbr}>
                                                <ClickableText className="font-bold text-slate-300" onClick={onPlayerClick ? () => onPlayerClick(g.mvp!.playerId) : undefined}>
                                                    {g.mvp.name}
                                                </ClickableText>
                                            </PlayerHoverCard>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </LetterShell>
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
            <ClickableText className="text-sm font-black text-slate-300" onClick={onOpenTeam ? () => onOpenTeam(teamSlug) : undefined} teamHoverId={teamSlug}>
                {team?.team_name ?? teamSlug}
                <span className="text-slate-500"> 방출 선수</span>
            </ClickableText>
            {/* w-full+table-fixed — 두 팀 테이블(teamA/teamB)이 같은 부모(space-y-4) 안에서
                항상 같은 전체 너비를 갖고(사용자 요청), 각 열의 너비도 선수 이름 길이 등
                콘텐츠와 무관하게 항상 동일한 비율로 고정되도록(후속 요청 — table-fixed
                없이는 브라우저가 각 테이블을 콘텐츠 기준으로 따로 계산해 두 테이블의 열
                경계가 서로 어긋나 보임). 긴 이름은 truncate로 한 줄 유지. */}
            <Table variant="bare" density="compact" tableStyle={{ tableLayout: 'fixed' }} className="text-sm text-slate-200">
                <TableHead noRow>
                    <tr className="h-8 text-sm font-bold" style={{ backgroundColor: headerBg }}>
                        <TableHeaderCell align="left" className="w-[32%]" style={{ color: headerFg }}>선수</TableHeaderCell>
                        <TableHeaderCell className="w-[13%]" style={{ color: headerFg }}>PTS</TableHeaderCell>
                        <TableHeaderCell className="w-[13%]" style={{ color: headerFg }}>REB</TableHeaderCell>
                        <TableHeaderCell className="w-[13%]" style={{ color: headerFg }}>AST</TableHeaderCell>
                        <TableHeaderCell className="w-[16%]" style={{ color: headerFg }}>연봉</TableHeaderCell>
                        <TableHeaderCell className="w-[13%]" style={{ color: headerFg }}>잔여연수</TableHeaderCell>
                    </tr>
                </TableHead>
                <TableBody>
                    {players.map(p => {
                        const entry = playerCardMap.get(p.id);
                        const salary = entry?.player?.salary;
                        const years = entry?.player?.contractYears;
                        const stats = entry?.player?.stats;
                        const g = stats?.g ?? 0;
                        return (
                            <TableRow key={p.id} onClick={onPlayerClick ? () => onPlayerClick(p.id) : undefined}>
                                <LetterPlayerCell name={p.name} entry={entry} muted className="truncate" />
                                <TableCell>{avgStat(stats?.pts ?? 0, g)}</TableCell>
                                <TableCell>{avgStat(stats?.reb ?? 0, g)}</TableCell>
                                <TableCell>{avgStat(stats?.ast ?? 0, g)}</TableCell>
                                <TableCell align="right" className="tabular-nums">{salary != null ? formatMoney(salary) : '-'}</TableCell>
                                <TableCell>{years != null ? `${years}년` : '-'}</TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
                {/* 합계 행에 페이지 배경보다 살짝 밝은 색을 깔아 테이블의 마무리를 시각적으로
                    구분(TeamBoxTable의 "완결성 부여" 요청과 동일 패턴 재사용). */}
                <TableFoot>
                    <TableRow>
                        <TableCell align="left" className="font-bold text-white">합계</TableCell>
                        <TableCell className="text-slate-600">—</TableCell>
                        <TableCell className="text-slate-600">—</TableCell>
                        <TableCell className="text-slate-600">—</TableCell>
                        <TableCell align="right" className="font-bold text-white tabular-nums">{formatMoney(totalSalary)}</TableCell>
                        <TableCell className="text-slate-600">—</TableCell>
                    </TableRow>
                </TableFoot>
            </Table>
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
        <ClickableText onClick={onOpenTeam ? () => onOpenTeam(slug) : undefined} teamHoverId={slug}>
            {team?.team_name ?? slug}
        </ClickableText>
    );

    return (
        <LetterShell
            title={<>{teamSpan(teamA.slug, a)} ↔ {teamSpan(teamB.slug, b)} 트레이드 성사</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
            blurb={blurb}
        >
            <div className="space-y-4">
                <TradePlayerTable team={a} teamSlug={teamA.slug} players={aOut} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
                <TradePlayerTable team={b} teamSlug={teamB.slug} players={bOut} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
            </div>
        </LetterShell>
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
        <LetterShell
            title={<HeadlineTitle
                headline={buildNewsTitle(event, teamBySlug) ?? event.headline} playerName={player.name} entry={entry}
                onPlayerClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
            />}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
            blurb={blurb}
        >
            <Table variant="bare" density="compact" className="text-sm text-slate-300">
                <TableHead>
                    <TableHeaderCell align="left">선수</TableHeaderCell>
                    <TableHeaderCell>소속팀</TableHeaderCell>
                    <TableHeaderCell>부상명</TableHeaderCell>
                    <TableHeaderCell>예상 결장</TableHeaderCell>
                    <TableHeaderCell>복귀 예정일</TableHeaderCell>
                </TableHead>
                <TableBody>
                    <TableRow>
                        <LetterPlayerCell name={player.name} entry={entry} onClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined} />
                        <TableCell>
                            <TeamHover teamId={onOpenTeam ? teamSlug : null}><span
                                className={onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
                                onClick={onOpenTeam ? () => onOpenTeam(teamSlug) : undefined}
                            >
                                {team?.team_name ?? teamSlug}
                            </span></TeamHover>
                        </TableCell>
                        <TableCell>{injuryType}</TableCell>
                        <TableCell>{duration}</TableCell>
                        <TableCell>{formatFullDateCell(returnDate)}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </LetterShell>
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
        <LetterShell
            title={title}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
            blurb={blurb}
        >
            <Table variant="bare" density="compact" className="text-sm text-slate-300">
                <TableHead>
                    <TableHeaderCell align="left">선수</TableHeaderCell>
                    <TableHeaderCell>소속팀</TableHeaderCell>
                    <TableHeaderCell>출장정지</TableHeaderCell>
                    <TableHeaderCell>복귀 예정일</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {rows.map(row => {
                        const entry = playerCardMap.get(row.player.id);
                        const team = teamBySlug.get(row.teamSlug);
                        return (
                            <TableRow key={row.player.id}>
                                <LetterPlayerCell name={row.player.name} entry={entry} onClick={onPlayerClick ? () => onPlayerClick(row.player.id) : undefined} />
                                <TableCell>
                                    <TeamHover teamId={onOpenTeam ? row.teamSlug : null}><span
                                        className={onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}
                                        onClick={onOpenTeam ? () => onOpenTeam(row.teamSlug) : undefined}
                                    >
                                        {team?.team_name ?? row.teamSlug}
                                    </span></TeamHover>
                                </TableCell>
                                <TableCell>{row.games}경기</TableCell>
                                <TableCell>{formatFullDateCell(row.returnDate)}</TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </LetterShell>
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
        <ClickableText onClick={onOpenTeam ? () => onOpenTeam(slug) : undefined} teamHoverId={slug}>
            {teamBySlug.get(slug)?.team_name ?? name}
        </ClickableText>
    );

    return (
        <LetterShell
            title={<>{Number(y)}년 {Number(m)}월 파워랭킹</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
            blurb={blurb}
        >
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

            <Table variant="bare" density="compact" tableStyle={{ tableLayout: 'fixed' }} className="text-sm text-slate-200">
                <TableHead>
                    <TableHeaderCell width="8%">순위</TableHeaderCell>
                    <TableHeaderCell align="left" width="44%">팀</TableHeaderCell>
                    <TableHeaderCell width="12%">재능</TableHeaderCell>
                    <TableHeaderCell width="12%">공격</TableHeaderCell>
                    <TableHeaderCell width="12%">수비</TableHeaderCell>
                    <TableHeaderCell width="12%">파워스코어</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {full.map(entry => (
                        <TableRow key={entry.teamSlug}>
                            <LetterRankCell rank={entry.rank} />
                            <TableCell align="left">
                                <div className="flex items-center gap-2">
                                    <TeamMark variant="logo" teamId={entry.teamSlug} teamName={entry.teamName} size="xs" />
                                    <span className="text-sm font-semibold text-slate-100 truncate">{teamSpan(entry.teamSlug, entry.teamName)}</span>
                                </div>
                            </TableCell>
                            <TableCell className="tabular-nums">{entry.talentScore?.toFixed(1) ?? '-'}</TableCell>
                            <TableCell className="tabular-nums">{entry.offenseScore?.toFixed(1) ?? '-'}</TableCell>
                            <TableCell className="tabular-nums">{entry.defenseScore?.toFixed(1) ?? '-'}</TableCell>
                            <TableCell className="font-bold text-white tabular-nums">{entry.powerScore.toFixed(1)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </LetterShell>
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
        <LetterShell
            title="드래프트 순서 추첨 결과"
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            {firstPick && (
                <p className="text-sm text-slate-300 leading-relaxed">
                    전체 1순위 지명권은{' '}
                    <ClickableText className="font-bold text-white" onClick={onOpenTeam ? () => onOpenTeam(firstPick.teamSlug) : undefined} teamHoverId={firstPick.teamSlug}>
                        {teamBySlug.get(firstPick.teamSlug)?.team_name ?? firstPick.teamName}
                    </ClickableText>
                    {' '}팀에게 돌아갔습니다.
                </p>
            )}

            <Table variant="bare" density="compact" tableStyle={{ tableLayout: 'fixed' }} className="text-sm text-slate-200">
                <TableHead>
                    <TableHeaderCell width="15%">순위</TableHeaderCell>
                    <TableHeaderCell align="left" width="85%">팀</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {picks.map(pick => (
                        <TableRow key={pick.rank}>
                            <LetterRankCell rank={pick.rank} />
                            <TableCell align="left">
                                <div className="flex items-center gap-2">
                                    <TeamMark variant="logo" teamId={pick.teamSlug} teamName={pick.teamName} size="xs" />
                                    <TeamHover teamId={onOpenTeam ? pick.teamSlug : null}><span
                                        className={`text-sm font-semibold text-slate-100 truncate ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onOpenTeam ? () => onOpenTeam(pick.teamSlug) : undefined}
                                    >
                                        {teamBySlug.get(pick.teamSlug)?.team_name ?? pick.teamName}
                                    </span></TeamHover>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </LetterShell>
    );
};

// ── draft_result — 드래프트 완료 직후 게시되는 서신(server/src/postDraftResultNews.ts).
// 1라운드 지명 전체를 표로 보여주고, 전체 라운드는 "드래프트 결과" 화면(/season/draft-result)으로 안내한다.
export const DraftResultCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void; onOpenDraftResult?: () => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick, onOpenDraftResult }) => {
    if (event.detail.kind !== 'draft_result') return null;
    const { picks, rounds, totalPicks } = event.detail;
    const first = picks[0];
    const firstTeam = first ? teamBySlug.get(first.teamSlug) : undefined;

    return (
        <LetterShell
            title="드래프트 결과"
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            {first && (
                <p className="text-sm text-slate-300 leading-relaxed">
                    전체 1순위 지명은{' '}
                    <ClickableText className="font-bold text-white" onClick={onOpenTeam ? () => onOpenTeam(first.teamSlug) : undefined} teamHoverId={first.teamSlug}>
                        {firstTeam?.team_name ?? first.teamName}
                    </ClickableText>
                    {' '}의{' '}
                    <PlayerHoverCard player={playerCardMap.get(first.playerId)?.player} teamAbbr={playerCardMap.get(first.playerId)?.teamAbbr}>
                        <ClickableText className="font-bold text-white" onClick={onPlayerClick ? () => onPlayerClick(first.playerId) : undefined}>
                            {first.playerName}
                        </ClickableText>
                    </PlayerHoverCard>
                    {' '}선수였습니다. 총 {rounds}라운드 {totalPicks}명의 지명이 마무리되었습니다.
                </p>
            )}

            <LetterSectionTitle level="h3">1라운드 지명 결과</LetterSectionTitle>
            <Table variant="bare" density="compact" tableStyle={{ tableLayout: 'fixed' }} className="text-sm text-slate-200">
                <TableHead>
                    <TableHeaderCell width="10%">순위</TableHeaderCell>
                    <TableHeaderCell align="left" width="30%">팀</TableHeaderCell>
                    <TableHeaderCell align="left" width="40%">선수</TableHeaderCell>
                    <TableHeaderCell width="10%">포지션</TableHeaderCell>
                    <TableHeaderCell width="10%">OVR</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {picks.map(pick => (
                        <TableRow key={pick.pick}>
                            <LetterRankCell rank={pick.pick} />
                            <TableCell align="left">
                                <div className="flex items-center gap-2 min-w-0">
                                    <TeamMark variant="logo" teamId={pick.teamSlug} teamName={pick.teamName} size="xs" />
                                    <TeamHover teamId={onOpenTeam ? pick.teamSlug : null}><span
                                        className={`text-sm font-semibold text-slate-100 truncate ${onOpenTeam ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                                        onClick={onOpenTeam ? () => onOpenTeam(pick.teamSlug) : undefined}
                                    >
                                        {teamBySlug.get(pick.teamSlug)?.team_name ?? pick.teamName}
                                    </span></TeamHover>
                                </div>
                            </TableCell>
                            <LetterPlayerCell
                                name={pick.playerName}
                                entry={playerCardMap.get(pick.playerId)}
                                onClick={onPlayerClick ? () => onPlayerClick(pick.playerId) : undefined}
                                className="truncate"
                            />
                            <TableCell className="text-slate-400">{pick.position}</TableCell>
                            <TableCell><div className="flex justify-center"><OvrBadge value={pick.ovr} size="sm" className="!shadow-none" /></div></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {onOpenDraftResult && totalPicks > picks.length && (
                <LetterLink onClick={onOpenDraftResult}>전체 라운드 결과 보기</LetterLink>
            )}
        </LetterShell>
    );
};

// ── mvp_award / dpoy_award — 정규시즌 종료 1일 후 발표되는 개인상(server/src/postSeasonAwards.ts).
// PowerRankingCard와 동일한 레터 구조(헤더+날짜+구분선→표)를 따르되, 파워랭킹의 AI 기사체
// 문단(newsBlurb.ts)은 생략하고 트로피 히어로+순위표 중심으로 구성. 둘 다 팀 로고 없이 약어
// 텍스트만, 포지션은 별도 컬럼, 순위별(1~N위) 득표수 컬럼을 각각 갖는 전용 마크업.

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
                    <ClickableText className="text-lg font-black text-white" onClick={onPlayerClick ? () => onPlayerClick(winner.playerId) : undefined}>
                        {winner.playerName}
                    </ClickableText>
                </PlayerHoverCard>
                <span className="ml-2 text-sm text-slate-500">{winner.position}</span>
            </div>
            <div>
                <ClickableText className="text-sm font-bold text-slate-400" onClick={onOpenTeam ? () => onOpenTeam(winner.teamSlug) : undefined} teamHoverId={winner.teamSlug}>
                    {winnerTeam?.team_name ?? winner.teamSlug}
                </ClickableText>
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
        <LetterShell
            title={<>{season} 정규시즌 올해의 선수</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
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

            <Table variant="bare" density="compact" className="text-sm text-slate-300">
                <TableHead>
                    <TableHeaderCell>순위</TableHeaderCell>
                    <TableHeaderCell align="left">선수</TableHeaderCell>
                    <TableHeaderCell>포지션</TableHeaderCell>
                    <TableHeaderCell align="left">팀</TableHeaderCell>
                    <TableHeaderCell>PPG</TableHeaderCell>
                    <TableHeaderCell>RPG</TableHeaderCell>
                    <TableHeaderCell>APG</TableHeaderCell>
                    <TableHeaderCell>SPG</TableHeaderCell>
                    <TableHeaderCell>BPG</TableHeaderCell>
                    <TableHeaderCell>FG%</TableHeaderCell>
                    <TableHeaderCell>3P%</TableHeaderCell>
                    <TableHeaderCell>FT%</TableHeaderCell>
                    <TableHeaderCell>1위</TableHeaderCell>
                    <TableHeaderCell>2위</TableHeaderCell>
                    <TableHeaderCell>3위</TableHeaderCell>
                    <TableHeaderCell>4위</TableHeaderCell>
                    <TableHeaderCell>5위</TableHeaderCell>
                    <TableHeaderCell>득표</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {ranking.map((r, idx) => {
                        const entry = playerCardMap.get(r.playerId);
                        const votes = r.rankVotes;
                        return (
                            <TableRow key={r.playerId}>
                                <LetterRankCell rank={idx + 1} />
                                <LetterPlayerCell name={r.playerName} entry={entry} onClick={onPlayerClick ? () => onPlayerClick(r.playerId) : undefined} />
                                <TableCell className="tabular-nums text-slate-500">{r.position}</TableCell>
                                <LetterTeamCell slug={r.teamSlug} team={teamBySlug.get(r.teamSlug)} onOpenTeam={onOpenTeam} />
                                <TableCell className="tabular-nums">{r.ppg.toFixed(1)}</TableCell>
                                <TableCell className="tabular-nums">{r.rpg.toFixed(1)}</TableCell>
                                <TableCell className="tabular-nums">{r.apg.toFixed(1)}</TableCell>
                                <TableCell className="tabular-nums">{r.spg.toFixed(1)}</TableCell>
                                <TableCell className="tabular-nums">{r.bpg.toFixed(1)}</TableCell>
                                <TableCell className="tabular-nums">{formatAwardPct(r.fgPct)}</TableCell>
                                <TableCell className="tabular-nums">{formatAwardPct(r.p3Pct)}</TableCell>
                                <TableCell className="tabular-nums">{formatAwardPct(r.ftPct)}</TableCell>
                                <TableCell className="tabular-nums">{votes[0] ?? 0}</TableCell>
                                <TableCell className="tabular-nums">{votes[1] ?? 0}</TableCell>
                                <TableCell className="tabular-nums">{votes[2] ?? 0}</TableCell>
                                <TableCell className="tabular-nums">{votes[3] ?? 0}</TableCell>
                                <TableCell className="tabular-nums">{votes[4] ?? 0}</TableCell>
                                <TableCell className="tabular-nums font-bold text-white">{r.points}</TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </LetterShell>
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
        <LetterShell
            title={<>{season} 정규시즌 올해의 수비수</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
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

            <Table variant="bare" density="compact" className="text-sm text-slate-300">
                <TableHead>
                    <TableHeaderCell>순위</TableHeaderCell>
                    <TableHeaderCell align="left">선수</TableHeaderCell>
                    <TableHeaderCell>포지션</TableHeaderCell>
                    <TableHeaderCell align="left">팀</TableHeaderCell>
                    <TableHeaderCell>SPG</TableHeaderCell>
                    <TableHeaderCell>BPG</TableHeaderCell>
                    <TableHeaderCell>TOVF</TableHeaderCell>
                    <TableHeaderCell>DREB</TableHeaderCell>
                    <TableHeaderCell>OREB</TableHeaderCell>
                    <TableHeaderCell>DFG%</TableHeaderCell>
                    <TableHeaderCell>1위</TableHeaderCell>
                    <TableHeaderCell>2위</TableHeaderCell>
                    <TableHeaderCell>3위</TableHeaderCell>
                    <TableHeaderCell>득표</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {ranking.map((r, idx) => {
                        const entry = playerCardMap.get(r.playerId);
                        const votes = r.rankVotes;
                        return (
                            <TableRow key={r.playerId}>
                                <LetterRankCell rank={idx + 1} />
                                <LetterPlayerCell name={r.playerName} entry={entry} onClick={onPlayerClick ? () => onPlayerClick(r.playerId) : undefined} />
                                <TableCell className="tabular-nums text-slate-500">{r.position}</TableCell>
                                <LetterTeamCell slug={r.teamSlug} team={teamBySlug.get(r.teamSlug)} onOpenTeam={onOpenTeam} />
                                <TableCell className="tabular-nums">{r.spg.toFixed(1)}</TableCell>
                                <TableCell className="tabular-nums">{r.bpg.toFixed(1)}</TableCell>
                                <TableCell className="tabular-nums">{r.tovfpg.toFixed(1)}</TableCell>
                                <TableCell className="tabular-nums">{r.drebpg.toFixed(1)}</TableCell>
                                <TableCell className="tabular-nums">{r.orebpg.toFixed(1)}</TableCell>
                                <TableCell className="tabular-nums">{formatAwardPct(r.dfgPct)}</TableCell>
                                <TableCell className="tabular-nums">{votes[0] ?? 0}</TableCell>
                                <TableCell className="tabular-nums">{votes[1] ?? 0}</TableCell>
                                <TableCell className="tabular-nums">{votes[2] ?? 0}</TableCell>
                                <TableCell className="tabular-nums font-bold text-white">{r.points}</TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </LetterShell>
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
        <LetterSectionTitle>{tierLabel}</LetterSectionTitle>
        <Table variant="bare" density="compact" className="text-sm text-slate-300">
            <TableHead>
                <TableHeaderCell>포지션</TableHeaderCell>
                <TableHeaderCell align="left">선수</TableHeaderCell>
                <TableHeaderCell align="left">팀</TableHeaderCell>
                {statCols.map(c => <TableHeaderCell key={c.label}>{c.label}</TableHeaderCell>)}
            </TableHead>
            <TableBody>
                {tier.players.map(p => {
                    const entry = playerCardMap.get(p.playerId);
                    return (
                        <TableRow key={p.playerId}>
                            <TableCell className="tabular-nums text-slate-500">{p.pos}</TableCell>
                            <LetterPlayerCell name={p.playerName} entry={entry} onClick={onPlayerClick ? () => onPlayerClick(p.playerId) : undefined} />
                            <LetterTeamCell slug={p.teamSlug} team={teamBySlug.get(p.teamSlug)} onOpenTeam={onOpenTeam} />
                            {statCols.map(c => (
                                <TableCell key={c.label} className="tabular-nums">{c.get(p)}</TableCell>
                            ))}
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
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
        <LetterShell
            title={<>{season} 올-오펜시브 팀</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
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
        </LetterShell>
    );
};

export const AllDefTeamCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
}> = ({ event, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => {
    if (event.detail.kind !== 'all_def_team') return null;
    const { season, tiers } = event.detail;
    return (
        <LetterShell
            title={<>{season} 올-디펜시브 팀</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
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
        </LetterShell>
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
        <LetterSectionTitle logoSrc={logoSrc}>{label}</LetterSectionTitle>
        <Table variant="bare" density="compact" className="text-sm text-slate-300">
            <TableHead>
                <TableHeaderCell>포지션</TableHeaderCell>
                {showOvr && <TableHeaderCell>OVR</TableHeaderCell>}
                <TableHeaderCell align="left">선수</TableHeaderCell>
                <TableHeaderCell align="left">팀</TableHeaderCell>
                {showStats && (
                    <>
                        <TableHeaderCell>G</TableHeaderCell>
                        <TableHeaderCell>MP</TableHeaderCell>
                        <TableHeaderCell>PTS</TableHeaderCell>
                        <TableHeaderCell>REB</TableHeaderCell>
                        <TableHeaderCell>AST</TableHeaderCell>
                        <TableHeaderCell>STL</TableHeaderCell>
                        <TableHeaderCell>BLK</TableHeaderCell>
                        <TableHeaderCell>TOV</TableHeaderCell>
                        <TableHeaderCell>FG%</TableHeaderCell>
                    </>
                )}
                {showVotes && (
                    <>
                        <TableHeaderCell>득표수</TableHeaderCell>
                        <TableHeaderCell>득표율</TableHeaderCell>
                    </>
                )}
            </TableHead>
            <TableBody>
                {players.map(p => {
                    const entry = playerCardMap.get(p.playerId);
                    const stats = entry?.player?.stats;
                    const g = stats?.g ?? 0;
                    const perGame = (total: number | undefined) => (g > 0 ? ((total ?? 0) / g).toFixed(1) : '0.0');
                    const shootPct = (made: number | undefined, att: number | undefined) =>
                        (att ?? 0) > 0 ? formatAwardPct((made ?? 0) / (att as number)) : '-';
                    return (
                        <TableRow key={p.playerId}>
                            <TableCell className="tabular-nums text-slate-500">{p.posGroup}</TableCell>
                            {showOvr && (
                                <TableCell>
                                    <div className="flex justify-center">
                                        <OvrBadge value={p.ovr} size="sm" className="shadow-none" />
                                    </div>
                                </TableCell>
                            )}
                            <LetterPlayerCell name={p.playerName} entry={entry} onClick={onPlayerClick ? () => onPlayerClick(p.playerId) : undefined} />
                            <LetterTeamCell slug={p.teamSlug} team={teamBySlug.get(p.teamSlug)} onOpenTeam={onOpenTeam} logo />
                            {showStats && (
                                <>
                                    <TableCell className="tabular-nums">{g}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.mp)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.pts)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.reb)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.ast)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.stl)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.blk)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.tov)}</TableCell>
                                    <TableCell className="tabular-nums">{shootPct(stats?.fgm, stats?.fga)}</TableCell>
                                </>
                            )}
                            {showVotes && (
                                <>
                                    <TableCell className="tabular-nums">{(p.votes ?? 0).toLocaleString()}</TableCell>
                                    <TableCell className="tabular-nums text-white">{p.pct != null ? formatAwardPct(p.pct) : '-'}</TableCell>
                                </>
                            )}
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
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
        {!hideLabel && <LetterSectionTitle>{label}</LetterSectionTitle>}
        <Table variant="bare" density="compact" className={`text-sm text-slate-300 ${scrollable ? 'overflow-y-auto max-h-96' : ''}`}>
            <TableHead className={scrollable ? 'sticky top-0 z-10' : ''}>
                <TableHeaderCell>순위</TableHeaderCell>
                <TableHeaderCell align="left">선수</TableHeaderCell>
                <TableHeaderCell align="left">팀</TableHeaderCell>
                {showStats && (
                    <>
                        <TableHeaderCell>G</TableHeaderCell>
                        <TableHeaderCell>MP</TableHeaderCell>
                        <TableHeaderCell>PTS</TableHeaderCell>
                        <TableHeaderCell>REB</TableHeaderCell>
                        <TableHeaderCell>AST</TableHeaderCell>
                        <TableHeaderCell>STL</TableHeaderCell>
                        <TableHeaderCell>BLK</TableHeaderCell>
                        <TableHeaderCell>TOV</TableHeaderCell>
                        <TableHeaderCell>FG%</TableHeaderCell>
                    </>
                )}
                {showVotes && (
                    <>
                        <TableHeaderCell>득표수</TableHeaderCell>
                        <TableHeaderCell>득표율</TableHeaderCell>
                    </>
                )}
            </TableHead>
            <TableBody>
                {entries.map((e, idx) => {
                    const entry = playerCardMap.get(e.playerId);
                    const stats = entry?.player?.stats;
                    const g = stats?.g ?? 0;
                    const perGame = (total: number | undefined) => (g > 0 ? ((total ?? 0) / g).toFixed(1) : '0.0');
                    const shootPct = (made: number | undefined, att: number | undefined) =>
                        (att ?? 0) > 0 ? formatAwardPct((made ?? 0) / (att as number)) : '-';
                    return (
                        <TableRow key={e.playerId}>
                            <LetterRankCell rank={idx + 1} />
                            <LetterPlayerCell name={e.playerName} entry={entry} onClick={onPlayerClick ? () => onPlayerClick(e.playerId) : undefined} />
                            <LetterTeamCell slug={e.teamSlug} team={teamBySlug.get(e.teamSlug)} onOpenTeam={onOpenTeam} logo />
                            {showStats && (
                                <>
                                    <TableCell className="tabular-nums">{g}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.mp)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.pts)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.reb)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.ast)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.stl)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.blk)}</TableCell>
                                    <TableCell className="tabular-nums">{perGame(stats?.tov)}</TableCell>
                                    <TableCell className="tabular-nums">{shootPct(stats?.fgm, stats?.fga)}</TableCell>
                                </>
                            )}
                            {showVotes && (
                                <>
                                    <TableCell className="tabular-nums">{(e.votes ?? 0).toLocaleString()}</TableCell>
                                    <TableCell className="tabular-nums text-white">{e.pct != null ? formatAwardPct(e.pct) : '-'}</TableCell>
                                </>
                            )}
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
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
        <LetterShell
            title={<>올스타 팬 투표 {roundLabel}</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <EventLetterLogo src={getLeagueLogoUrl('AllStar')} alt="올스타" />
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
                <LetterLink onClick={() => onOpenAllStar()}>
                    {voteProgress >= 1 ? '올스타 투표 결과 보러가기' : '올스타 투표 현황 보러가기'}
                </LetterLink>
            )}
        </LetterShell>
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
        <LetterShell
            title="올스타 팬 투표가 시작됐습니다"
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <div className="space-y-2">
                <EventLetterLogo src={getLeagueLogoUrl('AllStar')} alt="올스타" />
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
                <LetterLink onClick={() => onOpenAllStar()}>
                    올스타 투표 현황 보러가기
                </LetterLink>
            )}
        </LetterShell>
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
        <LetterShell
            title={<>{seasonLabel}시즌 올스타 명단이 확정됐습니다</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <div className="space-y-2">
                <EventLetterLogo src={getLeagueLogoUrl('AllStar')} alt="올스타" />
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
                    <img src={getLeagueLogoUrl('East')} alt="" className="h-6 w-6" />
                    동부 컨퍼런스
                </h2>
                <AllstarRosterTable label="스타터" players={east.starters} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showVotes showStats />
                <AllstarRosterTable label="리저브" players={east.reserves} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showVotes showStats />
            </div>
            <div className="space-y-4">
                <h2 className="flex items-center gap-1.5 text-base font-black text-indigo-400">
                    <img src={getLeagueLogoUrl('West')} alt="" className="h-6 w-6" />
                    서부 컨퍼런스
                </h2>
                <AllstarRosterTable label="스타터" players={west.starters} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showVotes showStats />
                <AllstarRosterTable label="리저브" players={west.reserves} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showVotes showStats />
            </div>
            {onOpenAllStar && (
                <LetterLink onClick={() => onOpenAllStar()}>
                    올스타 투표 결과 보러가기
                </LetterLink>
            )}
        </LetterShell>
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
        <LetterShell
            title={<>{seasonLabel}시즌 라이징스타 챌린지 명단이 확정됐습니다</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <div className="space-y-2">
                <EventLetterLogo src={getLeagueLogoUrl('RisingStar')} alt="라이징스타" />
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
                <AllstarRosterTable label={`팀 ${teamAName}`} players={teamA} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showStats logoSrc={getLeagueLogoUrl('RisingA')} />
                <AllstarRosterTable label={`팀 ${teamBName}`} players={teamB} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showOvr showStats logoSrc={getLeagueLogoUrl('RisingB')} />
            </div>
            {onOpenAllStar && (
                <LetterLink onClick={() => onOpenAllStar('risingstars')}>
                    올스타 화면 라이징스타 탭에서 보러가기
                </LetterLink>
            )}
        </LetterShell>
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
    <Table variant="bare" density="compact" className="text-sm text-slate-300">
        <TableHead>
            <TableHeaderCell>순위</TableHeaderCell>
            <TableHeaderCell>OVR</TableHeaderCell>
            <TableHeaderCell align="left">선수</TableHeaderCell>
            <TableHeaderCell align="left">팀</TableHeaderCell>
            <TableHeaderCell>G</TableHeaderCell>
            <TableHeaderCell>MP</TableHeaderCell>
            <TableHeaderCell>PTS</TableHeaderCell>
            <TableHeaderCell>3PM</TableHeaderCell>
            <TableHeaderCell>3PA</TableHeaderCell>
            <TableHeaderCell>3P%</TableHeaderCell>
            <TableHeaderCell>CNR%</TableHeaderCell>
            <TableHeaderCell>45%</TableHeaderCell>
            <TableHeaderCell>ATB%</TableHeaderCell>
            <TableHeaderCell>TS%</TableHeaderCell>
        </TableHead>
        <TableBody>
            {participants.map((p, idx) => {
                const entry = playerCardMap.get(p.playerId);
                const stats = entry?.player?.stats;
                const g = stats?.g ?? 0;
                const perGame = (total: number | undefined) => (g > 0 ? ((total ?? 0) / g).toFixed(1) : '0.0');
                const cnrPct = threePointZonePct(stats, ['zone_c3_l_m', 'zone_c3_r_m'], ['zone_c3_l_a', 'zone_c3_r_a']);
                const p45Pct = threePointZonePct(stats, ['zone_atb3_l_m', 'zone_atb3_r_m'], ['zone_atb3_l_a', 'zone_atb3_r_a']);
                const atbPct = threePointZonePct(stats, ['zone_atb3_c_m'], ['zone_atb3_c_a']);
                const tsa = (stats?.fga ?? 0) + 0.44 * (stats?.fta ?? 0);
                const tsPct = tsa > 0 ? (stats?.pts ?? 0) / (2 * tsa) : 0;
                return (
                    <TableRow key={p.playerId}>
                        <LetterRankCell rank={idx + 1} />
                        <TableCell>
                            <div className="flex justify-center">
                                <OvrBadge value={p.ovr} size="sm" className="shadow-none" />
                            </div>
                        </TableCell>
                        <LetterPlayerCell name={p.playerName} entry={entry} onClick={onPlayerClick ? () => onPlayerClick(p.playerId) : undefined} />
                        <LetterTeamCell slug={p.teamSlug} team={teamBySlug.get(p.teamSlug)} onOpenTeam={onOpenTeam} logo />
                        <TableCell className="tabular-nums">{g}</TableCell>
                        <TableCell className="tabular-nums">{perGame(stats?.mp)}</TableCell>
                        <TableCell className="tabular-nums">{perGame(stats?.pts)}</TableCell>
                        <TableCell className="tabular-nums">{perGame(stats?.p3m)}</TableCell>
                        <TableCell className="tabular-nums">{perGame(stats?.p3a)}</TableCell>
                        <TableCell className="tabular-nums">{(stats?.p3a ?? 0) > 0 ? formatAwardPct((stats?.p3m ?? 0) / (stats!.p3a)) : '-'}</TableCell>
                        <TableCell className="tabular-nums">{formatAwardPct(cnrPct)}</TableCell>
                        <TableCell className="tabular-nums">{formatAwardPct(p45Pct)}</TableCell>
                        <TableCell className="tabular-nums">{formatAwardPct(atbPct)}</TableCell>
                        <TableCell className="tabular-nums">{formatAwardPct(tsPct)}</TableCell>
                    </TableRow>
                );
            })}
        </TableBody>
    </Table>
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
        <LetterShell
            title={<>{seasonLabel}시즌 3점 챌린지 참가자 명단이 확정됐습니다</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <div className="space-y-2">
                <EventLetterLogo src={getLeagueLogoUrl('ThreeContest')} alt="3점 컨테스트" />
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
                <LetterSectionTitle>참가자</LetterSectionTitle>
                <ThreePointContestTable participants={participants} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />
            </div>
            {onOpenAllStar && (
                <LetterLink onClick={() => onOpenAllStar('threept')}>
                    올스타 화면 3점 컨테스트 탭에서 보러가기
                </LetterLink>
            )}
        </LetterShell>
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
    <Table variant="bare" density="compact" className="text-sm text-slate-300">
        <TableHead>
            <TableHeaderCell>순위</TableHeaderCell>
            <TableHeaderCell align="left">선수</TableHeaderCell>
            <TableHeaderCell align="left">팀</TableHeaderCell>
            <TableHeaderCell>좌측 코너</TableHeaderCell>
            <TableHeaderCell>좌측 45도</TableHeaderCell>
            <TableHeaderCell>중앙</TableHeaderCell>
            <TableHeaderCell>우측 45도</TableHeaderCell>
            <TableHeaderCell>우측 코너</TableHeaderCell>
            <TableHeaderCell>합계</TableHeaderCell>
        </TableHead>
        <TableBody>
            {entries.map((e, idx) => {
                const entry = playerCardMap.get(e.playerId);
                const isHighlighted = e.playerId === highlightPlayerId;
                return (
                    <TableRow key={e.playerId} className={isHighlighted ? 'bg-amber-400/10' : ''}>
                        <LetterRankCell rank={idx + 1} />
                        <LetterPlayerCell name={e.playerName} entry={entry} onClick={onPlayerClick ? () => onPlayerClick(e.playerId) : undefined} />
                        <LetterTeamCell slug={e.teamSlug} team={teamBySlug.get(e.teamSlug)} onOpenTeam={onOpenTeam} logo />
                        {e.rackScores.map((s, i) => <TableCell key={i} className="tabular-nums">{s}</TableCell>)}
                        <TableCell className="tabular-nums font-bold text-white">{e.total}</TableCell>
                    </TableRow>
                );
            })}
        </TableBody>
    </Table>
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
                <SegmentedControl<'round1' | 'round2'>
                    size="md"
                    value={selectedRound}
                    onChange={setSelectedRound}
                    options={[{ value: 'round2', label: '결선' }, { value: 'round1', label: '예선' }]}
                    className="w-fit"
                />
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
        <LetterShell
            title={<>{seasonLabel}시즌 3점 챌린지 결과가 발표됐습니다</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <div className="space-y-2">
                <EventLetterLogo src={getLeagueLogoUrl('ThreeContest')} alt="3점 컨테스트" />
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
                    <LetterSectionTitle>샷차트</LetterSectionTitle>
                    <ThreePointContestShotChart round1={round1} round2={round2} winnerId={winnerId} />
                </div>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <LetterSectionTitle>결선 (상위 3명)</LetterSectionTitle>
                        <ThreePointContestResultTable entries={round2} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} highlightPlayerId={winnerId} />
                    </div>
                    <div className="space-y-2">
                        <LetterSectionTitle>예선 (8명)</LetterSectionTitle>
                        <ThreePointContestResultTable entries={round1} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />
                    </div>
                </div>
            </div>
            {onOpenAllStar && (
                <LetterLink onClick={() => onOpenAllStar('threept')}>
                    올스타 화면 3점 컨테스트 탭에서 보러가기
                </LetterLink>
            )}
        </LetterShell>
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
    <Table variant="bare" density="compact" className="text-sm text-slate-300">
        <TableHead>
            <TableHeaderCell>순위</TableHeaderCell>
            <TableHeaderCell align="left">선수</TableHeaderCell>
            <TableHeaderCell align="left">팀</TableHeaderCell>
            <TableHeaderCell>덩크 1</TableHeaderCell>
            <TableHeaderCell>덩크 2</TableHeaderCell>
            <TableHeaderCell>합계</TableHeaderCell>
        </TableHead>
        <TableBody>
            {entries.map((e, idx) => {
                const entry = playerCardMap.get(e.playerId);
                const isHighlighted = e.playerId === highlightPlayerId;
                return (
                    <TableRow key={e.playerId} className={isHighlighted ? 'bg-amber-400/10' : ''}>
                        <LetterRankCell rank={idx + 1} />
                        <LetterPlayerCell name={e.playerName} entry={entry} onClick={onPlayerClick ? () => onPlayerClick(e.playerId) : undefined} />
                        <LetterTeamCell slug={e.teamSlug} team={teamBySlug.get(e.teamSlug)} onOpenTeam={onOpenTeam} logo />
                        {e.dunks.map((d, i) => <TableCell key={i} className="tabular-nums">{d.total}</TableCell>)}
                        <TableCell className="tabular-nums font-bold text-white">{e.total}</TableCell>
                    </TableRow>
                );
            })}
        </TableBody>
    </Table>
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
        <LetterShell
            title={<>{seasonLabel}시즌 덩크 컨테스트 결과가 발표됐습니다</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <div className="space-y-2">
                <EventLetterLogo src={getLeagueLogoUrl('DunkContest')} alt="덩크 컨테스트" />
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
                    <LetterSectionTitle>결승 (상위 2명)</LetterSectionTitle>
                    <DunkContestResultTable entries={round2} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} highlightPlayerId={winnerId} />
                </div>
                <div className="space-y-2">
                    <LetterSectionTitle>예선 (4명)</LetterSectionTitle>
                    <DunkContestResultTable entries={round1} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />
                </div>
            </div>
            {onOpenAllStar && (
                <LetterLink onClick={() => onOpenAllStar('dunk')}>
                    올스타 화면 덩크 컨테스트 탭에서 보러가기
                </LetterLink>
            )}
        </LetterShell>
    );
};

// [2026-09-09] ThreePointContestTable과 동일한 이유로 표를 분리(MultiAllStarView.tsx의
// "덩크 컨테스트" 탭에서 재사용).
export const DunkContestTable: React.FC<{
    participants: DunkContestParticipantEntry[];
    teamBySlug: Map<string, LeagueTeamRow>; playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
}> = ({ participants, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => (
    <Table variant="bare" density="compact" className="text-sm text-slate-300">
        <TableHead>
            <TableHeaderCell>순위</TableHeaderCell>
            <TableHeaderCell>OVR</TableHeaderCell>
            <TableHeaderCell align="left">선수</TableHeaderCell>
            <TableHeaderCell align="left">팀</TableHeaderCell>
            <TableHeaderCell>덩크 점수</TableHeaderCell>
        </TableHead>
        <TableBody>
            {participants.map((p, idx) => {
                const entry = playerCardMap.get(p.playerId);
                return (
                    <TableRow key={p.playerId}>
                        <LetterRankCell rank={idx + 1} />
                        <TableCell>
                            <div className="flex justify-center">
                                <OvrBadge value={p.ovr} size="sm" className="shadow-none" />
                            </div>
                        </TableCell>
                        <LetterPlayerCell name={p.playerName} entry={entry} onClick={onPlayerClick ? () => onPlayerClick(p.playerId) : undefined} />
                        <LetterTeamCell slug={p.teamSlug} team={teamBySlug.get(p.teamSlug)} onOpenTeam={onOpenTeam} logo />
                        <TableCell className="tabular-nums">{p.dunkRating}</TableCell>
                    </TableRow>
                );
            })}
        </TableBody>
    </Table>
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
        <LetterShell
            title={<>{seasonLabel}시즌 덩크 컨테스트 참가자 명단이 확정됐습니다</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <div className="space-y-2">
                <EventLetterLogo src={getLeagueLogoUrl('DunkContest')} alt="덩크 컨테스트" />
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
                <LetterSectionTitle>참가자</LetterSectionTitle>
                <DunkContestTable participants={participants} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />
            </div>
            {onOpenAllStar && (
                <LetterLink onClick={() => onOpenAllStar('dunk')}>
                    올스타 화면 덩크 컨테스트 탭에서 보러가기
                </LetterLink>
            )}
        </LetterShell>
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
        court_background: '', court_paint: '', court_line: '', court_three: null, court_show_logo: false, court_logo_scale: 100, // 올스타 가상 팀 — 실제 행 아님
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
 * awayTeamName + getTeamLogoUrl(가상 팀 ID를 리그 로고로 매핑하도록 이미 확장돼 있음) +
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
    const logoSrc = isMain ? getLeagueLogoUrl('AllStar') : getLeagueLogoUrl('RisingStar');
    const logoAlt = isMain ? '올스타' : '라이징스타';
    const eventLabel = isMain ? '올스타전' : '라이징스타 챌린지';
    const homeColor = isMain ? CONFERENCE_COLORS.East : RISING_STARS_COLORS.A;
    const awayColor = isMain ? CONFERENCE_COLORS.West : RISING_STARS_COLORS.B;
    const homeTeamRow = buildAllStarTeamRow(homeTeamId, homeTeamName, homeColor);
    const awayTeamRow = buildAllStarTeamRow(awayTeamId, awayTeamName, awayColor);
    const mvpStatLine = mvp && mvp.stats.length > 0 ? mvp.stats.map(s => `${s.value} ${s.label}`).join(', ') : null;

    return (
        <LetterShell
            title={<>{event.detail.seasonLabel}시즌 {eventLabel}이 종료됐습니다</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
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
                <Spinner variant="section" />
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
                        <LetterSectionTitle level="h4">박스스코어</LetterSectionTitle>
                        <TeamBoxTable team={awayTeamRow} teamSlug={awayTeamId} box={boxScore.awayBox} playerCardMap={boxPlayerCardMap} onPlayerClick={onPlayerClick} highlightPlayerId={mvp?.playerId} />
                        <TeamBoxTable team={homeTeamRow} teamSlug={homeTeamId} box={boxScore.homeBox} playerCardMap={boxPlayerCardMap} onPlayerClick={onPlayerClick} highlightPlayerId={mvp?.playerId} />
                    </div>
                </div>
            ) : event.gameId ? (
                <BoxScoreWaitNote />
            ) : null}

            {onOpenAllStar && (
                <LetterLink onClick={() => onOpenAllStar(isMain ? undefined : 'risingstars')}>
                    올스타 화면에서 보러가기
                </LetterLink>
            )}
        </LetterShell>
    );
};

// ══════════════════════════════════════════════════════════════════════════
// 플레이오프 서신 7종 [2026-09-15] — 서버 미러: server/src/shared/multi/playoffNews.ts.
// ══════════════════════════════════════════════════════════════════════════

export const PlayInBracketCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, onOpenTeam }) => {
    if (event.detail.kind !== 'play_in_bracket') return null;
    const { seasonLabel, matchups } = event.detail;
    const renderGroup = (label: string, conf: 'East' | 'West') => (
        <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-400">{label}</h3>
            {matchups.filter(m => m.conference === conf).map(m => (
                <div key={`${m.conference}-${m.tag}`} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-md bg-slate-800/60 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                        <TeamMark variant="logo" teamId={m.higherSeedSlug} teamName={teamBySlug.get(m.higherSeedSlug)?.team_name ?? m.higherSeedName} size="xs" />
                        <ClickableText className="text-slate-200 font-semibold truncate" noUnderline onClick={() => onOpenTeam?.(m.higherSeedSlug)} teamHoverId={m.higherSeedSlug}>
                            {m.higherSeedRank}. {teamBySlug.get(m.higherSeedSlug)?.team_name ?? m.higherSeedName}
                        </ClickableText>
                    </div>
                    <span className="text-slate-500 shrink-0 text-xs font-bold">VS</span>
                    <div className="flex items-center gap-2 min-w-0 flex-row-reverse text-right">
                        <TeamMark variant="logo" teamId={m.lowerSeedSlug} teamName={teamBySlug.get(m.lowerSeedSlug)?.team_name ?? m.lowerSeedName} size="xs" />
                        <ClickableText className="text-slate-200 font-semibold truncate" noUnderline onClick={() => onOpenTeam?.(m.lowerSeedSlug)} teamHoverId={m.lowerSeedSlug}>
                            {m.lowerSeedRank}. {teamBySlug.get(m.lowerSeedSlug)?.team_name ?? m.lowerSeedName}
                        </ClickableText>
                    </div>
                </div>
            ))}
        </div>
    );
    return (
        <LetterShell
            width="3xl"
            title={<>{seasonLabel}시즌 플레이인 토너먼트 대진 발표</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <p className="text-sm text-slate-300 leading-relaxed">
                플레이오프 진출의 마지막 관문, 플레이인 토너먼트 대진이 확정됐습니다. 동부와 서부에서
                각각 4개 팀이 7~8시드 두 자리를 놓고 격돌합니다 — 7-8위전 승자는 곧바로 7시드를
                확정 짓고, 두 경기의 패자와 승자는 8시드를 걸고 최종 결정전을 치릅니다.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {renderGroup('동부', 'East')}
                {renderGroup('서부', 'West')}
            </div>
        </LetterShell>
    );
};

export const PlayInResultCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, onOpenTeam }) => {
    if (event.detail.kind !== 'play_in_result') return null;
    const { conference, tag, winnerSlug, winnerName, loserSlug, loserName, winnerScore, loserScore, seedClinched } = event.detail;
    const confLabel = conference === 'East' ? '동부' : '서부';
    const tagLabel = tag === '7v8' ? '7-8위전' : tag === '9v10' ? '9-10위전' : '8시드 결정전';
    const winnerDisplay = teamBySlug.get(winnerSlug)?.team_name ?? winnerName;
    const loserDisplay = teamBySlug.get(loserSlug)?.team_name ?? loserName;
    return (
        <LetterShell
            width="3xl"
            title={<>
                <ClickableText onClick={() => onOpenTeam?.(winnerSlug)} teamHoverId={winnerSlug}>
                    {winnerDisplay}
                </ClickableText>
                , {confLabel} {tagLabel} 승리
            </>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <p className="text-sm text-slate-300 leading-relaxed">
                <ClickableText noUnderline onClick={() => onOpenTeam?.(winnerSlug)} teamHoverId={winnerSlug}>{winnerDisplay}</ClickableText>
                이(가) {confLabel} {tagLabel}에서{' '}
                <ClickableText noUnderline onClick={() => onOpenTeam?.(loserSlug)} teamHoverId={loserSlug}>{loserDisplay}</ClickableText>
                을(를) <b className="text-white">{winnerScore} - {loserScore}</b>로 꺾었습니다.{' '}
                {seedClinched
                    ? `이로써 ${winnerDisplay}이(가) ${confLabel} ${seedClinched}시드를 확정 지었습니다.`
                    : `${loserDisplay}은(는) 탈락 없이 8시드를 놓고 최종 결정전에 나섭니다.`}
            </p>
        </LetterShell>
    );
};

export const PlayoffBracketConfirmedCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, onOpenTeam }) => {
    if (event.detail.kind !== 'playoff_bracket_confirmed') return null;
    const { seasonLabel, east, west } = event.detail;
    const renderGroup = (label: string, seeds: typeof east) => (
        <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-slate-400">{label}</h3>
            {seeds.map(s => (
                <div key={s.seed} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/60 text-sm">
                    <span className="text-slate-500 font-black w-5 text-center shrink-0">{s.seed}</span>
                    <TeamMark variant="logo" teamId={s.teamSlug} teamName={teamBySlug.get(s.teamSlug)?.team_name ?? s.teamName} size="xs" />
                    <ClickableText className="text-slate-200 font-semibold truncate" noUnderline onClick={() => onOpenTeam?.(s.teamSlug)} teamHoverId={s.teamSlug}>
                        {teamBySlug.get(s.teamSlug)?.team_name ?? s.teamName}
                    </ClickableText>
                </div>
            ))}
        </div>
    );
    return (
        <LetterShell
            width="3xl"
            title={<>{seasonLabel}시즌 플레이오프 대진 확정</>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <p className="text-sm text-slate-300 leading-relaxed">
                {seasonLabel}시즌 플레이오프 대진표가 확정됐습니다. 동부와 서부에서 각 8개 팀이
                우승을 향한 여정을 시작하며, 1라운드부터 각 컨퍼런스 1번 시드와 8번 시드가 맞붙습니다.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {renderGroup('동부', east)}
                {renderGroup('서부', west)}
            </div>
        </LetterShell>
    );
};

export const PlayoffGameResultCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>;
    onOpenGame?: (gameId: string) => void; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, onOpenGame, onOpenTeam }) => {
    if (event.detail.kind !== 'playoff_game_result') return null;
    const { homeSlug, awaySlug, homeScore, awayScore, roundName, gameNum, higherSeedSlug, lowerSeedSlug, higherSeedWins, lowerSeedWins } = event.detail;
    const homeWon = homeScore > awayScore;
    const winnerSlug = homeWon ? homeSlug : awaySlug;
    const loserSlug = homeWon ? awaySlug : homeSlug;
    const winnerDisplay = teamBySlug.get(winnerSlug)?.team_name ?? winnerSlug;
    const loserDisplay = teamBySlug.get(loserSlug)?.team_name ?? loserSlug;
    const winnerScore = homeWon ? homeScore : awayScore;
    const loserScore = homeWon ? awayScore : homeScore;
    const leaderSlug = higherSeedWins >= lowerSeedWins ? higherSeedSlug : lowerSeedSlug;
    const leaderWins = Math.max(higherSeedWins, lowerSeedWins);
    const trailWins = Math.min(higherSeedWins, lowerSeedWins);
    const isTied = higherSeedWins === lowerSeedWins;
    return (
        <LetterShell
            width="3xl"
            title={<>
                <ClickableText onClick={() => onOpenTeam?.(winnerSlug)} teamHoverId={winnerSlug}>
                    {winnerDisplay}
                </ClickableText>
                , {roundName} {gameNum}차전 승리
            </>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
        >
            <p className="text-sm text-slate-300 leading-relaxed">
                <ClickableText noUnderline onClick={() => onOpenTeam?.(winnerSlug)} teamHoverId={winnerSlug}>{winnerDisplay}</ClickableText>
                이(가){' '}
                <ClickableText noUnderline onClick={() => onOpenTeam?.(loserSlug)} teamHoverId={loserSlug}>{loserDisplay}</ClickableText>
                을(를) <b className="text-white">{winnerScore} - {loserScore}</b>로 꺾고 {roundName} {gameNum}차전을 가져갔습니다.{' '}
                {isTied
                    ? '시리즈 전적은 원점으로 돌아갔습니다.'
                    : <>시리즈 전적은{' '}
                        <ClickableText noUnderline onClick={() => onOpenTeam?.(leaderSlug)} teamHoverId={leaderSlug}>{teamBySlug.get(leaderSlug)?.team_name ?? leaderSlug}</ClickableText>
                        의 {leaderWins}승 {trailWins}패로 앞서갑니다.
                    </>}
            </p>
            {event.gameId && onOpenGame && (
                <LetterLink onClick={() => onOpenGame(event.gameId!)}>
                    경기 다시보기
                </LetterLink>
            )}
        </LetterShell>
    );
};

export const PlayoffSeriesResultCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, onOpenTeam }) => {
    if (event.detail.kind !== 'playoff_series_result') return null;
    const { roundName, winnerSlug, winnerName, loserSlug, loserName, winnerWins, loserWins } = event.detail;
    const winnerDisplay = teamBySlug.get(winnerSlug)?.team_name ?? winnerName;
    const loserDisplay = teamBySlug.get(loserSlug)?.team_name ?? loserName;
    const isSweep = loserWins === 0;
    return (
        <LetterShell
            width="3xl"
            title={<>
                <ClickableText onClick={() => onOpenTeam?.(winnerSlug)} teamHoverId={winnerSlug}>
                    {winnerDisplay}
                </ClickableText>
                , {roundName} 시리즈 승리
            </>}
            date={event.simDate ?? formatRelativeTime(event.createdAt)}
            beforeHeader={
                <div className="flex items-center gap-4 py-2">
                    <TeamMark variant="logo" teamId={winnerSlug} teamName={winnerDisplay} size="md" />
                    <TrendingUp size={20} className="text-emerald-400 shrink-0" />
                </div>
            }
        >
            <p className="text-sm text-slate-300 leading-relaxed">
                <ClickableText noUnderline onClick={() => onOpenTeam?.(winnerSlug)} teamHoverId={winnerSlug}>{winnerDisplay}</ClickableText>
                이(가){' '}
                <ClickableText noUnderline onClick={() => onOpenTeam?.(loserSlug)} teamHoverId={loserSlug}>{loserDisplay}</ClickableText>
                을(를) <b className="text-white">{winnerWins}승 {loserWins}패</b>로{isSweep ? ' 스윕하며' : ' 꺾고'} {roundName} 관문을 통과했습니다.
            </p>
        </LetterShell>
    );
};

export const PlayoffChampionCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; onOpenTeam?: (teamSlug: string) => void;
}> = ({ event, teamBySlug, onOpenTeam }) => {
    if (event.detail.kind !== 'playoff_champion') return null;
    const { seasonLabel, championSlug, championName, playoffWins, playoffLosses } = event.detail;
    const team = teamBySlug.get(championSlug);
    const displayName = team?.team_name ?? championName;
    return (
        <LetterShell
            width="3xl"
            spacing={8}
        >
            <LetterHero>
                <img src="/images/final.webp" alt="Playoff Champion" className="h-36 w-auto object-contain drop-shadow-[0_0_20px_rgba(251,191,36,0.35)]" />
                <p className="text-xs font-black tracking-[0.3em] text-amber-400">{seasonLabel} CHAMPIONS</p>
                <TeamHover teamId={onOpenTeam ? championSlug : null}>
                    <h1
                        className="text-3xl font-black text-white cursor-pointer hover:text-amber-300 transition-colors"
                        onClick={() => onOpenTeam?.(championSlug)}
                    >
                        {displayName}
                    </h1>
                </TeamHover>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300">플레이오프 {playoffWins}승 {playoffLosses}패</span>
                </div>
            </LetterHero>
            <p className="text-sm text-slate-500 -mt-4">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
            <p className="text-sm text-slate-300 leading-relaxed">
                플레이인부터 파이널까지 이어진 길고 치열했던 여정 끝에,{' '}
                <TeamHover teamId={onOpenTeam ? championSlug : null}><span className="cursor-pointer text-white font-bold hover:text-amber-300" onClick={() => onOpenTeam?.(championSlug)}>{displayName}</span></TeamHover>
                {' '}이(가) {seasonLabel}시즌 정상에 올랐습니다. 플레이오프 전적 <b className="text-white">{playoffWins}승 {playoffLosses}패</b>로
                시즌을 마무리하며 우승 트로피를 들어 올렸습니다.
            </p>
        </LetterShell>
    );
};

export const FinalsMvpCard: React.FC<{
    event: LeagueEvent; teamBySlug: Map<string, LeagueTeamRow>; onOpenTeam?: (teamSlug: string) => void; onPlayerClick?: (playerId: string) => void;
}> = ({ event, teamBySlug, onOpenTeam, onPlayerClick }) => {
    if (event.detail.kind !== 'finals_mvp') return null;
    const { seasonLabel, playerId, playerName, teamSlug, teamName, gp, ppg, rpg, apg, spg, bpg } = event.detail;
    const displayTeamName = teamBySlug.get(teamSlug)?.team_name ?? teamName;
    return (
        <LetterShell
            width="3xl"
            spacing={8}
        >
            <LetterHero>
                <img src="/images/fmvp.webp" alt="Finals MVP" className="h-32 w-auto object-contain drop-shadow-[0_0_20px_rgba(251,191,36,0.35)]" />
                <p className="text-xs font-black tracking-[0.3em] text-amber-400">{seasonLabel} FINALS MVP</p>
                <h1 className="text-2xl font-black text-white">
                    <span
                        className={onPlayerClick ? 'cursor-pointer hover:text-amber-300 transition-colors' : ''}
                        onClick={onPlayerClick ? () => onPlayerClick(playerId) : undefined}
                    >
                        {playerName}
                    </span>
                </h1>
                <ClickableText className="text-sm font-bold text-slate-400" noUnderline onClick={() => onOpenTeam?.(teamSlug)} teamHoverId={teamSlug}>
                    {displayTeamName}
                </ClickableText>
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-slate-300 mt-1">
                    <span><b className="text-white">{gp}</b> 경기</span>
                    <span><b className="text-white">{ppg.toFixed(1)}</b> PPG</span>
                    <span><b className="text-white">{rpg.toFixed(1)}</b> RPG</span>
                    <span><b className="text-white">{apg.toFixed(1)}</b> APG</span>
                    {spg >= 0.5 && <span><b className="text-white">{spg.toFixed(1)}</b> SPG</span>}
                    {bpg >= 0.5 && <span><b className="text-white">{bpg.toFixed(1)}</b> BPG</span>}
                </div>
            </LetterHero>
            <p className="text-sm text-slate-500 -mt-4">{event.simDate ?? formatRelativeTime(event.createdAt)}</p>
            <p className="text-sm text-slate-300 leading-relaxed">
                파이널 시리즈 {gp}경기에서 평균 <b className="text-white">{ppg.toFixed(1)}점, {rpg.toFixed(1)}리바운드,
                {' '}{apg.toFixed(1)}어시스트</b>를 기록한{' '}
                <span
                    className={onPlayerClick ? 'cursor-pointer text-white font-bold hover:text-amber-300' : 'text-white font-bold'}
                    onClick={onPlayerClick ? () => onPlayerClick(playerId) : undefined}
                >
                    {playerName}
                </span>
                이(가) {seasonLabel}시즌 파이널 MVP의 영예를 안았습니다.
            </p>
        </LetterShell>
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
    draft_result: ListOrdered,
    play_in_bracket: Swords,
    play_in_result: Swords,
    playoff_bracket_confirmed: BarChart3,
    playoff_game_result: Tv,
    playoff_series_result: TrendingUp,
    playoff_champion: Trophy,
    finals_mvp: Star,
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
    onOpenDraftResult?: () => void;
}> = ({ event, teamBySlug, playerCardMap, roomId, onOpenGame, onPlayerClick, onOpenTeam, onOpenAllStar, onOpenDraftResult }) => {
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
        case 'draft_result': return <DraftResultCard event={event} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} onOpenDraftResult={onOpenDraftResult} />;
        case 'play_in_bracket': return <PlayInBracketCard event={event} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam} />;
        case 'play_in_result': return <PlayInResultCard event={event} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam} />;
        case 'playoff_bracket_confirmed': return <PlayoffBracketConfirmedCard event={event} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam} />;
        case 'playoff_game_result': return <PlayoffGameResultCard event={event} teamBySlug={teamBySlug} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} />;
        case 'playoff_series_result': return <PlayoffSeriesResultCard event={event} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam} />;
        case 'playoff_champion': return <PlayoffChampionCard event={event} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam} />;
        case 'finals_mvp': return <FinalsMvpCard event={event} teamBySlug={teamBySlug} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />;
        default: return <LegacyCard event={event} />;
    }
};


import React, { useCallback, useMemo, useState } from 'react';
import { Spinner } from '../components/common/Spinner';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { useQuery } from '@tanstack/react-query';
import { homeLeagueTransactionsQuery, HOME_TRANSACTIONS_LIMIT } from '../hooks/useHomeLeagueTransactions';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, Plus, Minus, type LucideIcon } from 'lucide-react';
import { useLeagueContext } from '../views/multi/league/LeagueLayout';
import { useSeasonContext } from '../views/multi/season/seasonContext';
import { useLeagueRawStats, type LeagueRawStatsData } from '../hooks/useLeagueRawStats';
import { usePlayerSeasonStatsLeague } from '../hooks/usePlayerSeasonStatsLeague';
import { useLeagueNewsFeed, type LeagueEvent } from '../hooks/useLeagueHeadlines';
import { usePlayerShortCodes } from '../hooks/usePlayerShortCodes';
import { useMultiSearchData } from '../hooks/useMultiSearchData';
import { useServerClockBucket } from '../utils/serverClock';
import { getLeagueLogoUrl } from '../utils/constants';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import { EmptyState } from '../components/common/EmptyState';
import { ClickableText } from '../views/multi/season/newsFeedLetter';
import { useActiveInjuryMap } from '../views/multi/season/useActiveInjuryMap';
import { useCurrentVirtualDate } from '../hooks/useCurrentVirtualDate';
import { getAllStarKeyDates } from '../utils/allStarSelection';
import { getRegularSeasonEndDate } from '../views/multi/season/playoffRaceUtils';
import { STATUS_LABEL } from '../views/multi/league/leagueConstants';
import { isFinal, resolveRealAt } from '../views/multi/season/multiGameReveal';
import { computeSeriesWins } from '../views/multi/season/seasonPhase';
import { seasonShortFromDate } from '../utils/seasonShortFromDate';
import { daysBetweenDateStr } from '../utils/leagueTimeline';
import type { Game } from '../types';
import { computeMultiStandingsStats, fmtWinPct, type MultiStandingsRecord } from '../views/multi/season/multiSeasonUtils';
import { formatReturnDateSuffix, type ActiveInjuryStatus } from '../services/multi/activeInjuryStatus';
import { buildLeagueTeams } from '../services/multi/buildLeagueTeams';
import { useLeaderboardData } from '../hooks/useLeaderboardData';
import { TeamMark } from '../components/common/TeamMark';
import { PlayerHoverCard, buildPlayerCardMap, mergeInjuryIntoPlayerCardMap } from '../components/common/PlayerHoverCard';
import { InjuryStatusBadge, SEVERITY_TEXT_COLOR } from '../components/common/InjuryStatusBadge';
import { OvrBadge } from '../components/common/OvrBadge';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { shouldUseCustomOverrides } from '../utils/leagueOverrides';
import type { LeagueTeamRow } from '../services/multi/roomQueries';
import type { Player, PlayerStats } from '../types';
import { useViewportClass } from '../hooks/useViewportClass';
import { TeamLogo } from '../components/common/TeamLogo';
import { getReadableTextColor } from '../utils/colorContrast';
import { useMyNextGame } from '../hooks/useMyNextGame';
import { SheetSelect } from '../components/mobile/ActionSheet';

// 좌측 리스트 우측 날짜 — "YYYY-MM-DD" 형태인 simDate를 "YY/MM/DD"로 축약 표시.
// MultiNewsFeedView.tsx의 로컬 함수와 동일 규칙(그 파일이 export하지 않아 그대로 복제).
function formatSimDateShort(simDate: string): string {
    const [y, m, d] = simDate.split('-');
    return y && m && d ? `${y.slice(2)}/${m}/${d}` : simDate;
}

// [2026-09-04] 홈 화면 개편 3단계(사용자 요청) — 좌측 컬럼 ④"리그 순위"를 경기 카드 그리드
// 하단에 추가. MultiStandingsView.tsx의 LeagueStandingsTable(정렬/PO%/SOS/디비전 등 풀
// 기능)은 홈 화면 위젯으로 쓰기엔 과함 — 컨퍼런스별 W/L/PCT/GB만 보여주는 압축판을 새로
// 만들고, 계산 로직(승패/승률)만 기존 공용 유틸(computeMultiStandingsStats)을 그대로
// 재사용해 전체 순위표 화면과 숫자가 어긋나지 않게 한다.
// [2026-09-04 후속] 플레이오프 직행권/플레이인권 컷라인 구분선이 플레이인 설정에 따라 달라지게 — 자동 클린치 인원은
// computePlayoffOddsMap(multiSeasonUtils.ts)의 autoClinchCount 공식과 동일, 플레이인 풀은 그 다음 4자리 고정(7~10시드).
// [2026-10-17] 행 배경 틴트(초록/주황 컬러 스케일, tintStyle) 제거(사용자 요청) — 구분선만 유지. Before는 dev-log 참고.

// [2026-09-05 버그 수정] "홈 화면 호버 카드에 부상 정보가 안 뜬다" 리포트 — buildLeagueTeams()는
// 의도적으로 현재 진행 중인 부상 상태(activeInjurySeverity 등)를 채우지 않음(이력만 채움,
// buildLeagueTeams.ts 주석 참고). PlayerHoverCard/mergeInjuryIntoPlayerCardMap은 PlayerCardMap
// (poolPlayers 기반)에 병합하는 헬퍼만 있고, buildLeagueTeams()가 만든 완전한 Player 객체를
// 직접 쓰는 화면(리그 리더/내 로스터 요약)엔 대응하는 헬퍼가 없어서 이 함수로 보완.
function applyActiveInjury<T extends Player | null | undefined>(player: T, status: ActiveInjuryStatus | undefined): T {
    if (!status || !player) return player;
    return {
        ...player,
        activeInjurySeverity: status.severity,
        injuryType: status.injuryType,
        activeInjuryDuration: status.duration,
        returnDate: status.returnDate ?? undefined,
    };
}

// [2026-10-14] 홈 4밴드 레이아웃(시안 https://claude.ai/artifact/FmLLWQXjnwGFGmPs4LSGSg). 섹션은 "제목바(40px, 우측 더보기 링크) +
// 표"가 한 패널(bg-slate-900, 1px 테두리, 8px 라운드)로 묶인다 — 예전엔 제목이 표 밖 여백에 떠 있고 표마다 섬처럼 떨어져 있었음.
const HomePanel: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
    <section className={`bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col ${className}`}>{children}</section>
);
const HomeSection: React.FC<{
    title: string;
    /** 우측 "더보기 →" 링크의 목적지(앱 내 경로)와 라벨. 없으면 링크 없음. */
    moreTo?: string;
    moreLabel?: string;
    /** 제목 우측·링크 좌측에 끼우는 컨트롤(세그먼트 탭 등) */
    headerRight?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}> = ({ title, moreTo, moreLabel = '더보기', headerRight, className, children }) => {
    const navigate = useNavigate();
    return (
        <HomePanel className={className}>
            <div className="h-10 shrink-0 flex items-center justify-between gap-3 px-3 border-b border-slate-800">
                <span className="text-[15px] font-bold text-white truncate">{title}</span>
                <div className="flex items-center gap-3 shrink-0">
                    {headerRight}
                    {moreTo && (
                        <button type="button" onClick={() => navigate(moreTo)} className="text-xs text-indigo-400 hover:underline whitespace-nowrap">
                            {moreLabel} →
                        </button>
                    )}
                </div>
            </div>
            {/* 본문은 남은 높이를 전부 차지(빈 상태도 영역을 가득 채움, 사용자 지시). 행이 넘치면 안에서 스크롤. */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
                {children}
            </div>
        </HomePanel>
    );
};
/** 섹션 본문을 가득 채우며 가운데 정렬되는 빈 상태 — 데이터가 없어도 패널 높이가 줄지 않게. */
const HomeEmpty: React.FC<{ title: string }> = ({ title }) => (
    <div className="flex-1 flex items-center justify-center"><EmptyState padding="sm" title={title} /></div>
);
// 홈의 압축 표/리스트 공통: 공용 Table(bare·compact·세로선 없음). [2026-10-13] raw <table>·flex-div 리스트 7곳 치환.
const HomeTable: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Table variant="bare" density="compact" dividers={false}>{children}</Table>
);
const HOME_EMPTY_NO_TEAM = '참가 중인 팀이 없습니다.';
/** 밴드 안 표의 행 수 — 같은 밴드의 좌/우 패널 하단선을 맞추기 위한 고정값(시안 기준: 순위 15 = 뉴스 10 + 트랜잭션 5). */
// [2026-10-14] 밴드 2 우측은 뉴스/트랜잭션이 50:50(각 flex-1) — 순위 15행 높이의 절반에 들어가는 7행씩.
const HOME_ROWS = { news: 7, transactions: 7, leaders: 10, injuries: 6 } as const;

// ── 폰(<768) 홈 — docs/ui/mobile-design-system.md §9-0-2, 캔버스 2행 PhoneHome①~④ (2026-10-27 코드 적용)
// 섹션 5개(순위·리더·뉴스·트랜잭션·리그 부상·징계)만, 1열 스택, 행 44(순위 40), 선택기는 패널 헤더 SheetSelect(바텀 시트).
// 내 로스터 요약·내 팀 부상은 폰 홈에 두지 않는다(팀 탭에서). 데스크톱(≥1024) 렌더는 아래 그대로.
// 순위는 행 제한 없음 — 컨퍼런스 전체(15팀)를 다 보인다(2026-10-27 사용자 요청, 8행 → 전체).
const PHONE_ROWS = { leaders: 5, news: 3, transactions: 3, injuries: 4 } as const;
/** 폰 리스트 행 — 높이 44, 좌우 12, 행 사이 slate-800 1px(마지막 행 제외). 탭 전체가 이동. */
const PhoneRow: React.FC<{ onClick?: () => void; className?: string; children: React.ReactNode }> = ({ onClick, className = '', children }) => (
    <button type="button" onClick={onClick} className={`w-full h-11 px-3 flex items-center gap-3 text-left border-b border-slate-800 last:border-b-0 active:bg-white/5 ${className}`}>
        {children}
    </button>
);

const HomeStandingsTable: React.FC<{
    teams: LeagueTeamRow[];
    statsMap: Record<string, MultiStandingsRecord>;
    playoffCutoff: number;
    playInEnabled: boolean;
    onOpenTeam: (slug: string) => void;
    /** [2026-10-14] 행(표 아무 곳) 클릭 → 순위표 화면. 팀명(ClickableText)만 팀 로스터(사용자 지시). */
    onOpenStandings: () => void;
    teamColumnLabel?: string;
}> = ({ teams, statsMap, playoffCutoff, playInEnabled, onOpenTeam, onOpenStandings, teamColumnLabel = '팀' }) => {
    const sorted = [...teams].sort((a, b) => (statsMap[b.team_slug]?.pct ?? 0) - (statsMap[a.team_slug]?.pct ?? 0));
    const leader = statsMap[sorted[0]?.team_slug];

    // 자동 클린치(직행) 인원 — 플레이인 활성화 시 playoffCutoff보다 2명 적게(그 2자리는
    // 플레이인 승자 몫), 비활성화 시 playoffCutoff 그대로(플레이인 자체가 없으므로 컷 아래는
    // 전부 탈락).
    const autoClinchCount = Math.min(
        playInEnabled ? Math.max(0, playoffCutoff - 2) : playoffCutoff,
        sorted.length,
    );
    // 플레이인 풀은 항상 4자리(7~10시드 방식) — 비활성화면 애초에 플레이인 자체가 없음.
    const playInEndIdx = playInEnabled ? Math.min(autoClinchCount + 4, sorted.length) : autoClinchCount;

    return (
        <HomeTable>
            <TableHead>
                <TableHeaderCell align="left" width={28}>#</TableHeaderCell>
                <TableHeaderCell align="left">{teamColumnLabel}</TableHeaderCell>
                <TableHeaderCell>W</TableHeaderCell>
                <TableHeaderCell>L</TableHeaderCell>
                <TableHeaderCell>PCT</TableHeaderCell>
                <TableHeaderCell>GB</TableHeaderCell>
            </TableHead>
            <TableBody>
                {sorted.map((t, i) => {
                    const rec = statsMap[t.team_slug];
                    const gb = i === 0 || !leader || !rec
                        ? '-'
                        : (((leader.wins - leader.losses) - (rec.wins - rec.losses)) / 2).toFixed(1);
                    // 컷라인 구분선 — 직행권 끝(항상)과 플레이인권 끝(플레이인 활성화 시만) 두 곳.
                    const isCutoffRow = i === autoClinchCount - 1 || (playInEnabled && i === playInEndIdx - 1);
                    return (
                        <TableRow
                            key={t.team_slug}
                            onClick={onOpenStandings}
                            className={isCutoffRow ? '[&>td]:border-b-2' : ''}
                        >
                            <TableCell align="left" className="text-sm text-slate-500">{i + 1}</TableCell>
                            <TableCell align="left">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <TeamMark variant="logo" teamId={t.team_slug} teamName={t.team_abbr} size="xs" />
                                    {/* 팀명 호버 시 밑줄(+인디고) — 앱 공통 이동 링크 규칙(ClickableText). 클릭 목적지는 행과 동일(팀 로스터). */}
                                    <ClickableText className="text-sm font-bold text-slate-300 truncate" onClick={() => onOpenTeam(t.team_slug)} teamHoverId={t.team_slug}>{t.team_name}</ClickableText>
                                </div>
                            </TableCell>
                            <TableCell className="text-sm text-slate-200">{rec?.wins ?? 0}</TableCell>
                            <TableCell className="text-sm text-slate-200">{rec?.losses ?? 0}</TableCell>
                            <TableCell className="text-sm text-slate-400 tabular-nums">{fmtWinPct(rec?.pct ?? 0)}</TableCell>
                            <TableCell className="text-sm text-slate-500">{gb}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </HomeTable>
    );
};

// [2026-10-27] 폰 홈 — 리그 순위 위 "내 팀 배지": 로고 40 + 팀명 + "W–L · 컨퍼런스 N위" / 우측 다음 경기(vs·@ 상대 + 카운트다운).
// 카드 전체 탭 = 내 팀 로스터. 팀이 없거나 관전이면 렌더하지 않음. (2026-10-26의 "내 팀 카드 없음" 결정을 사용자가 이 형태로 되돌림)
const HomeMyTeamBadge: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams } = useLeagueContext();
    const { schedule, myTeamId } = useSeasonContext();
    const serverNow = useServerClockBucket();
    const navigate = useNavigate();
    const myTeam = leagueTeams.find(t => t.team_slug === myTeamId);
    const isTournament = league?.type === 'tournament';

    const slugs = useMemo(() => leagueTeams.map(t => t.team_slug), [leagueTeams]);
    const statsMap = useMemo(() => computeMultiStandingsStats(slugs, schedule, serverNow, {}, isTournament), [slugs, schedule, serverNow, isTournament]);
    // 순위 = 같은 컨퍼런스(없으면 전체) 승률순 자리.
    const rankLabel = useMemo(() => {
        if (!myTeam) return null;
        const conf = myTeam.conference;
        const peers = conf ? leagueTeams.filter(t => t.conference === conf) : leagueTeams;
        const sorted = [...peers].sort((a, b) => (statsMap[b.team_slug]?.pct ?? 0) - (statsMap[a.team_slug]?.pct ?? 0));
        const rank = sorted.findIndex(t => t.team_slug === myTeam.team_slug) + 1;
        const confLabel = conf === 'East' ? '동부' : conf === 'West' ? '서부' : '';
        return rank > 0 ? `${confLabel ? confLabel + ' ' : ''}${rank}위` : null;
    }, [myTeam, leagueTeams, statsMap]);
    // 다음 경기 — 상단 바·탭 바와 같은 판정(useMyNextGame, MultiHeader.nextGame과 동일 규칙).
    const next = useMyNextGame();

    if (!myTeam || !myTeamId) return null;
    const rec = statsMap[myTeamId];
    const nextGame = next.nextGame;
    const opp = next.opponent;
    const oppId = next.opponentId;
    const isAway = next.isAway;
    // 팀색 카드 위라 헤더의 indigo 대신 글자색(여유) / amber-300 / red-300(긴박).
    const countdownColor = next.urgency === 'warn' ? 'text-amber-300' : next.urgency === 'urgent' ? 'text-red-300' : '';
    // 라벨 = 다음 경기의 시뮬레이션(가상) 날짜 "2026.10.28 (수)" — 연도 포함(상단 바 가상 날짜와 같은 형식), 타이머 = "1시간 23분 후 경기 시작" (2026-10-27 사용자 지시)
    const nextDateLabel = (() => {
        if (!nextGame) return null;
        const d = new Date(nextGame.date.slice(0, 10) + 'T00:00:00');
        if (Number.isNaN(d.getTime())) return nextGame.date;
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`;
    })();
    const countdownText = next.countdownText;

    const rosterBase = `/multi/leagues/${leagueId}/season/roster?rteam=${myTeam.team_slug}`;
    // [2026-10-27] 배지 아래 내 팀 바로가기 3개(탭 바 형식, 균등 3열 44, 세로 구분선) — 로스터 탭 overview / stats / schedule
    const quickLinks: { label: string; tab: string }[] = [
        { label: '로스터', tab: 'overview' },
        { label: '기록', tab: 'stats' },
        { label: '일정', tab: 'schedule' },
    ];

    // [2026-10-27] 카드 배경 = 팀 color_primary 단색(글로시/엠보스 그라디언트는 시도 후 제거 — 사용자 지시), 글자 = color_text.
    const primary = myTeam.color_primary ?? '#4338ca';
    const textColor = myTeam.color_text ?? getReadableTextColor(primary);
    const cardStyle: React.CSSProperties = { color: textColor, backgroundColor: primary, borderColor: 'rgba(0,0,0,0.25)' };

    return (
        <section className="border rounded-lg overflow-hidden" style={cardStyle}>
        <button
            type="button"
            onClick={() => navigate(rosterBase)}
            aria-label={`내 팀 ${myTeam.team_name}, 로스터로 이동`}
            className="w-full px-4 py-3 flex items-center gap-3 text-left active:brightness-110"
        >
            <TeamLogo teamId={myTeam.team_slug} teamName={myTeam.team_abbr} size="custom" className="w-10 h-10 shrink-0" />
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-base font-semibold truncate">{myTeam.team_name}</span>
                <span className="text-xs tabular-nums truncate opacity-80">
                    {rec?.wins ?? 0}–{rec?.losses ?? 0}{rankLabel ? ` · ${rankLabel}` : ''}
                </span>
            </span>
            {nextGame && (
                <span className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-xs tabular-nums opacity-80">{nextDateLabel}</span>
                    {/* 상대 로고 없이 vs·@ + 약어만(2026-10-27) */}
                    <span className="text-sm font-semibold">{isAway ? '@' : 'vs'} {opp?.team_abbr ?? oppId}</span>
                    {countdownText && <span className={`text-xs font-semibold tabular-nums ${countdownColor || 'opacity-90'}`}>{countdownText}</span>}
                </span>
            )}
        </button>
        <nav aria-label="내 팀 바로가기" className="grid grid-cols-3 border-t border-black/25 divide-x divide-black/25 bg-black/20">
            {quickLinks.map(q => (
                <button
                    key={q.tab}
                    type="button"
                    onClick={() => navigate(`${rosterBase}&tab=${q.tab}`)}
                    className="h-11 text-sm font-semibold active:bg-black/30"
                >
                    {q.label}
                </button>
            ))}
        </nav>
        </section>
    );
};

const HomeStandingsSection: React.FC<{ phone?: boolean }> = ({ phone = false }) => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams } = useLeagueContext();
    const { schedule, myTeamId } = useSeasonContext();
    // [2026-09-07] 경기 공개 10분 딜레이/가상 오늘 날짜 판정에만 쓰여 초 단위 정밀도가
    // 필요 없다 — useServerClock() 대신 useServerClockBucket()으로 매초 리렌더(+그 아래
    // useMemo 재계산)를 15초에 한 번으로 줄인다(React DevTools로 실측 확인된 낭비).
    const serverNow = useServerClockBucket();
    const navigate = useNavigate();

    const isTournament = league?.type === 'tournament';
    const slugs = useMemo(() => leagueTeams.map(t => t.team_slug), [leagueTeams]);
    const statsMap = useMemo(
        () => computeMultiStandingsStats(slugs, schedule, serverNow, {}, isTournament),
        [slugs, schedule, serverNow, isTournament],
    );
    const playoffCutoff = league?.playoff_team_count ?? 8;
    const playInEnabled = league?.play_in_enabled ?? true;
    const onOpenTeam = (slug: string) => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${slug}`);
    const onOpenStandings = () => navigate(`/multi/leagues/${leagueId}/season/standings`);

    const eastTeams = leagueTeams.filter(t => t.conference === 'East');
    const westTeams = leagueTeams.filter(t => t.conference === 'West');
    // 컨퍼런스 구분이 없는 경우(예: 토너먼트) 통합 순위표로 폴백.
    const hasConferences = eastTeams.length > 0 && westTeams.length > 0;

    // 폰: 컨퍼런스 하나만(기본 = 내 팀 컨퍼런스), 표 위 탭 바로 즉시 전환. 컨퍼런스 전체 행, 컷은 선 대신 순번 색(직행 emerald · 플레이인 amber).
    const myConf = leagueTeams.find(t => t.team_slug === myTeamId)?.conference === 'West' ? 'West' : 'East';
    const [conf, setConf] = useState<'East' | 'West'>(myConf);
    if (phone) {
        const teams = hasConferences ? (conf === 'East' ? eastTeams : westTeams) : leagueTeams;
        const sorted = [...teams].sort((a, b) => (statsMap[b.team_slug]?.pct ?? 0) - (statsMap[a.team_slug]?.pct ?? 0));
        const leader = statsMap[sorted[0]?.team_slug];
        const autoClinchCount = Math.min(playInEnabled ? Math.max(0, playoffCutoff - 2) : playoffCutoff, sorted.length);
        const playInEndIdx = playInEnabled ? Math.min(autoClinchCount + 4, sorted.length) : autoClinchCount;
        const grid = 'grid grid-cols-[24px_minmax(0,1fr)_36px_36px_48px_40px] gap-1.5 items-center px-3';
        return (
            <HomeSection title="리그 순위" moreTo={`/multi/leagues/${leagueId}/season/standings`} moreLabel="순위표 전체">
                {/* 동부/서부 탭 바 — 표 헤더 위, 탭 즉시 전환(드롭다운 아님, 2026-10-27 사용자 지시). 공용 TabBar 기본 테마(활성 indigo-400 밑줄 2px)를 폰 치수 44로. */}
                {hasConferences && (
                    <div role="tablist" aria-label="컨퍼런스" className="h-11 px-3 flex items-center gap-5 border-b border-slate-800">
                        {([['East', '동부'], ['West', '서부']] as const).map(([v, label]) => (
                            <button
                                key={v}
                                type="button"
                                role="tab"
                                aria-selected={conf === v}
                                onClick={() => setConf(v)}
                                className={`h-full text-sm font-black tracking-tight border-b-2 ${conf === v ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
                <div className={`${grid} h-8 border-b border-slate-800 text-xs font-bold text-slate-400`}>
                    <span>#</span><span>팀</span><span className="text-right">W</span><span className="text-right">L</span><span className="text-right">PCT</span><span className="text-right">GB</span>
                </div>
                {sorted.map((t, i) => {
                    const rec = statsMap[t.team_slug];
                    const gb = i === 0 || !leader || !rec ? '-' : (((leader.wins - leader.losses) - (rec.wins - rec.losses)) / 2).toFixed(1);
                    const mine = t.team_slug === myTeamId;
                    const rankColor = i < autoClinchCount ? 'text-emerald-400' : i < playInEndIdx ? 'text-amber-400' : 'text-slate-400';
                    return (
                        <button
                            key={t.team_slug}
                            type="button"
                            onClick={() => onOpenTeam(t.team_slug)}
                            className={`${grid} w-full h-10 text-left border-b border-slate-800 last:border-b-0 tabular-nums active:bg-white/5 ${mine ? 'bg-indigo-600/15' : ''}`}
                        >
                            <span className={`text-sm font-bold ${rankColor}`}>{i + 1}</span>
                            <span className="flex items-center gap-2 min-w-0">
                                <TeamMark variant="logo" teamId={t.team_slug} teamName={t.team_abbr} size="xs" />
                                <span className={`text-sm font-bold truncate ${mine ? 'text-white' : 'text-slate-300'}`}>{t.team_name}</span>
                            </span>
                            <span className="text-right text-sm text-slate-200">{rec?.wins ?? 0}</span>
                            <span className="text-right text-sm text-slate-200">{rec?.losses ?? 0}</span>
                            <span className="text-right text-sm text-slate-400">{fmtWinPct(rec?.pct ?? 0)}</span>
                            <span className="text-right text-sm text-slate-500">{gb}</span>
                        </button>
                    );
                })}
            </HomeSection>
        );
    }

    return (
        <HomeSection title="리그 순위" moreTo={`/multi/leagues/${leagueId}/season/standings`} moreLabel="순위표 전체" className="h-full">
            {hasConferences ? (
                <div className="grid grid-cols-2 gap-x-4">
                    <HomeStandingsTable teams={eastTeams} statsMap={statsMap} playoffCutoff={playoffCutoff} playInEnabled={playInEnabled} onOpenTeam={onOpenTeam} onOpenStandings={onOpenStandings} teamColumnLabel="동부" />
                    <HomeStandingsTable teams={westTeams} statsMap={statsMap} playoffCutoff={playoffCutoff} playInEnabled={playInEnabled} onOpenTeam={onOpenTeam} onOpenStandings={onOpenStandings} teamColumnLabel="서부" />
                </div>
            ) : (
                <HomeStandingsTable teams={leagueTeams} statsMap={statsMap} playoffCutoff={playoffCutoff} playInEnabled={playInEnabled} onOpenTeam={onOpenTeam} onOpenStandings={onOpenStandings} />
            )}
        </HomeSection>
    );
};

// [2026-09-04] 홈 화면 개편 4단계(사용자 요청) — 좌측 컬럼 ⑧"리그 리더"를 순위표 하단에
// 추가. MultiLeaderboardView.tsx와 동일한 원본 fetch(useLeagueRawStats + buildLeagueTeams)를
// 그대로 재사용 — queryKey(room?.id + allRosterIds)가 같아서 로스터/리더보드 화면이 이미
// 로드해둔 캐시를 그대로 재사용하거나(로더 없이 즉시 표시), 이 화면이 먼저 로드하면 반대로
// 그 화면들이 캐시를 재사용한다(useLeagueRawStats.ts 주석 참고).
// [2026-09-04 후속] "3x3 그리드로 각 분야 상위 3명씩" 요청으로 전면 재설계 — 카테고리를
// 5개(1위만)에서 9개(득점/리바운드/어시스트/스틸/블락/야투율/3점시도/3점성공률/턴오버,
// 각 상위 3명)로 확장. useLeaderboardData 훅은 카테고리 하나만 정렬해 돌려주는 구조라
// 9개 전부 뽑으려면 9번 호출(중복 계산)이 필요해 재사용하지 않고, teams(이미 fetch한
// Player[] 스냅샷)를 그대로 순회해 카테고리별 상위 3명을 직접 계산한다. 야투율/3점성공률처럼
// 시도 볼륨과 무관한 비율 스탯은 자격 기준(최소 시도 수) 없이 그대로 정렬 — 시도 1~2회로
// 100%를 찍는 선수가 상위에 뜰 수 있는 건 알려진 한계(전체 리더보드처럼 별도 자격 기준을
// 두려면 추후 확장).
interface LeaderCategoryDef { key: LeaderKey; label: string; compute: (s: PlayerStats) => number; format: (v: number) => string }
type LeaderKey = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'p3m';
const avgFmt = (v: number) => v.toFixed(1);
// [2026-10-14] 4밴드 개편 — 9개 표(3×3, 각 3명) → 카테고리 세그먼트 탭 1개 × 상위 10명. 비율 스탯(야투율·3점성공률)은 시도
// 1~2회로 100%가 상위에 뜨던 알려진 한계가 있어 홈에서 제외(리더보드 전체 화면은 자격 기준이 있음). 턴오버는 리더가
// 아니라 제외. 3점은 "성공/경기"로.
const LEADER_CATEGORIES: LeaderCategoryDef[] = [
    { key: 'pts', label: '득점', compute: s => s.pts / s.g, format: avgFmt },
    { key: 'reb', label: '리바운드', compute: s => s.reb / s.g, format: avgFmt },
    { key: 'ast', label: '어시스트', compute: s => s.ast / s.g, format: avgFmt },
    { key: 'stl', label: '스틸', compute: s => s.stl / s.g, format: avgFmt },
    { key: 'blk', label: '블락', compute: s => s.blk / s.g, format: avgFmt },
    { key: 'p3m', label: '3점', compute: s => s.p3m / s.g, format: avgFmt },
];
const LEADERS_PER_CATEGORY = HOME_ROWS.leaders;

const HomeLeagueLeadersSection: React.FC<{ phone?: boolean }> = ({ phone = false }) => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams, room } = useLeagueContext();
    const navigate = useNavigate();
    const { getPlayerUrlId } = usePlayerShortCodes();
    const [activeKey, setActiveKey] = useState<LeaderKey>('pts');
    const { myTeamId } = useSeasonContext();

    const useCustomOverrides = shouldUseCustomOverrides(league);
    // [2026-09-05 버그 수정] "호버 카드에 부상 정보가 안 뜬다" — buildLeagueTeams()가 만든
    // Player엔 현재 활성 부상 상태가 없어(위 applyActiveInjury 주석 참고) 별도로 계산해 얹는다(useActiveInjuryMap).
    const { activeInjuryByPlayer, allRosterIds } = useActiveInjuryMap();
    // [2026-09-07] game_pbp 원본 fetch(includePbp:false로 생략) 대신 서버 집계 RPC로 선수
    // 시즌 스탯을 받는다 — 홈 화면 최초 진입 병목 개선(buildLeagueTeams.ts 주석 참고).
    const { data: statsByPlayer } = usePlayerSeasonStatsLeague(room?.id, allRosterIds);
    const selectTeams = useCallback(
        (raw: LeagueRawStatsData) => buildLeagueTeams(raw, leagueTeams, useCustomOverrides, statsByPlayer),
        [leagueTeams, useCustomOverrides, statsByPlayer],
    );
    const { data: teams = [] } = useLeagueRawStats(room?.id, allRosterIds, selectTeams, { includePbp: false });

    const leaderGrid = useMemo(() => {
        const allPlayers = teams.flatMap(t => t.roster
            .filter(p => (p.stats?.g ?? 0) > 0)
            .map(p => ({
                player: applyActiveInjury(p, activeInjuryByPlayer.get(p.id)),
                teamId: t.id, teamAbbr: t.abbr, colorPrimary: t.colorPrimary, colorSecondary: t.colorSecondary,
            })));

        return LEADER_CATEGORIES.map(cat => ({
            ...cat,
            ranked: allPlayers
                .map(entry => ({ entry, value: cat.compute(entry.player.stats) }))
                .sort((a, b) => b.value - a.value)
                .slice(0, LEADERS_PER_CATEGORY),
        }));
    }, [teams, activeInjuryByPlayer]);

    const cat = leaderGrid.find(c => c.key === activeKey) ?? leaderGrid[0];
    const isEmpty = leaderGrid.every(c => c.ranked.length === 0);

    if (phone) {
        // 폰: 카테고리는 헤더 SheetSelect. 데스크톱과 같은 열(# · OVR · 선수 · G · MP · 값) + 열 헤더 32(2026-10-27 사용자 지시). 행 44, 5명.
        const grid = 'grid grid-cols-[20px_28px_minmax(0,1fr)_32px_44px_48px] gap-2 items-center px-3';
        return (
            <HomeSection
                title="리그 리더"
                moreTo={`/multi/leagues/${leagueId}/season/leaderboard`}
                moreLabel="리더보드"
                headerRight={<SheetSelect<LeaderKey> title="리더 카테고리" value={activeKey} onChange={setActiveKey} items={LEADER_CATEGORIES.map(c => ({ value: c.key, label: c.label }))} />}
            >
                {isEmpty ? (
                    <HomeEmpty title="아직 경기 기록이 없습니다." />
                ) : (
                    <>
                        <div className={`${grid} h-8 border-b border-slate-800 text-xs font-bold text-slate-400`}>
                            <span>#</span><span className="text-center">OVR</span><span>선수</span><span className="text-right">G</span><span className="text-right">MP</span><span className="text-right">{cat.label}</span>
                        </div>
                        {cat.ranked.slice(0, PHONE_ROWS.leaders).map(({ entry, value }, i) => (
                            <button
                                key={entry.player.id}
                                type="button"
                                onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(entry.player.id)}`)}
                                className={`${grid} w-full h-11 text-left border-b border-slate-800 last:border-b-0 tabular-nums active:bg-white/5`}
                            >
                                <span className="text-sm font-bold text-slate-500">{i + 1}</span>
                                <span className="flex justify-center"><OvrBadge value={entry.player.ovr} size="sm" /></span>
                                <span className="flex items-center gap-2 min-w-0">
                                    <TeamMark variant="logo" teamId={entry.teamId} teamName={entry.teamAbbr} size="xs" />
                                    <span className={`text-sm font-bold truncate ${entry.teamId === myTeamId ? 'text-white' : 'text-slate-300'}`}>{entry.player.name}</span>
                                </span>
                                <span className="text-right text-sm text-slate-400">{entry.player.stats.g}</span>
                                <span className="text-right text-sm text-slate-400">{(entry.player.stats.mp / Math.max(1, entry.player.stats.g)).toFixed(1)}</span>
                                <span className="text-right text-sm font-bold text-white">{cat.format(value)}</span>
                            </button>
                        ))}
                    </>
                )}
            </HomeSection>
        );
    }

    return (
        <HomeSection
            title="리그 리더"
            moreTo={`/multi/leagues/${leagueId}/season/leaderboard`}
            moreLabel="리더보드"
            className="h-full"
        >
            <div className="px-3 py-2 border-b border-slate-800">
                <SegmentedControl<LeaderKey>
                    size="sm"
                    aria-label="리더 카테고리"
                    value={activeKey}
                    onChange={setActiveKey}
                    options={LEADER_CATEGORIES.map(c => ({ value: c.key, label: c.label }))}
                />
            </div>
            {/* 리그 시작 직후(경기를 뛴 선수가 아직 없는 경우) 빈 상태 */}
            {isEmpty ? (
                <HomeEmpty title="아직 경기 기록이 없습니다." />
            ) : (
                <HomeTable>
                    <TableHead>
                        {/* [2026-10-14] OVR·G·MP 열 추가(사용자 지시) — # | OVR | 선수 | G | MP | 카테고리 값 */}
                        <TableHeaderCell align="left" width={28}>#</TableHeaderCell>
                        <TableHeaderCell width={40}>OVR</TableHeaderCell>
                        <TableHeaderCell align="left">선수</TableHeaderCell>
                        <TableHeaderCell align="right" width={40}>G</TableHeaderCell>
                        <TableHeaderCell align="right" width={48}>MP</TableHeaderCell>
                        <TableHeaderCell align="right" width={64}>{cat.label}</TableHeaderCell>
                    </TableHead>
                    <TableBody>
                        {cat.ranked.map(({ entry, value }, i) => (
                            <TableRow
                                key={entry.player.id}
                                onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(entry.player.id)}`)}
                            >
                                <TableCell align="left" className="text-sm text-slate-500">{i + 1}</TableCell>
                                <TableCell><div className="flex justify-center"><OvrBadge value={entry.player.ovr} size="sm" /></div></TableCell>
                                <TableCell align="left" className="max-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <TeamMark variant="logo" teamId={entry.teamId} teamName={entry.teamAbbr} size="xs" />
                                        <PlayerHoverCard player={entry.player} teamAbbr={entry.teamAbbr}>
                                            <span className={`text-sm font-bold truncate min-w-0 ${entry.teamId === myTeamId ? 'text-white' : 'text-slate-300'}`}>{entry.player.name}</span>
                                        </PlayerHoverCard>
                                    </div>
                                </TableCell>
                                <TableCell align="right" className="text-sm text-slate-400 tabular-nums">{entry.player.stats.g}</TableCell>
                                <TableCell align="right" className="text-sm text-slate-400 tabular-nums">{(entry.player.stats.mp / Math.max(1, entry.player.stats.g)).toFixed(1)}</TableCell>
                                <TableCell align="right" className="text-sm text-white tabular-nums">{cat.format(value)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </HomeTable>
            )}
        </HomeSection>
    );
};

// [2026-09-04] 홈 화면 개편 5단계(사용자 요청) — 좌측 컬럼 ⑥"리그 최신 뉴스"를 리더
// 섹션 하단에 추가. MultiNewsFeedView.tsx가 이미 쓰는 useLeagueNewsFeed()를 필터 없이
// (기본값 = "전체 기간"·전체 타입·최신순, 리그 뉴스 화면의 기본 상태와 동일) 그대로
// 재사용해 최신 6건만 잘라 보여준다 — 일반 경기 결과(game_result, score<15)는 이 훅의
// 기본 쿼리가 이미 걸러내므로(GAME_RESULT_MIN_SCORE) 홈 화면 ①번 경기 카드 그리드와
// 중복되지 않는다. 카드 렌더는 뉴스피드의 "레거시 폴백" 카드(LegacyCard — 아이콘+헤드라인+
// 상대시각 한 줄, export만 돼 있고 실제로는 어떤 이벤트 타입에도 쓸 수 있는 범용 컴포넌트)를
// 그대로 재사용 — 압축 목록에 맞는 스타일을 새로 만들 필요가 없었다.
// [2026-09-05 후속] "영역을 반으로 나누고 10개 표시, 카드 대신 리스트로, 아이콘 제거,
// 상대시각 대신 날짜" 요청으로 전면 재설계 — 기존엔 뉴스피드의 LegacyCard(아이콘+헤드라인+
// 상대시각, 테두리 있는 카드)를 그대로 재사용했지만 요구사항이 전부 그 컴포넌트와
// 어긋나서(아이콘 없음/카드 아님/날짜 표기) 재사용을 접고 이 섹션 전용 리스트 행을 새로
// 작성했다. 10건을 5개씩 좌우 두 열로 나눠 배치(뉴스는 시간순이라 홀짝 인터리브 대신
// "왼쪽에 최신 5개, 오른쪽에 다음 5개" 신문 지면 방식이 자연스러움).
const HomeLatestNewsSection: React.FC<{ phone?: boolean }> = ({ phone = false }) => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { room } = useLeagueContext();
    const { myTeamId } = useSeasonContext();
    const navigate = useNavigate();
    const { stories, isLoading } = useLeagueNewsFeed(room?.id, myTeamId);
    const latest = stories.slice(0, HOME_ROWS.news);
    const newsPath = `/multi/leagues/${leagueId}/season/news`;
    // [2026-10-14] 행 클릭은 그 뉴스로(?story=<id> 딥링크 → MultiNewsFeedView가 선택·스크롤). 제목바 "뉴스피드 →"는 목록으로.
    const openNews = (storyId: string) => navigate(`${newsPath}?story=${encodeURIComponent(storyId)}`);

    if (phone) {
        // 폰: 제목 1줄 + 날짜, 행 44, 3건.
        return (
            <HomeSection title="리그 최신 뉴스" moreTo={newsPath} moreLabel="뉴스피드">
                {isLoading ? <Spinner variant="section" /> : latest.length === 0 ? <HomeEmpty title="아직 소식이 없습니다." /> : latest.slice(0, PHONE_ROWS.news).map((e: LeagueEvent) => (
                    <PhoneRow key={e.id} onClick={() => openNews(e.id)}>
                        <span className="flex-1 min-w-0 text-sm font-medium text-slate-200 truncate ko-normal">{e.headline}</span>
                        <span className="text-xs text-slate-400 tabular-nums shrink-0">{e.simDate ? formatSimDateShort(e.simDate) : formatRelativeTime(e.createdAt)}</span>
                    </PhoneRow>
                ))}
            </HomeSection>
        );
    }

    // [2026-10-14] 2열 5행 → 1열 10행(우측 4열 패널 폭에서 제목이 잘리지 않고, 순위표 15행과 높이를 맞춤).
    return (
        <HomeSection title="리그 최신 뉴스" moreTo={newsPath} moreLabel="뉴스피드" className="flex-1 min-h-0">
            {isLoading ? (
                <Spinner variant="section" />
            ) : latest.length === 0 ? (
                <HomeEmpty title="아직 소식이 없습니다." />
            ) : (
                <HomeTable>
                    <TableBody>
                        {latest.map((e: LeagueEvent) => (
                            <TableRow key={e.id} onClick={() => openNews(e.id)}>
                                <TableCell align="left" className="max-w-0">
                                    <span className="block text-sm text-slate-300 truncate ko-normal">{e.headline}</span>
                                </TableCell>
                                <TableCell align="right" width={80} className="text-sm text-slate-500 tabular-nums">
                                    {e.simDate ? formatSimDateShort(e.simDate) : formatRelativeTime(e.createdAt)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </HomeTable>
            )}
        </HomeSection>
    );
};

// [2026-09-04] 홈 화면 개편 6단계(사용자 요청) — 좌측 컬럼 ③"리그 트랜잭션 소식"(트레이드/
// FA/웨이버)을 최신 뉴스 하단에 추가. league_events에는 'trade' 타입만 있고 FA서명/웨이버는
// 별도 이벤트가 없어(league_transactions 테이블에만 기록 — services/multi/playerHistoryService.ts
// 참고) 두 원본을 합쳐야 한다:
// - 트레이드: useLeagueNewsFeed({ types: ['trade'] })로 league_events에서 조회(이미 파싱된
// TradeDetail — teamA/teamB/aOut/bOut에 선수 이름까지 들어있어 별도 조회 불필요).
// - FA서명/웨이버: league_transactions를 room_id로 직접 조회(player_id만 있어 이름 조회
// 필요 — 방출된 선수는 로스터에서 이미 빠져있어 useLeagueRawStats의 allRosterIds로는
// 못 찾으므로, 로스터 여부와 무관하게 리그 전체 드래프트풀을 담고 있는
// useMultiSearchData().poolPlayers에서 이름을 찾는다).
// [2026-09-05 후속] "리스트로 변경, 선수 이름 | 이전팀→이후팀(또는 웨이버/자유 계약) | 날짜
// 형식으로, 트레이드/웨이버/FA영입 전부 표시" 요청으로 재설계 — 트레이드 이벤트 하나가
// 여러 선수를 옮길 수 있어(예: 3-for-2 트레이드) 기존처럼 "이벤트 1건=행 1개"가 아니라
// "이동한 선수 1명=행 1개"로 평탄화한다(aOut은 teamA가 내보내 teamB가 받는 선수들,
// bOut은 반대 — TradePlayerTable과 동일한 방향 규칙). 날짜는 다른 섹션과 동일하게
// simDate 우선 표시(트레이드는 event.simDate, FA/웨이버는 league_transactions.sim_date —
// 이번에 select에 추가), 없으면 상대시각 폴백.

interface HomeTxnTeamRef { slug: string; abbr: string }

interface HomeTxnItem {
    id: string;
    atMs: number;
    kind: 'trade' | 'fa_sign' | 'waive';
    playerId: string;
    playerName: string;
    /** 트레이드일 때만 채워짐 — 이름 우측 열에 "이전팀 → 이후팀"으로 표시(각 팀 약어를
     * 별도로 클릭 가능하게 만들기 위해 문자열이 아닌 구조화된 팀 참조로 보관).
     * FA/웨이버는 undefined(해당 칸을 비워둔다 — 사용자 요청). */
    fromTeam?: HomeTxnTeamRef;
    toTeam?: HomeTxnTeamRef;
    dateLabel: string;
}

// [2026-09-05 후속] "자유 계약 앞엔 트레이드 새 제안 탭에서 쓰는 초록 원+십자, 웨이버 앞엔
// 빨간 원+일자, 트레이드 앞엔 트레이드에 맞는 아이콘" 요청 — 초록/빨강 원+아이콘은
// MultiFrontOfficeView.tsx의 새 제안 탭 행 토글 버튼(TradeOfferPlayerRow)과 완전히 동일한
// 마크업(w-5 h-5 rounded-full + Plus/Minus)을 그대로 재사용해 시각 언어를 통일했다.
const TXN_ICON_BY_KIND: Record<HomeTxnItem['kind'], { Icon: LucideIcon; bg: string }> = {
    trade: { Icon: ArrowLeftRight, bg: 'bg-indigo-600' },
    fa_sign: { Icon: Plus, bg: 'bg-emerald-600' },
    waive: { Icon: Minus, bg: 'bg-red-600' },
};
// [2026-09-05 후속] "트레이드/자유계약/웨이버 순으로 정렬, 그 안에서 날짜순" 요청 — 어떤
// 10건을 보여줄지(선택)는 기존처럼 전체 최신순으로 정하고, 화면에 그릴 때만 이 순서로
// 재정렬한다(선택 기준까지 종류 순으로 바꾸면 "최근 10건"의 의미가 흐려짐).
const TXN_KIND_ORDER: Record<HomeTxnItem['kind'], number> = { trade: 0, fa_sign: 1, waive: 2 };
const TXN_KIND_LABEL: Record<HomeTxnItem['kind'], string> = { trade: '트레이드', fa_sign: '자유 계약', waive: '웨이버' };


const HomeTransactionsSection: React.FC<{ phone?: boolean }> = ({ phone = false }) => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams, room } = useLeagueContext();
    const { myTeamId } = useSeasonContext();
    const navigate = useNavigate();
    const { getPlayerUrlId } = usePlayerShortCodes();
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);

    const teamBySlug = useMemo(() => {
        const m = new Map<string, LeagueTeamRow>();
        for (const t of leagueTeams) m.set(t.team_slug, t);
        return m;
    }, [leagueTeams]);
    const playerNameById = useMemo(() => new Map(poolPlayers.map(p => [p.id, p.name])), [poolPlayers]);
    // 선수 이름 호버 시 능력치/스탯 팝업 — MultiScheduleView.tsx 등 다른 화면과 동일하게
    // poolPlayers(전체 드래프트풀 Player[]) + rosterMap(playerId→team_slug)으로 조립.
    const basePlayerCardMap = useMemo(
        () => buildPlayerCardMap(poolPlayers, rosterMap, slug => teamBySlug.get(slug)?.team_abbr),
        [poolPlayers, rosterMap, teamBySlug],
    );
    // [2026-09-05 버그 수정] "호버 카드에 부상 정보가 안 뜬다" — poolPlayers(meta_players)엔
    // 부상 컬럼이 없어 별도로 room_player_state를 조회해 병합해야 한다(useActiveInjuryMap).
    // 방출된 지 오래된 선수는 allRosterIds(현재 로스터)에 없어 병합 대상에서 빠질 수 있음 — 알려진 한계.
    const { activeInjuryByPlayer } = useActiveInjuryMap();
    const playerCardMap = useMemo(
        () => mergeInjuryIntoPlayerCardMap(basePlayerCardMap, activeInjuryByPlayer),
        [basePlayerCardMap, activeInjuryByPlayer],
    );

    const { stories: tradeStories } = useLeagueNewsFeed(room?.id, myTeamId, { types: ['trade'] });

    const { data: faRows = [] } = useQuery({ ...homeLeagueTransactionsQuery(room?.id), enabled: !!room?.id });

    const items = useMemo((): HomeTxnItem[] => {
        const tradeItems: HomeTxnItem[] = tradeStories.flatMap(e => {
            if (e.detail.kind !== 'trade') return [];
            const { teamA, teamB, aOut, bOut } = e.detail;
            const teamARef: HomeTxnTeamRef = { slug: teamA.slug, abbr: teamBySlug.get(teamA.slug)?.team_abbr ?? teamA.slug };
            const teamBRef: HomeTxnTeamRef = { slug: teamB.slug, abbr: teamBySlug.get(teamB.slug)?.team_abbr ?? teamB.slug };
            const atMs = new Date(e.createdAt).getTime();
            const dateLabel = e.simDate ? formatSimDateShort(e.simDate) : formatRelativeTime(e.createdAt);
            return [
                ...aOut.map(p => ({ id: `${e.id}-${p.id}`, atMs, kind: 'trade' as const, playerId: p.id, playerName: p.name, fromTeam: teamARef, toTeam: teamBRef, dateLabel })),
                ...bOut.map(p => ({ id: `${e.id}-${p.id}`, atMs, kind: 'trade' as const, playerId: p.id, playerName: p.name, fromTeam: teamBRef, toTeam: teamARef, dateLabel })),
            ];
        });
        const faItems: HomeTxnItem[] = faRows.map(r => ({
            id: r.id,
            atMs: new Date(r.created_at).getTime(),
            kind: r.type,
            playerId: r.player_id,
            playerName: playerNameById.get(r.player_id) ?? r.player_id,
            dateLabel: r.sim_date ? formatSimDateShort(r.sim_date) : formatRelativeTime(r.created_at),
        }));
        // 어떤 10건을 보여줄지는 최신순으로 고르고, 화면에 그릴 순서만 트레이드→자유계약→
        // 웨이버, 그 안에서 최신순으로 재정렬.
        return [...tradeItems, ...faItems]
            .sort((a, b) => b.atMs - a.atMs)
            .slice(0, HOME_TRANSACTIONS_LIMIT)
            .sort((a, b) => TXN_KIND_ORDER[a.kind] - TXN_KIND_ORDER[b.kind] || b.atMs - a.atMs);
    }, [tradeStories, faRows, teamBySlug, playerNameById]);

    // [2026-10-14] 행 클릭·"더보기" 모두 트레이드 화면의 히스토리 탭으로(사용자 지시) — MultiFrontOfficeView는 ?tab= 으로 탭을 고른다.
    const txnPath = `/multi/leagues/${leagueId}/season/transaction?tab=history`;
    const openPlayer = (playerId: string) => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(playerId)}`);
    const openTeam = (slug: string) => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${slug}`);

    // [2026-10-14] 우측 4열 패널(뉴스 아래)로 이동하며 10행 → 5행, "팀 이동" 열은 선수 이름 뒤에 작은 글자로 합침(폭 부족).
    // 리그 시작 직후 비어 있어도 패널은 유지(밴드 하단선을 맞추기 위해) — 빈 상태 문구.
    const shown = items.slice(0, HOME_ROWS.transactions);

    if (phone) {
        // 폰: 종류는 글자 대신 데스크톱과 같은 원형 아이콘(트레이드 indigo ↔ · 자유 계약 emerald + · 웨이버 red −, 2026-10-27 사용자 지시) 20px,
        // 그 뒤 선수(트레이드면 FROM → TO) + 날짜. 행 44, 3건.
        return (
            <HomeSection title="트랜잭션" moreTo={txnPath} moreLabel="전체">
                {shown.length === 0 ? <HomeEmpty title="아직 트랜잭션이 없습니다." /> : shown.slice(0, PHONE_ROWS.transactions).map(item => {
                    const { Icon, bg } = TXN_ICON_BY_KIND[item.kind];
                    return (
                        <PhoneRow key={item.id} onClick={() => navigate(`${txnPath}&kind=${item.kind}`)}>
                            <span aria-label={TXN_KIND_LABEL[item.kind]} title={TXN_KIND_LABEL[item.kind]} className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-white shrink-0 ${bg}`}>
                                <Icon size={12} />
                            </span>
                            <span className="flex-1 min-w-0 text-sm truncate">
                                <span className="font-medium text-slate-200">{item.playerName}</span>
                                {item.fromTeam && item.toTeam && <span className="text-slate-400"> {item.fromTeam.abbr} → {item.toTeam.abbr}</span>}
                            </span>
                            <span className="text-xs text-slate-400 tabular-nums shrink-0">{item.dateLabel}</span>
                        </PhoneRow>
                    );
                })}
            </HomeSection>
        );
    }

    return (
        <HomeSection title="트랜잭션" moreTo={txnPath} className="flex-1 min-h-0">
            {shown.length === 0 ? (
                <HomeEmpty title="아직 트랜잭션이 없습니다." />
            ) : (
                <HomeTable>
                    <TableBody>
                        {shown.map(item => {
                            const { Icon, bg } = TXN_ICON_BY_KIND[item.kind];
                            return (
                                <TableRow key={item.id} onClick={() => navigate(`${txnPath}&kind=${item.kind}`)}>
                                    {/* 1열: 종류(트레이드/자유 계약/웨이버) */}
                                    <TableCell align="left" width={96}>
                                        <span className="flex items-center gap-1.5">
                                            <span className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-white shrink-0 ${bg}`}>
                                                <Icon size={10} />
                                            </span>
                                            <span className="text-sm text-slate-400 truncate">{TXN_KIND_LABEL[item.kind]}</span>
                                        </span>
                                    </TableCell>
                                    {/* 2열: 선수 이름(클릭 시 선수 상세, 호버 시 팝업) + 트레이드면 "ABBR → ABBR"(각 팀 클릭 시 로스터) */}
                                    <TableCell align="left" className="max-w-0">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <PlayerHoverCard player={playerCardMap.get(item.playerId)?.player} teamAbbr={playerCardMap.get(item.playerId)?.teamAbbr}>
                                                <ClickableText className="text-sm font-bold text-slate-200 truncate min-w-0" onClick={() => openPlayer(item.playerId)}>{item.playerName}</ClickableText>
                                            </PlayerHoverCard>
                                            {item.fromTeam && item.toTeam && (
                                                <span className="text-xs text-slate-500 shrink-0">
                                                    <ClickableText onClick={() => openTeam(item.fromTeam!.slug)}>{item.fromTeam.abbr}</ClickableText>
                                                    {' → '}
                                                    <ClickableText onClick={() => openTeam(item.toTeam!.slug)}>{item.toTeam.abbr}</ClickableText>
                                                </span>
                                            )}
                                        </span>
                                    </TableCell>
                                    {/* 3열: 날짜 */}
                                    <TableCell align="right" width={80} className="text-sm text-slate-500 tabular-nums">{item.dateLabel}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </HomeTable>
            )}
        </HomeSection>
    );
};

// [2026-09-04] 홈 화면 개편 7단계(사용자 요청) — 좌측 컬럼 ②"리그 부상 소식"을 트랜잭션
// 소식 하단에 추가. 트랜잭션 섹션과 동일한 패턴 — league_events의 'injury' 타입만 필터링
// (`useLeagueNewsFeed({ types: ['injury'] })`, GRADE3 이상만 발행되므로 항상 유의미한
// 부상만 표시됨). 부상 등급 배지는 로스터/호버카드가 이미 쓰는 InjuryStatusBadge를 그대로
// 재사용해 등급별 색상이 화면마다 어긋나지 않게 한다.
// [2026-09-05 후속] "부상/출장정지 소식도 동일하게 리스트로, 출장정지도 표기, 부상 정도별
// 배지 색, 부상명+기간+예상복귀일을 함께" 요청으로 재설계.
// - 출장정지: 기존엔 types:['injury']만 조회해 league_events의 'suspension' 타입이
// 아예 빠져 있었다. 싸움은 항상 두 선수 모두에게 동시에 발생(SuspensionDetail에
// fighter/opponent 둘 다 들어있음 — server/src/shared/leagueEvents.ts의
// detectSuspensionEvent 참고)하므로, 부상처럼 "이벤트 1건=선수 1명"이 아니라 이벤트
// 하나를 두 행으로 펼친다(트랜잭션 섹션의 트레이드 다중 선수 평탄화와 동일 원리).
// - 배지 색: InjuryStatusBadge/SEVERITY_TEXT_COLOR(components/common/InjuryStatusBadge.tsx)
// 가 이미 Grade3/4/5/Suspension별로 다른 색을 정의해두고 있어 그대로 재사용 — 부상
// 타입만 조회하던 이전엔 이 컴포넌트의 색 분기가 사실상 Grade3~5 세 가지만 보였을 뿐,
// 새 기능을 만들 필요는 없었다.
// - 부상명/기간/복귀일: 부상은 injuryType·duration·returnDate 그대로, 출장정지는
// injuryType이 없어 고정 라벨("출장정지")과 "N경기"(games) 기간을 대신 씀.
interface HomeInjuryItem {
    id: string;
    playerId: string;
    playerName: string;
    teamSlug: string;
    severity: 'Grade3' | 'Grade4' | 'Grade5' | 'Suspension';
    typeLabel: string;
    durationLabel: string;
    returnDate: string | null;
}

const HomeInjurySection: React.FC<{ phone?: boolean }> = ({ phone = false }) => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams, room } = useLeagueContext();
    const { myTeamId } = useSeasonContext();
    const navigate = useNavigate();
    const { getPlayerUrlId } = usePlayerShortCodes();
    const { poolPlayers } = useMultiSearchData(league, leagueTeams);
    // 선수 이름 호버 시 능력치/스탯 팝업 — 부상 이벤트 시점의 teamSlug를 그대로 써서
    // (현재 로스터가 아니라 이벤트 발생 당시 소속팀) 팝업 헤더 팀 약어를 표시한다.
    const playerById = useMemo(() => new Map(poolPlayers.map(p => [p.id, p])), [poolPlayers]);
    const teamAbbrBySlug = useMemo(() => new Map(leagueTeams.map(t => [t.team_slug, t.team_abbr])), [leagueTeams]);

    const { stories, isLoading } = useLeagueNewsFeed(room?.id, myTeamId, { types: ['injury', 'suspension'] });
    // [2026-10-17] 이벤트(과거 소식)가 아니라 "지금 활성인" 부상/징계만 노출 — room_player_state 기준 판정.
    const { activeInjuryByPlayer } = useActiveInjuryMap();

    const items = useMemo((): HomeInjuryItem[] => stories.flatMap((e): HomeInjuryItem[] => {
        if (e.detail.kind === 'injury') {
            const { player, teamSlug, severity, injuryType, duration, returnDate } = e.detail;
            return [{ id: e.id, playerId: player.id, playerName: player.name, teamSlug, severity, typeLabel: injuryType, durationLabel: duration, returnDate }];
        }
        if (e.detail.kind === 'suspension') {
            const {
                fighter, fighterTeamSlug, fighterSuspensionGames, fighterReturnDate,
                opponent, opponentTeamSlug, opponentSuspensionGames, opponentReturnDate,
            } = e.detail;
            return [
                { id: `${e.id}-fighter`, playerId: fighter.id, playerName: fighter.name, teamSlug: fighterTeamSlug, severity: 'Suspension' as const, typeLabel: '출장정지', durationLabel: `${fighterSuspensionGames}경기`, returnDate: fighterReturnDate },
                { id: `${e.id}-opponent`, playerId: opponent.id, playerName: opponent.name, teamSlug: opponentTeamSlug, severity: 'Suspension' as const, typeLabel: '출장정지', durationLabel: `${opponentSuspensionGames}경기`, returnDate: opponentReturnDate },
            ];
        }
        return [];
    }).filter(item => {
        // 같은 선수의 옛 이벤트(이미 복귀 후 재부상 등)가 겹치지 않도록 returnDate까지 일치해야 활성으로 인정.
        const active = activeInjuryByPlayer.get(item.playerId);
        return !!active && active.returnDate === item.returnDate;
    }).slice(0, HOME_ROWS.injuries), [stories, activeInjuryByPlayer]);

    if (phone) {
        // 폰: 배지(InjuryStatusBadge 16 — 부상 Grade3~5 / 출장정지 파랑) | 이름 | 부상명 | 기간 + 복귀일 "(~ YY/MM/DD)"(데스크톱 formatReturnDateSuffix 동일).
        // 팀 약어 없음. 행 44, 4건. (2026-10-27 사용자 지시로 배지·복귀일 추가)
        return (
            <HomeSection title="리그 부상·징계" moreTo={`/multi/leagues/${leagueId}/season/news`} moreLabel="뉴스피드">
                {isLoading ? <Spinner variant="section" /> : items.length === 0 ? <HomeEmpty title="최근 부상·징계 소식이 없습니다." /> : items.slice(0, PHONE_ROWS.injuries).map(item => (
                    <PhoneRow key={item.id} onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(item.playerId)}`)}>
                        <InjuryStatusBadge severity={item.severity} size={16} iconSize={10} strokeWidth={4} className="shrink-0" />
                        <span className="w-[96px] shrink-0 text-sm font-medium text-white truncate">{item.playerName}</span>
                        <span className="flex-1 min-w-0 text-sm text-slate-400 truncate">{item.typeLabel}</span>
                        <span className={`text-sm font-semibold tabular-nums shrink-0 whitespace-nowrap ${SEVERITY_TEXT_COLOR[item.severity]}`}>
                            {item.durationLabel}{formatReturnDateSuffix(item.returnDate)}
                        </span>
                    </PhoneRow>
                ))}
            </HomeSection>
        );
    }

    // [2026-10-14] 밴드 4 좌측(6열). 비어 있어도 패널 유지(빈 상태 문구) — 우측 "내 팀 부상·징계"와 나란히.
    return (
        <HomeSection title="리그 부상·징계" moreTo={`/multi/leagues/${leagueId}/season/news`} moreLabel="뉴스피드" className="h-full">
            {isLoading ? (
                <Spinner variant="section" />
            ) : items.length === 0 ? (
                <HomeEmpty title="최근 부상·징계 소식이 없습니다." />
            ) : (
                <HomeTable>
                    <TableHead>
                        <TableHeaderCell width={32} />
                        <TableHeaderCell align="left" width={160}>이름</TableHeaderCell>
                        <TableHeaderCell align="left">부상명</TableHeaderCell>
                        <TableHeaderCell align="right">기간</TableHeaderCell>
                    </TableHead>
                    <TableBody>
                        {items.slice(0, HOME_ROWS.injuries).map(item => (
                            <TableRow
                                key={item.id}
                                onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(item.playerId)}`)}
                            >
                                <TableCell><InjuryStatusBadge severity={item.severity} size={16} iconSize={10} strokeWidth={4} /></TableCell>
                                <TableCell align="left" className="max-w-0">
                                    <PlayerHoverCard
                                        player={applyActiveInjury(playerById.get(item.playerId), activeInjuryByPlayer.get(item.playerId))}
                                        teamAbbr={teamAbbrBySlug.get(item.teamSlug)}
                                    >
                                        <span className="block text-sm font-bold text-white truncate">{item.playerName}</span>
                                    </PlayerHoverCard>
                                </TableCell>
                                <TableCell align="left" className="text-sm text-slate-400 max-w-0 truncate">{item.typeLabel}</TableCell>
                                <TableCell align="right" className={`text-sm ${SEVERITY_TEXT_COLOR[item.severity]}`}>
                                    {item.durationLabel}{formatReturnDateSuffix(item.returnDate)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </HomeTable>
            )}
        </HomeSection>
    );
};

// [2026-09-04] 홈 화면 개편 9단계(사용자 요청) — 우측 컬럼 ⑦"내 로스터 요약"을 최근 경기
// 하단에 추가. HomeLeagueLeadersSection과 동일한 원본 fetch(useLeagueRawStats +
// buildLeagueTeams)를 재사용 — queryKey(room?.id + allRosterIds)가 같아 캐시를 그대로
// 공유한다. 전체 로스터(15명)를 다 나열하기엔 요약 위젯으로 과해서, OVR 내림차순 상위
// 8명만 보여준다(스타팅 5 + 벤치 주력 정도).
const HomeMyRosterSummarySection: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams, room } = useLeagueContext();
    const { myTeamId } = useSeasonContext();
    const navigate = useNavigate();
    const { getPlayerUrlId } = usePlayerShortCodes();

    const useCustomOverrides = shouldUseCustomOverrides(league);
    // [2026-09-05 버그 수정] "호버 카드에 부상 정보가 안 뜬다" — HomeLeagueLeadersSection과
    // 동일한 원인/해법(buildLeagueTeams()는 현재 활성 부상 상태를 채우지 않음 → useActiveInjuryMap).
    const { activeInjuryByPlayer, allRosterIds } = useActiveInjuryMap();
    // [2026-09-07] game_pbp 원본 fetch(includePbp:false로 생략) 대신 서버 집계 RPC로 선수
    // 시즌 스탯을 받는다 — 홈 화면 최초 진입 병목 개선(buildLeagueTeams.ts 주석 참고).
    const { data: statsByPlayer } = usePlayerSeasonStatsLeague(room?.id, allRosterIds);
    const selectTeams = useCallback(
        (raw: LeagueRawStatsData) => buildLeagueTeams(raw, leagueTeams, useCustomOverrides, statsByPlayer),
        [leagueTeams, useCustomOverrides, statsByPlayer],
    );
    const { data: teams = [] } = useLeagueRawStats(room?.id, allRosterIds, selectTeams, { includePbp: false });

    const myTeam = useMemo(() => teams.find(t => t.id === myTeamId), [teams, myTeamId]);
    // [2026-09-05 후속] "팀에 소속된 모든 선수가 보이도록" 요청 — 기존엔 OVR 상위 8명만
    // 잘라 보여주는 요약 위젯이었으나, 전체 로스터(최대 15명)를 전부 보여주도록 변경.
    const rosterPlayers = useMemo(
        () => myTeam
            ? [...myTeam.roster]
                .sort((a, b) => (b.ovr || 0) - (a.ovr || 0))
                .map(p => applyActiveInjury(p, activeInjuryByPlayer.get(p.id)))
            : [],
        [myTeam, activeInjuryByPlayer],
    );

    return (
        <HomeSection
            title="내 로스터 요약"
            moreTo={myTeamId ? `/multi/leagues/${leagueId}/season/roster?rteam=${myTeamId}` : undefined}
            moreLabel="로스터"
            className="h-full"
        >
            {!myTeamId ? (
                <HomeEmpty title={HOME_EMPTY_NO_TEAM} />
            ) : rosterPlayers.length === 0 ? (
                <Spinner variant="section" label="로스터 정보를 불러오는 중입니다." />
            ) : (
                <HomeTable>
                    <TableHead>
                        {/* [2026-10-14] OVR을 이름 우측으로, TOPG·TS% 추가(사용자 지시) */}
                        {/* 이름 열 최소 160px 확보 — 숫자 열에 폭을 지정해 남는 공간이 이름 칸으로 가게(이전엔 숫자 열이 늘어나 이름이 잘렸음) */}
                        <TableHeaderCell align="left" className="min-w-[160px]">선수</TableHeaderCell>
                        <TableHeaderCell width={44}>OVR</TableHeaderCell>
                        <TableHeaderCell width={44}>POS</TableHeaderCell>
                        {/* [2026-10-14] G·GS·FGM·3PM·FTM 추가(이름 칸이 과하게 넓어 데이터로 채움, 사용자 지시). 성공 수는 경기당. */}
                        {['G', 'GS'].map(label => (
                            <TableHeaderCell key={label} width={40}>{label}</TableHeaderCell>
                        ))}
                        {['MPG', 'PPG', 'APG', 'RPG', 'SPG', 'BPG', 'TOPG'].map(label => (
                            <TableHeaderCell key={label} width={50}>{label}</TableHeaderCell>
                        ))}
                        {[['FGM', 50], ['FG%', 58], ['3PM', 50], ['3P%', 58], ['FTM', 50], ['TS%', 58]].map(([label, w]) => (
                            <TableHeaderCell key={label} width={w as number}>{label}</TableHeaderCell>
                        ))}
                    </TableHead>
                    <TableBody>
                        {rosterPlayers.map(p => {
                            const g = p.stats?.g || 0;
                            const perGame = (v: number) => g > 0 ? (v / g).toFixed(1) : '-';
                            const pct = (m: number, a: number) => a > 0 ? `${((m / a) * 100).toFixed(1)}%` : '-';
                            return (
                                <TableRow
                                    key={p.id}
                                    onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(p.id)}`)}
                                >
                                    <TableCell align="left" className="max-w-0">
                                        <PlayerHoverCard player={p} teamAbbr={myTeam?.abbr}>
                                            <span className="block text-sm font-bold text-slate-200 truncate">{p.name}</span>
                                        </PlayerHoverCard>
                                    </TableCell>
                                    <TableCell><div className="flex justify-center"><OvrBadge value={p.ovr} size="sm" /></div></TableCell>
                                    <TableCell className="text-sm text-slate-500">{p.position}</TableCell>
                                    <TableCell className="text-sm text-slate-400 tabular-nums">{g > 0 ? g : '-'}</TableCell>
                                    <TableCell className="text-sm text-slate-400 tabular-nums">{g > 0 ? (p.stats.gs ?? 0) : '-'}</TableCell>
                                    {[p.stats.mp, p.stats.pts, p.stats.ast, p.stats.reb, p.stats.stl, p.stats.blk, p.stats.tov].map((v, i) => (
                                        <TableCell key={i} className="text-sm text-slate-200 tabular-nums">{perGame(v)}</TableCell>
                                    ))}
                                    <TableCell className="text-sm text-slate-200 tabular-nums">{perGame(p.stats.fgm)}</TableCell>
                                    <TableCell className="text-sm text-slate-400 tabular-nums">{pct(p.stats.fgm, p.stats.fga)}</TableCell>
                                    <TableCell className="text-sm text-slate-200 tabular-nums">{perGame(p.stats.p3m)}</TableCell>
                                    <TableCell className="text-sm text-slate-400 tabular-nums">{pct(p.stats.p3m, p.stats.p3a)}</TableCell>
                                    <TableCell className="text-sm text-slate-200 tabular-nums">{perGame(p.stats.ftm)}</TableCell>
                                    {/* TS% = PTS / (2 × (FGA + 0.44 × FTA)) */}
                                    <TableCell className="text-sm text-slate-400 tabular-nums">{pct(p.stats.pts / 2, p.stats.fga + 0.44 * p.stats.fta)}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </HomeTable>
            )}
        </HomeSection>
    );
};

// [2026-09-04] 홈 화면 개편 10단계(사용자 요청, 우측 컬럼 마지막 영역) — ⑨"내 팀 부상자
// 현황". 좌측 ②번(리그 부상 소식)이 "발생 사건"(league_events의 injury 타입, GRADE3
// 이상만) 위주라면 이건 "지금 이 순간 활성 상태인" 부상만 보여준다 — 로스터/전술 화면이
// 부상 배지에 쓰는 것과 동일한 room_player_state → buildActiveInjurySeverityMap() 판정
// 로직을 그대로 재사용(server/src/simRunner.ts §2.5 오버레이와 동일 기준, 화면마다 판정이
// 어긋나지 않도록 이미 공용 유틸로 뽑혀 있음). room_player_state는 player_id 단위 행이라
// useLeagueRawStats(select로 raw.playerInjuryRows만 뽑음)를 내 팀 로스터 id로만 걸러
// 쓴다 — allRosterIds(리그 전체)로 fetch 자체는 이미 다른 홈 위젯(리더/로스터 요약)이
// 캐시해둔 것과 같은 queryKey라 추가 네트워크 비용 없음.
// [2026-09-05 버그 수정] "과거 이력까지 나온다" 리포트 — 원인은 buildActiveInjurySeverityMap에
// currentSimDate(useSeasonContext, rooms.sim_date=실제 KST 벽시계 날짜)를 그대로 넘긴 것.
// injury_history의 date/returnDate는 메인리그 한정 가상 NBA 캘린더 날짜(games.game_date와
// 동일 도메인, 예: "2026-11-22")라 실제 KST 날짜와 값 자체가 다르다(MultiNewsFeedView.tsx의
// "todaySimDate" 버그와 동일 계열 — 그때는 날짜 필터 기본값용으로만 고쳤고 이 판정 함수
// 호출부는 안 고쳐져 있었음). 리그 룸을 Supabase로 직접 조회해 실제로 return_date가
// 몇 달씩 미래로 찍힌 채 활성 판정되는 것을 확인 — 벽시계가 그 날짜에 도달하려면 실제로
// 몇 달이 걸리므로 그동안 계속 "활성 부상"으로 남는다. findCurrentVirtualDate()로 만든
// 가상 날짜(메인리그가 아니면 currentSimDate 그대로)로 교체.
const HomeMyInjuriesSection: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams } = useLeagueContext();
    const { myTeamId } = useSeasonContext();
    const navigate = useNavigate();
    const { getPlayerUrlId } = usePlayerShortCodes();
    const { poolPlayers } = useMultiSearchData(league, leagueTeams);

    const myRosterIds = useMemo(
        () => new Set(leagueTeams.find(t => t.team_slug === myTeamId)?.roster ?? []),
        [leagueTeams, myTeamId],
    );
    // 내 팀 로스터 id로만 걸러 판정(useActiveInjuryMap) — fetch 자체는 리그 전체 queryKey라 다른 홈 위젯과 캐시 공유.
    const { activeInjuryByPlayer, teamIdByPlayer } = useActiveInjuryMap({ playerIds: myRosterIds });
    const playerNameById = useMemo(() => new Map(poolPlayers.map(p => [p.id, p.name])), [poolPlayers]);
    // 선수 이름 호버 시 능력치/스탯 팝업.
    const playerById = useMemo(() => new Map(poolPlayers.map(p => [p.id, p])), [poolPlayers]);
    const teamAbbrBySlug = useMemo(() => new Map(leagueTeams.map(t => [t.team_slug, t.team_abbr])), [leagueTeams]);

    const injuredPlayers = useMemo(
        () => [...activeInjuryByPlayer.entries()]
            .map(([playerId, status]) => ({ playerId, status, name: playerNameById.get(playerId) ?? playerId }))
            .sort((a, b) => (a.status.returnDate ?? '9999-99-99').localeCompare(b.status.returnDate ?? '9999-99-99')),
        [activeInjuryByPlayer, playerNameById],
    );

    // [2026-10-14] 밴드 4 우측(6열). 부상자가 없어도 패널 유지(빈 상태 문구) — 좌측 리그 부상·징계와 나란히.
    return (
        <HomeSection
            title="내 팀 부상·징계"
            moreTo={myTeamId ? `/multi/leagues/${leagueId}/season/roster?rteam=${myTeamId}` : undefined}
            moreLabel="로스터"
            className="h-full"
        >
            {!myTeamId ? (
                <HomeEmpty title={HOME_EMPTY_NO_TEAM} />
            ) : injuredPlayers.length === 0 ? (
                <HomeEmpty title="현재 부상·징계 중인 선수가 없습니다." />
            ) : (
                <HomeTable>
                    <TableHead>
                        <TableHeaderCell width={32} />
                        <TableHeaderCell align="left" width={160}>이름</TableHeaderCell>
                        <TableHeaderCell align="left">부상명</TableHeaderCell>
                        <TableHeaderCell align="right">기간</TableHeaderCell>
                    </TableHead>
                    <TableBody>
                        {injuredPlayers.map(({ playerId, status, name }) => (
                            <TableRow
                                key={playerId}
                                onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(playerId)}`)}
                            >
                                <TableCell><InjuryStatusBadge severity={status.severity} size={16} iconSize={10} strokeWidth={4} /></TableCell>
                                <TableCell align="left" className="max-w-0">
                                    <PlayerHoverCard
                                        player={applyActiveInjury(playerById.get(playerId), status)}
                                        teamAbbr={teamAbbrBySlug.get(teamIdByPlayer.get(playerId) ?? '')}
                                    >
                                        <span className="block text-sm font-bold text-white truncate">{name}</span>
                                    </PlayerHoverCard>
                                </TableCell>
                                <TableCell align="left" className="text-sm text-slate-400 max-w-0 truncate">
                                    {status.severity === 'Suspension' ? '출장정지' : status.injuryType}
                                </TableCell>
                                <TableCell align="right" className={`text-sm ${SEVERITY_TEXT_COLOR[status.severity]}`}>
                                    {status.duration}{formatReturnDateSuffix(status.returnDate)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </HomeTable>
            )}
        </HomeSection>
    );
};

type LeaguePhase = 'regular' | 'allstar' | 'playoffs' | 'other';

// 리그 상태 문구 색 — 정규시즌/올스타/플레이오프만 구분, 그 외(모집 중·드래프트 중·종료 등)는 기본 회색.
const PHASE_COLOR: Record<LeaguePhase, string> = {
    regular: 'text-emerald-400',
    allstar: 'text-sky-400',
    playoffs: 'text-amber-400',
    other: 'text-slate-300',
};

// 리그 현황 문구 — 메인리그 진행 중이면 정규시즌/올스타/플레이오프로 세분화, 그 외는 리그 상태 라벨(모집 중/드래프트 중/종료).
function resolveLeagueStatus(
    league: { status?: string; type?: string; virtual_season_year?: number | null; season_calendar?: unknown } | null | undefined,
    currentVirtualDate: string | null,
    regularSeasonEnd: string | null,
): { text: string | null; phase: LeaguePhase } {
    if (!league?.status) return { text: null, phase: 'other' };
    if (league.status !== 'in_progress') return { text: STATUS_LABEL[league.status] ?? league.status, phase: 'other' };
    if (league.type !== 'main_league') return { text: '토너먼트 진행', phase: 'other' };
    if (!currentVirtualDate) return { text: STATUS_LABEL.in_progress, phase: 'other' };
    // 올스타 브레이크는 allStarStart~allStarEnd 전날까지만(투표 기간은 정규시즌 진행 중이므로 해당 없음).
    const { allStarStart, allStarEnd } = getAllStarKeyDates(league.virtual_season_year ?? new Date().getFullYear(), league.season_calendar);
    if (currentVirtualDate >= allStarStart && currentVirtualDate < allStarEnd) return { text: '올스타 브레이크', phase: 'allstar' };
    if (regularSeasonEnd && currentVirtualDate > regularSeasonEnd) return { text: '플레이오프', phase: 'playoffs' };
    return { text: '정규시즌', phase: 'regular' };
}

/** 정규시즌 "Day N (PP%)" — 일차는 첫 정규시즌 경기일부터 가상 오늘까지의 달력 일수(휴식일 포함), 퍼센트는 공개 완료된 정규시즌 경기 수 / 전체 정규시즌 경기 수. */
function formatRegularSeasonProgress(
    schedule: Game[], simStart: string | null, gprd: number, nowMs: number, currentVirtualDate: string | null,
): string | null {
    let total = 0, done = 0;
    let first: string | null = null;
    for (const g of schedule) {
        if (g.isPlayoff || g.isAllstar) continue;
        total++;
        const d = g.date.slice(0, 10);
        if (first === null || d < first) first = d;
        if (g.played && isFinal({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) }, nowMs)) done++;
    }
    if (!total || !first) return null;
    const day = currentVirtualDate ? Math.max(1, daysBetweenDateStr(first, currentVirtualDate) + 1) : 1;
    const pct = Math.min(100, Math.floor((done / total) * 100));
    return `Day ${day} (${String(pct).padStart(2, '0')}%)`;
}

/**
 * 플레이오프 현재 스테이지 — 아직 안 끝난 시리즈 중 가장 낮은 라운드(플레이인 → 1라운드 → … → 파이널). 시리즈 종료는 공개된 경기 승수로만 판정.
 * 라벨은 이 화면 전용(다른 화면의 getSeriesRoundLabel과 의도적으로 다름): 마지막 라운드부터 거꾸로 파이널 / 컨퍼런스 파이널 / 컨퍼런스 세미파이널, 그 앞은 "N라운드".
 * 모든 시리즈가 끝나면 "{시즌} {리그명} Champion is {팀명}".
 */
function resolvePlayoffStage(
    league: { bracket_data?: unknown; name?: string } | null | undefined,
    schedule: Game[], simStart: string | null, gprd: number, nowMs: number,
    leagueTeams: Array<{ team_slug: string; team_name: string }>,
    currentVirtualDate: string | null,
): string | null {
    const allSeries: any[] = (league?.bracket_data as any)?.series ?? [];
    if (!allSeries.length) return '대진 확정 대기';
    const wins = computeSeriesWins(schedule, simStart, gprd, nowMs);
    const finalRound = allSeries.reduce((max, x) => Math.max(max, x.round ?? 1), 1);
    const winnerOf = (x: any): string | null => {
        const target = x.targetWins ?? 1;
        const byTeam = wins.get(x.id);
        if ((byTeam?.get(x.higherSeedId) ?? 0) >= target) return x.higherSeedId;
        if ((byTeam?.get(x.lowerSeedId) ?? 0) >= target) return x.lowerSeedId;
        return null;
    };
    let minRound: number | null = null;
    for (const x of allSeries) {
        if (winnerOf(x)) continue;
        const r = x.round ?? 1;
        if (minRound === null || r < minRound) minRound = r;
    }
    if (minRound === null) {
        const finalSeries = allSeries.find(x => (x.round ?? 1) === finalRound);
        const championId = finalSeries ? winnerOf(finalSeries) : null;
        const championName = leagueTeams.find(t => t.team_slug === championId)?.team_name;
        if (!championName) return '플레이오프 종료';
        const prefix = [currentVirtualDate ? seasonShortFromDate(currentVirtualDate) : null, league?.name].filter(Boolean).join(' ');
        return `${prefix ? prefix + ' ' : ''}Champion is ${championName}`;
    }
    if (minRound === 0) return '플레이인';
    // 마지막 라운드에서 거꾸로 센다: 파이널 → 컨퍼런스 파이널 → 컨퍼런스 세미파이널 → 그 앞은 "N라운드"(16팀 4라운드 기준 1라운드).
    const fromFinal = finalRound - minRound;
    if (fromFinal === 0) return '파이널';
    if (fromFinal === 1) return '컨퍼런스 파이널';
    if (fromFinal === 2) return '컨퍼런스 세미파이널';
    return `${minRound}라운드`;
}

const MultiSeasonPage: React.FC = () => {
    const viewport = useViewportClass();
    const { league, leagueTeams, timeline } = useLeagueContext();
    const { schedule } = useSeasonContext();
    const nowMs = useServerClockBucket();
    const simStart = league?.sim_real_start_at ?? null;
    const gprd = league?.games_per_real_day ?? 5;
    const currentVirtualDate = useCurrentVirtualDate(schedule, league?.type, league?.sim_real_start_at, league?.games_per_real_day, timeline);
    const regularSeasonEnd = useMemo(() => getRegularSeasonEndDate(schedule), [schedule]);
    const { text: statusText, phase } = resolveLeagueStatus(league, currentVirtualDate, regularSeasonEnd);
    // 상태 문구 옆 보조 정보: 정규시즌은 "Day N (PP%)", 플레이오프는 현재 스테이지.
    const subLine = useMemo(() => {
        if (phase === 'regular') return formatRegularSeasonProgress(schedule, simStart, gprd, nowMs, currentVirtualDate);
        if (phase === 'playoffs') return resolvePlayoffStage(league, schedule, simStart, gprd, nowMs, leagueTeams, currentVirtualDate);
        return null;
    }, [phase, schedule, simStart, gprd, nowMs, currentVirtualDate, league, leagueTeams]);

    if (viewport === 'phone') {
        // 폰 홈(§9-0-2): 데스크톱처럼 리그 로고 + 리그명 + 상태 줄을 본문 맨 위에(상단 바는 시즌 정보만 — 2026-10-27 사용자 지시) → 섹션 1열(간격 24).
        return (
            <div className="px-4 pt-4 pb-6 flex flex-col gap-6">
                <div className="flex items-center gap-3 min-w-0">
                    <img src={getLeagueLogoUrl('League')} alt={league?.name ?? 'League'} className="w-12 h-12 object-contain shrink-0" />
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <h1 className="text-xl font-black text-white truncate">{league?.name ?? 'PRO BASKETBALL LEAGUE'}</h1>
                        {(statusText || subLine) && (
                            <div className="flex items-center gap-2 min-w-0">
                                {statusText && <span className={`text-base font-bold whitespace-nowrap ${PHASE_COLOR[phase]}`}>{statusText}</span>}
                                {statusText && subLine && <span className="w-px h-4 bg-slate-700 shrink-0" aria-hidden="true" />}
                                {subLine && <span className="text-base font-bold text-orange-400 tabular-nums truncate">{subLine}</span>}
                            </div>
                        )}
                    </div>
                </div>
                <HomeMyTeamBadge />
                <HomeStandingsSection phone />
                <HomeLeagueLeadersSection phone />
                <HomeLatestNewsSection phone />
                <HomeTransactionsSection phone />
                <HomeInjurySection phone />
            </div>
        );
    }

    return (
        <div className="p-4 min-h-full">
            {/* 리그 로고 + 리그 이름 + 현재 리그 상태(큰 텍스트). 예전 리그/내 팀 배경 배너(마스트헤드)는 제거. */}
            <div className="flex items-center gap-4 mb-6 px-2 min-w-0">
                <img
                    src={getLeagueLogoUrl('League')}
                    alt={league?.name ?? 'League'}
                    className="w-16 h-16 object-contain shrink-0"
                />
                <div className="flex flex-col gap-1 min-w-0">
                    <h1 className="text-3xl font-black text-white truncate">{league?.name ?? 'PRO BASKETBALL LEAGUE'}</h1>
                    {/* 리그 이름 아래: 리그 상태(정규시즌/플레이오프 등) + 진행 정보(Day N / 현재 스테이지)를 한 줄에 나란히 */}
                    {(statusText || subLine) && (
                        <div className="flex items-baseline gap-3 min-w-0 flex-wrap">
                            {statusText && <span className={`text-xl font-black whitespace-nowrap ${PHASE_COLOR[phase]}`}>{statusText}</span>}
                            {statusText && subLine && <span className="w-px h-5 bg-slate-700 shrink-0 self-center" aria-hidden="true" />}
                            {subLine && <span className="text-xl font-bold text-orange-400 tabular-nums whitespace-nowrap">{subLine}</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* [2026-10-14] 좌/우 독립 세로 스택(2열) → 가로 밴드(12열 그리드). 밴드 1(내 팀 상황 스트립)은 같은 날 사용자 지시로 삭제. 같은 밴드 안의 패널은 행 수를 맞춰
                하단선이 일치하도록(HOME_ROWS). 밴드 간 24px, 밴드 안 16px. 시안: https://claude.ai/artifact/FmLLWQXjnwGFGmPs4LSGSg */}
            <div className="flex flex-col gap-6">
                {/* 밴드 2 · 순위(8) + 뉴스 10행·트랜잭션 5행(4) */}
                <div className="grid grid-cols-12 gap-4 items-stretch">
                    <div className="col-span-8 min-w-0"><HomeStandingsSection /></div>
                    {/* 우측 두 패널은 순위표 높이를 50:50으로 나눔(각 HomeSection에 flex-1 min-h-0) */}
                    <div className="col-span-4 min-w-0 min-h-0 flex flex-col gap-4">
                        <HomeLatestNewsSection />
                        <HomeTransactionsSection />
                    </div>
                </div>

                {/* 밴드 3 · 내 로스터(8) + 리그 리더 탭(4) */}
                <div className="grid grid-cols-12 gap-4 items-stretch">
                    <div className="col-span-8 min-w-0"><HomeMyRosterSummarySection /></div>
                    <div className="col-span-4 min-w-0"><HomeLeagueLeadersSection /></div>
                </div>

                {/* 밴드 4 · 리그 부상·징계(6) + 내 팀 부상·징계(6) */}
                <div className="grid grid-cols-12 gap-4 items-stretch">
                    <div className="col-span-6 min-w-0"><HomeInjurySection /></div>
                    <div className="col-span-6 min-w-0"><HomeMyInjuriesSection /></div>
                </div>
            </div>
        </div>
    );
};

export default MultiSeasonPage;

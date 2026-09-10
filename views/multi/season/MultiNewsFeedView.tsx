
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useLeagueNewsFeed, type LeagueEvent, type LeagueEventType, type NewsSortOrder } from '../../../hooks/useLeagueHeadlines';
import { buildNewsBlurb, buildNewsTitle } from '../../../services/multi/newsBlurb';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { useServerClockBucket } from '../../../utils/serverClock';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { TeamBadge } from '../../../components/common/TeamBadge';
import { StoryCard, extractEventPlayerIds } from './newsFeedCards';
import { buildPlayerCardMap, mergeStatsIntoPlayerCardMap, mergeInjuryIntoPlayerCardMap } from '../../../components/common/PlayerHoverCard';
import { usePlayerSeasonStatsFull } from '../../../hooks/usePlayerSeasonStatsFull';
import { usePlayerInjuryRowsBatch } from '../../../hooks/usePlayerInjuryRowsBatch';
import { buildActiveInjurySeverityMap } from '../../../services/multi/activeInjuryStatus';
import { findCurrentVirtualDate, addDaysToKey } from './multiScheduleUtils';
import { formatRelativeTime } from '../../../utils/formatRelativeTime';

// [2026-09-01] 좌측 리스트 헤더 아래 타입 필터 행 — 메세지 타입별로 다중 선택 필터링.
// 빈 배열 = 전체 타입(팀 필터와 동일한 관례). game_result를 선택해도 useLeagueNewsFeed의
// 기본 쿼리가 이미 "특이케이스만"으로 좁혀둔 상태 위에 추가로 좁히는 것이라(중복 방지
// 원칙 유지), 일반 경기 결과 전체가 나오진 않는다.
// [2026-09-02] MVP/DPOY/올-오펜시브/올-디펜시브 4개 타입을 필터 체크박스에서 "수상" 하나로
// 묶어달라는 요청 — 체크박스 옵션 단위가 더 이상 LeagueEventType 1:1이 아니라 타입 배열을
// 갖는 그룹이 됐다. 쿼리 쪽(useLeagueNewsFeed의 types 필터)은 그대로 LeagueEventType[]를
// 받으므로, 그룹 체크박스를 토글하면 그 그룹의 타입 전부를 한꺼번에 selectedTypes에
// 추가/제거한다(toggleTypeGroup).
interface NewsTypeFilterOption { label: string; types: LeagueEventType[] }
const NEWS_TYPE_FILTER_OPTIONS: NewsTypeFilterOption[] = [
    { label: '경기결과', types: ['game_result'] },
    { label: '개인활약', types: ['player_feat'] },
    { label: '연속기록', types: ['player_streak'] },
    { label: '팀연승', types: ['win_streak'] },
    { label: '트레이드', types: ['trade'] },
    { label: '파워랭킹', types: ['power_ranking'] },
    { label: '수상', types: ['mvp_award', 'dpoy_award', 'all_nba_team', 'all_def_team'] },
    { label: '부상', types: ['injury'] },
    { label: '출장정지', types: ['suspension'] },
    { label: '올스타', types: ['allstar_vote_update', 'allstar_vote_start', 'allstar_vote_result', 'allstar_rising_stars', 'allstar_three_point_contest', 'allstar_dunk_contest', 'allstar_game_result', 'allstar_rising_stars_result', 'allstar_three_point_contest_result', 'allstar_dunk_contest_result'] },
];

// [2026-09-01] 좁은 단일 컬럼 리스트 → 실제 뉴스 사이트 같은 그리드로 개편.
// 데이터는 useLeagueNewsFeed 훅으로 공유, 프레젠테이셔널 마크업은 newsFeedCards.tsx.
//
// [2026-09-01] "경기 결과" 전용 섹션 삭제(사용자 요청) — MultiSeasonLayout이 이미 모든
// 시즌 화면 상단에 GameDateStrip(일정/라이브 스코어 가로 스크롤)을 그려서 일반 경기
// 결과를 뉴스피드에 또 나열하면 중복. 대량득점차 승리 같은 "특이케이스"만
// useLeagueNewsFeed가 서버 쿼리 단계에서 걸러 "리그 소식" 피드에 합쳐 넣는다
// (hooks/useLeagueHeadlines.ts GAME_RESULT_MIN_SCORE 참고) — record/teamOvr은 그
// 특이케이스 카드(GameResultCard, 그리드에서도 항상 한 행 전체 차지)가 팀 전적/OVR을
// 보여주려고 여전히 필요.
//
// [2026-09-01] 헤더 필터(팀/빅뉴스/정렬) 추가 — 리더보드 툴바(components/leaderboard/
// LeaderboardToolbar.tsx)의 시각 언어를 그대로 재현. 팀 필터는 처음에 공용 Dropdown의
// 단일선택 텍스트 리스트로 만들었다가, 리더보드와 시각적으로 달라 보인다는 피드백을 받고
// 리더보드 팀 필터와 완전히 동일한 구현(fixed 포지셔닝 커스텀 패널 + 체크박스 다중선택 +
// "모두 선택" + TeamBadge)으로 다시 맞췄다. 리더보드 툴바 컴포넌트 자체는 리더보드 전용
// 필터 상태(선수/팀 모드, 스탯 카테고리 등)에 강결합돼 있어 그대로 import할 수 없어서
// 마크업만 복제(화면 밖에서 재사용되는 조합은 아니라 공용 컴포넌트로 뽑지 않음).
//
// [2026-09-01] 날짜 하루 단위 이동 스텝퍼 + 기본값 "오늘" 추가 — 사용자가 명시적으로
// "이 날짜는 시뮬레이션 날짜"라고 지정. simDateFrom/simDateTo 기본값을 빈 문자열(전체 기간)
// 에서 오늘의 "가상 시즌 날짜"로 바꿔 첫 진입 시 오늘 하루치만 보이게 하고, 타이틀 옆
// 스텝퍼(◀ 날짜 ▶)가 두 값을 함께 ±1일씩 밀어(범위 폭은 유지) 하루 단위 이동을 지원한다.
// 필터바의 두 날짜 인풋(기존 구현)은 명시적 범위 지정용으로 그대로 두고 — 두 컨트롤이
// 같은 state를 공유해 항상 동기화됨.
//
// [버그 수정] 처음엔 "오늘"을 useSeasonContext().currentSimDate(rooms.sim_date)로 잡았는데,
// 이건 실제(wall-clock) KST 날짜다(server/src/scheduler.ts의 advanceSimDates가
// kstDateFromMs(scheduled_at)로 채움) — 메인리그는 games.game_date(=league_events.sim_date)가
// 압축 스케줄이 아니라 가상 NBA 캘린더 날짜(예: "2027-10-24", server/src/finalize.ts가
// virtual_season_year로 시즌을 생성)라서 currentSimDate와 값 자체가 다르다. 그래서 기본값이
// "오늘"이 아니라 사실상 무작위한 실제 날짜로 보였던 것 — MultiScheduleView.tsx가 이미
// 겪은 문제이고 거기서 쓰는 해법(findCurrentVirtualDate)을 그대로 재사용한다.
// 좌측 리스트 우측 날짜 — "YYYY-MM-DD" 형태인 simDate를 "YY/MM/DD"로 축약 표시(사용자 요청).
function formatSimDateShort(simDate: string): string {
    const [y, m, d] = simDate.split('-');
    return y && m && d ? `${y.slice(2)}/${m}/${d}` : simDate;
}

const MultiNewsFeedView: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, room, leagueTeams } = useLeagueContext();
    const { myTeamId, currentSimDate, schedule } = useSeasonContext();
    // [2026-09-07] todaySimDate(가상 오늘 날짜) 계산에만 쓰여 초 단위 정밀도가 필요
    // 없다 — useServerClock() 그대로 쓰면 뉴스피드 전체(스토리 카드 전부+그 안의
    // TeamBadge/PlayerHoverCard)가 매초 리렌더된다(홈 화면과 동일한 문제, React
    // DevTools로 실측). useServerClockBucket()으로 15초에 한 번만 리렌더되게 함.
    const serverNow = useServerClockBucket();
    // 메인리그만 game_date가 가상 캘린더 — 토너먼트는 game_date 자체가 실제 방송 시각
    // 기반이라 currentSimDate(실제 KST)를 그대로 써야 함(MultiScheduleView.tsx와 동일 분기).
    const isMainLeague = league?.type === 'main_league';
    const todaySimDate = useMemo(() => {
        if (!isMainLeague) return currentSimDate;
        return findCurrentVirtualDate(schedule, league?.sim_real_start_at ?? null, league?.games_per_real_day ?? 5, serverNow) ?? currentSimDate;
    }, [isMainLeague, schedule, league?.sim_real_start_at, league?.games_per_real_day, serverNow, currentSimDate]);
    // useSeasonContext().teams는 멀티플레이어 경로에서 항상 빈 배열([])로 남아있는
    // 미사용 필드다(useMultiGameData 내부에서 setTeams를 호출하는 코드가 없음 — 실제로
    // 채워주는 곳은 싱글플레이어 useGameData.ts뿐). 다른 멀티 화면들(로스터/전술/트레이드)은
    // 전부 이 필드 대신 buildLeagueTeams() 또는 useMultiSearchData()로 직접 로스터를 구성한다.
    // 뉴스피드도 동일하게 트레이드 화면(MultiFrontOfficeView.tsx)에서 이미 검증된
    // useMultiSearchData(전체 드래프트풀 Player[] + playerId→team_slug 역인덱스)를 재사용.
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);
    const navigate = useNavigate();
    const { getGameUrlId } = useGameShortCodes(room?.id);
    const { getPlayerUrlId } = usePlayerShortCodes();

    // [2026-09-02] 필터 값(날짜 범위/팀/빅뉴스/정렬)을 새로고침·뒤로가기 후에도 기억하도록
    // 로컬 state 대신 URL 쿼리 파라미터를 단일 소스로 사용(사용자 요청 — 타입 필터
    // selectedTypes는 요청 범위 밖이라 그대로 로컬 state 유지). 필터 클릭마다 히스토리
    // 엔트리가 쌓이지 않도록 { replace: true }로 갱신.
    const [searchParams, setSearchParams] = useSearchParams();
    const updateParams = (updates: Record<string, string | null>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            for (const [key, value] of Object.entries(updates)) {
                if (value) next.set(key, value);
                else next.delete(key);
            }
            return next;
        }, { replace: true });
    };

    const selectedTeams = useMemo(() => {
        const raw = searchParams.get('teams');
        return raw ? raw.split(',').filter(Boolean) : [];
    }, [searchParams]);
    const setSelectedTeams = (teams: string[]) => updateParams({ teams: teams.length > 0 ? teams.join(',') : null });

    const [selectedTypes, setSelectedTypes] = useState<LeagueEventType[]>([]);
    // "수상" 그룹처럼 타입 여러 개를 한 체크박스로 묶은 경우, 그 그룹의 타입 전부를 한꺼번에
    // 추가/제거한다 — 전부 선택돼 있으면 전부 해제, 하나라도 안 돼 있으면 전부 선택.
    const toggleTypeGroup = (types: LeagueEventType[]) => {
        setSelectedTypes(prev => {
            const allSelected = types.every(t => prev.includes(t));
            return allSelected ? prev.filter(t => !types.includes(t)) : [...new Set([...prev, ...types])];
        });
    };

    const bigNewsOnly = searchParams.get('big') === '1';
    const setBigNewsOnly = (v: boolean) => updateParams({ big: v ? '1' : null });

    const sortOrder: NewsSortOrder = searchParams.get('sort') === 'oldest' ? 'oldest' : 'latest';
    const setSortOrder = (o: NewsSortOrder) => updateParams({ sort: o === 'oldest' ? 'oldest' : null });

    // 인게임(시뮬레이션) 날짜 범위 — league_events.sim_date(games.game_date 스냅샷) 기준.
    // 실제 wall-clock 날짜(createdAt)가 아니라 리그가 압축 스케줄로 진행되는 인게임 날짜.
    // [2026-09-02] 기본값을 "오늘" 하루에서 "전체 기간"(빈 문자열)으로 변경 — 진입 시 오늘
    // 날짜로 자동 좁혀지는 게 불편하다는 사용자 피드백. 스텝퍼(◀/▶)나 "오늘" 버튼으로는
    // 여전히 특정 날짜로 이동 가능.
    const simDateFrom = searchParams.get('from') ?? '';
    const simDateTo = searchParams.get('to') ?? '';
    const setSimDateRange = (from: string, to: string) => updateParams({ from: from || null, to: to || null });

    // 스텝퍼 — from/to를 항상 함께 ±1일 밀어 범위 폭을 유지한다. 전체 기간(둘 다 '') 상태에서
    // 누르면 오늘을 기준으로 하루짜리 범위로 복귀.
    const shiftDateRange = (deltaDays: number) => {
        setSimDateRange(
            addDaysToKey(simDateFrom || todaySimDate, deltaDays),
            addDaysToKey(simDateTo || todaySimDate, deltaDays),
        );
    };
    const resetToToday = () => setSimDateRange(todaySimDate, todaySimDate);
    const isDefaultToday = simDateFrom === todaySimDate && simDateTo === todaySimDate;
    // [2026-09-02] 기본값이 "전체 기간"으로 바뀌면서 isDefaultToday(오늘 버튼 표시용)와
    // "필터를 안 건드린 초기 상태"의 의미가 갈라졌다 — 날짜 필터 자체는 더 이상 "활성
    // 필터"로 취급하지 않는다(선택했을 때만 활성).
    const isDefaultDateFilter = !simDateFrom && !simDateTo;
    const dateLabel = !simDateFrom && !simDateTo
        ? '전체 기간'
        : simDateFrom === simDateTo
            ? simDateFrom
            : `${simDateFrom || '처음'} ~ ${simDateTo || '지금'}`;

    const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
    const teamBtnRef = useRef<HTMLButtonElement>(null);
    const [teamDropdownPos, setTeamDropdownPos] = useState({ top: 0, right: 0 });

    const handleTeamDropdownToggle = () => {
        if (!isTeamDropdownOpen && teamBtnRef.current) {
            const rect = teamBtnRef.current.getBoundingClientRect();
            setTeamDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        }
        setIsTeamDropdownOpen(v => !v);
    };

    const toggleTeam = (teamSlug: string) => {
        setSelectedTeams(selectedTeams.includes(teamSlug) ? selectedTeams.filter(id => id !== teamSlug) : [...selectedTeams, teamSlug]);
    };

    const { stories, isLoading, hasMore, fetchNextPage, isFetchingNextPage } = useLeagueNewsFeed(
        room?.id, myTeamId,
        { teamSlugs: selectedTeams, types: selectedTypes, bigNewsOnly, sortOrder, simDateFrom: simDateFrom || null, simDateTo: simDateTo || null },
    );

    // [2026-09-02 버그 수정] "전체 기간"으로 두면 오늘(예: 11/13) 뉴스가 하루 전(11/12)까지만
    // 보이는데, 날짜를 직접 11/13으로 필터링하면 정상적으로 나오는 문제 — staleTime: Infinity
    // + 로컬스토리지 영속 캐시(index.tsx)라 이 훅의 쿼리는 Realtime INSERT 무효화 없이는
    // 저절로 최신화되지 않는다. Realtime 채널이 잠깐 끊겼다 재연결되는 구간(브라우저 탭
    // 백그라운드/네트워크 순단 등)의 INSERT는 통지받지 못해 "전체 기간" 캐시가 그 시점에서
    // 멈춰버릴 수 있는 반면, 날짜를 새로 지정하면 이전에 없던 queryKey라 무조건 새로 fetch돼
    // 우연히 최신 상태로 보인 것. MultiFrontOfficeView.tsx의 "인박스 탭 진입 시 재조회"와
    // 동일한 해법 — 화면 진입 시 한 번 무효화해 놓친 갱신을 흡수한다.
    const queryClient = useQueryClient();
    useEffect(() => {
        if (room?.id) queryClient.invalidateQueries({ queryKey: ['leagueNewsStories', room.id] });
    }, [room?.id, queryClient]);

    // teamBySlug는 buildNewsTitle/buildNewsBlurb(검색 필터)가 필요로 해서 selectedEvent보다
    // 먼저 선언(CLAUDE.md 규칙2 — 참조되는 변수가 참조하는 변수보다 먼저 와야 함).
    const teamBySlug = useMemo(() => {
        const m = new Map<string, LeagueTeamRow>();
        for (const t of leagueTeams) m.set(t.team_slug, t);
        return m;
    }, [leagueTeams]);

    // [2026-09-03] 좌측 리스트 상단 검색창 요청 — 기사 제목(buildNewsTitle, null이면
    // event.headline 폴백 — StoryCard/리스트 항목이 표시하는 것과 동일한 제목)과 기사 내용
    // (buildNewsBlurb가 만드는 본문 문단들) 중 하나라도 검색어를 포함하면 노출. 서버 쿼리
    // (useLeagueNewsFeed)가 이미 팀/타입/날짜/빅뉴스로 좁혀 내려준 stories(현재까지 로드된
    // 페이지)에 대해서만 클라이언트에서 추가로 거른다 — blurb는 payload 원문이 아니라
    // 클라이언트가 이벤트 데이터로 그때그때 조립하는 문자열이라 서버 쪽에서 걸러줄 수 없다.
    // "더보기"로 아직 안 불러온 뒷페이지는 검색 대상에서 빠짐(무한스크롤+클라이언트 검색의
    // 통상적인 트레이드오프).
    const [searchQuery, setSearchQuery] = useState('');
    const filteredStories = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return stories;
        return stories.filter(e => {
            const title = (buildNewsTitle(e, teamBySlug) ?? e.headline).toLowerCase();
            if (title.includes(q)) return true;
            const blurb = buildNewsBlurb(e, teamBySlug);
            return !!blurb && blurb.join(' ').toLowerCase().includes(q);
        });
    }, [stories, searchQuery, teamBySlug]);

    // [2026-09-01] 좌측 리스트 + 우측 디테일 레이아웃 — 트레이드 > 메세지함
    // (MultiFrontOfficeView.tsx의 inbox 탭, selectedOfferId/selectedOffer 패턴)을 그대로
    // 가져옴. id 하나만 상태로 두고 실제 선택 항목은 .find() ?? filteredStories[0]로 파생 —
    // 필터/검색/페이지 변경으로 선택했던 항목이 목록에서 사라지면 자동으로 맨 위 항목으로
    // 폴백된다(별도 리셋 이펙트 불필요, 원본과 동일한 동작). [2026-09-03] 검색어가 있을 때
    // 우측 디테일도 검색 결과 기준으로 폴백되도록 stories 대신 filteredStories 사용.
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const selectedEvent = filteredStories.find(e => e.id === selectedEventId) ?? filteredStories[0] ?? null;

    const hasActiveFilter = selectedTeams.length > 0 || selectedTypes.length > 0 || bigNewsOnly || !isDefaultDateFilter || !!searchQuery.trim();

    const sortedTeams = useMemo(() => [...leagueTeams].sort((a, b) => a.team_slug.localeCompare(b.team_slug)), [leagueTeams]);

    // 뉴스피드 이벤트엔 완전한 Player 객체가 없어(이름/스탯만) hover 카드를 위해
    // playerId → {Player, 소속팀 약어}를 별도로 만들어 내려준다 — 방출/은퇴 등으로 로스터에서
    // 사라진 선수는 teamAbbr만 빈 문자열이 되고(팝업 헤더에 표시 안 함) 능력치 팝업 자체는
    // 그대로 뜬다. (MultiScheduleView.tsx도 동일한 buildPlayerCardMap을 공유.)
    const basePlayerCardMap = useMemo(
        () => buildPlayerCardMap(poolPlayers, rosterMap, slug => teamBySlug.get(slug)?.team_abbr),
        [poolPlayers, rosterMap, teamBySlug],
    );

    // poolPlayers(meta_players만 조회)는 stats가 항상 0이라 hover 카드에 "시즌 기록 없음"만
    // 뜨는 문제 — 좌/우 분할 레이아웃이라 실제로 렌더되는 건 selectedEvent 하나뿐이므로,
    // 그 이벤트에 등장하는 선수(보통 1~4명)의 시즌 누적만 가볍게 조회해 덮어쓴다. 리그
    // 전체 game_pbp를 받아오는 useLeagueRawStats보다 훨씬 가벼움(RPC가 서버에서 스캔하고
    // 이 몇 명 결과만 내려줌).
    // [2026-09-08] usePlayerSeasonStatsBatch → usePlayerSeasonStatsFull로 교체 — 3점 챌린지
    // 서신(AllstarThreePointContestCard)이 존 슛차트(zone_c3_l/r, zone_atb3_l/c/r 등 —
    // CNR%/45%/ATB% 계산용)까지 필요해졌는데, get_player_season_stats_full RPC가 기존
    // batch가 주던 필드(g/mp/pts/reb/ast/stl/blk/tov/fgm/fga/p3m/p3a/ftm/fta 등)를 전부
    // 포함하는 상위 집합이라 다른 카드들에 영향 없이 이 한 곳만 바꾸면 됨.
    const selectedEventPlayerIds = useMemo(
        () => selectedEvent ? extractEventPlayerIds(selectedEvent) : [],
        [selectedEvent],
    );
    const { data: selectedEventStats } = usePlayerSeasonStatsFull(room?.id, selectedEventPlayerIds);

    // [2026-09-04] "부상 서신 본문 호버 카드에 부상 정보가 안 뜬다" 버그 수정 — 원인은
    // basePlayerCardMap이 poolPlayers(meta_players, 부상 컬럼 없음)로만 조립돼 있어
    // activeInjurySeverity 등이 항상 undefined였던 것. room_player_state는 이미 player_id
    // 단위 행이라(시즌 스탯처럼 game_pbp를 스캔할 필요 없음) usePlayerSeasonStatsBatch와
    // 동일하게 selectedEventPlayerIds(1~4명)만 가볍게 조회해서 병합한다 — 리그 전체 로스터를
    // 끌어오는 useLeagueRawStats/MultiRosterView 방식은 불필요.
    // [2026-09-05 버그 수정] 위 buildActiveInjurySeverityMap 호출에 currentSimDate(rooms.sim_date,
    // 실제 KST 날짜)를 그대로 넘기고 있었음 — 메인리그는 injury_history의 날짜가 가상 NBA
    // 캘린더라 도메인이 달라서 이미 나은 부상도 몇 달간 계속 "활성"으로 남는 버그였다(홈
    // 화면 "내 팀 부상자 현황"에서 먼저 발견됨). 이 파일은 이미 날짜 필터 기본값용으로
    // todaySimDate(findCurrentVirtualDate 기반)를 만들어두고도 정작 이 호출엔 안 쓰고
    // 있었던 것 — todaySimDate로 교체.
    const { data: selectedEventInjuryRows } = usePlayerInjuryRowsBatch(room?.id, selectedEventPlayerIds);
    const activeInjuryByPlayer = useMemo(
        () => buildActiveInjurySeverityMap(selectedEventInjuryRows, todaySimDate, room?.season_number, {
            schedule,
            getTeamId: id => rosterMap.get(id),
        }),
        [selectedEventInjuryRows, todaySimDate, room?.season_number, schedule, rosterMap],
    );
    const playerCardMap = useMemo(() => {
        const withStats = selectedEventStats ? mergeStatsIntoPlayerCardMap(basePlayerCardMap, selectedEventStats) : basePlayerCardMap;
        return mergeInjuryIntoPlayerCardMap(withStats, activeInjuryByPlayer);
    }, [basePlayerCardMap, selectedEventStats, activeInjuryByPlayer]);

    const openGame = (gameId: string) => navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(gameId)}`);
    const openPlayer = (playerId: string) => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(playerId)}`);
    // 팀 이동 — MultiStandingsView.tsx/MultiFrontOfficeView.tsx가 이미 쓰는 것과 동일한
    // 라우트(별도 경로 세그먼트가 아니라 로스터 화면에 ?rteam= 쿼리로 팀 지정).
    const openTeam = (teamSlug: string) => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${teamSlug}`);
    // [2026-09-09] 3점/덩크 컨테스트 서신 하단 바로가기는 올스타 화면의 해당 탭으로 바로
    // 이동해야 해서(사용자 요청) view 파라미터를 선택적으로 받도록 확장 — 안 넘기면 기존과
    // 동일하게 기본(올스타) 탭으로 이동.
    const openAllStar = (view?: string) => navigate(`/multi/leagues/${leagueId}/season/allstar${view ? `?view=${view}` : ''}`);

    return (
        <div className="h-full flex flex-col overflow-hidden text-slate-200 pretendard">
            <div className="flex flex-col border-b border-slate-800 bg-slate-900 shrink-0">
                <div className="px-4 py-3 flex flex-col md:flex-row items-center gap-3">
                    <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                        {/* [2026-09-02] "리그 소식" 텍스트를 The Basketball Chronicle
                            로고(newsFeedCards.tsx의 BrandMark와 동일 파일)로 대체(사용자 요청). */}
                        <img src="/images/bc2.svg" alt="The Basketball Chronicle" className="h-5 w-auto" />

                        {/* 날짜 하루 단위 이동 스텝퍼 — 기본값은 오늘의 인게임 날짜. 화살표는
                            simDateFrom/simDateTo를 함께 ±1일 밀어 범위 폭을 유지한다. */}
                        <div className="flex items-center gap-0.5 h-[30px] bg-slate-950 rounded-lg border border-slate-800 pl-1 pr-1">
                            <button
                                onClick={() => shiftDateRange(-1)}
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                title="하루 전"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span className="text-sm text-slate-400 px-1 whitespace-nowrap">{dateLabel}</span>
                            <button
                                onClick={() => shiftDateRange(1)}
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                title="하루 후"
                            >
                                <ChevronRight size={14} />
                            </button>
                            {!isDefaultToday && (
                                <button
                                    onClick={resetToToday}
                                    className="text-sm font-bold text-indigo-400 hover:text-indigo-300 pl-1.5 pr-2 ml-0.5 border-l border-slate-800 transition-colors"
                                >
                                    오늘
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:ml-auto w-full md:w-auto">
                        {/* 팀별 필터 — 다중 선택. 리더보드 팀 필터(components/leaderboard/
                            LeaderboardToolbar.tsx)와 완전히 동일한 마크업: fixed 포지셔닝
                            커스텀 패널 + 체크박스 + "모두 선택" + TeamBadge. */}
                        <div className="relative">
                            <button
                                ref={teamBtnRef}
                                className={`flex items-center gap-2 h-[36px] px-3 bg-slate-950 rounded-lg border shadow-sm text-sm font-bold transition-colors ${selectedTeams.length > 0 ? 'border-indigo-500/50 text-indigo-400' : 'border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white'}`}
                                onClick={handleTeamDropdownToggle}
                            >
                                <span>팀</span>
                                {selectedTeams.length > 0 && (
                                    <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full">{selectedTeams.length}</span>
                                )}
                                <ChevronDown size={12} />
                            </button>

                            {isTeamDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-[100]" onClick={() => setIsTeamDropdownOpen(false)} />
                                    <div
                                        className="fixed w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-[101] animate-in fade-in zoom-in-95 duration-150"
                                        style={{ top: teamDropdownPos.top, right: teamDropdownPos.right }}
                                    >
                                        <div className="p-2 max-h-80 overflow-y-auto custom-scrollbar space-y-1">
                                            <div
                                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                                                onClick={() => setSelectedTeams(selectedTeams.length === sortedTeams.length ? [] : sortedTeams.map(t => t.team_slug))}
                                            >
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedTeams.length === sortedTeams.length ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
                                                    {selectedTeams.length === sortedTeams.length && <Check size={10} className="text-white" />}
                                                </div>
                                                <span className={`text-sm font-bold ${selectedTeams.length === sortedTeams.length ? 'text-white' : 'text-slate-400'}`}>모두 선택</span>
                                            </div>
                                            <div className="h-px bg-slate-800 mx-2 my-1" />
                                            {sortedTeams.map(team => (
                                                <div
                                                    key={team.team_slug}
                                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                                                    onClick={() => toggleTeam(team.team_slug)}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedTeams.includes(team.team_slug) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
                                                        {selectedTeams.includes(team.team_slug) && <Check size={10} className="text-white" />}
                                                    </div>
                                                    <TeamBadge
                                                        teamId={team.team_slug}
                                                        abbr={team.team_abbr}
                                                        colorPrimary={team.color_primary}
                                                        colorSecondary={team.color_secondary}
                                                        colorText={team.color_text}
                                                        size="sm"
                                                    />
                                                    <span className={`text-sm font-bold ${selectedTeams.includes(team.team_slug) ? 'text-white' : 'text-slate-400'}`}>{team.team_name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 빅뉴스만/전체 — 리더보드 "색상 스케일" 토글과 동일한 단일 라벨 스위치 */}
                        <div
                            className="flex items-center justify-between gap-3 h-[36px] bg-slate-950 rounded-lg border border-slate-800 shadow-sm px-3 cursor-pointer group select-none hover:border-slate-700 transition-colors shrink-0"
                            onClick={() => setBigNewsOnly(!bigNewsOnly)}
                            title="중요도 높은 소식만 보기"
                        >
                            <span className={`text-sm font-bold transition-colors whitespace-nowrap ${bigNewsOnly ? 'text-indigo-400' : 'text-slate-500'}`}>빅 뉴스만</span>
                            <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${bigNewsOnly ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${bigNewsOnly ? 'right-0.5' : 'left-0.5'}`} />
                            </div>
                        </div>

                        {/* 최신순/오래된순 — 리더보드 "정규시즌/플레이오프" 토글과 동일한 양쪽 라벨 스위치 */}
                        <div
                            className="flex items-center gap-3 h-[36px] bg-slate-950 rounded-lg border border-slate-800 shadow-sm px-3 cursor-pointer group select-none hover:border-slate-700 transition-colors shrink-0"
                            onClick={() => setSortOrder(sortOrder === 'latest' ? 'oldest' : 'latest')}
                            title="정렬 순서 전환"
                        >
                            <span className={`text-sm font-bold transition-colors whitespace-nowrap ${sortOrder === 'latest' ? 'text-indigo-400' : 'text-slate-500'}`}>최신순</span>
                            <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${sortOrder === 'oldest' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${sortOrder === 'oldest' ? 'right-0.5' : 'left-0.5'}`} />
                            </div>
                            <span className={`text-sm font-bold transition-colors whitespace-nowrap ${sortOrder === 'oldest' ? 'text-indigo-400' : 'text-slate-500'}`}>오래된순</span>
                        </div>

                        {/* 날짜 범위 필터 — 인게임(시뮬레이션) 날짜 기준(games.game_date/
                            league_events.sim_date). 실제(wall-clock) 날짜가 아님. 리더보드
                            필터바엔 대응되는 컨트롤이 없어 다른 h-[36px] 필터 pill과 동일한
                            톤으로 새로 맞춤(Search 인풋 pill과 동일한 bg-slate-950 보더 스타일). */}
                        <div className="flex items-center h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm shrink-0">
                            <div className="pl-3 pr-2 flex items-center justify-center text-slate-500 shrink-0">
                                <Calendar size={14} />
                            </div>
                            <input
                                type="date"
                                value={simDateFrom}
                                onChange={(e) => setSimDateRange(e.target.value, simDateTo)}
                                max={simDateTo || undefined}
                                className="h-full bg-transparent px-1 text-sm text-slate-400 outline-none [color-scheme:dark] w-[124px]"
                                title="시작 인게임 날짜"
                            />
                            <span className="text-slate-600 text-xs">~</span>
                            <input
                                type="date"
                                value={simDateTo}
                                onChange={(e) => setSimDateRange(simDateFrom, e.target.value)}
                                min={simDateFrom || undefined}
                                className="h-full bg-transparent px-1 text-sm text-slate-400 outline-none [color-scheme:dark] w-[124px]"
                                title="종료 인게임 날짜"
                            />
                            {(simDateFrom || simDateTo) && (
                                <button
                                    onClick={() => setSimDateRange('', '')}
                                    className="h-full px-2 flex items-center justify-center border-l border-slate-800 text-slate-600 hover:text-white transition-colors shrink-0"
                                    title="날짜 필터 초기화"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* [2026-09-01] 좌측 리스트 + 우측 디테일 — 트레이드 > 메세지함(MultiFrontOfficeView.tsx
                inbox 탭)의 레이아웃을 그대로 가져옴: 부모(h-full flex flex-col overflow-hidden)
                아래 flex-1 min-h-0 flex로 좌/우 두 패널을 만들고, 각 패널이 자체
                overflow-y-auto를 가져 독립적으로 스크롤된다(원본과 동일한 스크롤 메커니즘 —
                반응형 좌/우 전환 없음, 항상 30%/70% 고정 분할도 원본 그대로). */}
            <div className="flex-1 min-h-0 flex">
                <div className="w-[30%] shrink-0 border-r border-slate-800 overflow-y-auto custom-scrollbar bg-slate-900">
                    <div className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800">
                        {/* [2026-09-02] "리그 소식" 라벨 삭제(사용자 요청) — 페이지 상단 제목이
                            이미 "리그 소식"이라 중복. 필터 행만 남김.
                            [2026-09-01] 메세지 타입별 필터 요청 — 팀 필터와 동일한 다중 선택 관례
                            (빈 배열 = 전체 타입). 팀 필터 드롭다운의 체크박스 행과 동일한 마크업
                            (w-4 h-4 체크박스 + text-sm 라벨)을 옵션 5개뿐이라 드롭다운 없이
                            인라인으로 바로 배치. */}
                        {/* [2026-09-03] 필터 그룹 위 검색창 — 리더보드 툴바(LeaderboardToolbar.tsx)
                            검색 인풋과 동일한 시각 언어(bg-slate-950 pill + 좌측 Search 아이콘 +
                            입력 중일 때만 뜨는 X 초기화 버튼), 이 컬럼 너비(30%)에 맞춰 w-full로. */}
                        <div className="px-3 pt-2">
                            <div className="relative h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 focus-within:border-indigo-500 focus-within:hover:border-indigo-500 transition-colors shadow-sm w-full">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                    <Search size={14} />
                                </div>
                                <input
                                    type="text"
                                    placeholder="제목/내용으로 검색"
                                    className="h-full w-full bg-transparent pl-9 pr-8 text-sm font-bold text-white outline-none placeholder:text-slate-600 ko-normal"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-3 pt-2 pb-2">
                            {NEWS_TYPE_FILTER_OPTIONS.map(opt => {
                                const checked = opt.types.every(t => selectedTypes.includes(t));
                                return (
                                    <div
                                        key={opt.label}
                                        className="flex items-center gap-1.5 cursor-pointer"
                                        onClick={() => toggleTypeGroup(opt.types)}
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
                                            {checked && <Check size={10} className="text-white" />}
                                        </div>
                                        <span className={`text-sm font-bold ${checked ? 'text-white' : 'text-slate-400'}`}>{opt.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 size={22} className="animate-spin text-indigo-400" />
                        </div>
                    ) : filteredStories.length === 0 ? (
                        <p className="text-sm text-slate-500 ko-normal py-8 text-center px-4">
                            {hasActiveFilter ? '조건에 맞는 소식이 없습니다.' : '아직 소식이 없습니다.'}
                        </p>
                    ) : (
                        <>
                            {/* [2026-09-01] 실제(wall-clock) 상대시각("0분 전") 대신 이벤트가 발생한
                                인게임(시뮬레이션) 날짜(e.simDate)를 표시 — 사용자 요청. simDate가 없는
                                이론상의 경우(백필 이전 이벤트, 사실상 없음)만 상대시각으로 폴백. */}
                            {filteredStories.map((e: LeagueEvent) => {
                                const selected = e.id === selectedEvent?.id;
                                return (
                                    <div
                                        key={e.id}
                                        onClick={() => setSelectedEventId(e.id)}
                                        className={`flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b border-slate-800/50 text-sm ko-normal transition-colors ${
                                            selected ? 'bg-slate-700 text-white' : 'bg-slate-900 hover:bg-white/5'
                                        }`}
                                    >
                                        <span className={`flex-1 min-w-0 truncate leading-snug ${selected ? 'text-white' : 'text-slate-300'}`}>{e.headline}</span>
                                        <span className={`shrink-0 text-sm tabular-nums ${selected ? 'text-white' : 'text-slate-300'}`}>{e.simDate ? formatSimDateShort(e.simDate) : formatRelativeTime(e.createdAt)}</span>
                                    </div>
                                );
                            })}
                            {hasMore && (
                                <div className="p-3">
                                    <button
                                        onClick={() => fetchNextPage()}
                                        disabled={isFetchingNextPage}
                                        className="w-full px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 ko-normal"
                                    >
                                        {isFetchingNextPage ? '불러오는 중...' : '더 보기'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-slate-900 p-10">
                    {selectedEvent ? (
                        <StoryCard
                            event={selectedEvent} teamBySlug={teamBySlug} playerCardMap={playerCardMap}
                            roomId={room?.id}
                            onOpenGame={openGame} onPlayerClick={openPlayer} onOpenTeam={openTeam}
                            onOpenAllStar={openAllStar}
                        />
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-600 text-sm ko-normal">선택된 소식이 없습니다.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MultiNewsFeedView;

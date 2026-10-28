import React, { useMemo } from 'react';
import { Spinner } from '../../../components/common/Spinner';
import { Outlet, useLocation, useParams } from 'react-router-dom';

import { MultiSidebar } from '../../../components/MultiSidebar';
import { MultiHeader } from '../../../components/MultiHeader';
import { TournamentChampionModal } from '../../../components/multi/TournamentChampionModal';
import { useSeasonContext } from './seasonContext';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { GameDateStrip, type TeamStripInfo } from './GameDateStrip';
import LeagueLobbyPanel from './LeagueLobbyPanel';
import { MultiTeamHoverProvider } from './MultiTeamHoverCard';
import type { Game } from '../../../types';
import { useAllStarTeamDisplay } from '../../../hooks/useAllStarTeamDisplay';
import { getAllStarKeyDates } from '../../../utils/allStarSelection';
import { useViewportClass } from '../../../hooks/useViewportClass';
import { MobileTopBar } from '../../../components/mobile/MobileTopBar';
import { MobileTabBar, SEASON_SCROLL_ID, MOBILE_TAB_BAR_HEIGHT } from '../../../components/mobile/MobileTabBar';
import { TabletNavRail } from '../../../components/mobile/TabletNavRail';

// 스트립 전용 고정 약어 — 라이징스타 약어(주장 성)는 로스터 로딩 후 바뀌므로 쓰지 않는다.
const STRIP_ALLSTAR_ABBR: Record<string, string> = {
    'EAST-ALLSTAR': 'EAST', 'WEST-ALLSTAR': 'WEST', 'RISINGSTARS-A': 'RS-A', 'RISINGSTARS-B': 'RS-B',
};

/**
 * 시즌 서브라우트(로스터/순위/일정/리더보드/전술/경기) 공유 레이아웃.
 * 시즌 데이터(useMultiGameData) 자체는 이제 LeagueLayout에서 리그 진입 시 1회만 로드하고
 * SeasonCtx로 내려준다 — 여기서는 그 컨텍스트를 그대로 소비만 한다. 로비/설정 화면을 오가며
 * 이 레이아웃이 언마운트→재마운트돼도(시즌 섹션을 벗어났다 돌아와도) 데이터를 다시 불러오지
 * 않는다. 아래 로딩 게이트는 리그 진입 직후처럼 아직 시즌 데이터 로드가 안 끝난 채로 URL을
 * 통해 곧바로 시즌 라우트에 진입한 경우를 위한 안전장치다.
 *
 * [2026-08-28] "오늘 경기 목록" 스트립(GameDateStrip, 원래 MultiGamePbpView.tsx 안에만
 * 있던 컴포넌트)을 헤더 바로 아래에 전역으로 배치 — 로스터/리더보드/일정 등 모든 시즌
 * 화면에서 바로 다른 경기로 넘어갈 수 있게 됨. GameDateStrip.tsx로 분리해서 여기와
 * MultiGamePbpView 양쪽에서 재사용 가능하게 만들었고, 경기 관람 화면(MultiGamePbpView)은
 * 이제 자체적으로 이 스트립을 그리지 않는다(중복 방지).
 *
 * [2026-10-27] 모바일 셸(docs/ui/mobile-design-system.md §8) — 뷰포트 등급으로 셸을 가른다.
 *   phone(<768)   : MobileTopBar 56 + (홈에서만) GameDateStrip phone 64/접힘 32 + 본문 + MobileTabBar 56(fixed)
 *   tablet(768~1023): TabletNavRail 72 + MobileTopBar + (홈에서만) 스트립 + 본문
 *   desktop(≥1024): 현행 그대로(MultiSidebar 40 + MultiHeader + GameDateStrip 75) — 픽셀 변화 0
 */
export function MultiSeasonLayout() {
    const location = useLocation();
    // leagueId는 반드시 URL에서 그대로 echo — league.id/room.league_id(DB PK, 진짜 UUID)를
    // 쓰면 라우팅 전용 별칭인 leagues.short_code 대신 UUID가 그대로 주소창에 노출되는 회귀가
    // 생긴다(선수 프로필 브레드크럼 드롭다운에서 겪었던 것과 동일한 버그 — MultiRosterView 등
    // 다른 화면들도 전부 이 패턴).
    const { leagueId } = useParams<{ leagueId: string }>();
    // "/season" 인덱스 라우트(트레일링 슬래시 허용) — 로터리/드래프트가 아직 끝나지 않은
    // 리그는 이 라우트에서 (사이드바/헤더는 그대로 유지한 채) 본문만 LeagueLobbyPanel로
    // 바뀐다(기존 별도 라우트였던 /lobby를 대체 — 사용자 요청으로 리그 홈에 통합, 사이드바를
    // 숨기는 안은 검토 후 기각하고 정규 레이아웃을 그대로 쓰기로 함). in_progress/finished가
    // 되면 league.status 변경이 realtime으로 반영되어 자동으로 정규 대시보드(MultiSeasonPage)
    // 로 전환된다.
    const isSeasonIndexRoute = /\/season\/?$/.test(location.pathname);
    // 경기 관람 화면일 때만 URL에서 gameId(짧은 코드 또는 원래 game_id)를 뽑아 스트립에서
    // "현재 보고 있는 경기" 카드를 하이라이트한다. 다른 화면에서는 undefined — 스트립은
    // 이 경우 그냥 가장 최근 날짜의 경기 목록만 보여주고 아무 카드도 강조하지 않는다.
    const watchingGameUrlId = location.pathname.match(/\/season\/game\/([^/]+)$/)?.[1];
    const isGameRoute = !!watchingGameUrlId;
    // 팀 화면(roster)은 폰에서 팀색 H3 헤더를 RosterView가 직접 그린다(§8-3) → 공용 상단 바 생략.
    const isRosterRoute = /\/season\/roster\/?$/.test(location.pathname);
    // [2026-10-27] 뉴스피드(news)도 폰에서 자체 H4 push 헤더(MobilePushHeader)를 그린다(§9-1-10) → 상단 바 생략.
    // [2026-10-28] 전술(tactics)도 팀색 H3 헤더를 MultiTacticsView가 직접 그린다(§9-1-11).
    // 리더보드는 순위표와 동위 화면이라 공용 상단 바 유지(2026-10-28 사용자 결정) — 화면 헤더 44만 자체 렌더.
    // [2026-10-28] 경기 화면(season/game/:id)도 ‹ + 날짜·단계 H4를 MultiGamePbpView가 직접 그린다(§9-7).
    // [2026-10-28] 선수 프로필(season/player/:id)도 브레드크럼 바가 폰 상단 바(§9-2) — 하단 여백도 화면이 직접(루트 padding)
    const isPlayerRoute = /\/season\/player\/[^/]+\/?$/.test(location.pathname);
    const hasOwnPhoneHeader = isRosterRoute || isPlayerRoute || /\/season\/(news|tactics)\/?$/.test(location.pathname) || /\/season\/game\/[^/]+\/?$/.test(location.pathname);

    const gameData = useSeasonContext();
    const { room, league, leagueTeams , timeline } = useLeagueContext();
    const { session } = useGame();
    const { getGameUrlId, resolveGameId } = useGameShortCodes(room?.id);
    const allstarDisplay = useAllStarTeamDisplay(room?.id, room?.season_number);
    const viewport = useViewportClass();

    // GameDateStrip용 — team_slug → 팀 표시정보 맵 (MultiGamePbpView.tsx가 쓰던 것과 동일).
    const stripTeamMap = useMemo(() => {
        const m: Record<string, TeamStripInfo> = {};
        for (const t of leagueTeams) m[t.team_slug] = t;
        // 올스타/라이징스타 가상 팀(league_teams에 없음) 표시 정보 보강
        for (const [id, info] of Object.entries(allstarDisplay)) {
            // 스트립 약어는 고정값 — 로스터 로딩 전후로 값이 바뀌지 않게 한다(라이징스타 info.abbr는 주장 성이라 가변).
            if (!m[id]) m[id] = { team_name: info.name, team_abbr: STRIP_ALLSTAR_ABBR[id] ?? info.abbr, color_primary: info.colorPrimary, color_text: info.colorText };
        }
        return m;
    }, [leagueTeams, allstarDisplay]);

    // 스트립 날짜 목록에 추가로 표시할 올스타 경기일(경기 행이 생기기 전에도 보이도록).
    const virtualSeasonYear = league?.virtual_season_year;
    const seasonCalendar = league?.season_calendar;
    const isMainLeague = league?.type === 'main_league';
    // [2026-10-23] 시즌 진행 전(모집·드래프트)엔 정규시즌 경기가 없어 스트립에 올스타 날짜만 남으므로 진행 중/종료 리그에서만.
    const isSeasonStarted = league?.status === 'in_progress' || league?.status === 'finished';
    const stripEventDates = useMemo(() => {
        if (!isMainLeague || !isSeasonStarted) return [];
        const kd = getAllStarKeyDates(virtualSeasonYear ?? new Date().getFullYear(), seasonCalendar);
        return [
            { dateKey: kd.allStarRisingStarsDate, label: '라이징스타 챌린지', time: '19:00', awayId: 'RISINGSTARS-B', homeId: 'RISINGSTARS-A' },
            { dateKey: kd.allStarMainGameDate, label: '올스타 본경기', time: '20:30', awayId: 'WEST-ALLSTAR', homeId: 'EAST-ALLSTAR' },
        ];
    }, [isMainLeague, isSeasonStarted, virtualSeasonYear, seasonCalendar]);

    const currentGameId = watchingGameUrlId ? resolveGameId(watchingGameUrlId) : undefined;

    if (gameData.isLoading) {
        return (
            <Spinner variant="page" className="bg-gray-950" />
        );
    }

    // 로터리/드래프트 완료 전(recruiting/drafting) 리그의 홈(인덱스) 라우트에서는 사이드바/
    // 헤더는 그대로 두고 본문(Outlet 자리)만 LeagueLobbyPanel로 대체한다. 다른 서브라우트
    // (설정 등)는 이 분기와 무관하게 항상 Outlet을 그대로 렌더.
    const isActive = league?.status === 'in_progress' || league?.status === 'finished';
    const showLobbyPanel = !isActive && isSeasonIndexRoute;

    const stripProps = {
        leagueId,
        currentGameId,
        schedule: gameData.schedule as Game[],
        teamMap: stripTeamMap,
        simStart: league?.sim_real_start_at ?? null,
        gprd: league?.games_per_real_day ?? 5,
        bracketData: league?.bracket_data,
        roomId: room?.id,
        accessToken: session?.access_token,
        getGameUrlId,
        preferVirtual: league?.type === 'main_league',
        timeline,
        eventDates: stripEventDates,
    };
    const body = showLobbyPanel ? <LeagueLobbyPanel /> : <Outlet />;

    if (viewport === 'phone') {
        // 홈 탭(시즌 인덱스)에서만 스트립. 스트립은 고정(sticky)하지 않고 본문과 함께 스크롤된다 — 자동 접힘은 뚝 끊겨 보여 폐기
        // (2026-10-27 사용자 지시). 라이브 경기 화면은 takeover라 탭 바가 숨고(MobileTabBar 내부 판정) 하단 여백도 뺀다.
        const showStrip = isSeasonIndexRoute && isActive;
        return (
            <MultiTeamHoverProvider>
            <div className="flex flex-col h-dvh overflow-hidden bg-slate-950">
                {!hasOwnPhoneHeader && <MobileTopBar />}
                <div id={SEASON_SCROLL_ID} className="flex-1 overflow-y-auto custom-scrollbar">
                    {showStrip && <GameDateStrip {...stripProps} variant="phone" />}
                    {body}
                    {!isGameRoute && !isPlayerRoute && <div aria-hidden="true" className="pb-safe" style={{ height: MOBILE_TAB_BAR_HEIGHT }} />}
                </div>
                <MobileTabBar />
                <TournamentChampionModal />
            </div>
            </MultiTeamHoverProvider>
        );
    }

    if (viewport === 'tablet') {
        return (
            <MultiTeamHoverProvider>
            <div className="flex h-dvh overflow-hidden bg-slate-950">
                <TabletNavRail />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <MobileTopBar />
                    {isSeasonIndexRoute && isActive && <GameDateStrip {...stripProps} />}
                    <div id={SEASON_SCROLL_ID} className="flex-1 overflow-y-auto custom-scrollbar">
                        {body}
                    </div>
                </div>
                <TournamentChampionModal />
            </div>
            </MultiTeamHoverProvider>
        );
    }

    return (
        <MultiTeamHoverProvider>
        <div className="flex h-screen overflow-hidden bg-slate-950">
            <MultiSidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <MultiHeader />
                <GameDateStrip {...stripProps} />
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {body}
                </div>
            </div>
            <TournamentChampionModal />
        </div>
        </MultiTeamHoverProvider>
    );
}

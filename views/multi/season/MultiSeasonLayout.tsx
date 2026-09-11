
import React, { useMemo } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { MultiSidebar } from '../../../components/MultiSidebar';
import { MultiHeader } from '../../../components/MultiHeader';
import { TournamentChampionModal } from '../../../components/multi/TournamentChampionModal';
import { useSeasonContext } from './seasonContext';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { GameDateStrip, type TeamStripInfo } from './GameDateStrip';
import LeagueLobbyPanel from './LeagueLobbyPanel';
import type { Game } from '../../../types';

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
 */
export function MultiSeasonLayout() {
    const location = useLocation();
    // leagueId는 반드시 URL에서 그대로 echo — league.id/room.league_id(DB PK, 진짜 UUID)를
    // 쓰면 라우팅 전용 별칭인 leagues.short_code 대신 UUID가 그대로 주소창에 노출되는 회귀가
    // 생긴다(선수 프로필 브레드크럼 드롭다운에서 겪었던 것과 동일한 버그 — MultiRosterView 등
    // 다른 화면들도 전부 이 패턴).
    const { leagueId } = useParams<{ leagueId: string }>();
    // 경기 관람 화면(game/:gameId)에서는 헤더를 숨겨 화면을 넓게 쓴다 — 스트립은 이 경우에도
    // 계속 보여야 하므로 아래 GameDateStrip 렌더는 이 조건과 무관하게 항상 실행한다.
    const isWatchingGame = /\/season\/game\/[^/]+$/.test(location.pathname);
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

    const gameData = useSeasonContext();
    const { room, league, leagueTeams } = useLeagueContext();
    const { session } = useGame();
    const { getGameUrlId, resolveGameId } = useGameShortCodes(room?.id);

    // GameDateStrip용 — team_slug → 팀 표시정보 맵 (MultiGamePbpView.tsx가 쓰던 것과 동일).
    const stripTeamMap = useMemo(() => {
        const m: Record<string, TeamStripInfo> = {};
        for (const t of leagueTeams) m[t.team_slug] = t;
        return m;
    }, [leagueTeams]);

    const currentGameId = watchingGameUrlId ? resolveGameId(watchingGameUrlId) : undefined;

    if (gameData.isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-screen bg-gray-950">
                <Loader2 size={32} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    // 로터리/드래프트 완료 전(recruiting/drafting) 리그의 홈(인덱스) 라우트에서는 사이드바/
    // 헤더는 그대로 두고 본문(Outlet 자리)만 LeagueLobbyPanel로 대체한다. 다른 서브라우트
    // (설정 등)는 이 분기와 무관하게 항상 Outlet을 그대로 렌더.
    const isActive = league?.status === 'in_progress' || league?.status === 'finished';
    const showLobbyPanel = !isActive && isSeasonIndexRoute;

    return (
        <div className="flex h-screen overflow-hidden bg-slate-950">
            <MultiSidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                {!isWatchingGame && <MultiHeader />}
                <GameDateStrip
                    leagueId={leagueId}
                    currentGameId={currentGameId}
                    schedule={gameData.schedule as Game[]}
                    teamMap={stripTeamMap}
                    simStart={league?.sim_real_start_at ?? null}
                    gprd={league?.games_per_real_day ?? 5}
                    bracketData={league?.bracket_data}
                    roomId={room?.id}
                    accessToken={session?.access_token}
                    getGameUrlId={getGameUrlId}
                    preferVirtual={league?.type === 'main_league'}
                />
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {showLobbyPanel ? <LeagueLobbyPanel /> : <Outlet />}
                </div>
            </div>
            <TournamentChampionModal />
        </div>
    );
}

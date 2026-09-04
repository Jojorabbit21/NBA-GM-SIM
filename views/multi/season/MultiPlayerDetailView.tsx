
import React, { useMemo, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useLeagueRawStats, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { usePlayerShotEvents } from '../../../hooks/usePlayerShotEvents';
import { usePlayerTransactionHistory } from '../../../hooks/usePlayerTransactionHistory';
import { usePlayerCareerHistory } from '../../../hooks/usePlayerCareerHistory';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { PlayerDetailView } from '../../PlayerDetailView';
import { buildLeagueTeams } from '../../../services/multi/buildLeagueTeams';
import { buildActiveInjurySeverityMap } from '../../../services/multi/activeInjuryStatus';
import { resolveRealAt, isFinal } from './multiGameReveal';
import { findCurrentVirtualDate } from './multiScheduleUtils';
import { getServerNow } from '../../../utils/serverClock';
import { computeMultiStandingsStats } from './multiSeasonUtils';
import { runAwardVoting } from '../../../utils/awardVoting';
import { stampSeasonAwards } from '../../../utils/awardStamper';
import type { Team, Game } from '../../../types';

// 멀티플레이어 선수 프로필 전용 캐노니컬 라우트(/multi/leagues/:leagueId/season/player/:playerId).
// 로스터/리더보드/인사이트 탭/헤더 검색 등 어디서 선수 이름을 클릭하든 전부 이 화면으로
// navigate한다 — 화면마다 로컬 state나 쿼리파라미터로 PlayerDetailView를 끼워 넣던 방식은
// (1) 브라우저 뒤로가기가 안 먹히거나 화면을 건너뛰고, (2) 새로고침 시 사라지고,
// (3) 링크 공유가 안 되는 문제가 있었다 — 진짜 라우트로 분리해 세 가지 문제를 한 번에 해결.
//
// [2026-08-28] URL의 :playerId는 DB UUID가 아니라 usePlayerShortCodes()가 매기는
// 짧은 번호(1, 2, 3…)다. meta_players 정렬 순서 기반이라 리그와 무관하게 항상 같은
// 값(전 리그 공용) — 라우트 진입 시 resolvePlayerId로 UUID로 되돌리고, 이 화면에서
// URL을 만드는 쪽(드롭다운 handleSelectPlayer)은 반대로 getPlayerUrlId로 번호를 만든다.
//
// [2026-08-27] 계약/수상/부상 3개 섹션을 다시 켬(사용자 요청 — 프로필 3열 개편의 중간열).
// `player.contract`는 dataMapper.ts가 단일/멀티 공용으로 채워주므로 정상 표시된다.
// `player.awards`는 아래 `teamsWithAwards`에서 싱글플레이어와 동일한 투표 엔진
// (runAwardVoting/stampSeasonAwards)을 클라이언트에서 즉석 계산해 채운다.
// `player.injuryHistory`는 [2026-09-03]부터 서버(simRunner.ts)가 room_player_state 테이블에
// 기록한 이력을 buildLeagueTeams.ts가 merge해 채운다(useLeagueRawStats의 playerInjuryRows).
// 단, 그 테이블에 아직 아무 경기도 기록되지 않은 리그(부상 시스템 비활성 포함)는 배열이
// 비어 있어 "정보 없음" 플레이스홀더가 그대로 뜬다 — 정상 동작.
const HIDE_SECTIONS: Array<'contract' | 'awards' | 'injuryHistory'> = [];

const MultiPlayerDetailView: React.FC = () => {
    const { league, leagueTeams, room, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const { isLoading: gameLoading, schedule, myTeamId, tendencySeed, currentSimDate: roomSimDate } = useSeasonContext();
    // MultiRosterView.tsx/MultiTacticsView.tsx와 동일한 preferVirtual 패턴 — room.sim_date는
    // 실제 KST 날짜라 메인리그(가상 NBA 캘린더)의 "지금 활성 부상인지" 판정에 직접 쓰면
    // 어긋난다. 아래 activeInjuryByPlayer 계산에서만 쓰인다.
    const simStartForInjury = league?.sim_real_start_at ?? null;
    const gprdForInjury     = league?.games_per_real_day ?? 5;
    const preferVirtualForInjury = league?.type === 'main_league';
    const currentSimDate = useMemo(() => {
        if (!preferVirtualForInjury) return roomSimDate;
        return findCurrentVirtualDate(schedule, simStartForInjury, gprdForInjury, getServerNow()) ?? roomSimDate;
    }, [preferVirtualForInjury, roomSimDate, schedule, simStartForInjury, gprdForInjury]);
    // URL에는 DB UUID 대신 meta_players 정렬 순서 기반 번호(1, 2, 3…)가 노출된다 —
    // 실제 매칭/필터링에 쓰는 playerId는 아래에서 resolvePlayerId로 UUID로 되돌린 값.
    // leagueId는 반드시 URL에서 그대로 echo — league.id(DB PK, 진짜 UUID)를 쓰면 라우팅
    // 전용 별칭인 leagues.short_code 대신 UUID가 그대로 주소창에 노출되는 회귀가 생긴다
    // (다른 화면들(MultiRosterView 등)도 전부 이 패턴 — leagueId는 항상 useParams에서만 읽는다).
    const { leagueId, playerId: playerUrlId } = useParams<{ leagueId: string; playerId: string }>();
    const { getPlayerUrlId, resolvePlayerId, isLoading: shortCodesLoading } = usePlayerShortCodes();
    const playerId = playerUrlId ? resolvePlayerId(playerUrlId) : undefined;
    const navigate = useNavigate();
    const { getGameUrlId } = useGameShortCodes(room?.id);

    // [2026-09-03] "자유 계약 페이지의 선수들도 개인 프로필 페이지가 필요해" 요청 — 이 화면은
    // 원래 로스터에 있는 선수만 찾았음(아래 found). 드래프트풀 전체(로스터에 없는 FA 포함)는
    // MultiFreeAgentView.tsx와 동일하게 useMultiSearchData()의 poolPlayers로 조회 가능 —
    // found가 안 잡히면 이걸로 한 번 더 찾는다(faPlayer, 아래 참고).
    const { poolPlayers } = useMultiSearchData(league, leagueTeams);

    // "최근 경기" 테이블의 RESULT 점수 클릭 시 해당 경기 박스스코어(경기 관람 화면)로 이동.
    const handleGameClick = useCallback((gameId: string) => {
        if (!leagueId) return;
        navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(gameId)}`);
    }, [navigate, leagueId, getGameUrlId]);

    // 브레드크럼 팀/선수 드롭다운으로 다른 선수를 선택했을 때 — 로컬 state만 바꾸면
    // 주소창의 playerId가 그대로 남아 새로고침/뒤로가기/공유가 깨진다(이 화면을 캐노니컬
    // 라우트로 분리한 취지 자체가 그 문제를 없애는 것이었음). 반드시 navigate로 URL도 같이 바꾼다.
    const handleSelectPlayer = useCallback((newPlayerId: string) => {
        if (!leagueId) return;
        navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(newPlayerId)}`);
    }, [navigate, leagueId, getPlayerUrlId]);

    // 다른 시즌 화면들(로스터/리더보드/인사이트)과 queryKey(room.id + 전체 로스터 id)가 같은
    // useLeagueRawStats라, 그 중 아무 화면이나 먼저 방문했다면 캐시를 그대로 재사용해
    // 로더 없이 즉시 뜬다.
    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );

    // [2026-09-03] "프로필 헤더에 부상/출장정지 배지" 요청 — buildLeagueTeams()는
    // injuryHistory(이력)만 merge하고 "지금 활성 부상인지"(activeInjurySeverity 등)는
    // 채우지 않는다(player.health는 forceHealthy=true로 항상 'Healthy'라 그걸로는 판정
    // 불가). MultiRosterView.tsx/MultiTacticsView.tsx와 동일하게
    // buildActiveInjurySeverityMap()으로 한 번 더 덧씌운다.
    const selectLeagueTeams = useCallback(
        (raw: LeagueRawStatsData): Team[] => {
            const builtTeams = buildLeagueTeams(raw, leagueTeams, useCustomOverrides);
            const teamIdByPlayer = new Map<string, string>();
            for (const lt of leagueTeams) for (const id of (lt.roster ?? [])) teamIdByPlayer.set(id, lt.team_slug);
            const activeInjuryByPlayer = buildActiveInjurySeverityMap(raw.playerInjuryRows, currentSimDate, room?.season_number, {
                schedule: schedule as { homeTeamId: string; awayTeamId: string; date: string; played: boolean }[],
                getTeamId: id => teamIdByPlayer.get(id),
            });
            return builtTeams.map(t => ({
                ...t,
                roster: t.roster.map(p => {
                    const injuryStatus = activeInjuryByPlayer.get(p.id);
                    if (!injuryStatus) return p;
                    return {
                        ...p,
                        activeInjurySeverity: injuryStatus.severity,
                        injuryType: injuryStatus.injuryType,
                        activeInjuryDuration: injuryStatus.duration,
                        returnDate: injuryStatus.returnDate ?? undefined,
                    };
                }),
            }));
        },
        [leagueTeams, useCustomOverrides, currentSimDate, room?.season_number, schedule],
    );

    const { data: teams = [], isPending: fetchLoading } = useLeagueRawStats(room?.id, allRosterIds, selectLeagueTeams);

    // "최근 경기" 위젯(PlayerDetailView 위젯 C)용 — PlayerDetailView가 externalGameLog 없이
    // 자체 usePlayerGameLog로 폴백하면 user_game_results/user_playoffs_results(싱글플레이어
    // 전용 테이블)를 조회해 멀티플레이어에서는 항상 빈 배열이 나와 위젯 자체가 안 뜬다
    // (그 위젯은 gameLog.length > 0일 때만 렌더). game_pbp에서 이 선수의 박스스코어가 있는
    // 경기만 뽑아 동일한 셰이프({date, opponentId, isHome, teamScore, opponentScore, ...박스})로
    // 직접 구성해서 넘긴다. queryKey가 같은 useLeagueRawStats라 위 teams 조회와 캐시를 공유.
    const selectPlayerGameLog = useCallback((raw: LeagueRawStatsData) => {
        if (!playerId) return [];
        const now = getServerNow();
        // game_start_time은 "방송 시각"(실제 현실 UTC 타임스탬프, sim_real_start_at 기준 —
        // 리빌 게이팅 전용)이지 시뮬레이션 상의 가상 NBA 날짜가 아니다. 가상 날짜는
        // schedule(Game[])의 .date 필드에 있으므로 game_id로 매칭해서 가져온다.
        const dateByGameId = new Map((schedule as Game[]).map(g => [g.id, g.date]));
        const rows: any[] = [];
        for (const row of raw.pbpRows as any[]) {
            if (!isFinal({ scheduledAt: row.game_start_time, played: true }, now)) continue;
            const sides = [
                { box: row.home_box ?? [], oppTeamId: row.away_team_id, isHome: true, teamScore: row.home_score, opponentScore: row.away_score },
                { box: row.away_box ?? [], oppTeamId: row.home_team_id, isHome: false, teamScore: row.away_score, opponentScore: row.home_score },
            ];
            for (const side of sides) {
                const bs = (side.box as any[]).find(b => b.playerId === playerId);
                if (!bs || bs.mp <= 0) continue;
                rows.push({
                    gameId: row.game_id,
                    date: dateByGameId.get(row.game_id) ?? (row.game_start_time ?? '').slice(0, 10),
                    opponentId: side.oppTeamId,
                    isHome: side.isHome,
                    teamScore: side.teamScore,
                    opponentScore: side.opponentScore,
                    isPlayoff: false,
                    ...bs,
                });
            }
        }
        return rows.sort((a, b) => b.date.localeCompare(a.date));
    }, [playerId, schedule]);

    const { data: playerGameLog = [], isPending: gameLogPending } = useLeagueRawStats(room?.id, allRosterIds, selectPlayerGameLog);

    // "샷 차트" 탭용 — 이 선수의 개별 슛 이벤트(x/y 좌표 포함, courtCoordinates.ts 기준
    // 풀코트 x:0~94ft/y:0~50ft)만 서버 RPC로 걸러서 가져온다(usePlayerShotEvents.ts 참고
    // — room 전체 게임을 클라이언트로 끌고 와 필터링하면 시즌 전체 슛 데이터를 통째로
    // 전송하게 돼 너무 무겁다는 걸 확인하고 RPC 방식으로 교체함).
    const { data: playerShotEvents = [] } = usePlayerShotEvents(room?.id, playerId);

    // "선수 이동 내역" 위젯용 — 드래프트+성사된 트레이드(services/multi/playerHistoryService.ts).
    const { data: transactionHistory = [] } = usePlayerTransactionHistory(room?.id, playerId, leagueTeams);

    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    const normalizedSchedule = useMemo(
        () => (schedule as Game[]).map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt })),
        [schedule, simStart, gprd],
    );

    // "수상 내역" 위젯용 — 정규시즌 MVP/DPOY/All-NBA/All-Defensive를 클라이언트에서 즉석 계산.
    // 서버 사이드에 별도 어워드 투표 파이프라인이 없어(싱글플레이어만 존재), 이미 로드된
    // 리그 전체 로스터+시즌 누적 스탯(teams)에 싱글플레이어와 동일한 투표 엔진(runAwardVoting)을
    // 그대로 재사용. buildLeagueTeams()는 이 화면에서 wins/losses가 필요 없어 0으로 고정해두므로,
    // MVP 스코어 공식이 크게 의존하는 팀 승률(_winPct)을 위해 스탠딩 계산(computeMultiStandingsStats,
    // MultiStandingsView와 동일 로직)으로 실제 정규시즌 전적을 따로 구해 덮어씌운다.
    // seed는 room.id+season 고정이라 같은 리그·시즌이면 누가 언제 봐도 항상 같은 결과가 나온다
    // (Date.now() 폴백 시드를 쓰면 새로고침마다 MVP가 바뀌는 문제 방지).
    const teamsWithAwards = useMemo(() => {
        if (teams.length === 0) return teams;
        const slugs = teams.map(t => t.id);
        const records = computeMultiStandingsStats(slugs, normalizedSchedule, getServerNow());
        const withRecords: Team[] = teams.map(t => ({
            ...t,
            wins: records[t.id]?.wins ?? 0,
            losses: records[t.id]?.losses ?? 0,
        }));
        const season = room?.season ?? '2025-26';
        const content = runAwardVoting(withRecords, `${room?.id}_${season}_awards`);
        stampSeasonAwards(withRecords, content, season);
        return withRecords;
    }, [teams, normalizedSchedule, room?.id, room?.season]);

    // shortCodesLoading도 게이트에 포함 — 안 그러면 매핑이 뜨기 전에 "!found"로 오판해
    // 유효한 번호인데도 즉시 뒤로가기(navigate(-1))가 발동해버린다.
    const isLoading = leagueLoading || gameLoading || fetchLoading || shortCodesLoading;

    // found는 훅(usePlayerCareerHistory) 아래 병합 로직에 필요해 로딩 게이트보다 먼저
    // 계산한다(Hooks는 항상 동일한 순서로 호출돼야 하므로 이 계산 자체는 조건부 return
    // 이전에 있어야 함 — teamsWithAwards가 로딩 중엔 빈 배열이라 found도 자연히 undefined,
    // 문제 없음).
    const found = teamsWithAwards
        .flatMap(t => t.roster.map(p => ({ player: p, team: t })))
        .find(x => x.player.id === playerId);

    // [2026-09-03] "FA 선수 커리어 기록, targeted-fetch로" 요청 — 드래프트풀 전체를 도는
    // useMultiSearchData/poolPlayers는 career_history 컬럼을 아예 안 가져온다(목록 화면에
    // 불필요한 페이로드를 막기 위함, hooks/usePlayerCareerHistory.ts 주석 참고). 로스터에서
    // 못 찾은 경우(=FA일 가능성)에만, 지금 보고 있는 이 선수 한 명만 별도로 조회한다.
    //
    // [버그 수정] enabled를 `!isLoading && !found`로 뒀더니 클라이언트 라우팅(뒤로가기 후
    // 재진입)으로 들어오면 정상 표시되는데, 하드 리프레시(콜드 로드)로 이 URL에 바로
    // 진입하면 안 뜨는 문제가 있었다 — found는 teamsWithAwards(useLeagueRawStats 기반)에
    // 의존하는데, 콜드 로드 시 여러 쿼리(useMultiSearchData/useLeagueRawStats/
    // usePlayerShortCodes)가 동시에 풀리면서 isLoading이 false가 되는 시점과 found가
    // "확정"되는 시점 사이에 미묘한 렌더 타이밍 차이가 생겨(리그 데이터를 재사용하는
    // 클라이언트 내비게이션과 달리 전부 새로 fetch됨) enabled가 원하는 타이밍에 true로
    // 안 걸리는 경우가 있었던 것으로 보임. found/teamsWithAwards 타이밍에 의존하지 않도록
    // playerId만 준비되면(shortCodesLoading만 확인) 무조건 켠다 — 로스터 선수라도 한 행짜리
    // 저비용 조회라 낭비가 미미하고(merge는 !found일 때만 적용되므로 로스터 선수에겐 그냥
    // 안 쓰이고 버려짐), 대신 레이스 컨디션이 완전히 사라진다.
    const { data: faCareerHistory } = usePlayerCareerHistory(playerId, !shortCodesLoading);

    // 로스터에서 못 찾으면(어느 팀에도 없음) 드래프트풀 전체(poolPlayers)에서 FA로 한 번 더
    // 찾는다 — MultiFreeAgentView.tsx의 undraftedPlayers와 동일한 데이터 소스. 위에서 targeted로
    // 조회한 career_history를 여기서 덧씌운다(poolPlayers 자체엔 안 담겨있으므로).
    //
    // [버그 수정] useMemo 없이 매 렌더 `{ ...faPlayer, career_history }`로 새 객체를 만들면,
    // faCareerHistory가 늦게 도착해 이 컴포넌트가 다시 렌더될 때마다 PlayerDetailView에
    // 넘어가는 player prop의 참조가 계속 바뀐다. 그런데 PlayerDetailView.tsx는
    // `useState(playerProp)` + `useEffect(..., [playerProp.id, teamIdProp])`로 내부 상태를
    // 미러링해서 id가 같으면 재동기화를 안 하므로, "처음 진입 시엔 career_history 없는
    // 채로 굳어버리고 이후 새로고침해야만 보이는" 문제가 생겼다. useMemo로 참조를
    // 안정시키는 것만으로는 그 자체 버그를 못 고치지만(참조가 바뀌어야 재동기화되므로),
    // PlayerDetailView.tsx 쪽 effect 의존성도 함께 고쳐서(playerProp 전체를 보게) 두 수정이
    // 합쳐져야 완전히 해결된다.
    const faPlayer = useMemo(
        () => !found ? poolPlayers.find(p => p.id === playerId) : undefined,
        [found, poolPlayers, playerId],
    );
    const faPlayerWithCareer = useMemo(
        () => (faPlayer && faCareerHistory?.length ? { ...faPlayer, career_history: faCareerHistory } : faPlayer),
        [faPlayer, faCareerHistory],
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    if (!found && !faPlayerWithCareer) {
        // 잘못된/오래된 playerId로 직접 진입한 경우 — 이전 화면으로 되돌린다.
        navigate(-1);
        return null;
    }

    // PlayerDetailView는 teamId/teamName이 undefined면 그대로 "FA"로 표시하는 등 팀 없는
    // 선수를 이미 지원한다(싱글플레이어 pages/PlayerDetailPage.tsx의 isFA 케이스와 동일 패턴).
    const player = found?.player ?? faPlayerWithCareer!;
    const teamId = found?.team.id;
    const teamName = found?.team.name;

    return (
        <PlayerDetailView
            player={player}
            teamId={teamId}
            teamName={teamName}
            allTeams={teamsWithAwards}
            schedule={normalizedSchedule}
            tendencySeed={tendencySeed ?? undefined}
            seasonShort={room?.season ?? '2025-26'}
            myTeamId={myTeamId ?? undefined}
            onBack={() => navigate(-1)}
            onSelectPlayer={handleSelectPlayer}
            hideSections={HIDE_SECTIONS}
            externalGameLog={playerGameLog}
            externalGameLogLoading={gameLogPending}
            externalShotEvents={playerShotEvents}
            externalTransactionHistory={transactionHistory}
            onGameClick={handleGameClick}
        />
    );
};

export default MultiPlayerDetailView;

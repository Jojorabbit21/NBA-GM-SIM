
import React, { useMemo, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useLeagueRawStats, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { usePlayerShotEvents } from '../../../hooks/usePlayerShotEvents';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { PlayerDetailView } from '../../PlayerDetailView';
import { buildLeagueTeams } from '../../../services/multi/buildLeagueTeams';
import { resolveRealAt, isFinal } from './multiGameReveal';
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
// `player.injuryHistory`는 여전히 싱글플레이어 시뮬레이션 서비스(batchSeasonService.ts 등)
// 에서만 채워지고 멀티 서버 사이드 시뮬레이션에는 이력 로그가 없어("현재 부상 상태"만
// health/injuryType/returnDate로 갱신, 이력 배열은 없음) 당분간 "정보 없음" 플레이스홀더만
// 보인다(크래시 없이 안전하게 폴백) — 서버 사이드 부상 이력 기록 자체가 없어 클라이언트에서
// 즉석 계산으로 우회할 방법이 없다.
const HIDE_SECTIONS: Array<'contract' | 'awards' | 'injuryHistory'> = [];

const MultiPlayerDetailView: React.FC = () => {
    const { league, leagueTeams, room, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const { isLoading: gameLoading, schedule, myTeamId, tendencySeed } = useSeasonContext();
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

    const selectLeagueTeams = useCallback(
        (raw: LeagueRawStatsData): Team[] => buildLeagueTeams(raw, leagueTeams, useCustomOverrides),
        [leagueTeams, useCustomOverrides],
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    const found = teamsWithAwards
        .flatMap(t => t.roster.map(p => ({ player: p, team: t })))
        .find(x => x.player.id === playerId);

    if (!found) {
        // 잘못된/오래된 playerId로 직접 진입한 경우 — 이전 화면으로 되돌린다.
        navigate(-1);
        return null;
    }

    return (
        <PlayerDetailView
            player={found.player}
            teamId={found.team.id}
            teamName={found.team.name}
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
            onGameClick={handleGameClick}
        />
    );
};

export default MultiPlayerDetailView;

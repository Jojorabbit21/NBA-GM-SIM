
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Timer, Trophy, Tv } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../views/multi/league/LeagueLayout';
import { useGame } from '../hooks/useGameContext';
import { useSeasonContext } from '../views/multi/season/seasonContext';
import { useMultiSearchData } from '../hooks/useMultiSearchData';
import { usePlayerShortCodes } from '../hooks/usePlayerShortCodes';
import { useGameShortCodes } from '../hooks/useGameShortCodes';
import { usePersonalDraftStatus } from '../hooks/usePersonalDraftStatus';
import { resolveRealAt, isFinal, getGameDisplayState } from '../views/multi/season/multiGameReveal';
import { computeSeriesWins, seriesWinsFor } from '../views/multi/season/seasonPhase';
import { fmtRemaining } from '../utils/formatRemaining';
import { seasonShortFromDate } from '../utils/seasonShortFromDate';
import { findCurrentVirtualDate } from '../views/multi/season/multiScheduleUtils';
import { useServerClock } from '../utils/serverClock';
import { isAllStarWindowActive } from '../utils/allStarSelection';
import { usePlayoffRaceOpen } from '../hooks/usePlayoffRaceOpen';
import { MultiHeaderNavMenu } from './dashboard/MultiHeaderNavMenu';
import { useLeagueDraft } from '../hooks/useLeagueDraft';
import { getReadableTextColor } from '../utils/colorContrast';
import { TeamLogo } from './common/TeamLogo';
import { VirtualDayArc } from './VirtualDayArc';
import { SimTimetablePopup } from './SimTimetablePopup';
import { Button } from './common/Button';
import { getSeriesRoundLabel } from '../utils/playoffLogic';
import type { Player } from '../types';

// 남은 시간 포맷은 utils/formatRemaining.ts(홈 밴드 1 타이머와 공유). [2026-10-14 이동]

// 메인리그 정규시즌 경기의 date는 가상 NBA 캘린더 값(예: 2027년 10월 24일)이라 실제 연도와
// 다를 수 있다 — 연도를 함께 보여줘야 "가상 시즌"임이 명확해진다.
function fmtVirtualDate(dateKey: string): string {
    const d = new Date(dateKey + 'T00:00:00');
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export const MultiHeader: React.FC = () => {
    const { league, leagueTeams, members , timeline, isSpectator } = useLeagueContext();
    const { session } = useGame();
    const { schedule, roomId } = useSeasonContext();
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const base = `/multi/leagues/${leagueId}/season`;

    const myTeamId = useMemo(
        () => members.find(m => m.user_id === session?.user?.id)?.team_id ?? null,
        [members, session],
    );
    const myTeam = leagueTeams.find(t => t.team_slug === myTeamId);

    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;

    // [2026-09-18] 로컬 Date.now() → 서버 보정 시계. 다른 화면(스트립/일정/순위)은 전부 서버 보정
    // 시각을 쓰는데 헤더만 로컬 시계라, 로컬 시계가 어긋난 사용자에게 헤더 날짜와 스트립 상태가
    // 서로 다른 순간에 넘어가는 문제가 있었다.
    const nowMs = useServerClock();
    const [timetableAnchor, setTimetableAnchor] = useState<{ x: number; y: number } | null>(null);

    // [2026-09-07] nowMs는 1초마다 바뀌지만, 아래 스케줄 전체를 순회하는 계산들(순위/라이브
    // 경기/시리즈 전적/우승팀 판정)은 그렇게 자주 다시 스캔할 필요가 없다 — 실제 경기
    // 시뮬레이션 주기(수 분 단위)에 비하면 15초 지연은 체감상 무시할 수준. 초당 4회씩 시즌
    // 전체 스케줄(1000경기 이상)을 훑던 게 스크롤 중 프레임 드랍의 한 원인으로 지목돼,
    // 15초 버킷으로 낮춰 재계산 빈도를 1/15로 줄인다(원래 currentVirtualDate 한 곳에만
    // 쓰이던 패턴을 나머지 스케줄-스캔 메모에도 동일 적용).
    const dateBucket = Math.floor(nowMs / 15000);

    // W/L (정시+10분 경과 — final 상태인 경기만 집계, 스포일러 방지)
    const { wins, losses } = useMemo(() => {
        const wlMap: Record<string, { w: number; l: number }> = {};
        for (const g of schedule) {
            if (!g.played || g.homeScore == null || g.awayScore == null) continue;
            // 메인리그는 플레이오프를 제외한 정규시즌 기록만 집계 — 토너먼트는 모든 경기가
            // isPlayoff=true라서 이 조건을 그대로 적용하면 전체 경기가 통째로 빠져 항상 0W-0L이 된다.
            if (league?.type !== 'tournament' && g.isPlayoff) continue;
            const resolvedAt = resolveRealAt(g, simStart, gprd);
            if (!isFinal({ ...g, scheduledAt: resolvedAt }, nowMs)) continue;
            if (!wlMap[g.homeTeamId]) wlMap[g.homeTeamId] = { w: 0, l: 0 };
            if (!wlMap[g.awayTeamId]) wlMap[g.awayTeamId] = { w: 0, l: 0 };
            const homeWon = g.homeScore > g.awayScore;
            wlMap[g.homeTeamId][homeWon ? 'w' : 'l']++;
            wlMap[g.awayTeamId][homeWon ? 'l' : 'w']++;
        }
        if (!myTeamId) return { wins: 0, losses: 0 };

        const myWL = wlMap[myTeamId] ?? { w: 0, l: 0 };

        return { wins: myWL.w, losses: myWL.l };
    }, [schedule, myTeamId, league, simStart, gprd, dateBucket]);

    // 내 팀 다음 경기
    const nextGame = useMemo(() => {
        if (!myTeamId || !simStart) return null;
        return [...schedule]
            .filter(g => !g.played && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId))
            .map(g => ({ ...g, resolvedAt: resolveRealAt(g, simStart, gprd) }))
            .filter(g => g.resolvedAt != null)
            .sort((a, b) => new Date(a.resolvedAt!).getTime() - new Date(b.resolvedAt!).getTime())[0] ?? null;
    }, [schedule, myTeamId, simStart, gprd]);

    // 메인리그(main_league) 세션에서 표시할 "현재 시뮬레이션 날짜" — 가상 NBA 캘린더 기준.
    // 실제 실행 시각(scheduledAt)은 노출 금지이므로, 리그 전체 일정 중 지금(nowMs)과 가장
    // 가까운 실제 방송 시각을 가진 경기를 찾아 그 경기의 가상 date를 "오늘"로 간주한다
    // (내 팀에 다음 경기가 없어도 리그 전체 일정 기준으로는 항상 값이 나온다).
    // dateBucket 선언은 위(nowMs 선언 직후)로 옮김 — 아래뿐 아니라 순위/라이브경기/시리즈전적/
    // 우승팀 판정에도 공통으로 재사용(MultiGamePbpView.tsx의 revealBucket과 동일 패턴).
    const currentVirtualDate = useMemo(() => {
        if (league?.type !== 'main_league' || !simStart) return null;
        return findCurrentVirtualDate(schedule, simStart, gprd, dateBucket * 15000, timeline);
    }, [league, schedule, simStart, gprd, dateBucket, timeline]);

    // [2026-09-15 Fix] "올스타" 메뉴 노출 — 투표 시작일에 나타나고 브레이크 종료일에 사라진다.
    // currentVirtualDate를 이미 위에서 계산해두므로 추가 조회 없이 날짜 비교만 하면 된다.
    const showAllStar = isAllStarWindowActive(currentVirtualDate, league?.virtual_season_year ?? new Date().getFullYear(), league?.season_calendar);
    const showPlayoffRace = usePlayoffRaceOpen(schedule, currentVirtualDate, league?.type);

    const opponentId  = nextGame
        ? (nextGame.homeTeamId === myTeamId ? nextGame.awayTeamId : nextGame.homeTeamId)
        : null;
    const opponentTeam = leagueTeams.find(t => t.team_slug === opponentId);
    const isAway       = nextGame?.awayTeamId === myTeamId;

    // 다음 경기까지 남은 ms — 색상·문자열 둘 다 여기서 파생(매초 바뀌므로 useMemo 불필요).
    const nextGameDiffMs = nextGame?.resolvedAt ? new Date(nextGame.resolvedAt).getTime() - nowMs : null;
    const countdownColor = nextGameDiffMs == null || nextGameDiffMs > 3_600_000 ? 'text-indigo-400'   // 1시간 초과: 기본
        : nextGameDiffMs > 1_800_000 ? 'text-amber-400'                                                // 30분~1시간: 주의
        : nextGameDiffMs > 0 ? 'text-red-400' : 'text-indigo-400';                                     // 30분 미만: 긴박
    const countdown = nextGameDiffMs == null ? null : fmtRemaining(nextGameDiffMs, '경기 시작');

    // 내 팀의 현재 진행중(LIVE)인 경기 — played=true지만 리플레이 10분 공개창 안에 있는 경기.
    // nextGame은 !played만 찾으므로 이미 시뮬레이션된 LIVE 경기는 잡히지 않아 별도로 찾는다.
    const myLiveGame = useMemo(() => {
        if (!myTeamId) return null;
        return schedule.find(g => {
            if (!g.played || (g.homeTeamId !== myTeamId && g.awayTeamId !== myTeamId)) return false;
            const resolvedAt = resolveRealAt(g, simStart, gprd);
            return getGameDisplayState({ ...g, scheduledAt: resolvedAt }, nowMs) === 'live';
        }) ?? null;
    }, [schedule, myTeamId, simStart, gprd, dateBucket]);

    const liveOpponentId   = myLiveGame
        ? (myLiveGame.homeTeamId === myTeamId ? myLiveGame.awayTeamId : myLiveGame.homeTeamId)
        : null;
    const liveOpponentTeam = leagueTeams.find(t => t.team_slug === liveOpponentId);
    const isLiveAway       = myLiveGame?.awayTeamId === myTeamId;

    // 경기 URL은 다른 화면과 같이 짧은 코드로(매핑 없으면 game_id 폴백)
    const { getGameUrlId } = useGameShortCodes(roomId ?? undefined);
    const handleWatchLiveGame = useCallback(() => {
        if (!myLiveGame) return;
        navigate(`${base}/game/${getGameUrlId(myLiveGame.id)}`);
    }, [navigate, base, myLiveGame, getGameUrlId]);

    // 시리즈별 승수 집계 — schedule을 한 번만 돌아 seriesId → (teamId → 승수) 맵을 만든다.
    // 리플레이(10분) 공개 전 경기는 제외: 서버는 시뮬 직후 bracket_data.series를 즉시 갱신하므로
    // played만 보면 관전 화면에 진행 중인 결과가 새어나간다. 아래 seriesInfo / seasonStatus /
    // tournamentChampionId가 전부 이 맵을 조회한다(예전엔 셋이 각자 전체 스캔).
    // [2026-10-14] 집계 로직은 views/multi/season/seasonPhase.ts로 이동(홈 밴드 1 "리그 현황"과 공유). 의존성은 그대로
    // dateBucket(15초) — nowMs(1초)로 두면 매초 schedule 전체를 다시 돌게 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const seriesWins = useMemo(() => computeSeriesWins(schedule, simStart, gprd, nowMs), [schedule, simStart, gprd, dateBucket]);
    // 내 팀 기준 (내 승수, 상대 승수)
    const winsFor = useCallback((seriesId: string, teamId: string | null) => seriesWinsFor(seriesWins, seriesId, teamId), [seriesWins]);

    // 시리즈 정보 (토너먼트 경기일 때)
    const seriesInfo = useMemo(() => {
        if (!nextGame?.isPlayoff || !nextGame.seriesId) return null;
        const allSeries: any[] = (league?.bracket_data as any)?.series ?? [];
        const s = allSeries.find((x: any) => x.id === nextGame.seriesId);
        if (!s) return null;
        const { my: myWins, opp: oppWins } = winsFor(s.id, myTeamId);
        return { roundLabel: getSeriesRoundLabel(s, allSeries, { confPrefix: true }), myWins, oppWins, targetWins: s.targetWins ?? 1 };
    }, [nextGame, league, myTeamId, winsFor]);

    // 내 팀의 예정 경기/카운트다운이 없을 때 시즌정보 칸에 보여줄 "현재 상황" 문구.
    // 정규시즌 종료 / 플레이인·플레이오프 시리즈 대기 / 탈락 / 우승 등을 실제 데이터로 판정한다.
    // 시리즈 종료 여부는 bracket_data.winnerId(서버가 시뮬 직후 즉시 세팅)가 아니라 공개창이
    // 지난 경기만 센 승수로 판정 — 리플레이 중인 경기 결과가 헤더로 새지 않게 하기 위함.
    const seasonStatus = useMemo((): string | null => {
        if (!myTeamId || league?.type === 'tournament') return null;
        const allSeries: any[] = (league?.bracket_data as any)?.series ?? [];

        if (!allSeries.length) {
            const hasRemaining = schedule.some(g => !g.played && !g.isPlayoff
                && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId));
            return hasRemaining ? null : '정규시즌 종료 · 포스트시즌 대기';
        }

        const mine = allSeries.filter((x: any) => x.higherSeedId === myTeamId || x.lowerSeedId === myTeamId);
        if (!mine.length) return '포스트시즌 진출 실패 · 시즌 종료';

        const states = mine.map((x: any) => {
            const w = winsFor(x.id, myTeamId);
            const target = x.targetWins ?? 1;
            return { s: x, ...w, target, done: w.my >= target || w.opp >= target };
        });
        const active = states.find(x => !x.done);
        if (active) {
            const label = getSeriesRoundLabel(active.s, allSeries, { confPrefix: true });
            return active.target > 1
                ? `${label} ${active.my}-${active.opp} · 다음 경기 대기`
                : `${label} · 경기 대기`;
        }

        // 모든 시리즈 종료 — 가장 마지막(라운드 높은 쪽) 시리즈 결과로 판정.
        const last = [...states].sort((a, b) => (a.s.round ?? 0) - (b.s.round ?? 0)).pop()!;
        const label = getSeriesRoundLabel(last.s, allSeries, { confPrefix: true });
        const finalRound = Math.max(...allSeries.map((x: any) => x.round ?? 1));
        if (last.my > last.opp) {
            if ((last.s.round ?? 0) === finalRound && finalRound > 0) return '우승!';
            return last.s.round === 0 ? '플레이인 통과 · 1라운드 대기' : `${label} 승리 · 다음 라운드 대기`;
        }
        return last.s.round === 0 ? '플레이인 탈락 · 시즌 종료' : `${label} 탈락 · 시즌 종료`;
    }, [league, schedule, myTeamId, winsFor]);

    // 리그 전체에서 아직 안 치른 경기 중 가장 빠른 방송 시각 = "다음 경기일"까지의 목표 시각.
    // 내 팀 경기가 없는 날(정규시즌 종료 후 타팀 대기, 탈락 후 등)에 seasonStatus 옆 타이머로 쓴다.
    // 다음 라운드/플레이오프 경기가 아직 생성 전이면 null(타이머 숨김).
    const nextLeagueGameAt = useMemo((): number | null => {
        if (!simStart) return null;
        let min: number | null = null;
        for (const g of schedule) {
            if (g.played) continue;
            const at = resolveRealAt(g, simStart, gprd);
            if (!at) continue;
            const t = new Date(at).getTime();
            if (min === null || t < min) min = t;
        }
        return min;
    }, [schedule, simStart, gprd]);

    // 토너먼트 종료 여부 + 우승팀 (다음 경기가 없을 때 대체 표시용)
    // league.status==='finished'는 서버가 마지막 경기 시뮬 직후 즉시 세팅하므로, 그 경기의
    // 10분 리플레이가 끝나 isFinal이 되기 전까지는 우승자를 노출하지 않는다.
    const tournamentChampionId = useMemo(() => {
        if (league?.type !== 'tournament' || league?.status !== 'finished') return null;
        const allSeries: any[] = (league?.bracket_data as any)?.series ?? [];
        if (!allSeries.length) return null;
        const finalRound = Math.max(...allSeries.map((s: any) => s.round ?? 1));
        const final = allSeries.find((s: any) => s.round === finalRound && s.winnerId);
        if (!final) return null;
        const targetWins = final.targetWins ?? 1;
        const byTeam = seriesWins.get(final.id);
        if ((byTeam?.get(final.higherSeedId) ?? 0) >= targetWins) return final.higherSeedId;
        if ((byTeam?.get(final.lowerSeedId) ?? 0) >= targetWins) return final.lowerSeedId;
        return null;
    }, [league, seriesWins]);
    const isMyTeamChampion = !!(tournamentChampionId && myTeamId && tournamentChampionId === myTeamId);

    const { getPlayerUrlId } = usePlayerShortCodes();
    const handleViewPlayer = useCallback((player: Player) => {
        navigate(`${base}/player/${getPlayerUrlId(player.id)}`);
    }, [navigate, base, getPlayerUrlId]);

    const handleViewTeam = useCallback((teamSlug: string) => {
        navigate(`${base}/roster?rteam=${teamSlug}`);
    }, [navigate, base]);

    const primaryColor = myTeam?.color_primary ?? '#4338ca';
    const textColor    = myTeam?.color_text ?? getReadableTextColor(primaryColor);

    // "날짜" 칸 — 메인리그면 가상 오늘 날짜, 없으면 다음 경기의 날짜로 대체.
    const dateLabel = currentVirtualDate
        ? fmtVirtualDate(currentVirtualDate)
        : nextGame ? fmtVirtualDate(nextGame.date) : null;
    // "시즌 N"이 아니라 실제 연도 기반 "2026-27" 형태로 표기.
    const seasonYearLabel = currentVirtualDate
        ? seasonShortFromDate(currentVirtualDate)
        : nextGame ? seasonShortFromDate(nextGame.date) : null;

    // [2026-10-12] 예정 경기가 없을 때 보여주던 목업("동부 1라운드 2-1 @ ATL 1:23:45") 제거 —
    // 대신 위 seasonStatus(정규시즌 종료/시리즈 대기/탈락/우승)로 실제 상황을 표시한다.
    const isDraftComplete = league?.status === 'in_progress' || league?.status === 'finished';
    // [2026-09-11] LeagueLobbyPanel.tsx의 "토너먼트 정보" 섹션 하단에 있던 "드래프트 룸
    // 입장" 정적 안내 박스(로터리 완료~드래프트 시작 전 상태)를 삭제하고, 대신 로터리가
    // 끝난 순간부터 드래프트 완료 전까지 항상 헤더 우측 끝에서 진입할 수 있도록 이동.
    const lotteryDone = leagueTeams.length > 0 && leagueTeams.some(t => t.draft_order !== null);
    const isDrafting = league?.status === 'drafting';
    // [2026-09-11] 드래프트 진행 중엔 이 버튼을 우측 끝(NavMenu 옆)이 아니라 시즌정보 칸의
    // "남은 시간" 텍스트 바로 우측으로 옮겨 붙인다(요청) — 그래서 isDrafting일 땐 여기서 숨김.
    // [2026-09-18] 토너먼트 개인 팩 드래프트(leagues.personal_draft_format 존재)는 로터리/공유풀
    // 드래프트 룸이 없다 — 내 팀이 확정된 순간부터 드래프트 완료 전까지 개인 드래프트 화면으로 진입.
    const isPersonalDraft = !!league?.personal_draft_format;
    const draftRoomPath = isPersonalDraft
        ? `/multi/leagues/${leagueId}/personal-draft`
        : `/multi/leagues/${leagueId}/draft`;
    // [2026-09-18] 내 개인 드래프트가 끝나면 진입 버튼도 숨긴다(사이드바 메뉴 분기와 동일 기준).
    const personalDraftStatus = usePersonalDraftStatus(roomId ?? null, myTeam?.id ?? null, isPersonalDraft);
    const showDraftRoomButton = isPersonalDraft
        ? !isDraftComplete && !!myTeam && personalDraftStatus !== 'completed'
        : !isDraftComplete && lotteryDone && !isDrafting;

    // [2026-09-11] "드래프트 진행 중일 때 헤더에도 현재 픽 정보 표시" 요청 — LeagueLobbyPanel.tsx/
    // MultiDraftView.tsx가 이미 쓰는 훅을 그대로 재사용(WS 연결이 하나 더 열리지만, 드래프트
    // 중에만 활성화되고 사용자가 이 트레이드오프를 확인 후 요청함).
    const { draftState: headerDraftState, currentPickEntry: headerCurrentPickEntry, timeRemaining: headerTimeRemaining } = useLeagueDraft(
        isDrafting ? (roomId ?? null) : null,
        session,
    );
    const headerDraftTeamCount = Math.max(headerDraftState?.teamCount ?? 1, 1);
    const headerDraftRound     = headerDraftState ? Math.floor(headerDraftState.currentPickIndex / headerDraftTeamCount) + 1 : 1;
    const headerDraftPickInRound = headerDraftState ? (headerDraftState.currentPickIndex % headerDraftTeamCount) + 1 : 1;
    const headerDraftTeam = headerCurrentPickEntry
        ? leagueTeams.find(t => t.team_slug === headerCurrentPickEntry.teamId)
        : null;
    const headerDraftTimer = `${String(Math.floor(headerTimeRemaining / 60)).padStart(2, '0')}:${String(headerTimeRemaining % 60).padStart(2, '0')}`;
    const headerDraftTimerPct = headerDraftState && headerDraftState.pickDurationSec > 0
        ? Math.min(100, Math.round((headerTimeRemaining / headerDraftState.pickDurationSec) * 100))
        : 100;
    const headerDraftTimerColor = headerDraftTimerPct <= 15 ? 'text-red-400' : headerDraftTimerPct <= 40 ? 'text-amber-400' : 'text-white';

    // [2026-09-11] 로터리 추첨 전 / (로터리 완료 후) 드래프트 시작 전 상태에서 "다음
    // 이벤트까지 남은 시간"을 헤더에 타이머로 표시 — nowMs(1초마다 갱신, 위에서 이미
    // tick 중)를 그대로 재사용해 별도 interval 없이 계산.
    const nextEventLabel = !lotteryDone ? '드래프트 순서 추첨' : '드래프트 시작';
    const nextEventAt    = !lotteryDone ? league?.lottery_scheduled_at : league?.draft_scheduled_at;
    const showEventCountdown = !isDraftComplete && !isDrafting && !!nextEventAt;
    const eventCountdown = nextEventAt
        ? fmtRemaining(new Date(nextEventAt).getTime() - nowMs, '곧 시작', 'clock')
        : null;
    const showNextGame = !!nextGame && !!countdown;

    return (
        <div
            className="w-full sticky top-0 z-header flex items-center justify-between h-10 relative shrink-0 bg-slate-900 border-b border-slate-700"
        >
            <div className="absolute inset-0 backdrop-blur-[20px] bg-[rgba(0,0,0,0.1)] pointer-events-none" />

            {/* 왼쪽: 팀정보(팀 테마 컬러 비스듬한 배경) / 시즌정보(다음 경기·라이브 압축 포함) */}
            <div className="flex items-center min-w-0 h-full relative z-10">
                {/* 팀 테마 컬러 비스듬한 배경 — clip-path 퍼센트 기준이라 팀명 길이에 맞춰 자동으로 늘어남 */}
                <div className="relative inline-flex items-center h-full pl-6 pr-8 shrink-0">
                    {/* 사선 오프셋을 퍼센트가 아닌 고정 px(calc)로 지정 — 퍼센트면 컨텐츠(팀명+
                        전적+순위+리그명)가 길어질수록 사선 폭도 비례해서 커져 텍스트가 삐져나감. */}
                    <div
                        className="absolute inset-0"
                        style={{ backgroundColor: primaryColor, clipPath: 'polygon(0 0, 100% 0, calc(100% - 24px) 100%, 0 100%)' }}
                    />
                    {/* 표시 순서: [시즌] [리그명] [로고] [팀이름] [성적] */}
                    {(seasonYearLabel || league?.name) && (
                        <span className="relative text-sm font-medium opacity-80 whitespace-nowrap shrink-0 mr-2.5" style={{ color: textColor }}>
                            {seasonYearLabel ? `${seasonYearLabel} ` : ''}{league?.name ?? ''}
                        </span>
                    )}
                    {/* [2026-09-07] 팀명 좌측에 로고 추가(사용자 요청) — 다른 화면들과 동일한
                        TeamLogo 공용(리그 로고 1회 폴백), 순수 장식용(클릭 불가, 이 영역
                        자체가 원래 클릭 불가였음). */}
                    {myTeam && (
                        <TeamLogo teamId={myTeam.team_slug} teamName={myTeam.team_abbr} size="custom" className="relative w-5 h-5 shrink-0 mr-1.5" shadow={false} />
                    )}
                    <span className="relative text-sm font-bold truncate" style={{ color: textColor }}>
                        {isSpectator ? '관전 중' : (myTeam?.team_name ?? '내 팀')}
                        {!isSpectator && <span className="font-medium ml-1.5 opacity-80">{wins}W-{losses}L</span>}
                    </span>
                </div>

                {dateLabel && (
                    // 클릭 시 시뮬레이션 타임테이블(현실 날짜 → 가상 날짜 구간) 팝업을 클릭 지점에 띄운다.
                    <div className="h-full flex items-center shrink-0 pl-3">
                        {timeline?.length ? (
                            <button
                                type="button"
                                data-sim-timetable-trigger
                                onClick={e => setTimetableAnchor(prev => prev ? null : { x: e.clientX, y: e.clientY })}
                                className="text-sm text-white font-semibold whitespace-nowrap cursor-pointer hover:underline"
                            >
                                {dateLabel}
                            </button>
                        ) : (
                            <span className="text-sm text-white font-semibold whitespace-nowrap">{dateLabel}</span>
                        )}
                        {timetableAnchor && timeline?.length ? (
                            <SimTimetablePopup timeline={timeline} nowMs={nowMs} anchor={timetableAnchor} onClose={() => setTimetableAnchor(null)} />
                        ) : null}
                    </div>
                )}

                {currentVirtualDate && timeline?.length ? (
                    <VirtualDayArc timeline={timeline} nowMs={dateBucket * 15000} />
                ) : null}

                <div className="flex items-center gap-1.5 text-sm text-text-muted min-w-0 truncate pl-3">
                    {isDrafting ? (
                        <div className="flex items-center gap-2 min-w-0 shrink-0">
                            <span className="truncate">
                                <span className="text-emerald-400 font-bold animate-pulse">드래프트 진행 중</span>
                                {' '}
                                <span className="text-white">
                                    {headerDraftRound}라운드 {headerDraftPickInRound}픽
                                    {' | '}
                                    {headerDraftTeam?.team_name ?? headerCurrentPickEntry?.teamId.toUpperCase() ?? '—'}
                                    {' | '}
                                </span>
                                <span className={`tabular-nums ${headerDraftTimerColor}`}>{headerDraftTimer}</span>
                            </span>
                            <Button
                                variant="cta"
                                size="sm"
                                onClick={() => navigate(`/multi/leagues/${leagueId}/draft`)}
                                className="shrink-0"
                            >
                                드래프트 룸 입장
                            </Button>
                        </div>
                    ) : myLiveGame ? (
                        <>
                            <span className="relative flex h-1.5 w-1.5 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                            </span>
                            <span className="text-red-400 font-bold shrink-0">LIVE</span>
                            <span className="shrink-0">{isLiveAway ? '@' : 'vs'} {liveOpponentTeam?.team_abbr ?? liveOpponentId ?? '—'}</span>
                            <Button
                                variant="danger"
                                size="xs"
                                shape="md"
                                onClick={handleWatchLiveGame}
                                icon={<Tv size={12} />}
                                className="shrink-0"
                            >
                                보기
                            </Button>
                        </>
                    ) : showNextGame ? (
                        <>
                            {seriesInfo && (
                                <span className="shrink-0">
                                    {seriesInfo.roundLabel}
                                    {seriesInfo.targetWins > 1 && ` ${seriesInfo.myWins}-${seriesInfo.oppWins}`}
                                </span>
                            )}
                            <span className="shrink-0">{isAway ? '@' : 'vs'} {opponentTeam?.team_abbr ?? opponentId ?? '—'}</span>
                            <span className={`flex items-center gap-1 font-semibold shrink-0 ${countdownColor}`}>
                                <Timer size={12} />
                                {countdown}
                            </span>
                        </>
                    ) : tournamentChampionId ? (
                        <>
                            <Trophy size={13} className={`shrink-0 ${isMyTeamChampion ? 'text-amber-400' : 'text-zinc-500'}`} />
                            <span className={`shrink-0 font-semibold ${isMyTeamChampion ? 'text-amber-400' : 'text-zinc-400'}`}>
                                {isMyTeamChampion ? '우승! 토너먼트 종료' : '토너먼트 종료'}
                            </span>
                        </>
                    ) : isDraftComplete && seasonStatus ? (
                        <>
                            <span className="shrink-0">{seasonStatus}</span>
                            {nextLeagueGameAt !== null && (
                                <span className="flex items-center gap-1 font-semibold shrink-0 text-indigo-400">
                                    <Timer size={12} />
                                    다음 경기일까지 {fmtRemaining(nextLeagueGameAt - nowMs)}
                                </span>
                            )}
                        </>
                    ) : showEventCountdown ? (
                        <span className="flex items-center gap-1 font-semibold shrink-0 text-indigo-400">
                            <Timer size={12} />
                            {nextEventLabel}까지 {eventCountdown}
                        </span>
                    ) : null}
                </div>
            </div>

            {/* 오른쪽: 검색창 + 메뉴 + (로터리 완료~드래프트 진행 중) 드래프트 룸 입장 */}
            <div className="flex items-center gap-3 pr-6 shrink-0 relative z-10">
                <MultiHeaderNavMenu
                    leagueTeams={leagueTeams}
                    poolPlayers={poolPlayers}
                    rosterMap={rosterMap}
                    myTeamId={myTeamId}
                    roomId={roomId}
                    hasPlayoffs={!!league?.bracket_data && league?.type !== 'tournament'}
                    isTournament={league?.type === 'tournament'}
                    showAllStar={showAllStar}
                    showPlayoffRace={showPlayoffRace}
                    capEnabled={!!league?.cap_enabled}
                    isDraftComplete={isDraftComplete}
                    isSpectator={isSpectator}
                    onViewPlayer={handleViewPlayer}
                    onViewTeam={handleViewTeam}
                />
                {showDraftRoomButton && (
                    <Button
                        variant="cta"
                        onClick={() => navigate(draftRoomPath)}
                        className="px-4 shrink-0"
                    >
                        {isPersonalDraft ? '팩 드래프트 입장' : '드래프트 룸 입장'}
                    </Button>
                )}
            </div>
        </div>
    );
};

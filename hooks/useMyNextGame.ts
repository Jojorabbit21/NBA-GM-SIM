// useMyNextGame.ts — 내 팀의 다음 경기·라이브 경기 판정과 카운트다운 문구. [2026-10-27 모바일 셸]
// MultiHeader.tsx(데스크톱 헤더)가 인라인으로 하던 nextGame/myLiveGame/countdown 계산을 폰 상단 바·홈 내 팀 배지·
// 하단 탭 바(라이브 점)가 같은 기준으로 쓰도록 훅으로 뽑았다. 판정 규칙은 헤더와 동일:
//   - 다음 경기 = 안 치른 내 경기 중 실제 방송 시각(resolveRealAt)이 가장 빠른 것
//   - 라이브 = played지만 리플레이 공개창 안(getGameDisplayState === 'live')
//   - 카운트다운 색 = 1시간 초과 indigo / 30분~1시간 amber / 30분 미만 red
// 스케줄 스캔(다음 경기·라이브 판정)은 15초 버킷으로, 카운트다운 문구만 1초 시계로 계산한다(기본) — 버킷만 쓰면 "1:23:45"가 15초마다
// 뛰어 멈춘 것처럼 보였다(2026-10-27 사용자 리포트). 초 단위가 필요 없는 호출부(탭 바 라이브 점)는 tick: 'bucket'. 데스크톱 헤더는 자기 계산 그대로.
import { useMemo } from 'react';
import { useServerClock, useServerClockBucket } from '../utils/serverClock';
import { useLeagueContext } from '../views/multi/league/LeagueLayout';
import { useSeasonContext } from '../views/multi/season/seasonContext';
import { getGameDisplayState, resolveRealAt } from '../views/multi/season/multiGameReveal';
import { fmtRemaining } from '../utils/formatRemaining';
import type { Game } from '../types';
import type { LeagueTeamRow } from '../services/multi/roomQueries';

export interface MyNextGameInfo {
    myTeamId: string | null;
    nextGame: Game | null;
    opponent: LeagueTeamRow | null;
    opponentId: string | null;
    isAway: boolean;
    /** 다음 경기까지 남은 ms(없으면 null) */
    diffMs: number | null;
    /** 'muted'(1h 초과) | 'warn'(30m~1h) | 'urgent'(30m 미만) */
    urgency: 'muted' | 'warn' | 'urgent' | null;
    /** "1시간 23분 후 경기 시작" / "곧 경기 시작" */
    countdownText: string | null;
    liveGame: Game | null;
    liveOpponent: LeagueTeamRow | null;
    isLiveAway: boolean;
}

export function useMyNextGame(opts: { tick?: 'second' | 'bucket' } = {}): MyNextGameInfo {
    const { league, leagueTeams } = useLeagueContext();
    const { schedule, myTeamId } = useSeasonContext();
    const nowMs = useServerClockBucket();
    const tickMs = useServerClock();
    const countdownNow = opts.tick === 'bucket' ? nowMs : tickMs;
    const simStart = league?.sim_real_start_at ?? null;
    const gprd = league?.games_per_real_day ?? 5;

    const nextGame = useMemo((): (Game & { resolvedAt: string }) | null => {
        if (!myTeamId || !simStart) return null;
        return [...schedule]
            .filter(g => !g.played && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId))
            .map(g => ({ ...g, resolvedAt: resolveRealAt(g, simStart, gprd) }))
            .filter((g): g is Game & { resolvedAt: string } => g.resolvedAt != null)
            .sort((a, b) => new Date(a.resolvedAt).getTime() - new Date(b.resolvedAt).getTime())[0] ?? null;
    }, [schedule, myTeamId, simStart, gprd]);

    const liveGame = useMemo((): Game | null => {
        if (!myTeamId) return null;
        return schedule.find(g => {
            if (!g.played || (g.homeTeamId !== myTeamId && g.awayTeamId !== myTeamId)) return false;
            return getGameDisplayState({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) }, nowMs) === 'live';
        }) ?? null;
    }, [schedule, myTeamId, simStart, gprd, nowMs]);

    const opponentId = nextGame ? (nextGame.homeTeamId === myTeamId ? nextGame.awayTeamId : nextGame.homeTeamId) : null;
    const opponent = opponentId ? leagueTeams.find(t => t.team_slug === opponentId) ?? null : null;
    const isAway = !!nextGame && nextGame.awayTeamId === myTeamId;
    const diffMs = nextGame ? new Date(nextGame.resolvedAt).getTime() - countdownNow : null;
    const urgency = diffMs == null ? null : diffMs > 3_600_000 ? 'muted' : diffMs > 1_800_000 ? 'warn' : diffMs > 0 ? 'urgent' : 'muted';
    const countdownText = diffMs == null ? null : diffMs <= 0 ? '곧 경기 시작' : `${fmtRemaining(diffMs)} 후 경기 시작`;

    const liveOpponentId = liveGame ? (liveGame.homeTeamId === myTeamId ? liveGame.awayTeamId : liveGame.homeTeamId) : null;
    const liveOpponent = liveOpponentId ? leagueTeams.find(t => t.team_slug === liveOpponentId) ?? null : null;
    const isLiveAway = !!liveGame && liveGame.awayTeamId === myTeamId;

    return { myTeamId: myTeamId ?? null, nextGame, opponent, opponentId, isAway, diffMs, urgency, countdownText, liveGame, liveOpponent, isLiveAway };
}

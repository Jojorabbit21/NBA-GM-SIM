// 리그 단위 고급 지표(PER, Win Shares, 이후 BPM/VORP)가 공유하는 입력 컨텍스트 — 선수 시즌 누적 + 팀 요약에서
// 팀 합계·리그 합계·리그 페이스를 한 번만 계산해 둔다. 순수 함수(hooks/useLeaderboardData.ts 가 호출).
// 모든 값은 "시즌 누적"(경기당 평균 아님). 출처가 다른 값(팀 득실점·포제션·페이스·상대 합계)은 호출부가 TeamSummary 로 넘긴다.

/** 선수 시즌 누적(총 출전시간 포함). */
export interface PlayerTotals {
    teamId: string;
    mp: number;
    pts: number; fgm: number; fga: number; p3m: number; ftm: number; fta: number;
    offReb: number; defReb: number; reb: number; ast: number; stl: number; blk: number; tov: number; pf: number;
}

export interface OpponentTotals {
    fgm: number; fga: number; ftm: number; fta: number; offReb: number; defReb: number; tov: number;
}

/** 팀 단위로 외부에서 받는 값. */
export interface TeamSummary {
    teamId: string;
    /** 치른 경기 수 */
    g: number;
    /** 48분당 포제션(팀 어드밴스드 RPC 값, 없으면 훅이 계산한 근사값) */
    pace: number;
    /** 시즌 누적 득점(경기 결과 기준) */
    pts: number;
    /** 시즌 누적 실점(경기 결과 기준) */
    oppPts: number;
    /** 시즌 누적 팀 포제션(양팀 공통, BBRef). 0 이하이면 컨텍스트가 식으로 계산한다. */
    poss: number;
    /** 상대팀 합계 — 멀티는 경기별 박스가 없어 상대 시즌 평균으로 근사한 값일 수 있다. */
    opp: OpponentTotals;
}

export interface TeamTotals {
    mp: number; pts: number; fgm: number; fga: number; p3m: number; ftm: number; fta: number;
    offReb: number; defReb: number; reb: number; ast: number; stl: number; blk: number; tov: number; pf: number;
}

export interface TeamContext extends TeamSummary {
    /** 팀 소속 선수 누적 합계 */
    totals: TeamTotals;
    /** 시즌 누적 팀 포제션(summary.poss 우선, 없으면 BBRef 식) */
    teamPoss: number;
}

export interface LeagueMetricsContext {
    teams: Map<string, TeamContext>;
    /** 선수 누적 합계(전 리그) — PER 의 factor/VOP/DRB% 입력 */
    lg: TeamTotals;
    /** 팀 페이스 평균. 알 수 없으면 0. */
    lgPace: number;
    /** 리그 득점/포제션(팀 요약 기준). 알 수 없으면 0. */
    lgPtsPerPoss: number;
    /** 팀 경기당 평균 득점(팀 요약 기준). 알 수 없으면 0. */
    lgPtsPerGame: number;
}

const emptyTotals = (): TeamTotals => ({
    mp: 0, pts: 0, fgm: 0, fga: 0, p3m: 0, ftm: 0, fta: 0, offReb: 0, defReb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
});

const addTo = (acc: TeamTotals, p: PlayerTotals) => {
    acc.mp += p.mp; acc.pts += p.pts; acc.fgm += p.fgm; acc.fga += p.fga; acc.p3m += p.p3m; acc.ftm += p.ftm; acc.fta += p.fta;
    acc.offReb += p.offReb; acc.defReb += p.defReb; acc.reb += p.reb; acc.ast += p.ast; acc.stl += p.stl; acc.blk += p.blk;
    acc.tov += p.tov; acc.pf += p.pf;
};

/** 팀 포제션(BBRef 공통 포제션, 시즌 누적) — 자기 팀과 상대팀 추정의 평균. */
export function estimateTeamPoss(t: TeamTotals, opp: OpponentTotals): number {
    const orbShare = t.offReb + opp.defReb > 0 ? t.offReb / (t.offReb + opp.defReb) : 0;
    const oppOrbShare = opp.offReb + t.defReb > 0 ? opp.offReb / (opp.offReb + t.defReb) : 0;
    const mine = t.fga + 0.4 * t.fta - 1.07 * orbShare * (t.fga - t.fgm) + t.tov;
    const theirs = opp.fga + 0.4 * opp.fta - 1.07 * oppOrbShare * (opp.fga - opp.fgm) + opp.tov;
    return 0.5 * (mine + theirs);
}

export function buildLeagueMetricsContext(players: PlayerTotals[], summaries: TeamSummary[]): LeagueMetricsContext {
    const lg = emptyTotals();
    const totalsByTeam = new Map<string, TeamTotals>();
    for (const p of players) {
        addTo(lg, p);
        let t = totalsByTeam.get(p.teamId);
        if (!t) { t = emptyTotals(); totalsByTeam.set(p.teamId, t); }
        addTo(t, p);
    }

    const teams = new Map<string, TeamContext>();
    let paceSum = 0, paceN = 0, ptsSum = 0, possSum = 0, gSum = 0;
    for (const s of summaries) {
        const totals = totalsByTeam.get(s.teamId) ?? emptyTotals();
        const teamPoss = s.poss > 0 ? s.poss : estimateTeamPoss(totals, s.opp);
        teams.set(s.teamId, { ...s, totals, teamPoss });
        if (s.pace > 0) { paceSum += s.pace; paceN++; }
        if (s.g > 0 && teamPoss > 0) { ptsSum += s.pts; possSum += teamPoss; gSum += s.g; }
    }

    return {
        teams,
        lg,
        lgPace: paceN > 0 ? paceSum / paceN : 0,
        lgPtsPerPoss: possSum > 0 ? ptsSum / possSum : 0,
        lgPtsPerGame: gSum > 0 ? ptsSum / gSum : 0,
    };
}

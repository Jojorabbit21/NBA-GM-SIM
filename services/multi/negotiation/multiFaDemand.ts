
// 멀티플레이어 FA 협상 화면(MultiNegotiationView.tsx) 전용 수요 계산 헬퍼.
//
// 배경: 멀티플레이어는 리그별로 salary_cap_amount(leagues 테이블)가 다르다. [2026-09-22]
// calcFADemand()/calcYOSBounds()(services/fa/faValuation.ts)는 캡을 필수 인자(salaryCap)로
// 받는다 — 예전엔 optional(salaryCapOverride)이고 미지정 시 전역 싱글턴 LEAGUE_FINANCIALS.
// SALARY_CAP(2025-26)에 폴백했는데, 그 폴백이 멀티에서 캡을 빠뜨린 호출을 조용히 통과시키는
// 구멍이었다. 이 얇은 래퍼는 리그의 캡 금액을 주입하는 역할만 한다.
//
// v1 스코프: 슬롯/에이프런/MLE/버드권한 자격판정(getAvailableSigningSlots, processUserOffer,
// calcTeamPayroll)은 이번 작업 범위 밖 — "이 선수가 얼마를 요구하는가"(calcFADemand)만 계산.
import type { Player } from '../../../types/player';
import type { Team } from '../../../types/team';
import type { FADemandResult } from '../../../types/fa';
import { buildMarketConditions, calcFADemand } from '../../fa/faValuation';

export function buildMultiFADemand(
    player: Player,
    poolPlayers: Player[],
    teams: Team[],
    leagueSalaryCap: number,
    currentSeasonYear: number,
    currentSeason: string,
    tendencySeed: string,
): FADemandResult {
    const marketConditions = buildMarketConditions(poolPlayers, poolPlayers, teams);
    return calcFADemand(player, poolPlayers, marketConditions, currentSeasonYear, currentSeason, tendencySeed, leagueSalaryCap);
}

// MultiFreeAgentView.tsx의 "가능성" 컬럼처럼 여러 선수(보통 한 페이지 분량)를 한 번에 평가할
// 때, buildMultiFADemand()를 선수마다 부르면 buildMarketConditions()(역할×팀 이중루프)가
// 매번 다시 계산돼 낭비다 — 시장 조건은 어차피 poolPlayers/teams가 같으면 전부 동일하므로
// 한 번만 계산해서 재사용한다.
export function buildMultiFADemandBatch(
    players: Player[],
    poolPlayers: Player[],
    teams: Team[],
    leagueSalaryCap: number,
    currentSeasonYear: number,
    currentSeason: string,
    tendencySeed: string,
): Map<string, FADemandResult> {
    const marketConditions = buildMarketConditions(poolPlayers, poolPlayers, teams);
    const result = new Map<string, FADemandResult>();
    for (const player of players) {
        result.set(player.id, calcFADemand(
            player, poolPlayers, marketConditions,
            currentSeasonYear, currentSeason, tendencySeed, leagueSalaryCap,
        ));
    }
    return result;
}


import { Player } from './player';

export type ReleaseType = 'waive' | 'buyout' | 'stretch';

export interface DeadMoneyEntry {
    playerId: string;
    playerName: string;
    /** 데드캡 금액 (달러) — 방출 방식에 따라 다름 */
    amount: number;
    /** 발생 시즌 라벨 (e.g. '2025-26') */
    season: string;
    /** 방출 방식 */
    releaseType: ReleaseType;
    /**
     * 스트레치 웨이브인 경우 총 분산 연수 (= 2 × remainingYears - 1)
     * 분산 기간 동안 매 시즌 amount씩 캡에 산정됨
     */
    stretchYearsTotal?: number;
    /**
     * 스트레치 웨이브인 경우 남은 분산 연수.
     * 생성 시 stretchYearsTotal과 동일, 매 오프시즌마다 1씩 차감.
     * 0이 되면 deadMoney 목록에서 제거됨.
     */
    stretchYearsRemaining?: number;
}

export interface TacticStatRecord {
    games: number;
    wins: number;
    ptsFor: number;
    ptsAgainst: number;
    fgm: number;
    fga: number;
    p3m: number;
    p3a: number;
    rimM: number;
    rimA: number;
    midM: number;
    midA: number;
    aceImpact?: number;
}

export interface Team {
    id: string;
    name: string;
    city: string;
    logo: string;
    conference: 'East' | 'West';
    division: string;
    wins: number;
    losses: number;
    budget: number;
    salaryCap: number;
    luxuryTaxLine: number;
    roster: Player[];
    tacticHistory?: {
        offense: Record<string, TacticStatRecord>;
        defense: Record<string, TacticStatRecord>;
    };
    /** 방출된 선수들의 잔여 계약금 (데드캡) */
    deadMoney?: DeadMoneyEntry[];
}

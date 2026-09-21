
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
     * 스트레치 웨이브인 경우 총 분산 연수 (= 2 × remainingYears + 1, CBA 공식 — 2026-09-21
     * 수정: 예전엔 "-1"로 잘못 적혀있었고 코드도 그렇게 돼 있었음, docs/domain/
     * nba-salary-cap-2025-26.md §8-4)
     * 분산 기간 동안 매 시즌 amount씩 캡에 산정됨
     */
    stretchYearsTotal?: number;
    /**
     * 스트레치 웨이브인 경우 남은 분산 연수.
     * 생성 시 stretchYearsTotal과 동일, 매 오프시즌마다 1씩 차감.
     * 0이 되면 deadMoney 목록에서 제거됨.
     */
    stretchYearsRemaining?: number;
    /**
     * [2026-09-21] 멀티플레이어 전용 — 재정 탭이 방출된 선수 행을 로스터 선수와 동일한
     * 모양(호버카드/바로가기/포지션/나이/오버롤)으로 그리기 위한 전체 Player 객체.
     * 이 선수는 이미 team.roster에 없어(방출됨) 별도로 조회해 붙여야 함 —
     * services/multi/buildLeagueTeams.ts는 채우지 않고, 호출부(MultiRosterView.tsx)가
     * useLeagueRawStats의 raw.playersRaw에서 찾아 붙인다. 싱글플레이어는 항상 undefined.
     */
    player?: Player;
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
    /** 멀티플레이어 유저 커스텀 팀 컬러/약어 — 있으면 TeamBadge가 실제 NBA 로고 대신
     * 이 컬러의 직사각형 배지를 그린다. 싱글플레이어(실제 NBA 팀)는 항상 undefined. */
    colorPrimary?: string | null;
    colorSecondary?: string | null;
    colorText?: string | null;
    abbr?: string | null;
    tacticHistory?: {
        offense: Record<string, TacticStatRecord>;
        defense: Record<string, TacticStatRecord>;
    };
    /** 방출된 선수들의 잔여 계약금 (데드캡) */
    deadMoney?: DeadMoneyEntry[];
    /** 마지막 BAE(Bi-Annual Exception) 사용 시즌 시작 연도 (e.g. 2025 for 2025-26). 2시즌에 1번 제한 */
    usedBAEyear?: number;
}

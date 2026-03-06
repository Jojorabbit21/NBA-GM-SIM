
import { Team, Game } from '../types';

/**
 * NBA 타이브레이커 유틸리티
 *
 * NBA 실제 규칙 기반 간소화 버전:
 * 1. 승률 (PCT)
 * 2. 상대전적 (Head-to-Head)
 * 3. 컨퍼런스 승률 (Conference Record)
 * 4. 점수차 (Point Differential)
 */

interface H2HRecord {
    w: number;
    l: number;
}

interface TeamRankData {
    pct: number;
    confW: number;
    confL: number;
    confPct: number;
    diff: number; // total point differential
}

/**
 * 모든 팀 쌍의 상대전적을 사전 계산합니다.
 * 정규시즌 경기만 대상.
 */
export function computeH2HMap(schedule: Game[]): Map<string, Map<string, H2HRecord>> {
    const h2h = new Map<string, Map<string, H2HRecord>>();

    const ensure = (id: string) => {
        if (!h2h.has(id)) h2h.set(id, new Map());
    };

    for (const g of schedule) {
        if (!g.played || g.isPlayoff) continue;

        const hs = g.homeScore ?? 0;
        const as = g.awayScore ?? 0;
        if (hs === 0 && as === 0) continue;
        const homeWon = hs > as;

        ensure(g.homeTeamId);
        ensure(g.awayTeamId);

        const homeMap = h2h.get(g.homeTeamId)!;
        const awayMap = h2h.get(g.awayTeamId)!;

        const hVsA = homeMap.get(g.awayTeamId) || { w: 0, l: 0 };
        const aVsH = awayMap.get(g.homeTeamId) || { w: 0, l: 0 };

        if (homeWon) {
            hVsA.w++;
            aVsH.l++;
        } else {
            hVsA.l++;
            aVsH.w++;
        }

        homeMap.set(g.awayTeamId, hVsA);
        awayMap.set(g.homeTeamId, aVsH);
    }

    return h2h;
}

/**
 * 팀별 랭킹 데이터를 사전 계산합니다.
 */
function computeRankData(teams: Team[], schedule: Game[]): Map<string, TeamRankData> {
    const teamMap = new Map(teams.map(t => [t.id, t]));
    const data = new Map<string, TeamRankData>();

    // 기본값 초기화
    for (const t of teams) {
        const total = t.wins + t.losses;
        data.set(t.id, {
            pct: total > 0 ? t.wins / total : 0,
            confW: 0,
            confL: 0,
            confPct: 0,
            diff: 0
        });
    }

    // schedule에서 컨퍼런스 전적 / 점수차 계산
    for (const g of schedule) {
        if (!g.played || g.isPlayoff) continue;

        const home = teamMap.get(g.homeTeamId);
        const away = teamMap.get(g.awayTeamId);
        if (!home || !away) continue;

        const hs = g.homeScore ?? 0;
        const as = g.awayScore ?? 0;
        const homeWon = hs > as;

        const hd = data.get(g.homeTeamId)!;
        const ad = data.get(g.awayTeamId)!;

        // 점수차 누적
        hd.diff += (hs - as);
        ad.diff += (as - hs);

        // 컨퍼런스 전적
        if (home.conference === away.conference) {
            if (homeWon) {
                hd.confW++;
                ad.confL++;
            } else {
                hd.confL++;
                ad.confW++;
            }
        }
    }

    // 컨퍼런스 승률 계산
    for (const [, d] of data) {
        const confTotal = d.confW + d.confL;
        d.confPct = confTotal > 0 ? d.confW / confTotal : 0;
    }

    return data;
}

/**
 * 타이브레이커 비교기를 생성합니다.
 * 반환된 함수는 Array.sort에 직접 사용 가능합니다.
 * (음수 = a가 앞, 양수 = b가 앞)
 */
export function createTiebreakerComparator(
    teams: Team[],
    schedule: Game[]
): (a: Team, b: Team) => number {
    const h2h = computeH2HMap(schedule);
    const rankData = computeRankData(teams, schedule);

    return (a: Team, b: Team): number => {
        const da = rankData.get(a.id);
        const db = rankData.get(b.id);
        if (!da || !db) return 0;

        // 1. 승률 (PCT) 내림차순
        const pctDiff = db.pct - da.pct;
        if (Math.abs(pctDiff) > 1e-6) return pctDiff;

        // 2. 상대전적 (Head-to-Head)
        const h2hRecord = h2h.get(a.id)?.get(b.id);
        if (h2hRecord && (h2hRecord.w + h2hRecord.l > 0)) {
            const h2hDiff = h2hRecord.w - h2hRecord.l;
            if (h2hDiff !== 0) return -h2hDiff; // a가 h2h에서 이기면 a가 앞
        }

        // 3. 컨퍼런스 승률 (같은 컨퍼런스인 경우)
        if (a.conference === b.conference) {
            const confDiff = db.confPct - da.confPct;
            if (Math.abs(confDiff) > 1e-6) return confDiff;
        }

        // 4. 점수차 (Point Differential) 내림차순
        const diffDiff = db.diff - da.diff;
        if (Math.abs(diffDiff) > 0.1) return diffDiff;

        // 5. 최종 폴백: 승수 내림차순
        return b.wins - a.wins;
    };
}

/**
 * 컨퍼런스별로 팀을 랭킹합니다. (타이브레이커 적용)
 */
export function rankByConference(
    teams: Team[],
    schedule: Game[],
    conference: 'East' | 'West'
): Team[] {
    const confTeams = teams.filter(t => t.conference === conference);
    const comparator = createTiebreakerComparator(teams, schedule);
    return confTeams.sort(comparator);
}

// queryErrorCatalog.ts — 데이터 조회 실패 토스트의 문구 카탈로그. [2026-10-02] 사용자 지정:
//   "{무엇}을 불러오지 못했습니다. {원인}" 형태로, 원인은 네 부류 — 네트워크/서버 미응답, DB 조회 거부, RPC 내부 예외,
//   매핑 함수 예외. 원문(영문)은 토스트에 싣지 않고 콘솔에만 남긴다(errorCollector).
// 전수 조사 결과(토스트 케이스 갤러리 아티팩트 '오류 카탈로그' 섹션): 조회 쿼리 34종, 그중 RPC 6종은 자체 RAISE 코드가 없는 순수 집계
// 함수라 "RPC 내부 예외"는 Postgres 런타임 오류(타임아웃·권한·형변환)와 같은 부류로 떨어진다.

import type { QueryKey } from '@tanstack/query-core';

/** queryKey[0] → 사용자에게 보여줄 "무엇" (조회 대상 이름). 새 useQuery를 추가하면 여기도 한 줄 추가할 것. */
export const QUERY_LABELS: Record<string, string> = {
    allStarSideEvents: '올스타 이벤트',
    allStarVotes: '올스타 투표',
    baseData: '기본 데이터(선수·팀·일정)',
    faCareerHistoryBulkPrefetch: 'FA 선수 커리어 기록',
    gameBoxScore: '경기 박스스코어',
    gameShortCodes: '경기 링크 코드',
    homeLeagueTransactions: '리그 트랜잭션',
    leagueHeadlines: '리그 소식',
    leagueNewsStories: '뉴스피드',
    leagueRawPbp: '경기 기록',
    leagueRawPlayers: '리그 선수 명단',
    leagueRawSeasonInjury: '시즌 부상 기록',
    metaPlayerOrder: '선수 링크 코드',
    monthlySchedule: '월간 일정',
    multiSearchPool: '선수 풀',
    multiTradeData: '트레이드 데이터',
    pendingTradeCount: '받은 제안 수',
    playerAllStarAwards: '올스타 수상 기록',
    playerCareerHistory: '선수 커리어 기록',
    playerCareerHistoryBatch: '선수 커리어 기록',
    playerGameLog: '선수 경기 로그',
    playerInjuryRowsBatch: '선수 부상 상태',
    playerInjuryStatus: '선수 부상 상태',
    playerSeasonStatsBatch: '선수 시즌 기록',
    playerSeasonStatsFull: '선수 시즌 상세 기록',
    playerSeasonStatsLeague: '리그 선수 시즌 기록',
    playerShotEvents: '선수 슈팅 기록',
    playerTendencies: '선수 성향',
    playerTransactionHistory: '선수 이적 기록',
    saveSummary: '세이브 요약',
    scoutingReport: '스카우팅 리포트',
    teamOpponentZoneStats: '팀 상대 존 기록',
    teamSeasonAdvancedStats: '팀 시즌 고급 기록',
    tradeContractOverrides: '계약 정보',
};

export type QueryErrorCategory = 'network' | 'db' | 'rpc' | 'mapping' | 'unknown';

const CAUSE_TEXT: Record<QueryErrorCategory, string> = {
    network: '서버가 응답하지 않습니다.',
    db: '데이터베이스에서 오류가 발생했습니다.',
    rpc: '서버 처리 중 오류가 발생했습니다.',
    mapping: '데이터 처리 중 오류가 발생했습니다.',
    unknown: '알 수 없는 오류가 발생했습니다.',
};

/** 받침 유무로 을/를 — newsBlurb의 josa와 같은 규칙(여기선 의존 없이 자체 구현). */
function eulReul(word: string): string {
    const ch = word.charCodeAt(word.length - 1);
    if (ch < 0xac00 || ch > 0xd7a3) return `${word}을(를)`;
    return (ch - 0xac00) % 28 === 0 ? `${word}를` : `${word}을`;
}

function isPostgrestError(err: unknown): err is { code?: string; message?: string; details?: string; hint?: string } {
    return !!err && typeof err === 'object' && 'code' in (err as object) && 'message' in (err as object)
        && ('details' in (err as object) || 'hint' in (err as object));
}

/** 오류 객체를 네 부류로 분류. 순서가 중요 — 네트워크 → PostgREST(DB/RPC) → 그 외 JS 예외(매핑). */
export function classifyQueryError(err: unknown): QueryErrorCategory {
    if (!err) return 'unknown';
    const msg = String((err as { message?: unknown })?.message ?? err);
    // fetch 실패: Chrome "Failed to fetch", Safari "Load failed", Firefox "NetworkError when attempting to fetch resource."
    if (/failed to fetch|load failed|networkerror|network request failed|fetch failed|ECONNREFUSED|ETIMEDOUT/i.test(msg)) return 'network';
    if (isPostgrestError(err)) {
        const code = String(err.code ?? '');
        // P0001 = plpgsql RAISE EXCEPTION(RPC가 직접 던진 코드). 조회용 RPC 6종엔 없지만 뮤테이션 RPC 혼용 대비.
        if (code === 'P0001') return 'rpc';
        // PGRST*: PostgREST 자체(스키마 캐시·행 수·JWT), 42xxx 권한/스키마, 57014 statement timeout, 22xxx 형변환, 23xxx 제약
        return 'db';
    }
    if (err instanceof Error) return 'mapping';
    return 'unknown';
}

/** 토스트 본문. 예: "선수 풀을 불러오지 못했습니다. 서버가 응답하지 않습니다." */
export function formatQueryErrorMessage(queryKey: QueryKey, err: unknown): { message: string; category: QueryErrorCategory } {
    const key = String(queryKey?.[0] ?? '');
    const label = QUERY_LABELS[key] ?? '데이터';
    const category = classifyQueryError(err);
    // [2026-10-06] rpc 부류도 원문 코드 병기 없이 다른 셋과 같은 형식 — 조회 RPC 6종은 전부 sql 함수라 P0001이 나올 수 없고,
    // 원문은 errorCollector가 콘솔에 남긴다. 조회 RPC가 코드를 던지게 되면 트레이드처럼 한국어 매핑표를 둘 것.
    const cause = CAUSE_TEXT[category];
    return { message: `${eulReul(label)} 불러오지 못했습니다. ${cause}`, category };
}

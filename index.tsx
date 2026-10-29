import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryCache } from '@tanstack/query-core';
import { PersistQueryClientProvider, removeOldestQuery } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { NotificationCenter } from './components/common/NotificationCenter';
import { installGlobalErrorHandlers, reportQueryError, resolveHeldQueryError } from './services/notifications/errorCollector';
import './index.css'; // Tailwind CSS Import
import App from './App';
import { applyEditorToTeamData } from './utils/editorManager';

// [2026-10-29] Vercel Speed Insights 제거 — 스크립트 로드 + 페이지/라우트마다 측정값 전송이 전부 Edge Request로 집계돼
// Hobby 한도(월 1M) 초과의 한 원인이었다(docs/history/dev-log.md 2026-10-29). 다시 켜려면 injectSpeedInsights({ sampleRate }) 권장.

// 유저 에디터 적용 (React 렌더링 전에 TEAM_DATA 뮤테이트)
applyEditorToTeamData();

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // [2026-10-02] 조회 실패를 전역 토스트로(docs/plan/toast-notification-center-plan.md 4단계). console.error는
    // reportQueryError 안에서 그대로 찍는다. onSuccess는 401 보류 취소용(같은 쿼리가 토큰 갱신 후 성공하면 알림 안 냄).
    onError: (error, query) => reportQueryError(error, query.queryKey, query.queryHash),
    onSuccess: (_data, query) => resolveHeldQueryError(query.queryHash),
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      refetchOnWindowFocus: false, // 게임 상태 보존을 위해 기본적으로 끔
      staleTime: Infinity, // [CTO Update] 서버 부하 감소를 위해 데이터는 영원히 신선한 것으로 간주 (클라이언트가 Source of Truth)
    },
  },
});

// [2026-08-11] 새로고침/재접속 직후에도 캐시를 즉시 보여주기 위해 localStorage에 영속화.
// staleTime: Infinity라 복원된 캐시도 그대로 "신선한" 것으로 취급되며, 각 화면의 수동
// 새로고침 버튼/탭 진입 트리거로만 실제 재조회된다. maxAge를 넘긴 캐시는 폐기하고
// 정상적으로 새로 fetch한다.
//
// [2026-10-14] 영속 대상을 화이트리스트로 전환. 배경(dev-log 2026-10-14 참고):
//  - 2026-09-04에 넣은 계측용 storage 래퍼가 setItem의 QuotaExceededError를 try/catch로 삼켜서
//    라이브러리의 trySave()가 "성공"으로 판단 → `retry: removeOldestQuery`가 한 번도 돌지 않았고,
//    한도를 넘는 순간부터 캐시가 아예 저장되지 않으면서 1초마다 4.8MB 직렬화 + 실패 로그만 반복했다.
//  - 제외 목록의 'leagueRawStats'는 그 뒤 leagueRawPbp/leagueRawPlayers/leagueRawSeasonInjury로
//    쪼개져 코드에 존재하지 않는 키였다(= 제외가 비어 있었음). leagueRawPbp는 방 1개가 48.9MB.
//  - 캐시 전체가 localStorage 키 하나에 들어가는데 multiSearchPool(리그별 키, 약 1.5~2MB)·
//    leagueRawPlayers(방별)가 24시간 동안 리그/방마다 1부씩 누적돼 리그 2~3개만 오가도 5MB 한도를 넘었다.
// 그래서 "전부 저장하되 몇 개 제외" 대신 "작고 잘 안 바뀌는 것만 저장"으로 바꾸고, 리그/방별 키는
// 가장 최근에 갱신된 1개만 저장한다. 메모리 캐시(gcTime)는 이 규칙과 무관하게 그대로 유지된다.
const PERSIST_INCLUDE_ROOT_KEYS = new Set(['multiSearchPool', 'metaPlayerOrder', 'gameShortCodes']);
// 영속 캐시 버전 — 바꾸면 모든 사용자의 localStorage 캐시가 다음 로드 때 한 번 폐기된다.
const PERSIST_CACHE_BUSTER = '2026-10-24-retired-toggle';

/** 같은 루트 키(예: multiSearchPool)의 인스턴스가 여러 개(리그/방마다)면 가장 최근 성공한 1개만 영속. */
const isLatestOfRoot = (query: { queryKey: readonly unknown[]; state: { dataUpdatedAt: number } }): boolean => {
  const root = query.queryKey[0];
  const siblings = queryClient.getQueryCache().findAll({ queryKey: [root] });
  return siblings.every(q => q.state.dataUpdatedAt <= query.state.dataUpdatedAt);
};

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'nba-gm-sim-query-cache',
  // 그래도 quota를 넘기면 오래된 쿼리부터 비우면서 재시도. 실패 사실은 첫 시도에서 한 번만 남긴다
  // (storage를 감싸지 않으므로 setItem의 예외가 라이브러리까지 그대로 전달된다).
  retry: (ctx) => {
    if (ctx.errorCount === 1) console.warn('[persist] localStorage 한도 초과 — 오래된 쿼리부터 제거 후 재시도', ctx.error);
    return removeOldestQuery(ctx);
  },
});

// 개발 서버에서만 콘솔 진단용으로 노출(프로덕션 번들에는 들어가지 않음). 예:
//   JSON.stringify(__queryClient.getQueryCache().findAll({ queryKey: ['multiSearchPool'] })[0]?.state.data).length
if ((import.meta as any).env?.DEV) (window as any).__queryClient = queryClient;

// [2026-10-02] window error / unhandledrejection / online·offline → 전역 토스트(한 번만 설치)
installGlobalErrorHandlers();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 24 * 60 * 60 * 1000,
          // [2026-10-01] 캐시 버스터 — 이 문자열이 저장 당시와 다르면 localStorage 캐시 전체를
          // 한 번 폐기하고 새로 받는다. 빈 선수 풀이 영속 캐시에 굳어버린 사고(AS 2 리그)의
          // 일괄 복구용이며, 앞으로 오염된 캐시를 전원에게서 지워야 할 때 이 값만 바꾸면 된다.
          buster: PERSIST_CACHE_BUSTER,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) =>
              query.state.status === 'success'
              && PERSIST_INCLUDE_ROOT_KEYS.has(query.queryKey[0] as string)
              && isLatestOfRoot(query)
              // [2026-10-01] 선수 풀이 0명이면 영속화하지 않음 — 실패를 성공으로 캐시하는 경로를
              // 위 throw로 막았지만, 응답은 200인데 본문이 비는 식의 우회 경로까지 대비한 안전망.
              // 메모리 캐시는 그대로 두고(필터가 극단적이라 정말 0명인 리그도 있을 수 있음)
              // 다음 접속 때만 다시 받아오게 한다.
              && !(query.queryKey[0] === 'multiSearchPool' && Array.isArray(query.state.data) && query.state.data.length === 0),
          },
        }}
      >
        <App />
        {/* [2026-10-02] 전역 토스트 알림 센터 — 앱 전체에 하나. docs/plan/toast-notification-center-plan.md */}
        <NotificationCenter />
      </PersistQueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryCache } from '@tanstack/query-core';
import { PersistQueryClientProvider, removeOldestQuery } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { injectSpeedInsights } from '@vercel/speed-insights';
import './index.css'; // Tailwind CSS Import
import App from './App';
import { applyEditorToTeamData } from './utils/editorManager';

// Vercel Speed Insights 초기화
injectSpeedInsights();

// 유저 에디터 적용 (React 렌더링 전에 TEAM_DATA 뮤테이트)
applyEditorToTeamData();

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      console.error(`[QueryCache] Query failed:`, query.queryKey, error);
    },
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
// [2026-09-04 임시 계측] createSyncStoragePersister의 trySave()가 storage.setItem() 실패를
// try/catch로 조용히 삼켜버려서(에러 콘솔 출력도, throw도 없음) QuotaExceededError가 나도
// 티가 안 남 — 실제 write 시도 크기와 성공/실패 여부를 직접 로그로 남기기 위해 storage를
// 얇게 감싼다. 원인 확인 끝나면 이 wrapper 제거하고 window.localStorage를 그대로 넘길 것.
const debugStorage: Storage = {
  ...window.localStorage,
  getItem: (k) => window.localStorage.getItem(k),
  removeItem: (k) => window.localStorage.removeItem(k),
  setItem: (k, v) => {
    const sizeKB = (new Blob([v]).size / 1024).toFixed(1);
    try {
      window.localStorage.setItem(k, v);
      console.log(`[perf][persist-debug] localStorage.setItem 성공 — 크기 ${sizeKB}KB`);
    } catch (e) {
      console.error(`[perf][persist-debug] localStorage.setItem 실패! 시도한 크기 ${sizeKB}KB`, e);
    }
  },
};

// [2026-09-04] localStorage 영속 캐시는 오리진당 5~10MB 한도라, 여기 들어가면 안 되는(크고
// 계속 자라나는) 쿼리를 명시적으로 제외한다. FA 렉 조사 중 실측: leagueRawStats 하나가
// 10MB+(방의 경기 박스스코어 전체, 시즌 진행될수록 계속 커짐)로 QuotaExceededError의
// 실제 원인이었고, playerCareerHistory(선수당 별도 엔트리)/faCareerHistoryBulkPrefetch도
// 소규모로 기여했다. 이 셋을 빼면 남는 건 multiSearchPool류의 작고 안 바뀌는 데이터뿐이라
// 캐시 전체가 다시 quota 안에 들어온다.
const PERSIST_EXCLUDE_ROOT_KEYS = new Set(['leagueRawStats', 'playerCareerHistory', 'faCareerHistoryBulkPrefetch']);

const persister = createSyncStoragePersister({
  storage: debugStorage,
  key: 'nba-gm-sim-query-cache',
  // 그래도 다른 대형 쿼리가 새로 생겨서 quota를 넘기면, 오래된 쿼리부터 비우면서 재시도
  // (기존엔 retry 미지정이라 실패 시 그냥 조용히 아무것도 저장 안 됐음).
  retry: removeOldestQuery,
});

// [2026-09-04 임시 계측] 17.8MB까지 커지는 원인(어떤 쿼리가 몇 KB인지)을 콘솔에서 직접
// 확인하기 위해 잠깐 노출 — 원인 확인 끝나면 이 줄 제거할 것.
(window as any).__debugQueryClient = queryClient;

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
          dehydrateOptions: {
            shouldDehydrateQuery: (query) =>
              query.state.status === 'success' && !PERSIST_EXCLUDE_ROOT_KEYS.has(query.queryKey[0] as string),
          },
        }}
      >
        <App />
      </PersistQueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
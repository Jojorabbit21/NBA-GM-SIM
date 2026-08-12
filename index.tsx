import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryCache } from '@tanstack/query-core';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
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
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'nba-gm-sim-query-cache',
});

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
        persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
      >
        <App />
      </PersistQueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
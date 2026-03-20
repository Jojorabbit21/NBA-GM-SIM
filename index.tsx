import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { QueryClient, QueryCache } from '@tanstack/query-core';
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

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
// Fix: Import the module as a whole to bypass named export errors for QueryClient
import * as ReactQuery from '@tanstack/react-query';
import { injectSpeedInsights } from '@vercel/speed-insights';
import App from './App';

// Vercel Speed Insights 초기화
injectSpeedInsights();

// Fix: Access QueryClient from the imported module
const { QueryClient, QueryClientProvider } = ReactQuery as any;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false, // 게임 상태 보존을 위해 기본적으로 끔
      staleTime: 1000 * 60 * 5, // 5분간 데이터를 신선한 것으로 간주
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
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
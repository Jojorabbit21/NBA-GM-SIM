
import React from 'react';

// 데이터 로딩 중 자리표시자 — 실제 값처럼 보이는 폴백(UUID, 하드코딩 기본값 등) 대신
// "아직 로딩 중"임을 명시하는 회색 펄스 바. views/lobby/LobbyPanel.tsx의 SkeletonCard와
// 동일한 톤(bg-slate-700/30 + animate-pulse)을 공용 컴포넌트로 분리.
export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-16' }) => (
    <span className={`inline-block rounded bg-slate-700/30 animate-pulse ${className}`} />
);

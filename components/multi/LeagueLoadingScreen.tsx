/**
 * LeagueLoadingScreen — 리그 진입 로딩 화면(LeagueLayout의 리그/시즌 로딩 + 부트스트랩 프리패치 동안).
 * [2026-10-06] 기존 전체화면 스피너(Loader2 인디고 32px) 아래에 재치 문구(utils/loadingQuips.ts 5종, 2초 교체)를 붙임.
 * 같은 날 사용자 요청으로 스피너 위에 BM27 로고(public/logos/main.svg, 시작 메뉴 StartMenu와 같은 h-9)를 추가.
 * 진행률·퍼센트·막대 없음(같은 날 폐기 — 로딩이 1초 안쪽이라 막대가 보이지 않았음).
 */
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { LOADING_QUIPS, LOADING_QUIP_INTERVAL_MS, nextQuipIndex } from '../../utils/loadingQuips';
import { APP_NAME } from '../../utils/constants';

export const LeagueLoadingScreen: React.FC = () => {
    const [quip, setQuip] = useState(() => nextQuipIndex(-1));

    useEffect(() => {
        const t = setInterval(() => setQuip(prev => nextQuipIndex(prev)), LOADING_QUIP_INTERVAL_MS);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center gap-3 h-full min-h-screen bg-gray-950">
            <img src="/logos/main.svg" alt={APP_NAME} className="h-9 w-auto mb-3 select-none" draggable={false} />
            <Loader2 size={32} className="animate-spin text-indigo-400" />
            <p className="text-base text-white ko-normal">{LOADING_QUIPS[quip]}…</p>
        </div>
    );
};

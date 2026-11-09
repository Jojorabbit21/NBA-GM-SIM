/**
 * LeagueLoadingScreen — 리그 진입 로딩 화면(LeagueLayout의 리그/시즌 로딩 + 부트스트랩 프리패치 동안).
 * [2026-10-06] 기존 전체화면 스피너(Loader2 인디고 32px) 아래에 재치 문구(utils/loadingQuips.ts 5종, 2초 교체)를 붙임.
 * 같은 날 사용자 요청으로 스피너 위에 BM27 로고(public/logos/league/Main.svg, 당시 시작 메뉴 StartMenu와 같은 h-9)를 추가.
 * [2026-11-09] 로고를 w-[min(520px,85vw)]로 크게 키움(시작 메뉴 로고는 StartScreen 상단 h-16). 같은 날 폰 뷰포트는 세로형 MainVert.svg로 분기.
 * 진행률·퍼센트·막대 없음(같은 날 폐기 — 로딩이 1초 안쪽이라 막대가 보이지 않았음).
 */
import React, { useEffect, useState } from 'react';
import { Spinner } from '../common/Spinner';
import { LOADING_QUIPS, LOADING_QUIP_INTERVAL_MS, nextQuipIndex } from '../../utils/loadingQuips';
import { APP_NAME, getLeagueLogoUrl } from '../../utils/constants';
import { useIsPhone } from '../../hooks/useViewportClass';

export const LeagueLoadingScreen: React.FC = () => {
    const [quip, setQuip] = useState(() => nextQuipIndex(-1));
    const isPhone = useIsPhone();

    useEffect(() => {
        const t = setInterval(() => setQuip(prev => nextQuipIndex(prev)), LOADING_QUIP_INTERVAL_MS);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center gap-3 h-full min-h-screen bg-gray-950">
            {/* [2026-11-09] 사용자 요청으로 아주 크게 — 너비 기준으로 잡아 비율 유지·넘침 방지.
                폰(useIsPhone)은 세로형 워드마크(MainVert 310×274, 최대 240px), 그 외는 가로형(Main 772×181, 최대 520px). */}
            {isPhone ? (
                <img src={getLeagueLogoUrl('MainVert')} alt={APP_NAME} className="w-[min(240px,60vw)] h-auto mb-6 select-none" draggable={false} />
            ) : (
                <img src={getLeagueLogoUrl('Main')} alt={APP_NAME} className="w-[min(520px,85vw)] h-auto mb-6 select-none" draggable={false} />
            )}
            <Spinner variant="page" className="!flex-none !h-auto" />
            <p className="text-base text-white ko-normal">{LOADING_QUIPS[quip]}…</p>
        </div>
    );
};

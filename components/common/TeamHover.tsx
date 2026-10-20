import React, { createContext, useContext } from 'react';
import { TeamHoverCard } from './TeamHoverCard';

// 팀 바로가기 링크(팀 이름/로고)에 팀 호버 카드를 붙이는 공용 래퍼.
// 일정·리더보드·로스터처럼 싱글/멀티가 같이 쓰는 화면에도 prop을 내리지 않고 쓸 수 있도록 컨텍스트로 게이트한다:
// 멀티 시즌 레이아웃(MultiSeasonLayout)이 렌더러를 제공할 때만 카드가 붙고, 제공자가 없는 싱글플레이어에서는
// children을 그대로 반환한다. 카드 내용을 컨텍스트로 받는 이유는 이 파일(components/common)이 멀티 화면을
// import하면 components/common → views → components/common 순환 임포트가 생기기 때문이다.
export type TeamHoverRenderer = (teamId: string) => React.ReactNode;

export const TeamHoverRendererContext = createContext<TeamHoverRenderer | null>(null);

interface TeamHoverProps {
    /** 팀 slug(= 팀 ID). 비어 있으면 카드 없이 children만 반환. */
    teamId: string | null | undefined;
    /** 단일 엘리먼트 — cloneElement로 이벤트만 얹으므로 기존 클릭/레이아웃은 그대로다. */
    children: React.ReactElement;
}

export const TeamHover: React.FC<TeamHoverProps> = ({ teamId, children }) => {
    const render = useContext(TeamHoverRendererContext);
    if (!render || !teamId) return children;
    return <TeamHoverCard content={render(teamId)}>{children}</TeamHoverCard>;
};

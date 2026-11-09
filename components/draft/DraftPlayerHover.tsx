// DraftPlayerHover.tsx — 데스크톱 드래프트 룸 선수 이름 호버 카드. [2026-11-09]
// 폰의 이름 탭 팝업(DraftPlayerPopup)과 같은 본문(헤더 + 능력치 3열 + 스카우팅 리포트 펼침)을 호버로 띄운다. 버튼은 비대화형이라 제외.
// Provider가 없는 화면(싱글 드래프트 등)에서는 children을 그대로 반환 → 기존 동작 불변.
import React, { createContext, useContext } from 'react';
import type { Player } from '../../types';
import type { RoomTeamMetaMap } from '../../types/multiDraft';
import { PlayerHoverCard } from '../common/PlayerHoverCard';
import { DraftPlayerCardBody, DraftPlayerScoutLines } from './phone/DraftPlayerPopup';

export interface DraftPlayerHoverLookup {
    getPlayer: (playerId: string) => Player | undefined;
    getDrafted: (playerId: string) => { teamId: string; round: number; pickNumber: number } | null;
    teamMeta?: RoomTeamMetaMap;
}

export const DraftPlayerHoverContext = createContext<DraftPlayerHoverLookup | null>(null);

const HOVER_CLASS = 'cursor-default hover:text-white hover:underline decoration-slate-500 underline-offset-2';

export const DraftPlayerHover: React.FC<{ playerId: string; children: React.ReactElement<{ className?: string }> }> = ({ playerId, children }) => {
    const lookup = useContext(DraftPlayerHoverContext);
    const player = lookup?.getPlayer(playerId);
    if (!lookup || !player || !React.isValidElement(children)) return children;
    const drafted = lookup.getDrafted(playerId);
    const child = React.cloneElement(children, { className: `${children.props.className ?? ''} ${HOVER_CLASS}`.trim() });
    return (
        <PlayerHoverCard
            player={player}
            renderPopup={(ref, style) => (
                <div
                    ref={ref}
                    style={style}
                    className="z-tooltip w-[342px] bg-slate-950 border border-slate-700 rounded-lg shadow-2xl px-3 pt-3 pointer-events-none select-none"
                >
                    <DraftPlayerCardBody player={player} teamMeta={lookup.teamMeta} drafted={drafted} />
                    <div className="border-t border-slate-800 pt-2 text-[13px] font-bold text-slate-200">스카우팅 리포트</div>
                    <DraftPlayerScoutLines player={player} className="pt-1 pb-3" />
                </div>
            )}
        >
            {child}
        </PlayerHoverCard>
    );
};

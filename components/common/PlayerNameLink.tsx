// PlayerNameLink.tsx — 호버카드 + 클릭 이동이 붙은 선수 이름 텍스트. [2026-10-13]
// 인사이트 카드 5곳(팀 리더·존별 리더·선수 스탯)과 트레이드 화면(블록 목록·제안서 자산·카트·히스토리)이
// PlayerHoverCard + `hover:text-indigo-400 cursor-pointer` span을 복붙하던 것(ui-audit 09 후보 5, 04 후보 15).
// 표 셀 전용은 newsFeedLetter의 LetterPlayerCell, 로스터 4열은 PlayerInfoCells.
import React from 'react';
import type { Player } from '../../types';
import { PlayerHoverCard } from './PlayerHoverCard';

interface PlayerNameLinkProps {
    /** 조회 실패(풀에 없는 id 등)로 없을 수 있음 — 그땐 fallbackName을 평문으로 */
    player?: Player | null;
    fallbackName?: string;
    teamAbbr?: string | null;
    onClick?: (player: Player) => void;
    /** 멀티 전용 게이트 — 기본 true */
    enableHoverCard?: boolean;
    /** default = slate-200 semibold 아님(B1), muted = slate-400(보조 목록), strong = 흰색 굵게(제안서·카트) */
    tone?: 'default' | 'muted' | 'strong';
    className?: string;
    /** 이름 대신 보여줄 내용(예: "3. 이름") — 없으면 player.name ?? fallbackName */
    children?: React.ReactNode;
}

const TONE = {
    default: 'text-slate-200',
    muted: 'text-slate-400',
    strong: 'text-white font-bold',
} as const;

export const PlayerNameLink: React.FC<PlayerNameLinkProps> = ({
    player, fallbackName, teamAbbr, onClick, enableHoverCard = true, tone = 'default', className = '', children,
}) => (
    <PlayerHoverCard player={player} teamAbbr={teamAbbr} enabled={enableHoverCard}>
        <span
            className={`text-sm truncate ${TONE[tone]} ${onClick ? 'hover:text-indigo-400 cursor-pointer transition-colors' : ''} ${className}`}
            onClick={onClick ? () => onClick(player as Player) : undefined}
        >
            {children ?? player?.name ?? fallbackName}
        </span>
    </PlayerHoverCard>
);

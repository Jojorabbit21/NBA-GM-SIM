// MobileHeaderActions.tsx — 폰·태블릿 상단 바 우측 액션 묶음: 검색 → 수신함(채팅·DM·알림 배지) → 내 팀 로고(→ 더보기). [2026-10-27]
// MobileTopBar에 있던 것을 분리 — 팀 화면의 팀색 H3 헤더(RosterView phone 분기)도 같은 액션을 쓰기 위해(사용자 지적: 팀 화면에서 채팅
// 진입 경로가 없었음). 리그 컨텍스트 훅을 쓰므로 멀티 안에서만 렌더(RosterView는 prop 슬롯으로 받는다).
// `inheritColor`면 아이콘 색을 부모(팀색 헤더의 color_text)에서 상속, 아니면 slate-200(배지 링은 상단 바에서만).
import React, { useCallback, useState } from 'react';
import { Inbox, Search } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../../views/multi/league/LeagueLayout';
import { useGame } from '../../hooks/useGameContext';
import { useChatDockUnread, requestOpenChatDock } from '../multi/chatDockBridge';
import { useMultiSearchData } from '../../hooks/useMultiSearchData';
import { usePlayerShortCodes } from '../../hooks/usePlayerShortCodes';
import { CountBadge } from '../common/CountBadge';
import { TeamLogo } from '../common/TeamLogo';
import { MobileSearchSheet } from './MobileSearchSheet';
import type { Player } from '../../types';

interface MobileHeaderActionsProps {
    /** 아이콘 색을 부모에서 상속(팀색 헤더). 기본 false = slate-200 */
    inheritColor?: boolean;
    /** 내 팀 로고 버튼(→ 더보기) 표시. 기본 true. 팀 화면 H3에선 팀 로고가 이미 좌측에 있어 false */
    showTeamLogo?: boolean;
}

export const MobileHeaderActions: React.FC<MobileHeaderActionsProps> = ({ inheritColor = false, showTeamLogo = true }) => {
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams, isSpectator } = useLeagueContext();
    const { session } = useGame();
    const base = `/multi/leagues/${leagueId}/season`;
    const myTeam = leagueTeams.find(t => t.user_id === session?.user?.id);
    const unread = useChatDockUnread();

    // 검색 — 데스크톱 헤더와 같은 규칙(드래프트 완료 전엔 검색 대상이 없어 숨김). 데이터 훅은 MultiHeaderNavMenu와 동일(캐시 공유).
    const isDraftComplete = league?.status === 'in_progress' || league?.status === 'finished';
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);
    const { getPlayerUrlId } = usePlayerShortCodes();
    const [searchOpen, setSearchOpen] = useState(false);
    const closeSearch = useCallback(() => setSearchOpen(false), []);
    const viewPlayer = useCallback((p: Player) => navigate(`${base}/player/${getPlayerUrlId(p.id)}`), [navigate, base, getPlayerUrlId]);
    const viewTeam = useCallback((slug: string) => navigate(`${base}/roster?rteam=${slug}`), [navigate, base]);

    const btn = `w-11 h-11 flex items-center justify-center rounded-lg ${inheritColor ? 'active:bg-black/20' : 'text-slate-200 active:bg-white/10'}`;

    return (
        <>
            {isDraftComplete && (
                <button type="button" onClick={() => setSearchOpen(true)} aria-label="팀, 선수 검색" className={btn}>
                    <Search size={22} strokeWidth={1.8} />
                </button>
            )}
            {!isSpectator && (
                <button
                    type="button"
                    onClick={requestOpenChatDock}
                    aria-label={unread > 0 ? `채팅과 알림 열기, 안 읽은 항목 ${unread}개` : '채팅과 알림 열기'}
                    className={`relative ${btn}`}
                >
                    <Inbox size={22} strokeWidth={1.8} />
                    {/* 배지 링은 slate-950 바탕(상단 바)에서만 — 팀색 헤더(inheritColor)는 바탕색을 몰라 링 없이 */}
                    <CountBadge count={unread} size="md" className={`absolute top-1.5 right-1.5 ${inheritColor ? '' : 'ring-2 ring-slate-950'}`} />
                </button>
            )}
            {showTeamLogo && myTeam && (
                <button type="button" onClick={() => navigate(`${base}/more`)} aria-label="내 팀 메뉴" className="w-11 h-11 flex items-center justify-center rounded-lg active:bg-white/10">
                    <TeamLogo teamId={myTeam.team_slug} teamName={myTeam.team_abbr} size="custom" className="w-7 h-7" shadow={false} />
                </button>
            )}
            <MobileSearchSheet
                open={searchOpen}
                onClose={closeSearch}
                leagueTeams={leagueTeams}
                poolPlayers={poolPlayers}
                rosterMap={rosterMap}
                onViewPlayer={viewPlayer}
                onViewTeam={viewTeam}
            />
        </>
    );
};

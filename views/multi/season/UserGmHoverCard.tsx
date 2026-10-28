import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TeamHoverCard } from '../../../components/common/TeamHoverCard';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { calculatePlayerOvr } from '../../../utils/constants';
import { listTradeHistory } from '../../../services/multi/tradeService';
import { ROSTER_STYLE_LABEL_KO } from '../../../services/multi/aiGmProfile';
import {
    classifyTradeActivity, computeRosterStyles, countAcceptedTrades,
    TRADE_ACTIVITY_LABEL_KO, type TradeActivityLabel,
} from '../../../services/multi/userGmProfile';
import { ROSTER_STYLE_TONE } from './frontOfficeCopy';
import type { Player } from '../../../types';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';

// 사람 단장 호버 카드 — 트레이드 방식(성사 횟수 기준 라벨)과 로스터 성향(현재 로스터의 스타 편중도) 두 줄.
// 설계: docs/plan/multi-ai-gm-profile-plan.md 9장. 규격은 AI 프런트 카드(FrontOfficeHoverCard)·팀 호버 카드와 같다.
// 내용 컴포넌트는 호버로 열릴 때만 마운트되므로 아래 조회/계산은 그때 처음 돈다.

export interface UserGmContext {
    leagueTeams: LeagueTeamRow[];
    /** 선수 id → Player (30팀 로스터의 OVR 비교용) */
    poolById: Map<string, Player>;
    roomId: string | null | undefined;
}

const TRADE_ACTIVITY_TONE: Record<TradeActivityLabel, string> = {
    idle: 'bg-slate-800 text-slate-300',
    cautious: 'bg-sky-400/15 text-sky-300',
    neutral: 'bg-emerald-500/15 text-emerald-300',
    active: 'bg-orange-500/15 text-orange-300',
};

const CHIP = 'text-xs px-2 py-0.5 rounded font-semibold';

const UserGmHoverContent: React.FC<{ team: LeagueTeamRow; ctx: UserGmContext }> = ({ team, ctx }) => {
    const { leagueTeams, poolById, roomId } = ctx;

    // 성사된 트레이드는 리그 구성원 누구나 읽을 수 있는 공개 정보(RLS: status='accepted' && accessible room).
    const { data: history, isPending } = useQuery({
        queryKey: ['multiTradeHistory', roomId],
        enabled: !!roomId,
        staleTime: 60_000,
        queryFn: () => listTradeHistory(roomId!),
    });

    const activity = useMemo(
        () => (history ? classifyTradeActivity(countAcceptedTrades(history, team.id)) : null),
        [history, team.id],
    );

    const rosterStyle = useMemo(() => {
        const styles = computeRosterStyles(leagueTeams.map(t => ({
            slug: t.team_slug,
            ovrs: (t.roster ?? [])
                .map(id => poolById.get(id))
                .filter((p): p is Player => !!p)
                .map(p => calculatePlayerOvr(p)),
        })));
        return styles.get(team.team_slug) ?? 'balanced';
    }, [leagueTeams, poolById, team.team_slug]);

    return (
        <div className="w-[300px] bg-slate-950 border border-slate-700 rounded-lg shadow-2xl p-3 select-none">
            <div className="flex items-center gap-2.5 pb-2.5 mb-2.5 border-b border-slate-800">
                <TeamLogo teamId={team.team_slug} teamName={team.team_abbr ?? team.team_slug} size="custom" className="w-9 h-9 shrink-0" shadow={false} />
                <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{team.nickname ?? '-'}</div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">{team.team_name} 단장</div>
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">트레이드 방식</span>
                    {isPending || !activity ? (
                        // 로딩 중에도 칩과 같은 높이를 잡아 데이터가 도착해도 카드 크기가 변하지 않게 한다.
                        <span className="h-[22px] w-10 rounded bg-slate-800/70 animate-pulse" aria-busy="true" />
                    ) : (
                        <span className={`${CHIP} ${TRADE_ACTIVITY_TONE[activity]}`}>{TRADE_ACTIVITY_LABEL_KO[activity]}</span>
                    )}
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">로스터 성향</span>
                    <span className={`${CHIP} ${ROSTER_STYLE_TONE[rosterStyle]}`}>{ROSTER_STYLE_LABEL_KO[rosterStyle]}</span>
                </div>
            </div>
        </div>
    );
};

/** children(닉네임 span 등 단일 엘리먼트)에 사람 단장 카드를 붙인다. */
export const UserGmHover: React.FC<{
    team: LeagueTeamRow;
    ctx: UserGmContext;
    children: React.ReactElement;
}> = ({ team, ctx, children }) => (
    <TeamHoverCard content={<UserGmHoverContent team={team} ctx={ctx} />}>
        {children}
    </TeamHoverCard>
);

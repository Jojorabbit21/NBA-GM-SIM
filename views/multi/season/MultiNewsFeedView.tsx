
import React from 'react';
import { Flame, TrendingUp, Star, ArrowLeftRight, Tv, Loader2, type LucideIcon } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useLeagueHeadlines, type LeagueEvent, type LeagueEventType } from '../../../hooks/useLeagueHeadlines';
import { formatRelativeTime } from '../../../utils/formatRelativeTime';

// 뉴스피드 — 시즌 홈의 "리그 소식" 위젯(MultiSeasonPage.tsx, 최근 8개만)과 동일한
// league_events 소스를 더 넓게(50개) 보여주는 전용 화면. 아이콘 매핑은 그 위젯과
// 동일한 값을 이 화면에도 로컬로 둔다(프레젠테이셔널 마크업은 화면마다 각자 두는
// 이 프로젝트 관례 — 로직/데이터는 useLeagueHeadlines 훅으로 공유).
const HEADLINE_ICON: Record<LeagueEventType, LucideIcon> = {
    game_result: Tv,
    player_feat: Star,
    player_streak: Flame,
    win_streak: TrendingUp,
    trade: ArrowLeftRight,
};

const NUM_FEED_ITEMS = 50;

const MultiNewsFeedView: React.FC = () => {
    const { room } = useLeagueContext();
    const { myTeamId } = useSeasonContext();
    const { data: events, isLoading } = useLeagueHeadlines(room?.id, myTeamId, NUM_FEED_ITEMS);

    return (
        <div className="text-slate-200 pretendard">
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800">
                <h1 className="text-lg font-black text-white ko-tight truncate">뉴스피드</h1>
            </div>

            <div className="max-w-2xl mx-auto py-4 px-4">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={24} className="animate-spin text-indigo-400" />
                    </div>
                ) : !events || events.length === 0 ? (
                    <p className="text-sm text-slate-500 ko-normal py-16 text-center">아직 소식이 없습니다.</p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {events.map((e: LeagueEvent) => {
                            const Icon = HEADLINE_ICON[e.type];
                            return (
                                <li
                                    key={e.id}
                                    className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
                                        e.involvesMyTeam
                                            ? 'bg-emerald-500/10 border-emerald-500/30'
                                            : 'bg-slate-900 border-slate-800'
                                    }`}
                                >
                                    <Icon size={16} className="text-slate-500 mt-0.5 shrink-0" />
                                    <span className="flex-1 min-w-0 text-sm text-slate-200 ko-normal leading-snug">{e.headline}</span>
                                    <span className="text-xs text-slate-500 tabular-nums shrink-0 ko-normal">{formatRelativeTime(e.createdAt)}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default MultiNewsFeedView;


import React, { useMemo } from 'react';
import { useLeaderboardData } from '../../../../hooks/useLeaderboardData';
import type { Team, Game, Player } from '../../../../types';
import { PlayerHoverCard } from '../../../common/PlayerHoverCard';

interface LeaderStatConfig {
    key: string;
    label: string;
    format?: 'percent';
    compute: (s: any, g: number) => number;
}

// PlayerStatsTable.tsx와 동일한 방식(경기당 평균/야투율 직접 계산) — useLeaderboardData가
// 'Players' 모드에서 돌려주는 sortedData[i].stats는 시즌 누적 원시값이라 여기서도 g로 나눈다.
const LEADER_STATS: LeaderStatConfig[] = [
    { key: 'pts', label: 'PTS', compute: (s, g) => s.pts / g },
    { key: 'reb', label: 'REB', compute: (s, g) => s.reb / g },
    { key: 'ast', label: 'AST', compute: (s, g) => s.ast / g },
    { key: 'stl', label: 'STL', compute: (s, g) => s.stl / g },
    { key: 'blk', label: 'BLK', compute: (s, g) => s.blk / g },
    { key: '3p%', label: '3P%', format: 'percent', compute: (s) => (s.p3a > 0 ? s.p3m / s.p3a : 0) },
];

function formatValue(val: number, format?: 'percent'): string {
    if (format === 'percent') return (val * 100).toFixed(1) + '%';
    return val.toFixed(1);
}

// useLeaderboardData가 'Players' 모드 sortedData에 얹어주는 teamAbbr(Player 타입 자체엔
// 없는 필드) — hover 카드 헤더에 소속팀 약어를 표시하기 위해 타입만 좁혀서 그대로 사용.
type PlayerWithTeamAbbr = Player & { teamAbbr?: string };

interface LeaderCard {
    key: string;
    label: string;
    player: PlayerWithTeamAbbr;
    value: number;
    format?: 'percent';
    rank: number;
    total: number;
    top5: { player: PlayerWithTeamAbbr; value: number }[];
}

/** 인사이트 탭 "선수 스탯" 테이블 위 — PTS/REB/AST/STL/BLK/3P% 6개 스탯의 팀 리더(우리 로스터
 *  중 해당 스탯 1위 선수)를 카드로 나열. 순위는 leagueTeams(30팀 전체 로스터)를 기준으로 리그
 *  전체 선수 중 몇 위인지 계산 — 팀 순위(30개 중 몇 위)와 스케일이 달라 TeamStatRankList의
 *  fuchsia/emerald/blue 3단계 색상 컨벤션은 쓰지 않고 단일 색으로 표시. 선수명은 전부 클릭 시
 *  onPlayerClick으로 프로필 이동, hover 시 PlayerHoverCard(항상 활성 — MultiTacticsView.tsx
 *  전용 컴포넌트라 enableHoverCard 게이트 불필요, 다른 곳에서 import되지 않음). */
export const TeamLeadersCards: React.FC<{ leagueTeams: Team[]; myTeamId: string; schedule: Game[]; onPlayerClick?: (player: Player) => void }> = ({ leagueTeams, myTeamId, schedule, onPlayerClick }) => {
    const sortConfig = useMemo(() => ({ key: 'pts', direction: 'desc' as const }), []);
    const { sortedData } = useLeaderboardData(
        leagueTeams, schedule, [], sortConfig, 'Players', [], [], '', 'Traditional', 'regular',
    );

    const cards = useMemo((): LeaderCard[] => {
        return LEADER_STATS.map(stat => {
            const ranked = [...sortedData].sort((a: any, b: any) => {
                const ga = a.stats.g || 1, gb = b.stats.g || 1;
                return stat.compute(b.stats, gb) - stat.compute(a.stats, ga);
            });
            const leader = ranked.find((p: any) => p.teamId === myTeamId);
            if (!leader) return null;
            const rank = ranked.findIndex((p: any) => p.id === leader.id) + 1;
            const g = leader.stats.g || 1;
            // 팀내 TOP 5 — 리그 순위 없이 우리 로스터만 같은 스탯 기준으로 재정렬해 상위 5명만.
            const top5 = ranked
                .filter((p: any) => p.teamId === myTeamId)
                .slice(0, 5)
                .map((p: any) => ({ player: p as PlayerWithTeamAbbr, value: stat.compute(p.stats, p.stats.g || 1) }));
            return {
                key: stat.key,
                label: stat.label,
                player: leader as PlayerWithTeamAbbr,
                value: stat.compute(leader.stats, g),
                format: stat.format,
                rank,
                total: ranked.length,
                top5,
            };
        }).filter((c): c is LeaderCard => c !== null);
    }, [sortedData, myTeamId]);

    if (cards.length === 0) {
        return (
            <div className="w-full bg-slate-900/40 border border-slate-800 p-4 text-center text-sm text-slate-500">
                아직 완료된 경기가 없습니다.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {cards.map(c => (
                <div key={c.key} className="bg-slate-900/40 border border-slate-800 overflow-hidden flex flex-col">
                    {/* 상단(리더) 영역 — slate-800 배경으로 아래 TOP5 리스트와 구분(구분선 대신 면적으로 분리) */}
                    <div className="bg-slate-800 px-3 py-2 flex flex-col gap-1">
                        <span className="text-sm font-normal text-slate-300 uppercase tracking-wider">{c.label}</span>
                        <PlayerHoverCard player={c.player} teamAbbr={c.player.teamAbbr}>
                            <span
                                className="text-sm font-normal text-slate-200 truncate hover:text-indigo-400 cursor-pointer transition-colors"
                                onClick={() => onPlayerClick?.(c.player)}
                            >
                                {c.player.name}
                            </span>
                        </PlayerHoverCard>
                        <div className="flex items-baseline justify-between">
                            <span className="text-lg font-normal text-white tabular-nums">{formatValue(c.value, c.format)}</span>
                            <span className="text-lg font-normal text-white tabular-nums">리그 {c.rank}위</span>
                        </div>
                    </div>
                    {/* 팀내 TOP 5 — 리그 순위 없이 이름+값만 */}
                    <div className="flex flex-col gap-0.5 px-3 py-1.5">
                        {c.top5.map((p, i) => (
                            <div key={i} className="flex items-center justify-between gap-2">
                                <PlayerHoverCard player={p.player} teamAbbr={p.player.teamAbbr}>
                                    <span
                                        className="text-sm font-normal text-slate-400 truncate hover:text-indigo-400 cursor-pointer transition-colors"
                                        onClick={() => onPlayerClick?.(p.player)}
                                    >
                                        {i + 1}. {p.player.name}
                                    </span>
                                </PlayerHoverCard>
                                <span className="text-sm font-normal text-slate-300 tabular-nums shrink-0">{formatValue(p.value, c.format)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

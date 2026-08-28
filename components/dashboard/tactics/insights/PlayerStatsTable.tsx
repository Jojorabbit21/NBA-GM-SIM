
import React from 'react';
import { useLeaderboardData } from '../../../../hooks/useLeaderboardData';
import type { Team, Game, Player } from '../../../../types';

interface PlayerStatsTableProps {
    team: Team;
    schedule: Game[];
    onPlayerClick?: (player: Player) => void;
}

interface ColumnDef {
    key: string;
    label: string;
    format?: 'percent';
    compute: (s: any, g: number) => number;
}

// TeamStatRankList.tsx와 동일한 시각 스타일(같은 컴포넌트 재사용은 아님 — "값|평균|순위" 구조가
// 팀 하나 vs 리그 전체 비교용이라 선수 여러 명을 한 화면에 나열하는 이 용도엔 안 맞음, 대신
// 헤더 배경(slate-700/50)·구분선·text-sm 등 동일한 톤만 맞춰서 새로 작성). RosterStatsStack처럼
// 카테고리 드롭다운/스티키 컬럼/히트맵 없이 로스터 전원을 한 눈에 보여주는 게 목적이라 컬럼을
// 핵심 1차 스탯 몇 개로만 제한.
const COLUMNS: ColumnDef[] = [
    { key: 'mp',  label: 'MIN', compute: (s, g) => s.mp / g },
    { key: 'pts', label: 'PTS', compute: (s, g) => s.pts / g },
    { key: 'reb', label: 'REB', compute: (s, g) => s.reb / g },
    { key: 'ast', label: 'AST', compute: (s, g) => s.ast / g },
    { key: 'stl', label: 'STL', compute: (s, g) => s.stl / g },
    { key: 'blk', label: 'BLK', compute: (s, g) => s.blk / g },
    { key: 'tov', label: 'TOV', compute: (s, g) => s.tov / g },
    { key: 'pf',  label: 'PF',  compute: (s, g) => (s.pf || 0) / g },
    { key: 'fg%', label: 'FG%', format: 'percent', compute: (s) => (s.fga > 0 ? s.fgm / s.fga : 0) },
    { key: '3p%', label: '3P%', format: 'percent', compute: (s) => (s.p3a > 0 ? s.p3m / s.p3a : 0) },
    { key: 'ft%', label: 'FT%', format: 'percent', compute: (s) => (s.fta > 0 ? s.ftm / s.fta : 0) },
];

function formatValue(val: number, format?: 'percent'): string {
    if (format === 'percent') return (val * 100).toFixed(1) + '%';
    return val.toFixed(1);
}

/** 인사이트 탭 "선수 스탯" 위젯 — 로스터 전원을 한 테이블에 1차 스탯 위주로 나열. RosterStatsStack
 *  (리더보드 스타일, 카테고리 드롭다운+스티키 컬럼+히트맵)을 그대로 옮겨오지 않고, 데이터 계산만
 *  useLeaderboardData를 재사용(중복 구현 방지)하고 화면은 TeamStatRankList와 같은 톤의 단순 리스트로
 *  새로 작성 — "바디 너비를 100% 채우는 무거운 테이블은 최소화" 원칙에 맞춤. */
export const PlayerStatsTable: React.FC<PlayerStatsTableProps> = ({ team, schedule, onPlayerClick }) => {
    const sortConfig = React.useMemo(() => ({ key: 'pts', direction: 'desc' as const }), []);
    const { sortedData } = useLeaderboardData(
        [team], schedule, [], sortConfig, 'Players', [], [], '', 'Traditional', 'regular',
    );

    return (
        <div className="w-full bg-slate-900/40 border border-slate-800 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-800">
                <h4 className="text-sm font-normal text-white uppercase tracking-widest">선수 스탯</h4>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 border-b border-slate-700">
                <span className="text-sm font-normal text-slate-300 uppercase tracking-wider w-28 shrink-0 text-left">이름</span>
                <span className="text-sm font-normal text-slate-300 uppercase tracking-wider w-9 shrink-0 text-center">POS</span>
                {COLUMNS.map(c => (
                    <span key={c.key} className="text-sm font-normal text-slate-300 uppercase tracking-wider flex-1 text-right">
                        {c.label}
                    </span>
                ))}
            </div>
            <div className="flex flex-col">
                {sortedData.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-slate-500">아직 완료된 경기가 없습니다.</div>
                ) : (
                    sortedData.map((p: any, i: number) => {
                        const g = p.stats.g || 1;
                        const isLast = i === sortedData.length - 1;
                        return (
                            <div
                                key={p.id}
                                className={`flex items-center gap-2 px-3 py-2.5 ${i % 2 === 1 ? 'bg-slate-700/25' : ''} ${isLast ? '' : 'border-b border-slate-800/60'}`}
                            >
                                <span
                                    className="text-sm font-normal text-slate-200 w-28 shrink-0 text-left truncate hover:text-indigo-400 cursor-pointer transition-colors"
                                    onClick={() => onPlayerClick?.(p as Player)}
                                >
                                    {p.name}
                                </span>
                                <span className="text-sm font-normal text-slate-500 w-9 shrink-0 text-center">{p.position}</span>
                                {COLUMNS.map(c => (
                                    <span key={c.key} className="text-sm font-normal text-white flex-1 text-right">
                                        {formatValue(c.compute(p.stats, g), c.format)}
                                    </span>
                                ))}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

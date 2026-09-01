
import React, { useMemo } from 'react';
import type { Player } from '../../../../types';
import { ZONE_CONFIG, ZONE_AVG } from '../../../../utils/courtZones';
import { PlayerHoverCard } from '../../../common/PlayerHoverCard';

// TeamZoneChart.tsx의 ZONE_STAT_MAP과 동일(그쪽은 export 안 되어 있어 로컬로 재정의) — 10존
// 각각의 원시 zone_*_m/zone_*_a 스탯 키. ZONE_CONFIG 선언 순서 그대로 테이블 행 순서로 사용.
const ZONE_STAT_KEYS: Record<string, { m: string; a: string }> = {
    rim: { m: 'zone_rim_m', a: 'zone_rim_a' },
    paint: { m: 'zone_paint_m', a: 'zone_paint_a' },
    midL: { m: 'zone_mid_l_m', a: 'zone_mid_l_a' },
    midC: { m: 'zone_mid_c_m', a: 'zone_mid_c_a' },
    midR: { m: 'zone_mid_r_m', a: 'zone_mid_r_a' },
    c3L: { m: 'zone_c3_l_m', a: 'zone_c3_l_a' },
    c3R: { m: 'zone_c3_r_m', a: 'zone_c3_r_a' },
    atb3L: { m: 'zone_atb3_l_m', a: 'zone_atb3_l_a' },
    atb3C: { m: 'zone_atb3_c_m', a: 'zone_atb3_c_a' },
    atb3R: { m: 'zone_atb3_r_m', a: 'zone_atb3_r_a' },
};

interface ZoneRow {
    key: string;
    label: string;
    m: number;
    a: number;
    pct: number;
    avg: number;
    countLeader: { player: Player; value: number } | null;
    pctLeader: { player: Player; value: number } | null;
}

/** 기존 TeamZoneEfficiencyTable(존별 팀 전체 성공/시도·FG%)과 TeamZoneLeadersTable(존별
 *  성공개수·성공률 팀 내 1위 선수)을 한 행에 합친 테이블. 두 표 모두 ZONE_CONFIG 순서를
 *  그대로 행 순서로 쓰던 걸 하나의 useMemo에서 같이 계산. 선수명은 클릭 시 onPlayerClick으로
 *  프로필 이동, hover 시 PlayerHoverCard(항상 활성 — MultiTacticsView.tsx 전용 컴포넌트라
 *  enableHoverCard 게이트 불필요). */
export const TeamZoneStatsTable: React.FC<{ roster: Player[]; teamAbbr?: string; onPlayerClick?: (player: Player) => void }> = ({ roster, teamAbbr, onPlayerClick }) => {
    const rows = useMemo((): ZoneRow[] => {
        return ZONE_CONFIG.map(cfg => {
            const stat = ZONE_STAT_KEYS[cfg.key];
            const m = roster.reduce((sum, p) => sum + ((p.stats as any)[stat.m] || 0), 0);
            const a = roster.reduce((sum, p) => sum + ((p.stats as any)[stat.a] || 0), 0);

            let countLeader: { player: Player; value: number } | null = null;
            let pctLeader: { player: Player; value: number } | null = null;
            for (const p of roster) {
                const pm = (p.stats as any)[stat.m] || 0;
                const pa = (p.stats as any)[stat.a] || 0;
                if (pm > 0 && (!countLeader || pm > countLeader.value)) {
                    countLeader = { player: p, value: pm };
                }
                if (pa > 0) {
                    const ppct = pm / pa;
                    if (!pctLeader || ppct > pctLeader.value) {
                        pctLeader = { player: p, value: ppct };
                    }
                }
            }

            return {
                key: cfg.key,
                label: cfg.label,
                m,
                a,
                pct: a > 0 ? m / a : 0,
                avg: ZONE_AVG[cfg.avgKey],
                countLeader,
                pctLeader,
            };
        });
    }, [roster]);

    // 모든 컬럼 flex-1로 균등 분배. 헤더도 데이터 행과 동일한 개수의 flex 아이템을 두고
    // 값이 필요없는 헤더 슬롯은 빈 채로 남겨 gap 개수를 맞춘다(TeamZoneLeadersTable 통합
    // 당시 확립한 패턴 그대로).
    const NAME_CLS = 'flex-1';
    const VALUE_CLS = 'flex-1';

    return (
        <div className="w-full bg-slate-900/40 border border-slate-800 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-800">
                <h4 className="text-sm font-normal text-white uppercase tracking-widest">존별 효율 · 리더</h4>
            </div>
            <div className="flex items-center gap-3 px-3 py-2 bg-slate-700/50 border-b border-slate-700">
                <span className={`text-sm font-normal text-slate-300 uppercase tracking-wider text-left ${NAME_CLS}`}>존</span>
                <span className={`text-sm font-normal text-slate-300 uppercase tracking-wider text-left ${VALUE_CLS}`}>성공/시도</span>
                <span className={`text-sm font-normal text-slate-300 uppercase tracking-wider text-left ${VALUE_CLS}`}>FG%</span>
                <span className={`text-sm font-normal text-slate-300 uppercase tracking-wider text-left ${NAME_CLS}`}>성공개수 리더</span>
                <span className={VALUE_CLS} />
                <span className={`text-sm font-normal text-slate-300 uppercase tracking-wider text-left ${NAME_CLS}`}>성공률 리더</span>
                <span className={VALUE_CLS} />
            </div>
            <div className="flex flex-col">
                {rows.map((row, i) => {
                    const diff = row.pct - row.avg;
                    const diffColor = diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-500';
                    return (
                        <div
                            key={row.key}
                            className={`flex items-center gap-3 px-3 py-2.5 ${i % 2 === 1 ? 'bg-slate-700/25' : ''} ${i < rows.length - 1 ? 'border-b border-slate-800/60' : ''}`}
                        >
                            <span className={`text-sm font-normal text-slate-400 text-left ${NAME_CLS}`}>{row.label}</span>
                            <span className={`text-sm font-normal text-white tabular-nums text-left ${VALUE_CLS}`}>
                                {row.m}/{row.a}
                            </span>
                            <span className={`text-sm font-normal text-white tabular-nums text-left ${VALUE_CLS}`}>
                                {(row.pct * 100).toFixed(1)}%
                                <span className={`ml-1 font-normal ${diffColor}`}>
                                    ({diff > 0 ? '+' : ''}{(diff * 100).toFixed(1)})
                                </span>
                            </span>
                            {row.countLeader ? (
                                <>
                                    <PlayerHoverCard player={row.countLeader.player} teamAbbr={teamAbbr}>
                                        <span
                                            className={`text-sm font-normal text-white text-left truncate hover:text-indigo-400 cursor-pointer transition-colors ${NAME_CLS}`}
                                            onClick={() => onPlayerClick?.(row.countLeader!.player)}
                                        >
                                            {row.countLeader.player.name}
                                        </span>
                                    </PlayerHoverCard>
                                    <span className={`text-sm font-normal text-slate-300 tabular-nums text-left ${VALUE_CLS}`}>{row.countLeader.value}</span>
                                </>
                            ) : (
                                <>
                                    <span className={`text-sm text-slate-600 text-left ${NAME_CLS}`}>-</span>
                                    <span className={VALUE_CLS} />
                                </>
                            )}
                            {row.pctLeader ? (
                                <>
                                    <PlayerHoverCard player={row.pctLeader.player} teamAbbr={teamAbbr}>
                                        <span
                                            className={`text-sm font-normal text-white text-left truncate hover:text-indigo-400 cursor-pointer transition-colors ${NAME_CLS}`}
                                            onClick={() => onPlayerClick?.(row.pctLeader!.player)}
                                        >
                                            {row.pctLeader.player.name}
                                        </span>
                                    </PlayerHoverCard>
                                    <span className={`text-sm font-normal text-slate-300 tabular-nums text-left ${VALUE_CLS}`}>{(row.pctLeader.value * 100).toFixed(1)}%</span>
                                </>
                            ) : (
                                <>
                                    <span className={`text-sm text-slate-600 text-left ${NAME_CLS}`}>-</span>
                                    <span className={VALUE_CLS} />
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

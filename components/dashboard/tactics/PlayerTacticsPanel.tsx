
import React, { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { Player, GameTactics, DepthChart, PlayerTacticConfig } from '../../../types';
import { calculatePlayerOvr } from '../../../utils/constants';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../common/Table';
import { OvrBadge } from '../../common/OvrBadge';

interface PlayerTacticsPanelProps {
    tactics: GameTactics;
    roster: Player[];
    onUpdateTactics: (t: GameTactics) => void;
}

const POSITIONS: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];

function isDefaultConfig(cfg: PlayerTacticConfig): boolean {
    return (
        (!cfg.restThreshold || cfg.restThreshold === 0) &&
        (cfg.returnThreshold ?? 70) === 70 &&
        (cfg.foulPolicy ?? 'auto') === 'auto' &&
        (cfg.garbagePolicy ?? 'auto') === 'auto' &&
        (cfg.clutchPolicy ?? 'auto') === 'auto'
    );
}

export const PlayerTacticsPanel: React.FC<PlayerTacticsPanelProps> = ({
    tactics,
    roster,
    onUpdateTactics,
}) => {
    const depthChart = tactics.depthChart ?? null;

    const groupedRoster = useMemo(() => {
        if (!depthChart) return { ALL: roster };
        const groups: Record<string, Player[]> = { PG: [], SG: [], SF: [], PF: [], C: [], RES: [] };
        const usedIds = new Set<string>();
        POSITIONS.forEach(pos => {
            depthChart[pos].forEach(id => {
                if (id) {
                    const p = roster.find(rp => rp.id === id);
                    if (p) { groups[pos].push(p); usedIds.add(id); }
                }
            });
        });
        roster.forEach(p => { if (!usedIds.has(p.id)) groups['RES'].push(p); });
        return groups;
    }, [depthChart, roster]);

    const getConfig = (playerId: string): PlayerTacticConfig =>
        tactics.playerTactics?.[playerId] ?? {};

    const updateConfig = (playerId: string, patch: Partial<PlayerTacticConfig>) => {
        const next = {
            ...tactics.playerTactics,
            [playerId]: { ...getConfig(playerId), ...patch },
        };
        if (isDefaultConfig(next[playerId])) {
            delete next[playerId];
        }
        onUpdateTactics({ ...tactics, playerTactics: next });
    };

    const handleResetAll = () => {
        onUpdateTactics({ ...tactics, playerTactics: {} });
    };

    const hasAnyConfig = Object.keys(tactics.playerTactics ?? {}).length > 0;

    const inputCls = (isChanged: boolean) =>
        `w-14 bg-slate-950 border rounded px-1.5 py-1 text-xs text-center focus:outline-none transition-colors ${
            isChanged
                ? 'border-indigo-500 text-white'
                : 'border-slate-700 text-slate-400'
        }`;

    const selectCls = (isChanged: boolean) =>
        `bg-slate-950 border rounded px-1.5 py-1 text-xs focus:outline-none transition-colors cursor-pointer ${
            isChanged
                ? 'border-indigo-500 text-white'
                : 'border-slate-700 text-slate-400'
        }`;

    const sections = depthChart ? [...POSITIONS, 'RES' as const] : ['ALL'];
    const posLabels: Record<string, string> = {
        PG: 'PG', SG: 'SG', SF: 'SF', PF: 'PF', C: 'C', RES: 'RES', ALL: '전체',
    };

    return (
        <div>
            {/* 액션 바 */}
            <div className="flex items-center gap-3 px-8 py-3 border-b border-slate-800">
                {hasAnyConfig && (
                    <button
                        onClick={handleResetAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-bold transition-colors"
                    >
                        <RotateCcw size={12} />
                        전원 초기화
                    </button>
                )}
                <span className="text-xs text-slate-500">
                    기본값이 아닌 항목은 <span className="text-indigo-400">파란 테두리</span>로 표시됩니다
                </span>
            </div>

            {/* 테이블 */}
            <Table fullHeight={false} className="!rounded-none !border-x-0 !border-t-0 !shadow-none">
                <TableHead noRow>
                    <tr className="text-slate-500 text-xs font-black uppercase tracking-widest h-10">
                        <TableHeaderCell align="center" className="w-16">포지션</TableHeaderCell>
                        <TableHeaderCell align="left" className="pl-4">선수</TableHeaderCell>
                        <TableHeaderCell className="w-28">
                            <div>휴식 임계치</div>
                            <div className="text-slate-600 font-normal text-[10px] normal-case tracking-normal">0=비활성</div>
                        </TableHeaderCell>
                        <TableHeaderCell className="w-28">
                            <div>복귀 임계치</div>
                            <div className="text-slate-600 font-normal text-[10px] normal-case tracking-normal">기본 70%</div>
                        </TableHeaderCell>
                        <TableHeaderCell className="w-28">파울 정책</TableHeaderCell>
                        <TableHeaderCell className="w-28">가비지타임</TableHeaderCell>
                        <TableHeaderCell className="w-28">클러치 정책</TableHeaderCell>
                    </tr>
                </TableHead>
                <TableBody>
                    {sections.map(pos => {
                        const players = groupedRoster[pos];
                        if (!players || players.length === 0) return null;
                        return players.map((player, idx) => {
                                    const ovr = calculatePlayerOvr(player);
                                    const cfg = getConfig(player.id);
                                    const restVal = cfg.restThreshold ?? 0;
                                    const returnVal = cfg.returnThreshold ?? 70;
                                    const foulVal = cfg.foulPolicy ?? 'auto';
                                    const garbageVal = cfg.garbagePolicy ?? 'auto';
                                    const clutchVal = cfg.clutchPolicy ?? 'auto';
                                    const label = posLabels[pos] ?? pos;

                                    return (
                                        <TableRow key={player.id}>
                                            {/* 포지션 컬럼 — 첫 번째 선수에만 라벨 표시 */}
                                            <TableCell align="center" className="text-[10px] font-black text-slate-500 tracking-widest uppercase">
                                                {idx === 0 ? label : ''}
                                            </TableCell>

                                            {/* 선수명 */}
                                            <TableCell align="left" className="pl-4">
                                                <div className="flex items-center gap-2">
                                                    <OvrBadge value={ovr} size="sm" />
                                                    <span className="text-xs text-slate-200 font-medium truncate max-w-[160px]">
                                                        {player.name}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            {/* 휴식 임계치 */}
                                            <TableCell align="center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={80}
                                                        step={5}
                                                        value={restVal}
                                                        onChange={e => {
                                                            const v = Math.min(80, Math.max(0, Number(e.target.value)));
                                                            updateConfig(player.id, { restThreshold: v });
                                                        }}
                                                        className={inputCls(restVal > 0)}
                                                        title="0=비활성 / 이 체력(%) 이하에서 자동 벤치"
                                                    />
                                                    <span className="text-slate-500 text-xs">%</span>
                                                </div>
                                            </TableCell>

                                            {/* 복귀 임계치 */}
                                            <TableCell align="center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <input
                                                        type="number"
                                                        min={50}
                                                        max={95}
                                                        step={5}
                                                        value={returnVal}
                                                        onChange={e => {
                                                            const v = Math.min(95, Math.max(50, Number(e.target.value)));
                                                            updateConfig(player.id, { returnThreshold: v });
                                                        }}
                                                        className={inputCls(returnVal !== 70)}
                                                        title="이 체력(%) 이상 회복 시 코트 복귀 (기본 70)"
                                                    />
                                                    <span className="text-slate-500 text-xs">%</span>
                                                </div>
                                            </TableCell>

                                            {/* 파울 정책 */}
                                            <TableCell align="center">
                                                <select
                                                    value={foulVal}
                                                    onChange={e => updateConfig(player.id, { foulPolicy: e.target.value as 'auto' | 'ignore' })}
                                                    className={selectCls(foulVal !== 'auto')}
                                                    title="'파울 무시' 시 파울 트러블 매트릭스 무시 (6파울 퇴장은 항상 적용)"
                                                >
                                                    <option value="auto">자동</option>
                                                    <option value="ignore">파울 무시</option>
                                                </select>
                                            </TableCell>

                                            {/* 가비지타임 */}
                                            <TableCell align="center">
                                                <select
                                                    value={garbageVal}
                                                    onChange={e => updateConfig(player.id, { garbagePolicy: e.target.value as 'auto' | 'play' | 'bench' })}
                                                    className={selectCls(garbageVal !== 'auto')}
                                                    title="출전=가비지타임 멤버(빠지지 않음) / 미출전=점수차 15점↑ Q4에서 자동 벤치"
                                                >
                                                    <option value="auto">자동</option>
                                                    <option value="play">출전</option>
                                                    <option value="bench">미출전</option>
                                                </select>
                                            </TableCell>

                                            {/* 클러치 정책 */}
                                            <TableCell align="center">
                                                <select
                                                    value={clutchVal}
                                                    onChange={e => updateConfig(player.id, { clutchPolicy: e.target.value as 'auto' | 'must-play' | 'must-bench' })}
                                                    className={selectCls(clutchVal !== 'auto')}
                                                    title="Q4 마지막 6분(6:00-)에 강제 투입 또는 필수 벤치"
                                                >
                                                    <option value="auto">자동</option>
                                                    <option value="must-play">필수 투입</option>
                                                    <option value="must-bench">필수 벤치</option>
                                                </select>
                                            </TableCell>
                                        </TableRow>
                                    );
                                });
                    })}
                </TableBody>
            </Table>

            {/* 하단 범례 */}
            <div className="px-8 py-4 border-t border-slate-800">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[11px] text-slate-500">
                    <div><span className="text-slate-400 font-semibold">휴식 임계치:</span> 해당 체력 이하에서 자동 임시 벤치. 0이면 비활성.</div>
                    <div><span className="text-slate-400 font-semibold">복귀 임계치:</span> 벤치 후 이 체력 이상 회복 시 코트 복귀.</div>
                    <div><span className="text-slate-400 font-semibold">파울 무시:</span> 파울 트러블 매트릭스 무시. 6파울 퇴장은 항상 적용.</div>
                    <div><span className="text-slate-400 font-semibold">가비지타임 출전:</span> 점수차가 벌어져도 코트에 남는 가비지 멤버로 지정.</div>
                    <div><span className="text-slate-400 font-semibold">가비지타임 미출전:</span> Q4에서 점수차 15점↑이면 자동 교체.</div>
                    <div><span className="text-slate-400 font-semibold">클러치 필수 투입:</span> Q4 마지막 6분에 벤치에 있으면 강제 투입.</div>
                </div>
            </div>
        </div>
    );
};

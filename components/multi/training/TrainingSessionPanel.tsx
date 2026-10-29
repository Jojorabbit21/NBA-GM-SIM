import React, { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Dropdown, DropdownButton } from '../../common/Dropdown';
import { Button } from '../../common/Button';
import { InlineNotice } from '../../common/InlineNotice';
import { OvrBadge } from '../../common/OvrBadge';
import { ConditionBar } from '../../common/ConditionBar';
import { TeamLogo } from '../../common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../common/Table';
import { calculatePlayerOvr } from '../../../utils/constants';
import { applyDepthPreset, applyTeamPreset } from '../../../utils/tacticPresetData';
import { generateAutoTactics } from '../../../services/gameEngine';
import { OFFENSE_SLIDER_GROUPS, DEFENSE_SLIDER_GROUPS, PNR_STEPS } from '../../dashboard/tactics/tacticsSliderConfig';
import {
    TRAINING_OFFENSE_PRESETS, TRAINING_DEFENSE_PRESETS, TRAINING_SESSIONS_PER_REST_DAY,
    DEFAULT_TRAINING_OFFENSE, DEFAULT_TRAINING_DEFENSE,
    type TrainingOffensePresetId, type TrainingDefensePresetId,
} from '../../../services/multi/trainingPresets';
import type { TrainingStartRequest } from '../../../services/multi/trainingService';
import type { DepthPresetData, TeamPresetData, MultiTacticPreset, TacticPresetSlot } from '../../../services/multi/tacticPresets';
import type { DepthChart, GameTactics, Player, TacticalSliders } from '../../../types';

// 트레이닝 세션 탭 [2026-10-29] — docs/plan/practice-scrimmage-plan.md 7절, 목업 https://claude.ai/artifact/Q8noraocakoTWxTMLC1ufA
// 시작 바 → 우리 팀(저장된 프리셋) | 상대(팀 선택 · 전술 선택). 화면 안 설명글은 두지 않는다(사용자 결정).

export interface TrainingOpponent {
    id: string;
    name: string;
    roster: Player[];
}

interface TrainingSessionPanelProps {
    roomId: string;
    myTeamId: string;
    myRoster: Player[];
    /** 프리셋을 고르지 않았을 때 쓰는 값 = 마지막으로 저장된 전술 */
    savedTactics: GameTactics;
    savedDepthChart: DepthChart | null;
    depthPresets: MultiTacticPreset[];
    teamPresets: MultiTacticPreset[];
    conditions: Map<string, number | null>;
    opponents: TrainingOpponent[];
    /** 지금 부상·출장정지 중인 선수 — 상대 팀 로스터에서 뺀다 */
    unavailableIds: Set<string>;
    defaultOpponentId?: string;
    available: boolean;
    remaining: number;
    onStart: (req: TrainingStartRequest) => Promise<string | null>;
}

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const SAVED_KEY = 'saved';

interface LineupRow { player: Player; pos: string; minutes: number; rotation: boolean[] }

/** 뎁스차트 주전 5명(포지션 순) + 나머지(출전 시간 → OVR 순) */
function buildLineup(roster: Player[], depthChart: DepthChart | null | undefined, rotationMap: Record<string, boolean[]> | undefined) {
    const rotationOf = (id: string) => Array.from({ length: 48 }, (_, i) => !!rotationMap?.[id]?.[i]);
    const minutesOf = (id: string) => rotationOf(id).filter(Boolean).length;
    const byId = new Map(roster.map(p => [p.id, p]));
    const starters: LineupRow[] = [];
    const used = new Set<string>();
    for (const pos of POSITIONS) {
        const id = depthChart?.[pos]?.[0];
        const p = id ? byId.get(id) : undefined;
        if (!p || used.has(p.id)) continue;
        used.add(p.id);
        starters.push({ player: p, pos, minutes: minutesOf(p.id), rotation: rotationOf(p.id) });
    }
    const bench = roster
        .filter(p => !used.has(p.id))
        .map(p => ({ player: p, pos: p.position, minutes: minutesOf(p.id), rotation: rotationOf(p.id) }))
        .sort((a, b) => b.minutes - a.minutes || calculatePlayerOvr(b.player) - calculatePlayerOvr(a.player));
    return { starters, bench };
}

/** 상단 툴바 — 팀 전술 탭 툴바와 같은 규격 */
const PanelToolbar: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
    <div className="px-6 py-3 min-h-14 bg-slate-800 border-b border-slate-600 flex items-center gap-4">
        <span className="text-base font-black text-white shrink-0">{title}</span>
        {children}
    </div>
);

const SubHeader: React.FC<{ title: string }> = ({ title }) => (
    <div className="h-10 px-6 flex items-center bg-slate-950 border-b border-slate-800 text-sm font-bold text-slate-300">{title}</div>
);

const SelectRow: React.FC<{ label: string; children: React.ReactNode; divider?: boolean }> = ({ label, children, divider = true }) => (
    <div className={`px-6 py-2.5 bg-slate-900 grid grid-cols-[112px_minmax(0,1fr)] items-center ${divider ? 'border-b border-slate-700' : ''}`}>
        <span className="text-sm font-bold text-slate-400">{label}</span>
        {children}
    </div>
);

function SimpleSelect<T extends string>({ value, options, onChange, disabled }: {
    value: T; options: { id: T; label: React.ReactNode }[]; onChange: (id: T) => void; disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const current = options.find(o => o.id === value);
    return (
        <Dropdown
            isOpen={open}
            onOpenChange={o => !disabled && setOpen(o)}
            align="left"
            width="w-60"
            trigger={<DropdownButton isOpen={open} label={current?.label ?? ''} className={`h-8 w-full max-w-60 !px-3 !py-0 ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`} />}
            items={options.map(o => ({ id: o.id, label: <span className="truncate">{o.label}</span>, active: o.id === value, onClick: () => onChange(o.id) }))}
        />
    );
}

/** 48분 로테이션 막대 — 분당 1칸, 쿼터 사이 2px 간격(로테이션 탭과 같은 의미: 칸이 채워지면 그 분에 코트) */
const RotationStrip: React.FC<{ cells: boolean[]; starter: boolean }> = ({ cells, starter }) => (
    <span className="flex h-2.5 w-full gap-[2px]" aria-hidden="true">
        {[0, 1, 2, 3].map(q => (
            <span key={q} className="flex-1 flex gap-px">
                {cells.slice(q * 12, q * 12 + 12).map((on, i) => (
                    <span key={i} className={`flex-1 rounded-[1px] ${on ? (starter ? 'bg-indigo-500' : 'bg-amber-500/80') : 'bg-slate-800'}`} />
                ))}
            </span>
        ))}
    </span>
);

const LineupTable: React.FC<{ starters: LineupRow[]; bench: LineupRow[]; conditions?: Map<string, number | null>; showRotation?: boolean }> = ({ starters, bench, conditions, showRotation = false }) => {
    const colSpan = 4 + (conditions ? 1 : 0) + (showRotation ? 1 : 0);
    const renderRow = (r: LineupRow, starter: boolean) => (
        <TableRow key={r.player.id} className="h-10">
            <TableCell align="center" className="text-sm font-bold text-white">{r.pos}</TableCell>
            <TableCell align="center"><OvrBadge value={calculatePlayerOvr(r.player)} size="sm" className="!shadow-none inline-flex" /></TableCell>
            <TableCell align="left" className="text-sm font-semibold text-slate-200 truncate">{r.player.name}</TableCell>
            {conditions && (
                <TableCell align="left">
                    <ConditionBar value={conditions.get(r.player.id) ?? r.player.condition ?? 100} size="xs" />
                </TableCell>
            )}
            {showRotation && (
                <TableCell align="left" className="!px-3"><RotationStrip cells={r.rotation} starter={starter} /></TableCell>
            )}
            <TableCell align="right" className={`pr-4 text-sm font-semibold tabular-nums ${r.minutes === 0 ? 'text-slate-500' : starter ? 'text-emerald-400' : 'text-amber-400'}`}>
                {r.minutes === 0 ? '–' : r.minutes}
            </TableCell>
        </TableRow>
    );
    const group = (label: string) => (
        <tr className="h-8">
            <td colSpan={colSpan} className="bg-slate-800 border-b border-slate-800 pl-4 text-sm font-black text-slate-500">{label}</td>
        </tr>
    );
    return (
        <Table variant="flush" dividers={false} fullHeight={false} tableStyle={{ tableLayout: 'fixed' }}>
            <colgroup>
                <col style={{ width: 52 }} />
                <col style={{ width: 48 }} />
                <col style={showRotation ? { width: 168 } : undefined} />
                {conditions && <col style={{ width: 88 }} />}
                {showRotation && <col />}
                <col style={{ width: 48 }} />
            </colgroup>
            <TableHead>
                <TableHeaderCell>POS</TableHeaderCell>
                <TableHeaderCell>OVR</TableHeaderCell>
                <TableHeaderCell align="left">선수</TableHeaderCell>
                {conditions && <TableHeaderCell align="left">체력</TableHeaderCell>}
                {showRotation && (
                    <th className="px-3 bg-slate-950 border-b border-slate-800 text-sm font-bold text-slate-400">
                        <span className="flex gap-[2px]">{['1Q', '2Q', '3Q', '4Q'].map(q => <span key={q} className="flex-1 text-left">{q}</span>)}</span>
                    </th>
                )}
                <TableHeaderCell align="right" className="pr-4">분</TableHeaderCell>
            </TableHead>
            <TableBody>
                {group('주전')}
                {starters.map(r => renderRow(r, true))}
                {group('벤치')}
                {bench.map(r => renderRow(r, false))}
            </TableBody>
        </Table>
    );
};

const SliderReadout: React.FC<{ sliders: Partial<TacticalSliders>; kind: 'offense' | 'defense' }> = ({ sliders, kind }) => {
    const items = (kind === 'offense' ? OFFENSE_SLIDER_GROUPS : DEFENSE_SLIDER_GROUPS).flatMap(g => g.items);
    return (
        <div className="px-6 pt-1 pb-2 bg-slate-900 border-b border-slate-700">
            {items.map(item => {
                const v = Number(sliders[item.key] ?? 0);
                const isPnr = item.key === 'pnrDefense';
                const steps = isPnr ? PNR_STEPS : item.steps;
                const step = steps.reduce((best, s) => (Math.abs(s.value - v) < Math.abs(best.value - v) ? s : best), steps[0]);
                const pct = isPnr ? ((v + 1) / 3) * 100 : v * 10;
                return (
                    <div key={item.key} className="h-[34px] flex items-center gap-3">
                        <span className="w-28 shrink-0 text-sm font-semibold text-white truncate">{item.label}</span>
                        <span className="flex-1 relative h-1.5 rounded-full bg-slate-800">
                            <span className="absolute inset-y-0 left-0 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="w-28 shrink-0 text-right text-sm font-semibold text-slate-400 truncate">{step?.label}</span>
                    </div>
                );
            })}
        </div>
    );
};

export const TrainingSessionPanel: React.FC<TrainingSessionPanelProps> = ({
    roomId, myRoster, savedTactics, savedDepthChart, depthPresets, teamPresets, conditions,
    opponents, unavailableIds, defaultOpponentId, available, remaining, onStart,
}) => {
    const [depthKey, setDepthKey] = useState<string>(SAVED_KEY);
    const [teamKey, setTeamKey] = useState<string>(SAVED_KEY);
    const [opponentId, setOpponentId] = useState<string>(defaultOpponentId ?? opponents[0]?.id ?? '');
    const [offenseId, setOffenseId] = useState<TrainingOffensePresetId>(DEFAULT_TRAINING_OFFENSE);
    const [defenseId, setDefenseId] = useState<TrainingDefensePresetId>(DEFAULT_TRAINING_DEFENSE);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const presetOptions = (presets: MultiTacticPreset[]) => [
        { id: SAVED_KEY, label: '현재 저장된 전술' },
        ...[...presets].sort((a, b) => a.slot - b.slot).map(p => ({ id: String(p.slot), label: p.name })),
    ];

    // 우리 팀 — 고른 뎁스 프리셋을 저장된 전술 위에 적용(나간 선수는 applyDepthPreset이 정리)
    const myLineup = useMemo(() => {
        const rosterIds = myRoster.map(p => p.id);
        let tactics = savedTactics;
        let depthChart = savedDepthChart;
        const depthPreset = depthPresets.find(p => String(p.slot) === depthKey);
        if (depthPreset) {
            const res = applyDepthPreset(tactics, depthPreset.data as DepthPresetData, rosterIds);
            tactics = res.tactics;
            depthChart = res.depthChart;
        }
        const teamPreset = teamPresets.find(p => String(p.slot) === teamKey);
        if (teamPreset) tactics = applyTeamPreset(tactics, teamPreset.data as TeamPresetData);
        return buildLineup(myRoster, depthChart, tactics.rotationMap);
    }, [myRoster, savedTactics, savedDepthChart, depthPresets, teamPresets, depthKey, teamKey]);

    // 상대 — 출전 가능 선수로 자동 뎁스·로테이션(미리보기). 실제 경기는 서버 AI 감독(planAiTeam)이 같은 로스터로 정한다.
    const opponent = opponents.find(o => o.id === opponentId) ?? null;
    const oppLineup = useMemo(() => {
        if (!opponent) return null;
        const roster = opponent.roster.filter(p => !unavailableIds.has(p.id) && p.health !== 'Injured');
        const auto = generateAutoTactics({ id: opponent.id, name: opponent.name, roster } as any);
        return buildLineup(roster, auto.depthChart ?? null, auto.rotationMap);
    }, [opponent, unavailableIds]);

    const offense = TRAINING_OFFENSE_PRESETS.find(p => p.id === offenseId)!;
    const defense = TRAINING_DEFENSE_PRESETS.find(p => p.id === defenseId)!;
    const canStart = available && remaining > 0 && !!opponent && !running;

    const handleStart = async () => {
        if (!canStart) return;
        setRunning(true);
        setError(null);
        const err = await onStart({
            roomId,
            opponentTeamId: opponentId,
            offensePreset: offenseId,
            defensePreset: defenseId,
            depthPresetSlot: depthKey === SAVED_KEY ? null : (Number(depthKey) as TacticPresetSlot),
            teamPresetSlot: teamKey === SAVED_KEY ? null : (Number(teamKey) as TacticPresetSlot),
        });
        setRunning(false);
        if (err) setError(err);
    };

    return (
        <div className="flex flex-col">
            {/* 시작 바 */}
            {/* 폰(<640)에선 좌우 16 · 간격 12, 횟수 블록 숨김(숫자만) — 칩·라벨·숫자는 줄바꿈 금지. 실패 안내는 폰에서 바 아래 줄로 */}
            <div className="bg-slate-900 border-b border-slate-700 shrink-0">
                <div className="h-16 px-4 sm:px-8 flex items-center gap-3 sm:gap-4">
                    <span className={`h-6 px-2 rounded inline-flex items-center shrink-0 whitespace-nowrap text-xs font-bold ${available ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/20 text-slate-300'}`}>
                        {available ? '훈련 가능' : '훈련 불가능'}
                    </span>
                    <span className="flex items-center gap-2 min-w-0 whitespace-nowrap">
                        <span className="text-sm font-bold text-slate-400">남은 훈련</span>
                        <span className="hidden sm:flex gap-[3px]" aria-hidden="true">
                            {Array.from({ length: TRAINING_SESSIONS_PER_REST_DAY }, (_, i) => (
                                <span key={i} className={`w-2 h-1.5 rounded-sm ${i >= TRAINING_SESSIONS_PER_REST_DAY - remaining ? 'bg-indigo-500' : 'bg-slate-700'}`} />
                            ))}
                        </span>
                        <span className="text-sm font-bold text-white tabular-nums">{remaining} / {TRAINING_SESSIONS_PER_REST_DAY}</span>
                    </span>
                    <span className="ml-auto flex items-center gap-3 shrink-0">
                        {error && <span className="hidden sm:flex"><InlineNotice tone="danger" size="sm">{error}</InlineNotice></span>}
                        <Button variant="primary" size="xl" className="whitespace-nowrap" onClick={handleStart} disabled={!canStart} isLoading={running} loadingText="시뮬레이션 중…" icon={<Play size={14} fill="currentColor" />}>
                            훈련 시작
                        </Button>
                    </span>
                </div>
                {error && <div className="sm:hidden px-4 pb-3"><InlineNotice tone="danger" size="sm">{error}</InlineNotice></div>}
            </div>

            {/* 2단: 우리 팀(로테이션 매트릭스 포함) | 상대(좁은 로스터 + 전술 선택) */}
            <div className={`grid grid-cols-1 xl:grid-cols-2 border-b border-slate-700 ${running ? 'pointer-events-none opacity-60' : ''}`}>
                {/* 우리 팀 */}
                <section className="flex flex-col min-w-0 xl:border-r border-slate-700">
                    <PanelToolbar title="우리 팀" />
                    <SelectRow label="뎁스 · 로테이션">
                        <SimpleSelect value={depthKey} options={presetOptions(depthPresets)} onChange={setDepthKey} />
                    </SelectRow>
                    <SelectRow label="팀 전술">
                        <SimpleSelect value={teamKey} options={presetOptions(teamPresets)} onChange={setTeamKey} />
                    </SelectRow>
                    <LineupTable starters={myLineup.starters} bench={myLineup.bench} conditions={conditions} showRotation />
                </section>

                {/* 상대 — 팀 선택 · 전술 선택 2단 */}
                <section className="flex flex-col min-w-0">
                    <PanelToolbar title="상대">
                        <div className="ml-auto w-60">
                            <SimpleSelect
                                value={opponentId}
                                options={opponents.map(o => ({
                                    id: o.id,
                                    label: (
                                        <span className="flex items-center gap-2 min-w-0">
                                            <TeamLogo teamId={o.id} teamName={o.name} size="custom" className="w-5 h-5 shrink-0" shadow={false} />
                                            <span className="truncate">{o.name}</span>
                                        </span>
                                    ),
                                }))}
                                onChange={setOpponentId}
                            />
                        </div>
                    </PanelToolbar>
                    <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] flex-1">
                        <div className="flex flex-col min-w-0 md:border-r border-slate-700">
                            <SubHeader title="팀 선택" />
                            {oppLineup && <LineupTable starters={oppLineup.starters} bench={oppLineup.bench} />}
                        </div>
                        <div className="flex flex-col min-w-0 bg-slate-900">
                            <SubHeader title="전술 선택" />
                            <SelectRow label="공격 프리셋" divider={false}>
                                <SimpleSelect<TrainingOffensePresetId> value={offenseId} options={TRAINING_OFFENSE_PRESETS.map(p => ({ id: p.id, label: p.label }))} onChange={setOffenseId} />
                            </SelectRow>
                            {offense.sliders
                                ? <SliderReadout sliders={offense.sliders} kind="offense" />
                                : <div className="border-b border-slate-700" />}
                            <SelectRow label="수비 프리셋" divider={false}>
                                <SimpleSelect<TrainingDefensePresetId> value={defenseId} options={TRAINING_DEFENSE_PRESETS.map(p => ({ id: p.id, label: p.label }))} onChange={setDefenseId} />
                            </SelectRow>
                            <SliderReadout sliders={defense.sliders} kind="defense" />
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

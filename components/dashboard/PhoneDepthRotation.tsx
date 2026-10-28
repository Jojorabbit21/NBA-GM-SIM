// PhoneDepthRotation.tsx — 폰(<768) 뎁스 차트·로테이션 탭 렌더러. [2026-10-28 모바일 전술]
// docs/ui/mobile-design-system.md §9-1-11, 캔버스 12행 X1~X3. 상태·핸들러는 DepthRotationBoard가 그대로 들고(슬롯 변경/스왑·자동 배정·초기화·
// 드래그 커밋 = 데스크톱과 같은 함수), 이 파일은 폰 화면만 그린다:
//   세그먼트 44(뎁스 차트 | 로테이션) → 툴바 44(프리셋 선택기 toolbarExtra + ⋯ 메뉴 시트: 포지션 자동 배정 2종 · 출전시간 자동 배정 3종 · 초기화)
//   검증 배너(5명 미만/초과·혹사, 데스크톱 문구)는 툴바 바로 아래 — 두 세그먼트 공통(2026-10-28)
//   뎁스 차트: 그룹 머리 32(주전/벤치/써드) + 행 48 [POS 40][OVR 28][이름 · 체력 바 · 부상 배지(한 줄)][분][▾] → 행 탭 = 선수 선택 시트(슬롯 비우기 + 로스터;
//             다른 슬롯의 선수를 고르면 두 슬롯 맞바꿈 = 데스크톱 드래그 교체, 슬롯에 없는 선수면 교체)
//   로테이션: 가로 스크롤 없음(2026-10-28 사용자 지적 — 좁은 화면에선 칠하기와 좌우 슬라이드를 같이 하기 어렵다) → 쿼터 탭 4개로 12분씩 보여 주고
//             선수 열 160 = 두 줄(이름 / 체력 바·부상 배지, OVR 없음) + 분. 바는 12칸이 남은 폭(≈230px, 칸 19px)을 다 쓰고
//             포인터 이벤트로 칠한다(`touch-action: none`). 바 아래 4px 띠가 48분 전체 요약(현재 쿼터 구간 강조).
import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, MoreHorizontal } from 'lucide-react';
import type { Player, Team, GameTactics, DepthChart } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { ConditionBar } from '../common/ConditionBar';
import { InjuryStatusBadge } from '../common/InjuryStatusBadge';
import { formatPlayerActiveInjuryLabel } from '../../services/multi/activeInjuryStatus';
import { BottomSheet, SheetGroupTitle } from '../mobile/BottomSheet';
import { computeStints, type Stint, type DragState } from './RotationGanttChart';
import {
    ROTATION_ALLOCATION_OPTIONS, EMPTY_48, getMinutesColor,
    type RotationAllocationMode, type RotationValidation,
} from '../../utils/rotationAllocation';

const POSITIONS: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const DEPTH_LABELS = ['주전', '벤치', '써드'];
type SlotRef = { pos: keyof DepthChart; idx: number };
type Segment = 'depth' | 'rotation';

/** 로테이션 선수 열 폭 — 뎁스 차트 행의 선수 칸을 좁힌 것(2026-10-28) */
const NAME_COL_W = 160;
const QUARTER_LABELS = ['1쿼터', '2쿼터', '3쿼터', '4쿼터'];

interface PhoneDepthRotationProps {
    team: Team;
    tactics: GameTactics;
    depthChart: DepthChart;
    sortedRoster: Player[];
    ovrMap: Map<string, number>;
    validation: RotationValidation;
    playerConditions?: Map<string, number | null>;
    coachName?: string;
    toolbarExtra?: React.ReactNode;
    dragging: DragState | null;
    onBarDown: (playerId: string, minute: number) => void;
    onBarMove: (playerId: string, minute: number) => void;
    onBarCommit: (d: DragState) => void;
    onSlotChange: (pos: keyof DepthChart, depthIndex: number, playerId: string) => void;
    onSlotSwap: (from: SlotRef, to: SlotRef) => void;
    onAutoFillDepth: (mode: 'Ability' | 'Stamina') => void;
    onAllocateRotation: (mode: RotationAllocationMode) => void;
    onResetAll: () => void;
}

// 데스크톱 DepthRotationBoard.minutesToRanges와 같은 표기("N쿼터 a~b분")
function minutesToRanges(indices: number[]): string {
    if (indices.length === 0) return '';
    const ranges: string[] = [];
    let i = 0;
    while (i < indices.length) {
        const quarter = Math.floor(indices[i] / 12) + 1;
        const start = (indices[i] % 12) + 1;
        let prev = start;
        let j = i + 1;
        while (j < indices.length && indices[j] === indices[j - 1] + 1 && Math.floor(indices[j] / 12) + 1 === quarter) {
            prev = (indices[j] % 12) + 1;
            j++;
        }
        ranges.push(start === prev ? `${quarter}쿼터 ${start}분` : `${quarter}쿼터 ${start}~${prev}분`);
        i = j;
    }
    return ranges.join(', ');
}

/** 시트 안 메뉴 행 44 — 라벨 14/600 + 보조 설명 12 */
const MenuRow: React.FC<{ label: string; sub?: string; danger?: boolean; onClick: () => void }> = ({ label, sub, danger = false, onClick }) => (
    <button type="button" onClick={onClick} className={`w-full min-h-[44px] py-2 flex items-center justify-between gap-3 text-left active:bg-white/5 ${danger ? 'text-red-400' : 'text-slate-200'}`}>
        <span className="text-sm font-semibold">{label}</span>
        {sub && <span className="text-xs text-slate-500 shrink-0">{sub}</span>}
    </button>
);

export const PhoneDepthRotation: React.FC<PhoneDepthRotationProps> = ({
    team, tactics, depthChart, sortedRoster, ovrMap, validation, playerConditions, coachName, toolbarExtra,
    dragging, onBarDown, onBarMove, onBarCommit, onSlotChange, onSlotSwap, onAutoFillDepth, onAllocateRotation, onResetAll,
}) => {
    const [segment, setSegment] = useState<Segment>('depth');
    const [menuOpen, setMenuOpen] = useState(false);
    const [slotSheet, setSlotSheet] = useState<SlotRef | null>(null);
    const [quarter, setQuarter] = useState(0);

    const playerById = useMemo(() => new Map(team.roster.map(p => [p.id, p])), [team.roster]);
    // 선수 → 현재 슬롯 라벨("주전 PG") — 선수 선택 시트의 캡션과 스왑 판정에 쓴다
    const slotOfPlayer = useMemo(() => {
        const m = new Map<string, SlotRef>();
        POSITIONS.forEach(pos => depthChart[pos].forEach((id, idx) => { if (id) m.set(id, { pos, idx }); }));
        return m;
    }, [depthChart]);
    const slotLabel = (s: SlotRef) => `${DEPTH_LABELS[s.idx]} ${String(s.pos)}`;

    const hasViolation = validation.under5Minutes.length > 0 || validation.over5Minutes.length > 0 || validation.over42.length > 0;

    const pickPlayer = (target: SlotRef, playerId: string) => {
        if (playerId === '') { onSlotChange(target.pos, target.idx, ''); return; }
        const cur = slotOfPlayer.get(playerId);
        if (cur && !(cur.pos === target.pos && cur.idx === target.idx)) onSlotSwap(cur, target);
        else onSlotChange(target.pos, target.idx, playerId);
    };

    const conditionOf = (p: Player) => (playerConditions ? (playerConditions.has(p.id) ? (playerConditions.get(p.id) as number | null) : undefined) : undefined);

    // 검증 배너 — 툴바(프리셋) 아래, 뎁스 차트·로테이션 양쪽 공통(2026-10-28 사용자 지시: 목록 하단 → 상단)
    const validationBanner = (
        <>
            {hasViolation ? (
                <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex flex-col gap-1">
                    {validation.under5Minutes.length > 0 && (
                        <div className="flex items-start gap-2"><AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" /><span className="text-xs font-bold text-red-400">5명 미만: {minutesToRanges(validation.under5Minutes)}</span></div>
                    )}
                    {validation.over5Minutes.length > 0 && (
                        <div className="flex items-start gap-2"><AlertCircle size={14} className="text-orange-500 shrink-0 mt-0.5" /><span className="text-xs font-bold text-orange-400">5명 초과: {minutesToRanges(validation.over5Minutes)}</span></div>
                    )}
                    {validation.over42.length > 0 && (
                        <div className="flex items-start gap-2"><AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" /><span className="text-xs font-bold text-red-500">혹사 경고: {validation.over42.join(', ')}</span></div>
                    )}
                </div>
            ) : (
                <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-emerald-400">뎁스 차트·로테이션 정상 — 위반 사항 없음</span>
                </div>
            )}
        </>
    );

    // ── 뎁스 차트 리스트 ──
    const depthList = (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {DEPTH_LABELS.map((label, depthIndex) => (
                <div key={label}>
                    {/* 그룹 머리 — 행과 같은 열 구조(gap-2 · 분 칸 pl-2+w-7 · 셰브론 자리 16)로 구분선 위치를 맞춘다 */}
                    <div className={`h-8 pl-4 pr-2 flex items-center gap-2 bg-slate-950 border-b border-slate-800 ${depthIndex > 0 ? 'border-t' : ''}`}>
                        <span className="flex-1 min-w-0 text-xs font-bold text-slate-400">{label}</span>
                        <span className="self-stretch flex items-center pl-2 border-l border-slate-800 text-[11px] text-slate-500"><span className="w-7 text-right">분</span></span>
                        <span aria-hidden="true" className="w-4 shrink-0" />
                    </div>
                    <div className="bg-slate-900">
                        {POSITIONS.map((pos, posIdx) => {
                            const id = depthChart[pos][depthIndex];
                            const p = id ? playerById.get(id) ?? null : null;
                            const mins = id ? ((tactics.rotationMap || {})[id] || EMPTY_48()).filter(Boolean).length : 0;
                            const cond = p ? conditionOf(p) : undefined;
                            return (
                                <button
                                    key={String(pos)}
                                    type="button"
                                    onClick={() => setSlotSheet({ pos, idx: depthIndex })}
                                    className={`w-full h-12 flex items-center gap-2 pr-2 text-left active:bg-white/5 ${posIdx < POSITIONS.length - 1 ? 'border-b border-slate-800' : ''}`}
                                >
                                    <span className={`w-10 shrink-0 text-center text-sm font-bold ${p ? 'text-white' : 'text-slate-500'}`}>{String(pos)}</span>
                                    {p ? (
                                        <>
                                            <OvrBadge value={ovrMap.get(p.id) ?? 0} size="table" className="shrink-0" />
                                            {/* 이름 우측에 체력 바·부상 배지를 한 줄로(2026-10-28 사용자 지시 — 열 폭이 충분해 캡션 줄 불필요) */}
                                            <span className="flex-1 min-w-0 flex items-center gap-2">
                                                <span className="min-w-0 text-sm font-semibold text-slate-200 truncate">{p.name}</span>
                                                {cond !== undefined && (cond === null
                                                    ? <span className="shrink-0 text-[10px] text-slate-500">경기 중</span>
                                                    : <ConditionBar value={cond} size="xs" showValue={false} />)}
                                                {p.activeInjurySeverity && (
                                                    <InjuryStatusBadge severity={p.activeInjurySeverity} title={formatPlayerActiveInjuryLabel(p) ?? undefined} size={14} iconSize={10} strokeWidth={4} className="shrink-0" />
                                                )}
                                            </span>
                                            {/* 선수 칸 | 분 — 세로 구분선(2026-10-28 사용자 지시) */}
                                            <span className="self-stretch flex items-center pl-2 border-l border-slate-800">
                                                <span className={`w-7 text-right text-sm font-semibold tabular-nums ${getMinutesColor(mins)}`}>{mins || '–'}</span>
                                            </span>
                                        </>
                                    ) : (
                                        <span className="flex-1 min-w-0 text-sm text-slate-600">선수 선택</span>
                                    )}
                                    <ChevronDown size={16} className="shrink-0 text-slate-600" />
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
            <div aria-hidden="true" className="h-14 pb-safe" />
        </div>
    );

    // ── 로테이션(쿼터별 12분 바) ──
    const rotationView = (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* 쿼터 탭 — 가로 스크롤 대신(2026-10-28) */}
            <div role="tablist" aria-label="쿼터" className="shrink-0 h-10 grid grid-cols-4 bg-slate-950 border-b border-slate-800">
                {QUARTER_LABELS.map((label, q) => (
                    <button key={label} type="button" role="tab" aria-selected={quarter === q} onClick={() => setQuarter(q)}
                        className={`h-full text-xs font-black tracking-tight border-b-2 ${quarter === q ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent'}`}>
                        {label}
                    </button>
                ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {/* 머리 — 선수/분 + 쿼터 내 분 눈금(2분 간격) */}
                <div className="sticky top-0 z-20 flex h-7 bg-slate-950 border-b border-slate-800">
                    {/* 머리·행 모두 pl-3 pr-2 + 분 칸 w-9(가운데 정렬) — 구분선 x 좌표를 맞춘다 */}
                    <div className="shrink-0 flex items-center pl-3 pr-2 border-r border-slate-800 text-xs font-bold text-slate-400" style={{ width: NAME_COL_W }}>
                        선수<span className="ml-auto self-stretch w-9 flex items-center justify-center border-l border-slate-800 text-[11px] font-normal text-slate-500">분</span>
                    </div>
                    {/* 분 눈금 1~12 전부(2026-10-28) — 각 칸 가운데에 표시, 6·12는 진하게 */}
                    <div className="flex flex-1 min-w-0">
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <span key={m} className={`flex-1 text-center text-[10px] leading-7 select-none ${m % 6 === 0 ? 'text-slate-400 font-semibold' : 'text-slate-600'}`}>{m}</span>
                        ))}
                    </div>
                </div>
                {DEPTH_LABELS.map((label, depthIndex) => (
                    <React.Fragment key={label}>
                        {/* 그룹 머리도 같은 열 구조(선수 160 | 분 36 | 바) — 세로 구분선이 그룹 행에서 끊기지 않게(2026-10-28) */}
                        <div className="flex h-7 bg-slate-950 border-b border-slate-800">
                            <div className="shrink-0 flex items-center pl-3 pr-2 border-r border-slate-800 text-xs font-bold text-slate-400" style={{ width: NAME_COL_W }}>
                                {label}<span aria-hidden="true" className="ml-auto self-stretch w-9 border-l border-slate-800" />
                            </div>
                            <div className="flex-1 min-w-0" />
                        </div>
                        {POSITIONS.map(pos => {
                            const id = depthChart[pos][depthIndex];
                            const p = id ? playerById.get(id) ?? null : null;
                            const map = id ? ((tactics.rotationMap || {})[id] || EMPTY_48()) : EMPTY_48();
                            const mins = map.filter(Boolean).length;
                            const stints = id ? computeStints(map, validation.minuteCounts) : [];
                            const cond = p ? conditionOf(p) : undefined;
                            return (
                                <div key={String(pos)} className="flex bg-slate-900">
                                    {/* 선수 칸 — 뎁스 차트 행과 같은 구성에서 OVR 배지만 뺀 것(이름·체력·부상), 폭 160 */}
                                    <div className="shrink-0 h-11 flex items-center gap-1.5 pl-3 pr-2 border-b border-r border-slate-800" style={{ width: NAME_COL_W }}>
                                        {p ? (
                                            <>
                                                {/* OVR 배지는 로테이션 열에서 생략(2026-10-28 사용자 지시) — 이름 폭 확보 */}
                                                {/* 두 줄: 이름 / 체력 바 · 부상 배지(2026-10-28 사용자 지시 — 160px 안에서 이름 폭 확보) */}
                                                <span className="flex-1 min-w-0 flex flex-col justify-center">
                                                    <span className="text-[13px] leading-[18px] font-semibold text-slate-200 truncate">{p.name}</span>
                                                    <span className="h-[14px] flex items-center gap-1.5">
                                                        {cond !== undefined && (cond === null
                                                            ? <span className="text-[10px] text-slate-500">경기 중</span>
                                                            : <ConditionBar value={cond} size="xs" showValue={false} />)}
                                                        {p.activeInjurySeverity && <InjuryStatusBadge severity={p.activeInjurySeverity} size={12} iconSize={9} strokeWidth={4} className="shrink-0" />}
                                                    </span>
                                                </span>
                                                <span className={`self-stretch w-9 shrink-0 flex items-center justify-center border-l border-slate-800 text-xs font-bold tabular-nums ${getMinutesColor(mins)}`}>{mins || ''}</span>
                                            </>
                                        ) : (
                                            <span className="flex-1 min-w-0 flex items-center gap-1.5">
                                                <span className="w-[22px] text-[11px] font-bold text-slate-500">{String(pos)}</span>
                                                <span className="text-[13px] text-slate-600">—</span>
                                            </span>
                                        )}
                                    </div>
                                    <PhoneQuarterRow
                                        playerId={id}
                                        map={map}
                                        stints={stints}
                                        quarter={quarter}
                                        dragging={dragging}
                                        onDown={onBarDown}
                                        onMove={onBarMove}
                                        onCommit={onBarCommit}
                                    />
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
                <div aria-hidden="true" className="h-14 pb-safe" />
            </div>
        </div>
    );

    const slotPlayer = slotSheet ? (depthChart[slotSheet.pos][slotSheet.idx] ?? null) : null;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* 세그먼트 — 홈 동/서부·순위표 모드 탭 바와 같은 모양 */}
            <div role="tablist" aria-label="뎁스 차트 / 로테이션" className="shrink-0 h-11 grid grid-cols-2 bg-slate-950 border-b border-slate-800">
                {([['depth', '뎁스 차트'], ['rotation', '로테이션']] as const).map(([v, label]) => (
                    <button key={v} type="button" role="tab" aria-selected={segment === v} onClick={() => setSegment(v)}
                        className={`h-full text-sm font-black tracking-tight border-b-2 ${segment === v ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent'}`}>
                        {label}
                    </button>
                ))}
            </div>
            {/* 툴바 — 프리셋 선택기(데스크톱 그대로) + ⋯(자동 배정·초기화 시트) */}
            <div className="shrink-0 h-11 px-4 flex items-center gap-2 bg-slate-900 border-b border-slate-800">
                <div className="flex-1 min-w-0 flex items-center">{toolbarExtra}</div>
                <button type="button" onClick={() => setMenuOpen(true)} aria-label="자동 배정 · 초기화" className="w-9 h-9 -mr-2 shrink-0 flex items-center justify-center rounded-lg text-slate-200 active:bg-white/10">
                    <MoreHorizontal size={20} />
                </button>
            </div>

            <div className="shrink-0">{validationBanner}</div>
            {segment === 'depth' ? depthList : rotationView}

            <BottomSheet open={menuOpen} title="자동 배정 · 초기화" onClose={() => setMenuOpen(false)}>
                <SheetGroupTitle first>{coachName ? `${coachName}에게 포지션 위임` : '포지션 자동 배정'}</SheetGroupTitle>
                <MenuRow label="능력치 우선" onClick={() => { onAutoFillDepth('Ability'); setMenuOpen(false); }} />
                <MenuRow label="체력 우선" onClick={() => { onAutoFillDepth('Stamina'); setMenuOpen(false); }} />
                <SheetGroupTitle>출전시간 자동 배정</SheetGroupTitle>
                {ROTATION_ALLOCATION_OPTIONS.map(o => (
                    <MenuRow key={o.mode} label={o.label} sub={o.sub} onClick={() => { onAllocateRotation(o.mode); setMenuOpen(false); }} />
                ))}
                <SheetGroupTitle>초기화</SheetGroupTitle>
                <MenuRow label="뎁스 차트·로테이션 전부 초기화" danger onClick={() => { setMenuOpen(false); onResetAll(); }} />
            </BottomSheet>

            {/* 슬롯 선수 선택 시트 — 비우기 + 로스터(OVR 내림차순), 현재 선수 indigo 틴트 */}
            <BottomSheet open={slotSheet !== null} title={slotSheet ? `${slotLabel(slotSheet)} 선수 선택` : ''} onClose={() => setSlotSheet(null)}>
                {slotSheet && (
                    <div className="-mx-2 flex flex-col gap-0.5">
                        <button type="button" onClick={() => { pickPlayer(slotSheet, ''); setSlotSheet(null); }} className="w-full h-11 px-3 rounded-lg text-left text-sm font-bold text-red-400 bg-red-500/10 active:bg-red-500/20">
                            슬롯 비우기
                        </button>
                        {sortedRoster.map(p => {
                            const on = p.id === slotPlayer;
                            const cur = slotOfPlayer.get(p.id);
                            const cond = conditionOf(p);
                            return (
                                <button key={p.id} type="button" onClick={() => { pickPlayer(slotSheet, p.id); setSlotSheet(null); }}
                                    className={`w-full h-12 px-3 rounded-lg flex items-center gap-2.5 text-left ${on ? 'bg-indigo-600/10' : 'active:bg-white/5'}`}>
                                    <OvrBadge value={ovrMap.get(p.id) ?? 0} size="table" className="shrink-0" />
                                    <span className="flex-1 min-w-0 flex flex-col">
                                        <span className={`text-sm leading-[18px] font-bold truncate ${on ? 'text-indigo-400' : 'text-slate-200'}`}>{p.name}</span>
                                        <span className="flex items-center gap-1.5 text-[11px] leading-[14px] text-slate-400">
                                            <span>{p.position}{cur ? ` · ${slotLabel(cur)}` : ''}</span>
                                            {cond !== undefined && cond !== null && <ConditionBar value={cond} size="xs" showValue={false} />}
                                            {p.activeInjurySeverity && <InjuryStatusBadge severity={p.activeInjurySeverity} size={12} iconSize={9} strokeWidth={4} />}
                                        </span>
                                    </span>
                                    {on && <span className="text-indigo-400 text-xs font-bold shrink-0">현재</span>}
                                </button>
                            );
                        })}
                    </div>
                )}
            </BottomSheet>
        </div>
    );
};

/** 로테이션 한 행 44 — 선택한 쿼터의 12분만 전폭으로 그리고 포인터로 칠한다(폰은 mouse 대신 pointer 이벤트, 터치 포함).
 *  분 인덱스는 절대값(quarter*12 + 칸)으로 올리므로 DepthRotationBoard의 드래그 상태·커밋을 그대로 쓴다. 아래 4px 띠 = 48분 전체 요약. */
const PhoneQuarterRow: React.FC<{
    playerId: string | null;
    map: boolean[];
    stints: Stint[];
    quarter: number;
    dragging: DragState | null;
    onDown: (playerId: string, minute: number) => void;
    onMove: (playerId: string, minute: number) => void;
    onCommit: (d: DragState) => void;
}> = ({ playerId, map, stints, quarter, dragging, onDown, onMove, onCommit }) => {
    const ref = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(dragging);
    draggingRef.current = dragging;
    const activePointer = useRef<number | null>(null);
    const q0 = quarter * 12;
    const q1 = q0 + 11;

    const minuteAt = (clientX: number) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return q0;
        return q0 + Math.max(0, Math.min(11, Math.floor((clientX - rect.left) / rect.width * 12)));
    };
    const finish = (e: React.PointerEvent) => {
        if (activePointer.current !== e.pointerId) return;
        activePointer.current = null;
        const d = draggingRef.current;
        if (d && playerId && d.playerId === playerId) onCommit(d);
    };
    // 쿼터 범위로 잘라 % 위치로 — 범위 밖이면 null
    const clip = (start: number, end: number) => {
        const a = Math.max(start, q0);
        const b = Math.min(end, q1);
        if (a > b) return null;
        return { left: `${(a - q0) / 12 * 100}%`, width: `${(b - a + 1) / 12 * 100}%` };
    };
    const isDraggingThis = !!dragging && !!playerId && dragging.playerId === playerId;
    const preview = isDraggingThis && dragging ? clip(Math.min(dragging.startMin, dragging.currentMin), Math.max(dragging.startMin, dragging.currentMin)) : null;

    return (
        <div
            ref={ref}
            className={`relative flex-1 min-w-0 h-11 border-b border-slate-800 select-none ${playerId ? 'touch-none bg-slate-900/60' : 'bg-slate-950/40'}`}
            onPointerDown={e => {
                if (!playerId) return;
                e.preventDefault();
                activePointer.current = e.pointerId;
                e.currentTarget.setPointerCapture(e.pointerId);
                onDown(playerId, minuteAt(e.clientX));
            }}
            onPointerMove={e => {
                if (!playerId || activePointer.current !== e.pointerId) return;
                onMove(playerId, minuteAt(e.clientX));
            }}
            onPointerUp={finish}
            onPointerCancel={finish}
        >
            {/* 분 격자(1분 간격, 6분은 조금 진하게) */}
            {Array.from({ length: 11 }, (_, i) => i + 1).map(m => (
                <div key={m} className={`absolute top-0 bottom-1.5 w-px pointer-events-none ${m === 6 ? 'bg-slate-700' : 'bg-slate-800'}`} style={{ left: `${m / 12 * 100}%` }} />
            ))}
            {/* 출전 구간(데스크톱 GanttBar와 같은 색: 5명 정상 emerald · 위반 red) */}
            {stints.map((st, i) => {
                const pos = clip(st.start, st.end);
                return pos && (
                    <div key={i} className={`absolute top-1.5 bottom-[10px] pointer-events-none ${st.valid ? 'bg-emerald-500/40 border border-emerald-500/60' : 'bg-red-500/30 border border-red-500/50'}`} style={pos} />
                );
            })}
            {preview && <div className="absolute top-1 bottom-[8px] bg-white/15 border border-white/25 pointer-events-none" style={preview} />}
            {/* 48분 요약 띠 — 현재 쿼터 구간 테두리 */}
            {playerId && (
                <div className="absolute left-0 right-0 bottom-0.5 h-1 flex pointer-events-none">
                    {map.map((on, m) => (
                        <span key={m} className={`flex-1 ${on ? 'bg-indigo-400/80' : 'bg-slate-800'} ${m % 12 === 0 && m > 0 ? 'border-l border-slate-950' : ''}`} />
                    ))}
                    <span className="absolute top-[-2px] bottom-[-2px] border border-slate-400/70 pointer-events-none" style={{ left: `${quarter * 25}%`, width: '25%' }} />
                </div>
            )}
        </div>
    );
};

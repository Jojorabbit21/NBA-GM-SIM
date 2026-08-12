
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { AlertCircle, CheckCircle2, RotateCcw, ChevronDown, GripVertical } from 'lucide-react';
import { GanttBar, computeStints, type Stint, type DragState } from './RotationGanttChart';

// ── 뎁스 차트 + 로테이션 통합 보드 ────────────────────────────────────────────
// 기존엔 "뎁스 차트"(포지션별 선수 랭킹 테이블)와 "로테이션 차트"(선수별 48분 간트)가
// 별개 화면이었다. 이 컴포넌트는 그 둘을 15개 행(포지션×뎁스 3단계)짜리 표 하나로
// 합친다 — 각 행이 "슬롯"(예: PG1)이고, 슬롯마다 선수 드롭다운 + 그 슬롯의 48분 바를
// 한 줄에 둔다. "바는 슬롯에 귀속" — 슬롯의 선수를 바꾸면 그 슬롯에 그려둔 출전
// 구간은 새 선수가 그대로 이어받고(사용자 확정 사양), 어느 슬롯에도 없는 선수는
// 자동으로 0분(완전 벤치)이 된다.

const POSITIONS: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const DEPTH_LABELS = ['주전', '벤치', '써드'];

type DepthAutoFillMode = 'Ability' | 'Stamina';
type RotationAllocationMode = 'Overwork' | 'Balanced' | 'Socialist';

const ROTATION_OPTIONS: { mode: RotationAllocationMode; label: string; sub: string }[] = [
    { mode: 'Overwork',  label: '주전 혹사 (기본)', sub: '주전 36분 / 벤치 12분' },
    { mode: 'Balanced',  label: '균형 분배',        sub: '주전 26분 / 벤치 18분 / 써드 4분' },
    { mode: 'Socialist', label: '공산 농구',        sub: '주전 20분 / 벤치 16분 / 써드 12분' },
];

const EMPTY_48 = () => Array(48).fill(false);

// 위반 분(minute, 0~47 절대 인덱스) 목록을 "N쿼터 시작~끝분" 형태로 묶어 표시.
// 쿼터 경계(12분)에서 항상 구간을 끊고(쿼터를 넘나드는 구간 표기 없음), 쿼터 내 상대분은
// 0~11이 아니라 1~12(1-based)로 표기. 1분짜리 단일 구간은 "N쿼터 5~5분"이 아니라
// "N쿼터 5분"으로 표기(경고 배너 가독성용).
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

// "바는 슬롯에 귀속" — 15슬롯(포지션×뎁스) 전부를 old→new 뎁스차트로 비교해서, 각
// 슬롯에 그려져 있던 출전 구간을 그 슬롯의 새 점유자에게 옮겨 붙인다. 슬롯 선수 변경
// (handleSlotChange)과 두 슬롯 스왑(handleSlotSwap) 양쪽에서 공용으로 쓴다.
function remapRotationByChart(
    oldChart: DepthChart,
    newChart: DepthChart,
    oldMap: Record<string, boolean[]>,
): Record<string, boolean[]> {
    const newMap: Record<string, boolean[]> = {};
    POSITIONS.forEach(p => {
        for (let i = 0; i < 3; i++) {
            const oldPid = oldChart[p][i];
            const newPid = newChart[p][i];
            const bar = oldPid ? (oldMap[oldPid] ?? EMPTY_48()) : EMPTY_48();
            if (newPid) newMap[newPid] = bar;
        }
    });
    return newMap;
}

// 뎁스 차트 + 배분 모드로 로테이션(선수별 48분 맵)을 계산하는 순수 함수.
// handleAllocateRotation(기존 depthChart 기준)과 handleAutoFillDepth(방금 새로 만든
// 뎁스 차트 기준, "포지션 자동 배정"에 로테이션 배분까지 한 번에 포함시키기 위함)
// 양쪽에서 공용으로 쓴다 — 후자는 아직 props로 안 올라간 새 뎁스 차트를 즉시 써야 해서
// 컴포넌트 state/props에 의존하는 클로저가 아니라 순수 함수로 분리했다.
function computeRotationMap(
    chart: DepthChart,
    mode: RotationAllocationMode,
    roster: Player[],
): Record<string, boolean[]> {
    const newMap: Record<string, boolean[]> = {};
    roster.forEach(p => { newMap[p.id] = EMPTY_48(); });
    const fill = (id: string, s: number, e: number) => {
        if (!newMap[id]) newMap[id] = EMPTY_48();
        for (let i = s - 1; i < e; i++) newMap[id][i] = true;
    };
    POSITIONS.forEach(pos => {
        const [sid, bid, tid] = chart[pos];
        if (mode === 'Overwork') {
            if (sid) { fill(sid,1,12); fill(sid,19,24); fill(sid,25,36); fill(sid,43,48); }
            if (bid) { fill(bid,13,18); fill(bid,37,42); }
            else if (sid) { fill(sid,13,18); fill(sid,37,42); }
        } else if (mode === 'Balanced') {
            if (sid) { fill(sid,1,8); fill(sid,21,24); fill(sid,25,32); fill(sid,43,48); }
            if (bid) { fill(bid,9,12); fill(bid,17,20); fill(bid,33,36); fill(bid,37,42); }
            if (tid) { fill(tid,13,16); } else if (sid) { fill(sid,13,16); }
            if (sid && !bid) { fill(sid,9,12); fill(sid,17,20); fill(sid,33,36); fill(sid,37,42); }
        } else {
            if (sid) { fill(sid,1,6); fill(sid,21,24); fill(sid,25,30); fill(sid,45,48); }
            if (bid) { fill(bid,7,10); fill(bid,13,16); fill(bid,31,34); fill(bid,37,40); }
            if (tid) { fill(tid,11,12); fill(tid,17,20); fill(tid,35,36); fill(tid,41,44); }
            else {
                if (sid) { fill(sid,17,20); fill(sid,41,44); }
                if (bid) { fill(bid,11,12); fill(bid,35,36); }
                else if (sid) { fill(sid,11,12); fill(sid,35,36); }
            }
            if (sid && !bid) { fill(sid,7,10); fill(sid,13,16); fill(sid,31,34); fill(sid,37,40); }
        }
    });
    return newMap;
}

// 두 뎁스 차트가 완전히 동일한지(15슬롯 전부 같은 선수) 비교 — "포지션 자동 배정" 결과가
// 현재 뎁스 차트와 이미 같으면(=이미 최적 배정) 로테이션까지 덮어쓰지 않고 스킵하기 위함.
function depthChartsEqual(a: DepthChart, b: DepthChart): boolean {
    return POSITIONS.every(pos => a[pos].every((id, i) => id === b[pos][i]));
}

function cloneDepthChart(chart: DepthChart): DepthChart {
    return {
        PG: [...chart.PG] as DepthChart['PG'],
        SG: [...chart.SG] as DepthChart['SG'],
        SF: [...chart.SF] as DepthChart['SF'],
        PF: [...chart.PF] as DepthChart['PF'],
        C:  [...chart.C]  as DepthChart['C'],
    };
}

interface DepthRotationBoardProps {
    team: Team;
    tactics: GameTactics;
    depthChart: DepthChart | null;
    onUpdateDepthChart: (dc: DepthChart) => void;
    onUpdateTactics: (t: GameTactics) => void;
    coachName?: string;
}

const DepthRotationBoardInner: React.FC<DepthRotationBoardProps> = ({
    team, tactics, depthChart, onUpdateDepthChart, onUpdateTactics, coachName,
}) => {
    const [dragging, setDragging] = useState<DragState | null>(null);
    const [isDepthDropdownOpen, setIsDepthDropdownOpen] = useState(false);
    const [isAllocDropdownOpen, setIsAllocDropdownOpen] = useState(false);
    type SlotRef = { pos: keyof DepthChart; idx: number };
    const [draggedSlot, setDraggedSlot] = useState<SlotRef | null>(null);
    const [dropTargetSlot, setDropTargetSlot] = useState<SlotRef | null>(null);
    const depthDropdownRef = useRef<HTMLDivElement>(null);
    const allocDropdownRef = useRef<HTMLDivElement>(null);

    const tacticsRef = useRef(tactics);
    tacticsRef.current = tactics;
    const onUpdateRef = useRef(onUpdateTactics);
    onUpdateRef.current = onUpdateTactics;
    const depthChartRef = useRef(depthChart);
    depthChartRef.current = depthChart;

    const rafRef = useRef<number | null>(null);
    useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (depthDropdownRef.current && !depthDropdownRef.current.contains(e.target as Node)) setIsDepthDropdownOpen(false);
            if (allocDropdownRef.current && !allocDropdownRef.current.contains(e.target as Node)) setIsAllocDropdownOpen(false);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    // 뎁스 차트가 아직 없으면 초기 생성 (DepthChartEditor와 동일한 규칙)
    useEffect(() => {
        if (!depthChart) {
            onUpdateDepthChart({
                PG: [tactics.starters.PG || null, null, null],
                SG: [tactics.starters.SG || null, null, null],
                SF: [tactics.starters.SF || null, null, null],
                PF: [tactics.starters.PF || null, null, null],
                C:  [tactics.starters.C || null, null, null],
            });
        }
    }, [depthChart, tactics.starters, onUpdateDepthChart]);

    // 전역 mouseup — 드래그를 rotationMap에 커밋 (RotationGanttChart와 동일 패턴)
    useEffect(() => {
        if (!dragging) return;
        const handleMouseUp = () => {
            const t = tacticsRef.current;
            const start = Math.min(dragging.startMin, dragging.currentMin);
            const end = Math.max(dragging.startMin, dragging.currentMin);
            const cur = t.rotationMap || {};
            const newMap = { ...cur };
            const arr = [...(cur[dragging.playerId] || EMPTY_48())];
            for (let i = start; i <= end; i++) arr[i] = dragging.targetValue;
            newMap[dragging.playerId] = arr;
            onUpdateRef.current({ ...t, rotationMap: newMap });
            setDragging(null);
        };
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [dragging]);

    const handleBarMouseDown = useCallback((playerId: string, minute: number) => {
        const currentMap = (tacticsRef.current.rotationMap || {})[playerId] || EMPTY_48();
        setDragging({ playerId, startMin: minute, currentMin: minute, targetValue: !currentMap[minute] });
    }, []);

    const handleBarMouseMove = useCallback((playerId: string, minute: number) => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            setDragging(prev => (prev && prev.currentMin !== minute ? { ...prev, currentMin: minute } : prev));
        });
    }, []);

    // 슬롯(pos, depthIndex)의 선수를 바꾼다. 같은 선수가 다른 슬롯에 이미 있으면 그
    // 슬롯은 비운다(중복 배정 방지, DepthChartEditor와 동일). rotationMap은 "슬롯
    // 포지션 기준"으로 재매핑 — 15슬롯 전부를 old→new로 비교해서, 각 슬롯에 그려져
    // 있던 구간을 그 슬롯의 새 점유자에게 그대로 옮겨 붙인다. 이제 아무 슬롯에도
    // 없는 선수는 결과 map에서 빠져 자동으로 0분이 된다.
    const handleSlotChange = useCallback((pos: keyof DepthChart, depthIndex: number, playerId: string) => {
        const oldChart = depthChartRef.current;
        if (!oldChart) return;
        const newVal = playerId === '' ? null : playerId;
        const newChart = cloneDepthChart(oldChart);
        if (newVal) {
            POSITIONS.forEach(p => {
                for (let i = 0; i < 3; i++) {
                    if (!(p === pos && i === depthIndex) && newChart[p][i] === newVal) newChart[p][i] = null;
                }
            });
        }
        newChart[pos][depthIndex] = newVal;

        const oldMap = tacticsRef.current.rotationMap || {};
        const newMap = remapRotationByChart(oldChart, newChart, oldMap);

        const t = tacticsRef.current;
        if (depthIndex === 0) {
            onUpdateRef.current({ ...t, starters: { ...t.starters, [pos]: newVal ?? '' }, rotationMap: newMap });
        } else {
            onUpdateRef.current({ ...t, rotationMap: newMap });
        }
        onUpdateDepthChart(newChart);
    }, [onUpdateDepthChart]);

    // 드래그 핸들로 두 슬롯의 선수를 맞바꾼다. "바는 슬롯에 귀속" 규칙에 따라 각 슬롯의
    // 출전 구간도 함께 스왑된다(remapRotationByChart가 슬롯 포지션 기준으로 재매핑하므로
    // 자동으로 그렇게 됨). 두 슬롯 중 하나라도 depthIndex===0(주전)이면 starters도 갱신.
    const handleSlotSwap = useCallback((from: SlotRef, to: SlotRef) => {
        if (from.pos === to.pos && from.idx === to.idx) return;
        const oldChart = depthChartRef.current;
        if (!oldChart) return;
        const newChart = cloneDepthChart(oldChart);
        const fromPid = oldChart[from.pos][from.idx];
        const toPid = oldChart[to.pos][to.idx];
        newChart[from.pos][from.idx] = toPid;
        newChart[to.pos][to.idx] = fromPid;

        const oldMap = tacticsRef.current.rotationMap || {};
        const newMap = remapRotationByChart(oldChart, newChart, oldMap);

        const t = tacticsRef.current;
        const newStarters = { ...t.starters };
        if (from.idx === 0) newStarters[from.pos] = newChart[from.pos][0] ?? '';
        if (to.idx === 0) newStarters[to.pos] = newChart[to.pos][0] ?? '';
        onUpdateRef.current({ ...t, starters: newStarters, rotationMap: newMap });
        onUpdateDepthChart(newChart);
    }, [onUpdateDepthChart]);

    // ── 자동 배정: 포지션(뎁스 차트) ──────────────────────────────────────────
    const compareByAbility = (a: Player, b: Player, pos: string) => {
        const ovrDiff = calculatePlayerOvr(b) - calculatePlayerOvr(a);
        if (ovrDiff !== 0) return ovrDiff;
        if (pos === 'PG') return b.plm - a.plm;
        if (pos === 'SG' || pos === 'SF') return b.out - a.out;
        if (pos === 'PF' || pos === 'C') return b.ins - a.ins;
        return 0;
    };

    const handleAutoFillDepth = useCallback((mode: DepthAutoFillMode) => {
        const usedIds = new Set<string>();
        const newChart: DepthChart = {
            PG: [null, null, null], SG: [null, null, null], SF: [null, null, null],
            PF: [null, null, null], C: [null, null, null],
        };
        const getCandidates = (pos: string) =>
            team.roster.filter(p => p.health !== 'Injured' && p.position.includes(pos) && !usedIds.has(p.id));

        POSITIONS.forEach(pos => {
            let candidates = getCandidates(pos);
            if (mode === 'Ability') {
                candidates.sort((a, b) => compareByAbility(a, b, pos));
                for (let depth = 0; depth < 3; depth++) {
                    if (candidates[depth]) { newChart[pos][depth] = candidates[depth].id; usedIds.add(candidates[depth].id); }
                }
            } else {
                candidates = candidates.filter(p => (p.condition ?? 100) >= 20);
                const starterPool = candidates.filter(p => (p.condition ?? 100) >= 70).sort((a, b) => compareByAbility(a, b, pos));
                const reservePool = candidates.filter(p => (p.condition ?? 100) < 70).sort((a, b) => compareByAbility(a, b, pos));
                let starter = starterPool.shift();
                if (!starter && reservePool.length > 0) starter = reservePool.shift();
                if (starter) { newChart[pos][0] = starter.id; usedIds.add(starter.id); }
                const remaining = [...starterPool, ...reservePool].sort((a, b) => compareByAbility(a, b, pos));
                if (remaining[0]) { newChart[pos][1] = remaining[0].id; usedIds.add(remaining[0].id); }
                if (remaining[1]) { newChart[pos][2] = remaining[1].id; usedIds.add(remaining[1].id); }
            }
        });
        for (let depth = 0; depth < 3; depth++) {
            POSITIONS.forEach(pos => {
                if (!newChart[pos][depth]) {
                    const fallback = team.roster.find(p => !usedIds.has(p.id) && p.health !== 'Injured');
                    if (fallback) { newChart[pos][depth] = fallback.id; usedIds.add(fallback.id); }
                }
            });
        }

        // 이미 지금 뎁스 차트가 이 알고리즘이 낼 수 있는 최적 배정과 완전히 같다면
        // (15슬롯 전부 동일) 아무것도 안 하고 스킵 — 그렇지 않으면 매번 로테이션까지
        // "Overwork"로 덮어써서 사용자가 직접 조정해둔 출전시간이 날아간다.
        if (depthChart && depthChartsEqual(newChart, depthChart)) {
            setIsDepthDropdownOpen(false);
            return;
        }

        // 포지션 자동 배정 시 로테이션(출전시간)까지 한 번에 배정한다("Overwork" 기본
        // 모드) — 방금 만든 newChart는 아직 props로 안 올라간 상태라 depthChart(prop)를
        // 보는 handleAllocateRotation을 그대로 재사용할 수 없어, 순수 함수
        // computeRotationMap에 newChart를 직접 넘겨 계산한다.
        const newStarters = {
            PG: newChart.PG[0] || '', SG: newChart.SG[0] || '', SF: newChart.SF[0] || '',
            PF: newChart.PF[0] || '', C: newChart.C[0] || '',
        };
        const newRotationMap = computeRotationMap(newChart, 'Overwork', team.roster);
        onUpdateTactics({ ...tactics, starters: newStarters, rotationMap: newRotationMap });
        onUpdateDepthChart(newChart);
        setIsDepthDropdownOpen(false);
    }, [team.roster, tactics, depthChart, onUpdateTactics, onUpdateDepthChart]);

    // ── 자동 배정: 출전시간(로테이션) ─────────────────────────────────────────
    const handleAllocateRotation = useCallback((mode: RotationAllocationMode) => {
        if (!depthChart) return;
        const newMap = computeRotationMap(depthChart, mode, team.roster);
        onUpdateTactics({ ...tactics, rotationMap: newMap });
        setIsAllocDropdownOpen(false);
    }, [depthChart, team.roster, tactics, onUpdateTactics]);

    const handleResetAll = useCallback(() => {
        if (!window.confirm('뎁스 차트와 로테이션을 전부 초기화하시겠습니까?')) return;
        const resetChart: DepthChart = {
            PG: [null, null, null], SG: [null, null, null], SF: [null, null, null],
            PF: [null, null, null], C: [null, null, null],
        };
        onUpdateDepthChart(resetChart);
        onUpdateTactics({ ...tactics, starters: { PG: '', SG: '', SF: '', PF: '', C: '' }, rotationMap: {} });
    }, [tactics, onUpdateTactics, onUpdateDepthChart]);

    const handleResetSlot = useCallback((playerId: string) => {
        const t = tacticsRef.current;
        const newMap = { ...(t.rotationMap || {}), [playerId]: EMPTY_48() };
        onUpdateRef.current({ ...t, rotationMap: newMap });
    }, []);

    const ovrMap = useMemo(() => {
        const m = new Map<string, number>();
        team.roster.forEach(p => m.set(p.id, calculatePlayerOvr(p)));
        return m;
    }, [team.roster]);

    const validation = useMemo(() => {
        const minuteCounts = Array<number>(48).fill(0);
        const over42: string[] = [];
        const mapData = tactics.rotationMap || {};
        Object.entries(mapData).forEach(([pid, map]) => {
            if (map.filter(Boolean).length > 42) over42.push(team.roster.find(p => p.id === pid)?.name || pid);
            map.forEach((active, i) => { if (active) minuteCounts[i]++; });
        });
        const under5Minutes: number[] = [];
        const over5Minutes: number[] = [];
        minuteCounts.forEach((c, i) => {
            if (c < 5) under5Minutes.push(i);
            if (c > 5) over5Minutes.push(i);
        });
        return { minuteCounts, over42, under5Minutes, over5Minutes };
    }, [tactics.rotationMap, team.roster]);

    const getMinColor = (mins: number) => {
        if (mins === 0) return 'text-slate-600';
        if (mins > 42) return 'text-red-500';
        if (mins > 34) return 'text-amber-500';
        if (mins > 20) return 'text-indigo-400';
        return 'text-emerald-400';
    };

    const SH = 'bg-slate-950';
    const SK = 'bg-slate-900';
    const SB = 'border-r border-slate-800';

    if (!depthChart) return null;
    const sortedRoster = [...team.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Toolbar ── */}
            <div className="px-6 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between flex-shrink-0 gap-4">
                <span className="text-base font-black text-white uppercase tracking-widest">뎁스 차트 · 로테이션</span>
                <div className="flex gap-2">
                    <div className="relative flex shadow-md" ref={depthDropdownRef}>
                        <button
                            onClick={() => handleAutoFillDepth('Ability')}
                            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-l-lg transition-all text-xs font-bold uppercase tracking-wider active:scale-95 border-r border-indigo-700/50"
                        >
                            {coachName ? `${coachName}에게 포지션 위임` : '포지션 자동 배정'}
                        </button>
                        <button
                            onClick={() => setIsDepthDropdownOpen(v => !v)}
                            className={`px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-r-lg transition-all ${isDepthDropdownOpen ? 'bg-indigo-700' : ''}`}
                        >
                            <ChevronDown size={14} className={`transition-transform duration-200 ${isDepthDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isDepthDropdownOpen && (
                            <div className="absolute top-full right-0 mt-2 w-36 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                <div className="p-1">
                                    <button onClick={() => handleAutoFillDepth('Ability')} className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all">능력치 우선</button>
                                    <button onClick={() => handleAutoFillDepth('Stamina')} className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all">체력 우선</button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="relative flex shadow-md" ref={allocDropdownRef}>
                        <button
                            onClick={() => handleAllocateRotation('Overwork')}
                            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-l-lg transition-all text-xs font-bold uppercase tracking-wider active:scale-95 border-r border-indigo-700/50"
                        >
                            출전시간 자동 배정
                        </button>
                        <button
                            onClick={() => setIsAllocDropdownOpen(v => !v)}
                            className={`px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-r-lg transition-all ${isAllocDropdownOpen ? 'bg-indigo-700' : ''}`}
                        >
                            <ChevronDown size={14} className={`transition-transform duration-200 ${isAllocDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isAllocDropdownOpen && (
                            <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                <div className="p-1">
                                    {ROTATION_OPTIONS.map(({ mode, label, sub }) => (
                                        <button key={mode} onClick={() => handleAllocateRotation(mode)} className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex flex-col gap-0.5">
                                            <span>{label}</span>
                                            <span className="text-xs text-slate-500 font-normal">{sub}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleResetAll}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-all text-xs font-bold uppercase tracking-wider shadow-sm active:scale-95"
                    >
                        <RotateCcw size={14} />
                        <span>초기화</span>
                    </button>
                </div>
            </div>

            {/* ── 통합 표 ── */}
            <div className="flex-1 min-h-0 overflow-auto">
                <table className="border-separate border-spacing-0 w-full" style={{ minWidth: '960px', tableLayout: 'fixed' }}>
                    <colgroup>
                        <col style={{ width: 56 }} />
                        <col style={{ width: 40 }} />
                        <col style={{ width: 28 }} />
                        <col style={{ width: 200 }} />
                        <col style={{ width: 40 }} />
                        <col />
                        <col style={{ width: 40 }} />
                        <col style={{ width: 54 }} />
                    </colgroup>
                    <thead className={`${SH} sticky top-0 z-50`}>
                        <tr className="text-sm font-black text-slate-500 uppercase tracking-tighter">
                            <th className={`sticky left-0 z-50 ${SH} ${SB} border-b border-slate-800 py-3 w-[96px] min-w-[96px] text-center`} colSpan={2}>슬롯</th>
                            <th className={`sticky left-[96px] z-50 ${SH} ${SB} border-b border-slate-800 py-3 w-[228px] min-w-[228px] text-left px-3`} colSpan={2}>선수</th>
                            <th className={`sticky left-[324px] z-50 ${SH} border-b border-slate-800 py-3 w-[40px] min-w-[40px] text-center`}>OVR</th>
                            <th className={`${SH} border-l border-r border-t border-b border-slate-800 py-3 px-2`}>
                                <div className="flex text-sm font-black">
                                    {['1쿼터', '2쿼터', '3쿼터', '4쿼터'].map(q => (
                                        <div key={q} className="flex-1 flex items-center justify-center text-slate-400">{q}</div>
                                    ))}
                                </div>
                            </th>
                            <th className={`${SH} border-b border-slate-800 py-3 w-[40px] min-w-[40px] text-center`}>시간</th>
                            <th className={`${SH} border-b border-slate-800 py-3 w-[54px] min-w-[54px] text-center`}>초기화</th>
                        </tr>
                    </thead>

                    <tbody>
                        {DEPTH_LABELS.map((depthLabel, depthIndex) => POSITIONS.map((pos, posIdx) => {
                            const selectedId = depthChart[pos][depthIndex];
                            const selectedPlayer = selectedId ? team.roster.find(p => p.id === selectedId) ?? null : null;
                            const playerMap = selectedId ? ((tactics.rotationMap || {})[selectedId] || EMPTY_48()) : EMPTY_48();
                            const totalMins = playerMap.filter(Boolean).length;
                            const ovr = selectedId ? (ovrMap.get(selectedId) ?? 0) : 0;
                            const stints: Stint[] = selectedId ? computeStints(playerMap, validation.minuteCounts) : [];

                            const isDropTarget = dropTargetSlot?.pos === pos && dropTargetSlot?.idx === depthIndex
                                && !(draggedSlot?.pos === pos && draggedSlot?.idx === depthIndex);
                            // 그룹(주전/벤치/써드)의 마지막 행 — border-separate 테이블에선 <tr>의
                            // border가 실제로 그려지지 않으므로, 각 <td>에 개별적으로 굵은 구분선을 준다.
                            // border-b-{color}처럼 방향성 색상 클래스를 써야 한다 — 일부 셀은 ${SB}(오른쪽
                            // 테두리, border-r border-slate-800)도 같이 쓰는데, 색상만 지정하는
                            // border-slate-600을 섞으면 Tailwind가 전체 side 색을 덮어써 border-r 색까지
                            // 바뀌는 문제가 있었음(과거 dev-log에 기록된 것과 동일한 함정).
                            const isGroupEnd = posIdx === POSITIONS.length - 1;
                            const groupEndBorder = isGroupEnd ? 'border-b-2 border-b-slate-700' : 'border-b border-b-slate-800/50';

                            return (
                                <tr
                                    key={`${String(pos)}-${depthIndex}`}
                                    className={`group h-9 transition-colors ${isDropTarget ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'}`}
                                    onDragOver={(e) => { if (draggedSlot) { e.preventDefault(); setDropTargetSlot({ pos, idx: depthIndex }); } }}
                                    onDragLeave={() => setDropTargetSlot(prev => (prev?.pos === pos && prev?.idx === depthIndex ? null : prev))}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (draggedSlot) handleSlotSwap(draggedSlot, { pos, idx: depthIndex });
                                        setDraggedSlot(null);
                                        setDropTargetSlot(null);
                                    }}
                                >
                                    {posIdx === 0 && (
                                        <td rowSpan={POSITIONS.length} className={`sticky left-0 z-30 bg-slate-800 text-center align-middle ${SB} border-b-2 border-b-slate-700`}>
                                            <span className={`text-sm font-bold tracking-widest ${POSITIONS.some(p => depthChart[p][depthIndex]) ? 'text-white' : 'text-slate-600'}`}>{depthLabel}</span>
                                        </td>
                                    )}
                                    <td className={`sticky left-[56px] z-30 ${SK} text-center align-middle ${SB} ${groupEndBorder}`}>
                                        <span className={`text-sm font-bold tracking-widest ${depthChart[pos].some(Boolean) ? 'text-white' : 'text-slate-500'}`}>{String(pos)}</span>
                                    </td>

                                    {/* 드래그 핸들 — 다른 슬롯 행 위에 드롭하면 두 슬롯의 선수(+구간)를 맞바꾼다.
                                        선수 이름 셀과 시각적으로 이어지도록 오른쪽 구분선(border-r)은 뺀다. */}
                                    <td className={`sticky left-[96px] z-30 ${SK} text-center align-middle ${groupEndBorder}`}>
                                        <div
                                            draggable
                                            onDragStart={() => setDraggedSlot({ pos, idx: depthIndex })}
                                            onDragEnd={() => { setDraggedSlot(null); setDropTargetSlot(null); }}
                                            className="flex items-center justify-center h-full cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-300"
                                            title="드래그해서 다른 슬롯과 선수 교체"
                                        >
                                            <GripVertical size={14} />
                                        </div>
                                    </td>

                                    {/* 선수 선택 드롭다운 — DepthChartEditor와 동일 스타일 */}
                                    <td className={`sticky left-[124px] z-30 ${SK} !p-0 ${SB} ${groupEndBorder}`}>
                                        <div className="relative group/sel w-full h-full">
                                            <select
                                                className="w-full h-full appearance-none bg-transparent border-none rounded-none pl-8 pr-8 py-1.5 text-sm font-semibold text-transparent focus:outline-none focus:ring-0 cursor-pointer hover:bg-white/5 transition-all"
                                                value={selectedId || ''}
                                                onChange={(e) => handleSlotChange(pos, depthIndex, e.target.value)}
                                            >
                                                <option value="" className="bg-slate-900 text-slate-500">선수 선택</option>
                                                {sortedRoster.map(p => (
                                                    <option key={p.id} value={p.id} className="bg-slate-900 text-white text-sm font-semibold">({calculatePlayerOvr(p)}) {p.name} - {p.position}</option>
                                                ))}
                                            </select>
                                            <div className={`absolute inset-0 flex items-center pl-3 pr-8 pointer-events-none text-sm font-semibold truncate ${selectedPlayer ? 'text-slate-200' : 'text-slate-500'}`}>
                                                {selectedPlayer ? selectedPlayer.name : '선수 선택'}
                                            </div>
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover/sel:text-white transition-colors">
                                                <ChevronDown size={13} strokeWidth={2} />
                                            </div>
                                        </div>
                                    </td>

                                    <td className={`sticky left-[324px] z-30 ${SK} text-center ${groupEndBorder}`}>
                                        {selectedPlayer && (
                                            <div className="flex justify-center">
                                                <OvrBadge value={ovr} size="sm" className="!w-6 !h-6 !text-xs !shadow-none" />
                                            </div>
                                        )}
                                    </td>

                                    <td className={`p-0 h-9 ${groupEndBorder}`}>
                                        {/* 선수 미배정 슬롯도 GanttBar를 readOnly로 그려서 배경 격자/쿼터
                                            음영이 행마다 끊기지 않고 이어지도록 한다 — 상호작용만 막는다. */}
                                        <GanttBar
                                            playerId={selectedId ?? `__empty_${String(pos)}_${depthIndex}`}
                                            stints={selectedId ? stints : []}
                                            dragging={selectedId ? dragging : null}
                                            onMouseDown={handleBarMouseDown}
                                            onMouseMove={handleBarMouseMove}
                                            readOnly={!selectedId}
                                            flatGridLines
                                            flatQuarterBg
                                            sharpStintCorners
                                        />
                                    </td>

                                    <td className={`${SK} text-center align-middle ${groupEndBorder}`}>
                                        {selectedPlayer && (
                                            <span className={`text-sm font-semibold ${getMinColor(totalMins)}`}>{totalMins}</span>
                                        )}
                                    </td>

                                    <td className={`${SK} text-center align-middle ${groupEndBorder}`}>
                                        {selectedPlayer && totalMins > 0 && (
                                            <button onClick={(e) => { e.stopPropagation(); handleResetSlot(selectedId!); }} className="flex items-center justify-center w-full" title="이 슬롯 출전시간 초기화">
                                                <RotateCcw size={12} className="text-slate-400 hover:text-red-400 transition-colors" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        }))}
                    </tbody>
                </table>

                {/* 오류(또는 정상) 배너를 별도 flex 형제(화면 맨 아래로 밀림)가 아니라 스크롤
                    컨테이너 안, 표 바로 아래에 둬서 항상 뎁스 차트 마지막 행에 바로 붙어 보이게 한다. */}
                {(validation.under5Minutes.length > 0 || validation.over5Minutes.length > 0 || validation.over42.length > 0) ? (
                    <div className="bg-red-500/10 border-t border-red-500/20 px-6 py-2 flex flex-col gap-1 animate-in slide-in-from-bottom-2">
                        {validation.under5Minutes.length > 0 && (
                            <div className="flex items-center gap-2">
                                <AlertCircle size={16} className="text-red-500 shrink-0" />
                                <span className="text-sm font-bold text-red-400">5명 미만: {minutesToRanges(validation.under5Minutes)}</span>
                            </div>
                        )}
                        {validation.over5Minutes.length > 0 && (
                            <div className="flex items-center gap-2">
                                <AlertCircle size={16} className="text-orange-500 shrink-0" />
                                <span className="text-sm font-bold text-orange-400">5명 초과: {minutesToRanges(validation.over5Minutes)}</span>
                            </div>
                        )}
                        {validation.over42.length > 0 && (
                            <div className="flex items-center gap-2">
                                <AlertCircle size={16} className="text-red-500 shrink-0" />
                                <span className="text-sm font-bold text-red-500 uppercase">혹사 경고: {validation.over42.join(', ')}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-emerald-500/10 border-t border-emerald-500/20 px-6 py-2 flex items-center gap-2 animate-in slide-in-from-bottom-2">
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                        <span className="text-sm font-bold text-emerald-400">뎁스 차트·로테이션 정상 — 위반 사항 없음</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export const DepthRotationBoard = React.memo(
    DepthRotationBoardInner,
    (prev: DepthRotationBoardProps, next: DepthRotationBoardProps) =>
        prev.team === next.team &&
        prev.tactics === next.tactics &&
        prev.depthChart === next.depthChart &&
        prev.onUpdateDepthChart === next.onUpdateDepthChart &&
        prev.onUpdateTactics === next.onUpdateTactics,
);

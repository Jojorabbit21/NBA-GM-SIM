// MyTradeBlockModal.tsx — "트레이드 블록 수정" 모달(트레이드 가능 선수 DnD + 팀 단위 "원하는 대가"
// 위시리스트). [2026-09-30] 원래 MultiFrontOfficeView.tsx 안의 로컬 렌더 함수(renderMyBlockPanel)
// + 최상위 useState 9개였던 것을 별도 컴포넌트로 분리.
//
// 분리 이유(타이핑 렉): 요구사항 메모 textarea / 선수 검색 input이 2,400줄짜리 부모 컴포넌트의
// 최상위 controlled state라서 키 하나마다 부모 전체(양 팀 로스터 30행 + 캡 요약 + 제안 내역…)가
// 재렌더됐고, 선수 검색은 키마다 리그 선수 풀 전체를 필터링했다. 게다가 renderMyBlockPanel()은
// 모달이 닫혀 있어도 부모가 렌더될 때마다 요소 트리를 통째로 만들어 버렸다(Modal이 children을
// 버릴 뿐). 이제 모든 편집 상태는 이 컴포넌트 안에만 있어서 키 입력이 부모를 건드리지 않고,
// React.memo + 안정된 props로 부모 재렌더도 여기까지 내려오지 않는다. 닫혀 있을 땐 Modal이
// null을 반환하므로 렌더 비용이 사실상 0.
//
// 상태 보존: 부모가 이 컴포넌트를 항상 마운트해 두고 isOpen만 토글하므로(모달을 닫아도
// 언마운트되지 않음) 저장하지 않은 편집 내용은 닫았다 다시 열어도 그대로 남는다 — 분리 전과
// 동일한 동작.

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { notify } from '../../../services/notifications/notify';
import { Check, GripVertical, Loader2, RotateCcw, X } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { calculatePlayerOvr } from '../../../utils/constants';
import { ARCHETYPE_LABEL, type OvrArchetype } from '../../../utils/ovrEngine';
import { setTradeBlock, updateTeamTradeRequest } from '../../../services/multi/tradeService';
import type { Player } from '../../../types';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';

const DESIRED_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

// [2026-08-26] 아키타입 27종을 가드/윙/빅 3그룹으로 분류(UI 편의용 — utils/ovrEngine.ts의
// ARCHETYPE_CANDIDATES 위치별 후보 목록 기준, 여러 포지션에 걸치는 항목은 types/archetype.ts의
// 원 그룹 주석을 참고해 배정). 정밀한 엔진 분류가 아니라 사용자가 훑어보기 쉽게 나눈 것.
const ARCHETYPE_GROUPS: { label: string; keys: OvrArchetype[] }[] = [
    {
        label: '가드',
        keys: [
            'PRIMARY_CREATOR_GUARD', 'SCORING_COMBO_GUARD', 'MOVEMENT_SHOOTER', 'PERIMETER_3D',
            'FLOOR_GENERAL_GUARD', 'SCORING_POINT_GUARD', 'DEFENSIVE_GUARD', 'ISOLATION_SCORER',
            'ELITE_GUARD', 'LOCKDOWN_SHOOTER',
        ],
    },
    {
        label: '윙',
        keys: [
            'TWO_WAY_WING', 'SLASHING_WING', 'SHOT_CREATOR_WING', 'CONNECTOR_FORWARD',
            'AERIAL_WING', 'POST_SCORING_WING', 'WING_PROTECTOR', 'LOCKDOWN_WING',
            'THREE_LEVEL_SCORER',
        ],
    },
    {
        label: '빅',
        keys: [
            'POST_SCORING_BIG', 'RIM_RUNNER_BIG', 'STRETCH_BIG', 'RIM_PROTECTOR_ANCHOR',
            'PLAYMAKING_BIG', 'SWITCHABLE_ANCHOR', 'TWO_WAY_BIG', 'REBOUNDING_BIG',
            'ELBOW_OPERATOR',
        ],
    },
];

const setsDiffer = (a: Set<string>, b: Set<string>) => a.size !== b.size || [...a].some(v => !b.has(v));

export interface MyTradeBlockModalProps {
    isOpen: boolean;
    onClose: () => void;
    roomId: string | undefined;
    myTeamRow: LeagueTeamRow | null;
    /** 내 로스터(OVR 내림차순 정렬된 것) — 부모의 useMemo 값을 그대로 넘겨야 memo가 통함. */
    myRoster: Player[];
    /** 서버에 저장된 "트레이드 가능" 선수 id 집합 — 부모에서 useMemo로 참조를 고정해서 넘길 것. */
    myTradeableIds: Set<string>;
    /** "원하는 특정 선수" 검색 대상(리그 선수 풀 전체). */
    poolPlayers: Player[];
    poolById: Map<string, Player>;
    /** 트레이드 데이터 (재)조회 중 여부 — false로 바뀌는 시점에 로컬 선택 상태를 서버 값으로 재동기화. */
    loading: boolean;
    /** 저장 성공 후 부모 데이터 갱신(reload + refreshTradeData). */
    onSaved: () => void;
}

export const MyTradeBlockModal = React.memo(function MyTradeBlockModal({
    isOpen, onClose, roomId, myTeamRow, myRoster, myTradeableIds, poolPlayers, poolById, loading, onSaved,
}: MyTradeBlockModalProps) {
    // 체크(드래그)는 로컬 선택 상태만 바꾸고, "업데이트" 버튼을 눌러야 서버에 일괄 반영된다
    // (선수 한 명 클릭할 때마다 refreshTradeData()가 통째로 다시 돌아 화면이 리로드되는
    // 문제가 있었음). [2026-08-24] 체크 = "트레이드 가능"(opt-in), 기본값(미체크)은 불가.
    const [pendingTradeableIds, setPendingTradeableIds] = useState<Set<string>>(() => new Set(myTradeableIds));
    const [savingBlocks, setSavingBlocks] = useState(false);
    const [blockSaveSuccess, setBlockSaveSuccess] = useState(false);
    // [2026-10-02] 저장 실패 문구는 전역 토스트(notify.error) — toast-notification-center-plan 2단계.
    const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);

    // 서버 데이터가 (재)로드될 때만 로컬 선택 상태를 서버 값으로 동기화 — 드래그로 옮기는
    // 동안에는 이 effect가 재실행되지 않아 편집 중인 선택이 지워지지 않는다.
    useEffect(() => {
        if (!loading) setPendingTradeableIds(new Set(myTradeableIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, myTeamRow?.id]);

    const togglePendingTradeable = useCallback((playerId: string) => {
        setPendingTradeableIds(prev => {
            const next = new Set(prev);
            next.has(playerId) ? next.delete(playerId) : next.add(playerId);
            return next;
        });
    }, []);

    // 드래그&드롭 이동 — 드롭 대상 컬럼이 이미 그 선수를 갖고 있어도 안전하게 멱등 처리
    // (toggle과 달리 "이 컬럼에 있어야 한다"는 목표 상태를 직접 지정).
    const setPendingTradeableMembership = useCallback((playerId: string, tradeable: boolean) => {
        setPendingTradeableIds(prev => {
            if (prev.has(playerId) === tradeable) return prev;
            const next = new Set(prev);
            tradeable ? next.add(playerId) : next.delete(playerId);
            return next;
        });
    }, []);

    const tradeableDirty = useMemo(
        () => setsDiffer(pendingTradeableIds, myTradeableIds),
        [pendingTradeableIds, myTradeableIds],
    );

    // ── 팀 단위 "원하는 대가" 위시리스트 — 트레이드 블록(선수 목록)과 별개 기능 ─────────
    // 선수 리스트 하단에 별도 섹션으로 표시. league_teams에 팀당 1행 저장.
    const [teamRequestNote, setTeamRequestNote] = useState('');
    const [teamRequestPositions, setTeamRequestPositions] = useState<Set<string>>(new Set());
    const [teamRequestPlayerIds, setTeamRequestPlayerIds] = useState<Set<string>>(new Set());
    const [teamRequestArchetypes, setTeamRequestArchetypes] = useState<Set<string>>(new Set());
    const [teamRequestPlayerQuery, setTeamRequestPlayerQuery] = useState('');

    // 같은 팀이면 재초기화하지 않음 — 저장 후 reload()로 leagueTeams가 갱신돼도 편집 중인
    // 폼(아직 저장 안 한 값 포함)을 덮어쓰지 않기 위함.
    const initializedTeamRequestRef = useRef<string | null>(null);
    useEffect(() => {
        if (!myTeamRow) return;
        if (initializedTeamRequestRef.current === myTeamRow.id) return;
        initializedTeamRequestRef.current = myTeamRow.id;
        setTeamRequestNote(myTeamRow.trade_request_note ?? '');
        setTeamRequestPositions(new Set(myTeamRow.trade_request_positions ?? []));
        setTeamRequestPlayerIds(new Set(myTeamRow.trade_request_player_ids ?? []));
        setTeamRequestArchetypes(new Set(myTeamRow.trade_request_archetypes ?? []));
    }, [myTeamRow]);

    const toggleTeamRequestPosition = useCallback((pos: string) => {
        setTeamRequestPositions(prev => {
            const next = new Set(prev);
            next.has(pos) ? next.delete(pos) : next.add(pos);
            return next;
        });
    }, []);
    const toggleTeamRequestArchetype = useCallback((arch: string) => {
        setTeamRequestArchetypes(prev => {
            const next = new Set(prev);
            next.has(arch) ? next.delete(arch) : next.add(arch);
            return next;
        });
    }, []);
    const addTeamRequestPlayer = useCallback((id: string) => {
        setTeamRequestPlayerIds(prev => new Set(prev).add(id));
        setTeamRequestPlayerQuery('');
    }, []);
    const removeTeamRequestPlayer = useCallback((id: string) => {
        setTeamRequestPlayerIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }, []);

    const teamRequestPlayerMatches = useMemo(() => {
        const q = teamRequestPlayerQuery.trim();
        if (q.length < 1) return [];
        return poolPlayers
            .filter(p => p.name.includes(q) && !teamRequestPlayerIds.has(p.id))
            .slice(0, 8);
    }, [teamRequestPlayerQuery, poolPlayers, teamRequestPlayerIds]);

    // 서버에 저장된 값과 로컬 편집 상태를 비교 — 요구사항 메모/포지션/선수/아키타입 중 하나라도
    // 바뀌었으면 "업데이트" 버튼 활성화(선수 목록 변경 여부와 무관하게 독립적으로 판단).
    const teamRequestDirty = useMemo(() => {
        if (!myTeamRow) return false;
        if ((myTeamRow.trade_request_note ?? '') !== teamRequestNote) return true;
        return setsDiffer(teamRequestPositions, new Set(myTeamRow.trade_request_positions ?? []))
            || setsDiffer(teamRequestPlayerIds, new Set(myTeamRow.trade_request_player_ids ?? []))
            || setsDiffer(teamRequestArchetypes, new Set(myTeamRow.trade_request_archetypes ?? []));
    }, [myTeamRow, teamRequestNote, teamRequestPositions, teamRequestPlayerIds, teamRequestArchetypes]);

    // "업데이트" 버튼 하나로 트레이드 가능 여부(on/off)와 "원하는 대가" 위시리스트를 함께 저장.
    const handleSaveTradeable = useCallback(async () => {
        if (!roomId || !myTeamRow) return;
        setSavingBlocks(true);
        const toMarkTradeable    = [...pendingTradeableIds].filter(id => !myTradeableIds.has(id));
        const toMarkNotTradeable = [...myTradeableIds].filter(id => !pendingTradeableIds.has(id));
        const results = await Promise.all([
            ...toMarkTradeable.map(id => setTradeBlock(roomId, myTeamRow.id, id, true)),
            ...toMarkNotTradeable.map(id => setTradeBlock(roomId, myTeamRow.id, id, false)),
            updateTeamTradeRequest(myTeamRow.id, {
                note:              teamRequestNote,
                desiredPositions:  [...teamRequestPositions],
                desiredPlayerIds:  [...teamRequestPlayerIds],
                desiredArchetypes: [...teamRequestArchetypes],
            }),
        ]);
        setSavingBlocks(false);
        const firstError = results.find(r => r.error)?.error;
        if (firstError) {
            // [2026-10-02] 원문(RLS/네트워크 영문)은 콘솔에만, 사용자에겐 통일 문구(사용자 지정)
            console.error('[tradeBlock.save]', firstError);
            notify.error('트레이드 블록 저장에 실패했습니다. 잠시 후 다시 시도하세요.', { source: 'tradeBlock.save' });
            return;
        }
        setBlockSaveSuccess(true);
        setTimeout(() => setBlockSaveSuccess(false), 2000);
        onSaved();
    }, [
        roomId, myTeamRow, pendingTradeableIds, myTradeableIds,
        teamRequestNote, teamRequestPositions, teamRequestPlayerIds, teamRequestArchetypes,
        onSaved,
    ]);

    // 드래그&드롭 2컬럼 구성 — "내 선수 목록"(트레이드 블록에 없는 선수) / "트레이드 블록"
    // (있는 선수)으로 로컬 선택 상태(pendingTradeableIds) 기준으로 분리.
    const myRosterAvailable = useMemo(
        () => myRoster.filter(p => !pendingTradeableIds.has(p.id)),
        [myRoster, pendingTradeableIds],
    );
    const myRosterTradeable = useMemo(
        () => myRoster.filter(p => pendingTradeableIds.has(p.id)),
        [myRoster, pendingTradeableIds],
    );

    // "내 선수 목록"/"트레이드 블록" 두 컬럼이 완전히 동일한 드래그 가능 행을 렌더 —
    // 소스 배열과 드롭 콜백만 다르므로 행 자체는 한 번만 정의해 공유.
    const renderDraggableRow = (p: Player) => (
        <div
            key={p.id}
            draggable
            onDragStart={e => { setDraggedPlayerId(p.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => setDraggedPlayerId(null)}
            onClick={() => togglePendingTradeable(p.id)}
            className={`flex items-center gap-2.5 px-4 h-9 bg-slate-900 border-b border-slate-800/50 hover:bg-white/[0.03] cursor-grab active:cursor-grabbing transition-opacity ${draggedPlayerId === p.id ? 'opacity-30' : ''}`}
        >
            <GripVertical size={14} className="text-slate-600 shrink-0" />
            <OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-6 !h-6 !text-sm !shadow-none shrink-0" />
            <span className="text-sm font-semibold text-white flex-1 truncate">{p.name}</span>
            <span className="text-sm text-slate-500 shrink-0">{p.position}</span>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            hideCloseButton
            className="!rounded-3xl"
        >
            {/* 뎁스차트(DepthRotationBoard) 스타일 참고 — 바디 외곽 패딩 없이 화면을
                꽉 채우고, 섹션마다 자체 툴바(px-6 py-3)로 여백을 표현. */}
            <div className="flex flex-col">
                {/* Modal 자체의 우상단 X는 hideCloseButton으로 꺼두고, 이 툴바 안에 제목 왼쪽
                    X 버튼을 직접 둔다 — sticky top-0으로 모달 바디를 스크롤해도 항상 보임. */}
                <div className="sticky top-0 z-20 px-6 py-3 bg-slate-800 border-b border-slate-700 flex items-center gap-4 shrink-0">
                    <button
                        onClick={onClose}
                        className="p-1 -ml-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
                    >
                        <X size={18} />
                    </button>
                    <h5 className="text-base font-black text-slate-300 uppercase ko-normal flex-1">내 트레이드 블록 설정</h5>
                    {myTeamRow && (
                        <div className="flex items-center gap-3 shrink-0">
                            {blockSaveSuccess && (
                                <span className="flex items-center gap-1.5 text-sm text-emerald-400 ko-normal">
                                    <Check size={15} /> 저장 완료
                                </span>
                            )}
                            <button
                                onClick={handleSaveTradeable}
                                disabled={(!tradeableDirty && !teamRequestDirty) || savingBlocks}
                                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-black uppercase transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {savingBlocks ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                업데이트
                            </button>
                        </div>
                    )}
                </div>

                {!myTeamRow ? (
                    <p className="text-sm text-slate-500 ko-normal py-8 text-center">소속 팀이 있어야 트레이드 블록을 설정할 수 있습니다.</p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 h-[320px]">
                            <div
                                className="border-r border-slate-800 overflow-y-auto custom-scrollbar bg-slate-950"
                                onDragOver={e => e.preventDefault()}
                                onDrop={() => { if (draggedPlayerId) setPendingTradeableMembership(draggedPlayerId, false); setDraggedPlayerId(null); }}
                            >
                                <div className="px-4 py-2 bg-slate-950 sticky top-0 text-sm font-black text-slate-500 uppercase border-b border-slate-800 z-10">
                                    내 선수 목록 ({myRosterAvailable.length})
                                </div>
                                {myRosterAvailable.length === 0 && (
                                    <p className="text-sm text-slate-600 ko-normal text-center py-6">전원 트레이드 블록에 있습니다.</p>
                                )}
                                {myRosterAvailable.map(renderDraggableRow)}
                            </div>

                            <div
                                className="overflow-y-auto custom-scrollbar bg-slate-950"
                                onDragOver={e => e.preventDefault()}
                                onDrop={() => { if (draggedPlayerId) setPendingTradeableMembership(draggedPlayerId, true); setDraggedPlayerId(null); }}
                            >
                                <div className="px-4 py-2 bg-slate-950 sticky top-0 text-sm font-black text-emerald-500 uppercase border-b border-slate-800 z-10">
                                    트레이드 블록 ({myRosterTradeable.length})
                                </div>
                                {myRosterTradeable.length === 0 && (
                                    <p className="text-sm text-slate-600 ko-normal text-center py-6">선수 카드를 이쪽으로 드래그하세요.</p>
                                )}
                                {myRosterTradeable.map(renderDraggableRow)}
                            </div>
                        </div>

                        {/* 트레이드 블록(선수 목록)과는 별개 — 팀 단위로 "원하는 대가"를 공개하는 위시리스트. */}
                        <div className="py-4 border-t border-slate-800 space-y-6 divide-y divide-slate-800 shrink-0 pb-6">
                            <div className="w-1/2 px-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-bold text-white ko-normal">요구사항 메모</span>
                                        <button
                                            onClick={() => setTeamRequestNote('')}
                                            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                        >
                                            <RotateCcw size={12} /> 초기화
                                        </button>
                                    </div>
                                    <span className="text-sm text-slate-600">{teamRequestNote.length}/200</span>
                                </div>
                                <textarea
                                    value={teamRequestNote}
                                    onChange={e => setTeamRequestNote(e.target.value.slice(0, 200))}
                                    placeholder="트레이드 시장에서 원하는 요구사항을 입력하세요."
                                    rows={3}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none ko-normal"
                                />
                            </div>

                            <div className="px-6 pt-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-base font-bold text-white ko-normal">원하는 포지션</span>
                                    <button
                                        onClick={() => setTeamRequestPositions(new Set())}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                    >
                                        <RotateCcw size={12} /> 초기화
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {DESIRED_POSITIONS.map(pos => (
                                        <button
                                            key={pos}
                                            onClick={() => toggleTeamRequestPosition(pos)}
                                            className={`px-2.5 py-1 rounded-lg border text-sm font-bold transition-colors ${
                                                teamRequestPositions.has(pos) ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400 hover:bg-white/5'
                                            }`}
                                        >
                                            {pos}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="px-6 pt-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-base font-bold text-white ko-normal">원하는 아키타입</span>
                                    <button
                                        onClick={() => setTeamRequestArchetypes(new Set())}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                    >
                                        <RotateCcw size={12} /> 초기화
                                    </button>
                                </div>
                                <div className="space-y-2.5">
                                    {ARCHETYPE_GROUPS.map(group => (
                                        <div key={group.label} className="flex items-start gap-3">
                                            <span className="text-sm font-bold text-slate-300 ko-normal w-8 pt-1 shrink-0">{group.label}</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {group.keys.map(key => (
                                                    <button
                                                        key={key}
                                                        onClick={() => toggleTeamRequestArchetype(key)}
                                                        className={`px-2.5 py-1 rounded-lg border text-sm font-bold transition-colors ${
                                                            teamRequestArchetypes.has(key) ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400 hover:bg-white/5'
                                                        }`}
                                                    >
                                                        {ARCHETYPE_LABEL[key]}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="px-6 pt-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-base font-bold text-white ko-normal">원하는 특정 선수</span>
                                    <button
                                        onClick={() => { setTeamRequestPlayerIds(new Set()); setTeamRequestPlayerQuery(''); }}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                    >
                                        <RotateCcw size={12} /> 초기화
                                    </button>
                                </div>
                                <div className="max-w-md relative">
                                    <input
                                        value={teamRequestPlayerQuery}
                                        onChange={e => setTeamRequestPlayerQuery(e.target.value)}
                                        placeholder="선수 이름 검색"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 ko-normal"
                                    />
                                    {teamRequestPlayerMatches.length > 0 && (
                                        // 오버레이로 띄워서 아래 콘텐츠(저장 버튼 등)를 밀어내지 않게 함 — absolute + z-index.
                                        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-slate-950 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                                            {teamRequestPlayerMatches.map(mp => (
                                                <button
                                                    key={mp.id}
                                                    onClick={() => addTeamRequestPlayer(mp.id)}
                                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5"
                                                >
                                                    <span className="text-sm text-white truncate flex-1">{mp.name}</span>
                                                    <span className="text-sm text-slate-500 shrink-0">{mp.position}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {teamRequestPlayerIds.size > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-4">
                                        {[...teamRequestPlayerIds].map(id => (
                                            <span key={id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-indigo-500 bg-indigo-600/30 text-sm font-bold text-white ko-normal">
                                                {poolById.get(id)?.name ?? id}
                                                <button onClick={() => removeTeamRequestPlayer(id)} className="text-white/70 hover:text-white">
                                                    <X size={11} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
});

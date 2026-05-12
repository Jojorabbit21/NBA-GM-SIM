
import React, { useState, useCallback } from 'react';
import {
    Settings, Pause, Play, RotateCcw, SkipForward,
    FastForward, ChevronDown, ChevronUp, X, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import type { MultiDraftState, DraftPickEntry } from '../../types/multiDraft';

interface Props {
    draftState:           MultiDraftState;
    leagueId:             string;
    roomId:               string;
    onOptimisticPause?:   () => void;    // 일시정지 버튼 클릭 즉시 호출 (타이머 동결)
    onOptimisticRevert?:  () => void;    // EF 오류 시 동결 해제
}

type Action = 'pause' | 'resume' | 'reset-timer' | 'skip-turn' | 'autocomplete' | 'rollback';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    active:    { label: '진행 중', color: 'text-emerald-400' },
    paused:    { label: '일시정지', color: 'text-amber-400' },
    completed: { label: '완료', color: 'text-slate-400' },
};

export const DraftAdminPanel: React.FC<Props> = ({
    draftState, leagueId, roomId,
    onOptimisticPause, onOptimisticRevert,
}) => {
    const [open,          setOpen]          = useState(false);
    const [loading,       setLoading]       = useState<Action | null>(null);
    const [rollbackOpen,  setRollbackOpen]  = useState(false);
    const [confirmAction, setConfirmAction] = useState<Action | null>(null);
    const [feedback,      setFeedback]      = useState<string | null>(null);

    const call = useCallback(async (
        action: Action,
        params?: { targetPickIndex?: number }
    ) => {
        // 일시정지: EF 응답 전에 즉시 타이머 동결 (낙관적 UI)
        if (action === 'pause') onOptimisticPause?.();

        setLoading(action);
        setFeedback(null);
        try {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            const { data, error } = await supabase.functions.invoke('admin-draft-override', {
                body: { action, roomId, leagueId, params },
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            if (error || !data?.ok) {
                // EF 오류 시 동결 해제
                if (action === 'pause') onOptimisticRevert?.();
                setFeedback(`오류: ${data?.error ?? error?.message ?? '알 수 없는 오류'}`);
            } else {
                if (action === 'rollback') {
                    setFeedback(`${data.rolledBackPicks}개 픽이 롤백되었습니다.`);
                    setRollbackOpen(false);
                } else if (action === 'autocomplete') {
                    setFeedback(`${data.completedPicks}개 픽이 자동완성되었습니다.`);
                } else if (action === 'skip-turn') {
                    setFeedback(`${data.pickedPlayer} 자동 선택`);
                } else {
                    setFeedback('완료');
                }
            }
        } catch (e: any) {
            setFeedback(`오류: ${e.message}`);
        } finally {
            setLoading(null);
            setConfirmAction(null);
        }
    }, [roomId, leagueId, onOptimisticPause, onOptimisticRevert]);

    const handleConfirm = useCallback((action: Action) => {
        if (action === 'autocomplete') {
            // 확인 필요
            setConfirmAction(action);
        } else {
            call(action);
        }
    }, [call]);

    const status      = draftState.status;
    const curIdx      = draftState.currentPickIndex;
    const totalPicks  = draftState.pickOrder.length;
    const recentPicks = [...(draftState.picks ?? [])].reverse().slice(0, 15);
    const st          = STATUS_LABEL[status] ?? STATUS_LABEL.active;

    const btnBase  = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
    const btnGray  = `${btnBase} bg-slate-700 hover:bg-slate-600 text-slate-200`;
    const btnAmber = `${btnBase} bg-amber-700/60 hover:bg-amber-600/60 text-amber-200`;
    const btnRed   = `${btnBase} bg-red-700/60 hover:bg-red-600/60 text-red-200`;

    return (
        <>
            {/* 토글 버튼 */}
            <button
                onClick={() => setOpen(o => !o)}
                className="fixed top-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1.5
                           bg-slate-800/90 hover:bg-slate-700 border border-slate-600 rounded-lg
                           text-slate-300 text-xs font-bold backdrop-blur-sm transition-colors"
            >
                <Settings size={13} />
                Admin
            </button>

            {/* 오버레이 패널 */}
            {open && (
                <div className="fixed top-0 right-0 h-full w-72 z-40 bg-slate-900 border-l border-slate-700
                                flex flex-col shadow-2xl">

                    {/* 헤더 */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                        <div className="flex items-center gap-2">
                            <Settings size={14} className="text-slate-400" />
                            <span className="text-sm font-black text-white">드래프트 관리</span>
                        </div>
                        <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

                        {/* 상태 표시 */}
                        <div className="bg-slate-800/60 rounded-xl p-3 space-y-1.5">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">상태</span>
                                <span className={`font-bold ${st.color}`}>{st.label}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">현재 픽</span>
                                <span className="text-white font-mono">
                                    {status === 'completed' ? '완료' : `${curIdx + 1} / ${totalPicks}`}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">완료 픽</span>
                                <span className="text-white font-mono">{draftState.picks?.length ?? 0}</span>
                            </div>
                        </div>

                        {/* 피드백 */}
                        {feedback && (
                            <div className={`text-xs px-3 py-2 rounded-lg ${
                                feedback.startsWith('오류')
                                    ? 'bg-red-900/40 text-red-300 border border-red-700/40'
                                    : 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40'
                            }`}>
                                {feedback}
                            </div>
                        )}

                        {/* 기본 컨트롤 */}
                        <div className="space-y-2">
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">빠른 제어</p>

                            {/* Pause / Resume */}
                            {status === 'active' ? (
                                <button
                                    onClick={() => handleConfirm('pause')}
                                    disabled={loading !== null}
                                    className={btnAmber + ' w-full justify-center'}
                                >
                                    <Pause size={12} />
                                    {loading === 'pause' ? '처리 중...' : '드래프트 일시정지'}
                                </button>
                            ) : status === 'paused' ? (
                                <button
                                    onClick={() => handleConfirm('resume')}
                                    disabled={loading !== null}
                                    className={`${btnBase} bg-emerald-700/60 hover:bg-emerald-600/60 text-emerald-200 w-full justify-center`}
                                >
                                    <Play size={12} />
                                    {loading === 'resume' ? '처리 중...' : '드래프트 재개'}
                                </button>
                            ) : null}

                            {/* 타이머 리셋 */}
                            {status === 'active' && (
                                <button
                                    onClick={() => call('reset-timer')}
                                    disabled={loading !== null}
                                    className={btnGray + ' w-full justify-center'}
                                >
                                    <RotateCcw size={12} />
                                    {loading === 'reset-timer' ? '처리 중...' : '픽 타이머 리셋'}
                                </button>
                            )}

                            {/* 차례 건너뛰기 */}
                            {(status === 'active') && (
                                <button
                                    onClick={() => call('skip-turn')}
                                    disabled={loading !== null}
                                    className={btnGray + ' w-full justify-center'}
                                >
                                    <SkipForward size={12} />
                                    {loading === 'skip-turn' ? '처리 중...' : '현재 차례 건너뛰기'}
                                </button>
                            )}
                        </div>

                        {/* 자동완성 */}
                        {(status === 'active' || status === 'paused') && (
                            <div className="space-y-2">
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">고급</p>
                                {confirmAction === 'autocomplete' ? (
                                    <div className="bg-red-900/30 border border-red-700/40 rounded-xl p-3 space-y-2">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                                            <p className="text-xs text-red-300">
                                                남은 {totalPicks - curIdx}개 픽을 전부 AI로 자동완성합니다. 되돌릴 수 없습니다.
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setConfirmAction(null)}
                                                className={`${btnGray} flex-1 justify-center`}
                                            >
                                                취소
                                            </button>
                                            <button
                                                onClick={() => call('autocomplete')}
                                                disabled={loading !== null}
                                                className={`${btnRed} flex-1 justify-center`}
                                            >
                                                {loading === 'autocomplete' ? '진행 중...' : '확인'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setConfirmAction('autocomplete')}
                                        disabled={loading !== null}
                                        className={btnRed + ' w-full justify-center'}
                                    >
                                        <FastForward size={12} />
                                        나머지 전체 AI 자동완성
                                    </button>
                                )}
                            </div>
                        )}

                        {/* 픽 롤백 */}
                        {(draftState.picks?.length ?? 0) > 0 && (
                            <div className="space-y-2">
                                <button
                                    onClick={() => setRollbackOpen(o => !o)}
                                    className="w-full flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors"
                                >
                                    <span>픽 롤백</span>
                                    {rollbackOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>

                                {rollbackOpen && (
                                    <div className="space-y-1 max-h-64 overflow-y-auto">
                                        <p className="text-[10px] text-slate-500 pb-1">
                                            선택한 픽 이전으로 되돌립니다.
                                        </p>
                                        {recentPicks.map((pick: DraftPickEntry) => (
                                            <div
                                                key={pick.pickIndex}
                                                className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-1.5 gap-2"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] text-slate-500 font-mono shrink-0">
                                                            R{pick.round}-{pick.slot}
                                                        </span>
                                                        <span className="text-xs text-slate-200 truncate">
                                                            {pick.playerName}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="text-[10px] text-slate-500 uppercase">
                                                            {pick.teamId}
                                                        </span>
                                                        <span className="text-[10px] text-slate-600">
                                                            OVR {pick.ovr}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => call('rollback', { targetPickIndex: pick.pickIndex })}
                                                    disabled={loading !== null}
                                                    className="shrink-0 text-[10px] text-amber-400 hover:text-amber-300
                                                               disabled:opacity-40 font-semibold transition-colors"
                                                >
                                                    {loading === 'rollback' ? '...' : '여기로'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

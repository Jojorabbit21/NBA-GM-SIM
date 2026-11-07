// PhoneDraftHeader.tsx — 드래프트 룸 폰 헤더(팀색 밴드 2줄 + 내 차례 프로그레스 바). [2026-11-08]
// docs/ui/mobile-design-system.md §9-0-4 "헤더(팀색 밴드) — 3판", 캔버스 21행 E1~E15.
// 1줄 56 = 뒤로 44 | 타이머 24/800 가운데(일시정지 amber) | 어드민 ⚙ 44(아니면 빈 칸으로 가운데 유지)
// 2줄 32 = 좌 "N라운드 #N픽" + 계약 표기 | 우 현재 차례 팀(AUTO 배지 + 로고 20 + 팀명)
// 내 차례면 맨 아래 3px 바(남은 시간 ÷ 픽 제한 시간, 1초 linear). 발표 문구·워터마크·"드래프트 룸" 제목은 폰에 없음(사용자 지시).
import React from 'react';
import { ArrowLeft, RefreshCw, Settings } from 'lucide-react';
import type { RoomTeamMetaMap } from '../../../types/multiDraft';
import { resolveTeamDisplay } from '../teamMetaLookup';
import { TeamLogo } from '../../common/TeamLogo';

export interface PhoneDraftHeaderProps {
    currentTeamId: string;
    teamMeta?: RoomTeamMetaMap;
    currentRound: number;
    currentPickInRound: number;
    salaryLabel?: string;
    isMyTurn: boolean;
    isPaused: boolean;
    timeRemaining: number;
    pickDurationSec: number;
    isCurrentTeamAutoPick: boolean;
    onBack: () => void;
    /** 완료 후 일정 생성 전 — 뒤로 잠금 */
    navLocked?: boolean;
    isAdmin?: boolean;
    onAdmin?: () => void;
    /** 완료 상태: 타이머 자리에 "드래프트 완료", 2줄에 일정 생성 진행 */
    completion?: { ready: boolean; progress: number; timedOut: boolean } | null;
    /** 대기(waiting) 상태: 타이머 자리에 시작 카운트다운(amber), 2줄 좌 "드래프트 시작까지" */
    waitingCountdown?: string | null;
}

export const PHONE_DRAFT_HEADER_PROGRESS_H = 3;

export const PhoneDraftHeader: React.FC<PhoneDraftHeaderProps> = ({
    currentTeamId, teamMeta, currentRound, currentPickInRound, salaryLabel, isMyTurn, isPaused, timeRemaining, pickDurationSec,
    isCurrentTeamAutoPick, onBack, navLocked = false, isAdmin = false, onAdmin, completion, waitingCountdown,
}) => {
    const team = resolveTeamDisplay(currentTeamId, teamMeta);
    const timerStr = `00:${String(Math.max(0, timeRemaining)).padStart(2, '0')}`;
    const remainingPct = pickDurationSec > 0 ? Math.max(0, Math.min(100, (timeRemaining / pickDurationSec) * 100)) : 0;
    const isWaiting = waitingCountdown !== undefined && waitingCountdown !== null;

    return (
        <header className="relative shrink-0 overflow-hidden" style={{ backgroundColor: team.colorPrimary }}>
            <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
            <div className="relative pt-safe">
                <div className="h-14 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center pl-1 pr-2">
                    <button
                        type="button"
                        onClick={onBack}
                        disabled={navLocked}
                        aria-label={navLocked ? '시즌 일정 생성 중' : '뒤로'}
                        className="w-11 h-11 flex items-center justify-center rounded-lg text-white/60 active:bg-white/10 disabled:opacity-40"
                    >
                        <ArrowLeft size={22} />
                    </button>
                    <div className="min-w-0 flex items-center justify-center">
                        {completion ? (
                            <span className="text-lg font-extrabold text-white">드래프트 완료</span>
                        ) : isWaiting ? (
                            <span className="text-2xl font-extrabold tabular-nums text-amber-400 tracking-tight">{waitingCountdown ?? '--:--:--'}</span>
                        ) : (
                            <span className={`text-2xl font-extrabold tabular-nums tracking-tight ${isPaused ? 'text-amber-400' : 'text-white'}`}>
                                {isPaused ? '일시정지' : timerStr}
                            </span>
                        )}
                    </div>
                    {isAdmin && onAdmin ? (
                        <button type="button" onClick={onAdmin} aria-label="드래프트 관리" className="w-11 h-11 flex items-center justify-center rounded-lg text-white/80 active:bg-white/10">
                            <Settings size={22} />
                        </button>
                    ) : <span className="w-11 h-11" aria-hidden="true" />}
                </div>
                <div className="min-h-8 pb-2 px-4 flex items-center justify-between gap-3">
                    {completion ? (
                        <span className={`text-xs font-bold ${completion.timedOut ? 'text-red-300' : 'text-white/60'}`}>
                            {completion.timedOut ? '시즌 일정 생성에 문제가 발생했습니다'
                                : completion.ready ? '시즌 일정 준비 완료'
                                : `시즌 일정 생성 중 · ${completion.progress}%`}
                        </span>
                    ) : (
                        <>
                            <span className="text-xs font-bold text-white/60 whitespace-nowrap shrink-0">
                                {isWaiting ? '드래프트 시작까지' : <>{currentRound}라운드 #{currentPickInRound}픽</>}
                                {!isWaiting && salaryLabel && <span className="text-emerald-300/80 ml-1">{salaryLabel}</span>}
                            </span>
                            <span className="min-w-0 inline-flex items-center gap-1.5">
                                {isCurrentTeamAutoPick && (
                                    <span title="오토픽 진행 중" className="w-[18px] h-[18px] rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                                        <RefreshCw size={11} />
                                    </span>
                                )}
                                {currentTeamId && <TeamLogo teamId={currentTeamId} size="custom" className="w-5 h-5 shrink-0" shadow={false} />}
                                <span className="text-[13px] font-bold text-white truncate">{team.name}</span>
                            </span>
                        </>
                    )}
                </div>
            </div>
            {isMyTurn && !completion && !isWaiting && (
                <div role="progressbar" aria-label="남은 시간" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(remainingPct)} className="relative bg-white/15" style={{ height: PHONE_DRAFT_HEADER_PROGRESS_H }}>
                    <div className="h-full bg-emerald-400" style={{ width: `${remainingPct}%`, transition: 'width 1s linear' }} />
                </div>
            )}
        </header>
    );
};

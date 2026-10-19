// UpdateToast.tsx — "새 버전이 있습니다" 알림 UI 3종. 상태는 services/notifications/updateNoticeStore.ts.
// - UpdateToastCard: 카드 본체(위치 없음). withTail이면 아래쪽 꼬리가 채팅 FAB 중심(오른쪽 24px)을 가리킨다.
// - UpdateToast: 위젯이 없는 화면용 단독 토스트(오른쪽 아래 고정). App이 마운트한다.
// - UpdateBanner: 채팅 위젯이 열려 있을 때 탭 바로 아래에 붙는 한 줄 배너.
// 위젯 안에서의 배치(FAB 위 토스트 / 열림 시 배너)는 LeagueChatDock이 정한다.

import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { dismissUpdateToast, useUpdateNotice } from '../services/notifications/updateNoticeStore';

const reload = () => window.location.reload();

interface UpdateToastCardProps {
    withTail?: boolean;
}

export const UpdateToastCard: React.FC<UpdateToastCardProps> = ({ withTail = false }) => (
    <div
        role="status"
        aria-live="polite"
        className="toast-enter relative pointer-events-auto w-[320px] max-w-[calc(100vw-32px)] bg-slate-900 border border-slate-700 rounded-2xl p-3.5 shadow-2xl flex flex-col gap-3.5"
    >
        <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-emerald-500/15 border border-emerald-400/30 text-emerald-400">
                <RefreshCw size={18} strokeWidth={2} className="update-icon-spin" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-100 leading-5">새 버전이 있습니다</p>
                <p className="text-[13px] text-slate-400 leading-[19px] mt-px">새로고침하면 최신 버전으로 바뀝니다.</p>
            </div>
            <button
                type="button"
                onClick={dismissUpdateToast}
                aria-label="나중에 보기"
                className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-100 hover:bg-slate-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
                <X size={14} strokeWidth={2} aria-hidden="true" />
            </button>
        </div>
        <div className="flex gap-2">
            <button
                type="button"
                onClick={dismissUpdateToast}
                className="h-[34px] px-3.5 rounded-lg text-[13px] font-semibold text-slate-100 border border-slate-700 hover:border-slate-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
                나중에
            </button>
            <button
                type="button"
                onClick={reload}
                className="flex-1 h-[34px] rounded-lg text-[13px] font-semibold text-white border border-emerald-400 bg-gradient-to-b from-emerald-500 to-emerald-700 hover:brightness-110 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 focus-visible:outline-offset-2"
            >
                새로고침
            </button>
        </div>
        {withTail && (
            <span
                aria-hidden="true"
                className="absolute right-[19px] -bottom-[6px] w-2.5 h-2.5 rotate-45 bg-slate-900 border-r border-b border-slate-700"
            />
        )}
    </div>
);

/** 위젯이 없는 화면에서만 단독으로 뜬다(리그 안에서는 LeagueChatDock이 대신 보여준다). */
export const UpdateToast: React.FC = () => {
    const { available, toastDismissed, dockMounted } = useUpdateNotice();
    if (!available || toastDismissed || dockMounted) return null;
    return (
        <div className="fixed bottom-6 right-6 z-toast">
            <UpdateToastCard />
        </div>
    );
};

export const UpdateBanner: React.FC = () => (
    <div className="shrink-0 flex items-center gap-2 h-[42px] px-3 bg-emerald-500/[0.14] border-b border-emerald-400/30 text-[12.5px] text-slate-100">
        <RefreshCw size={14} strokeWidth={2} className="shrink-0 text-emerald-400" aria-hidden="true" />
        <span className="flex-1 min-w-0 font-semibold truncate">새 버전이 있습니다</span>
        <button
            type="button"
            onClick={reload}
            className="shrink-0 h-[26px] px-2.5 rounded-md text-xs font-semibold text-white border border-emerald-400 bg-gradient-to-b from-emerald-500 to-emerald-700 hover:brightness-110 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 focus-visible:outline-offset-2"
        >
            새로고침
        </button>
    </div>
);

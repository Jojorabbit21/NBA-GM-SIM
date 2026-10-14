import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export type InlineNoticeTone = 'danger' | 'warning' | 'info' | 'success';
export type InlineNoticeSize = 'md' | 'sm';

interface InlineNoticeProps {
    /**
     * danger  = 버튼 액션 실패(RPC 거절)·폼 검증
     * warning = 사전 차단(정원 초과 등)·미저장·자동 처리 안내
     * info    = 현재 상태 때문에 생기는 제약 설명(세션 진행 중 등)
     * success = 저장·완료 확인
     */
    tone: InlineNoticeTone;
    /** md = 틴트 박스(14px, 아이콘·라운드 없음, 부모 폭 채움) / sm = 글자만(12px) — 버튼 옆·입력 아래 */
    size?: InlineNoticeSize;
    children: React.ReactNode;
    /** 있으면 md 우측에 닫기 X — 사용자가 직접 치울 안내(자동 지명 결과 등)에만 */
    onDismiss?: () => void;
    /** 지정하면 N ms 후 스스로 사라진다(성공 확인 3초 등). 에러에는 쓰지 않는다 — 읽고 있을 수 있음 */
    autoHideMs?: number;
    className?: string;
}

const TONE_MD: Record<InlineNoticeTone, string> = {
    danger:  'bg-red-500/10 border-red-500/20 text-red-400',
    warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    info:    'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
};
const TONE_SM: Record<InlineNoticeTone, string> = {
    danger: 'text-red-400', warning: 'text-amber-400', info: 'text-indigo-300', success: 'text-emerald-400',
};

/**
 * 인라인 상태 안내 — 2026-10-13 신설(docs/plan/ui-consolidation.md 7장 7번, 에러 표시 정책).
 * 토스트는 리그 이벤트·붙을 자리가 없는 백그라운드 실패에만 쓰고, 버튼 액션의 결과·사전 차단·
 * 미저장·폼 검증은 전부 이 컴포넌트로 "손끝 옆"에 보여준다. 문구는 어절 단위로 줄바꿈되고
 * 말줄임하지 않는다(에러 문구가 잘리면 의미가 없음). 조밀한 목록의 항목별 상태는 StatusDot.
 */
export const InlineNotice: React.FC<InlineNoticeProps> = ({ tone, size = 'md', children, onDismiss, autoHideMs, className = '' }) => {
    const [hidden, setHidden] = useState(false);

    // 내용이 바뀌면 다시 보이고, autoHideMs가 있으면 타이머를 새로 건다
    useEffect(() => {
        setHidden(false);
        if (!autoHideMs) return;
        const t = window.setTimeout(() => setHidden(true), autoHideMs);
        return () => window.clearTimeout(t);
    }, [autoHideMs, children]);

    if (hidden) return null;

    const role = tone === 'danger' ? 'alert' : 'status';

    if (size === 'sm') {
        return (
            <p role={role} className={`text-xs font-medium leading-4 break-keep [overflow-wrap:anywhere] ${TONE_SM[tone]} ${className}`}>
                {children}
            </p>
        );
    }

    return (
        <div role={role} className={`flex items-start gap-2 border px-4 py-3 text-sm font-medium leading-5 break-keep [overflow-wrap:anywhere] ${TONE_MD[tone]} ${className}`}>
            <div className="flex-1 min-w-0">{children}</div>
            {onDismiss && (
                <IconButton label="닫기" size="xs" tone="inherit" shape="md" onClick={onDismiss} className="-mr-1 -my-0.5 opacity-70 hover:opacity-100 hover:bg-white/10">
                    <X size={12} />
                </IconButton>
            )}
        </div>
    );
};

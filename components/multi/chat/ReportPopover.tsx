// ReportPopover.tsx — 말풍선 "신고" 버튼 옆 신고 사유 팝오버. 계획: docs/plan/league-chat-plan.md "신고 UI"
//
// - 사유 7종 체크박스 다중 선택(최소 1개) → report_chat_message RPC. 메시지당 1회, 처리는 없음(기록만).
// - 위치: 대화 영역(부모, position: relative) 기준 좌표. 버튼 위 공간이 되면 위로, 아니면 아래로 뒤집고 좌우는 영역 안으로 클램프.
//   스크롤 목록 안이 아니라 대화 영역에 그려서 목록 경계에 잘리지 않는다.
// - 배경은 부모가 어둡게만 덮는다(블러 금지 — 2026-09-30 실측 렉).
// - Esc로 닫고(위젯까지 닫히지 않게 전파 중단) 포커스는 부모가 신고 버튼으로 돌려준다.

import React, { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../../common/Button';
import { InlineNotice } from '../../common/InlineNotice';
import {
    CHAT_REPORT_REASONS, ChatSendError, reportChatMessage, reportErrorMessage, type ChatReportReason,
} from '../../../services/multi/chatService';

const WIDTH = 264;
const GAP = 8;
const EDGE = 8;

export interface ReportAnchor {
    /** 대화 영역 기준 버튼 사각형 */
    top: number;
    bottom: number;
    left: number;
    right: number;
}

interface Props {
    messageId: number;
    anchor: ReportAnchor;
    paneWidth: number;
    paneHeight: number;
    onClose: () => void;
    onReported: (messageId: number) => void;
    onAlreadyReported: (messageId: number) => void;
}

export const ReportPopover: React.FC<Props> = ({ messageId, anchor, paneWidth, paneHeight, onClose, onReported, onAlreadyReported }) => {
    const ref = useRef<HTMLDivElement>(null);
    const firstRef = useRef<HTMLInputElement>(null);
    const [picked, setPicked] = useState<Set<ChatReportReason>>(() => new Set());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    // 실제 높이를 잰 뒤 위/아래를 정한다
    useLayoutEffect(() => {
        const h = ref.current?.offsetHeight ?? 0;
        const above = anchor.top - GAP - h;
        const below = anchor.bottom + GAP;
        const top = above >= EDGE ? above : Math.max(EDGE, Math.min(below, paneHeight - h - EDGE));
        const left = Math.max(EDGE, Math.min(anchor.left - WIDTH / 2, paneWidth - WIDTH - EDGE));
        setPos({ top, left });
    }, [anchor, paneWidth, paneHeight, error]);

    useLayoutEffect(() => { firstRef.current?.focus(); }, []);

    const toggle = (code: ChatReportReason) => {
        setPicked(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code); else next.add(code);
            return next;
        });
        setError(null);
    };

    const submit = async () => {
        if (picked.size === 0 || busy) return;
        setBusy(true);
        setError(null);
        try {
            await reportChatMessage(messageId, Array.from(picked));
            onReported(messageId);
        } catch (e) {
            if (e instanceof ChatSendError && e.code === 'already_reported') { onAlreadyReported(messageId); return; }
            setError(reportErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            ref={ref}
            role="dialog"
            aria-modal="false"
            aria-labelledby="chat-report-title"
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
            style={{ top: pos?.top ?? anchor.bottom + GAP, left: pos?.left ?? EDGE, width: WIDTH, visibility: pos ? 'visible' : 'hidden' }}
            className="absolute z-20 flex flex-col gap-3 p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl"
        >
            <div className="flex flex-col gap-1">
                <span id="chat-report-title" className="text-sm font-bold text-white">메시지 신고</span>
                <span className="text-xs font-medium text-slate-400 ko-normal">해당하는 사유를 모두 골라 주세요. 상대에게는 알리지 않아요.</span>
            </div>
            <fieldset className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <legend className="sr-only">신고 사유 (여러 개 선택 가능)</legend>
                {CHAT_REPORT_REASONS.map((r, i) => {
                    const on = picked.has(r.code);
                    return (
                        <label key={r.code} className={`flex items-center gap-2 h-8 text-xs font-bold cursor-pointer ${on ? 'text-white' : 'text-slate-400'}`}>
                            <input
                                ref={i === 0 ? firstRef : undefined}
                                type="checkbox"
                                checked={on}
                                onChange={() => toggle(r.code)}
                                className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                            />
                            {r.label}
                        </label>
                    );
                })}
            </fieldset>
            {error && <InlineNotice tone="danger" size="sm">{error}</InlineNotice>}
            <div className="flex justify-end gap-1.5">
                <Button variant="secondary" size="sm" onClick={onClose}>취소</Button>
                <Button variant="danger" size="sm" onClick={submit} disabled={picked.size === 0} isLoading={busy}>신고</Button>
            </div>
        </div>
    );
};

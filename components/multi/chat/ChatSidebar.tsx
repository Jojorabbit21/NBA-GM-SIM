// ChatSidebar.tsx — 채팅 위젯 좌측 채팅 목록(상시 표시). 계획: docs/plan/league-chat-plan.md "DM 2차 확정안"
//
// 맨 위 "# 퍼블릭"(리그 전체 채팅) + "다이렉트 메시지" 구역(+ 새 대화 버튼, 대화 행). 행은 로고·이름·안 읽은 수 배지만
// (최근 메시지 미리보기 없음). DM이 하나도 없어도 빈 상태 안내는 두지 않는다(구역 제목 + 버튼만).

import React from 'react';
import { Plus } from 'lucide-react';
import { CountBadge } from '../../common/CountBadge';
import { IconButton } from '../../common/IconButton';
import type { DmConversation } from '../../../services/multi/chatService';
import { ChatAvatar } from './ChatThread';

/** 'public' | conv_key | 'new' */
export type ChatChannelId = string;

interface Props {
    activeId: ChatChannelId | null;
    publicUnread: number;
    conversations: DmConversation[];
    onlineUserIds: ReadonlySet<string>;
    onSelectPublic: () => void;
    onSelectConversation: (c: DmConversation) => void;
    onNew: () => void;
    /** 좁은 화면 — 목록이 위젯 전체 폭을 쓴다 */
    fullWidth?: boolean;
}

export const ChatSidebar: React.FC<Props> = ({
    activeId, publicUnread, conversations, onlineUserIds, onSelectPublic, onSelectConversation, onNew, fullWidth = false,
}) => {
    const publicOn = activeId === 'public';
    return (
        <nav
            aria-label="채팅 목록"
            className={`${fullWidth ? 'w-full' : 'w-[220px] border-r border-slate-800'} shrink-0 flex flex-col min-h-0 bg-slate-950/40`}
        >
            <div className="px-2 pt-2 pb-1 shrink-0">
                <button
                    type="button"
                    onClick={onSelectPublic}
                    aria-current={publicOn ? 'true' : undefined}
                    className={`w-full min-h-[44px] flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors ${publicOn ? 'bg-slate-800' : 'hover:bg-slate-800/60'}`}
                >
                    <span className="flex-1 min-w-0 flex items-baseline gap-1.5 text-sm font-bold text-white">
                        <span aria-hidden="true" className="text-base font-medium text-slate-500">#</span>퍼블릭
                    </span>
                    {!publicOn && <CountBadge count={publicUnread} size="md" />}
                </button>
            </div>

            <div className="flex items-center justify-between pl-4 pr-2 pt-2.5 pb-1 shrink-0">
                <span className="text-xs font-bold text-slate-500">다이렉트 메시지</span>
                <IconButton
                    label="새 대화"
                    size="md"
                    tone="subtle"
                    onClick={onNew}
                    aria-pressed={activeId === 'new'}
                    className={activeId === 'new' ? 'bg-slate-700 text-white' : ''}
                >
                    <Plus size={16} />
                </IconButton>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 px-2 pb-2">
                {conversations.map(c => {
                    const on = activeId === c.conv_key;
                    const unread = on ? 0 : c.unread;
                    const strong = unread > 0 || on;
                    return (
                        <button
                            key={c.conv_key}
                            type="button"
                            onClick={() => onSelectConversation(c)}
                            aria-current={on ? 'true' : undefined}
                            className={`w-full min-h-[44px] flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors ${on ? 'bg-slate-800' : 'hover:bg-slate-800/60'}`}
                        >
                            <ChatAvatar teamId={c.peer_team_id} teamName={c.peer_team_name} online={onlineUserIds.has(c.peer_id)} size="sm" />
                            <span className={`flex-1 min-w-0 truncate text-sm ko-normal ${strong ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>
                                {c.peer_name}
                            </span>
                            <CountBadge count={unread} size="md" />
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

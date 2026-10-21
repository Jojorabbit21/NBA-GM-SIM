// ChatSidebar.tsx — 채팅 위젯 좌측 채팅 목록(상시 표시). 계획: docs/plan/league-chat-plan.md "DM 2차 확정안"
//
// 맨 위 "# 퍼블릭"(리그 전체 채팅) + "다이렉트 메시지" 구역(+ 새 대화 버튼, 대화 행). 행은 로고·이름·안 읽은 수 배지만
// (최근 메시지 미리보기 없음). DM이 하나도 없어도 빈 상태 안내는 두지 않는다(구역 제목 + 버튼만).
// [2026-10-21] 접기: 맨 아래 접기/펼치기 버튼. 접으면 56px 아이콘 띠(# / + / 로고, 배지는 모서리) — 위젯 폭도 600 → 436px로 줄어든다.
// 좁은 화면(목록이 위젯 전체 폭)에서는 접기 버튼을 두지 않는다(onToggleCollapsed 미전달).

import React from 'react';
import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
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
    collapsed?: boolean;
    /** 없으면 접기 버튼을 그리지 않는다 */
    onToggleCollapsed?: () => void;
}

const unreadLabel = (n: number) => (n > 0 ? `, 안 읽은 메시지 ${n}개` : '');

export const ChatSidebar: React.FC<Props> = ({
    activeId, publicUnread, conversations, onlineUserIds, onSelectPublic, onSelectConversation, onNew,
    fullWidth = false, collapsed = false, onToggleCollapsed,
}) => {
    const publicOn = activeId === 'public';
    const isCollapsed = collapsed && !fullWidth;

    const toggleButton = onToggleCollapsed && !fullWidth && (
        <div className={`shrink-0 border-t border-slate-800 py-1.5 ${isCollapsed ? 'flex justify-center' : 'px-2'}`}>
            <IconButton
                label={isCollapsed ? '채팅 목록 펼치기' : '채팅 목록 접기'}
                size="lg"
                tone="subtle"
                onClick={onToggleCollapsed}
                aria-expanded={!isCollapsed}
            >
                {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </IconButton>
        </div>
    );

    if (isCollapsed) {
        return (
            <nav aria-label="채팅 목록" className="w-14 shrink-0 flex flex-col min-h-0 bg-slate-950/40 border-r border-slate-800">
                <div className="flex justify-center pt-2 pb-1 shrink-0">
                    <button
                        type="button"
                        onClick={onSelectPublic}
                        aria-current={publicOn ? 'true' : undefined}
                        aria-label={`퍼블릭${publicOn ? '' : unreadLabel(publicUnread)}`}
                        title="퍼블릭"
                        className={`relative w-10 h-10 flex items-center justify-center rounded-lg text-base font-medium transition-colors ${publicOn ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'}`}
                    >
                        #
                        {!publicOn && <CountBadge count={publicUnread} size="sm" className="absolute -top-0.5 -right-0.5" />}
                    </button>
                </div>

                <div className="mx-3 my-1 border-t border-slate-800 shrink-0" />

                <div className="flex justify-center pb-1 shrink-0">
                    <IconButton
                        label="새 대화"
                        size="lg"
                        tone="subtle"
                        onClick={onNew}
                        aria-pressed={activeId === 'new'}
                        className={activeId === 'new' ? 'bg-slate-700 text-white' : ''}
                    >
                        <Plus size={16} />
                    </IconButton>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center gap-0.5 pb-2">
                    {conversations.map(c => {
                        const on = activeId === c.conv_key;
                        const unread = on ? 0 : c.unread;
                        return (
                            <button
                                key={c.conv_key}
                                type="button"
                                onClick={() => onSelectConversation(c)}
                                aria-current={on ? 'true' : undefined}
                                aria-label={`${c.peer_name}${unreadLabel(unread)}`}
                                title={c.peer_name}
                                className={`relative w-10 h-10 shrink-0 flex items-center justify-center rounded-lg transition-colors ${on ? 'bg-slate-800' : 'hover:bg-slate-800/60'}`}
                            >
                                <ChatAvatar teamId={c.peer_team_id} teamName={c.peer_team_name} online={onlineUserIds.has(c.peer_id)} size="sm" />
                                <CountBadge count={unread} size="sm" className="absolute -top-0.5 -right-0.5" />
                            </button>
                        );
                    })}
                </div>

                {toggleButton}
            </nav>
        );
    }

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

            {toggleButton}
        </nav>
    );
};

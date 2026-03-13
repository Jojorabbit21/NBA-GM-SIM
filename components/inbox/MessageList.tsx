import React, { useRef, useCallback, useEffect } from 'react';
import { Mail, RefreshCw, CheckCircle2 } from 'lucide-react';
import { MessageListItem, MessageFilterCategory, MESSAGE_FILTER_LABELS } from '../../types';

const FILTER_CATEGORIES: MessageFilterCategory[] = ['ALL', 'GAME', 'TRANSACTION', 'LEAGUE', 'SYSTEM'];

interface MessageListProps {
    messages: MessageListItem[];
    selectedMessageId: string | null;
    loading: boolean;
    totalCount: number;
    filterCategory: MessageFilterCategory;
    onFilterChange: (category: MessageFilterCategory) => void;
    onSelectMessage: (msg: MessageListItem) => void;
    onMarkAllRead: () => void;
    onRefresh: () => void;
    onLoadMore: () => void;
}

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    selectedMessageId,
    loading,
    totalCount,
    filterCategory,
    onFilterChange,
    onSelectMessage,
    onMarkAllRead,
    onRefresh,
    onLoadMore,
}) => {
    const hasMore = messages.length > 0 && messages.length < totalCount;
    const sentinelRef = useRef<HTMLDivElement>(null);

    const handleIntersect = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            if (entries[0].isIntersecting && hasMore && !loading) {
                onLoadMore();
            }
        },
        [hasMore, loading, onLoadMore]
    );

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(handleIntersect, { threshold: 0.1 });
        observer.observe(el);
        return () => observer.disconnect();
    }, [handleIntersect]);

    return (
        <div className="w-[280px] flex flex-col border-r border-slate-800 bg-slate-950/30 flex-shrink-0">
            {/* Header with title & actions */}
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Mail size={16} className="text-slate-500" />
                    <span className="text-xs font-black text-slate-300 uppercase tracking-widest">받은 메세지</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={onMarkAllRead}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                        title="모두 읽음 처리"
                    >
                        <CheckCircle2 size={14} />
                    </button>
                    <button
                        onClick={onRefresh}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                        title="새로고침"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>
            {/* Filter Tabs + Count */}
            <div className="px-3 py-2 border-b border-slate-800/50 flex items-center gap-1.5 flex-wrap">
                {FILTER_CATEGORIES.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => onFilterChange(cat)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                            filterCategory === cat
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-800/50 text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        {MESSAGE_FILTER_LABELS[cat]}
                    </button>
                ))}
                <span className="text-[10px] font-bold text-slate-600 ml-auto">{totalCount}</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {messages.map((msg) => (
                    <div
                       key={msg.id}
                       onClick={() => onSelectMessage(msg)}
                       className={`
                           relative px-4 py-2 cursor-pointer transition-all border-b border-slate-800/50 group
                           ${selectedMessageId === msg.id ? 'bg-indigo-900/20 border-l-2 border-l-indigo-500' : 'hover:bg-slate-900'}
                       `}
                    >
                        <div className="flex justify-between items-start gap-2">
                            <h4 className={`font-bold text-sm leading-snug line-clamp-2 ${msg.is_read ? 'text-slate-500' : 'text-slate-200'}`}>
                                {msg.title}
                            </h4>
                            {!msg.is_read && (
                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0 mt-1.5" />
                            )}
                        </div>
                    </div>
                ))}

                {/* Infinite scroll sentinel */}
                {hasMore && (
                    <div ref={sentinelRef} className="py-4 flex justify-center">
                        {loading && (
                            <span className="text-xs font-bold text-slate-500">로딩 중...</span>
                        )}
                    </div>
                )}

                {messages.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-600 space-y-4">
                        <Mail size={32} className="opacity-20" />
                        <p className="text-xs font-bold">메세지함이 비어있습니다.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

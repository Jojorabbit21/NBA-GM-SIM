import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, CheckCircle2, Filter, Check } from 'lucide-react';
import { MessageListItem, MessageFilterCategory, MESSAGE_FILTER_CATEGORIES, MESSAGE_FILTER_LABELS } from '../../types';

interface MessageListProps {
    messages: MessageListItem[];
    selectedMessageId: string | null;
    loading: boolean;
    totalCount: number;
    activeFilters: Set<MessageFilterCategory>;
    onToggleFilter: (category: MessageFilterCategory) => void;
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
    activeFilters,
    onToggleFilter,
    onSelectMessage,
    onMarkAllRead,
    onRefresh,
    onLoadMore,
}) => {
    const hasMore = messages.length > 0 && messages.length < totalCount;
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

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

    // Close dropdown on outside click
    useEffect(() => {
        if (!dropdownOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [dropdownOpen]);

    const allActive = activeFilters.size === MESSAGE_FILTER_CATEGORIES.length;
    const filterCount = allActive ? 0 : activeFilters.size;

    return (
        <div className="w-[280px] flex flex-col border-r border-slate-800 bg-slate-950/30 flex-shrink-0">
            {/* Header with title & actions */}
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Mail size={16} className="text-slate-500" />
                    <span className="text-xs font-black text-slate-300 uppercase tracking-widest">받은 메세지</span>
                </div>
                <div className="flex items-center gap-1.5">
                    {/* Filter dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setDropdownOpen(v => !v)}
                            className={`p-1.5 rounded-lg transition-colors relative ${
                                dropdownOpen || filterCount > 0
                                    ? 'bg-indigo-600/20 text-indigo-400'
                                    : 'hover:bg-slate-800 text-slate-500 hover:text-slate-300'
                            }`}
                            title="필터"
                        >
                            <Filter size={14} />
                            {filterCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-indigo-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center">
                                    {filterCount}
                                </span>
                            )}
                        </button>
                        {dropdownOpen && (
                            <div className="absolute top-full right-0 mt-1 w-40 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                                {MESSAGE_FILTER_CATEGORIES.map((cat) => {
                                    const checked = activeFilters.has(cat);
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => onToggleFilter(cat)}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800 transition-colors"
                                        >
                                            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${
                                                checked ? 'bg-indigo-500' : 'border border-slate-600'
                                            }`}>
                                                {checked && <Check size={10} className="text-white" strokeWidth={3} />}
                                            </div>
                                            <span className={`text-[11px] font-bold ${checked ? 'text-slate-200' : 'text-slate-500'}`}>
                                                {MESSAGE_FILTER_LABELS[cat]}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
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
            {/* Count */}
            <div className="px-4 py-2 border-b border-slate-800/50">
                <span className="text-[10px] font-bold text-slate-600">총 {totalCount}개</span>
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

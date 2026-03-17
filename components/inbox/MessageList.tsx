import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, CheckCircle2, Filter, Check, Search, Trash2, Square, CheckSquare } from 'lucide-react';
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
    onDeleteMessages: (ids: string[]) => Promise<void>;
    onClearAll: () => Promise<void>;
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
    onDeleteMessages,
    onClearAll,
}) => {
    const hasMore = messages.length > 0 && messages.length < totalCount;
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 선택 모드
    const [selectMode, setSelectMode] = useState(false);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

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

    const term = searchTerm.trim().toLowerCase();
    const filteredMessages = term
        ? messages.filter(m => m.title.toLowerCase().includes(term))
        : messages;

    const allChecked = filteredMessages.length > 0 && filteredMessages.every(m => checkedIds.has(m.id));

    const handleToggleCheck = (id: string) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleToggleAll = () => {
        if (allChecked) {
            setCheckedIds(new Set());
        } else {
            setCheckedIds(new Set(filteredMessages.map(m => m.id)));
        }
    };

    const handleCancelSelect = () => {
        setSelectMode(false);
        setCheckedIds(new Set());
    };

    const handleDelete = async () => {
        if (checkedIds.size === 0) return;
        setIsDeleting(true);
        await onDeleteMessages(Array.from(checkedIds));
        setCheckedIds(new Set());
        setSelectMode(false);
        setIsDeleting(false);
    };

    const handleClearAll = async () => {
        setDropdownOpen(false);
        await onClearAll();
    };

    return (
        <div className="w-[280px] flex flex-col border-r border-slate-800 bg-slate-950/30 flex-shrink-0">
            {/* 1행: 검색 인풋 */}
            <div className="px-3 py-2.5 border-b border-slate-800 bg-slate-950">
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/60 rounded-lg px-2.5 py-1.5">
                    <Search size={12} className="text-slate-500 flex-shrink-0" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="메세지 검색..."
                        className="flex-1 bg-transparent text-xs text-slate-300 placeholder-slate-600 outline-none min-w-0"
                    />
                </div>
            </div>

            {/* 2행: 일반 모드 vs 선택 모드 */}
            {selectMode ? (
                /* 선택 모드 툴바 */
                <div className="px-3 py-1.5 border-b border-slate-800/50 flex items-center gap-1">
                    <button
                        onClick={handleDelete}
                        disabled={checkedIds.size === 0 || isDeleting}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Trash2 size={11} />
                        삭제{checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}
                    </button>
                    <button
                        onClick={handleToggleAll}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                    >
                        {allChecked
                            ? <CheckSquare size={11} className="text-indigo-400" />
                            : <Square size={11} />
                        }
                        전체 선택
                    </button>
                    <button
                        onClick={handleCancelSelect}
                        className="ml-auto px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
                    >
                        취소
                    </button>
                </div>
            ) : (
                /* 일반 모드 툴바 */
                <div className="px-3 py-1.5 border-b border-slate-800/50 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">총 {totalCount}개</span>
                    <div className="flex items-center gap-0.5">
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
                                <Filter size={13} />
                                {filterCount > 0 && (
                                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-indigo-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center">
                                        {filterCount}
                                    </span>
                                )}
                            </button>
                            {dropdownOpen && (
                                <div className="absolute top-full right-0 mt-1 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
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
                        {/* 선택 후 삭제 */}
                        <button
                            onClick={() => setSelectMode(true)}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                            title="선택 후 삭제"
                        >
                            <CheckSquare size={13} />
                        </button>
                        {/* 비우기 */}
                        <button
                            onClick={handleClearAll}
                            className="p-1.5 hover:bg-red-900/30 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                            title="비우기"
                        >
                            <Trash2 size={13} />
                        </button>
                        <button
                            onClick={onMarkAllRead}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                            title="모두 읽음 처리"
                        >
                            <CheckCircle2 size={13} />
                        </button>
                        <button
                            onClick={onRefresh}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                            title="새로고침"
                        >
                            <RefreshCw size={13} />
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {filteredMessages.map((msg) => (
                    <div
                       key={msg.id}
                       onClick={() => selectMode ? handleToggleCheck(msg.id) : onSelectMessage(msg)}
                       className={`
                           relative px-3 py-2 cursor-pointer transition-all border-b border-slate-800/50 group flex items-start gap-2
                           ${!selectMode && selectedMessageId === msg.id ? 'bg-indigo-900/20 border-l-2 border-l-indigo-500' : 'hover:bg-slate-900'}
                           ${selectMode && checkedIds.has(msg.id) ? 'bg-slate-800/50' : ''}
                       `}
                    >
                        {selectMode && (
                            <div className={`mt-1 w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border ${
                                checkedIds.has(msg.id) ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'
                            }`}>
                                {checkedIds.has(msg.id) && <Check size={9} className="text-white" strokeWidth={3} />}
                            </div>
                        )}
                        <div className="flex-1 flex justify-between items-start gap-2 min-w-0">
                            <h4 className={`font-bold text-sm leading-snug line-clamp-2 ${msg.is_read ? 'text-slate-500' : 'text-slate-200'}`}>
                                {msg.title}
                            </h4>
                            {!msg.is_read && !selectMode && (
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

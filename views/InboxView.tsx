
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { MessageListItem, Team, Player, MessageFilterCategory, MESSAGE_FILTER_MAP, MESSAGE_FILTER_CATEGORIES, MessageType } from '../types';
import { fetchMessageList, fetchMessageContent, fetchTotalMessageCount, markMessageAsRead, markAllMessagesAsRead, patchMessageContent, deleteMessages, clearAllMessages } from '../services/messageService';
import { MessageList } from '../components/inbox/MessageList';
import { MessageContentRenderer } from '../components/inbox/MessageContentRenderer';

interface InboxViewProps {
  myTeamId: string;
  userId: string;
  teams: Team[];
  onUpdateUnreadCount: () => void | Promise<void>;
  tendencySeed?: string;
  onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
  onViewGameResult: (result: any) => void;
  onNavigateToHof: () => void;
  currentSimDate?: string;
  seasonShort?: string;
  onTeamOptionExecuted?: (playerId: string, exercised: boolean) => void;
  onNavigateToDraft?: () => void;
  onNavigateToDraftLottery?: () => void;
}

export const InboxView: React.FC<InboxViewProps> = ({ myTeamId, userId, teams, onUpdateUnreadCount, onViewPlayer, onViewGameResult, onNavigateToHof, currentSimDate, seasonShort = '2025-26', onTeamOptionExecuted, onNavigateToDraft, onNavigateToDraftLottery }) => {
  const [messages, setMessages] = useState<MessageListItem[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<MessageListItem | null>(null);
  const [selectedContent, setSelectedContent] = useState<any>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [activeFilters, setActiveFilters] = useState<Set<MessageFilterCategory>>(() => new Set(MESSAGE_FILTER_CATEGORIES));
  const contentCache = useRef<Map<string, any>>(new Map());
  const silentRefreshRef = useRef(false);

  const handleTeamOptionDecide = useCallback(async (playerId: string, exercised: boolean) => {
      if (!selectedMessage || !selectedContent?.pendingTeamOptions) return;

      // content의 pendingTeamOptions에서 해당 선수 decision 업데이트
      const updatedOptions = selectedContent.pendingTeamOptions.map((opt: any) =>
          opt.playerId === playerId
              ? { ...opt, decision: exercised ? 'exercised' : 'declined' }
              : opt
      );
      const newContent = { ...selectedContent, pendingTeamOptions: updatedOptions };

      // 낙관적 업데이트: UI 먼저 반영
      contentCache.current.set(selectedMessage.id, newContent);
      setSelectedContent(newContent);
      onTeamOptionExecuted?.(playerId, exercised);

      // DB 저장 (백그라운드)
      patchMessageContent(selectedMessage.id, newContent)
          .catch(e => console.warn('⚠️ Team option decision save failed:', e));
  }, [selectedMessage, selectedContent, onTeamOptionExecuted]);

  const handleSelectMessage = useCallback(async (msg: MessageListItem) => {
      setSelectedMessage(msg);
      setSelectedContent(null);

      // Check cache first
      const cached = contentCache.current.get(msg.id);
      if (cached !== undefined) {
          setSelectedContent(cached);
      } else {
          setIsLoadingContent(true);
          const content = await fetchMessageContent(msg.id);
          contentCache.current.set(msg.id, content);
          setSelectedContent(content);
          setIsLoadingContent(false);
      }

      if (!msg.is_read) {
          await markMessageAsRead(msg.id);
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
          await onUpdateUnreadCount();
      }
  }, [onUpdateUnreadCount]);

  const loadMessages = useCallback(async () => {
    const silent = silentRefreshRef.current;
    silentRefreshRef.current = false;
    if (!silent) setLoading(true);
    const allActive = activeFilters.size === MESSAGE_FILTER_CATEGORIES.length;
    const typeFilter: MessageType[] | undefined = allActive
        ? undefined
        : Array.from(activeFilters).flatMap(cat => MESSAGE_FILTER_MAP[cat]);
    const [data, count] = await Promise.all([
      fetchMessageList(userId, myTeamId, page, 20, typeFilter),
      page === 0 ? fetchTotalMessageCount(userId, myTeamId, typeFilter) : Promise.resolve(totalCount),
    ]);

    if (page === 0) setTotalCount(count);
    const newMessages = page === 0 ? data : [...messages, ...data];
    setMessages(newMessages);

    // Auto-select the first message (Latest) if none selected
    if (page === 0 && data.length > 0 && !selectedMessage) {
        handleSelectMessage(data[0]);
    }

    setLoading(false);
  }, [userId, myTeamId, page, activeFilters, handleSelectMessage]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // 시뮬레이션 날짜 변경 시 (배치 시뮬 완료 등) 메시지 목록 새로고침
  // selectedMessage는 유지 — 초기화하면 깜빡임 발생
  // page > 0 이면 setPage(0)만 → loadMessages 재생성 → useEffect([loadMessages]) 가 단 1회 호출
  // page == 0 이면 직접 호출 (setPage(0) no-op 이라 useEffect 체인 안 탐)
  const prevSimDateRef = useRef(currentSimDate);
  useEffect(() => {
    if (currentSimDate && currentSimDate !== prevSimDateRef.current) {
      prevSimDateRef.current = currentSimDate;
      contentCache.current.clear();
      silentRefreshRef.current = true;
      if (page !== 0) {
        setPage(0);
      } else {
        loadMessages();
      }
    }
  }, [currentSimDate, loadMessages, page]);

  const handleMarkAllRead = async () => {
      await markAllMessagesAsRead(userId, myTeamId);
      setMessages(prev => prev.map(m => ({ ...m, is_read: true })));
      await onUpdateUnreadCount();
  };

  const handleDeleteMessages = async (ids: string[]) => {
      await deleteMessages(ids);
      setMessages(prev => prev.filter(m => !ids.includes(m.id)));
      setTotalCount(prev => Math.max(0, prev - ids.length));
      if (selectedMessage && ids.includes(selectedMessage.id)) {
          setSelectedMessage(null);
          setSelectedContent(null);
      }
      await onUpdateUnreadCount();
  };

  const handleClearAll = async () => {
      await clearAllMessages(userId, myTeamId);
      setMessages([]);
      setTotalCount(0);
      setSelectedMessage(null);
      setSelectedContent(null);
      await onUpdateUnreadCount();
  };

  const handlePlayerClick = (playerId: string) => {
      for (const t of teams) {
          const p = t.roster.find(rp => rp.id === playerId);
          if (p) {
              onViewPlayer(p, t.id, t.name);
              return;
          }
      }
  };

  const getDisplayDate = (msg: MessageListItem, content: any) => {
      if (msg.type === 'GAME_RECAP' && msg.date === 'PLAYOFF') {
          const dateMatch = msg.title.match(/\d{4}-\d{2}-\d{2}/);
          if (dateMatch) return dateMatch[0];
          if (content && content.gameId) {
             const parts = content.gameId.split('_');
             if (parts.length > 1 && parts[1].match(/^\d{4}-\d{2}-\d{2}$/)) {
                 return parts[1];
             }
          }
      }
      return msg.date;
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 ko-normal overflow-hidden">
       {/* Player detail is now handled via onViewPlayer → AppRouter */}

      {/* Main Layout: Left Sidebar + Right Body */}
      <div className="flex-1 flex gap-0 min-h-0 overflow-hidden">

          {/* Left: Message List */}
          <MessageList
              messages={messages}
              selectedMessageId={selectedMessage?.id ?? null}
              loading={loading}
              totalCount={totalCount}
              activeFilters={activeFilters}
              onToggleFilter={(cat) => {
                  setActiveFilters(prev => {
                      const next = new Set(prev);
                      if (next.has(cat)) {
                          if (next.size > 1) next.delete(cat);
                      } else {
                          next.add(cat);
                      }
                      return next;
                  });
                  setPage(0);
                  setMessages([]);
              }}
              onSelectMessage={handleSelectMessage}
              onMarkAllRead={handleMarkAllRead}
              onRefresh={() => { setPage(0); setSelectedMessage(null); setSelectedContent(null); contentCache.current.clear(); loadMessages(); }}
              onLoadMore={() => { setPage(p => p + 1); }}
              onDeleteMessages={handleDeleteMessages}
              onClearAll={handleClearAll}
          />

          {/* Right: Message Detail */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 relative">
               {selectedMessage ? (
                   <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
                       {/* Message Header */}
                       <div className="flex justify-between items-start border-b border-slate-800 pb-6 mb-8">
                           <h1 className="text-2xl font-black text-white leading-tight flex-1 mr-8">{selectedMessage.title}</h1>
                           <div className="flex flex-col items-end">
                               <span className="text-sm font-bold text-slate-400">{getDisplayDate(selectedMessage, selectedContent)}</span>
                           </div>
                       </div>

                       <div className="prose prose-invert max-w-none">
                           {isLoadingContent ? (
                               <div className="flex items-center justify-center py-20">
                                   <Loader2 className="animate-spin text-slate-500" size={24} />
                               </div>
                           ) : selectedContent ? (
                               <MessageContentRenderer
                                    type={selectedMessage.type}
                                    content={selectedContent}
                                    teams={teams}
                                    myTeamId={myTeamId}
                                    onPlayerClick={handlePlayerClick}
                                    onViewGameResult={onViewGameResult}
                                    userId={userId}
                                    onNavigateToHof={onNavigateToHof}
                                    seasonShort={seasonShort}
                                    onTeamOptionDecide={handleTeamOptionDecide}
                                    onNavigateToDraft={onNavigateToDraft}
                                    onNavigateToDraftLottery={onNavigateToDraftLottery}
                                />
                           ) : (
                               <div className="text-slate-600 text-sm">내용을 불러올 수 없습니다.</div>
                           )}
                       </div>
                   </div>
               ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-slate-600 space-y-6">
                       <p className="font-bold text-sm text-slate-600">선택된 메세지가 없습니다.</p>
                   </div>
               )}
          </div>
      </div>
    </div>
  );
};

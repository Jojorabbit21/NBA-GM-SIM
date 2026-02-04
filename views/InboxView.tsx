
import React, { useState, useEffect, useCallback } from 'react';
import { Mail, RefreshCw, CheckCircle2, ArrowRightLeft, ShieldAlert } from 'lucide-react';
import { Message, MessageType, GameRecapContent, TradeAlertContent, InjuryReportContent, Team, Player } from '../types';
import { fetchMessages, markMessageAsRead, markAllMessagesAsRead } from '../services/messageService';
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { getOvrBadgeStyle } from '../components/SharedComponents';
import { PlayerDetailModal } from '../components/PlayerDetailModal';

interface InboxViewProps {
  myTeamId: string;
  userId: string;
  teams: Team[];
  onUpdateUnreadCount: () => void;
}

export const InboxView: React.FC<InboxViewProps> = ({ myTeamId, userId, teams, onUpdateUnreadCount }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    // Always sorting by date desc, created_at desc from DB
    const data = await fetchMessages(userId, myTeamId, page);
    
    const newMessages = page === 0 ? data : [...messages, ...data];
    setMessages(newMessages);
    
    // Auto-select the first message (Latest) if none selected
    if (page === 0 && data.length > 0 && !selectedMessage) {
        handleSelectMessage(data[0]);
    }
    
    setLoading(false);
  }, [userId, myTeamId, page]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSelectMessage = async (msg: Message) => {
      setSelectedMessage(msg);
      if (!msg.is_read) {
          await markMessageAsRead(msg.id);
          // Optimistic update
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
          onUpdateUnreadCount();
      }
  };

  const handleMarkAllRead = async () => {
      await markAllMessagesAsRead(userId, myTeamId);
      setMessages(prev => prev.map(m => ({ ...m, is_read: true })));
      onUpdateUnreadCount();
  };
  
  const handlePlayerClick = (playerId: string) => {
      for (const t of teams) {
          const p = t.roster.find(rp => rp.id === playerId);
          if (p) {
              setViewPlayer(p);
              return;
          }
      }
  };
  
  const getPlayerTeam = (p: Player) => teams.find(t => t.roster.some(rp => rp.id === p.id));
  const playerTeam = viewPlayer ? getPlayerTeam(viewPlayer) : null;
  
  const getDisplayDate = (msg: Message) => {
      if (msg.type === 'GAME_RECAP' && msg.date === 'PLAYOFF') {
          // Attempt to fallback to date from title or content
          const dateMatch = msg.title.match(/\d{4}-\d{2}-\d{2}/);
          if (dateMatch) return dateMatch[0];
          // Or extract from gameId inside content if available
          const content = msg.content as GameRecapContent;
          if (content && content.gameId) {
             const parts = content.gameId.split('_');
             // Typical gameId: g_YYYY-MM-DD
             // Sometimes: po_series_id_gNum -> might not have date easily
             if (parts.length > 1 && parts[1].match(/^\d{4}-\d{2}-\d{2}$/)) {
                 return parts[1];
             }
          }
      }
      return msg.date;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-4">
       {viewPlayer && <PlayerDetailModal player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} teamName={playerTeam?.name} teamId={playerTeam?.id} onClose={() => setViewPlayer(null)} />}
       
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-800 pb-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-black ko-tight text-slate-100 uppercase tracking-tight">받은 메세지함</h2>
        </div>
        <div className="flex gap-3">
             <button 
                onClick={handleMarkAllRead}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg text-xs font-bold text-slate-300 transition-all active:scale-95"
             >
                 <CheckCircle2 size={14} /> 모두 읽음 처리
             </button>
             <button 
                onClick={() => { setPage(0); setSelectedMessage(null); loadMessages(); }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all active:scale-95 shadow-lg shadow-indigo-900/30"
             >
                 <RefreshCw size={14} /> 새로고침
             </button>
        </div>
      </div>

      {/* Main Layout: 250px Left Sidebar, Rest Body */}
      <div className="flex-1 flex gap-0 min-h-0 overflow-hidden bg-slate-900/40 border border-slate-800 rounded-3xl shadow-2xl">
          
          {/* Left: Message List */}
          <div className="w-[280px] flex flex-col border-r border-slate-800/50 bg-slate-950/30 flex-shrink-0">
               {/* Total Count Header */}
               <div className="p-4 border-b border-slate-800/50 bg-slate-950/50">
                   <span className="text-xs font-bold text-slate-500">총 {messages.length}개의 메세지</span>
               </div>

               <div className="flex-1 overflow-y-auto custom-scrollbar">
                   {messages.map((msg) => (
                       <div 
                          key={msg.id}
                          onClick={() => handleSelectMessage(msg)}
                          className={`
                              relative p-4 cursor-pointer transition-all border-b border-slate-800/50 group
                              ${selectedMessage?.id === msg.id ? 'bg-indigo-900/20 border-l-2 border-l-indigo-500' : 'hover:bg-slate-900'}
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
                   
                   {messages.length > 0 && messages.length % 20 === 0 && (
                       <button 
                           onClick={() => { setPage(p => p + 1); }}
                           className="w-full py-4 text-xs font-bold text-slate-500 hover:text-indigo-400 transition-colors border-t border-slate-800"
                       >
                           {loading ? '로딩 중...' : '더 보기'}
                       </button>
                   )}
                   
                   {messages.length === 0 && !loading && (
                       <div className="flex flex-col items-center justify-center py-20 text-slate-600 space-y-4">
                           <Mail size={32} className="opacity-20" />
                           <p className="text-xs font-bold">메세지함이 비어있습니다.</p>
                       </div>
                   )}
               </div>
          </div>

          {/* Right: Message Detail */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-900/60 relative">
               {selectedMessage ? (
                   <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
                       {/* Message Header */}
                       <div className="flex justify-between items-start border-b border-slate-800 pb-6 mb-8">
                           <h1 className="text-2xl font-black text-white leading-tight flex-1 mr-8">{selectedMessage.title}</h1>
                           <div className="flex flex-col items-end">
                               <span className="text-sm font-bold text-slate-400">{getDisplayDate(selectedMessage)}</span>
                           </div>
                       </div>
                       
                       <div className="prose prose-invert max-w-none">
                           <MessageContentRenderer 
                                type={selectedMessage.type} 
                                content={selectedMessage.content} 
                                teams={teams} 
                                onPlayerClick={handlePlayerClick} 
                            />
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

// --- Sub-Component: Content Renderer ---

const MessageContentRenderer: React.FC<{ type: MessageType, content: any, teams: Team[], onPlayerClick: (id: string) => void }> = ({ type, content, teams, onPlayerClick }) => {
    // Shared Helper for OVR
    const getSnapshot = (id: string, savedOvr?: number, savedPos?: string) => {
        for (const t of teams) {
            const p = t.roster.find(rp => rp.id === id);
            if (p) return { ovr: calculatePlayerOvr(p), pos: p.position };
        }
        if (savedOvr !== undefined && savedPos) return { ovr: savedOvr, pos: savedPos };
        return { ovr: 0, pos: '-' };
    };

    switch (type) {
        case 'GAME_RECAP':
            const gameData = content as GameRecapContent;
            const homeTeam = teams.find(t => t.id === gameData.homeTeamId);
            const awayTeam = teams.find(t => t.id === gameData.awayTeamId);
            
            return (
                <div className="space-y-10 max-w-5xl mx-auto">
                    {/* 1. Centered Scoreboard */}
                    <div className="flex items-center justify-center gap-12 py-4">
                        <div className="flex items-center gap-4">
                            <span className="text-2xl font-black text-white uppercase oswald tracking-tight">{homeTeam?.name}</span>
                            <img src={homeTeam?.logo} className="w-16 h-16 object-contain drop-shadow-md" alt="" />
                        </div>
                        
                        <div className="flex items-center gap-6">
                             <span className={`text-5xl font-black ${gameData.homeScore > gameData.awayScore ? 'text-white' : 'text-slate-500'} oswald`}>{gameData.homeScore}</span>
                             <span className="text-slate-600 font-bold text-2xl">-</span>
                             <span className={`text-5xl font-black ${gameData.awayScore > gameData.homeScore ? 'text-white' : 'text-slate-500'} oswald`}>{gameData.awayScore}</span>
                        </div>

                        <div className="flex items-center gap-4">
                            <img src={awayTeam?.logo} className="w-16 h-16 object-contain drop-shadow-md" alt="" />
                            <span className="text-2xl font-black text-white uppercase oswald tracking-tight">{awayTeam?.name}</span>
                        </div>
                    </div>
                    
                    {/* 2. Full Box Score */}
                    {gameData.userBoxScore && (
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-slate-400 px-2">Team Box Score</h4>
                            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-slate-950 text-xs text-slate-500 font-bold border-b border-slate-800">
                                            <tr>
                                                <th className="p-3 w-40 pl-6">Player</th>
                                                <th className="p-3 text-center">POS</th>
                                                <th className="p-3 text-right">MIN</th>
                                                <th className="p-3 text-right">PTS</th>
                                                <th className="p-3 text-right">REB</th>
                                                <th className="p-3 text-right">AST</th>
                                                <th className="p-3 text-right">STL</th>
                                                <th className="p-3 text-right">BLK</th>
                                                <th className="p-3 text-right">TOV</th>
                                                <th className="p-3 text-right">FG</th>
                                                <th className="p-3 text-right">3P</th>
                                                <th className="p-3 text-right">FT</th>
                                                <th className="p-3 text-right pr-6">+/-</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {[...gameData.userBoxScore]
                                                .sort((a, b) => b.mp - a.mp) // Sort by Minutes Played Descending
                                                .map(p => (
                                                <tr key={p.playerId} className="hover:bg-white/5 transition-colors cursor-pointer group" onClick={() => onPlayerClick(p.playerId)}>
                                                    <td className="p-3 pl-6 font-medium text-slate-300 pretendard group-hover:text-white transition-colors">{p.playerName}</td>
                                                    <td className="p-3 text-center font-medium text-slate-300 pretendard">{teams.find(t => t.roster.some(r => r.id === p.playerId))?.roster.find(r => r.id === p.playerId)?.position || '-'}</td>
                                                    <td className="p-3 text-right font-medium text-slate-300 pretendard">{Math.round(p.mp)}</td>
                                                    <td className="p-3 text-right font-medium text-slate-300 pretendard">{p.pts}</td>
                                                    <td className="p-3 text-right font-medium text-slate-300 pretendard">{p.reb}</td>
                                                    <td className="p-3 text-right font-medium text-slate-300 pretendard">{p.ast}</td>
                                                    <td className="p-3 text-right font-medium text-slate-300 pretendard">{p.stl}</td>
                                                    <td className="p-3 text-right font-medium text-slate-300 pretendard">{p.blk}</td>
                                                    <td className="p-3 text-right font-medium text-slate-300 pretendard">{p.tov}</td>
                                                    <td className="p-3 text-right font-medium text-slate-300 pretendard">{p.fgm}/{p.fga}</td>
                                                    <td className="p-3 text-right font-medium text-slate-300 pretendard">{p.p3m}/{p.p3a}</td>
                                                    <td className="p-3 text-right font-medium text-slate-300 pretendard">{p.ftm}/{p.fta}</td>
                                                    <td className={`p-3 text-right font-medium pretendard pr-6 ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                                                        {p.plusMinus > 0 ? '+' : ''}{p.plusMinus}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            );

        case 'TRADE_ALERT':
            const tradeData = content as TradeAlertContent;
            return (
                <div className="space-y-6">
                    {/* Using TradeHistoryTable Style */}
                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    <th className="py-4 px-6 w-60">참여 구단</th>
                                    <th className="py-4 px-4">IN Assets</th>
                                    <th className="py-4 px-4">OUT Assets</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {tradeData.trades.map((trade, idx) => (
                                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                                        <td className="py-4 px-6 align-top">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    <img src={getTeamLogoUrl(trade.team1Id)} className="w-6 h-6 object-contain" alt="" />
                                                    <span className="text-xs font-black uppercase text-white">{trade.team1Name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <ArrowRightLeft size={12} className="text-slate-600" />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <img src={getTeamLogoUrl(trade.team2Id)} className="w-6 h-6 object-contain" alt="" />
                                                    <span className="text-xs font-black uppercase text-white">{trade.team2Name}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 align-top">
                                            <div className="flex flex-col gap-2">
                                                {trade.team1Acquired.map((p, i) => {
                                                    const snap = getSnapshot(p.id, p.ovr);
                                                    return (
                                                        <div key={i} className="flex items-center gap-3 cursor-pointer hover:bg-slate-800 p-1 rounded" onClick={() => onPlayerClick(p.id)}>
                                                            <div className={`${getOvrBadgeStyle(snap.ovr || 70)} !w-6 !h-6 !text-xs !mx-0`}>{snap.ovr || '-'}</div>
                                                            <span className="text-sm font-bold text-emerald-300">{p.name}</span>
                                                            <span className="text-[9px] font-black text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">{snap.pos || '?'}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 align-top">
                                            <div className="flex flex-col gap-2">
                                                {trade.team2Acquired.map((p, i) => {
                                                    const snap = getSnapshot(p.id, p.ovr);
                                                    return (
                                                        <div key={i} className="flex items-center gap-3 cursor-pointer hover:bg-slate-800 p-1 rounded" onClick={() => onPlayerClick(p.id)}>
                                                            <div className={`${getOvrBadgeStyle(snap.ovr || 70)} !w-6 !h-6 !text-xs !mx-0 grayscale opacity-70`}>{snap.ovr || '-'}</div>
                                                            <span className="text-sm font-bold text-red-300/80">{p.name}</span>
                                                            <span className="text-[9px] font-black text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">{snap.pos || '?'}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            );

        case 'INJURY_REPORT':
            const injuryData = content as InjuryReportContent;
            const isMajor = injuryData.severity === 'Major';
            return (
                <div className={`p-8 rounded-3xl border relative overflow-hidden ${isMajor ? 'bg-red-950/20 border-red-500/30' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="flex items-start gap-6 relative z-10">
                         <div className={`p-4 rounded-2xl ${isMajor ? 'bg-red-500/20 text-red-500' : 'bg-slate-800 text-slate-400'}`}>
                             <ShieldAlert size={32} />
                         </div>
                         <div className="flex-1">
                             <h3 className="text-2xl font-black text-white cursor-pointer hover:underline decoration-red-500 underline-offset-4" onClick={() => onPlayerClick(injuryData.playerId)}>
                                 {injuryData.playerName}
                             </h3>
                             <div className="flex items-center gap-3 mt-2">
                                 <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${isMajor ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                     {isMajor ? 'MAJOR INJURY' : 'MINOR INJURY'}
                                 </span>
                                 <p className="text-sm font-bold text-slate-400">
                                     {injuryData.injuryType}
                                 </p>
                             </div>
                         </div>
                    </div>
                    
                    <div className="mt-8 pt-6 border-t border-white/5 grid grid-cols-2 gap-8 relative z-10">
                        <div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Estimated Absence</span>
                            <span className="text-lg font-black text-white">{injuryData.duration}</span>
                        </div>
                        <div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Return Date</span>
                            <span className="text-lg font-black text-white">{injuryData.returnDate}</span>
                        </div>
                    </div>
                </div>
            );

        default:
            return <div className="text-slate-400 text-sm">표시할 내용이 없습니다.</div>;
    }
};

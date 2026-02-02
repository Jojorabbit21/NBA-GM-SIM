
import React, { useState, useEffect, useCallback } from 'react';
import { Mail, RefreshCw, CheckCircle2, ChevronRight, Activity, ArrowLeftRight, ShieldAlert, Trophy, Calendar, FileText } from 'lucide-react';
import { Message, MessageType, GameRecapContent, TradeAlertContent, InjuryReportContent, Team, Player } from '../types';
import { fetchMessages, markMessageAsRead, markAllMessagesAsRead } from '../services/messageService';
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { getOvrBadgeStyle } from '../components/SharedComponents';
import { PlayerDetailModal } from '../components/SharedComponents';

interface InboxViewProps {
  myTeamId: string;
  userId: string;
  teams: Team[]; // For resolving team names/logos
  onUpdateUnreadCount: () => void;
}

const MESSAGE_ICONS: Record<MessageType, React.ReactNode> = {
    'GAME_RECAP': <Activity size={18} className="text-indigo-400" />,
    'TRADE_ALERT': <ArrowLeftRight size={18} className="text-purple-400" />,
    'INJURY_REPORT': <ShieldAlert size={18} className="text-red-400" />,
    'AWARD_NEWS': <Trophy size={18} className="text-yellow-400" />,
    'SEASON_SUMMARY': <Calendar size={18} className="text-emerald-400" />
};

export const InboxView: React.FC<InboxViewProps> = ({ myTeamId, userId, teams, onUpdateUnreadCount }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const data = await fetchMessages(userId, myTeamId, page);
    setMessages(prev => page === 0 ? data : [...prev, ...data]);
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
  
  // Helper to open player modal
  const handlePlayerClick = (playerId: string) => {
      // Find player in current teams
      for (const t of teams) {
          const p = t.roster.find(rp => rp.id === playerId);
          if (p) {
              setViewPlayer(p);
              return;
          }
      }
      // If not found (e.g. historical data or retired), handle gracefully or show toast
  };
  
  const getPlayerTeam = (p: Player) => teams.find(t => t.roster.some(rp => rp.id === p.id));
  const playerTeam = viewPlayer ? getPlayerTeam(viewPlayer) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-6">
       {viewPlayer && <PlayerDetailModal player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} teamName={playerTeam?.name} teamId={playerTeam?.id} onClose={() => setViewPlayer(null)} />}
       
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-800 pb-6 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-4xl lg:text-5xl font-black ko-tight text-slate-100 uppercase tracking-tight">받은 메세지함</h2>
          <div className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-800 text-xs font-bold text-slate-500">
             Total: {messages.length}
          </div>
        </div>
        <div className="flex gap-3">
             <button 
                onClick={handleMarkAllRead}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-300 transition-all active:scale-95"
             >
                 <CheckCircle2 size={16} /> 모두 읽음 처리
             </button>
             <button 
                onClick={() => { setPage(0); loadMessages(); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-indigo-900/30"
             >
                 <RefreshCw size={16} /> 새로고침
             </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-8 min-h-0 overflow-hidden bg-slate-900/40 border border-slate-800 rounded-[2.5rem] shadow-2xl">
          {/* Message List */}
          <div className="lg:col-span-5 flex flex-col border-r border-slate-800/50 bg-slate-950/30 overflow-hidden">
               <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                   {messages.map((msg) => (
                       <div 
                          key={msg.id}
                          onClick={() => handleSelectMessage(msg)}
                          className={`
                              relative p-4 rounded-2xl cursor-pointer transition-all border group
                              ${selectedMessage?.id === msg.id ? 'bg-indigo-600/10 border-indigo-500/50 shadow-md' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'}
                          `}
                       >
                           {/* Unread Dot */}
                           {!msg.is_read && (
                               <div className="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse" />
                           )}
                           
                           <div className="flex items-center gap-3 mb-2">
                               <div className={`p-2 rounded-lg ${selectedMessage?.id === msg.id ? 'bg-indigo-500/20' : 'bg-slate-950 border border-slate-800'}`}>
                                   {MESSAGE_ICONS[msg.type] || <FileText size={18} className="text-slate-500" />}
                               </div>
                               <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{msg.date}</span>
                           </div>
                           
                           <h4 className={`font-bold text-sm mb-1 leading-snug ${msg.is_read ? 'text-slate-400' : 'text-slate-100'}`}>
                               {msg.title}
                           </h4>
                           
                           <div className="flex justify-between items-center mt-2">
                               <span className="text-[10px] text-slate-600 font-medium">From: League Office</span>
                               <ChevronRight size={14} className={`transition-transform ${selectedMessage?.id === msg.id ? 'text-indigo-400 translate-x-1' : 'text-slate-700'}`} />
                           </div>
                       </div>
                   ))}
                   
                   {/* Load More Trigger (simplified) */}
                   {messages.length > 0 && messages.length % 20 === 0 && (
                       <button 
                           onClick={() => { setPage(p => p + 1); }}
                           className="w-full py-3 text-xs font-bold text-slate-500 hover:text-indigo-400 transition-colors"
                       >
                           {loading ? '로딩 중...' : '이전 메세지 더 보기'}
                       </button>
                   )}
                   
                   {messages.length === 0 && !loading && (
                       <div className="flex flex-col items-center justify-center py-20 text-slate-600 space-y-4">
                           <Mail size={48} className="opacity-20" />
                           <p className="text-sm font-bold">메세지함이 비어있습니다.</p>
                       </div>
                   )}
               </div>
          </div>

          {/* Message Detail */}
          <div className="lg:col-span-7 flex flex-col overflow-hidden bg-slate-900/60 relative">
               {selectedMessage ? (
                   <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                       <div className="border-b border-slate-800 pb-6 mb-6">
                           <div className="flex items-center gap-3 mb-4">
                               <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] font-black uppercase tracking-wider border border-indigo-500/30">
                                   {selectedMessage.type.replace('_', ' ')}
                               </span>
                               <span className="text-xs font-bold text-slate-500">{selectedMessage.date}</span>
                           </div>
                           <h1 className="text-2xl font-black text-white leading-tight mb-2">{selectedMessage.title}</h1>
                       </div>
                       
                       <div className="prose prose-invert max-w-none">
                           {/* Content Renderer based on Type */}
                           <MessageContentRenderer type={selectedMessage.type} content={selectedMessage.content} teams={teams} onPlayerClick={handlePlayerClick} />
                       </div>
                   </div>
               ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-slate-600 space-y-6">
                       <div className="p-10 bg-slate-900 rounded-full border border-slate-800 shadow-inner">
                           <FileText size={64} className="opacity-10" />
                       </div>
                       <p className="font-black text-lg text-slate-500 uppercase oswald tracking-widest">Select a Message</p>
                   </div>
               )}
          </div>
      </div>
    </div>
  );
};

// --- Sub-Component: Content Renderer ---

const MessageContentRenderer: React.FC<{ type: MessageType, content: any, teams: Team[], onPlayerClick: (id: string) => void }> = ({ type, content, teams, onPlayerClick }) => {
    switch (type) {
        case 'GAME_RECAP':
            const gameData = content as GameRecapContent;
            const homeTeam = teams.find(t => t.id === gameData.homeTeamId);
            const awayTeam = teams.find(t => t.id === gameData.awayTeamId);
            
            return (
                <div className="space-y-8">
                    {/* Scoreboard */}
                    <div className="flex items-center justify-between bg-slate-950 p-6 rounded-2xl border border-slate-800">
                        <div className="text-center">
                            <img src={homeTeam?.logo} className="w-16 h-16 mx-auto mb-2 object-contain" alt="" />
                            <h3 className="font-black text-2xl text-white">{gameData.homeScore}</h3>
                            <span className="text-xs font-bold text-slate-500">{homeTeam?.name}</span>
                        </div>
                        <div className="text-xl font-black text-slate-600">VS</div>
                        <div className="text-center">
                            <img src={awayTeam?.logo} className="w-16 h-16 mx-auto mb-2 object-contain" alt="" />
                            <h3 className="font-black text-2xl text-white">{gameData.awayScore}</h3>
                            <span className="text-xs font-bold text-slate-500">{awayTeam?.name}</span>
                        </div>
                    </div>
                    
                    {/* MVP */}
                    {gameData.mvp && (
                        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:bg-amber-500/20 transition-colors" onClick={() => onPlayerClick(gameData.mvp.playerId)}>
                             <div className="flex items-center gap-3">
                                 <Trophy size={20} className="text-amber-400" />
                                 <div>
                                     <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest block">Game MVP</span>
                                     <span className="font-bold text-amber-100">{gameData.mvp.name}</span>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <span className="text-sm font-mono font-black text-amber-200">{gameData.mvp.stats}</span>
                             </div>
                        </div>
                    )}
                    
                    {/* User Box Score */}
                    {gameData.userBoxScore && (
                        <div>
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pl-1">Team Stats Highlight</h4>
                            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-950 text-slate-500 text-[10px] uppercase font-black">
                                        <tr>
                                            <th className="p-3">Player</th>
                                            <th className="p-3 text-right">PTS</th>
                                            <th className="p-3 text-right">REB</th>
                                            <th className="p-3 text-right">AST</th>
                                            <th className="p-3 text-right">FG%</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {gameData.userBoxScore.slice(0, 5).map(p => (
                                            <tr key={p.playerId} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => onPlayerClick(p.playerId)}>
                                                <td className="p-3 font-bold text-slate-200">{p.playerName}</td>
                                                <td className="p-3 text-right font-mono text-white">{p.pts}</td>
                                                <td className="p-3 text-right font-mono text-slate-400">{p.reb}</td>
                                                <td className="p-3 text-right font-mono text-slate-400">{p.ast}</td>
                                                <td className="p-3 text-right font-mono text-slate-400">{p.fga > 0 ? ((p.fgm/p.fga)*100).toFixed(0)+'%' : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            );

        case 'TRADE_ALERT':
            const tradeData = content as TradeAlertContent;
            return (
                <div className="space-y-6">
                    <p className="text-slate-300 text-sm font-medium">{tradeData.summary}</p>
                    
                    {tradeData.trades.map((trade, idx) => (
                        <div key={idx} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                            <div className="flex items-center justify-between mb-4 border-b border-slate-800/50 pb-3">
                                <div className="flex items-center gap-2">
                                     <img src={getTeamLogoUrl(trade.team1Id)} className="w-6 h-6 object-contain" alt="" />
                                     <span className="font-black text-sm text-slate-200 uppercase">{trade.team1Name}</span>
                                </div>
                                <ArrowLeftRight size={16} className="text-slate-600" />
                                <div className="flex items-center gap-2">
                                     <span className="font-black text-sm text-slate-200 uppercase">{trade.team2Name}</span>
                                     <img src={getTeamLogoUrl(trade.team2Id)} className="w-6 h-6 object-contain" alt="" />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-[10px] font-bold text-emerald-500 uppercase mb-2 block">{trade.team1Name} Receives:</span>
                                    <div className="space-y-1">
                                        {trade.team1Acquired.map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-2 rounded bg-slate-950/50 hover:bg-slate-800 cursor-pointer transition-colors" onClick={() => onPlayerClick(p.id)}>
                                                <span className="text-xs font-bold text-white">{p.name}</span>
                                                <div className={getOvrBadgeStyle(p.ovr) + " !w-5 !h-5 !text-[10px] !mx-0"}>{p.ovr}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-emerald-500 uppercase mb-2 block">{trade.team2Name} Receives:</span>
                                    <div className="space-y-1">
                                        {trade.team2Acquired.map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-2 rounded bg-slate-950/50 hover:bg-slate-800 cursor-pointer transition-colors" onClick={() => onPlayerClick(p.id)}>
                                                <span className="text-xs font-bold text-white">{p.name}</span>
                                                <div className={getOvrBadgeStyle(p.ovr) + " !w-5 !h-5 !text-[10px] !mx-0"}>{p.ovr}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            );

        case 'INJURY_REPORT':
            const injuryData = content as InjuryReportContent;
            const isMajor = injuryData.severity === 'Major';
            return (
                <div className={`p-6 rounded-2xl border ${isMajor ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="flex items-center gap-4">
                         <div className={`p-3 rounded-full ${isMajor ? 'bg-red-500/20' : 'bg-slate-800'}`}>
                             <ShieldAlert size={24} className={isMajor ? 'text-red-500' : 'text-slate-400'} />
                         </div>
                         <div>
                             <h3 className="text-lg font-black text-white cursor-pointer hover:underline decoration-red-500 underline-offset-4" onClick={() => onPlayerClick(injuryData.playerId)}>
                                 {injuryData.playerName}
                             </h3>
                             <p className={`text-xs font-bold uppercase tracking-wide mt-1 ${isMajor ? 'text-red-400' : 'text-slate-500'}`}>
                                 {injuryData.injuryType}
                             </p>
                         </div>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Duration</span>
                            <span className="text-sm font-bold text-white">{injuryData.duration}</span>
                        </div>
                        <div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Expected Return</span>
                            <span className="text-sm font-bold text-white">{injuryData.returnDate}</span>
                        </div>
                    </div>
                </div>
            );

        default:
            return <div className="text-slate-400 text-sm">표시할 내용이 없습니다.</div>;
    }
};

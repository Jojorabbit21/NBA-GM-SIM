
import React, { useState, useEffect, useCallback } from 'react';
import { Mail, RefreshCw, CheckCircle2, ChevronRight, Activity, ArrowRightLeft, ShieldAlert, Trophy, Calendar, FileText, User } from 'lucide-react';
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
    'TRADE_ALERT': <ArrowRightLeft size={18} className="text-purple-400" />,
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
    
    // If it's the first load or refresh, overwrite. Otherwise append (pagination).
    const newMessages = page === 0 ? data : [...messages, ...data];
    setMessages(newMessages);
    
    // Auto-select first message if none selected and data exists
    if (page === 0 && data.length > 0 && !selectedMessage) {
        handleSelectMessage(data[0]);
    }
    
    setLoading(false);
  }, [userId, myTeamId, page]);

  // Initial Load
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
                onClick={() => { setPage(0); setSelectedMessage(null); loadMessages(); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-indigo-900/30"
             >
                 <RefreshCw size={16} /> 새로고침
             </button>
        </div>
      </div>

      {/* Main Layout: 2:8 Ratio using grid-cols-5 */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-0 lg:gap-8 min-h-0 overflow-hidden bg-slate-900/40 border border-slate-800 rounded-[2.5rem] shadow-2xl">
          
          {/* Message List (Left 20%) */}
          <div className="lg:col-span-1 flex flex-col border-r border-slate-800/50 bg-slate-950/30 overflow-hidden min-w-[250px]">
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
                           
                           <h4 className={`font-bold text-xs mb-1 leading-snug line-clamp-2 ${msg.is_read ? 'text-slate-400' : 'text-slate-100'}`}>
                               {msg.title}
                           </h4>
                           
                           <div className="flex justify-between items-center mt-2">
                               <span className="text-[10px] text-slate-600 font-medium">From: Office</span>
                               <ChevronRight size={14} className={`transition-transform ${selectedMessage?.id === msg.id ? 'text-indigo-400 translate-x-1' : 'text-slate-700'}`} />
                           </div>
                       </div>
                   ))}
                   
                   {/* Load More Trigger */}
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

          {/* Message Detail (Right 80%) */}
          <div className="lg:col-span-4 flex flex-col overflow-hidden bg-slate-900/60 relative">
               {selectedMessage ? (
                   <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                       <div className="border-b border-slate-800 pb-6 mb-8">
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
                <div className="space-y-8 max-w-4xl mx-auto">
                    {/* 1. Simplified Scoreboard Header */}
                    <div className="flex items-center justify-between bg-slate-950 px-8 py-5 rounded-full border border-slate-800 shadow-lg">
                        <div className="flex items-center gap-4">
                            <img src={homeTeam?.logo} className="w-10 h-10 object-contain drop-shadow-md" alt="" />
                            <span className="text-xl font-black text-white uppercase oswald tracking-tight">{homeTeam?.name}</span>
                        </div>
                        
                        <div className="flex items-center gap-4">
                             <span className={`text-3xl font-black ${gameData.homeScore > gameData.awayScore ? 'text-white' : 'text-slate-500'} oswald`}>{gameData.homeScore}</span>
                             <span className="text-slate-600 font-bold">-</span>
                             <span className={`text-3xl font-black ${gameData.awayScore > gameData.homeScore ? 'text-white' : 'text-slate-500'} oswald`}>{gameData.awayScore}</span>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-xl font-black text-white uppercase oswald tracking-tight">{awayTeam?.name}</span>
                            <img src={awayTeam?.logo} className="w-10 h-10 object-contain drop-shadow-md" alt="" />
                        </div>
                    </div>
                    
                    {/* 2. Simplified Game MVP */}
                    {gameData.mvp && (
                        <div className="bg-amber-500/5 border border-amber-500/20 px-6 py-3 rounded-xl flex items-center justify-between hover:bg-amber-500/10 transition-colors cursor-pointer" onClick={() => onPlayerClick(gameData.mvp.playerId)}>
                             <div className="flex items-center gap-4">
                                 <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
                                     <Trophy size={16} />
                                 </div>
                                 <span className="text-xs font-black text-amber-500 uppercase tracking-widest">GAME MVP</span>
                                 <div className="w-[1px] h-4 bg-amber-500/30"></div>
                                 <span className="text-sm font-bold text-amber-100">{gameData.mvp.name}</span>
                             </div>
                             <span className="text-sm font-mono font-bold text-amber-200">{gameData.mvp.stats}</span>
                        </div>
                    )}
                    
                    {/* 3. Full Box Score */}
                    {gameData.userBoxScore && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 px-2">
                                <Activity size={16} className="text-slate-500" />
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Team Box Score</h4>
                            </div>
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-slate-950/80 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
                                            <tr>
                                                <th className="p-4 w-40">Player</th>
                                                <th className="p-4 text-center">POS</th>
                                                <th className="p-4 text-right">MIN</th>
                                                <th className="p-4 text-right text-white">PTS</th>
                                                <th className="p-4 text-right">REB</th>
                                                <th className="p-4 text-right">AST</th>
                                                <th className="p-4 text-right">STL</th>
                                                <th className="p-4 text-right">BLK</th>
                                                <th className="p-4 text-right">TOV</th>
                                                <th className="p-4 text-right">FG%</th>
                                                <th className="p-4 text-right">3P%</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {gameData.userBoxScore.map(p => (
                                                <tr key={p.playerId} className="hover:bg-white/5 transition-colors cursor-pointer group" onClick={() => onPlayerClick(p.playerId)}>
                                                    <td className="p-4 font-bold text-slate-200 group-hover:text-indigo-400 group-hover:underline transition-colors">{p.playerName}</td>
                                                    <td className="p-4 text-center text-xs font-bold text-slate-500 bg-slate-950/30">{teams.find(t => t.roster.some(r => r.id === p.playerId))?.roster.find(r => r.id === p.playerId)?.position || '-'}</td>
                                                    <td className="p-4 text-right font-mono text-slate-400 text-xs">{p.mp}</td>
                                                    <td className="p-4 text-right font-mono font-bold text-white bg-slate-800/20">{p.pts}</td>
                                                    <td className="p-4 text-right font-mono text-slate-400 text-xs">{p.reb}</td>
                                                    <td className="p-4 text-right font-mono text-slate-400 text-xs">{p.ast}</td>
                                                    <td className="p-4 text-right font-mono text-slate-500 text-xs">{p.stl}</td>
                                                    <td className="p-4 text-right font-mono text-slate-500 text-xs">{p.blk}</td>
                                                    <td className="p-4 text-right font-mono text-slate-500 text-xs">{p.tov}</td>
                                                    <td className="p-4 text-right font-mono text-slate-400 text-xs">{p.fga > 0 ? ((p.fgm/p.fga)*100).toFixed(0)+'%' : '-'}</td>
                                                    <td className="p-4 text-right font-mono text-slate-400 text-xs">{p.p3a > 0 ? ((p.p3m/p.p3a)*100).toFixed(0)+'%' : '-'}</td>
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
                    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                        <p className="text-slate-300 text-sm font-medium leading-relaxed">{tradeData.summary}</p>
                    </div>
                    
                    {tradeData.trades.map((trade, idx) => (
                        <div key={idx} className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
                             {/* Background Effect */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-3xl rounded-full pointer-events-none"></div>

                            <div className="flex items-center justify-between mb-6 border-b border-slate-800/50 pb-4 relative z-10">
                                <div className="flex items-center gap-3">
                                     <img src={getTeamLogoUrl(trade.team1Id)} className="w-8 h-8 object-contain" alt="" />
                                     <span className="font-black text-base text-slate-200 uppercase oswald">{trade.team1Name}</span>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-slate-950 rounded-full border border-slate-800">
                                    <ArrowRightLeft size={14} className="text-purple-400" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Exchange</span>
                                </div>
                                <div className="flex items-center gap-3">
                                     <span className="font-black text-base text-slate-200 uppercase oswald">{trade.team2Name}</span>
                                     <img src={getTeamLogoUrl(trade.team2Id)} className="w-8 h-8 object-contain" alt="" />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-8 relative z-10">
                                <div>
                                    <span className="text-[10px] font-bold text-emerald-500 uppercase mb-3 block tracking-widest">{trade.team1Name} Receives:</span>
                                    <div className="space-y-2">
                                        {trade.team1Acquired.map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-950 hover:bg-slate-800 cursor-pointer transition-colors border border-slate-800 hover:border-slate-600" onClick={() => onPlayerClick(p.id)}>
                                                <div className="flex items-center gap-3">
                                                    <User size={14} className="text-slate-500" />
                                                    <span className="text-sm font-bold text-white">{p.name}</span>
                                                </div>
                                                <div className={getOvrBadgeStyle(p.ovr) + " !w-6 !h-6 !text-[10px] !mx-0"}>{p.ovr}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-emerald-500 uppercase mb-3 block tracking-widest">{trade.team2Name} Receives:</span>
                                    <div className="space-y-2">
                                        {trade.team2Acquired.map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-950 hover:bg-slate-800 cursor-pointer transition-colors border border-slate-800 hover:border-slate-600" onClick={() => onPlayerClick(p.id)}>
                                                <div className="flex items-center gap-3">
                                                    <User size={14} className="text-slate-500" />
                                                    <span className="text-sm font-bold text-white">{p.name}</span>
                                                </div>
                                                <div className={getOvrBadgeStyle(p.ovr) + " !w-6 !h-6 !text-[10px] !mx-0"}>{p.ovr}</div>
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
                <div className={`p-8 rounded-3xl border relative overflow-hidden ${isMajor ? 'bg-red-950/20 border-red-500/30' : 'bg-slate-900 border-slate-800'}`}>
                    {isMajor && <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 blur-[80px] rounded-full pointer-events-none"></div>}
                    
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


import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Mail, RefreshCw, CheckCircle2, ArrowRightLeft, ShieldAlert, BarChart2, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { Message, MessageType, GameRecapContent, TradeAlertContent, InjuryReportContent, Team, Player, PlayerBoxScore } from '../types';
import { fetchMessages, markMessageAsRead, markAllMessagesAsRead } from '../services/messageService';
import { fetchFullGameResult } from '../services/queries'; // [New]
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { OvrBadge } from '../components/common/OvrBadge';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from '../components/common/TeamLogo';
import { PageHeader } from '../components/common/PageHeader';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot } from '../components/common/Table';

interface InboxViewProps {
  myTeamId: string;
  userId: string;
  teams: Team[];
  onUpdateUnreadCount: () => void;
  onViewGameResult: (result: any) => void; // [New] Prop to trigger view switch
}

export const InboxView: React.FC<InboxViewProps> = ({ myTeamId, userId, teams, onUpdateUnreadCount, onViewGameResult }) => {
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
       {viewPlayer && <PlayerDetailModal player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} teamName={playerTeam?.name} teamId={playerTeam?.id} onClose={() => setViewPlayer(null)} allTeams={teams} />}
       
      <PageHeader 
        title="받은 메세지함" 
        icon={<Mail size={24} />}
        actions={
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
        }
      />

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
                                onViewGameResult={onViewGameResult} 
                                userId={userId}
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

// --- Sub-Component: Game Recap Viewer (With Sorting State) ---
type SortKey = 'default' | 'mp' | 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'fgm' | 'fg%' | 'p3m' | '3p%' | 'ftm' | 'ft%' | 'pm';

const GameRecapViewer: React.FC<{
    gameData: GameRecapContent;
    teams: Team[];
    onPlayerClick: (id: string) => void;
    handleViewDetails: (gameId: string) => void;
    isFetchingResult: boolean;
}> = ({ gameData, teams, onPlayerClick, handleViewDetails, isFetchingResult }) => {
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'default', direction: 'desc' });

    const homeTeam = teams.find(t => t.id === gameData.homeTeamId);
    const awayTeam = teams.find(t => t.id === gameData.awayTeamId);

    const hColor = TEAM_DATA[homeTeam?.id || '']?.colors.primary || '#ffffff';
    const aColor = TEAM_DATA[awayTeam?.id || '']?.colors.primary || '#ffffff';
    
    // Safe check for black color to fallback to white for visibility
    const hText = hColor === '#000000' ? '#ffffff' : hColor;
    const aText = aColor === '#000000' ? '#ffffff' : aColor;

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const getSortValue = (p: PlayerBoxScore, key: SortKey): number => {
        switch (key) {
            case 'mp': return p.mp;
            case 'pts': return p.pts;
            case 'reb': return p.reb;
            case 'ast': return p.ast;
            case 'stl': return p.stl;
            case 'blk': return p.blk;
            case 'tov': return p.tov;
            case 'pf': return p.pf;
            case 'fgm': return p.fgm;
            case 'fg%': return p.fga > 0 ? p.fgm / p.fga : 0;
            case 'p3m': return p.p3m;
            case '3p%': return p.p3a > 0 ? p.p3m / p.p3a : 0;
            case 'ftm': return p.ftm;
            case 'ft%': return p.fta > 0 ? p.ftm / p.fta : 0;
            case 'pm': return p.plusMinus;
            default: return 0;
        }
    };

    const sortedBox = useMemo(() => {
        if (!gameData.userBoxScore) return [];
        const data = [...gameData.userBoxScore].filter(p => p.mp > 0);
        
        if (sortConfig.key === 'default') {
             // Default: Starters (GS=1) first, then by MP desc
            return data.sort((a, b) => {
                if (a.gs !== b.gs) return b.gs - a.gs;
                return b.mp - a.mp;
            });
        }

        return data.sort((a, b) => {
            const valA = getSortValue(a, sortConfig.key);
            const valB = getSortValue(b, sortConfig.key);
            return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        });
    }, [gameData.userBoxScore, sortConfig]);

    const totals = useMemo(() => {
        if (!sortedBox) return null;
        return sortedBox.reduce((acc, p) => ({
            mp: acc.mp + p.mp,
            pts: acc.pts + p.pts,
            reb: acc.reb + p.reb,
            ast: acc.ast + p.ast,
            stl: acc.stl + p.stl,
            blk: acc.blk + p.blk,
            tov: acc.tov + p.tov,
            pf: acc.pf + (p.pf || 0),
            fgm: acc.fgm + p.fgm,
            fga: acc.fga + p.fga,
            p3m: acc.p3m + p.p3m,
            p3a: acc.p3a + p.p3a,
            ftm: acc.ftm + p.ftm,
            fta: acc.fta + p.fta,
            plusMinus: acc.plusMinus + p.plusMinus
        }), {
            mp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
            fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, plusMinus: 0
        });
    }, [sortedBox]);

    const formatPct = (m: number, a: number) => (a > 0 ? ((m/a)*100).toFixed(0) + '%' : '-');

    const SortableHeader = ({ label, sKey, width }: { label: string, sKey: SortKey, width?: string }) => (
        <TableHeaderCell 
            align="center" 
            className={`w-${width || 'auto'} ${label === 'PTS' ? 'text-slate-300' : 'text-slate-400'}`}
            sortable 
            onSort={() => handleSort(sKey)}
            sortDirection={sortConfig.key === sKey ? sortConfig.direction : null}
        >
            {label}
        </TableHeaderCell>
    );

    const totalCellClass = "py-3 px-2 text-center text-xs font-black text-slate-300 font-mono tabular-nums bg-slate-800/80 border-t border-slate-700";

    return (
        <div className="space-y-10 max-w-5xl mx-auto">
            {/* 1. Header Grid (3 Columns) */}
            <div className="grid grid-cols-3 items-center w-full py-6 bg-slate-900/50 rounded-2xl border border-slate-800 shadow-sm">
                
                {/* Left: Away Team */}
                <div className="flex flex-col items-center justify-center gap-3 border-r border-slate-800/50">
                    <TeamLogo teamId={awayTeam?.id || ''} size="xl" className="drop-shadow-lg" />
                    <span 
                        className="text-xl font-black uppercase oswald tracking-tight text-center leading-none"
                        style={{ color: aText }}
                    >
                        {awayTeam?.name}
                    </span>
                </div>
                
                {/* Center: Score */}
                <div className="flex items-center justify-center gap-6">
                    <span className={`text-5xl font-black ${gameData.awayScore > gameData.homeScore ? 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'text-slate-600'} oswald`}>{gameData.awayScore}</span>
                    <span className="text-slate-700 font-black text-2xl">-</span>
                    <span className={`text-5xl font-black ${gameData.homeScore > gameData.awayScore ? 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'text-slate-600'} oswald`}>{gameData.homeScore}</span>
                </div>

                {/* Right: Home Team */}
                <div className="flex flex-col items-center justify-center gap-3 border-l border-slate-800/50">
                    <TeamLogo teamId={homeTeam?.id || ''} size="xl" className="drop-shadow-lg" />
                    <span 
                        className="text-xl font-black uppercase oswald tracking-tight text-center leading-none"
                        style={{ color: hText }}
                    >
                        {homeTeam?.name}
                    </span>
                </div>
            </div>
            
            {/* 2. Full Box Score */}
            {sortedBox.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-400 px-2 uppercase tracking-widest flex items-center gap-2">
                        <BarChart2 size={16} /> Team Stats Summary
                    </h4>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                        <Table className="!rounded-none !border-0 !shadow-none">
                            <TableHead className="bg-slate-950">
                                <TableHeaderCell align="left" className="pl-6 w-40 sticky left-0 bg-slate-950 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">PLAYER</TableHeaderCell>
                                <TableHeaderCell align="center">POS</TableHeaderCell>
                                <SortableHeader label="MIN" sKey="mp" />
                                <SortableHeader label="PTS" sKey="pts" />
                                <SortableHeader label="REB" sKey="reb" />
                                <SortableHeader label="AST" sKey="ast" />
                                <SortableHeader label="STL" sKey="stl" />
                                <SortableHeader label="BLK" sKey="blk" />
                                <SortableHeader label="TOV" sKey="tov" />
                                <SortableHeader label="PF" sKey="pf" />
                                <SortableHeader label="FG" sKey="fgm" />
                                <SortableHeader label="3P" sKey="p3m" />
                                <SortableHeader label="FT" sKey="ftm" />
                                <SortableHeader label="+/-" sKey="pm" />
                            </TableHead>
                            <TableBody>
                                {sortedBox.map(p => (
                                    <TableRow key={p.playerId} onClick={() => onPlayerClick(p.playerId)}>
                                        <TableCell className="pl-6 text-xs font-bold text-slate-300 group-hover:text-white transition-colors sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">{p.playerName}</TableCell>
                                        <TableCell align="center" className="text-xs font-semibold text-slate-500">{teams.find(t => t.roster.some(r => r.id === p.playerId))?.roster.find(r => r.id === p.playerId)?.position || '-'}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-400">{Math.round(p.mp)}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-bold text-white">{p.pts}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.reb}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.ast}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.stl}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.blk}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.tov}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.pf}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-400">{p.fgm}/{p.fga}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-400">{p.p3m}/{p.p3a}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-400">{p.ftm}/{p.fta}</TableCell>
                                        <TableCell align="center" className={`text-xs font-mono font-bold ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                            {p.plusMinus > 0 ? '+' : ''}{p.plusMinus}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            {totals && (
                                <TableFoot>
                                    <tr>
                                        <td className="py-3 px-6 sticky left-0 bg-slate-800 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)] border-t border-slate-700">
                                            <span className="text-xs font-black text-white uppercase tracking-wider">TEAM TOTALS</span>
                                        </td>
                                        <td className={totalCellClass}>-</td>
                                        <td className={totalCellClass}>{Math.round(totals.mp)}</td>
                                        <td className={totalCellClass}>{totals.pts}</td>
                                        <td className={totalCellClass}>{totals.reb}</td>
                                        <td className={totalCellClass}>{totals.ast}</td>
                                        <td className={totalCellClass}>{totals.stl}</td>
                                        <td className={totalCellClass}>{totals.blk}</td>
                                        <td className={totalCellClass}>{totals.tov}</td>
                                        <td className={totalCellClass}>{totals.pf}</td>
                                        <td className={totalCellClass}>{totals.fgm}/{totals.fga}</td>
                                        <td className={totalCellClass}>{totals.p3m}/{totals.p3a}</td>
                                        <td className={totalCellClass}>{totals.ftm}/{totals.fta}</td>
                                        <td className={totalCellClass}>
                                            <span className={totals.plusMinus > 0 ? 'text-emerald-400' : totals.plusMinus < 0 ? 'text-red-400' : 'text-slate-400'}>
                                                {totals.plusMinus > 0 ? '+' : ''}{totals.plusMinus}
                                            </span>
                                        </td>
                                    </tr>
                                </TableFoot>
                            )}
                        </Table>
                    </div>
                </div>
            )}
            
            {/* View Detail Button */}
            <div className="flex justify-center pt-4">
                <button 
                    onClick={() => handleViewDetails(gameData.gameId)}
                    disabled={isFetchingResult}
                    className="flex items-center gap-3 px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-base font-black uppercase tracking-widest transition-all shadow-[0_10px_20px_rgba(79,70,229,0.3)] border border-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 group"
                >
                    {isFetchingResult ? <Loader2 className="animate-spin" size={20} /> : <BarChart2 size={20} />}
                    <span>상세 보고서 보기</span>
                </button>
            </div>
        </div>
    );
};

// --- Sub-Component: Content Renderer ---

const MessageContentRenderer: React.FC<{ 
    type: MessageType, 
    content: any, 
    teams: Team[], 
    onPlayerClick: (id: string) => void,
    onViewGameResult: (result: any) => void,
    userId: string
}> = ({ type, content, teams, onPlayerClick, onViewGameResult, userId }) => {
    
    const [isFetchingResult, setIsFetchingResult] = useState(false);

    // Shared Helper for OVR
    const getSnapshot = (id: string, savedOvr?: number, savedPos?: string) => {
        for (const t of teams) {
            const p = t.roster.find(rp => rp.id === id);
            if (p) return { ovr: calculatePlayerOvr(p), pos: p.position };
        }
        if (savedOvr !== undefined && savedPos) return { ovr: savedOvr, pos: savedPos };
        return { ovr: 0, pos: '-' };
    };

    const handleViewDetails = async (gameId: string) => {
        if (isFetchingResult) return;
        setIsFetchingResult(true);
        try {
            const raw = await fetchFullGameResult(gameId, userId);
            if (raw) {
                // Map raw DB data to View structure
                const homeTeam = teams.find(t => t.id === raw.home_team_id);
                const awayTeam = teams.find(t => t.id === raw.away_team_id);
                
                // Construct result object compatible with GameResultView
                // [Fix] Ensure pbp_logs and shot_events are safe arrays
                const mappedResult = {
                    home: homeTeam,
                    away: awayTeam,
                    homeScore: raw.home_score,
                    awayScore: raw.away_score,
                    homeBox: raw.box_score?.home || [],
                    awayBox: raw.box_score?.away || [],
                    homeTactics: raw.tactics?.home,
                    awayTactics: raw.tactics?.away,
                    pbpLogs: raw.pbp_logs || [], // Safety fallback
                    pbpShotEvents: raw.shot_events || [], // Safety fallback
                    rotationData: raw.rotation_data,
                    otherGames: [], // Can't easily fetch full other games context here, leave empty
                    date: raw.date,
                    recap: [] // Optional
                };
                
                if (homeTeam && awayTeam) {
                    onViewGameResult(mappedResult);
                }
            } else {
                alert("경기 데이터를 불러올 수 없습니다. (데이터가 존재하지 않거나 손상됨)");
            }
        } catch (e) {
            console.error("Fetch failed", e);
            alert("오류가 발생했습니다.");
        } finally {
            setIsFetchingResult(false);
        }
    };

    switch (type) {
        case 'GAME_RECAP':
            return (
                <GameRecapViewer 
                    gameData={content as GameRecapContent}
                    teams={teams}
                    onPlayerClick={onPlayerClick}
                    handleViewDetails={handleViewDetails}
                    isFetchingResult={isFetchingResult}
                />
            );

        case 'TRADE_ALERT':
            const tradeData = content as TradeAlertContent;
            return (
                <div className="space-y-6">
                    {/* Using TradeHistoryTable Style */}
                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                        <Table>
                            <TableHead>
                                <TableHeaderCell align="left" className="px-6 w-60">참여 구단</TableHeaderCell>
                                <TableHeaderCell align="left" className="px-4">IN Assets</TableHeaderCell>
                                <TableHeaderCell align="left" className="px-4">OUT Assets</TableHeaderCell>
                            </TableHead>
                            <TableBody>
                                {tradeData.trades.map((trade, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell align="left" className="px-6 align-top">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    <TeamLogo teamId={trade.team1Id} size="sm" />
                                                    <span className="text-xs font-black uppercase text-white">{trade.team1Name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <ArrowRightLeft size={12} className="text-slate-600" />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <TeamLogo teamId={trade.team2Id} size="sm" />
                                                    <span className="text-xs font-black uppercase text-white">{trade.team2Name}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell align="left" className="px-4 align-top">
                                            <div className="flex flex-col gap-2">
                                                {trade.team1Acquired.map((p, i) => {
                                                    const snap = getSnapshot(p.id, p.ovr);
                                                    return (
                                                        <div key={i} className="flex items-center gap-3 cursor-pointer hover:bg-slate-800 p-1 rounded" onClick={() => onPlayerClick(p.id)}>
                                                            <OvrBadge value={snap.ovr || 70} size="sm" className="!w-6 !h-6 !text-xs !mx-0" />
                                                            <span className="text-sm font-bold text-emerald-300">{p.name}</span>
                                                            <span className="text-[9px] font-black text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">{snap.pos || '?'}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </TableCell>
                                        <TableCell align="left" className="px-4 align-top">
                                            <div className="flex flex-col gap-2">
                                                {trade.team2Acquired.map((p, i) => {
                                                    const snap = getSnapshot(p.id, p.ovr);
                                                    return (
                                                        <div key={i} className="flex items-center gap-3 cursor-pointer hover:bg-slate-800 p-1 rounded" onClick={() => onPlayerClick(p.id)}>
                                                            <OvrBadge value={snap.ovr || 70} size="sm" className="!w-6 !h-6 !text-xs !mx-0 grayscale opacity-70" />
                                                            <span className="text-sm font-bold text-red-300/80">{p.name}</span>
                                                            <span className="text-[9px] font-black text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">{snap.pos || '?'}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
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

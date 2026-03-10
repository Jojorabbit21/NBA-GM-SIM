
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Mail, RefreshCw, CheckCircle2, ArrowRightLeft, ShieldAlert, Loader2, ArrowUp, ArrowDown, Hash, TrendingUp, Crown, AlertTriangle, ChevronDown, ChevronRight, Trophy, Shield } from 'lucide-react';
import { Message, MessageType, GameRecapContent, TradeAlertContent, InjuryReportContent, SeasonReviewContent, PlayoffStageReviewContent, Team, Player, PlayerBoxScore } from '../types';
import type { SeasonAwardsContent } from '../utils/awardVoting';
import { fetchMessages, markMessageAsRead, markAllMessagesAsRead } from '../services/messageService';
import { fetchFullGameResult } from '../services/queries';
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { OvrBadge } from '../components/common/OvrBadge';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from '../components/common/TeamLogo';
import { ReviewStatBox, ReviewOwnerMessage } from '../components/review/ReviewComponents';

import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot } from '../components/common/Table';

interface InboxViewProps {
  myTeamId: string;
  userId: string;
  teams: Team[];
  onUpdateUnreadCount: () => void;
  tendencySeed?: string;
  onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
  onViewGameResult: (result: any) => void; // [New] Prop to trigger view switch
}

export const InboxView: React.FC<InboxViewProps> = ({ myTeamId, userId, teams, onUpdateUnreadCount, tendencySeed, onViewPlayer, onViewGameResult }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

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
              onViewPlayer(p, t.id, t.name);
              return;
          }
      }
  };
  
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
    <div className="flex flex-col h-full animate-in fade-in duration-500 ko-normal overflow-hidden">
       {/* Player detail is now handled via onViewPlayer → AppRouter */}
       
      {/* Main Layout: Left Sidebar + Right Body */}
      <div className="flex-1 flex gap-0 min-h-0 overflow-hidden">
          
          {/* Left: Message List */}
          <div className="w-[280px] flex flex-col border-r border-slate-800 bg-slate-950/30 flex-shrink-0">
               {/* Header with title & actions */}
               <div className="px-4 py-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-2">
                   <div className="flex items-center gap-2">
                       <Mail size={16} className="text-slate-500" />
                       <span className="text-xs font-black text-slate-300 uppercase tracking-widest">받은 메세지</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                       <button
                           onClick={handleMarkAllRead}
                           className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                           title="모두 읽음 처리"
                       >
                           <CheckCircle2 size={14} />
                       </button>
                       <button
                           onClick={() => { setPage(0); setSelectedMessage(null); loadMessages(); }}
                           className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                           title="새로고침"
                       >
                           <RefreshCw size={14} />
                       </button>
                   </div>
               </div>
               {/* Message Count */}
               <div className="px-4 py-2 border-b border-slate-800/50">
                   <span className="text-[10px] font-bold text-slate-600">총 {messages.length}개</span>
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
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 relative">
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
                                myTeamId={myTeamId}
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
    myTeamId: string;
    onPlayerClick: (id: string) => void;
    handleViewDetails: (gameId: string) => void;
    isFetchingResult: boolean;
}> = ({ gameData, teams, myTeamId, onPlayerClick, handleViewDetails, isFetchingResult }) => {
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'default', direction: 'desc' });

    const homeTeam = teams.find(t => t.id === gameData.homeTeamId);
    const awayTeam = teams.find(t => t.id === gameData.awayTeamId);

    // Extract date from gameId (format: g_YYYY-MM-DD_...)
    const gameDate = useMemo(() => {
        const parts = gameData.gameId.split('_');
        const datePart = parts.find(p => /^\d{4}-\d{2}-\d{2}$/.test(p));
        return datePart || '';
    }, [gameData.gameId]);

    // Determine win/loss based on myTeamId
    const isWin = gameData.homeTeamId === myTeamId
        ? gameData.homeScore > gameData.awayScore
        : gameData.awayScore > gameData.homeScore;

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
        <div className="space-y-8 max-w-5xl mx-auto">
            {/* 1. Document-style Report Header */}
            <div className="space-y-2">
                {/* Game Date */}
                {gameDate && (
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em]">
                        {gameDate}
                    </p>
                )}

                {/* Matchup Row — plain text layout */}
                <div className="flex items-center gap-3 flex-wrap">
                    <TeamLogo teamId={awayTeam?.id || ''} size="sm" />
                    <span className="text-sm font-black uppercase tracking-tight text-slate-300">{awayTeam?.name}</span>
                    <span className={`text-sm font-black tabular-nums ${gameData.awayScore > gameData.homeScore ? 'text-white' : 'text-slate-500'}`}>{gameData.awayScore}</span>
                    <span className="text-slate-600 font-bold text-lg">–</span>
                    <span className={`text-sm font-black tabular-nums ${gameData.homeScore > gameData.awayScore ? 'text-white' : 'text-slate-500'}`}>{gameData.homeScore}</span>
                    <span className="text-sm font-black uppercase tracking-tight text-slate-300">{homeTeam?.name}</span>
                    <TeamLogo teamId={homeTeam?.id || ''} size="sm" />
                    <span className={`ml-1 text-[11px] font-black uppercase tracking-[0.15em] ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isWin ? '▲ WIN' : '▼ LOSS'}
                    </span>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-700" />
            </div>
            
            {/* 2. Full Box Score */}
            {sortedBox.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-400 px-2 uppercase tracking-widest">
                        박스스코어
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
                                            <span className="text-slate-600">—</span>
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
                    {isFetchingResult && <Loader2 className="animate-spin" size={20} />}
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
    myTeamId: string,
    onPlayerClick: (id: string) => void,
    onViewGameResult: (result: any) => void,
    userId: string
}> = ({ type, content, teams, myTeamId, onPlayerClick, onViewGameResult, userId }) => {
    
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
                    myTeamId={myTeamId}
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

        case 'SEASON_REVIEW': {
            const sr = content as SeasonReviewContent;
            return (
                <div className="space-y-10 max-w-5xl mx-auto">
                    {/* Header */}
                    <div className="space-y-1">
                        <p className="text-[10px] font-mono text-orange-400/60 uppercase tracking-[0.2em]">Front Office Report</p>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">2025-26 Regular Season Review</h2>
                        <div className="border-t border-orange-500/20 mt-2" />
                    </div>

                    {/* Final Standings */}
                    <div className="bg-gradient-to-br from-orange-950/20 to-slate-950 border border-orange-500/20 rounded-2xl overflow-hidden">
                        <div className="grid grid-cols-3 divide-x divide-orange-500/15">
                            <div className="p-6 flex flex-col items-center gap-1">
                                <span className="text-[9px] font-black text-orange-400 uppercase tracking-[0.2em]">Record</span>
                                <span className="text-4xl font-black text-white">{sr.wins}<span className="text-slate-600 text-2xl">/</span>{sr.losses}</span>
                                <span className="text-[10px] font-bold text-orange-300/60">Win Pct: {sr.winPctStr}</span>
                            </div>
                            <div className="p-6 flex flex-col items-center gap-1">
                                <span className="text-[9px] font-black text-orange-400 uppercase tracking-[0.2em] flex items-center gap-1"><Hash size={10} /> League Rank</span>
                                <span className="text-4xl font-black text-white">#{sr.leagueRank}</span>
                                <span className="text-[10px] font-bold text-slate-400">{sr.conference} Conf: #{sr.confRank}</span>
                            </div>
                            <div className="p-6 flex flex-col items-center gap-1">
                                <span className="text-[9px] font-black text-orange-400 uppercase tracking-[0.2em] flex items-center gap-1"><TrendingUp size={10} /> Status</span>
                                {sr.isPlayoffBound ? (
                                    <span className="text-2xl font-black text-emerald-400 uppercase">Playoff Bound</span>
                                ) : (
                                    <span className="text-2xl font-black text-slate-400 uppercase">Lottery Bound</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Owner's Message */}
                    <ReviewOwnerMessage
                        ownerName={sr.ownerName}
                        title={sr.ownerMood.title}
                        msg={sr.ownerMood.msg}
                        mood={sr.ownerMood}
                    />

                    {/* Season Stats */}
                    <div>
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Season Stats</h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <ReviewStatBox label="Points" value={sr.leagueRanks.pts.value} rank={sr.leagueRanks.pts.rank} />
                            <ReviewStatBox label="Rebounds" value={sr.leagueRanks.reb.value} rank={sr.leagueRanks.reb.rank} />
                            <ReviewStatBox label="Assists" value={sr.leagueRanks.ast.value} rank={sr.leagueRanks.ast.rank} />
                            <ReviewStatBox label="Steals" value={sr.leagueRanks.stl.value} rank={sr.leagueRanks.stl.rank} />
                            <ReviewStatBox label="Blocks" value={sr.leagueRanks.blk.value} rank={sr.leagueRanks.blk.rank} />
                            <ReviewStatBox label="Turnovers" value={sr.leagueRanks.tov.value} rank={sr.leagueRanks.tov.rank} inverse />
                            <ReviewStatBox label="FG%" value={sr.leagueRanks.fgPct.value} rank={sr.leagueRanks.fgPct.rank} isPercent />
                            <ReviewStatBox label="3P%" value={sr.leagueRanks.p3Pct.value} rank={sr.leagueRanks.p3Pct.rank} isPercent />
                            <ReviewStatBox label="FT%" value={sr.leagueRanks.ftPct.value} rank={sr.leagueRanks.ftPct.rank} isPercent />
                            <ReviewStatBox label="True Shooting" value={sr.leagueRanks.tsPct.value} rank={sr.leagueRanks.tsPct.rank} isPercent />
                        </div>
                    </div>

                    {/* Team MVP */}
                    {sr.mvp && (
                        <div>
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Team MVP</h3>
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-6 cursor-pointer hover:border-orange-500/30 transition-colors" onClick={() => onPlayerClick(sr.mvp!.id)}>
                                <div className="flex flex-col items-center gap-1">
                                    <OvrBadge value={sr.mvp.ovr} size="lg" className="!w-12 !h-12 !text-xl" />
                                    <div className="flex items-center gap-1 mt-1">
                                        <Crown size={10} className="text-amber-400 fill-amber-400" />
                                        <span className="text-[9px] font-black text-amber-300 uppercase tracking-wider">MVP</span>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-lg font-black text-white">{sr.mvp.name}</h4>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{sr.mvp.position} | {sr.mvp.age} years old</p>
                                    <div className="flex gap-4 mt-2">
                                        <div className="text-center"><span className="text-lg font-black text-white">{sr.mvp.ppg}</span><span className="text-[9px] font-bold text-slate-500 ml-1">PTS</span></div>
                                        <div className="text-center"><span className="text-lg font-black text-white">{sr.mvp.rpg}</span><span className="text-[9px] font-bold text-slate-500 ml-1">REB</span></div>
                                        <div className="text-center"><span className="text-lg font-black text-white">{sr.mvp.apg}</span><span className="text-[9px] font-bold text-slate-500 ml-1">AST</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Trade History */}
                    {sr.trades.length > 0 && (
                        <div>
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <ArrowRightLeft size={14} className="text-indigo-400" /> Trade History
                            </h3>
                            <div className="space-y-3">
                                {sr.trades.map((t, idx) => (
                                    <div key={idx} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                                        <span className="text-[10px] font-bold text-slate-500 w-24 flex-shrink-0">{t.date}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <TeamLogo teamId={t.partnerId} size="sm" />
                                            <span className="text-xs font-black text-white uppercase">{t.partnerName}</span>
                                        </div>
                                        <div className="flex-1 grid grid-cols-2 gap-3 ml-4">
                                            <div>
                                                <span className="text-[9px] font-black text-emerald-500 uppercase">IN</span>
                                                {t.acquired.map((p, i) => (
                                                    <div key={i} className="flex items-center gap-2 mt-0.5">
                                                        <OvrBadge value={p.ovr} size="sm" className="!w-5 !h-5 !text-[9px] !mx-0" />
                                                        <span className="text-xs font-bold text-emerald-300">{p.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div>
                                                <span className="text-[9px] font-black text-red-500 uppercase">OUT</span>
                                                {t.departed.map((p, i) => (
                                                    <div key={i} className="flex items-center gap-2 mt-0.5">
                                                        <OvrBadge value={p.ovr} size="sm" className="!w-5 !h-5 !text-[9px] !mx-0 grayscale opacity-50" />
                                                        <span className="text-xs font-bold text-slate-400">{p.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Performance Alert */}
                    {sr.winPct < 0.4 && (
                        <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-xl flex items-start gap-3">
                            <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
                            <div>
                                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wide mb-1">Performance Alert</h4>
                                <p className="text-xs text-red-300/70 leading-relaxed">
                                    팀 성적이 저조합니다. 오프시즌 동안 드래프트와 FA 영입을 통해 로스터를 재정비해야 합니다.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        case 'PLAYOFF_STAGE_REVIEW': {
            const ps = content as PlayoffStageReviewContent;
            const isWin = ps.result === 'WON';
            const statusColor = isWin ? 'emerald' : 'red';
            const borderColor = isWin ? 'border-emerald-500/20' : 'border-red-500/20';
            const bgGradient = isWin ? 'from-emerald-950/20' : 'from-red-950/10';

            return (
                <div className="space-y-8 max-w-5xl mx-auto">
                    {/* Header */}
                    <div className="space-y-1">
                        <p className="text-[10px] font-mono text-indigo-400/60 uppercase tracking-[0.2em]">Playoff Report</p>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">{ps.roundName}</h2>
                        <div className="border-t border-indigo-500/20 mt-2" />
                    </div>

                    {/* Series Result Banner */}
                    <div className={`bg-gradient-to-r ${bgGradient} to-slate-950 border ${borderColor} rounded-2xl p-6 flex items-center justify-between`}>
                        <div className="flex items-center gap-5">
                            <TeamLogo teamId={ps.opponentId} size="md" />
                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] mb-0.5">vs</p>
                                <h3 className="text-lg font-black text-white uppercase">{ps.opponentName}</h3>
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                            <span className={`text-sm font-black uppercase tracking-widest ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                {ps.result}
                            </span>
                            <span className="text-3xl font-black text-white font-mono">{ps.seriesScore}</span>
                        </div>
                    </div>

                    {/* Game Results */}
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
                        {ps.games.map((g) => (
                            <div key={g.gameNum} className="flex justify-between items-center px-6 py-3 border-b border-slate-800/50 last:border-b-0 hover:bg-white/5 transition-colors">
                                <div className="flex items-center gap-4">
                                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest w-16">Game {g.gameNum}</span>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase ${g.isHome ? 'bg-slate-800 text-slate-300' : 'bg-slate-800 text-slate-400'}`}>
                                        {g.isHome ? 'HOME' : 'AWAY'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-5">
                                    <span className={`text-xs font-black uppercase ${g.isWin ? 'text-emerald-500' : 'text-red-500'}`}>{g.isWin ? 'WIN' : 'LOSS'}</span>
                                    <span className={`text-base font-mono font-black ${g.isWin ? 'text-white' : 'text-slate-400'}`}>
                                        {g.myScore} - {g.oppScore}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Final Status Banner (if final stage) */}
                    {ps.isFinalStage && ps.finalStatus && (
                        <div className={`text-center py-8 rounded-2xl border ${
                            ps.result === 'WON' && ps.round === 4
                                ? 'bg-gradient-to-r from-yellow-900/30 to-slate-900 border-yellow-500/40'
                                : 'bg-slate-900 border-slate-800'
                        }`}>
                            <h3 className={`text-2xl font-black uppercase tracking-tight ${
                                ps.result === 'WON' && ps.round === 4 ? 'text-yellow-400' : 'text-slate-300'
                            }`}>
                                {ps.finalStatus.title}
                            </h3>
                            <p className="text-sm font-bold text-slate-400 mt-1">{ps.finalStatus.desc}</p>
                        </div>
                    )}

                    {/* Owner's Message */}
                    <ReviewOwnerMessage
                        ownerName={ps.ownerName}
                        title={ps.isFinalStage ? 'Season Debrief' : ps.roundName + ' Complete'}
                        msg={ps.ownerMessage}
                        mood={{
                            color: isWin ? 'text-emerald-400' : 'text-slate-400',
                            borderColor: isWin ? 'border-emerald-500/50' : 'border-slate-700',
                            bg: isWin ? 'bg-emerald-500/5' : 'bg-slate-900'
                        }}
                    />
                </div>
            );
        }

        case 'SEASON_AWARDS':
            return (
                <AwardsReportViewer
                    content={content as SeasonAwardsContent}
                    teams={teams}
                    onPlayerClick={onPlayerClick}
                />
            );

        default:
            return <div className="text-slate-400 text-sm">표시할 내용이 없습니다.</div>;
    }
};

// --- Sub-Component: Awards Report Viewer (WinForms 스타일 테이블) ---

const AwardsReportViewer: React.FC<{
    content: SeasonAwardsContent;
    teams: Team[];
    onPlayerClick: (id: string) => void;
}> = ({ content, teams, onPlayerClick }) => {
    const [showBallots, setShowBallots] = useState(false);

    const formatStat = (v: number | undefined, decimals = 1) => (v ?? 0).toFixed(decimals);
    const formatPct = (v: number | undefined) => (v != null && v > 0) ? '.' + (v * 1000).toFixed(0).padStart(3, '0') : '-';

    // playerId → 이름 맵 (ballot 표시용)
    const nameMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of content.mvpRanking) map.set(r.playerId, r.playerName);
        for (const r of content.dpoyRanking) map.set(r.playerId, r.playerName);
        for (const t of content.allNbaTeams) for (const p of t.players) map.set(p.playerId, p.playerName);
        for (const t of content.allDefTeams) for (const p of t.players) map.set(p.playerId, p.playerName);
        for (const t of teams) for (const p of t.roster) map.set(p.id, p.name);
        return map;
    }, [content, teams]);

    // MVP 순위별 득표수 집계: playerId → [1위표, 2위표, 3위표, 4위표, 5위표]
    const mvpVoteBreakdown = useMemo(() => {
        const map = new Map<string, number[]>();
        for (const b of content.ballots) {
            for (let i = 0; i < b.mvp.length && i < 5; i++) {
                const pid = b.mvp[i];
                if (!map.has(pid)) map.set(pid, [0, 0, 0, 0, 0]);
                map.get(pid)![i]++;
            }
        }
        return map;
    }, [content.ballots]);

    // DPOY 순위별 득표수 집계: playerId → [1위표, 2위표, 3위표]
    const dpoyVoteBreakdown = useMemo(() => {
        const map = new Map<string, number[]>();
        for (const b of content.ballots) {
            for (let i = 0; i < b.dpoy.length && i < 3; i++) {
                const pid = b.dpoy[i];
                if (!map.has(pid)) map.set(pid, [0, 0, 0]);
                map.get(pid)![i]++;
            }
        }
        return map;
    }, [content.ballots]);

    const getPlayerName = (pid: string) => nameMap.get(pid) || pid;

    const sectionLabel = "text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3 flex items-center gap-2";
    const thClass = "py-2 px-2 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap border-b border-slate-700";
    const tdClass = "py-1.5 px-2 text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap border-b border-slate-800/50";
    const tdBold = "py-1.5 px-2 text-xs font-bold text-slate-300 whitespace-nowrap border-b border-slate-800/50";

    return (
        <div className="space-y-10 max-w-6xl mx-auto">
            {/* Header */}
            <div className="space-y-1">
                <h2 className="text-xl font-black text-white uppercase tracking-tight">2025-26 정규시즌 어워드 투표 결과</h2>
                <div className="border-t border-amber-500/20 mt-2" />
            </div>

            {/* ── MVP 투표 결과 ── */}
            {content.mvpRanking.length > 0 && (
                <div>
                    <h3 className={sectionLabel}>
                        <Trophy size={12} className="text-amber-400" />
                        <span>MVP 투표 결과</span>
                    </h3>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
                        <table className="w-full text-left border-separate border-spacing-0">
                            <thead>
                                <tr>
                                    <th className={`${thClass} text-center w-8`}>#</th>
                                    <th className={`${thClass} text-center w-10`}>OVR</th>
                                    <th className={`${thClass} text-left pl-3 min-w-[160px]`}>선수</th>
                                    <th className={`${thClass} text-center`}>POS</th>
                                    <th className={`${thClass} text-center`}>1위</th>
                                    <th className={`${thClass} text-center`}>2위</th>
                                    <th className={`${thClass} text-center`}>3위</th>
                                    <th className={`${thClass} text-center`}>4위</th>
                                    <th className={`${thClass} text-center`}>5위</th>
                                    <th className={`${thClass} text-center`}>PTS</th>
                                    <th className={`${thClass} text-center`}>PPG</th>
                                    <th className={`${thClass} text-center`}>RPG</th>
                                    <th className={`${thClass} text-center`}>APG</th>
                                    <th className={`${thClass} text-center`}>FG%</th>
                                    <th className={`${thClass} text-center`}>3P%</th>
                                    <th className={`${thClass} text-center`}>TS%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {content.mvpRanking.map((r, idx) => {
                                    const votes = mvpVoteBreakdown.get(r.playerId) || [0, 0, 0, 0, 0];
                                    return (
                                        <tr
                                            key={r.playerId}
                                            className={`hover:bg-white/5 cursor-pointer ${idx === 0 ? 'bg-amber-500/10 border-l-2 border-l-amber-500' : ''}`}
                                            onClick={() => onPlayerClick(r.playerId)}
                                        >
                                            <td className={`${tdClass} text-center font-bold ${idx === 0 ? 'text-amber-400' : 'text-slate-500'}`}>{idx + 1}</td>
                                            <td className={`${tdClass} text-center`}><OvrBadge value={r.ovr} size="sm" className="!w-6 !h-6 !text-[10px] !mx-auto" /></td>
                                            <td className={`${tdBold} pl-3 ${idx === 0 ? 'text-amber-300' : 'text-slate-300'} hover:text-white`}>
                                                <div className="flex items-center gap-1.5">
                                                    <TeamLogo teamId={r.teamId} size="xs" />
                                                    <span>{r.playerName}</span>
                                                    {idx === 0 && <span className="text-amber-400">★</span>}
                                                </div>
                                            </td>
                                            <td className={`${tdClass} text-center text-slate-500 font-bold`}>{r.position}</td>
                                            <td className={`${tdClass} text-center font-bold ${votes[0] > 0 ? 'text-amber-300' : 'text-slate-600'}`}>{votes[0]}</td>
                                            <td className={`${tdClass} text-center ${votes[1] > 0 ? 'text-slate-300' : 'text-slate-600'}`}>{votes[1]}</td>
                                            <td className={`${tdClass} text-center ${votes[2] > 0 ? 'text-slate-300' : 'text-slate-600'}`}>{votes[2]}</td>
                                            <td className={`${tdClass} text-center ${votes[3] > 0 ? 'text-slate-400' : 'text-slate-600'}`}>{votes[3]}</td>
                                            <td className={`${tdClass} text-center ${votes[4] > 0 ? 'text-slate-400' : 'text-slate-600'}`}>{votes[4]}</td>
                                            <td className={`${tdClass} text-center font-bold text-white`}>{r.points}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(r.statLine.ppg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(r.statLine.rpg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(r.statLine.apg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatPct(r.statLine.fgPct)}</td>
                                            <td className={`${tdClass} text-center`}>{formatPct(r.statLine.p3Pct)}</td>
                                            <td className={`${tdClass} text-center`}>{formatPct(r.statLine.tsPct)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── DPOY 투표 결과 ── */}
            {content.dpoyRanking.length > 0 && (
                <div>
                    <h3 className={sectionLabel}>
                        <Shield size={12} className="text-indigo-400" />
                        <span>DPOY 투표 결과</span>
                    </h3>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
                        <table className="w-full text-left border-separate border-spacing-0">
                            <thead>
                                <tr>
                                    <th className={`${thClass} text-center w-8`}>#</th>
                                    <th className={`${thClass} text-center w-10`}>OVR</th>
                                    <th className={`${thClass} text-left pl-3 min-w-[160px]`}>선수</th>
                                    <th className={`${thClass} text-center`}>POS</th>
                                    <th className={`${thClass} text-center`}>1위</th>
                                    <th className={`${thClass} text-center`}>2위</th>
                                    <th className={`${thClass} text-center`}>3위</th>
                                    <th className={`${thClass} text-center`}>PTS</th>
                                    <th className={`${thClass} text-center`}>OREB</th>
                                    <th className={`${thClass} text-center`}>DREB</th>
                                    <th className={`${thClass} text-center`}>STL</th>
                                    <th className={`${thClass} text-center`}>BLK</th>
                                </tr>
                            </thead>
                            <tbody>
                                {content.dpoyRanking.map((r, idx) => {
                                    const votes = dpoyVoteBreakdown.get(r.playerId) || [0, 0, 0];
                                    return (
                                        <tr
                                            key={r.playerId}
                                            className={`hover:bg-white/5 cursor-pointer ${idx === 0 ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500' : ''}`}
                                            onClick={() => onPlayerClick(r.playerId)}
                                        >
                                            <td className={`${tdClass} text-center font-bold ${idx === 0 ? 'text-indigo-400' : 'text-slate-500'}`}>{idx + 1}</td>
                                            <td className={`${tdClass} text-center`}><OvrBadge value={r.ovr} size="sm" className="!w-6 !h-6 !text-[10px] !mx-auto" /></td>
                                            <td className={`${tdBold} pl-3 ${idx === 0 ? 'text-indigo-300' : 'text-slate-300'} hover:text-white`}>
                                                <div className="flex items-center gap-1.5">
                                                    <TeamLogo teamId={r.teamId} size="xs" />
                                                    <span>{r.playerName}</span>
                                                    {idx === 0 && <span className="text-indigo-400">★</span>}
                                                </div>
                                            </td>
                                            <td className={`${tdClass} text-center text-slate-500 font-bold`}>{r.position}</td>
                                            <td className={`${tdClass} text-center font-bold ${votes[0] > 0 ? 'text-indigo-300' : 'text-slate-600'}`}>{votes[0]}</td>
                                            <td className={`${tdClass} text-center ${votes[1] > 0 ? 'text-slate-300' : 'text-slate-600'}`}>{votes[1]}</td>
                                            <td className={`${tdClass} text-center ${votes[2] > 0 ? 'text-slate-300' : 'text-slate-600'}`}>{votes[2]}</td>
                                            <td className={`${tdClass} text-center font-bold text-white`}>{r.points}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(r.statLine.orebpg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(r.statLine.drebpg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(r.statLine.spg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(r.statLine.bpg)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── 올-NBA 팀 ── */}
            {content.allNbaTeams.length > 0 && (
                <div>
                    <h3 className={sectionLabel}>
                        <Crown size={12} className="text-amber-400" />
                        <span>올-NBA 팀</span>
                    </h3>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
                        <table className="w-full text-left border-separate border-spacing-0">
                            <thead>
                                <tr>
                                    <th className={`${thClass} text-center w-14`}>팀</th>
                                    <th className={`${thClass} text-center w-8`}>POS</th>
                                    <th className={`${thClass} text-center w-10`}>OVR</th>
                                    <th className={`${thClass} text-left pl-3`}>선수</th>
                                    <th className={`${thClass} text-center`}>득표</th>
                                    <th className={`${thClass} text-center`}>PPG</th>
                                    <th className={`${thClass} text-center`}>RPG</th>
                                    <th className={`${thClass} text-center`}>APG</th>
                                    <th className={`${thClass} text-center`}>TS%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {content.allNbaTeams.map((team) =>
                                    team.players.map((p, pIdx) => (
                                        <tr
                                            key={`nba-${team.tier}-${p.playerId}`}
                                            className="hover:bg-white/5 cursor-pointer"
                                            onClick={() => onPlayerClick(p.playerId)}
                                        >
                                            {pIdx === 0 && (
                                                <td
                                                    rowSpan={team.players.length}
                                                    className={`py-1.5 px-2 text-center align-middle border-b border-slate-700 font-black text-sm ${
                                                        team.tier === 1 ? 'text-amber-400' : team.tier === 2 ? 'text-slate-300' : 'text-slate-500'
                                                    }`}
                                                >
                                                    {team.tier === 1 ? '1ST' : team.tier === 2 ? '2ND' : '3RD'}
                                                </td>
                                            )}
                                            <td className={`${tdClass} text-center text-[10px] font-black text-slate-500`}>{p.pos}</td>
                                            <td className={`${tdClass} text-center`}><OvrBadge value={p.ovr} size="sm" className="!w-6 !h-6 !text-[10px] !mx-auto" /></td>
                                            <td className={`${tdBold} pl-3 hover:text-white`}>
                                                <div className="flex items-center gap-1.5">
                                                    <TeamLogo teamId={p.teamId} size="xs" />
                                                    <span>{p.playerName}</span>
                                                </div>
                                            </td>
                                            <td className={`${tdClass} text-center font-bold text-slate-300`}>{p.votes}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(p.statLine.ppg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(p.statLine.rpg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(p.statLine.apg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatPct(p.statLine.tsPct)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── 올-디펜시브 팀 ── */}
            {content.allDefTeams.length > 0 && (
                <div>
                    <h3 className={sectionLabel}>
                        <Shield size={12} className="text-indigo-400" />
                        <span>올-디펜시브 팀</span>
                    </h3>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
                        <table className="w-full text-left border-separate border-spacing-0">
                            <thead>
                                <tr>
                                    <th className={`${thClass} text-center w-14`}>팀</th>
                                    <th className={`${thClass} text-center w-8`}>POS</th>
                                    <th className={`${thClass} text-center w-10`}>OVR</th>
                                    <th className={`${thClass} text-left pl-3`}>선수</th>
                                    <th className={`${thClass} text-center`}>득표</th>
                                    <th className={`${thClass} text-center`}>SPG</th>
                                    <th className={`${thClass} text-center`}>BPG</th>
                                    <th className={`${thClass} text-center`}>OREB</th>
                                    <th className={`${thClass} text-center`}>DREB</th>
                                </tr>
                            </thead>
                            <tbody>
                                {content.allDefTeams.map((team) =>
                                    team.players.map((p, pIdx) => (
                                        <tr
                                            key={`def-${team.tier}-${p.playerId}`}
                                            className="hover:bg-white/5 cursor-pointer"
                                            onClick={() => onPlayerClick(p.playerId)}
                                        >
                                            {pIdx === 0 && (
                                                <td
                                                    rowSpan={team.players.length}
                                                    className={`py-1.5 px-2 text-center align-middle border-b border-slate-700 font-black text-sm ${
                                                        team.tier === 1 ? 'text-indigo-400' : 'text-slate-400'
                                                    }`}
                                                >
                                                    {team.tier === 1 ? '1ST' : '2ND'}
                                                </td>
                                            )}
                                            <td className={`${tdClass} text-center text-[10px] font-black text-slate-500`}>{p.pos}</td>
                                            <td className={`${tdClass} text-center`}><OvrBadge value={p.ovr} size="sm" className="!w-6 !h-6 !text-[10px] !mx-auto" /></td>
                                            <td className={`${tdBold} pl-3 hover:text-white`}>
                                                <div className="flex items-center gap-1.5">
                                                    <TeamLogo teamId={p.teamId} size="xs" />
                                                    <span>{p.playerName}</span>
                                                </div>
                                            </td>
                                            <td className={`${tdClass} text-center font-bold text-slate-300`}>{p.votes}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(p.statLine.spg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(p.statLine.bpg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(p.statLine.orebpg)}</td>
                                            <td className={`${tdClass} text-center`}>{formatStat(p.statLine.drebpg)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── MVP 전체 투표 내역 (접기/펼치기) ── */}
            {content.ballots.length > 0 && (
                <div>
                    <button
                        onClick={() => setShowBallots(!showBallots)}
                        className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-slate-300 transition-colors mb-3"
                    >
                        {showBallots ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <span>MVP 전체 투표 내역 ({content.ballots.length}명)</span>
                    </button>
                    {showBallots && (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead className="sticky top-0 z-10 bg-slate-950">
                                    <tr>
                                        <th className={`${thClass} text-center w-14`}>투표인</th>
                                        <th className={`${thClass} text-center`}>1위 (10pt)</th>
                                        <th className={`${thClass} text-center`}>2위 (7pt)</th>
                                        <th className={`${thClass} text-center`}>3위 (5pt)</th>
                                        <th className={`${thClass} text-center`}>4위 (3pt)</th>
                                        <th className={`${thClass} text-center`}>5위 (1pt)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {content.ballots.map((b) => (
                                        <tr key={b.voterId} className="hover:bg-white/5">
                                            <td className={`${tdClass} text-center font-bold text-slate-500`}>#{String(b.voterId + 1).padStart(2, '0')}</td>
                                            {b.mvp.map((pid, i) => (
                                                <td
                                                    key={i}
                                                    className={`${tdClass} text-center cursor-pointer hover:text-white ${i === 0 ? 'text-amber-300 font-bold' : 'text-slate-400'}`}
                                                    onClick={() => onPlayerClick(pid)}
                                                >
                                                    {getPlayerName(pid).split(' ').pop()}
                                                </td>
                                            ))}
                                            {Array.from({ length: Math.max(0, 5 - b.mvp.length) }).map((_, i) => (
                                                <td key={`empty-${i}`} className={`${tdClass} text-center text-slate-700`}>-</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

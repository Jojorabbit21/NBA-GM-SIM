
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Mail, RefreshCw, CheckCircle2, ArrowRightLeft, ShieldAlert, Loader2, ArrowUp, ArrowDown, AlertTriangle, ChevronDown, ChevronRight, Crown, Trophy } from 'lucide-react';
import { MessageListItem, MessageType, GameRecapContent, TradeAlertContent, InjuryReportContent, SeasonReviewContent, PlayoffStageReviewContent, OwnerLetterContent, HofQualificationContent, FinalsMvpContent, RegSeasonChampionContent, PlayoffChampionContent, Team, Player, PlayerBoxScore } from '../types';
import type { SeasonAwardsContent } from '../utils/awardVoting';
import { fetchMessageList, fetchMessageContent, fetchTotalMessageCount, markMessageAsRead, markAllMessagesAsRead } from '../services/messageService';
import { fetchFullGameResult } from '../services/queries';
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { OvrBadge } from '../components/common/OvrBadge';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from '../components/common/TeamLogo';


import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot } from '../components/common/Table';

interface InboxViewProps {
  myTeamId: string;
  userId: string;
  teams: Team[];
  onUpdateUnreadCount: () => void;
  tendencySeed?: string;
  onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
  onViewGameResult: (result: any) => void;
  onNavigateToHof: () => void;
}

export const InboxView: React.FC<InboxViewProps> = ({ myTeamId, userId, teams, onUpdateUnreadCount, tendencySeed, onViewPlayer, onViewGameResult, onNavigateToHof }) => {
  const [messages, setMessages] = useState<MessageListItem[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<MessageListItem | null>(null);
  const [selectedContent, setSelectedContent] = useState<any>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const contentCache = useRef<Map<string, any>>(new Map());

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
          markMessageAsRead(msg.id);
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
          onUpdateUnreadCount();
      }
  }, [onUpdateUnreadCount]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const [data, count] = await Promise.all([
      fetchMessageList(userId, myTeamId, page),
      page === 0 ? fetchTotalMessageCount(userId, myTeamId) : Promise.resolve(totalCount),
    ]);

    if (page === 0) setTotalCount(count);
    const newMessages = page === 0 ? data : [...messages, ...data];
    setMessages(newMessages);

    // Auto-select the first message (Latest) if none selected
    if (page === 0 && data.length > 0 && !selectedMessage) {
        handleSelectMessage(data[0]);
    }

    setLoading(false);
  }, [userId, myTeamId, page, handleSelectMessage]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

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
                           onClick={() => { setPage(0); setSelectedMessage(null); setSelectedContent(null); contentCache.current.clear(); loadMessages(); }}
                           className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                           title="새로고침"
                       >
                           <RefreshCw size={14} />
                       </button>
                   </div>
               </div>
               {/* Message Count */}
               <div className="px-4 py-2 border-b border-slate-800/50">
                   <span className="text-[10px] font-bold text-slate-600">총 {totalCount}개</span>
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

// --- Sub-Component: Season Review Renderer ---
type TeamStatTab = 'Traditional' | 'Advanced' | 'Opponent';

const SR_TAB_LABELS: Record<TeamStatTab, string> = {
    Traditional: '기본',
    Advanced: '어드밴스드',
    Opponent: '상대팀',
};

const SR_TEAM_COLS: Record<TeamStatTab, { key: string; label: string; fmt: 'num' | 'pct' | 'diff'; inv?: boolean }[]> = {
    Traditional: [
        { key: 'pts', label: 'PTS', fmt: 'num' }, { key: 'pa', label: 'PA', fmt: 'num', inv: true },
        { key: 'reb', label: 'REB', fmt: 'num' }, { key: 'ast', label: 'AST', fmt: 'num' },
        { key: 'stl', label: 'STL', fmt: 'num' }, { key: 'blk', label: 'BLK', fmt: 'num' },
        { key: 'tov', label: 'TOV', fmt: 'num', inv: true },
        { key: 'fg%', label: 'FG%', fmt: 'pct' }, { key: '3p%', label: '3P%', fmt: 'pct' },
        { key: 'ft%', label: 'FT%', fmt: 'pct' }, { key: 'pm', label: '+/-', fmt: 'diff' },
    ],
    Advanced: [
        { key: 'ts%', label: 'TS%', fmt: 'pct' }, { key: 'efg%', label: 'eFG%', fmt: 'pct' },
        { key: 'tov%', label: 'TOV%', fmt: 'pct', inv: true }, { key: 'ast%', label: 'AST%', fmt: 'pct' },
        { key: 'stl%', label: 'STL%', fmt: 'pct' }, { key: 'blk%', label: 'BLK%', fmt: 'pct' },
        { key: '3par', label: '3PAr', fmt: 'pct' }, { key: 'ftr', label: 'FTr', fmt: 'pct' },
        { key: 'ortg', label: 'ORTG', fmt: 'num' }, { key: 'drtg', label: 'DRTG', fmt: 'num', inv: true },
        { key: 'nrtg', label: 'NRTG', fmt: 'diff' },
        { key: 'poss', label: 'POSS', fmt: 'num' }, { key: 'pace', label: 'PACE', fmt: 'num' },
    ],
    Opponent: [
        { key: 'opp_pts', label: 'PTS', fmt: 'num', inv: true }, { key: 'opp_fg%', label: 'FG%', fmt: 'pct', inv: true },
        { key: 'opp_3p%', label: '3P%', fmt: 'pct', inv: true }, { key: 'opp_ast', label: 'AST', fmt: 'num', inv: true },
        { key: 'opp_reb', label: 'REB', fmt: 'num', inv: true }, { key: 'opp_oreb', label: 'OREB', fmt: 'num', inv: true },
        { key: 'opp_stl', label: 'STL', fmt: 'num', inv: true }, { key: 'opp_blk', label: 'BLK', fmt: 'num', inv: true },
        { key: 'opp_tov', label: 'TOV', fmt: 'num' }, { key: 'opp_pf', label: 'PF', fmt: 'num' },
    ],
};

const fmtStatVal = (v: number | undefined, fmt: 'num' | 'pct' | 'diff'): string => {
    if (v == null) return '-';
    if (fmt === 'pct') return v > 0 ? '.' + (v * 1000).toFixed(0).padStart(3, '0') : '-';
    if (fmt === 'diff') return v === 0 ? '0.0' : (v > 0 ? '+' : '') + v.toFixed(1);
    return v.toFixed(1);
};

const SeasonReviewRenderer: React.FC<{
    sr: SeasonReviewContent;
    myTeamId: string;
    onPlayerClick: (id: string) => void;
}> = ({ sr, myTeamId, onPlayerClick }) => {
    const [teamStatTab, setTeamStatTab] = useState<TeamStatTab>('Traditional');

    const myTeamStats = useMemo(() => {
        if (!sr.allTeamsStats) return null;
        return sr.allTeamsStats.find(t => t.teamId === myTeamId) ?? null;
    }, [sr.allTeamsStats, myTeamId]);

    const computeRank = useCallback((key: string, inverse?: boolean) => {
        if (!sr.allTeamsStats) return 0;
        const sorted = [...sr.allTeamsStats].sort((a, b) =>
            inverse ? (a.stats[key] ?? 0) - (b.stats[key] ?? 0) : (b.stats[key] ?? 0) - (a.stats[key] ?? 0)
        );
        return sorted.findIndex(t => t.teamId === myTeamId) + 1;
    }, [sr.allTeamsStats, myTeamId]);

    const cols = SR_TEAM_COLS[teamStatTab];

    return (
        <div className="space-y-10 max-w-5xl mx-auto">
            {/* Standings Context */}
            {sr.standingsContext && sr.standingsContext.length > 0 && (
                <div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">시즌 순위</h3>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table className="!rounded-none !border-0 !shadow-none" style={{ minWidth: '100%' }}>
                                <TableHead className="bg-slate-950">
                                    <TableHeaderCell align="center" className="w-10">#</TableHeaderCell>
                                    <TableHeaderCell align="left" className="pl-4 min-w-[160px]">팀</TableHeaderCell>
                                    <TableHeaderCell align="center">W</TableHeaderCell>
                                    <TableHeaderCell align="center">L</TableHeaderCell>
                                    <TableHeaderCell align="center">PCT</TableHeaderCell>
                                    <TableHeaderCell align="center">GB</TableHeaderCell>
                                    <TableHeaderCell align="center">HOME</TableHeaderCell>
                                    <TableHeaderCell align="center">AWAY</TableHeaderCell>
                                    <TableHeaderCell align="center">CONF</TableHeaderCell>
                                    <TableHeaderCell align="center">PPG</TableHeaderCell>
                                    <TableHeaderCell align="center">OPPG</TableHeaderCell>
                                    <TableHeaderCell align="center">DIFF</TableHeaderCell>
                                    <TableHeaderCell align="center">STRK</TableHeaderCell>
                                    <TableHeaderCell align="center">L10</TableHeaderCell>
                                </TableHead>
                                <TableBody>
                                    {sr.standingsContext.map(row => (
                                        <TableRow key={row.teamId} className={row.isUserTeam ? 'bg-indigo-900/20' : ''}>
                                            <TableCell align="center" className="text-xs font-mono text-white">{row.rank}</TableCell>
                                            <TableCell className="pl-4">
                                                <div className="flex items-center gap-2">
                                                    <TeamLogo teamId={row.teamId} size="sm" />
                                                    <span className={`text-xs font-bold truncate ${row.isUserTeam ? 'text-indigo-300' : 'text-slate-300'}`}>{row.teamName}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-white">{row.wins}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-white">{row.losses}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-white">{row.pct}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.gb}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.home}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.away}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.conf}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.ppg}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.oppg}</TableCell>
                                            <TableCell align="center" className={`text-xs font-mono ${
                                                parseFloat(row.diff) > 0 ? 'text-emerald-400' : parseFloat(row.diff) < 0 ? 'text-red-400' : 'text-slate-500'
                                            }`}>{row.diff}</TableCell>
                                            <TableCell align="center" className={`text-xs font-mono ${
                                                row.streak.startsWith('W') ? 'text-emerald-400' : row.streak.startsWith('L') ? 'text-red-400' : 'text-slate-500'
                                            }`}>{row.streak}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.l10}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            )}

            {/* Team Stats (user team with league ranks) */}
            {myTeamStats && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">팀 스탯</h3>
                        <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
                            {(['Traditional', 'Advanced', 'Opponent'] as TeamStatTab[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setTeamStatTab(tab)}
                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        teamStatTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    {SR_TAB_LABELS[tab]}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <Table className="!rounded-none !border-0 !shadow-none" style={{ minWidth: '100%' }}>
                            <TableHead className="bg-slate-950">
                                {cols.map(c => (
                                    <TableHeaderCell key={c.key} align="center" className="w-14">{c.label}</TableHeaderCell>
                                ))}
                            </TableHead>
                            <TableBody>
                                <TableRow>
                                    {cols.map(c => (
                                        <TableCell key={c.key} align="center" className={`text-xs font-mono tabular-nums ${
                                            c.fmt === 'diff'
                                                ? (myTeamStats.stats[c.key] > 0 ? 'text-emerald-400' : myTeamStats.stats[c.key] < 0 ? 'text-red-400' : 'text-slate-500')
                                                : 'text-white'
                                        }`}>
                                            {fmtStatVal(myTeamStats.stats[c.key], c.fmt)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                                <tr>
                                    {cols.map(c => {
                                        const rank = computeRank(c.key, c.inv);
                                        const rankColor = rank <= 10 ? 'text-emerald-400' : rank >= 21 ? 'text-red-400' : 'text-slate-500';
                                        return (
                                            <td key={c.key} className={`text-center text-[10px] font-bold py-1.5 bg-slate-950/50 border-t border-slate-800/50 ${rankColor}`}>
                                                {rank}위
                                            </td>
                                        );
                                    })}
                                </tr>
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* Roster Stats */}
            {sr.rosterStats && sr.rosterStats.length > 0 && (
                <div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">로스터 스탯</h3>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table className="!rounded-none !border-0 !shadow-none" style={{ minWidth: '100%' }}>
                                <TableHead className="bg-slate-950">
                                    <TableHeaderCell align="left" className="pl-4 min-w-[140px]">선수</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-10">POS</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-10">OVR</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-10">G</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">MIN</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">PTS</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">REB</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">AST</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">STL</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">BLK</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">TOV</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FGM</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FGA</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FG%</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">3PM</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">3PA</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">3P%</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FTM</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FTA</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FT%</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">+/-</TableHeaderCell>
                                </TableHead>
                                <TableBody>
                                    {sr.rosterStats.map(p => (
                                        <TableRow key={p.id} onClick={() => onPlayerClick(p.id)} className="cursor-pointer">
                                            <TableCell className="pl-4">
                                                <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">{p.name}</span>
                                            </TableCell>
                                            <TableCell align="center" className="text-xs text-slate-500">{p.position}</TableCell>
                                            <TableCell align="center"><OvrBadge value={p.ovr} size="sm" /></TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.g}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.mpg}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.pts}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.reb}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.ast}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.stl}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.blk}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.tov}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fgm}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fga}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.fgPct, 'pct')}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.p3m}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.p3a}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.p3Pct, 'pct')}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.ftm}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fta}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.ftPct, 'pct')}</TableCell>
                                            <TableCell align="center" className={`text-xs font-mono ${p.pm > 0 ? 'text-emerald-400' : p.pm < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                                {p.pm > 0 ? '+' : ''}{p.pm}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            )}

            {/* Trade History */}
            {sr.trades.length > 0 && (
                <div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <ArrowRightLeft size={14} className="text-indigo-400" /> 트레이드 내역
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
                                        <span className="text-[9px] font-black text-emerald-500 uppercase">영입</span>
                                        {t.acquired.map((p, i) => (
                                            <div key={i} className="flex items-center gap-2 mt-0.5">
                                                <OvrBadge value={p.ovr} size="sm" className="!w-5 !h-5 !text-[9px] !mx-0" />
                                                <span className="text-xs font-bold text-emerald-300">{p.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-black text-red-500 uppercase">방출</span>
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
                        <h4 className="text-xs font-bold text-red-400 uppercase tracking-wide mb-1">성적 경고</h4>
                        <p className="text-xs text-red-300/70 leading-relaxed">
                            팀 성적이 저조합니다. 오프시즌 동안 드래프트와 FA 영입을 통해 로스터를 재정비해야 합니다.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Sub-Component: Regular Season Champion Renderer ---

type ChampStatTab = 'Traditional' | 'Advanced';
const CHAMP_TAB_LABELS: Record<ChampStatTab, string> = { Traditional: '기본', Advanced: '어드밴스드' };
const CHAMP_TEAM_COLS: Record<ChampStatTab, { key: string; label: string; fmt: 'num' | 'pct' | 'diff'; inv?: boolean }[]> = {
    Traditional: [
        { key: 'pts', label: 'PTS', fmt: 'num' }, { key: 'pa', label: 'PA', fmt: 'num', inv: true },
        { key: 'reb', label: 'REB', fmt: 'num' }, { key: 'ast', label: 'AST', fmt: 'num' },
        { key: 'stl', label: 'STL', fmt: 'num' }, { key: 'blk', label: 'BLK', fmt: 'num' },
        { key: 'tov', label: 'TOV', fmt: 'num', inv: true },
        { key: 'fg%', label: 'FG%', fmt: 'pct' }, { key: '3p%', label: '3P%', fmt: 'pct' },
        { key: 'ft%', label: 'FT%', fmt: 'pct' }, { key: 'pm', label: '+/-', fmt: 'diff' },
    ],
    Advanced: [
        { key: 'ts%', label: 'TS%', fmt: 'pct' }, { key: 'efg%', label: 'eFG%', fmt: 'pct' },
        { key: 'tov%', label: 'TOV%', fmt: 'pct', inv: true }, { key: 'ast%', label: 'AST%', fmt: 'pct' },
        { key: 'stl%', label: 'STL%', fmt: 'pct' }, { key: 'blk%', label: 'BLK%', fmt: 'pct' },
        { key: '3par', label: '3PAr', fmt: 'pct' }, { key: 'ftr', label: 'FTr', fmt: 'pct' },
        { key: 'ortg', label: 'ORTG', fmt: 'num' }, { key: 'drtg', label: 'DRTG', fmt: 'num', inv: true },
        { key: 'nrtg', label: 'NRTG', fmt: 'diff' },
        { key: 'poss', label: 'POSS', fmt: 'num' }, { key: 'pace', label: 'PACE', fmt: 'num' },
    ],
};

const RegSeasonChampionRenderer: React.FC<{
    rc: RegSeasonChampionContent;
    championTeamId: string;
}> = ({ rc, championTeamId }) => {
    const [teamStatTab, setTeamStatTab] = useState<ChampStatTab>('Traditional');

    const champTeamStats = useMemo(() => {
        return rc.allTeamsStats?.find(t => t.teamId === championTeamId) ?? null;
    }, [rc.allTeamsStats, championTeamId]);

    const computeRank = useCallback((key: string, inverse?: boolean) => {
        if (!rc.allTeamsStats) return 0;
        const sorted = [...rc.allTeamsStats].sort((a, b) =>
            inverse ? (a.stats[key] ?? 0) - (b.stats[key] ?? 0) : (b.stats[key] ?? 0) - (a.stats[key] ?? 0)
        );
        return sorted.findIndex(t => t.teamId === championTeamId) + 1;
    }, [rc.allTeamsStats, championTeamId]);

    const cols = CHAMP_TEAM_COLS[teamStatTab];

    return (
        <div className="space-y-10 max-w-5xl mx-auto">
            {/* Trophy Header */}
            <div className="text-center space-y-4">
                <img src="/images/reg.png" alt="Regular Season Champion" className="mx-auto h-40 object-contain" />
                <h2 className="text-3xl font-black text-white tracking-tight">
                    {TEAM_DATA[championTeamId]?.city ?? ''} {rc.championTeamName}
                </h2>
                <p className="text-sm font-bold text-slate-400">
                    {rc.conference === 'East' ? '동부' : '서부'} 컨퍼런스&nbsp;&nbsp;|&nbsp;&nbsp;{rc.wins}승 {rc.losses}패 ({rc.pct})
                </p>
            </div>

            {/* Team Stats (champion team with league ranks) */}
            {champTeamStats && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">팀 스탯</h3>
                        <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
                            {(['Traditional', 'Advanced'] as ChampStatTab[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setTeamStatTab(tab)}
                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        teamStatTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    {CHAMP_TAB_LABELS[tab]}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <Table className="!rounded-none !border-0 !shadow-none" style={{ minWidth: '100%' }}>
                            <TableHead className="bg-slate-950">
                                {cols.map(c => (
                                    <TableHeaderCell key={c.key} align="center" className="w-14">{c.label}</TableHeaderCell>
                                ))}
                            </TableHead>
                            <TableBody>
                                <TableRow>
                                    {cols.map(c => (
                                        <TableCell key={c.key} align="center" className={`text-xs font-mono tabular-nums ${
                                            c.fmt === 'diff'
                                                ? (champTeamStats.stats[c.key] > 0 ? 'text-emerald-400' : champTeamStats.stats[c.key] < 0 ? 'text-red-400' : 'text-slate-500')
                                                : 'text-white'
                                        }`}>
                                            {fmtStatVal(champTeamStats.stats[c.key], c.fmt)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                                <tr>
                                    {cols.map(c => {
                                        const rank = computeRank(c.key, c.inv);
                                        const rankColor = rank <= 10 ? 'text-emerald-400' : rank >= 21 ? 'text-red-400' : 'text-slate-500';
                                        return (
                                            <td key={c.key} className={`text-center text-[10px] font-bold py-1.5 bg-slate-950/50 border-t border-slate-800/50 ${rankColor}`}>
                                                {rank}위
                                            </td>
                                        );
                                    })}
                                </tr>
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* Roster Stats */}
            {rc.rosterStats && rc.rosterStats.length > 0 && (
                <div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">로스터 스탯</h3>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table className="!rounded-none !border-0 !shadow-none" style={{ minWidth: '100%' }}>
                                <TableHead className="bg-slate-950">
                                    <TableHeaderCell align="left" className="pl-4 min-w-[140px] sticky left-0 bg-slate-950 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">선수</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-10">POS</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-10">OVR</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-10">G</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">MIN</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">PTS</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">REB</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">AST</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">STL</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">BLK</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">TOV</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FGM</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FGA</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FG%</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">3PM</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">3PA</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">3P%</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FTM</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FTA</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FT%</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">+/-</TableHeaderCell>
                                </TableHead>
                                <TableBody>
                                    {rc.rosterStats.map(p => (
                                        <TableRow key={p.id} className="hover:bg-white/5">
                                            <TableCell className="pl-4 sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                                                <span className="text-xs font-bold text-slate-300">{p.name}</span>
                                            </TableCell>
                                            <TableCell align="center" className="text-xs text-slate-500">{p.position}</TableCell>
                                            <TableCell align="center"><OvrBadge value={p.ovr} size="sm" /></TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.g}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.mpg}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.pts}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.reb}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.ast}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.stl}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.blk}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.tov}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fgm}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fga}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.fgPct, 'pct')}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.p3m}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.p3a}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.p3Pct, 'pct')}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.ftm}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fta}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.ftPct, 'pct')}</TableCell>
                                            <TableCell align="center" className={`text-xs font-mono ${p.pm > 0 ? 'text-emerald-400' : p.pm < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                                {p.pm > 0 ? '+' : ''}{p.pm}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Sub-Component: Playoff Champion Renderer ---

const PlayoffChampionRenderer: React.FC<{
    pc: PlayoffChampionContent;
    championTeamId: string;
}> = ({ pc, championTeamId }) => {
    const [teamStatTab, setTeamStatTab] = useState<ChampStatTab>('Traditional');

    const champTeamStats = useMemo(() => {
        return pc.allTeamsStats?.find(t => t.teamId === championTeamId) ?? null;
    }, [pc.allTeamsStats, championTeamId]);

    const computeRank = useCallback((key: string, inverse?: boolean) => {
        if (!pc.allTeamsStats) return 0;
        const sorted = [...pc.allTeamsStats].sort((a, b) =>
            inverse ? (a.stats[key] ?? 0) - (b.stats[key] ?? 0) : (b.stats[key] ?? 0) - (a.stats[key] ?? 0)
        );
        return sorted.findIndex(t => t.teamId === championTeamId) + 1;
    }, [pc.allTeamsStats, championTeamId]);

    const cols = CHAMP_TEAM_COLS[teamStatTab];

    return (
        <div className="space-y-10 max-w-5xl mx-auto">
            {/* Trophy Header */}
            <div className="text-center space-y-4">
                <img src="/images/final.png" alt="Playoff Champion" className="mx-auto h-40 object-contain" />
                <h2 className="text-3xl font-black text-white tracking-tight">
                    {TEAM_DATA[championTeamId]?.city ?? ''} {pc.championTeamName}
                </h2>
                <p className="text-sm font-bold text-slate-400">
                    {pc.conference === 'East' ? '동부' : '서부'} 컨퍼런스&nbsp;&nbsp;|&nbsp;&nbsp;플레이오프 {pc.playoffWins}승 {pc.playoffLosses}패
                </p>
            </div>

            {/* Team Stats (champion team with league ranks) */}
            {champTeamStats && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">플레이오프 팀 스탯</h3>
                        <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
                            {(['Traditional', 'Advanced'] as ChampStatTab[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setTeamStatTab(tab)}
                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        teamStatTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    {CHAMP_TAB_LABELS[tab]}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <Table className="!rounded-none !border-0 !shadow-none" style={{ minWidth: '100%' }}>
                            <TableHead className="bg-slate-950">
                                {cols.map(c => (
                                    <TableHeaderCell key={c.key} align="center" className="w-14">{c.label}</TableHeaderCell>
                                ))}
                            </TableHead>
                            <TableBody>
                                <TableRow>
                                    {cols.map(c => (
                                        <TableCell key={c.key} align="center" className={`text-xs font-mono tabular-nums ${
                                            c.fmt === 'diff'
                                                ? (champTeamStats.stats[c.key] > 0 ? 'text-emerald-400' : champTeamStats.stats[c.key] < 0 ? 'text-red-400' : 'text-slate-500')
                                                : 'text-white'
                                        }`}>
                                            {fmtStatVal(champTeamStats.stats[c.key], c.fmt)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                                <tr>
                                    {cols.map(c => {
                                        const rank = computeRank(c.key, c.inv);
                                        const rankColor = rank <= 3 ? 'text-emerald-400' : rank >= Math.ceil((pc.allTeamsStats?.length ?? 16) * 0.7) ? 'text-red-400' : 'text-slate-500';
                                        return (
                                            <td key={c.key} className={`text-center text-[10px] font-bold py-1.5 bg-slate-950/50 border-t border-slate-800/50 ${rankColor}`}>
                                                {rank}위
                                            </td>
                                        );
                                    })}
                                </tr>
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* Roster Stats */}
            {pc.rosterStats && pc.rosterStats.length > 0 && (
                <div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">플레이오프 로스터 스탯</h3>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table className="!rounded-none !border-0 !shadow-none" style={{ minWidth: '100%' }}>
                                <TableHead className="bg-slate-950">
                                    <TableHeaderCell align="left" className="pl-4 min-w-[140px] sticky left-0 bg-slate-950 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">선수</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-10">POS</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-10">OVR</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-10">G</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">MIN</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">PTS</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">REB</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">AST</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">STL</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">BLK</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">TOV</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FGM</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FGA</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FG%</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">3PM</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">3PA</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">3P%</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FTM</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FTA</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">FT%</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-12">+/-</TableHeaderCell>
                                </TableHead>
                                <TableBody>
                                    {pc.rosterStats.map(p => (
                                        <TableRow key={p.id} className="hover:bg-white/5">
                                            <TableCell className="pl-4 sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                                                <span className="text-xs font-bold text-slate-300">{p.name}</span>
                                            </TableCell>
                                            <TableCell align="center" className="text-xs text-slate-500">{p.position}</TableCell>
                                            <TableCell align="center"><OvrBadge value={p.ovr} size="sm" /></TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.g}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.mpg}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.pts}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.reb}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.ast}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.stl}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.blk}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-300">{p.tov}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fgm}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fga}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.fgPct, 'pct')}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.p3m}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.p3a}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.p3Pct, 'pct')}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.ftm}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fta}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.ftPct, 'pct')}</TableCell>
                                            <TableCell align="center" className={`text-xs font-mono ${p.pm > 0 ? 'text-emerald-400' : p.pm < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                                {p.pm > 0 ? '+' : ''}{p.pm}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            )}
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
    userId: string,
    onNavigateToHof: () => void,
}> = ({ type, content, teams, myTeamId, onPlayerClick, onViewGameResult, userId, onNavigateToHof }) => {
    
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
            return <SeasonReviewRenderer sr={sr} myTeamId={myTeamId} onPlayerClick={onPlayerClick} />;
        }

        case 'PLAYOFF_STAGE_REVIEW': {
            const ps = content as PlayoffStageReviewContent;
            const isWin = ps.result === 'WON';
            const myName = ps.myTeamName || '내 팀';
            const myId = ps.myTeamId || myTeamId;
            const sps = ps.seriesPlayerStats || [];

            return (
                <div className="space-y-8 max-w-5xl mx-auto">
                    {/* 1. GameRecap-style Header: Logo | Name | Score – Score | Name | Logo */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                            <TeamLogo teamId={myId} size="sm" />
                            <span className="text-sm font-black uppercase tracking-tight text-slate-300">{myName}</span>
                            <span className={`text-sm font-black tabular-nums ${isWin ? 'text-white' : 'text-slate-500'}`}>{ps.myWins}</span>
                            <span className="text-slate-600 font-bold text-lg">–</span>
                            <span className={`text-sm font-black tabular-nums ${!isWin ? 'text-white' : 'text-slate-500'}`}>{ps.myLosses}</span>
                            <span className="text-sm font-black uppercase tracking-tight text-slate-300">{ps.opponentName}</span>
                            <TeamLogo teamId={ps.opponentId} size="sm" />
                            <span className={`ml-1 text-[11px] font-black uppercase tracking-[0.15em] ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                {isWin ? '▲ SERIES WIN' : '▼ SERIES LOSS'}
                            </span>
                        </div>
                        <div className="border-t border-slate-700" />
                    </div>

                    {/* 2. Game Results Table */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-black text-slate-400 px-2 uppercase tracking-widest">경기 결과</h4>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                            <Table className="!rounded-none !border-0 !shadow-none">
                                <TableHead className="bg-slate-950">
                                    <TableHeaderCell align="center" className="w-20">경기</TableHeaderCell>
                                    <TableHeaderCell align="right">홈</TableHeaderCell>
                                    <TableHeaderCell align="center" className="w-24">스코어</TableHeaderCell>
                                    <TableHeaderCell align="left">원정</TableHeaderCell>
                                    <TableHeaderCell align="center">결과</TableHeaderCell>
                                    <TableHeaderCell align="center">상세</TableHeaderCell>
                                </TableHead>
                                <TableBody>
                                    {ps.games.map((g) => {
                                        const homeName = g.isHome ? myName : ps.opponentName;
                                        const awayName = g.isHome ? ps.opponentName : myName;
                                        const homeScore = g.isHome ? g.myScore : g.oppScore;
                                        const awayScore = g.isHome ? g.oppScore : g.myScore;
                                        return (
                                            <TableRow key={g.gameNum} className="hover:bg-white/5">
                                                <TableCell align="center" className="text-xs font-bold text-slate-400">{g.gameNum}차전</TableCell>
                                                <TableCell align="right" className="text-xs font-bold text-slate-300">{homeName}</TableCell>
                                                <TableCell align="center" className="text-xs font-mono tabular-nums">
                                                    <span className={homeScore > awayScore ? 'text-white font-black' : 'text-slate-500'}>{homeScore}</span>
                                                    <span className="text-slate-600 mx-1">–</span>
                                                    <span className={awayScore > homeScore ? 'text-white font-black' : 'text-slate-500'}>{awayScore}</span>
                                                </TableCell>
                                                <TableCell align="left" className="text-xs font-bold text-slate-300">{awayName}</TableCell>
                                                <TableCell align="center" className={`text-xs font-bold ${g.isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {g.isWin ? '승리' : '패배'}
                                                </TableCell>
                                                <TableCell align="center">
                                                    {g.gameId ? (
                                                        <button
                                                            onClick={() => handleViewDetails(g.gameId!)}
                                                            disabled={isFetchingResult}
                                                            className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50 px-2 py-1 rounded border border-indigo-500/30 hover:border-indigo-400/50"
                                                        >
                                                            {isFetchingResult ? '...' : '기록 보기'}
                                                        </button>
                                                    ) : (
                                                        <span className="text-slate-600 text-[10px]">-</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {/* 3. Aggregated Series Box Score */}
                    {sps.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-black text-slate-400 px-2 uppercase tracking-widest">시리즈 통합 스탯</h4>
                            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                                <Table className="!rounded-none !border-0 !shadow-none">
                                    <TableHead className="bg-slate-950">
                                        <TableHeaderCell align="left" className="pl-6 w-40 sticky left-0 bg-slate-950 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">PLAYER</TableHeaderCell>
                                        <TableHeaderCell align="center">GP</TableHeaderCell>
                                        <TableHeaderCell align="center">MIN</TableHeaderCell>
                                        <TableHeaderCell align="center">PTS</TableHeaderCell>
                                        <TableHeaderCell align="center">REB</TableHeaderCell>
                                        <TableHeaderCell align="center">AST</TableHeaderCell>
                                        <TableHeaderCell align="center">STL</TableHeaderCell>
                                        <TableHeaderCell align="center">BLK</TableHeaderCell>
                                        <TableHeaderCell align="center">TOV</TableHeaderCell>
                                        <TableHeaderCell align="center">FGM</TableHeaderCell>
                                        <TableHeaderCell align="center">FGA</TableHeaderCell>
                                        <TableHeaderCell align="center">FG%</TableHeaderCell>
                                        <TableHeaderCell align="center">3PM</TableHeaderCell>
                                        <TableHeaderCell align="center">3PA</TableHeaderCell>
                                        <TableHeaderCell align="center">3P%</TableHeaderCell>
                                        <TableHeaderCell align="center">FTM</TableHeaderCell>
                                        <TableHeaderCell align="center">FTA</TableHeaderCell>
                                        <TableHeaderCell align="center">FT%</TableHeaderCell>
                                        <TableHeaderCell align="center">PF</TableHeaderCell>
                                        <TableHeaderCell align="center">+/-</TableHeaderCell>
                                    </TableHead>
                                    <TableBody>
                                        {sps.map((p) => {
                                            const gp = p.gp || 1;
                                            const avg = (v: number) => (v / gp).toFixed(1);
                                            const pct = (m: number, a: number) => a > 0 ? (m / a * 100).toFixed(1) : '-';
                                            return (
                                                <TableRow key={p.playerId} className="hover:bg-white/5">
                                                    <TableCell className="pl-6 sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                                                        <span className="text-xs font-bold text-slate-200">{p.playerName}</span>
                                                    </TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{p.gp}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.mp)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.pts)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.reb)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.ast)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.stl)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.blk)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.tov)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.fgm)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.fga)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{pct(p.fgm, p.fga)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.p3m)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.p3a)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{pct(p.p3m, p.p3a)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.ftm)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.fta)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{pct(p.ftm, p.fta)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.pf)}</TableCell>
                                                    <TableCell align="center" className={`text-xs font-mono tabular-nums ${p.plusMinus >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {p.plusMinus > 0 ? '+' : ''}{(p.plusMinus / gp).toFixed(1)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

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

        case 'OWNER_LETTER': {
            const ol = content as OwnerLetterContent;
            return (
                <div className="space-y-8 text-slate-300 leading-relaxed">
                    <p>{ol.msg}</p>
                    <div className="pt-4">
                        <p className="text-slate-400 text-sm">Best regards,</p>
                        <p className="text-white font-bold mt-1">{ol.ownerName}</p>
                        <p className="text-slate-500 text-xs mt-0.5">Owner</p>
                    </div>
                </div>
            );
        }

        case 'HOF_QUALIFICATION': {
            const hof = content as HofQualificationContent;
            const isChampion = hof.result === 'WON';
            const scoreLabels = [
                { key: '정규시즌', value: hof.breakdown.season_score },
                { key: '득실차', value: hof.breakdown.ptDiff_score },
                { key: '팀 스탯', value: hof.breakdown.stat_score },
                { key: '플레이오프', value: hof.breakdown.playoff_score },
            ];
            return (
                <div className="space-y-8 max-w-2xl mx-auto">
                    {/* Status Banner */}
                    <div className={`p-8 rounded-3xl border relative overflow-hidden ${isChampion ? 'bg-amber-950/20 border-amber-500/30' : 'bg-slate-800/40 border-slate-700/50'}`}>
                        <div className="flex items-center gap-5">
                            <div className={`p-4 rounded-2xl ${isChampion ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700/50 text-slate-400'}`}>
                                {isChampion ? <Crown size={32} /> : <Trophy size={32} />}
                            </div>
                            <div>
                                <h3 className={`text-xl font-black uppercase tracking-tight ${isChampion ? 'text-amber-300' : 'text-slate-200'}`}>
                                    {isChampion ? '챔피언십 우승' : '파이널 준우승'}
                                </h3>
                                <p className="text-sm text-slate-400 mt-1">{hof.teamName}</p>
                            </div>
                        </div>
                    </div>

                    {/* Total Score */}
                    <div className="text-center py-4">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">명예의 전당 점수</span>
                        <span className={`text-5xl font-black tabular-nums ${isChampion ? 'text-amber-400' : 'text-white'}`}>
                            {hof.totalScore.toFixed(1)}
                        </span>
                    </div>

                    {/* Breakdown Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {scoreLabels.map(({ key, value }) => (
                            <div key={key} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 text-center">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">{key}</span>
                                <span className="text-xl font-black text-white tabular-nums">{value.toFixed(1)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Navigate Button */}
                    <div className="pt-4">
                        <button
                            onClick={onNavigateToHof}
                            className="w-full py-4 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3"
                        >
                            <Crown size={18} />
                            명예의 전당 보기
                        </button>
                    </div>
                </div>
            );
        }

        case 'FINALS_MVP': {
            const fm = content as FinalsMvpContent;
            const mvpGp = fm.stats.gp || 1;
            const mvpAvg = (v: number) => (v / mvpGp).toFixed(1);
            const mvpPct = (m: number, a: number) => a > 0 ? (m / a * 100).toFixed(1) + '%' : '-';
            const lb = fm.leaderboard || [];

            return (
                <div className="space-y-8 max-w-5xl mx-auto">
                    {/* Hero Section */}
                    <div className="text-center space-y-4">
                        <img src="/images/fmvp.png" alt="Finals MVP Trophy" className="mx-auto h-40 object-contain" />
                        <h2 className="text-3xl font-black text-white tracking-tight">{fm.mvpPlayerName}</h2>
                        <p className="text-sm font-bold text-slate-400">
                            {TEAM_DATA[fm.mvpTeamId]?.city ?? ''} {fm.mvpTeamName}&nbsp;&nbsp;|&nbsp;&nbsp;시리즈 {fm.seriesScore}
                        </p>
                    </div>

                    {/* Core Stats Grid */}
                    <div className="grid grid-cols-5 gap-3">
                        {[
                            { label: 'PPG', value: mvpAvg(fm.stats.pts) },
                            { label: 'RPG', value: mvpAvg(fm.stats.reb) },
                            { label: 'APG', value: mvpAvg(fm.stats.ast) },
                            { label: 'FG%', value: mvpPct(fm.stats.fgm, fm.stats.fga) },
                            { label: '+/-', value: (fm.stats.plusMinus >= 0 ? '+' : '') + mvpAvg(fm.stats.plusMinus) },
                        ].map(({ label, value }) => (
                            <div key={label} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-center">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{label}</span>
                                <span className="text-lg font-black text-white tabular-nums">{value}</span>
                            </div>
                        ))}
                    </div>

                    {/* News Article Body */}
                    <div className="space-y-4 px-2">
                        <p className="text-slate-300 leading-relaxed text-sm">
                            <span className="font-black text-white">{fm.mvpPlayerName}</span>이(가)&nbsp;
                            <span className="font-black text-white">{fm.mvpTeamName}</span>을(를) 시리즈 전적&nbsp;
                            <span className="font-black text-amber-400">{fm.seriesScore}</span>의 우승으로 이끌며&nbsp;
                            <span className="font-black text-amber-400">2025-26 시즌 파이널 MVP</span>로 선정되었다.
                        </p>
                        <p className="text-slate-400 leading-relaxed text-sm">
                            {fm.mvpPlayerName}은(는) 파이널 {mvpGp}경기 동안 평균 {mvpAvg(fm.stats.pts)}득점 {mvpAvg(fm.stats.reb)}리바운드 {mvpAvg(fm.stats.ast)}어시스트를 기록하며
                            {' '}{fm.opponentTeamName}을(를) 상대로 압도적인 활약을 펼쳤다.
                            {fm.stats.p3a > 0 && ` 3점슛 성공률 ${mvpPct(fm.stats.p3m, fm.stats.p3a)}의 효율적인 슈팅도 눈에 띄었다.`}
                        </p>
                    </div>

                    {/* Leaderboard Table */}
                    {lb.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-black text-slate-400 px-2 uppercase tracking-widest">우승팀 파이널 시리즈 스탯</h4>
                            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                                <Table className="!rounded-none !border-0 !shadow-none">
                                    <TableHead className="bg-slate-950">
                                        <TableHeaderCell align="left" className="pl-6 w-40 sticky left-0 bg-slate-950 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">PLAYER</TableHeaderCell>
                                        <TableHeaderCell align="center">GP</TableHeaderCell>
                                        <TableHeaderCell align="center">MIN</TableHeaderCell>
                                        <TableHeaderCell align="center">PTS</TableHeaderCell>
                                        <TableHeaderCell align="center">REB</TableHeaderCell>
                                        <TableHeaderCell align="center">AST</TableHeaderCell>
                                        <TableHeaderCell align="center">STL</TableHeaderCell>
                                        <TableHeaderCell align="center">BLK</TableHeaderCell>
                                        <TableHeaderCell align="center">TOV</TableHeaderCell>
                                        <TableHeaderCell align="center">FGM</TableHeaderCell>
                                        <TableHeaderCell align="center">FGA</TableHeaderCell>
                                        <TableHeaderCell align="center">FG%</TableHeaderCell>
                                        <TableHeaderCell align="center">3PM</TableHeaderCell>
                                        <TableHeaderCell align="center">3PA</TableHeaderCell>
                                        <TableHeaderCell align="center">3P%</TableHeaderCell>
                                        <TableHeaderCell align="center">FTM</TableHeaderCell>
                                        <TableHeaderCell align="center">FTA</TableHeaderCell>
                                        <TableHeaderCell align="center">FT%</TableHeaderCell>
                                        <TableHeaderCell align="center">PF</TableHeaderCell>
                                        <TableHeaderCell align="center">+/-</TableHeaderCell>
                                    </TableHead>
                                    <TableBody>
                                        {lb.map((p, idx) => {
                                            const gp = p.gp || 1;
                                            const avg = (v: number) => (v / gp).toFixed(1);
                                            const pct = (m: number, a: number) => a > 0 ? (m / a * 100).toFixed(1) : '-';
                                            const isMvp = p.playerId === fm.mvpPlayerId;
                                            return (
                                                <TableRow key={p.playerId} className={isMvp ? 'bg-amber-500/5' : 'hover:bg-white/5'}>
                                                    <TableCell className="pl-6 sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]" style={{ backgroundColor: isMvp ? 'rgba(245,158,11,0.05)' : 'rgb(15,23,42)' }}>
                                                        <div className="flex items-center gap-2">
                                                            {isMvp && <Trophy size={12} className="text-amber-400 flex-shrink-0" />}
                                                            <span className={`text-xs font-bold ${isMvp ? 'text-amber-300' : 'text-slate-200'}`}>{p.playerName}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{p.gp}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.mp)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.pts)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.reb)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.ast)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.stl)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.blk)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.tov)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.fgm)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.fga)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{pct(p.fgm, p.fga)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.p3m)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.p3a)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{pct(p.p3m, p.p3a)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.ftm)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.fta)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{pct(p.ftm, p.fta)}</TableCell>
                                                    <TableCell align="center" className="text-xs font-mono tabular-nums text-slate-300">{avg(p.pf)}</TableCell>
                                                    <TableCell align="center" className={`text-xs font-mono tabular-nums ${p.plusMinus >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {p.plusMinus > 0 ? '+' : ''}{(p.plusMinus / gp).toFixed(1)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        case 'REG_SEASON_CHAMPION': {
            const rc = content as RegSeasonChampionContent;
            return (
                <RegSeasonChampionRenderer rc={rc} championTeamId={rc.championTeamId} />
            );
        }

        case 'PLAYOFF_CHAMPION': {
            const pc = content as PlayoffChampionContent;
            return (
                <PlayoffChampionRenderer pc={pc} championTeamId={pc.championTeamId} />
            );
        }

        default:
            return <div className="text-slate-400 text-sm">표시할 내용이 없습니다.</div>;
    }
};

// --- Sub-Component: Awards Report Viewer ---

const AwardsReportViewer: React.FC<{
    content: SeasonAwardsContent;
    teams: Team[];
    onPlayerClick: (id: string) => void;
}> = ({ content, teams, onPlayerClick }) => {
    const [showBallots, setShowBallots] = useState(false);

    const formatStat = (v: number | undefined, decimals = 1) => (v ?? 0).toFixed(decimals);
    const formatPct = (v: number | undefined) => (v != null && v > 0) ? ((v * 100).toFixed(1) + '%') : '-';

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

    const sectionLabel = "text-xs font-black uppercase tracking-widest text-slate-300 mb-3";
    const thClass = "py-2.5 px-2 text-xs font-bold uppercase tracking-wide text-slate-300 whitespace-nowrap border-b border-slate-600 bg-slate-800/80";
    const tdClass = "py-2 px-2 text-xs font-mono tabular-nums text-slate-300 whitespace-nowrap border-b border-slate-700/60";

    const mvpWinner = content.mvpRanking[0] ?? null;
    const dpoyWinner = content.dpoyRanking[0] ?? null;

    return (
        <div className="space-y-10 max-w-6xl mx-auto">
            {/* ── Award Winner Heroes ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {mvpWinner && (
                    <div className="text-center space-y-3">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">MVP 2025-26</p>
                        <img src="/images/mvp.png" alt="MVP Trophy" className="mx-auto h-32 object-contain" />
                        <div className="flex items-center justify-center gap-2">
                            <span className="text-lg font-black text-white">{mvpWinner.playerName}</span>
                            <OvrBadge value={mvpWinner.ovr} size="sm" />
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            <TeamLogo teamId={mvpWinner.teamId} size="xs" />
                            <span className="text-xs font-bold text-slate-400">
                                {TEAM_DATA[mvpWinner.teamId]?.city ?? ''} {TEAM_DATA[mvpWinner.teamId]?.name ?? ''}
                            </span>
                        </div>
                    </div>
                )}
                {dpoyWinner && (
                    <div className="text-center space-y-3">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">DPOY 2025-26</p>
                        <img src="/images/dpoy.png" alt="DPOY Trophy" className="mx-auto h-32 object-contain" />
                        <div className="flex items-center justify-center gap-2">
                            <span className="text-lg font-black text-white">{dpoyWinner.playerName}</span>
                            <OvrBadge value={dpoyWinner.ovr} size="sm" />
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            <TeamLogo teamId={dpoyWinner.teamId} size="xs" />
                            <span className="text-xs font-bold text-slate-400">
                                {TEAM_DATA[dpoyWinner.teamId]?.city ?? ''} {TEAM_DATA[dpoyWinner.teamId]?.name ?? ''}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── MVP 투표 결과 ── */}
            {content.mvpRanking.length > 0 && (
                <div>
                    <h3 className={sectionLabel}>MVP 투표 결과</h3>
                    <div className="border border-slate-600 rounded-lg overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr>
                                    <th className={`${thClass} text-center w-8`}>#</th>
                                    <th className={`${thClass} text-center w-10`}>OVR</th>
                                    <th className={`${thClass} text-left pl-3 min-w-[160px]`}>선수</th>
                                    <th className={`${thClass} text-center`}>포지션</th>
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
                                            className={`hover:bg-white/5 cursor-pointer ${idx === 0 ? 'bg-amber-500/10' : idx % 2 === 0 ? 'bg-slate-800/30' : ''}`}
                                            onClick={() => onPlayerClick(r.playerId)}
                                        >
                                            <td className={`${tdClass} text-center font-bold ${idx === 0 ? 'text-amber-400' : 'text-slate-400'}`}>{idx + 1}</td>
                                            <td className={`${tdClass} text-center`}><OvrBadge value={r.ovr} size="sm" className="!w-6 !h-6 !text-xs !mx-auto" /></td>
                                            <td className={`${tdClass} pl-3 ${idx === 0 ? 'text-amber-300' : 'text-slate-200'} hover:text-white`}>
                                                <div className="flex items-center gap-1.5">
                                                    <TeamLogo teamId={r.teamId} size="xs" />
                                                    <span className="font-bold">{r.playerName}</span>
                                                    {idx === 0 && <span className="text-amber-400">★</span>}
                                                </div>
                                            </td>
                                            <td className={`${tdClass} text-center text-slate-400`}>{r.position}</td>
                                            <td className={`${tdClass} text-center ${votes[0] > 0 ? 'text-amber-300 font-bold' : 'text-slate-500'}`}>{votes[0]}</td>
                                            <td className={`${tdClass} text-center ${votes[1] > 0 ? 'text-slate-200' : 'text-slate-500'}`}>{votes[1]}</td>
                                            <td className={`${tdClass} text-center ${votes[2] > 0 ? 'text-slate-200' : 'text-slate-500'}`}>{votes[2]}</td>
                                            <td className={`${tdClass} text-center ${votes[3] > 0 ? 'text-slate-300' : 'text-slate-500'}`}>{votes[3]}</td>
                                            <td className={`${tdClass} text-center ${votes[4] > 0 ? 'text-slate-300' : 'text-slate-500'}`}>{votes[4]}</td>
                                            <td className={`${tdClass} text-center text-white`}>{r.points}</td>
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
                    <h3 className={sectionLabel}>DPOY 투표 결과</h3>
                    <div className="border border-slate-600 rounded-lg overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr>
                                    <th className={`${thClass} text-center w-8`}>#</th>
                                    <th className={`${thClass} text-center w-10`}>OVR</th>
                                    <th className={`${thClass} text-left pl-3`}>선수</th>
                                    <th className={`${thClass} text-center`}>포지션</th>
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
                                            className={`hover:bg-white/5 cursor-pointer ${idx === 0 ? 'bg-amber-500/10' : idx % 2 === 0 ? 'bg-slate-800/30' : ''}`}
                                            onClick={() => onPlayerClick(r.playerId)}
                                        >
                                            <td className={`${tdClass} text-center font-bold ${idx === 0 ? 'text-amber-400' : 'text-slate-400'}`}>{idx + 1}</td>
                                            <td className={`${tdClass} text-center`}><OvrBadge value={r.ovr} size="sm" className="!w-6 !h-6 !text-xs !mx-auto" /></td>
                                            <td className={`${tdClass} pl-3 ${idx === 0 ? 'text-amber-300' : 'text-slate-200'} hover:text-white`}>
                                                <div className="flex items-center gap-1.5">
                                                    <TeamLogo teamId={r.teamId} size="xs" />
                                                    <span className="font-bold">{r.playerName}</span>
                                                    {idx === 0 && <span className="text-amber-400">★</span>}
                                                </div>
                                            </td>
                                            <td className={`${tdClass} text-center text-slate-400`}>{r.position}</td>
                                            <td className={`${tdClass} text-center ${votes[0] > 0 ? 'text-amber-300 font-bold' : 'text-slate-500'}`}>{votes[0]}</td>
                                            <td className={`${tdClass} text-center ${votes[1] > 0 ? 'text-slate-200' : 'text-slate-500'}`}>{votes[1]}</td>
                                            <td className={`${tdClass} text-center ${votes[2] > 0 ? 'text-slate-200' : 'text-slate-500'}`}>{votes[2]}</td>
                                            <td className={`${tdClass} text-center text-white`}>{r.points}</td>
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
                    <h3 className={sectionLabel}>올-NBA 팀</h3>
                    <div className="border border-slate-600 rounded-lg overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr>
                                    <th className={`${thClass} text-center w-14 border-r border-slate-600`}>팀</th>
                                    <th className={`${thClass} text-center`}>포지션</th>
                                    <th className={`${thClass} text-center w-10`}>OVR</th>
                                    <th className={`${thClass} text-left pl-3`}>선수</th>
                                    <th className={`${thClass} text-center`}>1st</th>
                                    <th className={`${thClass} text-center`}>2nd</th>
                                    <th className={`${thClass} text-center`}>3rd</th>
                                    <th className={`${thClass} text-center`}>PTS</th>
                                    <th className={`${thClass} text-center`}>PPG</th>
                                    <th className={`${thClass} text-center`}>RPG</th>
                                    <th className={`${thClass} text-center`}>APG</th>
                                    <th className={`${thClass} text-center`}>STL</th>
                                    <th className={`${thClass} text-center`}>BLK</th>
                                    <th className={`${thClass} text-center`}>FG%</th>
                                    <th className={`${thClass} text-center`}>3P%</th>
                                    <th className={`${thClass} text-center`}>TS%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {content.allNbaTeams.map((team) =>
                                    team.players.map((p, pIdx) => {
                                        const tv = p.tierVotes || [];
                                        const tp = p.totalPoints ?? p.votes;
                                        const isLastInGroup = pIdx === team.players.length - 1 && team.tier < 3;
                                        const rowTd = isLastInGroup ? tdClass.replace('border-slate-700/60', 'border-slate-600') : tdClass;
                                        return (
                                            <tr
                                                key={`nba-${team.tier}-${p.playerId}`}
                                                className={`hover:bg-white/5 cursor-pointer ${pIdx % 2 === 0 ? 'bg-slate-800/30' : ''}`}
                                                onClick={() => onPlayerClick(p.playerId)}
                                            >
                                                {pIdx === 0 && (
                                                    <td
                                                        rowSpan={team.players.length}
                                                        className={`py-2 px-2 text-center align-middle border-b border-slate-600 border-r border-r-slate-600 font-black text-sm ${
                                                            team.tier === 1 ? 'text-amber-400' : team.tier === 2 ? 'text-slate-200' : 'text-slate-400'
                                                        }`}
                                                    >
                                                        {team.tier === 1 ? '1ST' : team.tier === 2 ? '2ND' : '3RD'}
                                                    </td>
                                                )}
                                                <td className={`${rowTd} text-center text-slate-400`}>{p.pos}</td>
                                                <td className={`${rowTd} text-center`}><OvrBadge value={p.ovr} size="sm" className="!w-6 !h-6 !text-xs !mx-auto" /></td>
                                                <td className={`${rowTd} pl-3 text-slate-200 hover:text-white`}>
                                                    <div className="flex items-center gap-1.5">
                                                        <TeamLogo teamId={p.teamId} size="xs" />
                                                        <span className="font-bold">{p.playerName}</span>
                                                    </div>
                                                </td>
                                                <td className={`${rowTd} text-center ${(tv[0] || 0) > 0 ? 'text-amber-300' : 'text-slate-500'}`}>{tv[0] || 0}</td>
                                                <td className={`${rowTd} text-center ${(tv[1] || 0) > 0 ? 'text-slate-200' : 'text-slate-500'}`}>{tv[1] || 0}</td>
                                                <td className={`${rowTd} text-center ${(tv[2] || 0) > 0 ? 'text-slate-300' : 'text-slate-500'}`}>{tv[2] || 0}</td>
                                                <td className={`${rowTd} text-center text-white`}>{tp}</td>
                                                <td className={`${rowTd} text-center`}>{formatStat(p.statLine.ppg)}</td>
                                                <td className={`${rowTd} text-center`}>{formatStat(p.statLine.rpg)}</td>
                                                <td className={`${rowTd} text-center`}>{formatStat(p.statLine.apg)}</td>
                                                <td className={`${rowTd} text-center`}>{formatStat(p.statLine.spg)}</td>
                                                <td className={`${rowTd} text-center`}>{formatStat(p.statLine.bpg)}</td>
                                                <td className={`${rowTd} text-center`}>{formatPct(p.statLine.fgPct)}</td>
                                                <td className={`${rowTd} text-center`}>{formatPct(p.statLine.p3Pct)}</td>
                                                <td className={`${rowTd} text-center`}>{formatPct(p.statLine.tsPct)}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── 올-디펜시브 팀 ── */}
            {content.allDefTeams.length > 0 && (
                <div>
                    <h3 className={sectionLabel}>올-디펜시브 팀</h3>
                    <div className="border border-slate-600 rounded-lg overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr>
                                    <th className={`${thClass} text-center w-14 border-r border-slate-600`}>팀</th>
                                    <th className={`${thClass} text-center`}>포지션</th>
                                    <th className={`${thClass} text-center w-10`}>OVR</th>
                                    <th className={`${thClass} text-left pl-3`}>선수</th>
                                    <th className={`${thClass} text-center`}>1st</th>
                                    <th className={`${thClass} text-center`}>2nd</th>
                                    <th className={`${thClass} text-center`}>PTS</th>
                                    <th className={`${thClass} text-center`}>SPG</th>
                                    <th className={`${thClass} text-center`}>BPG</th>
                                    <th className={`${thClass} text-center`}>OREB</th>
                                    <th className={`${thClass} text-center`}>DREB</th>
                                </tr>
                            </thead>
                            <tbody>
                                {content.allDefTeams.map((team) =>
                                    team.players.map((p, pIdx) => {
                                        const tv = p.tierVotes || [];
                                        const tp = p.totalPoints ?? p.votes;
                                        const isLastInGroup = pIdx === team.players.length - 1 && team.tier < 2;
                                        const rowTd = isLastInGroup ? tdClass.replace('border-slate-700/60', 'border-slate-600') : tdClass;
                                        return (
                                            <tr
                                                key={`def-${team.tier}-${p.playerId}`}
                                                className={`hover:bg-white/5 cursor-pointer ${pIdx % 2 === 0 ? 'bg-slate-800/30' : ''}`}
                                                onClick={() => onPlayerClick(p.playerId)}
                                            >
                                                {pIdx === 0 && (
                                                    <td
                                                        rowSpan={team.players.length}
                                                        className={`py-2 px-2 text-center align-middle border-b border-slate-600 border-r border-r-slate-600 font-black text-sm ${
                                                            team.tier === 1 ? 'text-indigo-400' : 'text-slate-300'
                                                        }`}
                                                    >
                                                        {team.tier === 1 ? '1ST' : '2ND'}
                                                    </td>
                                                )}
                                                <td className={`${rowTd} text-center text-slate-400`}>{p.pos}</td>
                                                <td className={`${rowTd} text-center`}><OvrBadge value={p.ovr} size="sm" className="!w-6 !h-6 !text-xs !mx-auto" /></td>
                                                <td className={`${rowTd} pl-3 text-slate-200 hover:text-white`}>
                                                    <div className="flex items-center gap-1.5">
                                                        <TeamLogo teamId={p.teamId} size="xs" />
                                                        <span className="font-bold">{p.playerName}</span>
                                                    </div>
                                                </td>
                                                <td className={`${rowTd} text-center ${(tv[0] || 0) > 0 ? 'text-indigo-300' : 'text-slate-500'}`}>{tv[0] || 0}</td>
                                                <td className={`${rowTd} text-center ${(tv[1] || 0) > 0 ? 'text-slate-200' : 'text-slate-500'}`}>{tv[1] || 0}</td>
                                                <td className={`${rowTd} text-center text-white`}>{tp}</td>
                                                <td className={`${rowTd} text-center`}>{formatStat(p.statLine.spg)}</td>
                                                <td className={`${rowTd} text-center`}>{formatStat(p.statLine.bpg)}</td>
                                                <td className={`${rowTd} text-center`}>{formatStat(p.statLine.orebpg)}</td>
                                                <td className={`${rowTd} text-center`}>{formatStat(p.statLine.drebpg)}</td>
                                            </tr>
                                        );
                                    })
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
                        className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-300 hover:text-white transition-colors mb-3"
                    >
                        {showBallots ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>MVP 전체 투표 내역 ({content.ballots.length}명)</span>
                    </button>
                    {showBallots && (
                        <div className="border border-slate-600 rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10">
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
                                        <tr key={b.voterId} className={`hover:bg-white/5 ${b.voterId % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                                            <td className={`${tdClass} text-center font-bold text-slate-400`}>#{String(b.voterId + 1).padStart(2, '0')}</td>
                                            {b.mvp.map((pid, i) => (
                                                <td
                                                    key={i}
                                                    className={`${tdClass} text-center cursor-pointer hover:text-white ${i === 0 ? 'text-amber-300 font-bold' : 'text-slate-300'}`}
                                                    onClick={() => onPlayerClick(pid)}
                                                >
                                                    {getPlayerName(pid).split(' ').pop()}
                                                </td>
                                            ))}
                                            {Array.from({ length: Math.max(0, 5 - b.mvp.length) }).map((_, i) => (
                                                <td key={`empty-${i}`} className={`${tdClass} text-center text-slate-500`}>-</td>
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

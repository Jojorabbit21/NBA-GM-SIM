import React, { useState } from 'react';
import { ArrowRightLeft, Trophy } from 'lucide-react';
import { MessageType, GameRecapContent, TradeAlertContent, InjuryReportContent, SuspensionContent, LeagueNewsContent, SeasonReviewContent, PlayoffStageReviewContent, OwnerLetterContent, HofQualificationContent, FinalsMvpContent, RegSeasonChampionContent, PlayoffChampionContent, ScoutReportContent, Team } from '../../types';
import { TradeOfferReceivedContent, TradeOfferResponseContent, OffseasonReportContent, ProspectRevealContent, LotteryResultContent, DraftResultContent, RetirementNewsContent } from '../../types/message';
import type { SeasonAwardsContent } from '../../utils/awardVoting';
import { fetchFullGameResult } from '../../services/queries';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';
import { formatMoney } from '../../utils/formatMoney';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';

import { GameRecapViewer } from './GameRecapViewer';
import { SeasonReviewRenderer } from './SeasonReviewRenderer';
import { RegSeasonChampionRenderer } from './RegSeasonChampionRenderer';
import { PlayoffChampionRenderer } from './PlayoffChampionRenderer';
import { HofQualificationRenderer } from './HofQualificationRenderer';
import { AwardsReportViewer } from './AwardsReportViewer';
import { ScoutReportRenderer } from './ScoutReportRenderer';

interface MessageContentRendererProps {
    type: MessageType;
    content: any;
    teams: Team[];
    myTeamId: string;
    onPlayerClick: (id: string) => void;
    onViewGameResult: (result: any) => void;
    userId: string;
    onNavigateToHof: () => void;
    onNavigateToDraft?: () => void;
    onNavigateToDraftLottery?: () => void;
    seasonShort?: string;
    onTeamOptionDecide?: (playerId: string, exercised: boolean) => void;
}

export const MessageContentRenderer: React.FC<MessageContentRendererProps> = ({ type, content, teams, myTeamId, onPlayerClick, onViewGameResult, userId, onNavigateToHof, onNavigateToDraft, onNavigateToDraftLottery, seasonShort = '2025-26', onTeamOptionDecide }) => {

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
                    pbpLogs: raw.pbp_logs || [],
                    pbpShotEvents: raw.shot_events || [],
                    rotationData: raw.rotation_data,
                    quarterScoresData: raw.quarter_scores,
                    otherGames: [],
                    date: raw.date,
                    recap: []
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

        case 'INJURY_REPORT': {
            const injuryData = content as InjuryReportContent;
            const isRecovery = !!injuryData.isRecovery;
            return (
                <div className="space-y-8 text-slate-300 leading-relaxed">
                    {isRecovery ? (
                        <p>
                            단장님, <button className="text-white font-bold hover:text-indigo-400 transition-colors" onClick={() => onPlayerClick(injuryData.playerId)}>{injuryData.playerName}</button> 선수가
                            <span className="text-emerald-400 font-bold"> {injuryData.injuryType}</span> 부상에서 완전히 회복하여
                            오늘부로 팀 훈련에 정상 복귀하였음을 알려드립니다.
                        </p>
                    ) : (
                        <>
                            <p>
                                단장님, <button className="text-white font-bold hover:text-indigo-400 transition-colors" onClick={() => onPlayerClick(injuryData.playerId)}>{injuryData.playerName}</button> 선수가
                                {injuryData.isTrainingInjury ? ' 훈련 중 ' : ' 경기 중 '}부상을 당했음을 보고드립니다.
                            </p>
                            <div className="pl-3 space-y-1 text-sm">
                                <p><span className="text-slate-500">부상명:</span> <span className="text-white font-bold">{injuryData.injuryType}</span></p>
                                <p><span className="text-slate-500">부상 정도:</span> <span className={injuryData.severity === 'Season-Ending' ? 'text-red-500 font-black' : injuryData.severity === 'Major' ? 'text-rose-400 font-bold' : 'text-slate-300 font-bold'}>{injuryData.severity === 'Season-Ending' ? '시즌아웃' : injuryData.severity === 'Major' ? '중상' : '경상'}</span></p>
                                {injuryData.isTrainingInjury && <p><span className="text-slate-500">발생 경위:</span> <span className="text-amber-400 font-bold">팀 훈련 중</span></p>}
                                <p><span className="text-slate-500">예상 결장 기간:</span> <span className="text-white font-bold">{injuryData.duration}</span></p>
                                <p><span className="text-slate-500">복귀 예정일:</span> <span className="text-white font-bold">{injuryData.returnDate}</span></p>
                            </div>
                        </>
                    )}
                    <div className="pt-4">
                        <p className="text-white font-bold">수석 트레이너</p>
                        <p className="text-slate-500 text-xs mt-0.5">Head Athletic Trainer</p>
                    </div>
                </div>
            );
        }

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
                    seasonShort={seasonShort}
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
            return (
                <HofQualificationRenderer hof={hof} onNavigateToHof={onNavigateToHof} />
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
                            <span className="font-black text-amber-400">{seasonShort} 시즌 파이널 MVP</span>로 선정되었다.
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
                                        {lb.map((p, _idx) => {
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

        case 'SCOUT_REPORT': {
            const sc = content as ScoutReportContent;
            return <ScoutReportRenderer content={sc} teams={teams} onPlayerClick={onPlayerClick} />;
        }

        case 'SUSPENSION': {
            const susp = content as SuspensionContent;
            const oppTeamData = TEAM_DATA[susp.opponentTeamId];
            return (
                <div className="space-y-8 text-slate-300 leading-relaxed">
                    <p>단장님,</p>
                    <p>
                        금일 경기 중 우리 팀의{' '}
                        <button className="text-white font-bold hover:text-indigo-400 transition-colors" onClick={() => onPlayerClick(susp.playerId)}>
                            {susp.playerName}
                        </button>{' '}
                        선수가 {oppTeamData?.city ?? ''} {susp.opponentTeamName}의{' '}
                        <button className="text-white font-bold hover:text-indigo-400 transition-colors" onClick={() => onPlayerClick(susp.opponentPlayerId)}>
                            {susp.opponentPlayerName}
                        </button>{' '}
                        선수와 경기 중 물리적 충돌을 일으켰음을 보고드립니다.
                    </p>
                    <p>
                        리그 사무국은 해당 사건을 검토한 결과,{' '}
                        <span className="text-red-400 font-bold">{susp.playerName}</span> 선수에게{' '}
                        <span className="text-red-400 font-black">{susp.suspensionGames}경기 출장정지</span> 징계를 내렸습니다.
                    </p>
                    <div className="pl-3 space-y-1 text-sm">
                        <p><span className="text-slate-500">징계 대상:</span> <span className="text-white font-bold">{susp.playerName}</span></p>
                        <p><span className="text-slate-500">사유:</span> <span className="text-red-400 font-bold">경기 중 싸움 (Physical Altercation)</span></p>
                        <p><span className="text-slate-500">징계:</span> <span className="text-white font-bold">{susp.suspensionGames}경기 출장정지</span></p>
                        <p><span className="text-slate-500">복귀 예정일:</span> <span className="text-white font-bold">{susp.returnDate}</span></p>
                    </div>
                    <p className="text-slate-400 text-sm">
                        해당 기간 동안 로스터 운용에 차질이 예상되오니, 대체 선수 기용 계획을 수립하시기 바랍니다.
                    </p>
                    <div className="pt-4">
                        <p className="text-white font-bold">부단장</p>
                        <p className="text-slate-500 text-xs mt-0.5">Assistant General Manager</p>
                    </div>
                </div>
            );
        }

        case 'LEAGUE_NEWS': {
            const news = content as LeagueNewsContent;
            const fighterTeamData = TEAM_DATA[news.fighterTeamId];
            const oppTeamData = TEAM_DATA[news.opponentTeamId];
            return (
                <div className="space-y-8 text-slate-300 leading-relaxed">
                    <p className="text-xs font-black text-red-400/80 uppercase tracking-widest">LEAGUE BULLETIN</p>
                    <p>
                        {fighterTeamData?.city ?? ''} {news.fighterTeamName}의{' '}
                        <button className="text-white font-bold hover:text-indigo-400 transition-colors" onClick={() => onPlayerClick(news.fighterPlayerId)}>
                            {news.fighterPlayerName}
                        </button>{' '}
                        선수가 {oppTeamData?.city ?? ''} {news.opponentTeamName}의{' '}
                        <button className="text-white font-bold hover:text-indigo-400 transition-colors" onClick={() => onPlayerClick(news.opponentPlayerId)}>
                            {news.opponentPlayerName}
                        </button>{' '}
                        선수와 경기 도중 물리적 충돌을 일으켜 양 선수 모두 퇴장 조치되었다.
                    </p>
                    <p>
                        리그 사무국은 해당 사건을 검토한 결과 다음과 같은 징계를 내렸다.
                    </p>
                    <div className="pl-3 space-y-2 text-sm">
                        <div className="flex items-center gap-3">
                            <TeamLogo teamId={news.fighterTeamId} size="sm" />
                            <span className="text-white font-bold">{news.fighterPlayerName}</span>
                            <span className="text-red-400 font-black">{news.fighterSuspensionGames}경기 출장정지</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <TeamLogo teamId={news.opponentTeamId} size="sm" />
                            <span className="text-white font-bold">{news.opponentPlayerName}</span>
                            <span className="text-red-400 font-black">{news.opponentSuspensionGames}경기 출장정지</span>
                        </div>
                    </div>
                    <div className="pt-4">
                        <p className="text-white font-bold">NBA League Office</p>
                        <p className="text-slate-500 text-xs mt-0.5">Official League Communication</p>
                    </div>
                </div>
            );
        }

        case 'TRADE_OFFER_RECEIVED': {
            const offer = content as TradeOfferReceivedContent;
            const offerTeamData = TEAM_DATA[offer.fromTeamId];
            return (
                <div className="space-y-8 text-slate-300 leading-relaxed">
                    <p>단장님,</p>
                    <p>
                        <span className="font-black text-white">{offerTeamData?.city ?? ''} {offer.fromTeamName}</span>에서
                        트레이드 제안이 접수되었음을 보고드립니다.
                    </p>

                    <div className="border border-slate-700/50 rounded-xl overflow-hidden">
                        <div className="px-5 py-3 bg-slate-950/60 flex items-center gap-3">
                            <TeamLogo teamId={offer.fromTeamId} size="sm" />
                            <span className="text-sm font-black uppercase tracking-tight text-white">{offer.fromTeamName}</span>
                        </div>
                        <div className="px-5 py-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">제안 내용</div>
                            <p className="text-sm font-bold text-slate-200">{offer.offeredSummary}</p>
                        </div>
                        {offer.analysis && offer.analysis.length > 0 && (
                            <div className="px-5 py-3 border-t border-slate-800/50">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">분석</div>
                                <ul className="space-y-1">
                                    {offer.analysis.map((a, i) => (
                                        <li key={i} className="text-xs text-slate-400">{a}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    <p className="text-sm text-indigo-400/80 font-bold">
                        트레이드 센터 &gt; 수신 오퍼 탭에서 수락 또는 거절할 수 있습니다.
                    </p>

                    <div className="pt-4">
                        <p className="text-white font-bold">부단장</p>
                        <p className="text-slate-500 text-xs mt-0.5">Assistant General Manager</p>
                    </div>
                </div>
            );
        }

        case 'TRADE_OFFER_RESPONSE': {
            const resp = content as TradeOfferResponseContent;
            const respTeamData = TEAM_DATA[resp.fromTeamId];
            return (
                <div className="space-y-8 text-slate-300 leading-relaxed">
                    <p>단장님,</p>
                    <p>
                        <span className="font-black text-white">{respTeamData?.city ?? ''} {resp.fromTeamName}</span>에
                        보낸 트레이드 제안에 대한 응답이 도착했습니다.
                    </p>

                    <div className="border border-slate-700/50 rounded-xl overflow-hidden">
                        <div className="px-5 py-3 bg-slate-950/60 flex items-center gap-3">
                            <TeamLogo teamId={resp.fromTeamId} size="sm" />
                            <span className="text-sm font-black uppercase tracking-tight text-white">{resp.fromTeamName}</span>
                        </div>
                        <div className="px-5 py-4 flex items-center gap-3">
                            <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase ${
                                resp.accepted
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}>
                                {resp.accepted ? '수락' : '거절'}
                            </span>
                            <span className="text-sm font-bold text-slate-200">
                                {resp.accepted
                                    ? '상대 구단이 제안을 수락했습니다.'
                                    : '상대 구단이 제안을 거절했습니다.'}
                            </span>
                        </div>
                        {resp.reason && (
                            <div className="px-5 py-3 border-t border-slate-800/50">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">사유</div>
                                <p className="text-xs text-slate-400">{resp.reason}</p>
                            </div>
                        )}
                    </div>

                    {resp.accepted && (
                        <p className="text-sm text-emerald-400/80 font-bold">
                            트레이드가 완료되었습니다. 로스터를 확인해주세요.
                        </p>
                    )}

                    <div className="pt-4">
                        <p className="text-white font-bold">부단장</p>
                        <p className="text-slate-500 text-xs mt-0.5">Assistant General Manager</p>
                    </div>
                </div>
            );
        }

        case 'OFFSEASON_REPORT': {
            const report = content as OffseasonReportContent;
            const hasPendingTeamOptions = (report.pendingTeamOptions?.length ?? 0) > 0;
            const hasMyTeamChanges = report.retired.length > 0 || report.expired.length > 0 || report.optionDecisions.length > 0 || hasPendingTeamOptions;


            return (
                <div className="space-y-6 text-slate-300 leading-relaxed">
                    <p>단장님, 오프시즌 로스터 변동 사항을 보고드립니다.</p>

                    {/* 유저팀 은퇴 */}
                    {report.retired.length > 0 && (
                        <div>
                            <h4 className="text-sm font-bold text-red-400 mb-2">은퇴 선수</h4>
                            <div className="space-y-1.5">
                                {report.retired.map(p => (
                                    <div key={p.playerId} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60">
                                        <OvrBadge value={p.ovr} size="sm" />
                                        <button onClick={() => onPlayerClick(p.playerId)} className="text-sm font-bold text-white hover:text-indigo-400 transition-colors">
                                            {p.playerName}
                                        </button>
                                        <span className="text-xs text-slate-500">{p.position} · {p.age}세</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 계약 만료 */}
                    {report.expired.length > 0 && (
                        <div>
                            <h4 className="text-sm font-bold text-amber-400 mb-2">계약 만료 (FA 전환)</h4>
                            <div className="space-y-1.5">
                                {report.expired.map(p => (
                                    <div key={p.playerId} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60">
                                        <OvrBadge value={p.ovr} size="sm" />
                                        <button onClick={() => onPlayerClick(p.playerId)} className="text-sm font-bold text-white hover:text-indigo-400 transition-colors">
                                            {p.playerName}
                                        </button>
                                        <span className="text-xs text-slate-500">{p.position} · {p.age}세</span>
                                        <span className="text-xs text-slate-600 ml-auto">{formatMoney(p.lastSalary)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 옵션 결정 */}
                    {report.optionDecisions.length > 0 && (
                        <div>
                            <h4 className="text-sm font-bold text-indigo-400 mb-2">계약 옵션 결정</h4>
                            <div className="space-y-1.5">
                                {report.optionDecisions.map(p => (
                                    <div key={p.playerId} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60">
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                            p.exercised ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                                        }`}>
                                            {p.optionType === 'player' ? 'PO' : 'TO'}
                                        </span>
                                        <button onClick={() => onPlayerClick(p.playerId)} className="text-sm font-bold text-white hover:text-indigo-400 transition-colors">
                                            {p.playerName}
                                        </button>
                                        <span className="text-xs text-slate-500">
                                            {p.exercised ? '행사 (잔류)' : '거부 (FA 전환)'}
                                        </span>
                                        <span className="text-xs text-slate-600 ml-auto">{formatMoney(p.salary)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 유저 팀옵션 결정 */}
                    {hasPendingTeamOptions && (
                        <div>
                            <h4 className="text-sm font-bold text-cyan-400 mb-2">팀 옵션 결정 대기</h4>
                            <p className="text-xs text-slate-400 mb-3">아래 선수들의 팀 옵션을 행사할지 결정해 주세요.</p>
                            <div className="space-y-2">
                                {report.pendingTeamOptions!.map(opt => {
                                    const decided = !!opt.decision;
                                    const exercised = opt.decision === 'exercised';
                                    return (
                                        <div key={opt.playerId} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60">
                                            <OvrBadge value={opt.ovr} size="sm" />
                                            <button onClick={() => onPlayerClick(opt.playerId)} className="text-sm font-bold text-white hover:text-indigo-400 transition-colors">
                                                {opt.playerName}
                                            </button>
                                            <span className="text-xs text-slate-500">{opt.position} · {opt.age}세</span>
                                            <span className="text-xs text-slate-500">{formatMoney(opt.salary)}</span>
                                            <div className="ml-auto flex items-center gap-1.5">
                                                {decided ? (
                                                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                                                        exercised
                                                            ? 'bg-emerald-500/20 text-emerald-400'
                                                            : 'bg-red-500/20 text-red-400'
                                                    }`}>
                                                        {exercised ? '행사 완료' : '거부 완료'}
                                                    </span>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => onTeamOptionDecide?.(opt.playerId, true)}
                                                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600/30 text-emerald-400 hover:bg-emerald-600/50 transition-colors"
                                                        >
                                                            옵션 행사
                                                        </button>
                                                        <button
                                                            onClick={() => onTeamOptionDecide?.(opt.playerId, false)}
                                                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-600/30 text-red-400 hover:bg-red-600/50 transition-colors"
                                                        >
                                                            행사하지 않음
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {!hasMyTeamChanges && (
                        <p className="text-slate-500">이번 오프시즌에는 별다른 로스터 변동이 없었습니다.</p>
                    )}

                    <div className="pt-4">
                        <p className="text-slate-400 text-sm">Best regards,</p>
                        <p className="text-white font-bold mt-1">부단장</p>
                        <p className="text-slate-500 text-xs mt-0.5">Assistant General Manager</p>
                    </div>
                </div>
            );
        }

        case 'PROSPECT_REVEAL': {
            const pr = content as ProspectRevealContent;
            const prTeamData = TEAM_DATA[pr.teamId];
            const prTeamFullName = prTeamData ? `${prTeamData.city} ${prTeamData.name}` : pr.teamId;
            return (
                <div className="space-y-6">
                    <p className="text-slate-300 leading-relaxed">
                        단장님, <span className="text-white font-bold">{pr.draftYear}년 드래프트 클래스</span> 스카우팅 보고서를 제출합니다.
                        올해 클래스는 총 <span className="text-white font-bold">{pr.totalCount}명</span>의 유망주가 등록되어 있으며,
                        전체적인 등급은 <span className={`font-black ${pr.classGrade === '풍작' ? 'text-emerald-400' : pr.classGrade === '흉작' ? 'text-red-400' : 'text-amber-400'}`}>"{pr.classGrade}"</span>으로 평가됩니다.
                    </p>

                    <div>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">탑 10 프로스펙트</h4>
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-700/50">
                                    <th className="py-2 px-2 text-left text-slate-500 font-bold w-8">#</th>
                                    <th className="py-2 px-2 text-left text-slate-500 font-bold">이름</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">포지션</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">나이</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">신장</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">체중</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">OVR</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pr.top10.map(p => (
                                    <tr key={p.rank} className="border-b border-slate-800/50">
                                        <td className="py-2 px-2 text-slate-500 font-black">{p.rank}</td>
                                        <td className="py-2 px-2 text-white font-bold">{p.name}</td>
                                        <td className="py-2 px-2 text-center text-slate-400 font-bold">{p.position}</td>
                                        <td className="py-2 px-2 text-center text-slate-400">{p.age}세</td>
                                        <td className="py-2 px-2 text-center text-slate-400">{p.height}cm</td>
                                        <td className="py-2 px-2 text-center text-slate-400">{p.weight ? `${p.weight}kg` : '-'}</td>
                                        <td className="py-2 px-2 text-center">
                                            <OvrBadge value={p.ovr} size="sm" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {onNavigateToDraft && (
                        <button
                            onClick={onNavigateToDraft}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-2xl font-black uppercase tracking-widest text-sm transition-all active:scale-[0.98]"
                        >
                            드래프트 보드 전체보기
                        </button>
                    )}

                    <div className="pt-4">
                        <p className="text-white font-bold">{prTeamFullName} 스카우팅 담당자</p>
                        <p className="text-slate-500 text-xs mt-0.5">Head of Scouting</p>
                    </div>
                </div>
            );
        }

        case 'LOTTERY_RESULT': {
            const lr = content as LotteryResultContent;
            return (
                <div className="space-y-6 text-slate-300 leading-relaxed">
                    <p>
                        단장님, 드래프트 로터리 추첨이 완료되었습니다.
                        우리 팀의 드래프트 순위는 <span className="text-white font-black">{lr.myTeamPick}픽</span>입니다.
                    </p>

                    <div>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">드래프트 순서</h4>
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-700/50">
                                    <th className="py-2 px-2 text-left text-slate-500 font-bold w-8">픽</th>
                                    <th className="py-2 px-2 text-left text-slate-500 font-bold">팀</th>
                                    <th className="py-2 px-2 text-left text-slate-500 font-bold">권리행사</th>
                                    <th className="py-2 px-2 text-left text-slate-500 font-bold">변동사항</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">성적</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">확률</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">변동</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lr.entries.map(e => {
                                    const isMyTeam = e.teamId === myTeamId;
                                    const hasOwnershipChange = e.currentTeamId && e.currentTeamId !== e.teamId;
                                    return (
                                        <tr key={e.pick} className={`border-b border-slate-800/50 ${isMyTeam ? 'bg-indigo-500/10' : ''}`}>
                                            <td className={`py-2 px-2 font-black ${isMyTeam ? 'text-indigo-400' : 'text-slate-500'}`}>{e.pick}</td>
                                            <td className="py-2 px-2">
                                                <div className="flex items-center gap-2">
                                                    <TeamLogo teamId={e.teamId} size="custom" className="w-5 h-5 shrink-0" />
                                                    <span className={`font-bold ${isMyTeam ? 'text-indigo-300' : 'text-white'}`}>{e.teamName}</span>
                                                </div>
                                            </td>
                                            <td className="py-2 px-2">
                                                {hasOwnershipChange ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <TeamLogo teamId={e.currentTeamId!} size="custom" className="w-4 h-4 shrink-0" />
                                                        <span className="font-bold text-amber-400">{e.currentTeamName}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-600">-</span>
                                                )}
                                            </td>
                                            <td className="py-2 px-2">
                                                {e.pickNote ? (
                                                    <span className="text-amber-300/80">{e.pickNote}</span>
                                                ) : (
                                                    <span className="text-slate-600">-</span>
                                                )}
                                            </td>
                                            <td className="py-2 px-2 text-center text-slate-400">{e.wins}-{e.losses}</td>
                                            <td className="py-2 px-2 text-center text-slate-400">
                                                {e.isLotteryTeam ? `${(e.odds * 100).toFixed(1)}%` : '-'}
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                                {e.movement !== 0 && e.isLotteryTeam ? (
                                                    <span className={`font-black ${e.movement > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {e.movement > 0 ? `▲${e.movement}` : `▼${Math.abs(e.movement)}`}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-600">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {onNavigateToDraftLottery && (
                        <button
                            onClick={onNavigateToDraftLottery}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-2xl font-black uppercase tracking-widest text-sm transition-all active:scale-[0.98]"
                        >
                            드래프트 로터리 결과 보기
                        </button>
                    )}

                    <div className="pt-4">
                        <p className="text-slate-400 text-sm">Best regards,</p>
                        <p className="text-white font-bold mt-1">부단장</p>
                        <p className="text-slate-500 text-xs mt-0.5">Assistant General Manager</p>
                    </div>
                </div>
            );
        }

        case 'DRAFT_RESULT': {
            const dr = content as DraftResultContent;
            const getDraftAttrColor = (val: number) => {
                if (val >= 90) return 'text-fuchsia-400';
                if (val >= 80) return 'text-emerald-400';
                if (val >= 70) return 'text-amber-400';
                return 'text-slate-500';
            };
            return (
                <div className="space-y-6 text-slate-300 leading-relaxed">
                    <p>
                        단장님, <span className="text-white font-black">{dr.draftYear}</span>년 신인 드래프트가 완료되었습니다.
                        우리 팀은 총 <span className="text-white font-black">{dr.myPickCount}명</span>의 신인을 지명했습니다.
                    </p>

                    <div>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">전체 드래프트 결과</h4>
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-700/50">
                                    <th className="py-2 px-2 text-left text-slate-500 font-bold w-8">픽</th>
                                    <th className="py-2 px-2 text-left text-slate-500 font-bold">팀</th>
                                    <th className="py-2 px-2 text-left text-slate-500 font-bold">선수</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">나이</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">키</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">OVR</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">POT</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">INS</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">OUT</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">PLM</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">DEF</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">REB</th>
                                    <th className="py-2 px-2 text-center text-slate-500 font-bold">ATH</th>
                                    <th className="py-2 px-2 text-right text-slate-500 font-bold">연봉</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dr.entries.map(e => {
                                    const isMyPick = e.isUserPick;
                                    return (
                                        <tr key={e.pickNumber} className={`border-b border-slate-800/50 ${isMyPick ? 'bg-emerald-500/10' : ''}`}>
                                            <td className={`py-2 px-2 font-black ${isMyPick ? 'text-emerald-400' : 'text-slate-500'}`}>{e.pickNumber}</td>
                                            <td className="py-2 px-2">
                                                <div className="flex items-center gap-2">
                                                    <TeamLogo teamId={e.teamId} size="custom" className="w-5 h-5 shrink-0" />
                                                    <span className={`font-bold ${isMyPick ? 'text-emerald-300' : 'text-white'}`}>{e.teamName}</span>
                                                </div>
                                            </td>
                                            <td className="py-2 px-2">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-slate-500 font-bold">{e.position}</span>
                                                    <button onClick={() => onPlayerClick(e.playerId)} className={`font-bold hover:underline ${isMyPick ? 'text-emerald-300' : 'text-slate-200'}`}>
                                                        {e.playerName}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="py-2 px-2 text-center text-slate-400">{e.age}</td>
                                            <td className="py-2 px-2 text-center text-slate-400">{e.height}cm</td>
                                            <td className="py-2 px-2 text-center">
                                                <OvrBadge value={e.ovr} size="sm" />
                                            </td>
                                            <td className={`py-2 px-2 text-center font-bold tabular-nums ${getDraftAttrColor(e.potential)}`}>{e.potential}</td>
                                            <td className={`py-2 px-2 text-center font-bold tabular-nums ${getDraftAttrColor(e.ins)}`}>{e.ins}</td>
                                            <td className={`py-2 px-2 text-center font-bold tabular-nums ${getDraftAttrColor(e.out)}`}>{e.out}</td>
                                            <td className={`py-2 px-2 text-center font-bold tabular-nums ${getDraftAttrColor(e.plm)}`}>{e.plm}</td>
                                            <td className={`py-2 px-2 text-center font-bold tabular-nums ${getDraftAttrColor(e.def)}`}>{e.def}</td>
                                            <td className={`py-2 px-2 text-center font-bold tabular-nums ${getDraftAttrColor(e.reb)}`}>{e.reb}</td>
                                            <td className={`py-2 px-2 text-center font-bold tabular-nums ${getDraftAttrColor(e.ath)}`}>{e.ath}</td>
                                            <td className="py-2 px-2 text-right text-slate-400">{formatMoney(e.salary)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="pt-4">
                        <p className="text-slate-400 text-sm">Best regards,</p>
                        <p className="text-white font-bold mt-1">부단장</p>
                        <p className="text-slate-500 text-xs mt-0.5">Assistant General Manager</p>
                    </div>
                </div>
            );
        }

        case 'RETIREMENT_NEWS': {
            const news = content as RetirementNewsContent;
            return (
                <div className="space-y-6 text-slate-300 leading-relaxed">
                    <p className="text-xs font-black text-amber-400/80 uppercase tracking-widest">League Bulletin</p>
                    <p>
                        이번 오프시즌, 총 <span className="font-bold text-white">{news.players.length}명</span>의 선수가 현역 은퇴를 선언했습니다.
                    </p>
                    <div className="space-y-1.5">
                        {news.players.map(p => {
                            const teamInfo = TEAM_DATA[p.teamId];
                            return (
                                <div key={p.playerId} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/40">
                                    <TeamLogo teamId={p.teamId} size="custom" className="w-5 h-5 shrink-0" />
                                    <OvrBadge value={p.ovr} size="sm" />
                                    <button onClick={() => onPlayerClick(p.playerId)} className="text-sm font-bold text-slate-300 hover:text-indigo-400 transition-colors">
                                        {p.playerName}
                                    </button>
                                    <span className="text-xs text-slate-500">{p.position} · {p.age}세</span>
                                    <span className="text-xs text-slate-600 ml-auto">{teamInfo ? teamInfo.name : p.teamId}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="pt-4">
                        <p className="text-slate-400 text-sm">NBA League Office</p>
                        <p className="text-slate-500 text-xs mt-0.5">Official League Communication</p>
                    </div>
                </div>
            );
        }

        default:
            return <div className="text-slate-400 text-sm">표시할 내용이 없습니다.</div>;
    }
};

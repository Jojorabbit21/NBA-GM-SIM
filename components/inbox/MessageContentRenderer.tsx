import React, { useState } from 'react';
import { ArrowRightLeft, Trophy } from 'lucide-react';
import { MessageType, GameRecapContent, TradeAlertContent, InjuryReportContent, SeasonReviewContent, PlayoffStageReviewContent, OwnerLetterContent, HofQualificationContent, FinalsMvpContent, RegSeasonChampionContent, PlayoffChampionContent, ScoutReportContent, Team } from '../../types';
import type { SeasonAwardsContent } from '../../utils/awardVoting';
import { fetchFullGameResult } from '../../services/queries';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';
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
}

export const MessageContentRenderer: React.FC<MessageContentRendererProps> = ({ type, content, teams, myTeamId, onPlayerClick, onViewGameResult, userId, onNavigateToHof }) => {

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

        case 'SCOUT_REPORT': {
            const sc = content as ScoutReportContent;
            return <ScoutReportRenderer content={sc} teams={teams} onPlayerClick={onPlayerClick} />;
        }

        default:
            return <div className="text-slate-400 text-sm">표시할 내용이 없습니다.</div>;
    }
};

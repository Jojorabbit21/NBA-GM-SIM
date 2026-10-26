
import React, { useMemo } from 'react';
import { Team, PbpLog, QuarterScores } from '../../types';
import { TEAM_DATA } from '../../data/teamData';
import { TeamLogo } from '../common/TeamLogo';
import { TimeoutBars, getTimeoutsLeftFromLogs } from './TimeoutBars';
import { countOvertimePeriods, foldPeriodScores } from '../../utils/periodLabel';

interface ResultHeaderProps {
    homeTeam: Team;
    awayTeam: Team;
    homeScore: number;
    awayScore: number;
    isWin: boolean;
    pbpLogs?: PbpLog[];
    quarterScoresData?: QuarterScores;
}

export const ResultHeader: React.FC<ResultHeaderProps> = ({
    homeTeam, awayTeam, homeScore, awayScore, isWin, pbpLogs, quarterScoresData
}) => {

    // Calculate Quarter Scores: pre-computed data 우선, 없으면 pbpLogs에서 계산
    // [2026-10-26] 연장이 있었던 경기만 OT 열 — 연장 수는 "N차 연장 시작" 로그 수(로그가 없으면 저장값의 4칸 뒤
    // 0이 아닌 칸 수로 추정 — 옛 멀티 저장값의 5번째 "경기 종료 로그" 칸은 대개 0). 넘치는 칸은 4쿼터에 합친다.
    const quarterScores = useMemo(() => {
        const hasLogs = !!pbpLogs && pbpLogs.length > 0;
        if (quarterScoresData) {
            let ot = 0;
            if (hasLogs) ot = countOvertimePeriods(pbpLogs!);
            else {
                const len = Math.max(quarterScoresData.home.length, quarterScoresData.away.length);
                for (let i = len - 1; i >= 4; i--) {
                    if ((quarterScoresData.home[i] ?? 0) + (quarterScoresData.away[i] ?? 0) > 0) { ot = i - 3; break; }
                }
            }
            return { home: foldPeriodScores(quarterScoresData.home, ot), away: foldPeriodScores(quarterScoresData.away, ot) };
        }

        const periods = 4 + (hasLogs ? countOvertimePeriods(pbpLogs!) : 0);
        const home = new Array<number>(periods).fill(0);
        const away = new Array<number>(periods).fill(0);
        if (!pbpLogs) return { home, away };

        pbpLogs.forEach(log => {
            if (log.type === 'score' || log.type === 'freethrow') {
                const points = log.points ?? 0;
                const qi = Math.min(periods, log.quarter) - 1;
                if (log.teamId === homeTeam.id) home[qi] += points;
                else away[qi] += points;
            }
        });

        const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
        const homeDiff = homeScore - sum(home);
        const awayDiff = awayScore - sum(away);
        if (homeDiff !== 0) home[periods - 1] += homeDiff;
        if (awayDiff !== 0) away[periods - 1] += awayDiff;

        return { home, away };
    }, [pbpLogs, quarterScoresData, homeTeam.id, homeScore, awayScore]);
    const periodCount = quarterScores.home.length;
    
    // 경기 종료 시점 잔여 타임아웃 (PBP 로그가 없는 경기는 바를 숨김)
    const hasLogs = !!pbpLogs && pbpLogs.length > 0;
    const homeTimeouts = useMemo(() => getTimeoutsLeftFromLogs(pbpLogs, homeTeam.id), [pbpLogs, homeTeam.id]);
    const awayTimeouts = useMemo(() => getTimeoutsLeftFromLogs(pbpLogs, awayTeam.id), [pbpLogs, awayTeam.id]);

    const homeColor = TEAM_DATA[homeTeam.id]?.colors.primary || '#ffffff';
    const awayColor = TEAM_DATA[awayTeam.id]?.colors.primary || '#ffffff';

    return (
        <div className="bg-slate-950 border-b border-slate-800 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl z-20">
            {/* Dynamic Background Gradient using Team Colors at both ends */}
            <div className="absolute inset-0 pointer-events-none" style={{
                background: `linear-gradient(to right, ${awayColor}40, transparent 30%, transparent 70%, ${homeColor}40)`
            }}></div>
            
            {/* Win/Loss Status Overlay */}
             <div className={`absolute inset-0 opacity-10 pointer-events-none bg-gradient-to-b ${isWin ? 'from-emerald-900 to-slate-900' : 'from-red-900 to-slate-900'}`}></div>
            
            <div className="relative z-10 flex flex-col w-full max-w-7xl px-6 py-6">
                
                {/* Main Matchup Row */}
                <div className="flex items-center justify-between w-full gap-4 md:gap-12">
                    
                    {/* Away Team (Left) */}
                    <div className="flex items-center gap-4 flex-1 justify-end group">
                        <div className="text-right">
                            <div 
                                className="text-xl md:text-3xl font-black text-slate-300 tracking-tight leading-none group-hover:brightness-125 transition-all"
                                style={{ color: awayColor !== '#000000' ? awayColor : '#ffffff' }}
                            >
                                {awayTeam.name}
                            </div>
                            <div className={`text-4xl md:text-5xl font-black mt-1 leading-none ${awayScore > homeScore ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'text-slate-500'}`}>{Math.round(awayScore)}</div>
                            {hasLogs && <TimeoutBars left={awayTimeouts} className="mt-2 justify-end" />}
                        </div>
                        <TeamLogo teamId={awayTeam.id} size="custom" className="w-16 h-16 md:w-20 md:h-20 drop-shadow-2xl group-hover:scale-105 transition-transform" />
                    </div>

                    {/* Center Info */}
                    <div className="flex flex-col items-center justify-center min-w-[140px]">
                        <div className="text-[10px] font-black text-slate-500 mb-2">FINAL SCORE</div>
                        {isWin ? (
                            <div className="px-5 py-1 bg-emerald-600 text-white rounded-full font-black text-xs shadow-[0_0_15px_rgba(16,185,129,0.4)] mb-3">Victory</div>
                        ) : (
                            <div className="px-5 py-1 bg-red-600 text-white rounded-full font-black text-xs shadow-[0_0_15px_rgba(239,68,68,0.4)] mb-3">Defeat</div>
                        )}
                        
                        {/* Quarter Score Table */}
                        <div className="bg-slate-900/80 border border-slate-700/50 rounded-lg overflow-hidden backdrop-blur-sm shadow-lg">
                            <table className="text-[10px] md:text-xs tabular-nums">
                                <thead>
                                    <tr className="bg-slate-800/50 text-slate-400">
                                        <th className="px-2 py-1 border-r border-slate-800 w-8"></th>
                                        {Array.from({ length: periodCount }, (_, i) => (
                                            <th key={i} className={`px-2 py-1 text-center ${i < periodCount - 1 ? 'border-r border-slate-800' : ''}`}>{i < 4 ? i + 1 : `OT${i - 3}`}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="text-slate-300">
                                    {([['away', awayTeam.id], ['home', homeTeam.id]] as const).map(([side, teamId], row) => (
                                        <tr key={side} className={row === 0 ? 'border-b border-slate-800' : ''}>
                                            <td className="px-2 py-1 font-bold text-slate-500 border-r border-slate-800 text-center">{teamId.toUpperCase()}</td>
                                            {quarterScores[side].map((v, i) => (
                                                <td key={i} className={`px-2 py-1 text-center ${i < periodCount - 1 ? 'border-r border-slate-800' : ''}`}>{v}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Home Team (Right) */}
                    <div className="flex items-center gap-4 flex-1 justify-start group">
                        <TeamLogo teamId={homeTeam.id} size="custom" className="w-16 h-16 md:w-20 md:h-20 drop-shadow-2xl group-hover:scale-105 transition-transform" />
                        <div className="text-left">
                            <div 
                                className="text-xl md:text-3xl font-black text-slate-300 tracking-tight leading-none group-hover:brightness-125 transition-all"
                                style={{ color: homeColor !== '#000000' ? homeColor : '#ffffff' }}
                            >
                                {homeTeam.name}
                            </div>
                            <div className={`text-4xl md:text-5xl font-black mt-1 leading-none ${homeScore > awayScore ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'text-slate-600'}`}>{Math.round(homeScore)}</div>
                            {hasLogs && <TimeoutBars left={homeTimeouts} className="mt-2 justify-start" />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

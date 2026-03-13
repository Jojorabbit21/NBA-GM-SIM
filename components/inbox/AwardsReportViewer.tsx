import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SeasonAwardsContent } from '../../utils/awardVoting';
import { Team } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';

interface AwardsReportViewerProps {
    content: SeasonAwardsContent;
    teams: Team[];
    onPlayerClick: (id: string) => void;
}

export const AwardsReportViewer: React.FC<AwardsReportViewerProps> = ({ content, teams, onPlayerClick }) => {
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

            {/* ── 올-오펜시브 팀 ── */}
            {content.allNbaTeams.length > 0 && (
                <div>
                    <h3 className={sectionLabel}>올-오펜시브 팀</h3>
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

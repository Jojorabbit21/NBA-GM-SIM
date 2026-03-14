
import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Team } from '../types';
import { GMProfile, GMSliders, GM_PERSONALITY_LABELS, LeagueGMProfiles, DIRECTION_LABELS, TeamDirection } from '../types/gm';
import { TEAM_DATA } from '../data/teamData';
import { getTeamTheme } from '../utils/teamTheme';
import { getTeamLogoUrl } from '../utils/constants';
import { getGMSliderResult, getGMSliderLabel } from '../services/tradeEngine/gmProfiler';
import { DirectionBadge } from '../components/common/DirectionBadge';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';

interface GMDetailViewProps {
    gmProfile: GMProfile;
    teamId: string;
    teams: Team[];
    leagueGMProfiles: LeagueGMProfiles;
    myTeamId?: string;
    userNickname?: string;
    onBack: () => void;
    onViewGM?: (teamId: string) => void;
}

const SLIDER_KEYS: (keyof GMSliders)[] = [
    'aggressiveness', 'starWillingness', 'youthBias', 'riskTolerance', 'pickWillingness',
];

const SLIDER_COLORS: Record<keyof GMSliders, string> = {
    aggressiveness: 'text-rose-400',
    starWillingness: 'text-amber-400',
    youthBias: 'text-emerald-400',
    riskTolerance: 'text-cyan-400',
    pickWillingness: 'text-purple-400',
};

const DIRECTION_ORDER: TeamDirection[] = ['winNow', 'buyer', 'standPat', 'seller', 'tanking'];

export const GMDetailView: React.FC<GMDetailViewProps> = ({ gmProfile, teamId, teams, leagueGMProfiles, myTeamId, userNickname, onBack, onViewGM }) => {
    const teamInfo = TEAM_DATA[teamId];
    const teamColors = teamInfo?.colors || null;
    const theme = getTeamTheme(teamId, teamColors);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onBack]);

    // 리그 노선 현황 — 노선별로 팀 그룹핑
    const directionGroups = DIRECTION_ORDER.map(dir => {
        const teamIds = Object.entries(leagueGMProfiles)
            .filter(([, p]) => p.direction === dir)
            .map(([id]) => id);
        return { direction: dir, teamIds };
    });

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">

                {/* ═══ HEADER ═══ */}
                <div className="border-b border-white/5 relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
                    <div className="absolute inset-0 bg-black/40 pointer-events-none" />

                    {/* Back button */}
                    <div className="px-6 pt-5 pb-4 relative z-10">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-1.5 bg-black/30 hover:bg-black/50 backdrop-blur-sm ring-1 ring-white/15 px-3 py-1.5 rounded-lg transition-colors"
                            style={{ color: theme.text }}
                        >
                            <ArrowLeft size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">뒤로</span>
                        </button>
                    </div>

                    {/* GM name */}
                    <div className="px-6 pt-1 pb-4 relative z-10 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-black/20 ring-1 ring-white/10 flex items-center justify-center">
                            <span className="text-xl font-black" style={{ color: theme.accent }}>GM</span>
                        </div>
                        <h2 className="text-3xl font-black uppercase tracking-tight" style={{ color: theme.text }}>
                            {gmProfile.name}
                        </h2>
                    </div>

                    <div className="mx-6" />

                    {/* Info table */}
                    <div className="px-6 py-3 relative z-10">
                        <table className="text-sm" style={{ color: theme.text, opacity: 0.7 }}>
                            <thead>
                                <tr className="text-xs uppercase tracking-wider border-b border-white/15" style={{ opacity: 0.5 }}>
                                    <th className="pr-8 pb-2 text-left font-bold">팀</th>
                                    <th className="pr-8 pb-2 text-left font-bold">성격 타입</th>
                                    <th className="pr-8 pb-2 text-left font-bold">현재 노선</th>
                                    <th className="pb-2 text-left font-bold">노선 확정일</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="font-bold">
                                    <td className="pr-8 pt-2">
                                        <span className="flex items-center gap-1.5">
                                            <img src={getTeamLogoUrl(teamId)} className="w-4 h-4 object-contain" alt="" />
                                            {teamInfo ? `${teamInfo.city} ${teamInfo.name}` : teamId.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="pr-8 pt-2">{GM_PERSONALITY_LABELS[gmProfile.personalityType]}</td>
                                    <td className="pr-8 pt-2">{DIRECTION_LABELS[gmProfile.direction]}</td>
                                    <td className="pt-2">{gmProfile.directionSetDate || '미확정'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="h-6" />
                </div>

                {/* ═══ BODY ═══ */}
                <div className="bg-slate-950">

                    {/* ═══ GM 성향 ═══ */}
                    <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-700">
                        <span className="text-xs font-black text-white uppercase tracking-widest">GM 성향</span>
                    </div>
                    <Table className="border-0 !rounded-none shadow-none">
                        <TableHead>
                            <TableHeaderCell className="text-xs w-32 py-2 border-r border-slate-800/50">항목</TableHeaderCell>
                            <TableHeaderCell className="text-xs w-40 py-2 border-r border-slate-800/50">성향</TableHeaderCell>
                            <TableHeaderCell className="text-xs py-2">설명</TableHeaderCell>
                        </TableHead>
                        <TableBody>
                            {SLIDER_KEYS.map(key => {
                                const { tag, desc } = getGMSliderResult(key, gmProfile.sliders[key]);
                                return (
                                    <TableRow key={key} className="hover:bg-slate-900/40 transition-colors">
                                        <TableCell className="text-xs font-bold text-white py-2 border-r border-slate-800/50 ko-normal">
                                            {getGMSliderLabel(key)}
                                        </TableCell>
                                        <TableCell className={`text-xs font-black py-2 border-r border-slate-800/50 ${SLIDER_COLORS[key]}`}>
                                            {tag}
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-400 py-2 ko-normal">{desc}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>

                    {/* ═══ 리그 노선 현황 ═══ */}
                    <div className="px-4 py-2.5 bg-slate-800 border-y border-slate-700">
                        <span className="text-xs font-black text-white uppercase tracking-widest">리그 노선 현황</span>
                    </div>
                    <div className="p-4 space-y-3">
                        {/* 사용자 팀 표시 */}
                        {myTeamId && (
                            <div className="flex items-start gap-3">
                                <div className="w-20 flex-shrink-0 pt-0.5">
                                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full border bg-indigo-500/15 text-indigo-300 border-indigo-500/30 ko-normal">사용자</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ko-normal bg-indigo-600/15 border-indigo-500/30 text-indigo-300">
                                        <img src={getTeamLogoUrl(myTeamId)} className="w-3 h-3 object-contain" alt="" />
                                        {TEAM_DATA[myTeamId]?.name || myTeamId.toUpperCase()}
                                        <span className="text-[9px] text-indigo-400 font-bold ml-1">({userNickname || 'You'})</span>
                                    </span>
                                </div>
                            </div>
                        )}
                        {directionGroups.map(({ direction, teamIds: groupTeamIds }) => (
                            <div key={direction} className="flex items-start gap-3">
                                <div className="w-20 flex-shrink-0 pt-0.5">
                                    <DirectionBadge direction={direction} size="sm" />
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {groupTeamIds.length === 0 ? (
                                        <span className="text-xs text-slate-600 ko-normal">-</span>
                                    ) : (
                                        groupTeamIds.map(id => {
                                            const info = TEAM_DATA[id];
                                            const isCurrent = id === teamId;
                                            return (
                                                <button
                                                    key={id}
                                                    onClick={() => onViewGM?.(id)}
                                                    disabled={isCurrent}
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ko-normal transition-colors ${
                                                        isCurrent
                                                            ? 'bg-indigo-600/15 border-indigo-500/30 text-indigo-300'
                                                            : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-700/60 hover:text-white cursor-pointer'
                                                    }`}
                                                >
                                                    <img src={getTeamLogoUrl(id)} className="w-3 h-3 object-contain" alt="" />
                                                    {info?.name || id.toUpperCase()}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

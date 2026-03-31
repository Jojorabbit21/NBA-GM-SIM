
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, Trophy } from 'lucide-react';
import { GMProfile, GMSliders, GM_PERSONALITY_LABELS, DIRECTION_LABELS } from '../types/gm';
import { Team } from '../types';
import { TEAM_DATA } from '../data/teamData';
import { getTeamTheme } from '../utils/teamTheme';
import { getTeamLogoUrl } from '../utils/constants';
import { getGMSliderResult, getGMSliderLabel } from '../services/tradeEngine/gmProfiler';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import { SeasonArchiveEntry } from '../services/seasonArchive';

interface GMDetailViewProps {
    gmProfile: GMProfile;
    teamId: string;
    onBack: () => void;
    leagueGMProfiles?: Record<string, GMProfile>;
    allTeams?: Team[];
    myTeamId?: string;
    userNickname?: string;
    seasonYear?: number;
    seasonHistory?: SeasonArchiveEntry[];
}

const PLAYOFF_RESULT_CONFIG: Record<string, { label: string; className: string }> = {
    Champion: { label: '우승',     className: 'text-amber-400 font-black' },
    Finals:   { label: '파이널',   className: 'text-slate-300 font-bold' },
    CF:       { label: '컨파 결승', className: 'text-slate-400' },
    R2:       { label: '2라운드',  className: 'text-slate-500' },
    R1:       { label: '1라운드',  className: 'text-slate-500' },
    'Play-In':{ label: '플레이인', className: 'text-slate-600' },
};

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

const InfoRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-800">
        <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
        <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 min-w-0">{children}</span>
    </div>
);

export const GMDetailView: React.FC<GMDetailViewProps> = ({
    gmProfile, teamId, onBack,
    leagueGMProfiles, allTeams, myTeamId, userNickname, seasonYear, seasonHistory,
}) => {
    const [currentTeamId, setCurrentTeamId] = useState(teamId);
    const [teamDropOpen, setTeamDropOpen] = useState(false);
    const teamDropRef = useRef<HTMLDivElement>(null);

    const currentProfile = leagueGMProfiles?.[currentTeamId] ?? gmProfile;
    const isMyTeam = currentTeamId === myTeamId;

    const teamInfo = TEAM_DATA[currentTeamId];
    const theme = getTeamTheme(currentTeamId, teamInfo?.colors ?? null);

    const sortedTeams = useMemo(() =>
        allTeams ? [...allTeams].sort((a, b) => a.name.localeCompare(b.name)) : [],
        [allTeams]
    );

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onBack]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (teamDropRef.current && !teamDropRef.current.contains(e.target as Node)) {
                setTeamDropOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">

            {/* ═══ 브레드크럼 바 ═══ */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10 shrink-0"
                style={{ backgroundColor: theme.bg }}>

                {/* 뒤로 버튼 */}
                <button
                    onClick={onBack}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-black/30 hover:bg-black/50 transition-colors shrink-0"
                    style={{ color: theme.text }}
                >
                    <ArrowLeft size={14} />
                </button>

                <span className="text-white/30 text-sm mx-1">/</span>

                {/* 팀 드롭다운 */}
                <div ref={teamDropRef} className="relative">
                    <button
                        onClick={() => setTeamDropOpen(o => !o)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/20 hover:bg-black/40 transition-colors"
                        style={{ color: theme.text }}
                    >
                        <img src={getTeamLogoUrl(currentTeamId)} className="w-4 h-4 object-contain" alt="" />
                        <span className="text-xs font-bold">
                            {teamInfo ? `${teamInfo.city} ${teamInfo.name}` : currentTeamId.toUpperCase()}
                        </span>
                        {allTeams && <ChevronDown size={11} className="opacity-60" />}
                    </button>
                    {teamDropOpen && allTeams && (
                        <div className="absolute top-full left-0 mt-1 z-50 w-52 max-h-72 overflow-y-auto custom-scrollbar rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
                            {sortedTeams.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => { setCurrentTeamId(t.id); setTeamDropOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${t.id === currentTeamId ? 'text-white font-bold' : 'text-slate-300'}`}
                                >
                                    <img src={getTeamLogoUrl(t.id)} className="w-4 h-4 object-contain shrink-0" alt="" />
                                    <span className="truncate">{t.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <span className="text-white/30 text-sm mx-1">›</span>
                <span className="text-xs font-bold" style={{ color: theme.text, opacity: 0.8 }}>단장</span>
            </div>

            {/* ═══ 스크롤 영역 ═══ */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-none custom-scrollbar bg-slate-950">
                <div className="grid items-start gap-4 p-4" style={{ gridTemplateColumns: '2fr 8fr' }}>


                    {/* ── 좌열: 인물 정보 카드 ── */}
                    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        {/* 헤더 */}
                        <div className="relative overflow-hidden border-b border-white/5" style={{ backgroundColor: theme.bg }}>
                            <div className="absolute inset-0 bg-black/40 pointer-events-none" />
                            <div className="px-4 py-4 relative z-10 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-black/20 ring-1 ring-white/10 flex items-center justify-center shrink-0">
                                    <span className="text-sm font-black" style={{ color: theme.accent }}>GM</span>
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-lg font-black uppercase tracking-tight truncate" style={{ color: theme.text }}>
                                            {currentProfile?.name ?? userNickname ?? '-'}
                                        </h2>
                                        {isMyTeam && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 ko-normal shrink-0">
                                                나
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 정보 행들 */}
                        <InfoRow label="팀">
                            <img src={getTeamLogoUrl(currentTeamId)} className="w-4 h-4 object-contain" alt="" />
                            {teamInfo ? `${teamInfo.city} ${teamInfo.name}` : currentTeamId.toUpperCase()}
                        </InfoRow>
                        {currentProfile && (
                            <>
                                {isMyTeam && currentProfile.birthYear && seasonYear && (
                                    <InfoRow label="나이">
                                        <span className="text-slate-200">{seasonYear - currentProfile.birthYear}세</span>
                                        <span className="text-slate-600 font-mono text-[10px]">({currentProfile.birthYear}년생)</span>
                                    </InfoRow>
                                )}
                                {isMyTeam && currentProfile.nationality && (
                                    <InfoRow label="국적">
                                        <span className="text-slate-200 ko-normal">{currentProfile.nationality}</span>
                                    </InfoRow>
                                )}
                                <InfoRow label="성격 타입">
                                    <span className="text-indigo-400 ko-normal">{GM_PERSONALITY_LABELS[currentProfile.personalityType]}</span>
                                </InfoRow>
                                <InfoRow label="현재 노선">
                                    <span className="text-slate-200 ko-normal">{DIRECTION_LABELS[currentProfile.direction]}</span>
                                </InfoRow>
                                {!isMyTeam && (
                                    <InfoRow label="노선 확정일">
                                        <span className="text-slate-400 font-mono">{currentProfile.directionSetDate || '미확정'}</span>
                                    </InfoRow>
                                )}
                            </>
                        )}
                    </div>

                    {/* ── 우열: GM 성향 테이블 ── */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700">
                            <span className="text-xs font-black text-white uppercase tracking-widest">GM 성향</span>
                        </div>
                        {currentProfile ? (
                            <Table className="border-0 !rounded-none shadow-none">
                                <TableHead>
                                    <TableHeaderCell className="text-xs w-32 py-2 border-r border-slate-800/50">항목</TableHeaderCell>
                                    <TableHeaderCell className="text-xs w-40 py-2 border-r border-slate-800/50">성향</TableHeaderCell>
                                    <TableHeaderCell className="text-xs py-2">설명</TableHeaderCell>
                                </TableHead>
                                <TableBody>
                                    {SLIDER_KEYS.map(key => {
                                        const { tag, desc } = getGMSliderResult(key, currentProfile.sliders[key]);
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
                        ) : (
                            <div className="flex items-center justify-center py-12 text-slate-600 text-xs ko-normal">
                                단장 정보가 없습니다.
                            </div>
                        )}
                    </div>

                </div>

                {/* ═══ 시즌별 성적 (유저 본인 팀만) ═══ */}
                {isMyTeam && (
                    <div className="mx-4 mb-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700 flex items-center gap-2">
                            <span className="text-xs font-black text-white uppercase tracking-widest">시즌 기록</span>
                        </div>
                        {seasonHistory && seasonHistory.length > 0 ? (
                            <Table className="border-0 !rounded-none shadow-none">
                                <TableHead>
                                    <TableHeaderCell className="text-xs py-2 border-r border-slate-800/50 w-24">시즌</TableHeaderCell>
                                    <TableHeaderCell className="text-xs py-2 border-r border-slate-800/50 w-32">팀</TableHeaderCell>
                                    <TableHeaderCell className="text-xs py-2 border-r border-slate-800/50 w-20">성적</TableHeaderCell>
                                    <TableHeaderCell className="text-xs py-2">플레이오프</TableHeaderCell>
                                </TableHead>
                                <TableBody>
                                    {[...seasonHistory].reverse().map(entry => {
                                        const entryTeamInfo = TEAM_DATA[entry.teamId];
                                        const resultCfg = entry.playoffResult
                                            ? PLAYOFF_RESULT_CONFIG[entry.playoffResult]
                                            : null;
                                        return (
                                            <TableRow key={entry.season} className="hover:bg-slate-900/40 transition-colors">
                                                <TableCell className="text-xs font-mono text-slate-400 py-2 border-r border-slate-800/50">
                                                    {entry.season}
                                                </TableCell>
                                                <TableCell className="py-2 border-r border-slate-800/50">
                                                    <div className="flex items-center gap-1.5">
                                                        <img src={getTeamLogoUrl(entry.teamId)} className="w-4 h-4 object-contain shrink-0" alt="" />
                                                        <span className="text-xs text-slate-300 truncate">
                                                            {entryTeamInfo ? entryTeamInfo.name : entry.teamId.toUpperCase()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs font-mono font-bold text-white py-2 border-r border-slate-800/50">
                                                    {entry.wins}승 {entry.losses}패
                                                </TableCell>
                                                <TableCell className="py-2">
                                                    {resultCfg ? (
                                                        <span className={`text-xs ko-normal flex items-center gap-1 ${resultCfg.className}`}>
                                                            {entry.playoffResult === 'Champion' && <Trophy size={11} />}
                                                            {resultCfg.label}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-700 ko-normal">—</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="flex items-center justify-center py-8 text-slate-600 text-xs ko-normal">
                                완료된 시즌 기록이 없습니다.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

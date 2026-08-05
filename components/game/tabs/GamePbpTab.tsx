
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { PbpLog, Team, ShotEvent } from '../../../types';
import { TEAM_DATA } from '../../../data/teamData';
import { ArrowRight, Clock } from 'lucide-react';
import { PlayTypeStats } from '../PlayTypeStats';

interface GamePbpTabProps {
    logs?: PbpLog[];
    homeTeam: Team;
    awayTeam: Team;
    /** 플레이타입 비율·성공률·창출득점(우측 패널)용 샷 이벤트 — 없으면 섹션이 빈 상태로 표시됨 */
    shotEvents?: ShotEvent[];
    /** 제공되면 원형 로고 대신 사각형 색상 배지 렌더링(멀티플레이어 전용 스타일) */
    homeBadge?: { color: string; abbr: string };
    awayBadge?: { color: string; abbr: string };
}

interface ProcessedLog extends PbpLog {
    homeScore: number;
    awayScore: number;
}

export const GamePbpTab: React.FC<GamePbpTabProps> = ({ logs, homeTeam, awayTeam, shotEvents, homeBadge, awayBadge }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [selectedQuarter, setSelectedQuarter] = useState<number>(0); // 0 = All

    // [2026-08-03] ResizeObserver로 플레이타입 패널의 실제 높이를 측정해 행 높이로 쓰는 방식을
    // 시도했으나, ResizeObserver 콜백이 태생적으로 비동기라(첫 관측도 마이크로태스크 이후 발화)
    // 마운트 직후 "기본값 → 측정값"으로 높이가 바뀌는 게 육안으로 보이는 부작용이 있어 제거함.
    // 플레이타입 패널의 실제 콘텐츠 높이(헤더 40px + 최대 12행 × ~38px)에 가까운 정적 값으로 고정.

    // 로고 대신 약어 텍스트로 표기 — badge가 있으면 그 abbr, 없으면(싱글플레이어) team.id를 약어로 사용
    const awayAbbr = awayBadge?.abbr ?? awayTeam.id.toUpperCase().slice(0, 3);
    const homeAbbr = homeBadge?.abbr ?? homeTeam.id.toUpperCase().slice(0, 3);

    // 플레이타입 패널 배지 색상 — badge가 있으면 그 색(멀티플레이어), 없으면 TEAM_DATA 실제 팀 컬러(싱글플레이어)
    const awayColor = awayBadge?.color ?? TEAM_DATA[awayTeam.id]?.colors.primary ?? '#6366f1';
    const homeColor = homeBadge?.color ?? TEAM_DATA[homeTeam.id]?.colors.primary ?? '#6366f1';

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, selectedQuarter]);

    // 1. Use each log's own stored score snapshot — the engine already knows exactly who to
    // credit at the moment of the event, so trust it instead of re-deriving from points+teamId.
    // [FIX 2026-08-03] The previous points+teamId recompute assumed teamId always means "the
    // team credited with these points", which breaks for technical foul FTs — there teamId is
    // the team being penalized (matches foulTeamId semantics elsewhere), not the scoring team.
    // That single misread permanently shifted the running score by 1 for the rest of the game
    // (e.g. final 100:100 shown instead of the true 99:101). Only fall back to carrying the
    // previous score forward for the rare events with no snapshot at all (e.g. tip-off).
    const processedLogs = useMemo(() => {
        if (!logs) return [];
        let hScore = 0;
        let aScore = 0;

        return logs.map(log => {
            if (log.homeScore != null && log.awayScore != null) {
                hScore = log.homeScore;
                aScore = log.awayScore;
            }

            return {
                ...log,
                homeScore: hScore,
                awayScore: aScore
            } as ProcessedLog;
        });
    }, [logs]);

    // 2. Filter by Quarter
    const displayLogs = useMemo(() => {
        if (selectedQuarter === 0) return processedLogs;
        return processedLogs.filter(l => l.quarter === selectedQuarter);
    }, [processedLogs, selectedQuarter]);

    // Helper to format log text
    const renderLogContent = (text: string, homeTeam: Team, awayTeam: Team, teamId?: string) => {
        // [New] Structured Substitution Parsing
        if (text.startsWith('교체:')) {
            // Expected format: "교체: IN [Name, Name] OUT [Name, Name]"
            const inMatch = text.match(/IN \[(.*?)\]/);
            const outMatch = text.match(/OUT \[(.*?)\]/);

            if (inMatch && outMatch) {
                const inPlayers = inMatch[1].split(',').map(s => s.trim());
                const outPlayers = outMatch[1].split(',').map(s => s.trim());
                const subTeamAbbr = teamId === homeTeam.id ? homeAbbr : awayAbbr;

                return (
                    <div className="flex flex-col gap-1 text-xs">
                        <div className="text-slate-400">{subTeamAbbr} 선수교체</div>
                        <div className="flex items-center gap-2 text-emerald-400">
                            <span>IN:</span>
                            <div className="flex flex-wrap gap-2">
                                {inPlayers.map((p, i) => <span key={i} className="font-bold">{p}</span>)}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-red-400">
                            <span>OUT:</span>
                            <div className="flex flex-wrap gap-2">
                                {outPlayers.map((p, i) => <span key={i} className="font-bold opacity-80">{p}</span>)}
                            </div>
                        </div>
                    </div>
                );
            }
        }

        // Standard formatting for other logs
        let cleanText = text.replace(/^\[\d+-\d+\]\s*/, '');
        cleanText = cleanText.replace(/^[-\.]+\s*(.*?)\s*[-\.]+$/, '$1');
        cleanText = cleanText.replace(/\s*\(\d+\s*:\s*\d+\)$/, '');

        // Collect all player names for highlighting
        const playerNames = new Set<string>();
        [...homeTeam.roster, ...awayTeam.roster].forEach(p => playerNames.add(p.name));

        const matchedNames = Array.from(playerNames)
            .filter(name => cleanText.includes(name))
            .sort((a, b) => b.length - a.length);

        if (matchedNames.length > 0) {
            const regex = new RegExp(`(${matchedNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
            const split = cleanText.split(regex);
            
            return (
                <span>
                    {split.map((part, i) => 
                        playerNames.has(part) ? <span key={i}>{part}</span> : part
                    )}
                </span>
            );
        }

        return cleanText;
    };

    if (!logs || logs.length === 0) return (
        <div className="w-full h-64 flex items-center justify-center text-slate-500 font-bold bg-slate-900/50 rounded-xl border border-slate-800">
            기록된 로그가 없습니다.
        </div>
    );

    return (
        <div className="h-[520px] w-full flex flex-col md:flex-row animate-in fade-in slide-in-from-right-4 duration-300">
            {/* 좌측: PBP 커멘터리 — 카드(배경/테두리/라운딩/그림자) 해체, 우측 영역과의 경계만 구분선(border-r)으로 표시 (5:5 중 5) */}
            <div className="flex-[5] min-w-0 min-h-0 flex flex-col border-b md:border-b-0 md:border-r border-slate-800">
                {/* 헤더: 쿼터 필터 — 애니메이션 없이 클릭 즉시 상태 전환 */}
                <div className="shrink-0 flex items-center gap-1 px-3 h-11 border-b border-slate-800 bg-slate-950/60 overflow-x-auto">
                    {[0, 1, 2, 3, 4].map(q => (
                        <button
                            key={q}
                            onClick={() => setSelectedQuarter(q)}
                            className={`px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-widest whitespace-nowrap transition-colors
                                ${selectedQuarter === q ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {q === 0 ? '전체' : `${q}쿼터`}
                        </button>
                    ))}
                </div>

                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto custom-scrollbar font-mono text-xs bg-slate-900"
                >
                {/* 컬럼 헤더 — 우측 플레이타입 패널(PlayTypeStats.tsx)/박스스코어(Table.tsx)와 동일 톤:
                    bg-slate-950 sticky + text-slate-500 font-black uppercase */}
                <div className="flex items-center gap-4 px-4 h-10 bg-slate-950 sticky top-0 z-10 border-b border-slate-800 shadow-sm">
                    <div className="flex-shrink-0 w-6 text-center text-xs font-black uppercase text-slate-500">Q</div>
                    <div className="flex-shrink-0 w-12 text-center text-xs font-black uppercase text-slate-500">시간</div>
                    <div className="flex-shrink-0 w-8 flex justify-center text-xs font-black uppercase text-slate-500">원정</div>
                    <div className="flex-shrink-0 w-16 text-center text-xs font-black uppercase text-slate-500">스코어</div>
                    <div className="flex-shrink-0 w-8 flex justify-center text-xs font-black uppercase text-slate-500">홈</div>
                    <div className="flex-1 pl-2 text-xs font-black uppercase text-slate-500">기록</div>
                </div>
                <div className="divide-y divide-slate-800/50">
                    {displayLogs.map((log, idx) => {
                        const isHome = log.teamId === homeTeam.id;
                        const isScore = log.type === 'score';
                        const isImportant = log.type === 'info' || log.type === 'timeout';
                        const isInjury = log.type === 'injury';
                        const isFT = log.type === 'freethrow';
                        const isFoul = log.type === 'foul';
                        const isTurnover = log.type === 'turnover';
                        
                        // Check for Game Flow Events — teamId === 'SYSTEM'이 엔진이 실제로 붙이는 마커
                        // (liveEngine.ts: 경기 시작/쿼터 전환/하프타임 로그 전부 teamId: 'SYSTEM').
                        // [Fix] 이전엔 텍스트에 '경기 시작'/'종료'/'하프 타임'이 포함되는지로 판별했는데,
                        // "2쿼터 시작"/"4쿼터 시작"처럼 이 세 문구를 하나도 포함하지 않는 실제 로그 텍스트가
                        // 있어서 일반 행으로 새어나갔음 — teamId 기준이 문구 변경에도 안전함.
                        const isFlowEvent = log.teamId === 'SYSTEM';

                        if (isFlowEvent) {
                             return (
                                <div key={idx} className="flex items-center justify-center py-3 bg-amber-500/10 border-y border-amber-500/20">
                                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-widest">
                                        <Clock size={14} />
                                        <span>{log.text}</span>
                                    </div>
                                </div>
                             );
                        }
                        
                        // Text Color
                        let textColor = 'text-slate-400';
                        if (isInjury) textColor = 'text-red-400 font-bold';
                        else if (isImportant) textColor = 'text-slate-300';
                        // 자유투는 "성공"(points > 0)한 경우만 일반 득점과 동일한 색상 — 전부 실패면 기본색 유지
                        else if (isScore || (isFT && (log.points ?? 0) > 0)) textColor = 'text-slate-200';
                        else if (isFoul || isTurnover) textColor = 'text-red-400';

                        // Background — 모든 일반 행은 배경 통일(호버만 강조). 배경 구분은 쿼터 시작/종료 등
                        // 흐름 이벤트(위 isFlowEvent, 별도 배너 렌더링)에만 적용.
                        const bgClass = 'hover:bg-white/5 transition-colors';

                        // 이 로그에서 득점이 발생했으면(자유투는 성공만) 득점팀의 약어/스코어를 네온 그린으로 하이라이트
                        const didScore = isScore || (isFT && (log.points ?? 0) > 0);
                        const awayScored = didScore && !isHome;
                        const homeScored = didScore && isHome;
                        const scoreHighlight = 'text-[#00e676] drop-shadow-[0_0_4px_rgba(0,230,118,0.65)]';

                        const timeDisplay = (log.timeRemaining || '-');

                        return (
                            <div key={idx} className={`flex items-center py-2.5 px-4 gap-4 ${bgClass}`}>
                                {/* 1. Quarter */}
                                <div className="flex-shrink-0 w-6 text-slate-300 text-xs text-center">
                                    {log.quarter}Q
                                </div>

                                {/* 2. Time */}
                                <div className="flex-shrink-0 w-12 text-slate-300 text-xs text-center">
                                    {timeDisplay}
                                </div>

                                {/* 3. Away Abbr */}
                                <div className="flex-shrink-0 w-8 flex justify-center">
                                    <span className={`text-xs tracking-tight ${awayScored ? scoreHighlight : 'text-slate-300'}`}>{awayAbbr}</span>
                                </div>

                                {/* 4. Score (Text Only) */}
                                <div className="flex-shrink-0 w-16 text-center">
                                    <div className="text-slate-300 text-xs tracking-tight">
                                        <span className={awayScored ? scoreHighlight : ''}>{log.awayScore}</span>
                                        <span className="mx-1 text-slate-500">:</span>
                                        <span className={homeScored ? scoreHighlight : ''}>{log.homeScore}</span>
                                    </div>
                                </div>

                                {/* 5. Home Abbr */}
                                <div className="flex-shrink-0 w-8 flex justify-center">
                                    <span className={`text-xs tracking-tight ${homeScored ? scoreHighlight : 'text-slate-300'}`}>{homeAbbr}</span>
                                </div>

                                {/* 6. Message */}
                                <div className={`flex-1 break-words leading-relaxed pl-2 ${textColor}`}>
                                    {renderLogContent(log.text, homeTeam, awayTeam, log.teamId)}
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                {displayLogs.length === 0 && (
                    <div className="py-20 text-center text-slate-600">
                        해당 쿼터의 기록이 없습니다.
                    </div>
                )}
                </div>
            </div>

            {/* 우측: 플레이타입 — 카드(배경/테두리/라운딩/그림자) 해체, 여백 없이 좌측과 이어짐 (5:5 중 5).
                이 wrapper 자체는 flex 자식이라 align-items:stretch로 부모(h-[520px])와 동일한 높이를
                자동으로 받는다(min-w-0/min-h-0는 그 높이를 내용 때문에 못 줄이는 상황을 막는 안전장치).
                실제 좌우 높이 불일치의 진짜 원인은 여기가 아니라 PlayTypeStats.tsx 내부에 있었음
                — 자세한 설명은 그 파일의 [Fix 2026-08-03] 주석 참고. */}
            <div className="flex-[5] min-w-0 min-h-0 overflow-y-auto custom-scrollbar">
                <PlayTypeStats
                    shotEvents={shotEvents}
                    homeTeamId={homeTeam.id}
                    awayTeamId={awayTeam.id}
                    homeBadge={{ color: homeColor, abbr: homeAbbr }}
                    awayBadge={{ color: awayColor, abbr: awayAbbr }}
                />
            </div>
        </div>
    );
};

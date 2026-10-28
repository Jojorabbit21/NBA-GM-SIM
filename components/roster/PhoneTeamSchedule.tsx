// PhoneTeamSchedule.tsx — 폰(<768) 팀 화면 "일정" 탭. [2026-10-27 모바일 팀 화면]
// docs/ui/mobile-design-system.md §9-1-5, 캔버스 6행 E12·E13. 데스크톱 TeamScheduleCalendar(월 내비 + 좌 리스트/우 달력 2열)를 세로 1열로:
//   월 내비 44(고정) → [스크롤] 7열 달력(셀 정방형, 데스크톱 색 규칙: 종료 승/패 틴트 · 예정 상대 팀색 · 경기 없음 slate-800/60 · 오늘 노란 링)
//   → 그 달 경기 리스트(행 40: 날짜 · vs 상대 · W/L+스코어 또는 시각). 최우수선수 열은 폰에서 없음(2026-10-27 사용자 지시).
//   초기 월·셀 데이터 규칙은 데스크톱과 동일(다음 예정 경기 달, 없으면 최근 경기 달, 없으면 오늘). 셀/행 탭 = 경기 상세(onScoreClick).
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Team, Game } from '../../types';
import { getReadableTextColor } from '../../utils/colorContrast';
import { EmptyState } from '../common/EmptyState';

interface PhoneTeamScheduleProps {
    team: Team;
    schedule: Game[];
    allTeams: Team[];
    onScoreClick?: (gameId: string) => void;
    /** 시뮬레이션 상의 현재 날짜(YYYY-MM-DD) — 오늘 강조·초기 월 기준 */
    currentSimDate?: string;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const PhoneTeamSchedule: React.FC<PhoneTeamScheduleProps> = ({ team, schedule, allTeams, onScoreClick, currentSimDate }) => {
    const teamGames = useMemo(() => schedule.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id), [schedule, team.id]);
    const gamesByDate = useMemo(() => {
        const m = new Map<string, Game>();
        for (const g of teamGames) m.set(g.date.slice(0, 10), g);
        return m;
    }, [teamGames]);
    const teamById = useMemo(() => new Map(allTeams.map(t => [t.id, t])), [allTeams]);
    const todayStr = currentSimDate ?? new Date().toISOString().slice(0, 10);

    const initialYM = useMemo((): [number, number] => {
        const upcoming = [...teamGames].filter(g => !g.played && g.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))[0];
        const target = upcoming ?? [...teamGames].sort((a, b) => b.date.localeCompare(a.date))[0];
        const d = target ? new Date(target.date.slice(0, 10) + 'T00:00:00') : new Date(todayStr + 'T00:00:00');
        return [d.getFullYear(), d.getMonth()];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamGames]);
    const [[vy, vm], setViewYM] = useState<[number, number]>(initialYM);

    const cells = useMemo(() => {
        const firstWeekday = new Date(vy, vm, 1).getDay();
        const daysInMonth = new Date(vy, vm + 1, 0).getDate();
        const list: (number | null)[] = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
        while (list.length % 7 !== 0) list.push(null);
        return list;
    }, [vy, vm]);

    const monthGames = useMemo(() => {
        const prefix = `${vy}-${String(vm + 1).padStart(2, '0')}`;
        return teamGames.filter(g => g.date.slice(0, 7) === prefix).sort((a, b) => a.date.localeCompare(b.date));
    }, [teamGames, vy, vm]);

    const info = (g: Game) => {
        const isHome = g.homeTeamId === team.id;
        const oppId = isHome ? g.awayTeamId : g.homeTeamId;
        const opp = teamById.get(oppId);
        const my = isHome ? g.homeScore : g.awayScore;
        const op = isHome ? g.awayScore : g.homeScore;
        const win = g.played && my != null && op != null && my > op;
        const loss = g.played && my != null && op != null && my < op;
        return { isHome, oppId, opp, my, op, win, loss };
    };
    const open = (g: Game) => onScoreClick?.(g.id);

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* 월 내비 44 고정 */}
            <div className="shrink-0 h-11 px-4 flex items-center justify-center gap-2 border-b border-slate-800 bg-slate-900">
                <button type="button" aria-label="이전 달" onClick={() => setViewYM(vm === 0 ? [vy - 1, 11] : [vy, vm - 1])} className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 active:bg-white/10"><ChevronLeft size={18} /></button>
                <span className="min-w-[120px] text-center text-base font-bold text-white tabular-nums">{vy}년 {vm + 1}월</span>
                <button type="button" aria-label="다음 달" onClick={() => setViewYM(vm === 11 ? [vy + 1, 0] : [vy, vm + 1])} className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 active:bg-white/10"><ChevronRight size={18} /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {/* 달력 — 데스크톱 우측 달력의 색 규칙 그대로, 셀만 작게(라운드 6, 패딩 4, 글자 10~11) */}
                <div className="px-4 pt-2 pb-3 border-b border-slate-800">
                    <div className="grid grid-cols-7 gap-1 mb-1">
                        {WEEKDAYS.map(d => <div key={d} className="text-center text-xs font-bold text-slate-500 py-1">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {cells.map((day, i) => {
                            if (day === null) return <div key={i} className="aspect-square" />;
                            const dateKey = `${vy}-${String(vm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const g = gamesByDate.get(dateKey);
                            const isToday = dateKey === todayStr;
                            const ring = isToday ? 'ring-2 ring-yellow-400 ring-inset' : '';
                            if (!g) {
                                return (
                                    <div key={i} className={`aspect-square rounded-md border border-slate-800/60 bg-slate-800/60 p-1 ${ring}`}>
                                        <span className="text-[11px] leading-3 font-semibold text-slate-600 tabular-nums">{day}</span>
                                    </div>
                                );
                            }
                            const { isHome, oppId, opp, my, op, win, loss } = info(g);
                            const cellBg = win || loss ? undefined : (opp?.colorPrimary ?? undefined);
                            const cellText = getReadableTextColor(cellBg);
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => open(g)}
                                    disabled={!onScoreClick}
                                    style={cellBg ? { backgroundColor: cellBg, color: cellText } : undefined}
                                    className={`aspect-square rounded-md border p-1 flex flex-col items-stretch overflow-hidden text-left ${
                                        win ? 'border-emerald-500/40 bg-emerald-500/20 text-slate-200' : loss ? 'border-red-500/40 bg-red-500/20 text-slate-200' : cellBg ? 'border-black/20' : 'border-slate-800 bg-slate-900/60 text-slate-200'
                                    } ${ring}`}
                                >
                                    <span className="flex justify-between">
                                        <span className="text-[11px] leading-3 font-semibold tabular-nums" style={{ opacity: cellBg ? 0.75 : 1 }}>{day}</span>
                                        {(win || loss) && <span className="text-[11px] leading-3 font-semibold">{win ? 'W' : 'L'}</span>}
                                    </span>
                                    <span className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0">
                                        <span className="text-[11px] leading-3 font-extrabold whitespace-nowrap">{isHome ? 'vs' : '@'} {opp?.abbr ?? oppId}</span>
                                        <span className="text-[10px] leading-3 font-extrabold tabular-nums">{g.played ? `${my}-${op}` : (g.time ?? '예정')}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                {/* 리스트 — 날짜 · 상대 · 결과(또는 시각)만(§9-1-5 폰 규칙). 행 40, 경기 기록 카드 1줄과 같은 셀 스타일. */}
                {monthGames.length === 0 ? (
                    <div className="py-8"><EmptyState title="이 달엔 예정된 경기가 없습니다." /></div>
                ) : (
                    <div className="flex flex-col">
                        {monthGames.map(g => {
                            const { isHome, oppId, opp, my, op, win } = info(g);
                            const dateKey = g.date.slice(0, 10);
                            const isToday = dateKey === todayStr;
                            return (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => open(g)}
                                    disabled={!onScoreClick}
                                    className={`w-full h-10 px-4 flex items-center gap-2.5 text-left border-b border-slate-800 active:bg-white/5 disabled:cursor-default ${isToday ? 'bg-yellow-400/10' : ''}`}
                                >
                                    <span className="w-11 shrink-0 text-sm font-medium text-slate-400 tabular-nums">{dateKey.slice(5).replace('-', '/')}</span>
                                    <span className="flex-1 min-w-0 flex items-center gap-1.5">
                                        <span className="shrink-0 text-sm font-medium text-slate-400">{isHome ? 'vs' : '@'}</span>
                                        <span className="text-sm font-semibold text-slate-300 truncate">{opp?.name ?? oppId}</span>
                                    </span>
                                    {g.played ? (
                                        <>
                                            <span className={`shrink-0 text-sm font-medium ${win ? 'text-emerald-400' : 'text-red-400'}`}>{win ? 'W' : 'L'}</span>
                                            <span className={`shrink-0 min-w-[56px] text-right text-sm font-medium tabular-nums underline decoration-white/25 ${win ? 'text-emerald-300' : 'text-red-300'}`}>{my}-{op}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="shrink-0 text-sm text-slate-600">-</span>
                                            <span className="shrink-0 min-w-[56px] text-right text-sm font-medium text-slate-400 tabular-nums">{g.time ?? '예정'}</span>
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
                <div aria-hidden="true" className="h-14 pb-safe" />
            </div>
        </div>
    );
};

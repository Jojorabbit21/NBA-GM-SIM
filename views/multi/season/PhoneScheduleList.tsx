// PhoneScheduleList.tsx — 폰(<768) 리그 경기 일정 화면(하단 "경기" 탭 루트)의 렌더 전용 부품. [2026-10-27 모바일]
// docs/ui/mobile-design-system.md §9-1-8, 캔버스 9행 S1~S3. 데이터·날짜 상태·라이브 폴링은 MultiScheduleView가 그대로 갖고,
// 여기서는 화면 헤더 44(시즌 일정 · 오늘 · 달력) + 날짜 캐러셀 64(‹ 5칸 ›, 선택 칸 탭 → 달력 시트) + 경기 카드 1줄 56
// ([원정 로고 28][약어 16/700][가운데 92: 스코어 18 또는 시각 + 캡션 11][홈 약어][홈 로고])를 그린다. 시간순 단일 리스트(섹션 없음),
// LIVE만 밝은 배경(slate-800), 내 경기 틴트 없음, 최우수선수·보기 버튼 없음. 카드 탭 = 경기 화면.
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Star } from 'lucide-react';
import type { Game } from '../../../types';
import type { GameDisplayState } from './multiGameReveal';
import type { LiveGameSummary } from '../../../services/multi/liveGameService';
import type { AllStarTeamDisplayInfo } from '../../../hooks/useAllStarTeamDisplay';
import { addDaysToKey, fmtMonthDot, fmtTime } from './multiScheduleUtils';
import { periodShortLabel, overtimeTag } from '../../../utils/periodLabel';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { EmptyState } from '../../../components/common/EmptyState';
import { BottomSheet } from '../../../components/mobile/BottomSheet';
import { MonthCalendarPopover } from './MonthCalendarPopover';

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const OFFSETS = [-2, -1, 0, 1, 2];

export interface PhoneAllStarItem { key: string; label: string; time?: string; past: boolean; clickable: boolean; onClick: () => void; away?: string; home?: string }

interface PhoneScheduleListProps {
    activeDate: string;
    todayKey: string | null;
    selectableDates: Set<string>;
    onChangeDate: (dateKey: string) => void;
    games: Game[];
    stateOf: (g: Game) => GameDisplayState;
    teamMap: Record<string, { team_abbr?: string; team_name?: string } | undefined>;
    allstarDisplay: Record<string, AllStarTeamDisplayInfo>;
    liveSummaries: Record<string, LiveGameSummary>;
    roundLabelMap: Record<string, string>;
    preferVirtual: boolean;
    allStarItems: PhoneAllStarItem[];
    onView: (gameId: string) => void;
}

/** 날짜 캐러셀 64 — ‹ 40 · 52×48 칸 5개(요일 12 위 + `2.3` 15/700 아래, 선택 indigo-600) · › 40. 선택 칸 탭 = 달력 시트. */
const DateCarousel: React.FC<{ activeDate: string; onChange: (d: string) => void; onOpenCalendar: () => void }> = ({ activeDate, onChange, onOpenCalendar }) => (
    <div className="shrink-0 h-16 px-2 py-2 box-border flex items-center justify-center gap-0.5 bg-slate-900 border-b border-slate-800">
        <button type="button" aria-label="하루 전" onClick={() => onChange(addDaysToKey(activeDate, -1))} className="w-10 h-12 flex items-center justify-center text-slate-400 active:bg-white/10 rounded-lg"><ChevronLeft size={20} /></button>
        {OFFSETS.map(off => {
            const dk = addDaysToKey(activeDate, off);
            const on = off === 0;
            const wd = WEEKDAYS_KO[new Date(dk + 'T00:00:00').getDay()];
            return (
                <button
                    key={off}
                    type="button"
                    onClick={() => on ? onOpenCalendar() : onChange(dk)}
                    aria-current={on ? 'date' : undefined}
                    className={`w-[52px] h-12 rounded-lg flex flex-col items-center justify-center gap-[3px] ${on ? 'bg-indigo-600' : 'active:bg-white/10'}`}
                >
                    <span className={`text-xs leading-[14px] font-medium ${on ? 'text-indigo-200' : 'text-slate-500'}`}>{wd}</span>
                    <span className={`text-[15px] leading-[18px] font-bold ${on ? 'text-white' : 'text-slate-300'}`}>{fmtMonthDot(dk)}</span>
                </button>
            );
        })}
        <button type="button" aria-label="하루 후" onClick={() => onChange(addDaysToKey(activeDate, 1))} className="w-10 h-12 flex items-center justify-center text-slate-400 active:bg-white/10 rounded-lg"><ChevronRight size={20} /></button>
    </div>
);

const TeamSide: React.FC<{ abbr: string; dim: boolean; bold: boolean; align: 'left' | 'right' }> = ({ abbr, dim, bold, align }) => (
    <span className={`flex-1 min-w-0 text-base leading-5 whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'} ${bold ? 'font-bold' : 'font-bold'} ${dim ? 'text-slate-500' : 'text-white'}`}>{abbr}</span>
);

export const PhoneScheduleList: React.FC<PhoneScheduleListProps> = ({
    activeDate, todayKey, selectableDates, onChangeDate, games, stateOf, teamMap, allstarDisplay, liveSummaries, roundLabelMap, preferVirtual, allStarItems, onView,
}) => {
    const [calOpen, setCalOpen] = useState(false);
    const [viewYM, setViewYM] = useState<[number, number]>(() => { const [y, m] = activeDate.split('-').map(Number); return [y, m - 1]; });
    useEffect(() => { if (calOpen) { const [y, m] = activeDate.split('-').map(Number); setViewYM([y, m - 1]); } }, [calOpen, activeDate]);

    const abbrOf = (id: string) => teamMap[id]?.team_abbr ?? allstarDisplay[id]?.abbr ?? id;

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* 화면 헤더 44 */}
            <div className="shrink-0 h-11 pl-4 pr-2 flex items-center gap-2 bg-slate-900 border-b border-slate-800">
                <h1 className="flex-1 m-0 text-lg leading-6 font-bold text-white">시즌 일정</h1>
                <button type="button" onClick={() => todayKey && onChangeDate(todayKey)} disabled={!todayKey} className="h-8 px-2.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 active:bg-slate-700 disabled:opacity-50">오늘</button>
                <button type="button" aria-label="날짜 선택" onClick={() => setCalOpen(true)} className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-200 active:bg-white/10"><Calendar size={22} /></button>
            </div>
            <DateCarousel activeDate={activeDate} onChange={onChangeDate} onOpenCalendar={() => setCalOpen(true)} />
            <BottomSheet open={calOpen} title="날짜 선택" onClose={() => setCalOpen(false)}>
                <div className="-mx-4">
                    <MonthCalendarPopover
                        inline
                        position={{ x: 0, y: 0 }}
                        viewYM={viewYM}
                        onViewYMChange={setViewYM}
                        selectableDates={selectableDates}
                        activeDateKey={activeDate}
                        onSelect={dk => { onChangeDate(dk); setCalOpen(false); }}
                    />
                </div>
                <p className="pt-2 text-xs text-slate-500">경기가 있는 날만 선택할 수 있습니다.</p>
            </BottomSheet>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {games.length === 0 && allStarItems.length === 0 ? (
                    <div className="py-10"><EmptyState title="이 날짜엔 예정된 경기가 없습니다." /></div>
                ) : (
                    <div className="px-4 pt-3 flex flex-col gap-2">
                        {/* 올스타 이벤트(실제 경기 행이 없는 날) — 같은 카드 틀: ★ + 이벤트명 + 시각 */}
                        {allStarItems.map(it => (
                            <button key={it.key} type="button" disabled={!it.clickable} onClick={it.onClick} className="h-14 px-3 flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg text-left disabled:opacity-60">
                                {it.away && it.home ? (
                                    <>
                                        <TeamLogo teamId={it.away} teamName={abbrOf(it.away)} size="custom" className="w-7 h-7 shrink-0" shadow={false} />
                                        <TeamSide abbr={abbrOf(it.away)} dim={false} bold align="left" />
                                        <span className="w-[92px] shrink-0 flex flex-col items-center gap-0.5"><span className="text-lg leading-[22px] font-semibold text-slate-400">{it.time ?? '-'}</span><span className="text-[11px] leading-[13px] font-semibold text-slate-500">{it.past ? '종료' : it.label}</span></span>
                                        <TeamSide abbr={abbrOf(it.home)} dim={false} bold align="right" />
                                        <TeamLogo teamId={it.home} teamName={abbrOf(it.home)} size="custom" className="w-7 h-7 shrink-0" shadow={false} />
                                    </>
                                ) : (
                                    <>
                                        <Star size={16} className="text-indigo-300 shrink-0" />
                                        <span className="flex-1 min-w-0 text-base font-bold text-white truncate">{it.label}</span>
                                        <span className="text-sm font-semibold text-slate-400">{it.past ? '종료' : (it.time ?? '예정')}</span>
                                    </>
                                )}
                            </button>
                        ))}
                        {games.map(g => {
                            const state = stateOf(g);
                            const live = liveSummaries[g.id];
                            const roundLabel = g.isPlayoff && g.seriesId ? roundLabelMap[g.seriesId] : undefined;
                            const awayWon = state === 'final' && g.homeScore != null && g.awayScore != null && g.awayScore > g.homeScore;
                            const homeWon = state === 'final' && g.homeScore != null && g.awayScore != null && g.homeScore > g.awayScore;
                            const liveScore = state === 'live' && live && live.homeScore != null && live.awayScore != null;
                            return (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => onView(g.id)}
                                    className={`h-14 px-3 flex items-center gap-2 rounded-lg border text-left active:brightness-110 ${state === 'live' ? 'bg-slate-800 border-slate-700' : 'bg-slate-900 border-slate-800'}`}
                                >
                                    <TeamLogo teamId={g.awayTeamId} teamName={abbrOf(g.awayTeamId)} size="custom" className="w-7 h-7 shrink-0" shadow={false} />
                                    <TeamSide abbr={abbrOf(g.awayTeamId)} dim={state === 'final' && !awayWon} bold={awayWon} align="left" />
                                    <span className="w-[92px] shrink-0 flex flex-col items-center gap-0.5">
                                        {state === 'scheduled' ? (
                                            <>
                                                <span className="text-lg leading-[22px] font-semibold text-slate-400">{fmtTime(g, preferVirtual)}</span>
                                                <span className="text-[11px] leading-[13px] font-semibold text-slate-500">{roundLabel ?? '예정'}</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-lg leading-[22px] font-bold">
                                                    <span className={state === 'final' && !awayWon ? 'text-slate-500' : 'text-white'}>{state === 'live' ? (liveScore ? live!.awayScore : '-') : g.awayScore}</span>
                                                    <span className="text-slate-600"> - </span>
                                                    <span className={state === 'final' && !homeWon ? 'text-slate-500' : 'text-white'}>{state === 'live' ? (liveScore ? live!.homeScore : '-') : g.homeScore}</span>
                                                </span>
                                                {state === 'live' ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] leading-[13px] font-extrabold text-red-400">
                                                        <span className="w-[5px] h-[5px] rounded-full bg-red-500 animate-pulse" />LIVE {live ? `${periodShortLabel(live.quarter ?? 1)} ${live.clock ?? ''}` : ''}
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] leading-[13px] font-semibold text-slate-500">{g.otPeriods ? `종료 (${overtimeTag(g.otPeriods)})` : '종료'}{roundLabel ? ` · ${roundLabel}` : ''}</span>
                                                )}
                                            </>
                                        )}
                                    </span>
                                    <TeamSide abbr={abbrOf(g.homeTeamId)} dim={state === 'final' && !homeWon} bold={homeWon} align="right" />
                                    <TeamLogo teamId={g.homeTeamId} teamName={abbrOf(g.homeTeamId)} size="custom" className="w-7 h-7 shrink-0" shadow={false} />
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

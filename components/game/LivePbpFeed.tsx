import React from 'react';
import type { PbpLog } from '../../types';
import { SegmentedControl } from '../common/SegmentedControl';
import { periodShortLabel } from '../../utils/periodLabel';
import { pbpLogCategory, PBP_TEXT_COLOR, PBP_SCORE_HIGHLIGHT, pbpScored, pbpDisplayText } from '../../utils/pbpLogStyle';
import { SubChangeBlock } from '../../views/multi/season/MultiGamePbpView';

// [2026-11-23] 라이브 PBP 피드 — 멀티 라이브 화면(MultiGamePbpView pbpFeedBody 데스크톱판)과 같은 디자인:
// 헤더(h-10, "플레이-바이-플레이" + 공용 SegmentedControl 쿼터 필터) → 컬럼 머리(원정 팀명 | 시간 | 홈 팀명) →
// "원정 코멘터리 | 원정 점수 | 쿼터·시간 | 홈 점수 | 홈 코멘터리" 좌우 대칭 행(이벤트 팀 쪽에만 문구), 교체는 SubChangeBlock, 시스템 줄은 가운데,
// 최신 행(맨 위)은 animate-pbp-row-flash. 표시 규칙(색·점수 강조)은 utils/pbpLogStyle 공통.

export interface PbpFeedItem { log: PbpLog; idx: number }

interface LivePbpFeedProps {
    /** 최신순(맨 위 = 가장 최근), idx = 전체 로그에서의 불변 인덱스(행 key — 새 로그마다 최신 행 애니메이션이 새로 재생되게) */
    items: PbpFeedItem[];
    homeTeamId: string;
    homeAbbr: string;
    awayAbbr: string;
    homeName: string;
    awayName: string;
    /** 0 = 전체, 1~ = 쿼터(5~ 연장) */
    quarterFilter: number;
    onQuarterFilterChange: (q: number) => void;
    /** 필터에 나열할 쿼터 번호(전체 제외, 연장 포함) */
    periods: number[];
    /** 지금 선택 가능한 최대 쿼터 — 이보다 큰 쿼터는 비활성 */
    maxSelectableQ: number;
    otCount: number;
}

export const LivePbpFeed: React.FC<LivePbpFeedProps> = ({
    items, homeTeamId, homeAbbr, awayAbbr, homeName, awayName, quarterFilter, onQuarterFilterChange, periods, maxSelectableQ, otCount,
}) => (
    <>
        <div className="shrink-0 flex items-center bg-slate-800 border-b border-slate-700 px-3 h-10">
            <div className="flex items-center justify-between gap-3 w-full">
                <p className="text-sm text-slate-300 font-semibold">플레이-바이-플레이</p>
                <SegmentedControl
                    size="sm"
                    value={String(quarterFilter)}
                    onChange={v => onQuarterFilterChange(Number(v))}
                    options={[0, ...periods].map(q => ({
                        value: String(q),
                        label: q === 0 ? '전체' : periodShortLabel(q, otCount, '1Q'),
                        disabled: q > maxSelectableQ && q !== 0,
                    }))}
                />
            </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto text-sm bg-slate-900" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
            <div className="flex items-center gap-2 px-3 h-8 bg-slate-950 sticky top-0 z-10 border-b border-slate-800 shadow-sm">
                <div className="flex-1 text-right text-sm font-black text-slate-500 truncate">{awayName}</div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="w-8 text-center text-sm font-black text-slate-500"></div>
                    <div className="w-20 text-center text-sm font-black text-slate-500">시간</div>
                    <div className="w-8 text-center text-sm font-black text-slate-500"></div>
                </div>
                <div className="flex-1 text-sm font-black text-slate-500 truncate">{homeName}</div>
            </div>

            <div>
                {items.map(({ log, idx }, i) => {
                    const isHome = log.teamId === homeTeamId;
                    const flashClass = i === 0 ? ' animate-pbp-row-flash' : '';

                    // 공통 줄(SYSTEM) = 안내 — 가운데 배치
                    if (log.teamId === 'SYSTEM') {
                        return (
                            <div key={idx} className={`flex items-center justify-center py-2 px-3 text-sm border-b border-slate-800/50 leading-relaxed text-center ${PBP_TEXT_COLOR.system}${flashClass}`}>
                                {log.text}
                            </div>
                        );
                    }
                    const scored = pbpScored(log);
                    const lineColor = pbpLogCategory(log) === 'injury' ? PBP_TEXT_COLOR.injury : PBP_TEXT_COLOR.play;
                    const lineText = pbpDisplayText(log.text);

                    const centerCols = (
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <div className="w-8 text-center pt-0.5 overflow-hidden">
                                {log.awayScore !== undefined && (
                                    <span className={`text-sm font-black tracking-tight tabular-nums ${!isHome && scored ? PBP_SCORE_HIGHLIGHT : 'text-slate-500'}`}>{log.awayScore}</span>
                                )}
                            </div>
                            <div className="w-20 text-slate-500 font-bold text-sm text-center tabular-nums pt-0.5 overflow-hidden">
                                {periodShortLabel(log.quarter, otCount, '1Q')} {log.timeRemaining || '-'}
                            </div>
                            <div className="w-8 text-center pt-0.5 overflow-hidden">
                                {log.homeScore !== undefined && (
                                    <span className={`text-sm font-black tracking-tight tabular-nums ${isHome && scored ? PBP_SCORE_HIGHLIGHT : 'text-slate-500'}`}>{log.homeScore}</span>
                                )}
                            </div>
                        </div>
                    );

                    if (log.text.startsWith('교체:')) {
                        const inMatch = log.text.match(/IN \[(.*?)\]/);
                        const outMatch = log.text.match(/OUT \[(.*?)\]/);
                        if (inMatch && outMatch) {
                            const inPlayers = inMatch[1].split(',').map(t => t.trim());
                            const outPlayers = outMatch[1].split(',').map(t => t.trim());
                            return (
                                <div key={idx} className={`flex items-start py-2 px-3 gap-2 border-b border-slate-800/50 hover:bg-white/5 transition-colors text-sm${flashClass}`}>
                                    <div className="flex-1 min-w-0">
                                        {!isHome && <SubChangeBlock side="away" abbr={awayAbbr} inPlayers={inPlayers} outPlayers={outPlayers} />}
                                    </div>
                                    {centerCols}
                                    <div className="flex-1 min-w-0">
                                        {isHome && <SubChangeBlock side="home" abbr={homeAbbr} inPlayers={inPlayers} outPlayers={outPlayers} />}
                                    </div>
                                </div>
                            );
                        }
                    }

                    return (
                        <div key={idx} className={`flex items-center py-2 px-3 gap-2 border-b border-slate-800/50 hover:bg-white/5 transition-colors${flashClass}`}>
                            <div className={`flex-1 min-w-0 text-right break-words leading-relaxed text-sm ${lineColor}`}>{!isHome ? lineText : ''}</div>
                            {centerCols}
                            <div className={`flex-1 min-w-0 break-words leading-relaxed text-sm ${lineColor}`}>{isHome ? lineText : ''}</div>
                        </div>
                    );
                })}

                {items.length === 0 && (
                    <div className="py-10 text-center text-slate-600 text-sm ko-normal">해당 쿼터의 기록이 없습니다.</div>
                )}
            </div>
        </div>
    </>
);

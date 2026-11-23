import React from 'react';
import type { PbpLog } from '../../types';
import { getReadableTextColor } from '../../utils/colorContrast';
import { TeamHeaderColumn, TimeoutDots, FoulBonusBadge, QuarterScores } from '../../views/multi/season/MultiGamePbpView';

// [2026-11-23] 라이브 경기 스코어버그 헤더 — 멀티 라이브 화면(MultiGamePbpView)의 점보트론 헤더와 같은 구성:
// 좌 30%(원정 팀색) / 가운데 40%(slate-950) / 우 30%(홈 팀색) 하드엣지 밴드 + 헤더 전체 LED 도트 텍스처,
// 팀 컬럼 = 로고 + 약어 + 점수(TeamHeaderColumn 그대로), 가운데 = 파울/보너스·타임아웃 | 쿼터 | 클락 (+ 런 🔥 + 주황 글로우) + 쿼터별 득점표.
// 싱글/퀵게임 LiveGameView 전용 — 일시정지(쿼터 종료·하프타임·타임아웃) 중에는 클락 자리가 "라벨 + 카운트다운 + 종료 버튼"으로 바뀐다.
// 멀티의 마일스톤 전광판(선수 기록 달성 문구)은 박스스코어 타임라인 기반이라 여기엔 없다 — 득점표 자리는 항상 쿼터별 득점표.

interface LiveScoreHeaderProps {
    awayTeamId: string;
    homeTeamId: string;
    awayAbbr: string;
    homeAbbr: string;
    awayColor: string;
    homeColor: string;
    awayScore: number;
    homeScore: number;
    awayFouls: number;
    homeFouls: number;
    timeoutsLeft: { home: number; away: number };
    quarterLabel: string;
    /** 'MM:SS' */
    clockLabel: string;
    /** 일시정지 중이면(경기 종료 제외) 클락 대신 표시. countdown = null이면 카운트다운 없음(사용자 일시정지) */
    pause: { label: string; countdown: number | null; resumeLabel: string; onResume: () => void } | null;
    /** 진행 중인 스코어링 런 — 없으면 null. abbr = 런을 만든 팀 약어 */
    run: { abbr: string; teamPts: number; oppPts: number } | null;
    /** 쿼터별 득점표 계산용(누적 점수 스냅샷이 든 PBP 로그) */
    logs: PbpLog[];
    /** 지금 쿼터(연장 포함, 1~) */
    currentQuarter: number;
}

export const LiveScoreHeader: React.FC<LiveScoreHeaderProps> = ({
    awayTeamId, homeTeamId, awayAbbr, homeAbbr, awayColor, homeColor, awayScore, homeScore, awayFouls, homeFouls,
    timeoutsLeft, quarterLabel, clockLabel, pause, run, logs, currentQuarter,
}) => {
    const awayText = getReadableTextColor(awayColor);
    const homeText = getReadableTextColor(homeColor);
    return (
        <div className="relative bg-slate-900 border-b border-slate-800 shrink-0 overflow-hidden">
            <div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: '30%', backgroundColor: awayColor }} />
            <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ width: '30%', backgroundColor: homeColor }} />
            <div className="absolute inset-y-0 bg-slate-950 pointer-events-none" style={{ left: '30%', width: '40%' }} />
            <div
                className="absolute inset-0 pointer-events-none opacity-70"
                style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)', backgroundSize: '4px 4px' }}
            />

            <div className="relative z-10 flex items-center">
                <TeamHeaderColumn side="away" teamSlug={awayTeamId} abbr={awayAbbr} score={awayScore} textColor={awayText} infoLoading={false} />

                <div className="flex flex-col items-center justify-center shrink-0" style={{ width: '40%' }}>
                    <div className="relative self-stretch w-full px-4 py-2">
                        {run && !pause && (
                            <>
                                <div
                                    className="absolute left-1/2 -translate-x-1/2 -z-10 pointer-events-none animate-pulse"
                                    style={{ top: '-40px', width: '900px', height: '200px', filter: 'blur(10px)',
                                        background: 'radial-gradient(ellipse 50% 50% at 50% 0%, rgba(255,120,0,0.6) 0%, rgba(239,68,68,0.4) 45%, rgba(239,68,68,0) 75%)' }}
                                />
                                <div
                                    className="absolute left-1/2 -translate-x-1/2 -z-10 pointer-events-none animate-pulse"
                                    style={{ bottom: '-40px', width: '900px', height: '200px', filter: 'blur(10px)',
                                        background: 'radial-gradient(ellipse 50% 50% at 50% 100%, rgba(255,120,0,0.6) 0%, rgba(239,68,68,0.4) 45%, rgba(239,68,68,0) 75%)' }}
                                />
                            </>
                        )}
                        <div className="w-full grid grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto] items-center gap-x-2 gap-y-1">
                            {/* 원정 파울/보너스 + 타임아웃 */}
                            <div className="col-start-1 row-start-1 row-span-2 self-center justify-self-start flex flex-col items-start gap-1.5 text-xl text-slate-400">
                                <FoulBonusBadge fouls={awayFouls} align="left" />
                                <TimeoutDots left={timeoutsLeft.away} />
                            </div>

                            {/* 쿼터 | 클락 (일시정지 중엔 라벨 + 카운트다운 + 종료) + 런 */}
                            <div className="col-start-2 row-start-1 flex flex-col items-center justify-center gap-0.5">
                                {pause ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-3xl font-black tabular-nums text-amber-400 leading-none">{pause.label}</span>
                                        {pause.countdown != null && (
                                            <span className="text-3xl font-black tabular-nums text-amber-400 leading-none w-[2ch] text-center">{pause.countdown}</span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={pause.onResume}
                                            className="px-2.5 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
                                        >
                                            {pause.resumeLabel}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-3xl font-black tabular-nums text-white leading-none">{quarterLabel}</span>
                                        <span className="text-slate-600 text-3xl leading-none font-light">|</span>
                                        <span className="text-3xl font-black tabular-nums text-slate-300 leading-none">{clockLabel}</span>
                                    </div>
                                )}
                                {run && !pause && (
                                    <span className="text-base font-bold text-white whitespace-nowrap">
                                        🔥 {run.abbr} {run.teamPts}-{run.oppPts}
                                    </span>
                                )}
                            </div>

                            {/* 쿼터별 득점표 */}
                            <div className="col-start-2 row-start-2 flex items-center justify-center min-h-[64px]">
                                <QuarterScores
                                    allLogs={logs}
                                    homeTeamId={homeTeamId}
                                    currentQuarter={currentQuarter}
                                    homeAbbr={homeAbbr}
                                    awayAbbr={awayAbbr}
                                    compact
                                />
                            </div>

                            {/* 홈 파울/보너스 + 타임아웃 */}
                            <div className="col-start-3 row-start-1 row-span-2 self-center justify-self-end flex flex-col items-end gap-1.5 text-xl text-slate-400">
                                <FoulBonusBadge fouls={homeFouls} align="right" />
                                <TimeoutDots left={timeoutsLeft.home} />
                            </div>
                        </div>
                    </div>
                </div>

                <TeamHeaderColumn side="home" teamSlug={homeTeamId} abbr={homeAbbr} score={homeScore} textColor={homeText} infoLoading={false} />
            </div>
        </div>
    );
};

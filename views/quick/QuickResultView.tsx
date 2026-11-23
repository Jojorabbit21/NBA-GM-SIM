import React, { useMemo, useRef, useState } from 'react';
import type { SimulationResult, Team } from '../../types';
import { TabBar } from '../../components/common/TabBar';
import { Button } from '../../components/common/Button';
import { TeamLogo } from '../../components/common/TeamLogo';
import { TimeoutBars, TEAM_TIMEOUTS_TOTAL } from '../../components/game/TimeoutBars';
import { GameBoxScoreTab } from '../../components/game/tabs/GameBoxScoreTab';
import { GameShotChartTab } from '../../components/game/tabs/GameShotChartTab';
import { GamePbpTab } from '../../components/game/tabs/GamePbpTab';
import { GameRotationTab } from '../../components/game/tabs/GameRotationTab';
import { GameOnOffTab } from '../../components/game/tabs/GameOnOffTab';
import { PlayTypeStats } from '../../components/game/PlayTypeStats';
import type { GameStatLeaders } from '../../components/game/BoxScoreTable';
import { TEAM_DATA } from '../../data/teamData';
import { countOvertimePeriods } from '../../utils/periodLabel';
import {
    FinalHeaderLogo, FinalTeamBlock, QuarterScores, ResultSection, RESULT_TABS,
    TeamStatsCompare, GameInsightsPanel, computeTeamStats, buildLiveMisc,
} from '../multi/season/MultiGamePbpView';
import { QuickGameHeader } from './QuickGameHeader';
import { QuickGameFooter } from './QuickGameFooter';

// [2026-11-23] Quick Game 4단계 — 멀티 경기 종료 화면(MultiGamePbpView 종료 블록)과 같은 구성:
// 스코어버그(로고·팀·점수·쿼터별 득점) → 섹션 탭 → 박스스코어/인사이트/경기 기록/팀 기록/샷차트/로테이션/온오프.
// 결과는 어디에도 저장하지 않는다. 상단 동작: 팀 설정(1단계로, 설정 유지) · 재경기(같은 설정으로 바로 3단계).

interface QuickResultViewProps {
    result: SimulationResult;
    homeTeam: Team;
    awayTeam: Team;
    isPhone: boolean;
    onHome: () => void;
    onTeamSetup: () => void;
    onRematch: () => void;
    onStepClick: (step: number) => void;
}

const teamColor = (id: string) => TEAM_DATA[id]?.colors.primary ?? '#4f46e5';
const teamName = (t: Team) => `${t.city} ${t.name}`.trim();

export const QuickResultView: React.FC<QuickResultViewProps> = ({ result, homeTeam, awayTeam, isPhone, onHome, onTeamSetup, onRematch, onStepClick }) => {
    const events = result.pbpLogs ?? [];
    const shots = result.pbpShotEvents ?? [];
    const homeId = homeTeam.id, awayId = awayTeam.id;
    const homeAbbr = homeId.toUpperCase(), awayAbbr = awayId.toUpperCase();
    const homeColor = teamColor(homeId), awayColor = teamColor(awayId);
    const homeBadge = { color: homeColor, abbr: homeAbbr };
    const awayBadge = { color: awayColor, abbr: awayAbbr };

    const [activeSection, setActiveSection] = useState<string>('box');
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
    const scrollRef = useRef<HTMLDivElement>(null);

    const otCount = useMemo(() => countOvertimePeriods(events), [events]);
    const maxQuarter = 4 + otCount;
    const homeStats = useMemo(() => computeTeamStats(events, shots, homeId), [events, shots, homeId]);
    const awayStats = useMemo(() => computeTeamStats(events, shots, awayId), [events, shots, awayId]);
    const homeOreb = useMemo(() => result.homeBox.reduce((s, p) => s + (p.offReb || 0), 0), [result.homeBox]);
    const awayOreb = useMemo(() => result.awayBox.reduce((s, p) => s + (p.offReb || 0), 0), [result.awayBox]);
    const timeoutsLeft = useMemo(() => {
        const rev = [...events].reverse();
        return {
            home: rev.find(e => e.timeoutsLeft != null && e.teamId === homeId)?.timeoutsLeft ?? TEAM_TIMEOUTS_TOTAL,
            away: rev.find(e => e.timeoutsLeft != null && e.teamId === awayId)?.timeoutsLeft ?? TEAM_TIMEOUTS_TOTAL,
        };
    }, [events, homeId, awayId]);
    const misc = useMemo(() => {
        const fromTicks = buildLiveMisc(result.boxTimeline ?? [], Infinity);
        if (fromTicks) return fromTicks;
        const m = result.teamMisc;
        return m ? { home: [m.home.potv, m.home.fbps, m.home.pitp, m.home.spts], away: [m.away.potv, m.away.fbps, m.away.pitp, m.away.spts] } : null;
    }, [result.boxTimeline, result.teamMisc]);
    const allBox = useMemo(() => [...result.homeBox, ...result.awayBox], [result.homeBox, result.awayBox]);
    const mvpId = allBox.length > 0 ? allBox.reduce((a, b) => (b.pts > a.pts ? b : a), allBox[0]).playerId : '';
    const leaders: GameStatLeaders = useMemo(() => ({
        pts: Math.max(0, ...allBox.map(p => p.pts)),
        reb: Math.max(0, ...allBox.map(p => p.reb)),
        ast: Math.max(0, ...allBox.map(p => p.ast)),
        stl: Math.max(0, ...allBox.map(p => p.stl)),
        blk: Math.max(0, ...allBox.map(p => p.blk)),
        tov: Math.max(0, ...allBox.map(p => p.tov)),
    }), [allBox]);

    const awayWon = result.awayScore > result.homeScore;
    const homeWon = result.homeScore > result.awayScore;
    const finalLabel = otCount === 0 ? '종료' : otCount === 1 ? '종료 · 연장' : `종료 · ${otCount}차 연장`;

    // 데스크톱 스크롤스파이 — 탭 바 아래 선에 걸친 마지막 섹션을 활성으로
    const handleScroll = () => {
        if (isPhone) return;
        const box = scrollRef.current;
        if (!box) return;
        const top = box.getBoundingClientRect().top + 8;
        let current = RESULT_TABS[0].id;
        for (const t of RESULT_TABS) {
            const el = sectionRefs.current[t.id];
            if (el && el.getBoundingClientRect().top <= top) current = t.id;
        }
        if (current !== activeSection) setActiveSection(current);
    };

    const actions = (
        <>
            <Button variant="cta" size={isPhone ? 'md' : 'lg'} onClick={onTeamSetup}>팀 설정</Button>
            <Button variant="cta" size={isPhone ? 'md' : 'lg'} onClick={onRematch}>재경기</Button>
        </>
    );

    const scorebug = isPhone ? (
        <div className="shrink-0 bg-slate-900 border-b border-slate-800 px-3 py-4 flex items-center gap-2">
            {([['away', awayTeam, result.awayScore, awayWon, timeoutsLeft.away], ['home', homeTeam, result.homeScore, homeWon, timeoutsLeft.home]] as const).map(([side, t, score, won, to], i) => (
                <React.Fragment key={side}>
                    {i === 1 && (
                        <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1.5">
                            <span className="text-[13px] font-bold text-slate-400 whitespace-nowrap">{finalLabel}</span>
                            <QuarterScores allLogs={events} homeTeamId={homeId} currentQuarter={maxQuarter} homeAbbr={homeAbbr} awayAbbr={awayAbbr} phoneFinal />
                        </div>
                    )}
                    <div className="w-24 shrink-0 flex flex-col items-center gap-1">
                        <span className="text-[15px] leading-[18px] font-black text-slate-300 tracking-wide">{t.id.toUpperCase()}</span>
                        <TeamLogo teamId={t.id} size="custom" className="h-11 w-11" shadow={false} />
                        <span className={`mt-0.5 text-[40px] leading-10 font-black tracking-tighter tabular-nums ${won ? 'text-white' : 'text-slate-500'}`}>{score}</span>
                        <TimeoutBars left={to} barWidth="w-2" className="mt-0.5" />
                    </div>
                </React.Fragment>
            ))}
        </div>
    ) : (
        <div className="shrink-0 bg-slate-900 border-b border-slate-800 px-8 py-5">
            <div className="flex items-center gap-8">
                <FinalHeaderLogo teamSlug={awayId} abbr={awayAbbr} />
                <FinalTeamBlock side="away" name={teamName(awayTeam)} score={result.awayScore} won={awayWon} onClick={() => {}} timeoutsLeft={timeoutsLeft.away} />
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <span className="text-base font-bold text-white">{finalLabel}</span>
                    <QuarterScores allLogs={events} homeTeamId={homeId} currentQuarter={maxQuarter} homeAbbr={homeAbbr} awayAbbr={awayAbbr} compact />
                </div>
                <FinalTeamBlock side="home" name={teamName(homeTeam)} score={result.homeScore} won={homeWon} onClick={() => {}} timeoutsLeft={timeoutsLeft.home} />
                <FinalHeaderLogo teamSlug={homeId} abbr={homeAbbr} />
            </div>
        </div>
    );

    const tabs = (
        <TabBar
            tabs={RESULT_TABS}
            activeTab={activeSection}
            onTabChange={id => {
                if (isPhone) {
                    setActiveSection(id);
                    if (scrollRef.current) scrollRef.current.scrollTop = 0;
                } else {
                    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }}
            compact={isPhone}
            align={isPhone ? 'start' : 'center'}
        />
    );

    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col pretendard text-slate-200 ko-normal">
            <QuickGameHeader step={3} onBack={onHome} onStepClick={onStepClick} maxClickableStep={1} actions={actions} compact={isPhone} />
            {scorebug}
            {tabs}
            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-hide">
                <ResultSection sectionKey="box" title="박스스코어" sectionRefs={sectionRefs} tabMode={isPhone} activeKey={activeSection}>
                    <GameBoxScoreTab
                        homeTeam={homeTeam}
                        awayTeam={awayTeam}
                        homeBox={result.homeBox}
                        awayBox={result.awayBox}
                        mvpId={mvpId}
                        leaders={leaders}
                        teams={[]}
                        homeBadge={homeBadge}
                        awayBadge={awayBadge}
                        splitLayout
                    />
                </ResultSection>

                <ResultSection sectionKey="insights" title="인사이트" sectionRefs={sectionRefs} tabMode={isPhone} activeKey={activeSection}>
                    <div className="h-[300px]">
                        <GameInsightsPanel
                            allLogs={events}
                            homeTeamId={homeId}
                            homeStats={homeStats}
                            awayStats={awayStats}
                            homeOreb={homeOreb}
                            awayOreb={awayOreb}
                            maxQuarter={maxQuarter}
                            homeColor={homeColor}
                            awayColor={awayColor}
                            homeAbbr={homeAbbr}
                            awayAbbr={awayAbbr}
                            boxTimeline={result.boxTimeline}
                            homeBox={result.homeBox}
                            awayBox={result.awayBox}
                        />
                    </div>
                </ResultSection>

                <ResultSection sectionKey="pbp" title="경기 기록" sectionRefs={sectionRefs} tabMode={isPhone} activeKey={activeSection}>
                    <GamePbpTab logs={events} homeTeam={homeTeam} awayTeam={awayTeam} shotEvents={shots} homeBadge={homeBadge} awayBadge={awayBadge} hidePlayTypes />
                </ResultSection>

                <ResultSection sectionKey="team" title="팀 기록" sectionRefs={sectionRefs} tabMode={isPhone} activeKey={activeSection}>
                    <div className={`${isPhone ? '' : 'md:flex-row'} flex flex-col`}>
                        <div className={`${isPhone ? '' : 'flex-1'} min-w-0 border-b border-slate-800 md:border-b-0 md:border-r`}>
                            <PlayTypeStats shotEvents={shots} homeTeamId={homeId} awayTeamId={awayId} homeBadge={homeBadge} awayBadge={awayBadge} />
                        </div>
                        <div className={`${isPhone ? '' : 'flex-1'} min-w-0 bg-slate-900`}>
                            <div className="h-11 px-4 flex items-center justify-between border-b border-slate-800 text-sm font-bold text-slate-400">
                                <span>팀 스탯 비교</span>
                                <span className="flex items-center gap-3 text-xs">
                                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: awayColor }} />{awayAbbr}</span>
                                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: homeColor }} />{homeAbbr}</span>
                                </span>
                            </div>
                            <TeamStatsCompare
                                home={homeStats}
                                away={awayStats}
                                homeBox={result.homeBox}
                                awayBox={result.awayBox}
                                homeColor={homeColor}
                                awayColor={awayColor}
                                variant="card"
                                misc={misc}
                            />
                        </div>
                    </div>
                </ResultSection>

                <ResultSection sectionKey="shotchart" title="샷차트" sectionRefs={sectionRefs} tabMode={isPhone} activeKey={activeSection}>
                    <GameShotChartTab homeTeam={homeTeam} awayTeam={awayTeam} shotEvents={shots} homeBadge={homeBadge} awayBadge={awayBadge} homeBox={result.homeBox} awayBox={result.awayBox} />
                </ResultSection>

                <ResultSection sectionKey="rotation" title="로테이션" sectionRefs={sectionRefs} tabMode={isPhone} activeKey={activeSection}>
                    <GameRotationTab
                        homeTeam={homeTeam}
                        awayTeam={awayTeam}
                        homeBox={result.homeBox}
                        awayBox={result.awayBox}
                        rotationData={result.rotationData}
                        homeBadge={homeBadge}
                        awayBadge={awayBadge}
                        pbpLogs={events}
                        splitLayout
                        shotEvents={shots}
                    />
                </ResultSection>

                <ResultSection sectionKey="onoff" title="온오프" sectionRefs={sectionRefs} tabMode={isPhone} activeKey={activeSection} className="pb-10">
                    <GameOnOffTab
                        boxTimeline={result.boxTimeline}
                        homeBox={result.homeBox}
                        awayBox={result.awayBox}
                        homeTeamId={homeId}
                        awayTeamId={awayId}
                        homeTeamName={teamName(homeTeam)}
                        awayTeamName={teamName(awayTeam)}
                        homeBadge={homeBadge}
                        awayBadge={awayBadge}
                    />
                </ResultSection>
                <QuickGameFooter isPhone={isPhone} />
            </div>
        </div>
    );
};

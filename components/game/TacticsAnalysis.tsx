
import React from 'react';
import { Team, TacticalSnapshot, PlayerBoxScore, TacticalSliders } from '../../types';
import { LeagueCoachingData } from '../../types/coaching';
import { TEAM_DATA } from '../../data/teamData';
import { TeamLogo } from '../common/TeamLogo';
import { PREF_AXES, getAxisResult, PREF_ORDER, PrefKey } from '../../views/CoachDetailView';

// 코치 성향 → 슬라이더 매핑 (tacticGenerator.ts blendWithCoach 기반)
const COACH_SLIDER_MAP: Record<PrefKey, (keyof TacticalSliders)[]> = {
    offenseIdentity: ['playStyle', 'ballMovement'],
    tempo: ['pace', 'offReb'],
    scoringFocus: ['insideOut', 'shot_3pt', 'shot_rim'],
    pnrEmphasis: ['pnrFreq'],
    defenseStyle: ['defIntensity', 'fullCourtPress'],
    helpScheme: ['helpDef', 'switchFreq'],
    zonePreference: ['zoneFreq'],
};

// 슬라이더 → 코치 성향 역매핑 생성
const SLIDER_TO_COACH: Record<string, string> = {};
for (const [prefKey, sliderKeys] of Object.entries(COACH_SLIDER_MAP)) {
    const axis = PREF_AXES[prefKey as PrefKey];
    for (const sk of sliderKeys) {
        SLIDER_TO_COACH[sk] = axis.label;
    }
}

const SLIDER_LABELS: Record<string, string> = {
    pace: '공격 페이스',
    ballMovement: '볼 무브먼트',
    offReb: '공격 리바운드',
    playStyle: '공격 스타일',
    insideOut: '공격 포인트',
    pnrFreq: 'P&R 의존도',
    shot_3pt: '3점슛 비중',
    shot_mid: '중거리슛 비중',
    shot_rim: '골밑슛 비중',
    defIntensity: '수비 강도',
    helpDef: '도움 수비',
    switchFreq: '스위치 빈도',
    defReb: '수비 리바운드',
    zoneFreq: '존 빈도',
    zoneUsage: '존 사용률',
    fullCourtPress: '풀코트 프레스',
    pnrDefense: 'PnR 수비',
};

const SLIDER_GROUPS: { label: string; keys: (keyof TacticalSliders)[] }[] = [
    { label: '게임 운영', keys: ['pace', 'ballMovement', 'offReb'] },
    { label: '슈팅 전략', keys: ['shot_3pt', 'shot_mid', 'shot_rim'] },
    { label: '코칭 철학', keys: ['playStyle', 'insideOut', 'pnrFreq'] },
    { label: '온볼 수비', keys: ['defIntensity', 'switchFreq', 'pnrDefense', 'fullCourtPress'] },
    { label: '오프볼 수비', keys: ['helpDef', 'zoneFreq', 'defReb'] },
];

interface TacticsAnalysisProps {
    homeTeam: Team;
    awayTeam: Team;
    homeTactics?: TacticalSnapshot;
    awayTactics?: TacticalSnapshot;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    coachingData?: LeagueCoachingData | null;
}

export const TacticsAnalysis: React.FC<TacticsAnalysisProps> = ({
    homeTeam, awayTeam, homeTactics, awayTactics, homeBox, awayBox, coachingData
}) => {

    const TeamTacticsPanel: React.FC<{
        team: Team;
        tactics?: TacticalSnapshot;
        isHome: boolean;
    }> = ({ team, tactics, isHome }) => {
        const teamColor = TEAM_DATA[team.id]?.colors.primary || '#6366f1';
        const coach = coachingData?.[team.id]?.headCoach;

        return (
            <div className="flex flex-col gap-4">
                {/* 팀 헤더 */}
                <div className="flex items-center gap-3 border-b border-slate-700 pb-3">
                    <TeamLogo teamId={team.id} size="md" />
                    <div className="flex-1">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            {isHome ? 'HOME' : 'AWAY'}
                        </div>
                        <div className="font-black text-white uppercase text-sm">{team.name}</div>
                    </div>
                    {coach && (
                        <div className="text-right">
                            <div className="text-[10px] text-slate-500 font-bold">HEAD COACH</div>
                            <div className="text-xs font-bold text-white">{coach.name}</div>
                        </div>
                    )}
                </div>

                {/* 테이블 A: 코치 성향 */}
                {coach && (
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            코치 전술 성향 (영향도 40%)
                        </div>
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="text-left py-1.5 px-2 text-slate-500 font-bold">항목</th>
                                    <th className="text-center py-1.5 px-2 text-slate-500 font-bold w-10">값</th>
                                    <th className="text-left py-1.5 px-2 text-slate-500 font-bold">성향</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PREF_ORDER.map(key => {
                                    const axis = PREF_AXES[key];
                                    const val = coach.preferences[key];
                                    const { tag } = getAxisResult(axis, val);
                                    return (
                                        <tr key={key} className="border-b border-slate-800/50">
                                            <td className="py-1.5 px-2 text-slate-300 font-medium">{axis.label}</td>
                                            <td className="py-1.5 px-2 text-center font-mono font-bold text-white">{val}</td>
                                            <td className={`py-1.5 px-2 font-bold ${axis.color}`}>{tag}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* 테이블 B: 적용된 전술 슬라이더 */}
                {tactics?.sliders && (
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            적용된 전술 슬라이더
                        </div>
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="text-left py-1.5 px-2 text-slate-500 font-bold">그룹</th>
                                    <th className="text-left py-1.5 px-2 text-slate-500 font-bold">슬라이더</th>
                                    <th className="text-center py-1.5 px-2 text-slate-500 font-bold w-10">값</th>
                                    <th className="text-left py-1.5 px-2 text-slate-500 font-bold">코치 영향</th>
                                </tr>
                            </thead>
                            <tbody>
                                {SLIDER_GROUPS.map(group => (
                                    group.keys.map((key, idx) => {
                                        const val = tactics.sliders![key];
                                        if (val === undefined) return null;
                                        const coachSource = SLIDER_TO_COACH[key];
                                        return (
                                            <tr key={key} className="border-b border-slate-800/50">
                                                {idx === 0 ? (
                                                    <td className="py-1.5 px-2 text-slate-400 font-bold align-top" rowSpan={group.keys.length}>
                                                        {group.label}
                                                    </td>
                                                ) : null}
                                                <td className="py-1.5 px-2 text-slate-300 font-medium">
                                                    {SLIDER_LABELS[key] || key}
                                                </td>
                                                <td className="py-1.5 px-2 text-center font-mono font-bold text-white">{val}</td>
                                                <td className="py-1.5 px-2 text-slate-500 text-[11px]">
                                                    {coachSource
                                                        ? <span className="text-indigo-400/70">{`← ${coachSource}`}</span>
                                                        : <span className="text-slate-600">로스터 전용</span>
                                                    }
                                                </td>
                                            </tr>
                                        );
                                    })
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* 스토퍼 정보 (기존 유지) */}
                {tactics?.stopperId && (
                    <div className="text-xs text-slate-400 border-t border-slate-700 pt-2">
                        <span className="text-slate-500 font-bold">에이스 스토퍼: </span>
                        <span className="text-white font-bold">
                            {(isHome ? homeBox : awayBox).find(p => p.playerId === tactics.stopperId)?.playerName || tactics.stopperId}
                        </span>
                    </div>
                )}
            </div>
        );
    };

    if (!homeTactics && !awayTactics) {
        return <div className="text-slate-500 text-sm p-4">전술 데이터가 없습니다.</div>;
    }

    return (
        <div className="w-full space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                    <TeamTacticsPanel team={awayTeam} tactics={awayTactics} isHome={false} />
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                    <TeamTacticsPanel team={homeTeam} tactics={homeTactics} isHome={true} />
                </div>
            </div>
        </div>
    );
};

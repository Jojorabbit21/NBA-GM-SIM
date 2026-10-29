import React, { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { TabBar } from '../../common/TabBar';
import { Spinner } from '../../common/Spinner';
import { EmptyState } from '../../common/EmptyState';
import { GameBoxScoreTab } from '../../game/tabs/GameBoxScoreTab';
import { GamePbpTab } from '../../game/tabs/GamePbpTab';
import { GameShotChartTab } from '../../game/tabs/GameShotChartTab';
import { GameRotationTab } from '../../game/tabs/GameRotationTab';
import { GameOnOffTab } from '../../game/tabs/GameOnOffTab';
import type { GameStatLeaders } from '../../game/BoxScoreTable';
import { useTrainingResult } from '../../../hooks/useTraining';
import { TRAINING_OFFENSE_PRESETS, TRAINING_DEFENSE_PRESETS } from '../../../services/multi/trainingPresets';
import type { PlayerBoxScore } from '../../../types/engine';
import type { Player, Team } from '../../../types';

// 트레이닝 결과 [2026-10-29] — 라이브 화면 없이 종료 화면만. 기존 경기 화면 탭 컴포넌트(props 주입형)를 그대로 쓴다.

export interface TrainingTeamInfo {
    id: string;
    name: string;
    abbr: string;
    color: string;
}

interface TrainingResultViewProps {
    resultId: string;
    myTeam: TrainingTeamInfo;
    resolveTeam: (teamId: string) => TrainingTeamInfo;
    onBack: () => void;
}

type ResultTab = 'box' | 'pbp' | 'shot' | 'rotation' | 'onoff';
const RESULT_TABS: { id: ResultTab; label: string }[] = [
    { id: 'box', label: '박스스코어' },
    { id: 'pbp', label: '경기 기록' },
    { id: 'shot', label: '샷차트' },
    { id: 'rotation', label: '로테이션' },
    { id: 'onoff', label: '온오프' },
];

function teamAdapter(info: TrainingTeamInfo, box: PlayerBoxScore[]): Team {
    return {
        id: info.id,
        name: info.name,
        roster: box.map(b => ({ id: b.playerId, name: b.playerName, position: b.position } as unknown as Player)),
    } as unknown as Team;
}

export const TrainingResultView: React.FC<TrainingResultViewProps> = ({ resultId, myTeam, resolveTeam, onBack }) => {
    const { data: row, isPending, isError } = useTrainingResult(resultId);
    const [tab, setTab] = useState<ResultTab>('box');

    const r = row?.result;
    const opp = resolveTeam(row?.opponent_team_id ?? '');
    const homeBox = r?.homeBox ?? [];
    const awayBox = r?.awayBox ?? [];
    const home = useMemo(() => teamAdapter(myTeam, homeBox), [myTeam, homeBox]);
    const away = useMemo(() => teamAdapter(opp, awayBox), [opp, awayBox]);
    const all = useMemo(() => [...homeBox, ...awayBox], [homeBox, awayBox]);
    const mvpId = all.length ? all.reduce((a, b) => (b.pts > a.pts ? b : a), all[0]).playerId : '';
    const leaders = useMemo<GameStatLeaders>(() => ({
        pts: Math.max(0, ...all.map(p => p.pts)),
        reb: Math.max(0, ...all.map(p => p.reb)),
        ast: Math.max(0, ...all.map(p => p.ast)),
        stl: Math.max(0, ...all.map(p => p.stl)),
        blk: Math.max(0, ...all.map(p => p.blk)),
        tov: Math.max(0, ...all.map(p => p.tov)),
    }), [all]);

    if (isPending) return <Spinner variant="section" />;
    if (isError || !row || !r) return <EmptyState title="트레이닝 결과를 불러오지 못했습니다." />;

    const homeBadge = { color: myTeam.color, abbr: myTeam.abbr };
    const awayBadge = { color: opp.color, abbr: opp.abbr };
    const quarters = (r.quarterScores as { home?: number[]; away?: number[] } | undefined) ?? {};
    const offLabel = TRAINING_OFFENSE_PRESETS.find(p => p.id === row.offense_preset)?.label ?? row.offense_preset;
    const defLabel = TRAINING_DEFENSE_PRESETS.find(p => p.id === row.defense_preset)?.label ?? row.defense_preset;
    const nameById = new Map(homeBox.map(b => [b.playerId, b.playerName]));
    const drains = [...(r.drains ?? [])].sort((a, b) => b.drain - a.drain);

    const scoreCol = (info: TrainingTeamInfo, score: number, win: boolean) => (
        <div className="w-24 sm:w-40 flex flex-col items-center gap-1 shrink-0">
            <span className="text-[15px] font-black text-slate-300">{info.abbr}</span>
            <span className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: info.color }}>{info.abbr}</span>
            <span className={`text-4xl sm:text-5xl font-black tabular-nums tracking-tight ${win ? 'text-white' : 'text-slate-500'}`}>{score}</span>
        </div>
    );

    return (
        <div className="flex flex-col">
            <div className="h-11 px-2 sm:px-6 flex items-center gap-1 bg-slate-900 border-b border-slate-800">
                <button type="button" onClick={onBack} className="h-11 pr-2 flex items-center gap-1 text-sm font-semibold text-slate-200 hover:text-white">
                    <ChevronLeft size={20} />트레이닝 기록
                </button>
                <span className="text-sm text-slate-400 tabular-nums truncate">· {row.virtual_date.replace(/-/g, '.')} · {row.slot}회차</span>
            </div>

            <div className="bg-slate-900 border-b border-slate-800 px-2 py-4 sm:py-5">
                <div className="max-w-3xl mx-auto flex items-center gap-2 sm:gap-4">
                    {scoreCol(myTeam, row.my_score, row.my_score > row.opp_score)}
                    <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
                        <span className="flex items-center gap-1.5 text-[13px] font-bold text-slate-400">
                            <span className="h-5 px-1.5 rounded bg-indigo-500/20 text-indigo-300 text-[11px] inline-flex items-center">훈련</span>종료
                        </span>
                        <table className="text-xs tabular-nums border-collapse">
                            <thead>
                                <tr className="text-slate-400 border-b border-slate-800">
                                    <th />
                                    {[1, 2, 3, 4].map(q => <th key={q} className="w-6 sm:w-8 py-1 font-semibold">{q}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {([[myTeam.abbr, quarters.home], [opp.abbr, quarters.away]] as const).map(([abbr, qs]) => (
                                    <tr key={abbr} className="border-b border-slate-800 text-slate-200">
                                        <td className="pr-2 py-1 font-bold text-slate-300">{abbr}</td>
                                        {[0, 1, 2, 3].map(i => <td key={i} className="text-center">{qs?.[i] ?? '-'}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <span className="text-[11px] sm:text-xs text-slate-400 text-center">상대 <b className="font-bold text-slate-200">{offLabel} / {defLabel}</b></span>
                    </div>
                    {scoreCol(opp, row.opp_score, row.opp_score > row.my_score)}
                </div>
            </div>

            {drains.length > 0 && (
                <div className="border-b border-slate-800">
                    <div className="bg-slate-800 border-t border-slate-600 px-4 sm:px-6 py-3 text-sm font-bold text-white">체력 변화</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 bg-slate-900">
                        {drains.map(d => (
                            <div key={d.player_id} className="h-11 px-4 sm:px-6 flex items-center gap-2 border-b sm:border-r border-slate-800 min-w-0">
                                <span className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-200">{nameById.get(d.player_id) ?? d.player_id}</span>
                                <span className="text-sm font-bold tabular-nums text-amber-400">−{d.drain.toFixed(1)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <TabBar<ResultTab> tabs={RESULT_TABS} activeTab={tab} onTabChange={setTab} />
            <div className="p-0 sm:p-4">
                {tab === 'box' && (
                    <GameBoxScoreTab homeTeam={home} awayTeam={away} homeBox={homeBox} awayBox={awayBox} mvpId={mvpId} leaders={leaders} teams={[]} homeBadge={homeBadge} awayBadge={awayBadge} splitLayout />
                )}
                {tab === 'pbp' && (
                    <GamePbpTab logs={r.events ?? []} homeTeam={home} awayTeam={away} shotEvents={r.shotEvents ?? []} homeBadge={homeBadge} awayBadge={awayBadge} />
                )}
                {tab === 'shot' && (
                    <GameShotChartTab homeTeam={home} awayTeam={away} shotEvents={r.shotEvents ?? []} homeBadge={homeBadge} awayBadge={awayBadge} homeBox={homeBox} awayBox={awayBox} />
                )}
                {tab === 'rotation' && (
                    <GameRotationTab homeTeam={home} awayTeam={away} homeBox={homeBox} awayBox={awayBox} rotationData={r.rotationData} homeBadge={homeBadge} awayBadge={awayBadge} pbpLogs={r.events ?? []} splitLayout shotEvents={r.shotEvents ?? []} />
                )}
                {tab === 'onoff' && (
                    <GameOnOffTab boxTimeline={r.boxTimeline} homeBox={homeBox} awayBox={awayBox} homeTeamId={myTeam.id} awayTeamId={opp.id} homeTeamName={myTeam.name} awayTeamName={opp.name} homeBadge={homeBadge} awayBadge={awayBadge} />
                )}
            </div>
        </div>
    );
};

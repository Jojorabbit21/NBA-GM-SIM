
import React, { useState } from 'react';
import { Play, ChevronRight, Calendar, ChevronLeft } from 'lucide-react';
import { Team } from '../types';
import { CpuGameResult } from '../services/simulationService';
import { TeamLogo } from '../components/common/TeamLogo';
import { BoxScoreTable, GameStatLeaders } from '../components/game/BoxScoreTable';
import { GameShotChartTab } from '../components/game/tabs/GameShotChartTab';
import { GameRotationTab } from '../components/game/tabs/GameRotationTab';

type DetailTab = 'BoxScore' | 'ShotChart' | 'Rotation';

interface DayGamesViewProps {
    date: string;
    cpuResults: CpuGameResult[];
    teams: Team[];
    onFinish: () => void;
    onWatchGame: (gameId: string) => void;
}

export const DayGamesView: React.FC<DayGamesViewProps> = ({
    date, cpuResults, teams, onFinish, onWatchGame
}) => {
    const [selectedGame, setSelectedGame] = useState<CpuGameResult | null>(null);
    const [detailTab, setDetailTab] = useState<DetailTab>('BoxScore');

    // Format date
    const d = new Date(date + 'T00:00:00');
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];

    const getTeam = (id: string) => teams.find(t => t.id === id);

    const handleSelectGame = (game: CpuGameResult) => {
        setSelectedGame(game);
        setDetailTab('BoxScore');
    };

    const handleBack = () => {
        setSelectedGame(null);
    };

    // Detail view for selected game
    if (selectedGame) {
        const home = getTeam(selectedGame.homeTeamId);
        const away = getTeam(selectedGame.awayTeamId);
        if (!home || !away) return null;

        const allPlayers = [...selectedGame.boxScore.away, ...selectedGame.boxScore.home];
        const mvp = allPlayers.length > 0
            ? allPlayers.reduce((prev, curr) => (curr.pts > prev.pts ? curr : prev), allPlayers[0])
            : null;
        const leaders: GameStatLeaders = {
            pts: Math.max(0, ...allPlayers.map(p => p.pts)),
            reb: Math.max(0, ...allPlayers.map(p => p.reb)),
            ast: Math.max(0, ...allPlayers.map(p => p.ast)),
            stl: Math.max(0, ...allPlayers.map(p => p.stl)),
            blk: Math.max(0, ...allPlayers.map(p => p.blk)),
            tov: Math.max(0, ...allPlayers.map(p => p.tov)),
        };

        const tabs: { id: DetailTab; label: string }[] = [
            { id: 'BoxScore', label: '박스스코어' },
            { id: 'ShotChart', label: '샷 차트' },
            { id: 'Rotation', label: '로테이션' },
        ];

        return (
            <div className="fixed inset-0 bg-slate-950 z-[100] overflow-y-auto animate-in fade-in duration-300 ko-normal pretendard pb-24">
                <div className="min-h-screen flex flex-col">
                    {/* Header */}
                    <div className="bg-slate-900/80 border-b border-slate-800 px-6 py-4">
                        <button
                            onClick={handleBack}
                            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-3"
                        >
                            <ChevronLeft size={16} />
                            <span className="text-xs font-bold">경기 목록으로</span>
                        </button>
                        <div className="flex items-center justify-center gap-6">
                            <div className="flex items-center gap-3">
                                <TeamLogo teamId={away.id} size="lg" />
                                <div className="text-right">
                                    <div className="text-xs text-slate-500 font-bold uppercase">{away.city}</div>
                                    <div className={`text-sm font-black uppercase ${selectedGame.awayScore > selectedGame.homeScore ? 'text-white' : 'text-slate-500'}`}>{away.name}</div>
                                </div>
                                <span className={`text-3xl font-black oswald ${selectedGame.awayScore > selectedGame.homeScore ? 'text-white' : 'text-slate-600'}`}>
                                    {selectedGame.awayScore}
                                </span>
                            </div>
                            <span className="text-xs text-slate-600 font-bold uppercase tracking-widest">FINAL</span>
                            <div className="flex items-center gap-3">
                                <span className={`text-3xl font-black oswald ${selectedGame.homeScore > selectedGame.awayScore ? 'text-white' : 'text-slate-600'}`}>
                                    {selectedGame.homeScore}
                                </span>
                                <div>
                                    <div className="text-xs text-slate-500 font-bold uppercase">{home.city}</div>
                                    <div className={`text-sm font-black uppercase ${selectedGame.homeScore > selectedGame.awayScore ? 'text-white' : 'text-slate-500'}`}>{home.name}</div>
                                </div>
                                <TeamLogo teamId={home.id} size="lg" />
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50">
                        <div className="flex items-center justify-center gap-6 px-6">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setDetailTab(tab.id)}
                                    className={`py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
                                        detailTab === tab.id
                                            ? 'text-indigo-400 border-indigo-400'
                                            : 'text-slate-500 border-transparent hover:text-slate-300'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 space-y-6">
                        {detailTab === 'BoxScore' && (
                            <div className="space-y-8">
                                <BoxScoreTable
                                    team={away}
                                    box={selectedGame.boxScore.away}
                                    mvpId={mvp?.playerId || ''}
                                    leaders={leaders}
                                    isFirst
                                />
                                <BoxScoreTable
                                    team={home}
                                    box={selectedGame.boxScore.home}
                                    mvpId={mvp?.playerId || ''}
                                    leaders={leaders}
                                />
                            </div>
                        )}
                        {detailTab === 'ShotChart' && (
                            <GameShotChartTab
                                homeTeam={home}
                                awayTeam={away}
                                shotEvents={selectedGame.pbpShotEvents || []}
                            />
                        )}
                        {detailTab === 'Rotation' && (
                            <GameRotationTab
                                homeTeam={home}
                                awayTeam={away}
                                homeBox={selectedGame.boxScore.home}
                                awayBox={selectedGame.boxScore.away}
                                rotationData={selectedGame.rotationData}
                            />
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Main game list view
    return (
        <div className="fixed inset-0 bg-slate-950 z-[100] overflow-y-auto animate-in fade-in duration-300 ko-normal pretendard pb-24">
            <div className="min-h-screen flex flex-col">
                {/* Header */}
                <div className="bg-slate-900/50 border-b border-slate-800 px-6 py-8">
                    <div className="max-w-3xl mx-auto text-center">
                        <div className="flex items-center justify-center gap-2 text-slate-500 mb-2">
                            <Calendar size={14} />
                            <span className="text-xs font-bold uppercase tracking-widest">
                                {month}월 {day}일 ({weekday})
                            </span>
                        </div>
                        <h1 className="text-2xl font-black oswald uppercase tracking-wider text-white">
                            Today's Games
                        </h1>
                        <p className="text-xs text-slate-500 mt-2">
                            경기를 선택하여 박스스코어를 확인하거나, 참관하기로 경기를 관전하세요
                        </p>
                    </div>
                </div>

                {/* Game Cards */}
                <div className="flex-1 max-w-3xl mx-auto w-full p-4 md:p-8">
                    <div className="space-y-3">
                        {cpuResults.map(game => {
                            const home = getTeam(game.homeTeamId);
                            const away = getTeam(game.awayTeamId);
                            if (!home || !away) return null;

                            const hWin = game.homeScore > game.awayScore;
                            const hasPbp = game.pbpLogs && game.pbpLogs.length > 0;

                            return (
                                <div
                                    key={game.gameId}
                                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition-all"
                                >
                                    {/* Score section */}
                                    <div className="p-4 flex items-center">
                                        {/* Away */}
                                        <div className="flex-1 flex items-center gap-3">
                                            <TeamLogo teamId={away.id} size="md" />
                                            <div>
                                                <div className="text-[10px] text-slate-500 font-bold uppercase">{away.city}</div>
                                                <div className={`text-sm font-black uppercase ${!hWin ? 'text-white' : 'text-slate-500'}`}>
                                                    {away.name}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Score */}
                                        <div className="flex items-center gap-3 px-4">
                                            <span className={`text-2xl font-black oswald ${!hWin ? 'text-white' : 'text-slate-600'}`}>
                                                {game.awayScore}
                                            </span>
                                            <span className="text-[10px] text-slate-600 font-bold">-</span>
                                            <span className={`text-2xl font-black oswald ${hWin ? 'text-white' : 'text-slate-600'}`}>
                                                {game.homeScore}
                                            </span>
                                        </div>

                                        {/* Home */}
                                        <div className="flex-1 flex items-center gap-3 justify-end">
                                            <div className="text-right">
                                                <div className="text-[10px] text-slate-500 font-bold uppercase">{home.city}</div>
                                                <div className={`text-sm font-black uppercase ${hWin ? 'text-white' : 'text-slate-500'}`}>
                                                    {home.name}
                                                </div>
                                            </div>
                                            <TeamLogo teamId={home.id} size="md" />
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex border-t border-slate-800/50">
                                        <button
                                            onClick={() => handleSelectGame(game)}
                                            className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all"
                                        >
                                            박스스코어
                                        </button>
                                        {hasPbp && (
                                            <>
                                                <div className="w-px bg-slate-800/50" />
                                                <button
                                                    onClick={() => onWatchGame(game.gameId)}
                                                    className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider text-indigo-400 hover:text-white hover:bg-indigo-950/50 transition-all flex items-center justify-center gap-1.5"
                                                >
                                                    <Play size={10} fill="currentColor" /> 참관하기
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/80 backdrop-blur-md border-t border-slate-800 flex justify-center z-50">
                    <button
                        onClick={onFinish}
                        className="px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-lg tracking-widest shadow-[0_10px_30px_rgba(79,70,229,0.4)] transition-all active:scale-95 flex items-center gap-4"
                    >
                        다음으로 이동 <ChevronRight />
                    </button>
                </div>
            </div>
        </div>
    );
};

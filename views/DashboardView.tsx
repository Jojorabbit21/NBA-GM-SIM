
import React, { useMemo } from 'react';
import { 
  Activity, Wand2, Play, Calendar, Users, Swords, Shield, 
  Target, Zap, RefreshCw
} from 'lucide-react';
import { Team, Game, OffenseTactic, DefenseTactic } from '../types';
import { GameTactics, generateAutoTactics } from '../services/gameEngine';
import { getOvrBadgeStyle } from '../components/SharedComponents';

interface DashboardViewProps {
  team: Team;
  teams: Team[];
  schedule: Game[];
  onSim: (tactics: GameTactics) => void;
  tactics: GameTactics;
  onUpdateTactics: (t: GameTactics) => void;
  currentSimDate: string;
  isSimulating: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  team, teams, schedule, onSim, tactics, onUpdateTactics, currentSimDate, isSimulating 
}) => {
  
  // Logic to find next game
  const nextGame = useMemo(() => {
     return schedule.find(g => !g.played && (g.homeTeamId === team.id || g.awayTeamId === team.id));
  }, [schedule, team.id]);

  const nextOpponentId = nextGame ? (nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId) : null;
  const nextOpponent = useMemo(() => {
     return nextOpponentId ? teams.find(t => t.id === nextOpponentId) : null;
  }, [teams, nextOpponentId]);
  
  const isHome = nextGame?.homeTeamId === team.id;

  const handleAutoSet = () => {
    const auto = generateAutoTactics(team);
    onUpdateTactics(auto);
  };

  const handleTacticChange = (type: 'offense' | 'defense', value: string) => {
    if (type === 'offense') {
      onUpdateTactics({ ...tactics, offenseTactics: [value as OffenseTactic] });
    } else {
      // Keep only specific specialized defense tactics if needed, or just replace.
      // Here we assume single selection for simplicity in this UI
      const newDef = tactics.defenseTactics.filter(t => t !== 'ManToManPerimeter' && t !== 'ZoneDefense' && t !== 'AceStopper');
      newDef.push(value as DefenseTactic);
      onUpdateTactics({ ...tactics, defenseTactics: [value as DefenseTactic] });
    }
  };
  
  const handleSliderChange = (key: keyof typeof tactics.sliders, value: number) => {
      onUpdateTactics({
          ...tactics,
          sliders: { ...tactics.sliders, [key]: value }
      });
  };

  const healthyPlayers = useMemo(() => {
      return team.roster.filter(p => p.health !== 'Injured').sort((a,b) => b.ovr - a.ovr);
  }, [team.roster]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full min-h-0 animate-in fade-in duration-500">
        {/* Left Panel: Team & Match Info */}
        <div className="lg:col-span-8 flex flex-col gap-8 min-h-0 overflow-y-auto custom-scrollbar pr-2">
            {/* Header / Next Match */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] p-8 relative overflow-hidden shadow-2xl group">
                 <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-600/10 blur-[100px] rounded-full group-hover:bg-indigo-600/20 transition-colors duration-1000"></div>
                 
                 <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                     <div className="flex flex-col gap-2">
                         <div className="flex items-center gap-3">
                             <Calendar className="text-indigo-400" size={20} />
                             <span className="text-sm font-black text-slate-400 uppercase tracking-widest">NEXT MATCHUP</span>
                         </div>
                         <h2 className="text-4xl md:text-5xl font-black oswald text-white uppercase tracking-tight leading-none">
                            {nextOpponent ? `VS ${nextOpponent.name}` : 'NO GAMES SCHEDULED'}
                         </h2>
                         {nextGame && (
                             <div className="flex items-center gap-4 mt-2">
                                <span className="px-3 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-black text-slate-300 uppercase">
                                    {isHome ? 'HOME GAME' : 'AWAY GAME'}
                                </span>
                                <span className="text-sm font-bold text-slate-500">{nextGame.date}</span>
                             </div>
                         )}
                     </div>

                     {nextGame && nextOpponent ? (
                         <div className="flex items-center gap-8 bg-slate-950/50 px-8 py-6 rounded-3xl border border-slate-800/50 backdrop-blur-sm">
                             <div className="flex flex-col items-center gap-2">
                                 <img src={team.logo} className="w-16 h-16 object-contain" alt={team.name} />
                                 <span className="text-xs font-black text-white">{team.wins}W - {team.losses}L</span>
                             </div>
                             <div className="text-2xl font-black text-slate-600 oswald">VS</div>
                             <div className="flex flex-col items-center gap-2">
                                 <img src={nextOpponent.logo} className="w-16 h-16 object-contain grayscale opacity-70" alt={nextOpponent.name} />
                                 <span className="text-xs font-black text-slate-500">{nextOpponent.wins}W - {nextOpponent.losses}L</span>
                             </div>
                         </div>
                     ) : (
                        <div className="px-8 py-6 rounded-3xl bg-slate-950/50 border border-slate-800 text-slate-500 font-bold text-sm">
                            이번 시즌 예정된 경기가 없습니다.
                        </div>
                     )}
                 </div>
            </div>

            {/* Simulation Control */}
            <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/40 border border-indigo-500/30 rounded-[2.5rem] p-8 flex items-center justify-between shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                    <h3 className="text-2xl font-black text-white oswald uppercase tracking-wide mb-1">Match Day Simulation</h3>
                    <p className="text-slate-400 text-sm font-bold">전술 설정을 완료하고 경기를 시작하세요.</p>
                </div>
                <button 
                    onClick={() => !isSimulating && onSim(tactics)}
                    disabled={isSimulating}
                    className="relative z-10 px-10 py-5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-2xl font-black uppercase text-lg tracking-widest shadow-[0_10px_40px_rgba(79,70,229,0.4)] transition-all active:scale-95 flex items-center gap-3 group"
                >
                    {isSimulating ? (
                        <>
                            <RefreshCw className="animate-spin" size={24} />
                            <span>Simulating...</span>
                        </>
                    ) : (
                        <>
                            <Play className="fill-current" size={24} />
                            <span>PLAY BALL</span>
                        </>
                    )}
                </button>
            </div>
            
            {/* Roster / Key Players Horizontal Scroll */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-lg font-black text-white uppercase oswald tracking-wide flex items-center gap-2">
                        <Users className="text-emerald-400" size={20} /> Key Rotation
                    </h3>
                    <span className="text-xs font-bold text-slate-500 uppercase">Top 8 OVR</span>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                    {healthyPlayers.slice(0, 8).map(p => (
                        <div key={p.id} className="min-w-[200px] bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 hover:border-slate-600 transition-colors group">
                            <div className="flex justify-between items-start">
                                <div className={getOvrBadgeStyle(p.ovr) + " !w-8 !h-8 !text-sm"}>{p.ovr}</div>
                                <span className="text-[10px] font-black text-slate-500 bg-slate-950 px-2 py-1 rounded uppercase">{p.position}</span>
                            </div>
                            <div>
                                <div className="text-sm font-black text-white truncate group-hover:text-indigo-400 transition-colors">{p.name}</div>
                                <div className="text-[10px] text-slate-500 font-bold uppercase">{p.condition}% COND</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Right Panel: Tactics Settings */}
        <div className="lg:col-span-4 flex flex-col min-h-0 bg-slate-900/40 rounded-[2.5rem] border border-slate-800 overflow-hidden shadow-2xl">
            <div className="px-8 border-b border-white/5 bg-slate-950/50 flex items-center justify-between h-[80px] flex-shrink-0 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <Activity size={20} className="text-indigo-400" />
                    <h3 className="text-xl font-black uppercase text-white oswald tracking-tight">전술 설정</h3>
                </div>
                <button 
                    onClick={handleAutoSet}
                    className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/50 rounded-xl flex items-center gap-2 transition-all active:scale-95 group"
                >
                    <Wand2 size={14} className="group-hover:rotate-12 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-wider">AI 추천</span>
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                {/* Offense Strategy */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest">
                        <Swords size={14} /> Offense Strategy
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {['Balance', 'PaceAndSpace', 'PerimeterFocus', 'PostFocus', 'Grind', 'SevenSeconds'].map(t => (
                            <button
                                key={t}
                                onClick={() => handleTacticChange('offense', t)}
                                className={`px-3 py-3 rounded-xl border text-[10px] font-black uppercase tracking-tight transition-all text-center ${
                                    tactics.offenseTactics.includes(t as OffenseTactic)
                                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-900/20'
                                    : 'bg-slate-950/40 text-slate-500 border-slate-800 hover:border-slate-600 hover:text-slate-300'
                                }`}
                            >
                                {t.replace(/([A-Z])/g, ' $1').trim()}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Defense Strategy */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest">
                        <Shield size={14} /> Defense Strategy
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                        {['ManToManPerimeter', 'ZoneDefense', 'AceStopper'].map(t => (
                            <button
                                key={t}
                                onClick={() => handleTacticChange('defense', t)}
                                className={`px-4 py-3 rounded-xl border text-[10px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${
                                    tactics.defenseTactics.includes(t as DefenseTactic)
                                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-900/20'
                                    : 'bg-slate-950/40 text-slate-500 border-slate-800 hover:border-slate-600 hover:text-slate-300'
                                }`}
                            >
                                <span>{t.replace(/([A-Z])/g, ' $1').trim()}</span>
                                {tactics.defenseTactics.includes(t as DefenseTactic) && <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Sliders */}
                <div className="space-y-6 pt-4 border-t border-slate-800/50">
                    {/* Pace */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-end">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Zap size={12} /> Game Pace</span>
                            <span className="text-sm font-black text-white oswald">{tactics.sliders.pace}</span>
                        </div>
                        <input 
                            type="range" min="1" max="10" step="1"
                            value={tactics.sliders.pace}
                            onChange={(e) => handleSliderChange('pace', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 hover:[&::-webkit-slider-thumb]:bg-indigo-400 transition-all"
                        />
                    </div>

                    {/* Defense Intensity */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-end">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Target size={12} /> Def Intensity</span>
                            <span className="text-sm font-black text-white oswald">{tactics.sliders.defIntensity}</span>
                        </div>
                        <input 
                            type="range" min="1" max="10" step="1"
                            value={tactics.sliders.defIntensity}
                            onChange={(e) => handleSliderChange('defIntensity', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 hover:[&::-webkit-slider-thumb]:bg-emerald-400 transition-all"
                        />
                    </div>
                    
                    {/* Rotation Flexibility */}
                    <div className="space-y-3">
                         <div className="flex justify-between items-end">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><RefreshCw size={12} /> Bench Usage</span>
                            <span className="text-sm font-black text-white oswald">{tactics.sliders.rotationFlexibility}</span>
                        </div>
                        <input 
                            type="range" min="1" max="10" step="1"
                            value={tactics.sliders.rotationFlexibility}
                            onChange={(e) => handleSliderChange('rotationFlexibility', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 hover:[&::-webkit-slider-thumb]:bg-amber-400 transition-all"
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

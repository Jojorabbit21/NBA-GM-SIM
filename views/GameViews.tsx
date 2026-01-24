
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Trophy, List, ArrowRight, Activity, Lock, Target, Shield, ShieldAlert, CheckCircle2, RefreshCw, Zap, Calendar, Newspaper, BarChart3, ChevronRight, Crown } from 'lucide-react';
import { Team, PlayerBoxScore, OffenseTactic, DefenseTactic, Game } from '../types';
import { getOvrBadgeStyle } from '../components/SharedComponents';
import { GameTactics } from '../services/gameEngine';

// 상황별 메시지 분리
const GENERAL_MESSAGES = [
    "코칭 스태프가 머리를 맞대는 중...",
    "선수들이 작전 타임에 물 마시는 중...",
    "심판이 애매한 판정을 비디오 판독 중...",
    "관중들이 파도를 타는 중...",
    "마스코트가 하프코트 슛을 시도 중...",
    "치어리더가 분위기를 띄우는 중...",
    "벤치 멤버들이 수건을 돌리는 중...",
    "감독이 작전판에 열정적으로 그림 그리는 중...",
    "전력분석관이 태블릿을 두드리는 중...",
    "양 팀 선수들이 거친 몸싸움을 벌입니다...",
    "빠른 템포로 공수 전환이 이루어집니다...",
];

const CLUTCH_MESSAGES = [
    "4쿼터 막판, 수비 집중력이 높아집니다!",
    "승부처! 감독이 에이스를 호출합니다.",
    "관중석이 숨을 죽이고 지켜봅니다...",
    "한 골 싸움! 치열한 공방전!",
    "타임아웃! 마지막 작전을 지시합니다.",
    "상대 팀 감독이 심판에게 거칠게 항의합니다!",
    "선수들의 눈빛이 달라졌습니다.",
    "에이스가 공을 잡았습니다. 아이솔레이션 시도...",
    "경기장 분위기가 최고조에 달합니다!",
];

const SUPER_CLUTCH_MESSAGES = [
    "운명의 시간이 다가옵니다...",
    "마지막 10초! 원 포제션 게임!",
    "버저비터가 터질 것인가!",
    "심장이 멎을 듯한 초접전...",
    "공이 허공을 가릅니다...",
    "승부를 결정짓는 슛이 림을 향합니다!",
    "기적 같은 플레이가 나올 수 있을까요?",
    "모든 관중이 기립했습니다!",
    "역사에 남을 명승부...",
];

const GARBAGE_MESSAGES = [
    "점수 차가 많이 벌어졌습니다.",
    "주전 선수들이 벤치로 물러나 휴식을 취합니다.",
    "가비지 타임, 유망주들이 코트를 밟습니다.",
    "승부의 추는 이미 기운 것 같습니다.",
    "일방적인 경기 흐름이 계속됩니다.",
    "관중들이 하나둘 경기장을 빠져나갑니다...",
    "감독이 벤치 멤버들에게 기회를 줍니다.",
    "사실상 승패가 결정되었습니다.",
];

export const GameSimulatingView: React.FC<{ 
  homeTeam: Team, 
  awayTeam: Team, 
  userTeamId?: string | null,
  finalHomeScore?: number,
  finalAwayScore?: number,
  onSimulationComplete?: () => void
}> = ({ homeTeam, awayTeam, userTeamId, finalHomeScore = 110, finalAwayScore = 105, onSimulationComplete }) => {
  const [progress, setProgress] = useState(0);
  const [shots, setShots] = useState<{id: number, x: number, y: number, isMake: boolean}[]>([]);
  const [currentMessage, setCurrentMessage] = useState(GENERAL_MESSAGES[0]);
  
  // 종료 상태 및 진행률을 ref로 관리 (타이머 클로저 문제 해결)
  const isFinishedRef = useRef(false);
  const progressRef = useRef(0);
  
  // 턴제 스코어링 상태 및 Ref (Ref는 setInterval 내에서 최신값 참조용)
  const [currentHomeScore, setCurrentHomeScore] = useState(0);
  const [currentAwayScore, setCurrentAwayScore] = useState(0);
  const homeScoreRef = useRef(0);
  const awayScoreRef = useRef(0);

  // 1. 시뮬레이션 진행 루프 (0% -> 100%)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const runSimulationStep = () => {
        setProgress(prev => {
            if (prev >= 100) {
                progressRef.current = 100;
                return 100;
            }

            // 클러치 타임 로직: 진행률에 따라 속도 조절
            const isLateGame = prev > 85; 
            const isVeryLateGame = prev > 94;

            // 진행 증가량 (뒤로 갈수록 조금씩만 증가)
            const increment = isVeryLateGame ? 0.4 : (isLateGame ? 0.6 : 1.5);
            const next = Math.min(100, prev + increment);
            
            // Ref 업데이트 (메시지 타이머가 참조함)
            progressRef.current = next;

            // 딜레이 (뒤로 갈수록 느려짐 -> 긴장감 조성)
            const delay = isVeryLateGame ? 300 : (isLateGame ? 100 : 30);

            timeoutId = setTimeout(runSimulationStep, delay);
            return next;
        });
    };

    runSimulationStep();
    return () => clearTimeout(timeoutId);
  }, []); // 의존성 배열 비움 (한 번만 실행)

  // 2. 점수 동기화 (progress 변화에 반응)
  useEffect(() => {
      const ratio = progress / 100;
      
      // 진행률에 비례한 목표 점수 계산
      const targetHome = Math.floor(finalHomeScore * ratio);
      const targetAway = Math.floor(finalAwayScore * ratio);

      // 점수가 목표치보다 낮으면 증가 (랜덤하게 2점 또는 3점씩)
      setCurrentHomeScore(prev => {
          let next = prev;
          if (prev >= finalHomeScore) next = finalHomeScore;
          else if (prev < targetHome) next = Math.min(finalHomeScore, prev + (Math.random() > 0.6 ? 3 : 2));
          
          homeScoreRef.current = next; // Ref 동기화
          return next;
      });

      setCurrentAwayScore(prev => {
          let next = prev;
          if (prev >= finalAwayScore) next = finalAwayScore;
          else if (prev < targetAway) next = Math.min(finalAwayScore, prev + (Math.random() > 0.6 ? 3 : 2));
          
          awayScoreRef.current = next; // Ref 동기화
          return next;
      });
  }, [progress, finalHomeScore, finalAwayScore]);

  // 3. 종료 처리 (100% 도달 시)
  useEffect(() => {
      if (progress >= 100 && !isFinishedRef.current) {
          isFinishedRef.current = true;
          
          // 최종 점수 확정
          setCurrentHomeScore(finalHomeScore);
          setCurrentAwayScore(finalAwayScore);
          homeScoreRef.current = finalHomeScore;
          awayScoreRef.current = finalAwayScore;
          
          // 2초 딜레이 후 콜백 실행
          if (onSimulationComplete) {
              const timer = setTimeout(() => {
                  onSimulationComplete();
              }, 2000);
              return () => clearTimeout(timer);
          }
      }
  }, [progress, finalHomeScore, finalAwayScore, onSimulationComplete]);

  // 4. 배경 효과 (슛 차트 & 메시지)
  useEffect(() => {
    const shotTimer = setInterval(() => {
        setShots(prev => {
            if (isFinishedRef.current) return prev; // 종료되면 슛 중단
            const isHome = Math.random() > 0.5;
            const isMake = Math.random() > 0.45;
            const hoopX = isHome ? 88.75 : 5.25;
            const direction = isHome ? -1 : 1;
            const dist = Math.random() * 28;
            const angle = (Math.random() * Math.PI) - (Math.PI / 2);
            const x = Math.max(2, Math.min(92, hoopX + Math.cos(angle) * dist * direction));
            const y = Math.max(2, Math.min(48, 25 + Math.sin(angle) * dist));
            return [...prev.slice(-40), { id: Date.now(), x, y, isMake }];
        });
    }, 120);

    const msgTimer = setInterval(() => {
        if (isFinishedRef.current) {
            setCurrentMessage("경기 종료 - 결과 집계 중...");
            return;
        }

        const currentProgress = progressRef.current;
        const scoreDiff = Math.abs(homeScoreRef.current - awayScoreRef.current);
        
        let targetPool = GENERAL_MESSAGES;
        
        if (currentProgress > 60 && scoreDiff >= 20) {
            targetPool = GARBAGE_MESSAGES;
        } else if (currentProgress > 94 && scoreDiff <= 3) {
            targetPool = SUPER_CLUTCH_MESSAGES;
        } else if (currentProgress > 85 && scoreDiff <= 10) {
            targetPool = CLUTCH_MESSAGES;
        }

        setCurrentMessage(prev => {
            let next;
            if (targetPool.length <= 1) return targetPool[0];
            do {
                next = targetPool[Math.floor(Math.random() * targetPool.length)];
            } while (next === prev);
            return next;
        });
    }, 1500); 

    return () => {
        clearInterval(shotTimer);
        clearInterval(msgTimer);
    };
  }, []);

  if (!homeTeam || !awayTeam) return null;

  return (
    <div className="fixed inset-0 bg-slate-950 z-[110] flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Background Effect */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-[150px]"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-[150px]"></div>
      </div>

      {/* Unified Container */}
      <div className="relative z-10 w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header Section (Scoreboard) */}
        <div className="flex items-center justify-between px-6 py-8 md:px-12 bg-slate-950/30">
            {/* Away Team */}
            <div className="flex flex-col items-center gap-3 w-32 md:w-40">
                <img src={awayTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl animate-in zoom-in duration-500" alt="" />
                <div className="text-center w-full">
                    <div className="text-lg md:text-xl font-black text-white oswald uppercase tracking-tight text-shadow-lg truncate w-full">{awayTeam.name}</div>
                    <div className="text-4xl md:text-5xl font-black text-slate-200 oswald tabular-nums mt-1 drop-shadow-xl">{currentAwayScore}</div>
                </div>
            </div>

            {/* Center Info */}
            <div className="flex-1 px-4 flex flex-col items-center justify-center gap-4">
                 <div className={`text-sm md:text-lg font-black text-center min-h-[3rem] flex items-center justify-center break-keep leading-snug animate-pulse transition-colors duration-300 ${
                     Math.abs(currentHomeScore - currentAwayScore) >= 20 && progress > 60 
                        ? 'text-slate-500'
                        : progress > 94 && Math.abs(currentHomeScore - currentAwayScore) <= 3
                            ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]'
                            : progress > 85 && Math.abs(currentHomeScore - currentAwayScore) <= 10
                                ? 'text-yellow-400'
                                : 'text-indigo-300'
                 }`}>
                    {currentMessage}
                 </div>
                 <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden shadow-inner border border-slate-700">
                    <div className={`h-full transition-all duration-300 ease-linear ${
                        Math.abs(currentHomeScore - currentAwayScore) >= 20 && progress > 60 
                            ? 'bg-slate-600'
                            : progress > 94 && Math.abs(currentHomeScore - currentAwayScore) <= 3
                                ? 'bg-gradient-to-r from-red-600 to-orange-500 shadow-[0_0_20px_rgba(220,38,38,0.6)]'
                                : 'bg-gradient-to-r from-indigo-600 to-blue-500'
                    }`} style={{ width: `${progress}%` }}></div>
                 </div>
            </div>

            {/* Home Team */}
            <div className="flex flex-col items-center gap-3 w-32 md:w-40">
                <img src={homeTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl animate-in zoom-in duration-500" alt="" />
                <div className="text-center w-full">
                    <div className="text-lg md:text-xl font-black text-white oswald uppercase tracking-tight text-shadow-lg truncate w-full">{homeTeam.name}</div>
                    <div className="text-4xl md:text-5xl font-black text-slate-200 oswald tabular-nums mt-1 drop-shadow-xl">{currentHomeScore}</div>
                </div>
            </div>
        </div>

        {/* Court Section (Bottom) */}
        <div className="relative w-full aspect-[94/50] bg-slate-950 border-t border-slate-800">
            <svg viewBox="0 0 94 50" className="absolute inset-0 w-full h-full opacity-80">
                <rect width="94" height="50" fill="#0f172a" />
                <g fill="none" stroke="#1e293b" strokeWidth="0.4">
                    <rect x="0" y="0" width="94" height="50" />
                    <line x1="47" y1="0" x2="47" y2="50" />
                    <circle cx="47" cy="25" r="6" />
                    <circle cx="47" cy="25" r="2" fill="#1e293b" />
                    <rect x="0" y="17" width="19" height="16" />
                    <circle cx="19" cy="25" r="6" strokeDasharray="1,1" />
                    <path d="M 0 3 L 14 3 A 23.75 23.75 0 0 1 14 47 L 0 47" />
                    <circle cx="5.25" cy="25" r="1.5" />
                    <rect x="75" y="17" width="19" height="16" />
                    <circle cx="75" cy="25" r="6" strokeDasharray="1,1" />
                    <path d="M 94 3 L 80 3 A 23.75 23.75 0 0 0 80 47 L 94 47" />
                    <circle cx="88.75" cy="25" r="1.5" />
                </g>
            </svg>
            {shots.map(s => (
                <div key={s.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-opacity duration-1000" style={{ left: `${(s.x / 94) * 100}%`, top: `${(s.y / 50) * 100}%` }}>
                    {s.isMake ? <div className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,1)] border border-emerald-300"></div> : <X size={12} className="text-red-500/60 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" strokeWidth={3} />}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

interface GameStatLeaders {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
}

const ResultBoxScore: React.FC<{ 
    team: Team, 
    box: PlayerBoxScore[], 
    isFirst?: boolean, 
    mvpId: string, 
    leaders: GameStatLeaders
}> = ({ team, box, isFirst, mvpId, leaders }) => {
  const sortedBox = useMemo(() => [...box].sort((a, b) => b.gs - a.gs || b.mp - a.mp), [box]);
  const teamTotals = useMemo(() => {
    return box.reduce((acc, p) => ({
      mp: acc.mp + p.mp, pts: acc.pts + p.pts, reb: acc.reb + p.reb, offReb: acc.offReb + (p.offReb || 0), defReb: acc.defReb + (p.defReb || 0), ast: acc.ast + p.ast,
      stl: acc.stl + p.stl, blk: acc.blk + p.blk, tov: acc.tov + p.tov,
      fgm: acc.fgm + p.fgm, fga: acc.fga + p.fga,
      p3m: acc.p3m + p.p3m, p3a: acc.p3a + p.p3a, ftm: acc.ftm + p.ftm, fta: acc.fta + p.fta,
    }), { mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });
  }, [box]);

  const highlightClass = "text-yellow-400 font-medium pretendard drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]";
  // 통일된 폰트 및 사이즈 (이름 제외), w-14 적용을 위한 베이스 클래스에선 width 제외하고 사용처에서 직접 w-14 지정하거나 여기서 w-full 등으로 처리
  // 여기서는 개별 th에 w-14를 주고, td는 text alignment와 font style만 제어하면 됨.
  const statCellClass = "py-2.5 px-2 text-xs font-medium pretendard";

  const getPct = (m: number, a: number) => a > 0 ? (m / a * 100).toFixed(1) : '0.0';

  return (
    <div className={`flex flex-col ${!isFirst ? 'mt-10' : ''}`}>
       <div className="flex items-center gap-3 mb-4 px-2">
           <img src={team.logo} className="w-8 h-8 object-contain" alt="" />
           <h3 className="text-lg font-black uppercase text-white tracking-widest">{team.city} {team.name}</h3>
       </div>
       <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto custom-scrollbar">
             <table className="w-full text-left whitespace-nowrap">
                <thead>
                   <tr className="bg-slate-950/50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                      <th className="py-3 px-4 sticky left-0 bg-slate-950 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)] w-[140px]">Player</th>
                      <th className="py-3 px-2 text-center w-14">POS</th>
                      <th className="py-3 px-2 text-center w-14">OVR</th>
                      <th className="py-3 px-2 text-center w-14">MIN</th>
                      <th className="py-3 px-2 text-right w-14">PTS</th>
                      <th className="py-3 px-2 text-right w-14">REB</th>
                      <th className="py-3 px-2 text-right w-14">AST</th>
                      <th className="py-3 px-2 text-right w-14">STL</th>
                      <th className="py-3 px-2 text-right w-14">BLK</th>
                      <th className="py-3 px-2 text-right w-14">TOV</th>
                      <th className="py-3 px-2 text-right w-14">FG</th>
                      <th className="py-3 px-2 text-right w-14">FG%</th>
                      <th className="py-3 px-2 text-right w-14">3P</th>
                      <th className="py-3 px-2 text-right w-14">3P%</th>
                      <th className="py-3 px-2 text-right w-14">FT</th>
                      <th className="py-3 px-2 text-right w-14">FT%</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                   {sortedBox.map(p => {
                       const playerInfo = team.roster.find(r => r.id === p.playerId);
                       const isMvp = p.playerId === mvpId;
                       const ovr = playerInfo?.ovr || 0;
                       
                       return (
                           <tr key={p.playerId} className={`hover:bg-white/5 transition-colors group ${isMvp ? 'bg-amber-900/10' : ''}`}>
                               <td className="py-2.5 px-4 sticky left-0 bg-slate-900 group-hover:bg-slate-800 transition-colors z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                                   <div className="flex items-center gap-2">
                                       <span className={`text-sm font-bold truncate max-w-[100px] ${isMvp ? 'text-amber-200' : 'text-slate-200'}`}>{p.playerName}</span>
                                       <div className="flex items-center gap-1 flex-shrink-0">
                                            {isMvp && <Crown size={12} className="text-amber-400 fill-amber-400 animate-pulse" />}
                                            {/* Ace Stopper Visuals */}
                                            {p.isStopper && (
                                                <div className="group/tooltip relative">
                                                    <Shield size={12} className="text-blue-400 fill-blue-900/50" />
                                                </div>
                                            )}
                                            {p.isAceTarget && (p.matchupEffect || 0) < 0 && (
                                                <div className="flex items-center gap-1 bg-red-950/50 border border-red-500/30 px-1.5 py-0.5 rounded">
                                                    <Lock size={10} className="text-red-400" />
                                                    <span className="text-[9px] font-black text-red-400 leading-none">
                                                        {p.matchupEffect}%
                                                    </span>
                                                </div>
                                            )}
                                       </div>
                                   </div>
                               </td>
                               <td className={`${statCellClass} text-center text-slate-500`}>{playerInfo?.position}</td>
                               <td className={`${statCellClass} text-center`}>
                                   <div className={getOvrBadgeStyle(ovr) + " !w-7 !h-7 !text-xs !mx-auto"}>{ovr}</div>
                               </td>
                               <td className={`${statCellClass} text-center text-slate-400`}>{Math.round(p.mp)}</td>
                               
                               {/* Highlighted Stats (All text-xs, font-medium, pretendard) */}
                               <td className={`${statCellClass} text-right ${p.pts === leaders.pts && p.pts > 0 ? highlightClass : 'text-white'}`}>{p.pts}</td>
                               <td className={`${statCellClass} text-right ${p.reb === leaders.reb && p.reb > 0 ? highlightClass : 'text-slate-300'}`}>{p.reb}</td>
                               <td className={`${statCellClass} text-right ${p.ast === leaders.ast && p.ast > 0 ? highlightClass : 'text-slate-300'}`}>{p.ast}</td>
                               <td className={`${statCellClass} text-right ${p.stl === leaders.stl && p.stl > 0 ? highlightClass : 'text-slate-400'}`}>{p.stl}</td>
                               <td className={`${statCellClass} text-right ${p.blk === leaders.blk && p.blk > 0 ? highlightClass : 'text-slate-400'}`}>{p.blk}</td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.tov}</td>
                               
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.fgm}/{p.fga}</td>
                               <td className={`${statCellClass} text-right text-slate-500`}>{getPct(p.fgm, p.fga)}</td>
                               
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.p3m}/{p.p3a}</td>
                               <td className={`${statCellClass} text-right text-slate-500`}>{getPct(p.p3m, p.p3a)}</td>
                               
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.ftm}/{p.fta}</td>
                               <td className={`${statCellClass} text-right text-slate-500`}>{getPct(p.ftm, p.fta)}</td>
                           </tr>
                       );
                   })}
                </tbody>
                <tfoot className="bg-slate-950/30 font-black text-xs border-t border-slate-800">
                    <tr>
                        <td className="py-3 px-4 sticky left-0 bg-slate-950 z-10 text-indigo-400 uppercase tracking-widest shadow-[2px_0_5px_rgba(0,0,0,0.5)]">Total</td>
                        <td colSpan={3}></td>
                        <td className={`${statCellClass} text-right text-white`}>{teamTotals.pts}</td>
                        <td className={`${statCellClass} text-right text-slate-300`}>{teamTotals.reb}</td>
                        <td className={`${statCellClass} text-right text-slate-300`}>{teamTotals.ast}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.stl}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.blk}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.tov}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.fgm}/{teamTotals.fga}</td>
                        <td className={`${statCellClass} text-right text-slate-500`}>{getPct(teamTotals.fgm, teamTotals.fga)}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.p3m}/{teamTotals.p3a}</td>
                        <td className={`${statCellClass} text-right text-slate-500`}>{getPct(teamTotals.p3m, teamTotals.p3a)}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.ftm}/{teamTotals.fta}</td>
                        <td className={`${statCellClass} text-right text-slate-500`}>{getPct(teamTotals.ftm, teamTotals.fta)}</td>
                    </tr>
                </tfoot>
             </table>
          </div>
       </div>
    </div>
  );
};

export const GameResultView: React.FC<{
  result: {
    home: Team;
    away: Team;
    homeScore: number;
    awayScore: number;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    recap: string[];
    otherGames: Game[];
  };
  myTeamId: string;
  teams: Team[];
  onFinish: () => void;
}> = ({ result, myTeamId, teams, onFinish }) => {
  const { home, away, homeScore, awayScore, homeBox, awayBox, recap, otherGames } = result;
  
  const isHome = myTeamId === home.id;
  const isWin = isHome ? homeScore > awayScore : awayScore > homeScore;
  
  const headline = recap && recap.length > 0 ? recap[0] : "경기 종료";

  const getTeamInfo = (id: string) => teams.find(t => t.id === id);

  // MVP Calculation
  const allPlayers = [...homeBox, ...awayBox];
  const mvp = allPlayers.reduce((prev, curr) => (curr.pts > prev.pts ? curr : prev), allPlayers[0]);

  // Leaders Calculation
  const leaders: GameStatLeaders = {
      pts: Math.max(...allPlayers.map(p => p.pts)),
      reb: Math.max(...allPlayers.map(p => p.reb)),
      ast: Math.max(...allPlayers.map(p => p.ast)),
      stl: Math.max(...allPlayers.map(p => p.stl)),
      blk: Math.max(...allPlayers.map(p => p.blk)),
      tov: Math.max(...allPlayers.map(p => p.tov)),
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-[100] overflow-y-auto animate-in fade-in duration-500 ko-normal pretendard pb-24">
       <div className="min-h-screen flex flex-col">
          {/* Header */}
          <div className="bg-slate-900 border-b border-slate-800 pt-10 pb-8 px-8 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl z-20">
              <div className={`absolute inset-0 opacity-20 pointer-events-none bg-gradient-to-b ${isWin ? 'from-emerald-900 to-slate-900' : 'from-red-900 to-slate-900'}`}></div>
              
              <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-5xl">
                  {/* Scoreboard Row */}
                  <div className="flex items-center justify-between w-full">
                      <div className="flex flex-col items-center gap-4 flex-1">
                          <img src={away.logo} className="w-20 h-20 md:w-28 md:h-28 object-contain drop-shadow-2xl" alt={away.name} />
                          <div className="text-center">
                              <div className="text-2xl md:text-4xl font-black text-white oswald uppercase tracking-tight">{away.name}</div>
                              <div className={`text-5xl md:text-7xl font-black oswald mt-2 ${awayScore > homeScore ? 'text-white' : 'text-slate-600'}`}>{Math.round(awayScore)}</div>
                          </div>
                      </div>

                      <div className="flex flex-col items-center justify-center px-4 md:px-12">
                          <div className="text-xl md:text-2xl font-black text-slate-700 oswald tracking-widest mb-4">FINAL</div>
                          {isWin ? (
                              <div className="px-4 py-1.5 md:px-6 md:py-2 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs md:text-sm tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.4)]">Victory</div>
                          ) : (
                              <div className="px-4 py-1.5 md:px-6 md:py-2 bg-red-600 text-white rounded-xl font-black uppercase text-xs md:text-sm tracking-widest shadow-[0_0_20px_rgba(239,68,68,0.4)]">Defeat</div>
                          )}
                      </div>

                      <div className="flex flex-col items-center gap-4 flex-1">
                          <img src={home.logo} className="w-20 h-20 md:w-28 md:h-28 object-contain drop-shadow-2xl" alt={home.name} />
                          <div className="text-center">
                              <div className="text-2xl md:text-4xl font-black text-white oswald uppercase tracking-tight">{home.name}</div>
                              <div className={`text-5xl md:text-7xl font-black oswald mt-2 ${homeScore > awayScore ? 'text-white' : 'text-slate-600'}`}>{Math.round(homeScore)}</div>
                          </div>
                      </div>
                  </div>

                  {/* Headline in Header */}
                  <div className="w-full bg-slate-950/50 border border-white/5 rounded-2xl p-4 text-center backdrop-blur-md">
                      <p className="text-sm md:text-base font-bold text-slate-200 leading-relaxed break-keep">
                          <Newspaper className="inline-block mr-2 text-indigo-400 mb-0.5" size={16} />
                          {headline}
                      </p>
                  </div>
              </div>
          </div>

          <div className="flex-1 max-w-6xl mx-auto w-full p-6 space-y-8">
              <ResultBoxScore team={away} box={awayBox} isFirst mvpId={mvp.playerId} leaders={leaders} />
              <ResultBoxScore team={home} box={homeBox} mvpId={mvp.playerId} leaders={leaders} />
              
              {/* Around the League */}
              {otherGames && otherGames.length > 0 && (
                 <div className="mt-12 pt-8 border-t border-slate-800">
                     <h3 className="text-lg font-black uppercase text-slate-500 tracking-widest mb-6 flex items-center gap-2">
                        <Activity size={20} /> Around the League
                     </h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                         {otherGames.map(g => {
                             const h = getTeamInfo(g.homeTeamId);
                             const a = getTeamInfo(g.awayTeamId);
                             if (!h || !a) return null;
                             const hWin = (g.homeScore || 0) > (g.awayScore || 0);
                             return (
                                 <div key={g.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
                                     <div className="flex justify-between items-center">
                                         <div className="flex items-center gap-3">
                                             <img src={a.logo} className="w-6 h-6 object-contain opacity-80" alt="" />
                                             <span className={`text-sm font-bold uppercase ${!hWin ? 'text-white' : 'text-slate-500'}`}>{a.name}</span>
                                         </div>
                                         <span className={`text-lg font-black oswald ${!hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{g.awayScore}</span>
                                     </div>
                                     <div className="flex justify-between items-center">
                                         <div className="flex items-center gap-3">
                                             <img src={h.logo} className="w-6 h-6 object-contain opacity-80" alt="" />
                                             <span className={`text-sm font-bold uppercase ${hWin ? 'text-white' : 'text-slate-500'}`}>{h.name}</span>
                                         </div>
                                         <span className={`text-lg font-black oswald ${hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{g.homeScore}</span>
                                     </div>
                                 </div>
                             );
                         })}
                     </div>
                 </div>
              )}
          </div>

          {/* Bottom Button Fixed */}
          <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/80 backdrop-blur-md border-t border-slate-800 flex justify-center z-50">
              <button 
                  onClick={onFinish}
                  className="px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-lg tracking-widest shadow-[0_10px_30px_rgba(79,70,229,0.4)] transition-all active:scale-95 flex items-center gap-4"
              >
                  Continue to Dashboard <ChevronRight />
              </button>
          </div>
       </div>
    </div>
  );
};

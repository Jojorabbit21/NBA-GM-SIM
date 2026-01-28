
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import { Team } from '../types';

// Team Colors Mapping
const TEAM_COLORS: Record<string, string> = {
  'atl': '#C8102E', 'bos': '#007A33', 'bkn': '#FFFFFF', 'cha': '#1D1160', 'chi': '#CE1141', 'cle': '#860038',
  'dal': '#00538C', 'den': '#FEC524', 'det': '#C8102E', 'gsw': '#1D428A', 'hou': '#CE1141', 'ind': '#FDBB30',
  'lac': '#1D428A', 'lal': '#FDB927', 'mem': '#5D76A9', 'mia': '#98002E', 'mil': '#00471B', 'min': '#236192',
  'nop': '#85714D', 'nyk': '#F58426', 'okc': '#007AC1', 'orl': '#0077C0', 'phi': '#006BB6', 'phx': '#1D1160',
  'por': '#E03A3E', 'sac': '#5A2D81', 'sas': '#C4CED4', 'tor': '#CE1141', 'uta': '#002B5C', 'was': '#002B5C'
};

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
    "파울 작전! 자유투가 중요합니다.",
    "역사에 남을 명승부...",
];

const GARBAGE_MESSAGES = [
    "점수 차가 많이 벌어졌습니다.",
    "주전 선수들이 벤치로 물러나 휴식을 취합니다.",
    "가비지 타임, 유망주들이 코트를 밟습니다.",
    "승부의 추는 이미 기운 것 같습니다.",
    "일방적인 경기 흐름이 계속됩니다.",
    "관중들이 하나둘 경기장을 빠져나갑니다...",
    "감독이 벤치 멤버들이게 기회를 줍니다.",
    "사실상 승패가 결정되었습니다.",
];

// WP Calculation Logic: Score diff + Time remaining
const calculateWinProbability = (homeScore: number, awayScore: number, timePassed: number) => {
    const totalTime = 48;
    const timeRemaining = Math.max(0, totalTime - timePassed);
    const diff = homeScore - awayScore;
    
    // As time decreases, points lead becomes more valuable
    const volatility = Math.sqrt(timeRemaining + 1) * 3.0;
    
    // Normalize to 0-100 (Home 100%, Away 0%)
    let wp = 50 + (diff / volatility) * 50;
    return Math.max(0.1, Math.min(99.9, wp));
};

const generateRealisticGameFlow = (finalHome: number, finalAway: number) => {
    let currentHome = 0;
    let currentAway = 0;
    const history: { h: number, a: number, wp: number }[] = [{ h: 0, a: 0, wp: 50 }];
    const scoreDiff = Math.abs(finalHome - finalAway);
    const isClutchGame = scoreDiff <= 5;
    let momentum = 0;
    const clutchTriggerHome = isClutchGame ? finalHome - (Math.floor(Math.random() * 3) + 3) : 9999;
    const clutchTriggerAway = isClutchGame ? finalAway - (Math.floor(Math.random() * 3) + 3) : 9999;
    let clutchModeActivated = false;

    // Total events roughly mapped to 48 minutes
    const totalSteps = 100; 

    while (currentHome < finalHome || currentAway < finalAway) {
        const timePassed = (history.length / totalSteps) * 48;

        if (isClutchGame && !clutchModeActivated && currentHome >= clutchTriggerHome && currentAway >= clutchTriggerAway) {
            clutchModeActivated = true;
        }

        const remainingHome = finalHome - currentHome;
        const remainingAway = finalAway - currentAway;
        let homeProb = remainingHome / (remainingHome + remainingAway || 1);
        homeProb += (momentum * 0.05);

        if (isClutchGame && !clutchModeActivated) {
            if (currentHome > currentAway + 10) homeProb -= 0.2;
            if (currentAway > currentHome + 10) homeProb += 0.2;
        } else if (clutchModeActivated) {
             if (currentHome < currentAway && remainingHome > 0) homeProb += 0.35;
             else if (currentAway < currentHome && remainingAway > 0) homeProb -= 0.35;
        }

        homeProb = Math.max(0.05, Math.min(0.95, homeProb));
        let scorer: 'home' | 'away';
        if (currentHome >= finalHome) scorer = 'away';
        else if (currentAway >= finalAway) scorer = 'home';
        else scorer = Math.random() < homeProb ? 'home' : 'away';

        let points = 2;
        const rand = Math.random();
        if (clutchModeActivated) points = rand > 0.7 ? 1 : 2; 
        else points = rand > 0.35 ? 2 : 3; 

        if (scorer === 'home') {
            points = Math.min(points, remainingHome); 
            currentHome += points;
            momentum = Math.min(momentum + 1, 3);
        } else {
            points = Math.min(points, remainingAway);
            currentAway += points;
            momentum = Math.max(momentum - 1, -3);
        }
        if ((scorer === 'home' && momentum < 0) || (scorer === 'away' && momentum > 0)) momentum = 0;
        
        const currentWP = calculateWinProbability(currentHome, currentAway, timePassed);
        history.push({ h: currentHome, a: currentAway, wp: currentWP });
    }
    return history;
};

const ScoreGraph: React.FC<{ 
    history: { h: number, a: number, wp: number }[], 
    progress: number, 
    homeColor: string, 
    awayColor: string,
    homeLogo: string,
    awayLogo: string,
    homeTeamCode: string,
    awayTeamCode: string
}> = ({ history, progress, homeColor, awayColor, homeLogo, awayLogo, homeTeamCode, awayTeamCode }) => {
    const VIEW_WIDTH = 100;
    const VIEW_HEIGHT = 60;
    const MID_Y = 30; // 50% line

    const dataIndex = Math.floor((progress / 100) * (history.length - 1));
    const dataSlice = history.slice(0, dataIndex + 1);

    // Build points for the line
    let points = "";
    dataSlice.forEach((data, i) => {
        const x = (i / (history.length - 1)) * VIEW_WIDTH;
        // Map wp (0-100) to y. 100% Home = 0, 0% Home = VIEW_HEIGHT
        const y = VIEW_HEIGHT - (data.wp / 100 * VIEW_HEIGHT);
        points += `${x},${y} `;
    });

    const currentData = dataSlice[dataSlice.length - 1] || { wp: 50 };
    const currentWP = currentData.wp;
    const endX = (dataIndex / (history.length - 1)) * VIEW_WIDTH;
    const endY = VIEW_HEIGHT - (currentWP / 100 * VIEW_HEIGHT);

    // Create the closed path for filling
    // Start at (0, MID_Y) -> Follow points -> (endX, MID_Y) -> Close
    const fillPath = `M 0,${MID_Y} L ${points} L ${endX},${MID_Y} Z`;

    const homeProb = currentWP.toFixed(0);
    const awayProb = (100 - currentWP).toFixed(0);

    return (
        <div className="w-full relative flex flex-col mt-6 mb-2">
            {/* Header: Logos & Percentages */}
            <div className="flex justify-between items-end px-1 mb-2">
                <div className="flex items-center gap-2">
                    <img src={homeLogo} className="w-8 h-8 object-contain" alt="Home" />
                    <div>
                        <div className="text-2xl font-black oswald leading-none text-white">{homeProb}%</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{homeTeamCode}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-right">
                    <div>
                        <div className="text-2xl font-black oswald leading-none text-white">{awayProb}%</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{awayTeamCode}</div>
                    </div>
                    <img src={awayLogo} className="w-8 h-8 object-contain" alt="Away" />
                </div>
            </div>

            {/* Graph Container */}
            <div className="w-full h-40 bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden">
                <svg 
                    viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} 
                    className="w-full h-full"
                    preserveAspectRatio="none"
                >
                    <defs>
                        {/* Gradient for Fill: Sharp transition at 50% */}
                        <linearGradient id="wpGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="50%" stopColor={homeColor} stopOpacity="0.4" />
                            <stop offset="50%" stopColor={awayColor} stopOpacity="0.4" />
                        </linearGradient>
                        
                        {/* Dot Pattern for Grid */}
                        <pattern id="gridPattern" width="25" height="15" patternUnits="userSpaceOnUse">
                            <circle cx="1" cy="1" r="0.5" fill="#334155" />
                        </pattern>
                    </defs>

                    {/* Background Grid */}
                    <rect width="100%" height="100%" fill="url(#gridPattern)" opacity="0.5" />
                    
                    {/* 50% Baseline */}
                    <line x1="0" y1={MID_Y} x2="100" y2={MID_Y} stroke="#475569" strokeWidth="0.2" />

                    {/* The Fill Area (Between Curve and Center) */}
                    <path 
                        d={fillPath} 
                        fill="url(#wpGradient)" 
                        stroke="none"
                    />

                    {/* The Curve Line */}
                    <polyline 
                        points={points} 
                        fill="none" 
                        stroke="#e2e8f0" 
                        strokeWidth="0.8" 
                        strokeDasharray="1.5 1"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                    />

                    {/* End Dot */}
                    {dataSlice.length > 0 && (
                        <circle cx={endX} cy={endY} r="1" fill="white" className="animate-pulse" />
                    )}
                </svg>

                {/* Y-Axis Labels (Overlay) */}
                <div className="absolute right-1 top-1 text-[8px] text-slate-500 font-mono">100</div>
                <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-slate-500 font-mono">50</div>
                <div className="absolute right-1 bottom-1 text-[8px] text-slate-500 font-mono">100</div>
            </div>

            {/* X-Axis Labels */}
            <div className="flex justify-between px-1 mt-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                <span>1st</span>
                <span>2nd</span>
                <span>3rd</span>
                <span>4th</span>
            </div>
        </div>
    );
};

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
  
  const isFinishedRef = useRef(false);
  const progressRef = useRef(0);
  const onCompleteRef = useRef(onSimulationComplete);
  
  useEffect(() => {
      onCompleteRef.current = onSimulationComplete;
  }, [onSimulationComplete]);
  
  const scoreTimeline = useMemo(() => 
      generateRealisticGameFlow(finalHomeScore, finalAwayScore), 
  [finalHomeScore, finalAwayScore]);

  const [displayScore, setDisplayScore] = useState({ h: 0, a: 0 });

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const runSimulationStep = () => {
        setProgress(prev => {
            if (prev >= 100) {
                progressRef.current = 100;
                return 100;
            }
            const isLateGame = prev > 85; 
            const isVeryLateGame = prev > 94;
            const increment = isVeryLateGame ? 0.3 : (isLateGame ? 0.5 : 1.2);
            const next = Math.min(100, prev + increment);
            progressRef.current = next;
            const delay = isVeryLateGame ? 250 : (isLateGame ? 100 : 30);
            timeoutId = setTimeout(runSimulationStep, delay);
            return next;
        });
    };
    runSimulationStep();
    return () => clearTimeout(timeoutId);
  }, []); 

  useEffect(() => {
      if (scoreTimeline.length === 0) return;
      const percent = progress / 100;
      const index = Math.floor(percent * (scoreTimeline.length - 1));
      setDisplayScore(scoreTimeline[index]);
  }, [progress, scoreTimeline]);

  useEffect(() => {
      if (progress >= 100 && !isFinishedRef.current) {
          isFinishedRef.current = true;
          setDisplayScore({ h: finalHomeScore, a: finalAwayScore });
          setTimeout(() => {
              if (onCompleteRef.current) onCompleteRef.current();
          }, 2000);
      }
  }, [progress, finalHomeScore, finalAwayScore]);

  useEffect(() => {
    const shotTimer = setInterval(() => {
        setShots(prev => {
            if (isFinishedRef.current) return prev;
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
        const approxIdx = Math.floor((currentProgress / 100) * (scoreTimeline.length - 1));
        const currentScore = scoreTimeline[approxIdx] || { h: 0, a: 0 };
        const scoreDiff = Math.abs(currentScore.h - currentScore.a);
        
        let targetPool = GENERAL_MESSAGES;
        if (currentProgress > 60 && scoreDiff >= 20) targetPool = GARBAGE_MESSAGES;
        else if (currentProgress > 94 && scoreDiff <= 3) targetPool = SUPER_CLUTCH_MESSAGES;
        else if (currentProgress > 85 && scoreDiff <= 10) targetPool = CLUTCH_MESSAGES;

        setCurrentMessage(prev => {
            if (targetPool.length <= 1) return targetPool[0];
            let next;
            do { next = targetPool[Math.floor(Math.random() * targetPool.length)]; } while (next === prev);
            return next;
        });
    }, 1500); 

    return () => {
        clearInterval(shotTimer);
        clearInterval(msgTimer);
    };
  }, [scoreTimeline]); 

  if (!homeTeam || !awayTeam) return null;

  const homeColor = TEAM_COLORS[homeTeam.id] || '#ffffff';
  const awayColor = TEAM_COLORS[awayTeam.id] || '#94a3b8';

  return (
    <div className="fixed inset-0 bg-slate-950 z-[110] flex flex-col items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-[150px]"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-[150px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-6 md:px-10 bg-slate-950/30">
            <div className="flex flex-col items-center gap-3 w-32 md:w-40">
                <img src={awayTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl animate-in zoom-in duration-500" alt="" />
                <div className="text-center w-full">
                    <div className="text-lg md:text-xl font-black text-white oswald uppercase tracking-tight text-shadow-lg truncate w-full">{awayTeam.name}</div>
                    <div className="text-4xl md:text-5xl font-black text-slate-200 oswald tabular-nums mt-1 drop-shadow-xl">{displayScore.a}</div>
                </div>
            </div>

            <div className="flex-1 px-2 flex flex-col items-center justify-center">
                 <div className={`text-sm md:text-base font-black text-center min-h-[2rem] flex items-center justify-center break-keep leading-tight animate-pulse transition-colors duration-300 ${
                     Math.abs(displayScore.h - displayScore.a) >= 20 && progress > 60 
                        ? 'text-slate-500'
                        : progress > 94 && Math.abs(displayScore.h - displayScore.a) <= 3
                            ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]'
                            : progress > 85 && Math.abs(displayScore.h - displayScore.a) <= 10
                                ? 'text-yellow-400'
                                : 'text-indigo-300'
                 }`}>
                    {currentMessage}
                 </div>

                 {/* Updated Score Graph (ESPN Style Dark) */}
                 <ScoreGraph 
                    history={scoreTimeline} 
                    progress={progress} 
                    homeColor={homeColor} 
                    awayColor={awayColor} 
                    homeLogo={homeTeam.logo}
                    awayLogo={awayTeam.logo}
                    homeTeamCode={homeTeam.id.toUpperCase()}
                    awayTeamCode={awayTeam.id.toUpperCase()}
                 />
            </div>

            <div className="flex flex-col items-center gap-3 w-32 md:w-40">
                <img src={homeTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl animate-in zoom-in duration-500" alt="" />
                <div className="text-center w-full">
                    <div className="text-lg md:text-xl font-black text-white oswald uppercase tracking-tight text-shadow-lg truncate w-full">{homeTeam.name}</div>
                    <div className="text-4xl md:text-5xl font-black text-slate-200 oswald tabular-nums mt-1 drop-shadow-xl">{displayScore.h}</div>
                </div>
            </div>
        </div>

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

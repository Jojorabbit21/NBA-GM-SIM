
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import { Team } from '../types';
import { ScoreGraph } from '../components/game/ScoreGraph';
import { TEAM_DATA } from '../data/teamData';
import { GAME_SIMULATION_MESSAGES } from '../data/uiConstants';

// [Config] Simulation Speed Control
// Lower increment / Higher delay = Slower game
export const SIMULATION_SPEED = {
    NORMAL: { INC: 0.6, DELAY: 60 },      // Base speed (approx 50% slower than before)
    LATE: { INC: 0.4, DELAY: 150 },       // 4th Quarter (85%+)
    CLUTCH: { INC: 0.2, DELAY: 400 },     // Last minute close game (94%+)
    GARBAGE: { INC: 1.5, DELAY: 30 }      // Blowout games
};

// WP Calculation Logic: Score diff + Time remaining
// 50% is the baseline (Tie).
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
    // [Fix] Ensure the graph starts exactly at 50%
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
  const [currentMessage, setCurrentMessage] = useState(GAME_SIMULATION_MESSAGES.GENERAL[0]);
  const [isBuzzerBeaterActive, setIsBuzzerBeaterActive] = useState(false);
  
  const isFinishedRef = useRef(false);
  const progressRef = useRef(0);
  const onCompleteRef = useRef(onSimulationComplete);
  const isBuzzerBeaterTriggeredRef = useRef(false);
  
  useEffect(() => {
      onCompleteRef.current = onSimulationComplete;
  }, [onSimulationComplete]);
  
  const scoreTimeline = useMemo(() => 
      generateRealisticGameFlow(finalHomeScore, finalAwayScore), 
  [finalHomeScore, finalAwayScore]);

  const [displayScore, setDisplayScore] = useState({ h: 0, a: 0 });

  // [Update] Simulation Speed Logic (Fixed Jumping Bug)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const runSimulationStep = () => {
        setProgress(prev => {
            // Game Finished
            if (prev >= 100) {
                progressRef.current = 100;
                return 100;
            }

            // [Logic Update] Buzzer Beater Handling in Simulation Loop
            // 1. If triggered previously, verify we jump straight to 100% (Game Over)
            if (isBuzzerBeaterTriggeredRef.current) {
                progressRef.current = 100;
                return 100;
            }
            
            const currentIndex = Math.floor((prev / 100) * (scoreTimeline.length - 1));
            const currentData = scoreTimeline[currentIndex] || { h: 0, a: 0 };
            const scoreDiff = Math.abs(currentData.h - currentData.a);

            const isGarbage = prev > 60 && scoreDiff >= 20;
            const isLateGame = prev > 85;
            const isSuperClutch = prev > 94 && scoreDiff <= 3;
            
            // [Logic Update] Buzzer Beater Trigger Condition
            const eventualWinnerIsHome = finalHomeScore > finalAwayScore;
            const isWinnerTrailingOrTied = eventualWinnerIsHome 
                ? currentData.h <= currentData.a 
                : currentData.a <= currentData.h;

            const remainingHomePoints = finalHomeScore - currentData.h;
            const remainingAwayPoints = finalAwayScore - currentData.a;
            const totalRemainingPoints = remainingHomePoints + remainingAwayPoints;

            if (
                !isBuzzerBeaterTriggeredRef.current && 
                prev > 96 && 
                prev < 99 && 
                scoreDiff <= 3 && 
                isWinnerTrailingOrTied &&
                totalRemainingPoints > 0 && 
                totalRemainingPoints <= 3   
            ) {
                 // 30% Chance to trigger the event for drama
                 if (Math.random() < 0.30) {
                     isBuzzerBeaterTriggeredRef.current = true;
                     setIsBuzzerBeaterActive(true);
                     
                     // [Visual Fix] Immediately update message
                     const buzzerMsgs = GAME_SIMULATION_MESSAGES.BUZZER_BEATER;
                     setCurrentMessage(buzzerMsgs[Math.floor(Math.random() * buzzerMsgs.length)]);
                     
                     timeoutId = setTimeout(runSimulationStep, 2000); 
                     return prev; 
                 }
            }

            let speedConfig = SIMULATION_SPEED.NORMAL;
            if (isGarbage) speedConfig = SIMULATION_SPEED.GARBAGE;
            else if (isSuperClutch) speedConfig = SIMULATION_SPEED.CLUTCH;
            else if (isLateGame) speedConfig = SIMULATION_SPEED.LATE;

            const next = Math.min(100, prev + speedConfig.INC);
            progressRef.current = next;
            
            timeoutId = setTimeout(runSimulationStep, speedConfig.DELAY);
            return next;
        });
    };
    runSimulationStep();
    return () => clearTimeout(timeoutId);
  }, [scoreTimeline, finalHomeScore, finalAwayScore]); 

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
    }, 200); 

    const msgTimer = setInterval(() => {
        if (isFinishedRef.current) {
            setCurrentMessage("경기 종료 - 결과 집계 중...");
            return;
        }
        
        // [Fix] If Buzzer Beater triggered, lock the message pool
        if (isBuzzerBeaterActive) {
             const buzzerMsgs = GAME_SIMULATION_MESSAGES.BUZZER_BEATER;
             const nextMsg = buzzerMsgs[Math.floor(Math.random() * buzzerMsgs.length)];
             setCurrentMessage(nextMsg);
             return; 
        }

        const currentProgress = progressRef.current;
        const approxIdx = Math.floor((currentProgress / 100) * (scoreTimeline.length - 1));
        const currentScore = scoreTimeline[approxIdx] || { h: 0, a: 0 };
        const scoreDiff = Math.abs(currentScore.h - currentScore.a);
        
        let targetPool = GAME_SIMULATION_MESSAGES.GENERAL;
        
        if (currentProgress > 60 && scoreDiff >= 20) targetPool = GAME_SIMULATION_MESSAGES.GARBAGE;
        else if (currentProgress > 94 && scoreDiff <= 3) targetPool = GAME_SIMULATION_MESSAGES.SUPER_CLUTCH;
        else if (currentProgress > 85 && scoreDiff <= 10) targetPool = GAME_SIMULATION_MESSAGES.CLUTCH;

        setCurrentMessage(prev => {
            if (targetPool.length <= 1) return targetPool[0];
            let next;
            do { next = targetPool[Math.floor(Math.random() * targetPool.length)]; } while (next === prev);
            return next;
        });
    }, 2000); 

    return () => {
        clearInterval(shotTimer);
        clearInterval(msgTimer);
    };
  }, [scoreTimeline, isBuzzerBeaterActive]); 

  if (!homeTeam || !awayTeam) return null;

  const homeData = TEAM_DATA[homeTeam.id];
  const awayData = TEAM_DATA[awayTeam.id];

  const homeColor = homeData ? homeData.colors.primary : '#ffffff';
  const awayColor = awayData ? awayData.colors.primary : '#94a3b8';

  const scoreDiff = Math.abs(displayScore.h - displayScore.a);
  const isGarbage = progress > 60 && scoreDiff >= 20;
  const isSuperClutch = progress > 94 && scoreDiff <= 3;
  const isClutch = progress > 85 && scoreDiff <= 10;
  
  const isBuzzerBeaterMessage = GAME_SIMULATION_MESSAGES.BUZZER_BEATER.includes(currentMessage);

  // Dynamic Message Classes
  let messageClass = "text-indigo-300";
  if (isGarbage) {
      messageClass = "text-slate-500 font-medium";
  } else if (isBuzzerBeaterActive && isBuzzerBeaterMessage) {
      messageClass = "text-red-500 font-black text-2xl animate-buzzer-beater scale-[1.35] drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]";
  } else if (isSuperClutch || (isBuzzerBeaterActive && !isBuzzerBeaterMessage)) {
      messageClass = "text-red-500 font-black text-2xl animate-shake-intense drop-shadow-[0_0_15px_rgba(239,68,68,0.9)] scale-125";
  } else if (isClutch) {
      messageClass = "text-orange-400 font-black text-xl animate-pulse-fast drop-shadow-[0_0_8px_rgba(249,115,22,0.6)] scale-110";
  }

  return (
    <div className="fixed inset-0 bg-slate-950 z-[110] flex flex-col items-center justify-center p-4 overflow-hidden">
      <style>{`
        @keyframes shake-intense {
            0% { transform: translate(1px, 1px) rotate(0deg); }
            10% { transform: translate(-1px, -2px) rotate(-1deg); }
            20% { transform: translate(-3px, 0px) rotate(1deg); }
            30% { transform: translate(3px, 2px) rotate(0deg); }
            40% { transform: translate(1px, -1px) rotate(1deg); }
            50% { transform: translate(-1px, 2px) rotate(-1deg); }
            60% { transform: translate(-3px, 1px) rotate(0deg); }
            70% { transform: translate(3px, 1px) rotate(-1deg); }
            80% { transform: translate(-1px, -1px) rotate(1deg); }
            90% { transform: translate(1px, 2px) rotate(0deg); }
            100% { transform: translate(1px, -2px) rotate(-1deg); }
        }
        .animate-shake-intense {
            animation: shake-intense 0.5s infinite;
        }
        @keyframes pulse-fast {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.8; }
        }
        .animate-pulse-fast {
            animation: pulse-fast 1s infinite;
        }
        @keyframes flash-text {
            0%, 100% { color: #ef4444; text-shadow: 0 0 10px #ef4444; } /* Red */
            50% { color: #ffffff; text-shadow: 0 0 20px #ffffff; } /* White */
        }
        .animate-buzzer-beater {
            animation: shake-intense 0.5s infinite, flash-text 0.15s infinite;
        }
      `}</style>
      <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-[150px]"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-[150px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
        {/* Main Header with Away (Left) vs Home (Right) Layout */}
        <div className="flex items-center justify-between px-6 py-6 md:px-10 bg-slate-950/30">
            {/* Left: Away Team */}
            <div className="flex flex-col items-center gap-3 w-32 md:w-40">
                <img src={awayTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl animate-in zoom-in duration-500" alt="" />
                <div className="text-center w-full">
                    <div className="text-lg md:text-xl font-black text-white oswald uppercase tracking-tight text-shadow-lg truncate w-full">{awayTeam.name}</div>
                    <div className="text-4xl md:text-5xl font-black text-slate-200 oswald tabular-nums mt-1 drop-shadow-xl">{displayScore.a}</div>
                </div>
            </div>

            {/* Center: Graph & Message */}
            <div className="flex-1 px-2 flex flex-col items-center justify-center">
                 <div className={`text-sm md:text-base font-black text-center min-h-[3rem] flex items-center justify-center break-keep leading-tight transition-all duration-300 ${messageClass}`}>
                    {currentMessage}
                 </div>

                 {/* Score Graph Component */}
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

            {/* Right: Home Team */}
            <div className="flex flex-col items-center gap-3 w-32 md:w-40">
                <img src={homeTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl animate-in zoom-in duration-500" alt="" />
                <div className="text-center w-full">
                    <div className="text-lg md:text-xl font-black text-white oswald uppercase tracking-tight text-shadow-lg truncate w-full">{homeTeam.name}</div>
                    <div className="text-4xl md:text-5xl font-black text-slate-200 oswald tabular-nums mt-1 drop-shadow-xl">{displayScore.h}</div>
                </div>
            </div>
        </div>

        {/* Court Visualization */}
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

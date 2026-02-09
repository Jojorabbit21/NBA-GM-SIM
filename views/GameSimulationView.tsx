
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Team } from '../types';
import { GAME_SIMULATION_MESSAGES } from '../data/uiConstants';
import { generateRealisticGameFlow, SIMULATION_SPEED } from '../utils/simulationMath';

// New Sub-components
import { LiveScoreboard } from '../components/simulation/LiveScoreboard';
import { SimulationCourt } from '../components/simulation/SimulationCourt';

export const GameSimulatingView: React.FC<{ 
  homeTeam: Team, 
  awayTeam: Team, 
  userTeamId?: string | null,
  finalHomeScore?: number,
  finalAwayScore?: number,
  onSimulationComplete?: () => void
}> = ({ homeTeam, awayTeam, userTeamId, finalHomeScore = 110, finalAwayScore = 105, onSimulationComplete }) => {
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState(GAME_SIMULATION_MESSAGES.GENERAL[0]);
  const [isBuzzerBeaterActive, setIsBuzzerBeaterActive] = useState(false);
  const [displayScore, setDisplayScore] = useState({ h: 0, a: 0 });
  
  const isFinishedRef = useRef(false);
  const progressRef = useRef(0);
  const onCompleteRef = useRef(onSimulationComplete);
  const isBuzzerBeaterTriggeredRef = useRef(false);
  
  useEffect(() => {
      onCompleteRef.current = onSimulationComplete;
  }, [onSimulationComplete]);
  
  // 1. Generate Game Flow (Logic Extracted)
  const scoreTimeline = useMemo(() => 
      generateRealisticGameFlow(finalHomeScore, finalAwayScore), 
  [finalHomeScore, finalAwayScore]);

  // 2. Simulation Loop (Orchestrator)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const runSimulationStep = () => {
        setProgress(prev => {
            // Game Finished
            if (prev >= 100) {
                progressRef.current = 100;
                return 100;
            }

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
            
            // Buzzer Beater Trigger Logic
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
                 if (Math.random() < 0.30) {
                     isBuzzerBeaterTriggeredRef.current = true;
                     setIsBuzzerBeaterActive(true);
                     
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

  // 3. Sync Display Score
  useEffect(() => {
      if (scoreTimeline.length === 0) return;
      const percent = progress / 100;
      const index = Math.floor(percent * (scoreTimeline.length - 1));
      setDisplayScore(scoreTimeline[index]);
  }, [progress, scoreTimeline]);

  // 4. Check Finish
  useEffect(() => {
      if (progress >= 100 && !isFinishedRef.current) {
          isFinishedRef.current = true;
          setDisplayScore({ h: finalHomeScore, a: finalAwayScore });
          setTimeout(() => {
              if (onCompleteRef.current) onCompleteRef.current();
          }, 2000);
      }
  }, [progress, finalHomeScore, finalAwayScore]);

  // 5. Message Rotator
  useEffect(() => {
    const msgTimer = setInterval(() => {
        if (isFinishedRef.current) {
            setCurrentMessage("경기 종료 - 결과 집계 중...");
            return;
        }
        
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

    return () => clearInterval(msgTimer);
  }, [scoreTimeline, isBuzzerBeaterActive]); 

  if (!homeTeam || !awayTeam) return null;

  // Visual State Calculation for Props
  const scoreDiff = Math.abs(displayScore.h - displayScore.a);
  const isGarbage = progress > 60 && scoreDiff >= 20;
  const isSuperClutch = progress > 94 && scoreDiff <= 3;
  const isClutch = progress > 85 && scoreDiff <= 10;
  const isBuzzerBeaterMessage = GAME_SIMULATION_MESSAGES.BUZZER_BEATER.includes(currentMessage);

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
      <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-[150px]"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-[150px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
          
        <LiveScoreboard 
            homeTeam={homeTeam} 
            awayTeam={awayTeam} 
            displayScore={displayScore} 
            currentMessage={currentMessage} 
            messageClass={messageClass} 
            scoreTimeline={scoreTimeline} 
            progress={progress} 
        />

        <SimulationCourt isFinished={isFinishedRef.current} />
        
      </div>
    </div>
  );
};

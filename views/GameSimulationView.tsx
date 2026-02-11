
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Team, PbpLog, ShotEvent } from '../types';
import { calculateWinProbability, calculatePerMinuteStats, WPSnapshot } from '../utils/simulationMath';
import { GAME_OVER_MESSAGES } from '../data/uiConstants';
import { TEAM_DATA } from '../data/teamData';

// New Sub-components
import { LiveScoreboard } from '../components/simulation/LiveScoreboard';
import { SimulationCourt } from '../components/simulation/SimulationCourt';

// Timeline Item Structure
interface TimelineItem {
    h: number; // Home Score
    a: number; // Away Score
    q: number; // Quarter
    t: string; // Time Remaining String (e.g. "11:45")
    wp: number; // Win Probability (0-100)
    text: string; // Log Text
    isHighlight: boolean; // (Legacy flag, kept for structure consistency)
    elapsedMinutes: number; // For graph syncing
    totalSecondsPassed: number; // For shot chart syncing
}

export const GameSimulatingView: React.FC<{ 
  homeTeam: Team, 
  awayTeam: Team, 
  userTeamId?: string | null,
  pbpLogs: PbpLog[],
  pbpShotEvents?: ShotEvent[], // [New]
  onSimulationComplete?: () => void
}> = ({ homeTeam, awayTeam, userTeamId, pbpLogs, pbpShotEvents = [], onSimulationComplete }) => {
  // State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);
  
  // Refs for loop control
  const indexRef = useRef(0);
  const onCompleteRef = useRef(onSimulationComplete);
  
  useEffect(() => {
      onCompleteRef.current = onSimulationComplete;
  }, [onSimulationComplete]);
  
  // 1. Pre-calculate Minute-by-Minute WP Data for the Graph (Fixed 48 columns)
  const minuteGraphData = useMemo(() => {
      return calculatePerMinuteStats(pbpLogs, homeTeam.id);
  }, [pbpLogs, homeTeam.id]);

  // 2. [CORE UPDATE] Event-Driven Timeline Generation
  // Instead of mapping every log, we filter ONLY important events and inject Period markers.
  const timeline = useMemo(() => {
      const items: TimelineItem[] = [];
      let currentH = 0;
      let currentA = 0;
      
      // Initial State
      items.push({ h: 0, a: 0, q: 1, t: "12:00", wp: 50, text: "경기 시작 (TIP-OFF)", isHighlight: true, elapsedMinutes: 0, totalSecondsPassed: 0 });

      pbpLogs.forEach((log, index) => {
          // A. Always track score accumulation invisibly
          if (log.type === 'score' || log.type === 'freethrow') {
             const points = log.points ?? 0;
             if (log.teamId === homeTeam.id) currentH += points;
             else currentA += points;
          }

          // B. Determine if this log is "Show-worthy"
          const isScoreEvent = (log.type === 'score' || log.type === 'freethrow');
          const hasPoints = (log.points ?? 0) > 0;
          
          const isUrgent = log.type === 'info' && (
              log.text.includes('부상') || 
              log.text.includes('퇴장') || 
              log.text.includes('6반칙') || 
              log.text.includes('버저비터')
          );
          
          const isPeriodEnd = log.timeRemaining === '0:00';
          const isLast = index === pbpLogs.length - 1; 

          // Only push to timeline if it's a key event
          if ((isScoreEvent && hasPoints) || isUrgent || isPeriodEnd || isLast) {
              const [mm, ss] = log.timeRemaining.split(':').map(Number);
              const secondsRemainingInQ = mm * 60 + ss;
              const totalSecondsPassed = ((log.quarter - 1) * 720) + (720 - secondsRemainingInQ);
              const elapsedMinutes = totalSecondsPassed / 60;
              
              const wp = calculateWinProbability(currentH, currentA, elapsedMinutes);

              let displayText = log.text;
              if (isPeriodEnd) {
                  if (log.quarter === 1) displayText = "1쿼터 종료";
                  else if (log.quarter === 2) displayText = "하프 타임 (HALF TIME)";
                  else if (log.quarter === 3) displayText = "3쿼터 종료";
              }

              items.push({
                  h: currentH,
                  a: currentA,
                  q: log.quarter,
                  t: log.timeRemaining,
                  wp: wp,
                  text: displayText,
                  isHighlight: true,
                  elapsedMinutes: elapsedMinutes,
                  totalSecondsPassed: totalSecondsPassed
              });
          }
      });
      
      const lastItem = items[items.length - 1];
      if (lastItem && lastItem.t !== "00:00" && lastItem.text.includes("종료") === false) {
           lastItem.elapsedMinutes = 48;
           lastItem.totalSecondsPassed = 48 * 60;
           lastItem.t = "00:00";
      }
      
      return items;
  }, [pbpLogs, homeTeam.id]);

  // Helper to pick random message
  const getGameOverMessage = (h: number, a: number, isBuzzerBeater: boolean) => {
      const diff = Math.abs(h - a);
      let pool = GAME_OVER_MESSAGES.NORMAL;

      if (isBuzzerBeater) pool = GAME_OVER_MESSAGES.BUZZER_BEATER;
      else if (diff >= 20) pool = GAME_OVER_MESSAGES.BLOWOUT;
      else if (diff <= 5) pool = GAME_OVER_MESSAGES.CLOSE_GAME;

      return pool[Math.floor(Math.random() * pool.length)];
  };

  // 3. Animation Loop
  useEffect(() => {
      indexRef.current = 0;
      setCurrentIndex(0);
      setFinalMessage(null);

      let timeoutId: ReturnType<typeof setTimeout>;
      let isUnmounted = false;

      const runLoop = () => {
          if (isUnmounted) return;

          const idx = indexRef.current;
          
          if (idx >= timeline.length) {
              const finalState = timeline[timeline.length - 1];
              const isBuzzerBeater = finalState.text.includes("버저비터");
              const gameOverText = getGameOverMessage(finalState.h, finalState.a, isBuzzerBeater);
              setFinalMessage(gameOverText);
              
              setTimeout(() => {
                  if (!isUnmounted && onCompleteRef.current) onCompleteRef.current();
              }, 3000);
              return;
          }

          const currentItem = timeline[idx];
          let delay = 1000; 

          if (currentItem) {
              if (currentItem.text.includes("종료") || currentItem.text.includes("하프 타임") || currentItem.text.includes("경기 시작")) {
                  delay = 1200;
              } else {
                  const scoreDiff = Math.abs(currentItem.h - currentItem.a);
                  if (currentItem.q === 4) {
                      if (scoreDiff <= 5 && parseInt(currentItem.t.split(':')[0]) < 2) {
                          delay = 1500; 
                      } else if (scoreDiff > 20) {
                          delay = 200; 
                      }
                  } else if (scoreDiff > 25) {
                       delay = 300; 
                  }
              }
          }

          setCurrentIndex(idx);
          indexRef.current = idx + 1;
          
          timeoutId = setTimeout(runLoop, delay);
      };

      runLoop();

      return () => {
          isUnmounted = true;
          clearTimeout(timeoutId);
      };
  }, [timeline]);


  if (!homeTeam || !awayTeam || timeline.length === 0) return null;

  const currentData = timeline[currentIndex] || timeline[timeline.length - 1];
  
  // Calculate Visible Shots based on time
  const visibleShots = useMemo(() => {
      return pbpShotEvents.filter(shot => {
          // Calculate shot's total seconds elapsed
          const shotSecondsRemaining = shot.gameClock; // e.g. 715
          const shotTotalElapsed = ((shot.quarter - 1) * 720) + (720 - shotSecondsRemaining);
          return shotTotalElapsed <= currentData.totalSecondsPassed;
      });
  }, [pbpShotEvents, currentData.totalSecondsPassed]);

  const currentMinuteIndex = Math.floor(currentData.elapsedMinutes);
  const visibleGraphData = minuteGraphData.slice(0, currentMinuteIndex + 1);
  const progress = (currentMinuteIndex / 48) * 100;
  
  const homeColor = TEAM_DATA[homeTeam.id]?.colors.primary || '#ffffff';
  const awayColor = TEAM_DATA[awayTeam.id]?.colors.primary || '#94a3b8';

  // Visual Effects
  const scoreDiff = Math.abs(currentData.h - currentData.a);
  const [mStr, sStr] = currentData.t.split(':');
  const secondsRemaining = parseInt(mStr) * 60 + parseInt(sStr);
  const is4Q = currentData.q === 4;

  let messageClass = "text-indigo-300"; 
  if (currentData.text.includes("버저비터") || currentData.text.includes("GAME WINNER")) {
       messageClass = "text-red-500 font-black text-2xl animate-buzzer-beater drop-shadow-[0_0_10px_rgba(255,255,255,1)]";
  } else if (currentData.text.includes("종료") || currentData.text.includes("하프 타임")) {
       messageClass = "text-amber-400 font-black text-xl animate-pulse";
  } else if (is4Q && scoreDiff <= 3 && secondsRemaining < 24) {
       messageClass = "text-red-500 font-black text-xl animate-shake-intense";
  } else if (is4Q && scoreDiff <= 5 && secondsRemaining < 120) {
       messageClass = "text-orange-400 font-bold text-lg animate-shake-gentle";
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
            displayScore={{ h: currentData.h, a: currentData.a }} 
            currentMessage={currentData.text} 
            messageClass={messageClass} 
            scoreTimeline={visibleGraphData} 
            progress={progress} 
            quarter={currentData.q} 
            timeRemaining={currentData.t}
            finalMessage={finalMessage} 
        />

        <SimulationCourt 
            shots={visibleShots} 
            homeTeamId={homeTeam.id}
            awayTeamId={awayTeam.id}
            homeColor={homeColor}
            awayColor={awayColor}
        />
        
      </div>
    </div>
  );
};

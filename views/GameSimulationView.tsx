
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Team, PbpLog } from '../types';
import { calculateWinProbability, calculatePerMinuteStats, WPSnapshot } from '../utils/simulationMath';
import { GAME_OVER_MESSAGES } from '../data/uiConstants';

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
}

export const GameSimulatingView: React.FC<{ 
  homeTeam: Team, 
  awayTeam: Team, 
  userTeamId?: string | null,
  pbpLogs: PbpLog[],
  onSimulationComplete?: () => void
}> = ({ homeTeam, awayTeam, userTeamId, pbpLogs, onSimulationComplete }) => {
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
      items.push({ h: 0, a: 0, q: 1, t: "12:00", wp: 50, text: "경기 시작 (TIP-OFF)", isHighlight: true, elapsedMinutes: 0 });

      pbpLogs.forEach((log, index) => {
          // A. Always track score accumulation invisibly
          if (log.type === 'score' || log.type === 'freethrow') {
             let points = 0;
             if (log.type === 'score') points = (log.text.includes('3점') ? 3 : 2);
             if (log.type === 'freethrow') points = 1;
             if (log.points) points = log.points;
             else if (log.text.includes('앤드원 성공')) points = 1;

             if (log.teamId === homeTeam.id) currentH += points;
             else currentA += points;
          }

          // B. Determine if this log is "Show-worthy"
          const isScore = log.type === 'score' || log.type === 'freethrow';
          const isUrgent = log.type === 'info' && (
              log.text.includes('부상') || 
              log.text.includes('퇴장') || 
              log.text.includes('6반칙') || 
              log.text.includes('버저비터')
          );
          
          // Check for Quarter End explicitly (0:00 time remaining)
          const isPeriodEnd = log.timeRemaining === '0:00';
          const isLast = index === pbpLogs.length - 1; // Always show final log

          // Only push to timeline if it's a key event
          if (isScore || isUrgent || isPeriodEnd || isLast) {
              // Parse Time to Seconds for WP Calculation & Graph Sync
              const [mm, ss] = log.timeRemaining.split(':').map(Number);
              const secondsRemainingInQ = mm * 60 + ss;
              const totalSecondsPassed = ((log.quarter - 1) * 720) + (720 - secondsRemainingInQ);
              const elapsedMinutes = totalSecondsPassed / 60;
              
              const wp = calculateWinProbability(currentH, currentA, elapsedMinutes);

              // Use custom text for Period Ends
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
                  elapsedMinutes: elapsedMinutes
              });
          }
      });
      
      // Ensure final state matches exactly 00:00 if not present
      const lastItem = items[items.length - 1];
      if (lastItem && lastItem.t !== "00:00" && lastItem.text.includes("종료") === false) {
           // If the last log wasn't 00:00, ensure graph fills up
           lastItem.elapsedMinutes = 48;
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

  // 3. Animation Loop (Adjusted for Event-Driven Pacing)
  useEffect(() => {
      indexRef.current = 0;
      setCurrentIndex(0);
      setFinalMessage(null);

      let timeoutId: ReturnType<typeof setTimeout>;
      let isUnmounted = false;

      const runLoop = () => {
          if (isUnmounted) return;

          const idx = indexRef.current;
          
          // Finish Condition
          if (idx >= timeline.length) {
              // Game Over Logic
              const finalState = timeline[timeline.length - 1];
              const isBuzzerBeater = finalState.text.includes("버저비터");
              
              const gameOverText = getGameOverMessage(finalState.h, finalState.a, isBuzzerBeater);
              setFinalMessage(gameOverText);
              
              // Wait 3 seconds to show Game Over message, then exit
              setTimeout(() => {
                  if (!isUnmounted && onCompleteRef.current) onCompleteRef.current();
              }, 3000);
              return;
          }

          const currentItem = timeline[idx];
          
          // Determine Speed based on Context
          let delay = 1000; // Default: 1.0s per event (Readable speed)

          if (currentItem) {
              // Longer delay for Period Ends & Start
              if (currentItem.text.includes("종료") || currentItem.text.includes("하프 타임") || currentItem.text.includes("경기 시작")) {
                  delay = 1200;
              } else {
                  const scoreDiff = Math.abs(currentItem.h - currentItem.a);
                  
                  if (currentItem.q === 4) {
                      if (scoreDiff <= 5 && parseInt(currentItem.t.split(':')[0]) < 2) {
                          delay = 1500; // Super Clutch: 1.5s (Build tension)
                      } else if (scoreDiff > 20) {
                          delay = 200; // Garbage Time: 0.2s (Skip fast)
                      }
                  } else if (scoreDiff > 25) {
                       delay = 300; // Blowout early: Fast
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
  
  // Calculate Graph Data
  const currentMinuteIndex = Math.floor(currentData.elapsedMinutes);
  const visibleGraphData = minuteGraphData.slice(0, currentMinuteIndex + 1);

  const progress = (currentMinuteIndex / 48) * 100;
  
  // --- Visual Effects Calculation ---
  const scoreDiff = Math.abs(currentData.h - currentData.a);
  const [mStr, sStr] = currentData.t.split(':');
  const secondsRemaining = parseInt(mStr) * 60 + parseInt(sStr);
  const is4Q = currentData.q === 4;

  let messageClass = "text-indigo-300"; // Default

  // 1. Buzzer Beater (Extreme)
  if (currentData.text.includes("버저비터") || currentData.text.includes("GAME WINNER")) {
       messageClass = "text-red-500 font-black text-2xl animate-buzzer-beater drop-shadow-[0_0_10px_rgba(255,255,255,1)]";
  } 
  // 2. Period Ends (Important Info)
  else if (currentData.text.includes("종료") || currentData.text.includes("하프 타임")) {
       messageClass = "text-amber-400 font-black text-xl animate-pulse";
  }
  // 3. Super Clutch (4Q, < 24s, Diff <= 3) -> Intense Shake
  else if (is4Q && scoreDiff <= 3 && secondsRemaining < 24) {
       messageClass = "text-red-500 font-black text-xl animate-shake-intense";
  } 
  // 4. Clutch (4Q, < 2m, Diff <= 5) -> Gentle Shake
  else if (is4Q && scoreDiff <= 5 && secondsRemaining < 120) {
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

        <SimulationCourt isFinished={currentIndex >= timeline.length - 1} />
        
      </div>
    </div>
  );
};

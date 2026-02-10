
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
    isHighlight: boolean; // [Changed] Used for delay control
    elapsedMinutes: number; // [New] For graph syncing
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

  // 2. Convert PBP Logs to Animation Timeline
  const timeline = useMemo(() => {
      const items: TimelineItem[] = [];
      let currentH = 0;
      let currentA = 0;

      // Start with 0-0
      items.push({ h: 0, a: 0, q: 1, t: "12:00", wp: 50, text: "TIP-OFF", isHighlight: true, elapsedMinutes: 0 });

      pbpLogs.forEach(log => {
          // Parse Score if event is a score
          if (log.type === 'score' || log.type === 'freethrow') {
             let points = 0;
             if (log.type === 'score') points = (log.text.includes('3점') ? 3 : 2);
             if (log.type === 'freethrow') points = 1;
             
             if (log.points) points = log.points;
             else if (log.text.includes('앤드원 성공')) points = 1;

             if (log.teamId === homeTeam.id) currentH += points;
             else currentA += points;
          }

          // Parse Time to Seconds for WP Calculation & Graph Sync
          const [mm, ss] = log.timeRemaining.split(':').map(Number);
          const secondsRemainingInQ = mm * 60 + ss;
          const totalSecondsPassed = ((log.quarter - 1) * 720) + (720 - secondsRemainingInQ);
          const elapsedMinutes = totalSecondsPassed / 60;
          
          const wp = calculateWinProbability(currentH, currentA, elapsedMinutes);

          // [Filter Logic]
          // Display only: Score, FreeThrow, Injury, Ejection
          const isScore = log.type === 'score' || log.type === 'freethrow';
          const isUrgent = log.type === 'info' && (log.text.includes('부상') || log.text.includes('퇴장') || log.text.includes('버저비터')); // buzzer beater is usually score type but checking just in case
          
          const shouldShow = isScore || isUrgent;
          const displayText = shouldShow ? log.text : "";

          items.push({
              h: currentH,
              a: currentA,
              q: log.quarter,
              t: log.timeRemaining,
              wp: wp,
              text: displayText,
              isHighlight: shouldShow, // Slow down for these events
              elapsedMinutes: elapsedMinutes
          });
      });
      
      // Ensure final state matches exactly
      if (items.length > 0) {
          const last = items[items.length - 1];
          last.t = "00:00";
          last.elapsedMinutes = 48;
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
          
          // Finish Condition
          if (idx >= timeline.length - 1) {
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
          // Determine Speed
          let delay = 60; // Base speed (Slightly faster for skipped events)

          if (currentItem) {
              const scoreDiff = Math.abs(currentItem.h - currentItem.a);

              // Slow down for highlighted events (Scores, Injuries, etc.)
              if (currentItem.isHighlight) delay = 400; // Slower to read

              // Clutch Logic Speed Adjustment
              if (currentItem.q === 4) {
                  if (scoreDiff <= 5 && parseInt(currentItem.t.split(':')[0]) < 2) {
                      delay = Math.max(delay, 800); // Super Clutch
                  } else if (scoreDiff <= 10) {
                      delay = Math.max(delay, 400);
                  } else {
                      // Garbage time or blowout
                      if (!currentItem.isHighlight) delay = 30; 
                  }
              } else {
                // Early game non-highlights fast forward
                if (!currentItem.isHighlight) delay = 40; 
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

  const currentData = timeline[currentIndex];
  if (!currentData) return null; 
  
  // Calculate Graph Data
  const currentMinuteIndex = Math.floor(currentData.elapsedMinutes);
  const visibleGraphData = minuteGraphData.slice(0, currentMinuteIndex + 1);

  const progress = (currentMinuteIndex / 48) * 100;
  
  // --- Visual Effects Calculation (Restored) ---
  const scoreDiff = Math.abs(currentData.h - currentData.a);
  const [mStr, sStr] = currentData.t.split(':');
  const secondsRemaining = parseInt(mStr) * 60 + parseInt(sStr);
  const is4Q = currentData.q === 4;

  let messageClass = "text-indigo-300"; // Default

  // 1. Buzzer Beater (Extreme)
  if (currentData.text.includes("버저비터") || currentData.text.includes("GAME WINNER")) {
       messageClass = "text-red-500 font-black text-2xl animate-buzzer-beater drop-shadow-[0_0_10px_rgba(255,255,255,1)]";
  } 
  // 2. Super Clutch (4Q, < 24s, Diff <= 3) -> Intense Shake
  else if (is4Q && scoreDiff <= 3 && secondsRemaining < 24) {
       messageClass = "text-red-500 font-black text-xl animate-shake-intense";
  } 
  // 3. Clutch (4Q, < 2m, Diff <= 5) -> Gentle Shake
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

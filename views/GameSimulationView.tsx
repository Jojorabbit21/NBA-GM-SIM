
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Team, PbpLog } from '../types';
import { calculateWinProbability, calculatePerMinuteStats, WPSnapshot } from '../utils/simulationMath';

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
    isScore: boolean;
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
  const [isBuzzerBeaterActive, setIsBuzzerBeaterActive] = useState(false);
  
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
      items.push({ h: 0, a: 0, q: 1, t: "12:00", wp: 50, text: "TIP-OFF", isScore: false, elapsedMinutes: 0 });

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

          items.push({
              h: currentH,
              a: currentA,
              q: log.quarter,
              t: log.timeRemaining,
              wp: wp,
              text: log.text,
              isScore: log.type === 'score',
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

  // 3. Animation Loop
  useEffect(() => {
      indexRef.current = 0;
      setCurrentIndex(0);
      setIsBuzzerBeaterActive(false);

      let timeoutId: ReturnType<typeof setTimeout>;
      let isUnmounted = false;

      const runLoop = () => {
          if (isUnmounted) return;

          const idx = indexRef.current;
          
          // Finish Condition
          if (idx >= timeline.length - 1) {
              setTimeout(() => {
                  if (!isUnmounted && onCompleteRef.current) onCompleteRef.current();
              }, 1500);
              return;
          }

          const currentItem = timeline[idx];
          // Determine Speed
          let delay = 80; // Base speed

          if (currentItem) {
              const scoreDiff = Math.abs(currentItem.h - currentItem.a);

              // Slow down for scores
              if (currentItem.isScore) delay = 200;

              // Clutch Logic
              if (currentItem.q === 4) {
                  if (scoreDiff <= 5 && parseInt(currentItem.t.split(':')[0]) < 2) {
                      delay = 800; // Super Clutch
                      if (idx % 2 === 0) setIsBuzzerBeaterActive(true);
                  } else if (scoreDiff <= 10) {
                      delay = 400;
                      setIsBuzzerBeaterActive(false);
                  } else {
                      delay = 40; // Garbage time
                      setIsBuzzerBeaterActive(false);
                  }
              } else {
                delay = 50; // Early game
                setIsBuzzerBeaterActive(false);
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
  // Instead of passing the raw event history, we pass the 1-minute snapshots up to the current time.
  // This creates a stable graph that fills from left to right.
  const currentMinuteIndex = Math.floor(currentData.elapsedMinutes);
  const visibleGraphData = minuteGraphData.slice(0, currentMinuteIndex + 1);

  // Calculate Graph Progress (Fixed to 48 minutes)
  // This isn't strictly used for the x-axis plotting in the new fixed-width logic, but helpful for debugging
  const progress = (currentMinuteIndex / 48) * 100;
  
  // Visual Effects
  const scoreDiff = Math.abs(currentData.h - currentData.a);
  const isSuperClutch = currentData.q === 4 && scoreDiff <= 3 && parseInt(currentData.t.split(':')[0]) < 1;
  
  let messageClass = "text-indigo-300";
  if (isSuperClutch) {
      messageClass = "text-red-500 font-black text-xl animate-pulse";
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
        />

        <SimulationCourt isFinished={currentIndex >= timeline.length - 1} />
        
      </div>
    </div>
  );
};

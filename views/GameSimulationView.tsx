
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Team, PbpLog } from '../types';
import { calculateWinProbability } from '../utils/simulationMath';

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
  
  // 1. Convert PBP Logs to Animation Timeline
  // This ensures the animation strictly follows what the engine simulated.
  const timeline = useMemo(() => {
      const items: TimelineItem[] = [];
      let currentH = 0;
      let currentA = 0;

      // Start with 0-0
      items.push({ h: 0, a: 0, q: 1, t: "12:00", wp: 50, text: "TIP-OFF", isScore: false });

      pbpLogs.forEach(log => {
          // Parse Score if event is a score
          if (log.type === 'score' || log.type === 'freethrow') {
             // For display, we accumulate score. 
             // Note: In engine, log might not contain running score, so we accum manually.
             let points = 0;
             if (log.type === 'score') points = (log.text.includes('3점') ? 3 : 2);
             if (log.type === 'freethrow') points = 1; // Simplify FTs to 1pt events or chunks for visual flow
             
             // Check if log has specific points info
             if (log.points) points = log.points;
             else if (log.text.includes('앤드원 성공')) points = 1;

             if (log.teamId === homeTeam.id) currentH += points;
             else currentA += points;
          }

          // Parse Time to Seconds for WP Calculation
          const [mm, ss] = log.timeRemaining.split(':').map(Number);
          const secondsRemainingInQ = mm * 60 + ss;
          const totalSecondsPassed = ((log.quarter - 1) * 720) + (720 - secondsRemainingInQ);
          
          const wp = calculateWinProbability(currentH, currentA, totalSecondsPassed / 60);

          items.push({
              h: currentH,
              a: currentA,
              q: log.quarter,
              t: log.timeRemaining,
              wp: wp,
              text: log.text,
              isScore: log.type === 'score'
          });
      });
      
      // Ensure final state matches exactly
      if (items.length > 0) {
          const last = items[items.length - 1];
          last.t = "00:00"; // Force clock to 0 at end
      }
      
      return items;
  }, [pbpLogs, homeTeam.id]);

  // 2. Animation Loop
  useEffect(() => {
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
          const nextItem = timeline[idx + 1];
          const scoreDiff = Math.abs(currentItem.h - currentItem.a);

          // Determine Speed
          let delay = 80; // Base speed (Fast)

          // Slow down for scores to let user see
          if (currentItem.isScore) delay = 200;

          // Clutch Logic: 4th Quarter, Close Game -> Slow down drama
          if (currentItem.q === 4) {
              if (scoreDiff <= 5 && parseInt(currentItem.t.split(':')[0]) < 2) {
                  // Super Clutch (Last 2 mins, 5 pts)
                  delay = 800; 
                  if (idx % 2 === 0) setIsBuzzerBeaterActive(true); // Visual effect
              } else if (scoreDiff <= 10) {
                  delay = 400;
                  setIsBuzzerBeaterActive(false);
              } else {
                  // Garbage time or blowout in 4th
                  delay = 40; 
                  setIsBuzzerBeaterActive(false);
              }
          } else {
             // Early game fast forward
             delay = 50; 
             setIsBuzzerBeaterActive(false);
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
  
  // Calculate Progress % for Graph
  // Total indices / current index
  const progress = (currentIndex / (timeline.length - 1)) * 100;
  
  // Convert full timeline to WP history format for Graph
  const wpHistory = timeline.slice(0, currentIndex + 1).map(t => ({ h: t.h, a: t.a, wp: t.wp }));

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
            scoreTimeline={wpHistory} 
            progress={progress} 
            quarter={currentData.q}
            timeRemaining={currentData.t}
        />

        <SimulationCourt isFinished={currentIndex >= timeline.length - 1} />
        
      </div>
    </div>
  );
};

import { GameState, LivePlayer, TeamState } from './pbpTypes';
import { GameTactics, DepthChart } from '../../../../types';

const MIN_STINT_SECONDS = 120; // 2 minutes lock
const HARD_FLOOR = 20; // Must sub out
const RED_ZONE_FLOOR = 35; // Should sub out if possible

export interface SubRequest {
    outPlayer: LivePlayer;
    inPlayer: LivePlayer;
    reason: string;
}

export function checkSubstitutions(state: GameState, team: TeamState): SubRequest[] {
    const { tactics } = team;
    const { minutesLimits, sliders } = tactics;
    const flexibility = sliders.rotationFlexibility ?? 5;
    
    // Mode determination
    const isStrict = flexibility <= 3;
    const isNormal = flexibility > 3 && flexibility <= 7;
    const isDeep = flexibility > 7;

    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isGarbage = state.quarter >= 4 && state.gameClock < 300 && scoreDiff > 20;
    const isClutch = state.quarter >= 4 && state.gameClock < 300 && scoreDiff <= 10;

    // Strict Mode Schedule (Simplified)
    const strictSched = {
        q1q3Out: 120, // Sub out starters with 2 mins left in Q1/Q3
        q2q4In: 600   // Sub in starters with 10 mins left in Q2/Q4
    };

    // Max burn allowed per stint (Condition drop)
    const maxBurn = 12 + (flexibility * 1.5); 

    const requests: SubRequest[] = [];
    const bench = team.bench.filter(p => p.health !== 'Injured' && !p.isShutdown && !p.needsDeepRecovery);

    // Helper to find best sub
    const findSub = (pos: string, excludeIds: string[]) => {
        // 1. Check Depth Chart
        if (team.depthChart) {
            const row = team.depthChart[pos as keyof DepthChart] || [];
            // row[0] is starter (usually on court), row[1] is bench, row[2] is third
            for (const id of row) {
                if (!id) continue;
                const candidate = bench.find(b => b.playerId === id && !excludeIds.includes(b.playerId));
                if (candidate) return candidate;
            }
        }
        
        // 2. Fallback: Best available matching position
        let candidates = bench.filter(b => b.position === pos && !excludeIds.includes(b.playerId));
        if (candidates.length === 0) {
            // 3. Fallback: Best available any position
            candidates = bench.filter(b => !excludeIds.includes(b.playerId));
        }
        
        return candidates.sort((a, b) => b.ovr - a.ovr)[0];
    };

    const currentOnCourtIds = team.onCourt.map(p => p.playerId);

    team.onCourt.forEach(p => {
        let shouldSub = false;
        let reason = '';
        
        const stintDuration = p.lastSubInTime - state.gameClock;
        // [FIX] Ignore lock at start of quarter (720 or 300) to allow immediate subs
        const isStintLocked = state.gameClock !== 720 && state.gameClock !== 300 && stintDuration < MIN_STINT_SECONDS;
        const energyConsumed = p.conditionAtSubIn - p.currentCondition;

        // --- Priority 1: Emergencies (Override Lock) ---
        if (p.health === 'Injured') { 
            shouldSub = true; reason = '부상'; 
        } else if (p.pf >= 6) { 
            shouldSub = true; reason = '퇴장'; 
        } else if (p.currentCondition <= HARD_FLOOR) { 
            shouldSub = true; reason = '탈진(Shutdown)';
            p.isShutdown = true; 
        } 
        
        // --- Priority 2: Voluntary Checks (Respect Lock) ---
        else if (!isStintLocked) {
             // Red Zone Recovery check
             if (p.currentCondition < RED_ZONE_FLOOR) {
                 shouldSub = true; reason = '체력 저하';
                 p.needsDeepRecovery = true;
             }
             // Garbage Time
             else if (isGarbage && p.isStarter) { shouldSub = true; reason = '가비지 타임'; }
            
             // Minutes Limit
             else if (minutesLimits[p.playerId] !== undefined && p.mp >= minutesLimits[p.playerId] + 0.5) {
                 shouldSub = true; reason = '시간 제한';
             }

             // [STRICT MODE] Scheduled Sub-Out
             else if (isStrict && p.isStarter && !isClutch) {
                if ((state.quarter === 1 || state.quarter === 3) && state.gameClock <= strictSched.q1q3Out) {
                    shouldSub = true; reason = `체력 안배(Q${state.quarter})`;
                }
                else if ((state.quarter === 2 || state.quarter === 4) && state.gameClock > strictSched.q2q4In) {
                    shouldSub = true; reason = `체력 안배(Bench Time)`;
                }
             }

             // [NORMAL MODE] Start of Quarter Forced Rest
             else if (isNormal && (state.gameClock === 720 || state.gameClock === 300) && p.isStarter) {
                const fatigueThreshold = 80; // If below 80 at start of quarter, consider resting if sub available
                if (p.currentCondition < fatigueThreshold) {
                    // Logic is complex here, simplified: if very tired at start of quarter
                    if (p.currentCondition < 60) {
                        shouldSub = true; reason = '체력 안배(Start Q)';
                    }
                }
             }

             // Stint Limit (Delta) - Only Non-Strict
             else if (!isClutch && !isStrict && energyConsumed >= maxBurn) {
                 shouldSub = true; reason = '로테이션(Stint)';
             }
        }
        
        if (shouldSub) {
            const sub = findSub(p.position, [...currentOnCourtIds, ...requests.map(r => r.inPlayer.playerId)]);
            if (sub) {
                requests.push({ outPlayer: p, inPlayer: sub, reason });
            }
        }
    });

    // Check for "Must Play" players on bench (Starters resting too long in non-garbage)
    if (!isGarbage) {
        bench.forEach(b => {
            if (b.isStarter && !b.isShutdown && !b.needsDeepRecovery && b.pf < 6 && b.health === 'Healthy') {
                const recoveryAmt = b.currentCondition - b.conditionAtSubIn; // It increases on bench
                
                // Strict Mode: Starters MUST be in during certain windows
                if (isStrict) {
                    if ((state.quarter === 1 || state.quarter === 3) && state.gameClock > strictSched.q1q3Out) {
                        // Should be in
                        // Find who is playing in their spot
                        // Simplified: Check if position is occupied by non-starter
                        const spotOccupier = team.onCourt.find(o => o.position === b.position && !o.isStarter);
                        if (spotOccupier && !requests.some(r => r.outPlayer === spotOccupier)) {
                             // Force sub in
                             requests.push({ outPlayer: spotOccupier, inPlayer: b, reason: '주전 투입' });
                        }
                    }
                    else if ((state.quarter === 2 || state.quarter === 4) && state.gameClock <= strictSched.q2q4In) {
                        // Should be in (Closing lineup / Start Q2/4 logic varies but generally starters close)
                        const spotOccupier = team.onCourt.find(o => o.position === b.position && !o.isStarter);
                        if (spotOccupier && !requests.some(r => r.outPlayer === spotOccupier)) {
                             requests.push({ outPlayer: spotOccupier, inPlayer: b, reason: '주전 투입(Closer)' });
                        }
                    }
                }
                // Normal Mode: Energy recovered enough?
                else if (b.currentCondition >= 90 || (b.currentCondition >= 80 && isClutch)) {
                     const spotOccupier = team.onCourt.find(o => o.position === b.position && !o.isStarter);
                     if (spotOccupier && !requests.some(r => r.outPlayer === spotOccupier)) {
                         // Check if occupier is tired
                         if (spotOccupier.conditionAtSubIn - spotOccupier.currentCondition > 5) {
                             requests.push({ outPlayer: spotOccupier, inPlayer: b, reason: '주전 복귀' });
                         }
                     }
                }
            }
        });
    }

    return requests;
}

export function executeSubstitutions(state: GameState, team: TeamState, requests: SubRequest[]) {
    requests.forEach(req => {
        const { outPlayer, inPlayer } = req;
        
        // Remove outPlayer from court
        const outIdx = team.onCourt.findIndex(p => p.playerId === outPlayer.playerId);
        if (outIdx === -1) return;
        team.onCourt.splice(outIdx, 1);
        
        // Add to bench
        team.bench.push(outPlayer);
        
        // Remove inPlayer from bench
        const inIdx = team.bench.findIndex(p => p.playerId === inPlayer.playerId);
        if (inIdx !== -1) team.bench.splice(inIdx, 1);
        
        // Add to court
        team.onCourt.push(inPlayer);
        
        // Update Rotation Logs
        // Close segment for outPlayer
        if (!state.rotationHistory[outPlayer.playerId]) state.rotationHistory[outPlayer.playerId] = [];
        
        // Absolute Time Calculation
        // Quarter duration logic (Q1-4: 720s, OT: 300s)
        const getQuarterStartAbs = (q: number) => (Math.min(q, 5) - 1) * 720 + Math.max(0, q - 5) * 300;
        const absStart = getQuarterStartAbs(state.quarter);
        
        // in/out in seconds from start of game
        // p.lastSubInTime is seconds REMAINING in quarter when they entered.
        // state.gameClock is seconds REMAINING now.
        // Quarter Length
        const qLen = state.quarter > 4 ? 300 : 720;
        
        const segInRelative = qLen - outPlayer.lastSubInTime;
        const segOutRelative = qLen - state.gameClock;
        
        const absoluteIn = absStart + segInRelative;
        const absoluteOut = absStart + segOutRelative;
        
        state.rotationHistory[outPlayer.playerId].push({ in: absoluteIn, out: absoluteOut });
        
        // Update Status for new player
        inPlayer.lastSubInTime = state.gameClock;
        inPlayer.conditionAtSubIn = inPlayer.currentCondition;
        
        // Log
        state.logs.push({
            quarter: state.quarter,
            timeRemaining: `${Math.floor(state.gameClock/60)}:${String(state.gameClock%60).padStart(2,'0')}`,
            teamId: team.id,
            text: `교체: ${outPlayer.playerName} out, ${inPlayer.playerName} in (${req.reason})`,
            type: 'info'
        });
    });
}
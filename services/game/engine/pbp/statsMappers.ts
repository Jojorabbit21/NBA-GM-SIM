
import { GameState, PossessionResult, LivePlayer } from './pbpTypes';
import { PbpLog } from '../../../../types';
import { formatTime } from './timeEngine';
import { resolveRebound } from './reboundLogic';

// Modularized Imports
import { generateCommentary, getReboundCommentary } from '../commentary/textGenerator';
import { updateZoneStats, updatePlusMinus } from './handlers/statUtils';
import { recordShotEvent } from './handlers/visUtils';

/**
 * Helper to add a log entry to the GameState
 */
function addLog(state: GameState, teamId: string, text: string, type: PbpLog['type'], points?: number) {
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: formatTime(state.gameClock),
        teamId,
        text,
        type,
        points: points as 1 | 2 | 3 | undefined
    });
}

/**
 * Applies the result of a possession to the player and team stats.
 * Also generates the PBP log entry.
 * Acts as the main orchestrator for Game Rule application (And-1, Bonus, Rebounds).
 */
export function applyPossessionResult(state: GameState, result: PossessionResult) {
    const { type, actor, defender, assister, rebounder, points, zone, isBlock, isSteal, offTeam, defTeam, isAndOne, playType } = result;
    const { isSwitch, isMismatch, isBotchedSwitch } = result;

    // 1. Update Matchup Tracking (Ace Stopper Logic)
    if (result.isAceTarget && typeof result.matchupEffect === 'number') {
        actor.matchupEffectSum += result.matchupEffect;
        actor.matchupEffectCount += 1;
    }

    // Helper: Commit Foul & Check Ejection
    const commitFoul = (defP: LivePlayer) => {
        defP.pf += 1;
        defTeam.fouls += 1;
        
        // Immediate Foul Out Alert
        if (defP.pf === 6) {
             addLog(state, defTeam.id, `🚨 ${defP.playerName} 6반칙 퇴장 (Foul Out)`, 'info');
        }
    };

    // Helper: Resolve and record rebound on missed free throw
    // Kept here because it requires state context
    const handleFreeThrowRebound = (shooter: LivePlayer) => {
        const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
        
        rebPlayer.reb += 1;
        if (rebType === 'off') rebPlayer.offReb += 1;
        else rebPlayer.defReb += 1;

        const rebText = getReboundCommentary(rebPlayer, rebType);
        addLog(state, rebPlayer.playerId, rebText, 'info');
    };

    // 2. Record Shot Event (Visualization)
    recordShotEvent(state, result);

    // [New] Mismatch Announcement
    if (isMismatch) {
        addLog(state, offTeam.id, `⚡ 미스매치! ${actor.playerName}가 이점을 활용합니다.`, 'info');
    }

    // 3. Apply Logic based on Result Type
    if (type === 'score') {
        // Update Actor Stats
        actor.pts += points;
        actor.fgm += 1;
        actor.fga += 1;
        if (points === 3) {
            actor.p3m += 1;
            actor.p3a += 1;
        }
        if (zone) updateZoneStats(actor, zone, true);
        
        // Update Assist (Play-type-based probability — not all secondary actors earn credit)
        if (assister) {
            const assistOdds: Record<string, number> = {
                'CatchShoot': 0.90, // Kick-out to open shooter → almost always assisted
                'Cut':        0.85, // Passer to cutting slasher
                'PnR_Pop':    0.80, // Handler kicks to popping big
                'PnR_Roll':   0.75, // Handler feeds rolling big
                'Handoff':    0.65, // Ball-handler hands off
                'Transition': 0.55, // Push-ahead pass on break
                'PostUp':     0.45, // Entry pass to post
                'Putback':    0.10, // Tip-in rarely credited
            };
            const prob = playType ? (assistOdds[playType] ?? 0.60) : 0.60;
            if (Math.random() < prob) assister.ast += 1;
        }

        // Update Team Score
        offTeam.score += points;
        updatePlusMinus(offTeam, defTeam, points);

        // Generate Commentary
        let logText = generateCommentary('score', actor, defender, assister, playType, zone, {
            isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
            isBlock: false, isSteal: false, points
        });
        
        let totalPointsAdded = points; 

        // Handle And-1 (Additional Game Logic)
        if (isAndOne && defender) {
            commitFoul(defender);
            const foulText = ` (파울: ${defender.playerName})`;

            // Simulate the extra FT
            if (Math.random() < (actor.attr.ft / 100)) {
                // FT Made
                actor.pts += 1;
                actor.ftm += 1;
                actor.fta += 1;
                offTeam.score += 1;
                totalPointsAdded += 1; 
                updatePlusMinus(offTeam, defTeam, 1);
                
                logText += ` + 앤드원 성공!${foulText}`;
            } else {
                // FT Missed
                actor.fta += 1;
                logText += ` + 앤드원 실패${foulText}`;
                
                // Trigger Rebound on And-1 Miss
                handleFreeThrowRebound(actor);
            }
        }
        
        addLog(state, offTeam.id, logText, 'score', totalPointsAdded);

    } else if (type === 'miss') {
        // Update Stats
        actor.fga += 1;
        if (zone === '3PT') actor.p3a += 1;
        if (zone) updateZoneStats(actor, zone, false);

        // Generate Commentary
        let logText = generateCommentary('miss', actor, defender, assister, playType, zone, {
             isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
             isBlock: !!isBlock, isSteal: false, points: 0
        });

        // Handle Block Stat
        if (isBlock && defender) {
            defender.blk += 1;
            addLog(state, defTeam.id, logText, 'block');
        } else {
            addLog(state, offTeam.id, logText, 'miss');
        }

        // Handle Rebound (Field Goal)
        if (rebounder) {
            rebounder.reb += 1;
            const rebType = rebounder.playerId === actor.playerId || state.home.onCourt.includes(rebounder) === state.home.onCourt.includes(actor) ? 'off' : 'def';
            if (rebType === 'off') rebounder.offReb += 1;
            else rebounder.defReb += 1;
            
            // Rebound Log
            const rebText = getReboundCommentary(rebounder, rebType);
            addLog(state, rebounder.playerId, rebText, 'info');
        }

    } else if (type === 'turnover') {
        actor.tov += 1;
        
        let logText = generateCommentary('turnover', actor, defender, undefined, playType, undefined, {
             isSwitch: !!isSwitch, isMismatch: false, isBotchedSwitch: false,
             isBlock: false, isSteal: !!isSteal, points: 0
        });
        
        if (isSteal && defender) {
            defender.stl += 1;
        }
        addLog(state, offTeam.id, logText, 'turnover');
    
    } else if (type === 'foul') {
        if (defender) commitFoul(defender);
        
        let logText = generateCommentary('foul', actor, defender, undefined, playType, undefined, {
             isSwitch: !!isSwitch, isMismatch: false, isBotchedSwitch: false,
             isBlock: false, isSteal: false, points: 0
        });
        
        logText += ` (팀 파울 ${defTeam.fouls})`;
        addLog(state, defTeam.id, logText, 'foul');
        
        // Bonus Situation (Team Fouls > 4) -> 2 Free Throws
        if (defTeam.fouls > 4) {
            let ftMade = 0;
            const ftPct = actor.attr.ft / 100;
            const numShots = 2;
            
            actor.fta += numShots;

            // Shot 1
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
            
            // Shot 2
            let lastShotMade = false;
            if (Math.random() < ftPct) { 
                actor.ftm++; actor.pts++; offTeam.score++; ftMade++; 
                lastShotMade = true;
            }
            
            updatePlusMinus(offTeam, defTeam, ftMade);
            addLog(state, offTeam.id, `${actor.playerName}, 팀 파울로 얻은 자유투 ${ftMade}/${numShots} 성공`, 'freethrow', ftMade);

            // Rebound on last miss
            if (!lastShotMade) {
                handleFreeThrowRebound(actor);
            }
        }

    } else if (type === 'freethrow') {
        // Shooting Foul (Always 2 shots for sim simplicity, or 3 if 3PT)
        
        if (defender) commitFoul(defender);
        
        const numShots = 2; 
        let ftMade = 0;
        actor.fta += numShots;
        const ftPct = actor.attr.ft / 100;
        
        // Shot 1
        if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }

        // Shot 2
        let lastShotMade = false;
        if (Math.random() < ftPct) { 
            actor.ftm++; actor.pts++; offTeam.score++; ftMade++; 
            lastShotMade = true;
        }
        
        updatePlusMinus(offTeam, defTeam, ftMade);
        addLog(state, offTeam.id, `${actor.playerName}, 슈팅 파울 자유투 ${ftMade}/${numShots} 성공`, 'freethrow', ftMade);

        // Rebound on last miss
        if (!lastShotMade) {
            handleFreeThrowRebound(actor);
        }
    }
}

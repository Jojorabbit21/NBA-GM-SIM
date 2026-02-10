
import { GameState, PossessionResult, LivePlayer } from './pbpTypes';
import { PbpLog } from '../../../../types';
import { formatTime } from './timeEngine';
import { resolveDynamicZone } from '../shotDistribution';

/**
 * Applies the result of a possession to the player and team stats.
 * Also generates the PBP log entry.
 */
export function applyPossessionResult(state: GameState, result: PossessionResult) {
    const { type, actor, defender, assister, rebounder, points, zone, isBlock, isSteal, offTeam, defTeam, isAndOne } = result;

    // Helper to increment foul
    const commitFoul = (defP: LivePlayer) => {
        defP.pf += 1;
        defTeam.fouls += 1;
        // Ejection logic handled in substitutionSystem check
    };

    // 1. Base Stats
    if (type === 'score') {
        actor.pts += points;
        actor.fgm += 1;
        actor.fga += 1;
        if (points === 3) {
            actor.p3m += 1;
            actor.p3a += 1;
        }
        
        if (zone) updateZoneStats(actor, zone, true);
        if (assister) assister.ast += 1;

        offTeam.score += points;

        let logText = `[${offTeam.id.toUpperCase()}] ${actor.playerName} ${points}점슛 성공`;
        if (assister) logText += ` (AST: ${assister.playerName})`;
        
        // Handle And-1
        if (isAndOne && defender) {
            commitFoul(defender);
            // Simple FT logic: 80% chance to convert And-1
            if (Math.random() < (actor.attr.ft / 100)) {
                actor.pts += 1;
                actor.ftm += 1;
                actor.fta += 1;
                offTeam.score += 1;
                logText += ` + 앤드원 성공`;
            } else {
                actor.fta += 1;
                logText += ` + 앤드원 실패`;
            }
        }
        
        addLog(state, offTeam.id, logText, 'score', points + (isAndOne ? 1 : 0));

    } else if (type === 'miss') {
        actor.fga += 1;
        if (zone === '3PT') actor.p3a += 1;
        if (zone) updateZoneStats(actor, zone, false);

        let logText = `[${offTeam.id.toUpperCase()}] ${actor.playerName} 슛 실패`;

        if (isBlock && defender) {
            defender.blk += 1;
            logText += ` (블록: ${defender.playerName})`;
            addLog(state, defTeam.id, logText, 'block');
        } else {
            addLog(state, offTeam.id, logText, 'miss');
        }

        if (rebounder) {
            rebounder.reb += 1;
            const rebType = rebounder.playerId === actor.playerId || state.home.onCourt.includes(rebounder) === state.home.onCourt.includes(actor) ? 'off' : 'def';
            if (rebType === 'off') rebounder.offReb += 1;
            else rebounder.defReb += 1;
            
            addLog(state, rebounder.playerId, `${rebounder.playerName} 리바운드 (${rebType === 'off' ? '공격' : '수비'})`, 'info');
        }

    } else if (type === 'turnover') {
        actor.tov += 1;
        let logText = `[${offTeam.id.toUpperCase()}] ${actor.playerName} 턴오버`;
        
        if (isSteal && defender) {
            defender.stl += 1;
            logText += ` (스틸: ${defender.playerName})`;
        }
        addLog(state, offTeam.id, logText, 'turnover');
    
    } else if (type === 'foul') {
        // Defensive Foul on the floor (Non-shooting)
        if (defender) commitFoul(defender);
        addLog(state, defTeam.id, `${defender?.playerName} 수비 파울 (팀 파울 ${defTeam.fouls})`, 'foul');
        
        // Bonus Situation Check? (Simplified: If fouls > 4, shoot FTs)
        if (defTeam.fouls > 4) {
            // 2 Free Throws
            let ftMade = 0;
            actor.fta += 2;
            const ftPct = actor.attr.ft / 100;
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
            
            addLog(state, offTeam.id, `${actor.playerName} 자유투 ${ftMade}/2 성공`, 'freethrow', ftMade);
        }

    } else if (type === 'freethrow') {
        // Shooting Foul (Missed Shot)
        if (defender) commitFoul(defender);
        
        const numShots = 2; // Simplify 2 or 3 shots to 2 for now
        let ftMade = 0;
        actor.fta += numShots;
        const ftPct = actor.attr.ft / 100;
        
        for (let i=0; i<numShots; i++) {
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
        }
        
        addLog(state, offTeam.id, `${actor.playerName} 슛 동작 파울 - 자유투 ${ftMade}/${numShots} 성공`, 'freethrow', ftMade);
    }
}

function updateZoneStats(p: LivePlayer, zone: 'Rim' | 'Paint' | 'Mid' | '3PT', isMake: boolean) {
    if (zone === 'Rim' || zone === 'Paint') {
        p.rimA++;
        if (isMake) p.rimM++;
    } else if (zone === 'Mid') {
        p.midA++;
        if (isMake) p.midM++;
    }
    // Specific Sub-Zone Update
    const subZoneKey = resolveDynamicZone(p, zone);
    const attemptKey = `${subZoneKey}_a` as keyof LivePlayer;
    if (typeof p[attemptKey] === 'number') (p as any)[attemptKey]++;
    if (isMake) {
        const makeKey = `${subZoneKey}_m` as keyof LivePlayer;
        if (typeof p[makeKey] === 'number') (p as any)[makeKey]++;
    }
}

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

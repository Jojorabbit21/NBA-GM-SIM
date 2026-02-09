
import { GameState, PossessionResult, LivePlayer } from './pbpTypes';
import { PbpLog } from '../../../../types';
import { formatTime } from './timeEngine';
import { resolveDynamicZone } from '../shotDistribution';

/**
 * Applies the result of a possession to the player and team stats.
 * Also generates the PBP log entry.
 */
export function applyPossessionResult(state: GameState, result: PossessionResult) {
    const { type, actor, defender, assister, rebounder, points, zone, isBlock, isSteal, offTeam, defTeam } = result;

    // 1. Base Stats
    if (type === 'score') {
        actor.pts += points;
        actor.fgm += 1;
        actor.fga += 1;
        if (points === 3) {
            actor.p3m += 1;
            actor.p3a += 1;
        }
        
        // Zone specific stats
        if (zone) {
            updateZoneStats(actor, zone, true);
        }

        if (assister) {
            assister.ast += 1;
        }

        // Update Team Score
        offTeam.score += points;

        // Generate Log
        const distText = zone === '3PT' ? '3점슛' : zone === 'Mid' ? '점퍼' : zone === 'Rim' ? '레이업/덩크' : '슛';
        let logText = `[${offTeam.id.toUpperCase()}] ${actor.playerName} ${distText} 성공`;
        if (assister) logText += ` (${assister.playerName} 어시스트)`;
        
        addLog(state, offTeam.id, logText, 'score', points);

    } else if (type === 'miss') {
        actor.fga += 1;
        if (zone === '3PT') actor.p3a += 1;
        
        if (zone) {
            updateZoneStats(actor, zone, false);
        }

        let logText = `[${offTeam.id.toUpperCase()}] ${actor.playerName} 슛 실패`;

        if (isBlock && defender) {
            defender.blk += 1;
            logText += ` (블록: ${defender.playerName})`;
            addLog(state, defTeam.id, logText, 'block');
        } else {
            addLog(state, offTeam.id, logText, 'miss');
        }

        // Rebound
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
    }
}

function updateZoneStats(p: LivePlayer, zone: 'Rim' | 'Paint' | 'Mid' | '3PT', isMake: boolean) {
    // 1. Broad Category Update (Aggregates used in Box Score)
    if (zone === 'Rim' || zone === 'Paint') {
        p.rimA++;
        if (isMake) p.rimM++;
    } else if (zone === 'Mid') {
        p.midA++;
        if (isMake) p.midM++;
    }
    // Note: 3PT Aggregate (p.p3a/m) is handled in the main function.

    // 2. Specific Sub-Zone Update (Detailed Shot Chart)
    const subZoneKey = resolveDynamicZone(p, zone);
    
    // Increment Attempt
    // e.g. zone_mid_c_a
    const attemptKey = `${subZoneKey}_a` as keyof LivePlayer;
    if (typeof p[attemptKey] === 'number') {
        (p as any)[attemptKey]++;
    }

    // Increment Make
    // e.g. zone_mid_c_m
    if (isMake) {
        const makeKey = `${subZoneKey}_m` as keyof LivePlayer;
        if (typeof p[makeKey] === 'number') {
            (p as any)[makeKey]++;
        }
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

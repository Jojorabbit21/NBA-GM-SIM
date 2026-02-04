
import { GameState, PossessionResult, TeamState, LivePlayer } from './pbpTypes';
import { calculatePossessionTime } from './timeEngine';

/**
 * Simulates a single possession with advanced logic (Fouls, Blocks, FTs).
 */
export function resolvePossession(state: GameState): PossessionResult {
    const attTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = state.possession === 'home' ? state.away : state.home;
    
    const timeTaken = calculatePossessionTime(state, attTeam.tactics.sliders);
    const actor = getRandomPlayer(attTeam.onCourt);
    const defender = getRandomPlayer(defTeam.onCourt); // Primary defender

    // --- 1. Check for Turnover (13%) ---
    if (Math.random() < 0.13) {
        const isSteal = Math.random() < 0.6; // 60% of TOs are steals
        const stealer = isSteal ? defender : undefined;
        return {
            type: 'turnover',
            player: actor,
            secondaryPlayer: stealer,
            timeTaken,
            logText: stealer 
                ? `${stealer.playerName}의 스틸! ${actor.playerName}의 실책.`
                : `${actor.playerName}, 패스 미스로 턴오버.`,
            nextPossession: state.possession === 'home' ? 'away' : 'home',
            isDeadBall: false
        };
    }

    // --- 2. Check for Foul (Before Shot) (8% + Defense Intensity) ---
    // If team is in bonus, this leads to FTs.
    const foulChance = 0.05 + (defTeam.tactics.sliders.defIntensity * 0.005);
    if (Math.random() < foulChance) {
        // 30% Shooting Foul, 70% Non-Shooting (unless bonus)
        const isShootingFoul = Math.random() < 0.3;
        const isBonus = defTeam.fouls >= 5;
        
        if (isShootingFoul || isBonus) {
            // Free Throws
            return resolveFreeThrows(actor, defender, timeTaken, state.possession);
        } else {
            // Side Out
            defTeam.fouls++;
            return {
                type: 'foul',
                player: defender, // Fouler
                secondaryPlayer: actor, // Fouled
                timeTaken,
                logText: `${defender.playerName}, 수비 파울. (팀 파울: ${defTeam.fouls})`,
                nextPossession: state.possession, // Keep ball
                isDeadBall: true
            };
        }
    }

    // --- 3. Shot Attempt ---
    const is3Pt = Math.random() < 0.38; // 38% 3PT Rate
    
    // Block Check (only on 2PT usually, or rare 3PT)
    if (!is3Pt && Math.random() < (defender.attr.blk / 500)) { // ~10% chance if high block
        return {
            type: 'block',
            player: defender,
            secondaryPlayer: actor,
            timeTaken,
            logText: `${actor.playerName}의 슛을 ${defender.playerName}가 블록해냈습니다!`,
            nextPossession: Math.random() < 0.5 ? 'home' : 'away', // Loose ball
            isDeadBall: false
        };
    }

    // Shot Success Calculation
    // Base + Offense Attr - Defense Attr
    let hitRate = is3Pt ? 0.35 : 0.48;
    const offRating = is3Pt ? actor.attr.out : actor.attr.ins;
    const defRating = is3Pt ? defender.attr.def : defender.attr.def;
    
    hitRate += (offRating - defRating) * 0.002; // Minor adjustment

    if (Math.random() < hitRate) {
        // MADE SHOT
        const assister = Math.random() < 0.6 ? getRandomPlayer(attTeam.onCourt, actor.playerId) : undefined;
        const points = is3Pt ? 3 : 2;
        
        // And-1 Chance (3%)
        if (Math.random() < 0.03) {
             return resolveFreeThrows(actor, defender, timeTaken, state.possession, points);
        }

        return {
            type: 'score',
            points,
            player: actor,
            secondaryPlayer: assister,
            timeTaken,
            logText: `${actor.playerName}, ${points}점 슛 성공! ${assister ? `(${assister.playerName} 어시스트)` : ''}`,
            nextPossession: state.possession === 'home' ? 'away' : 'home',
            isDeadBall: false
        };
    } else {
        // MISSED SHOT
        const isOffReb = Math.random() < 0.23; // 23% OREB rate
        const rebounder = isOffReb 
            ? getRandomPlayer(attTeam.onCourt) 
            : getRandomPlayer(defTeam.onCourt);
            
        return {
            type: 'miss',
            player: actor,
            rebounder: rebounder,
            timeTaken,
            logText: `${actor.playerName}, ${is3Pt ? '3점' : '2점'}슛 실패. 리바운드: ${rebounder.playerName}.`,
            nextPossession: isOffReb ? 'keep' : (state.possession === 'home' ? 'away' : 'home'),
            isDeadBall: false
        };
    }
}

function resolveFreeThrows(shooter: LivePlayer, fouler: LivePlayer, time: number, possession: string, andOnePoints?: number): PossessionResult {
    const ftPct = shooter.attr.ft / 100;
    const count = andOnePoints ? 1 : 2; // If And-1, only 1 shot. Else 2.
    let made = 0;
    
    for(let i=0; i<count; i++) {
        if (Math.random() < ftPct) made++;
    }
    
    const isAndOne = andOnePoints !== undefined;
    const totalPoints = (andOnePoints || 0) + made;
    
    let text = "";
    if (isAndOne) {
        text = `${shooter.playerName}, 앤드원! 추가 자유투 ${made > 0 ? '성공' : '실패'}. (${totalPoints}점 플레이)`;
    } else {
        text = `${fouler.playerName} 파울. ${shooter.playerName} 자유투 ${made}/${count} 성공.`;
    }

    return {
        type: 'freethrow',
        points: totalPoints as any, // Only points added to score
        attempts: count, // Actual FT attempts for stat sheet
        player: shooter,
        secondaryPlayer: fouler, // Fouler
        timeTaken: time,
        logText: text,
        nextPossession: possession === 'home' ? 'away' : 'home', 
        isDeadBall: true
    };
}

// Helper: Pick random player
function getRandomPlayer(players: LivePlayer[], excludeId?: string): LivePlayer {
    if (!players || players.length === 0) throw new Error("No players on court");
    let pool = players;
    if (excludeId) {
        pool = players.filter(p => p.playerId !== excludeId);
        if (pool.length === 0) pool = players;
    }
    return pool[Math.floor(Math.random() * pool.length)];
}

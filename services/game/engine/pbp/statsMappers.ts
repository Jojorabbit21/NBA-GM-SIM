
import { GameState, PossessionResult, LivePlayer } from './pbpTypes';
import { PbpLog } from '../../../../types';
import { formatTime } from './timeEngine';
import { resolveRebound } from './reboundLogic';

// Modularized Imports
import { generateCommentary, getReboundCommentary, getTechnicalFoulCommentary, getFlagrant1Commentary, getFlagrant2Commentary } from '../commentary/textGenerator';
import { updateZoneStats, updatePlusMinus } from './handlers/statUtils';
import { recordShotEvent } from './handlers/visUtils';

/**
 * Hot/Cold Streak 업데이트
 * 슛 결과 후 호출하여 선수의 핫/콜드 레이팅 갱신
 */
function updateHotCold(player: LivePlayer, isMake: boolean): void {
    player.recentShots.push(isMake);
    if (player.recentShots.length > 5) player.recentShots.shift();

    const total = player.recentShots.length;
    if (total < 2) { player.hotColdRating = 0; return; }

    const makes = player.recentShots.filter(Boolean).length;
    const recentPct = makes / total;

    // 3연속 성공/실패 시 스트릭 보너스
    let streakBonus = 0;
    if (total >= 3) {
        const last3 = player.recentShots.slice(-3);
        if (last3.every(Boolean)) streakBonus = 0.15;
        else if (last3.every(s => !s)) streakBonus = -0.15;
    }

    player.hotColdRating = Math.max(-1, Math.min(1,
        (recentPct - 0.5) * 1.5 + streakBonus
    ));
}

/**
 * 쿼터 전환 / 타임아웃 시 핫/콜드 반감
 */
export function dampenHotCold(team: { onCourt: LivePlayer[], bench: LivePlayer[] }): void {
    [...team.onCourt, ...team.bench].forEach(p => {
        p.hotColdRating *= 0.5;
        // 앞 2개 제거 (최근 기록만 남김)
        if (p.recentShots.length > 2) {
            p.recentShots = p.recentShots.slice(-3);
        }
    });
}

/**
 * 하프타임 시 핫/콜드 완전 리셋
 */
export function resetHotCold(team: { onCourt: LivePlayer[], bench: LivePlayer[] }): void {
    [...team.onCourt, ...team.bench].forEach(p => {
        p.hotColdRating = 0;
        p.recentShots = [];
    });
}

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
    const { isSwitch, isMismatch, isBotchedSwitch, pnrCoverage } = result;

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

    // [New] PnR Coverage Announcement
    if (pnrCoverage) {
        const coverageLabel = pnrCoverage === 'drop' ? '드랍' : pnrCoverage === 'hedge' ? '헷지' : '블리츠';
        addLog(state, defTeam.id, `🛡️ ${coverageLabel} 수비 전개`, 'info');
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
        if (zone) updateZoneStats(actor, zone, true, result.subZone);
        updateHotCold(actor, true);

        // Update Assist (Play-type-based probability — not all secondary actors earn credit)
        if (assister) {
            const assistOdds: Record<string, number> = {
                'CatchShoot':  0.92, // Kick-out to open shooter → almost always assisted
                'Cut':         0.88, // Passer to cutting slasher
                'PnR_Pop':     0.85, // Handler kicks to popping big
                'PnR_Roll':    0.80, // Handler feeds rolling big
                'Handoff':     0.70, // Ball-handler hands off
                'Transition':  0.60, // Push-ahead / outlet pass on break
                'PostUp':      0.50, // Entry pass to post
                'PnR_Handler': 0.35, // 스크린 후 핸들러 자체 공격 — 어시스트 낮음
                'Iso':         0.30, // 진입 패스 후 아이소 — 어시스트 낮음
                'Putback':     0.10, // Tip-in rarely credited
            };
            const prob = playType ? (assistOdds[playType] ?? 0.60) : 0.60;
            // [SaveTendency] playStyle: pass-first(-1.0) → +10% assist prob, shoot-first(+1.0) → -10%
            const assistMod = (assister.tendencies?.playStyle ?? 0) * -0.10;
            if (Math.random() < prob + assistMod) assister.ast += 1;
        }

        // Update Team Score
        offTeam.score += points;
        updatePlusMinus(offTeam, defTeam, points);

        // Generate Commentary
        let logText = generateCommentary('score', actor, defender, assister, playType, zone, {
            isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
            isBlock: false, isSteal: false, points, pnrCoverage: pnrCoverage || undefined
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
        if (zone) updateZoneStats(actor, zone, false, result.subZone);
        updateHotCold(actor, false);

        // Generate Commentary
        let logText = generateCommentary('miss', actor, defender, assister, playType, zone, {
             isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
             isBlock: !!isBlock, isSteal: false, points: 0, pnrCoverage: pnrCoverage || undefined
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
            const rebType = result.reboundType || 'def';
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
             isBlock: false, isSteal: !!isSteal, points: 0, pnrCoverage: pnrCoverage || undefined
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

    } else if (type === 'offensiveFoul') {
        // 오펜시브 파울: 공격자에게 PF + TOV, 수비팀 공 넘김
        actor.pf += 1;
        actor.tov += 1;

        const isCharge = playType === 'Iso' || playType === 'PostUp' || playType === 'Transition';
        const foulDesc = isCharge ? '차지' : '일리걸 스크린';
        const ejectionText = actor.pf >= 6 ? ' — 6반칙 퇴장!' : '';

        addLog(state, offTeam.id, `${actor.playerName}, 오펜시브 파울 (${foulDesc})${ejectionText}`, 'foul');

        if (actor.pf === 6) {
            addLog(state, offTeam.id, `🚨 ${actor.playerName} 6반칙 퇴장 (Foul Out)`, 'info');
        }

    } else if (type === 'technicalFoul') {
        // 테크니컬 파울: PF 미합산, 별도 techFouls 카운트, FT 1개(베스트 슈터), 공격권 유지
        if (defender) {
            defender.techFouls = (defender.techFouls || 0) + 1;
        }

        // 베스트 FT 슈터가 자유투 1개
        const ftShooter = [...offTeam.onCourt].sort((a, b) => b.attr.ft - a.attr.ft)[0];
        const ftPct = ftShooter.attr.ft / 100;
        ftShooter.fta += 1;
        let ftMade = 0;
        if (Math.random() < ftPct) {
            ftShooter.ftm += 1; ftShooter.pts += 1; offTeam.score += 1; ftMade = 1;
            updatePlusMinus(offTeam, defTeam, 1);
        }

        // 2 테크니컬 = 자동 퇴장
        const isEjected = defender && (defender.techFouls || 0) >= 2;
        if (isEjected && defender) {
            defender.pf = 6;
        }

        // 해설 텍스트
        const commentaryBase = defender
            ? getTechnicalFoulCommentary(defender)
            : `🟨 테크니컬 파울이 선언됩니다!`;
        const ejectionSuffix = isEjected ? ' — 2 테크니컬 퇴장!' : '';
        const ftSuffix = ` ${ftShooter.playerName} 자유투 ${ftMade}/1`;
        addLog(state, defTeam.id, `${commentaryBase}${ejectionSuffix}${ftSuffix}`, 'foul', ftMade || undefined);

        if (isEjected && defender) {
            addLog(state, defTeam.id, `🚨 ${defender.playerName} 2 테크니컬 퇴장!`, 'info');
        }

    } else if (type === 'flagrantFoul') {
        // 플래그런트 파울: PF 합산, FT 2개(파울 당한 선수), 공격권 유지
        if (defender) commitFoul(defender);

        const isFlagrant2 = result.isFlagrant2;

        // 자유투 2개 (파울 당한 공격자 = actor)
        const ftPct = actor.attr.ft / 100;
        actor.fta += 2;
        let ftMade = 0;
        if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
        if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
        updatePlusMinus(offTeam, defTeam, ftMade);

        // flagrantFouls 카운트
        if (defender) {
            defender.flagrantFouls = (defender.flagrantFouls || 0) + 1;
        }

        // 해설 텍스트
        const commentary = defender
            ? (isFlagrant2 ? getFlagrant2Commentary(defender, actor) : getFlagrant1Commentary(defender, actor))
            : `🟥 Flagrant ${isFlagrant2 ? '2' : '1'}!`;
        const ftSuffix = ` ${actor.playerName} 자유투 ${ftMade}/2`;
        addLog(state, defTeam.id, `${commentary}${ftSuffix}`, 'foul', ftMade || undefined);

        // F2 = 즉시 퇴장
        if (isFlagrant2 && defender) {
            defender.pf = 6;
            addLog(state, defTeam.id, `🚨 ${defender.playerName} Flagrant 2 퇴장!`, 'info');
        }

    } else if (type === 'shotClockViolation') {
        // 샷클락 바이올레이션: TOV + 수비팀 공 넘김
        actor.tov += 1;

        const teamName = offTeam.id === state.home.id
            ? state.home.name
            : state.away.name;
        addLog(state, offTeam.id, `⏱ 24초 샷클락 바이올레이션 — ${teamName} 턴오버`, 'turnover');
    }
}

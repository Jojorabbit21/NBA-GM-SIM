
import { GameState, PossessionResult, LivePlayer } from './pbpTypes.ts';
import type { PbpLog } from '../../types/engine.ts';
import { formatTime } from './timeEngine.ts';
import { resolveRebound } from './reboundLogic.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';
import { generateCommentary, getReboundCommentary, getTechnicalFoulCommentary, getFlagrant1Commentary, getFlagrant2Commentary } from '../commentary/textGenerator.ts';
import { updateZoneStats, updatePlusMinus } from './handlers/statUtils.ts';
import { recordShotEvent } from './handlers/visUtils.ts';

function bumpDefendedShot(defender: LivePlayer, broadZone: string, subZone: string | undefined, isMake: boolean): void {
    defender.contestedAttempted = (defender.contestedAttempted ?? 0) + 1;
    if (isMake) defender.contestedMade = (defender.contestedMade ?? 0) + 1;

    const zone6 =
        subZone === 'zone_rim'    ? 'RA' :
        subZone === 'zone_paint'  ? 'ITP' :
        subZone === 'zone_mid_l' || subZone === 'zone_mid_c' || subZone === 'zone_mid_r' ? 'MID' :
        subZone === 'zone_c3_l'  || subZone === 'zone_c3_r'  ? 'CNR' :
        subZone === 'zone_atb3_l'|| subZone === 'zone_atb3_r' ? 'WING' :
        subZone === 'zone_atb3_c' ? 'ATB' :
        broadZone === 'Rim' ? 'RA' :
        broadZone === 'Paint' ? 'ITP' :
        broadZone === 'Mid' ? 'MID' :
        broadZone === '3PT' ? 'ATB' : null;

    if (zone6) {
        const keyA = `def${zone6}Attempted` as keyof LivePlayer;
        const keyM = `def${zone6}Made` as keyof LivePlayer;
        (defender[keyA] as number) = ((defender[keyA] as number) ?? 0) + 1;
        if (isMake) (defender[keyM] as number) = ((defender[keyM] as number) ?? 0) + 1;
    }
}

function updateHotCold(player: LivePlayer, isMake: boolean): void {
    player.recentShots.push(isMake);
    if (player.recentShots.length > 5) player.recentShots.shift();
    const total = player.recentShots.length;
    if (total < 2) { player.hotColdRating = 0; return; }
    const makes = player.recentShots.filter(Boolean).length;
    const recentPct = makes / total;
    let streakBonus = 0;
    if (total >= 3) {
        const last3 = player.recentShots.slice(-3);
        if (last3.every(Boolean)) streakBonus = 0.15;
        else if (last3.every(s => !s)) streakBonus = -0.15;
    }
    player.hotColdRating = Math.max(-1, Math.min(1, (recentPct - 0.5) * 1.5 + streakBonus));
}

export function dampenHotCold(team: { onCourt: LivePlayer[]; bench: LivePlayer[] }): void {
    [...team.onCourt, ...team.bench].forEach(p => {
        p.hotColdRating *= 0.5;
        if (p.recentShots.length > 2) p.recentShots = p.recentShots.slice(-3);
    });
}

export function resetHotCold(team: { onCourt: LivePlayer[]; bench: LivePlayer[] }): void {
    [...team.onCourt, ...team.bench].forEach(p => { p.hotColdRating = 0; p.recentShots = []; });
}

function addLog(state: GameState, teamId: string, text: string, type: PbpLog['type'], points?: number, foulTeamId?: string) {
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: formatTime(state.gameClock),
        teamId,
        text,
        type,
        points: points as 1 | 2 | 3 | undefined,
        foulTeamId,
    });
}

export function applyPossessionResult(state: GameState, result: PossessionResult) {
    const { type, actor, defender, assister, rebounder, points, zone, isBlock, isSteal,
            offTeam, defTeam, isAndOne, playType, isSwitch, isMismatch, isBotchedSwitch, pnrCoverage } = result;

    if (result.isAceTarget && typeof result.matchupEffect === 'number') {
        actor.matchupEffectSum += result.matchupEffect;
        actor.matchupEffectCount += 1;
    }

    const commitFoul = (defP: LivePlayer) => {
        defP.pf += 1;
        defTeam.fouls += 1;
        if (defP.pf === 6) addLog(state, defTeam.id, `🚨 ${defP.playerName} 6반칙 퇴장 (Foul Out)`, 'info');
    };

    const handleFreeThrowRebound = (shooter: LivePlayer) => {
        if (Math.random() < SIM_CONFIG.REBOUND.TEAM_REB_RATE_FT) return;
        const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
        rebPlayer.reb += 1;
        if (rebType === 'off') rebPlayer.offReb += 1;
        else rebPlayer.defReb += 1;
        addLog(state, rebPlayer.playerId, getReboundCommentary(rebPlayer, rebType), 'info');
    };

    recordShotEvent(state, result);

    if (isMismatch) {
        addLog(state, offTeam.id, `⚡ 미스매치! ${actor.playerName}가 이점을 활용합니다.`, 'info');
    }

    if (type === 'score') {
        actor.pts += points;
        actor.fgm += 1;
        actor.fga += 1;
        if (points === 3) { actor.p3m += 1; actor.p3a += 1; }
        if (zone) updateZoneStats(actor, zone, true, result.subZone);
        if (defender && zone) bumpDefendedShot(defender, zone, result.subZone, true);
        updateHotCold(actor, true);

        if (assister) {
            const assistOdds: Record<string, number> = {
                'CatchShoot': 0.97, 'DriveKick': 0.97, 'Cut': 0.95, 'OffBallScreen': 0.95,
                'PnR_Pop': 0.95, 'PnR_Roll': 0.90, 'Handoff': 0.78, 'Transition': 0.78,
                'PostUp': 0.55, 'PnR_Handler': 0.50, 'Iso': 0.38, 'Putback': 0.10,
            };
            const prob = playType ? (assistOdds[playType] ?? 0.60) : 0.60;
            const assistMod = (assister.tendencies?.playStyle ?? 0) * -0.10;
            if (Math.random() < prob + assistMod) assister.ast += 1;
        }

        offTeam.score += points;
        updatePlusMinus(offTeam, defTeam, points);

        let logText = generateCommentary('score', actor, defender, assister, playType, zone, {
            isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
            isBlock: false, isSteal: false, points, pnrCoverage: pnrCoverage || undefined,
        });

        let totalPointsAdded = points;
        if (isAndOne && defender) {
            commitFoul(defender);
            const foulText = ` (파울: ${defender.playerName})`;
            if (Math.random() < (actor.attr.ft / 100)) {
                actor.pts += 1; actor.ftm += 1; actor.fta += 1;
                offTeam.score += 1; totalPointsAdded += 1;
                updatePlusMinus(offTeam, defTeam, 1);
                logText += ` + 앤드원 성공!${foulText}`;
            } else {
                actor.fta += 1;
                logText += ` + 앤드원 실패${foulText}`;
                handleFreeThrowRebound(actor);
            }
        }
        addLog(state, offTeam.id, logText, 'score', totalPointsAdded);

    } else if (type === 'miss') {
        actor.fga += 1;
        if (zone === '3PT') actor.p3a += 1;
        if (zone) updateZoneStats(actor, zone, false, result.subZone);
        if (defender && zone) bumpDefendedShot(defender, zone, result.subZone, false);
        updateHotCold(actor, false);

        const logText = generateCommentary('miss', actor, defender, assister, playType, zone, {
            isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
            isBlock: !!isBlock, isSteal: false, points: 0, pnrCoverage: pnrCoverage || undefined,
        });

        if (isBlock && defender) { defender.blk += 1; addLog(state, defTeam.id, logText, 'block'); }
        else { addLog(state, offTeam.id, logText, 'miss'); }

        if (rebounder) {
            rebounder.reb += 1;
            const rebType = result.reboundType || 'def';
            if (rebType === 'off') rebounder.offReb += 1;
            else rebounder.defReb += 1;
            addLog(state, rebounder.playerId, getReboundCommentary(rebounder, rebType), 'info');
        }

    } else if (type === 'turnover') {
        actor.tov += 1;
        const logText = generateCommentary('turnover', actor, defender, undefined, playType, undefined, {
            isSwitch: !!isSwitch, isMismatch: false, isBotchedSwitch: false,
            isBlock: false, isSteal: !!isSteal, points: 0, pnrCoverage: pnrCoverage || undefined,
        });
        if (isSteal && defender) defender.stl += 1;
        addLog(state, offTeam.id, logText, 'turnover');

    } else if (type === 'foul') {
        if (defender) commitFoul(defender);
        let logText = generateCommentary('foul', actor, defender, undefined, playType, undefined, {
            isSwitch: !!isSwitch, isMismatch: false, isBotchedSwitch: false,
            isBlock: false, isSteal: false, points: 0,
        });
        logText += ` (팀 파울 ${defTeam.fouls})`;
        addLog(state, defTeam.id, logText, 'foul', undefined, defTeam.id);

        if (defTeam.fouls > 4) {
            let ftMade = 0;
            const ftPct = actor.attr.ft / 100;
            actor.fta += 2;
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
            let lastMade = false;
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; lastMade = true; }
            updatePlusMinus(offTeam, defTeam, ftMade);
            addLog(state, offTeam.id, `${actor.playerName}, 팀 파울로 얻은 자유투 ${ftMade}/2 성공`, 'freethrow', ftMade);
            if (!lastMade) handleFreeThrowRebound(actor);
        }

    } else if (type === 'freethrow') {
        if (defender) commitFoul(defender);
        const numShots = zone === '3PT' ? 3 : 2;
        let ftMade = 0;
        actor.fta += numShots;
        const ftPct = actor.attr.ft / 100;
        let lastMade = false;
        for (let i = 0; i < numShots; i++) {
            const made = Math.random() < ftPct;
            if (made) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
            if (i === numShots - 1) lastMade = made;
        }
        updatePlusMinus(offTeam, defTeam, ftMade);
        addLog(state, offTeam.id, `${actor.playerName}, 슈팅 파울 자유투 ${ftMade}/${numShots} 성공`, 'freethrow', ftMade, defTeam.id);
        if (!lastMade) handleFreeThrowRebound(actor);

    } else if (type === 'offensiveFoul') {
        actor.pf += 1;
        actor.tov += 1;
        const isCharge = playType === 'Iso' || playType === 'PostUp' || playType === 'Transition';
        const foulDesc = isCharge ? '차지' : '일리걸 스크린';
        const ejectionText = actor.pf >= 6 ? ' — 6반칙 퇴장!' : '';
        addLog(state, offTeam.id, `${actor.playerName}, 오펜시브 파울 (${foulDesc})${ejectionText}`, 'foul');
        if (actor.pf === 6) addLog(state, offTeam.id, `🚨 ${actor.playerName} 6반칙 퇴장 (Foul Out)`, 'info');

    } else if (type === 'technicalFoul') {
        if (defender) { defender.techFouls = (defender.techFouls || 0) + 1; }
        const ftShooter = [...offTeam.onCourt].sort((a, b) => b.attr.ft - a.attr.ft)[0];
        const ftPct = ftShooter.attr.ft / 100;
        ftShooter.fta += 1;
        let ftMade = 0;
        if (Math.random() < ftPct) { ftShooter.ftm++; ftShooter.pts++; offTeam.score++; ftMade = 1; updatePlusMinus(offTeam, defTeam, 1); }
        const isEjected = defender && (defender.techFouls || 0) >= 2;
        if (isEjected && defender) defender.pf = 6;
        const commentaryBase = defender ? getTechnicalFoulCommentary(defender) : `🟨 테크니컬 파울이 선언됩니다!`;
        const ejectionSuffix = isEjected ? ' — 2 테크니컬 퇴장!' : '';
        const ftSuffix = ` ${ftShooter.playerName} 자유투 ${ftMade}/1`;
        addLog(state, defTeam.id, `${commentaryBase}${ejectionSuffix}${ftSuffix}`, 'foul', ftMade || undefined);
        if (isEjected && defender) addLog(state, defTeam.id, `🚨 ${defender.playerName} 2 테크니컬 퇴장!`, 'info');

    } else if (type === 'flagrantFoul') {
        if (defender) commitFoul(defender);
        const isFlagrant2 = result.isFlagrant2;
        const ftPct = actor.attr.ft / 100;
        actor.fta += 2;
        let ftMade = 0;
        if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
        if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
        updatePlusMinus(offTeam, defTeam, ftMade);
        if (defender) defender.flagrantFouls = (defender.flagrantFouls || 0) + 1;
        const commentary = defender
            ? (isFlagrant2 ? getFlagrant2Commentary(defender, actor) : getFlagrant1Commentary(defender, actor))
            : `🟥 Flagrant ${isFlagrant2 ? '2' : '1'}!`;
        const ftSuffix = ` ${actor.playerName} 자유투 ${ftMade}/2`;
        addLog(state, defTeam.id, `${commentary}${ftSuffix}`, 'foul', ftMade || undefined, defTeam.id);
        if (isFlagrant2 && defender) {
            defender.pf = 6;
            addLog(state, defTeam.id, `🚨 ${defender.playerName} Flagrant 2 퇴장!`, 'info');
        }

    } else if (type === 'shotClockViolation') {
        actor.tov += 1;
        const teamName = offTeam.id === state.home.id ? state.home.name : state.away.name;
        addLog(state, offTeam.id, `⏱ 24초 샷클락 바이올레이션 — ${teamName} 턴오버`, 'turnover');

    } else if (type === 'fight') {
        const fighter  = result.fighter;
        const opponent = result.fightOpponent;
        const fighterSusp = result.fighterSuspension ?? 1;
        const oppSusp     = result.opponentSuspension ?? 1;
        if (fighter)  { fighter.pf = 6;  fighter.techFouls  = (fighter.techFouls  || 0) + 2; }
        if (opponent) { opponent.pf = 6; opponent.techFouls = (opponent.techFouls || 0) + 1; }
        const timeStr = formatTime(state.gameClock);
        if (fighter && opponent) {
            addLog(state, defTeam.id, `🥊 ${fighter.playerName}이(가) ${opponent.playerName}에게 주먹을 휘둘렀습니다! 양 선수 퇴장!`, 'info');
            addLog(state, defTeam.id, `📋 ${fighter.playerName} ${fighterSusp}경기 출장정지 / ${opponent.playerName} ${oppSusp}경기 출장정지`, 'info');
            state.suspensions.push({
                playerId: fighter.playerId, playerName: fighter.playerName, teamId: defTeam.id,
                opponentPlayerId: opponent.playerId, opponentPlayerName: opponent.playerName, opponentTeamId: offTeam.id,
                suspensionGames: fighterSusp,
                opponentSuspensionGames: oppSusp,
                quarter: state.quarter, timeRemaining: timeStr,
            });
            fighter.health = 'Injured';  fighter.injuryType = '출장정지 (싸움)'; fighter.returnDate = `${fighterSusp}경기`; fighter.injuredThisGame = true;
            opponent.health = 'Injured'; opponent.injuryType = '출장정지 (싸움)'; opponent.returnDate = `${oppSusp}경기`;  opponent.injuredThisGame = true;
        }
    }
}

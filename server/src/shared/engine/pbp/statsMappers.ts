
import { GameState, PossessionResult, LivePlayer } from './pbpTypes.ts';
import type { PbpLog } from '../../types/engine.ts';
import { formatTime } from './timeEngine.ts';
import { resolveRebound } from './reboundLogic.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';
import { generateCommentary, getReboundCommentary, getFreeThrowReboundCommentary, getTechnicalFoulCommentary, getFlagrant1Commentary, getFlagrant2Commentary } from '../commentary/textGenerator.ts';
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

function addLog(state: GameState, teamId: string, text: string, type: PbpLog['type'], points?: number, foulTeamId?: string, possessionOutcome?: PbpLog['possessionOutcome'], possessionTeamId?: string) {
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: formatTime(state.gameClock),
        teamId,
        text,
        type,
        points: points as 1 | 2 | 3 | undefined,
        foulTeamId,
        isPossessionEnd: possessionOutcome ? true : undefined,
        possessionOutcome,
        possessionTeamId: possessionOutcome ? (possessionTeamId ?? teamId) : undefined,
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

    // 반환값(rebType)으로 호출부가 "오펜시브 리바운드라 포제션이 계속되는지"를 판단해
    // isPossessionEnd 스탬프 여부를 결정한다(client 미러 참조).
    // [Fix 2026-08-05] 로그를 직접 안 찍고 결과(type/text)만 반환 — 호출부가 자유투 로그 뒤에
    // 리바운드 텍스트를 이어붙여 "자유투 실패 → 리바운드" 순서를 보장한다(client 미러 참조).
    const handleFreeThrowRebound = (shooter: LivePlayer): { type: 'off' | 'def'; text: string } => {
        // [2026-07-31] TEAM_REB_RATE_FT 제거 (client 미러 참고)
        const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
        rebPlayer.reb += 1;
        if (rebType === 'off') rebPlayer.offReb += 1;
        else rebPlayer.defReb += 1;
        return { type: rebType, text: getFreeThrowReboundCommentary(rebPlayer, rebType, shooter) };
    };

    recordShotEvent(state, result);

    // [2026-08-03] score/miss 커멘터리(textGenerator.ts)가 이미 isMismatch 전용 문구를 갖고 있어
    // 중복 안내 방지 — turnover/foul은 아직 isMismatch 분기가 없어(client 미러 참조) 이 안내로 대체.
    if (isMismatch && type !== 'score' && type !== 'miss') {
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
            // [2026-07-31] PostUp/PnR_Roll 킥아웃 오버라이드 (client 미러 참고)
            const prob = result.isKickout ? 0.9 : (playType ? (assistOdds[playType] ?? 0.60) : 0.60);
            if (Math.random() < prob) assister.ast += 1;
        }

        offTeam.score += points;
        updatePlusMinus(offTeam, defTeam, points);

        let logText = generateCommentary('score', actor, defender, assister, playType, zone, {
            isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
            isBlock: false, isSteal: false, points, pnrCoverage: pnrCoverage || undefined,
            isKickout: !!result.isKickout,
        }, result.shotType);

        let totalPointsAdded = points;
        // 앤드원 자유투를 놓치고 오펜시브 리바운드로 이어지면 포제션이 계속되므로 이 득점
        // 로그를 포제션 종료로 스탬프하지 않는다(client 미러 참조).
        let scoreEndsPossession = true;
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
                const reb = handleFreeThrowRebound(actor);
                scoreEndsPossession = reb.type !== 'off';
                logText += ` ${reb.text}`;
            }
        }
        addLog(state, offTeam.id, logText, 'score', totalPointsAdded, undefined, scoreEndsPossession ? 'scoring' : undefined);

    } else if (type === 'miss') {
        actor.fga += 1;
        if (zone === '3PT') actor.p3a += 1;
        if (zone) updateZoneStats(actor, zone, false, result.subZone);
        if (defender && zone) bumpDefendedShot(defender, zone, result.subZone, false);
        updateHotCold(actor, false);

        const logText = generateCommentary('miss', actor, defender, assister, playType, zone, {
            isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
            isBlock: !!isBlock, isSteal: false, points: 0, pnrCoverage: pnrCoverage || undefined,
            isHelpPlay: !!result.isHelpPlay, isKickout: !!result.isKickout,
        }, result.shotType);

        // 오펜시브 리바운드면 포제션이 계속되므로(stepPossession의 retainPossession(isOffReb)과
        // 동일 기준) 이 미스 로그는 포제션 종료로 스탬프하지 않는다.
        const missOutcome = (rebounder && result.reboundType === 'off') ? undefined : 'nonScoring';

        if (isBlock && defender) { defender.blk += 1; addLog(state, defTeam.id, logText, 'block', undefined, undefined, missOutcome, offTeam.id); }
        else { addLog(state, offTeam.id, logText, 'miss', undefined, undefined, missOutcome); }

        if (rebounder) {
            rebounder.reb += 1;
            const rebType = result.reboundType || 'def';
            if (rebType === 'off') rebounder.offReb += 1;
            else rebounder.defReb += 1;
            addLog(state, rebounder.playerId, getReboundCommentary(rebounder, rebType, actor, zone), 'info');
        }

    } else if (type === 'turnover') {
        actor.tov += 1;
        const logText = generateCommentary('turnover', actor, defender, undefined, playType, undefined, {
            isSwitch: !!isSwitch, isMismatch: false, isBotchedSwitch: false,
            isBlock: false, isSteal: !!isSteal, points: 0, pnrCoverage: pnrCoverage || undefined,
            isHelpPlay: !!result.isHelpPlay,
        });
        if (isSteal && defender) defender.stl += 1;
        addLog(state, offTeam.id, logText, 'turnover', undefined, undefined, 'turnover');

    } else if (type === 'foul') {
        if (defender) commitFoul(defender);
        let logText = generateCommentary('foul', actor, defender, undefined, playType, undefined, {
            isSwitch: !!isSwitch, isMismatch: false, isBotchedSwitch: false,
            isBlock: false, isSteal: false, points: 0,
            isHelpPlay: !!result.isHelpPlay,
        });
        logText += ` (팀 파울 ${defTeam.fouls})`;
        // 보너스 자유투로 이어지면 그 자유투 로그가 진짜 포제션 종료 지점이므로 이 파울 로그는
        // 스탬프하지 않는다(client 미러 참조).
        addLog(state, defTeam.id, logText, 'foul', undefined, defTeam.id, defTeam.fouls > 4 ? undefined : 'nonScoring', offTeam.id);

        if (defTeam.fouls > 4) {
            let ftMade = 0;
            const ftPct = actor.attr.ft / 100;
            actor.fta += 2;
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
            let lastMade = false;
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; lastMade = true; }
            updatePlusMinus(offTeam, defTeam, ftMade);
            // 마지막 자유투가 빗나가면 리바운드 결과부터 확인 — 오펜시브 리바운드면 포제션이
            // 계속되므로 이 자유투 로그를 포제션 종료로 스탬프하지 않는다(client 미러 참조).
            let ftEndsPossession = true;
            let ftLogText = `${actor.playerName}, 팀 파울로 얻은 자유투 ${ftMade}/2 성공`;
            if (!lastMade) {
                const reb = handleFreeThrowRebound(actor);
                ftEndsPossession = reb.type !== 'off';
                ftLogText += ` ${reb.text}`;
            }
            addLog(state, offTeam.id, ftLogText, 'freethrow', ftMade, undefined, ftEndsPossession ? (ftMade > 0 ? 'scoring' : 'nonScoring') : undefined);
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
        // 마지막 자유투가 빗나가면 리바운드 결과부터 확인 — 오펜시브 리바운드면 포제션이
        // 계속되므로 이 자유투 로그를 포제션 종료로 스탬프하지 않는다(client 미러 참조).
        let ftEndsPossession = true;
        let ftLogText = `${actor.playerName}, 슈팅 파울 자유투 ${ftMade}/${numShots} 성공`;
        if (!lastMade) {
            const reb = handleFreeThrowRebound(actor);
            ftEndsPossession = reb.type !== 'off';
            ftLogText += ` ${reb.text}`;
        }
        addLog(state, offTeam.id, ftLogText, 'freethrow', ftMade, defTeam.id, ftEndsPossession ? (ftMade > 0 ? 'scoring' : 'nonScoring') : undefined);

    } else if (type === 'offensiveFoul') {
        actor.pf += 1;
        actor.tov += 1;
        const isCharge = playType === 'Iso' || playType === 'PostUp' || playType === 'Transition';
        const foulDesc = isCharge ? '차지' : '일리걸 스크린';
        const ejectionText = actor.pf >= 6 ? ' — 6반칙 퇴장!' : '';
        addLog(state, offTeam.id, `${actor.playerName}, 오펜시브 파울 (${foulDesc})${ejectionText}`, 'foul', undefined, undefined, 'turnover');
        if (actor.pf === 6) addLog(state, offTeam.id, `🚨 ${actor.playerName} 6반칙 퇴장 (Foul Out)`, 'info');

    } else if (type === 'technicalFoul') {
        if (defender) { defender.techFouls = (defender.techFouls || 0) + 1; }
        // [2026-07-29] 테크니컬 파울범이 공격팀일 수도 있음 — FT는 "파울을 범하지 않은 쪽"에게(client 미러 참조)
        const foulerIsOffense = !!defender && offTeam.onCourt.some(p => p.playerId === defender.playerId);
        const ftTeam = foulerIsOffense ? defTeam : offTeam;
        const foulerTeam = foulerIsOffense ? offTeam : defTeam;
        const ftShooter = [...ftTeam.onCourt].sort((a, b) => b.attr.ft - a.attr.ft)[0];
        const ftPct = ftShooter.attr.ft / 100;
        ftShooter.fta += 1;
        let ftMade = 0;
        if (Math.random() < ftPct) { ftShooter.ftm++; ftShooter.pts++; ftTeam.score++; ftMade = 1; updatePlusMinus(ftTeam, foulerTeam, 1); }
        const isEjected = defender && (defender.techFouls || 0) >= 2;
        if (isEjected && defender) defender.pf = 6;
        const commentaryBase = defender ? getTechnicalFoulCommentary(defender) : `테크니컬 파울이 선언됩니다!`;
        const ejectionSuffix = isEjected ? ' — 2 테크니컬 퇴장!' : '';
        const ftSuffix = ` ${ftShooter.playerName} 자유투 ${ftMade}/1`;
        addLog(state, foulerTeam.id, `${commentaryBase}${ejectionSuffix}${ftSuffix}`, 'foul', ftMade || undefined);
        if (isEjected && defender) addLog(state, foulerTeam.id, `🚨 ${defender.playerName} 2 테크니컬 퇴장!`, 'info');

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
            ? (isFlagrant2 ? getFlagrant2Commentary(defender, actor, playType) : getFlagrant1Commentary(defender, actor, playType))
            : `Flagrant ${isFlagrant2 ? '2' : '1'}!`;
        const ftSuffix = ` ${actor.playerName} 자유투 ${ftMade}/2`;
        addLog(state, defTeam.id, `${commentary}${ftSuffix}`, 'foul', ftMade || undefined, defTeam.id);
        if (isFlagrant2 && defender) {
            defender.pf = 6;
            addLog(state, defTeam.id, `🚨 ${defender.playerName} Flagrant 2 퇴장!`, 'info');
        }

    } else if (type === 'shotClockViolation') {
        actor.tov += 1;
        const teamName = offTeam.id === state.home.id ? state.home.name : state.away.name;
        addLog(state, offTeam.id, `⏱ 24초 샷클락 바이올레이션 — ${teamName} 턴오버`, 'turnover', undefined, undefined, 'turnover');

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

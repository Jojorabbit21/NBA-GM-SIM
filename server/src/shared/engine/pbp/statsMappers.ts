
import { GameState, PossessionResult, LivePlayer } from './pbpTypes.ts';
import type { PbpLog } from '../../types/engine.ts';
import { formatTime } from './timeEngine.ts';
import { resolveRebound } from './reboundLogic.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';
import { generateCommentary, getReboundCommentary, getFreeThrowReboundCommentary, getTechnicalFoulCommentary, getFlagrant1Commentary, getFlagrant2Commentary, getShootingFoulCommentary } from '../commentary/textGenerator.ts';
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


// [2026-10-08] PBP 공격권 안내용 연고지명. 싱글은 TeamState.city("밀워키"), 멀티는 city가 비어 있고
// name이 "밀워키 스태그스" 형태(leagueService가 `${city} ${name}`으로 생성, 유저 개명 가능)라
// 첫 어절을 연고지로 간주. 어절이 하나뿐이면 이름 전체를 사용.
function regionOf(team: { name: string; city?: string }): string {
    const city = team.city?.trim();
    if (city) return city;
    const first = team.name.trim().split(/\s+/)[0];
    return first || team.name;
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

// ── [2026-10-18] 플레이타입별 실적 집계(멀티 PPP) ─────────────────────────────────
// 플레이 1회 = 그 playType으로 끝난 슛(성공/실패)·턴오버·오펜시브 파울·샷클락 위반·슈팅 파울 자유투·보너스 자유투.
// 비보너스 파울(자유투 없음 → 공격 계속)·테크니컬·플래그런트(플레이와 무관한 자유투)·싸움은 제외.
// 공격 리바운드로 이어진 공격은 다음 applyPossessionResult 호출에서 별도 플레이로 잡힌다.
// pts/fta는 applyPossessionResult 진입~종료 사이 공격팀 점수·슈터 자유투 시도 증가분(앤드원·자유투 포함).
// client(services/game/engine/pbp/statsMappers.ts) ↔ server(server/src/shared/engine/pbp/statsMappers.ts) 미러.
const PLAY_TYPE_COUNTED_RESULTS = new Set<PossessionResult['type']>([
    'score', 'miss', 'turnover', 'offensiveFoul', 'shotClockViolation', 'freethrow', 'foul',
]);
function recordPlayTypeStat(state: GameState, result: PossessionResult, pts: number, fta: number): void {
    const { type, playType, offTeam } = result;
    if (!playType || !PLAY_TYPE_COUNTED_RESULTS.has(type)) return;
    if (type === 'foul' && fta <= 0) return; // 비보너스 파울 — 공격이 이어지므로 플레이 미종료
    if (!state.playTypeStats) state.playTypeStats = {};
    let byTeam = state.playTypeStats[offTeam.id];
    if (!byTeam) { byTeam = {}; state.playTypeStats[offTeam.id] = byTeam; }
    let line = byTeam[playType];
    if (!line) { line = { poss: 0, pts: 0, fga: 0, fgm: 0, fta: 0, tov: 0 }; byTeam[playType] = line; }
    line.poss += 1;
    line.pts += pts;
    line.fta += fta;
    if (type === 'score') { line.fga += 1; line.fgm += 1; }
    else if (type === 'miss') { line.fga += 1; }
    else if (type === 'turnover' || type === 'offensiveFoul' || type === 'shotClockViolation') { line.tov += 1; }
}

export function applyPossessionResult(state: GameState, result: PossessionResult) {
    const { type, actor, defender, assister, rebounder, points, zone, isBlock, isSteal,
            offTeam, defTeam, isAndOne, playType, isSwitch, isMismatch, isBotchedSwitch, pnrCoverage } = result;
    // [2026-10-18] 플레이타입 실적 — 이 플레이로 난 득점/자유투를 진입·종료 차이로 계산(recordPlayTypeStat)
    const ptScoreBefore = offTeam.score;
    const ptFtaBefore = actor.fta;

    if (result.isAceTarget && typeof result.matchupEffect === 'number') {
        actor.matchupEffectSum += result.matchupEffect;
        actor.matchupEffectCount += 1;
    }

    // [2026-10-07] 6반칙 전용 로그 삭제 — 호출부가 파울 커멘터리 끝에 " 6반칙으로 파울 아웃됩니다."를 붙임 (client 미러 참조)
    const commitFoul = (defP: LivePlayer): boolean => {
        defP.pf += 1;
        defTeam.fouls += 1;
        if (defP.pf === 6) defP.ejectionReason = 'foul_out';
        return defP.pf === 6;
    };

    // 반환값(rebType)으로 호출부가 "오펜시브 리바운드라 포제션이 계속되는지"를 판단해
    // isPossessionEnd 스탬프 여부를 결정한다(client 미러 참조).
    // [Fix 2026-08-05] 로그를 직접 안 찍고 결과(type/text)만 반환 — 호출부가 자유투 로그 뒤에
    // 리바운드 텍스트를 이어붙여 "자유투 실패 → 리바운드" 순서를 보장한다(client 미러 참조).
    // [2026-10-07] 리바운드를 자유투 로그와 별도 줄로 분리 + 리바운드 teamId=리바운더 팀 (client 미러 참조)
    type FtRebound = { type: 'off' | 'def'; text: string; player: LivePlayer };
    const teamIdOf = (pl: LivePlayer): string =>
        state.home.onCourt.some(x => x.playerId === pl.playerId) ? state.home.id : state.away.id;
    const handleFreeThrowRebound = (shooter: LivePlayer): FtRebound => {
        // [2026-07-31] TEAM_REB_RATE_FT 제거 (client 미러 참고)
        const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
        rebPlayer.reb += 1;
        if (rebType === 'off') rebPlayer.offReb += 1;
        else rebPlayer.defReb += 1;
        return { type: rebType, text: getFreeThrowReboundCommentary(rebPlayer, rebType, shooter), player: rebPlayer };
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

        // [2026-10-07] 앤드원 = 득점 → 파울 → 자유투 3개 로그 (client 미러 참조). 득점 로그 points는 야투만,
        // 포제션 종료 마커는 자유투 로그, 파울 로그에 foulTeamId(팀파울 집계).
        addLog(state, offTeam.id, logText, 'score', points, undefined, (isAndOne && defender) ? undefined : 'scoring');
        if (isAndOne && defender) {
            const fouledOut = commitFoul(defender);
            let foulLog = getShootingFoulCommentary(defender, actor, playType, false, true);
            if (fouledOut) foulLog += ' 6반칙으로 파울 아웃됩니다.';
            foulLog += ` (${defender.pf}반칙, 팀 ${defTeam.fouls}반칙)`;
            addLog(state, defTeam.id, foulLog, 'foul', undefined, defTeam.id);
            let ftMade = 0; let ftEndsPossession = true; let ftReb: FtRebound | null = null;
            let ftLogText = `${actor.playerName}, 앤드원 자유투 `;
            actor.fta += 1;
            if (Math.random() < (actor.attr.ft / 100)) {
                actor.pts += 1; actor.ftm += 1; offTeam.score += 1; ftMade = 1;
                updatePlusMinus(offTeam, defTeam, 1);
                ftLogText += '1/1 성공';
            } else {
                ftLogText += '0/1 성공';
                ftReb = handleFreeThrowRebound(actor);
                ftEndsPossession = ftReb.type !== 'off';
            }
            addLog(state, offTeam.id, ftLogText, 'freethrow', ftMade, undefined, ftEndsPossession ? 'scoring' : undefined);
            if (ftReb) addLog(state, teamIdOf(ftReb.player), ftReb.text, 'info');
        }

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
            addLog(state, teamIdOf(rebounder), getReboundCommentary(rebounder, rebType, actor, zone), 'info');
        }

    } else if (type === 'turnover') {
        actor.tov += 1;
        const logText = generateCommentary('turnover', actor, defender, undefined, playType, undefined, {
            isSwitch: !!isSwitch, isMismatch: false, isBotchedSwitch: false,
            isBlock: false, isSteal: !!isSteal, points: 0, pnrCoverage: pnrCoverage || undefined,
            isHelpPlay: !!result.isHelpPlay,
        });
        if (isSteal && defender) { defender.stl += 1; defender.tovForced += 1; }
        addLog(state, offTeam.id, logText, 'turnover', undefined, undefined, 'turnover');

    } else if (type === 'foul') {
        const fouledOut = defender ? commitFoul(defender) : false;
        let logText = generateCommentary('foul', actor, defender, undefined, playType, undefined, {
            isSwitch: !!isSwitch, isMismatch: false, isBotchedSwitch: false,
            isBlock: false, isSteal: false, points: 0,
            isHelpPlay: !!result.isHelpPlay,
        });
        if (fouledOut) logText += ' 6반칙으로 파울 아웃됩니다.';  // [2026-10-07] client 미러
        logText += defender ? ` (${defender.pf}반칙, 팀 ${defTeam.fouls}반칙)` : ` (팀 ${defTeam.fouls}반칙)`;
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
            let ftReb: FtRebound | null = null;
            const ftLogText = `${actor.playerName}, 팀 파울로 얻은 자유투 ${ftMade}/2 성공`;
            if (!lastMade) {
                ftReb = handleFreeThrowRebound(actor);
                ftEndsPossession = ftReb.type !== 'off';
            }
            addLog(state, offTeam.id, ftLogText, 'freethrow', ftMade, undefined, ftEndsPossession ? (ftMade > 0 ? 'scoring' : 'nonScoring') : undefined);
            if (ftReb) addLog(state, teamIdOf(ftReb.player), ftReb.text, 'info');
        }

    } else if (type === 'freethrow') {
        // [2026-10-07] 파울 로그를 자유투 로그와 분리, foulTeamId는 파울 로그로 이동 (client 미러 참조)
        if (defender) {
            const fouledOut = commitFoul(defender);
            let foulLog = getShootingFoulCommentary(defender, actor, playType, !!result.isHelpPlay, false);
            if (fouledOut) foulLog += ' 6반칙으로 파울 아웃됩니다.';
            foulLog += ` (${defender.pf}반칙, 팀 ${defTeam.fouls}반칙)`;
            addLog(state, defTeam.id, foulLog, 'foul', undefined, defTeam.id);
        }
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
        let ftReb: FtRebound | null = null;
        const ftLogText = `${actor.playerName}, 자유투 ${ftMade}/${numShots} 성공`;
        if (!lastMade) {
            ftReb = handleFreeThrowRebound(actor);
            ftEndsPossession = ftReb.type !== 'off';
        }
        addLog(state, offTeam.id, ftLogText, 'freethrow', ftMade, undefined, ftEndsPossession ? (ftMade > 0 ? 'scoring' : 'nonScoring') : undefined);
        if (ftReb) addLog(state, teamIdOf(ftReb.player), ftReb.text, 'info');

    } else if (type === 'offensiveFoul') {
        actor.pf += 1;
        actor.tov += 1;
        const isCharge = result.foulSubtype === 'charge';
        const foulDesc = isCharge ? '차징' : '일리걸 스크린';  // [2026-10-07] client 미러
        const ejectionText = actor.pf >= 6 ? ' 6반칙으로 파울 아웃됩니다.' : '';
        if (actor.pf >= 6) actor.ejectionReason = 'foul_out';
        if (isCharge && defender) { defender.tovForced += 1; }
        addLog(state, offTeam.id, `${actor.playerName}, ${foulDesc} 오펜시브 파울.${ejectionText} (${actor.pf}반칙, 팀 ${offTeam.fouls}반칙)`, 'foul', undefined, undefined, 'turnover');

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
        if (isEjected && defender) { defender.ejectionReason = 'technical'; }
        const commentaryBase = defender ? getTechnicalFoulCommentary(defender) : `테크니컬 파울이 선언됩니다!`;
        const ejectionSuffix = isEjected ? ' 2번째 테크니컬 파울로 퇴장당합니다.' : '';
        // [2026-10-07] 파울 로그 → 자유투 로그(freethrow 타입, 팀 PTS 집계 포함) 분리 (client 미러 참조)
        addLog(state, foulerTeam.id, `${commentaryBase}${ejectionSuffix}`, 'foul');
        // [2026-10-08] 공격권 유지/이전 분기 (client 미러 참조)
        const possessionNote = ftTeam.id === offTeam.id
            ? `${regionOf(offTeam)}의 공격권이 유지됩니다.`
            : `${regionOf(offTeam)}에게 공격권이 넘어갑니다.`;
        addLog(state, ftTeam.id, `${ftShooter.playerName}, 테크니컬 자유투 ${ftMade}/1 성공. ${possessionNote}`, 'freethrow', ftMade);

    } else if (type === 'flagrantFoul') {
        const fouledOut = defender ? commitFoul(defender) : false;
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
            : `플래그런트 ${isFlagrant2 ? '2' : '1'}!`;
        // [2026-10-07] 파울 로그 → 자유투 로그 분리, 구조 "내용. [6반칙으로 파울 아웃됩니다.] (N반칙, 팀 N반칙)" (client 미러 참조)
        let foulLog = commentary;
        if (fouledOut && defender && !isFlagrant2) foulLog += ' 6반칙으로 파울 아웃됩니다.';
        // [2026-10-19] NBA 규정: 한 경기에서 플래그런트 1을 두 번째로 받으면 자동 퇴장(PF는 그대로 +1만)
        if (defender && !isFlagrant2 && (defender.flagrantFouls || 0) >= 2 && !defender.ejectionReason) {
            defender.ejectionReason = 'flagrant';
            foulLog += ' 플래그런트 1을 두 번째로 받아 퇴장당합니다.';
        }
        foulLog += defender ? ` (${defender.pf}반칙, 팀 ${defTeam.fouls}반칙)` : ` (팀 ${defTeam.fouls}반칙)`;
        addLog(state, defTeam.id, foulLog, 'foul', undefined, defTeam.id);
        addLog(state, offTeam.id, `${actor.playerName}, 플래그런트 자유투 ${ftMade}/2 성공. ${regionOf(offTeam)}의 공격권이 유지됩니다.`, 'freethrow', ftMade);  // [2026-10-08] client 미러
        if (isFlagrant2 && defender) {
            defender.ejectionReason = 'flagrant';
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
        if (fighter)  { fighter.ejectionReason = 'fight';  fighter.techFouls  = (fighter.techFouls  || 0) + 2; }
        if (opponent) { opponent.ejectionReason = 'fight'; opponent.techFouls = (opponent.techFouls || 0) + 1; }
        const timeStr = formatTime(state.gameClock);
        if (fighter && opponent) {
            // [2026-10-07] 출장정지 줄 제거(경기 후 뉴스피드가 전달) — 클라이언트 statsMappers.ts 미러
            addLog(state, defTeam.id, `${fighter.playerName}이(가) ${opponent.playerName}에게 주먹을 휘두릅니다! 양 선수 경기장에서 퇴장당합니다.`, 'info');
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

    recordPlayTypeStat(state, result, offTeam.score - ptScoreBefore, actor.fta - ptFtaBefore);
}
